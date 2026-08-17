import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Useful Apply',
    short_name: 'Useful Apply',
    description:
      'Generate tailored CVs, cover letters, and emails in 90 seconds. AI-powered job applications with zero fabrication, ATS optimization, and fit scoring.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FAF7F2',
    theme_color: '#1E3A5F',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    categories: ['productivity', 'business', 'education'],
    lang: 'en-US',
    dir: 'ltr',
  };
}
