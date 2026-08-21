import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claimAcronymPluralAliases,
  claimStem,
  claimWords,
} from './claim-token-normalization.ts';

test('normalizes case and parenthesized acronym tokens', () => {
  assert.deepEqual(
    claimWords('Product Requirements Documents (PRDs)'),
    ['product', 'requirements', 'documents', 'prds'],
  );
  assert.deepEqual(claimWords('prds'), ['prds']);
});

test('normalizes only conventional uppercase acronym plurals', () => {
  const aliases = claimAcronymPluralAliases('PRD, PRDs and (APIs)');
  assert.equal(aliases.get('prds'), 'prd');
  assert.equal(aliases.get('apis'), 'api');
  assert.equal(claimAcronymPluralAliases('prds').size, 0);
});

test('matches PRD and PRDs in either source-output direction', () => {
  const index = (text) => new Set([
    ...claimWords(text),
    ...claimAcronymPluralAliases(text).values(),
  ]);
  assert.equal(index('PRD').has(claimAcronymPluralAliases('PRDs').get('prds')), true);
  assert.equal(index('(PRDs)').has(claimWords('prd')[0]), true);
});

test('keeps unsafe short-word collisions distinct', () => {
  assert.notEqual(claimStem('does'), claimStem('doe'));
  assert.notEqual(claimStem('axes'), claimStem('axe'));
});

test('does not collapse distinct technology names or authority claims', () => {
  assert.notEqual(claimStem('javascript'), claimStem('java'));
  assert.notEqual(claimStem('leader'), claimStem('leading'));
});
