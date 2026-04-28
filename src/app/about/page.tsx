import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Users, Target, Heart, Zap, Sparkles, Shield, Globe } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { CountUp } from '@/components/marketing/CountUp';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'About Karko AI: The Only AI That Writes Application Emails',
  description:
    'Built by job seekers, for job seekers. Karko AI generates complete applications: CV, cover letter, email, and follow-up — all in one pass. Powered by Claude Sonnet 4.6.',
  canonical: '/about',
});

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-cream-100">
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
            KarKo AI was born from a simple frustration: talented people spending hours on applications that go nowhere. We built an agentic AI system that does the work for you, so you can focus on what matters.
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
              Most job tools solve one piece of the puzzle. We built an end-to-end system that handles the entire application process.
            </p>
          </div>
          </ScrollReveal>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: Sparkles,
                title: 'Agentic, Not Assistive',
                description: 'Other tools help you format a resume. KarKo AI is an autonomous agent that analyzes, writes, and self-refines, delivering a complete application package in one workflow.',
              },
              {
                icon: Target,
                title: 'Personalization at Scale',
                description: 'Every document is tailored to the specific job and company. We do not believe in generic templates. We believe in applications that make recruiters stop and read.',
              },
              {
                icon: Globe,
                title: 'Built for Global Job Seekers',
                description: 'Professional templates for US and EU markets. German Lebenslauf, US ATS-optimized formats, and region-appropriate cover letters, all built in.',
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

      {/* Stats */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-navy-600">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-4 gap-8 text-center">
            {[
              { value: '45-60 min', label: 'Saved Per Application' },
              { value: '<90 sec', label: 'To Generate Full Package' },
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

      {/* CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-navy-700 relative overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-[0.04]" />
        <ScrollReveal>
        <div className="max-w-3xl mx-auto text-center relative">
          <h2 className="font-bold text-white text-[36px] md:text-[48px] leading-[1.1] mb-5">
            Your next interview is <span className="text-gold-400">90 seconds away.</span>
          </h2>
          <p className="text-[17px] text-navy-100 mb-9 max-w-xl mx-auto leading-relaxed">
            Start with 2 free applications. No credit card required.
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
