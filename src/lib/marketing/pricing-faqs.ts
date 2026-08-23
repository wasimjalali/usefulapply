export interface PricingFAQ {
  question: string;
  answer: string;
}

export const pricingFAQs: PricingFAQ[] = [
  {
    question: 'What exactly do I get with each application?',
    answer:
      'One application gives you a CV rewritten for the specific role, a cover letter, an application email, and a follow-up email. Plus and Max also include AI-drafted answers to screening questions. Every word is pulled from your real CV. All of it in under 90 seconds.',
  },
  {
    question: 'Are all features the same across plans?',
    answer:
      'Nearly. Free gets the core workflow: tailored CV, cover letter, application email, follow-up, fit analysis, ATS templates, the application tracker and a Smart Job Feed of the top 5 roles a day. Plus and Max add screening question answers and a larger feed at up to 25 roles a day. Max searches wider, 4 job titles across 4 countries against Plus at 2 and 2. The main difference between plans is how many applications you can generate each month.',
  },
  {
    question: 'What happens if I run out of credits?',
    answer:
      'Plus and Max subscribers can buy add-on credit packs any time ($19.99 for 50 credits, 25 more applications). Add-on credits roll over while your subscription is active. Free tier credits reset monthly. You can also upgrade your plan for immediate access to more credits.',
  },
  {
    question: 'Do unused credits expire?',
    answer:
      'Monthly credits reset at each billing cycle. Add-on credits roll over as long as your subscription is active. Upgrade to Plus or Max to unlock add-on credit packs.',
  },
  {
    question: 'Can I change or cancel my plan?',
    answer:
      'Yes. Upgrade any time for immediate access to more credits. Downgrade or cancel at the end of your billing cycle. No hidden fees, no lock-in contracts.',
  },
  {
    question: 'Why Useful Apply is not a resume builder.',
    answer:
      'Resume builders help you format one CV. Useful Apply runs your entire job search. The feed finds the roles. The fit analysis tells you if it is worth applying. The generator writes the CV, cover letter, emails, and screening answers tailored to each role. The tracker keeps the list. It replaces seven separate tools with one loop.',
  },
  {
    question: 'Why Useful Apply is not an auto-apply bot.',
    answer:
      'Auto-apply bots blast hundreds of generic applications. Recruiters spot them, ATS systems flag them, and candidates get embarrassed in interviews. Useful Apply does the opposite: fewer applications, all tailored to the real role, all traceable to your real experience. You stay in control of what gets sent.',
  },
  {
    question: 'How does Useful Apply keep its output honest?',
    answer:
      'Every CV rewrite, cover letter, email, and screening answer is built from the CV you upload. Useful Apply will not invent job titles, skills, or experience you do not have. The job description is used for keyword alignment and tone, never as a source of facts about you. This is the one rule the product refuses to break.',
  },
  {
    question: 'What AI model powers Useful Apply?',
    answer:
      'Useful Apply runs on Claude Sonnet 4.6 by Anthropic, one of the most capable models available for writing. Most competitors use cheaper open-source models. We pay for the better model because the output has to survive both an ATS scan and a recruiter’s read. On top of that, the workflow around the model is tuned specifically for job applications.',
  },
  {
    question: 'How does Useful Apply pricing compare to Teal?',
    answer:
      'Teal offers a free tier but does not publish its paid pricing. Useful Apply is fully transparent: Free (2 applications), Plus $19.99/mo (25 applications), Max $79.99/mo (100 applications). Unlike Teal, Useful Apply writes the full application (CV, cover letter, emails, screening answers), not just the resume. See our full comparison at /compare/usefulapply-vs-teal.',
  },
  {
    question: 'How does Useful Apply pricing compare to Jobscan?',
    answer:
      'Jobscan offers a free tier for resume scanning, but does not generate application content. Useful Apply writes the full application (CV, cover letter, application email, follow-up email, and on Plus and Max, screening answers) from scratch, ATS-safe by default. Different tools for different needs. See our full comparison at /compare/usefulapply-vs-jobscan.',
  },
];
