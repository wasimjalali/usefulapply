import React from 'react';

export const CoverLetterSkeleton = () => {
  return (
    <div className="w-full h-full bg-cream p-8 space-y-8 animate-pulse border border-navy/5 rounded-lg">
      {/* Letter Header */}
      <div className="flex justify-between items-start border-b border-navy/10 pb-6">
        <div className="space-y-2">
           <div className="h-4 w-32 bg-navy/10 rounded"></div>
           <div className="h-4 w-48 bg-navy/5 rounded"></div>
        </div>
        <div className="space-y-2 text-right">
           <div className="h-4 w-32 bg-navy/10 rounded ml-auto"></div>
           <div className="h-4 w-24 bg-navy/5 rounded ml-auto"></div>
        </div>
      </div>

      {/* Greeting */}
      <div className="h-4 w-40 bg-navy/10 rounded mt-8"></div>

      {/* Body Paragraphs */}
      <div className="space-y-4">
        <div className="h-4 w-full bg-navy/5 rounded"></div>
        <div className="h-4 w-full bg-navy/5 rounded"></div>
        <div className="h-4 w-3/4 bg-navy/5 rounded"></div>
      </div>
      
      <div className="space-y-4">
        <div className="h-4 w-full bg-navy/5 rounded"></div>
        <div className="h-4 w-5/6 bg-navy/5 rounded"></div>
      </div>

      {/* Signature */}
      <div className="mt-8 space-y-3">
        <div className="h-4 w-32 bg-navy/10 rounded"></div>
        <div className="h-8 w-48 bg-gold/10 rounded"></div>
      </div>
    </div>
  );
};
