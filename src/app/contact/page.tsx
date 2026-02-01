'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, MessageSquare, Send, CheckCircle } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';

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
    
    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setSubmitted(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />

      {/* Hero Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-navy-600 mb-6">
            Get in Touch
          </h1>
          <p className="text-xl text-warm-gray max-w-2xl mx-auto">
            Have a question, feedback, or just want to say hi? We would love to hear from you.
          </p>
        </div>
      </section>

      {/* Contact Options */}
      <section className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-6 mb-12">
            <div className="bg-white rounded-xl p-6 border border-cream-200 text-center">
              <div className="w-12 h-12 bg-gold-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Mail className="w-6 h-6 text-gold-500" />
              </div>
              <h3 className="text-lg font-semibold text-charcoal mb-2">Email Us</h3>
              <p className="text-warm-gray text-sm mb-3">For general inquiries and support</p>
              <a 
                href="mailto:hello@karko.ai" 
                className="text-navy-600 font-medium hover:text-navy-700 transition-colors"
              >
                hello@karko.ai
              </a>
            </div>
            <div className="bg-white rounded-xl p-6 border border-cream-200 text-center">
              <div className="w-12 h-12 bg-sage-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-6 h-6 text-sage-500" />
              </div>
              <h3 className="text-lg font-semibold text-charcoal mb-2">Live Chat</h3>
              <p className="text-warm-gray text-sm mb-3">Available Mon-Fri, 9am-5pm EST</p>
              <span className="text-warm-gray text-sm">Coming soon</span>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form */}
      <section className="py-8 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl p-8 border border-cream-200 shadow-sm">
            <h2 className="text-2xl font-bold text-navy-600 mb-6 text-center">
              Send Us a Message
            </h2>

            {submitted ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-sage-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-sage-500" />
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
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gold-400 text-white font-semibold rounded-xl hover:bg-gold-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        </div>
      </section>

      {/* FAQ Link */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-cream-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-navy-600 mb-4">
            Looking for Quick Answers?
          </h2>
          <p className="text-warm-gray mb-6">
            Check out our pricing page for frequently asked questions about credits, plans, and features.
          </p>
          <Link
            href="/pricing#faq"
            className="inline-flex items-center gap-2 text-navy-600 font-medium hover:text-navy-700 transition-colors"
          >
            View FAQ
            <span>→</span>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
