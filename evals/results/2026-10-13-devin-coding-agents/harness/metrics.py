import json, sys, os, glob
PRICES = {  # Devin CLI list prices, USD per 1M tokens: input, cached input, output (devin models list, 2026-10-13)
  'opus': (4, 0.2, 20), 'sonnet': (2, 0.1, 10), 'argon': (1, 0.05, 5)}
root = sys.argv[1]
rows = []
for d in sorted(glob.glob(os.path.join(root, 'runs', '*'))):
    t = json.load(open(os.path.join(d, 'timing.json')))
    e = json.load(open(os.path.join(d, 'export.json')))
    fm = e.get('final_metrics', {})
    p, c, k = fm.get('total_prompt_tokens', 0), fm.get('total_completion_tokens', 0), fm.get('total_cached_tokens', 0)
    steps = [s for s in e['steps'] if s.get('source') == 'agent']
    tools = sum(len(s.get('tool_calls') or []) for s in steps)
    reasoning_chars = sum(len(s.get('reasoning_content') or '') for s in steps)
    pi, pc, po = PRICES[t['label']]
    cost = ((p - k) * pi + k * pc + c * po) / 1e6
    diff = open(os.path.join(d, 'diff.patch')).read()
    added = sum(1 for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
    removed = sum(1 for l in diff.splitlines() if l.startswith('-') and not l.startswith('---'))
    rows.append(dict(task=t['task'], model=t['label'], exit=t['exit'], wall_s=round(t['end'] - t['start'], 1),
        llm_turns=len(steps), tool_calls=tools, prompt_tok=p, cached_tok=k, uncached_in=p - k, output_tok=c,
        cache_hit=round(k / p, 3) if p else 0, cost_usd=round(cost, 4), diff_plus=added, diff_minus=removed,
        reasoning_chars=reasoning_chars))
json.dump(rows, open(os.path.join(root, 'metrics.json'), 'w'), indent=1)
cols = list(rows[0].keys())
print('| ' + ' | '.join(cols) + ' |'); print('|' + '---|' * len(cols))
for r in rows: print('| ' + ' | '.join(str(r[c]) for c in cols) + ' |')
