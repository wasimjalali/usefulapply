import Link from 'next/link';
import { ArrowRight, FileText, Search, Zap, Clock, Target, CheckCircle, Star } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';

export default function Home() {
  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />

      {/* Hero Section */}
      <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-navy-600 mb-6 leading-tight">
              Job Applications That Actually Get You Interviews
            </h1>
            <p className="text-xl text-warm-gray mb-8 max-w-2xl mx-auto">
              Stop spending hours on each application. Our AI creates personalized CVs, cover letters, and emails in under 3 minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/auth/signup"
                className="w-full sm:w-auto px-8 py-4 bg-gold-400 text-white font-semibold rounded-xl hover:bg-gold-500 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                Start Free — 5 Applications
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="#how-it-works"
                className="w-full sm:w-auto px-8 py-4 border-2 border-navy-600 text-navy-600 font-semibold rounded-xl hover:bg-navy-50 transition-colors flex items-center justify-center gap-2"
              >
                See How It Works
              </Link>
            </div>
            <p className="mt-6 text-sm text-warm-gray">
              No credit card required. Start applying in minutes.
            </p>
          </div>

          {/* Social Proof */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-warm-gray">
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-gold-400 text-gold-400" />
              ))}
              <span className="ml-2 text-sm font-medium">4.9/5 from 500+ users</span>
            </div>
            <div className="text-sm">
              <span className="font-semibold text-charcoal">10,000+</span> applications created
            </div>
          </div>
        </div>
      </section>

      {/* Problem/Solution Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-navy-600 mb-4">
              Job Applications Should Not Take Hours
            </h2>
            <p className="text-warm-gray max-w-2xl mx-auto">
              The average job seeker spends 40+ minutes per application. Most of that time is wasted on repetitive tasks that AI can do better.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Before */}
            <div className="bg-red-50 rounded-2xl p-8 border border-red-100">
              <h3 className="text-lg font-semibold text-red-700 mb-4">Without KarKo AI</h3>
              <ul className="space-y-3">
                {[
                  'Spend 40+ minutes per application',
                  'Copy-paste the same generic content',
                  'Research companies manually',
                  'Wonder if your CV even gets read',
                  'Apply to fewer jobs, miss opportunities',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-red-700">
                    <span className="text-red-400 mt-1">✗</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* After */}
            <div className="bg-sage-50 rounded-2xl p-8 border border-sage-100">
              <h3 className="text-lg font-semibold text-sage-700 mb-4">With KarKo AI</h3>
              <ul className="space-y-3">
                {[
                  'Complete applications in under 3 minutes',
                  'Every document personalized to the job',
                  'AI researches the company for you',
                  'ATS-optimized to pass screening',
                  'Apply to more jobs, get more interviews',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sage-700">
                    <CheckCircle className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-navy-600 mb-4">
              How It Works
            </h2>
            <p className="text-warm-gray max-w-2xl mx-auto">
              Three simple steps. That is all it takes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Upload Your CV',
                description: 'Upload your master CV once. We will use it as the foundation for all your applications.',
                icon: FileText,
              },
              {
                step: '2',
                title: 'Paste the Job Description',
                description: 'Copy any job posting and paste it in. Our AI analyzes what they are looking for.',
                icon: Search,
              },
              {
                step: '3',
                title: 'Get Your Package',
                description: 'Receive a tailored CV, cover letter, and email — all personalized to that specific job.',
                icon: Zap,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.step} className="text-center">
                  <div className="w-16 h-16 bg-gold-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-8 h-8 text-gold-500" />
                  </div>
                  <div className="inline-flex items-center justify-center w-8 h-8 bg-navy-600 text-white text-sm font-bold rounded-full mb-3">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-semibold text-charcoal mb-2">{item.title}</h3>
                  <p className="text-warm-gray">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-navy-600 mb-4">
              Everything You Need to Land Your Dream Job
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Search,
                title: 'Smart Company Research',
                description: 'Our AI researches the company, their culture, and recent news to make your application stand out.',
              },
              {
                icon: Target,
                title: 'ATS-Optimized',
                description: 'Every CV is formatted to pass Applicant Tracking Systems. No more getting filtered out.',
              },
              {
                icon: Zap,
                title: 'Instant Personalization',
                description: 'Each document is tailored to the specific job. No generic templates.',
              },
              {
                icon: Clock,
                title: 'Save 40+ Minutes',
                description: 'What used to take an hour now takes under 3 minutes. Apply to more jobs.',
              },
              {
                icon: FileText,
                title: 'Complete Package',
                description: 'Get a tailored CV, compelling cover letter, and professional email — all at once.',
              },
              {
                icon: CheckCircle,
                title: 'Refine with AI',
                description: 'Not perfect? Chat with our AI to refine any section until it is exactly right.',
              },
            ].map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div key={i} className="bg-cream-50 rounded-xl p-6 hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 bg-navy-100 rounded-xl flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-navy-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-charcoal mb-2">{feature.title}</h3>
                  <p className="text-warm-gray text-sm">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-navy-600">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Real Results from Real Job Seekers
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: "Applied to 50 jobs in one weekend. Got 8 interviews in the first week. This tool is a game-changer.",
                name: 'Sarah M.',
                role: 'Product Manager',
                rating: 5,
              },
              {
                quote: "I was skeptical about AI writing my cover letters, but these are better than anything I could write myself.",
                name: 'James L.',
                role: 'Software Engineer',
                rating: 5,
              },
              {
                quote: "Finally landed my dream job after months of searching. The personalization made all the difference.",
                name: 'Emily R.',
                role: 'Marketing Director',
                rating: 5,
              },
            ].map((testimonial, i) => (
              <div key={i} className="bg-navy-700 rounded-xl p-6 border border-navy-500">
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-gold-400 text-gold-400" />
                  ))}
                </div>
                <p className="text-white mb-4">&quot;{testimonial.quote}&quot;</p>
                <div>
                  <p className="font-semibold text-white">{testimonial.name}</p>
                  <p className="text-navy-200 text-sm">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-navy-600 mb-4">
            Simple, Honest Pricing
          </h2>
          <p className="text-warm-gray mb-8 max-w-2xl mx-auto">
            Start free with 5 applications. Upgrade when you need more. No hidden fees, no surprises.
          </p>

          <div className="grid sm:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-xl p-6 border border-cream-200">
              <h3 className="font-semibold text-charcoal mb-2">Starter</h3>
              <div className="text-3xl font-bold text-navy-600 mb-2">Free</div>
              <p className="text-warm-gray text-sm">5 applications to try it out</p>
            </div>
            <div className="bg-white rounded-xl p-6 border-2 border-gold-400 shadow-lg">
              <div className="text-xs font-bold text-gold-500 mb-2">MOST POPULAR</div>
              <h3 className="font-semibold text-charcoal mb-2">Plus</h3>
              <div className="text-3xl font-bold text-navy-600 mb-2">$19.99<span className="text-lg font-normal text-warm-gray">/mo</span></div>
              <p className="text-warm-gray text-sm">~20 applications per month</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-cream-200">
              <h3 className="font-semibold text-charcoal mb-2">Pro</h3>
              <div className="text-3xl font-bold text-navy-600 mb-2">$39.99<span className="text-lg font-normal text-warm-gray">/mo</span></div>
              <p className="text-warm-gray text-sm">~40 applications per month</p>
            </div>
          </div>

          <Link
            href="/pricing"
            className="text-navy-600 font-medium hover:text-navy-700 transition-colors inline-flex items-center gap-2"
          >
            View full pricing details
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-gold-400 to-gold-500">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
            Ready to Land More Interviews?
          </h2>
          <p className="text-navy-700 mb-8 max-w-2xl mx-auto">
            Join thousands of job seekers who have transformed their job search with KarKo AI. Start with 5 free applications today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/signup"
              className="w-full sm:w-auto px-8 py-4 bg-navy-600 text-white font-semibold rounded-xl hover:bg-navy-700 transition-colors shadow-lg flex items-center justify-center gap-2"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/pricing"
              className="w-full sm:w-auto px-8 py-4 bg-white text-navy-600 font-semibold rounded-xl hover:bg-cream-50 transition-colors flex items-center justify-center"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
