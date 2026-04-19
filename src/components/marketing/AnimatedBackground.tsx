'use client';

import Image from 'next/image';

/**
 * Hero section background using the ethereal clouds + gold light streams image.
 * Full-bleed background with subtle overlay for text readability.
 */
export function HeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Main background image - slightly reduced opacity for text contrast */}
      <Image
        src="/hero-clouds-bg.jpg"
        alt=""
        fill
        priority
        quality={90}
        className="object-cover object-center opacity-60"
        sizes="100vw"
      />
      {/* Radial vignette: fades center for text, keeps edges visible */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(250,247,242,0.85) 0%, rgba(250,247,242,0.4) 50%, transparent 80%)'
        }}
      />
      {/* Top gradient for header area */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-cream-100/80 to-transparent" />
    </div>
  );
}

export function SectionBackground({
  intensity = 'normal',
  variant = 0,
  sectionColor = '#FEFDFB'
}: {
  intensity?: 'light' | 'normal';
  variant?: number;
  sectionColor?: string;
}) {
  const imgOpacity = intensity === 'light' ? 'opacity-[0.18]' : 'opacity-[0.28]';
  const positions = ['object-[50%_30%]', 'object-[30%_60%]', 'object-[70%_40%]', 'object-[40%_70%]', 'object-[60%_50%]'];
  const drifts = ['animate-cloud-drift-1', 'animate-cloud-drift-2', 'animate-cloud-drift-3', 'animate-cloud-drift-4', 'animate-cloud-drift-5'];
  const pos = positions[variant % positions.length];
  const drift = drifts[variant % drifts.length];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <Image
        src="/hero-clouds-bg.jpg"
        alt=""
        fill
        quality={60}
        className={`object-cover ${pos} ${imgOpacity} scale-[1.15] ${drift}`}
        sizes="100vw"
      />
      <div className="absolute inset-x-0 top-0 h-28" style={{ background: `linear-gradient(to bottom, ${sectionColor}, transparent)` }} />
      <div className="absolute inset-x-0 bottom-0 h-28" style={{ background: `linear-gradient(to top, ${sectionColor}, transparent)` }} />
      <div
        className="absolute top-1/2 left-1/2 w-[500px] h-[250px] rounded-[50%] blur-[80px] animate-golden-glow-drift"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(212,168,83,0.18) 0%, rgba(232,194,122,0.08) 40%, transparent 70%)' }}
      />
    </div>
  );
}
