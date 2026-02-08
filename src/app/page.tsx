import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, FileText, Search, Zap, Clock, Target, CheckCircle, Star, Shield, Globe, MessageSquare, Sparkles, BarChart3, Users, TrendingUp, HelpCircle } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal, StaggerChildren } from '@/components/marketing/ScrollReveal';
import { CountUp } from '@/components/marketing/CountUp';

export const metadata: Metadata = {
  title: 'KarKo AI | AI-Powered Job Application Assistant',
  description:
    'Apply to jobs 10x faster with AI. KarKo AI optimizes your CV for each role, generates tailored cover letters, and creates professional application emails, all in under 90 seconds.',
  alternates: { canonical: '/' },
};

export default function Home() {
  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />

      {/* Hero Section — Bold, confident, benefit-driven */}
      <section className="pt-20 pb-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Subtle background gradient accent — floating */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-gold-100/60 via-transparent to-transparent rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none animate-float-slow" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-navy-100/30 via-transparent to-transparent rounded-full translate-y-1/2 -translate-x-1/4 pointer-events-none animate-float-delayed" />

        <div className="max-w-6xl mx-auto relative">
          <div className="text-center max-w-4xl mx-auto">
            {/* Trust badge */}
            <ScrollReveal delay={0} direction="down" distance={20}>
            <div className="inline-flex items-center gap-2 px-4 py-2 glass rounded-full text-sm text-charcoal mb-8 shadow-sm">
              <Sparkles className="w-4 h-4 text-gold-400" />
              <span className="font-medium">Agentic AI that does the work for you</span>
            </div>
            </ScrollReveal>

            <ScrollReveal delay={150}>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-navy-600 mb-6 leading-[1.1] tracking-tight">
              One Click. Complete Job Application.{' '}
              <span className="bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">Under 90 Seconds.</span>
            </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
            <p className="text-xl md:text-2xl text-warm-gray mb-10 max-w-2xl mx-auto leading-relaxed">
              What takes job seekers 45-60 minutes manually (tailoring a CV, writing a cover letter, drafting a professional email), KarKo AI delivers in under 90 seconds.
            </p>
            </ScrollReveal>
            <ScrollReveal delay={450}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/auth/signup"
                className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 text-lg"
              >
                Start Free, No Credit Card
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="#how-it-works"
                className="w-full sm:w-auto px-10 py-4 glass text-navy-600 font-semibold rounded-xl hover:bg-white/80 transition-all flex items-center justify-center gap-2 text-lg shadow-sm"
              >
                See How It Works
              </Link>
            </div>
            </ScrollReveal>

            {/* Social proof strip */}
            <ScrollReveal delay={600}>
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-warm-gray">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-gold-400" />
                <span className="font-medium">Built for job seekers worldwide</span>
              </div>
              <div className="hidden sm:block w-px h-4 bg-cream-300" />
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gold-400" />
                <span className="font-medium">From 45 minutes to 90 seconds per application</span>
              </div>
            </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Logos / Trust Bar */}
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-white border-y border-cream-200 overflow-hidden">
        <div className="max-w-5xl mx-auto">
          <ScrollReveal direction="none">
          <p className="text-center text-xs font-medium text-warm-gray uppercase tracking-widest mb-6">Optimized for the tools recruiters use</p>
          </ScrollReveal>
          <div className="relative">
            <div className="flex items-center justify-center gap-8 md:gap-14 text-warm-gray opacity-60 animate-pulse-soft">
              <span className="text-lg font-bold tracking-tight">Workday</span>
              <span className="text-lg font-bold tracking-tight">Greenhouse</span>
              <span className="text-lg font-bold tracking-tight">Lever</span>
              <span className="text-lg font-bold tracking-tight">SAP SuccessFactors</span>
              <span className="text-lg font-bold tracking-tight">iCIMS</span>
              <span className="text-lg font-bold tracking-tight">Taleo</span>
            </div>
          </div>
        </div>
      </section>

      {/* Problem/Solution — Side by side comparison */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              Stop Wasting Hours on Every Application
            </h2>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto">
              The average job seeker spends 45-60 minutes per tailored application. KarKo AI compresses that into under 90 seconds, with better results.
            </p>
          </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Before */}
            <ScrollReveal delay={100} direction="left">
            <div className="bg-white rounded-2xl p-8 border border-red-100 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <Clock className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-red-700">The Old Way</h3>
              </div>
              <ul className="space-y-4">
                {[
                  { text: '45-60 minutes per application', detail: 'Rewriting your CV, cover letter, and email for every job' },
                  { text: 'Generic cover letters', detail: 'Copy-paste with minor tweaks' },
                  { text: 'Manual company research', detail: 'Googling the company before writing' },
                  { text: 'Filtered out by ATS', detail: 'Wrong format, missing keywords' },
                  { text: 'Fewer applications sent', detail: 'Burnout from repetitive work' },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="text-red-400 font-bold mt-0.5 text-lg leading-none">&#x2715;</span>
                    <div>
                      <span className="font-medium text-charcoal">{item.text}</span>
                      <p className="text-sm text-warm-gray mt-0.5">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            </ScrollReveal>

            {/* After */}
            <ScrollReveal delay={300} direction="right">
            <div className="bg-white rounded-2xl p-8 border-2 border-sage-200 shadow-md relative">
              <div className="absolute -top-3 left-6 px-3 py-1 bg-sage-500 text-white text-xs font-bold rounded-full">KARKO AI</div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-sage-100 rounded-xl flex items-center justify-center">
                  <Zap className="w-5 h-5 text-sage-600" />
                </div>
                <h3 className="text-lg font-bold text-sage-700">The KarKo Way</h3>
              </div>
              <ul className="space-y-4">
                {[
                  { text: 'Under 90 seconds per application', detail: 'Fit analysis + CV + cover letter + email in one click' },
                  { text: 'Hyper-personalized documents', detail: 'Every word tailored to the specific job' },
                  { text: 'AI company analysis', detail: 'AI extracts culture, values, and requirements from the job posting' },
                  { text: 'ATS-optimized formatting', detail: 'Passes every applicant tracking system' },
                  { text: 'Apply to 10x more jobs', detail: 'More applications, more interviews' },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium text-charcoal">{item.text}</span>
                      <p className="text-sm text-warm-gray mt-0.5">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* How It Works — Clean 3-step process */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Simple Process</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              Three Steps to Your Next Interview
            </h2>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto">
              Upload once, apply everywhere. Our agentic AI handles the heavy lifting.
            </p>
          </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line (desktop only) */}
            <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-gold-200 via-gold-400 to-gold-200" />

            {[
              {
                step: '1',
                title: 'Upload Your Master CV',
                description: 'Upload your master CV or primary CV once. KarKo AI parses your skills, experience, and achievements to build your professional profile.',
                icon: FileText,
                color: 'navy',
              },
              {
                step: '2',
                title: 'Paste the Job Description',
                description: 'Drop in any job posting. Our AI analyzes requirements, runs a fit analysis, and identifies skill matches automatically.',
                icon: Search,
                color: 'gold',
              },
              {
                step: '3',
                title: 'Get Your Complete Package',
                description: 'Receive a tailored CV, personalized cover letter, and professional email. Ready to send in under 90 seconds.',
                icon: Zap,
                color: 'sage',
              },
            ].map((item, idx) => {
              const Icon = item.icon;
              const bgColor = item.color === 'navy' ? 'bg-navy-100' : item.color === 'gold' ? 'bg-gold-100' : 'bg-sage-100';
              const iconColor = item.color === 'navy' ? 'text-navy-600' : item.color === 'gold' ? 'text-gold-500' : 'text-sage-600';
              return (
                <ScrollReveal key={item.step} delay={idx * 200}>
                <div className="text-center relative">
                  <div className={`w-20 h-20 ${bgColor} rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm relative z-10`}>
                    <Icon className={`w-9 h-9 ${iconColor}`} />
                  </div>
                  <div className="inline-flex items-center justify-center w-8 h-8 bg-navy-600 text-white text-sm font-bold rounded-full mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-bold text-charcoal mb-3">{item.title}</h3>
                  <p className="text-warm-gray leading-relaxed">{item.description}</p>
                </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* What Makes KarKo Different — Competitive advantages */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-navy-600">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-gold-400 uppercase tracking-widest mb-3">Why KarKo AI</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Not Just Another Resume Builder
            </h2>
            <p className="text-lg text-navy-200 max-w-2xl mx-auto">
              Most tools help you format a resume. KarKo AI is an agentic system that creates your entire application package: researched, personalized, and ATS-ready.
            </p>
          </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Sparkles,
                title: 'Agentic AI Workflow',
                description: 'Not a template filler. Our AI agent researches, analyzes, writes, and refines, like having a career coach on demand.',
              },
              {
                icon: Globe,
                title: 'US & EU Templates',
                description: 'Professional templates for both markets. German Lebenslauf, US ATS-optimized, and more, all region-appropriate.',
              },
              {
                icon: Search,
                title: 'AI Company Analysis',
                description: 'AI extracts company culture, values, and key requirements directly from the job description to personalize your application.',
              },
              {
                icon: Shield,
                title: 'ATS-Optimized Output',
                description: 'Every document is formatted to pass Applicant Tracking Systems. Your application actually gets seen by humans.',
              },
              {
                icon: TrendingUp,
                title: 'Fit Analysis',
                description: 'Before generating your application, AI compares your profile to the job \u2014 showing you matching skills, gaps to address, and an honest fit score.',
              },
              {
                icon: MessageSquare,
                title: 'AI Self-Refinement',
                description: 'Our AI automatically iterates and refines your documents before delivering them, ensuring the highest quality output.',
              },
              {
                icon: BarChart3,
                title: 'Skill Gap Analysis',
                description: 'See every matching skill and every gap \u2014 listed individually, not hidden. Know exactly where you stand before you apply.',
              },
            ].map((feature, i) => {
              const Icon = feature.icon;
              return (
                <ScrollReveal key={i} delay={i * 100}>
                <div className="bg-navy-700/50 backdrop-blur-sm rounded-xl p-6 border border-navy-500/50 hover:border-gold-400/30 transition-all group card-hover-lift">
                  <div className="w-12 h-12 bg-navy-500/50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-gold-400/20 transition-colors">
                    <Icon className="w-6 h-6 text-gold-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                  <p className="text-navy-200 text-sm leading-relaxed">{feature.description}</p>
                </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Complete Package Breakdown */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">What You Get</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              A Complete Application Package, Every Time
            </h2>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto">
              Each application generates three professionally crafted documents, all personalized to the specific job and company.
            </p>
          </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: FileText,
                title: 'Tailored CV',
                items: ['Skills reordered to match job requirements', 'Keywords optimized for ATS screening', 'No fabricated skills \u2014 only what\u2019s in your profile', 'Professional formatting (US & EU)'],
                accent: 'navy',
              },
              {
                icon: Target,
                title: 'Personalized Cover Letter',
                items: ['Company-specific opening paragraph', 'Skill-to-requirement matching', 'Tone adapted to company culture', 'Achievement-based opening (not \u201cI am writing to express my interest\u201d)'],
                accent: 'gold',
              },
              {
                icon: Zap,
                title: 'Professional Email',
                items: ['Ready-to-send application email', 'Appropriate subject line', 'Concise and professional tone', 'Includes key qualifications'],
                accent: 'sage',
              },
            ].map((pkg, i) => {
              const Icon = pkg.icon;
              const borderColor = pkg.accent === 'navy' ? 'border-navy-200' : pkg.accent === 'gold' ? 'border-gold-300' : 'border-sage-200';
              const iconBg = pkg.accent === 'navy' ? 'bg-navy-100' : pkg.accent === 'gold' ? 'bg-gold-100' : 'bg-sage-100';
              const iconColor = pkg.accent === 'navy' ? 'text-navy-600' : pkg.accent === 'gold' ? 'text-gold-500' : 'text-sage-600';
              return (
                <ScrollReveal key={i} delay={i * 150}>
                <div className={`bg-cream-50 rounded-2xl p-8 border ${borderColor} card-hover-lift`}>
                  <div className={`w-14 h-14 ${iconBg} rounded-xl flex items-center justify-center mb-5`}>
                    <Icon className={`w-7 h-7 ${iconColor}`} />
                  </div>
                  <h3 className="text-xl font-bold text-charcoal mb-4">{pkg.title}</h3>
                  <ul className="space-y-3">
                    {pkg.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2.5 text-sm">
                        <CheckCircle className="w-4 h-4 text-sage-500 flex-shrink-0 mt-0.5" />
                        <span className="text-warm-gray">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Founder Story — Authentic social proof */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-5xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Built by a Job Seeker</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              The Tool I Wished I Had
            </h2>
          </div>
          </ScrollReveal>

          <ScrollReveal delay={200}>
          <div className="bg-white rounded-2xl p-8 md:p-12 border border-cream-200 shadow-sm">
            <div className="flex flex-col md:flex-row items-center gap-10">
              <div className="flex-shrink-0">
                <div className="w-48 h-48 md:w-56 md:h-56 rounded-2xl overflow-hidden border-4 border-cream-100 shadow-lg">
                  <Image
                    src="/wasim-founder.jpg"
                    alt="Wasim Jalali, Founder of KarKo AI"
                    width={224}
                    height={224}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div>
                <div className="space-y-4 text-warm-gray leading-relaxed">
                  <p className="text-lg">
                    &ldquo;I was building an AI startup in Germany when I ran out of money. No savings, no investors, no degree to fall back on. I started applying for jobs.
                  </p>
                  <p className="text-lg">
                    Generic applications got me nothing. Zero interviews. So I started tailoring every application by hand, researching the company, rewriting my CV, crafting a cover letter, drafting the email. Each one took 45 to 60 minutes. I built a manual solution inside Claude using my CV as context. The quality was better, but the process was still painfully slow.
                  </p>
                  <p className="text-lg">
                    So I built Karko AI to automate the entire workflow. Paste a job description, get a complete tailored application in under 90 seconds: ATS-optimized CV, personalized cover letter, professional email, and an honest fit assessment. I used it on my own job search. Within about 20 applications, I got my first interview.
                  </p>
                  <p className="text-lg">
                    That&apos;s when I knew every job seeker needed this tool.&rdquo;
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-3">
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

      {/* Pricing Preview — Updated to new prices */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-5xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto">
              All features included in every plan. The only difference is how many applications you need.
            </p>
          </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-3 gap-6 mb-10">
            <ScrollReveal delay={0}>
            <div className="bg-cream-50 rounded-2xl p-8 border border-cream-200 card-hover-lift">
              <h3 className="font-bold text-charcoal text-lg mb-1">Starter</h3>
              <p className="text-sm text-warm-gray mb-4">See your first AI application</p>
              <div className="text-4xl font-bold text-navy-600 mb-1">Free</div>
              <p className="text-sm text-warm-gray mb-6">20 applications included</p>
              <Link
                href="/auth/signup"
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium border-2 border-navy-200 text-navy-600 hover:bg-navy-50 transition-colors"
              >
                Start Free
              </Link>
            </div>
            </ScrollReveal>
            <ScrollReveal delay={150}>
            <div className="bg-white rounded-2xl p-8 border-2 border-gold-400 shadow-xl relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gold-400 text-white text-xs font-bold rounded-full">MOST POPULAR</div>
              <h3 className="font-bold text-charcoal text-lg mb-1">Plus</h3>
              <p className="text-sm text-warm-gray mb-4">For serious job seekers</p>
              <div className="text-4xl font-bold text-navy-600 mb-1">$29.99<span className="text-lg font-normal text-warm-gray">/mo</span></div>
              <p className="text-sm text-warm-gray mb-4">60 applications per month</p>
              <p className="text-xs font-medium text-gold-500 mb-6">That&apos;s just $0.50 per complete application</p>
              <Link
                href="/auth/signup?plan=plus"
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium bg-gradient-to-r from-gold-400 to-gold-500 text-white hover:from-gold-500 hover:to-gold-600 transition-all shadow-md"
              >
                Get Plus
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            </ScrollReveal>
            <ScrollReveal delay={300}>
            <div className="bg-cream-50 rounded-2xl p-8 border border-cream-200 card-hover-lift">
              <h3 className="font-bold text-charcoal text-lg mb-1">Pro</h3>
              <p className="text-sm text-warm-gray mb-4">For high-volume applicants</p>
              <div className="text-4xl font-bold text-navy-600 mb-1">$49.99<span className="text-lg font-normal text-warm-gray">/mo</span></div>
              <p className="text-sm text-warm-gray mb-4">120 applications per month</p>
              <p className="text-xs font-medium text-sage-600 mb-6">That&apos;s just ~$0.42 per complete application</p>
              <Link
                href="/auth/signup?plan=pro"
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium bg-navy-600 text-white hover:bg-navy-700 transition-colors shadow-md"
              >
                Get Pro
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            </ScrollReveal>
          </div>

          <ScrollReveal>
          <div className="text-center">
            <Link
              href="/pricing"
              className="text-navy-600 font-medium hover:text-navy-700 transition-colors inline-flex items-center gap-2"
            >
              Compare plans in detail
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* What is a Master CV? */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <ScrollReveal direction="left">
            <div>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Master CV</p>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
                Don&apos;t Have a Master CV?
              </h2>
              <p className="text-warm-gray leading-relaxed mb-4">
                A Master CV is a comprehensive document (5-10 pages) that contains your complete professional history: every job, skill, achievement, and certification. It is not something you send to employers. It is the source material that KarKo AI draws from to create perfectly tailored applications.
              </p>
              <p className="text-warm-gray leading-relaxed mb-6">
                Most people do not have one, and that is okay. We have built a free guided process that helps you create yours in about 30 minutes using any AI chatbot.
              </p>
              <Link
                href="/master-cv"
                className="inline-flex items-center gap-2 px-6 py-3 bg-navy-600 text-white font-semibold rounded-xl hover:bg-navy-700 transition-colors shadow-md"
              >
                Learn How to Create Yours
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={200}>
            <div className="bg-white rounded-2xl p-8 border border-cream-200 shadow-sm card-hover-lift">
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
                    <CheckCircle className="w-4 h-4 text-sage-500 flex-shrink-0 mt-0.5" />
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

      {/* Final CTA — High-impact conversion section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-navy-600 via-navy-700 to-navy-800 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold-400/10 rounded-full -translate-y-1/2 translate-x-1/2 animate-float-slow" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gold-400/5 rounded-full translate-y-1/2 -translate-x-1/2 animate-float-delayed" />

        <ScrollReveal>
        <div className="max-w-4xl mx-auto text-center relative">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">
            Your Next Interview Is{' '}
            <span className="text-gold-400">90 Seconds Away</span>
          </h2>
          <p className="text-lg text-navy-200 mb-10 max-w-2xl mx-auto leading-relaxed">
            Stop wasting hours on applications and start landing interviews faster with KarKo AI.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/signup"
              className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 text-lg"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/pricing"
              className="w-full sm:w-auto px-10 py-4 glass-dark text-white font-semibold rounded-xl hover:bg-white/20 transition-all flex items-center justify-center text-lg"
            >
              View Pricing
            </Link>
          </div>
          <p className="mt-6 text-sm text-navy-300">
            No credit card required. 20 free applications to start.
          </p>
        </div>
        </ScrollReveal>
      </section>

      <Footer />
    </div>
  );
}
