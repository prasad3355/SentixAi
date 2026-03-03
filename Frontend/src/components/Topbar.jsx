import React, { useEffect, useMemo, useState } from 'react';
import { Search, Bell, Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useSentiment } from '../context/SentimentContext';

const Topbar = ({ onMenuToggle }) => {
    const location = useLocation();
    const { keyword, runSearch, searching, health, data } = useSentiment();
    const [searchText, setSearchText] = useState(keyword);

    useEffect(() => {
        setSearchText(keyword);
    }, [keyword]);

    const title = useMemo(() => {
        if (location.pathname === '/analytics') return 'Analytics Deep Dive';
        if (location.pathname === '/network') return 'Network Intelligence';
        if (location.pathname === '/live') return 'Live Feed';
        return 'Dashboard Overview';
    }, [location.pathname]);

    const statusTone = health.status === 'ok' ? 'text-emerald-400' : 'text-amber-400';

    const onSubmit = async (event) => {
        event.preventDefault();
        await runSearch(searchText);
    };

    return (
        <header className="fixed top-0 right-0 left-0 lg:left-64 h-20 glass z-40 flex items-center justify-between px-6 lg:px-10 transition-all duration-300">
            {/* Left: Mobile Menu Trigger (Visible on small screens) & Page Title Placeholder */}
            <div className="flex items-center gap-4">
                <button
                    onClick={onMenuToggle}
                    className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors"
                    aria-label="Toggle navigation"
                >
                    <Menu className="w-6 h-6" />
                </button>

                {/* Breadcrumbs or Title could go here dynamically */}
                <div className="hidden md:block">
                    <h2 className="text-lg font-semibold text-white tracking-wide">
                        {title}
                    </h2>
                </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                {/* Search Bar */}
                <form onSubmit={onSubmit} className="flex items-center relative group min-w-0 w-[48vw] sm:w-72 md:w-auto md:min-w-[18rem]">
                    <Search className="absolute left-3 w-4 h-4 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                    <input
                        type="text"
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                        placeholder="Search..."
                        className="bg-slate-900/50 border border-white/5 rounded-full py-2 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/50 w-full md:w-72 transition-all"
                    />
                    <button
                        type="submit"
                        disabled={searching}
                        className="ml-2 px-3 py-1.5 text-xs rounded-full bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white whitespace-nowrap"
                    >
                        {searching ? '...' : 'Analyze'}
                    </button>
                </form>

                <div className="hidden xl:flex flex-col text-right leading-tight">
                    <span className={`text-xs font-semibold ${statusTone}`}>
                        {health.status === 'ok' ? 'System Active' : 'System Degraded'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                        {(data.sourceLabel || (data.source === 'x_api' ? 'X API' : 'Estimated (CSV)'))} | {data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : 'syncing...'}
                    </span>
                </div>

                {/* Notifications */}
                <button className="relative p-2 text-slate-400 hover:text-white transition-colors group">
                    <Bell className="w-5 h-5 group-hover:animate-swing" />
                    <span className="absolute top-2 right-2 w-2 h-2 bg-accent-blue rounded-full shadow-[0_0_8px_#0ea5e9] animate-pulse"></span>
                </button>

                {/* Profile */}
                <div className="flex items-center gap-3 pl-4 border-l border-white/5">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-medium text-white">Admin User</p>
                        <p className="text-xs text-slate-400">Head of Analytics</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-600 border border-white/10 flex items-center justify-center overflow-hidden ring-2 ring-transparent hover:ring-primary-500/50 transition-all cursor-pointer">
                        <span className="text-sm font-bold text-white">AU</span>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Topbar;
