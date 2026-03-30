import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Clock, Calendar, BookOpen, Sparkles } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { getAllPosts, getAllCategories, CATEGORY_COLORS } from '@/lib/blog';
import type { BlogCategory } from '@/lib/blog';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Blog: Career Tips & AI Job Search',
  description:
    'Expert advice on CV optimization, cover letter writing, job search strategies, and how AI is transforming hiring. Tips from the KarKo AI team.',
  canonical: '/blog',
});

export default function BlogPage() {
  const posts = getAllPosts();
  const categories = getAllCategories();
  const featuredPost = posts.find((p) => p.featured);
  const regularPosts = posts.filter((p) => p !== featuredPost);

  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />
      <main>
      {/* Hero */}
      <section className="pt-20 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/70 backdrop-blur-sm rounded-full text-sm text-charcoal mb-6 shadow-sm border border-white/40">
            <BookOpen className="w-4 h-4 text-gold-500" />
            <span className="font-medium">KarKo AI Blog</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-navy-700 mb-4 leading-tight">
            Career Tips, AI Insights &{' '}
            <span className="bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">
              Job Search Strategies
            </span>
          </h1>
          <p className="text-lg text-warm-gray max-w-2xl mx-auto">
            Practical advice to help you land your dream job faster. From CV optimization to interview prep, powered by real-world insights.
          </p>
        </div>
      </section>

      {/* Category filter pills */}
      {categories.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-8 pb-8">
          <div className="max-w-5xl mx-auto flex flex-wrap gap-2 justify-center">
            {categories.map((cat) => {
              const colors = CATEGORY_COLORS[cat as BlogCategory] || { bg: 'bg-cream-50', text: 'text-charcoal', border: 'border-cream-200' };
              return (
                <span
                  key={cat}
                  className={`px-3 py-1 text-xs font-medium rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}
                >
                  {cat}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* Content */}
      <section className="px-4 sm:px-6 lg:px-8 pb-24">
        <div className="max-w-5xl mx-auto">
          {posts.length === 0 ? (
            /* Empty state */
            <div className="text-center py-20">
              <div className="w-20 h-20 bg-cream-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-10 h-10 text-gold-400" />
              </div>
              <h2 className="text-2xl font-bold text-navy-700 mb-3">Coming Soon</h2>
              <p className="text-warm-gray max-w-md mx-auto mb-8">
                We&apos;re working on expert articles about CV optimization, AI in job search, and career strategies. Stay tuned!
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-md"
              >
                Try KarKo AI Free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="space-y-12">
              {/* Featured post */}
              {featuredPost && (
                <Link href={`/blog/${featuredPost.slug}`} className="block group">
                  <article className="bg-white rounded-2xl border border-cream-200 overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 group-hover:border-gold-300">
                    <div className="p-8 sm:p-10">
                      <div className="flex items-center gap-3 mb-4">
                        <span className="px-3 py-1 text-xs font-semibold bg-gold-50 text-gold-700 border border-gold-200 rounded-full">
                          Featured
                        </span>
                        {(() => {
                          const colors = CATEGORY_COLORS[featuredPost.category] || { bg: 'bg-cream-50', text: 'text-charcoal', border: 'border-cream-200' };
                          return (
                            <span className={`px-3 py-1 text-xs font-medium rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
                              {featuredPost.category}
                            </span>
                          );
                        })()}
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-navy-700 mb-3 group-hover:text-gold-600 transition-colors">
                        {featuredPost.title}
                      </h2>
                      <p className="text-warm-gray text-lg mb-6 line-clamp-3">
                        {featuredPost.description}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-warm-gray">
                        <span className="font-medium text-charcoal">{featuredPost.author.name}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(featuredPost.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {featuredPost.readingTime} min read
                        </span>
                      </div>
                    </div>
                  </article>
                </Link>
              )}

              {/* Post grid */}
              {regularPosts.length > 0 && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {regularPosts.map((post) => {
                    const colors = CATEGORY_COLORS[post.category] || { bg: 'bg-cream-50', text: 'text-charcoal', border: 'border-cream-200' };
                    return (
                      <Link key={post.slug} href={`/blog/${post.slug}`} className="block group">
                        <article className="bg-white rounded-xl border border-cream-200 p-6 h-full flex flex-col hover:shadow-md hover:border-gold-300 transition-all duration-300">
                          <div className="mb-3">
                            <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
                              {post.category}
                            </span>
                          </div>
                          <h3 className="text-lg font-bold text-navy-700 mb-2 group-hover:text-gold-600 transition-colors line-clamp-2">
                            {post.title}
                          </h3>
                          <p className="text-sm text-warm-gray mb-4 line-clamp-3 flex-1">
                            {post.description}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-warm-gray pt-4 border-t border-cream-100">
                            <span className="font-medium text-charcoal">{post.author.name}</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {post.readingTime} min
                            </span>
                          </div>
                        </article>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 sm:px-6 lg:px-8 pb-24">
        <div className="max-w-3xl mx-auto text-center bg-gradient-to-br from-navy-600 to-navy-800 rounded-2xl p-10 text-white">
          <h2 className="text-2xl font-bold mb-3">Ready to Apply Smarter?</h2>
          <p className="text-navy-200 mb-6">
            Stop spending hours on each application. Let KarKo AI generate your complete job application in under 90 seconds.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-md"
          >
            Try It Free — No Sign Up Required
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
      </main>
      <Footer />
    </div>
  );
}
