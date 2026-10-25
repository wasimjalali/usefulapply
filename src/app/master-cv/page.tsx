'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Copy, Check, FileText, Sparkles, Target, Clock, ArrowRight, CheckCircle } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { SEO_SITE_URL } from '@/lib/seo/site-url';

// The Master CV Prompt
const MASTER_CV_PROMPT = `You are helping me create a Master CV, a complete inventory of my professional background. This is NOT a regular CV to send to employers. It's a detailed reference document (up to 5 pages) that an AI job application tool will use to generate tailored applications for me.

=== YOUR INSTRUCTIONS ===

1. Ask me questions ONE SECTION AT A TIME
2. After each section, summarize what I told you before moving on
3. Ask follow-up questions to get specific METRICS (revenue, followers, percentages, time saved, etc.)
4. At the end, compile everything into the structured format below
5. Remind me to verify all information before using it

=== RULES ===

- Only include FACTS, no future plans or aspirations
- Every achievement needs a NUMBER if possible
- Include YEARS OF EXPERIENCE for each skill
- Length: 5-10 pages, 3,000-7,000 words (strictly under 20,000 characters)
- No marketing language ("passionate", "driven", "dynamic")
- Help me identify my PROFESSIONAL MINDSET (see mindset types below)

=== SECTIONS TO COVER ===

**Section 1: Personal Information**
- Full name, date of birth, nationality
- Current location, email, phone
- Driver's license, work authorization
- Open to relocation? Which cities?

**Section 2: Professional Mindset**
- How do you approach work? (Ask me questions to identify my type)
- What do you do when you face a problem?
- Have you ever BUILT something to solve a problem?
- How do you learn new skills?

Mindset types to identify:
- Builder Mindset: Creates solutions when facing problems (prove with projects built)
- Growth Mindset: Constantly learning and improving (prove with skills learned)
- Analytical Mindset: Makes data-driven decisions (prove with examples)
- Entrepreneurial Mindset: Takes initiative and ownership (prove with businesses/projects led)
- Problem-Solver Mindset: Finds solutions others miss (prove with specific outcomes)
- Systems Mindset: Creates processes and frameworks (prove with systems implemented)

**Section 3: Work Experience**
For EACH job, ask:
- Job title, company name, location, dates
- Main responsibilities
- ACHIEVEMENTS WITH NUMBERS: revenue, costs saved, growth %, projects completed, team size, etc.
- Tools and technologies used
- Problems solved

**Section 4: Projects (Side projects, things built, businesses started)**
For EACH project, ask:
- Project name
- What PROBLEM were you solving?
- What did you BUILD?
- What technology/tools?
- What was the RESULT? (with numbers)

**Section 5: Education**
- Degree, institution, location, year
- Final grade/GPA
- Notable achievements

**Section 6: Certifications**
For EACH certification:
- Exact name, issuer, date
- Expiration date (if any)
- Certificate ID or verification link

**Section 7: Skills**
Ask about skills in categories:
- Technical/Development (with years)
- AI & Automation (with years)
- Marketing (with years)
- Business/Operations (with years)
- Soft skills

**Section 8: Languages**
For EACH language:
- Language, level (Native/Fluent/Intermediate/Basic)
- Certification and score (if any)

**Section 9: Quantified Achievements**
Compile ALL metrics mentioned into one table.
Ask: "Any other achievements with specific numbers?"

**Section 10: Available Documents**
- CV versions (languages?)
- Certificates as documents
- Portfolio/GitHub
- Professional photo

=== OUTPUT FORMAT ===

Structure the final document exactly like this:

---

# [Full Name] - Master CV (Skills & Experience Inventory)

**Purpose:** Factual reference document for job applications.
**Last Updated:** [Date]

---

## Personal Information

- **Full Name:** [X]
- **Date of Birth:** [X]
- **Nationality:** [X]
- **Location:** [X]
- **Email:** [X]
- **Phone:** [X]
- **Driver's License:** [X]
- **Work Authorization:** [X]
- **Relocation:** [X]

---

## Professional Mindset - [Type] Approach

*[One sentence describing their approach]*

### How This Shows in My Work:

**Example 1:** [Problem faced] → [What they did] → [Result with metric]
**Example 2:** [Problem faced] → [What they did] → [Result with metric]

### Ready-to-Use Framing for Applications:

**For Technical Roles:** "[Sentence they can use]"
**For Business Roles:** "[Sentence they can use]"
**For Startup Roles:** "[Sentence they can use]"

---

## Projects

### [Project Name]
**[Date Range]**

- **Problem:** [What they were solving]
- **Solution:** [What they built]
- **Technology:** [Stack used]
- **Results:** [Metrics]

---

## Professional Experience

### [Job Title] | [Company Name]
**[Location] | [Start Date] – [End Date]**

- [Achievement with metric]
- [Achievement with metric]
- Tools: [List]

---

## Education

### [Degree]
**[Institution] | [Location] | [Year]**

- Grade: [X]
- Notable: [X]

---

## Certifications

### [Category]

| Certification | Issuer | Date | ID |
|---------------|--------|------|-----|
| [Name] | [Issuer] | [Date] | [ID] |

---

## Skills Inventory

### [Category]
- [Skill] ([X] years)
- [Skill] ([X] years)

---

## Languages

| Language | Level | Certification |
|----------|-------|---------------|
| [X] | [X] | [X] |

---

## Quantified Achievements

| Achievement | Metric | Context |
|-------------|--------|---------|
| [X] | [X] | [X] |

---

## Documents Available

1. [Document]
2. [Document]

---

## Notes for Application Systems

- **Primary Mindset:** [X]
- **Primary Strength:** [X]
- **Differentiator:** [X]
- **Availability:** [X]

---

## ⚠️ Verification Checklist

Before using this Master CV, verify:
- [ ] All dates are correct
- [ ] All metrics are accurate
- [ ] All certification IDs are valid
- [ ] All skills can be demonstrated

**Verified by:** _________________ **Date:** _____________

---

*This document contains only verified, factual information.*

---

=== NOW START ===

Begin by asking me Section 1: Personal Information.`;

export default function MasterCVPage() {
  const [copied, setCopied] = useState(false);

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(MASTER_CV_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const SITE_URL = SEO_SITE_URL;

  // Breadcrumb JSON-LD
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Master CV',
        item: `${SITE_URL}/master-cv`,
      },
    ],
  };

  // HowTo JSON-LD
  const howToJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Create Your Master CV in 30 Minutes',
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Copy the Master CV creation prompt',
        text: 'Copy the provided structured prompt designed to guide you through creating a comprehensive Master CV.',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Paste into an AI chatbot',
        text: 'Paste the prompt into Claude, ChatGPT, Gemini, or another AI assistant.',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Answer questions section by section',
        text: 'The AI will guide you through your professional history one section at a time: personal information, mindset, work history, skills, education, certifications, and languages.',
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: 'Compile into structured format',
        text: 'The AI will compile all information into a complete, ATS-compatible Master CV document.',
      },
      {
        '@type': 'HowToStep',
        position: 5,
        name: 'Upload to Useful Apply',
        text: 'Upload your completed Master CV to Useful Apply to generate tailored job applications.',
      },
    ],
  };

  // Article JSON-LD
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Create Your Master CV',
    description:
      'A Master CV is a comprehensive skills inventory (5-10 pages) that powers hyper-personalized job applications. Build it once, use it for every application.',
    author: { '@type': 'Organization', name: 'Useful Apply', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Useful Apply',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon-512x512.png` },
    },
    image: `${SITE_URL}/opengraph-image`,
    url: `${SITE_URL}/master-cv`,
    datePublished: '2026-02-20',
    dateModified: '2026-03-30',
  };

  return (
    <div className="min-h-screen bg-canvas">
      <Navbar />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <main>
      {/* Hero Section */}
      <section className="pt-20 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <ScrollReveal delay={0} direction="down" distance={20}>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-surface rounded-pill border border-border text-sm text-ink-body mb-8 shadow-resting">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="font-medium">The Foundation of Great Applications</span>
          </div>
          </ScrollReveal>
          <ScrollReveal delay={150}>
          <h1 className="font-bold text-brand text-[44px] sm:text-[52px] lg:text-[56px] leading-[1.05] tracking-tight mb-6">
            Create your <span className="text-accent-strong">Master CV.</span>
          </h1>
          </ScrollReveal>
          <ScrollReveal delay={300}>
          <p className="text-xl text-ink-muted max-w-2xl mx-auto leading-relaxed">
            A Master CV is a comprehensive skills inventory (5-10 pages) that powers hyper-personalized job applications. Build it once, use it for every application.
          </p>
          </ScrollReveal>
        </div>
      </section>

      {/* What is a Master CV */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-surface-raised">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-ink-accent uppercase tracking-[0.12em] mb-3">Understanding</p>
            <h2 className="font-bold text-brand text-[32px] md:text-[40px] leading-[1.1] mb-4">
              What is a Master CV?
            </h2>
            <p className="text-lg text-ink-muted max-w-2xl mx-auto">
              It is not something you send to employers. It is a detailed reference document containing your complete professional history, so Useful Apply can create perfectly tailored applications.
            </p>
          </div>
          </ScrollReveal>

          {/* Key Benefits */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Target,
                title: 'Better Personalization',
                description: 'AI draws from your complete history to find the most relevant experience.',
              },
              {
                icon: Clock,
                title: 'Save Time',
                description: 'No more trying to remember past projects. Everything is documented.',
              },
              {
                icon: FileText,
                title: 'Never Miss Details',
                description: 'All certifications, projects, and awards captured and ready.',
              },
              {
                icon: Sparkles,
                title: 'Stronger Applications',
                description: 'More material means better cover letters with specific examples.',
              },
            ].map((benefit, i) => {
              const Icon = benefit.icon;
              return (
                <ScrollReveal key={i} delay={i * 100}>
                <div className="bg-surface rounded-card p-6 border border-border">
                  <div className="w-12 h-12 bg-surface-raised rounded-control flex items-center justify-center mb-4 shadow-resting">
                    <Icon className="w-6 h-6 text-brand" />
                  </div>
                  <h3 className="text-base font-bold text-ink-body mb-2">{benefit.title}</h3>
                  <p className="text-ink-muted text-sm leading-relaxed">{benefit.description}</p>
                </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* The Prompt Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-brand">
        <div className="max-w-4xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-10">
            <p className="text-xs font-semibold text-accent uppercase tracking-[0.12em] mb-3">Get Started</p>
            <h2 className="font-bold text-ink-inverse text-[32px] md:text-[40px] leading-[1.1] mb-4">
              Create your Master CV in 30 minutes.
            </h2>
            <p className="text-lg text-ink-inverse-muted">
              Copy this prompt and paste it into Claude, ChatGPT, or Gemini. The AI will guide you through a structured interview to capture your complete professional history.
            </p>
          </div>
          </ScrollReveal>

          <ScrollReveal delay={200}>
          {/* Prompt Box */}
          <div className="bg-surface-inverse-raised rounded-card border border-border-inverse-mid overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-inverse-mid">
              <span className="text-sm font-medium text-ink-inverse-muted">Master CV Creation Prompt</span>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-strong text-accent-ink rounded-control transition-colors font-semibold cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Prompt
                  </>
                )}
              </button>
            </div>
            <div className="p-6 max-h-96 overflow-auto scrollbar-on-dark">
              <pre className="text-sm text-ink-inverse-tint whitespace-pre-wrap font-mono leading-relaxed">
                {MASTER_CV_PROMPT}
              </pre>
            </div>
          </div>

          <p className="text-center text-ink-inverse-muted text-sm mt-6">
            Supported chatbots: Claude, ChatGPT, Gemini, and others
          </p>
          </ScrollReveal>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-surface-inverse-raised relative overflow-hidden">
        <ScrollReveal>
        <div className="max-w-4xl mx-auto text-center relative">
          <h2 className="font-bold text-ink-inverse text-[32px] md:text-[40px] leading-[1.1] mb-4">
            Ready to create your Master CV?
          </h2>
          <p className="text-lg text-ink-inverse-muted mb-10 max-w-2xl mx-auto">
            Copy the prompt above, create your Master CV in about 30 minutes, then upload it to Useful Apply to supercharge your job applications.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={handleCopyPrompt}
              className="w-full sm:w-auto px-8 py-3.5 bg-accent hover:bg-accent-strong text-accent-ink font-semibold rounded-control transition-colors flex items-center justify-center gap-2 text-base cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Prompt copied!' : 'Copy the prompt'}
            </button>
            <Link
              href="/dashboard"
              className="w-full sm:w-auto px-8 py-3.5 border border-ink-inverse/30 text-ink-inverse font-semibold rounded-control hover:bg-ink-inverse/10 transition-colors flex items-center justify-center gap-2 text-base"
            >
              Upload your CV
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
        </ScrollReveal>
      </section>
      </main>
      <Footer />
    </div>
  );
}
