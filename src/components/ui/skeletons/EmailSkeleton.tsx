import React from 'react';

export const EmailSkeleton = () => {
  return (
    <div className="w-full bg-white p-6 space-y-6 animate-pulse rounded-lg border border-navy/5">
      {/* Subject Line Input */}
      <div className="space-y-2">
        <div className="h-3 w-16 bg-navy/20 rounded"></div>
        <div className="h-10 w-full bg-cream border border-navy/10 rounded"></div>
      </div>

      {/* Email Body */}
      <div className="space-y-3 pt-4">
        <div className="h-4 w-1/4 bg-navy/10 rounded"></div>
        <div className="h-4 w-full bg-navy/5 rounded"></div>
        <div className="h-4 w-full bg-navy/5 rounded"></div>
        <div className="h-4 w-2/3 bg-navy/5 rounded"></div>
      </div>
      
      {/* Action Button */}
      <div className="pt-4 flex justify-end">
         <div className="h-10 w-32 bg-navy/10 rounded"></div>
      </div>
    </div>
  );
};
