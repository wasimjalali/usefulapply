import type { Metadata } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/components/ui/Toast";
import { PostHogProvider } from "@/providers/PostHogProvider";
import PostHogPageView from "@/providers/PostHogPageView";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.karkoai.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'KarKo AI | AI-Powered Job Application Assistant',
    template: '%s | KarKo AI',
  },
  description:
    'KarKo AI optimizes your CV, generates tailored cover letters, and creates professional application emails in under 90 seconds.',
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
    'KarKo AI',
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
  authors: [{ name: 'KarKo AI', url: SITE_URL }],
  creator: 'KarKo AI',
  publisher: 'KarKo AI',
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
    siteName: 'KarKo AI',
    title: 'KarKo AI | AI-Powered Job Application Assistant',
    description:
      'Optimize your CV, generate tailored cover letters, and create professional application emails in minutes with AI.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Karko AI | AI-Powered Job Application Assistant',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KarKo AI | AI-Powered Job Application Assistant',
    description:
      'Optimize your CV, generate tailored cover letters, and create professional application emails in minutes with AI.',
    images: ['/opengraph-image'],
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
    <html lang="en" translate="no">
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
              name: 'KarKo AI',
              url: SITE_URL,
              logo: `${SITE_URL}/favicon-512x512.png`,
              description:
                'KarKo AI helps job seekers apply smarter with AI-powered CV optimization, cover letter generation, and application email drafting.',
              founder: {
                '@type': 'Person',
                name: 'Wasim Jalali',
              },
              contactPoint: {
                '@type': 'ContactPoint',
                url: `${SITE_URL}/contact`,
                contactType: 'customer support',
              },
            }),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} antialiased`}
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
