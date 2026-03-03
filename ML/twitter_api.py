import pickle
import re
from pathlib import Path
from typing import Optional

import nltk
from fastapi import FastAPI, HTTPException
from nltk.corpus import stopwords
from nltk.stem.porter import PorterStemmer
from pydantic import BaseModel

app = FastAPI(title="Sentiment ML API", version="2.0.0")

BASE_DIR = Path(__file__).resolve().parent
MODEL_CANDIDATES = [
    BASE_DIR / "twitter_trained_model.sav",
    BASE_DIR / "Twitter_trained_model.sav",
]
VECTORIZER_PATH = BASE_DIR / "vectorizer.sav"

model = None
vectorizer = None
load_error: Optional[str] = None


def load_stop_words():
    try:
        return set(stopwords.words("english"))
    except LookupError:
        nltk.download("stopwords", quiet=True)
        return set(stopwords.words("english"))


def resolve_model_path() -> Path:
    for candidate in MODEL_CANDIDATES:
        if candidate.exists():
            return candidate
    return MODEL_CANDIDATES[0]


def load_artifacts() -> None:
    global model, vectorizer, load_error

    model_path = resolve_model_path()
    if not model_path.exists():
        load_error = f"Missing model file: {model_path.name}"
        return

    if not VECTORIZER_PATH.exists():
        load_error = f"Missing vectorizer file: {VECTORIZER_PATH.name}"
        return

    try:
        with model_path.open("rb") as model_file:
            model = pickle.load(model_file)
        with VECTORIZER_PATH.open("rb") as vectorizer_file:
            vectorizer = pickle.load(vectorizer_file)
        load_error = None
    except Exception as exc:
        load_error = f"Failed to load ML artifacts: {exc}"


stop_words = load_stop_words()
stemmer = PorterStemmer()
load_artifacts()

# Lightweight safety layer: if explicit threat/toxicity patterns are detected,
# override sentiment output to negative for safer production behavior.
TOXIC_PHRASE_PATTERNS = [
    re.compile(r"\bi\s*(am|'m)?\s*going\s*to\s*kill\s+you\b"),
    re.compile(r"\bi\s*will\s*kill\s+you\b"),
    re.compile(r"\bkill\s+yourself\b"),
    re.compile(r"\bi\s*will\s*murder\s+you\b"),
    re.compile(r"\bi\s*am\s*going\s*to\s*hurt\s+you\b"),
]

TOXIC_KEYWORDS = {
    "kill",
    "murder",
    "rape",
    "shoot",
    "stab",
    "bomb",
    "terrorist",
    "lynch",
}


class Tweet(BaseModel):
    text: str


def preprocess(text: str) -> str:
    text = re.sub(r"http\S+|www\.\S+", " ", text)
    text = re.sub(r"@\w+", " ", text)
    text = re.sub(r"#\w+", " ", text)
    text = re.sub(r"[^a-zA-Z\s]", " ", text)
    words = text.lower().split()
    words = [stemmer.stem(word) for word in words if word not in stop_words]
    return " ".join(words)


def detect_toxicity(text: str):
    lower_text = text.lower().strip()
    if not lower_text:
        return {"flagged": False, "score": 0.0, "matches": []}

    score = 0.0
    matches = []

    for pattern in TOXIC_PHRASE_PATTERNS:
        if pattern.search(lower_text):
            matches.append(pattern.pattern)
            score += 0.7

    words = re.findall(r"[a-zA-Z]+", lower_text)
    toxic_hits = [word for word in words if word in TOXIC_KEYWORDS]
    if toxic_hits:
        matches.extend(sorted(set(toxic_hits)))
        score += min(0.35, len(toxic_hits) * 0.1)

    final_score = min(1.0, round(score, 4))
    return {
        "flagged": final_score >= 0.55,
        "score": final_score,
        "matches": matches,
    }


@app.get("/health")
def health():
    if load_error:
        return {"status": "degraded", "detail": load_error}
    return {"status": "ok"}


@app.post("/predict")
def predict_sentiment(tweet: Tweet):
    if load_error or model is None or vectorizer is None:
        raise HTTPException(
            status_code=503,
            detail=load_error or "ML model artifacts are not loaded.",
        )

    raw_text = tweet.text.strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="Text must not be empty.")

    processed_text = preprocess(raw_text)
    vector = vectorizer.transform([processed_text])
    prediction = int(model.predict(vector)[0])
    toxicity = detect_toxicity(raw_text)

    result = {
        "sentiment": "Positive Tweet" if prediction == 1 else "Negative Tweet",
        "label": prediction,
        "toxicity": toxicity,
    }

    if hasattr(model, "predict_proba"):
        probability = float(model.predict_proba(vector)[0][prediction])
        result["confidence"] = round(probability, 4)
    else:
        result["confidence"] = 0.0

    if toxicity["flagged"]:
        result["sentiment"] = "Negative Tweet"
        result["label"] = 0
        result["confidence"] = round(max(result["confidence"], toxicity["score"]), 4)
        result["safetyOverride"] = True

    return result
