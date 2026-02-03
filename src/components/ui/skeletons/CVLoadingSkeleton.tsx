import React from 'react';

export const CVLoadingSkeleton = () => {
  return (
    <div className="w-full h-full bg-cream p-8 space-y-8 animate-pulse">
      {/* Header Area */}
      <div className="flex flex-col items-center space-y-4 border-b border-navy/10 pb-6">
        <div className="h-8 w-1/3 bg-navy/10 rounded"></div>
        <div className="h-4 w-1/2 bg-navy/5 rounded"></div>
        <div className="flex gap-4">
            <div className="h-4 w-24 bg-gold/20 rounded"></div>
            <div className="h-4 w-24 bg-gold/20 rounded"></div>
        </div>
      </div>

      {/* Summary Area */}
      <div className="space-y-3">
        <div className="h-6 w-1/4 bg-navy/10 rounded"></div>
        <div className="h-4 w-full bg-navy/5 rounded"></div>
        <div className="h-4 w-full bg-navy/5 rounded"></div>
        <div className="h-4 w-3/4 bg-navy/5 rounded"></div>
      </div>

      {/* Experience Area (Repeating Blocks) */}
      <div className="space-y-6">
        <div className="h-6 w-1/4 bg-navy/10 rounded"></div>
        {[1, 2].map((i) => (
            <div key={i} className="space-y-3 pl-4 border-l-2 border-gold/20">
                <div className="flex justify-between">
                    <div className="h-5 w-1/3 bg-navy/10 rounded"></div>
                    <div className="h-4 w-20 bg-navy/10 rounded"></div>
                </div>
                <div className="h-4 w-full bg-navy/5 rounded"></div>
                <div className="h-4 w-5/6 bg-navy/5 rounded"></div>
            </div>
        ))}
      </div>
    </div>
  );
};
