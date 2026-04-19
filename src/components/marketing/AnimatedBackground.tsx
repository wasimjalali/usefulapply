'use client';

export function HeroBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-cream-100 via-cream-100 to-cream-200/60" />

      {/* Large warm glows - visible amber/gold */}
      <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-gold-300/40 blur-[60px] animate-hero-glow-1" />
      <div className="absolute -bottom-40 -left-20 w-[400px] h-[400px] rounded-full bg-gold-400/25 blur-[50px] animate-hero-glow-2" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[350px] h-[350px] rounded-full bg-gold-200/35 blur-[40px] animate-hero-glow-3" />

      {/* Floating gold rings */}
      <div className="absolute top-[15%] left-[8%] w-24 h-24 rounded-full border-2 border-gold-400/25 animate-ring-float-1" />
      <div className="absolute top-[60%] right-[10%] w-16 h-16 rounded-full border-2 border-gold-300/30 animate-ring-float-2" />
      <div className="absolute bottom-[20%] left-[20%] w-20 h-20 rounded-full border border-gold-400/20 animate-ring-float-3" />

      {/* Small floating dots */}
      <div className="absolute top-[20%] right-[20%] w-3 h-3 rounded-full bg-gold-400/40 animate-dot-float-1" />
      <div className="absolute top-[50%] left-[5%] w-2.5 h-2.5 rounded-full bg-gold-500/30 animate-dot-float-2" />
      <div className="absolute bottom-[30%] right-[30%] w-2 h-2 rounded-full bg-gold-400/35 animate-dot-float-3" />
      <div className="absolute top-[35%] left-[25%] w-2 h-2 rounded-full bg-gold-300/40 animate-dot-float-1" />
      <div className="absolute top-[70%] right-[15%] w-1.5 h-1.5 rounded-full bg-gold-500/25 animate-dot-float-2" />
      <div className="absolute top-[45%] right-[40%] w-3 h-3 rounded-full bg-gold-400/20 animate-dot-float-3" />

      {/* Diagonal light streaks */}
      <div className="absolute top-0 left-[20%] w-px h-[60%] bg-gradient-to-b from-gold-400/20 via-gold-300/10 to-transparent rotate-[20deg] origin-top animate-streak-1" />
      <div className="absolute top-0 right-[30%] w-px h-[50%] bg-gradient-to-b from-gold-300/15 via-gold-200/8 to-transparent rotate-[-15deg] origin-top animate-streak-2" />

      {/* Gold accent lines */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-400/50 to-transparent" />
    </div>
  );
}

export function SectionBackground({ intensity = 'normal' }: { intensity?: 'light' | 'normal' }) {
  const glowOpacity = intensity === 'light' ? '/20' : '/30';
  const dotOpacity = intensity === 'light' ? '/20' : '/30';

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Warm glows */}
      <div className={`absolute -top-20 -right-20 w-[350px] h-[350px] rounded-full bg-gold-300${glowOpacity} blur-[50px] animate-hero-glow-1`} />
      <div className={`absolute -bottom-20 -left-20 w-[300px] h-[300px] rounded-full bg-gold-200${glowOpacity} blur-[40px] animate-hero-glow-3`} />

      {/* Floating ring */}
      <div className="absolute top-[30%] right-[8%] w-14 h-14 rounded-full border border-gold-400/20 animate-ring-float-2" />

      {/* Small dots */}
      <div className={`absolute top-[25%] left-[10%] w-2 h-2 rounded-full bg-gold-400${dotOpacity} animate-dot-float-1`} />
      <div className={`absolute bottom-[35%] right-[20%] w-2.5 h-2.5 rounded-full bg-gold-300${dotOpacity} animate-dot-float-3`} />
    </div>
  );
}
