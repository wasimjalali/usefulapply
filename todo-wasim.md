# TODO — Wasim

This file contains tasks to complete later, with step-by-step guides.

---

## Priority 3: Submit RSS Feed to Directories (Do After 10+ Blog Posts)

**When to do this:** After you have published at least 10 blog posts (currently at 6).

**Why:** Feed directories like Feedly and Feedburner help content curators and power users discover your blog. They also provide subscriber tracking analytics. However, submitting with fewer than 10 posts looks incomplete.

**Estimated time:** 15 minutes total

---

### Task 3.1: Submit to Feedly

**What:** Feedly is the most popular RSS reader. Submitting helps users discover and subscribe to your blog.

**Steps:**

1. Go to https://feedly.com
2. Click **Sign In** (or create a free account if you don't have one)
3. In the search bar, paste: `https://www.karkoai.com/feed.xml`
4. Click **Follow**
5. Feedly will auto-index your feed. No approval needed.

**Verification:**
- Search for "KarKo AI" in Feedly
- Your blog should appear in search results

---

### Task 3.2: Submit to Feedburner (Optional — Subscriber Tracking)

**What:** Feedburner is a Google service that tracks RSS subscriber counts and provides analytics.

**Steps:**

1. Go to https://feedburner.google.com
2. Sign in with your Google account
3. Click **"My Feeds"** → **"Add a new feed"**
4. Enter: `https://www.karkoai.com/feed.xml`
5. Click **Next**
6. Choose a feed title: **"KarKo AI Blog"**
7. Choose a feed address (URL slug): `karko-ai` or `karkoai-blog`
8. Click **"Activate Feed"**

**After activation:**
- Go to **Analyze** tab to see subscriber stats
- (Optional) Enable email subscriptions from **Publicize** tab
- Copy your Feedburner URL (e.g., `https://feeds.feedburner.com/karko-ai`)
- Update your blog RSS link to use the Feedburner URL instead of `/feed.xml` (this enables tracking)

**To update the RSS link:**

Open `src/app/blog/page.tsx` and change:
```tsx
href="/feed.xml"
```
To:
```tsx
href="https://feeds.feedburner.com/karko-ai"
```

Also update `src/app/layout.tsx`:
```tsx
'application/rss+xml': `${SITE_URL}/feed.xml`,
```
To:
```tsx
'application/rss+xml': 'https://feeds.feedburner.com/karko-ai',
```

---

### Task 3.3: Submit to Bloglovin' (Optional)

**What:** Bloglovin' is a blog discovery platform popular with lifestyle and career content readers.

**Steps:**

1. Go to https://www.bloglovin.com
2. Sign up for a free account
3. Click **"Claim Your Blog"**
4. Enter your blog URL: `https://www.karkoai.com/blog`
5. Bloglovin' will auto-detect your RSS feed
6. Follow the verification steps (usually involves adding a meta tag or publishing a specific post)
7. Once verified, your blog will appear in Bloglovin' search

---

### Task 3.4: Add RSS Icon to Footer (Optional Enhancement)

**What:** Make the RSS feed more discoverable by adding a link in the footer.

**Steps:**

1. Open `src/components/marketing/Footer.tsx`
2. Find the social links section (if it exists) or the bottom links row
3. Add an RSS link:

```tsx
<a
  href="/feed.xml"
  target="_blank"
  rel="noopener noreferrer"
  className="text-warm-gray hover:text-gold-600 transition-colors"
  aria-label="Subscribe via RSS"
>
  <Rss className="w-5 h-5" />
</a>
```

4. Import `Rss` from `lucide-react` at the top of the file

---

### Checklist

- [ ] Wait until 10+ blog posts are published
- [ ] Submit to Feedly
- [ ] (Optional) Submit to Feedburner for subscriber tracking
- [ ] (Optional) Submit to Bloglovin'
- [ ] (Optional) Add RSS icon to Footer

---

## Notes

- Your RSS feed is already live at: https://www.karkoai.com/feed.xml
- It automatically updates when you add new blog posts (no manual sync needed)
- RSS auto-discovery is enabled (browsers and RSS readers will find it automatically)
- The feed includes: title, description, publish date, author, category, and full content link

---

## Future Tasks (Add Below)

<!-- Add new tasks here as they come up -->
