'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Copy, Check, FileText, Sparkles, Target, Clock, ArrowRight, CheckCircle } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';

// The Master CV Prompt
const MASTER_CV_PROMPT = `You are helping me create a Master CV — a complete inventory of my professional background. This is NOT a regular CV to send to employers. It's a detailed reference document (5-10 pages) that an AI job application tool will use to generate tailored applications for me.

=== YOUR INSTRUCTIONS ===

1. Ask me questions ONE SECTION AT A TIME
2. After each section, summarize what I told you before moving on
3. Ask follow-up questions to get specific METRICS (revenue, followers, percentages, time saved, etc.)
4. At the end, compile everything into the structured format below
5. Remind me to verify all information before using it

=== RULES ===

- Only include FACTS — no future plans or aspirations
- Every achievement needs a NUMBER if possible
- Include YEARS OF EXPERIENCE for each skill
- Length: 5-10 pages, 3,000-7,000 words (max 15 pages / 15,000 words)
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

# [Full Name] — Master CV (Skills & Experience Inventory)

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

## Professional Mindset — [Type] Approach

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
**[Institution] — [Location] | [Year]**

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

  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />

      {/* Hero Section */}
      <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gold-100 rounded-full text-gold-700 text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            The Foundation of Great Applications
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-navy-600 mb-6 leading-tight">
            Create Your Master CV
          </h1>
          <p className="text-xl text-warm-gray max-w-2xl mx-auto">
            The complete skills inventory that powers hyper-personalized job applications. 
            Build it once, use it for every application.
          </p>
        </div>
      </section>

      {/* What is a Master CV */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-navy-600 mb-4">
              What is a Master CV?
            </h2>
            <p className="text-warm-gray max-w-2xl mx-auto">
              A Master CV is your comprehensive professional document — containing EVERYTHING about your career, 
              not just what fits on 2 pages.
            </p>
          </div>

          {/* Comparison Table */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-red-50 rounded-2xl p-8 border border-red-100">
              <h3 className="text-lg font-semibold text-red-700 mb-4">Regular CV</h3>
              <ul className="space-y-3">
                {[
                  '1-2 pages maximum',
                  'Tailored to ONE specific job',
                  'Many achievements left out',
                  'Created from scratch each time',
                  'Easy to forget past achievements',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-red-700">
                    <span className="text-red-400 mt-1">✗</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-sage-50 rounded-2xl p-8 border border-sage-100">
              <h3 className="text-lg font-semibold text-sage-700 mb-4">Master CV</h3>
              <ul className="space-y-3">
                {[
                  '5-10+ pages of everything',
                  'Complete career inventory',
                  'ALL achievements documented',
                  'Source material for every application',
                  'Nothing forgotten or overlooked',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sage-700">
                    <CheckCircle className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Why You Need One */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-navy-600 mb-4">
              Why You Need a Master CV
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Target,
                title: 'Better AI Personalization',
                description: 'KarKo AI draws from your complete history to find the MOST relevant experience for each job.',
              },
              {
                icon: Clock,
                title: 'Save Hours Per Application',
                description: 'No more trying to remember that project from 3 years ago. Everything is documented and ready.',
              },
              {
                icon: FileText,
                title: 'Never Miss an Achievement',
                description: 'That certification, that side project, that award — all captured and available when needed.',
              },
              {
                icon: Sparkles,
                title: 'Stronger Cover Letters',
                description: 'With more material to draw from, your cover letters can include specific, relevant examples.',
              },
              {
                icon: CheckCircle,
                title: 'Interview Preparation',
                description: 'Your Master CV becomes your interview prep document — refresh your memory before any call.',
              },
              {
                icon: ArrowRight,
                title: 'Career Progression Tracking',
                description: 'See your growth over time. Update it after each achievement to keep it current.',
              },
            ].map((benefit, i) => {
              const Icon = benefit.icon;
              return (
                <div key={i} className="bg-white rounded-xl p-6 hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 bg-navy-100 rounded-xl flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-navy-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-charcoal mb-2">{benefit.title}</h3>
                  <p className="text-warm-gray text-sm">{benefit.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How to Create */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-navy-600 mb-4">
              How to Create Your Master CV
            </h2>
            <p className="text-warm-gray">
              Use the prompt below with any AI chatbot (Claude, ChatGPT, Gemini) to create your Master CV through a guided interview.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 mb-12">
            {[
              { step: '1', title: 'Copy the Prompt', description: 'Click the copy button below to get the Master CV creation prompt.' },
              { step: '2', title: 'Paste into AI Chat', description: 'Open Claude, ChatGPT, or Gemini and paste the prompt.' },
              { step: '3', title: 'Answer Questions', description: 'The AI will interview you systematically to capture everything.' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-gold-400 text-white font-bold rounded-full mb-3">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-charcoal mb-2">{item.title}</h3>
                <p className="text-warm-gray text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Prompt Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-navy-600">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-4">
              The Master CV Prompt
            </h2>
            <p className="text-navy-200">
              Copy this prompt and paste it into your favorite AI chatbot to get started.
            </p>
          </div>

          {/* Prompt Box */}
          <div className="bg-navy-700 rounded-2xl border border-navy-500 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-navy-500">
              <span className="text-sm font-medium text-navy-200">Master CV Creation Prompt</span>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-2 px-4 py-2 bg-gold-400 text-white rounded-lg hover:bg-gold-500 transition-colors font-medium"
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
            <div className="p-6 max-h-96 overflow-auto">
              <pre className="text-sm text-navy-100 whitespace-pre-wrap font-mono leading-relaxed">
                {MASTER_CV_PROMPT}
              </pre>
            </div>
          </div>

          <p className="text-center text-navy-200 text-sm mt-6">
            Supported chatbots: Claude, ChatGPT, Gemini, and others
          </p>
        </div>
      </section>

      {/* What's Included */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-navy-600 mb-4">
              What Your Master CV Will Include
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              'Contact Information & Online Presence',
              'Professional Summary & Value Proposition',
              'Complete Work Experience with Metrics',
              'Education & Academic Achievements',
              'Certifications & Professional Licenses',
              'Technical & Soft Skills Inventory',
              'Language Proficiencies',
              'Projects & Portfolio Work',
              'Publications & Speaking Engagements',
              'Volunteer Work & Community Involvement',
              'Awards & Recognition',
              'Additional Career Information',
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-white rounded-lg p-4 border border-cream-200">
                <CheckCircle className="w-5 h-5 text-sage-500 flex-shrink-0" />
                <span className="text-charcoal">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-gold-400 to-gold-500">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-navy-600 mb-4">
            Ready to Create Your Master CV?
          </h2>
          <p className="text-navy-700 mb-8 max-w-2xl mx-auto">
            Copy the prompt above, create your Master CV, then upload it to KarKo AI to supercharge your job applications.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={handleCopyPrompt}
              className="w-full sm:w-auto px-8 py-4 bg-navy-600 text-white font-semibold rounded-xl hover:bg-navy-700 transition-colors shadow-lg flex items-center justify-center gap-2"
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              {copied ? 'Prompt Copied!' : 'Copy the Prompt'}
            </button>
            <Link
              href="/auth/signup"
              className="w-full sm:w-auto px-8 py-4 bg-white text-navy-600 font-semibold rounded-xl hover:bg-cream-50 transition-colors flex items-center justify-center gap-2"
            >
              Sign Up to Upload
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
