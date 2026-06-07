"""
Train a tomato modal price model on the real tomato-prices.csv dataset.

This trainer uses a scikit-learn preprocessing pipeline plus a histogram
gradient boosting regressor. It is intentionally CPU-friendly for local
Windows training and avoids using same-row min/max/retail price columns as
inputs unless explicitly requested.
"""

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


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


def normalize_column_name(column: str) -> str:
    return column.strip().replace(" ", "_").lower()


def load_csv(csv_path: Path) -> pd.DataFrame:
    df = pd.read_csv(csv_path, encoding="utf-8", low_memory=False)
    if df.empty:
        raise ValueError(f"CSV file is empty: {csv_path}")
    return df.rename(columns={column: normalize_column_name(column) for column in df.columns})


def find_target_column(df: pd.DataFrame) -> str:
    normalized = {normalize_column_name(column): column for column in df.columns}
    for key in PRICE_KEYS:
        if key in normalized:
            return normalized[key]
    raise ValueError(f"Could not identify a price target column. Detected columns: {list(df.columns)}")


def find_date_column(df: pd.DataFrame) -> str | None:
    for column in df.columns:
        if normalize_column_name(column) in DATE_KEYS:
            return column
    return None


def add_date_features(df: pd.DataFrame, date_column: str | None) -> pd.DataFrame:
    df = df.copy()
    if not date_column or date_column not in df.columns:
        return df

    parsed = pd.to_datetime(df[date_column], errors="coerce")
    df["year"] = parsed.dt.year
    df["month"] = parsed.dt.month
    df["day"] = parsed.dt.day
    df["weekday"] = parsed.dt.weekday
    return df


def coerce_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series.astype(str).str.replace(",", "", regex=False), errors="coerce")


def prepare_training_frame(df: pd.DataFrame, allow_price_features: bool):
    target_column = find_target_column(df)
    date_column = find_date_column(df)

    for column in df.columns:
        normalized = normalize_column_name(column)
        if normalized in PRICE_FEATURE_KEYS or normalized == "arrival_quantity":
            df[column] = coerce_numeric(df[column])

    df = df.dropna(subset=[target_column]).reset_index(drop=True)
    df = add_date_features(df, date_column)

    blocked = {target_column, date_column}
    if not allow_price_features:
        blocked.update(
            column
            for column in df.columns
            if normalize_column_name(column) in PRICE_FEATURE_KEYS and column != target_column
        )

    feature_columns = [
        column
        for column in df.columns
        if column not in blocked and not column.startswith("__")
    ]

    numeric_columns = [
        column
        for column in feature_columns
        if pd.api.types.is_numeric_dtype(df[column])
    ]
    categorical_columns = [
        column
        for column in feature_columns
        if column not in numeric_columns
    ]

    if not numeric_columns and not categorical_columns:
        raise ValueError("No usable model features were found.")

    return df, target_column, date_column, feature_columns, numeric_columns, categorical_columns


def build_model(numeric_columns, categorical_columns):
    numeric_pipeline = Pipeline(
        steps=[("imputer", SimpleImputer(strategy="median"))]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="constant", fill_value="unknown")),
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )
    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", numeric_pipeline, numeric_columns),
            ("categorical", categorical_pipeline, categorical_columns),
        ]
    )
    regressor = GradientBoostingRegressor(
        n_estimators=250,
        learning_rate=0.05,
        max_depth=4,
        subsample=0.85,
        random_state=42,
    )
    return Pipeline(steps=[("preprocessor", preprocessor), ("regressor", regressor)])


def main():
    parser = argparse.ArgumentParser(description="Train a real tomato modal price prediction model.")
    parser.add_argument("--csv", type=Path, required=True, help="Path to tomato-prices.csv.")
    parser.add_argument("--out", type=Path, default=Path("ml/artifacts/tomato-price-model"))
    parser.add_argument("--test-split", type=float, default=0.1)
    parser.add_argument("--allow-price-features", action="store_true")
    args = parser.parse_args()

    df = load_csv(args.csv)
    df, target_column, date_column, feature_columns, numeric_columns, categorical_columns = prepare_training_frame(
        df,
        allow_price_features=args.allow_price_features,
    )

    train_df, test_df = train_test_split(df, test_size=args.test_split, random_state=42)
    model = build_model(numeric_columns, categorical_columns)
    model.fit(train_df[feature_columns], train_df[target_column])

    predictions = model.predict(test_df[feature_columns])
    actuals = test_df[target_column].to_numpy()
    metrics = {
        "mae": float(mean_absolute_error(actuals, predictions)),
        "mse": float(mean_squared_error(actuals, predictions)),
        "rmse": float(np.sqrt(mean_squared_error(actuals, predictions))),
        "r2": float(r2_score(actuals, predictions)),
    }
    metadata = {
        "algorithm": "GradientBoostingRegressor",
        "source_csv": str(args.csv),
        "target_column": target_column,
        "date_column": date_column,
        "feature_columns": feature_columns,
        "numeric_columns": numeric_columns,
        "categorical_columns": categorical_columns,
        "allow_price_features": args.allow_price_features,
        "data_splits": {
            "train": len(train_df),
            "test": len(test_df),
        },
        "metrics": metrics,
    }

    args.out.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, args.out / "model.joblib")
    (args.out / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    pd.DataFrame(
        {
            "actual": actuals,
            "prediction": predictions,
        }
    ).to_csv(args.out / "test_predictions.csv", index=False)

    print("Tomato price model training complete.")
    print(json.dumps(metrics, indent=2))
    print(f"Saved artifacts to {args.out.resolve()}")


if __name__ == "__main__":
    main()
