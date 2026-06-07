"""
Predict tomato prices using a trained AgriTrustra tomato price regression model.

Usage:
  python ml/predict_tomato_price.py --model ml/artifacts/tomato-price-model/model.keras --csv datasets/tomato-prices.csv
"""

import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from pandas.api.types import is_numeric_dtype


def load_metadata(model_dir: Path):
    metadata_path = model_dir / "metadata.json"
    if not metadata_path.exists():
        raise FileNotFoundError(f"Could not find metadata at {metadata_path}")
    return json.loads(metadata_path.read_text(encoding="utf-8"))


def load_csv(csv_path: Path):
    df = pd.read_csv(csv_path, encoding="utf-8", low_memory=False)
    df = df.rename(columns={column: column.strip().replace(" ", "_").lower() for column in df.columns})
    return df


def add_date_features(df: pd.DataFrame, date_column: str | None):
    if not date_column or date_column not in df.columns:
        return df

    parsed = pd.to_datetime(df[date_column], errors="coerce")
    df["year"] = parsed.dt.year.fillna(0).astype(int)
    df["month"] = parsed.dt.month.fillna(0).astype(int)
    df["day"] = parsed.dt.day.fillna(0).astype(int)
    df["weekday"] = parsed.dt.weekday.fillna(0).astype(int)
    return df


def prepare_row(df: pd.DataFrame, metadata):
    df = df.copy()
    df = add_date_features(df, metadata.get("date_column"))
    target_column = metadata["target_column"]
    if target_column in df.columns:
        df = df.drop(columns=[target_column])

    for column in metadata["feature_columns"]:
        if column not in df.columns:
            df[column] = 0.0 if column in metadata.get("numeric_columns", []) else "unknown"

    features = {}
    for column in metadata["feature_columns"]:
        if column in df.columns:
            if column in metadata.get("numeric_columns", []) or is_numeric_dtype(df[column]):
                features[column] = pd.to_numeric(df[column], errors="coerce").astype(float).fillna(0.0).to_numpy()
            else:
                features[column] = df[column].fillna("unknown").astype(str).to_numpy()
    return features


def prepare_frame(df: pd.DataFrame, metadata):
    df = df.copy()
    df = add_date_features(df, metadata.get("date_column"))
    target_column = metadata["target_column"]
    if target_column in df.columns:
        df = df.drop(columns=[target_column])

    for column in metadata["feature_columns"]:
        if column not in df.columns:
            df[column] = 0.0 if column in metadata.get("numeric_columns", []) else "unknown"

    for column in metadata.get("numeric_columns", []):
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")

    return df[metadata["feature_columns"]]


def numeric_value(row, column: str):
    if column not in row.index or pd.isna(row[column]):
        return None
    value = pd.to_numeric(row[column], errors="coerce")
    return None if pd.isna(value) else float(value)


def price_per_kg(value):
    return None if value is None else round(value / 100, 2)


def json_ready(value):
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        return value.item()
    return value


def main():
    parser = argparse.ArgumentParser(description="Load a trained tomato price model and make predictions from CSV records.")
    parser.add_argument("--model", type=Path, required=True, help="Path to the trained model directory.")
    parser.add_argument("--csv", type=Path, required=True, help="Path to the tomato prices CSV file.")
    parser.add_argument("--sample", type=int, default=5, help="Number of rows to show predictions for.")
    args = parser.parse_args()

    metadata = load_metadata(args.model)
    df = load_csv(args.csv)
    df = df.dropna(subset=[metadata["target_column"]]) if metadata["target_column"] in df.columns else df

    sklearn_model = args.model / "model.joblib"
    keras_model = args.model / "model.keras"
    if sklearn_model.exists():
        model = joblib.load(sklearn_model)
        predictions = model.predict(prepare_frame(df, metadata))
    elif keras_model.exists():
        import tensorflow as tf

        features = prepare_row(df, metadata)
        model = tf.keras.models.load_model(keras_model)
        predictions = model.predict(features, verbose=0).flatten()
    else:
        raise FileNotFoundError(f"Could not find model.joblib or model.keras in {args.model}")

    rows = []
    for idx, prediction in enumerate(predictions[: args.sample]):
        source_row = df.iloc[idx]
        actual_modal_price = numeric_value(source_row, metadata["target_column"])
        min_price = numeric_value(source_row, "min_price")
        max_price = numeric_value(source_row, "max_price")
        retail_price = numeric_value(source_row, "retail_prices") or numeric_value(source_row, "retail_price")
        predicted_modal_price = float(prediction)

        entry = {
            "predictedModalPrice": predicted_modal_price,
            "predictedModalPricePerKg": price_per_kg(predicted_modal_price),
            "actualModalPrice": actual_modal_price,
            "actualModalPricePerKg": price_per_kg(actual_modal_price),
            "minPrice": min_price,
            "minPricePerKg": price_per_kg(min_price),
            "maxPrice": max_price,
            "maxPricePerKg": price_per_kg(max_price),
            "retailPrice": retail_price,
            "retailPricePerKg": price_per_kg(retail_price),
            "date": json_ready(source_row["date"]) if "date" in df.columns else None,
            "market": json_ready(source_row["market"]) if "market" in df.columns else None,
        }
        for column in metadata["feature_columns"]:
            if column in df.columns:
                entry[column] = json_ready(source_row[column])

        comparison_price = retail_price or max_price
        if comparison_price and comparison_price > 0:
            market_gap = comparison_price - predicted_modal_price
            entry["marketGap"] = market_gap
            entry["gapPercentage"] = market_gap / comparison_price * 100

        rows.append(entry)

    print(f"Loaded tomato price model from {args.model}")
    print(json.dumps({"sample_predictions": rows}))


if __name__ == "__main__":
    main()
