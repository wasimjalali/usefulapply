# UI Components - Current State Documentation

**Location:** `/src/components/ui/`  
**Purpose:** Reusable UI primitives and design system components  
**Last Updated:** February 5, 2026

---

## Overview

UI components directory contains 5 reusable primitives that form the design system foundation. All components follow consistent styling with the cream/navy/gold color palette.

---

## File Inventory

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| Button.tsx | ~150 | Button component with variants | ✅ Active |
| Card.tsx | ~80 | Card wrapper component | ✅ Active |
| CreditIndicator.tsx | ~120 | Credit balance display | ✅ Active |
| Tabs.tsx | ~100 | Tab navigation component | ✅ Active |
| Textarea.tsx | ~80 | Textarea input component | ✅ Active |

---

## Design System

### Color Palette

**Primary Colors:**
- Navy: `navy-600` (#0F3057) - Primary actions, headers
- Gold: `gold-400` (#F4A261) - Accents, highlights
- Sage: `sage-500` (#8BA888) - Success states
- Cream: `cream-100` (#FAF9F6) - Backgrounds

**Text Colors:**
- Charcoal: `charcoal` (#2D3748) - Primary text
- Warm Gray: `warm-gray` (#718096) - Secondary text

**Semantic Colors:**
- Success: Green/Sage
- Error: Red
- Warning: Amber
- Info: Blue

### Typography

**Font Families:**
- Sans-serif: System font stack
- Headings: Bold, larger sizes
- Body: Regular, readable sizes

**Font Sizes:**
- xs: 0.75rem (12px)
- sm: 0.875rem (14px)
- base: 1rem (16px)
- lg: 1.125rem (18px)
- xl: 1.25rem (20px)

### Spacing

**Standard Scale:**
- 1: 0.25rem (4px)
- 2: 0.5rem (8px)
- 3: 0.75rem (12px)
- 4: 1rem (16px)
- 6: 1.5rem (24px)
- 8: 2rem (32px)

---

## Component Details

### 1. Button.tsx (~150 lines)

**Purpose:** Primary button component with multiple variants

**Variants:**
- `primary` - Navy background, white text (main actions)
- `secondary` - Gold background, white text (secondary actions)
- `outline` - Border only, transparent background
- `ghost` - No background, hover effect only
- `danger` - Red background, white text (destructive actions)

**Sizes:**
- `sm` - Small (padding: 2, text: sm)
- `md` - Medium (padding: 3, text: base) - Default
- `lg` - Large (padding: 4, text: lg)

**States:**
- Default
- Hover (darker background)
- Active (pressed state)
- Disabled (opacity 50%, cursor not-allowed)
- Loading (spinner icon)

**Props:**
```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}
```

**Leftover Code Issues:**
- ✅ No leftover code
- ✅ Well-designed component

---

### 2. Card.tsx (~80 lines)

**Purpose:** Card wrapper for content sections

**Features:**
- White background
- Rounded corners (rounded-xl)
- Shadow (shadow-sm)
- Padding (p-6 default)
- Border (border-cream-200)

**Variants:**
- Default - White with shadow
- Flat - No shadow
- Bordered - With border

**Props:**
```typescript
interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'flat' | 'bordered';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}
```

**Leftover Code Issues:**
- ✅ No leftover code
- ✅ Simple, focused component

---

### 3. CreditIndicator.tsx (~120 lines)

**Purpose:** Display user credit balance in header

**Features:**
- Shows total available credits
- Breakdown tooltip (monthly, rollover, addon)
- Color-coded by balance:
  - Green: >50 credits
  - Amber: 10-50 credits
  - Red: <10 credits
- Link to pricing page
- Refresh on credit changes

**Display:**
```
💎 45 credits
```

**Tooltip:**
```
Monthly: 30
Rollover: 10
Addon: 5
Total: 45
```

**Props:**
```typescript
interface CreditIndicatorProps {
  showBreakdown?: boolean;
  className?: string;
}
```

**Leftover Code Issues:**
- ✅ No leftover code
- ✅ Useful component

**Recommendations:**
- Add loading state while fetching credits
- Add error state if fetch fails

---

### 4. Tabs.tsx (~100 lines)

**Purpose:** Tab navigation component

**Features:**
- Horizontal tab list
- Active tab indicator (border-bottom)
- Smooth transitions
- Keyboard navigation support
- ARIA attributes for accessibility

**Usage:**
```typescript
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    <TabsTrigger value="cv">CV</TabsTrigger>
    <TabsTrigger value="cover-letter">Cover Letter</TabsTrigger>
    <TabsTrigger value="email">Email</TabsTrigger>
  </TabsList>
  <TabsContent value="cv">CV content</TabsContent>
  <TabsContent value="cover-letter">Cover letter content</TabsContent>
  <TabsContent value="email">Email content</TabsContent>
</Tabs>
```

**Leftover Code Issues:**
- ✅ No leftover code
- ✅ Accessible component

---

### 5. Textarea.tsx (~80 lines)

**Purpose:** Textarea input with consistent styling

**Features:**
- Consistent border and focus styles
- Auto-resize option
- Character count display
- Error state styling
- Label support

**Props:**
```typescript
interface TextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  maxLength?: number;
  autoResize?: boolean;
  rows?: number;
  className?: string;
}
```

**Leftover Code Issues:**
- ✅ No leftover code
- ✅ Useful component

---

## Design System Consistency

### All Components Follow:

**1. Color Palette:**
- Navy for primary actions
- Gold for accents
- Cream for backgrounds
- Consistent semantic colors

**2. Spacing:**
- 4px base unit
- Consistent padding/margins
- Predictable spacing scale

**3. Typography:**
- System font stack
- Consistent font sizes
- Proper line heights

**4. Interactions:**
- Smooth transitions (200-300ms)
- Hover states on interactive elements
- Focus states for accessibility
- Disabled states clearly visible

**5. Accessibility:**
- ARIA attributes
- Keyboard navigation
- Focus indicators
- Semantic HTML

---

## Cleanup Tasks

### High Priority
- None - UI components are clean and well-maintained

### Medium Priority
1. **Add loading state** to CreditIndicator
2. **Add error state** to CreditIndicator

### Low Priority
3. Add Input component (currently missing)
4. Add Select component (currently missing)
5. Add Modal component (currently missing)
6. Add Toast/Notification component
7. Extract design tokens to config file

---

## Missing Components

**Should Be Added:**
1. **Input.tsx** - Text input component
2. **Select.tsx** - Dropdown select component
3. **Modal.tsx** - Modal dialog component
4. **Toast.tsx** - Toast notification component
5. **Badge.tsx** - Badge/pill component
6. **Spinner.tsx** - Loading spinner component

**Currently Using:**
- Native HTML inputs
- Inline modals
- No toast system

---

## Testing Checklist

- [ ] Button variants render correctly
- [ ] Button states work (hover, active, disabled)
- [ ] Card variants render correctly
- [ ] CreditIndicator shows correct balance
- [ ] CreditIndicator tooltip works
- [ ] Tabs navigation works
- [ ] Tabs keyboard navigation works
- [ ] Textarea auto-resize works
- [ ] Textarea character count works
- [ ] All components are accessible

---

## Notes for AI Agents

When working with UI components:
1. **Use existing components** - don't create inline styles
2. **Follow color palette** - navy, gold, cream, sage
3. **Consistent spacing** - use 4px base unit
4. **Accessibility first** - ARIA, keyboard, focus
5. **Add missing components** - Input, Select, Modal, Toast
6. **Extract design tokens** - colors, spacing, typography
7. **Test accessibility** - keyboard, screen readers
8. **Maintain consistency** - all components should feel cohesive
