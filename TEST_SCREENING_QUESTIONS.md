# Screening Questions Feature — Test Script

## Job Description (paste this into the chat)

```
AI & Automation Specialist — TechVision GmbH, Berlin

About Us:
TechVision GmbH is a fast-growing B2B SaaS company helping enterprises automate their workflows using AI. We serve 200+ clients across DACH and are expanding into the US market. Our platform processes 50M+ documents annually using a combination of LLMs, computer vision, and custom ML pipelines.

About the Role:
We're looking for an AI & Automation Specialist to join our Product Engineering team. You'll design, build, and maintain AI-powered automation pipelines that reduce manual work for our clients. You'll work closely with product managers, data engineers, and enterprise clients.

Responsibilities:
- Design and implement AI automation workflows using Python, LangChain, and cloud services (AWS/GCP)
- Build and maintain LLM-based document processing pipelines (extraction, classification, summarization)
- Develop and optimize prompt engineering strategies for production systems
- Integrate AI capabilities into our existing SaaS platform via REST APIs
- Monitor model performance, manage A/B testing, and iterate on accuracy improvements
- Collaborate with data engineers on ETL pipelines and feature stores
- Present technical solutions to enterprise clients and gather feedback
- Write technical documentation and contribute to internal knowledge sharing

Requirements:
- 3+ years of experience in AI/ML engineering or a related role
- Strong Python skills (FastAPI, pandas, scikit-learn)
- Hands-on experience with LLMs (OpenAI, Anthropic, or open-source models)
- Experience building production AI pipelines (not just prototypes)
- Familiarity with cloud platforms (AWS preferred: Lambda, SageMaker, S3, Step Functions)
- Understanding of NLP techniques: named entity recognition, text classification, embeddings
- Excellent communication skills — ability to explain AI concepts to non-technical stakeholders
- Fluent in English; German is a plus

Nice to Have:
- Experience with computer vision (OCR, document layout analysis)
- Knowledge of MLOps tools (MLflow, Weights & Biases, Kubeflow)
- Experience with vector databases (Pinecone, Weaviate, pgvector)
- Contributions to open-source AI projects
- Experience in a B2B SaaS environment

Compensation:
- Salary: EUR 70,000 - 90,000 depending on experience
- Equity participation after 1 year
- 30 days vacation, flexible remote policy (2 days office/week in Berlin)
- Learning budget EUR 2,000/year
- Relocation support available

Start Date: As soon as possible
Location: Berlin, Germany (hybrid)
```

---

## Screening Questions (paste these AFTER application is generated and you click "Answer Screening Questions")

```
1. Are you legally authorized to work in Germany?

2. How many years of experience do you have with Python in a professional setting?

3. Describe your experience building AI/ML pipelines for production systems (not just prototypes or POCs).

4. Tell me about a time you had to explain a complex AI concept or solution to a non-technical stakeholder. What was the situation and what was the outcome?

5. Our platform processes 50M+ documents per year. How would you approach optimizing an LLM-based document processing pipeline for both accuracy and cost efficiency at this scale?

6. What is your expected salary range for this position?

7. Are you comfortable working in a hybrid model (2 days/week in the Berlin office)?
```

---

## Expected Behavior

### After pasting the JD:
- [ ] Agent workflow runs (fit analysis or direct apply depending on mode)
- [ ] All documents generated (CV, cover letter, email)
- [ ] "Answer Screening Questions" CTA appears in the action buttons

### After clicking CTA:
- [ ] Assistant message appears prompting to paste screening questions
- [ ] Chat input is ready for the user to paste

### After pasting screening questions:
- [ ] Response shows "Screening Question Answers" header with "Copy All" button
- [ ] 7 individual answer blocks, each with its own "Copy" button
- [ ] Answer types should match (ATS-optimized lengths):
  - Q1 (eligibility): 1-5 words — e.g., "Yes"
  - Q2 (numeric): Under 20 words — e.g., "5+ years of professional Python, including 3 years building production ML pipelines."
  - Q3 (short-answer): 50-80 words, specific examples from CV
  - Q4 (behavioral/STAR): 100-150 words with compressed STAR, quantified result
  - Q5 (situational): 75-120 words, step-by-step approach
  - Q6 (salary): Brief, based on the JD range or open
  - Q7 (eligibility): 1-5 words — e.g., "Yes, no issue"
  - **Hard ceiling: No individual answer exceeds 150 words**

---

## Test Results

_Paste the actual AI responses below after testing:_

### Fit Analysis / Application Generation
```
(paste result here)
```

### Screening Question Answers
```
(paste result here)
```

### Notes / Issues Found
```
(note any issues here)
```
