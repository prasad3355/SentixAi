import React from "react";
import { MessageCircle, Repeat, Heart, Share2 } from "lucide-react";
import { clsx } from "clsx";

const TweetCard = ({ avatar, username, handle, content, sentiment, time, stats }) => {
  const getSentimentColor = (value) => {
    switch (value) {
      case "positive":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "negative":
        return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      default:
        return "text-slate-400 bg-slate-500/10 border-slate-500/20";
    }
  };

  return (
    <div className="glass-card p-5 mb-4 hover:bg-slate-800/60 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-3">
          <img
            src={avatar}
            alt={username}
            className="w-10 h-10 rounded-full border border-white/10"
          />
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white hover:underline cursor-pointer">
                {username}
              </h4>
              <span className="text-xs text-slate-500">@{handle} | {time}</span>
            </div>
            <div
              className={clsx(
                "inline-flex text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border mt-1",
                getSentimentColor(sentiment)
              )}
            >
              {sentiment}
            </div>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-300 leading-relaxed mb-4 pl-[52px]">{content}</p>

      <div className="flex items-center justify-between pl-[52px] text-slate-500 text-xs">
        <button className="flex items-center gap-1 hover:text-primary-400 transition-colors group">
          <MessageCircle className="w-4 h-4 group-hover:scale-110 transition-transform" />{" "}
          {stats.replies}
        </button>
        <button className="flex items-center gap-1 hover:text-emerald-400 transition-colors group">
          <Repeat className="w-4 h-4 group-hover:scale-110 transition-transform" />{" "}
          {stats.retweets}
        </button>
        <button className="flex items-center gap-1 hover:text-rose-400 transition-colors group">
          <Heart className="w-4 h-4 group-hover:scale-110 transition-transform" /> {stats.likes}
        </button>
        <button className="flex items-center gap-1 hover:text-accent-blue transition-colors group">
          <Share2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
        </button>
      </div>
    </div>
  );
};

export default TweetCard;
