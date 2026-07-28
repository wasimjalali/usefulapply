import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Users, Target, Heart, Zap, Sparkles, Shield, Globe } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { CountUp } from '@/components/marketing/CountUp';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'About Karko AI: The AI Job Application Agent Built by a Job Seeker',
  description:
    'Karko AI is the AI job application agent that replaces the seven tools job seekers stitch together. Find roles, check fit, write the full application, track everything. Built by a founder who was hired as an AI Specialist through an application Karko wrote, after 60+ applications as a first-time job seeker.',
  canonical: '/about',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.karkoai.com';

const founderPersonJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Wasim Jalali',
  jobTitle: 'Founder',
  url: `${SITE_URL}/about`,
  image: `${SITE_URL}/wasim-founder.jpg`,
  worksFor: {
    '@type': 'Organization',
    name: 'Karko AI',
    url: SITE_URL,
  },
  description:
    'Wasim Jalali is the founder of Karko AI. He built the tool for his own job search as a first-time job seeker, sent 60+ applications through it, got 5 interviews, and was hired as an AI Specialist through an application Karko generated.',
};

const aboutBreadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'About', item: `${SITE_URL}/about` },
  ],
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(founderPersonJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutBreadcrumbJsonLd) }}
      />
      <Navbar />
      <main>
      {/* Hero Section */}
      <section className="pt-20 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <ScrollReveal delay={0} direction="down" distance={20}>
          <p className="text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-4">About Karko AI</p>
          </ScrollReveal>
          <ScrollReveal delay={150}>
          <h1 className="font-bold text-navy-600 text-[44px] sm:text-[52px] lg:text-[56px] leading-[1.05] tracking-tight mb-6">
            We built the tool <span className="text-gold-500">we wished we had.</span>
          </h1>
          </ScrollReveal>
          <ScrollReveal delay={300}>
          <p className="text-xl text-warm-gray max-w-2xl mx-auto leading-relaxed">
            Karko AI is the AI job application agent that replaces the seven tools job seekers stitch together. Find the role, check the fit, write the full application, track everything. One app, one loop. Every word traces back to your real CV.
          </p>
          </ScrollReveal>
        </div>
      </section>

      {/* What Makes Us Different */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-3">Our Difference</p>
            <h2 className="font-bold text-navy-600 text-[32px] md:text-[40px] leading-[1.1] mb-4">Why Karko AI exists.</h2>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto">
              Most job tools solve one piece of the puzzle. Karko collapses the seven tools you use today (job board, resume builder, ATS checker, cover letter AI, email drafter, screening helper, tracker) into one loop.
            </p>
          </div>
          </ScrollReveal>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: Sparkles,
                title: 'One Agent, One Loop',
                description: 'Other tools help you format a resume. Karko is the AI job application agent that replaces the seven tools job seekers use today: find the role, check the fit, write the full application, track it. One app, one loop.',
              },
              {
                icon: Shield,
                title: 'Never a Word You Did Not Earn',
                description: 'Every CV rewrite, cover letter, email, and screening answer traces back to your real CV. Karko will not invent job titles, skills, or experience you do not have. This is the architectural rule the product refuses to break.',
              },
              {
                icon: Target,
                title: 'Tailored to This Exact Role',
                description: 'No generic templates. Every document is tailored to the specific role and company, pulled from your real experience. Applications that make recruiters stop and read.',
              },
              {
                icon: Globe,
                title: 'Built for Global Job Seekers',
                description: 'Professional templates for US and EU markets. German Lebenslauf, US ATS-optimized formats, and region-appropriate cover letters, all built in. All six templates pass ATS by default.',
              },
            ].map((value, i) => {
              const Icon = value.icon;
              return (
                <ScrollReveal key={i} delay={i * 150}>
                <div className="bg-white rounded-2xl p-8 border border-cream-200 shadow-sm card-hover-lift">
                  <div className="w-14 h-14 bg-gold-100 rounded-xl flex items-center justify-center mb-5">
                    <Icon className="w-7 h-7 text-gold-500" />
                  </div>
                  <h3 className="text-xl font-semibold text-charcoal mb-3">{value.title}</h3>
                  <p className="text-warm-gray leading-relaxed">{value.description}</p>
                </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-3">Our Values</p>
            <h2 className="font-bold text-navy-600 text-[32px] md:text-[40px] leading-[1.1]">What we stand for.</h2>
          </div>
          </ScrollReveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Users,
                title: 'People First',
                description: 'Every feature starts with understanding what real job seekers actually need.',
              },
              {
                icon: Target,
                title: 'Quality Over Quantity',
                description: '20 great applications beat 100 generic ones. Personalization wins interviews.',
              },
              {
                icon: Heart,
                title: 'Radically Transparent',
                description: 'No hidden fees, no dark patterns. You know exactly what you get and what it costs.',
              },
              {
                icon: Zap,
                title: 'Always Improving',
                description: 'AI evolves fast. So do we. Your applications get better with every update.',
              },
            ].map((value, i) => {
              const Icon = value.icon;
              return (
                <ScrollReveal key={i} delay={i * 120}>
                <div className="text-center p-6">
                  <div className="w-14 h-14 bg-navy-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-7 h-7 text-navy-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-charcoal mb-2">{value.title}</h3>
                  <p className="text-warm-gray text-sm leading-relaxed">{value.description}</p>
                </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Founder Story */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-5xl mx-auto">
          <ScrollReveal>
          <div className="grid md:grid-cols-[240px_1fr] gap-10 md:gap-14 items-start">
            <div className="flex flex-col items-center md:items-start">
              <div className="w-[200px] h-[200px] md:w-[240px] md:h-[240px] rounded-2xl overflow-hidden border border-cream-200 shadow-sm">
                <Image
                  src="/wasim-founder.jpg"
                  alt="Wasim Jalali, Founder of Karko AI"
                  width={240}
                  height={240}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="mt-5 italic text-charcoal text-2xl leading-none">Wasim Jalali</p>
              <p className="mt-1 text-sm text-warm-gray">Founder, Karko AI</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-3">
                Founder&apos;s story
              </p>
              <h2 className="font-bold text-navy-600 text-[28px] md:text-[32px] leading-[1.15] mb-6">
                The tool I built got me hired.
              </h2>
              <div className="border-l-2 border-gold-400 pl-6">
                <p className="text-[17px] md:text-[18px] text-charcoal leading-relaxed">
                  I built Karko for my own search. Sixty-plus applications, every one written by the product. Five interviews. Then I was hired as an AI Specialist through an application Karko wrote. If it can do that for a first-time job seeker with no degree, it can do it for you.
                </p>
              </div>
            </div>
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-navy-600">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-4 gap-8 text-center">
            {[
              { value: '7 → 1', label: 'Tools Collapsed Into One App' },
              { value: '90 sec', label: 'To Write Your Full Application' },
              { value: '40x', label: 'Faster Than Writing By Hand' },
              { value: '25 / day', label: 'Roles Picked For You (Plus and Max)' },
            ].map((stat, i) => (
              <ScrollReveal key={i} delay={i * 150}>
              <div>
                <CountUp value={stat.value} className="text-3xl md:text-4xl font-bold text-gold-400 mb-2 block" />
                <div className="text-navy-200 text-sm font-medium">{stat.label}</div>
              </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-navy-700 relative overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-[0.04]" />
        <ScrollReveal>
        <div className="max-w-3xl mx-auto text-center relative">
          <h2 className="font-bold text-white text-[36px] md:text-[48px] leading-[1.1] mb-5">
            Your next interview is <span className="text-gold-400">90 seconds away.</span>
          </h2>
          <p className="text-[17px] text-navy-100 mb-9 max-w-xl mx-auto leading-relaxed">
            Upload your CV. Pick a role from your feed. Send your first full application before your coffee gets cold.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="px-8 py-3.5 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 text-base"
            >
              Start free, no credit card
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/pricing"
              className="px-8 py-3.5 border border-white/30 text-white font-semibold rounded-lg hover:bg-white/10 transition-colors flex items-center justify-center text-base"
            >
              View pricing
            </Link>
          </div>
        </div>
        </ScrollReveal>
      </section>
      </main>
      <Footer />
    </div>
  );
}
