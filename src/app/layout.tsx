import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/components/ui/Toast";
import { PostHogProvider } from "@/providers/PostHogProvider";
import PostHogPageView from "@/providers/PostHogPageView";
import { BRAND } from '@/lib/brand';

// Inter is the single UI family (next/font self-hosts it at build time).
// The CV templates and exported documents keep Arial and Georgia; the brand
// wordmark keeps Plus Jakarta.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || BRAND.url;

// Without this every prerendered page is served with s-maxage=31536000, so a
// copy change only reaches visitors after a manual Cloudflare purge. Five
// minutes at the edge, and child segments can still set their own.
export const revalidate = 300;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Useful Apply | AI Job Application Agent',
    template: '%s | Useful Apply',
  },
  description:
    'Useful Apply optimizes your CV, generates tailored cover letters, and creates professional application emails in under 90 seconds.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
  keywords: [
    'AI job application',
    'CV optimizer',
    'resume builder',
    'cover letter generator',
    'ATS-friendly resume',
    'job application assistant',
    'AI resume',
    'Useful Apply',
    'career tools',
    'job search AI',
    'AI CV writer',
    'tailored resume',
    'automated job application',
    'CV for ATS',
    'AI cover letter writer',
    'job application email generator',
    'resume optimization tool',
    'AI career assistant',
    'apply to jobs faster',
    'one click job application',
  ],
  authors: [{ name: 'Useful Apply', url: SITE_URL }],
  creator: 'Useful Apply',
  publisher: 'Useful Apply',
  alternates: {
    canonical: '/',
    types: {
      'application/rss+xml': `${SITE_URL}/feed.xml`,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'Useful Apply',
    title: 'Useful Apply | AI Job Application Agent',
    description:
      'Optimize your CV, generate tailored cover letters, and create professional application emails in minutes with AI.',
    images: [
      {
        url: '/opengraph-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Useful Apply | AI Job Application Agent',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Useful Apply | AI Job Application Agent',
    description:
      'Optimize your CV, generate tailored cover letters, and create professional application emails in minutes with AI.',
    images: ['/opengraph-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  category: 'technology',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" translate="no" suppressHydrationWarning>
      <head>
        {/* Disable browser translation. Translation extensions (Google Translate,
            Edge, Safari, Firefox) replace text nodes with <font> wrappers, which
            breaks React's reconciler and surfaces as
            "Failed to execute 'removeChild' on 'Node'" during commit. */}
        <meta name="google" content="notranslate" />
        <link rel="author" href={`${SITE_URL}/about`} />
        {/* Organization Schema — site-wide */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Useful Apply',
              legalName: 'Karko AI Inc',
              url: SITE_URL,
              logo: `${SITE_URL}/favicon-512x512.png`,
              description:
                'Useful Apply helps job seekers apply smarter with AI-powered CV optimization, cover letter generation, and application email drafting.',
              founder: {
                '@type': 'Person',
                name: 'Wasim Jalali',
                jobTitle: 'Founder',
                url: `${SITE_URL}/about`,
                image: `${SITE_URL}/wasim-founder.jpg`,
              },
              foundingDate: '2025',
              address: {
                '@type': 'PostalAddress',
                streetAddress: '1207 Delaware Ave #412',
                addressLocality: 'Wilmington',
                addressRegion: 'DE',
                postalCode: '19806',
                addressCountry: 'US',
              },
              contactPoint: {
                '@type': 'ContactPoint',
                email: 'support@usefulapply.com',
                url: `${SITE_URL}/contact`,
                contactType: 'customer support',
                availableLanguage: ['English', 'German'],
              },
              sameAs: [
                'https://www.trustpilot.com/review/karkoai.com',
              ],
            }),
          }}
        />
        {/* WebSite Schema — canonical site entity for AI search engines */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'Useful Apply',
              url: SITE_URL,
              description:
                'AI job application agent. Generate tailored CVs, cover letters, and emails in 90 seconds.',
              publisher: {
                '@type': 'Organization',
                name: 'Useful Apply',
                url: SITE_URL,
              },
              inLanguage: 'en-US',
            }),
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${plusJakarta.variable} antialiased`}
        suppressHydrationWarning
      >
        <PostHogProvider>
          <AuthProvider>
            <PostHogPageView />
            <ToastProvider>
              {children}
            </ToastProvider>
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
