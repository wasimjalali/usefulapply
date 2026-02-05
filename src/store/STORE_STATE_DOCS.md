# Store - Current State Documentation

**Location:** `/src/store/`  
**Purpose:** Zustand state management stores  
**Last Updated:** February 5, 2026 (Post-Refactoring)

---

## Overview

The application uses **Zustand** for state management. Previously a single monolithic store (`useAppStore`), now split into **3 specialized stores** for better organization and performance.

---

## Store Architecture

### 1. **useCVStore.ts** (120 lines)
**Purpose:** CV and document management

**State:**
- `currentCV` - Primary CV (ParsedCV format)
- `masterCV` - Master CV with all experiences
- `structuredCV` - New structured CV format (Solution B)
- `optimizedCV` - Optimized structured CV
- `certifications` - Array of certifications
- `profilePhoto` - Profile photo for EU templates
- `originalPdfRef` - Reference to original PDF

**Actions:**
- `setCurrentCV`, `setMasterCV`, `setStructuredCV`, `setOptimizedCV`
- `addCertification`, `removeCertification`, `clearCertifications`
- `setProfilePhoto`, `setOriginalPdfRef`
- `resetCVData`

**Persistence:** ✅ Persisted to localStorage

---

### 2. **useSessionStore.ts** (350 lines)
**Purpose:** Application sessions and chat management

**State:**
- `currentSession` - Active job application session
- `sessions` - Array of all saved sessions
- `jobDescription`, `requirements`, `gaps` - Legacy fields (deprecated)
- `generatedCV`, `coverLetter`, `email` - Legacy fields (deprecated)

**Session Structure:**
```typescript
interface ApplicationSession {
  id: string;
  jobTitle: string;
  company: string;
  createdAt: string;
  updatedAt: string;
  jobDescription: string;
  matchingSkills: string[];
  missingSkills: string[];
  requirements: JobRequirements | null;
  gaps: GapAnalysis | null;
  generatedCV: GeneratedCV | null;
  optimizedCVData?: StructuredCV;
  coverLetter: GeneratedCoverLetter | null;
  email: GeneratedEmail | null;
  companyResearch: CompanyResearch | null;
  cvEdits: CVEdit[];
  chatMessages: ChatMessage[];
}
```

**Actions:**
- `createNewSession`, `updateCurrentSession`, `loadSession`
- `deleteSession`, `clearCurrentSession`, `setSessions`
- `addChatMessage`, `clearChatMessages`
- Legacy setters (for backward compatibility)

**Persistence:** ✅ Persisted to localStorage

---

### 3. **useUIStore.ts** (60 lines)
**Purpose:** UI state (loading indicators, active tabs, errors)

**State:**
- `isAnalyzing` - CV analysis in progress
- `isGenerating` - Content generation in progress
- `isAgentWorking` - Full agent workflow running
- `isPdfGenerating` - PDF generation in progress
- `activeTab` - Current active tab ('cv' | 'cover-letter' | 'email')
- `error` - Error message (if any)

**Actions:**
- `setIsAnalyzing`, `setIsGenerating`, `setIsAgentWorking`
- `setIsPdfGenerating`, `setActiveTab`, `setError`
- `resetUI`

**Persistence:** ❌ NOT persisted (resets on page reload for clean state)

---

### 4. **useAppStore.ts** (70 lines) - Unified Interface
**Purpose:** Backward compatibility layer

**Implementation:**
```typescript
export const useAppStore = () => {
  const cvStore = useCVStore();
  const sessionStore = useSessionStore();
  const uiStore = useUIStore();

  return {
    ...cvStore,
    ...sessionStore,
    ...uiStore,
    resetAll: () => {
      cvStore.resetCVData();
      sessionStore.resetGenerated();
      uiStore.resetUI();
    },
  };
};
```

**Usage:**
- **Existing code:** Can continue using `useAppStore()` without changes
- **New code:** Should import specific stores for better performance

---

### 5. **index.ts** (30 lines) - Barrel Export
**Purpose:** Centralized exports

Exports all stores and types for easy importing.

---

## Migration Guide

### For Existing Code (No Changes Needed)
```typescript
// ✅ Still works - backward compatible
import { useAppStore } from '@/store/useAppStore';

const { currentCV, setCurrentCV, isAnalyzing } = useAppStore();
```

### For New Code (Recommended)
```typescript
// ✅ Better performance - import only what you need
import { useCVStore } from '@/store/useCVStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useUIStore } from '@/store/useUIStore';

const { currentCV, setCurrentCV } = useCVStore();
const { currentSession } = useSessionStore();
const { isAnalyzing, setIsAnalyzing } = useUIStore();
```

---

## Benefits of Split Architecture

1. **Better Organization** - Each store has a clear, focused responsibility
2. **Performance** - UI state no longer persisted (faster page loads)
3. **Easier Testing** - Mock individual stores in tests
4. **Better Tree-Shaking** - Import only what you need
5. **Clearer Data Flow** - CV → Session → UI hierarchy
6. **Backward Compatible** - Existing code works without changes

---

## Persistence Strategy

| Store | Persisted? | Storage Key | Reason |
|-------|-----------|-------------|--------|
| CV Store | ✅ Yes | `cv-store` | Documents should persist |
| Session Store | ✅ Yes | `session-store` | Sessions should persist |
| UI Store | ❌ No | N/A | UI state should reset on reload |

---

## Store Usage by Component

### Documents Page
- Uses: `useCVStore` (primary), `useSessionStore` (minimal)
- Actions: Upload CV, manage certifications, profile photo

### Dashboard Page
- Uses: All three stores
- Actions: Create sessions, run agent, display results

### Settings Page
- Uses: `useCVStore` (profile photo), Auth context
- Actions: Update profile, manage account

### Chat Panel
- Uses: `useSessionStore` (chat messages), `useUIStore` (loading states)
- Actions: Send messages, display history

---

## Type Exports

All types are re-exported from the main store file:
- `PDFReference`, `Certification`, `ProfilePhoto` (from CV Store)
- `ApplicationSession`, `ChatMessage`, `ChatAction`, `CVEdit`, `CompanyResearch` (from Session Store)

---

## Change Log

| Date | Change | Reason |
|------|--------|--------|
| Feb 5, 2026 | Split into 3 stores | Better organization & performance |
| Feb 5, 2026 | UI state no longer persisted | Cleaner state management |
| Feb 5, 2026 | Added backward compatibility layer | No breaking changes |

---

## Testing Checklist

- [ ] Test CV upload and persistence
- [ ] Test session creation and loading
- [ ] Test UI state (should NOT persist)
- [ ] Test backward compatibility (useAppStore)
- [ ] Test specific store imports
- [ ] Test store resets
- [ ] Verify localStorage keys
- [ ] Test cross-device sync (Supabase)

---

## Notes for Developers

1. **Always use specific stores in new code** for better performance
2. **UI state intentionally not persisted** - this is by design
3. **Legacy setters maintained** in SessionStore for backward compatibility
4. **All stores use Zustand middleware** for persistence
5. **Store split is transparent** to existing code
