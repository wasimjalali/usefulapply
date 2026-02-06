import type { Metadata } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/components/ui/Toast";

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
    default: 'KarKo AI — AI-Powered Job Application Assistant',
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
    title: 'KarKo AI — AI-Powered Job Application Assistant',
    description:
      'Optimize your CV, generate tailored cover letters, and create professional application emails in minutes with AI.',
    images: [
      {
        url: '/karko-ai.png',
        width: 1200,
        height: 630,
        alt: 'KarKo AI — AI-Powered Job Application Assistant',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KarKo AI — AI-Powered Job Application Assistant',
    description:
      'Optimize your CV, generate tailored cover letters, and create professional application emails in minutes with AI.',
    images: ['/karko-ai.png'],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'KarKo AI',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              description:
                'AI-powered job application assistant that optimizes your CV, generates tailored cover letters, and creates professional application emails in minutes.',
              url: 'https://www.karkoai.com',
              offers: [
                {
                  '@type': 'Offer',
                  name: 'Free',
                  price: '0',
                  priceCurrency: 'USD',
                },
                {
                  '@type': 'Offer',
                  name: 'Plus',
                  price: '29.99',
                  priceCurrency: 'USD',
                  billingIncrement: 'P1M',
                },
                {
                  '@type': 'Offer',
                  name: 'Pro',
                  price: '49.99',
                  priceCurrency: 'USD',
                  billingIncrement: 'P1M',
                },
              ],
              creator: {
                '@type': 'Person',
                name: 'Wasim Jalali',
                jobTitle: 'Founder & CEO',
              },
            }),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} antialiased`}
        suppressHydrationWarning
      >
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
