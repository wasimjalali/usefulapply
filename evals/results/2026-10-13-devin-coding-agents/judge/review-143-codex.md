- { finding: "Unspaced en/em dashes don't delimit the primary title. For title `Senior Software Engineer\\u2014Platform Infrastructure` and name `Ada Lovelace`, the result is `Application: Senior Software Engineer, Platform`. The specified primary-title fallback should produce `Application: Senior Software Engineer, Ada Lovelace`. Reproduced for both dash types. Match en/em dashes without requiring surrounding spaces and add regression cases.", severity: "low", file: "src/lib/agents/unified-writer-agent.ts", line: 1161 }

**DISMISSED**

- **HTML/header injection:** Subjects render as escaped React text or plain-text exports. Whitespace collapse removes CR/LF. No generated-subject path to an HTML or outgoing email header was found.
- **Prompt injection:** The generated application subject passes through `sanitizeAdText` before entering the follow-up prompt. Direct applicant-name interpolation predates this change.
- **Cap and cleanup:** Each candidate is measured after typo and dash cleanup. Primary-title selection, name removal and word truncation otherwise follow the requested order. Returned subjects stay within 60 characters.
- **Missing fields:** Empty and whitespace-only titles/names produce the documented fallbacks. Unknown languages normalize to English.
- **Legacy model subjects:** Replies containing `subject` remain accepted. Its value and type don't affect the generated subject.
- **Multiple JSON objects:** The last object with a substantive body wins. Later malformed or partial corrections trigger retry, while placeholder-only template echoes remain ignored. Follow-up delay validation still applies.
- **Retry:** One bounded correction retains factuality rules, token accounting and generation linkage. The code-built subject remains consistent.
- **Callers:** Kit generation, regenerate and tracker still receive the required `{ subject, body }` contract.
- **Prompts:** Body-only output instructions are coherent. Anti-hallucination and rewrite guards remain intact. Follow-up `recommendedDelay` remains intentional metadata.
- **Tests:** Updated assertions match the new behavior. The kit harness deliberately mocks follow-up generation; separate cases exercise its real helper. The delimiter case above lacks coverage.

No files changed. Previously completed checks weren't repeated.