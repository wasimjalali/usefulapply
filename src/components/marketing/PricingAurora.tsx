'use client';

/**
 * PricingAurora
 *
 * Premium ambient background for the pricing hero + cards region.
 * Distinct from HeroAurora: different orb placements (gold-top, navy-bottom)
 * so the pricing page has its own signature while staying on-brand.
 *
 * Layers:
 *   1. Gold aurora — top-right, the "premium" tint.
 *   2. Navy aurora — bottom-left, grounds the region.
 *   3. Sage highlight — centered upper, subtle third tone.
 *   4. Conic sweep shimmer — very low opacity, slow rotation.
 *   5. Masked line grid — only visible near edges.
 *   6. SVG grain — editorial texture.
 *   7. Bottom fade — blends into next section.
 *
 * All layers pointer-events-none + aria-hidden. Motion respects
 * prefers-reduced-motion via keyframes in globals.css.
 */
export function PricingAurora() {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      {/* Layer 1: Gold aurora — top-right */}
      <div
        className="absolute -top-[20%] -right-[10%] w-[65%] h-[70%] animate-aurora-slow-1"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(212, 168, 83, 0.40) 0%, rgba(212, 168, 83, 0.14) 42%, transparent 72%)',
          filter: 'blur(95px)',
        }}
      />

      {/* Layer 2: Navy aurora — bottom-left */}
      <div
        className="absolute -bottom-[25%] -left-[15%] w-[70%] h-[75%] animate-aurora-slow-2"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(30, 58, 95, 0.32) 0%, rgba(30, 58, 95, 0.12) 40%, transparent 70%)',
          filter: 'blur(100px)',
        }}
      />

      {/* Layer 3: Sage highlight — subtle third tone on the upper-left */}
      <div
        className="absolute top-[10%] -left-[5%] w-[40%] h-[45%] animate-aurora-slow-3"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(91, 138, 114, 0.20) 0%, rgba(91, 138, 114, 0.06) 40%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      {/* Layer 4: Conic sweep — ultra-subtle rotation, the "premium" move */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140%] h-[140%] animate-conic-sweep opacity-[0.10]"
        style={{
          background:
            'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(212, 168, 83, 0.4) 40deg, transparent 90deg, transparent 180deg, rgba(30, 58, 95, 0.3) 220deg, transparent 270deg, transparent 360deg)',
          filter: 'blur(60px)',
        }}
      />

      {/* Layer 5: Masked line grid */}
      <div
        className="absolute inset-0 animate-aurora-shimmer"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(30, 58, 95, 0.11) 1px, transparent 1px), linear-gradient(to bottom, rgba(30, 58, 95, 0.11) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
          WebkitMaskImage:
            'radial-gradient(ellipse 75% 65% at 50% 40%, transparent 25%, black 90%)',
          maskImage:
            'radial-gradient(ellipse 75% 65% at 50% 40%, transparent 25%, black 90%)',
        }}
      />

      {/* Layer 6: Grain */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.035] mix-blend-multiply"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="pricing-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#pricing-grain)" />
      </svg>

      {/* Layer 7: Bottom fade into next section */}
      <div
        className="absolute inset-x-0 bottom-0 h-32"
        style={{
          background:
            'linear-gradient(to bottom, transparent, rgba(250, 247, 242, 1))',
        }}
      />
    </div>
  );
}
