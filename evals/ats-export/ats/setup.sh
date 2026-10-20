#!/usr/bin/env bash
# Sets up the local ATS proxies, once per machine:
#   - a Python venv (evals/ats-export/.venv) with PyMuPDF and pdfminer.six at pinned versions
#   - Apache Tika's tika-app jar at a pinned version, checked against a pinned SHA-512
#     (vendor/tika/, gitignored), run with a JDK 17 or newer
# CV text never leaves this machine: every extractor runs locally. (The AI parser stand-in is
# the one exception and sends text to our own Workers AI binding, see ai-parser.ts.)
#
#   bash evals/ats-export/ats/setup.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

TIKA_VERSION="3.3.3"
TIKA_SHA512="3c6e62e864e32af234832ec6d928bbc58692d3ddd60564cd8c80dee7e161653d6efcba373b6cc9468c778010bea92bdee5ca75ab24f01923480bec1b29b573fd"
TIKA_URL="https://archive.apache.org/dist/tika/${TIKA_VERSION}/tika-app-${TIKA_VERSION}.jar"
TIKA_DIR="$ROOT/vendor/tika"
TIKA_JAR="$TIKA_DIR/tika-app-${TIKA_VERSION}.jar"

# 1. Python extractors.
if [ ! -x "$ROOT/.venv/bin/python" ]; then
  python3 -m venv "$ROOT/.venv"
fi
"$ROOT/.venv/bin/pip" install --quiet --disable-pip-version-check -r "$HERE/requirements.txt"
"$ROOT/.venv/bin/python" -c "import fitz, pdfminer; print('PyMuPDF', fitz.VersionBind, '| pdfminer.six', pdfminer.__version__)"

# 2. Tika, verified.
mkdir -p "$TIKA_DIR"
if [ ! -f "$TIKA_JAR" ]; then
  curl -fsSL "$TIKA_URL" -o "$TIKA_JAR.part"
  echo "${TIKA_SHA512}  $TIKA_JAR.part" | shasum -a 512 -c - >/dev/null || {
    echo "Tika checksum mismatch, removing the download" >&2
    rm -f "$TIKA_JAR.part"
    exit 1
  }
  mv "$TIKA_JAR.part" "$TIKA_JAR"
fi
echo "Tika ${TIKA_VERSION} jar verified"

# 3. A JDK for Tika. JAVA_BIN overrides; otherwise java on PATH, then Homebrew's openjdk.
java_bin() {
  if [ -n "${JAVA_BIN:-}" ]; then echo "$JAVA_BIN"; return; fi
  if command -v java >/dev/null 2>&1 && java -version >/dev/null 2>&1; then command -v java; return; fi
  for candidate in /opt/homebrew/opt/openjdk@21/bin/java /opt/homebrew/opt/openjdk/bin/java /usr/local/opt/openjdk/bin/java; do
    if [ -x "$candidate" ]; then echo "$candidate"; return; fi
  done
  echo "No JDK found. Install one (brew install openjdk@21) or set JAVA_BIN." >&2
  exit 1
}
"$(java_bin)" -version 2>&1 | head -1
