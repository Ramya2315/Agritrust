"""
AgriTrustra Tomato Price Prediction Model

Train a regression model on the Kaggle tomato prices dataset (Dheeraj) and create artifacts for inference.

Expected CSV structure includes columns such as:
- Date, State, District, Market, Varity/Variety, Crop, Modal Price, Min Price, Max Price

The model predicts the tomato modal price using tabular features.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import tensorflow as tf
from pandas.api.types import is_datetime64_any_dtype, is_numeric_dtype
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

AUTOTUNE = tf.data.AUTOTUNE

PRICE_KEYS = [
    "modal_price",
    "modalprice",
    "modal price",
    "price",
    "avg_price",
    "avg price",
    "average_price",
    "minimum_price",
    "max_price",
    "min_price",
]

PRICE_FEATURE_KEYS = {
    "modal_price",
    "modalprice",
    "modal price",
    "price",
    "avg_price",
    "avg price",
    "average_price",
    "minimum_price",
    "maximum_price",
    "max_price",
    "min_price",
    "retail_prices",
    "retail price",
}

DATE_KEYS = {
    "date",
    "arrival_date",
    "arrivaldate",
    "date_of_arrival",
    "price_date",
    "transaction_date",
}

COMMON_CATEGORICAL_KEYS = {
    "state",
    "district",
    "market",
    "variety",
    "varity",
    "crop",
    "commodity",
    "city",
}


def find_column(columns, candidates):
    lower_map = {col.lower().replace(" ", "_"): col for col in columns}
    for candidate in candidates:
        if candidate in lower_map:
            return lower_map[candidate]
    return None


def canonicalize_columns(columns):
    return {col: col.strip().replace(" ", "_").lower() for col in columns}


def normalize_column_name(column: str) -> str:
    return column.strip().replace(" ", "_").lower()


def load_tomato_price_csv(csv_path: Path) -> pd.DataFrame:
    df = pd.read_csv(csv_path, encoding="utf-8", low_memory=False)
    if df.empty:
        raise ValueError(f"CSV file is empty: {csv_path}")

    df = df.rename(columns={col: normalize_column_name(col) for col in df.columns})
    return df


def extract_price_target(df: pd.DataFrame) -> str:
    columns = list(df.columns)
    normalized = {normalize_column_name(col): col for col in columns}
    for candidate in PRICE_KEYS:
        if candidate in normalized:
            return normalized[candidate]

    raise ValueError(
        "Could not identify the target price column. Please include a modal price, price, avg_price, or similar field. "
        f"Detected columns: {columns}"
    )


def coerce_numeric_columns(df: pd.DataFrame, columns):
    for column in columns:
        if column in df.columns:
            df[column] = pd.to_numeric(
                df[column].astype(str).str.replace(",", "", regex=False),
                errors="coerce",
            )
    return df


def prepare_features(df: pd.DataFrame, target_column: str, allow_price_features: bool = False):
    columns = list(df.columns)
    normalized = canonicalize_columns(columns)

    date_column = None
    for candidate in DATE_KEYS:
        if candidate in normalized.values():
            date_column = next(col for col, norm in normalized.items() if norm == candidate)
            break
        if candidate in normalized:
            date_column = normalized[candidate]
            break

    if date_column and date_column in df.columns:
        df["__parsed_date"] = pd.to_datetime(df[date_column], errors="coerce")
        df["year"] = df["__parsed_date"].dt.year.fillna(0).astype(int)
        df["month"] = df["__parsed_date"].dt.month.fillna(0).astype(int)
        df["day"] = df["__parsed_date"].dt.day.fillna(0).astype(int)
        df["weekday"] = df["__parsed_date"].dt.weekday.fillna(0).astype(int)
    else:
        date_column = None

    cat_columns = []
    for col in df.columns:
        if col == target_column or col == date_column or col == "__parsed_date":
            continue
        if is_numeric_dtype(df[col]) or is_datetime64_any_dtype(df[col]):
            continue
        if not allow_price_features and normalize_column_name(col) in PRICE_FEATURE_KEYS:
            continue
        if df[col].nunique(dropna=False) / max(len(df), 1) > 0.8:
            continue
        cat_columns.append(col)

    numeric_columns = [
        col for col in df.columns
        if col != target_column
        and is_numeric_dtype(df[col])
        and (allow_price_features or normalize_column_name(col) not in PRICE_FEATURE_KEYS)
    ]
    if date_column is not None and "__parsed_date" in df.columns:
        numeric_columns = [col for col in numeric_columns if col != target_column and col != "__parsed_date"]

    common_text_columns = [col for col in cat_columns if col.lower().replace(" ", "_") in COMMON_CATEGORICAL_KEYS]
    remaining_text = [col for col in cat_columns if col not in common_text_columns]
    cat_columns = common_text_columns + remaining_text

    if not numeric_columns and not cat_columns:
        raise ValueError("No usable numeric or categorical features were found in the tomato prices dataset.")

    feature_columns = numeric_columns + cat_columns
    return df, feature_columns, numeric_columns, cat_columns, date_column


def build_tabular_model(numeric_features, categorical_features, categorical_vocab_sizes):
    inputs = []
    encoded_features = []

    for feature in numeric_features:
        inp = tf.keras.Input(shape=(1,), name=feature, dtype=tf.float32)
        norm = tf.keras.layers.Normalization(axis=None, name=f"{feature}_norm")
        inputs.append(inp)
        encoded_features.append(norm(inp))

    for feature in categorical_features:
        inp = tf.keras.Input(shape=(1,), name=feature, dtype=tf.string)
        lookup = tf.keras.layers.StringLookup(vocabulary=categorical_vocab_sizes[feature], mask_token=None, num_oov_indices=1, name=f"{feature}_lookup")
        encoded = lookup(inp)
        embedding_dim = min(32, max(4, (len(categorical_vocab_sizes[feature]) + 1) // 2))
        emb = tf.keras.layers.Embedding(input_dim=len(lookup.get_vocabulary()), output_dim=embedding_dim, name=f"{feature}_embed")(encoded)
        emb = tf.keras.layers.Reshape((embedding_dim,))(emb)
        inputs.append(inp)
        encoded_features.append(emb)

    x = tf.keras.layers.Concatenate()(encoded_features)
    x = tf.keras.layers.Dense(128, activation="relu")(x)
    x = tf.keras.layers.Dropout(0.2)(x)
    x = tf.keras.layers.Dense(64, activation="relu")(x)
    x = tf.keras.layers.Dense(32, activation="relu")(x)
    output = tf.keras.layers.Dense(1, activation="linear", name="price")

    model = tf.keras.Model(inputs=inputs, outputs=output(x))
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=5e-4), loss="mse", metrics=["mae"])
    return model


def dataset_from_dataframe(df: pd.DataFrame, feature_columns, target_column, batch_size: int, shuffle: bool = True):
    features = {}
    for column in feature_columns:
        if column in df.columns:
            if is_numeric_dtype(df[column]):
                features[column] = df[column].astype(float).fillna(0.0).to_numpy()
            else:
                features[column] = df[column].fillna("unknown").astype(str).to_numpy()

    labels = df[target_column].astype(float).to_numpy()
    dataset = tf.data.Dataset.from_tensor_slices((features, labels))
    if shuffle:
        dataset = dataset.shuffle(buffer_size=len(df), seed=42)
    return dataset.batch(batch_size).prefetch(AUTOTUNE)


def fit_normalizers(model, df, numeric_features):
    for feature in numeric_features:
        layer = model.get_layer(f"{feature}_norm")
        if layer is not None:
            values = df[feature].astype(float).fillna(0.0).to_numpy().reshape(-1, 1)
            layer.adapt(values)


def main():
    parser = argparse.ArgumentParser(description="Train a tomato price regression model on the Kaggle tomato prices dataset.")
    parser.add_argument("--csv", type=Path, required=True, help="Path to the tomato prices CSV file.")
    parser.add_argument("--out", type=Path, default=Path("ml/artifacts/tomato-price-model"), help="Output artifact directory.")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--validation-split", type=float, default=0.2)
    parser.add_argument("--test-split", type=float, default=0.1)
    parser.add_argument(
        "--allow-price-features",
        action="store_true",
        help="Allow same-row price columns such as Min Price, Max Price, or Retail Prices as model inputs.",
    )
    args = parser.parse_args()

    df = load_tomato_price_csv(args.csv)
    target_column = extract_price_target(df)
    price_like_columns = [
        column for column in df.columns
        if normalize_column_name(column) in PRICE_FEATURE_KEYS or column == target_column
    ]
    df = coerce_numeric_columns(df, price_like_columns + ["arrival_quantity"])

    df = df.dropna(subset=[target_column]).reset_index(drop=True)
    df, feature_columns, numeric_columns, categorical_columns, date_column = prepare_features(
        df,
        target_column,
        allow_price_features=args.allow_price_features,
    )

    train_val_df, test_df = train_test_split(df, test_size=args.test_split, random_state=42)
    train_df, val_df = train_test_split(train_val_df, test_size=args.validation_split / (1 - args.test_split), random_state=42)

    categorical_vocab_sizes = {}
    for feature in categorical_columns:
        unique_values = sorted(train_df[feature].fillna("unknown").astype(str).unique().tolist())
        categorical_vocab_sizes[feature] = unique_values

    model = build_tabular_model(numeric_columns, categorical_columns, categorical_vocab_sizes)
    fit_normalizers(model, train_df, numeric_columns)

    train_ds = dataset_from_dataframe(train_df, feature_columns, target_column, args.batch_size, shuffle=True)
    val_ds = dataset_from_dataframe(val_df, feature_columns, target_column, args.batch_size, shuffle=False)

    callbacks = [
        tf.keras.callbacks.EarlyStopping(monitor="val_mae", patience=4, restore_best_weights=True),
        tf.keras.callbacks.ModelCheckpoint(args.out / "model.keras", monitor="val_mae", save_best_only=True),
    ]

    args.out.mkdir(parents=True, exist_ok=True)
    history = model.fit(train_ds, validation_data=val_ds, epochs=args.epochs, callbacks=callbacks)

    model.save(args.out / "model.keras")

    test_ds = dataset_from_dataframe(test_df, feature_columns, target_column, args.batch_size, shuffle=False)
    predictions = model.predict(test_ds, verbose=0).flatten()
    actuals = np.concatenate([y for _, y in test_ds], axis=0)

    metrics = {
        "mae": float(mean_absolute_error(actuals, predictions)),
        "mse": float(mean_squared_error(actuals, predictions)),
        "rmse": float(np.sqrt(mean_squared_error(actuals, predictions))),
        "r2": float(r2_score(actuals, predictions)),
        "trained_epochs": len(history.history["loss"]),
    }

    metadata = {
        "source_csv": str(args.csv),
        "target_column": target_column,
        "date_column": date_column,
        "feature_columns": feature_columns,
        "numeric_columns": numeric_columns,
        "categorical_columns": categorical_columns,
        "allow_price_features": args.allow_price_features,
        "data_splits": {
            "train": len(train_df),
            "validation": len(val_df),
            "test": len(test_df),
        },
        "metrics": metrics,
    }

    (args.out / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    pd.DataFrame(history.history).to_csv(args.out / "history.csv", index=False)

    print("Tomato price model training complete.")
    print(json.dumps(metrics, indent=2))
    print(f"Saved artifacts to {args.out.resolve()}")


if __name__ == "__main__":
    main()
