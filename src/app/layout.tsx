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
    <html lang="en">
      <head>
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
              logo: `${SITE_URL}/karko-ai.png`,
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
          <PostHogPageView />
          <AuthProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
