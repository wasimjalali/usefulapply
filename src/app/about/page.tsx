import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Users, Target, Heart, Zap, Sparkles, Clock, Shield, Globe } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { CountUp } from '@/components/marketing/CountUp';

export const metadata: Metadata = {
  title: 'About KarKo AI',
  description:
    'Learn about KarKo AI — the AI-powered job application assistant built by a job seeker, for job seekers. Our mission is to help you apply smarter and land interviews faster.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-20 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <ScrollReveal delay={0} direction="down" distance={20}>
          <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-4">About KarKo AI</p>
          </ScrollReveal>
          <ScrollReveal delay={150}>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-navy-600 mb-6 leading-tight">
            We Built the Job Application Tool{' '}
            <span className="bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">We Wished We Had</span>
          </h1>
          </ScrollReveal>
          <ScrollReveal delay={300}>
          <p className="text-xl text-warm-gray max-w-2xl mx-auto leading-relaxed">
            KarKo AI was born from a simple frustration: talented people spending hours on applications that go nowhere. We built an agentic AI system that does the work for you — so you can focus on what matters.
          </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <ScrollReveal direction="left">
            <div>
              <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Our Story</p>
              <h2 className="text-3xl font-bold text-navy-600 mb-6">From Job Seeker to Founder</h2>
              <div className="space-y-4 text-warm-gray leading-relaxed">
                <p>
                  KarKo AI was born from personal experience. As a job seeker, I was applying to <strong className="text-charcoal">50-60 jobs</strong> at a time — rewriting my CV, researching companies, crafting cover letters, and drafting emails. It was exhausting and incredibly time-consuming.
                </p>
                <p>
                  I first tried building a solution inside a chatbot — a custom project that would help generate my application materials. But even with that setup, each application still took <strong className="text-charcoal">45 minutes or more</strong>. The manual back-and-forth was the bottleneck.
                </p>
                <p>
                  That is when I decided to build KarKo AI — a fully agentic system that does everything in <strong className="text-charcoal">one automated workflow</strong>: analyze the job, extract company insights, run a fit analysis, and generate a complete application package in under 3 minutes.
                </p>
                <p>
                  I built it for myself first. When I saw the results — more interviews, less time wasted — I knew this had to be shared with other job seekers facing the same struggle.
                </p>
              </div>
            </div>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={200}>
            <div className="bg-cream-50 rounded-2xl p-8 border border-cream-200">
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-charcoal">The Problem</p>
                    <p className="text-sm text-warm-gray">Applying to 50+ jobs, 45 minutes each — job searching became a full-time job</p>
                  </div>
                </div>
                <div className="w-px h-6 bg-cream-300 ml-5" />
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-gold-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-gold-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-charcoal">The First Attempt</p>
                    <p className="text-sm text-warm-gray">Built a chatbot project — still took 45 min per application</p>
                  </div>
                </div>
                <div className="w-px h-6 bg-cream-300 ml-5" />
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-sage-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-sage-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-charcoal">KarKo AI</p>
                    <p className="text-sm text-warm-gray">Fully agentic workflow — complete applications in under 3 minutes</p>
                  </div>
                </div>
              </div>
            </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* What Makes Us Different */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Our Difference</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">Why KarKo AI Exists</h2>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto">
              Most job tools solve one piece of the puzzle. We built an end-to-end system that handles the entire application process.
            </p>
          </div>
          </ScrollReveal>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: Sparkles,
                title: 'Agentic, Not Assistive',
                description: 'Other tools help you format a resume. KarKo AI is an autonomous agent that analyzes, writes, and self-refines — delivering a complete application package in one workflow.',
              },
              {
                icon: Target,
                title: 'Personalization at Scale',
                description: 'Every document is tailored to the specific job and company. We do not believe in generic templates — we believe in applications that make recruiters stop and read.',
              },
              {
                icon: Globe,
                title: 'Built for Global Job Seekers',
                description: 'Professional templates for US and EU markets. German Lebenslauf, US ATS-optimized formats, and region-appropriate cover letters — all built in.',
              },
              {
                icon: Shield,
                title: 'ATS-First Design',
                description: 'Every template is engineered to pass Applicant Tracking Systems. Your application gets seen by humans, not filtered out by software.',
              },
            ].map((value, i) => {
              const Icon = value.icon;
              return (
                <ScrollReveal key={i} delay={i * 150}>
                <div className="bg-white rounded-2xl p-8 border border-cream-200 shadow-sm card-hover-lift">
                  <div className="w-14 h-14 bg-gold-100 rounded-xl flex items-center justify-center mb-5">
                    <Icon className="w-7 h-7 text-gold-500" />
                  </div>
                  <h3 className="text-xl font-bold text-charcoal mb-3">{value.title}</h3>
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
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Our Values</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600">What We Stand For</h2>
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
                  <h3 className="text-lg font-bold text-charcoal mb-2">{value.title}</h3>
                  <p className="text-warm-gray text-sm leading-relaxed">{value.description}</p>
                </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-navy-600">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-4 gap-8 text-center">
            {[
              { value: '45+ min', label: 'Saved Per Application' },
              { value: '<3 min', label: 'To Generate Full Package' },
              { value: '3-in-1', label: 'CV + Cover Letter + Email' },
              { value: '100%', label: 'ATS-Optimized Output' },
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

      {/* Founder Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto">
          <ScrollReveal>
          <div className="text-center mb-10">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Meet the Founder</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600">Built by a Job Seeker, for Job Seekers</h2>
          </div>
          </ScrollReveal>
          <ScrollReveal delay={200}>
          <div className="bg-cream-50 rounded-2xl p-8 md:p-10 border border-cream-200">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="w-64 h-64 md:w-80 md:h-80 rounded-2xl overflow-hidden border-4 border-white shadow-lg">
                  <Image
                    src="/wasim-founder.jpg"
                    alt="Wasim Jalali — Founder & CEO of KarKo AI"
                    width={320}
                    height={427}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-charcoal mb-1">Wasim Jalali</h3>
                <p className="text-sm font-medium text-gold-500 mb-4">Founder & CEO</p>
                <div className="space-y-3 text-warm-gray leading-relaxed">
                  <p>
                    &ldquo;I was applying to 50-60 jobs at a time and spending hours on each application. I first tried building a solution inside a chatbot, but it still took 45 minutes per application. That frustration led me to build KarKo AI — a tool that does in 3 minutes what used to take me an hour.
                  </p>
                  <p>
                    I built it for myself first, saw real results, and knew I had to share it with every job seeker going through the same struggle. From a job seeker, to job seekers — that is what KarKo AI is all about.&rdquo;
                  </p>
                </div>
              </div>
            </div>
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-navy-600 via-navy-700 to-navy-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold-400/10 rounded-full -translate-y-1/2 translate-x-1/2 animate-float-slow" />
        <ScrollReveal>
        <div className="max-w-4xl mx-auto text-center relative">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Experience the Difference?
          </h2>
          <p className="text-lg text-navy-200 mb-10 max-w-2xl mx-auto">
            Start with 3 free applications. No credit card required. See why job seekers are switching to KarKo AI.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/signup"
              className="px-10 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-lg text-lg inline-flex items-center gap-2"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/pricing"
              className="px-10 py-4 glass-dark text-white font-semibold rounded-xl hover:bg-white/20 transition-all text-lg"
            >
              View Pricing
            </Link>
          </div>
        </div>
        </ScrollReveal>
      </section>

      <Footer />
    </div>
  );
}
