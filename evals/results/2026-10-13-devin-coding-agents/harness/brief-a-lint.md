You are working in a git worktree of Useful Apply, a Next.js 16 app (TypeScript, React 19, ESLint flat config in `eslint.config.mjs`). Work only inside the current directory. Do not commit, push, install packages or touch git state; just leave your changes in the working tree.

## Task: make `npm run lint` a real gate again

`npx eslint scripts src` reports 16 errors on this branch, in these files:

- `scripts/compress-blog-images.js`, `scripts/generate-blur-placeholders.js`, `scripts/resize-profile-image.js` (`@typescript-eslint/no-require-imports`)
- `src/app/auth/auth-code-error/page.tsx` (setState called synchronously inside an effect)
- `src/app/not-found.tsx`, `src/components/comparisons/ComparisonUseCases.tsx` (`react/no-unescaped-entities`)
- `src/components/blog/BlogContent.tsx` (`prefer-const`)

Also, a plain `npm run lint` from a checkout lints the gitignored `verify/` folder and the `.claude/worktrees/` copies. Add both to the `globalIgnores` list in `eslint.config.mjs`.

## Rules

- Fix the cause. No `eslint-disable` comments, and don't turn any rule off or down in the config.
- Behaviour stays the same. The three scripts must still run as Node scripts (they're run by hand with `node scripts/<name>.js`), and the auth error page must still show the same content to the user.
- Surgical edits: touch only what the fix needs. Match the existing style. Warnings may stay; fixing an unused variable that sits on the same line as an error is fine.
- Visible text uses straight apostrophes in the source today; render the same characters.

## Done means

- `npx eslint scripts src` reports 0 errors.
- `npx tsc --noEmit` reports 0 errors.
- `node --check` passes on each of the three scripts.

When finished, reply with a short summary: each file changed and why.

## Tools in this environment

Edit files with your edit and write tools (edits inside this directory are pre-approved). Only these shell commands are available, and any other command is refused and ends your session at once, so don't try others: `npx tsc`, `npx eslint`, `npm run lint`, `node --check`, `node --import tsx --test`, `node -v`, `git diff`, `git status`, `git log`, `git show`, `git grep`, `ls`, `cat`, `head`, `tail`, `grep`, `rg`, `wc`, `sed -n`, `echo`, `pwd`, `sort`, `uniq`, `diff`. Pipes between these are fine. No `python`, `node -e`, `find`, `mkdir`, `touch` or package installs.
