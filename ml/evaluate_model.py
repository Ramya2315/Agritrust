from __future__ import annotations

import argparse
import json
from pathlib import Path

np = None
pd = None
tf = None
classification_report = None
confusion_matrix = None


SPLIT_DIRS = {"train", "training", "val", "valid", "validation", "test", "testing"}


def normalize_label(label: str) -> str:
    return (
        label.strip()
        .lower()
        .replace("___", "_")
        .replace("__", "_")
        .replace(" ", "_")
        .replace("-", "_")
    )


def find_test_root(dataset_root: Path) -> Path:
    for name in ["test", "testing", "val", "validation", "valid"]:
        candidate = dataset_root / name
        if candidate.exists() and candidate.is_dir():
            return candidate
    return dataset_root


def load_test_dataset(root: Path, image_size: int, batch_size: int):
    class_root = find_test_root(root)
    return tf.keras.utils.image_dataset_from_directory(
        class_root,
        labels="inferred",
        label_mode="int",
        image_size=(image_size, image_size),
        batch_size=batch_size,
        shuffle=False,
    )


def relabel(dataset, trained_labels: list[str]):
    trained_lookup = tf.keras.layers.StringLookup(vocabulary=trained_labels, mask_token=None, num_oov_indices=1)
    original_names = tf.constant([normalize_label(name) for name in dataset.class_names])

    def map_labels(images, labels):
        labels_as_text = tf.gather(original_names, labels)
        return images, trained_lookup(labels_as_text) - 1

    return dataset.map(map_labels)


def merge_datasets(datasets):
    merged = datasets[0]
    for dataset in datasets[1:]:
        merged = merged.concatenate(dataset)
    return merged


def main():
    parser = argparse.ArgumentParser(description="Evaluate a trained AgriTrustra plant model on PlantVillage/PlantDoc test data.")
    parser.add_argument("--model-dir", type=Path, default=Path("ml/artifacts/plant-health-model"))
    parser.add_argument("--plantvillage", type=Path, required=True)
    parser.add_argument("--plantdoc", type=Path)
    parser.add_argument("--out", type=Path, default=Path("ml/artifacts/plant-health-model/test-output"))
    parser.add_argument("--batch-size", type=int, default=32)
    args = parser.parse_args()

    global np, pd, tf, classification_report, confusion_matrix
    import numpy as numpy_module
    import pandas as pandas_module
    import tensorflow as tensorflow_module
    from sklearn.metrics import classification_report as classification_report_fn
    from sklearn.metrics import confusion_matrix as confusion_matrix_fn

    np = numpy_module
    pd = pandas_module
    tf = tensorflow_module
    classification_report = classification_report_fn
    confusion_matrix = confusion_matrix_fn

    labels = json.loads((args.model_dir / "labels.json").read_text(encoding="utf-8"))
    metrics_path = args.model_dir / "metrics.json"
    metrics = json.loads(metrics_path.read_text(encoding="utf-8")) if metrics_path.exists() else {}
    image_size = int(metrics.get("image_size", 224))

    model = tf.keras.models.load_model(args.model_dir / "model.keras")
    datasets = [relabel(load_test_dataset(args.plantvillage, image_size, args.batch_size), labels)]
    if args.plantdoc:
        datasets.append(relabel(load_test_dataset(args.plantdoc, image_size, args.batch_size), labels))
    test_ds = merge_datasets(datasets)

    y_true = []
    y_pred = []
    confidences = []

    for images, true_labels in test_ds:
        probabilities = model.predict(images, verbose=0)
        predictions = np.argmax(probabilities, axis=1)
        y_true.extend(true_labels.numpy().tolist())
        y_pred.extend(predictions.tolist())
        confidences.extend(np.max(probabilities, axis=1).tolist())

    valid_indexes = [index for index, label in enumerate(y_true) if label >= 0]
    y_true_valid = [y_true[index] for index in valid_indexes]
    y_pred_valid = [y_pred[index] for index in valid_indexes]

    report = classification_report(
        y_true_valid,
        y_pred_valid,
        labels=list(range(len(labels))),
        target_names=labels,
        output_dict=True,
        zero_division=0,
    )
    matrix = confusion_matrix(y_true_valid, y_pred_valid, labels=list(range(len(labels)))).tolist()

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "test_metrics.json").write_text(
        json.dumps(
            {
                "accuracy": report["accuracy"],
                "macro_f1": report["macro avg"]["f1-score"],
                "weighted_f1": report["weighted avg"]["f1-score"],
                "classification_report": report,
                "confusion_matrix": matrix,
                "total_test_images": len(y_true_valid),
                "ignored_unknown_label_images": len(y_true) - len(y_true_valid),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    rows = [
        {
            "true_label": labels[true_label] if true_label >= 0 else "unknown",
            "predicted_label": labels[predicted_label],
            "confidence": confidence,
            "correct": true_label == predicted_label,
        }
        for true_label, predicted_label, confidence in zip(y_true, y_pred, confidences)
    ]
    pd.DataFrame(rows).to_csv(args.out / "test_predictions.csv", index=False)
    print(f"Saved test outputs to {args.out.resolve()}")


if __name__ == "__main__":
    main()
