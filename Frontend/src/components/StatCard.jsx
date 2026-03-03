import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { clsx } from 'clsx';

const StatCard = ({ title, value, change, isPositive, icon, delay = 0 }) => {
    const Icon = icon;

    return (
        <div
            className="glass-card p-6 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-500"
            style={{ animationDelay: `${delay}ms` }}
        >
            {/* Background Glow Effect */}
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary-500/10 rounded-full blur-2xl group-hover:bg-primary-500/20 transition-colors duration-500" />

            <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="p-3 rounded-lg bg-slate-800/50 border border-white/5 text-primary-400 group-hover:text-primary-300 group-hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all">
                    <Icon className="w-6 h-6" />
                </div>
                {change && (
                    <div className={clsx(
                        "flex items-center text-xs font-bold px-2 py-1 rounded-full border",
                        isPositive
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    )}>
                        {isPositive ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                        {change}
                    </div>
                )}
            </div>

            <div className="relative z-10">
                <h3 className="text-slate-400 text-sm font-medium mb-1">{title}</h3>
                <p className="text-3xl font-display font-bold text-white tracking-tight group-hover:text-gradient-primary transition-all">
                    {value}
                </p>
            </div>
        </div>
    );
};

export default StatCard;
