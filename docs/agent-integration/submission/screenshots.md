# Screenshot and recording shot list

The seeded applications (Halcyon and Fjordwerk) already have full kits, so shot 3 and the demo use a pasted ad instead. Re-run the seed script after the captures (see `checklist.md`).

Capture these after launch (`MCP_ENABLED=true`, deployed), on the reviewer account, so nothing real shows. Wasim does the captures. They need the live connector in real clients.

Specs:

- **Anthropic:** screenshots are required only for MCP Apps. We don't ship one, so these are optional there. If used: PNG, at least 1,000 px wide, 3 to 5 images, cropped to the response without the prompt in the image, with the prompt text supplied separately. No video or GIF.
- **OpenAI:** `screenshots` is optional, paths relative to the package, PNG/JPEG/WebP/SVG, 5 MiB each. A **demo recording URL is required** for MCP review.
- Use the fictional Jordan Whitfield data only. Don't show a real email, name or balance. Crop out browser chrome, bookmarks and notifications.
- Test desktop and mobile in ChatGPT (OpenAI asks for it). Capture mobile too, even though mobile isn't the product's priority.

## Stills

| # | What to show | Client | Prompt (supply as text) | Save as |
|---|---|---|---|---|
| 1 | Consent page listing Read, Edit and Spend credits | Browser, at the OAuth step | n/a | `01-consent.png` |
| 2 | Fit check result with score, matches and gaps | Claude.ai | "Check my fit for the Halcyon Cloud Labs role." | `02-fit-claude.png` |
| 3 | Full kit generation finished, tool calls visible | Claude.ai | "Here's a job ad: [paste a short fictional ad]. Check my fit, then generate the full kit." | `03-kit-claude.png` |
| 4 | Application list and status update | ChatGPT desktop | "List my applications and mark Fjordwerk as applied." | `04-tracker-chatgpt.png` |
| 5 | CV edit with the returned diff | Claude.ai | "On the Halcyon CV, change my professional title to Staff Software Engineer." | `05-edit-diff-claude.png` |
| 6 | Export with the signed link in the reply | ChatGPT desktop | "Export the Halcyon CV as a PDF." | `06-export-chatgpt.png` |
| 7 | The exported PDF open, text selectable | PDF viewer | n/a | `07-pdf.png` |
| 8 | The German DIN 5008 letter PDF | PDF viewer | n/a | `08-din-letter.png` |
| 9 | The same application in the web dashboard after an assistant edit | Browser, `/dashboard` | n/a | `09-dashboard.png` |
| 10 | Settings, Connected apps with the daily limit and Revoke | Browser | n/a | `10-connected-apps.png` |
| 11 | The same connector in Claude Code (`/plugin` install, then `apply-to-job`) | Claude Code terminal | "/apply-to-job" | `11-claude-code.png` |
| 12 | ChatGPT on a phone: fit check | ChatGPT mobile | "Check my fit for the Halcyon Cloud Labs role." | `12-chatgpt-mobile.png` |

Pick the best 3 to 5 of 2 to 9 for Anthropic's carousel if Wasim wants one.

## Demo recording (OpenAI, required)

One video, 2 to 3 minutes, a URL the reviewer can open (unlisted video link). Show:

1. Connect: add the app in ChatGPT developer mode, OAuth sign-in, consent.
2. A fit check on a pasted ad, with the tool call visible.
3. Generate a kit for a pasted fictional ad and poll it to done. The seeded applications already have kits, so a second kit on them is refused.
4. Edit the CV, show the diff, then undo.
5. Export a PDF and open it.
6. Open `/dashboard` and show the same application.
7. Revoke the connection in Connected apps.

No audio needed unless Wasim wants it. Don't show the password, and don't show real data.

## Already captured

Local seed verification shots (the seeded data rendered in the web app) are in the main checkout under `verify/feature-mcp-distribution-pack/`: `dashboard.png`, `us-cv.png`, `us-cover-letter.png`, `de-cv.png`, `de-cover-letter.png`. They show the web app only, not a client.
