import React from 'react';

export const CoverLetterSkeleton = () => {
  return (
    <div className="w-full h-full bg-[#FDFBF7] p-8 space-y-8 animate-pulse border border-[#1E293B]/5">
      {/* Header (Addresses) */}
      <div className="flex justify-between items-start border-b border-[#1E293B]/10 pb-6">
        <div className="space-y-2">
           <div className="h-4 w-32 bg-[#1E293B]/10 rounded"></div>
           <div className="h-4 w-48 bg-[#1E293B]/5 rounded"></div>
        </div>
        <div className="space-y-2 text-right">
           <div className="h-4 w-32 bg-[#1E293B]/10 rounded ml-auto"></div>
           <div className="h-4 w-24 bg-[#1E293B]/5 rounded ml-auto"></div>
        </div>
      </div>

      {/* Salutation */}
      <div className="h-4 w-40 bg-[#1E293B]/10 rounded mt-8"></div>

      {/* Body Paragraphs */}
      <div className="space-y-4">
        <div className="h-4 w-full bg-[#1E293B]/5 rounded"></div>
        <div className="h-4 w-full bg-[#1E293B]/5 rounded"></div>
        <div className="h-4 w-3/4 bg-[#1E293B]/5 rounded"></div>
      </div>

      <div className="space-y-4">
        <div className="h-4 w-full bg-[#1E293B]/5 rounded"></div>
        <div className="h-4 w-5/6 bg-[#1E293B]/5 rounded"></div>
      </div>

      {/* Sign-off */}
      <div className="mt-8 space-y-3">
        <div className="h-4 w-32 bg-[#1E293B]/10 rounded"></div>
        <div className="h-8 w-48 bg-[#D4AF37]/10 rounded"></div> {/* Signature Area */}
      </div>
    </div>
  );
};
