import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, Calendar, User, Tag, ArrowRight } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { getPostBySlug, getAllPosts, CATEGORY_COLORS } from '@/lib/blog';
import type { BlogCategory } from '@/lib/blog';
import { BlogContent } from '@/components/blog/BlogContent';

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return { title: 'Post Not Found' };
  }

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.karkoai.com';

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      url: `${SITE_URL}/blog/${post.slug}`,
      siteName: 'KarKo AI',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt || post.publishedAt,
      authors: [post.author.name],
      tags: post.tags,
      images: post.ogImage
        ? [{ url: post.ogImage, width: 1200, height: 630, alt: post.title }]
        : [{ url: '/favicon-512x512.png', width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const allPosts = getAllPosts();
  const currentIndex = allPosts.findIndex((p) => p.slug === post.slug);
  const relatedPosts = allPosts
    .filter((p) => p.slug !== post.slug && p.category === post.category)
    .slice(0, 3);

  const categoryColors = CATEGORY_COLORS[post.category as BlogCategory] || {
    bg: 'bg-cream-50',
    text: 'text-charcoal',
    border: 'border-cream-200',
  };

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.karkoai.com';

  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />
      <main>
      {/* Article JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.description,
            author: {
              '@type': 'Person',
              name: post.author.name,
              jobTitle: post.author.role,
            },
            publisher: {
              '@type': 'Organization',
              name: 'KarKo AI',
              url: SITE_URL,
              logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon-512x512.png` },
            },
            datePublished: post.publishedAt,
            dateModified: post.updatedAt || post.publishedAt,
            mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
            keywords: post.tags.join(', '),
            wordCount: post.content.split(/\s+/).length,
            timeRequired: `PT${post.readingTime}M`,
          }),
        }}
      />

      <article className="pt-16 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          {/* Back link */}
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-warm-gray hover:text-navy-600 transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Blog
          </Link>

          {/* Header */}
          <header className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <span
                className={`px-3 py-1 text-xs font-medium rounded-full border ${categoryColors.bg} ${categoryColors.text} ${categoryColors.border}`}
              >
                {post.category}
              </span>
            </div>

            <h1 className="font-bold text-navy-600 text-[32px] sm:text-[40px] lg:text-[48px] leading-[1.1] mb-6">
              {post.title}
            </h1>

            <p className="text-lg text-warm-gray mb-6">{post.description}</p>

            <div className="flex flex-wrap items-center gap-4 text-sm text-warm-gray pb-6 border-b border-cream-200">
              <div className="flex items-center gap-3">
                {post.author.name === 'Wasim Jalali' ? (
                  <div className="relative w-10 h-10 rounded-full overflow-hidden ring-2 ring-gold-200">
                    <Image
                      src="/wasim-avatar.jpg"
                      alt="Wasim Jalali"
                      fill
                      className="object-cover"
                      sizes="40px"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-navy-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-navy-600" />
                  </div>
                )}
                <div>
                  <span className="font-semibold text-charcoal">{post.author.name}</span>
                  <span className="text-warm-gray"> · {post.author.role}</span>
                </div>
              </div>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(post.publishedAt).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {post.readingTime} min read
              </span>
            </div>
          </header>

          {/* Content */}
          <div className="prose prose-lg max-w-none prose-headings:text-navy-700 prose-headings:font-bold prose-p:text-charcoal prose-p:leading-relaxed prose-a:text-navy-600 prose-a:underline hover:prose-a:text-gold-600 prose-strong:text-navy-700 prose-li:text-charcoal prose-blockquote:border-gold-400 prose-blockquote:text-warm-gray prose-code:text-navy-600 prose-code:bg-cream-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
            <BlogContent content={post.content} slug={post.slug} />
          </div>

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="mt-10 pt-6 border-t border-cream-200">
              <div className="flex items-center gap-2 flex-wrap">
                <Tag className="w-4 h-4 text-warm-gray" />
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 text-xs font-medium bg-cream-50 text-warm-gray rounded-full border border-cream-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="mt-12 bg-navy-700 rounded-2xl p-8 text-white text-center">
            <h3 className="font-bold text-white text-[22px] leading-[1.15] mb-2">
              {post.cta?.heading || 'Ready to apply smarter?'}
            </h3>
            <p className="text-navy-200 mb-5 text-sm">
              {post.cta?.description || 'Generate a complete job application (optimized CV + cover letter + email) in under 90 seconds.'}
            </p>
            <Link
              href={post.cta?.href || '/dashboard'}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm transition-colors text-sm"
            >
              {post.cta?.text || 'Try it free'}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Related posts */}
          {relatedPosts.length > 0 && (
            <div className="mt-16">
              <h2 className="font-bold text-navy-600 text-[22px] md:text-[28px] leading-[1.15] mb-6">Related articles.</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {relatedPosts.map((related) => (
                  <Link key={related.slug} href={`/blog/${related.slug}`} className="group">
                    <div className="bg-white rounded-xl border border-cream-200 p-5 hover:shadow-md hover:border-gold-300 transition-all">
                      <h3 className="font-semibold text-navy-700 mb-2 group-hover:text-gold-600 transition-colors line-clamp-2 text-sm">
                        {related.title}
                      </h3>
                      <p className="text-xs text-warm-gray line-clamp-2">{related.description}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>
      </main>
      <Footer />
    </div>
  );
}
