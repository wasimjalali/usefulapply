// BrandLogo.tsx: Useful Apply logo component kit
// The mark is the letter U drawn as a sheet of paper: solid U with the top-right corner folded in gold.
// It is the first letter of the wordmark ("Useful Apply", Plus Jakarta Sans 800) and, standalone with
// no tile or background, it is also the icon, favicon and chat avatar. One drawing, everywhere.
// Same prop API as before, so call sites do not change.

import React from 'react';

// Brand colors (design-system tokens from globals.css)
export const BRAND_COLORS = {
  navyText: '#0C1929', // navy-900, U glyph and "seful" on light surfaces
  gold: '#D4A853', // gold-400, fold and "Apply" on dark surfaces
  goldText: '#C4932E', // gold-500, fold and "Apply" on light surfaces
  cream: '#FEFDFB', // cream-50
  white: '#FFFFFF', // U glyph and "seful" on dark surfaces
} as const;

interface LogoProps {
  variant?: 'full' | 'icon' | 'wordmark';
  theme?: 'light' | 'dark';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

// Height of the lockup and font size of the wordmark per size
const SIZES = {
  xs: { icon: 20, mark: 22, font: 17 },
  sm: { icon: 28, mark: 30, font: 22 },
  md: { icon: 36, mark: 38, font: 28 },
  lg: { icon: 48, mark: 50, font: 36 },
  xl: { icon: 64, mark: 64, font: 46 },
} as const;

const WORDMARK_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  lineHeight: 1,
  whiteSpace: 'nowrap',
};

// Glyph in an 84 x 100 box. Stems 24 wide to match the 800 weight of the wordmark.
// Body: U with the top-right corner cut on the diagonal. Fold: the gold triangle in that corner.
export const U_GLYPH_VIEWBOX = '0 0 84 100';
export const U_GLYPH_BODY =
  'M0 0 H24 V58 A18 18 0 0 0 60 58 V0 H62 L84 22 V58 A42 42 0 0 1 0 58 Z';
export const U_GLYPH_FOLD = 'M62 0 V22 H84 Z';

function glyphColors(theme: 'light' | 'dark') {
  return theme === 'light'
    ? { ink: BRAND_COLORS.navyText, fold: BRAND_COLORS.goldText }
    : { ink: BRAND_COLORS.white, fold: BRAND_COLORS.gold };
}

// ============================================
// 1. ICON: the U glyph alone, no tile, centered in a square box
//    Use for: favicon, chat avatar, empty states, small spaces
// ============================================
export function BrandIcon({
  theme = 'light',
  size = 'md',
  className = '',
}: Omit<LogoProps, 'variant'>) {
  const s = SIZES[size].icon;
  const { ink, fold } = glyphColors(theme);
  return (
    <svg
      width={s}
      height={s}
      viewBox="-8 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Useful Apply"
    >
      <path d={U_GLYPH_BODY} fill={ink} />
      <path d={U_GLYPH_FOLD} fill={fold} />
    </svg>
  );
}

// The U glyph sized to the cap height of the wordmark, sitting on its baseline
function WordmarkU({ theme }: { theme: 'light' | 'dark' }) {
  const { ink, fold } = glyphColors(theme);
  return (
    <svg
      viewBox={U_GLYPH_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ height: '0.74em', width: 'auto', display: 'inline-block', verticalAlign: 'baseline' }}
    >
      <path d={U_GLYPH_BODY} fill={ink} />
      <path d={U_GLYPH_FOLD} fill={fold} />
    </svg>
  );
}

// ============================================
// 2. WORDMARK: "Useful Apply" with the drawn U as its first letter
//    Use for: navbar, footer, auth pages, marketing
// ============================================
export function BrandWordmark({
  theme = 'light',
  size = 'md',
  className = '',
}: Omit<LogoProps, 'variant'>) {
  const dims = SIZES[size];
  const rest = theme === 'light' ? BRAND_COLORS.navyText : BRAND_COLORS.white;
  const apply = theme === 'light' ? BRAND_COLORS.goldText : BRAND_COLORS.gold;
  return (
    <span
      className={`flex w-max items-center ${className}`}
      style={{ height: dims.mark }}
      role="img"
      aria-label="Useful Apply"
    >
      <span style={{ ...WORDMARK_STYLE, fontSize: dims.font, color: rest }}>
        <WordmarkU theme={theme} />
        seful <span style={{ color: apply }}>Apply</span>
      </span>
    </span>
  );
}

// ============================================
// 3. FULL LOGO: the wordmark is the full logo, the U carries the mark
// ============================================
export function BrandLogoFull(props: Omit<LogoProps, 'variant'>) {
  return <BrandWordmark {...props} />;
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
