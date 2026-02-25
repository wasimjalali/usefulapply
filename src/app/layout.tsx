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
    'KarKo AI optimizes your CV, generates tailored cover letters, and creates professional application emails in minutes. Built for job seekers who want to apply smarter, not harder.',
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
        {/* SoftwareApplication Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'KarKo AI',
              applicationCategory: 'BusinessApplication',
              applicationSubCategory: 'Job Application Tool',
              operatingSystem: 'Web',
              description:
                'AI-powered job application assistant that optimizes your CV, generates tailored cover letters, and creates professional application emails in under 90 seconds.',
              url: SITE_URL,
              image: `${SITE_URL}/karko-ai.png`,
              screenshot: `${SITE_URL}/karko-ai.png`,
              featureList: [
                'AI CV Optimization',
                'Tailored Cover Letter Generation',
                'Professional Application Email Drafting',
                'Smart Fit Analysis',
                'ATS-Friendly Output',
                'Multi-Language Support',
                'Master CV Support',
              ],
              offers: [
                {
                  '@type': 'Offer',
                  name: 'Free',
                  price: '0',
                  priceCurrency: 'USD',
                  description: '10 credits (~5 applications/month)',
                },
                {
                  '@type': 'Offer',
                  name: 'Plus',
                  price: '29.99',
                  priceCurrency: 'USD',
                  billingIncrement: 'P1M',
                  description: '200 credits, priority processing',
                },
                {
                  '@type': 'Offer',
                  name: 'Pro',
                  price: '49.99',
                  priceCurrency: 'USD',
                  billingIncrement: 'P1M',
                  description: '500 credits, advanced AI models, premium support',
                },
              ],
              creator: {
                '@type': 'Organization',
                name: 'KarKo AI',
                url: SITE_URL,
                founder: {
                  '@type': 'Person',
                  name: 'Wasim Jalali',
                  jobTitle: 'Founder & CEO',
                },
              },
              aggregateRating: undefined,
            }),
          }}
        />
        {/* Organization Schema */}
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
              sameAs: [],
            }),
          }}
        />
        {/* FAQ Schema for rich snippets */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: [
                {
                  '@type': 'Question',
                  name: 'How does KarKo AI optimize my CV?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'KarKo AI analyzes the job description to identify key requirements, then tailors your CV to highlight matching skills and experience. It ensures ATS compatibility while preserving your authentic professional history — no fabricated skills or hallucinated content.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'How long does it take to generate an application?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'KarKo AI generates a complete application package (optimized CV, tailored cover letter, and professional email) in under 90 seconds. What typically takes 45-60 minutes manually is done almost instantly.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'Is KarKo AI free to use?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Yes! KarKo AI offers a Free plan with 10 credits (~5 applications per month). No credit card required. Paid plans (Plus at $39.99/mo and Max at $79.99/mo) offer more credits and advanced features.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'What is a Master CV?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'A Master CV is a comprehensive 5-10 page document that captures your entire professional history — every skill, project, certification, and achievement. KarKo AI uses it as a rich source to generate perfectly tailored applications for any job.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'Does KarKo AI make up skills or experience?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'No. KarKo AI has strict anti-hallucination rules. Every skill, metric, and claim in your optimized CV must be traceable to your original CV or Master CV. If a required skill is missing, it highlights transferable skills instead of fabricating content.',
                  },
                },
              ],
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
