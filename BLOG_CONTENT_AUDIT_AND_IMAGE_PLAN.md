# Blog Content Audit & Missing Images Plan
*Generated: 2026-03-31*

## Task Overview

### Task 1: Redesign Comparison Table
**Status**: 🔴 To Do
**Location**: Post 5 - "Best AI Job Application Tools 2026" 
**Issue**: Markdown table renders as ugly plain text with pipes
**Solution**: Create custom React component with styled table

---

### Task 2: Identify & Generate Missing Blog Post Images
**Status**: 🔴 Auditing

---

## Task 1: Comparison Table Redesign

### Current State
- Plain markdown table at line 950-961 in posts.ts
- Renders as text with | separators
- Checkmarks (✅), crosses (❌), and warnings (⚠️) render but layout is broken
- Mobile unfriendly
- Not visually appealing

### Design Solution
Create `ComparisonTable.tsx` component with:
- Sticky header row
- Color-coded cells (green for ✅, red for ❌, yellow for ⚠️)
- Horizontal scroll on mobile
- Hover states
- Professional styling matching Karko AI brand
- Responsive grid layout

### Implementation Plan
1. Create `src/components/blog/ComparisonTable.tsx`
2. Add comparison table data as props
3. Style with Tailwind CSS
4. Replace markdown table in posts.ts with React component import
5. Test rendering in blog post

---

## Task 2: Blog Posts Content Audit

### Scanning Criteria
- Identify major sections (##) without inline images
- Focus on sections with data, comparisons, or process flows
- Exclude sections that are purely text-based (conclusions, CTAs)
- Prioritize sections that would benefit from visual aids

### Posts to Audit
1. ✅ Post 1: "Why 87% of Follow-Up Emails Never Get a Response" (5 images - complete)
2. ✅ Post 2: "How to Tailor Your Resume" (6 images - complete)
3. ✅ Post 3: "How to Format Your Resume for ATS" (6 images - complete)
4. ✅ Post 4: "How to Write an AI Cover Letter" (5 images - complete)
5. 🔍 Post 5: "Best AI Job Application Tools 2026" (4 images - needs table visualization)
6. 🔍 Post 6: "How to Build a Master CV" (1 image - needs more)
7. 🔍 Post 7: "German CV vs American Resume" (1 image - needs more)
8. 🔍 Post 8: "AI Resume Ethics" (1 image - needs more)

---

## Detailed Audit Results

### Post 5: "Best AI Job Application Tools 2026"
**Current Images**: 4
- ✅ ai-tools-comparison-cover.jpg (cover)
- ✅ ai-tools-comparison-matrix.jpg
- ✅ ai-tools-speed-comparison.jpg
- ✅ ai-tools-decision-tree.jpg

**Missing Visualization**:
- ❌ Feature Comparison Table (currently ugly markdown)

**Solution**: Custom React component (Task 1)

---

### Post 6: "How to Build a Master CV"
**Current Images**: 1
- ✅ master-cv-cover.jpg (cover only)

**Sections Needing Images**:

#### 1. Section: "What Is a Master CV?"
**Content Summary**: Explains master CV concept - comprehensive document with all experience
**Image Needed**: Visual diagram showing Master CV → Tailored CVs concept
**Prompt**: "Create a professional infographic showing a master CV document concept. Central large document labeled 'Master CV' with golden rays. Around it, 3-4 smaller tailored CV documents for different roles (Software Engineer, Product Manager, Data Scientist). Arrows flowing from master to tailored versions. Navy blue and gold color scheme. Clean, modern, minimalist design. Flat illustration style."

#### 2. Section: "How to Build Your Master CV"
**Content Summary**: Step-by-step process (8 steps)
**Image Needed**: Process flowchart or numbered steps visual
**Prompt**: "Create a vertical flowchart showing 8 steps to build a master CV. Each step in a rounded rectangle with icon: 1) Gather docs (folder icon), 2) List all jobs (briefcase), 3) Bullet points (checkmark), 4) Education (graduation cap), 5) Skills (star), 6) Projects (code), 7) Certifications (badge), 8) Review (magnifying glass). Navy blue boxes with gold accent lines connecting them. Modern, clean design."

#### 3. Section: "Master CV vs. Tailored CV"
**Content Summary**: Comparison between master CV (comprehensive) and tailored CV (job-specific)
**Image Needed**: Side-by-side comparison visual
**Prompt**: "Create a side-by-side comparison infographic. Left side: 'Master CV' - thick document with multiple sections, labels showing 'All Experience', 'Every Skill', 'Full History' (3-5 pages). Right side: 'Tailored CV' - sleaner document, labels showing 'Relevant Only', 'Job-Matched', 'ATS-Optimized' (1-2 pages). Arrow between them labeled 'Extract & Optimize'. Navy blue and gold color scheme. Professional, clean design."

---

### Post 7: "German CV vs American Resume: What's Different in 2026?"
**Current Images**: 1
- ✅ german-vs-american-cv-cover.jpg (cover only)

**Sections Needing Images**:

#### 1. Section: "The 7 Key Differences"
**Content Summary**: Lists 7 major differences (photo, length, personal data, formatting, order, cover letter, language)
**Image Needed**: Split-screen comparison showing 7 differences
**Prompt**: "Create a split-screen comparison infographic. Left half: German CV (Lebenslauf) with photo placeholder at top, 2-3 pages, detailed personal info section, chronological layout, formal style. Right half: American Resume with no photo, 1-2 pages, minimal personal info, reverse-chronological, modern layout. 7 numbered callouts pointing to key differences. Use German flag colors (black/red/gold) on left, American colors (red/white/blue) on right. Professional, clean design."

#### 2. Section: "What You Must Include (and What to Leave Out)"
**Content Summary**: Required vs forbidden elements for each format
**Image Needed**: Checklist comparison
**Prompt**: "Create a comparison checklist infographic. Two columns: 'German CV' and 'American Resume'. Each with two sections: green checkmarks for 'Required' items, red X marks for 'Never Include' items. German required: photo, birthdate, nationality, marital status, detailed address. American required: name, phone, email, LinkedIn. American forbidden: photo, age, marital status, religion, nationality. Navy blue headers, clean layout."

#### 3. Section: "Which Format Should You Use?"
**Content Summary**: Decision tree based on location and job type
**Image Needed**: Decision flowchart
**Prompt**: "Create a decision tree flowchart. Start node: 'Where are you applying?' Branch 1: 'Germany/Austria/Switzerland' → 'Use German CV (Lebenslauf)' with sub-branches for different industries. Branch 2: 'US/UK/Canada' → 'Use American Resume' with sub-branches. Branch 3: 'German company, English role' → 'Hybrid format'. Use navy blue boxes, gold decision diamonds, green endpoint boxes. Clean, professional design."

---

### Post 8: "The Ethics of AI-Written Resumes"
**Current Images**: 1
- ✅ ai-ethics-cover.jpg (cover only)

**Sections Needing Images**:

#### 1. Section: "Where the Line Is"
**Content Summary**: Explains ethical vs unethical AI resume use (3 categories: ethical, gray area, unethical)
**Image Needed**: Spectrum/gradient visual showing ethical boundaries
**Prompt**: "Create a horizontal spectrum graphic showing AI resume ethics. Left (green zone): 'Ethical' - labels: 'Phrasing help', 'Grammar fixes', 'Formatting', 'Tailoring real experience'. Middle (yellow zone): 'Gray Area' - labels: 'Skill exaggeration', 'Title inflation', 'Responsibility stretching'. Right (red zone): 'Unethical' - labels: 'Fake jobs', 'False degrees', 'Fabricated skills', 'Invented projects'. Gradient background from green to yellow to red. Navy blue text, clean design."

#### 2. Section: "What Karko AI Does (and Doesn't Do)"
**Content Summary**: Explains Karko AI's anti-hallucination approach and safeguards
**Image Needed**: Shield/protection visual showing safeguards
**Prompt**: "Create an infographic showing Karko AI's ethical safeguards. Central shield icon labeled 'Anti-Hallucination Engine'. 4 protective layers radiating out: 1) 'Fact Verification' (checkmark icon), 2) 'Source Tracing' (document icon), 3) 'Claims Validation' (magnifying glass icon), 4) 'Experience Grounding' (anchor icon). Gold shield with navy blue accents. Professional, trustworthy design. Include small 'Only Real Experience' badge at bottom."

#### 3. Section: "The Real Risk: Not the AI, but the Pressure"
**Content Summary**: Discusses job market pressure leading to resume fraud
**Image Needed**: Pressure gauge or balance scale visual
**Prompt**: "Create a balance scale infographic showing job search pressure. Left side: 'Market Pressure' - labels: '100+ applicants per role', '500+ applications needed', 'ATS filters', '30-second resume scans'. Heavy weight pushing down. Right side: 'Ethical Standards' - labels: 'Truthful representation', 'Verified experience', 'Real skills', 'Honest achievements'. Scale tipping left, showing imbalance. Include central question: 'How do you compete without compromising?' Navy and gold colors, serious tone."

---

## Image Generation Plan

### Total New Images Needed: 10
1. master-cv-concept-diagram.jpg (Post 6)
2. master-cv-build-process.jpg (Post 6)
3. master-cv-vs-tailored-cv.jpg (Post 6)
4. german-american-cv-differences.jpg (Post 7)
5. german-american-cv-checklist.jpg (Post 7)
6. cv-format-decision-tree.jpg (Post 7)
7. ai-resume-ethics-spectrum.jpg (Post 8)
8. karko-ai-safeguards.jpg (Post 8)
9. job-search-pressure-balance.jpg (Post 8)
10. (Comparison table will be React component, not image)

### Generation Workflow
1. Use Playwright MCP to navigate to Gemini (Imagen 3)
2. Generate each image with prompts above
3. Download to `.playwright-mcp/` or temp directory
4. Run compression script (85% quality, 1920px max width)
5. Move to `public/blog/`
6. Update posts.ts with image references
7. Verify rendering in blog posts

### Compression Target
- Input: ~5-7 MB per image (Gemini output)
- Output: ~100-200 KB per image (compressed)
- Total savings: ~60-70 MB → ~1-2 MB

---

## Implementation Checklist

### Task 1: Comparison Table
- [ ] Create `src/components/blog/ComparisonTable.tsx`
- [ ] Define table data structure
- [ ] Implement responsive design
- [ ] Style with Tailwind CSS
- [ ] Replace markdown table in posts.ts
- [ ] Test on mobile/desktop
- [ ] Commit and push

### Task 2: Missing Images
- [ ] Generate 10 images via Gemini (Playwright MCP)
- [ ] Compress all images (sharp script)
- [ ] Update posts.ts with image markdown references
- [ ] Verify all images render correctly
- [ ] Test page load performance
- [ ] Commit and push

---

## Execution Order
1. **First**: Complete Task 1 (Comparison Table) - immediate impact on Post 5
2. **Second**: Generate and insert missing images for Post 6 (Master CV)
3. **Third**: Generate and insert missing images for Post 7 (German CV)
4. **Fourth**: Generate and insert missing images for Post 8 (AI Ethics)
5. **Final**: Compress all, test, commit, and push

---

## Success Metrics
- ✅ Comparison table looks professional and branded
- ✅ All 10 new images generated and compressed
- ✅ All blog posts have 3+ images minimum
- ✅ Images enhance understanding of content
- ✅ Page load time remains fast (<3s on 4G)
- ✅ TypeScript compilation: 0 errors
- ✅ Git commit with detailed message
