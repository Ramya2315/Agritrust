import argparse
import csv
import json
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp"}


def list_images(dataset_root: Path):
    class_root = dataset_root / "train" if (dataset_root / "train").exists() else dataset_root
    rows = []
    for class_dir in sorted(path for path in class_root.iterdir() if path.is_dir()):
        for image_path in class_dir.rglob("*"):
            if image_path.suffix.lower() in IMAGE_EXTENSIONS:
                rows.append((image_path, class_dir.name))
    return rows


def image_features(image_path: Path):
    with Image.open(image_path) as image:
        image = image.convert("RGB").resize((64, 64))
        arr = np.asarray(image, dtype=np.float32) / 255.0

    means = arr.mean(axis=(0, 1))
    stds = arr.std(axis=(0, 1))
    vegetation = ((arr[:, :, 1] - arr[:, :, 0]) / (arr[:, :, 1] + arr[:, :, 0] + 1e-6)).mean()

    hist_features = []
    for channel in range(3):
        hist, _ = np.histogram(arr[:, :, channel], bins=16, range=(0, 1), density=True)
        hist_features.extend(hist.tolist())

    return np.array([*means, *stds, vegetation, *hist_features], dtype=np.float32)


def split_rows(rows, test_ratio, seed, max_per_class):
    random.seed(seed)
    by_class = {}
    for image_path, label in rows:
        by_class.setdefault(label, []).append((image_path, label))

    train = []
    test = []
    for label, class_rows in by_class.items():
        random.shuffle(class_rows)
        if max_per_class:
            class_rows = class_rows[:max_per_class]
        split_at = max(1, int(len(class_rows) * (1 - test_ratio)))
        train.extend(class_rows[:split_at])
        test.extend(class_rows[split_at:])
    return train, test


def build_matrix(rows):
    features = []
    labels = []
    paths = []
    for image_path, label in rows:
        try:
            features.append(image_features(image_path))
            labels.append(label)
            paths.append(str(image_path))
        except Exception as exc:
            print(f"Skipped {image_path}: {exc}")
    return np.vstack(features), np.array(labels), paths


def train_centroids(x_train, y_train):
    centroids = {}
    for label in sorted(set(y_train.tolist())):
        centroids[label] = x_train[y_train == label].mean(axis=0)
    return centroids


def predict(centroids, x_test):
    labels = list(centroids.keys())
    centroid_matrix = np.vstack([centroids[label] for label in labels])
    distances = ((x_test[:, None, :] - centroid_matrix[None, :, :]) ** 2).sum(axis=2)
    best = distances.argmin(axis=1)
    confidence = 1 / (1 + np.sqrt(distances.min(axis=1)))
    return np.array([labels[index] for index in best]), confidence


def classification_summary(y_true, y_pred):
    labels = sorted(set(y_true.tolist()) | set(y_pred.tolist()))
    per_class = {}
    correct_total = int((y_true == y_pred).sum())
    for label in labels:
        tp = int(((y_true == label) & (y_pred == label)).sum())
        fp = int(((y_true != label) & (y_pred == label)).sum())
        fn = int(((y_true == label) & (y_pred != label)).sum())
        precision = tp / (tp + fp) if tp + fp else 0
        recall = tp / (tp + fn) if tp + fn else 0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
        support = int((y_true == label).sum())
        per_class[label] = {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "support": support,
        }
    macro_f1 = sum(item["f1"] for item in per_class.values()) / len(per_class)
    return {
        "accuracy": correct_total / len(y_true),
        "macro_f1": macro_f1,
        "total_test_images": len(y_true),
        "per_class": per_class,
    }


def main():
    parser = argparse.ArgumentParser(description="Train a fast NumPy baseline on PlantVillage and write test outputs.")
    parser.add_argument("--plantvillage", type=Path, default=Path("datasets/PlantVillage"))
    parser.add_argument("--out", type=Path, default=Path("ml/artifacts/plantvillage-baseline"))
    parser.add_argument("--test-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-per-class", type=int, default=400, help="Limit per class for faster local output. Use 0 for all images.")
    args = parser.parse_args()

    rows = list_images(args.plantvillage)
    if not rows:
        raise SystemExit(f"No images found under {args.plantvillage}")

    train_rows, test_rows = split_rows(rows, args.test_ratio, args.seed, args.max_per_class or None)
    x_train, y_train, _ = build_matrix(train_rows)
    x_test, y_test, test_paths = build_matrix(test_rows)

    centroids = train_centroids(x_train, y_train)
    y_pred, confidence = predict(centroids, x_test)
    summary = classification_summary(y_test, y_pred)

    args.out.mkdir(parents=True, exist_ok=True)
    np.savez(
        args.out / "baseline_model.npz",
        labels=np.array(list(centroids.keys())),
        centroids=np.vstack([centroids[label] for label in centroids.keys()]),
    )
    (args.out / "metrics.json").write_text(
        json.dumps(
            {
                **summary,
                "model": "NumPy nearest-centroid RGB histogram baseline",
                "train_images": len(y_train),
                "test_images": len(y_test),
                "classes": sorted(set(y_train.tolist())),
                "note": "Fast baseline for pipeline validation. Use TensorFlow training for production CNN accuracy.",
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    with (args.out / "test_predictions.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["image", "true_label", "predicted_label", "confidence", "correct"])
        writer.writeheader()
        for image_path, true_label, predicted_label, score in zip(test_paths, y_test, y_pred, confidence):
            writer.writerow(
                {
                    "image": image_path,
                    "true_label": true_label,
                    "predicted_label": predicted_label,
                    "confidence": f"{score:.6f}",
                    "correct": str(true_label == predicted_label).lower(),
                }
            )

    print(json.dumps({"output": str(args.out.resolve()), **summary}, indent=2))


if __name__ == "__main__":
    main()
