/**
 * Design Tokens - Color Palettes and Typography Standards
 * Centralized design system configuration
 */

export const COLORS = {
  // Primary Colors
  navy: {
    50: '#f0f4f8',
    100: '#d9e2ec',
    200: '#bcccdc',
    300: '#9fb3c8',
    400: '#829ab1',
    500: '#627d98',
    600: '#0F3057', // Primary navy
    700: '#243b53',
    800: '#102a43',
    900: '#0a1f33',
  },
  
  gold: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#F4A261', // Primary gold
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
  },
  
  sage: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#8BA888', // Primary sage
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },
  
  cream: {
    50: '#FAF9F6', // Primary cream
    100: '#FAF9F6',
    200: '#f5f3ed',
    300: '#e8e6df',
    400: '#d4d1c7',
    500: '#b8b5ab',
    600: '#9c998f',
    700: '#807d73',
    800: '#646157',
    900: '#48453b',
  },
  
  // Text Colors
  charcoal: '#2D3748',
  warmGray: '#718096',
  
  // Semantic Colors
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

export const TYPOGRAPHY = {
  // Font Families
  fontFamily: {
    sans: "'Arial', 'Helvetica', sans-serif",
    serif: "'Georgia', 'Times New Roman', serif",
    mono: "'Courier New', monospace",
  },
  
  // Font Sizes (2026 Standards)
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem', // 36px
  },
  
  // Line Heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
  
  // Letter Spacing
  letterSpacing: {
    tight: '-0.5px',
    normal: '0',
    wide: '0.5px',
  },
  
  // Font Weights
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};

export const SPACING = {
  0: '0',
  1: '0.25rem',  // 4px
  2: '0.5rem',   // 8px
  3: '0.75rem',  // 12px
  4: '1rem',     // 16px
  5: '1.25rem',  // 20px
  6: '1.5rem',   // 24px
  8: '2rem',     // 32px
  10: '2.5rem',  // 40px
  12: '3rem',    // 48px
  16: '4rem',    // 64px
};

export const BORDER_RADIUS = {
  none: '0',
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  full: '9999px',
};

export const SHADOWS = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
};

// CV Template Specific
export const CV_COLORS = {
  premiumNavy: '#0F3057',
  text: '#1A1A1A',
  textLight: '#4a5568',
  headerBg: '#FFFFFF',
  border: '#0F3057',
  highlight: '#f0f4f8',
};

export const CV_TYPOGRAPHY = {
  // Headers use serif for authority
  headerFont: "'Georgia', 'Times New Roman', serif",
  // Body uses sans-serif for readability
  bodyFont: "'Arial', 'Helvetica', sans-serif",
  
  // Font sizes for CV
  nameSize: '28px',
  titleSize: '16px',
  headerSize: '14px',
  bodySize: '11px',
  contactSize: '12px',
  
  // Line height for CV (tighter for space efficiency)
  lineHeight: 1.2,
  letterSpacing: '-0.5px',
};
