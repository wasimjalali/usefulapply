import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, FileText, Search, Zap, Clock, Target, Check, CheckCircle, Shield, Sparkles, Crown, TrendingUp, Star } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import { PlusPlanButton, MaxPlanButton } from '@/components/marketing/HomePricingButtons';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { TimeSavingsCalculator } from '@/components/marketing/TimeSavingsCalculator';

export const metadata: Metadata = {
  title: {
    absolute: 'KarKo AI | AI-Powered Job Application Assistant',
  },
  description:
    'AI-powered job application assistant: Generate ATS-optimized CV, cover letter, and application emails in 90 seconds. Free for 5 applications. Try now.',
  alternates: { canonical: '/' },
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.karkoai.com';

export default function Home() {
  return (
    <div className="min-h-screen bg-cream-100">
      {/* SoftwareApplication Schema — homepage only.
          Google requires aggregateRating or review for rich results.
          Add real review data here when available (e.g. from Trustpilot). */}
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
              'AI-powered job application assistant that generates a tailored CV, cover letter, and application email from any job description in under 90 seconds.',
            url: SITE_URL,
            image: `${SITE_URL}/karko-ai.png`,
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
                description: '10 credits/month (~5 applications)',
              },
              {
                '@type': 'Offer',
                name: 'Plus',
                price: '39.99',
                priceCurrency: 'USD',
                description: '100 credits/month (~50 applications)',
              },
              {
                '@type': 'Offer',
                name: 'Max',
                price: '79.99',
                priceCurrency: 'USD',
                description: '200 credits/month (~100 applications)',
              },
            ],
            creator: {
              '@type': 'Organization',
              name: 'KarKo AI',
              url: SITE_URL,
            },
          }),
        }}
      />
      <Navbar />
      <main>
      {/* Hero Section */}
      <section className="pt-20 pb-28 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-50" />
        <div className="absolute top-[-200px] right-[-100px] w-[700px] h-[700px] bg-gradient-to-bl from-gold-200/50 via-gold-100/30 to-transparent rounded-full blur-3xl pointer-events-none animate-float-slow" />
        <div className="absolute bottom-[-150px] left-[-100px] w-[500px] h-[500px] bg-gradient-to-tr from-navy-200/20 via-navy-100/10 to-transparent rounded-full blur-3xl pointer-events-none animate-float-delayed" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-400/30 to-transparent" />

        <div className="max-w-6xl mx-auto relative">
          <div className="text-center max-w-4xl mx-auto">

            <ScrollReveal delay={0}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm border border-gold-200/60 shadow-sm mb-8 animate-badge-float">
              <div className="flex -space-x-1">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-gold-400 to-gold-500 flex items-center justify-center">
                  <Star className="w-3 h-3 text-white fill-white" />
                </div>
              </div>
              <span className="text-sm font-medium text-navy-600">Built for job seekers worldwide</span>
              <span className="text-xs text-warm-gray">US & EU markets</span>
            </div>
            </ScrollReveal>

            <ScrollReveal delay={150}>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-navy-600 mb-6 leading-[1.08] tracking-tight">
              Get Your Complete Job Application Package{' '}
              <span className="bg-gradient-to-r from-gold-400 via-gold-500 to-gold-400 bg-clip-text text-transparent bg-[length:200%_auto] animate-shimmer">in 90 Seconds</span>
            </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
            <p className="text-xl md:text-2xl text-warm-gray mb-10 max-w-2xl mx-auto leading-relaxed">
              Paste the job description. Karko AI analyzes your fit and generates a tailored CV, cover letter, application email, and follow-up email, ready to send.
            </p>
            </ScrollReveal>
            <ScrollReveal delay={450}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/dashboard"
                className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 text-lg cta-glow"
              >
                Try It Free, No Sign Up
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="#how-it-works"
                className="w-full sm:w-auto px-10 py-4 bg-white/70 backdrop-blur-sm text-navy-600 font-semibold rounded-xl hover:bg-white hover:shadow-lg hover:scale-[1.02] transition-all duration-300 flex items-center justify-center gap-2 text-lg shadow-sm border border-cream-200"
              >
                See How It Works
              </Link>
            </div>
            </ScrollReveal>

            <ScrollReveal delay={600}>
            <div className="mt-14 grid grid-cols-3 gap-4 max-w-lg mx-auto">
              <div className="text-center">
                <div className="text-2xl font-bold text-navy-600">&lt;90s</div>
                <div className="text-xs text-warm-gray mt-1">Per application</div>
              </div>
              <div className="text-center border-x border-cream-300">
                <div className="text-2xl font-bold text-gold-500">4 Docs</div>
                <div className="text-xs text-warm-gray mt-1">Ready to send</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-navy-600">100%</div>
                <div className="text-xs text-warm-gray mt-1">From your real CV</div>
              </div>
            </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="py-6 px-4 sm:px-6 lg:px-8 bg-white border-y border-cream-200 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal direction="none">
          <p className="text-center text-xs font-medium text-warm-gray uppercase tracking-widest mb-5">Optimized for the tools recruiters use</p>
          </ScrollReveal>
          <div className="relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
            <div className="flex items-center animate-scroll-logos">
              {[...Array(2)].map((_, setIdx) => (
                <div key={setIdx} className="flex items-center shrink-0">
                  {['Workday', 'Greenhouse', 'Lever', 'SAP SuccessFactors', 'iCIMS', 'Taleo', 'BambooHR', 'SmartRecruiters'].map((name, i) => (
                    <div key={`${setIdx}-${i}`} className="flex items-center shrink-0 mx-6 md:mx-10">
                      <span className="text-base md:text-lg font-bold tracking-tight text-navy-600/40 whitespace-nowrap">{name}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Step 1: Upload Your CV */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50 relative">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-gradient-to-br from-navy-600 to-navy-700 text-white text-lg font-bold rounded-full shadow-md">1</div>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest">Step One</p>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              Upload Your CV Once
            </h2>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto leading-relaxed">
              Upload your master CV or primary CV one time. Karko AI reads through your entire professional history and builds a complete profile of your skills, experience, and achievements.
            </p>
          </div>
          </ScrollReveal>
          <ScrollReveal delay={150}>
          <div className="browser-frame max-w-5xl mx-auto">
            <div className="browser-frame-bar">
              <div className="browser-dot bg-[#FF5F57]" />
              <div className="browser-dot bg-[#FFBD2E]" />
              <div className="browser-dot bg-[#28C840]" />
              <div className="flex-1 mx-4">
                <div className="bg-white/80 rounded-md px-3 py-1 text-xs text-warm-gray text-center max-w-xs mx-auto border border-cream-200">
                  karkoai.com/dashboard
                </div>
              </div>
            </div>
            <Image
              src="/screenshots/upload-cv-dashboard.jpg"
              alt="KarKo AI Dashboard welcome screen showing Upload CV prompt and chat assistant"
              width={1440}
              height={698}
              className="w-full h-auto"
              quality={80}
              sizes="(max-width: 1280px) 100vw, 1280px"
              priority
            />
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Step 2: Paste the Job Description */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white relative">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-gradient-to-br from-gold-400 to-gold-500 text-white text-lg font-bold rounded-full shadow-md">2</div>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest">Step Two</p>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              Paste Any Job Description
            </h2>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto leading-relaxed">
              Copy and paste the job posting you want to apply for. Karko AI instantly analyzes the requirements, matches your skills, and gives you an honest fit score before anything is generated.
            </p>
          </div>
          </ScrollReveal>
          <ScrollReveal delay={150}>
          <div className="browser-frame max-w-5xl mx-auto">
            <div className="browser-frame-bar">
              <div className="browser-dot bg-[#FF5F57]" />
              <div className="browser-dot bg-[#FFBD2E]" />
              <div className="browser-dot bg-[#28C840]" />
              <div className="flex-1 mx-4">
                <div className="bg-white/80 rounded-md px-3 py-1 text-xs text-warm-gray text-center max-w-xs mx-auto border border-cream-200">
                  Optimization in Progress
                </div>
              </div>
            </div>
            <Image
              src="/screenshots/optimization-process.jpg"
              alt="KarKo AI optimization process analyzing job description and generating tailored application materials"
              width={1440}
              height={698}
              className="w-full h-auto"
              quality={80}
              sizes="(max-width: 1280px) 100vw, 1280px"
            />
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Step 3: Your Complete Application Package */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-cream-50 via-cream-100 to-white" />
        <div className="absolute inset-0 dot-grid opacity-30" />
        <div className="max-w-6xl mx-auto relative">
          <ScrollReveal>
          <div className="text-center mb-16">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-gradient-to-br from-navy-600 to-navy-700 text-white text-lg font-bold rounded-full shadow-md">3</div>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest">Step Three</p>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              Get Your Complete Application Package
            </h2>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto">
              Every document is personalized to the job, the company, and your real experience. Nothing is fabricated.
            </p>
          </div>
          </ScrollReveal>

          {/* 01 - Tailored CV */}
          <div className="mb-20">
            <ScrollReveal>
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-navy-50 to-navy-100 rounded-xl flex items-center justify-center">
                  <FileText className="w-7 h-7 text-navy-600" />
                </div>
                <span className="text-3xl font-bold text-cream-300">01</span>
              </div>
              <h3 className="text-2xl font-bold text-navy-600 mb-3">Tailored CV</h3>
              <p className="text-warm-gray max-w-xl mx-auto">
                Your skills reordered to match the job. Keywords optimized for ATS screening. Professional formatting for US and EU markets.
              </p>
            </div>
            </ScrollReveal>
            <ScrollReveal delay={150}>
            <div className="browser-frame max-w-5xl mx-auto">
              <div className="browser-frame-bar">
                <div className="browser-dot bg-[#FF5F57]" />
                <div className="browser-dot bg-[#FFBD2E]" />
                <div className="browser-dot bg-[#28C840]" />
                <div className="flex-1 mx-4">
                  <div className="bg-white/80 rounded-md px-3 py-1 text-xs text-warm-gray text-center max-w-xs mx-auto border border-cream-200">Optimized CV</div>
                </div>
              </div>
              <Image
                src="/screenshots/cv-panel.jpg"
                alt="KarKo AI Dashboard showing a tailored, ATS-optimized CV"
                width={1440}
                height={819}
                className="w-full h-auto"
                quality={80}
                sizes="(max-width: 1280px) 100vw, 1280px"
              />
            </div>
            </ScrollReveal>
          </div>

          {/* 02 - Personalized Cover Letter */}
          <div className="mb-20">
            <ScrollReveal>
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-gold-50 to-gold-100 rounded-xl flex items-center justify-center">
                  <Target className="w-7 h-7 text-gold-500" />
                </div>
                <span className="text-3xl font-bold text-cream-300">02</span>
              </div>
              <h3 className="text-2xl font-bold text-navy-600 mb-3">Personalized Cover Letter</h3>
              <p className="text-warm-gray max-w-xl mx-auto">
                Company-specific opening paragraph. Your achievements matched to their requirements. Tone adapted to the company culture. Ready to download as PDF or DOCX.
              </p>
            </div>
            </ScrollReveal>
            <ScrollReveal delay={150}>
            <div className="browser-frame max-w-5xl mx-auto">
              <div className="browser-frame-bar">
                <div className="browser-dot bg-[#FF5F57]" />
                <div className="browser-dot bg-[#FFBD2E]" />
                <div className="browser-dot bg-[#28C840]" />
                <div className="flex-1 mx-4">
                  <div className="bg-white/80 rounded-md px-3 py-1 text-xs text-warm-gray text-center max-w-xs mx-auto border border-cream-200">Cover Letter</div>
                </div>
              </div>
              <Image
                src="/screenshots/cover-letter-panel.jpg"
                alt="KarKo AI personalized cover letter tailored to the company"
                width={1440}
                height={819}
                className="w-full h-auto"
                quality={80}
                sizes="(max-width: 1280px) 100vw, 1280px"
              />
            </div>
            </ScrollReveal>
          </div>

          {/* 03 - Application & Follow-Up Emails */}
          <div className="mb-20">
            <ScrollReveal>
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-navy-50 to-navy-100 rounded-xl flex items-center justify-center">
                  <Zap className="w-7 h-7 text-navy-600" />
                </div>
                <span className="text-3xl font-bold text-cream-300">03</span>
              </div>
              <h3 className="text-2xl font-bold text-navy-600 mb-3">Application & Follow-Up Emails</h3>
              <p className="text-warm-gray max-w-xl mx-auto">
                Ready to send with the right subject line, professional tone, and your key qualifications highlighted. Plus a timed follow-up email that highlights a different achievement.
              </p>
            </div>
            </ScrollReveal>
            <ScrollReveal delay={150}>
            <div className="browser-frame max-w-5xl mx-auto">
              <div className="browser-frame-bar">
                <div className="browser-dot bg-[#FF5F57]" />
                <div className="browser-dot bg-[#FFBD2E]" />
                <div className="browser-dot bg-[#28C840]" />
                <div className="flex-1 mx-4">
                  <div className="bg-white/80 rounded-md px-3 py-1 text-xs text-warm-gray text-center max-w-xs mx-auto border border-cream-200">Email</div>
                </div>
              </div>
              <Image
                src="/screenshots/email-panel.jpg"
                alt="KarKo AI application email and follow-up email panel"
                width={1440}
                height={819}
                className="w-full h-auto"
                quality={80}
                sizes="(max-width: 1280px) 100vw, 1280px"
              />
            </div>
            </ScrollReveal>
          </div>

          {/* 04 - US & EU CV Templates */}
          <div className="mb-20">
            <ScrollReveal>
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-gold-50 to-gold-100 rounded-xl flex items-center justify-center">
                  <Crown className="w-7 h-7 text-gold-500" />
                </div>
                <span className="text-3xl font-bold text-cream-300">04</span>
              </div>
              <h3 className="text-2xl font-bold text-navy-600 mb-3">US & EU CV Templates</h3>
              <p className="text-warm-gray max-w-xl mx-auto">
                6 professional templates including German ATS with photo support. Choose between single-column and two-column layouts, with formatting for both US (Letter) and EU (A4) markets.
              </p>
            </div>
            </ScrollReveal>
            <ScrollReveal delay={150}>
            <div className="browser-frame max-w-5xl mx-auto">
              <div className="browser-frame-bar">
                <div className="browser-dot bg-[#FF5F57]" />
                <div className="browser-dot bg-[#FFBD2E]" />
                <div className="browser-dot bg-[#28C840]" />
                <div className="flex-1 mx-4">
                  <div className="bg-white/80 rounded-md px-3 py-1 text-xs text-warm-gray text-center max-w-xs mx-auto border border-cream-200">Template Selector</div>
                </div>
              </div>
              <Image
                src="/screenshots/template-selector.jpg"
                alt="KarKo AI template selector showing 6 CV templates for US and EU markets"
                width={1440}
                height={695}
                className="w-full h-auto"
                quality={80}
                sizes="(max-width: 1280px) 100vw, 1280px"
              />
            </div>
            </ScrollReveal>
          </div>

          {/* 05 - Application Tracker */}
          <div className="mb-20">
            <ScrollReveal>
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-navy-50 to-navy-100 rounded-xl flex items-center justify-center">
                  <Search className="w-7 h-7 text-navy-600" />
                </div>
                <span className="text-3xl font-bold text-cream-300">05</span>
              </div>
              <h3 className="text-2xl font-bold text-navy-600 mb-3">Application Tracker</h3>
              <p className="text-warm-gray max-w-xl mx-auto">
                Track every application with match scores, statuses, and company details in one place. Filter by status, search by company, and never lose track of where you applied.
              </p>
            </div>
            </ScrollReveal>
            <ScrollReveal delay={150}>
            <div className="browser-frame max-w-5xl mx-auto">
              <div className="browser-frame-bar">
                <div className="browser-dot bg-[#FF5F57]" />
                <div className="browser-dot bg-[#FFBD2E]" />
                <div className="browser-dot bg-[#28C840]" />
                <div className="flex-1 mx-4">
                  <div className="bg-white/80 rounded-md px-3 py-1 text-xs text-warm-gray text-center max-w-xs mx-auto border border-cream-200">Application Tracker</div>
                </div>
              </div>
              <Image
                src="/screenshots/tracker-page.jpg"
                alt="KarKo AI application tracker with status, match score, and company details"
                width={1440}
                height={819}
                className="w-full h-auto"
                quality={80}
                sizes="(max-width: 1280px) 100vw, 1280px"
              />
            </div>
            </ScrollReveal>
          </div>

          {/* 06 - AI Optimization Report */}
          <div>
            <ScrollReveal>
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-gold-50 to-gold-100 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-7 h-7 text-gold-500" />
                </div>
                <span className="text-3xl font-bold text-cream-300">06</span>
              </div>
              <h3 className="text-2xl font-bold text-navy-600 mb-3">AI Optimization Report</h3>
              <p className="text-warm-gray max-w-xl mx-auto">
                See exactly what was changed and why. Every optimization is transparent with a detailed strategy breakdown, ATS compatibility score, and key improvements summary.
              </p>
            </div>
            </ScrollReveal>
            <ScrollReveal delay={150}>
            <div className="browser-frame max-w-5xl mx-auto">
              <div className="browser-frame-bar">
                <div className="browser-dot bg-[#FF5F57]" />
                <div className="browser-dot bg-[#FFBD2E]" />
                <div className="browser-dot bg-[#28C840]" />
                <div className="flex-1 mx-4">
                  <div className="bg-white/80 rounded-md px-3 py-1 text-xs text-warm-gray text-center max-w-xs mx-auto border border-cream-200">Optimization Report</div>
                </div>
              </div>
              <Image
                src="/screenshots/changes-tab.jpg"
                alt="KarKo AI optimization report showing ATS compatibility score and detailed change strategy"
                width={1440}
                height={819}
                className="w-full h-auto"
                quality={80}
                sizes="(max-width: 1280px) 100vw, 1280px"
              />
            </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Why Trust Karko AI */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white relative">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Why Trust Karko AI</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              Built Different. Built Better.
            </h2>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto">
              We don&apos;t cut corners on AI. Every application is powered by one of the world&apos;s most capable models, specialized for job applications.
            </p>
          </div>
          </ScrollReveal>

          <ScrollReveal delay={100}>
          <div className="relative rounded-2xl p-[2px] bg-gradient-to-r from-navy-200 via-gold-300 to-navy-200 mb-10 shadow-lg">
            <div className="bg-gradient-to-br from-white via-white to-cream-50 rounded-[14px] p-8 md:p-12">
              <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
                <div className="flex-shrink-0">
                  <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl overflow-hidden shadow-lg border-2 border-cream-200 ring-4 ring-cream-100">
                    <Image
                      src="/anthropic-icon.jpg"
                      alt="Anthropic AI"
                      width={112}
                      height={112}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="flex-1 text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-3 mb-3">
                    <h3 className="text-2xl md:text-3xl font-bold text-navy-600">Claude Sonnet 4.6</h3>
                    <span className="text-sm font-medium text-warm-gray bg-cream-100 px-2.5 py-1 rounded-full">by Anthropic</span>
                  </div>
                  <p className="text-lg text-warm-gray leading-relaxed mb-4">
                    KarKo AI runs on <span className="font-semibold text-charcoal">Claude Sonnet 4.6</span>, one of the most advanced AI models available today. Unlike competitors who rely on cheaper, open-source models, we use a <span className="font-semibold text-charcoal">US-based, frontier-grade AI</span> trusted by leading enterprises worldwide.
                  </p>
                  <p className="text-warm-gray leading-relaxed">
                    On top of that, we&apos;ve built a <span className="font-semibold text-charcoal">specialized system and an agentic workflow</span> designed specifically for job applications, so the AI is not just powerful, it&apos;s precisely tuned to produce professional, ATS-optimized, role-specific documents.
                  </p>
                </div>
              </div>
            </div>
          </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 gap-5">
            {[
              {
                icon: Shield,
                title: 'Anti-Hallucination Guardrails',
                description: 'Every skill on your CV comes from your actual profile. Nothing invented, nothing inflated.',
              },
              {
                icon: TrendingUp,
                title: 'Honest Fit Score',
                description: 'See your real match before applying. Matching skills, gaps, and a clear score.',
              },
              {
                icon: Sparkles,
                title: 'Self-Refining AI',
                description: 'Not a simple chatbot. Karko reviews and refines its own output before delivering it to you.',
              },
              {
                icon: Target,
                title: 'Specialized for Jobs',
                description: 'A custom system and agentic workflow designed only for job applications.',
              },
            ].map((feature, i) => {
              const Icon = feature.icon;
              return (
                <ScrollReveal key={i} delay={i * 80}>
                <div className="bg-white rounded-2xl p-6 border border-cream-200 shadow-sm hover:shadow-md hover:border-gold-300/50 transition-all group flex items-center gap-5">
                  <div className="w-12 h-12 bg-gradient-to-br from-gold-50 to-gold-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <Icon className="w-6 h-6 text-gold-500" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-navy-600 mb-1">{feature.title}</h4>
                    <p className="text-sm text-warm-gray leading-relaxed">{feature.description}</p>
                  </div>
                </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Founder Story */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50 relative overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-20" />
        <div className="max-w-5xl mx-auto relative">
          <ScrollReveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Built by a Job Seeker</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              The Tool I Wished I Had
            </h2>
          </div>
          </ScrollReveal>

          <ScrollReveal delay={200}>
          <div className="bg-white rounded-2xl p-8 md:p-12 border border-cream-200 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold-400 via-gold-500 to-gold-400" />
            <div className="flex flex-col md:flex-row items-center gap-10">
              <div className="flex-shrink-0">
                <div className="w-48 h-48 md:w-56 md:h-56 rounded-2xl overflow-hidden shadow-lg ring-4 ring-gold-100">
                  <Image
                    src="/wasim-founder.jpg"
                    alt="Wasim Jalali, Founder of KarKo AI"
                    width={224}
                    height={224}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="relative">
                <div className="absolute -top-2 -left-2 text-7xl md:text-8xl font-serif text-gold-200/60 leading-none select-none pointer-events-none">&ldquo;</div>
                <div className="space-y-4 text-warm-gray leading-relaxed relative z-10 pt-6 md:pt-4">
                  <p className="text-lg">
                    I ran out of money building a startup in Germany. No savings, no degree to fall back on. Generic job applications got me zero interviews. Tailoring each one by hand took 45 to 60 minutes, and it still was not fast enough.
                  </p>
                  <p className="text-lg">
                    So I built Karko AI to do the entire workflow automatically. Paste a job description, get a tailored CV, cover letter, and professional email in under 90 seconds. Within about 20 applications, I got my first interview. That&apos;s when I knew every job seeker needed this.
                  </p>
                  <p className="text-sm text-warm-gray/80 mt-4">
                    Read the full story: <Link href="/blog/how-long-to-apply-for-job-2026" className="text-navy-600 hover:text-gold-600 font-medium underline">How long does it really take to apply for a job?</Link>
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-3 relative z-10">
                  <div>
                    <p className="font-bold text-charcoal text-lg">Wasim Jalali</p>
                    <p className="text-sm font-medium text-gold-500">Founder of Karko AI</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white relative">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto">
              Every plan includes the full AI agent. Upgrade for more volume and automation.
            </p>
            <div className="mt-6 inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-cream-50 border border-gold-300/60 shadow-sm">
              <Image src="/anthropic-icon.jpg" alt="Anthropic" width={28} height={28} className="rounded-md" />
              <span className="text-navy-600 text-sm font-semibold">Claude Sonnet 4.6 by Anthropic</span>
              <span className="w-px h-4 bg-cream-300" />
              <span className="text-warm-gray text-sm">Specialized for job applications</span>
            </div>
          </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-6 md:gap-8 items-stretch mb-10">
            {/* Free */}
            <ScrollReveal delay={0} className="h-full">
            <div className="relative bg-white rounded-2xl border-2 border-cream-200 shadow-md overflow-hidden card-hover-lift h-full">
              <div className="p-8 flex flex-col h-full">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 rounded-xl bg-cream-100">
                    <Sparkles className="w-6 h-6 text-navy-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-charcoal">Free</h3>
                    <p className="text-sm text-warm-gray">Try the full AI agent</p>
                  </div>
                </div>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-navy-600">Free</span>
                    <span className="text-warm-gray">forever</span>
                  </div>
                  <div className="mt-2">
                    <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-cream-100 text-navy-500 border border-cream-300">
                      10 credits/month
                    </span>
                  </div>
                </div>
                <ul className="space-y-3 mb-5">
                  {[
                    { text: '5 complete applications/month', bold: true },
                    { text: 'Tailored CV, cover letter, email & follow-up' },
                    { text: 'Honest fit score before you apply' },
                    { text: 'ATS-optimized, US & EU templates' },
                    { text: 'Anti-hallucination guardrails' },
                    { text: 'Powered by Claude Sonnet 4.6' },
                  ].map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-gold-500" />
                      <span className={`text-sm text-charcoal ${f.bold ? 'font-semibold' : ''}`}>{f.text}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 bg-cream-50 border border-cream-200">
                  <Clock className="w-5 h-5 flex-shrink-0 text-navy-400" />
                  <span className="text-sm font-semibold text-navy-600">~4 hours saved/month</span>
                </div>
                <div className="mt-auto pt-6">
                  <Link
                    href="/dashboard"
                    className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold transition-all border-2 border-navy-200 text-navy-600 hover:bg-navy-50 hover:border-navy-400"
                  >
                    Start Free
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
            </ScrollReveal>

            {/* Plus */}
            <ScrollReveal delay={150} className="h-full">
            <div className="relative h-full">
              <div className="animated-border rounded-2xl shadow-xl h-full flex flex-col">
                <div className="bg-gradient-to-r from-gold-400 to-gold-500 text-white text-xs font-bold px-4 py-2 text-center rounded-t-2xl">
                  MOST POPULAR | SAVE ~37 HOURS/MONTH
                </div>
                <div className="p-8 flex flex-col flex-1 bg-white rounded-b-2xl">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="p-2.5 rounded-xl bg-gold-100">
                      <Zap className="w-6 h-6 text-gold-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-charcoal">Plus</h3>
                      <p className="text-sm text-warm-gray">For serious job seekers</p>
                    </div>
                  </div>
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-navy-600">$39.99</span>
                      <span className="text-warm-gray">/month</span>
                    </div>
                    <div className="mt-2">
                      <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-gold-50 text-gold-600 border border-gold-200">
                        100 credits/month
                      </span>
                    </div>
                  </div>
                  <ul className="space-y-3 mb-5">
                    {[
                      { text: '50 complete applications/month', bold: true },
                      { text: 'Everything in Free, plus:' },
                      { text: 'Unlimited application history' },
                      { text: 'Add-on credit packs (rollover)' },
                      { text: 'Priority email support' },
                      { text: 'Powered by Claude Sonnet 4.6' },
                    ].map((f, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-gold-500" />
                        <span className={`text-sm text-charcoal ${f.bold ? 'font-semibold' : ''}`}>{f.text}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 bg-gold-50 border border-gold-200">
                    <Clock className="w-5 h-5 flex-shrink-0 text-gold-500" />
                    <span className="text-sm font-semibold text-navy-600">Cancel anytime. No contracts.</span>
                  </div>
                  <div className="mt-auto pt-6">
                    <PlusPlanButton />
                  </div>
                </div>
              </div>
            </div>
            </ScrollReveal>

            {/* Max */}
            <ScrollReveal delay={300} className="h-full">
            <div className="relative bg-white rounded-2xl border-2 border-navy-400 shadow-lg overflow-hidden card-hover-lift h-full flex flex-col">
              <div className="bg-gradient-to-r from-navy-600 to-navy-700 text-white text-xs font-bold px-4 py-2 text-center">
                SAVE ~108 HOURS EVERY MONTH
              </div>
              <div className="p-8 flex flex-col flex-1">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 rounded-xl bg-navy-100">
                    <Crown className="w-6 h-6 text-navy-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-charcoal">Max</h3>
                    <p className="text-sm text-warm-gray">Full automation for power applicants</p>
                  </div>
                </div>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-navy-600">$79.99</span>
                    <span className="text-warm-gray">/month</span>
                  </div>
                  <div className="mt-2">
                    <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-navy-50 text-navy-600 border border-navy-200">
                      200 credits/month
                    </span>
                  </div>
                </div>
                <ul className="space-y-3 mb-5">
                  {[
                    { text: '100 complete applications/month', bold: true },
                    { text: 'Everything in Plus, plus:' },
                    { text: 'Chrome Extension: auto-fill ATS forms', bold: true, comingSoon: true },
                    { text: 'Chrome Extension: AI screening answers', bold: true, comingSoon: true },
                    { text: 'Premium dedicated support' },
                    { text: 'Powered by Claude Sonnet 4.6' },
                  ].map((f: { text: string; bold?: boolean; comingSoon?: boolean }, i: number) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-gold-500" />
                      <span className={`text-sm text-charcoal ${f.bold ? 'font-semibold' : ''}`}>
                        {f.text}
                        {f.comingSoon && (
                          <span className="ml-1.5 inline-flex items-center bg-navy-600/10 text-navy-600 text-[10px] font-medium px-2 py-0.5 rounded-full">Coming Soon</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 bg-navy-600">
                  <Clock className="w-5 h-5 flex-shrink-0 text-gold-400" />
                  <span className="text-sm font-semibold text-white">Cancel anytime. No contracts.</span>
                </div>
                <div className="mt-auto pt-6">
                  <MaxPlanButton />
                </div>
              </div>
            </div>
            </ScrollReveal>
          </div>

          <ScrollReveal>
          <div className="text-center">
            <Link
              href="/pricing"
              className="text-navy-600 font-medium hover:text-navy-700 transition-colors inline-flex items-center gap-2"
            >
              View credit details and add-ons
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Time Savings Calculator */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold-200/30 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gold-100/40 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />
        <div className="max-w-4xl mx-auto relative">
          <ScrollReveal>
          <div className="text-center mb-10">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Time Savings</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-3">
              How Much Time Will You Save?
            </h2>
            <p className="text-warm-gray max-w-lg mx-auto">
              Each tailored application takes 45 to 60 minutes by hand. KarKo AI does it in under 90 seconds.
            </p>
          </div>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <TimeSavingsCalculator />
          </ScrollReveal>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-navy-600 via-navy-700 to-navy-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gold-400/10 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gold-400/5 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />
        <div className="absolute inset-0 dot-grid opacity-[0.04]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-400/50 to-transparent" />

        <ScrollReveal>
        <div className="max-w-4xl mx-auto text-center relative">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">
            Your Next Interview Is{' '}
            <span className="text-gold-400">90 Seconds Away</span>
          </h2>
          <p className="text-lg text-navy-200 mb-10 max-w-2xl mx-auto leading-relaxed">
            Start with 5 free applications. No credit card required.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 text-lg cta-glow"
            >
              Try It Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/pricing"
              className="w-full sm:w-auto px-10 py-4 bg-white/10 backdrop-blur-sm text-white font-semibold rounded-xl hover:bg-white/20 transition-all duration-300 flex items-center justify-center text-lg border border-white/20 hover:border-white/40"
            >
              View Pricing
            </Link>
          </div>
        </div>
        </ScrollReveal>
      </section>

      {/* What is a Master CV? */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <ScrollReveal direction="left">
            <div>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Master CV</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
                Don&apos;t Have a Master CV?
              </h2>
              <p className="text-warm-gray leading-relaxed mb-4">
                A Master CV is a comprehensive document (5 to 10 pages) that contains your complete professional history: every job, skill, achievement, and certification. It is not something you send to employers. It is the source material that KarKo AI draws from to create perfectly tailored applications.
              </p>
              <p className="text-warm-gray leading-relaxed mb-6">
                Most people do not have one, and that is okay. We have built a free guided process that helps you create yours in about 30 minutes using any AI chatbot.
              </p>
              <Link
                href="/master-cv"
                className="inline-flex items-center gap-2 px-6 py-3 bg-navy-600 text-white font-semibold rounded-xl hover:bg-navy-700 transition-colors shadow-md hover:shadow-lg"
              >
                Learn How to Create Yours
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={200}>
            <div className="bg-white rounded-2xl p-8 border border-cream-200 shadow-sm card-hover-lift relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold-400 via-gold-500 to-gold-400" />
              <h3 className="text-lg font-bold text-charcoal mb-4">What a Master CV Includes</h3>
              <ul className="space-y-3">
                {[
                  'Complete work history with metrics',
                  'All skills with years of experience',
                  'Every certification and qualification',
                  'Side projects and portfolio work',
                  'Languages and proficiency levels',
                  'Professional mindset and approach',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle className="w-4 h-4 text-gold-500 flex-shrink-0 mt-0.5" />
                    <span className="text-warm-gray">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 p-4 bg-gold-50 rounded-xl border border-gold-200">
                <p className="text-sm text-gold-700">
                  <strong>Pro tip:</strong> The more detailed your Master CV, the better KarKo AI can personalize your applications.
                </p>
              </div>
            </div>
            </ScrollReveal>
          </div>
        </div>
      </section>
      </main>
      <Footer />
    </div>
  );
}
