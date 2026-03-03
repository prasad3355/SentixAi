import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BarChart2, Network, Radio, Rocket, X } from 'lucide-react';

const Sidebar = ({ isMobileOpen = false, onClose = () => {} }) => {
    const navItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
        { icon: BarChart2, label: 'Analytics', path: '/analytics' },
        { icon: Network, label: 'Network', path: '/network' },
        { icon: Radio, label: 'Live Feed', path: '/live' },
    ];

    return (
        <>
            <div
                className={`lg:hidden fixed inset-0 bg-slate-950/70 backdrop-blur-[1px] z-40 transition-opacity duration-300 ${
                    isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                onClick={onClose}
                aria-hidden="true"
            />

            <aside
                className={`
                    fixed left-0 top-0 h-screen w-72 lg:w-64 glass z-50 flex flex-col border-r border-white/5
                    transition-transform duration-300 ease-out overflow-y-auto overscroll-contain
                    ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
                `}
            >
            {/* Logo */}
            <div className="h-20 flex items-center justify-center lg:justify-start lg:px-6 border-b border-white/5">
                <div className="relative flex items-center gap-3">
                    <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-primary-500 to-accent-violet flex items-center justify-center animate-glow">
                        <Rocket className="text-white w-6 h-6" />
                    </div>
                    <span className="font-display font-bold text-xl tracking-tight text-white">
                        Sentix<span className="text-primary-500">AI</span>
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="lg:hidden ml-auto p-2 text-slate-400 hover:text-white"
                    aria-label="Close navigation"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-8 px-2 lg:px-4 space-y-2">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onClose}
                        className={({ isActive }) => `
              relative flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 group
              ${isActive
                                ? 'bg-primary-600/20 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)]'
                                : 'text-slate-400 hover:bg-white/5 hover:text-white'
                            }
            `}
                    >
                        {({ isActive }) => (
                            <>
                                <item.icon className={`w-6 h-6 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                                <span className="font-medium">{item.label}</span>

                                {/* Active Indicator Line */}
                                {isActive && (
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-500 rounded-l-full shadow-[0_0_10px_#3b82f6]" />
                                )}
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* User / Upgrade Card - REMOVED */}

            </aside>
        </>
    );
};

export default Sidebar;
