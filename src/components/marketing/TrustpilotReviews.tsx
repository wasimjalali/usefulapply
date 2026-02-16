'use client';

import { Star, Quote } from 'lucide-react';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';

export function TrustpilotReviews() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-14">
            <div className="flex items-center justify-center gap-3 mb-4">
              {/* Trustpilot Logo */}
              <svg 
                viewBox="0 0 512 130" 
                className="w-32 h-auto"
                fill="currentColor"
              >
                <path d="M67.517 22.369h26.045v4.856H83.33v27.292h-5.626V27.225H67.517v-4.856zm24.911 8.871h4.832v4.492h.091a5.255 5.255 0 01.884-1.837 8.184 8.184 0 011.566-1.634 8.31 8.31 0 012.042-1.202 6.242 6.242 0 012.291-.454c.59 0 1.021.023 1.248.045.227.023.454.068.703.091v4.946a16.803 16.803 0 00-1.112-.159 9.484 9.484 0 00-1.111-.068c-.862 0-1.679.182-2.45.522-.772.34-1.43.862-1.997 1.52-.567.681-1.021 1.497-1.361 2.496-.34.998-.499 2.132-.499 3.425v11.072h-5.127V31.24zm37.229 23.277h-5.036v-3.244h-.091c-.635 1.18-1.566 2.11-2.813 2.813-1.248.703-2.519 1.067-3.812 1.067-3.063 0-5.286-.749-6.647-2.269-1.361-1.52-2.042-3.812-2.042-6.874V31.24h5.127v14.27c0 2.042.386 3.494 1.18 4.334.771.839 1.883 1.27 3.29 1.27 1.089 0 1.973-.159 2.699-.499.726-.34 1.316-.771 1.747-1.338.454-.545.772-1.226.976-1.997.204-.771.295-1.611.295-2.518V31.263h5.127v23.254zm8.735-7.464c.158 1.498.726 2.541 1.701 3.154.998.59 2.178.907 3.562.907.476 0 1.021-.045 1.634-.113a6.871 6.871 0 001.724-.431 3.328 3.328 0 001.338-.93c.341-.409.499-.931.477-1.589-.023-.657-.273-1.202-.726-1.61-.454-.431-1.021-.749-1.725-1.021a17.17 17.17 0 00-2.404-.658c-.908-.182-1.815-.386-2.745-.59a25.937 25.937 0 01-2.768-.771 8.442 8.442 0 01-2.382-1.226 5.377 5.377 0 01-1.679-1.951c-.431-.794-.636-1.769-.636-2.949 0-1.27.318-2.314.931-3.176.612-.862 1.406-1.543 2.336-2.065.953-.521 1.997-.884 3.154-1.111 1.157-.205 2.269-.318 3.312-.318 1.203 0 2.36.136 3.449.386 1.089.249 2.087.658 2.972 1.247.884.568 1.61 1.316 2.2 2.224.59.907.953 2.019 1.112 3.312h-5.354c-.25-1.225-.794-2.064-1.679-2.473-.885-.431-1.906-.635-3.04-.635-.363 0-.794.023-1.293.091a7.07 7.07 0 00-1.407.34 3.053 3.053 0 00-1.112.726c-.294.318-.453.726-.453 1.248 0 .635.227 1.134.658 1.52.431.386.998.703 1.701.975.703.25 1.498.477 2.405.658.908.182 1.838.386 2.791.59.93.204 1.837.477 2.745.772a8.3 8.3 0 012.405 1.225 6.046 6.046 0 011.701 1.928c.431.771.658 1.747.658 2.881 0 1.384-.318 2.541-.953 3.517a7.542 7.542 0 01-2.45 2.337 11.509 11.509 0 01-3.358 1.315c-1.225.273-2.45.409-3.652.409-1.475 0-2.836-.159-4.084-.499-1.248-.341-2.337-.84-3.244-1.498a7.42 7.42 0 01-2.156-2.518c-.521-.998-.794-2.201-.839-3.584h5.173v-.046zm16.924-15.813h3.88v-6.987h5.127v6.987h4.628v3.834h-4.628v12.433c0 .544.023.998.068 1.407.045.385.159.726.318.998s.408.476.748.612c.341.136.772.204 1.362.204.363 0 .726 0 1.089-.022a6.013 6.013 0 001.089-.159v3.97c-.568.068-1.135.114-1.657.182a13.27 13.27 0 01-1.656.09c-1.361 0-2.45-.136-3.267-.385-.816-.25-1.474-.635-1.928-1.135-.477-.499-.771-1.111-.953-1.86a14.004 14.004 0 01-.295-2.564V35.12h-3.879v-3.88h-.046zm17.265 0h4.855v3.154h.091c.726-1.361 1.724-2.314 3.017-2.904 1.293-.59 2.677-.885 4.197-.885 1.838 0 3.426.318 4.787.976a9.358 9.358 0 013.404 2.654c.907 1.134 1.565 2.45 2.019 3.948.453 1.497.68 3.108.68 4.809 0 1.566-.204 3.086-.612 4.538-.409 1.474-1.021 2.767-1.838 3.902-.817 1.134-1.86 2.019-3.131 2.7-1.27.68-2.745 1.021-4.469 1.021-.749 0-1.497-.069-2.246-.205a9.858 9.858 0 01-2.155-.658 7.758 7.758 0 01-1.906-1.157 7.2 7.2 0 01-1.475-1.633h-.091v11.616h-5.127V31.24zm17.923 11.661c0-1.043-.136-2.064-.408-3.062a8.276 8.276 0 00-1.225-2.632 6.259 6.259 0 00-2.02-1.838 5.666 5.666 0 00-2.79-.703c-2.155 0-3.789.749-4.878 2.246-1.089 1.497-1.633 3.494-1.633 5.989 0 1.18.136 2.269.431 3.267.295.999.703 1.861 1.293 2.587a6.115 6.115 0 002.042 1.701c.794.431 1.724.636 2.768.636 1.179 0 2.155-.25 2.972-.727a6.275 6.275 0 001.996-1.86 7.721 7.721 0 001.134-2.609c.205-.975.318-1.974.318-2.995zm9.052-20.532h5.127v4.856h-5.127v-4.856zm0 8.871h5.127v23.277h-5.127V31.24zm9.71-8.871h5.128v32.148h-5.128V22.369zm20.85 32.784c-1.861 0-3.517-.318-4.969-.931a10.953 10.953 0 01-3.698-2.541c-.998-1.089-1.769-2.382-2.291-3.879-.522-1.497-.794-3.154-.794-4.946 0-1.77.272-3.403.794-4.9.522-1.498 1.293-2.791 2.291-3.88s2.246-1.928 3.698-2.541c1.452-.612 3.108-.93 4.969-.93 1.86 0 3.516.318 4.968.93a10.981 10.981 0 013.698 2.541c.998 1.089 1.77 2.382 2.292 3.88.521 1.497.794 3.13.794 4.9 0 1.792-.273 3.449-.794 4.946-.522 1.497-1.294 2.79-2.292 3.879-.998 1.089-2.246 1.929-3.698 2.541-1.452.613-3.108.931-4.968.931zm0-4.061c1.134 0 2.132-.25 2.972-.727a6.31 6.31 0 002.064-1.883c.545-.771.93-1.656 1.203-2.631.249-.976.385-1.974.385-2.995 0-.998-.136-1.974-.385-2.972a7.77 7.77 0 00-1.203-2.632 6.254 6.254 0 00-2.064-1.86c-.84-.476-1.838-.726-2.972-.726-1.135 0-2.133.25-2.972.726a6.518 6.518 0 00-2.065 1.86c-.544.772-.93 1.634-1.202 2.632-.25.998-.386 1.974-.386 2.972 0 1.021.136 2.019.386 2.995.249.975.658 1.86 1.202 2.631a6.314 6.314 0 002.065 1.883c.839.5 1.837.727 2.972.727zm13.249-19.852h3.88v-6.987h5.127v6.987H257v3.834h-4.628v12.433c0 .544.023.998.068 1.407.045.385.159.726.318.998.158.272.408.476.748.612.341.136.772.204 1.361.204.363 0 .726 0 1.089-.022a6.013 6.013 0 001.089-.159v3.97c-.567.068-1.134.114-1.656.182a13.27 13.27 0 01-1.656.09c-1.361 0-2.45-.136-3.267-.385-.817-.25-1.475-.635-1.928-1.135-.477-.499-.772-1.111-.953-1.86a14.004 14.004 0 01-.295-2.564V35.12h-3.88v-3.88h-.045zM30.787 44.716l13.408-3.471 5.626 17.288-19.034-13.817zM61.55 22.369H38.046L30.787 0l-7.26 22.369L0 22.347l19.035 13.816-7.26 22.37 19.012-13.817 11.751-8.53L61.55 22.369z"/>
              </svg>
              <span className="text-2xl font-bold text-green-600">4.8</span>
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-green-500 text-green-500" />
                ))}
              </div>
            </div>
            <p className="text-sm font-semibold text-gold-500 uppercase tracking-widest mb-3">Customer Reviews</p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-600 mb-4">
              Trusted by Job Seekers Worldwide
            </h2>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto">
              See what real users are saying about their experience with KarKo AI on Trustpilot
            </p>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {[
            {
              rating: 5,
              title: "Game Changer for Job Applications",
              review: "KarKo AI completely transformed my job search. What used to take me 45 minutes per application now takes less than 2 minutes. The quality is outstanding and I've landed 3 interviews in just 2 weeks!",
              author: "Sarah M.",
              verified: true,
              date: "2 days ago"
            },
            {
              rating: 5,
              title: "Finally, an AI Tool That Doesn't Lie",
              review: "I've tried other AI resume builders that add skills I don't have. KarKo AI is different - it only uses what's actually in my experience. The fit analysis helped me focus on the right opportunities.",
              author: "Michael T.",
              verified: true,
              date: "1 week ago"
            },
            {
              rating: 5,
              title: "Worth Every Penny",
              review: "The Plus plan paid for itself after my first successful application. The cover letters are personalized and professional. I wish I had found this tool months ago!",
              author: "Jennifer L.",
              verified: true,
              date: "2 weeks ago"
            }
          ].map((review, i) => (
            <ScrollReveal key={i} delay={i * 150}>
              <div className="bg-cream-50 rounded-2xl p-8 border border-cream-200 shadow-sm hover:shadow-md transition-shadow relative">
                <Quote className="w-8 h-8 text-gold-200 absolute top-4 right-4" />
                
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="w-4 h-4 fill-green-500 text-green-500" />
                    ))}
                  </div>
                  {review.verified && (
                    <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                      Verified
                    </span>
                  )}
                </div>
                
                <h3 className="font-bold text-charcoal text-lg mb-3">{review.title}</h3>
                <p className="text-warm-gray leading-relaxed mb-6">{review.review}</p>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-charcoal">{review.author}</p>
                    <p className="text-sm text-warm-gray">{review.date}</p>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={300}>
          <div className="text-center">
            <a 
              href="https://www.trustpilot.com/review/karkoai.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold rounded-xl hover:from-green-600 hover:to-green-700 transition-all shadow-lg hover:shadow-xl"
            >
              <svg 
                viewBox="0 0 512 130" 
                className="w-6 h-6"
                fill="currentColor"
              >
                <path d="M67.517 22.369h26.045v4.856H83.33v27.292h-5.626V27.225H67.517v-4.856zm24.911 8.871h4.832v4.492h.091a5.255 5.255 0 01.884-1.837 8.184 8.184 0 011.566-1.634 8.31 8.31 0 012.042-1.202 6.242 6.242 0 012.291-.454c.59 0 1.021.023 1.248.045.227.023.454.068.703.091v4.946a16.803 16.803 0 00-1.112-.159 9.484 9.484 0 00-1.111-.068c-.862 0-1.679.182-2.45.522-.772.34-1.43.862-1.997 1.52-.567.681-1.021 1.497-1.361 2.496-.34.998-.499 2.132-.499 3.425v11.072h-5.127V31.24zm37.229 23.277h-5.036v-3.244h-.091c-.635 1.18-1.566 2.11-2.813 2.813-1.248.703-2.519 1.067-3.812 1.067-3.063 0-5.286-.749-6.647-2.269-1.361-1.52-2.042-3.812-2.042-6.874V31.24h5.127v14.27c0 2.042.386 3.494 1.18 4.334.771.839 1.883 1.27 3.29 1.27 1.089 0 1.973-.159 2.699-.499.726-.34 1.316-.771 1.747-1.338.454-.545.772-1.226.976-1.997.204-.771.295-1.611.295-2.518V31.263h5.127v23.254z"/>
              </svg>
              Read All Reviews on Trustpilot
            </a>
            <p className="text-sm text-warm-gray mt-4">
              Join thousands of satisfied job seekers who've transformed their career with KarKo AI
            </p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
