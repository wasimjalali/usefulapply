import React from 'react';

export const ATSSpeedometer = ({ score }: { score: number }) => {
  const radius = 80;
  const circumference = radius * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-[#FDFBF7] rounded-xl border border-[#D4AF37]/20 shadow-sm">
      <div className="relative">
        <svg width="200" height="120" viewBox="0 0 200 120" className="overflow-visible">
          {/* Background Arc */}
          <path d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="#1E293B" strokeOpacity="0.1" strokeWidth="12" strokeLinecap="round" />
          {/* Progress Arc */}
          <path
            d="M20,100 A80,80 0 0,1 180,100"
            fill="none"
            stroke="#D4AF37"
            strokeWidth="12"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute top-16 left-0 right-0 text-center">
          <span className="text-4xl font-bold text-[#1E293B]">{score}%</span>
          <span className="block text-xs text-[#1E293B]/70 uppercase tracking-widest mt-1">ATS Score</span>
        </div>
      </div>
    </div>
  );
};
