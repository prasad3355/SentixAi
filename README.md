# Sentimental Analysis Project

This is a full-stack sentiment analysis project with:

- `Frontend/`: React + Vite dashboard UI
- `Backend/server/`: Node.js API gateway
- `ML/`: FastAPI sentiment model service

## Architecture

1. Frontend sends keyword from the top search bar.
2. Frontend calls:
   - `POST /api/analyze` for direct keyword sentiment.
   - `GET /api/overview?keyword=...` for dashboard, analytics, network, and live feed payload.
3. Node backend aggregates and refreshes live data, and forwards ML scoring calls to FastAPI `/predict`.
4. Frontend polls overview data every few seconds for real-time updates across all 4 pages.

## Prerequisites

- Node.js 18+
- Python 3.10+
- X (Twitter) developer Bearer token for real tweet fetch

## Run The Project

Open three terminals from project root:

1. Start ML service

```bash
cd ML
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
# train model artifacts manually before serving
python train_model.py
uvicorn twitter_api:app --host 127.0.0.1 --port 8000 --reload
```

2. Start backend service

```bash
cd Backend/server
npm install
copy .env.example .env
# set X_BEARER_TOKEN in .env (or X_CONSUMER_KEY + X_CONSUMER_KEY_SECRET)
# set DATASET_PATH in .env if your CSV is not at ML/training.1600000.processed.noemoticon.csv
npm run dev
```

3. Start frontend app

```bash
cd Frontend
npm install
npm run dev
```

Frontend will run at `http://localhost:5173` and proxy `/api` to the Node backend on `http://localhost:5000`.

## API Endpoints

- `GET /api/health` (Node backend health and ML reachability)
  - includes X API config status (`twitter.configured`)
- `POST /api/analyze`
  - body: `{ "text": "I love this product" }`
  - response: sentiment output from ML service
- `GET /api/overview?keyword=tesla`
  - response: integrated payload for `Dashboard`, `Analytics`, `Network`, and `Live Feed`
  - includes:
    - KPI cards, distribution, emotion bars, timeline
    - trend series, topic analysis, influential mentions
    - network nodes/edges/influencers
    - live tweets and feed stats

## Notes

- Production model files are loaded from `ML/twitter_trained_model.sav` and `ML/vectorizer.sav`.
- Train manually with `ML/train_model.py` and review `ML/model_metrics.json`.
- All 4 frontend pages are scrollable and synchronized to the current searched keyword.
- Real-time tweet fetch uses X Recent Search API (`/2/tweets/search/recent`) with `X_BEARER_TOKEN`.
- If X API is missing/invalid/rate-limited, backend falls back to CSV dataset feed.
- If ML service is unavailable or model artifacts are missing, API returns JSON error instead of heuristic fallback.
- `/predict` applies an additional toxicity safety override: explicit threat text is forced to `Negative Tweet` with `safetyOverride: true`.
