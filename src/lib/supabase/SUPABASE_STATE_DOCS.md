# Supabase Integration - Current State Documentation

**Location:** `/src/lib/supabase/`  
**Purpose:** Database operations, authentication, storage, and credit management  
**Last Updated:** February 5, 2026

---

## Overview

The Supabase directory provides complete integration with Supabase for authentication, database operations, file storage, and credit management. Contains 11 files handling different aspects of the backend.

---

## File Inventory

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| index.ts | 95 | Barrel export for all Supabase utilities | ✅ Active |
| client.ts | ~100 | Client-side Supabase client | ✅ Active |
| server.ts | ~100 | Server-side Supabase client | ✅ Active |
| types.ts | ~300 | Database type definitions | ✅ Active |
| documents.ts | ~250 | CV/document operations | ✅ Active |
| sessions.ts | ~300 | Application session management | ✅ Active |
| storage.ts | ~400 | File upload/download operations | ✅ Active |
| accounts.ts | ~350 | User account management | ✅ Active |
| credits.ts | ~500 | Credit system implementation | ✅ Active |
| feedback.ts | ~150 | Message feedback operations | ✅ Active |
| middleware.ts | ~100 | Auth middleware | ✅ Active |

---

## Database Schema Overview

### Tables (12 total)

**1. profiles** - User profiles
- id, email, full_name, avatar_url, phone, location
- Created on signup

**2. documents** - Uploaded CVs and Master CVs
- id, user_id, type (primary_cv, master_cv), file_name, raw_text, structured_data
- Stores parsed CV data

**3. application_sessions** - Job application sessions
- id, user_id, job_description, generated_cv, cover_letter, email
- Stores complete application workflow

**4. chat_messages** - Chat history
- id, session_id, role (user/assistant), content, actions
- Linked to sessions

**5. subscriptions** - User subscription plans
- id, user_id, plan_id, status, current_period_start, current_period_end
- Managed by Stripe webhooks

**6. connected_accounts** - OAuth connections
- id, user_id, provider (google, linkedin), provider_user_id
- For social login

**7. message_feedback** - Chat message ratings
- id, user_id, message_id, feedback_type (positive/negative), feedback_text
- For AI improvement

**8. subscription_plans** - Available plans
- id, name (Starter, Plus, Pro), monthly_credits, price
- Seeded data

**9. user_credits** - User credit balances
- id, user_id, monthly_credits, rollover_credits, addon_credits
- Updated on usage

**10. credit_transactions** - Credit history
- id, user_id, action, amount, balance_after, description
- Audit trail

**11. addon_credit_packs** - Purchasable credit packs
- id, name, credits, price
- Seeded data

**12. profile_photos** - EU CV photos
- id, user_id, file_name, file_url
- For EU CV templates

---

## Detailed File Analysis

### 1. index.ts (95 lines) - Barrel Export

**Purpose:** Central export point for all Supabase utilities

**Exports:**
- Client creation functions
- Database types
- Document operations
- Session operations
- Storage operations
- Account operations
- Feedback operations
- Credit operations

**Leftover Code Issues:**
- ✅ No leftover code
- ✅ Clean barrel export

---

### 2. client.ts & server.ts (~100 lines each)

**Purpose:** Supabase client creation for client-side and server-side

**client.ts:**
- Creates browser client
- Uses cookies for auth
- Singleton pattern

**server.ts:**
- Creates server client
- Uses Next.js cookies
- For API routes and server components

**Leftover Code Issues:**
- ✅ No leftover code
- ✅ Proper client/server separation

---

### 3. types.ts (~300 lines) - Type Definitions

**Purpose:** TypeScript types generated from Supabase schema

**Current State:**
- ✅ Auto-generated from database schema
- ✅ Includes all tables and relationships
- ✅ Type-safe database operations

**Leftover Code Issues:**
- ✅ No leftover code
- ✅ Auto-generated, don't edit manually

**Recommendations:**
- Regenerate types when schema changes
- Use `supabase gen types typescript` command

---

### 4. documents.ts (~250 lines) - Document Operations

**Purpose:** CRUD operations for CV documents

**Key Functions:**

**`getDocuments(userId)`** - Get all user documents
**`getDocumentByType(userId, type)`** - Get specific document type
**`saveDocument(userId, document)`** - Save/update document
**`deleteDocument(userId, documentId)`** - Delete document
**`uploadCVFile(userId, file, type)`** - Upload and parse CV file

**Document Types:**
- `primary_cv` - Current CV for applications
- `master_cv` - Complete CV with all experience

**Stored Data:**
- file_name, file_type (pdf/docx)
- raw_text (extracted text)
- structured_data (parsed JSON)
- sections (legacy format)
- all_skills, all_experiences, all_education (master CV only)

**Leftover Code Issues:**
- ✅ No significant leftover code
- ⚠️ `sections` field may be legacy - verify usage

**Recommendations:**
- Deprecate `sections` field if unused
- Add file size validation
- Add virus scanning for uploads

---

### 5. sessions.ts (~300 lines) - Session Management

**Purpose:** CRUD operations for application sessions

**Key Functions:**

**`getSessions(userId)`** - Get all user sessions
**`getSession(userId, sessionId)`** - Get specific session
**`createSession(userId, session)`** - Create new session
**`updateSession(userId, sessionId, updates)`** - Update session
**`deleteSession(userId, sessionId)`** - Delete session
**`getChatMessages(sessionId)`** - Get chat history
**`addChatMessage(sessionId, message)`** - Add chat message
**`clearChatMessages(sessionId)`** - Clear chat history

**Session Data:**
- job_description
- requirements (parsed job data)
- generated_cv, cover_letter, email
- optimized_cv_data (Solution B)
- company_research
- match_score, gaps

**Leftover Code Issues:**
- ✅ No significant leftover code
- ✅ Well-structured session management

**Recommendations:**
- Add session expiration (auto-delete old sessions)
- Add session sharing (for team accounts)
- Compress large session data

---

### 6. storage.ts (~400 lines) - File Storage

**Purpose:** File upload/download operations for Supabase Storage

**Storage Buckets:**
- `avatars` - User profile photos
- `profile-photos` - EU CV photos
- `generated-pdfs` - Generated CV PDFs
- `cv-uploads` - Original CV files

**Key Functions:**

**Avatar Operations:**
- `uploadAvatar(userId, file)` - Upload profile photo
- `deleteAvatar(userId)` - Delete profile photo

**Profile Photo Operations:**
- `uploadProfilePhoto(userId, file)` - Upload EU CV photo
- `getProfilePhotoUrl(userId)` - Get photo URL
- `deleteProfilePhoto(userId)` - Delete photo

**PDF Operations:**
- `uploadGeneratedPDF(userId, pdfBlob, fileName)` - Upload generated PDF
- `getGeneratedPDFUrl(userId, fileName)` - Get PDF URL
- `listGeneratedPDFs(userId)` - List all PDFs
- `deleteGeneratedPDF(userId, fileName)` - Delete PDF

**Leftover Code Issues:**
- ✅ No significant leftover code
- ✅ Comprehensive storage operations

**Recommendations:**
- Add file size limits per bucket
- Add automatic cleanup of old files
- Add CDN caching for frequently accessed files

---

### 7. accounts.ts (~350 lines) - Account Management

**Purpose:** User account operations (OAuth, subscriptions, password)

**Key Functions:**

**OAuth:**
- `getConnectedAccounts(userId)` - Get linked accounts
- `disconnectAccount(userId, provider)` - Unlink account
- `connectOAuthProvider(provider)` - Link new account

**Subscriptions:**
- `getSubscription(userId)` - Get current subscription
- `createFreeSubscription(userId)` - Create free plan
- `incrementApplicationUsage(userId)` - Track usage
- `canCreateApplication(userId)` - Check limits

**Password:**
- `changePassword(newPassword)` - Change password
- `sendPasswordResetEmail(email)` - Send reset email

**Account Deletion:**
- `deleteUserAccount(userId)` - Delete account and all data

**Leftover Code Issues:**
- ✅ No significant leftover code
- ⚠️ `incrementApplicationUsage()` may be deprecated (now using credits)

**Recommendations:**
- Remove `incrementApplicationUsage()` if using credit system
- Add 2FA support
- Add account recovery options

---

### 8. credits.ts (~500 lines) - Credit System

**Purpose:** Complete credit management system

**Credit Costs:**
```typescript
CREDIT_COSTS = {
  FULL_APPLICATION: 2,      // CV + cover letter + email
  CV_OPTIMIZATION: 1,
  COVER_LETTER_REGEN: 1,
  EMAIL_REGEN: 1,
  CHAT_MESSAGE: 0,          // Free
}
```

**Key Functions:**

**Credit Balance:**
- `getUserCredits(userId)` - Get credit breakdown
- `getTotalCredits(userId)` - Get total available
- `hasEnoughCredits(userId, action)` - Check if can afford
- `checkCreditBalance(userId, action)` - Detailed check

**Credit Operations:**
- `deductCredits(userId, action, amount)` - Deduct credits
- `addCredits(userId, type, amount)` - Add credits
- `processMonthlyReset(userId)` - Reset monthly credits
- `processAddonPurchase(userId, packId)` - Purchase addon

**Subscription Plans:**
- `getSubscriptionPlans()` - Get all plans
- `getSubscriptionPlan(planId)` - Get specific plan
- `upgradePlan(userId, newPlanId)` - Upgrade subscription

**Addon Packs:**
- `getAddonCreditPacks()` - Get available packs
- Small: 30 credits / $4.99
- Medium: 60 credits / $9.99
- Large: 120 credits / $19.99

**Credit Types:**
- **Monthly:** Reset each month, rollover limited
- **Rollover:** Carried from previous month
- **Addon:** Purchased credits, never expire

**Rollover Rules:**
- Plus: 1 month rollover (max 120 credits)
- Pro: 2 months rollover (max 480 credits)
- Starter: No rollover

**Leftover Code Issues:**
- ✅ No significant leftover code
- ✅ Comprehensive credit system

**Recommendations:**
- Add credit expiration notifications
- Add credit gifting between users
- Add credit refunds for failed operations

---

### 9. feedback.ts (~150 lines) - Feedback Operations

**Purpose:** Message feedback (thumbs up/down) operations

**Key Functions:**

**`submitMessageFeedback(userId, messageId, type, metadata)`**
- Save user feedback on AI messages
- Type: 'positive' or 'negative'
- Optional feedback text

**`getSessionFeedback(sessionId)`**
- Get all feedback for a session

**`getMessageFeedback(messageId)`**
- Get feedback for specific message

**Leftover Code Issues:**
- ✅ No leftover code
- ✅ Simple, focused implementation

**Recommendations:**
- Add feedback analytics dashboard
- Use feedback to improve AI prompts
- Add feedback categories (helpful, accurate, relevant)

---

### 10. middleware.ts (~100 lines) - Auth Middleware

**Purpose:** Authentication middleware for API routes

**Key Functions:**

**`withAuth(handler)`** - Wrap API route with auth check
**`requireAuth(request)`** - Check if user is authenticated
**`getAuthUser(request)`** - Get authenticated user

**Leftover Code Issues:**
- ✅ No leftover code
- ✅ Clean middleware implementation

---

## Row Level Security (RLS)

**All tables have RLS enabled:**
- Users can only access their own data
- Enforced at database level
- Prevents data leaks

**Example Policy:**
```sql
CREATE POLICY "Users can view own documents"
ON documents FOR SELECT
USING (auth.uid() = user_id);
```

---

## Cleanup Tasks

### High Priority
1. **Verify `sections` field usage** in documents.ts - may be legacy
2. **Remove `incrementApplicationUsage()`** if using credit system

### Medium Priority
3. Add file size validation for uploads
4. Add session expiration/cleanup
5. Add automatic file cleanup for old files

### Low Priority
6. Add 2FA support
7. Add credit gifting
8. Add feedback analytics
9. Add CDN caching for storage

---

## Testing Checklist

- [ ] Document CRUD operations work
- [ ] Session CRUD operations work
- [ ] File upload/download works for all buckets
- [ ] OAuth connection/disconnection works
- [ ] Credit deduction works correctly
- [ ] Credit rollover works correctly
- [ ] Subscription upgrade works
- [ ] Addon purchase works
- [ ] Feedback submission works
- [ ] RLS policies prevent unauthorized access
- [ ] Password change works
- [ ] Account deletion removes all data

---

## Notes for AI Agents

When working with Supabase:
1. **Use server client** in API routes
2. **Use client client** in components
3. **RLS is enforced** - can't access other users' data
4. **Credits are atomic** - use transactions
5. **Track all credit operations** - audit trail required
6. **Handle errors gracefully** - database may be down
7. **Use types** - auto-generated from schema
8. **Test RLS policies** - security is critical
