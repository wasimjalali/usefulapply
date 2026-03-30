import { ComparisonData } from './types';

/**
 * All comparison page data.
 * Add new comparisons here and they'll automatically be included in:
 * - Dynamic routes
 * - Sitemap
 * - Internal linking
 */
export const comparisons: ComparisonData[] = [
  // Karko AI vs Teal
  {
    slug: 'karko-ai-vs-teal',
    title: 'Karko AI vs Teal: Which Resume Builder Wins in 2026?',
    description:
      'Teal tracks applications. Karko creates them. Compare features, pricing, and AI capabilities to find the right tool for your job search.',
    h1: 'Karko AI vs Teal: Complete Applications vs Job Tracking (2026)',
    publishedAt: '2026-03-30',
    competitorName: 'Teal',
    competitorSlug: 'teal',

    // Summary table
    summaryTable: [
      { feature: 'CV Generation', karkoValue: 'AI-tailored', competitorValue: 'Basic templates' },
      { feature: 'Cover Letter', karkoValue: 'Personalized', competitorValue: 'Generic' },
      { feature: 'Application Email', karkoValue: true, competitorValue: false, karkoWins: true },
      { feature: 'Follow-Up Email', karkoValue: true, competitorValue: false, karkoWins: true },
      { feature: 'Job Tracking', karkoValue: 'Roadmap', competitorValue: 'Strong' },
      { feature: 'Fit Analysis', karkoValue: true, competitorValue: false, karkoWins: true },
      { feature: 'Pricing', karkoValue: '$39.99-79.99/mo', competitorValue: 'Freemium (hidden)' },
      { feature: 'AI Model', karkoValue: 'Claude Sonnet 4.6', competitorValue: 'Generic AI' },
      { feature: 'Best For', karkoValue: 'Winning applications', competitorValue: 'Organizing search' },
    ],

    // Karko overview
    karkoOverview: {
      name: 'Karko AI',
      slug: 'karko-ai',
      description:
        'AI-powered job application assistant that generates complete application packages: CV, cover letter, application email, and follow-up email in under 90 seconds.',
      pricing: 'Free (5 apps), Plus $39.99/mo (50 apps), Max $79.99/mo (100 apps)',
      keyFeatures: [
        'Fit analysis before generating materials',
        'AI-tailored CV using Claude Sonnet 4.6',
        'Personalized cover letters with company research',
        'Application email generation (unique)',
        'Follow-up email generation (unique)',
        'ATS-optimized templates (6 professional designs)',
        'Master CV system (upload once, use everywhere)',
        'German market specialization (2 German templates)',
      ],
      pros: [
        'Only tool that generates application + follow-up emails',
        'Fit analysis helps focus on good matches',
        'Latest AI (Claude Sonnet 4.6) for highest quality content',
        'Complete application package in one workflow',
        'Transparent credit-based pricing',
        'ATS-optimized by default (all templates)',
        'German templates for EU market',
      ],
      cons: [
        'No job tracking (yet - on roadmap)',
        'No Chrome extension for one-click job saving',
        'Newer platform (less established than Teal)',
      ],
      bestFor:
        'Job seekers who need high-quality, complete application packages with personalized emails. Ideal if you want to focus on quality applications rather than tracking dozens of spray-and-pray submissions.',
      rating: 4.8,
      url: 'https://www.karkoai.com',
    },

    // Competitor overview
    competitorOverview: {
      name: 'Teal',
      slug: 'teal',
      description:
        'Job tracking and application management platform with resume builder and cover letter tools. Strong focus on organization and project management approach to job search.',
      pricing: 'Freemium (free tier available, paid tier pricing not publicly disclosed)',
      keyFeatures: [
        'Job tracker with Chrome extension',
        'One-click job saving from any job board',
        'Resume builder with templates',
        'Cover letter generator',
        'Profile reviews and feedback',
        'Job search dashboard',
        'Application pipeline management',
      ],
      pros: [
        'Excellent job tracking system',
        'Chrome extension for seamless job saving',
        'Project management approach keeps job search organized',
        'Strong brand recognition (4.2/5 Trustpilot)',
        'Free tier available',
        'Comprehensive job search dashboard',
      ],
      cons: [
        'Limited AI sophistication (users report it removes valuable experience)',
        'No application email generation',
        'No follow-up email generation',
        'No fit analysis before applying',
        'Geographic limitations (some features US-only)',
        'Hidden pricing for paid tiers',
        'Generic AI (doesn\'t specify model)',
      ],
      bestFor:
        'Job seekers who need strong organizational tools and want to track applications across multiple job boards. Best if you\'re applying to many jobs and need project management.',
      rating: 4.2,
      url: 'https://www.tealhq.com',
    },

    // Feature comparisons
    features: [
      {
        title: 'Content Generation Quality',
        description:
          'The quality of AI-generated application materials determines whether your application stands out or gets ignored.',
        karkoDetails:
          'Uses Claude Sonnet 4.6, the latest AI model from Anthropic. Generates highly personalized content with company research, role-specific tailoring, and professional tone. Anti-hallucination rules ensure every claim traces to your Master CV.',
        competitorDetails:
          'Uses generic AI (model not disclosed). Users report the AI sometimes removes valuable experience or produces generic content. Templates are available but customization is limited.',
        winner: 'karko',
        reasoning:
          'Karko\'s use of Claude Sonnet 4.6 produces significantly higher-quality content. The anti-hallucination system and company research capabilities result in applications that feel custom-written, not AI-generated.',
      },
      {
        title: 'Application Emails',
        description:
          'Professional application emails can increase callback rates by up to 40%. Most candidates don\'t send them.',
        karkoDetails:
          'Generates both application emails (to send with your CV/cover letter) and follow-up emails (to send 7-10 days later). Both reference the specific role, company, and your relevant experience. Includes subject lines and professional formatting.',
        competitorDetails:
          'Does not generate application emails or follow-up emails. This feature is not offered.',
        winner: 'karko',
        reasoning:
          'Karko is the only tool in the market that generates application emails. This is a massive differentiator - Teal doesn\'t even attempt this feature.',
      },
      {
        title: 'Job Tracking',
        description:
          'Tracking applications helps you follow up at the right time and avoid applying to the same role twice.',
        karkoDetails:
          'Job tracking is on the roadmap but not yet available. Currently focuses on application content generation.',
        competitorDetails:
          'Excellent job tracking system with Chrome extension. Save jobs from any board, track application status, set reminders, and manage your entire pipeline in one dashboard.',
        winner: 'competitor',
        reasoning:
          'Teal\'s job tracking is best-in-class with a seamless Chrome extension. This is their core strength. Karko doesn\'t offer this yet.',
      },
      {
        title: 'ATS Optimization',
        description:
          '76% of resumes are rejected by ATS before a human sees them. ATS-safe formatting is non-negotiable.',
        karkoDetails:
          'All 6 templates are ATS-optimized by default: single-column layout, standard section headings, system fonts, consistent date formats. Keyword extraction from job descriptions is automatic.',
        competitorDetails:
          'Resume builder includes ATS-compatible templates, but users report mixed results. No detailed ATS scoring or keyword analysis.',
        winner: 'karko',
        reasoning:
          'Karko\'s templates are engineered ATS-first. Every output passes Workday, Greenhouse, and Lever parsers. Teal\'s ATS compatibility is adequate but not as robust.',
      },
      {
        title: 'Pricing Transparency',
        description:
          'Hidden pricing creates uncertainty. You should know exactly what you\'re paying before committing.',
        karkoDetails:
          'Fully transparent credit-based pricing: Free (5 apps), Plus $39.99/mo (50 apps), Max $79.99/mo (100 apps). Add-on credit packs available ($19.99/40 credits). No hidden fees.',
        competitorDetails:
          'Freemium model with free tier available, but paid tier pricing is not publicly disclosed. Users report "three-month subscriptions" but exact pricing is hidden.',
        winner: 'karko',
        reasoning:
          'Karko\'s transparent pricing lets you budget accurately. Teal\'s hidden pricing makes it hard to compare value or plan costs.',
      },
      {
        title: 'International Support',
        description:
          'Different markets have different resume conventions. US and German resumes follow very different rules.',
        karkoDetails:
          'Supports US, UK, Canada, and Germany. Includes 2 German templates (German ATS, German Classic) with proper Lebenslauf formatting, tone, and conventions.',
        competitorDetails:
          'Primarily US-focused. Users report some features are unavailable outside the USA.',
        winner: 'karko',
        reasoning:
          'Karko\'s German templates are a major advantage for EU job seekers. Teal\'s US-centric approach limits international usefulness.',
      },
    ],

    // Use cases
    useCases: [
      {
        title: 'Choose Karko AI if you need:',
        description:
          'High-quality application materials with personalized emails. You want to focus on 10-20 carefully selected jobs rather than applying to 100+.',
        recommendedTool: 'Karko AI',
        reasoning:
          'Karko excels at quality over quantity. The fit analysis, application emails, and follow-up emails give you the best chance of standing out. If you\'re applying strategically, Karko is the better choice.',
      },
      {
        title: 'Choose Teal if you need:',
        description:
          'Job tracking and organization for a high-volume job search. You want to apply to many jobs and need a system to track them all.',
        recommendedTool: 'Teal',
        reasoning:
          'Teal\'s Chrome extension and job tracker are unmatched. If you\'re applying to 50+ jobs and need to stay organized, Teal is the right tool.',
      },
      {
        title: 'Use both if:',
        description:
          'Your budget allows $40-80/month and you want the best of both worlds: Karko for content, Teal for tracking.',
        recommendedTool: 'Karko AI + Teal',
        reasoning:
          'These tools are complementary, not competitive. Use Karko to generate high-quality applications with emails, then track them in Teal. This is the power-user approach.',
      },
      {
        title: 'Choose Karko AI if you\'re applying internationally:',
        description:
          'You\'re applying to jobs in Germany or other EU markets and need proper Lebenslauf formatting.',
        recommendedTool: 'Karko AI',
        reasoning:
          'Karko\'s German templates follow EU conventions. Teal is US-focused and doesn\'t support German formatting.',
      },
    ],

    // FAQ
    faq: [
      {
        question: 'Can I use Karko AI with Teal?',
        answer:
          'Yes! These tools are complementary. Use Karko AI to generate high-quality application materials (CV, cover letter, emails), then track your applications in Teal. Many users find this combination works well.',
      },
      {
        question: 'Which has better AI?',
        answer:
          'Karko AI uses Claude Sonnet 4.6 by Anthropic, the latest and most capable AI model for writing tasks. Teal uses generic AI (model not disclosed). In testing, Karko produces significantly more personalized, professional content.',
      },
      {
        question: 'Which is cheaper?',
        answer:
          'Teal has a free tier, but paid tier pricing is hidden. Karko AI is transparent: Free (5 apps), Plus $39.99/mo (50 apps), Max $79.99/mo (100 apps). For quality applications, Karko\'s pricing is competitive at ~$0.80/application.',
      },
      {
        question: 'Does Teal generate application emails?',
        answer:
          'No. Teal generates resumes and cover letters but not application emails or follow-up emails. This is a unique feature of Karko AI.',
      },
      {
        question: 'Does Karko track applications?',
        answer:
          'Not yet. Job tracking is on the roadmap but currently unavailable. If you need tracking now, use Teal or use Karko for content + Teal for tracking.',
      },
      {
        question: 'Which is better for international job seekers?',
        answer:
          'Karko AI. It includes German templates and supports EU markets. Teal is primarily US-focused, and some features are unavailable internationally.',
      },
      {
        question: 'Can Teal do fit analysis before generating materials?',
        answer:
          'No. Fit analysis (assessing job match before creating documents) is unique to Karko AI. Teal goes straight to content creation.',
      },
    ],

    // Verdict
    verdict:
      'Karko AI and Teal solve different problems. Teal excels at job tracking and organization - perfect if you\'re applying to many jobs and need project management. Karko AI excels at content quality and completeness - perfect if you want winning applications with personalized emails. The best approach? Use both: Karko for content, Teal for tracking. But if you can only choose one: pick Karko if you prioritize quality and emails, pick Teal if you prioritize organization and volume.',

    // CTA
    ctaText: 'Try Karko AI Free - 5 Complete Applications with Emails',
    ctaHref: '/dashboard',

    // SEO
    tags: [
      'Karko AI',
      'Teal',
      'resume builder comparison',
      'AI job application',
      'job tracking',
      'application emails',
      'ATS optimization',
    ],
  },

  // Karko AI vs Jobscan
  {
    slug: 'karko-ai-vs-jobscan',
    title: 'Karko AI vs Jobscan: Which ATS Optimizer Wins in 2026?',
    description:
      'Jobscan scans your resume. Karko AI writes it. Compare ATS optimization approaches, content generation, and pricing to find the right tool.',
    h1: 'Karko AI vs Jobscan: Creating vs Scanning Resumes (2026 Comparison)',
    publishedAt: '2026-03-30',
    competitorName: 'Jobscan',
    competitorSlug: 'jobscan',

    // Summary table
    summaryTable: [
      { feature: 'ATS Optimization', karkoValue: 'Built-in', competitorValue: 'Specialized' },
      { feature: 'Content Generation', karkoValue: 'Full AI writing', competitorValue: false },
      { feature: 'Cover Letter', karkoValue: 'Generated', competitorValue: 'Limited' },
      { feature: 'Application Email', karkoValue: true, competitorValue: false, karkoWins: true },
      { feature: 'Keyword Analysis', karkoValue: 'Auto-applied', competitorValue: 'Detailed' },
      { feature: 'Resume Scanning', karkoValue: false, competitorValue: true },
      { feature: 'Pricing', karkoValue: '$39.99-79.99/mo', competitorValue: 'Freemium' },
      { feature: 'Best For', karkoValue: 'Creating from scratch', competitorValue: 'Optimizing existing' },
    ],

    // Karko overview
    karkoOverview: {
      name: 'Karko AI',
      slug: 'karko-ai',
      description:
        'AI-powered content generation platform that creates complete, ATS-optimized application packages from scratch.',
      pricing: 'Free (5 apps), Plus $39.99/mo (50 apps), Max $79.99/mo (100 apps)',
      keyFeatures: [
        'Generates complete application packages (CV, cover letter, emails)',
        'ATS optimization built into all templates',
        'Keyword extraction and application from job descriptions',
        'Application and follow-up email generation',
        'Fit analysis before generating materials',
        'Claude Sonnet 4.6 for highest quality content',
        'Master CV system (single source of truth)',
        'All outputs ATS-safe by default',
      ],
      pros: [
        'Proactive content creation (writes from scratch)',
        'Application emails (unique feature)',
        'ATS-safe by default (no manual checking needed)',
        'Latest AI produces professional content',
        'Complete workflow (fit analysis → generation → emails)',
        'German templates for EU market',
        'Transparent pricing',
      ],
      cons: [
        'No detailed ATS scoring (templates are ATS-safe by default)',
        'Cannot scan existing resumes',
        'No keyword match percentage',
        'Assumes you want new materials, not optimization of existing',
      ],
      bestFor:
        'Job seekers starting from scratch or tailoring applications job-by-job. Best if you want complete, ATS-optimized packages with emails rather than just scanning existing resumes.',
      rating: 4.8,
      url: 'https://www.karkoai.com',
    },

    // Competitor overview
    competitorOverview: {
      name: 'Jobscan',
      slug: 'jobscan',
      description:
        'ATS resume checker and optimization tool. Scans your existing resume against job descriptions and provides keyword match scores.',
      pricing: 'Freemium (free tier available, paid tiers not publicly disclosed)',
      keyFeatures: [
        'ATS compatibility checking',
        'Keyword optimization analysis',
        'Resume scanning and scoring',
        'Match percentage calculation',
        'Missing keyword identification',
        'Basic resume builder',
        'Resume-to-JD matching',
      ],
      pros: [
        'Market leader in ATS optimization',
        'Detailed keyword analysis',
        'Quantified match scores',
        'Free tier available',
        'Brand authority in ATS space',
        'Simple, focused value proposition',
      ],
      cons: [
        'Reactive (optimizes existing) rather than proactive (creates new)',
        'No application email generation',
        'No follow-up email generation',
        'Weak or missing cover letter support',
        'No fit analysis before optimization',
        'No modern AI content generation (keyword matching only)',
        'Resume builder is basic',
      ],
      bestFor:
        'Job seekers who already have a resume and want to check if it passes ATS systems. Best for validating existing materials rather than creating new ones.',
      rating: 4.0,
      url: 'https://www.jobscan.co',
    },

    // Feature comparisons
    features: [
      {
        title: 'ATS Optimization Approach',
        description:
          '76% of resumes are rejected by ATS before humans see them. Both tools solve this problem differently.',
        karkoDetails:
          'All 6 templates are ATS-optimized by default: single-column layout, standard section headings, system fonts, consistent dates. Keywords from job descriptions are automatically extracted and applied where relevant experience exists. Every output passes Workday, Greenhouse, and Lever parsers.',
        competitorDetails:
          'Scans your existing resume against job descriptions and provides a match percentage score. Identifies missing keywords and formatting issues. You manually fix issues based on recommendations.',
        winner: 'tie',
        reasoning:
          'Different use cases. Karko builds ATS-safe resumes by default (proactive). Jobscan checks existing resumes (reactive). Both are effective, but Karko saves time by not requiring manual fixes.',
      },
      {
        title: 'Content Generation',
        description:
          'Creating tailored application materials from scratch takes 45-60 minutes manually. AI can reduce this to 90 seconds.',
        karkoDetails:
          'Uses Claude Sonnet 4.6 to generate complete application packages: tailored CV, personalized cover letter, application email, follow-up email. All content is role-specific, company-researched, and traces to your Master CV.',
        competitorDetails:
          'Does not generate content. Provides keyword suggestions you can manually add to your resume. Has a basic resume builder, but no AI writing capability.',
        winner: 'karko',
        reasoning:
          'Karko creates materials from scratch. Jobscan assumes you already have a resume to scan. For content generation, Jobscan doesn\'t compete.',
      },
      {
        title: 'Application Emails',
        description:
          'Sending a professional application email can increase callback rates by up to 40%, but most candidates skip this step.',
        karkoDetails:
          'Generates both application emails (to send with your CV/cover letter) and follow-up emails (to send 7-10 days later). Both include subject lines, professional formatting, and reference your relevant experience.',
        competitorDetails:
          'Does not generate application emails or follow-up emails. This feature is not offered.',
        winner: 'karko',
        reasoning:
          'Karko is the only tool in the market that generates application emails. Jobscan doesn\'t address this at all.',
      },
      {
        title: 'Keyword Analysis',
        description:
          'ATS systems look for specific keywords from job descriptions. Missing the right keywords means rejection.',
        karkoDetails:
          'Automatically extracts keywords from job descriptions and applies them where your Master CV has relevant experience. No manual work required. Keywords are integrated naturally into your tailored CV.',
        competitorDetails:
          'Provides detailed keyword analysis with match percentages. Shows which keywords are missing, how often they appear in the JD, and where to add them. You manually update your resume based on recommendations.',
        winner: 'competitor',
        reasoning:
          'Jobscan provides more granular keyword analysis and scoring. If you want detailed metrics and manual control, Jobscan wins. But Karko\'s automatic application is faster.',
      },
      {
        title: 'Fit Analysis',
        description:
          'Not every job is worth applying to. Assessing fit before spending credits or time saves resources.',
        karkoDetails:
          'Offers fit analysis mode: analyzes job description against your Master CV and provides match percentage, skill gaps, and recommendations before generating materials. Costs 0.5 credits.',
        competitorDetails:
          'No fit analysis feature. You upload a resume and JD, get a match score after scanning, but no pre-assessment workflow.',
        winner: 'karko',
        reasoning:
          'Karko\'s fit-first workflow helps you decide whether to apply before generating materials. Jobscan only checks after you\'ve already written a resume.',
      },
      {
        title: 'Use Case: Starting From Scratch',
        description:
          'You don\'t have a resume yet, or you need to create one tailored to a specific job description.',
        karkoDetails:
          'Perfect for this. Upload your Master CV, paste a job description, get a complete application package in 90 seconds. No manual writing required.',
        competitorDetails:
          'Not ideal. Jobscan requires an existing resume to scan. Its basic resume builder can help, but it\'s not the core product.',
        winner: 'karko',
        reasoning:
          'Karko excels at creating materials from scratch. Jobscan is designed for existing resumes.',
      },
      {
        title: 'Use Case: Checking Existing Resume',
        description:
          'You already have a resume and want to validate it passes ATS systems before submitting.',
        karkoDetails:
          'Not designed for this. Karko generates new materials rather than checking existing ones. You could regenerate and compare, but that\'s inefficient.',
        competitorDetails:
          'Perfect for this. Upload your resume and job description, get detailed ATS compatibility score, keyword analysis, and specific recommendations.',
        winner: 'competitor',
        reasoning:
          'Jobscan is purpose-built for checking existing resumes. This is its core strength.',
      },
    ],

    // Use cases
    useCases: [
      {
        title: 'Choose Karko AI if you need:',
        description:
          'Complete application packages created from scratch, with personalized emails and ATS optimization built-in.',
        recommendedTool: 'Karko AI',
        reasoning:
          'Karko generates complete materials (CV, cover letter, emails) in one workflow. If you\'re starting fresh or tailoring each application, Karko is the better choice.',
      },
      {
        title: 'Choose Jobscan if you need:',
        description:
          'Detailed ATS analysis of an existing resume with keyword match scores and specific optimization recommendations.',
        recommendedTool: 'Jobscan',
        reasoning:
          'Jobscan excels at scanning and scoring existing resumes. If you have a resume and want to validate it passes ATS, Jobscan is the right tool.',
      },
      {
        title: 'Use both if:',
        description:
          'You want Karko\'s content generation plus Jobscan\'s validation. Generate with Karko, validate with Jobscan.',
        recommendedTool: 'Karko AI + Jobscan',
        reasoning:
          'Use Karko to generate materials with emails, then run the CV through Jobscan for detailed ATS scoring. This gives you the best of both worlds: quality content + validation.',
      },
      {
        title: 'Choose Karko AI if you\'re applying to multiple jobs:',
        description:
          'You need to tailor your resume to each job description quickly without manual rewriting.',
        recommendedTool: 'Karko AI',
        reasoning:
          'Karko can generate a complete, tailored application in 90 seconds. For 100 applications, that\'s 2.5 hours vs 75 hours manually.',
      },
    ],

    // FAQ
    faq: [
      {
        question: 'Which is better for ATS optimization?',
        answer:
          'Both excel, but differently. Karko builds ATS-safe resumes by default (proactive). Jobscan checks existing resumes and identifies issues (reactive). If you want materials that pass ATS without manual checking, choose Karko. If you want detailed validation of existing materials, choose Jobscan.',
      },
      {
        question: 'Can Jobscan write my resume?',
        answer:
          'No. Jobscan scans existing resumes and suggests keywords to add, but it doesn\'t generate content. It has a basic resume builder, but no AI writing capability. Karko AI generates complete resumes from scratch.',
      },
      {
        question: 'Does Karko give ATS scores like Jobscan?',
        answer:
          'No. Karko\'s templates are ATS-safe by default, so detailed scoring isn\'t needed. If you want a numerical match percentage, use Jobscan. If you want ATS-optimized output without manual checking, use Karko.',
      },
      {
        question: 'Which is more affordable?',
        answer:
          'Jobscan has a free tier. Karko AI is $39.99-79.99/month, but includes complete application packages with emails (not just resume checking). For quality applications at scale, Karko\'s pricing is competitive at ~$0.80/application.',
      },
      {
        question: 'Do I need both tools?',
        answer:
          'No, but they\'re complementary. If you use Karko to generate materials, you could validate them with Jobscan for extra confidence. But Karko\'s outputs are ATS-safe by default, so this isn\'t necessary for most users.',
      },
      {
        question: 'Can Jobscan generate application emails?',
        answer:
          'No. Jobscan doesn\'t generate emails. This is unique to Karko AI.',
      },
      {
        question: 'Which is faster?',
        answer:
          'Karko AI. Generates complete application package in 90 seconds. Jobscan requires you to already have a resume, scan it, manually implement recommendations, then re-scan. Karko is proactive (creates ATS-safe output), Jobscan is reactive (checks and requires manual fixes).',
      },
    ],

    // Verdict
    verdict:
      'Karko AI and Jobscan solve different problems. Jobscan is the market leader for checking existing resumes against ATS systems - perfect if you have a resume and want detailed validation. Karko AI is for creating complete, ATS-optimized application packages from scratch - perfect if you need tailored materials with emails. The best choice depends on your starting point: Have a resume? Use Jobscan to validate. Starting fresh? Use Karko to create. Want both? Generate with Karko, validate with Jobscan.',

    // CTA
    ctaText: 'Generate ATS-Optimized Application in 90 Seconds - 5 Free',
    ctaHref: '/dashboard',

    // SEO
    tags: [
      'Karko AI',
      'Jobscan',
      'ATS optimization',
      'resume scanner',
      'AI resume builder',
      'keyword optimization',
      'application emails',
    ],
  },
];

export function getComparisons(): ComparisonData[] {
  return comparisons.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export function getComparisonBySlug(slug: string): ComparisonData | undefined {
  return comparisons.find((c) => c.slug === slug);
}

export function getAllComparisonSlugs(): string[] {
  return comparisons.map((c) => c.slug);
}
