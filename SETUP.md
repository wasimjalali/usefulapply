# Job Copilot - Setup Guide

## OpenAI API Setup

The application now uses **OpenAI** (GPT-4) instead of Anthropic Claude.

### 1. Get Your OpenAI API Key

1. Go to https://platform.openai.com/
2. Sign in or create an account
3. Navigate to API Keys section
4. Click "Create new secret key"
5. Copy the key (starts with `sk-`)

### 2. Add API Key to Environment

Open `.env.local` file and add your key:

```bash
OPENAI_API_KEY=sk-your-actual-key-here
```

### 3. Start the Development Server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

### 4. Test the Application

1. **Upload CV**: Drag and drop a PDF or DOCX file in the right panel
2. **Add Job Description**: Paste a job description (minimum 50 characters)
3. **Click "Analyze & Generate"**: The AI will:
   - Analyze job requirements
   - Generate an optimized CV
   - Create a personalized cover letter

### Models Used

- **Analysis & Generation**: GPT-4o (gpt-4o model)
- You can change the model in `src/lib/openai.ts` if needed

### Costs

OpenAI pricing (as of 2024):
- GPT-4o: $5/1M input tokens, $15/1M output tokens
- Typical analysis: ~$0.05-0.15 per job application

### Troubleshooting

**Error: "Analysis failed"**
- Check your API key is correct in `.env.local`
- Verify you have credits in your OpenAI account
- Check the terminal for detailed error messages

**Build errors**
```bash
npm run build
```

**Clear and restart**
```bash
rm -rf .next
npm run dev
```

### Optional: Switch Back to Anthropic

If you want to use Claude instead, the original Anthropic client is still available at `src/lib/anthropic.ts`. You would need to:
1. Change imports in API routes from `@/lib/openai` to `@/lib/anthropic`
2. Change `askOpenAI` to `askClaude` and `parseOpenAIJSON` to `parseClaudeJSON`
3. Add `ANTHROPIC_API_KEY` to `.env.local`
