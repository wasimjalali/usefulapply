'use client';

import React from 'react';

interface SectionBackgroundProps {
  variant?: 'default' | 'clouds' | 'glow' | 'minimal';
}

/**
 * Ethereal animated backgrounds for landing page sections.
 * Inspired by soft 3D clouds with golden light streams.
 * Uses CSS-only animations for performance.
 */
export function SectionBackground({ variant = 'default' }: SectionBackgroundProps) {
  if (variant === 'minimal') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Single soft glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-radial from-gold-400/8 to-transparent rounded-full animate-breathe" />
      </div>
    );
  }

  if (variant === 'clouds') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Floating cloud shapes - soft ellipses with gold tint */}
        <div className="absolute top-[10%] left-[5%] w-[180px] h-[80px] bg-gradient-to-br from-cream-300/60 to-gold-100/40 rounded-[50%] animate-cloud-float-1" />
        <div className="absolute top-[15%] right-[10%] w-[220px] h-[100px] bg-gradient-to-bl from-cream-200/50 to-gold-50/30 rounded-[50%] animate-cloud-float-2" />
        <div className="absolute bottom-[20%] left-[15%] w-[160px] h-[70px] bg-gradient-to-tr from-gold-100/40 to-cream-200/50 rounded-[50%] animate-cloud-float-3" />

        {/* Glowing light streams */}
        <div className="absolute top-[40%] left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gold-400/30 to-transparent animate-light-stream" />
        <div className="absolute top-[60%] left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-gold-300/20 to-transparent animate-light-stream-delayed" />

        {/* Soft particle sparkles */}
        <div className="absolute top-[30%] left-[20%] w-1 h-1 rounded-full bg-gold-400/50 animate-sparkle" />
        <div className="absolute top-[50%] right-[25%] w-1.5 h-1.5 rounded-full bg-gold-300/40 animate-sparkle-delayed" />
        <div className="absolute bottom-[35%] left-[60%] w-1 h-1 rounded-full bg-gold-400/45 animate-sparkle" />
      </div>
    );
  }

  if (variant === 'glow') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Central radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-radial from-gold-400/12 via-gold-200/6 to-transparent rounded-full animate-glow-pulse" />

        {/* Floating oval platforms - like the image */}
        <div className="absolute bottom-[15%] left-[10%] w-[120px] h-[30px] bg-gradient-to-b from-cream-50/80 to-cream-200/60 rounded-[50%] shadow-[0_5px_30px_rgba(212,168,83,0.15)] animate-platform-float-1" />
        <div className="absolute bottom-[25%] right-[15%] w-[100px] h-[25px] bg-gradient-to-b from-cream-50/70 to-cream-300/50 rounded-[50%] shadow-[0_5px_25px_rgba(212,168,83,0.12)] animate-platform-float-2" />
        <div className="absolute bottom-[10%] left-[40%] w-[140px] h-[35px] bg-gradient-to-b from-white/60 to-cream-200/50 rounded-[50%] shadow-[0_8px_35px_rgba(212,168,83,0.18)] animate-platform-float-3" />

        {/* Golden light ribbons */}
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="goldRibbon" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#D4A853" stopOpacity="0" />
              <stop offset="30%" stopColor="#D4A853" stopOpacity="0.25" />
              <stop offset="50%" stopColor="#E8C27A" stopOpacity="0.35" />
              <stop offset="70%" stopColor="#D4A853" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#D4A853" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,60% Q25%,55% 50%,60% T100%,55%"
            fill="none"
            stroke="url(#goldRibbon)"
            strokeWidth="3"
            className="animate-ribbon-flow"
          />
        </svg>
      </div>
    );
  }

  // Default variant - balanced mix
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Soft cloud shapes */}
      <div className="absolute top-[8%] right-[8%] w-[200px] h-[90px] bg-gradient-to-bl from-cream-200/50 to-gold-100/30 rounded-[50%] animate-cloud-float-1" />
      <div className="absolute bottom-[15%] left-[5%] w-[150px] h-[65px] bg-gradient-to-tr from-gold-100/35 to-cream-200/45 rounded-[50%] animate-cloud-float-2" />

      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[250px] bg-gradient-radial from-gold-400/8 to-transparent rounded-full animate-breathe" />

      {/* Light accents */}
      <div className="absolute top-[45%] left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-gold-400/20 to-transparent animate-light-stream" />

      {/* Sparkles */}
      <div className="absolute top-[25%] left-[30%] w-1 h-1 rounded-full bg-gold-400/40 animate-sparkle" />
      <div className="absolute top-[65%] right-[20%] w-1 h-1 rounded-full bg-gold-300/35 animate-sparkle-delayed" />
    </div>
  );
}

export default SectionBackground;
