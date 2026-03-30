# Vercel Redirect Chain Fix

## Current Issue

The site has a 2-hop redirect chain:
```
http://karkoai.com/ → https://karkoai.com/ → https://www.karkoai.com/
```

This creates unnecessary latency and appears as a "redirect chain" issue in SEO audits.

## Goal

Flatten to a single redirect:
```
http://karkoai.com/ → https://www.karkoai.com/
```

## Root Cause

This redirect behavior is **not configured in the codebase**. It is controlled by:
1. Vercel project-level domain settings
2. Vercel's automatic HTTPS redirect
3. Vercel's automatic www redirect (or lack thereof)

## Fix Instructions

### Step 1: Verify Current Domain Configuration

1. Log into Vercel dashboard
2. Navigate to: **Project Settings** → **Domains**
3. Check which domains are configured:
   - `karkoai.com` (apex)
   - `www.karkoai.com` (www subdomain)

### Step 2: Set Primary Domain

1. In the Domains settings, click on `www.karkoai.com`
2. Click **"Set as Primary Domain"** or **"Make Primary"**
3. This ensures Vercel automatically redirects:
   - `karkoai.com` → `www.karkoai.com`
   - `http://www.karkoai.com` → `https://www.karkoai.com`

### Step 3: Verify Redirect Behavior

After saving, test with:
```bash
curl -I http://karkoai.com/
```

Expected response:
```
HTTP/1.1 308 Permanent Redirect
Location: https://www.karkoai.com/
```

If you see:
```
HTTP/1.1 301 Moved Permanently
Location: https://karkoai.com/
```

Then the www subdomain is not set as primary. Repeat Step 2.

### Step 4: Verify in Browser

Test these URLs in an incognito window:
- `http://karkoai.com/` → should redirect to `https://www.karkoai.com/`
- `http://www.karkoai.com/` → should redirect to `https://www.karkoai.com/`
- `https://karkoai.com/` → should redirect to `https://www.karkoai.com/`
- `https://www.karkoai.com/` → should load directly (no redirect)

## Alternative: Cloudflare Page Rules (if using Cloudflare)

If using Cloudflare in front of Vercel:

1. Go to Cloudflare dashboard → **Rules** → **Page Rules**
2. Create rule:
   - URL pattern: `http://karkoai.com/*`
   - Setting: **Forwarding URL** → **301 Permanent Redirect**
   - Destination: `https://www.karkoai.com/$1`
3. Save and deploy

## Verification

After applying the fix, verify with:
- [Redirect Checker](https://httpstatus.io/)
- Screaming Frog SEO Spider
- Ahrefs Site Audit

The redirect chain should now show as resolved.

## Notes

- This fix **cannot be applied from the Next.js codebase**
- It requires access to Vercel project settings
- Changes take effect immediately (no deployment needed)
- Existing DNS propagation may cause temporary inconsistency (up to 48 hours)
