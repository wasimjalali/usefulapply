/**
 * Typo Corrections - Fixes common misspellings in certifications and tools
 * Extracted from unified-writer-agent.ts for reusability
 */

export const TYPO_CORRECTIONS: Record<string, string> = {
  // Certification/Tool typos
  'semrash': 'Semrush',
  'Semrash': 'Semrush',
  'SEMrash': 'Semrush',
  'semRash': 'Semrush',
  'ahrefs': 'Ahrefs',
  'Ahrefs': 'Ahrefs',
  'hubspot': 'HubSpot',
  'Hubspot': 'HubSpot',
  'mailchimp': 'Mailchimp',
  'MailChimp': 'Mailchimp',
  'linkedin': 'LinkedIn',
  'Linkedin': 'LinkedIn',
  'youtube': 'YouTube',
  'Youtube': 'YouTube',
  'github': 'GitHub',
  'Github': 'GitHub',
  'gitlab': 'GitLab',
  'Gitlab': 'GitLab',
  'javascript': 'JavaScript',
  'Javascript': 'JavaScript',
  'typescript': 'TypeScript',
  'Typescript': 'TypeScript',
  'nodejs': 'Node.js',
  'Nodejs': 'Node.js',
  'NodeJs': 'Node.js',
  'reactjs': 'React',
  'ReactJs': 'React',
  'vuejs': 'Vue.js',
  'VueJs': 'Vue.js',
  'nextjs': 'Next.js',
  'Nextjs': 'Next.js',
  'NextJs': 'Next.js',
  'mongodb': 'MongoDB',
  'Mongodb': 'MongoDB',
  'postgresql': 'PostgreSQL',
  'Postgresql': 'PostgreSQL',
  'mysql': 'MySQL',
  'Mysql': 'MySQL',
  'wordpress': 'WordPress',
  'Wordpress': 'WordPress',
  'shopify': 'Shopify',
  'woocommerce': 'WooCommerce',
  'Woocommerce': 'WooCommerce',
  'google analytics': 'Google Analytics',
  'Google analytics': 'Google Analytics',
  'google ads': 'Google Ads',
  'Google ads': 'Google Ads',
  'facebook ads': 'Facebook Ads',
  'Facebook ads': 'Facebook Ads',
  'tiktok': 'TikTok',
  'Tiktok': 'TikTok',
  'instagram': 'Instagram',
  'powerbi': 'Power BI',
  'PowerBi': 'Power BI',
  'Powerbi': 'Power BI',
  'tableau': 'Tableau',
  'salesforce': 'Salesforce',
  'jira': 'Jira',
  'asana': 'Asana',
  'trello': 'Trello',
  'slack': 'Slack',
  'figma': 'Figma',
  'canva': 'Canva',
  'photoshop': 'Photoshop',
  'illustrator': 'Illustrator',
};

/**
 * Fix common typos in text (certifications, tools, etc.)
 * Uses word boundary matching to avoid partial replacements
 */
export function fixTypos(text: string): string {
  let fixed = text;
  for (const [typo, correction] of Object.entries(TYPO_CORRECTIONS)) {
    const regex = new RegExp(`\\b${typo}\\b`, 'g');
    fixed = fixed.replace(regex, correction);
  }
  return fixed;
}

/**
 * Post-processing safety net: replace em-dashes and en-dashes with natural punctuation.
 * Prompt engineering reduces em-dash frequency to ~5-10%, but only deterministic
 * string replacement guarantees 0%. Applied after all LLM text generation.
 */
export function sanitizeDashes(text: string): string {
  return text
    .replace(/\s*—\s*/g, ', ')   // em-dash → comma + space
    .replace(/\s*–\s*/g, ', ')   // en-dash → comma + space
    .replace(/,\s*,/g, ',');     // clean up any resulting double commas
}

/**
 * Check if text contains any known typos
 */
export function hasTypos(text: string): boolean {
  for (const typo of Object.keys(TYPO_CORRECTIONS)) {
    const regex = new RegExp(`\\b${typo}\\b`, 'g');
    if (regex.test(text)) {
      return true;
    }
  }
  return false;
}
