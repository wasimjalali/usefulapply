// KarkoLogo.tsx — Karko AI Logo Component Kit
// Brand: Navy #0F1B3D | Gold #C8A44E | White #FFFFFF
// Font: Plus Jakarta Sans 800
// Usage: Import and use any variant across the app

import React from 'react';

// ============================================
// BRAND COLORS (use these across the app)
// ============================================
export const KARKO_BRAND = {
  navy: '#0F1B3D',
  navyMid: '#1A2D5A',
  gold: '#C8A44E',
  goldBright: '#E8B84D',
  goldLight: '#D4B86A',
  cream: '#FAF8F5',
  white: '#FFFFFF',
} as const;

// ============================================
// TYPES
// ============================================
interface LogoProps {
  variant?: 'full' | 'icon' | 'wordmark';
  theme?: 'light' | 'dark';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

// Size mappings
const SIZES = {
  xs: { icon: 20, full: { width: 130, height: 24 }, wordmark: { width: 110, height: 24 } },
  sm: { icon: 28, full: { width: 175, height: 32 }, wordmark: { width: 150, height: 32 } },
  md: { icon: 36, full: { width: 220, height: 40 }, wordmark: { width: 185, height: 40 } },
  lg: { icon: 48, full: { width: 280, height: 52 }, wordmark: { width: 240, height: 52 } },
  xl: { icon: 64, full: { width: 360, height: 64 }, wordmark: { width: 300, height: 64 } },
} as const;

// ============================================
// 1. ICON ONLY — The "K" Monogram
//    Use for: favicon, app icon, mobile nav, small spaces
// ============================================
export function KarkoIcon({
  theme = 'light',
  size = 'md',
  className = ''
}: Omit<LogoProps, 'variant'>) {
  const s = SIZES[size].icon;
  const bgColor = theme === 'light' ? KARKO_BRAND.navy : KARKO_BRAND.gold;
  const fgColor = theme === 'light' ? KARKO_BRAND.goldBright : KARKO_BRAND.navy;

  return (
    <svg 
      width={s} 
      height={s} 
      viewBox="0 0 40 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Karko AI"
    >
      <rect width="40" height="40" rx="10" fill={bgColor} />
      <text 
        x="20" 
        y="29" 
        fontFamily="'Plus Jakarta Sans', sans-serif" 
        fontWeight="800" 
        fontSize="24" 
        fill={fgColor} 
        textAnchor="middle"
      >
        K
      </text>
    </svg>
  );
}

// ============================================
// 2. WORDMARK ONLY — "Karko AI" text
//    Use for: headers where icon is separate, footer
// ============================================
export function KarkoWordmark({
  theme = 'light',
  size = 'md',
  className = ''
}: Omit<LogoProps, 'variant'>) {
  const dims = SIZES[size].wordmark;
  const textColor = theme === 'light' ? KARKO_BRAND.navy : KARKO_BRAND.white;

  return (
    <svg 
      width={dims.width} 
      height={dims.height} 
      viewBox="0 0 155 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Karko AI"
    >
      <text 
        x="0" 
        y="32" 
        fontFamily="'Plus Jakarta Sans', sans-serif" 
        fontWeight="800" 
        fontSize="34" 
        fill={textColor} 
        letterSpacing="-1"
      >
        Karko
      </text>
      <text 
        x="108" 
        y="32" 
        fontFamily="'Plus Jakarta Sans', sans-serif" 
        fontWeight="700" 
        fontSize="34" 
        fill={KARKO_BRAND.gold} 
        letterSpacing="-1"
      >
        AI
      </text>
    </svg>
  );
}

// ============================================
// 3. FULL LOGO — Icon + Wordmark combined
//    Use for: navbar, landing page, marketing
// ============================================
export function KarkoLogoFull({
  theme = 'light',
  size = 'md',
  className = ''
}: Omit<LogoProps, 'variant'>) {
  const dims = SIZES[size].full;
  const bgColor = theme === 'light' ? KARKO_BRAND.navy : KARKO_BRAND.gold;
  const fgColor = theme === 'light' ? KARKO_BRAND.goldBright : KARKO_BRAND.navy;
  const textColor = theme === 'light' ? KARKO_BRAND.navy : KARKO_BRAND.white;

  return (
    <svg 
      width={dims.width} 
      height={dims.height} 
      viewBox="0 0 192 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Karko AI"
    >
      {/* Icon */}
      <rect width="40" height="40" rx="10" fill={bgColor} />
      <text 
        x="20" 
        y="29" 
        fontFamily="'Plus Jakarta Sans', sans-serif" 
        fontWeight="800" 
        fontSize="24" 
        fill={fgColor} 
        textAnchor="middle"
      >
        K
      </text>
      {/* Wordmark */}
      <text 
        x="50" 
        y="32" 
        fontFamily="'Plus Jakarta Sans', sans-serif" 
        fontWeight="800" 
        fontSize="34" 
        fill={textColor} 
        letterSpacing="-1"
      >
        Karko
      </text>
      <text 
        x="156" 
        y="32" 
        fontFamily="'Plus Jakarta Sans', sans-serif" 
        fontWeight="700" 
        fontSize="34" 
        fill={KARKO_BRAND.gold} 
        letterSpacing="-1"
      >
        AI
      </text>
    </svg>
  );
}

// ============================================
// 4. MAIN EXPORT — Unified component with variant prop
// ============================================
export default function KarkoLogo({
  variant = 'full',
  theme = 'light',
  size = 'md',
  className = ''
}: LogoProps) {
  switch (variant) {
    case 'icon':
      return <KarkoIcon theme={theme} size={size} className={className} />;
    case 'wordmark':
      return <KarkoWordmark theme={theme} size={size} className={className} />;
    case 'full':
    default:
      return <KarkoLogoFull theme={theme} size={size} className={className} />;
  }
}
