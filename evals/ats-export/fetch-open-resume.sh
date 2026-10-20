#!/usr/bin/env bash
# Fetches the OpenResume PDF parser (xitanggg/open-resume) at a pinned commit
# into evals/ats-export/vendor/open-resume/lib/ so the ATS proxy always runs the
# same code. The vendor folder is gitignored on purpose: OpenResume is AGPL-3.0
# and its source is not committed to this repo. Only this script and the pin are.
# The adapter in lib/openresume.ts is our own code and copies none of it.
# The imports inside the parser say `lib/...`, which tsconfig.json in this
# folder maps to vendor/open-resume/lib/.
set -euo pipefail

SHA="4f8255a2c763479837f69f1dccf2a3338730cd79" # 2024-10-29, main at the time of the eval
RAW="https://raw.githubusercontent.com/xitanggg/open-resume/${SHA}/src/app/lib"
DEST="$(cd "$(dirname "$0")" && pwd)/vendor/open-resume/lib"

mkdir -p "$DEST/parse-resume-from-pdf/extract-resume-from-sections/lib" "$DEST/redux"

fetch() {
  curl -fsSL "${RAW}/$1" -o "$DEST/$1"
}

for f in \
  parse-resume-from-pdf/types.ts \
  parse-resume-from-pdf/group-text-items-into-lines.ts \
  parse-resume-from-pdf/group-lines-into-sections.ts \
  parse-resume-from-pdf/extract-resume-from-sections/index.ts \
  parse-resume-from-pdf/extract-resume-from-sections/extract-profile.ts \
  parse-resume-from-pdf/extract-resume-from-sections/extract-education.ts \
  parse-resume-from-pdf/extract-resume-from-sections/extract-work-experience.ts \
  parse-resume-from-pdf/extract-resume-from-sections/extract-project.ts \
  parse-resume-from-pdf/extract-resume-from-sections/extract-skills.ts \
  parse-resume-from-pdf/extract-resume-from-sections/lib/bullet-points.ts \
  parse-resume-from-pdf/extract-resume-from-sections/lib/common-features.ts \
  parse-resume-from-pdf/extract-resume-from-sections/lib/feature-scoring-system.ts \
  parse-resume-from-pdf/extract-resume-from-sections/lib/get-section-lines.ts \
  parse-resume-from-pdf/extract-resume-from-sections/lib/subsections.ts \
  redux/types.ts \
  deep-clone.ts; do
  fetch "$f"
done

# The parser imports one constant from the redux slice, which would pull in
# redux toolkit. This shim stands in for it with a list of six empty featured
# skills, the shape the parser expects.
cat > "$DEST/redux/resumeSlice.ts" <<'SHIM'
export const initialFeaturedSkills = Array.from({ length: 6 }, () => ({ skill: "", rating: 4 }));
SHIM

echo "$SHA" > "$DEST/../PINNED_COMMIT"
echo "OpenResume parser fetched at $SHA"
