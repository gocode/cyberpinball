import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  earlyTranslations,
  fillText,
  formatDate,
  language,
  loadLanguageSetting,
  resolveLanguage,
  saveLanguageSetting,
  setLanguage,
  systemLanguage,
  t,
  tn,
} from '../i18n';
import { describeReport, looksFrench, scanAll, scanCode, scanHtml } from './i18n-scan';

test('i18n : aucun texte traduit au chargement des modules du cœur', () => {
  // Un libellé traduit à l'import garderait la langue par défaut : les tables de constantes ont des accesseurs.
  require('../index');
  assert.deepEqual(earlyTranslations(), []);
});

test('i18n : chaque texte de l’interface a sa traduction anglaise, aucun texte français codé en dur', () => {
  const lines = describeReport(scanAll());
  assert.deepEqual(lines, [], `\n${lines.join('\n')}\n`);
});

test('i18n : paramètres, pluriels et langue', () => {
  assert.equal(fillText('{name} : {count} tables, {absent}', { name: 'Borne', count: 3 }), 'Borne : 3 tables, {absent}');
  setLanguage('fr');
  assert.equal(tn(0, '{n} table', '{n} tables'), '0 table');
  assert.equal(tn(1, '{n} table', '{n} tables'), '1 table');
  assert.equal(tn(1500, '{n} table', '{n} tables'), '1\u202f500 tables');
  assert.equal(formatDate(Date.UTC(2026, 9, 24, 12)), '24 octobre 2026');
  setLanguage('en');
  assert.equal(language(), 'en');
  assert.equal(t('Texte absent du catalogue {x}', { x: 1 }), 'Texte absent du catalogue 1'); // i18n-ignore
  assert.equal(formatDate(Date.UTC(2026, 9, 24, 12)), '24 October 2026');
  setLanguage('fr');
});

test('i18n : langue par défaut, choix enregistré, variable d’environnement', () => {
  assert.equal(systemLanguage(['fr-FR', 'en-US']), 'fr');
  assert.equal(systemLanguage(['fr-CA']), 'fr');
  assert.equal(systemLanguage(['de-DE', 'fr-FR']), 'en');
  assert.equal(systemLanguage([]), 'en');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-i18n-'));
  try {
    assert.equal(loadLanguageSetting(dir), undefined);
    assert.equal(resolveLanguage({ dataDir: dir, system: ['fr-FR'] }), 'fr');
    saveLanguageSetting(dir, 'en');
    assert.equal(loadLanguageSetting(dir), 'en');
    assert.equal(resolveLanguage({ dataDir: dir, system: ['fr-FR'] }), 'en');
    assert.equal(resolveLanguage({ env: { CYBERPINBALL_LANGUE: 'fr' }, dataDir: dir, system: ['en-US'] }), 'fr');
    fs.writeFileSync(path.join(dir, 'language.json'), '{ "language": "de" }');
    assert.equal(resolveLanguage({ dataDir: dir, system: ['de-DE'] }), 'en');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('i18n : le relevé trouve les clés, les gabarits et les textes codés en dur', () => {
  const src = [
    "const a = t('Jouer la table');",
    "const b = tn(n, '{n} jeu', '{n} jeux', { x });",
    'const c = t(`Écran ${i}`);',
    "const d = 'Quitter sans enregistrer';",
    "console.log('Journal : écrit dans la console');",
    "const e = 'Désinstaller Cyber Pinball.exe'; // i18n-ignore",
    "const f = { id: 'playfield', path: 'C:/x', re: /é+/ };",
    "throw new Error(`Aucun écran ${name}`);",
    '// Commentaire : réglé à la main',
    "const g = t('Avec {param}', { param: f(`gabarit ${x} intérieur`) });",
    "const h = dpi[0]! / 96; const k = 'Sans écran';",
  ].join('\n');
  const scan = scanCode('x.ts', src);
  assert.deepEqual(scan.keys.map((k) => k.key), ['Jouer la table', '{n} jeu', '{n} jeux', 'Avec {param}']);
  assert.deepEqual(scan.dynamic.map((d) => d.line), [3]);
  // Ligne 10 : un texte français passé en paramètre reste un texte codé en dur ; ligne 11 : une
  // division après une assertion non nulle n'est pas le début d'une expression régulière.
  assert.deepEqual(scan.hardcoded.map((h) => h.line), [4, 8, 10, 11]);
  const html = scanHtml('x.html', '<title>Réglages</title><button data-i18n>Fermer (Échap)</button><b data-i18n="Retour (contexte)">Retour</b><span>CYBER</span><!-- Démonstration -->');
  assert.deepEqual(html.keys.map((k) => k.key), ['Fermer (Échap)', 'Retour (contexte)']);
  assert.deepEqual(html.hardcoded.map((h) => h.text), ['Réglages']);
  assert.equal(looksFrench('Retour'), true);
  assert.equal(looksFrench('playfield'), false);
  assert.equal(looksFrench('Start : valider'), true);
  assert.equal(looksFrench('--son'), false);
});
