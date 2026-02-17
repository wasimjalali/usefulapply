import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, FileText, Search, Zap, Clock, Target, Check, CheckCircle, Shield, Globe, Sparkles, Crown, TrendingUp } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import { PlusPlanButton, ProPlanButton } from '@/components/marketing/HomePricingButtons';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { TimeSavingsCalculator } from '@/components/marketing/TimeSavingsCalculator';

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
            
            <ScrollReveal delay={150}>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-navy-600 mb-6 leading-[1.1] tracking-tight">
              Get Your Complete Job Application Package{' '}
              <span className="bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">in 90 Seconds</span>
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
                className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 text-lg"
              >
                Try It Free, No Sign Up
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="#product-demo"
                className="w-full sm:w-auto px-10 py-4 glass text-navy-600 font-semibold rounded-xl hover:bg-white/80 hover:shadow-lg hover:scale-[1.02] hover:border-gold-200 transition-all duration-300 flex items-center justify-center gap-2 text-lg shadow-sm border border-cream-200/50"
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
                <Shield className="w-4 h-4 text-gold-400" />
                <span className="font-medium">No sign-up required</span>
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

      {/* Product Demo — Interactive walkthrough */}
      <section id="product-demo" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-10">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">See It In Action</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              Watch How Karko AI Works
            </h2>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto">
              From job description to complete application package in under 90 seconds. Click through the interactive demo below.
            </p>
          </div>
          </ScrollReveal>
          <ScrollReveal delay={200}>
          <div className="relative overflow-hidden" style={{ position: 'relative', width: '100%', aspectRatio: '2.09' }}>
            <iframe
              src="https://app.supademo.com/embed/cmllcaojt249p5yi3ra4lbip5?embed_v=2&utm_source=embed"
              loading="lazy"
              title="Optimize Your CV and Land Job Applications with Karko AI"
              allow="clipboard-write"
              frameBorder="0"
              allowFullScreen
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            />
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Step 1: Upload Your CV */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <ScrollReveal direction="left">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-navy-600 text-white text-lg font-bold rounded-full">1</div>
                <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest">Step One</p>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
                Upload Your CV Once
              </h2>
              <p className="text-lg text-warm-gray leading-relaxed mb-6">
                Upload your master CV or primary CV one time. Karko AI reads through your entire professional history and builds a complete profile of your skills, experience, and achievements.
              </p>
              <p className="text-warm-gray leading-relaxed">
                This is the foundation for every application you generate. The more detailed your CV, the better Karko AI can tailor your documents to each job.
              </p>
            </div>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={200}>
            <div className="bg-white rounded-2xl p-8 border border-cream-200 shadow-sm">
              <div className="w-16 h-16 bg-navy-100 rounded-2xl flex items-center justify-center mb-6">
                <FileText className="w-8 h-8 text-navy-600" />
              </div>
              <h3 className="text-lg font-bold text-charcoal mb-4">What Karko AI Extracts</h3>
              <ul className="space-y-3">
                {[
                  'Your complete work history and job titles',
                  'Technical and soft skills with context',
                  'Achievements and measurable results',
                  'Education, certifications, and languages',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle className="w-4 h-4 text-sage-500 flex-shrink-0 mt-0.5" />
                    <span className="text-warm-gray">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Step 2: Paste the Job Description */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <ScrollReveal direction="left" className="md:order-2">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-gold-500 text-white text-lg font-bold rounded-full">2</div>
                <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest">Step Two</p>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
                Paste Any Job Description
              </h2>
              <p className="text-lg text-warm-gray leading-relaxed mb-6">
                Copy and paste the job posting you want to apply for. Karko AI instantly analyzes the requirements and compares them to your profile.
              </p>
              <p className="text-warm-gray leading-relaxed">
                You get an honest fit score before anything is generated. You see which skills match, which ones are missing, and whether the role is worth applying for.
              </p>
            </div>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={200} className="md:order-1">
            <div className="bg-cream-50 rounded-2xl p-8 border border-cream-200 shadow-sm">
              <div className="w-16 h-16 bg-gold-100 rounded-2xl flex items-center justify-center mb-6">
                <Search className="w-8 h-8 text-gold-500" />
              </div>
              <h3 className="text-lg font-bold text-charcoal mb-4">What the AI Does</h3>
              <ul className="space-y-3">
                {[
                  'Analyzes job requirements and responsibilities',
                  'Matches your skills to what the employer needs',
                  'Identifies gaps so you know where you stand',
                  'Gives you a fit score before you apply',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle className="w-4 h-4 text-gold-500 flex-shrink-0 mt-0.5" />
                    <span className="text-warm-gray">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Step 3: Get Your Four Documents */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-cream-50 to-cream-100">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-14">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-navy-600 text-white text-lg font-bold rounded-full">3</div>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest">Step Three</p>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              Get Four Ready-to-Send Documents
            </h2>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto">
              Every document is personalized to the job, the company, and your real experience. Nothing is fabricated.
            </p>
          </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 gap-6 mb-16">
            {[
              {
                icon: FileText,
                title: 'Tailored CV',
                description: 'Your skills reordered to match the job. Keywords optimized for ATS screening. Professional formatting for US and EU markets.',
                accent: 'navy',
              },
              {
                icon: Target,
                title: 'Personalized Cover Letter',
                description: 'Company-specific opening. Your achievements matched to their requirements. Tone adapted to the company culture.',
                accent: 'gold',
              },
              {
                icon: Zap,
                title: 'Application Email',
                description: 'Ready to send with the right subject line, professional tone, and your key qualifications highlighted.',
                accent: 'sage',
              },
              {
                icon: Clock,
                title: 'Follow-Up Email',
                description: 'Timed for 5 to 7 days after your application. Highlights a different achievement than your first email. Confident, not desperate.',
                accent: 'gold',
              },
            ].map((pkg, i) => {
              const Icon = pkg.icon;
              const iconBg = pkg.accent === 'navy' ? 'bg-navy-100' : pkg.accent === 'gold' ? 'bg-gold-100' : 'bg-sage-100';
              const iconColor = pkg.accent === 'navy' ? 'text-navy-600' : pkg.accent === 'gold' ? 'text-gold-500' : 'text-sage-600';
              return (
                <ScrollReveal key={i} delay={i * 120}>
                <div className="bg-white rounded-2xl p-8 border border-cream-200 shadow-sm hover:shadow-md hover:border-gold-300/50 transition-all group">
                  <div className={`w-14 h-14 ${iconBg} rounded-xl flex items-center justify-center mb-5 group-hover:scale-105 transition-transform`}>
                    <Icon className={`w-7 h-7 ${iconColor}`} />
                  </div>
                  <h3 className="text-xl font-bold text-navy-600 mb-3">{pkg.title}</h3>
                  <p className="text-warm-gray leading-relaxed">{pkg.description}</p>
                </div>
                </ScrollReveal>
              );
            })}
          </div>

          {/* Why it's different */}
          <ScrollReveal delay={200}>
          <div className="bg-white rounded-2xl border border-cream-200 shadow-sm p-8 md:p-10">
            <h3 className="text-xl md:text-2xl font-bold text-navy-600 text-center mb-8">
              Why Job Seekers Trust Karko AI
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  icon: TrendingUp,
                  title: 'Honest Fit Score',
                  description: 'See your real match before applying. Matching skills, gaps, and a clear score with no false hope.',
                },
                {
                  icon: Shield,
                  title: 'Zero Fabrication',
                  description: 'Every skill on your CV is verified from your actual profile. Nothing invented, nothing inflated.',
                },
                {
                  icon: Globe,
                  title: 'US and EU Ready',
                  description: 'ATS-optimized US formats and German Lebenslauf templates, both built in.',
                },
                {
                  icon: Sparkles,
                  title: 'Self-Refining AI',
                  description: 'Not a chatbot. Karko reviews and refines its own output before delivering it to you.',
                },
              ].map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <div key={i} className="text-center">
                    <div className="w-12 h-12 bg-gold-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                      <Icon className="w-6 h-6 text-gold-500" />
                    </div>
                    <h4 className="text-sm font-bold text-navy-600 mb-2">{feature.title}</h4>
                    <p className="text-sm text-warm-gray leading-relaxed">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
          </ScrollReveal>
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
                    &ldquo;I ran out of money building a startup in Germany. No savings, no degree to fall back on. Generic job applications got me zero interviews. Tailoring each one by hand took 45 to 60 minutes, and it still was not fast enough.
                  </p>
                  <p className="text-lg">
                    So I built Karko AI to do the entire workflow automatically. Paste a job description, get a tailored CV, cover letter, and professional email in under 90 seconds. Within about 20 applications, I got my first interview. That&apos;s when I knew every job seeker needed this.&rdquo;
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

      {/* Pricing — Full value-focused cards */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto">
              All features included in every plan. You just choose your volume.
            </p>
          </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-8 mb-10">
            {/* Starter */}
            <ScrollReveal delay={0}>
            <div className="relative bg-white rounded-2xl border-2 border-cream-200 shadow-md overflow-hidden card-hover-lift">
              <div className="p-8 flex flex-col h-full">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 rounded-xl bg-cream-100">
                    <Sparkles className="w-6 h-6 text-navy-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-charcoal">Starter</h3>
                    <p className="text-sm text-warm-gray">See your first AI application</p>
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
                    { text: 'Fit score before you apply' },
                    { text: 'US & EU professional templates' },
                    { text: 'No watermark on any document' },
                  ].map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-sage-500" />
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

            {/* Plus — Most Popular */}
            <ScrollReveal delay={150}>
            <div className="relative bg-white rounded-2xl border-2 border-gold-400 shadow-xl scale-[1.02] overflow-hidden">
              <div className="bg-gradient-to-r from-gold-400 to-gold-500 text-white text-xs font-bold px-4 py-2 text-center">
                MOST POPULAR
              </div>
              <div className="p-8 flex flex-col h-full">
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
                    <span className="text-4xl font-bold text-navy-600">$29.99</span>
                    <span className="text-warm-gray">/month</span>
                  </div>
                  <p className="text-xs text-warm-gray mt-1">~$0.50 per application</p>
                  <div className="mt-2">
                    <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-gold-50 text-gold-600 border border-gold-200">
                      120 credits/month
                    </span>
                  </div>
                </div>
                <ul className="space-y-3 mb-5">
                  {[
                    { text: '60 complete applications/month', bold: true },
                    { text: 'Tailored CV, cover letter, email & follow-up' },
                    { text: 'Fit score before you apply' },
                    { text: 'Unlimited application history' },
                    { text: 'Add-on credit packs available' },
                  ].map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-sage-500" />
                      <span className={`text-sm text-charcoal ${f.bold ? 'font-semibold' : ''}`}>{f.text}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 bg-gold-50 border border-gold-200">
                  <Clock className="w-5 h-5 flex-shrink-0 text-gold-500" />
                  <span className="text-sm font-semibold text-navy-600">~45 hours saved/month</span>
                </div>
                <div className="mt-auto pt-6">
                  <PlusPlanButton />
                </div>
              </div>
            </div>
            </ScrollReveal>

            {/* Pro — Best Value */}
            <ScrollReveal delay={300}>
            <div className="relative bg-white rounded-2xl border-2 border-sage-400 shadow-lg overflow-hidden card-hover-lift">
              <div className="bg-sage-500 text-white text-xs font-bold px-4 py-2 text-center">
                BEST VALUE PER APPLICATION
              </div>
              <div className="p-8 flex flex-col h-full">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 rounded-xl bg-sage-100">
                    <Crown className="w-6 h-6 text-sage-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-charcoal">Pro</h3>
                    <p className="text-sm text-warm-gray">For high-volume applicants</p>
                  </div>
                </div>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-navy-600">$49.99</span>
                    <span className="text-warm-gray">/month</span>
                  </div>
                  <p className="text-xs text-warm-gray mt-1">~$0.42 per application</p>
                  <div className="mt-2">
                    <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-sage-50 text-sage-600 border border-sage-200">
                      240 credits/month
                    </span>
                  </div>
                </div>
                <ul className="space-y-3 mb-5">
                  {[
                    { text: '120 complete applications/month', bold: true },
                    { text: 'Tailored CV, cover letter, email & follow-up' },
                    { text: 'Fit score before you apply' },
                    { text: 'Unlimited history + credit rollover (2 months)' },
                    { text: 'Add-on credit packs available' },
                  ].map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-sage-500" />
                      <span className={`text-sm text-charcoal ${f.bold ? 'font-semibold' : ''}`}>{f.text}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 bg-navy-600">
                  <Clock className="w-5 h-5 flex-shrink-0 text-gold-400" />
                  <span className="text-sm font-semibold text-white">~90 hours saved/month</span>
                </div>
                <div className="mt-auto pt-6">
                  <ProPlanButton />
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
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold-200/30 rounded-full -translate-y-1/2 translate-x-1/2 animate-float-slow" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gold-100/40 rounded-full translate-y-1/2 -translate-x-1/2 animate-float-delayed" />
        <div className="max-w-4xl mx-auto relative">
          <ScrollReveal>
          <div className="text-center mb-10">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Time Savings</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-3">
              How Much Time Will You Save?
            </h2>
            <p className="text-warm-gray max-w-lg mx-auto">
              Each tailored application takes 45-60 minutes by hand. KarKo AI does it in under 90 seconds.
            </p>
          </div>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <TimeSavingsCalculator />
          </ScrollReveal>
        </div>
      </section>

      {/* Final CTA — High-impact conversion section (placed before Master CV for momentum) */}
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
            Start with 5 free applications. No credit card required.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 text-lg"
            >
              Try It Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/pricing"
              className="w-full sm:w-auto px-10 py-4 glass-dark text-white font-semibold rounded-xl hover:bg-white/30 hover:shadow-xl hover:scale-[1.02] hover:border-gold-400/50 transition-all duration-300 flex items-center justify-center text-lg"
            >
              View Pricing
            </Link>
          </div>
        </div>
        </ScrollReveal>
      </section>

      {/* What is a Master CV? — Helpful "one more thing" for users who scroll past CTA */}
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

      <Footer />
    </div>
  );
}
