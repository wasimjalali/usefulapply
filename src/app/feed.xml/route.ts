import { getAllPosts } from '@/lib/blog/posts';
import { BRAND } from '@/lib/brand';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.url;
// TODO(Task 7.1): switch the RSS author address from noreply@karkoai.com to noreply@usefulapply.com

export async function GET() {
  const posts = getAllPosts();

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Useful Apply Blog</title>
    <link>${SITE_URL}/blog</link>
    <description>Expert insights on AI-powered job applications, CV optimization, ATS strategies, and career advice. Get hired faster with data-driven job search tips.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    ${posts
      .map(
        (post) => `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${SITE_URL}/blog/${post.slug}</link>
      <description>${escapeXml(post.description)}</description>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
      <guid isPermaLink="true">${SITE_URL}/blog/${post.slug}</guid>
      <category>${escapeXml(post.category)}</category>
      <author>noreply@karkoai.com (${escapeXml(post.author.name)})</author>
    </item>`
      )
      .join('')}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
