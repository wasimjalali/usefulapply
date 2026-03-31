'use client';

import { Star } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';

interface Review {
  name: string;
  location: string;
  date: string;
  rating: number;
  title: string;
  text: string;
}

const reviews: Review[] = [
  {
    name: 'Mohammad Shafiq',
    location: 'DE',
    date: 'March 8, 2026',
    rating: 5,
    title: 'Karko is a very useful AI tool for job applications',
    text: 'Karko is a very useful AI tool for job applications. It helps create a professional CV in the European and USA format and also assists with writing strong cover letters. The platform is easy to use and saves a lot of time when preparing job applications. I would definitely recommend it to anyone who wants to improve their CV and apply for jobs more efficiently. 👍',
  },
  {
    name: 'Zaeem Jalali',
    location: 'PK',
    date: 'March 4, 2026',
    rating: 5,
    title: 'Extraordinary for creating targeted CVs',
    text: 'If you are someone whose looking for jobs like me this is the best site for you. It saves so much time and energy for you. You can create targeted CV, Cover Letter and Email + follow up email in a matter of seconds for any Job application you want.',
  },
];

export default function TrustpilotReviews() {
  const handleReviewClick = () => {
    window.open('https://www.trustpilot.com/review/karkoai.com', '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-cream-50 relative overflow-hidden">
      <div className="absolute inset-0 dot-grid opacity-20" />
      <div className="max-w-6xl mx-auto relative">
        <ScrollReveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Testimonials</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              What Job Seekers Are Saying
            </h2>
            <div className="flex justify-center mb-6">
              <button
                onClick={handleReviewClick}
                className="hover:opacity-80 transition-opacity"
                aria-label="View Karko AI reviews on Trustpilot"
              >
                <img
                  src="/trustpilot-logo.png"
                  alt="Trustpilot"
                  className="h-8 w-auto"
                />
              </button>
            </div>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-2 gap-6 mb-10">
          {reviews.map((review, index) => (
            <ScrollReveal key={index} delay={index * 150}>
              <button
                onClick={handleReviewClick}
                className="bg-white rounded-2xl p-8 border border-cream-200 shadow-sm hover:shadow-lg hover:border-gold-300/50 transition-all text-left w-full group"
              >
                {/* Stars */}
                <div className="flex gap-1 mb-4">
                  {[...Array(review.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-gold-500 fill-gold-500" />
                  ))}
                </div>

                {/* Title */}
                <h3 className="text-lg font-bold text-navy-600 mb-3 group-hover:text-gold-600 transition-colors">
                  {review.title}
                </h3>

                {/* Review Text */}
                <p className="text-warm-gray leading-relaxed mb-6">
                  {review.text}
                </p>

                {/* Reviewer Info */}
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-semibold text-navy-600">{review.name}</p>
                    <p className="text-warm-gray">{review.location}</p>
                  </div>
                  <p className="text-warm-gray">{review.date}</p>
                </div>
              </button>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={300}>
          <div className="text-center">
            <button
              onClick={handleReviewClick}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-teal-600 hover:text-teal-700 transition-colors"
            >
              View All Reviews on Trustpilot
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
