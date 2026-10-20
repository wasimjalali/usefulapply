# Structured cover letter: does the writer still hold its rules? (2026-10-20)

## Question

PR 4 of the MCP integration (`docs/agent-integration/PLAN.md`, section 5) moves the cover letter from one plain-text block to a structured contract (`src/lib/cover-letter/contract.ts`). The export renderer needs it to lay letters out as a US business letter or a DIN 5008 Form B letter.

The split:

- **The model writes** the subject, salutation, three paragraphs and closing as JSON. It also returns the contact person and department, but only when the ad states them.
- **Code fills the rest:** sender details from the CV, the recipient company and address from the session row, the date, the place, the language and the market.

The question: after this change, does the writer still produce letters that are grounded in the CV, free of dashes and under 250 words, with the right US and DACH conventions? And does it never invent a recipient address?

## What ran

- **Model:** `claude-sonnet-5-5` on the Anthropic API. This is the production request shape: adaptive thinking, effort low, no temperature, `write_cover_letter` max_tokens 8192 (4 x 2048).
- **Path:** the eval client (`evals/lib/client.ts`), so nothing reached the production ledger and no credits moved.
- **Code under test:** the real `unifiedWriterAgent` code. Per case:
  1. `extractApplicantProfile`, `parseJobDescription` and `extractVerifiedMetrics` (in parallel);
  2. `computeSkillMatch`;
  3. `generateCoverLetter` (the new JSON call, with its one validation retry available).
- **Session row:** none exists in the eval, so the recipient address must come back empty.
- **Column variant:** an extra check, with no model call. It re-assembles the contact case's model fields with a saved session address to exercise the verified-column path.
- **Date:** 2026-10-20, one run per case.
- **Command:** `npx tsx evals/structured-cover-letter.ts --allow-anthropic-api`. The script loads `.env.local` and `.dev.vars` from the cwd or the main checkout and never prints them.
- **Raw outputs:** `evals/results/2026-10-20-structured-cover-letter/`:
  - `calls.jsonl`: every call, with the request body, raw output, usage and latency;
  - `letters/<case>.txt`: the plain-text body;
  - `letters/<case>.json`: the structured letter, the analysis context and the per-check results;
  - `summary.json`.

### Cases

| Case | Language | CV | Ad | What it tests |
|---|---|---|---|---|
| syn-01 | en | junior marketing (Portland, has a LinkedIn link) | Coinbase, Greenhouse | thin CV, sender links |
| syn-07 | en | senior backend, career gap (Toronto) | Cloudflare Egress, long ad | bait (ad wants Go/Rust), metrics-heavy CV |
| syn-11 | en | financial analyst (Chicago) | Datadog FP&A | metrics, seniority stretch |
| syn-15 | de | technischer Vertrieb (Nürnberg) | ottonova, Personio | German, no contact person, bait |
| syn-16 | de | ZFA career changer (München) | ottonova claims, Personio | German career changer, no contact person |
| sl-de-contact | de | technischer Vertrieb | constructed ad, fictional Brenner Getriebe GmbH (`evals/dataset/structured-letter-cases.jsonl`) | contact person, department, postal address and reference number in the ad; bait (Salesforce, French) |

## Checks per case (all deterministic, in the script)

- **contract_valid:** `isStructuredCoverLetter()` plus a deep type check of every field, with an ISO date.
- **recipient_address_empty:** `recipient.addressLines` is empty when no session address exists.
- **no_ad_address_in_body:** no postal or street line from the ad appears in the body.
- **contact_rule:** the contact case gets the ad's contact person, verbatim, and a salutation by surname. The other cases get no contact and no department.
- **numbers_traced:** every number in the paragraphs is in the CV or the ad. Ad-only numbers are listed for review as employer facts.
- **no_missing_skill_named:** no skill the matcher marked missing is named in the paragraphs.
- **no_dashes:** no U+2014 or U+2013 in the body, also counted on the raw model output.
- **under_250_words** and **three_paragraphs**.
- **market_rules:**
  - German: market `dach`, closing exactly "Mit freundlichen Grüßen", subject "Bewerbung als ..." with no "Betreff:".
  - English: market `us`, closing "Sincerely,", "Kind regards," or "Best regards,", subject "Application for ...".
- **subject_numbers_from_ad:** a reference number in the subject is the ad's own.
- **body_faithful:** `body === renderCoverLetterBody(structured)`, and the body contains the subject, salutation, every paragraph, closing and name.
- **sender_from_cv:** the name, email, phone, address lines and links are all literal CV text.
- **no_placeholders.**

## Numbers

| Case | Checks | Letter calls (1 = no retry) | Words (paragraphs) | Dashes in raw output | Subject | Closing |
|---|---|---|---|---|---|---|
| syn-01 | 14/14 | 1 | 201 | 0 | Application for Experiential Marketing Associate | Best regards, |
| syn-07 | 14/14 | 1 | 229 | 0 | Application for Senior Software Engineer - Egress (Go/Rust) | Kind regards, |
| syn-11 | 14/14 | 1 | 208 | 0 | Application for FP&A Analyst | Kind regards, |
| syn-15 | 14/14 | 1 | 179 | 0 | Bewerbung als Key Account Manager/in, Maklerbetreuer/in Firmengeschäft ... (m/w/d) | Mit freundlichen Grüßen |
| syn-16 | 14/14 | 1 | 169 | 0 | Bewerbung als Quereinstieg Leistungssachbearbeitung (Zahn) ... (m/w/d) | Mit freundlichen Grüßen |
| sl-de-contact | 14/14 | 1 | 159 | 0 | Bewerbung als Key Account Manager (m/w/d) Antriebstechnik, Kennziffer KAM-2026-17 | Mit freundlichen Grüßen |

- **Recipient:** `addressLines` came back empty in all six. The contact case returned `contactPerson: "Frau Melanie Brandl"` and `department: "Personalabteilung"`, both verbatim from the ad, with the salutation "Sehr geehrte Frau Brandl,". The ad's "Industriestraße 14 / 90431 Nürnberg" never reached the body.
- **Column variant:** pass. With a saved address the recipient block reads "Brenner Getriebe GmbH / Personalabteilung / Frau Melanie Brandl / Industriestraße 14 / 90431 Nürnberg", the DIN 5008 order.
- **Place:** "Nürnberg" and "München" on the German letters, taken from the CV address.
- **Sender links:** syn-01 picked up `linkedin.com/in/maya-linden-example` from the CV header.

**Cost and latency:**
- 30 calls in total (6 cases x 4 analysis calls + 6 letter calls). No retries.
- Total $0.4315. The six cover letter calls were $0.1223, about $0.020 a letter.
- Tokens: 101,137 input, 19,980 output, 10,880 cache write, 21,760 cache read.
- Cover letter latency: 4.3 to 6.2 s (mean 5.3 s).

### Manual fact spot-check (read by the agent, every letter)

Every metric was checked against the CV, and all are verbatim:

- 35 to 60 tickets and about 300 visitors;
- 40 million events a day, p99 latency from 480 to 120 ms, 4 engineers, 9 months, 6 services, 14 incidents;
- 88% to 96% accuracy, 85 million USD, 9 to 6 working days, 9 of 13 ACCA papers;
- 3.1 to 4.2 million EUR and about 60 customers;
- 8 to under 3 percent and 30 to 40 inquiries a day.

**Bait:** no bait skill was claimed. The Cloudflare letter didn't claim Go or Rust. The contact letter said "derzeit in SAP CRM" instead of claiming Salesforce, and left French out.

**Soft claims:** three sentences go slightly past the CV. They come from the existing voice and content rules, which this PR didn't change:
- syn-07: "Debugging complex systems under real load is what I do best, and I like picking up new tools and languages quickly." This is the prompt's sanctioned "learning ability" angle, but "what I do best" is self-assessment.
- syn-11: "I'm keen to build proficiency in BI tools like Tableau and Metabase." This names tools the CV lacks without claiming them, which skirts the `<gaps>` rule (say nothing about what's missing).
- syn-15: "Auch Videocalls über MS Teams gehören zu meiner täglichen Arbeit." MS Teams is in the CV. "Daily video calls" is an inference.

## Limits

- One run per case, six cases. This shows the contract path works and the rules hold. It doesn't measure rates.
- `numbers_traced` matches substrings. For example, "18" in "18 Ländern" also matches "2018" in the CV. Every number was therefore also checked by hand.
- Quality (voice, specificity) wasn't judged. The prompt's voice, content and anti-hallucination blocks are unchanged. Only the structure, output format and closing rules changed.
- The Bedrock fallback (`AI_PROVIDER=bedrock`, Sonnet 4.6) wasn't run. The JSON path uses the same `jsonMode` system suffix and the same `parseStrictJsonObject` parser that the email writers already run on Bedrock.

## Conclusion

The structured contract works on the production model with no retries:
- 6 of 6 letters valid against the contract;
- 0 invented recipient addresses;
- 0 dashes;
- all under 250 words;
- correct DACH and US subject and closing conventions;
- each body an exact rendering of its structure.

A contact person and department reach the letter only when the ad states them verbatim. A recipient address reaches it only from the session row.

## What changed because of it

PR 4 ships the structured letter as built. Two follow-ups, outside this PR:
- the soft-claim sentences above, a prompt tweak to the `<gaps>` and learning-ability guidance;
- nothing in the product writes `company_address` or `company_contact_person` today, so recipient addresses will be empty in practice until a UI or the MCP tools let the user save them.
