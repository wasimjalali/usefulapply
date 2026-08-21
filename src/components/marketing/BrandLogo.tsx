// BrandLogo (marketing): approved logo concept A, "Page-U".
// A document sheet with a gold folded corner, the U carved into the page.
// In the wordmark the icon replaces the letter U of "Useful", sized to the cap
// height and baseline-aligned so the lockup reads as one word: "Useful Apply".
// Wordmark font: Plus Jakarta Sans 700 (the brand wordmark font).

import React from 'react';

interface LogoProps {
  variant?: 'full' | 'icon' | 'wordmark';
  theme?: 'light' | 'dark';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

// Height of the lockup and font size of the wordmark per size
const SIZES = {
  xs: { mark: 22, font: 17 },
  sm: { mark: 30, font: 22 },
  md: { mark: 38, font: 28 },
  lg: { mark: 50, font: 36 },
  xl: { mark: 64, font: 46 },
} as const;

const WORDMARK_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  lineHeight: 1,
  whiteSpace: 'nowrap',
};

// The Page-U drawing. Tight viewBox around the sheet so its rendered height
// maps exactly to the cap height when placed in the wordmark.
// Sheet: x 7-25, y 3-28 in the 32x32 reference grid.
const PAGE_VIEWBOX = '7 3 18 25';

const PAGE_PATH = 'M7 3 h12 l6 6 v10 c0 5 -4 9 -9 9 s-9 -4 -9 -9 Z';
const FOLD_PATH = 'M19 3 l6 6 h-6 Z';
const U_PATH = 'M12 12 v6.5 a4 4 0 0 0 8 0 V12';

function pageColors(theme: 'light' | 'dark') {
  return theme === 'light'
    ? { page: '#1E3A5F', fold: '#D4A853', carve: '#FEFDFB' }
    : { page: '#FEFDFB', fold: '#D4A853', carve: '#12243B' };
}

function PageU({ theme }: { theme: 'light' | 'dark' }) {
  const { page, fold, carve } = pageColors(theme);
  return (
    <>
      <path d={PAGE_PATH} fill={page} />
      <path d={FOLD_PATH} fill={fold} />
      <path
        d={U_PATH}
        stroke={carve}
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

// ============================================
// 1. ICON: the Page-U sheet alone, centered on its square reference grid
//    Use for: favicons, small spaces, standalone marks
// ============================================
export function BrandIcon({
  theme = 'light',
  size = 'md',
  className = '',
}: Omit<LogoProps, 'variant'>) {
  return (
    <svg
      width={32}
      height={32}
      viewBox="0 0 32 32"
      style={{ width: SIZES[size].mark, height: SIZES[size].mark }}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Useful Apply"
    >
      <PageU theme={theme} />
    </svg>
  );
}

// The sheet sized to the cap height of the wordmark, sitting on its baseline
function WordmarkPageU({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <svg
      viewBox={PAGE_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ height: '0.74em', width: 'auto', display: 'inline-block', verticalAlign: 'baseline' }}
    >
      <PageU theme={theme} />
    </svg>
  );
}

// ============================================
// 2. WORDMARK: "Useful Apply" with the Page-U sheet as its first letter
// ============================================
export function BrandWordmark({
  theme = 'light',
  size = 'md',
  className = '',
}: Omit<LogoProps, 'variant'>) {
  const dims = SIZES[size];
  const rest = theme === 'light' ? '#0C1929' : '#FFFFFF';
  const apply = theme === 'light' ? '#C4932E' : '#FFFFFF';
  return (
    <span
      className={`flex w-max items-center ${className}`}
      style={{ height: dims.mark }}
      role="img"
      aria-label="Useful Apply"
    >
      <span style={{ ...WORDMARK_STYLE, fontSize: dims.font, color: rest }}>
        <WordmarkPageU theme={theme} />
        seful <span style={{ color: apply }}>Apply</span>
      </span>
    </span>
  );
}

// ============================================
// 3. FULL LOGO: the wordmark is the full logo, the sheet carries the mark
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
