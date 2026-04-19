'use client';

import React from 'react';

interface SectionBackgroundProps {
  variant?: 'default' | 'minimal' | 'accent';
}

/**
 * Lighter animated background for general landing page sections.
 * Uses gold/cream tones with subtle movement.
 * Variants allow customization per section.
 */
export function SectionBackground({ variant = 'default' }: SectionBackgroundProps) {
  if (variant === 'minimal') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Very subtle particles only */}
        <div className="absolute top-[20%] left-[10%] w-1.5 h-1.5 rounded-full bg-[#D4A853]/25 animate-float-subtle-1" />
        <div className="absolute top-[40%] right-[15%] w-2 h-2 rounded-full bg-[#C4932E]/20 animate-float-subtle-2" />
        <div className="absolute bottom-[30%] left-[20%] w-1 h-1 rounded-full bg-[#D4A853]/30 animate-float-subtle-3" />

        {/* Single decorative line */}
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#D4A853]/20 to-transparent" />
      </div>
    );
  }

  if (variant === 'accent') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Accent version with more visible gold elements */}
        <div className="absolute top-[15%] right-[10%] w-20 h-20 border-2 border-[#D4A853]/40 rounded-full animate-pulse-ring-slow" />
        <div className="absolute bottom-[20%] left-[8%] w-16 h-16 border border-[#C4932E]/30 rotate-45 animate-rotate-shape-slow" />

        {/* Floating small documents */}
        <div className="absolute top-[50%] right-[5%] w-16 h-20 border border-[#D4A853]/30 rounded-sm animate-float-subtle-1">
          <div className="mt-2 mx-2 space-y-1">
            <div className="h-1 bg-[#D4A853]/20 rounded-full w-3/4" />
            <div className="h-1 bg-[#C4932E]/15 rounded-full w-full" />
            <div className="h-1 bg-[#D4A853]/20 rounded-full w-2/3" />
          </div>
        </div>

        {/* Particles */}
        <div className="absolute top-[30%] left-[15%] w-2 h-2 rounded-full bg-[#D4A853]/35 animate-pulse-dot" />
        <div className="absolute bottom-[40%] right-[20%] w-1.5 h-1.5 rounded-full bg-[#C4932E]/30 animate-pulse-dot-delayed" />

        {/* Top/bottom accent lines */}
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#D4A853]/30 to-transparent animate-shimmer" />
        <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#C4932E]/25 to-transparent" />
      </div>
    );
  }

  // Default variant
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Floating geometric shapes */}
      <div className="absolute top-[20%] left-[5%] w-10 h-10 border border-[#D4A853]/25 rotate-12 animate-float-subtle-1" />
      <div className="absolute top-[60%] right-[8%] w-14 h-14 border border-[#C4932E]/20 rounded-full animate-float-subtle-2" />
      <div className="absolute bottom-[25%] left-[10%] w-8 h-8 border border-[#D4A853]/20 animate-float-subtle-3" />

      {/* Small document outline */}
      <div className="absolute top-[35%] right-[12%] w-14 h-18 border border-[#D4A853]/25 rounded-sm animate-float-doc-subtle">
        <div className="mt-2 mx-1.5 space-y-1">
          <div className="h-0.5 bg-[#D4A853]/20 rounded-full w-3/4" />
          <div className="h-0.5 bg-[#C4932E]/15 rounded-full w-full" />
          <div className="h-0.5 bg-[#D4A853]/15 rounded-full w-2/3" />
        </div>
      </div>

      {/* Subtle dots */}
      <div className="absolute top-[45%] left-[20%] w-2 h-2 rounded-full bg-[#D4A853]/25 animate-pulse-dot" />
      <div className="absolute top-[70%] left-[75%] w-1.5 h-1.5 rounded-full bg-[#C4932E]/20 animate-pulse-dot-delayed" />
      <div className="absolute top-[25%] right-[25%] w-1 h-1 rounded-full bg-[#D4A853]/30 animate-float-subtle-2" />

      {/* Horizontal accent line */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#D4A853]/20 to-transparent" />
    </div>
  );
}

export default SectionBackground;
