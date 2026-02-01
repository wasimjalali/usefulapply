# Job Copilot v2 - Quick Start Guide

## 🚀 Getting Started

### 1. Environment Setup
```bash
# Create .env.local with your API key
echo "ANTHROPIC_API_KEY=sk-your-key-here" > .env.local
```

### 2. Install & Run
```bash
# Dependencies already installed
npm run dev
```

### 3. Visit CV Builder
```
http://localhost:3000/cv-builder
```

## 📖 User Journey

### Step 1: Upload CV
1. Choose region: **EU** (A4, 2 pages) or **US** (Letter, 1 page)
2. Drag & drop your PDF CV or click to browse
3. Wait for AI parsing (extracts structured data)
4. ✅ Success! CV loaded with UUID-based IDs

### Step 2: View CV
1. Click **View CV** tab
2. Review extracted data:
   - Personal info (contact details)
   - Professional summary
   - Work experience (with dates)
   - Education
   - Skills, certifications, languages
3. Check date parsing confidence levels

### Step 3: Optimize (Optional)
1. Click **Optimize** tab
2. Enter target role (e.g., "Senior Software Engineer")
3. Paste job description
4. Click **Optimize CV**
5. Review AI-generated diffs:
   - Original bullets (strikethrough)
   - Optimized bullets (highlighted)
   - All facts preserved

### Step 4: Generate PDF
1. Click **Generate PDF** tab
2. Review settings:
   - Region: EU/US
   - Page size: A4/Letter
   - Max pages: 1 or 2
3. Click **Generate PDF** button
4. Server generates PDF (no client memory issues)
5. PDF auto-cached in IndexedDB
6. Download instantly
7. Re-download anytime from history

## 🎯 Key Features

### Region-Aware Rendering
- **EU**: A4 paper (595×842 pts), 2 pages max, includes photo
- **US**: Letter (612×792 pts), 1 page max, no photo

### Date Handling
```typescript
// Multiple formats supported:
"Jun 2022"     → normalized: "2022-06", confidence: high
"2022-06"      → normalized: "2022-06", confidence: high  
"2022"         → normalized: "2022", confidence: medium
"present"      → normalized: "present", confidence: high
```

### Storage Strategy
- **IndexedDB**: PDF blobs (50-100+ MB available)
- **localStorage**: Only metadata (< 5 MB)
- **Auto-cleanup**: PDFs older than 7 days removed

### AI Optimization
- Analyzes job requirements
- Reorders bullets by relevance
- Rephrases for impact
- **Never invents experience**
- Shows exact diffs

## 🔧 Troubleshooting

### "Failed to parse CV"
- ✅ Ensure PDF is text-based (not scanned image)
- ✅ Check ANTHROPIC_API_KEY is set
- ✅ Verify PDF is not password-protected

### "Failed to generate PDF"
- ✅ Check CV data is loaded
- ✅ Verify server is running
- ✅ Check console for errors

### "localStorage quota exceeded"
- ✅ Don't worry! PDFs stored in IndexedDB
- ✅ Only metadata in localStorage (< 5 MB)
- ✅ Old PDFs auto-cleaned after 7 days

### Date parsing issues
- ✅ Check confidence level (high/medium/low)
- ✅ Raw date always preserved
- ✅ Multiple formats supported

## 📊 Example Workflow

```
1. Upload CV (EU format, PDF)
   ↓
2. AI extracts structured data
   ↓
3. Review in viewer (check dates, contact info)
   ↓
4. Optimize for job (paste job description)
   ↓
5. Review diffs (see what changed)
   ↓
6. Generate PDF (server-side, A4, 2 pages)
   ↓
7. Download & apply!
```

## 🎨 UI Overview

### Navigation Tabs
- **Upload CV**: File upload + region selection
- **View CV**: Structured preview with all sections
- **Optimize**: AI-powered job-specific tailoring
- **Generate PDF**: Explicit PDF generation + history

### Visual Indicators
- 🟢 Green: Success (CV loaded, PDF generated)
- 🔵 Blue: Active (parsing, optimizing, generating)
- 🔴 Red: Error (with detailed message)
- ⚪ Gray: Disabled (no CV loaded yet)

## 📈 Performance

- **Parsing**: ~5-10 seconds (depends on CV length)
- **Optimization**: ~10-15 seconds (depends on job description)
- **PDF Generation**: ~2-3 seconds (server-side)
- **PDF Download**: Instant (cached in IndexedDB)

## 🔐 Privacy

- ✅ All processing on your server
- ✅ PDFs stored locally in browser (IndexedDB)
- ✅ No data sent to third parties (except Anthropic AI)
- ✅ Clear history anytime with Reset button

## 📱 Browser Support

- ✅ Chrome 90+ (recommended)
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

Requires: IndexedDB support, modern JavaScript

## 🆘 Need Help?

### Check the logs
```bash
# Server logs
npm run dev

# Browser console
F12 → Console tab
```

### Common Issues
1. **API key not found**: Set ANTHROPIC_API_KEY in .env.local
2. **Build errors**: Run `npm install` again
3. **PDF not generating**: Check server logs
4. **Dates wrong**: Check raw date field (always preserved)

## 🎓 Learn More

- See `IMPLEMENTATION_v2.md` for architecture details
- Check `src/lib/types/cv-schema.ts` for schema
- Review `src/lib/pdf-renderer.ts` for PDF logic
- Explore `src/store/useCVStore.ts` for state management

---

**Version**: 2.0.0  
**Ready to use**: ✅  
**Production**: Ready
