// Constats du médecin ignorés par le joueur (Diagnostic > « Ignorer… ») : retenus dans le .info de la
// table, sans toucher à ses autres champs, hors du compte partout, rétablis à la demande.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ignoredFindingCodes, setFindingIgnored, splitIgnoredFindings, type Finding } from '../doctor';

const finding = (code: Finding['code'], title: string = code): Finding => ({ code, severity: 'info', title, detail: '' });

test('un constat ignoré est retenu par code dans le .info, les autres champs gardés, et se rétablit', () => {
  const info = { Info: { Title: 'Aliens' }, CyberPinball: { pup: { sorcr_l2: { option: 'Option 1' } } }, User: { StartCount: 3 } };
  const ignored = setFindingIgnored(info, 'pupScreenAbsent', true);
  assert.deepEqual(ignoredFindingCodes(ignored), ['pupScreenAbsent']);
  assert.deepEqual(ignored.CyberPinball, { pup: { sorcr_l2: { option: 'Option 1' } }, doctor: { ignored: ['pupScreenAbsent'] } });
  assert.deepEqual(ignored.Info, info.Info);
  assert.deepEqual(ignored.User, info.User);
  // Deux fois le même : une seule entrée.
  assert.deepEqual(ignoredFindingCodes(setFindingIgnored(ignored, 'pupScreenAbsent', true)), ['pupScreenAbsent']);
  // Rétabli : plus de trace, le reste intact.
  const back = setFindingIgnored(ignored, 'pupScreenAbsent', false);
  assert.deepEqual(back.CyberPinball, { pup: { sorcr_l2: { option: 'Option 1' } } });
});

test('les constats ignorés sortent du compte, tous ceux du même code ; un code inconnu du .info est sans effet', () => {
  const findings = [finding('pupScreenAbsent', 'a'), finding('romMissing'), finding('pupScreenAbsent', 'b')];
  const info = { CyberPinball: { doctor: { ignored: ['pupScreenAbsent', 'codeDisparu', 42] } } };
  const { shown, ignored } = splitIgnoredFindings(findings, info);
  assert.deepEqual(shown.map((f) => f.code), ['romMissing']);
  assert.deepEqual(ignored.map((f) => f.title), ['a', 'b']);
  assert.deepEqual(ignoredFindingCodes(info), ['pupScreenAbsent']);
  // Sans mémoire : tout est montré.
  assert.equal(splitIgnoredFindings(findings, {}).shown.length, 3);
});
