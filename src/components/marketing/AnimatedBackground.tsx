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
  intensity = 'normal'
}: {
  intensity?: 'light' | 'normal';
}) {
  const opacity = intensity === 'light' ? 0.7 : 1;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity }}>
      {/* Large cloud — top-left */}
      <div
        className="absolute -top-[10%] -left-[8%] w-[500px] h-[280px] rounded-[50%] blur-[60px] animate-cloud-drift-1"
        style={{ background: 'radial-gradient(ellipse at 40% 50%, rgba(255,255,255,0.9) 0%, rgba(240,232,215,0.5) 45%, transparent 75%)' }}
      />

      {/* Large cloud — top-right */}
      <div
        className="absolute -top-[5%] -right-[10%] w-[550px] h-[300px] rounded-[50%] blur-[65px] animate-cloud-drift-2"
        style={{ background: 'radial-gradient(ellipse at 60% 40%, rgba(255,255,255,0.85) 0%, rgba(245,237,220,0.45) 45%, transparent 75%)' }}
      />

      {/* Mid cloud — center-left */}
      <div
        className="absolute top-[35%] -left-[5%] w-[450px] h-[220px] rounded-[50%] blur-[55px] animate-cloud-drift-3"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.8) 0%, rgba(242,234,218,0.4) 45%, transparent 70%)' }}
      />

      {/* Mid cloud — center-right */}
      <div
        className="absolute top-[40%] -right-[6%] w-[400px] h-[200px] rounded-[50%] blur-[55px] animate-cloud-drift-4"
        style={{ background: 'radial-gradient(ellipse at 45% 55%, rgba(255,255,255,0.75) 0%, rgba(240,233,218,0.4) 45%, transparent 70%)' }}
      />

      {/* Bottom cloud — large and wide */}
      <div
        className="absolute -bottom-[10%] left-[10%] w-[600px] h-[250px] rounded-[50%] blur-[60px] animate-cloud-drift-5"
        style={{ background: 'radial-gradient(ellipse at 50% 60%, rgba(255,255,255,0.85) 0%, rgba(242,235,220,0.45) 45%, transparent 75%)' }}
      />

      {/* Golden glow accent — center */}
      <div
        className="absolute top-1/2 left-1/2 w-[500px] h-[250px] rounded-[50%] blur-[80px] animate-golden-glow-drift"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(212,168,83,0.25) 0%, rgba(232,194,122,0.12) 40%, transparent 70%)' }}
      />

      {/* Secondary golden accent — lower-right */}
      <div
        className="absolute bottom-[20%] right-[15%] w-[300px] h-[150px] rounded-[50%] blur-[60px] animate-cloud-drift-1"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(212,168,83,0.18) 0%, rgba(232,194,122,0.08) 40%, transparent 65%)', animationDelay: '12s' }}
      />
    </div>
  );
}
