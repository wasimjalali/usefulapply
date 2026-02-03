import React from 'react';

export const EmailSkeleton = () => {
  return (
    <div className="w-full bg-white p-6 space-y-6 animate-pulse rounded-lg border border-[#1E293B]/5">
      {/* Subject Line Input Skeleton */}
      <div className="space-y-2">
        <div className="h-3 w-16 bg-[#1E293B]/20 rounded"></div>
        <div className="h-10 w-full bg-[#FDFBF7] border border-[#1E293B]/10 rounded"></div>
      </div>

      {/* Email Body Skeleton */}
      <div className="space-y-3 pt-4">
        <div className="h-4 w-1/4 bg-[#1E293B]/10 rounded"></div>
        <div className="h-4 w-full bg-[#1E293B]/5 rounded"></div>
        <div className="h-4 w-full bg-[#1E293B]/5 rounded"></div>
        <div className="h-4 w-2/3 bg-[#1E293B]/5 rounded"></div>
      </div>
      
      {/* Button Skeleton */}
      <div className="pt-4 flex justify-end">
         <div className="h-10 w-32 bg-[#1E293B]/10 rounded"></div>
      </div>
    </div>
  );
};
