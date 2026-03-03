import React from 'react';
import { Twitter, TrendingUp, Users, Activity } from 'lucide-react';
import StatCard from '../components/StatCard';
import ChartCard from '../components/ChartCard';
import SentimentTimelineChart from '../components/SentimentTimelineChart';
import { useSentiment } from '../context/SentimentContext';

const Dashboard = () => {
    const { data, keyword, loadingOverview, analysis } = useSentiment();
    const { dashboard } = data;
    const kpis = dashboard.kpis || {};
    const rawDistribution = dashboard.distribution || { positive: 0, neutral: 0, negative: 0 };
    const distSum = Number(rawDistribution.positive || 0) + Number(rawDistribution.neutral || 0) + Number(rawDistribution.negative || 0);
    const distribution = distSum === 0
        ? { positive: 0, neutral: 100, negative: 0 }
        : rawDistribution;
    const timeline = dashboard.timeline || [];
    const emotions = dashboard.emotions || [];
    const dominantSentiment = [
        { key: 'Positive', value: distribution.positive || 0, tone: 'text-emerald-400' },
        { key: 'Neutral', value: distribution.neutral || 0, tone: 'text-primary-400' },
        { key: 'Negative', value: distribution.negative || 0, tone: 'text-rose-400' },
    ].sort((a, b) => b.value - a.value)[0];

    const donutStyle = {
        background: `conic-gradient(#10b981 0% ${distribution.positive}%, #3b82f6 ${distribution.positive}% ${distribution.positive + distribution.neutral}%, #f43f5e ${distribution.positive + distribution.neutral}% 100%)`
    };

    const socialReachLabel = `${(Number(kpis.socialReach || 0) / 1_000_000).toFixed(1)}M`;
    const sentimentLabel = `${Math.round(kpis.avgSentiment || 0)}/100`;
    const totalMentions = Number(kpis.totalMentions || 0).toLocaleString();

    return (
        <div className="p-6 lg:p-10 space-y-8 animate-fade-in">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                    <h1 className="text-3xl font-display font-bold text-white mb-2">Sentiment Overview</h1>
                    <p className="text-slate-400">Real-time analysis for <span className="text-primary-400">{keyword}</span>.</p>
                </div>
                <div className="flex gap-3">
                    <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20 animate-pulse-slow">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        {loadingOverview ? 'SYNCING' : 'SYSTEM ACTIVE'}
                    </span>
                    {analysis?.sentiment && (
                        <span
                            className={`px-4 py-1.5 rounded-full text-sm font-bold border ${
                                analysis.sentiment.toLowerCase().includes('negative')
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                    : analysis.sentiment.toLowerCase().includes('positive')
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                        : 'bg-primary-500/10 text-primary-300 border-primary-500/20'
                            }`}
                        >
                            {analysis.sentiment}
                        </span>
                    )}
                </div>
            </div>

            {/* KPI Cards */}
            <div data-export-id="sentiment-overview-cards" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Mentions"
                    value={totalMentions}
                    change={kpis.changes?.totalMentions}
                    isPositive={true}
                    icon={Twitter}
                    delay={100}
                />
                <StatCard
                    title="Avg Sentiment"
                    value={sentimentLabel}
                    change={kpis.changes?.avgSentiment}
                    isPositive={true}
                    icon={Activity}
                    delay={200}
                />
                <StatCard
                    title="Social Reach"
                    value={socialReachLabel}
                    change={kpis.changes?.socialReach}
                    isPositive={true}
                    icon={Users}
                    delay={300}
                />
                <StatCard
                    title="Engagement Rate"
                    value={`${Number(kpis.engagementRate || 0).toFixed(1)}%`}
                    change={kpis.changes?.engagementRate}
                    isPositive={!String(kpis.changes?.engagementRate || '').startsWith('-')}
                    icon={TrendingUp}
                    delay={400}
                />
            </div>

            {/* Main Charts Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sentiment Distribution */}
                <div data-export-id="sentiment-distribution-chart">
                    <ChartCard title="Sentiment Distribution" className="lg:col-span-1 min-h-[350px]">
                        <div className="h-full flex flex-col justify-between pt-2 pb-3">
                            <div className="flex-1 flex items-center justify-center px-6">
                                <div className="relative w-48 h-48 rounded-full p-4 flex items-center justify-center" style={donutStyle}>
                                    <div className="absolute inset-4 rounded-full bg-slate-900/92" />
                                    <div className="relative z-10 text-center">
                                        <span className={`block text-[2.05rem] leading-none font-extrabold drop-shadow-[0_0_10px_rgba(15,23,42,0.85)] ${dominantSentiment.tone}`}>{dominantSentiment.value}%</span>
                                        <span className="mt-1 block text-sm font-medium text-slate-200">{dominantSentiment.key}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="pt-3 px-2">
                                <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
                                    <div className="flex items-center gap-2 text-slate-300">
                                        <span className="w-3 h-3 rounded-full bg-emerald-500" /> Positive {distribution.positive}%
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-300">
                                        <span className="w-3 h-3 rounded-full bg-primary-500" /> Neutral {distribution.neutral}%
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-300">
                                        <span className="w-3 h-3 rounded-full bg-rose-500" /> Negative {distribution.negative}%
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ChartCard>
                </div>

                {/* Emotional Intensity */}
                <div data-export-id="emotional-intensity-chart">
                    <ChartCard title="Emotional Intensity" className="lg:col-span-1 min-h-[350px]">
                        <div className="flex flex-col justify-center h-full gap-6 px-2">
                            {emotions.map((emotion, i) => (
                                <div key={emotion.name} className="group">
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="text-slate-300 group-hover:text-white transition-colors">{emotion.name}</span>
                                        <span className="text-slate-500">{emotion.value}%</span>
                                    </div>
                                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${i === 0 ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' :
                                                    i === 1 ? 'bg-primary-500 shadow-[0_0_10px_#3b82f6]' :
                                                        i === 2 ? 'bg-rose-500 shadow-[0_0_10px_#f43f5e]' : 'bg-slate-600'
                                                }`}
                                            style={{ width: `${emotion.value}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ChartCard>
                </div>

                {/* Placeholder for Timeline */}
                <div data-export-id="sentiment-timeline-chart">
                    <ChartCard title="Sentiment Timeline" className="lg:col-span-1 min-h-[350px]">
                        <SentimentTimelineChart
                            timeline={timeline}
                            distribution={distribution}
                            totalMentions={kpis.totalMentions}
                            updatedAt={data.updatedAt}
                        />
                    </ChartCard>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
