import React from 'react';
import { MoreHorizontal } from 'lucide-react';

const ChartCard = ({ title, children, className }) => {
    return (
        <div className={`glass-card p-6 flex flex-col ${className}`}>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
                <button className="text-slate-500 hover:text-white transition-colors">
                    <MoreHorizontal className="w-5 h-5" />
                </button>
            </div>
            <div className="flex-1 w-full relative">
                {children}
            </div>
        </div>
    );
};

export default ChartCard;
