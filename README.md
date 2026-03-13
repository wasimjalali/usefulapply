# 🚀 Job Copilot

**AI-Powered Job Application Assistant** - Optimize your CV, generate cover letters, and create professional emails tailored to each job application.

## ✨ Features

- **Multi-Agent AI System** - Orchestrator, Analyzer, Writer, and Evaluator agents work together
- **Smart CV Optimization** - Tailors your CV to match job requirements with ATS-friendly formatting
- **Cover Letter Generation** - Creates personalized cover letters with company research
- **Email Drafting** - Professional application emails ready to send
- **8 CV Templates** - US and EU regional templates including 2 premium ATS-optimized designs
- **Company Research** - Tavily-powered web search for company culture, values, and recent news
- **Quality Refinement** - Evaluator-Optimizer reflection loop for optimal content quality

## 🤖 AI Models

| Task | Model | Purpose |
|------|-------|---------|
| All Tasks | GPT-4o mini | Job parsing, CV optimization, cover letters, emails |
| Research | Tavily API | Company information and culture |

## 🛠️ Tech Stack

- **Framework:** Next.js 16 with App Router
- **Styling:** Tailwind CSS v4
- **State:** Zustand with persistence
- **AI:** OpenAI GPT-4o mini, Tavily
- **Documents:** pdf-parse, mammoth, pdf-lib, jsPDF

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Environment Variables

Create a `.env.local` file:

```bash
# Required
OPENAI_API_KEY=your_openai_key

# Optional (for company research)
TAVILY_API_KEY=your_tavily_key

# Optional (for RAG - not required for basic use)
PINECONE_API_KEY=your_pinecone_key
```

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the application.

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes (V2 agents)
│   ├── documents/         # Document management page
│   └── page.tsx           # Main application
├── components/            # React components
│   ├── cv-templates/      # 8 CV templates
│   └── ui/                # UI primitives
├── lib/
│   ├── agents/            # Multi-agent system
│   ├── models/            # AI model routing
│   ├── rag/               # Skill matching
│   └── tools/             # Tavily integration
├── hooks/                 # React hooks
└── store/                 # Zustand state
```

## 📖 Documentation

- [Implementation Guide](docs/PREMIUM_AGENTIC_AI_IMPLEMENTATION_GUIDE.md)
- [Audit Report](docs/APPLICATION_AUDIT_REPORT.md)
- [Implementation Phases](docs/IMPLEMENTATION_PHASES.md)

## 🔧 Development

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run lint     # Run ESLint
```

## 📝 License

Private - All rights reserved.
