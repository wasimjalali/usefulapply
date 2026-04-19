'use client';

import { Star, ExternalLink, Quote } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';
import { SectionBackground } from './AnimatedBackground';

interface Review {
  name: string;
  location: string;
  date: string;
  rating: number;
  title: string;
  text: string;
  initials: string;
}

const reviews: Review[] = [
  {
    name: 'Mohammad Shafiq',
    location: 'DE',
    date: 'March 8, 2026',
    rating: 5,
    title: 'Karko is a very useful AI tool for job applications',
    text: 'Karko is a very useful AI tool for job applications. It helps create a professional CV in the European and USA format and also assists with writing strong cover letters. The platform is easy to use and saves a lot of time when preparing job applications. I would definitely recommend it to anyone who wants to improve their CV and apply for jobs more efficiently.',
    initials: 'MS',
  },
  {
    name: 'Zaeem Jalali',
    location: 'PK',
    date: 'March 4, 2026',
    rating: 5,
    title: 'Extraordinary for creating targeted CVs',
    text: 'If you are someone whose looking for jobs like me this is the best site for you. It saves so much time and energy for you. You can create targeted CV, Cover Letter and Email + follow up email in a matter of seconds for any Job application you want.',
    initials: 'ZJ',
  },
];

export default function TrustpilotReviews() {
  const handleReviewClick = () => {
    window.open('https://www.trustpilot.com/review/karkoai.com', '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-cream-50 relative overflow-hidden">
      <SectionBackground intensity="light" variant={3} sectionColor="#FEFDFB" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-400/40 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-400/40 to-transparent" />

      <div className="max-w-5xl mx-auto relative">
        <ScrollReveal>
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Testimonials</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-6">
              What Job Seekers Are Saying
            </h2>

            <div className="flex justify-center">
              <button
                onClick={handleReviewClick}
                className="hover:opacity-80 transition-opacity cursor-pointer"
                aria-label="View Karko AI reviews on Trustpilot"
              >
                <img
                  src="/trustpilot-logo.png"
                  alt="Trustpilot"
                  className="h-16 w-auto"
                />
              </button>
            </div>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {reviews.map((review, index) => (
            <ScrollReveal key={index} delay={index * 150} className="h-full">
              <div className="relative bg-white rounded-2xl border border-cream-200 shadow-md hover:shadow-xl transition-all duration-300 h-full flex flex-col overflow-hidden group">
                <div className={`h-1 bg-gradient-to-r ${index === 0 ? 'from-navy-600 to-navy-700' : 'from-gold-400 to-gold-500'}`} />

                <div className="p-8 flex flex-col flex-grow">
                  {/* Quote icon */}
                  <div className="mb-5">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${index === 0 ? 'bg-navy-50' : 'bg-gold-50'}`}>
                      <Quote className={`w-5 h-5 ${index === 0 ? 'text-navy-400' : 'text-gold-400'}`} />
                    </div>
                  </div>

                  {/* Stars */}
                  <div className="flex gap-1 mb-4">
                    {[...Array(review.rating)].map((_, i) => (
                      <Star key={i} className="w-4.5 h-4.5 text-gold-500 fill-gold-500" />
                    ))}
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-bold text-navy-600 mb-4 leading-snug">
                    &ldquo;{review.title}&rdquo;
                  </h3>

                  {/* Review Text */}
                  <p className="text-warm-gray leading-relaxed mb-8 flex-grow text-[15px]">
                    {review.text}
                  </p>

                  {/* Reviewer */}
                  <div className="flex items-center gap-4 pt-6 border-t border-cream-200">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm ${index === 0 ? 'bg-gradient-to-br from-navy-600 to-navy-700' : 'bg-gradient-to-br from-gold-400 to-gold-500'}`}>
                      {review.initials}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-navy-600 text-sm">{review.name}</p>
                      <p className="text-warm-gray text-xs">{review.location} &middot; {review.date}</p>
                    </div>
                    <div className="flex gap-0.5">
                      {[...Array(review.rating)].map((_, i) => (
                        <Star key={i} className="w-3 h-3 text-gold-400 fill-gold-400" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={300}>
          <div className="text-center">
            <button
              onClick={handleReviewClick}
              className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl font-semibold text-sm text-navy-600 bg-white border border-cream-200 shadow-sm hover:shadow-md hover:border-gold-300/50 transition-all cursor-pointer"
            >
              View All Reviews on Trustpilot
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
