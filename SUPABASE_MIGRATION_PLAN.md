# Supabase Migration Plan

This document tracks the step-by-step migration from localStorage to Supabase.

---

## Phase 1: Foundation ✅ COMPLETED

### 1.1 Authentication & Profiles ✅
- [x] Create Supabase client utilities
- [x] Create AuthContext provider
- [x] Implement login/signup pages
- [x] Add auth wall to protected pages
- [x] Fix infinite loading issues

### 1.2 Avatar Storage ✅
- [x] Create `avatars` storage bucket
- [x] Implement `uploadAvatar` and `deleteAvatar` functions
- [x] Update settings page to use Supabase Storage

### 1.3 Service Functions ✅
- [x] Create `src/lib/supabase/documents.ts`
- [x] Create `src/lib/supabase/sessions.ts`
- [x] Create `src/lib/supabase/storage.ts`
- [x] Export all from `src/lib/supabase/index.ts`

---

## Phase 2: Documents Migration 🔄 IN PROGRESS

### 2.1 Update Documents Page
- [ ] Import Supabase document functions
- [ ] Load documents from Supabase on page load
- [ ] Save uploaded CVs to Supabase `documents` table
- [ ] Upload CV files to `cv-files` storage bucket
- [ ] Delete documents from Supabase when removed
- [ ] Keep localStorage as fallback/cache

### 2.2 Update useAppStore for Documents
- [ ] Add function to sync documents with Supabase
- [ ] Load documents on auth state change
- [ ] Remove documents from localStorage persistence (optional)

---

## Phase 3: Sessions Migration ⏳ PENDING

### 3.1 Update Session Management
- [ ] Load sessions from Supabase on app start
- [ ] Create new sessions in Supabase
- [ ] Update sessions in Supabase when modified
- [ ] Delete sessions from Supabase

### 3.2 Update Chat Messages
- [ ] Load chat messages from Supabase for each session
- [ ] Save new messages to Supabase
- [ ] Sync messages in real-time (optional)

---

## Phase 4: Cleanup ⏳ PENDING

### 4.1 Remove localStorage Dependencies
- [ ] Remove `persist` middleware from Zustand (optional)
- [ ] Clean up StorageCleaner component
- [ ] Remove applicantStore.ts (deprecated)

### 4.2 Testing & Verification
- [ ] Test document upload/download flow
- [ ] Test session creation and persistence
- [ ] Test chat message sync
- [ ] Test across browser sessions
- [ ] Test on deployed app

---

## Current Status

**Last Updated:** Phase 2.1 - Starting Documents Page Migration

**Next Step:** Update documents page to load/save from Supabase

---

## Notes

- Keep localStorage as a cache for offline capability
- Supabase is the source of truth
- Load from Supabase on auth, cache locally
- Save to both Supabase and localStorage for redundancy
