---
description: Security rules for all API routes and middleware
globs: ["src/app/api/**", "src/lib/middleware/**"]
---

# API Security Rules

## Every API Route Must
1. **Authenticate** via `supabase.auth.getUser()` — never trust `userId` from the request body
2. **Rate limit** via `checkRateLimit(req, 'route-name')` from `src/lib/middleware/rateLimiter.ts`
3. **Validate input lengths** before processing (see limits below)
4. **Return generic error messages** — never expose `error.message` to clients

## Rate Limits (current config in `rateLimiter.ts`)
| Route | Limit | Window |
|-------|-------|--------|
| `agent-v2` | 5 req | 1 min |
| `parse-cv` | 10 req | 1 min |
| `chat` | 20 req | 1 min |
| `contact` | 3 req | 1 min |
| `generate-pdf` | 10 req | 1 min |
| `regenerate` | 10 req | 1 min |
| `signup` | 3 req | 1 min |
| Stripe checkout | 5 req | 1 min |
| Stripe portal | 3 req | 1 min |

## Input Length Limits
| Field | Max |
|-------|-----|
| `jobDescription` | 20,000 chars |
| `currentCV` / `masterCV` | 35,000 chars |
| File buffer (parse-cv) | 10 MB |
| Chat message | 2,000 chars |
| Contact name | 200 chars |
| Contact email | 254 chars |
| Contact subject | 300 chars |
| Contact message | 5,000 chars |

## XSS Prevention
- Never inject raw user input into HTML strings — use `escapeHtml()` (escapes `& < > " '`)
- Never use `innerHTML` with untrusted content — strip script tags and event handlers first

## Anonymous Generation Tracking
- Server-side tracking via SHA-256 hashed IPs in `anonymous_generations` Supabase table
- Check before generation → record after `workflow_complete`
- `ANONYMOUS_LIMIT_REACHED` SSE error code → frontend shows signup wall
- `localStorage` check is a fast-path UX optimization only, not a security boundary

## Chat Message Limit
- `/api/chat` limits to 10 user messages per session (counts `chatHistory` user messages)
- Returns `CHAT_LIMIT_REACHED` error code on overflow

## Error Response Pattern
```typescript
// CORRECT — generic message
return NextResponse.json({ error: 'Internal server error' }, { status: 500 });

// WRONG — never expose internal details
return NextResponse.json({ error: error.message }, { status: 500 });
```
