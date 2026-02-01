/**
 * Standardized Font Configuration for CV Templates
 * Ensures consistent typography across all templates
 */

export const CV_FONT_STANDARDS = {
  // Font families
  families: {
    primary: 'Arial, Helvetica, sans-serif',
    secondary: 'Georgia, "Times New Roman", serif',
    mono: '"Courier New", Courier, monospace',
  },
  
  // Font sizes (in points for print, rem for screen)
  sizes: {
    // Name/Title
    name: {
      print: '24pt',
      screen: '1.875rem', // 30px
    },
    // Section headers (EXPERIENCE, EDUCATION, etc.)
    sectionHeader: {
      print: '12pt',
      screen: '0.875rem', // 14px
    },
    // Job titles, degree names
    subheader: {
      print: '11pt',
      screen: '0.8125rem', // 13px
    },
    // Company names, institutions
    tertiary: {
      print: '10pt',
      screen: '0.75rem', // 12px
    },
    // Body text, bullet points
    body: {
      print: '10pt',
      screen: '0.75rem', // 12px
    },
    // Small text (dates, labels)
    small: {
      print: '9pt',
      screen: '0.6875rem', // 11px
    },
    // Extra small (footer, page numbers)
    xs: {
      print: '8pt',
      screen: '0.625rem', // 10px
    },
  },
  
  // Line heights
  lineHeights: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
  
  // Font weights
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  
  // Letter spacing
  letterSpacing: {
    tight: '-0.01em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
};

// Tailwind class mappings for consistent styling
export const CV_TAILWIND_CLASSES = {
  // Name styling
  name: 'text-3xl font-bold tracking-wide',
  
  // Section headers
  sectionHeader: 'text-sm font-bold uppercase tracking-wider',
  
  // Job title / Position
  jobTitle: 'text-sm font-bold leading-tight',
  
  // Company / Institution
  company: 'text-sm font-medium',
  
  // Body text
  body: 'text-xs leading-relaxed',
  
  // Bullet points
  bullet: 'text-xs leading-relaxed',
  
  // Dates
  date: 'text-xs',
  
  // Labels (Geburtsdatum, Email, etc.)
  label: 'text-xs font-medium',
  
  // Skills
  skill: 'text-xs',
  
  // Languages
  language: 'text-xs font-semibold',
  languageLevel: 'text-xs',
};

// Print-specific styles
export const CV_PRINT_STYLES = `
  /* Standard CV Typography for Print */
  .cv-template {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    line-height: 1.4;
    color: #1a1a2e;
  }
  
  .cv-template h1 {
    font-size: 24pt;
    font-weight: 700;
    line-height: 1.2;
    margin-bottom: 4pt;
  }
  
  .cv-template h2 {
    font-size: 12pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
    margin-bottom: 8pt;
    padding-bottom: 4pt;
  }
  
  .cv-template h3 {
    font-size: 11pt;
    font-weight: 700;
    line-height: 1.3;
    margin-bottom: 2pt;
  }
  
  .cv-template p,
  .cv-template li {
    font-size: 10pt;
    line-height: 1.4;
  }
  
  .cv-template ul {
    padding-left: 12pt;
    margin: 4pt 0;
  }
  
  .cv-template li {
    margin-bottom: 2pt;
  }
  
  .cv-template .section {
    margin-bottom: 12pt;
  }
  
  .cv-template .date-column {
    font-size: 9pt;
    color: #4a5568;
  }
  
  .cv-template .label {
    font-size: 9pt;
    font-weight: 500;
    color: #4a5568;
  }
`;
