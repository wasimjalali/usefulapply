'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, MessageSquare, Send, CheckCircle, ArrowRight } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';

export default function ContactPage() {
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState),
      });

      const data = await response.json();

      if (response.ok) {
        setSubmitted(true);
      } else {
        alert(data.error || 'Failed to submit form. Please try again.');
      }
    } catch (error) {
      console.error('Contact form error:', error);
      alert('Failed to submit form. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />
      <main>
      {/* Hero Section */}
      <section className="pt-20 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <ScrollReveal delay={0} direction="down" distance={20}>
          <p className="text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-4">Contact</p>
          </ScrollReveal>
          <ScrollReveal delay={150}>
          <h1 className="font-bold text-navy-600 text-[44px] sm:text-[52px] leading-[1.05] tracking-tight mb-6">
            Get in <span className="text-gold-500">touch.</span>
          </h1>
          </ScrollReveal>
          <ScrollReveal delay={300}>
          <p className="text-xl text-warm-gray max-w-2xl mx-auto leading-relaxed">
            Have a question, feedback, or just want to say hi? We would love to hear from you.
          </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Contact Options */}
      <section className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-6 mb-12">
            <ScrollReveal delay={0} direction="left">
            <div className="bg-white rounded-2xl p-8 border border-cream-200 text-center shadow-sm card-hover-lift">
              <div className="w-14 h-14 bg-gold-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Mail className="w-7 h-7 text-gold-500" />
              </div>
              <h3 className="text-lg font-bold text-charcoal mb-2">Email Us</h3>
              <p className="text-warm-gray text-sm mb-3">For general inquiries and support</p>
              <a 
                href="mailto:support@karkoai.com" 
                className="text-navy-600 font-semibold hover:text-navy-700 transition-colors"
              >
                support@karkoai.com
              </a>
            </div>
            </ScrollReveal>
            <ScrollReveal delay={200} direction="right">
            <div className="bg-white rounded-2xl p-8 border border-cream-200 text-center shadow-sm card-hover-lift">
              <div className="w-14 h-14 bg-gold-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-7 h-7 text-gold-500" />
              </div>
              <h3 className="text-lg font-bold text-charcoal mb-2">Live Chat</h3>
              <p className="text-warm-gray text-sm mb-3">Available Mon-Fri, 9am-5pm EST</p>
              <span className="text-warm-gray text-sm italic">Coming soon</span>
            </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Contact Form */}
      <section className="py-8 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <ScrollReveal>
          <div className="bg-white rounded-2xl p-8 md:p-10 border border-cream-200 shadow-md">
            <h2 className="font-bold text-navy-600 text-[22px] md:text-[28px] leading-[1.15] mb-6 text-center">
              Send us a message.
            </h2>

            {submitted ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gold-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-gold-500" />
                </div>
                <h3 className="text-xl font-semibold text-charcoal mb-2">Message Sent!</h3>
                <p className="text-warm-gray mb-6">
                  Thanks for reaching out. We will get back to you within 24 hours.
                </p>
                <button
                  onClick={() => {
                    setSubmitted(false);
                    setFormState({ name: '', email: '', subject: '', message: '' });
                  }}
                  className="text-navy-600 font-medium hover:text-navy-700 transition-colors"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-charcoal mb-2">
                      Your Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      required
                      maxLength={200}
                      value={formState.name}
                      onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-cream-300 focus:border-navy-400 focus:ring-2 focus:ring-navy-100 outline-none transition-all"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-charcoal mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      required
                      value={formState.email}
                      onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-cream-300 focus:border-navy-400 focus:ring-2 focus:ring-navy-100 outline-none transition-all"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-charcoal mb-2">
                    Subject
                  </label>
                  <select
                    id="subject"
                    required
                    value={formState.subject}
                    onChange={(e) => setFormState({ ...formState, subject: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-cream-300 focus:border-navy-400 focus:ring-2 focus:ring-navy-100 outline-none transition-all bg-white"
                  >
                    <option value="">Select a topic</option>
                    <option value="general">General Inquiry</option>
                    <option value="support">Technical Support</option>
                    <option value="billing">Billing Question</option>
                    <option value="feedback">Product Feedback</option>
                    <option value="partnership">Partnership Opportunity</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-charcoal mb-2">
                    Message
                  </label>
                  <textarea
                    id="message"
                    required
                    rows={5}
                    value={formState.message}
                    onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-cream-300 focus:border-navy-400 focus:ring-2 focus:ring-navy-100 outline-none transition-all resize-none"
                    placeholder="How can we help you?"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? (
                    'Sending...'
                  ) : (
                    <>
                      Send Message
                      <Send className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* FAQ Link */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-navy-700 relative overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-[0.04]" />
        <ScrollReveal>
        <div className="max-w-3xl mx-auto text-center relative">
          <h2 className="font-bold text-white text-[32px] md:text-[40px] leading-[1.1] mb-4">
            Looking for quick answers?
          </h2>
          <p className="text-[17px] text-navy-100 mb-8 max-w-xl mx-auto">
            Check our pricing page for frequently asked questions about credits, plans and features.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm transition-colors text-base"
          >
            View pricing and FAQ
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        </ScrollReveal>
      </section>
      </main>
      <Footer />
    </div>
  );
}
