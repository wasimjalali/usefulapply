#!/usr/bin/env python3
"""
Mutation check for the sync fuzz test: break src/lib/session-sync-engine.ts in one place at a time and
confirm the fuzz test notices. Each mutation is a (find, replace) pair, or a list of pairs, applied to a copy of the engine;
the original is put back after every run, also on error.

    python3 e2e/tools/sync-fuzz/mutations.py [name-prefix ...]      # MUTATION_SEEDS=4000 to run more seeds per mutation

Prints one line per mutation: how many of the seeds (400 by default) fail (and the deterministic cases that fail).
A mutation that no seed catches is reported as SURVIVED. Writes nothing else.

    python3 e2e/tools/sync-fuzz/mutations.py --apply <name-prefix> -- <command ...>

Applies that one mutation, runs the command from the repo root with SYNC_FUZZ_MUTATION set to the mutation's
name (sync-fuzz.ts prints it and writes it into its --out file), then puts the engine back. per-bug.sh uses this
for its "before" runs, so a before file says which mutation made it.
"""
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
ENGINE = os.path.join(ROOT, 'src', 'lib', 'session-sync-engine.ts')

MUTATIONS = {
    'M-discard-rebase Discard acknowledges like Restore and Copy (the open editor keeps the discarded draft)': (
        "    acknowledgeConflict(sessionId, entries, true);",
        "    acknowledgeConflict(sessionId, entries);",
    ),
    'M-discard-scope Discard and every other acknowledgement reach every editor (PR #159 at f7c359a6, finding 1)': (
        "entries.map((entry) => ({ group: entry.key, editor: entry.editor }))",
        "FIELD_GROUPS.map((group) => ({ group: group.key }))",
    ),
    'M-discard-inflight a save that was running when its draft was discarded reopens the draft, and a draft that lost its EditorStart is saved unchecked (finding 2: no discard epoch, no stale start)': [
        (
            "  if (editorSaveSucceeded(outcome) || epochAtSave !== epochNow) return { reopen: false };",
            "  if (editorSaveSucceeded(outcome)) return { reopen: false };",
        ),
        (
            "  return { reopen: true, start: start ?? staleEditorStart() };",
            "  return { reopen: true, start: start as EditorStart };",
        ),
    ],
    'M-pr159 findings 1 and 2 together: what f7c359a6 did with the discard (all editors notified, no epoch, no stale start)': [
        (
            "entries.map((entry) => ({ group: entry.key, editor: entry.editor }))",
            "FIELD_GROUPS.map((group) => ({ group: group.key }))",
        ),
        (
            "  if (editorSaveSucceeded(outcome) || epochAtSave !== epochNow) return { reopen: false };",
            "  if (editorSaveSucceeded(outcome)) return { reopen: false };",
        ),
        (
            "  return { reopen: true, start: start ?? staleEditorStart() };",
            "  return { reopen: true, start: start as EditorStart };",
        ),
    ],
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
        "        const blocked = entry.changed.some((prop) => userEdited(sessionId, session, prop)\n          || (server !== undefined && !sameValue(server[prop], entry.base[prop])));",
        "        const blocked = entry.changed.some((prop) => (server !== undefined && !sameValue(server[prop], entry.base[prop])));",
    ),
    'M13 Copy offers every buffered entry': (
        "    return entriesFor(sessionId, ids)\n      .map((entry) => {",
        "    return getConflictBuffer(sessionId)\n      .map((entry) => {",
    ),
    'M14 Restore applies the unblocked properties of a blocked entry': [
        (
            "        const blocked = entry.changed.some((prop) => userEdited(sessionId, session, prop)\n          || (server !== undefined && !sameValue(server[prop], entry.base[prop])));",
            "        const blocked = false;",
        ),
        (
            "        for (const prop of entry.changed) (next as unknown as Record<string, unknown>)[prop] = entry.props[prop];\n        buffer?.delete(entry.id);",
            "        for (const prop of entry.changed) if (!userEdited(sessionId, session, prop)) (next as unknown as Record<string, unknown>)[prop] = entry.props[prop];\n        buffer?.delete(entry.id);",
        ),
    ],
    'M15 a full buffer forgets its oldest entry even if unsettled': [
        ("  const SOFT_BUFFER_LIMIT = 40;", "  const SOFT_BUFFER_LIMIT = 3;"),
        (
            "      if (candidate.id !== entry.id && entrySettled(sessionId, candidate)) buffer.delete(candidate.id);",
            "      if (candidate.id !== entry.id) buffer.delete(candidate.id);",
        ),
    ],
    'M17 Restore ignores that the server changed the field again since the notice': (
        "        const blocked = entry.changed.some((prop) => userEdited(sessionId, session, prop)\n          || (server !== undefined && !sameValue(server[prop], entry.base[prop])));",
        "        const blocked = entry.changed.some((prop) => userEdited(sessionId, session, prop));",
    ),
    'M18 a rebased editor forgets which columns its draft sets': (
        "lineage: previous?.lineage ?? { columns: new Set<string>() } };",
        "lineage: { columns: new Set<string>() } };",
    ),
    'M16 Copy with nothing left copies an empty string': (
        "    if (text.trim() === '') return null;",
        "    if (false) return null;",
    ),
}


def run_fuzz() -> str:
    out = subprocess.run(
        ['npx', 'tsx', '--tsconfig', 'e2e/tools/tsconfig.sync-fuzz.json', 'e2e/tools/sync-fuzz.ts', '--engine', 'new', '--seeds', os.environ.get('MUTATION_SEEDS', '400')],
        cwd=ROOT, capture_output=True, text=True,
    )
    lines = [line for line in out.stdout.splitlines() if line.startswith('failing seeds') or line.startswith('FAIL')]
    failing_cases = [line[6:60] for line in lines if line.startswith('FAIL')]
    summary = next((line for line in lines if line.startswith('failing seeds')), 'no summary: ' + out.stderr[-200:])
    return summary + ('  cases: ' + '; '.join(failing_cases) if failing_cases else '')


def apply_and_run(prefix: str, command: list) -> int:
    matches = [name for name in MUTATIONS if name.startswith(prefix)]
    if len(matches) != 1:
        print(f'--apply {prefix!r} matches {len(matches)} mutations; give a name prefix that matches exactly one', file=sys.stderr)
        return 2
    name = matches[0]
    change = MUTATIONS[name]
    pairs = change if isinstance(change, list) else [change]
    backup = os.path.join(tempfile.mkdtemp(), 'engine.orig.ts')
    shutil.copy(ENGINE, backup)
    original = open(backup).read()
    missing = [old for old, _ in pairs if old not in original]
    if missing:
        print(f'{name}: PATTERN NOT FOUND (the engine changed; update this script)', file=sys.stderr)
        return 2
    mutated = original
    for old, new in pairs:
        mutated = mutated.replace(old, new, 1)
    try:
        with open(ENGINE, 'w') as handle:
            handle.write(mutated)
        print(f'mutation applied: {name}', file=sys.stderr)
        return subprocess.run(command, cwd=ROOT, env={**os.environ, 'SYNC_FUZZ_MUTATION': name}).returncode
    finally:
        shutil.copy(backup, ENGINE)


def main() -> int:
    args = sys.argv[1:]
    if args and args[0] == '--apply':
        if len(args) < 4 or args[2] != '--':
            print('usage: mutations.py --apply <name-prefix> -- <command ...>', file=sys.stderr)
            return 2
        return apply_and_run(args[1], args[3:])
    wanted = args
    backup = os.path.join(tempfile.mkdtemp(), 'engine.orig.ts')
    shutil.copy(ENGINE, backup)
    original = open(backup).read()
    survived = 0
    try:
        for name, change in MUTATIONS.items():
            if wanted and not any(name.startswith(prefix) for prefix in wanted):
                continue
            pairs = change if isinstance(change, list) else [change]
            mutated = original
            missing = [old for old, _ in pairs if old not in original]
            if missing:
                print(f'{name}: PATTERN NOT FOUND (the engine changed; update this script)')
                survived += 1
                continue
            for old, new in pairs:
                mutated = mutated.replace(old, new, 1)
            with open(ENGINE, 'w') as handle:
                handle.write(mutated)
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
