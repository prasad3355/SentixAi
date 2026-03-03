import json
import os
import pickle
import re
import csv
from pathlib import Path

import nltk
import pandas as pd
from nltk.corpus import stopwords
from nltk.stem.porter import PorterStemmer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR / os.getenv("DATASET_FILE", "data.csv")
MODEL_PATH = BASE_DIR / "twitter_trained_model.sav"
VECTORIZER_PATH = BASE_DIR / "vectorizer.sav"
METRICS_PATH = BASE_DIR / "model_metrics.json"
DATASET_CANDIDATES = [
    BASE_DIR / "data.csv",
    BASE_DIR / "training.1600000.processed.noemoticon.csv",
]


def load_stop_words():
    try:
        return set(stopwords.words("english"))
    except LookupError:
        nltk.download("stopwords", quiet=True)
        return set(stopwords.words("english"))


STOP_WORDS = load_stop_words()
STEMMER = PorterStemmer()


def preprocess(text: str) -> str:
    text = re.sub(r"http\S+|www\.\S+", " ", str(text))
    text = re.sub(r"@\w+", " ", text)
    text = re.sub(r"#\w+", " ", text)
    text = re.sub(r"[^a-zA-Z\s]", " ", text)
    words = text.lower().split()
    words = [STEMMER.stem(word) for word in words if word not in STOP_WORDS]
    return " ".join(words)


def load_dataset(csv_path: Path) -> pd.DataFrame:
    resolved_path = csv_path if csv_path.exists() else None
    if resolved_path is None:
        for candidate in DATASET_CANDIDATES:
            if candidate.exists():
                resolved_path = candidate
                break

    if resolved_path is None:
        raise FileNotFoundError(
            f"Dataset file not found. Tried: {[str(p) for p in [csv_path, *DATASET_CANDIDATES]]}"
        )

    with resolved_path.open("r", encoding="ISO-8859-1", newline="") as fh:
        first_row = next(csv.reader(fh))
    ncols = len(first_row)

    # Sentiment140 format: target,id,date,flag,user,text
    if ncols >= 6:
        raw = pd.read_csv(
            resolved_path,
            encoding="ISO-8859-1",
            header=None,
            usecols=[0, 5],
            low_memory=True,
        )
        data = pd.DataFrame(
            {
                "label": raw.iloc[:, 0].replace({4: 1}),
                "text": raw.iloc[:, 1].fillna("").astype(str),
            }
        )
        data = data[data["label"].isin([0, 1])]
        data.attrs["dataset_path"] = str(resolved_path.name)
        return data

    # Twitter entity format: id,topic,sentiment,text
    if ncols >= 4:
        raw = pd.read_csv(
            resolved_path,
            encoding="ISO-8859-1",
            header=None,
            usecols=[2, 3],
            low_memory=True,
        )
        mapped = (
            raw.iloc[:, 0]
            .astype(str)
            .str.strip()
            .str.lower()
            .map({"positive": 1, "negative": 0})
        )
        data = pd.DataFrame(
            {
                "label": mapped,
                "text": raw.iloc[:, 1].fillna("").astype(str),
            }
        )
        data = data.dropna(subset=["label"])
        data["label"] = data["label"].astype(int)
        data.attrs["dataset_path"] = str(resolved_path.name)
        return data

    raise ValueError("Unsupported CSV format. Expected 4-column or 6-column dataset.")


def main():
    data = load_dataset(DATASET_PATH)
    max_samples = int(os.getenv("MAX_SAMPLES", "0"))
    if max_samples > 0 and len(data) > max_samples:
        data = data.sample(n=max_samples, random_state=42)

    data["clean_text"] = data["text"].apply(preprocess)
    data = data[data["clean_text"].str.len() > 0]

    x_train, x_test, y_train, y_test = train_test_split(
        data["clean_text"].values,
        data["label"].values,
        test_size=0.2,
        random_state=42,
        stratify=data["label"].values,
    )

    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        min_df=5,
        max_features=250000,
        sublinear_tf=True,
    )
    x_train_vec = vectorizer.fit_transform(x_train)
    x_test_vec = vectorizer.transform(x_test)

    model = LogisticRegression(
        class_weight="balanced",
        max_iter=1500,
        solver="saga",
        n_jobs=-1,
        random_state=42,
    )
    model.fit(x_train_vec, y_train)

    y_pred = model.predict(x_test_vec)

    metrics = {
        "dataset_path": data.attrs.get("dataset_path", str(DATASET_PATH.name)),
        "total_samples": int(len(data)),
        "train_samples": int(len(x_train)),
        "test_samples": int(len(x_test)),
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 6),
        "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 6),
        "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 6),
        "f1_score": round(float(f1_score(y_test, y_pred, zero_division=0)), 6),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
    }

    with MODEL_PATH.open("wb") as model_file:
        pickle.dump(model, model_file)

    with VECTORIZER_PATH.open("wb") as vectorizer_file:
        pickle.dump(vectorizer, vectorizer_file)

    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))
    print(f"Saved model: {MODEL_PATH}")
    print(f"Saved vectorizer: {VECTORIZER_PATH}")
    print(f"Saved metrics: {METRICS_PATH}")


if __name__ == "__main__":
    main()
