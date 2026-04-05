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
              title: 'Upload Your CV',
              description:
                'This is where everything begins. Upload your existing CV (PDF, DOCX, or TXT — up to 10 MB) and Karko AI will use it as the source of truth for every application.',
              side: 'right',
              align: 'center',
            },
          },
          {
            element: '#tour-doc-tabs',
            popover: {
              title: 'Your Output Panels',
              description:
                'After generating, your tailored <strong>CV</strong>, <strong>ATS Score</strong>, <strong>Cover Letter</strong>, and <strong>Application Email</strong> each get their own tab. Switch between <strong>6 ATS-friendly templates</strong> inside the CV panel.',
              side: 'bottom',
              align: 'start',
            },
          },
          {
            element: '#tour-chat-panel',
            popover: {
              title: 'Paste a Job Description',
              description:
                'Drop any job posting here and Karko AI will tailor your entire application to match it — CV, cover letter, and email in one go.',
              side: 'left',
              align: 'center',
            },
          },
          {
            element: '#tour-mode-selector',
            popover: {
              title: 'Two Application Modes',
              description:
                '<strong>Apply Directly</strong> — generates your full application in one shot (2 credits).<br><br><strong>Analyze First</strong> — shows your match score and skill gaps before generating (0.5 + 2 credits).',
              side: 'top',
              align: 'center',
            },
          },
          {
            element: '#tour-tracker',
            popover: {
              title: 'Application Tracker',
              description:
                'Every application you generate is automatically saved here — company, role, match score, and all your documents. Track status from applied to offer, all in one place.',
              side: 'bottom',
              align: 'center',
            },
          },
          {
            element: '#tour-cv-upload',
            popover: {
              title: "You're ready!",
              description:
                "Start by uploading your CV right here. Your first tailored application is 90 seconds away.",
              side: 'right',
              align: 'center',
            },
          },
        ],
      });

      driverObj.drive();
    }, 900);

    return () => clearTimeout(timer);
  }, []);
}
