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
| 4 | 4 (the 2 address cases, syn-07, new sl-fr-contact) plus 52 offline checks | `.../recipient-rerun-3/`, `offline-checks.json` | PR review round 1: address as one anchored block, salutation rules in all seven languages, optional fields degrade instead of failing, JD change clears the saved recipient |
| round 2 | no live run (code only); 122 offline checks, including a replay of run 4's 4 answers | `offline-checks.json` | PR review round 2: US 4-5 digit house numbers, more address formats, submission phrases, workplace exclusions, contact placement, sign-off check, US state list, full contract guard, shared trim rule |

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

**Doctored answers (as run in run 3; superseded by run 4's offline checks).** These ran through the writer's real post-model path (`coverLetterFromModelOutput`), with no model call. The script took the real raw answer and changed one field. In run 4 a guessed title degrades to the neutral form instead of raising a validation error.

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

## Run 4: PR review round 1

The PR review (Sonnet and Codex at high) probed the run 3 code and found holes. The validator checked address lines one at a time, so it accepted `["Alexanderplatz 1", "80331 München"]` (two offices spliced together), a street with no house number, and a bare phone line. It also accepted the accommodation-notice address in syn-07's Cloudflare ad ("101 Townsend St. San Francisco, CA 94107"). Run 1's claim that the five unaddressed ads "state no address" was wrong for syn-07: it states one, inside equal-opportunity and accommodation boilerplate, which is not where applications go.

**Code changes** (`src/lib/agents/cover-letter-guards.ts`, new):
- **Address:**
  - The block needs a street line with a house number, then a postcode-plus-city line: a 4 or 5 digit postcode with the city, or "City, ST 12345". At most one unit line between them and one country line after.
  - Phone, fax, email, web and digits-only lines are set aside.
  - The lines must appear in the ad as one contiguous block, in order, separated only by whitespace, commas or line breaks.
  - The block must sit within 250 characters after the company name, the contact person or application wording ("Bewerbung", "Anschrift", "apply", "send your application", "mail to", "address"...). It must not sit inside accommodation, equal-opportunity, privacy or legal boilerplate.
  - Matching ignores case, whitespace, ß/ss and dash style. The stored text is always the ad's own spelling and casing, with dashes as hyphens.
- **Salutation, in all seven languages:**
  - Every name in it must belong to the one addressee: the saved contact, else the ad's verified contact.
  - A gendered title (Frau/Herr, Ms./Mr., Madame/Monsieur/Mme/M., Sra./Sr./Señora/Señor, Signora/Signor/Sig.ra/Sig., mevrouw/heer/mevr./dhr.) or a gendered adjective (geehrte/geehrter, Liebe/Lieber, Estimada/Estimado, Querida/Querido, Cara/Caro, Prezada/Prezado, Exma./Exmo., Egregia/Egregio, Chère/Cher; Gentile is neutral) needs a source that writes a title of that gender directly before that same person's name.
  - Otherwise it falls back to a neutral full-name form ("Dear Jordan Hoffmann,", "Guten Tag Jordan Hoffmann,", "Bonjour ...", "Buenos días ...", "Bom dia ...", "Gentile ...", "Geachte ..."). With no addressee it falls back to the generic greeting.
  - English and German salutations get their comma.
- **Degrade, don't fail:** a salutation, subject or closing that breaks a rule is replaced by a fixed form, and an unverified recipient detail is dropped. Only real JSON or shape failures, paragraph problems (stock phrases, placeholders, an address, a repeated greeting or signature) and an empty letter take the one retry.
- **Subject:** a number of 3 or more digits must appear in the ad as a whole number. A bracketed phrase is allowed when the ad or job title writes it. German subjects must start with "Bewerbung".
- **Closing:** the signature name is stripped from the closing.
- **Company name:** the parsed `job.companyName` reaches the letter only when the ad contains it.
- **Market:** a DACH city counts only with a DACH country or a German-language ad, never with a US state code ("Vienna, VA").
- **Saved recipient:** passed into the prompt so the salutation and the address block agree.
- **Persistence and state:**
  - Changing `job_description` through any write path clears `company_address` and `company_contact_person` in the same SQL statement.
  - The browser sync no longer writes those two columns.
  - The fill-only save is one conditional `UPDATE ... WHERE (col IS NULL OR trim(col) = '') AND trim(job_description) = <the letter's JD>` per column. Since round 2, both trims strip only space, tab, LF and CR, the same set on the JS side (`src/db/trim-text.ts`).
- **Contract guard:** in round 1, `isStructuredCoverLetter` checked the core fields only. Round 2 replaced it with a guard that checks every field (see below).

### Offline checks (code-fixed, no model, no API key)

`npx tsx evals/structured-cover-letter-offline.ts` loads run 3's committed answers and analysis context (`recipient-rerun-2/letters/`) and the committed ads. It changes one thing per check and writes `offline-checks.json`. **52 of 52 passed at run 4** (122 after round 2, see below). They include:

- **Address:**
  - the splice of two offices;
  - a street without a house number;
  - a phone-only address and a phone line in the middle;
  - an email line;
  - a digitless address;
  - ß written as ss (the result keeps "Industriestraße");
  - all-caps input (the result keeps the ad's casing);
  - a fake and a partly fake address;
  - a saved address beating the ad;
  - an address inside a paragraph (validation error);
  - the Cloudflare accommodation address (dropped);
  - the Northwind and Lyon application addresses (kept).
- **Salutation:**
  - a cross-person title, where "Herr Müller und Frau Hoffmann" doesn't license "Herr Hoffmann";
  - a first name from one person with another's surname;
  - "geehrter" with no stated title;
  - the saved contact as addressee;
  - "Dear Ms. Whitfield" becoming "Dear Dana Whitfield,";
  - a missing comma;
  - a "[Name]" placeholder;
  - a title with nobody named;
  - French ("Madame Dubois," and "Chère Madame Dubois," kept; "Monsieur Dubois," and "Cher Claire Dubois," fall back);
  - Spanish ("Estimada Sra. García" with no stated title falls back);
  - Dutch ("Geachte mevrouw De Vries," kept);
  - Italian ("Gentile Signora Rossi" with no stated title falls back).
- **Subject and closing:** a fake reference number; the ad's own reference; two-digit numbers ignored; a bracket from the job title; a "[Job Title]" placeholder; a German subject without "Bewerbung"; a closing that carries the name.
- **Market:** "Vienna, VA", "Berlin, MA", "Geneva, IL 60134" and a bare "Berlin" on an English ad are `us`. "Berlin, Germany", "Wien" on a German ad and "Zürich, Schweiz" are `dach`.
- **Contract guard:** accepts the real output and rejects a shallow object.

### Live run 4 (model)

Command:

```bash
npx tsx evals/structured-cover-letter.ts --allow-anthropic-api --cases sl-de-contact,sl-us-address,sl-fr-contact,syn-07 --out-sub recipient-rerun-3
```

The live script now requires `--out-sub` and refuses a folder that already holds a run, so no run can overwrite another.

**New case:** `sl-fr-contact`, a constructed French ad for a fictional Lumière Logistique SAS in Lyon. It has "Mme Claire Dubois, Responsable du recrutement", a postal address, a reference number and Tableau as bait. The CV is the financial analyst.

| Case | Checks | Letter calls | Recipient block | Salutation | Subject |
|---|---|---|---|---|---|
| sl-de-contact | 14/14 | 1 | Brenner Getriebe GmbH / Personalabteilung / Frau Melanie Brandl / Industriestraße 14 / 90431 Nürnberg | Sehr geehrte Frau Brandl, | Bewerbung als Key Account Manager (m/w/d) Antriebstechnik, Kennziffer KAM-2026-17 |
| sl-us-address | 14/14 | 1 | Dana Whitfield / Talent Acquisition / Northwind Freight Inc. / 220 West Lake Street, Suite 1400 / Chicago, IL 60606 | Dear Dana Whitfield, | Application for Senior FP&A Analyst, Req #NW-4471 |
| sl-fr-contact | 14/14 | 1 | Mme Claire Dubois / Responsable du recrutement / Lumière Logistique SAS / 12 rue de la République / 69002 Lyon | Madame Dubois, | Candidature au poste d'Analyste FP&A (H/F), réf. FPA-2026-031 |
| syn-07 | 14/14 | 1 | Cloudflare (no address) | Dear Hiring Team, | Application for Senior Software Engineer - Egress (Go/Rust) |

- **Fallbacks:** no field fell back in any of the four. The model's own salutations, subjects and closings passed every rule.
- **syn-07:** the model didn't copy the accommodation address. Had it done so, the code would have dropped it (offline check `boilerplate_accommodation_address_dropped`).
- **French letter:** market `us` (a non-DACH country gets the US block layout), closing "Cordialement,", date "20 octobre 2026".
- **Facts:** I checked both new letters against the CV.
  - French letter: 9 to 6 working days, 5 years, 85 million USD, 88 % to 96 %, the Redfern annual budget, Power BI on SAP data for plant managers, native English. It doesn't claim Tableau.
  - syn-07 now says "My background is in Kotlin, Java and Python rather than Go or Rust". That isn't a claim, but it names the gap, the same soft `<gaps>` pattern noted in run 1.
- **Cost:** $0.2615 for 20 calls (letter calls $0.0735).

### Which checks the code guarantees and which depend on the model

| Check | Kind | Why |
|---|---|---|
| contract_valid, body_faithful, sender_from_cv | code-fixed | built in code from validated fields and CV literals |
| no_dashes (body) | code-fixed | sanitized in code; the raw count shows what the model did |
| market_rules: German closing, market | code-fixed | set in code |
| market_rules: subject prefix, English and French closing | code-backed | the model writes them; a broken value falls back to a fixed form |
| subject_numbers_from_ad, no_placeholders | code-fixed | a miss falls back (subject) or fails the paragraphs (one retry, then the letter fails) |
| recipient_address_rule: no invented line | code-fixed | only an anchored verbatim block survives |
| recipient_address_rule: block filled when the ad has one | model-dependent | the model has to copy it; the code never fills it on its own |
| contact_rule: no invented contact or title | code-fixed | |
| contact_rule: contact found | model-dependent | |
| no_address_in_letter_text | code-fixed for extracted and saved addresses, model-dependent otherwise | |
| numbers_traced, no_missing_skill_named, three_paragraphs, under_250_words | model-dependent | measured, not enforced; length never fails a letter by design |

## Review round 2 (code only, no model run)

The second review (Sonnet, Codex and Opus at high) found one high and fifteen lows. All were fixed in code. The prompt is unchanged, so no live rerun was needed. Instead, the offline suite **replays run 4's four real model answers through the new code**, and all four letters come out identical to what run 4 saved.

**What changed:**
- **Address formats:**
  - A postcode line must end in a city and never in a street suffix, so "1234 Market Street" and "10000 North Central Expressway" are streets again. They were dropped as postcode lines before.
  - Newly accepted:
    - "Postfach 12 34 56" and "PO Box 12345";
    - Canadian ("Toronto, ON M5X 1A9"), UK ("London SW1A 2AA") and Portuguese ("1100-053 Lisboa") postcodes;
    - "Chicago IL 60606" and "Chicago, Illinois 60606";
    - " | ", " · ", " - " and ";" separators, and markdown;
    - "Haus 3" and "c/o" lines.
  - Lines are capped at 100 characters.
- **Placement:**
  - An explicit submission phrase within 80 characters before the address wins, even inside boilerplate. Examples: "send your application to", "Bewerbungen richten Sie an", "Ihre Unterlagen an", "adresser votre candidature ... à".
  - Boilerplate is checked before the block only.
  - Bare "Bewerbung" is no longer an anchor. "Contact:", "Our office" and "Headquarters" are.
  - A workplace label ("Einsatzort", "Arbeitsort", "work location", "job site", "on site at") rejects the address.
- **Contact placement:** the contact person passes the same placement test, and an imprint or legal name never qualifies ("Geschäftsführer", "Vorstand", "CEO", "Managing Director"...).
- **Fallbacks:**
  - A wrong-gender title for a contact whose title the ad states is corrected to that title ("Sehr geehrte Frau Hoffmann,", "Madame Dubois,").
  - A one-word contact gets the generic greeting.
  - A closing that carried the name keeps only a known closing, otherwise the language default.
  - A missing subject degrades to "Application for <title>" and its equivalents.
  - A subject reference the ad doesn't state is cut at its comma, or the subject is rebuilt from the title.
- **Sign-off check:** only a paragraph's last line, or the text after its last sentence end, that is the closing, the name or both fails. "…I will do my best." with "Best," passes.
- **Address in the letter text:** the street part on its own also counts, and saved lines under 8 characters ("Floor 5") are ignored.
- **Market:** a two-letter code counts as a US state only from the real list (50 states, DC, territories). "Berlin, DE", "Wien, AT", "Zürich, CH" and "Bern, BE" are `dach`, "Dover, DE" is `us`.
- **State:**
  - One trim rule (space, tab, LF, CR) on the JS and SQL sides.
  - Whitespace-only columns count as empty.
  - An explicit `undefined` no longer opts out of the JD-change reset.
  - The browser server action strips both recipient columns.
- **Contract guard:** `isStructuredCoverLetter` now checks every field, required and optional (the text the renderer worker shares). The live eval's `contractIssues` lists the same rules by name and flags any disagreement with the guard. The ISO date and empty-line checks are a separate `fields_well_formed` check.

**Offline suite:** 122 of 122 pass (`offline-checks.json`). That's the 52 from run 4 (5 of them updated for the titled-correction fallback), 66 round 2 checks (at least one per item) and the 4-letter replay. The trim and empty-column checks (items 13 and 14) run the generated SQL in real `sqlite3`:
- a JD with a leading NBSP and BOM keeps its columns;
- a changed JD clears them;
- a whitespace-only column is filled.

### Cost

Prices come from `evals/lib/pricing.ts`, the Sonnet 5.5 list rates: $2 per million input tokens, $10 per million output, cache write $2.50 (1.25x input), cache read $0.10 (0.05x input).

| Run | Calls | Cost |
|---|---|---|
| 1 | 30 | $0.4315 |
| 2 | 10 | $0.1246 |
| 3 | 10 | $0.1389 |
| 4 | 20 | $0.2615 |
| Round 2 | 0 | $0 |
| **Total** | **70** | **$0.9565** |

### Remaining address false-rejection modes

All of these leave the address field empty. None of them puts a wrong address in it.

- **Street lines without a recognised shape:**
  - a 4-5 digit number before a name with no street suffix ("1234 Market"), which reads as a postcode line;
  - a street with no house number ("Am Markt");
  - extra words after the number ("Hauptstraße 5 Hinterhaus").
- **Postcodes not covered:** Swedish ("123 45 Stockholm"), Polish ("00-950 Warszawa"), Irish Eircodes, and a US state on its own line.
- **One-line addresses with no comma or separator** between street and city, such as "Hauptstraße 5 10115 Berlin", or a country in the same model line as the city.
- **Placement misses:**
  - an address more than 250 characters after the last anchor;
  - an address anchored only by wording outside the vocabulary;
  - an address within 300 characters after boilerplate words with no submission phrase within 80 characters;
  - an address within 120 characters after a workplace label.
- **Size:** more than five lines, or a line over 100 characters.
- **The model doesn't copy the address.** This one is model-dependent.

### What `sanitizeAdText` does to copied details

The job description reaches the model through `sanitizeAdText` (`src/lib/agents/chat-tools/untrusted.ts`), and some of what the model copies comes from that version:
- `<` and `>` become `‹` and `›`;
- runs of `===` become `==`;
- the writer's own prompt labels are lowercased;
- control characters become spaces.

Every recipient detail is matched against the raw ad, so a detail that differs only by these characters doesn't match and is dropped. The field comes back empty, never altered. Whitespace and case differences are already tolerated by the matcher.

## Limits

- One run per case: six cases in run 1, two in runs 2 and 3, four in run 4. This shows the contract path works and the rules hold. It doesn't measure rates.
- syn-01, syn-11, syn-15 and syn-16 weren't rerun on the final prompt, to keep spend small. Their ads name no contact and give no application address. The run 4 changes touch the recipient field, the salutation rules and the fallbacks, all covered by the offline checks.
- **Correction to runs 1 to 3:** syn-07's ad does contain a postal address, inside its accommodation notice. Run 1's empty block for it was the model's choice. Since run 4 the code also drops it.
- **D1 writes not run against D1:** the JD-change clear in `updateSession` and the fill-only `saveLetterRecipientFromAd`. Their SQL was generated with drizzle and run in `sqlite3` (D1 is SQLite):
  - a changed JD clears the columns;
  - an unchanged JD (whitespace aside) keeps them;
  - the fill writes only an empty column, on a row that still holds the letter's JD.
- `numbers_traced` matches substrings. For example, "18" in "18 Ländern" also matches "2018" in the CV. Every number was therefore also checked by hand.
- Quality (voice, specificity) wasn't judged. The prompt's voice, content and anti-hallucination blocks are unchanged. Only the structure, the output format and the recipient, salutation, subject and closing rules changed.
- The Bedrock fallback (`AI_PROVIDER=bedrock`, Sonnet 4.6) wasn't run. The JSON path uses the same `jsonMode` system suffix and the same `parseStrictJsonObject` parser that the email writers already run on Bedrock.

## Conclusion

The structured contract works on the production model with no retries:
- 6 of 6 letters valid against the contract;
- 0 invented recipient addresses;
- 0 dashes;
- all under 250 words;
- correct DACH and US subject and closing conventions;
- each body an exact rendering of its structure.

A recipient detail reaches the letter only from the session row or from the ad's own text. This covers the company, contact person, department and postal address. The address must be one anchored, well-formed block, not boilerplate. A fake, partly fake, spliced, numberless or boilerplate address is dropped. So are a fake contact, a guessed or cross-person title, and a name from a second person. An address in the paragraphs fails the letter's validation. Optional fields degrade to fixed forms instead of costing the letter. Run 4: 4 of 4 live letters pass 14 of 14 with no retries and no fallbacks, and after review round 2, 122 of 122 offline checks pass, including a replay of run 4's answers through the final code (identical letters).

## What changed because of it

- **Run 1:** PR 4 shipped the structured letter.
- **Run 2 and the orchestrator's follow-up:** the writer now fills the address block from the ad, verbatim only, and saves it to empty session columns so the user can edit it later.
- **Run 2's guessed title:** led to the no-unstated-title rule in the prompt and the validator.
- **The review probes and run 4:** led to the block-and-anchor address rule, the seven-language salutation rule, degrade-not-fail, the JD-change clear, the server-only recipient columns and the atomic fill.
- **Review round 2:** led to the US house-number fix, the wider address formats, submission phrases and workplace exclusions, contact placement, titled corrections, the last-line sign-off rule, the real US state list, the full contract guard and the shared trim rule.

One follow-up remains, outside this PR. The soft gap sentences need a prompt tweak to the `<gaps>` and learning-ability guidance: "keen to build proficiency in Tableau", "Umstieg auf Salesforce", "what I do best".
