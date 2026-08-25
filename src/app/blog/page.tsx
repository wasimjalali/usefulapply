import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Clock, Calendar, BookOpen, Sparkles, Rss } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { getAllPosts, CATEGORY_COLORS } from '@/lib/blog';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { getBlurDataUrl } from '@/lib/blog/blur-data';

export const metadata: Metadata = buildPageMetadata({
  title: 'Blog: Career Tips & AI Job Search',
  description:
    'Expert advice on CV optimization, cover letter writing, job search strategies and how AI is transforming hiring. Tips from the Useful Apply team.',
  canonical: '/blog',
});

export default function BlogPage() {
  const posts = getAllPosts();
  const featuredPost = posts.find((p) => p.featured) ?? posts[0];
  const remainingPosts = posts.filter((p) => p.slug !== featuredPost?.slug);
  const topPicks = remainingPosts.slice(0, 2);
  const restPosts = remainingPosts.slice(2);

  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />
      <main>
        {/* Hero */}
        <section className="pt-20 pb-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-cream-50 rounded-full text-sm text-charcoal mb-6 shadow-sm border border-cream-200">
              <BookOpen className="w-4 h-4 text-gold-500" />
              <span className="font-medium">Useful Apply Blog</span>
            </div>
            <h1 className="font-semibold text-navy-600 text-[44px] sm:text-[52px] leading-[1.05] tracking-tight mb-4">
              Career tips and <span className="text-gold-500">job search strategies.</span>
            </h1>
            <p className="text-lg text-warm-gray max-w-2xl mx-auto mb-4">
              Practical advice to help you land your dream job faster. From CV optimization to interview prep, powered by real-world insights.
            </p>
            <a
              href="/feed.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-gold-600 hover:text-gold-700 font-medium transition-colors"
            >
              <Rss className="w-4 h-4" />
              Subscribe via RSS
            </a>
          </div>
        </section>

        {/* Content */}
        <section className="px-4 sm:px-6 lg:px-8 pb-24">
          <div className="max-w-7xl mx-auto">
            {posts.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-20 h-20 bg-cream-50 border border-cream-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="w-10 h-10 text-gold-400" />
                </div>
                <h2 className="font-semibold text-navy-600 text-[22px] md:text-[28px] leading-[1.15] mb-3">Coming soon.</h2>
                <p className="text-warm-gray max-w-md mx-auto mb-8">
                  We&apos;re working on expert articles about CV optimization, AI in job search, and career strategies. Stay tuned!
                </p>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm transition-colors"
                >
                  Start free
                </Link>
              </div>
            ) : (
              <div className="space-y-14">
                {/* Featured hero: horizontal split */}
                {featuredPost && (
                  <Link href={`/blog/${featuredPost.slug}`} className="block group">
                    <article className="bg-cream-50 rounded-2xl border border-cream-200 overflow-hidden shadow-sm hover:shadow-md hover:border-gold-300 transition-all duration-200 grid lg:grid-cols-2">
                      <div className="relative w-full aspect-[16/10] lg:aspect-auto lg:min-h-[380px] bg-cream-100">
                        {featuredPost.ogImage ? (
                          <Image
                            src={featuredPost.ogImage}
                            alt={featuredPost.title}
                            fill
                            priority
                            {...(getBlurDataUrl(featuredPost.ogImage)
                              ? { placeholder: 'blur' as const, blurDataURL: getBlurDataUrl(featuredPost.ogImage) }
                              : {})}
                            className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
                            sizes="(max-width: 1024px) 100vw, 640px"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <BookOpen className="w-12 h-12 text-warm-gray" />
                          </div>
                        )}
                        <div className="absolute top-4 left-4">
                          <span className="px-3 py-1 text-xs font-semibold bg-gold-400 text-white rounded-full shadow-sm">
                            Featured
                          </span>
                        </div>
                      </div>
                      <div className="p-8 lg:p-10 flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-4">
                          {(() => {
                            const colors = CATEGORY_COLORS[featuredPost.category] || { bg: 'bg-cream-50', text: 'text-charcoal', border: 'border-cream-200' };
                            return (
                              <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
                                {featuredPost.category}
                              </span>
                            );
                          })()}
                        </div>
                        <h2 className="font-semibold text-navy-700 text-2xl lg:text-[30px] leading-[1.2] mb-4 group-hover:text-gold-600 transition-colors">
                          {featuredPost.title}
                        </h2>
                        <p className="text-warm-gray text-base lg:text-lg mb-6 line-clamp-3">
                          {featuredPost.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-warm-gray">
                          <div className="flex items-center gap-2">
                            {featuredPost.author.name === 'Wasim Jalali' ? (
                              <div className="relative w-6 h-6 rounded-full overflow-hidden ring-1 ring-gold-200">
                                <Image src="/wasim-avatar.jpg" alt="Wasim Jalali" fill className="object-cover" sizes="24px" />
                              </div>
                            ) : null}
                            <span className="font-medium text-charcoal">{featuredPost.author.name}</span>
                          </div>
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

                {/* Top picks: 2-column row */}
                {topPicks.length > 0 && (
                  <div className="grid md:grid-cols-2 gap-6">
                    {topPicks.map((post) => {
                      const colors = CATEGORY_COLORS[post.category] || { bg: 'bg-cream-50', text: 'text-charcoal', border: 'border-cream-200' };
                      return (
                        <Link key={post.slug} href={`/blog/${post.slug}`} className="block group">
                          <article className="bg-cream-50 rounded-2xl border border-cream-200 h-full flex flex-col overflow-hidden shadow-sm hover:shadow-md hover:border-gold-300 transition-all duration-200">
                            <div className="relative aspect-[16/8] bg-cream-100">
                              {post.ogImage ? (
                                <Image
                                  src={post.ogImage}
                                  alt={post.title}
                                  fill
                                  {...(getBlurDataUrl(post.ogImage)
                                    ? { placeholder: 'blur' as const, blurDataURL: getBlurDataUrl(post.ogImage) }
                                    : {})}
                                  className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
                                  sizes="(max-width: 768px) 100vw, 50vw"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <BookOpen className="w-10 h-10 text-warm-gray" />
                                </div>
                              )}
                            </div>
                            <div className="p-6 flex flex-col flex-1">
                              <div className="mb-3">
                                <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
                                  {post.category}
                                </span>
                              </div>
                              <h3 className="font-semibold text-navy-700 text-xl leading-[1.25] mb-3 line-clamp-2 group-hover:text-gold-600 transition-colors">
                                {post.title}
                              </h3>
                              <p className="text-sm text-warm-gray mb-4 line-clamp-2 flex-1">
                                {post.description}
                              </p>
                              <div className="flex items-center gap-3 text-xs text-warm-gray pt-4 border-t border-cream-200">
                                <div className="flex items-center gap-2">
                                  {post.author.name === 'Wasim Jalali' ? (
                                    <div className="relative w-5 h-5 rounded-full overflow-hidden ring-1 ring-gold-200">
                                      <Image src="/wasim-avatar.jpg" alt="Wasim Jalali" fill className="object-cover" sizes="20px" />
                                    </div>
                                  ) : null}
                                  <span className="font-medium text-charcoal">{post.author.name}</span>
                                </div>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {post.readingTime} min
                                </span>
                              </div>
                            </div>
                          </article>
                        </Link>
                      );
                    })}
                  </div>
                )}

                {/* Divider label */}
                {restPosts.length > 0 && (
                  <div className="flex items-center gap-4 pt-2">
                    <h2 className="font-semibold text-navy-700 text-2xl">All articles</h2>
                    <div className="flex-1 h-px bg-cream-200" />
                    <span className="text-sm text-warm-gray">{restPosts.length} posts</span>
                  </div>
                )}

                {/* Grid */}
                {restPosts.length > 0 && (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {restPosts.map((post) => {
                      const colors = CATEGORY_COLORS[post.category] || { bg: 'bg-cream-50', text: 'text-charcoal', border: 'border-cream-200' };
                      return (
                        <Link key={post.slug} href={`/blog/${post.slug}`} className="block group">
                          <article className="bg-cream-50 rounded-2xl border border-cream-200 h-full flex flex-col overflow-hidden shadow-sm hover:shadow-md hover:border-gold-300 transition-all duration-200">
                            <div className="aspect-video relative bg-cream-100">
                              {post.ogImage ? (
                                <Image
                                  src={post.ogImage}
                                  alt={post.title}
                                  fill
                                  {...(getBlurDataUrl(post.ogImage)
                                    ? { placeholder: 'blur' as const, blurDataURL: getBlurDataUrl(post.ogImage) }
                                    : {})}
                                  className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
                                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <BookOpen className="w-10 h-10 text-warm-gray" />
                                </div>
                              )}
                            </div>
                            <div className="p-5 flex flex-col flex-1">
                              <div className="mb-3">
                                <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
                                  {post.category}
                                </span>
                              </div>
                              <h3 className="text-[17px] font-semibold text-navy-700 mb-2 group-hover:text-gold-600 transition-colors line-clamp-2 leading-[1.3]">
                                {post.title}
                              </h3>
                              <p className="text-sm text-warm-gray mb-4 line-clamp-3 flex-1">
                                {post.description}
                              </p>
                              <div className="flex items-center gap-3 text-xs text-warm-gray pt-4 border-t border-cream-200">
                                <div className="flex items-center gap-2">
                                  {post.author.name === 'Wasim Jalali' ? (
                                    <div className="relative w-5 h-5 rounded-full overflow-hidden ring-1 ring-gold-200">
                                      <Image src="/wasim-avatar.jpg" alt="Wasim Jalali" fill className="object-cover" sizes="20px" />
                                    </div>
                                  ) : null}
                                  <span className="font-medium text-charcoal">{post.author.name}</span>
                                </div>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {post.readingTime} min
                                </span>
                              </div>
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
          <div className="max-w-3xl mx-auto text-center bg-navy-700 rounded-2xl p-10 text-white">
            <h2 className="font-semibold text-white text-[28px] leading-[1.1] mb-3">
              Ready to apply smarter?
            </h2>
            <p className="text-navy-200 mb-6">
              Stop spending hours on each application. Useful Apply generates your complete application in under 90 seconds.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm transition-colors"
            >
              Start free
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
