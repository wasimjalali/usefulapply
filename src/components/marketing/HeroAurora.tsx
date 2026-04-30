'use client';

/**
 * HeroAurora
 *
 * Premium ambient background for the landing hero. Layers:
 *   1. Aurora glow: two large navy + gold blurred orbs drifting slowly.
 *   2. Sage accent orb for depth.
 *   3. Fine grid lines with radial mask — fades to nothing at center and edges.
 *   4. SVG grain noise overlay for editorial texture.
 *   5. Soft bottom fade into the next section.
 *
 * All layers are pointer-events-none and aria-hidden.
 * Motion respects prefers-reduced-motion via keyframes defined in globals.css.
 */
export function HeroAurora() {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      {/* Layer 1: Navy aurora orb — top-left, deep brand color */}
      <div
        className="absolute -top-[30%] -left-[15%] w-[75%] h-[110%] animate-aurora-slow-1"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(30, 58, 95, 0.38) 0%, rgba(30, 58, 95, 0.14) 40%, transparent 70%)',
          filter: 'blur(90px)',
        }}
      />

      {/* Layer 2: Gold aurora orb — bottom-right, warm accent */}
      <div
        className="absolute -bottom-[35%] -right-[20%] w-[85%] h-[115%] animate-aurora-slow-2"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(212, 168, 83, 0.45) 0%, rgba(212, 168, 83, 0.16) 42%, transparent 72%)',
          filter: 'blur(100px)',
        }}
      />

      {/* Layer 3: Third accent orb — sage/teal lift on the right, adds depth */}
      <div
        className="absolute top-[20%] -right-[10%] w-[45%] h-[60%] animate-aurora-slow-3"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(91, 138, 114, 0.22) 0%, rgba(91, 138, 114, 0.08) 40%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      {/* Layer 4: Fine line grid with radial mask — only visible at the edges */}
      <div
        className="absolute inset-0 animate-aurora-shimmer"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(30, 58, 95, 0.11) 1px, transparent 1px), linear-gradient(to bottom, rgba(30, 58, 95, 0.11) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 60% at 50% 45%, transparent 30%, black 90%)',
          maskImage:
            'radial-gradient(ellipse 70% 60% at 50% 45%, transparent 30%, black 90%)',
        }}
      />

      {/* Layer 5: SVG grain overlay for editorial texture */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.035] mix-blend-multiply"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="hero-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#hero-grain)" />
      </svg>

      {/* Layer 6: Soft bottom fade into the Trust Bar below */}
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
