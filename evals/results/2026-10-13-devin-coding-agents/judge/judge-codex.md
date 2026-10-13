**Task A**

| Implementation | Score | Defects (severity, file:line) | One-line verdict |
|---|---:|---|---|
| X | 9 | **low**, `scripts/compress-blog-images.js:16`, `scripts/generate-blur-placeholders.js:4`, `scripts/resize-profile-image.js:4`: dependency-load failures now reach `.catch(console.error)` and exit successfully, instead of failing the process. | Preserves CommonJS, but changes failure behaviour and moves more code. |
| Y | 9 | None on Node ≥22.7. | Correct and surgical; directory reconstruction adds some boilerplate. |
| Z | 10 | None on Node ≥22.7. | Smallest clean implementation; `import.meta.dirname` fits the stated runtime. |

**Task B**

Line numbers below refer to each patched file.

| Implementation | Score | Defects (severity, file:line) | One-line verdict |
|---|---:|---|---|
| X | 8 | **low**, `src/lib/agents/prompts/email-subjects.ts:53`: restores the original title when the primary title is empty. **low**, same file `:36`: punctuation removal misses `!`, `?` and closing quotes. | Compact helper with justified separation; good caller coverage and coherent prompts. |
| Y | 7 | **low**, `src/lib/agents/unified-writer-agent.ts:1179`: falls back to cutting inside a word. **low**, `:1228`: restores an empty primary title. **low**, `:1211`: truncates an overlong name without a title instead of applying the specified name-drop step. **low**, `:1160`: misses closing quotes when stripping punctuation. | Broadest implementation, with unnecessary exports and extra truncation behaviour; prompts remain coherent. |
| Z | 9 | **low**, `src/lib/agents/unified-writer-agent.ts:1181`: restores an empty primary title. **low**, `:1160`: misses closing quotes when stripping punctuation. | Best fit: private helpers, focused changes and explicit body-only prompt instructions. |

Concrete missed cases:

- An overlong `(Senior) Software Engineer for International Platform Infrastructure`, with applicant `Ada Lovelace`, has an empty primary title. Step 3a should yield `Application: Ada Lovelace`; all three retain title text.
- German `Softwareentwicklungsinfrastrukturverantwortlicher` exceeds the application budget as one word. Y slices that word; X/Z correctly fall back to `Bewerbung`.
- Cutting `Senior Software "Engineer" <70-letter word>` leaves a closing quote in all three. X also leaves the exclamation mark in `Senior Software Engineer! <70-letter word>`.

**Rankings**

- Task A: **Z > Y > X**
- Task B: **Z > X > Y**
- Overall: **Z > X > Y**

**DISMISSED**

- **Missing `"type"`:** Y/Z run as ESM through syntax detection on Node ≥22.7. Earlier Node 22 releases need the detection flag. X’s dynamic imports preserve CommonJS and `__dirname`. [Node documentation](https://nodejs.org/download/release/v22.23.3/docs/api/packages.html#syntax-detection).
- **`import.meta.dirname`:** available in Node 22; Z’s directory handling is valid. [Node documentation](https://nodejs.org/download/release/v22.23.0/docs/api/esm.html#importmetadirname).
- **Auth and visible text:** derived query values preserve the intended content; `&apos;` renders straight apostrophes. The malformed-percent decoding risk already exists in the base.
- **Cleanup and languages:** all guard the final cleaned length, normalize languages and handle ordinary empty values correctly.
- **Retries and callers:** kit, regenerate and tracker paths share the modified functions. Body-only responses work, model subjects are ignored and returned shapes stay compatible.
- **Tests and scope:** all update the existing test file without adding test files. X’s separate helper is justified by prompt-variant replacement. All remove the subject-generation rules without dangling prompt instructions; stored primary-subject context is explicitly allowed.