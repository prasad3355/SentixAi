import React, { useMemo, useState } from 'react';
import { Share2, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useSentiment } from '../context/SentimentContext';

const Network = () => {
    const { data, keyword } = useSentiment();
    const { nodes = [], edges = [], influencers = [] } = data.network || {};
    const [sentimentFilter, setSentimentFilter] = useState('all');
    const [hoveredNode, setHoveredNode] = useState(null);

    const nodeById = useMemo(
        () =>
            nodes.reduce((acc, item) => {
                acc[item.id] = item;
                return acc;
            }, {}),
        [nodes]
    );

    const nodeVisual = (sentiment) => {
        if (sentiment === 'positive') return 'bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.85)]';
        if (sentiment === 'negative') return 'bg-rose-500 shadow-[0_0_14px_rgba(244,63,94,0.85)]';
        return 'bg-slate-300 shadow-[0_0_10px_rgba(226,232,240,0.45)]';
    };

    const visibleNodes = useMemo(() => {
        if (sentimentFilter === 'all') return nodes;
        return nodes.filter((node) => node.id === 'core' || node.sentiment === sentimentFilter);
    }, [nodes, sentimentFilter]);

    const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);

    const visibleEdges = useMemo(
        () => edges.filter((edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)),
        [edges, visibleNodeIds]
    );

    const topInfluencerIds = useMemo(() => {
        const top = [...visibleNodes]
            .filter((node) => node.id !== 'core')
            .sort((a, b) => Number(b.influence || 0) - Number(a.influence || 0))
            .slice(0, 2)
            .map((node) => node.id);
        return new Set(top);
    }, [visibleNodes]);

    const visibleInfluencers = useMemo(() => {
        if (sentimentFilter === 'all') return influencers;
        const labels = new Set(
            visibleNodes
                .filter((node) => node.id !== 'core')
                .map((node) => String(node.label || '').toLowerCase())
        );
        return influencers.filter((item) =>
            labels.has(String(item.handle || '').replace('@', '').toLowerCase()) ||
            labels.has(String(item.handle || '').toLowerCase())
        );
    }, [influencers, sentimentFilter, visibleNodes]);

    const sentimentPercent = (sentiment) => {
        const filtered = nodes.filter((node) => node.id !== 'core' && node.sentiment === sentiment).length;
        const total = Math.max(1, nodes.filter((node) => node.id !== 'core').length);
        return Math.round((filtered / total) * 100);
    };

    const tooltipData = useMemo(() => {
        if (!hoveredNode) return null;
        const influence = Number(hoveredNode.influence || 50);
        const followers = Math.max(1500, Math.round(influence * influence * 120));
        const reach = Math.max(8000, Math.round(followers * 3.4));
        const mentions = Math.max(20, Math.round(influence * 1.8));
        return {
            username: hoveredNode.id === 'core' ? keyword : hoveredNode.label,
            sentimentScore: hoveredNode.id === 'core'
                ? Number(data?.dashboard?.kpis?.avgSentiment || 50)
                : hoveredNode.sentiment === 'positive'
                    ? 70 + Math.round(influence / 4)
                    : hoveredNode.sentiment === 'negative'
                        ? 35 - Math.round((100 - influence) / 5)
                        : 50,
            followers,
            reach,
            mentions,
            x: hoveredNode.x,
            y: hoveredNode.y,
        };
    }, [hoveredNode, keyword, data?.dashboard?.kpis?.avgSentiment]);

    const nodeSizePx = (node) => {
        if (node.id === 'core') return 18;
        const influence = Number(node.influence || 50);
        return Math.max(10, Math.min(24, 10 + Math.round((influence / 100) * 14)));
    };

    return (
        <div className="min-h-[calc(100vh-80px)] w-full relative overflow-x-hidden overflow-y-auto bg-slate-950">

            {/* Floating Controls */}
            <div className="absolute top-24 left-3 md:left-6 z-20 flex flex-col gap-2 glass p-2 rounded-xl">
                <button className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><ZoomIn className="w-5 h-5" /></button>
                <button className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><ZoomOut className="w-5 h-5" /></button>
                <button className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><Maximize className="w-5 h-5" /></button>
            </div>

            {/* Sentiment Filters */}
            <div className="absolute top-24 left-20 md:left-24 z-20 glass p-2 rounded-xl flex gap-2">
                {[
                    { id: 'all', label: 'Show All' },
                    { id: 'positive', label: 'Positive' },
                    { id: 'negative', label: 'Negative' },
                    { id: 'neutral', label: 'Neutral' },
                ].map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setSentimentFilter(item.id)}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                            sentimentFilter === item.id
                                ? 'bg-primary-600/25 border-primary-500/40 text-white'
                                : 'bg-slate-800/40 border-white/10 text-slate-300 hover:text-white'
                        }`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            {/* Legend */}
            <div className="absolute bottom-4 left-3 md:bottom-6 md:left-6 z-20 glass p-3 md:p-4 rounded-xl min-w-[180px] md:min-w-[200px] border border-white/15">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3">Map Legend</h4>
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-200">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span> Positive Core
                        <span className="text-xs text-slate-400 ml-auto">{sentimentPercent('positive')}%</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-200">
                        <span className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]"></span> Negative Nexus
                        <span className="text-xs text-slate-400 ml-auto">{sentimentPercent('negative')}%</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-200">
                        <span className="w-2 h-2 rounded-full bg-slate-500 opacity-50"></span> Neutral Node
                        <span className="text-xs text-slate-400 ml-auto">{sentimentPercent('neutral')}%</span>
                    </div>
                </div>
            </div>

            {/* Sidebar Info Panel */}
            <div className="absolute top-24 right-3 md:right-6 bottom-4 md:bottom-6 w-[88vw] max-w-80 glass-card p-0 flex flex-col z-20 overflow-hidden">
                <div className="p-4 border-b border-white/5">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <Share2 className="w-4 h-4 text-primary-500" /> Top Influencers: {keyword}
                    </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {visibleInfluencers.map((item) => (
                        <div key={item.rank} className="flex items-center justify-between group cursor-pointer hover:bg-white/5 p-2 rounded-lg transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold border border-white/10">#{item.rank}</div>
                                <div>
                                    <p className="text-sm font-medium text-white group-hover:text-primary-400">{item.handle}</p>
                                    <p className="text-[10px] text-slate-500">Reach: {item.reach}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-xs font-bold text-emerald-400">{item.score}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Interactive Canvas Area (Mocked visually) */}
            <div data-export-id="network-intelligence-graph" className="absolute inset-0 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
                    {visibleEdges.map((edge, idx) => {
                        const from = nodeById[edge.from];
                        const to = nodeById[edge.to];
                        if (!from || !to) return null;
                        return (
                            <line
                                key={`${edge.from}-${edge.to}-${idx}`}
                                x1={`${from.x}%`}
                                y1={`${from.y}%`}
                                x2={`${to.x}%`}
                                y2={`${to.y}%`}
                                stroke="white"
                                strokeWidth="1.2"
                                strokeDasharray="4 4"
                            >
                                <animate
                                    attributeName="stroke-dashoffset"
                                    from="18"
                                    to="0"
                                    dur={`${2.2 + (idx % 3) * 0.4}s`}
                                    repeatCount="indefinite"
                                />
                            </line>
                        );
                    })}
                </svg>

                {visibleNodes.map((node, idx) => (
                    <div
                        key={node.id}
                        data-export-role="network-node"
                        className={`absolute rounded-full ${nodeVisual(node.sentiment)} ${
                            node.id === 'core' ? 'shadow-[0_0_30px_#3b82f6]' : ''
                        } ${topInfluencerIds.has(node.id) ? 'animate-pulse' : ''}`}
                        style={{
                            top: `${node.y}%`,
                            left: `${node.x}%`,
                            transform: 'translate(-50%, -50%)',
                            animationDelay: `${idx * 0.2}s`,
                            width: `${nodeSizePx(node)}px`,
                            height: `${nodeSizePx(node)}px`,
                        }}
                        onMouseEnter={() => setHoveredNode(node)}
                        onMouseLeave={() => setHoveredNode(null)}
                        title={`${node.label} (${node.influence})`}
                    />
                ))}

                {tooltipData && (
                    <div
                        className="absolute z-30 pointer-events-none bg-slate-900/95 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 shadow-xl"
                        style={{
                            left: `${Math.min(84, tooltipData.x + 2)}%`,
                            top: `${Math.max(8, tooltipData.y - 12)}%`,
                            transform: 'translate(-50%, -100%)',
                            minWidth: '180px',
                        }}
                    >
                        <div className="font-semibold text-white mb-1">{tooltipData.username}</div>
                        <div className="flex justify-between"><span className="text-slate-400">Sentiment</span><span>{tooltipData.sentimentScore}%</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Followers</span><span>{tooltipData.followers.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Reach</span><span>{tooltipData.reach.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Mentions</span><span>{tooltipData.mentions.toLocaleString()}</span></div>
                    </div>
                )}
            </div>

            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_20%,transparent_100%)] pointer-events-none"></div>

        </div>
    );
};

export default Network;
