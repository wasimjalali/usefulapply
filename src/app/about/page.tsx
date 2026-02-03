import Link from 'next/link';
import { ArrowRight, Users, Target, Heart, Zap } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />

      {/* Hero Section */}
      <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-navy-600 mb-6">
            We Believe Job Searching Should Not Be a Full-Time Job
          </h1>
          <p className="text-xl text-warm-gray max-w-2xl mx-auto">
            KarKo AI was built by job seekers, for job seekers. We know the frustration of spending hours on applications that go nowhere.
          </p>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-navy-600 mb-8 text-center">Our Story</h2>
          <div className="prose prose-lg max-w-none text-warm-gray">
            <p className="mb-6">
              It started with a simple observation: talented people were spending 40+ minutes on each job application, only to hear nothing back. The process was broken.
            </p>
            <p className="mb-6">
              We asked ourselves: what if AI could handle the repetitive parts of job applications while keeping the personal touch that makes applications stand out?
            </p>
            <p className="mb-6">
              That question led to KarKo AI. We built a system that researches companies, analyzes job descriptions, and creates personalized application materials in minutes, not hours.
            </p>
            <p>
              Today, KarKo AI helps job seekers apply to more jobs, get more interviews, and land better opportunities. And we are just getting started.
            </p>
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-navy-600 mb-12 text-center">What We Stand For</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: Users,
                title: 'People First',
                description: 'We build for real job seekers with real challenges. Every feature starts with understanding what you actually need.',
              },
              {
                icon: Target,
                title: 'Quality Over Quantity',
                description: 'We would rather help you send 20 great applications than 100 generic ones. Personalization matters.',
              },
              {
                icon: Heart,
                title: 'Honest and Transparent',
                description: 'No hidden fees, no dark patterns, no BS. We tell you exactly what you get and what it costs.',
              },
              {
                icon: Zap,
                title: 'Constantly Improving',
                description: 'AI is evolving fast, and so are we. We are always working to make your applications even better.',
              },
            ].map((value, i) => {
              const Icon = value.icon;
              return (
                <div key={i} className="bg-white rounded-xl p-8 border border-cream-200">
                  <div className="w-12 h-12 bg-gold-100 rounded-xl flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-gold-500" />
                  </div>
                  <h3 className="text-xl font-semibold text-charcoal mb-3">{value.title}</h3>
                  <p className="text-warm-gray">{value.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-navy-600">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-white mb-2">Hyper-</div>
              <div className="text-navy-200">Personalized Applications</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white mb-2">40+ min</div>
              <div className="text-navy-200">Saved Per Application</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white mb-2">AI-Powered</div>
              <div className="text-navy-200">Precision Matching</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-gold-400 to-gold-500">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-navy-600 mb-4">
            Ready to Transform Your Job Search?
          </h2>
          <p className="text-navy-700 mb-8 max-w-2xl mx-auto">
            Join ambitious professionals who have discovered a better way to apply.
          </p>
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 px-8 py-4 bg-navy-600 text-white font-semibold rounded-xl hover:bg-navy-700 transition-colors shadow-lg"
          >
            Get Started Free
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
