import React from 'react';
import ChartCard from '../components/ChartCard';
import { Download, Sliders } from 'lucide-react';
import { useSentiment } from '../context/SentimentContext';

const Analytics = () => {
    const { data, keyword } = useSentiment();
    const { trend = [], topics = [], mentions = [] } = data.analytics || {};
    const [range, setRange] = React.useState('7d');
    const [filterOpen, setFilterOpen] = React.useState(false);
    const [sentimentFilter, setSentimentFilter] = React.useState('ALL');

    const exportAnalytics = async (format = 'xlsx') => {
        try {
            const response = await fetch(`https://sentixai-backend.onrender.com/api/export?keyword=${encodeURIComponent(keyword)}&format=${encodeURIComponent(format)}`);
            if (!response.ok) {
                throw new Error('Export failed');
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            const contentType = response.headers.get('content-type') || '';
            const extension = contentType.includes('spreadsheetml') ? 'xlsx'
                    : contentType.includes('json') ? 'json'
                        : contentType.includes('html') ? 'html' : 'csv';
            link.href = url;
            link.download = `sentiment_export_${keyword.replace(/[^a-zA-Z0-9_-]+/g, '_')}.${extension}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            // Keep UI unchanged; lightweight browser alert for export failure.
            // eslint-disable-next-line no-alert
            alert('Unable to export analytics right now.');
        }
    };

    const rangeTrend = React.useMemo(() => {
        if (range === '7d') return trend;
        if (!trend.length) return trend;
        const extended = [];
        const target = 30;
        for (let i = 0; i < target; i += 1) {
            const idx = Math.floor((i / Math.max(target - 1, 1)) * Math.max(trend.length - 1, 0));
            const item = trend[idx] || trend[trend.length - 1];
            extended.push({
                ...item,
                label: `D${i + 1}`,
                volume: Math.round(item.volume * (0.82 + (i % 5) * 0.05)),
            });
        }
        return extended;
    }, [range, trend]);

    const filteredMentions = React.useMemo(() => {
        if (sentimentFilter === 'ALL') return mentions;
        return mentions.filter((m) => String(m.sentiment || '').toUpperCase() === sentimentFilter);
    }, [mentions, sentimentFilter]);

    const filteredTopics = React.useMemo(() => {
        if (sentimentFilter === 'ALL') return topics;
        if (sentimentFilter === 'POSITIVE') return topics.filter((t) => Number(t.positive || 0) >= 50);
        if (sentimentFilter === 'NEGATIVE') return topics.filter((t) => Number(t.positive || 0) < 50);
        return topics;
    }, [topics, sentimentFilter]);

    const linePath = rangeTrend
        .map((point, index) => {
            const x = (index / Math.max(rangeTrend.length - 1, 1)) * 100;
            const y = 100 - Math.min(95, Math.max(5, point.sentiment));
            return `${index === 0 ? 'M' : 'L'}${x},${y}`;
        })
        .join(' ');

    const volumePath = rangeTrend
        .map((point, index) => {
            const x = (index / Math.max(rangeTrend.length - 1, 1)) * 100;
            const y = 100 - Math.min(95, Math.max(5, point.volume / 2));
            return `${index === 0 ? 'M' : 'L'}${x},${y}`;
        })
        .join(' ');

    const activePoint = rangeTrend[rangeTrend.length - 1];

    return (
        <div className="p-4 md:p-6 lg:p-10 space-y-8 animate-fade-in">
            {/* Filters Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/40 p-4 rounded-2xl border border-white/5 backdrop-blur-md">
                <h1 className="text-2xl font-display font-bold text-white">Analytics Deep Dive: {keyword}</h1>
                <div className="relative flex flex-wrap gap-3 w-full md:w-auto">
                    <button
                        onClick={() => setFilterOpen((v) => !v)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors border border-white/5"
                    >
                        <Sliders className="w-4 h-4" /> Filters
                    </button>
                    {filterOpen && (
                        <div className="absolute mt-12 z-20 bg-slate-900 border border-white/10 rounded-lg p-2 flex gap-2">
                            {['ALL', 'POSITIVE', 'NEGATIVE', 'NEUTRAL'].map((item) => (
                                <button
                                    key={item}
                                    onClick={() => {
                                        setSentimentFilter(item);
                                        setFilterOpen(false);
                                    }}
                                    className={`px-3 py-1 rounded text-xs border ${
                                        sentimentFilter === item
                                            ? 'bg-primary-600/20 text-white border-primary-500/30'
                                            : 'bg-slate-800 text-slate-300 border-white/10'
                                    }`}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="flex bg-slate-800 rounded-lg p-1 border border-white/5">
                        <button
                            onClick={() => setRange('7d')}
                            className={`px-3 py-1 rounded text-xs shadow font-medium ${range === '7d' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            Last 7 Days
                        </button>
                        <button
                            onClick={() => setRange('30d')}
                            className={`px-3 py-1 rounded text-xs ${range === '30d' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            30 Days
                        </button>
                    </div>
                    <button
                        onClick={() => exportAnalytics('xlsx')}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold shadow-lg shadow-primary-500/25 transition-all"
                    >
                        <Download className="w-4 h-4" /> Download Excel
                    </button>
                </div>
            </div>

            {/* Large Trend Chart */}
            <ChartCard title="Volume vs Sentiment Trend" className="min-h-[320px] md:min-h-[400px]">
                <div className="relative w-full h-full flex items-end">
                    <svg className="w-full h-[220px] md:h-[300px] overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                        <defs>
                            <linearGradient id="grid-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="rgba(59, 130, 246, 0.2)" />
                                <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
                            </linearGradient>
                        </defs>
                        <path d={`${volumePath} L100,100 L0,100 Z`} fill="url(#grid-grad)" stroke="none" />
                        <path d={volumePath} fill="none" stroke="#3b82f6" strokeWidth="0.8" className="animate-dash" strokeDasharray="100" />
                        <path d={linePath} fill="none" stroke="#22d3ee" strokeWidth="0.7" strokeDasharray="2 2" />
                    </svg>

                    {activePoint && (
                        <div className="absolute top-4 right-4 md:top-6 md:right-6 text-[11px] md:text-xs text-slate-300 bg-slate-900/60 border border-white/10 rounded-lg px-2.5 md:px-3 py-2">
                            <div>Now Volume: <span className="text-primary-300">{activePoint.volume}</span></div>
                            <div>Now Sentiment: <span className="text-cyan-300">{activePoint.sentiment}</span></div>
                        </div>
                    )}
                </div>
            </ChartCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Topic Analysis" className="min-h-[300px]">
                    <div className="space-y-4">
                        {filteredTopics.map((item, i) => (
                            <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-800/50 transition-colors border border-transparent hover:border-white/5 cursor-pointer group">
                                <div className="flex flex-col">
                                    <span className="text-white font-medium group-hover:text-primary-400 transition-colors">{item.topic}</span>
                                    <span className="text-xs text-slate-500">{item.mentions} mentions</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`text-sm font-bold ${item.positive > 50 ? 'text-emerald-400' : 'text-rose-400'}`}>{item.positive}% Pos</span>
                                    <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                                        <div className={`h-full ${item.positive > 50 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${item.positive}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ChartCard>

                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white px-2">Influential Mentions</h3>
                    {filteredMentions.map((mention, idx) => (
                        <div key={idx} className="glass-card p-4 flex gap-4 items-start">
                            <img
                                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(mention.name)}&background=3b82f6&color=fff`}
                                alt=""
                                className="w-10 h-10 rounded-full"
                            />
                            <div>
                                <div className="flex justify-between w-full gap-4">
                                    <h4 className="text-sm font-bold text-white">{mention.name}</h4>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${mention.sentiment === 'POSITIVE' ? 'text-emerald-400 bg-emerald-500/10' : mention.sentiment === 'NEGATIVE' ? 'text-rose-400 bg-rose-500/10' : 'text-slate-300 bg-slate-600/30'}`}>
                                        {mention.sentiment}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-400 mt-1">
                                    {mention.text}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Analytics;
