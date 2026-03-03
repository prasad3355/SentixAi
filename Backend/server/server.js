require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const {
  createExcelReportBuffer,
  safeKeywordSlug,
} = require("./reportService");

const app = express();
const PORT = process.env.PORT || 5000;
const ML_API_URL = process.env.ML_API_URL || "http://127.0.0.1:8000";
const X_BEARER_TOKEN =
  process.env.X_BEARER_TOKEN ||
  process.env.TWITTER_BEARER_TOKEN ||
  process.env.BEARER_TOKEN ||
  "";
const X_CONSUMER_KEY = process.env.X_CONSUMER_KEY || process.env.TWITTER_API_KEY || "";
const X_CONSUMER_KEY_SECRET =
  process.env.X_CONSUMER_KEY_SECRET || process.env.TWITTER_API_SECRET || "";
const X_API_BASE_URL = process.env.X_API_BASE_URL || "https://api.x.com/2";
const X_ALT_API_BASE_URL = process.env.X_ALT_API_BASE_URL || "https://api.twitter.com/2";
const X_DEFAULT_MAX_RESULTS = Number(process.env.X_MAX_RESULTS || 25);
const DATASET_PATH = process.env.DATASET_PATH || "";
const DATASET_SAMPLE_LIMIT = Number(process.env.DATASET_SAMPLE_LIMIT || 20000);
const CSV_KPI_MODE = (process.env.CSV_KPI_MODE || "inflated").toLowerCase();
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

app.use(cors());
app.use(express.json());

let cachedAppBearerToken = "";
let appBearerTokenFetchedAt = 0;
let datasetLoadPromise = null;
let datasetRows = [];
let datasetStatus = {
  ready: false,
  path: null,
  sampleCount: 0,
  totalRowsSeen: 0,
  reason: "not_loaded",
};

const SENTIMENT_LABEL_TO_SCORE = {
  "Positive Tweet": 82,
  "Negative Tweet": 24,
  "Neutral Tweet": 50,
};

function toKeyword(input) {
  const value = typeof input === "string" ? input.trim() : "";
  return value || "technology";
}

function normalizeLabelValue(value) {
  if (typeof value === "number") {
    if (value === 4) return 1;
    if (value === 0 || value === 1) return value;
    if (value === 2) return -1;
    return null;
  }

  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "4" || normalized === "positive") return 1;
  if (normalized === "0" || normalized === "negative") return 0;
  if (normalized === "neutral" || normalized === "irrelevant" || normalized === "2") return -1;
  return null;
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      cells.push(cell);
      cell = "";
      continue;
    }

    cell += ch;
  }

  cells.push(cell);
  return cells;
}

function resolveDatasetCandidates() {
  const fromEnv = DATASET_PATH ? path.resolve(DATASET_PATH) : null;

  return [
    fromEnv,
    path.join(PROJECT_ROOT, "ML", "training.1600000.processed.noemoticon.csv"),
    path.join(PROJECT_ROOT, "ML", "twitter_training.csv"),
    path.join(PROJECT_ROOT, "ML", "data.csv"),
  ].filter(Boolean);
}

function pickDatasetPath() {
  const candidates = resolveDatasetCandidates();
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

async function isZipFile(filePath) {
  const fd = await fs.promises.open(filePath, "r");
  try {
    const signature = Buffer.alloc(4);
    await fd.read(signature, 0, 4, 0);
    return signature[0] === 0x50 && signature[1] === 0x4b;
  } finally {
    await fd.close();
  }
}

async function loadDatasetSample() {
  if (datasetLoadPromise) return datasetLoadPromise;

  datasetLoadPromise = (async () => {
    const selectedPath = pickDatasetPath();
    if (!selectedPath) {
      datasetStatus = {
        ready: false,
        path: null,
        sampleCount: 0,
        totalRowsSeen: 0,
        reason: "dataset_file_not_found",
      };
      return;
    }

    if (await isZipFile(selectedPath)) {
      datasetStatus = {
        ready: false,
        path: path.relative(PROJECT_ROOT, selectedPath),
        sampleCount: 0,
        totalRowsSeen: 0,
        reason: "dataset_is_zip_extract_csv_first",
      };
      return;
    }

    const sampleLimit = Math.max(500, DATASET_SAMPLE_LIMIT);
    const reservoir = [];
    let seen = 0;
    const stream = fs.createReadStream(selectedPath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;

      const cells = parseCsvLine(line);
      if (!cells.length) continue;

      let text = "";
      let label = null;

      if (cells.length >= 6) {
        label = normalizeLabelValue(cells[0]);
        text = cells.slice(5).join(",").trim();
      } else if (cells.length === 4) {
        // Format: id, topic, sentiment, text
        label = normalizeLabelValue(cells[2]);
        text = cells[3].trim();
      } else if (cells.length >= 2) {
        label = normalizeLabelValue(cells[0]) ?? normalizeLabelValue(cells[1]);
        text = cells[cells.length - 1].trim();
      }

      if (label === null || !text || text.toLowerCase() === "text") {
        continue;
      }

      seen += 1;
      const row = { text, label };

      if (reservoir.length < sampleLimit) {
        reservoir.push(row);
      } else {
        const slot = Math.floor(Math.random() * seen);
        if (slot < sampleLimit) reservoir[slot] = row;
      }
    }

    datasetRows = reservoir;
    datasetStatus = {
      ready: datasetRows.length > 0,
      path: path.relative(PROJECT_ROOT, selectedPath),
      sampleCount: datasetRows.length,
      totalRowsSeen: seen,
      reason: datasetRows.length ? "ok" : "no_valid_rows",
    };
  })();

  return datasetLoadPromise;
}

function chooseDatasetRows(keyword, maxResults) {
  const loweredKeyword = keyword.toLowerCase();
  const hits = datasetRows.filter((row) => row.text.toLowerCase().includes(loweredKeyword));
  return hits.slice(0, maxResults);
}

async function fetchTweetsFromDataset(keyword, maxResults = X_DEFAULT_MAX_RESULTS) {
  await loadDatasetSample();

  if (!datasetStatus.ready || !datasetRows.length) {
    return {
      tweets: [],
      meta: null,
      source: "fallback",
      reason: datasetStatus.reason || "dataset_unavailable",
    };
  }

  const boundedMax = Math.max(10, Math.min(100, maxResults));
  const selected = chooseDatasetRows(keyword, boundedMax);
  if (!selected.length) {
    return {
      tweets: [],
      meta: { result_count: 0, keyword_match_count: 0 },
      source: "csv_dataset",
      reason: "no_keyword_matches_in_csv_sample",
    };
  }
  const minuteBucket = currentMinuteBucket();
  const rows = selected.map((row, idx) => {
    const rowSeed = hashString(`${keyword}:${minuteBucket}:dataset:${idx}:${row.text.slice(0, 24)}`);
    const followers = valueInRange(rowSeed, 120, 18000);
    return {
      id: `csv-${minuteBucket}-${idx}-${rowSeed}`,
      text: row.text,
      createdAt: new Date(
        Date.now() - valueInRange(rowSeed + 1, 30_000, 8_000_000)
      ).toISOString(),
      lang: "en",
      publicMetrics: {
        reply_count: valueInRange(rowSeed + 2, 0, 45),
        retweet_count: valueInRange(rowSeed + 3, 0, 120),
        like_count: valueInRange(rowSeed + 4, 1, 650),
        quote_count: valueInRange(rowSeed + 5, 0, 35),
      },
      author: {
        id: `csv-user-${idx}`,
        name: `DatasetUser${idx + 1}`,
        username: `dataset_user_${idx + 1}`,
        profileImageUrl: `https://ui-avatars.com/api/?name=DatasetUser${idx + 1}&background=1e293b&color=fff`,
        followers,
        verified: idx % 7 === 0,
      },
    };
  });

  return {
    tweets: rows,
    meta: { result_count: rows.length, keyword_match_count: rows.length },
    source: "csv_dataset",
    reason: null,
  };
}

async function getAppBearerToken() {
  const now = Date.now();
  if (cachedAppBearerToken && now - appBearerTokenFetchedAt < 24 * 60 * 60 * 1000) {
    return cachedAppBearerToken;
  }

  if (!X_CONSUMER_KEY || !X_CONSUMER_KEY_SECRET) {
    return "";
  }

  const encoded = Buffer.from(`${X_CONSUMER_KEY}:${X_CONSUMER_KEY_SECRET}`).toString("base64");

  try {
    const response = await axios.post(
      "https://api.twitter.com/oauth2/token",
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${encoded}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        timeout: 10000,
      }
    );

    const token = String(response.data?.access_token || "");
    if (token) {
      cachedAppBearerToken = token;
      appBearerTokenFetchedAt = now;
    }
    return token;
  } catch (error) {
    return "";
  }
}

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function valueInRange(seed, min, max) {
  return min + (seed % (max - min + 1));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function currentMinuteBucket() {
  return Math.floor(Date.now() / 60_000);
}

function driftUnit(keyword, minuteBucket, slot) {
  const raw = hashString(`${keyword}:${minuteBucket}:${slot}`) % 2001;
  return (raw - 1000) / 1000;
}

function applyDrift(value, ratioUnit, maxPercent, minValue, maxValue) {
  const next = value * (1 + ratioUnit * maxPercent);
  return clamp(next, minValue, maxValue);
}

function normalizeMlSentiment(payload = {}) {
  const sentiment = payload.sentiment || "Neutral Tweet";
  const baseScore =
    SENTIMENT_LABEL_TO_SCORE[sentiment] !== undefined
      ? SENTIMENT_LABEL_TO_SCORE[sentiment]
      : 50;
  const confidence =
    typeof payload.confidence === "number"
      ? Math.max(0, Math.min(1, payload.confidence))
      : 0.65;

  return Math.round(baseScore * 0.7 + confidence * 100 * 0.3);
}

async function scoreText(text) {
  try {
    const response = await axios.post(
      `${ML_API_URL}/predict`,
      { text },
      { timeout: 8000 }
    );
    return normalizeMlSentiment(response.data);
  } catch (error) {
    const detail =
      error?.response?.data?.detail ||
      error?.response?.data?.error ||
      error?.message ||
      "ml_predict_failed";
    throw new Error(detail);
  }
}

function scoreToSentimentLabel(score) {
  if (score >= 60) return "positive";
  if (score <= 40) return "negative";
  return "neutral";
}

function toPercent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function formatAgo(inputDate) {
  const date = new Date(inputDate);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildSearchQuery(keyword) {
  return `${keyword} -is:retweet lang:en`;
}

async function fetchTweetsFromX(keyword, maxResults = X_DEFAULT_MAX_RESULTS) {
  const resolvedBearerToken = X_BEARER_TOKEN || (await getAppBearerToken());
  if (!resolvedBearerToken) {
    return { tweets: [], meta: null, source: "fallback", reason: "missing_bearer_token" };
  }

  const requestConfig = {
    params: {
      query: buildSearchQuery(keyword),
      max_results: Math.max(10, Math.min(100, maxResults)),
      expansions: "author_id",
      "tweet.fields": "author_id,created_at,lang,public_metrics,text",
      "user.fields": "id,name,username,profile_image_url,public_metrics,verified",
    },
    headers: {
      Authorization: `Bearer ${resolvedBearerToken}`,
      "User-Agent": "SentixAI/1.0",
    },
    timeout: 12000,
  };

  const baseUrls = [X_API_BASE_URL, X_ALT_API_BASE_URL];
  let lastError = null;

  for (const baseUrl of baseUrls) {
    try {
      const response = await axios.get(`${baseUrl}/tweets/search/recent`, requestConfig);
      const data = response.data || {};
      const usersById = new Map((data.includes?.users || []).map((user) => [user.id, user]));
      const tweets = (data.data || []).map((tweet) => {
        const author = usersById.get(tweet.author_id) || {};
        return {
          id: tweet.id,
          text: tweet.text || "",
          createdAt: tweet.created_at,
          lang: tweet.lang || "und",
          publicMetrics: tweet.public_metrics || {},
          author: {
            id: author.id,
            name: author.name || "Unknown",
            username: author.username || "unknown",
            profileImageUrl: author.profile_image_url || "",
            followers: Number(author.public_metrics?.followers_count || 0),
            verified: Boolean(author.verified),
          },
        };
      });

      return { tweets, meta: data.meta || null, source: "x_api", reason: null };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    tweets: [],
    meta: null,
    source: "fallback",
    reason: lastError?.response?.data?.detail || lastError?.message || "x_api_failed",
  };
}

async function fetchTweetCountFromX(keyword) {
  const resolvedBearerToken = X_BEARER_TOKEN || (await getAppBearerToken());
  if (!resolvedBearerToken) return { count: null, source: null };

  const requestConfig = {
    params: {
      query: buildSearchQuery(keyword),
      granularity: "hour",
    },
    headers: {
      Authorization: `Bearer ${resolvedBearerToken}`,
      "User-Agent": "SentixAI/1.0",
    },
    timeout: 12000,
  };

  const baseUrls = [X_API_BASE_URL, X_ALT_API_BASE_URL];
  for (const baseUrl of baseUrls) {
    try {
      const response = await axios.get(`${baseUrl}/tweets/counts/recent`, requestConfig);
      const buckets = response.data?.data || [];
      const total = buckets.reduce((acc, row) => acc + Number(row?.tweet_count || 0), 0);
      return { count: Number.isFinite(total) ? total : null, source: "x_api" };
    } catch (error) {
      // Try next base URL.
    }
  }

  return { count: null, source: null };
}

function buildTimelineFromScores(scores) {
  if (!scores.length) return Array(12).fill(0);
  const buckets = Array.from({ length: 12 }, () => []);
  scores.forEach((item, idx) => {
    buckets[idx % 12].push(item.score);
  });
  return buckets.map((values) => {
    if (!values.length) return 0;
    return Math.round(values.reduce((acc, value) => acc + value, 0) / values.length);
  });
}

function buildTrendFromScores(scores) {
  if (!scores.length) {
    return Array.from({ length: 7 }, (_, idx) => ({
      label: idx === 6 ? "Now" : `${6 - idx}h`,
      volume: 0,
      sentiment: 0,
    }));
  }

  const buckets = Array.from({ length: 7 }, () => []);
  scores.forEach((item, idx) => {
    buckets[idx % 7].push(item);
  });

  return buckets.map((group, idx) => {
    const avgSentiment = group.length
      ? Math.round(group.reduce((acc, item) => acc + item.score, 0) / group.length)
      : 0;
    return {
      label: idx === 6 ? "Now" : `${6 - idx}h`,
      volume: group.length * 22,
      sentiment: avgSentiment,
    };
  });
}

function buildTopicsFromTweets(keyword, scoredTweets) {
  const counts = new Map();
  scoredTweets.forEach((tweet) => {
    const tags = tweet.text.match(/#[A-Za-z0-9_]+/g) || [];
    tags.forEach((tag) => {
      const current = counts.get(tag.toLowerCase()) || { topic: tag, count: 0, positiveHits: 0 };
      current.count += 1;
      if (tweet.score >= 60) current.positiveHits += 1;
      counts.set(tag.toLowerCase(), current);
    });
  });

  const topicItems = Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((item) => ({
      topic: item.topic,
      mentions: `${(item.count / 10).toFixed(1)}K`,
      positive: Math.max(5, Math.min(95, toPercent(item.positiveHits, item.count))),
    }));

  if (topicItems.length) return topicItems;

  const fallback = ["#AI", "#Tech", "#Innovation"];
  return [`#${keyword.replace(/\s+/g, "")}`, ...fallback].slice(0, 4).map((topic, idx) => ({
    topic,
    mentions: `${(idx + 2).toFixed(1)}K`,
    positive: 50 + idx * 8,
  }));
}

function buildNetworkFromTweets(keyword, scoredTweets) {
  const userScores = new Map();
  scoredTweets.forEach((tweet) => {
    const key = tweet.author.username || "unknown";
    const current = userScores.get(key) || {
      username: tweet.author.username || "unknown",
      name: tweet.author.name || "Unknown",
      followers: tweet.author.followers || 0,
      sentimentHits: [],
    };
    current.sentimentHits.push(tweet.score);
    current.followers = Math.max(current.followers, tweet.author.followers || 0);
    userScores.set(key, current);
  });

  const topUsers = Array.from(userScores.values())
    .sort((a, b) => b.followers - a.followers)
    .slice(0, 4);

  const nodes = [
    { id: "core", label: keyword, sentiment: "neutral", x: 50, y: 50, influence: 99 },
    ...topUsers.map((user, idx) => {
      const avg = Math.round(user.sentimentHits.reduce((acc, value) => acc + value, 0) / user.sentimentHits.length);
      const positions = [
        { x: 24, y: 35 },
        { x: 74, y: 35 },
        { x: 30, y: 72 },
        { x: 70, y: 70 },
      ];
      return {
        id: `node-${idx + 1}`,
        label: user.name,
        sentiment: scoreToSentimentLabel(avg),
        x: positions[idx].x,
        y: positions[idx].y,
        influence: Math.min(99, Math.max(40, Math.round(Math.log10(user.followers + 10) * 20))),
      };
    }),
  ];

  const edges = nodes
    .slice(1)
    .map((node) => ({ from: "core", to: node.id }));

  const influencers = topUsers.map((user, idx) => ({
    rank: idx + 1,
    handle: `@${user.username}`,
    reach: `${(user.followers / 1_000_000).toFixed(1)}M`,
    score: Math.min(99, Math.max(45, Math.round(Math.log10(user.followers + 10) * 20))),
  }));

  return { nodes, edges, influencers };
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function buildOverviewCsv(payload) {
  const lines = [];
  const keyword = payload.keyword || "";
  const source = payload.sourceLabel || payload.source || "";
  const updatedAt = payload.updatedAt || "";
  const kpis = payload.dashboard?.kpis || {};
  const distribution = payload.dashboard?.distribution || {};
  const trend = payload.analytics?.trend || [];
  const topics = payload.analytics?.topics || [];
  const mentions = payload.analytics?.mentions || [];
  const tweets = payload.liveFeed?.tweets || [];

  lines.push("Section,Key,Value");
  lines.push([csvEscape("meta"), csvEscape("keyword"), csvEscape(keyword)].join(","));
  lines.push([csvEscape("meta"), csvEscape("source"), csvEscape(source)].join(","));
  lines.push([csvEscape("meta"), csvEscape("updatedAt"), csvEscape(updatedAt)].join(","));
  lines.push([csvEscape("kpi"), csvEscape("totalMentions"), csvEscape(kpis.totalMentions || 0)].join(","));
  lines.push([csvEscape("kpi"), csvEscape("avgSentiment"), csvEscape(kpis.avgSentiment || 0)].join(","));
  lines.push([csvEscape("kpi"), csvEscape("socialReach"), csvEscape(kpis.socialReach || 0)].join(","));
  lines.push([csvEscape("kpi"), csvEscape("engagementRate"), csvEscape(kpis.engagementRate || 0)].join(","));
  lines.push([csvEscape("distribution"), csvEscape("positive"), csvEscape(distribution.positive || 0)].join(","));
  lines.push([csvEscape("distribution"), csvEscape("neutral"), csvEscape(distribution.neutral || 0)].join(","));
  lines.push([csvEscape("distribution"), csvEscape("negative"), csvEscape(distribution.negative || 0)].join(","));

  lines.push("");
  lines.push("TrendLabel,Volume,Sentiment");
  trend.forEach((item) => {
    lines.push([csvEscape(item.label), csvEscape(item.volume), csvEscape(item.sentiment)].join(","));
  });

  lines.push("");
  lines.push("Topic,Mentions,PositivePercent");
  topics.forEach((item) => {
    lines.push([csvEscape(item.topic), csvEscape(item.mentions), csvEscape(item.positive)].join(","));
  });

  lines.push("");
  lines.push("MentionName,Handle,Sentiment,Reach,Text");
  mentions.forEach((item) => {
    lines.push(
      [
        csvEscape(item.name),
        csvEscape(item.handle),
        csvEscape(item.sentiment),
        csvEscape(item.reach),
        csvEscape(item.text),
      ].join(",")
    );
  });

  lines.push("");
  lines.push("TweetUser,Handle,Sentiment,Time,Replies,Retweets,Likes,Content");
  tweets.forEach((item) => {
    lines.push(
      [
        csvEscape(item.username),
        csvEscape(item.handle),
        csvEscape(item.sentiment),
        csvEscape(item.time),
        csvEscape(item.stats?.replies || 0),
        csvEscape(item.stats?.retweets || 0),
        csvEscape(item.stats?.likes || 0),
        csvEscape(item.content),
      ].join(",")
    );
  });

  return `${lines.join("\n")}\n`;
}

async function buildOverview(keyword) {
  const safeKeyword = toKeyword(keyword);
  const now = new Date();
  const minuteBucket = currentMinuteBucket();

  const xResult = await fetchTweetsFromX(safeKeyword);
  const xCountResult = await fetchTweetCountFromX(safeKeyword);
  const datasetResult = xResult.tweets.length ? null : await fetchTweetsFromDataset(safeKeyword);
  const sourceResult = xResult.tweets.length ? xResult : datasetResult;
  if (!sourceResult) {
    throw new Error(datasetResult?.reason || xResult.reason || "no_live_or_dataset_data");
  }
  const rawTweets = sourceResult.tweets;

  const scores = await Promise.all(
    rawTweets.map(async (tweet) => ({
      ...tweet,
      score: await scoreText(tweet.text),
    }))
  );

  const total = scores.length;
  const positiveCount = scores.filter((tweet) => tweet.score >= 60).length;
  const negativeCount = scores.filter((tweet) => tweet.score <= 40).length;
  const neutralCount = total - positiveCount - negativeCount;

  const positive = total ? toPercent(positiveCount, total) : 0;
  const negative = total ? toPercent(negativeCount, total) : 0;
  const neutral = total ? Math.max(0, 100 - positive - negative) : 0;

  const baseTotalMentions =
    Number.isFinite(xCountResult.count)
      ? Number(xCountResult.count)
      : sourceResult.source === "x_api"
      ? Number(sourceResult.meta?.result_count || scores.length)
      : sourceResult.source === "csv_dataset"
        ? Number(sourceResult.meta?.keyword_match_count || 0)
        : scores.length;
  const avgSentiment = total
    ? Math.round(scores.reduce((acc, tweet) => acc + tweet.score, 0) / total)
    : 0;

  const totalFollowers = scores.reduce((acc, tweet) => acc + (tweet.author.followers || 0), 0);
  const socialReach =
    sourceResult.source === "x_api"
      ? Math.max(totalFollowers, baseTotalMentions * 500)
      : totalFollowers;

  const totalEngagement = scores.reduce((acc, tweet) => {
    const metrics = tweet.publicMetrics || {};
    return (
      acc +
      Number(metrics.reply_count || 0) +
      Number(metrics.retweet_count || 0) +
      Number(metrics.like_count || 0) +
      Number(metrics.quote_count || 0)
    );
  }, 0);
  const baseEngagementRate = socialReach
    ? Number(((totalEngagement / socialReach) * 100).toFixed(1))
    : 0;

  const hasRealXCount = Number.isFinite(xCountResult.count);
  const isCsvInflatedMode =
    sourceResult.source === "csv_dataset" && !hasRealXCount && CSV_KPI_MODE === "inflated";

  // Controlled minute-by-minute drift so same keyword feels like a live stream.
  const mentionsDrift = driftUnit(safeKeyword, minuteBucket, "mentions");
  const sentimentDrift = driftUnit(safeKeyword, minuteBucket, "sentiment");
  const reachDrift = driftUnit(safeKeyword, minuteBucket, "reach");
  const engagementDrift = driftUnit(safeKeyword, minuteBucket, "engagement");

  let totalMentions =
    sourceResult.source === "csv_dataset"
      ? baseTotalMentions
      : Math.round(applyDrift(baseTotalMentions, mentionsDrift, 0.18, 100, 2_500_000));
  let driftedSentiment =
    sourceResult.source === "csv_dataset"
      ? avgSentiment
      : Math.round(applyDrift(avgSentiment, sentimentDrift, 0.08, 1, 99));
  let driftedReach =
    sourceResult.source === "csv_dataset"
      ? socialReach
      : Math.round(applyDrift(socialReach, reachDrift, 0.14, 10_000, 75_000_000));
  let engagementRate =
    sourceResult.source === "csv_dataset"
      ? baseEngagementRate
      : Number(applyDrift(baseEngagementRate, engagementDrift, 0.2, 0.1, 95).toFixed(1));

  if (isCsvInflatedMode) {
    const sampleSize = Math.max(1, Number(datasetStatus.sampleCount || datasetRows.length || 1));
    const datasetSeen = Math.max(sampleSize, Number(datasetStatus.totalRowsSeen || sampleSize));
    const sampledMatchCount = Math.max(0, Number(baseTotalMentions || 0));
    const rateEstimate = Math.round((sampledMatchCount / sampleSize) * datasetSeen);
    const keywordPopularityFloor = valueInRange(hashString(`${safeKeyword}:popularity`), 800, 45000);
    const sparseQueryFloor = valueInRange(hashString(`${safeKeyword}:sparse`), 250, 12000);

    totalMentions = sampledMatchCount > 0
      ? clamp(Math.max(sampledMatchCount * 140, rateEstimate, keywordPopularityFloor), 100, 2_500_000)
      : clamp(sparseQueryFloor, 100, 200000);

    const reachMultiplier = valueInRange(hashString(`${safeKeyword}:reach-mult`), 180, 1100);
    driftedReach = clamp(totalMentions * reachMultiplier, 50_000, 75_000_000);

    if (!Number.isFinite(driftedSentiment) || driftedSentiment <= 0) {
      driftedSentiment = clamp(48 + Math.round(driftUnit(safeKeyword, minuteBucket, "fallback-sent") * 18), 12, 88);
    }
    if (!Number.isFinite(engagementRate) || engagementRate <= 0) {
      engagementRate = Number(clamp(0.2 + Math.abs(driftUnit(safeKeyword, minuteBucket, "fallback-eng")) * 2.8, 0.1, 8.5).toFixed(1));
    }
  }

  const timeline = buildTimelineFromScores(scores);
  let driftedTimeline = timeline.map((point, idx) => {
    const delta = Math.round(driftUnit(safeKeyword, minuteBucket, `timeline-${idx}`) * 8);
    return clamp(point + delta, 1, 99);
  });
  const trend = buildTrendFromScores(scores);
  let driftedTrend = trend.map((item, idx) => ({
    ...item,
    volume: Math.max(
      0,
      Math.round(
        applyDrift(item.volume, driftUnit(safeKeyword, minuteBucket, `trend-v-${idx}`), 0.15, 0, 10000)
      )
    ),
    sentiment: Math.round(
      applyDrift(item.sentiment, driftUnit(safeKeyword, minuteBucket, `trend-s-${idx}`), 0.1, 0, 100)
    ),
  }));

  if (isCsvInflatedMode && !scores.length) {
    driftedTimeline = Array.from({ length: 12 }, (_, idx) =>
      clamp(
        Math.round(driftedSentiment + driftUnit(safeKeyword, minuteBucket, `timeline-empty-${idx}`) * 10),
        5,
        95
      )
    );
    const baseVol = Math.max(80, Math.round(totalMentions / 18));
    driftedTrend = Array.from({ length: 7 }, (_, idx) => ({
      label: idx === 6 ? "Now" : `${6 - idx}h`,
      volume: Math.max(
        0,
        Math.round(applyDrift(baseVol, driftUnit(safeKeyword, minuteBucket, `trend-empty-v-${idx}`), 0.2, 0, 120000))
      ),
      sentiment: clamp(
        Math.round(driftedSentiment + driftUnit(safeKeyword, minuteBucket, `trend-empty-s-${idx}`) * 7),
        0,
        100
      ),
    }));
  }
  const topics = buildTopicsFromTweets(safeKeyword, scores);

  const mentionCandidates = [...scores]
    .sort((a, b) => {
      const scoreA = Number(a.author.followers || 0) + Number(a.publicMetrics.like_count || 0);
      const scoreB = Number(b.author.followers || 0) + Number(b.publicMetrics.like_count || 0);
      return scoreB - scoreA;
    })
    .slice(0, 3);

  const mentions = mentionCandidates.map((tweet) => ({
    name: tweet.author.name,
    handle: tweet.author.username,
    sentiment: scoreToSentimentLabel(tweet.score).toUpperCase(),
    text: tweet.text,
    reach: `${(Number(tweet.author.followers || 0) / 1_000_000).toFixed(1)}M`,
  }));

  const network = buildNetworkFromTweets(safeKeyword, scores);
  const minuteSeed = Math.floor(now.getTime() / 60_000);

  const tweets = scores.slice(0, 12).map((tweet) => ({
    id: tweet.id,
    avatar:
      tweet.author.profileImageUrl ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(tweet.author.name || "User")}&background=1e293b&color=fff`,
    username: tweet.author.name || "Unknown",
    handle: tweet.author.username || "unknown",
    content: tweet.text,
    sentiment: scoreToSentimentLabel(tweet.score),
    time: formatAgo(tweet.createdAt),
    stats: {
      replies: Number(tweet.publicMetrics.reply_count || 0),
      retweets: Number(tweet.publicMetrics.retweet_count || 0),
      likes: Number(tweet.publicMetrics.like_count || 0),
    },
  }));

  const velocity = Math.max(
    1,
    Math.round(scores.length / 3 + valueInRange(hashString(`${safeKeyword}:${minuteSeed}`), 1, 5))
  );
  const sourceLatencyMs =
    sourceResult.source === "x_api"
      ? valueInRange(hashString(safeKeyword), 35, 140)
      : sourceResult.source === "csv_dataset"
        ? valueInRange(hashString(`${safeKeyword}:csv`), 15, 45)
        : 45;

  return {
    keyword: safeKeyword,
    updatedAt: now.toISOString(),
    source: sourceResult.source,
    sourceLabel: sourceResult.source === "x_api"
      ? "X API"
      : Number.isFinite(xCountResult.count)
        ? "Estimated (CSV) + X KPI Count"
        : "Estimated (CSV)",
    sourceReason: sourceResult.reason,
    dashboard: {
      kpis: {
        totalMentions,
        avgSentiment: driftedSentiment,
        socialReach: driftedReach,
        engagementRate,
        changes: {
          totalMentions: `${valueInRange(hashString(safeKeyword), 1, 12)}.0%`,
          avgSentiment: `${valueInRange(hashString(`${safeKeyword}-s`), 1, 9)}.0%`,
          socialReach: `${valueInRange(hashString(`${safeKeyword}-r`), 1, 11)}.0%`,
          engagementRate: `${valueInRange(hashString(`${safeKeyword}-e`), -3, 5)}.0%`,
        },
      },
      distribution: { positive, neutral, negative },
      emotions: [
        { name: "Joy", value: Math.min(95, positive + 8) },
        { name: "Surprise", value: Math.max(5, Math.round((neutral + positive) / 2)) },
        { name: "Anger", value: Math.min(92, negative + 6) },
        { name: "Fear", value: Math.max(4, Math.round(negative / 2)) },
      ],
      timeline: sourceResult.source === "csv_dataset" ? timeline : driftedTimeline,
    },
    analytics: { trend: sourceResult.source === "csv_dataset" ? trend : driftedTrend, topics, mentions },
    network,
    liveFeed: {
      tweets,
      stats: {
        velocity,
        latencyMs: sourceLatencyMs,
      },
      filters: [
        `Keyword: ${safeKeyword}`,
        "Lang: EN",
        sourceResult.source === "x_api"
          ? "Source: X API"
          : Number.isFinite(xCountResult.count)
            ? "Source: Estimated (CSV) + X KPI Count"
            : "Source: Estimated (CSV)",
      ],
    },
  };
}

app.get("/api/health", async (req, res) => {
  let mlStatus = { status: "degraded", detail: "unreachable" };
  try {
    const response = await axios.get(`${ML_API_URL}/health`, { timeout: 3000 });
    mlStatus = response.data;
  } catch (error) {
    mlStatus = { status: "degraded", detail: "unreachable" };
  }

  res.json({
    status: mlStatus.status === "ok" ? "ok" : "degraded",
    ml: mlStatus,
    twitter: {
      configured: Boolean(X_BEARER_TOKEN || (X_CONSUMER_KEY && X_CONSUMER_KEY_SECRET)),
      baseUrl: X_API_BASE_URL,
      authMode: X_BEARER_TOKEN ? "bearer_token" : X_CONSUMER_KEY && X_CONSUMER_KEY_SECRET ? "consumer_key_secret" : "none",
    },
    dataset: datasetStatus,
    serverTime: new Date().toISOString(),
  });
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { text } = req.body;
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Text must be a non-empty string." });
    }

    const trimmed = text.trim();
    const response = await axios.post(
      `${ML_API_URL}/predict`,
      { text: trimmed },
      { timeout: 10000 }
    );
    return res.json(response.data);
  } catch (error) {
    const detail =
      error?.response?.data?.detail ||
      error?.response?.data?.error ||
      error?.message ||
      "Unable to analyze text.";
    console.error("Analyze error:", detail);
    res.status(503).json({ error: "ML service unavailable", detail });
  }
});

app.get("/api/overview", async (req, res) => {
  try {
    const keyword = toKeyword(req.query.keyword);
    const data = await buildOverview(keyword);
    res.json(data);
  } catch (error) {
    const detail =
      error?.response?.data?.detail ||
      error?.response?.data?.error ||
      error?.message ||
      "Unable to generate overview data.";
    console.error("Overview error:", detail);
    res.status(503).json({ error: "Unable to generate overview data.", detail });
  }
});

app.get("/api/export", async (req, res) => {
  try {
    const keyword = toKeyword(req.query.keyword);
    const format = String(req.query.format || "csv").toLowerCase();
    const payload = await buildOverview(keyword);
    const safeKeyword = safeKeywordSlug(keyword);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (format === "pdf") {
      return res.status(400).json({ error: "PDF export is disabled. Use Excel export." });
    }

    if (format === "excel" || format === "xlsx") {
      const excelBuffer = await createExcelReportBuffer(payload);
      const filename = `sentiment_report_${safeKeyword}_${stamp}.xlsx`;
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.status(200).send(Buffer.from(excelBuffer));
    }

    if (format === "json") {
      const filename = `sentiment_export_${safeKeyword}_${stamp}.json`;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.status(200).send(JSON.stringify(payload, null, 2));
    }

    if (format === "html") {
      const filename = `sentiment_report_${safeKeyword}_${stamp}.html`;
      const kpis = payload.dashboard?.kpis || {};
      const dist = payload.dashboard?.distribution || {};
      const topics = payload.analytics?.topics || [];
      const mentions = payload.analytics?.mentions || [];
      const topTopics = topics
        .slice(0, 5)
        .map((t) => `<li><b>${t.topic}</b> - ${t.mentions} mentions (${t.positive}% positive)</li>`)
        .join("");
      const topMentions = mentions
        .slice(0, 5)
        .map((m) => `<li><b>${m.name}</b> (@${m.handle}) - ${m.sentiment} - ${m.text}</li>`)
        .join("");

      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SentixAI Report - ${keyword}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 24px; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .logo-badge { width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; font-size:20px; box-shadow: 0 0 18px rgba(59,130,246,0.4); }
    .title { font-size: 28px; font-weight: 700; }
    .sub { color: #94a3b8; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin: 18px 0; }
    .card { background: rgba(30,41,59,.55); border: 1px solid rgba(148,163,184,.2); border-radius: 12px; padding: 12px; }
    .label { color: #94a3b8; font-size: 12px; margin-bottom: 6px; }
    .value { font-size: 26px; font-weight: 700; color: #fff; }
    .section { background: rgba(30,41,59,.4); border: 1px solid rgba(148,163,184,.2); border-radius: 12px; padding: 14px; margin-top: 14px; }
    h3 { margin: 0 0 8px 0; font-size: 18px; }
    ul { margin: 0; padding-left: 18px; line-height: 1.7; }
    .muted { color: #94a3b8; font-size: 13px; margin-top: 10px; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr 1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="logo-badge">S</div>
      <div>
        <div class="title">SentixAI Analytics Report</div>
        <div class="sub">Keyword: ${payload.keyword} | Source: ${payload.sourceLabel || payload.source} | Updated: ${payload.updatedAt}</div>
      </div>
    </div>

    <div class="grid">
      <div class="card"><div class="label">Total Mentions</div><div class="value">${Number(kpis.totalMentions || 0).toLocaleString()}</div></div>
      <div class="card"><div class="label">Avg Sentiment</div><div class="value">${kpis.avgSentiment || 0}/100</div></div>
      <div class="card"><div class="label">Social Reach</div><div class="value">${Number(kpis.socialReach || 0).toLocaleString()}</div></div>
      <div class="card"><div class="label">Engagement Rate</div><div class="value">${kpis.engagementRate || 0}%</div></div>
    </div>

    <div class="section">
      <h3>Sentiment Distribution</h3>
      <ul>
        <li>Positive: ${dist.positive || 0}%</li>
        <li>Neutral: ${dist.neutral || 0}%</li>
        <li>Negative: ${dist.negative || 0}%</li>
      </ul>
    </div>

    <div class="section">
      <h3>Top Topics</h3>
      <ul>${topTopics || "<li>No topic data available.</li>"}</ul>
    </div>

    <div class="section">
      <h3>Influential Mentions</h3>
      <ul>${topMentions || "<li>No mention data available.</li>"}</ul>
    </div>
    <div class="muted">Generated by SentixAI export system.</div>
  </div>
</body>
</html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.status(200).send(html);
    }

    const csvBody = buildOverviewCsv(payload);
    const filename = `sentiment_export_${safeKeyword}_${stamp}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csvBody);
  } catch (error) {
    const detail =
      error?.response?.data?.detail ||
      error?.response?.data?.error ||
      error?.message ||
      "Unable to export analytics data.";
    console.error("Export error:", detail);
    return res.status(503).json({ error: "Unable to export analytics data.", detail });
  }
});

app.post("/analyze", (req, res, next) => {
  req.url = "/api/analyze";
  next();
});

app.get("/", (req, res) => {
  res.send("Welcome to the Node.js backend for sentiment analysis!");
});

app.listen(PORT, () => {
  console.log(`Node backend running at http://localhost:${PORT}`);
});
