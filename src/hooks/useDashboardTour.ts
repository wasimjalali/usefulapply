'use client';

import { useEffect, useRef } from 'react';

const TOUR_KEY = 'karko_tour_v1';

export function useDashboardTour() {
  const hasTriggered = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 768) return;
    if (localStorage.getItem(TOUR_KEY) === 'done') return;
    if (hasTriggered.current) return;
    hasTriggered.current = true;

    const timer = setTimeout(async () => {
      const { driver } = await import('driver.js');

      const driverObj = driver({
        showProgress: true,
        progressText: '{{current}} of {{total}}',
        nextBtnText: 'Next →',
        prevBtnText: '← Back',
        doneBtnText: 'Done ✓',
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
                'Start here. PDF, DOCX, or TXT up to 10 MB. Everything Karko generates is built from your CV.',
              side: 'right',
              align: 'center',
            },
          },
          {
            element: '#tour-doc-tabs',
            popover: {
              title: 'Your Output Tabs',
              description:
                'Your tailored <strong>CV</strong>, <strong>Cover Letter</strong>, and <strong>Email</strong> each get their own tab. Switch between <strong>6 ATS-friendly templates</strong> inside the CV tab.',
              side: 'bottom',
              align: 'start',
            },
          },
          {
            element: '#tour-chat-panel',
            popover: {
              title: 'Paste a Job Description',
              description:
                'Drop any job posting here. Karko tailors your full application to match it — CV, cover letter, and email in one go.',
              side: 'left',
              align: 'center',
            },
          },
          {
            element: '#tour-mode-selector',
            popover: {
              title: 'Two Application Modes',
              description:
                '<strong>Apply Directly</strong> — full application in one shot (2 credits).<br><strong>Analyze First</strong> — see your match score before generating (0.5 + 2 credits).',
              side: 'top',
              align: 'center',
            },
          },
          {
            element: '#tour-tracker',
            popover: {
              title: 'Application Tracker',
              description:
                'Every application saves here automatically. Track status from applied to offer, and access all your documents in one place.',
              side: 'bottom',
              align: 'center',
            },
          },
          {
            element: '#tour-cv-upload',
            popover: {
              title: "You're all set!",
              description:
                'Upload your CV right here to get started. Your first tailored application is about 90 seconds away.',
              side: 'right',
              align: 'center',
            },
          },
        ],
      });

      // Show opt-in welcome modal before starting the tour
      const overlay = document.createElement('div');
      overlay.className = 'karko-tour-welcome-overlay';
      overlay.innerHTML = `
        <div class="karko-tour-welcome-card">
          <div class="karko-tour-welcome-icon">✦</div>
          <h2 class="karko-tour-welcome-title">Want a quick tour?</h2>
          <p class="karko-tour-welcome-desc">See the key features in about 30 seconds.</p>
          <div class="karko-tour-welcome-actions">
            <button class="karko-tour-skip-btn">Skip</button>
            <button class="karko-tour-start-btn">Show me →</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('.karko-tour-start-btn')?.addEventListener('click', () => {
        overlay.remove();
        driverObj.drive();
      });

      overlay.querySelector('.karko-tour-skip-btn')?.addEventListener('click', () => {
        localStorage.setItem(TOUR_KEY, 'done');
        overlay.remove();
      });
    }, 900);

    return () => clearTimeout(timer);
  }, []);
}
