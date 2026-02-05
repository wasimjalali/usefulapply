# Core Libraries - Current State Documentation

**Location:** `/src/lib/`, `/src/hooks/`, `/src/store/`, `/src/contexts/`  
**Purpose:** Core utilities, types, hooks, state management, and contexts  
**Last Updated:** February 5, 2026 (Post-Refactoring)

---

## Overview

Core libraries contain utilities, type definitions, hooks, state management (Zustand), and React contexts. These are the foundational pieces used throughout the application.

**Recent Refactoring:** Store split into 3 specialized stores + new utility files added.

---

## Directory Structure

### `/src/lib/` - Utilities & Types (19 files) ✅ UPDATED
- CV parsing and extraction
- Type definitions
- Middleware
- Storage utilities
- Helper functions
- **NEW:** cv-transformers.ts (CV transformation utilities)
- **NEW:** language-detector.ts (EN/DE language detection)

### `/src/hooks/` - React Hooks
- Custom hooks for common patterns
- useSupabaseSync, useAgentV2, etc.

### `/src/store/` - State Management ✅ REFACTORED
- **NEW:** 3 specialized Zustand stores (useCVStore, useSessionStore, useUIStore)
- **NEW:** Unified interface (useAppStore) for backward compatibility
- See `/src/store/STORE_STATE_DOCS.md` for complete documentation

### `/src/contexts/` - React Contexts
- AuthContext (authentication state)
- Other context providers

---

## Key Files Analysis

### CV Parsing & Extraction

**`cv-extractor.ts`** (~300 lines)
- Extracts CV data from raw text
- Uses AI (Claude/GPT) for parsing
- Returns structured CV data
- **Status:** ✅ Active

**`cv-parser/parse-optimized-cv.ts`** (~400 lines)
- Parses optimized CV text to CVData
- Legacy text parsing (Solution A)
- **Status:** ⚠️ Legacy (Solution B preferred)

**`cv-templates/parser.ts`** (~250 lines)
- Converts ParsedCV to CVData
- Converts StructuredCV to CVData
- Bridge between formats
- **Status:** ✅ Active

### Type Definitions

**`types.ts`** (~500 lines)
- Main type definitions
- ParsedCV, GeneratedCV, GeneratedCoverLetter, GeneratedEmail
- Session types
- **Status:** ✅ Active

**`types/cv-schema.ts`** (~400 lines)
- StructuredCV type (Solution B)
- CV data validation
- Helper functions (withId, parseDate, createEmptyCV)
- **Status:** ✅ Active

**`cv-templates/types.ts`** (~300 lines)
- CVData type (for templates)
- CVTemplate definitions
- Template configurations
- **Status:** ✅ Active

### Storage & Middleware

**`storage/applicantStore.ts`** (~200 lines)
- Load applicant documents
- IndexedDB storage
- **Status:** ✅ Active

**`storage/indexeddb.ts`** (~150 lines)
- IndexedDB wrapper
- Store CV data locally
- **Status:** ✅ Active

**`storage/pdf-storage.ts`** (~100 lines)
- PDF storage utilities
- **Status:** ⚠️ May be unused (Supabase Storage used instead)

**`middleware/creditCheck.ts`** (~200 lines)
- Credit checking middleware
- Deduct credits for actions
- Format error responses
- **Status:** ✅ Active

### Utilities

**`prompts.ts`** (~300 lines)
- AI prompt templates
- System prompts for different tasks
- **Status:** ✅ Active

**`utils/creditEvents.ts`** (~100 lines)
- Credit event tracking
- Analytics for credit usage
- **Status:** ✅ Active

**`anthropic.ts`** (~200 lines)
- Direct Anthropic API calls
- **Status:** ⚠️ May be duplicate (models/anthropic.ts exists)

**`documentParser.ts`** (~150 lines)
- Parse documents
- **Status:** ⚠️ May be legacy

**`pdf-renderer.ts`** (~200 lines)
- PDF rendering utilities
- **Status:** ⚠️ May be unused (generate-pdf API used instead)

---

## Hooks (`/src/hooks/`)

**useSupabaseSync** - Sync sessions with Supabase
- Runs in background
- Saves sessions to database
- **Status:** ✅ Active

**useAgentV2** - Agent workflow hook
- Manages agent state
- Streams progress events
- **Status:** ✅ Active

**useAuth** - Authentication hook
- Wraps AuthContext
- Provides auth state and methods
- **Status:** ✅ Active

---

## State Management (`/src/store/`)

**useAppStore.ts** (~800 lines)
- Zustand store for global state
- Manages: currentCV, sessions, chat, UI state
- Persistence to localStorage
- **Status:** ✅ Active

**State Structure:**
```typescript
{
  // CV Data
  currentCV: ParsedCV | null;
  structuredCV: StructuredCV | null;
  masterCV: MasterCV | null;
  profilePhoto: ProfilePhoto | null;
  
  // Sessions
  sessions: ApplicationSession[];
  currentSession: ApplicationSession | null;
  
  // UI State
  activeTab: 'cv' | 'cover-letter' | 'email';
  isGenerating: boolean;
  isAnalyzing: boolean;
  isAgentWorking: boolean;
  
  // Actions
  setCurrentCV, setStructuredCV, createNewSession,
  addChatMessage, updateCurrentSession, etc.
}
```

**Leftover Code Issues:**
- ⚠️ Large file (800 lines) - could be split
- ⚠️ Some legacy fields may be unused

---

## Contexts (`/src/contexts/`)

**AuthContext.tsx** (~400 lines)
- Authentication state provider
- Sign in, sign up, sign out
- User profile management
- **Status:** ✅ Active

**Methods:**
```typescript
{
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signIn(email, password);
  signUp(email, password, fullName);
  signInWithGoogle();
  signOut();
  updateProfile(updates);
}
```

---

## Cleanup Tasks

### High Priority
1. **Verify pdf-storage.ts usage** - may be unused
2. **Verify documentParser.ts usage** - may be legacy
3. **Verify pdf-renderer.ts usage** - may be unused
4. **Check for duplicate anthropic.ts** - models/anthropic.ts exists

### Medium Priority
5. **Split useAppStore** (800 lines) into smaller stores
6. **Remove legacy CV parsing** if Solution B fully adopted
7. **Extract type definitions** to separate package

### Low Priority
8. Add JSDoc comments to utilities
9. Add unit tests for utilities
10. Extract common patterns to hooks

---

## Leftover Code Summary

**Potentially Unused Files:**
- `storage/pdf-storage.ts` - Supabase Storage used instead
- `documentParser.ts` - May be legacy
- `pdf-renderer.ts` - generate-pdf API used instead
- `anthropic.ts` - Duplicate of models/anthropic.ts

**Legacy Code:**
- `cv-parser/parse-optimized-cv.ts` - Solution A (text parsing)
- Some fields in useAppStore may be unused

**Large Files:**
- `useAppStore.ts` (800 lines) - should be split
- `types.ts` (500 lines) - could be organized better

---

## Testing Checklist

- [ ] CV extraction works with AI
- [ ] CV parsing works (both formats)
- [ ] Type conversions work correctly
- [ ] Storage utilities work (IndexedDB)
- [ ] Credit middleware works
- [ ] Hooks work correctly
- [ ] Zustand store persists correctly
- [ ] AuthContext provides correct state
- [ ] All utilities have tests

---

## Notes for AI Agents

When working with core libraries:
1. **Use StructuredCV** (Solution B) - preferred format
2. **Use Zustand store** - don't create new state
3. **Use AuthContext** - don't call Supabase directly
4. **Check for duplicates** - before creating utilities
5. **Follow type definitions** - strict TypeScript
6. **Test utilities** - add unit tests
7. **Document complex logic** - JSDoc comments
8. **Verify file usage** - before deleting suspected unused files
