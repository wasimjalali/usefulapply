// BrandLogo.tsx: Useful Apply logo component kit
// Mark: two-tone paper plane (navy body, gold tip). Wordmark: "Useful Apply", Plus Jakarta Sans 800,
// "Useful" in navy, "Apply" in gold. Same prop API as the old KarkoLogo so call sites only rename.

import React from 'react';

// Brand colors (design-system tokens from globals.css)
export const BRAND_COLORS = {
  navy: '#1E3A5F', // navy-600, plane body and tiles
  navyText: '#0C1929', // navy-900, wordmark on light surfaces
  gold: '#D4A853', // gold-400, plane tip and gold on dark surfaces
  goldText: '#C4932E', // gold-500, "Apply" on light surfaces
  cream: '#FEFDFB', // cream-50, plane body on dark surfaces
  white: '#FFFFFF',
} as const;

interface LogoProps {
  variant?: 'full' | 'icon' | 'wordmark';
  theme?: 'light' | 'dark';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

// Height of the lockup and font size of the wordmark per size
const SIZES = {
  xs: { icon: 20, mark: 22, font: 17, gap: 6 },
  sm: { icon: 28, mark: 30, font: 22, gap: 8 },
  md: { icon: 36, mark: 38, font: 28, gap: 10 },
  lg: { icon: 48, mark: 50, font: 36, gap: 12 },
  xl: { icon: 64, mark: 64, font: 46, gap: 14 },
} as const;

const WORDMARK_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  lineHeight: 1,
  whiteSpace: 'nowrap',
};

// Paper plane paths in a 40x40 box. Body first, tip second.
const PLANE_BODY = 'M4 19.5 L36 5 L18.5 24.5 Z';
const PLANE_TIP = 'M18.5 24.5 L36 5 L23.5 36 Z';
// Smaller plane for use inside a tile
const TILE_PLANE_BODY = 'M8 20.5 L33 9 L19.5 24 Z';
const TILE_PLANE_TIP = 'M19.5 24 L33 9 L23.5 33 Z';

// ============================================
// 1. ICON: plane on a rounded tile
//    Use for: favicon, app icon, chat avatar, small spaces
// ============================================
export function BrandIcon({
  theme = 'light',
  size = 'md',
  className = '',
}: Omit<LogoProps, 'variant'>) {
  const s = SIZES[size].icon;
  const tile = theme === 'light' ? BRAND_COLORS.navy : BRAND_COLORS.gold;
  const body = theme === 'light' ? BRAND_COLORS.cream : BRAND_COLORS.navyText;
  const tip = theme === 'light' ? BRAND_COLORS.gold : BRAND_COLORS.cream;

  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Useful Apply"
    >
      <rect width="40" height="40" rx="10" fill={tile} />
      <path d={TILE_PLANE_BODY} fill={body} />
      <path d={TILE_PLANE_TIP} fill={tip} />
    </svg>
  );
}

// Plane without a tile, used inside the full lockup
function PlaneMark({ theme, size }: { theme: 'light' | 'dark'; size: number }) {
  const body = theme === 'light' ? BRAND_COLORS.navy : BRAND_COLORS.cream;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flex: 'none' }}
    >
      <path d={PLANE_BODY} fill={body} />
      <path d={PLANE_TIP} fill={BRAND_COLORS.gold} />
    </svg>
  );
}

function WordmarkText({ theme, font }: { theme: 'light' | 'dark'; font: number }) {
  const useful = theme === 'light' ? BRAND_COLORS.navyText : BRAND_COLORS.white;
  const apply = theme === 'light' ? BRAND_COLORS.goldText : BRAND_COLORS.gold;
  return (
    <span style={{ ...WORDMARK_STYLE, fontSize: font, color: useful }}>
      Useful <span style={{ color: apply }}>Apply</span>
    </span>
  );
}

// ============================================
// 2. WORDMARK ONLY: "Useful Apply" text
//    Use for: headers where the mark is separate
// ============================================
export function BrandWordmark({
  theme = 'light',
  size = 'md',
  className = '',
}: Omit<LogoProps, 'variant'>) {
  const dims = SIZES[size];
  return (
    <span
      className={`flex w-max items-center ${className}`}
      style={{ height: dims.mark }}
      role="img"
      aria-label="Useful Apply"
    >
      <WordmarkText theme={theme} font={dims.font} />
    </span>
  );
}

// ============================================
// 3. FULL LOGO: plane + wordmark
//    Use for: navbar, footer, auth pages, marketing
// ============================================
export function BrandLogoFull({
  theme = 'light',
  size = 'md',
  className = '',
}: Omit<LogoProps, 'variant'>) {
  const dims = SIZES[size];
  return (
    <span
      className={`flex w-max items-center ${className}`}
      style={{ height: dims.mark, gap: dims.gap }}
      role="img"
      aria-label="Useful Apply"
    >
      <PlaneMark theme={theme} size={dims.mark} />
      <WordmarkText theme={theme} font={dims.font} />
    </span>
  );
}

// ============================================
// 4. MAIN EXPORT: unified component with variant prop
// ============================================
export default function BrandLogo({
  variant = 'full',
  theme = 'light',
  size = 'md',
  className = '',
}: LogoProps) {
  switch (variant) {
    case 'icon':
      return <BrandIcon theme={theme} size={size} className={className} />;
    case 'wordmark':
      return <BrandWordmark theme={theme} size={size} className={className} />;
    case 'full':
    default:
      return <BrandLogoFull theme={theme} size={size} className={className} />;
  }
}
