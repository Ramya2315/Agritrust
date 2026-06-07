from __future__ import annotations

import argparse
import json
from pathlib import Path


np = None
pd = None
tf = None
classification_report = None
confusion_matrix = None
AUTOTUNE = None
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


def find_class_root(dataset_root: Path) -> Path:
    child_dirs = [path for path in dataset_root.iterdir() if path.is_dir()]
    split_children = [path for path in child_dirs if path.name.lower() in SPLIT_DIRS]
    if split_children:
        train_dir = next((path for path in split_children if path.name.lower() in {"train", "training"}), split_children[0])
        return train_dir
    return dataset_root


def load_dataset(root: Path, image_size: tuple[int, int], batch_size: int, validation_split: float, subset: str):
    class_root = find_class_root(root)
    return tf.keras.utils.image_dataset_from_directory(
        class_root,
        labels="inferred",
        label_mode="int",
        image_size=image_size,
        batch_size=batch_size,
        validation_split=validation_split,
        subset=subset,
        seed=42,
        shuffle=True,
    )


def merge_datasets(datasets):
    merged = datasets[0]
    for dataset in datasets[1:]:
        merged = merged.concatenate(dataset)
    return merged


def build_model(num_classes: int, image_size: tuple[int, int]) -> tf.keras.Model:
    inputs = tf.keras.Input(shape=(image_size[0], image_size[1], 3))
    x = tf.keras.layers.RandomFlip("horizontal")(inputs)
    x = tf.keras.layers.RandomRotation(0.08)(x)
    x = tf.keras.layers.RandomZoom(0.08)(x)
    x = tf.keras.applications.mobilenet_v2.preprocess_input(x)

    base = tf.keras.applications.MobileNetV2(
        include_top=False,
        input_shape=(image_size[0], image_size[1], 3),
        weights="imagenet",
    )
    base.trainable = False

    x = base(x, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(0.25)(x)
    outputs = tf.keras.layers.Dense(num_classes, activation="softmax")(x)

    model = tf.keras.Model(inputs, outputs)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def collect_predictions(model: tf.keras.Model, dataset):
    y_true = []
    y_pred = []
    for images, labels in dataset:
        probabilities = model.predict(images, verbose=0)
        y_true.extend(labels.numpy().tolist())
        y_pred.extend(np.argmax(probabilities, axis=1).tolist())
    return np.array(y_true), np.array(y_pred)


def main():
    parser = argparse.ArgumentParser(description="Train AgriTrustra crop-health model on PlantVillage and PlantDoc image folders.")
    parser.add_argument("--plantvillage", type=Path, required=True, help="Path to PlantVillage root folder.")
    parser.add_argument("--plantdoc", type=Path, help="Optional path to PlantDoc root folder.")
    parser.add_argument("--out", type=Path, default=Path("ml/artifacts/plant-health-model"), help="Output artifact directory.")
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--fine-tune-epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--img-size", type=int, default=224)
    parser.add_argument("--validation-split", type=float, default=0.2)
    args = parser.parse_args()

    global np, pd, tf, classification_report, confusion_matrix, AUTOTUNE
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
    AUTOTUNE = tf.data.AUTOTUNE

    image_size = (args.img_size, args.img_size)
    args.out.mkdir(parents=True, exist_ok=True)

    train_sets = []
    val_sets = []
    raw_class_names = []

    dataset_roots = [args.plantvillage]
    if args.plantdoc:
        dataset_roots.append(args.plantdoc)

    for dataset_root in dataset_roots:
        train_ds = load_dataset(dataset_root, image_size, args.batch_size, args.validation_split, "training")
        val_ds = load_dataset(dataset_root, image_size, args.batch_size, args.validation_split, "validation")
        train_sets.append(train_ds)
        val_sets.append(val_ds)
        raw_class_names.extend(train_ds.class_names)

    class_names = sorted(set(normalize_label(name) for name in raw_class_names))
    label_lookup = tf.keras.layers.StringLookup(vocabulary=class_names, mask_token=None, num_oov_indices=0)

    def relabel(dataset):
        original_names = tf.constant([normalize_label(name) for name in dataset.class_names])

        def map_labels(images, labels):
            labels_as_text = tf.gather(original_names, labels)
            return images, label_lookup(labels_as_text)

        return dataset.map(map_labels, num_parallel_calls=AUTOTUNE)

    train_ds = merge_datasets([relabel(dataset) for dataset in train_sets]).prefetch(AUTOTUNE)
    val_ds = merge_datasets([relabel(dataset) for dataset in val_sets]).prefetch(AUTOTUNE)

    model = build_model(len(class_names), image_size)
    callbacks = [
        tf.keras.callbacks.ModelCheckpoint(args.out / "model.keras", monitor="val_accuracy", save_best_only=True),
        tf.keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=4, restore_best_weights=True),
    ]

    history = model.fit(train_ds, validation_data=val_ds, epochs=args.epochs, callbacks=callbacks)

    if args.fine_tune_epochs > 0:
        base = next(layer for layer in model.layers if isinstance(layer, tf.keras.Model) and layer.name.startswith("mobilenetv2"))
        base.trainable = True
        for layer in base.layers[:-40]:
            layer.trainable = False

        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=1e-5),
            loss="sparse_categorical_crossentropy",
            metrics=["accuracy"],
        )
        fine_history = model.fit(
            train_ds,
            validation_data=val_ds,
            epochs=args.epochs + args.fine_tune_epochs,
            initial_epoch=len(history.history["loss"]),
            callbacks=callbacks,
        )
        for key, values in fine_history.history.items():
            history.history.setdefault(key, []).extend(values)

    model.save(args.out / "model.keras")

    y_true, y_pred = collect_predictions(model, val_ds)
    report = classification_report(y_true, y_pred, target_names=class_names, output_dict=True, zero_division=0)
    matrix = confusion_matrix(y_true, y_pred).tolist()

    (args.out / "labels.json").write_text(json.dumps(class_names, indent=2), encoding="utf-8")
    (args.out / "metrics.json").write_text(
        json.dumps(
            {
                "classes": class_names,
                "validation_accuracy": float(report["accuracy"]),
                "classification_report": report,
                "confusion_matrix": matrix,
                "image_size": args.img_size,
                "datasets": {
                    "plantvillage": str(args.plantvillage),
                    "plantdoc": str(args.plantdoc) if args.plantdoc else None,
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    pd.DataFrame(history.history).to_csv(args.out / "history.csv", index=False)
    print(f"Saved model artifacts to {args.out.resolve()}")


if __name__ == "__main__":
    main()
