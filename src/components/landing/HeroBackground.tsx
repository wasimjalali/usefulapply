'use client';

import React from 'react';

/**
 * Premium animated background for the hero section.
 * Uses gold/cream tones with document and AI-inspired visual metaphors.
 * No blur effects - clean shapes, borders, gradients, and opacity.
 */
export function HeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Floating Document Outlines - Suggests AI-generated documents */}
      <div className="absolute top-[10%] left-[5%] w-24 h-32 border-2 border-[#D4A853]/40 rounded-sm animate-float-doc-1" />
      <div className="absolute top-[15%] left-[8%] w-20 h-28 border border-[#C4932E]/30 rounded-sm animate-float-doc-2" />
      <div className="absolute top-[60%] right-[8%] w-28 h-36 border-2 border-[#D4A853]/35 rounded-sm animate-float-doc-3" />
      <div className="absolute bottom-[20%] right-[12%] w-22 h-30 border border-[#C4932E]/25 rounded-sm animate-float-doc-4" />

      {/* Document with "lines" - Represents CV/Cover Letter */}
      <div className="absolute top-[25%] right-[15%] w-32 h-40 border-2 border-[#D4A853]/50 rounded-sm animate-float-doc-5 bg-gradient-to-b from-[#D4A853]/5 to-transparent">
        <div className="mt-4 mx-3 space-y-2">
          <div className="h-1.5 bg-[#D4A853]/30 rounded-full w-3/4" />
          <div className="h-1.5 bg-[#C4932E]/25 rounded-full w-full" />
          <div className="h-1.5 bg-[#D4A853]/20 rounded-full w-5/6" />
          <div className="h-1.5 bg-[#C4932E]/25 rounded-full w-2/3" />
          <div className="h-1.5 bg-[#D4A853]/20 rounded-full w-4/5" />
        </div>
      </div>

      {/* Processing Scan Line - AI reading/analyzing */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#D4A853]/60 to-transparent animate-scan-line" />
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#C4932E]/40 to-transparent animate-scan-line-delayed" />

      {/* Rising Particles - Career growth, progress */}
      <div className="absolute bottom-0 left-[15%] w-2 h-2 rounded-full bg-[#D4A853]/50 animate-rise-particle-1" />
      <div className="absolute bottom-0 left-[25%] w-1.5 h-1.5 rounded-full bg-[#C4932E]/40 animate-rise-particle-2" />
      <div className="absolute bottom-0 left-[70%] w-2.5 h-2.5 rounded-full bg-[#D4A853]/45 animate-rise-particle-3" />
      <div className="absolute bottom-0 left-[80%] w-1.5 h-1.5 rounded-full bg-[#C4932E]/35 animate-rise-particle-4" />
      <div className="absolute bottom-0 left-[45%] w-2 h-2 rounded-full bg-[#D4A853]/50 animate-rise-particle-5" />
      <div className="absolute bottom-0 left-[55%] w-1 h-1 rounded-full bg-[#C4932E]/45 animate-rise-particle-6" />

      {/* Rotating Geometric Shapes - Premium, modern feel */}
      <div className="absolute top-[40%] left-[3%] w-16 h-16 border border-[#D4A853]/30 rotate-45 animate-rotate-shape-1" />
      <div className="absolute top-[70%] left-[10%] w-12 h-12 border-2 border-[#C4932E]/25 animate-rotate-shape-2" />
      <div className="absolute top-[30%] right-[5%] w-20 h-20 border border-[#D4A853]/20 rounded-full animate-pulse-ring" />

      {/* Connection Dots - AI network visualization */}
      <div className="absolute top-[50%] left-[20%] w-3 h-3 rounded-full bg-[#D4A853]/40 animate-pulse-dot" />
      <div className="absolute top-[45%] left-[30%] w-2 h-2 rounded-full bg-[#C4932E]/35 animate-pulse-dot-delayed" />
      <div className="absolute top-[55%] left-[25%] w-2.5 h-2.5 rounded-full bg-[#D4A853]/30 animate-pulse-dot" />

      {/* Flowing Ribbon/Path - Speed, efficiency */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ribbonGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#D4A853" stopOpacity="0" />
            <stop offset="50%" stopColor="#D4A853" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#D4A853" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,200 Q200,150 400,200 T800,180 T1200,220 T1600,200"
          fill="none"
          stroke="url(#ribbonGradient)"
          strokeWidth="2"
          className="animate-flow-path"
        />
        <path
          d="M0,400 Q300,350 600,400 T1200,380 T1600,420"
          fill="none"
          stroke="url(#ribbonGradient)"
          strokeWidth="1.5"
          className="animate-flow-path-delayed"
        />
      </svg>

      {/* Corner Accents - Professional framing */}
      <div className="absolute top-8 left-8 w-16 h-16">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-[#D4A853]/50 to-transparent animate-corner-accent" />
        <div className="absolute top-0 left-0 w-0.5 h-full bg-gradient-to-b from-[#D4A853]/50 to-transparent animate-corner-accent" />
      </div>
      <div className="absolute top-8 right-8 w-16 h-16">
        <div className="absolute top-0 right-0 w-full h-0.5 bg-gradient-to-l from-[#D4A853]/50 to-transparent animate-corner-accent-delayed" />
        <div className="absolute top-0 right-0 w-0.5 h-full bg-gradient-to-b from-[#D4A853]/50 to-transparent animate-corner-accent-delayed" />
      </div>

      {/* Subtle Grid Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(#D4A853 1px, transparent 1px),
            linear-gradient(90deg, #D4A853 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px'
        }}
      />
    </div>
  );
}

export default HeroBackground;
