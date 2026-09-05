import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { parseScreeningAnswers, SCREENING_TURN_CAP } from '../../lib/screening-answers';

// Execute the actual component handlers with fake I/O, without mounting the
// authenticated dashboard or making a paid model request.
const source = readFileSync(new URL('../ChatPanel.tsx', import.meta.url), 'utf8');
const parsedSource = ts.createSourceFile('ChatPanel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name: string): string {
  let initializer: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsedSource) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(parsedSource);
  assert.ok(initializer, `Missing component handler ${name}`);
  return ts.transpileModule(`const ${name} = ${initializer.getText(parsedSource)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

for (const [spine, tier] of [[true, 'plus'], [false, 'max']] as const) {
  test(`explicit screening saves Answers without a hydrated CV (${tier}, spine=${spine})`, async () => {
    const messages: Array<{ role: string; content: string; actions?: Array<{ action: string }> }> = [];
    const session: Record<string, unknown> = { id: 'saved-application', generatedCV: null, screeningUsageCount: 0 };
    const store = {
      currentSession: session,
      sessions: [session],
      updateSessionById(id: string, patch: Record<string, unknown>) {
        assert.equal(id, session.id);
        Object.assign(session, patch);
      },
    };
    let selectedTab = '';
    let screeningCalls = 0;
    const noop = () => undefined;
    const scope = vm.createContext({
      inputValue: 'Describe your experience with automation.',
      currentSession: session,
      isScreeningMode: true,
      isObviousJobAd: () => false,
      spine,
      user: { id: 'user' },
      profile: { subscription_tier: tier },
      screeningInFlightRef: { current: false },
      cvRewriteNoteRef: { current: null },
      useSessionStore: { getState: () => store },
      SCREENING_TURN_CAP,
      parseScreeningAnswers,
      setPendingDecisionJd: noop,
      setAdFallbackJd: noop,
      setPendingRegen: noop,
      setInputValue: noop,
      setIsScreeningMode: noop,
      setRunningScreening: noop,
      addChatMessage: (message: typeof messages[number]) => messages.push(message),
      onTabChange: (tab: string) => { selectedTab = tab; },
      posthog: null,
      async fetchScreeningAnswers() {
        screeningCalls += 1;
        return {
          ok: true,
          turnsUsed: 1,
          reply: '---ANSWER_START---\n**Q: Describe your experience with automation.**\n\nI built an internal reporting tool.\n---ANSWER_END---',
        };
      },
      workflowHandleSend: () => assert.fail('Screening fell through to general chat'),
      handleGeneralChat: () => assert.fail('Screening fell through to general chat'),
    });
    vm.runInContext(`${handler('runScreening')}\n${handler('handleSend')}`, scope);
    await vm.runInContext('handleSend()', scope);
    assert.equal(screeningCalls, 1);
    assert.equal(selectedTab, 'answers');
    const answers = session.screeningAnswers as Array<{ answer: string }>;
    assert.equal(answers.length, 1);
    assert.equal(answers[0].answer, 'I built an internal reporting tool.');
    assert.equal(session.screeningUsageCount, 1);
    assert.equal(messages.at(-1)?.actions?.[0].action, 'stage-done');
  });
}
