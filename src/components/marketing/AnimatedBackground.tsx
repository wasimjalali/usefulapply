'use client';

export function HeroBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Floating gold rings */}
      <div className="absolute top-[12%] left-[6%] w-28 h-28 rounded-full border-2 border-gold-400/20 animate-ring-float-1" />
      <div className="absolute top-[55%] right-[8%] w-20 h-20 rounded-full border-2 border-gold-300/25 animate-ring-float-2" />
      <div className="absolute bottom-[18%] left-[18%] w-24 h-24 rounded-full border border-gold-400/15 animate-ring-float-3" />
      <div className="absolute top-[30%] right-[22%] w-14 h-14 rounded-full border border-gold-300/20 animate-ring-float-1" />

      {/* Floating dots */}
      <div className="absolute top-[18%] right-[18%] w-3 h-3 rounded-full bg-gold-400/30 animate-dot-float-1" />
      <div className="absolute top-[48%] left-[4%] w-2.5 h-2.5 rounded-full bg-gold-500/25 animate-dot-float-2" />
      <div className="absolute bottom-[28%] right-[28%] w-2 h-2 rounded-full bg-gold-400/30 animate-dot-float-3" />
      <div className="absolute top-[32%] left-[22%] w-2 h-2 rounded-full bg-gold-300/35 animate-dot-float-1" />
      <div className="absolute top-[68%] right-[12%] w-1.5 h-1.5 rounded-full bg-gold-500/20 animate-dot-float-2" />
      <div className="absolute top-[42%] right-[38%] w-2.5 h-2.5 rounded-full bg-gold-400/20 animate-dot-float-3" />
      <div className="absolute bottom-[40%] left-[35%] w-2 h-2 rounded-full bg-gold-300/25 animate-dot-float-2" />

      {/* Diagonal light streaks */}
      <div className="absolute top-0 left-[20%] w-px h-[55%] bg-gradient-to-b from-gold-400/15 via-gold-300/8 to-transparent rotate-[20deg] origin-top animate-streak-1" />
      <div className="absolute top-0 right-[28%] w-px h-[45%] bg-gradient-to-b from-gold-300/12 via-gold-200/6 to-transparent rotate-[-15deg] origin-top animate-streak-2" />

      {/* Gold accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-400/50 to-transparent" />
    </div>
  );
}

export function SectionBackground({ intensity = 'normal' }: { intensity?: 'light' | 'normal' }) {
  const ringOpacity = intensity === 'light' ? 'border-gold-400/12' : 'border-gold-400/18';
  const dotOpacity = intensity === 'light' ? 'bg-gold-400/15' : 'bg-gold-400/25';

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Floating ring */}
      <div className={`absolute top-[25%] right-[6%] w-16 h-16 rounded-full border ${ringOpacity} animate-ring-float-2`} />

      {/* Floating dots */}
      <div className={`absolute top-[20%] left-[8%] w-2 h-2 rounded-full ${dotOpacity} animate-dot-float-1`} />
      <div className={`absolute bottom-[30%] right-[18%] w-2.5 h-2.5 rounded-full ${dotOpacity} animate-dot-float-3`} />
    </div>
  );
}
