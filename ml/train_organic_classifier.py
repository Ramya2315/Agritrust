"""
AgriTrustra Organic Crop Classifier
Trains a model to predict whether crops are organic based on plant/crop/product images
Uses PlantVillage dataset with disease presence as indicator
- Healthy plants → Organic (good conditions, no diseases)
- Diseased plants → Non-organic (indicates pesticide use or poor organic practices)
"""

import argparse
import json
import os
from pathlib import Path
from typing import Tuple
import numpy as np
import tensorflow as tf
from tensorflow.keras.preprocessing.image import load_img, img_to_array
from PIL import Image
import warnings

warnings.filterwarnings('ignore')

# Global imports
AUTOTUNE = tf.data.AUTOTUNE


def normalize_label(label: str) -> str:
    """Normalize label for consistent classification"""
    return (
        label.strip()
        .lower()
        .replace("___", "_")
        .replace("__", "_")
        .replace(" ", "_")
        .replace("-", "_")
    )


def classify_as_organic(label: str) -> str:
    """
    Map PlantVillage classes to organic/non-organic
    - 'healthy' → organic
    - diseases → non-organic
    """
    normalized = normalize_label(label)
    if 'healthy' in normalized:
        return 'organic'
    else:
        return 'non-organic'


def find_class_root(dataset_root: Path) -> Path:
    """Find training directory in dataset structure"""
    SPLIT_DIRS = {"train", "training", "val", "valid", "validation", "test", "testing"}
    child_dirs = [path for path in dataset_root.iterdir() if path.is_dir()]
    split_children = [path for path in child_dirs if path.name.lower() in SPLIT_DIRS]
    if split_children:
        train_dir = next((path for path in split_children if path.name.lower() in {"train", "training"}), split_children[0])
        return train_dir
    return dataset_root


def create_organic_dataset(root: Path, image_size: Tuple[int, int], batch_size: int):
    """Load PlantVillage and relabel as organic/non-organic"""
    
    class_root = find_class_root(root)
    print(f"Loading images from: {class_root}")
    
    # Load original dataset
    original_ds = tf.keras.utils.image_dataset_from_directory(
        class_root,
        labels="inferred",
        label_mode="int",
        image_size=image_size,
        batch_size=batch_size,
        shuffle=True,
        seed=42
    )
    
    original_class_names = original_ds.class_names
    print(f"Found {len(original_class_names)} classes from PlantVillage")
    
    # Create mapping from original classes to organic/non-organic
    organic_mapping = {}
    for idx, original_label in enumerate(original_class_names):
        organic_class = classify_as_organic(original_label)
        organic_mapping[idx] = 0 if organic_class == 'organic' else 1
    
    # Relabel dataset
    def relabel_to_organic(images, labels):
        new_labels = tf.map_fn(
            lambda x: tf.constant(organic_mapping[int(x)], dtype=tf.int32),
            labels,
            dtype=tf.int32
        )
        return images, new_labels
    
    organic_ds = original_ds.map(relabel_to_organic, num_parallel_calls=AUTOTUNE)
    
    # Print class distribution
    class_counts = {0: 0, 1: 0}
    for _, labels in organic_ds:
        unique, counts = np.unique(labels.numpy(), return_counts=True)
        for u, c in zip(unique, counts):
            class_counts[int(u)] += c
    
    print(f"\nDataset Distribution:")
    print(f"  Organic: {class_counts[0]} images")
    print(f"  Non-organic: {class_counts[1]} images")
    
    return organic_ds, ['organic', 'non-organic']


def split_dataset(dataset, train_ratio=0.8):
    """Split dataset into train and validation"""
    dataset_size = len(list(dataset))
    train_size = int(dataset_size * train_ratio)
    
    train_ds = dataset.take(train_size).prefetch(AUTOTUNE)
    val_ds = dataset.skip(train_size).prefetch(AUTOTUNE)
    
    return train_ds, val_ds


def build_organic_model(image_size: Tuple[int, int]) -> tf.keras.Model:
    """Build model for organic/non-organic classification"""
    
    inputs = tf.keras.Input(shape=(image_size[0], image_size[1], 3))
    
    # Data augmentation
    x = tf.keras.layers.RandomFlip("horizontal")(inputs)
    x = tf.keras.layers.RandomRotation(0.1)(x)
    x = tf.keras.layers.RandomZoom(0.1)(x)
    x = tf.keras.layers.RandomBrightness(0.2)(x)
    
    # Preprocessing
    x = tf.keras.applications.efficientnet.preprocess_input(x)
    
    # Base model: EfficientNetB0 (more efficient than MobileNetV2)
    base = tf.keras.applications.EfficientNetB0(
        include_top=False,
        input_shape=(image_size[0], image_size[1], 3),
        weights="imagenet"
    )
    base.trainable = False
    
    # Forward pass through base model
    x = base(x, training=False)
    
    # Custom top layers
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.Dense(256, activation='relu')(x)
    x = tf.keras.layers.Dropout(0.4)(x)
    x = tf.keras.layers.Dense(128, activation='relu')(x)
    x = tf.keras.layers.Dropout(0.3)(x)
    x = tf.keras.layers.Dense(64, activation='relu')(x)
    x = tf.keras.layers.Dropout(0.2)(x)
    
    # Output layer (2 classes: organic, non-organic)
    outputs = tf.keras.layers.Dense(2, activation='softmax')(x)
    
    model = tf.keras.Model(inputs, outputs)
    
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy', tf.keras.metrics.Precision(), tf.keras.metrics.Recall()]
    )
    
    return model


def main():
    parser = argparse.ArgumentParser(
        description="Train AgriTrustra organic crop classifier using PlantVillage dataset"
    )
    parser.add_argument(
        "--plantvillage",
        type=Path,
        required=True,
        help="Path to PlantVillage dataset root folder"
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("ml/artifacts/organic-classifier-model"),
        help="Output artifact directory"
    )
    parser.add_argument("--epochs", type=int, default=15, help="Number of epochs for initial training")
    parser.add_argument("--fine-tune-epochs", type=int, default=5, help="Number of fine-tuning epochs")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size")
    parser.add_argument("--img-size", type=int, default=224, help="Image size")
    parser.add_argument("--validation-split", type=float, default=0.2, help="Validation split ratio")
    
    args = parser.parse_args()
    
    print("=" * 80)
    print("AgriTrustra Organic Crop Classification Model Training")
    print("=" * 80)
    
    # Setup
    image_size = (args.img_size, args.img_size)
    args.out.mkdir(parents=True, exist_ok=True)
    
    print(f"\nConfiguration:")
    print(f"  PlantVillage Path: {args.plantvillage}")
    print(f"  Output Path: {args.out}")
    print(f"  Image Size: {image_size}")
    print(f"  Batch Size: {args.batch_size}")
    print(f"  Epochs: {args.epochs}")
    print(f"  Fine-tune Epochs: {args.fine_tune_epochs}")
    
    # Load dataset
    print(f"\n{'Loading Dataset':^80}")
    print("-" * 80)
    dataset, class_names = create_organic_dataset(
        args.plantvillage,
        image_size,
        args.batch_size
    )
    
    # Split into train/val
    train_ds, val_ds = split_dataset(dataset, train_ratio=0.8)
    
    # Build model
    print(f"\n{'Building Model':^80}")
    print("-" * 80)
    model = build_organic_model(image_size)
    
    print(model.summary())
    
    # Callbacks
    callbacks = [
        tf.keras.callbacks.ModelCheckpoint(
            str(args.out / "model.keras"),
            monitor="val_accuracy",
            save_best_only=True,
            verbose=1
        ),
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy",
            patience=3,
            restore_best_weights=True,
            verbose=1
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=2,
            min_lr=1e-6,
            verbose=1
        )
    ]
    
    # Training
    print(f"\n{'Initial Training':^80}")
    print("-" * 80)
    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=args.epochs,
        callbacks=callbacks,
        verbose=1
    )
    
    # Fine-tuning
    if args.fine_tune_epochs > 0:
        print(f"\n{'Fine-tuning (unfreezing base model)':^80}")
        print("-" * 80)
        
        # Unfreeze base model
        base = None
        for layer in model.layers:
            if isinstance(layer, tf.keras.Model) and 'efficientnet' in layer.name.lower():
                base = layer
                break
        
        if base:
            base.trainable = True
            
            # Freeze early layers
            for layer in base.layers[:-40]:
                layer.trainable = False
            
            model.compile(
                optimizer=tf.keras.optimizers.Adam(learning_rate=1e-5),
                loss='sparse_categorical_crossentropy',
                metrics=['accuracy', tf.keras.metrics.Precision(), tf.keras.metrics.Recall()]
            )
            
            fine_history = model.fit(
                train_ds,
                validation_data=val_ds,
                epochs=args.epochs + args.fine_tune_epochs,
                initial_epoch=len(history.history['loss']),
                callbacks=callbacks,
                verbose=1
            )
            
            # Merge histories
            for key in fine_history.history:
                if key in history.history:
                    history.history[key].extend(fine_history.history[key])
                else:
                    history.history[key] = fine_history.history[key]
    
    # Save model
    print(f"\n{'Saving Model':^80}")
    print("-" * 80)
    model.save(str(args.out / "model.keras"))
    print(f"Model saved to: {args.out / 'model.keras'}")
    
    # Evaluate on validation set
    print(f"\n{'Evaluation':^80}")
    print("-" * 80)
    val_loss, val_accuracy, val_precision, val_recall = model.evaluate(val_ds, verbose=0)
    
    print(f"Validation Accuracy: {val_accuracy:.4f}")
    print(f"Validation Precision: {val_precision:.4f}")
    print(f"Validation Recall: {val_recall:.4f}")
    print(f"Validation Loss: {val_loss:.4f}")
    
    # Collect predictions for detailed metrics
    print(f"\nGenerating detailed metrics...")
    y_true = []
    y_pred = []
    
    for images, labels in val_ds:
        predictions = model.predict(images, verbose=0)
        y_true.extend(labels.numpy().tolist())
        y_pred.extend(np.argmax(predictions, axis=1).tolist())
    
    y_true = np.array(y_true)
    y_pred = np.array(y_pred)
    
    from sklearn.metrics import classification_report, confusion_matrix
    
    report = classification_report(
        y_true, y_pred,
        target_names=class_names,
        output_dict=True,
        zero_division=0
    )
    
    conf_matrix = confusion_matrix(y_true, y_pred).tolist()
    
    # Save metadata
    metadata = {
        "classes": class_names,
        "num_classes": len(class_names),
        "image_size": args.img_size,
        "validation_accuracy": float(val_accuracy),
        "validation_precision": float(val_precision),
        "validation_recall": float(val_recall),
        "validation_loss": float(val_loss),
        "classification_report": report,
        "confusion_matrix": conf_matrix,
        "training_config": {
            "epochs": args.epochs,
            "fine_tune_epochs": args.fine_tune_epochs,
            "batch_size": args.batch_size,
            "optimizer": "Adam",
            "learning_rate": 0.001,
            "fine_tune_learning_rate": 0.00001,
            "base_model": "EfficientNetB0"
        },
        "dataset": {
            "source": "PlantVillage",
            "classification_strategy": "Health-based (healthy=organic, diseased=non-organic)"
        }
    }
    
    (args.out / "labels.json").write_text(json.dumps(class_names, indent=2), encoding="utf-8")
    (args.out / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    
    print(f"\nMetadata saved to: {args.out / 'metadata.json'}")
    print(f"Labels saved to: {args.out / 'labels.json'}")
    
    print(f"\n{'Classification Report':^80}")
    print("-" * 80)
    print(classification_report(y_true, y_pred, target_names=class_names))
    
    print(f"\n{'Confusion Matrix':^80}")
    print("-" * 80)
    print("                 Predicted")
    print(f"                 {class_names[0]:>12} {class_names[1]:>12}")
    print(f"Actual {class_names[0]:>7} {conf_matrix[0][0]:>12} {conf_matrix[0][1]:>12}")
    print(f"       {class_names[1]:>7} {conf_matrix[1][0]:>12} {conf_matrix[1][1]:>12}")
    
    print(f"\n{'Training Complete':^80}")
    print("=" * 80)


if __name__ == "__main__":
    main()
