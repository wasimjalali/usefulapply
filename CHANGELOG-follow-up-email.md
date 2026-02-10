# Follow-Up Email Feature + UI Improvements

**Date:** February 10, 2026  
**Branch:** main  

---

## 1. Follow-Up Email Generation (Backend)

### Files Changed:
- `src/app/api/agent-v2/route.ts` — Added `followUpEmail` to `workflow_complete` results
- `src/app/api/regenerate/route.ts` — Added `follow_up_email` regeneration type (0 credits)
- `src/lib/agents/unified-writer-agent.ts` — New `generateFollowUpEmail()` method
- `src/lib/agents/types.ts` — Added `followUpEmail` to `MasterContext`
- `src/lib/models/types.ts` — Added `FollowUpEmail` type
- `src/lib/supabase/credits.ts` — Added `FOLLOW_UP_REGEN: 0` (free regeneration)
- `src/lib/supabase/sessions.ts` — Added `follow_up_email` field to `ApplicationSession`
- `src/hooks/useAgentV2.ts` — Added `followUpEmail` to `AgentV2Result` interface
- `src/hooks/useSupabaseSync.ts` — Added `follow_up_email` to Supabase sync mapping
- `src/store/useSessionStore.ts` — Added `followUpEmail` to session store
- `src/components/ChatPanel.tsx` — Store `followUpEmail` from workflow results

### What it does:
- After generating the primary application email, the system automatically generates a follow-up email
- The follow-up email includes a subject, body, and recommended delay (in business days)
- Follow-up email regeneration is free (0 credits)
- Follow-up emails are persisted to Supabase via the `follow_up_email` JSONB column

---

## 2. EmailPanel Redesign (Frontend)

### File: `src/components/EmailPanel.tsx`

### Changes:
- **Follow-up email display**: Shows follow-up email below the primary email with a gold dashed divider
- **Edit mode**: Both primary and follow-up emails are editable in a single canvas
- **Inline regenerate buttons**: Each email section has its own regenerate button
- **Toolbar simplified**: Only View/Edit toggle + Save + Primary/Follow-Up email buttons
- **"Open in Email" split**: Two buttons — "Primary" (navy) and "Follow-Up" (outline) with branded tooltips
- **Gold branding**: All badges use brand gold (#c9a84c) instead of amber/orange
- **Gold left border**: Both primary and follow-up email bodies have a consistent gold left border
- **SignUpWallModal**: Preserved — anonymous users are gated from copy/open-in-email actions
- **mailto: debug logging**: Console logs added to diagnose desktop browser issues
- **Error toasts**: Follow-up regeneration failures now show user-facing error messages

---

## 3. Toast Notifications Restyled

### File: `src/components/ui/Toast.tsx`

### Changes:
- **Position**: Moved from `top-4 center` to `top-28 left-4` (below nav + toolbar, inside panel area)
- **Max width**: Constrained with `calc(max(200px, 100vw - 500px))` to stay within the left panel
- **Success toast**: Navy background (#1a2744) with gold checkmark icon and cream text
- **Warning toast**: Cream background with gold border and gold warning icon
- **Info toast**: Navy background with cream icon
- **Error toast**: Kept red (errors should stand out)
- **z-index**: `z-[9999]` to always be on top

---

## 4. Button Focus Ring Fix

### File: `src/components/ui/Button.tsx`

### Changes:
- **Removed**: `focus:ring-2 focus:ring-offset-2` (caused double-border/cropped ring on click)
- **Added**: `focus-visible:ring-2 focus-visible:ring-navy-400/40` (only shows on keyboard navigation)
- **Outline variant**: Changed from `border-2` to `border` (thinner, cleaner)
- **Removed**: Per-variant `focus:ring-*` classes (now handled by base styles)

---

## 5. PortalTooltip Component

### File: `src/components/ui/PortalTooltip.tsx` (NEW)

### What it does:
- Renders tooltips at `<body>` level using React `createPortal`
- Escapes all stacking contexts (backdrop-filter, overflow:hidden)
- Dynamically positions below the trigger element using `getBoundingClientRect()`
- Detects parent panel boundary to prevent overflow into the chat panel
- Max width of 260px with text wrapping for long tooltip text
- Branded design: navy background (#1a2744), cream text (#f5f0e8), gold border (#c9a84c)

### Used in:
- EmailPanel: Primary and Follow-Up email buttons

---

## 6. Cover Letter Panel Updates

### File: `src/components/CoverLetterPanel.tsx`

### Changes:
- **Address reminder on download**: Shows "Don't forget to add the company address before sending!" toast after PDF/DOCX download (if address placeholder detected)
- **Toast timing**: Address reminder appears 500ms after the download success toast

---

## 7. Brand Colors Reference

| Color | Hex | Usage |
|-------|-----|-------|
| Navy | #1a2744 | Toast bg, tooltip bg |
| Cream | #f5f0e8 | Toast text, tooltip text |
| Gold | #c9a84c | Badges, borders, icons, tooltip border |
| Gold (light) | rgba(201,168,76,0.12) | Badge backgrounds |
