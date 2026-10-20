#!/usr/bin/env python3
"""
Mutation check for the sync fuzz test: break src/lib/session-sync-engine.ts in one place at a time and
confirm the fuzz test notices. Each mutation is a (find, replace) pair applied to a copy of the engine;
the original is put back after every run, also on error.

    python3 e2e/tools/sync-fuzz/mutations.py [name-prefix ...]

Prints one line per mutation: how many of 400 seeds fail (and the deterministic cases that fail).
A mutation that no seed catches is reported as SURVIVED. Writes nothing else.
"""
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
ENGINE = os.path.join(ROOT, 'src', 'lib', 'session-sync-engine.ts')

MUTATIONS = {
    'M1 accept rows that are not newer than the baseline': (
        "if (base && !options.force && (incoming < base.revision || (incoming === base.revision && !explicitLoad))) {",
        "if (false) {",
    ),
    'M2 a conflict drops the user text (no buffer entry)': (
        "      conflicts.push(makeEntry(group, local, merged));",
        "      void makeEntry;",
    ),
    'M3 a conflict keeps the local value (the server change is lost)': (
        "      conflicts.push(makeEntry(group, local, merged));",
        "      for (const prop of group.props) (merged as unknown as Record<string, unknown>)[prop] = local[prop];\n      conflicts.push(makeEntry(group, local, merged));",
    ),
    'M4 polling skips while there is an unsaved change': (
        "    if (!remote || remote.revision <= base.revision) return 'unchanged';",
        "    if (!remote || remote.revision <= base.revision || dirtyColumns(findSession(sessionId)!, base).length > 0) return 'unchanged';",
    ),
    'M5 the baseline revision jumps past the saved one': (
        "baselines.set(sessionId, { revision: result.revision, fields });",
        "baselines.set(sessionId, { revision: result.revision + 1, fields });",
    ),
    'M6 polling ignores revisions more than two ahead while dirty': (
        "    if (!remote || remote.revision <= base.revision) return 'unchanged';",
        "    if (!remote || remote.revision <= base.revision) return 'unchanged';\n    if (dirtyColumns(findSession(sessionId)!, base).length > 0 && remote.revision > base.revision + 2) return 'unchanged';",
    ),
    'M7 an editor is told saved without checking the draft': (
        "        if (exact) return outcome === 'clean' ? 'clean' : 'saved';",
        "        if (exact || outcome === 'saved') return 'saved';",
    ),
    'M8 refused values are never forgotten after a merge': (
        "        if (finalFp[column] === undefined || finalFp[column] === nextBaseline.fields[column] || finalFp[column] !== refused[column]) {",
        "        if (false) {",
    ),
    'M9 Restore acts on every buffered entry, not the notice\'s': (
        "      const entries = entriesFor(sessionId, ids);\n      const session = findSession(sessionId);\n      if (entries.length === 0 || !session) return 'skipped';\n      const server",
        "      const entries = getConflictBuffer(sessionId);\n      const session = findSession(sessionId);\n      if (entries.length === 0 || !session) return 'skipped';\n      const server",
    ),
    'M10 a save settles every buffer entry of its columns': (
        "      if (entry.changed.every((prop) => sameValue(saved[prop], entry.props[prop]))) buffer.delete(entry.id);",
        "      buffer.delete(entry.id);",
    ),
    'M11 the editor closes over text typed during its save': (
        "  return editorSaveSucceeded(outcome) && sentDraft === currentDraft;",
        "  return editorSaveSucceeded(outcome);",
    ),
    'M12 Restore overwrites text the user typed since': (
        "          if (userEdited(sessionId, session, prop)) { blocked = true; continue; }  // newer typing stands; the entry stays",
        "",
    ),
    'M13 Copy offers every buffered entry': (
        "    return entriesFor(sessionId, ids)\n      .map((entry) => {",
        "    return getConflictBuffer(sessionId)\n      .map((entry) => {",
    ),
}


def run_fuzz() -> str:
    out = subprocess.run(
        ['npx', 'tsx', '--tsconfig', 'e2e/tools/tsconfig.sync-fuzz.json', 'e2e/tools/sync-fuzz.ts', '--engine', 'new', '--seeds', '400'],
        cwd=ROOT, capture_output=True, text=True,
    )
    lines = [line for line in out.stdout.splitlines() if line.startswith('failing seeds') or line.startswith('FAIL')]
    failing_cases = [line[6:60] for line in lines if line.startswith('FAIL')]
    summary = next((line for line in lines if line.startswith('failing seeds')), 'no summary: ' + out.stderr[-200:])
    return summary + ('  cases: ' + '; '.join(failing_cases) if failing_cases else '')


def main() -> int:
    wanted = sys.argv[1:]
    backup = os.path.join(tempfile.mkdtemp(), 'engine.orig.ts')
    shutil.copy(ENGINE, backup)
    original = open(backup).read()
    survived = 0
    try:
        for name, (old, new) in MUTATIONS.items():
            if wanted and not any(name.startswith(prefix) for prefix in wanted):
                continue
            if old not in original:
                print(f'{name}: PATTERN NOT FOUND (the engine changed; update this script)')
                survived += 1
                continue
            with open(ENGINE, 'w') as handle:
                handle.write(original.replace(old, new, 1))
            result = run_fuzz()
            caught = not result.startswith('failing seeds: 0') or 'cases:' in result
            if not caught:
                survived += 1
            print(f"{name} -> {result if caught else 'SURVIVED  ' + result}")
    finally:
        shutil.copy(backup, ENGINE)
    return 1 if survived else 0


if __name__ == '__main__':
    sys.exit(main())
