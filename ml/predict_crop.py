import argparse
import base64
import json
from pathlib import Path


def load_image(image_path: Path, image_size: int):
    import numpy as np
    import tensorflow as tf

    image = tf.keras.utils.load_img(image_path, target_size=(image_size, image_size))
    array = tf.keras.utils.img_to_array(image)
    return np.expand_dims(array, axis=0)


def label_to_health(label: str) -> str:
    if "healthy" in label.lower():
        return "Healthy"
    normalized = label.lower()
    if "blight" in normalized or "rot" in normalized or "rust" in normalized or "spot" in normalized or "mildew" in normalized:
        return "Disease stress detected"
    return "Needs agronomist review"


def label_to_disease(label: str) -> str:
    normalized = label.lower()
    if "healthy" in normalized:
        return "None detected"
    if "___" in label:
        return label.split("___", 1)[1].replace("_", " ")
    parts = label.replace("__", "_").split("_")
    return " ".join(part for part in parts[1:] if part) or label.replace("_", " ")


def main():
    parser = argparse.ArgumentParser(description="Run inference with a trained AgriTrustra plant model.")
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--image", type=Path, help="Path to image file.")
    parser.add_argument("--image-base64-file", type=Path, help="Text file containing a data URL or raw base64 image.")
    args = parser.parse_args()

    labels = json.loads((args.model_dir / "labels.json").read_text(encoding="utf-8"))
    metrics_path = args.model_dir / "metrics.json"
    metrics = json.loads(metrics_path.read_text(encoding="utf-8")) if metrics_path.exists() else {}
    image_size = int(metrics.get("image_size", 224))

    image_path = args.image
    temp_path = None
    if args.image_base64_file:
        data = args.image_base64_file.read_text(encoding="utf-8").strip()
        if "," in data and data.lower().startswith("data:"):
            data = data.split(",", 1)[1]
        temp_path = args.model_dir / "_tmp_prediction_image.jpg"
        temp_path.write_bytes(base64.b64decode(data))
        image_path = temp_path

    if not image_path:
        raise SystemExit("Provide --image or --image-base64-file")

    import numpy as np
    import tensorflow as tf

    model = tf.keras.models.load_model(args.model_dir / "model.keras")
    probabilities = model.predict(load_image(image_path, image_size), verbose=0)[0]
    top_index = int(np.argmax(probabilities))
    top_label = labels[top_index]
    confidence = float(probabilities[top_index])

    top_predictions = sorted(
        (
            {"label": label, "confidence": float(probabilities[index])}
            for index, label in enumerate(labels)
        ),
        key=lambda item: item["confidence"],
        reverse=True,
    )[:5]

    if temp_path and temp_path.exists():
        temp_path.unlink()

    is_healthy = "healthy" in top_label.lower()
    result = {
        "accuracy": confidence,
        "isOrganic": is_healthy and confidence >= 0.65,
        "isHealthy": is_healthy,
        "diseaseDetected": not is_healthy,
        "diseaseName": label_to_disease(top_label),
        "plantHealth": label_to_health(top_label),
        "predictedClass": top_label,
        "topPredictions": top_predictions,
        "fertilizerUsage": "Plant health image analysis indicates " + ("low stress levels compatible with organic growth" if "healthy" in top_label else "stress patterns that require management review."),
        "soilAnalysis": "Image model completed. Organic status requires: (1) input history verification (2) IoT reading compliance (3) auditor field inspection.",
        "fraudDetected": False,
        "isAgriculturalLand": True,
        "organicCertificationNote": "Image analysis is a supporting signal only. Final organic certification requires documentation of inputs, practices, and auditor approval.",
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
