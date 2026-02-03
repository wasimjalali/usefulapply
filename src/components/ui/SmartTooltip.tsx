import React from 'react';
import { Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const SmartTooltip = ({ children, insight }: { children: React.ReactNode, insight?: string }) => {
  if (!insight) return <>{children}</>;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div className="relative group cursor-help border-b-2 border-dotted border-[#D4AF37]/50 hover:border-[#D4AF37] transition-colors rounded-sm print:border-none">
            {children}
            <div className="absolute -top-3 -right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-[#FDFBF7] p-1 rounded-full border border-[#D4AF37] shadow-sm z-10 print:hidden">
               <Sparkles size={12} className="text-[#D4AF37]" />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-[#1E293B] border border-[#D4AF37] text-[#FDFBF7] p-4 max-w-xs shadow-xl z-50 print:hidden">
          <div className="flex gap-3">
            <Sparkles className="w-5 h-5 text-[#D4AF37] flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[#D4AF37] text-xs uppercase tracking-wider mb-1">AI Insight</p>
              <p className="text-sm leading-relaxed">{insight}</p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
