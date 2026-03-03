import React, { useEffect, useState } from "react";
import { Filter } from "lucide-react";
import TweetCard from "../components/TweetCard";
import { useSentiment } from "../context/SentimentContext";

const LiveFeed = () => {
  const { data, keyword, runSearch, searching, analysis, error } = useSentiment();
  const [searchText, setSearchText] = useState(keyword);

  useEffect(() => {
    setSearchText(keyword);
  }, [keyword]);

  const analyzeText = async () => {
    if (!searchText.trim()) return;
    await runSearch(searchText);
  };

  const feed = data.liveFeed || {};
  const tweets = feed.tweets || [];
  const stats = feed.stats || { velocity: 0, latencyMs: 0 };
  const filters = feed.filters || [];
  const result = analysis?.sentiment || "";

  return (
    <div className="p-4 md:p-6 lg:p-10 container mx-auto max-w-5xl animate-fade-in">
      <div className="mb-8 glass-card p-6">
        <h2 className="text-lg font-bold text-white mb-4">Analyze Keyword: {keyword}</h2>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Enter keyword to analyze..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyzeText()}
            className="w-full flex-1 px-4 py-2 rounded bg-slate-800 text-white outline-none"
          />

          <button
            onClick={analyzeText}
            className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded font-medium sm:min-w-[120px]"
          >
            {searching ? "Analyzing..." : "Analyze"}
          </button>
        </div>

        {result && (
          <div className="mt-4 p-4 rounded bg-slate-800 text-white">
            <span className="font-semibold">Sentiment: </span>
            <span
              className={
                result.toLowerCase().includes("positive")
                  ? "text-green-400"
                  : result.toLowerCase().includes("negative")
                    ? "text-red-400"
                    : "text-yellow-400"
              }
            >
              {result}
            </span>
            {analysis?.confidence && (
              <span className="ml-3 text-sm text-slate-300">
                Confidence: {(analysis.confidence * 100).toFixed(1)}%
              </span>
            )}
          </div>
        )}
        {error && <div className="mt-3 text-sm text-rose-400">{error}</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {tweets.map((tweet) => (
            <TweetCard key={tweet.id} {...tweet} />
          ))}
        </div>

        <div className="space-y-6">
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold text-white mb-4">Feed Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Velocity</span>
                <span className="text-white font-mono">{stats.velocity} tweets/sec</span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-accent-cyan" style={{ width: `${Math.min(100, stats.velocity * 3)}%` }}></div>
              </div>

              <div className="flex justify-between items-center mt-4">
                <span className="text-slate-400 text-sm">Processing Latency</span>
                <span className="text-emerald-400 font-mono">{stats.latencyMs}ms</span>
              </div>
            </div>
          </div>

          <div className="glass-card p-6 border-l-4 border-l-rose-500">
            <h3 className="text-sm font-bold text-rose-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Filter className="w-4 h-4" /> Active Filters
            </h3>
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <span key={filter} className="px-2 py-1 rounded bg-rose-500/10 text-rose-400 text-xs border border-rose-500/20">
                  {filter}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveFeed;
