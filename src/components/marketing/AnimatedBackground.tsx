'use client';

import React from 'react';

function Cloud({
  top, left, right, bottom,
  width, height,
  animClass,
  opacity = 0.65,
}: {
  top?: string; left?: string; right?: string; bottom?: string;
  width: number; height: number;
  animClass: string;
  opacity?: number;
}) {
  const rgba = `rgba(255,255,255,${opacity})`;
  const h = height;
  const w = width;
  return (
    <div
      className={`absolute pointer-events-none select-none ${animClass}`}
      style={{ top, left, right, bottom, width: w, height: Math.round(h * 1.7) }}
    >
      {/* Base elongated body */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: w, height: h, background: rgba, borderRadius: '50%', filter: 'blur(10px)' }} />
      {/* Tall center-left bump */}
      <div style={{ position: 'absolute', bottom: Math.round(h * 0.3), left: Math.round(w * 0.18), width: Math.round(h * 1.25), height: Math.round(h * 1.25), background: rgba, borderRadius: '50%', filter: 'blur(8px)' }} />
      {/* Left shoulder */}
      <div style={{ position: 'absolute', bottom: Math.round(h * 0.18), left: Math.round(w * 0.05), width: h, height: h, background: rgba, borderRadius: '50%', filter: 'blur(7px)' }} />
      {/* Right shoulder */}
      <div style={{ position: 'absolute', bottom: Math.round(h * 0.08), right: Math.round(w * 0.12), width: Math.round(h * 0.8), height: Math.round(h * 0.8), background: rgba, borderRadius: '50%', filter: 'blur(7px)' }} />
    </div>
  );
}

export function HeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Cloud 1 — top-left, large, slow drift */}
      <Cloud
        top="-20px" left="-40px"
        width={320} height={80}
        animClass="animate-cloud-float-1"
        opacity={0.7}
      />
      {/* Cloud 2 — top-right, medium */}
      <Cloud
        top="10px" right="-30px"
        width={240} height={60}
        animClass="animate-cloud-float-2"
        opacity={0.6}
      />
      {/* Cloud 3 — upper-center, small, barely visible */}
      <Cloud
        top="60px" left="35%"
        width={180} height={45}
        animClass="animate-cloud-float-3"
        opacity={0.4}
      />
      {/* Cloud 4 — left edge, mid-height */}
      <Cloud
        top="38%" left="-60px"
        width={260} height={65}
        animClass="animate-cloud-float-2"
        opacity={0.5}
      />
      {/* Cloud 5 — bottom-right, large */}
      <Cloud
        bottom="-10px" right="-20px"
        width={300} height={75}
        animClass="animate-cloud-float-1"
        opacity={0.65}
      />
      {/* Cloud 6 — bottom-left, medium */}
      <Cloud
        bottom="20px" left="10%"
        width={200} height={50}
        animClass="animate-cloud-float-3"
        opacity={0.45}
      />
    </div>
  );
}

export function SectionBackground({
  sectionColor = '#FEFDFB',
}: {
  intensity?: 'light' | 'normal';
  variant?: number;
  sectionColor?: string;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Top/bottom fades for smooth section blending */}
      <div className="absolute inset-x-0 top-0 h-24" style={{ background: `linear-gradient(to bottom, ${sectionColor}, transparent)` }} />
      <div className="absolute inset-x-0 bottom-0 h-24" style={{ background: `linear-gradient(to top, ${sectionColor}, transparent)` }} />
    </div>
  );
}
