import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const SentimentContext = createContext(null);
const DEFAULT_KEYWORD = "technology";

function readKeywordFromLocation() {
  if (typeof window === "undefined") return DEFAULT_KEYWORD;
  const raw = new URLSearchParams(window.location.search).get("keyword");
  const value = typeof raw === "string" ? raw.trim() : "";
  return value || DEFAULT_KEYWORD;
}

const initialData = {
  keyword: DEFAULT_KEYWORD,
  updatedAt: null,
  dashboard: {
    kpis: {
      totalMentions: 0,
      avgSentiment: 0,
      socialReach: 0,
      engagementRate: 0,
      changes: {
        totalMentions: "0.0%",
        avgSentiment: "0.0%",
        socialReach: "0.0%",
        engagementRate: "0.0%",
      },
    },
    distribution: { positive: 0, neutral: 0, negative: 0 },
    emotions: [],
    timeline: [],
  },
  analytics: {
    trend: [],
    topics: [],
    mentions: [],
  },
  network: {
    nodes: [],
    edges: [],
    influencers: [],
  },
  liveFeed: {
    tweets: [],
    stats: { velocity: 0, latencyMs: 0 },
    filters: [],
  },
};

export const SentimentProvider = ({ children }) => {
  const [keyword, setKeyword] = useState(() => readKeywordFromLocation());
  const [data, setData] = useState(initialData);
  const [analysis, setAnalysis] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState({ status: "checking" });

  const fetchOverview = useCallback(async (nextKeyword = keyword, { silent = false } = {}) => {
    if (!silent) setLoadingOverview(true);
    setError("");

    try {
      const response = await fetch(`/api/overview?keyword=${encodeURIComponent(nextKeyword)}`);
      if (!response.ok) {
        throw new Error("Overview API unavailable");
      }
      const payload = await response.json();
      setData(payload);
    } catch (err) {
      setError(err.message || "Unable to load live data");
    } finally {
      if (!silent) setLoadingOverview(false);
    }
  }, [keyword]);

  const refreshHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/health");
      const payload = await response.json();
      setHealth(payload);
    } catch {
      setHealth({ status: "degraded", ml: "unreachable" });
    }
  }, []);

  const runSearch = useCallback(async (text) => {
    const nextKeyword = (text || "").trim();
    if (!nextKeyword) return;

    setSearching(true);
    setError("");
    setKeyword(nextKeyword);

    try {
      const analyzeResponse = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nextKeyword }),
      });

      if (!analyzeResponse.ok) {
        const payload = await analyzeResponse.json().catch(() => ({}));
        throw new Error(payload.error || "Sentiment analysis failed");
      }

      const analysisData = await analyzeResponse.json();
      setAnalysis(analysisData);
      await fetchOverview(nextKeyword, { silent: true });
      await refreshHealth();
    } catch (err) {
      setError(err.message || "Unable to search keyword");
    } finally {
      setSearching(false);
    }
  }, [fetchOverview, refreshHealth]);

  useEffect(() => {
    fetchOverview(keyword);
    refreshHealth();
  }, [fetchOverview, keyword, refreshHealth]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchOverview(keyword, { silent: true });
      refreshHealth();
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchOverview, keyword, refreshHealth]);

  const contextValue = useMemo(
    () => ({
      keyword,
      setKeyword,
      data,
      analysis,
      loadingOverview,
      searching,
      error,
      health,
      runSearch,
      refreshOverview: fetchOverview,
    }),
    [analysis, data, error, fetchOverview, health, keyword, loadingOverview, runSearch, searching]
  );

  return <SentimentContext.Provider value={contextValue}>{children}</SentimentContext.Provider>;
};

export const useSentiment = () => {
  const context = useContext(SentimentContext);
  if (!context) {
    throw new Error("useSentiment must be used within SentimentProvider");
  }
  return context;
};
