'use client';

import { useEffect, useRef } from 'react';

const TOUR_KEY = 'karko_tour_v1';

export function useDashboardTour() {
  const hasTriggered = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Desktop only — mobile layout is completely different
    if (window.innerWidth < 768) return;
    // Only once per browser — persists across refreshes
    if (localStorage.getItem(TOUR_KEY) === 'done') return;
    if (hasTriggered.current) return;
    hasTriggered.current = true;

    // Wait for the page to fully render before starting
    const timer = setTimeout(async () => {
      const { driver } = await import('driver.js');

      const driverObj = driver({
        showProgress: true,
        progressText: '{{current}} of {{total}}',
        nextBtnText: 'Next →',
        prevBtnText: '← Back',
        doneBtnText: 'Got it!',
        overlayColor: 'rgba(15, 48, 87, 0.72)',
        popoverClass: 'karko-tour-popover',
        onDestroyStarted: () => {
          localStorage.setItem(TOUR_KEY, 'done');
          driverObj.destroy();
        },
        steps: [
          {
            element: '#tour-cv-upload',
            popover: {
              title: '1 — Upload Your CV',
              description:
                'This is where you start. Upload your existing CV (PDF, DOCX, or TXT — up to 10 MB). Karko AI parses it and uses it as the source of truth for every application it generates.',
              side: 'right',
              align: 'center',
            },
          },
          {
            element: '#tour-doc-tabs',
            popover: {
              title: '2 — Your Output Panels',
              description:
                'Once your application is generated, your tailored <strong>CV</strong>, <strong>ATS Score</strong>, <strong>Cover Letter</strong>, and <strong>Application Email</strong> all appear here as separate tabs. Inside the CV panel you can switch between 6 ATS-friendly templates.',
              side: 'bottom',
              align: 'start',
            },
          },
          {
            element: '#tour-chat-panel',
            popover: {
              title: '3 — Paste a Job Description',
              description:
                'Drop any job posting here and Karko AI will tailor your entire application to it.',
              side: 'left',
              align: 'center',
            },
          },
          {
            element: '#tour-mode-selector',
            popover: {
              title: '4 — Two Application Modes',
              description:
                '<strong>Apply Directly</strong> — skips analysis and generates your CV, cover letter, and email in one shot (2 credits).<br><br><strong>Analyze First</strong> — runs a fit assessment showing your match score and skill gaps before generating (0.5 + 2 credits). Best when you want to evaluate the role first.',
              side: 'top',
              align: 'center',
            },
          },
          {
            element: '#tour-doc-tabs',
            popover: {
              title: "You're all set!",
              description:
                "Upload your CV to get started. Your first tailored application — CV, cover letter, and email — is ready in 90 seconds.",
              side: 'bottom',
              align: 'start',
            },
          },
        ],
      });

      driverObj.drive();
    }, 900);

    return () => clearTimeout(timer);
  }, []);
}
