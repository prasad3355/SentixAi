import React, { useMemo, useRef, useState } from "react";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const buildSmoothPath = (points) => {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const path = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
  }
  return path.join(" ");
};

const SentimentTimelineChart = ({ timeline = [], distribution = {}, totalMentions = 0, updatedAt }) => {
  const chartRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [tooltip, setTooltip] = useState(null);

  const pointsData = useMemo(() => {
    const series = timeline.length ? timeline : Array(12).fill(50);
    const count = series.length;
    const safePositive = Number(distribution.positive || 0);
    const safeNegative = Number(distribution.negative || 0);
    const safeNeutral = clamp(100 - safePositive - safeNegative, 0, 100);
    const total = Math.max(1, Number(totalMentions || 0));
    const end = updatedAt ? new Date(updatedAt) : new Date();
    const bucketMinutes = 5;

    const normalized = series.map((v) => clamp(Number(v || 0), 0, 100));
    const positive = [];
    const neutral = [];
    const negative = [];

    normalized.forEach((value, i) => {
      const drift = (value - 50) / 2.8;
      const pos = clamp(Math.round(safePositive + drift), 2, 96);
      const neg = clamp(Math.round(safeNegative - drift * 0.8), 2, 96);
      const neu = clamp(100 - pos - neg, 2, 96);
      const weight = 0.7 + value / 150;
      const bucketMentions = Math.max(1, Math.round((total / count) * weight));
      const time = new Date(end.getTime() - (count - 1 - i) * bucketMinutes * 60_000);

      positive.push({ pct: pos, count: Math.round((bucketMentions * pos) / 100), time });
      neutral.push({ pct: neu, count: Math.round((bucketMentions * neu) / 100), time });
      negative.push({ pct: neg, count: Math.round((bucketMentions * neg) / 100), time });
    });

    return { positive, neutral, negative, count };
  }, [timeline, distribution, totalMentions, updatedAt]);

  const width = 1000;
  const height = 220;
  const padding = { top: 14, right: 16, bottom: 30, left: 16 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const xAt = (i, n) => padding.left + (i / Math.max(1, n - 1)) * innerWidth;
  const yAt = (value) => padding.top + (1 - value / 100) * innerHeight;

  const makePoints = (arr) => arr.map((item, i) => ({ x: xAt(i, pointsData.count), y: yAt(item.pct), ...item, index: i }));
  const positivePoints = makePoints(pointsData.positive);
  const neutralPoints = makePoints(pointsData.neutral);
  const negativePoints = makePoints(pointsData.negative);

  const positivePath = buildSmoothPath(positivePoints);
  const neutralPath = buildSmoothPath(neutralPoints);
  const negativePath = buildSmoothPath(negativePoints);
  const closeArea = `L ${padding.left + innerWidth} ${padding.top + innerHeight} L ${padding.left} ${padding.top + innerHeight} Z`;

  const onWheel = (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => clamp(Number((z + delta).toFixed(2)), 1, 3));
  };

  const showTooltip = (event, index) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect) return;

    setTooltip({
      index,
      x: event.clientX - rect.left + 8,
      y: event.clientY - rect.top - 8,
    });
  };

  const hideTooltip = () => setTooltip(null);

  const tooltipData = tooltip
    ? {
        p: pointsData.positive[tooltip.index],
        n: pointsData.neutral[tooltip.index],
        ng: pointsData.negative[tooltip.index],
      }
    : null;

  return (
    <div className="w-full h-full min-h-[230px]">
      <div className="mb-3 text-xs text-slate-500">Mouse wheel to zoom, horizontal scroll to navigate</div>
      <div
        ref={chartRef}
        onWheel={onWheel}
        className="relative h-[230px] overflow-x-auto overflow-y-hidden rounded-xl bg-slate-900/20 border border-white/5"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full"
          style={{ width: `${zoom * 100}%`, minWidth: "100%" }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="posArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(16,185,129,0.35)" />
              <stop offset="100%" stopColor="rgba(16,185,129,0.02)" />
            </linearGradient>
            <linearGradient id="neuArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(59,130,246,0.3)" />
              <stop offset="100%" stopColor="rgba(59,130,246,0.02)" />
            </linearGradient>
            <linearGradient id="negArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(244,63,94,0.35)" />
              <stop offset="100%" stopColor="rgba(244,63,94,0.02)" />
            </linearGradient>
          </defs>

          {[20, 40, 60, 80].map((tick) => (
            <line
              key={tick}
              x1={padding.left}
              x2={padding.left + innerWidth}
              y1={yAt(tick)}
              y2={yAt(tick)}
              stroke="rgba(148,163,184,0.14)"
              strokeDasharray="4 4"
            />
          ))}

          <path d={`${positivePath} ${closeArea}`} fill="url(#posArea)" />
          <path d={`${neutralPath} ${closeArea}`} fill="url(#neuArea)" />
          <path d={`${negativePath} ${closeArea}`} fill="url(#negArea)" />

          <path d={positivePath} fill="none" stroke="#10b981" strokeWidth="2.6" strokeLinecap="round" />
          <path d={neutralPath} fill="none" stroke="#3b82f6" strokeWidth="2.6" strokeLinecap="round" />
          <path d={negativePath} fill="none" stroke="#f43f5e" strokeWidth="2.6" strokeLinecap="round" />

          {positivePoints.map((point, i) => (
            <g key={i}>
              <circle
                cx={point.x}
                cy={point.y}
                r="4"
                fill="#10b981"
                onMouseMove={(event) => showTooltip(event, i)}
                onMouseLeave={hideTooltip}
                className="cursor-pointer"
              />
              <circle
                cx={neutralPoints[i].x}
                cy={neutralPoints[i].y}
                r="4"
                fill="#3b82f6"
                onMouseMove={(event) => showTooltip(event, i)}
                onMouseLeave={hideTooltip}
                className="cursor-pointer"
              />
              <circle
                cx={negativePoints[i].x}
                cy={negativePoints[i].y}
                r="4"
                fill="#f43f5e"
                onMouseMove={(event) => showTooltip(event, i)}
                onMouseLeave={hideTooltip}
                className="cursor-pointer"
              />
            </g>
          ))}
        </svg>

        {tooltipData && (
          <div
            className="absolute z-20 pointer-events-none px-3 py-2 rounded-lg text-xs bg-slate-900 border border-white/10 text-slate-200 shadow-lg"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="text-slate-400 mb-1">
              {tooltipData.p.time.toLocaleString([], {
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            <div className="text-emerald-400">Positive: {tooltipData.p.count}</div>
            <div className="text-blue-400">Neutral: {tooltipData.n.count}</div>
            <div className="text-rose-400">Negative: {tooltipData.ng.count}</div>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-5 text-xs">
        <span className="text-emerald-400">Positive</span>
        <span className="text-blue-400">Neutral</span>
        <span className="text-rose-400">Negative</span>
      </div>
    </div>
  );
};

export default SentimentTimelineChart;
