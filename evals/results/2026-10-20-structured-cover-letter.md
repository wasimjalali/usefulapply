# Structured cover letter: does the writer still hold its rules? (2026-10-20)

## Question

PR 4 of the MCP integration (`docs/agent-integration/PLAN.md`, section 5) moves the cover letter from one plain-text block to a structured contract (`src/lib/cover-letter/contract.ts`). The export renderer needs it to lay letters out as a US business letter or a DIN 5008 Form B letter.

The split:

- **The model writes** the subject, salutation, three paragraphs and closing as JSON. It also returns the contact person and department, but only when the ad states them.
- **Code fills the rest:** sender details from the CV, the recipient company and address from the session row, the date, the place, the language and the market.

The question: after this change, does the writer still produce letters that are grounded in the CV, free of dashes and under 250 words, with the right US and DACH conventions? And does it never invent a recipient address?

A same-day follow-up (runs 2 and 3) added a second question. A DIN letter with an empty address field looks unfinished. Can the writer take the employer's postal address from the ad safely? The rule: only lines that appear verbatim in the ad, with the saved session row winning over the ad, and nothing invented getting through.

| Run | Cases | Folder | What changed in the code |
|---|---|---|---|
| 1 | 6 | `2026-10-20-structured-cover-letter/` | first structured version: recipient address from the session row only |
| 2 | 2 (sl-de-contact, new sl-us-address) | `.../recipient-rerun/` | the model also returns the ad's company name and postal address; code keeps them only if verbatim |
| 3 | the same 2 | `.../recipient-rerun-2/` | run 2 found a guessed title ("Dear Ms. Whitfield" for an ad that only says "Dana Whitfield"); the prompt and the validator now forbid unstated titles |

## What ran (run 1)

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
- **Run 1 recipient checks:**
  - `recipient_address_empty`: `recipient.addressLines` is empty when no session address exists.
  - `no_ad_address_in_body`: no postal or street line from the ad appears in the body.
- **Runs 2 and 3 recipient checks:**
  - `recipient_address_rule`: an ad with a postal address must give a filled block, every line verbatim in the ad, with at least one line carrying a digit. Any other ad gives an empty block.
  - `no_address_in_letter_text`: no address line from the ad appears in the subject, salutation or paragraphs.
- **contact_rule:** a contact case gets the ad's contact person verbatim and a salutation by surname. The other cases get no contact and no department.
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

## Numbers (run 1)

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

## Runs 2 and 3: the recipient address from the ad

**Code change:**
- The model's `recipient` field now also carries `companyName` and `addressLines` copied from the ad.
- The writer keeps the address all or nothing:
  - Lines that repeat the company, contact or department, or carry an email, phone or web address, are set aside first.
  - Every remaining line must appear verbatim in the ad (after whitespace normalisation). At least one line must carry a digit, and there are at most four.
  - Otherwise the whole address is dropped, because a street with a wrong city is worse than no address.
- Precedence per detail: the session row (`company_address`, `company_contact_person`), then the verbatim extract, then empty.
- A letter text that contains the address fails validation. So does a salutation with a gendered title (Frau, Herr, Ms., Mr.) that the ad doesn't give that person (added after run 2).
- An extracted address and contact are saved to the session row, but only into empty columns (`src/lib/agents/persist-letter-recipient.ts`).

**New case:** `sl-us-address`. A constructed ad for a fictional Northwind Freight Inc. in Chicago, with "Dana Whitfield, Talent Acquisition", a two-line postal address, a reference number, and bait (Tableau, NetSuite, CPA/CFA). The CV is the financial analyst.

**Commands:**
```bash
npx tsx evals/structured-cover-letter.ts --allow-anthropic-api --cases sl-de-contact,sl-us-address --out-sub recipient-rerun    # run 2
npx tsx evals/structured-cover-letter.ts --allow-anthropic-api --cases sl-de-contact,sl-us-address --out-sub recipient-rerun-2  # run 3
```

### Results

| Run | Case | Checks | Letter calls | Words | Recipient block | Salutation |
|---|---|---|---|---|---|---|
| 2 | sl-de-contact | 14/14 | 1 | 154 | Brenner Getriebe GmbH / Personalabteilung / Frau Melanie Brandl / Industriestraße 14 / 90431 Nürnberg | Sehr geehrte Frau Brandl, |
| 2 | sl-us-address | 14/14 | 1 | 206 | Dana Whitfield / Talent Acquisition / Northwind Freight Inc. / 220 West Lake Street, Suite 1400 / Chicago, IL 60606 | Dear Ms. Whitfield, (guessed title, see below) |
| 3 | sl-de-contact | 14/14 | 1 | 163 | same as run 2 | Sehr geehrte Frau Brandl, |
| 3 | sl-us-address | 14/14 | 1 | 198 | same as run 2 | Dear Dana Whitfield, |

Every address line is copied verbatim from the ad. No address appears in any paragraph, subject or salutation. There are no dashes, every number traces to the CV or (for employer facts such as "rund 40 Schlüsselkunden") to the ad, and there were no retries.

**The run 2 finding:** the US letter opened "Dear Ms. Whitfield,", but the ad never gives Dana Whitfield a title. The old prompt example ("Dear Ms. Smith,") invited the guess, and the salutation check allowed every title word. The prompt now asks for the full name when the ad gives no title. The validator rejects a title unless a source states it for that surname, so "Frau Brandl" passes because the ad says "Frau Melanie Brandl". Run 3 wrote "Dear Dana Whitfield," on the first try.

**Doctored answers.** These run through the writer's real post-model path (`coverLetterFromModelOutput`), with no model call. The script takes the real raw answer and changes one field:

| Check | Input | Result |
|---|---|---|
| fake_address_dropped | `["Hauptstraße 99", "10115 Berlin"]`, not in the ad | `[]`, not in the body |
| partly_fake_address_dropped_whole | `["Industriestraße 14", "80331 München"]`, the first line real | `[]` |
| contact_line_set_aside | the real address plus the ad's email line | the two address lines only |
| digitless_address_dropped | `["Personalabteilung"]` | `[]` |
| fake_contact_dropped | contact "Herr Thomas Weber", not in the ad | no contact |
| saved_address_wins | a session address plus the real ad address | the session address |
| address_in_paragraph_rejected | "Industriestraße 14" added to paragraph 1 | validation error, which triggers the one retry |
| guessed_title_rejected (run 3) | US answer with "Dear Ms. Whitfield," | validation error |

All 8 pass in run 3 (7 of 7 in run 2, before the title check existed). The run 1 column variant (saved address only) also passes again.

**Facts:** I spot-checked both letters against the CVs:
- 88% to 96%, 85 million USD, 9 to 6 days, 9 of 13 papers, the Redfern annual budget, Power BI dashboards for plant managers;
- 60 customers, 3.1 to 4.2 million EUR, the B.Eng. and C1 English.

Neither letter claims Tableau, NetSuite, Salesforce or French. The German letter says SAP CRM experience should make "den Umstieg auf Salesforce" familiar. That isn't a claim, but it points at the gap, the same soft pattern as syn-11 in run 1.

**Cost:** run 2 $0.1246 (letter calls $0.0401); run 3 $0.1389 (letter calls $0.0545). Ten calls each.

## Limits

- One run per case, six cases in run 1 and two in runs 2 and 3. This shows the contract path works and the rules hold. It doesn't measure rates.
- The five run 1 cases without an address in the ad (syn-01, syn-07, syn-11, syn-15, syn-16) weren't rerun on the final prompt, to keep spend small. The prompt change only touches the recipient field and the salutation title rule. Those ads state no address or contact, and run 1 already showed empty blocks for them.
- The session-row write (`saveLetterRecipientFromAd`) needs D1 and wasn't exercised here. It writes only empty columns, through the existing `updateSession`.
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

A recipient detail reaches the letter only from the session row or verbatim from the ad. This covers the company, contact person, department and postal address. A fake or partly fake address, a fake contact, an address in the letter text, and a guessed title are each dropped or rejected.

## What changed because of it

- **Run 1:** PR 4 shipped the structured letter.
- **Run 2 and the orchestrator's follow-up:** the writer now fills the address block from the ad, verbatim only, and saves it to empty session columns so the user can edit it later.
- **Run 2's guessed title:** led to the no-unstated-title rule in the prompt and the validator.

One follow-up remains, outside this PR. The soft gap sentences need a prompt tweak to the `<gaps>` and learning-ability guidance: "keen to build proficiency in Tableau", "Umstieg auf Salesforce", "what I do best".
