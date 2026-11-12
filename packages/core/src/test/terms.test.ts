// Conditions d'utilisation (terms.ts) : le texte complet dans les deux langues, sa forme pour la page
// de l'installeur, et l'acceptation gardée dans <données>\conditions.json, écrite par l'application
// ou par l'installeur (même nom, même version, même format).
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { setLanguage } from '../i18n';
import { readTermsAcceptance, recordTermsAccepted, termsAccepted, termsDocument, termsFile, termsPlainText, TERMS_FILE, TERMS_VERSION } from '../terms';

const REPO = path.join(__dirname, '..', '..', '..', '..');

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-conditions-'));
}

test('conditions : chaque partie a un titre et du texte, dans les deux langues', () => {
  for (const lang of ['fr', 'en'] as const) {
    setLanguage(lang);
    const doc = termsDocument();
    assert.ok(doc.sections.length >= 5, lang);
    for (const s of doc.sections) {
      assert.ok(s.title.trim(), `${lang} : titre vide`);
      assert.ok(s.paragraphs.length && s.paragraphs.every((p) => p.trim().length > 20), `${lang} : ${s.title}`);
    }
    // Les points qui protègent : contenus de tiers, partage, absence de garantie, santé.
    const all = [doc.lead, ...doc.sections.flatMap((s) => [s.title, ...s.paragraphs])].join(' ');
    for (const word of lang === 'fr' ? ['ROM', 'droit d’auteur', 'garantie', 'Épilepsie', 'Partage et réseau'] : ['ROM', 'copyright', 'warranty', 'Epilepsy', 'Sharing and network']) {
      assert.ok(all.includes(word), `${lang} : « ${word} » manque`);
    }
  }
  setLanguage('fr');
});

test('conditions : texte de l’installeur, en clair, avec les retours à la ligne de Windows', () => {
  setLanguage('fr');
  const text = termsPlainText();
  assert.ok(text.startsWith('CONDITIONS D’UTILISATION\r\nVersion du '));
  assert.ok(!/[^\r]\n/.test(text), 'chaque fin de ligne est CRLF');
  for (const s of termsDocument().sections) assert.ok(text.includes(s.title.toUpperCase()), s.title);
});

test('conditions : acceptées dans le menu, gardées, et redemandées pour une version plus récente', () => {
  const dir = tempDir();
  try {
    assert.equal(readTermsAcceptance(dir), undefined);
    assert.equal(termsAccepted(undefined), false);
    const saved = recordTermsAccepted(dir, new Date('2026-11-12T10:00:00Z'));
    const read = readTermsAcceptance(dir);
    assert.deepEqual(read, saved);
    assert.equal(read?.version, TERMS_VERSION);
    assert.equal(read?.via, 'menu');
    assert.equal(termsAccepted(read), true);
    // Un texte changé (version plus récente) se présente à nouveau.
    assert.equal(termsAccepted(read, '2099-01-01'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('conditions : l’installeur écrit le même fichier, dans le format que l’application relit', () => {
  const nsi = fs.readFileSync(path.join(REPO, 'scripts', 'installeur', 'cyberpinball.nsi'), 'utf8');
  assert.ok(nsi.includes(`$Racine\\data\\${TERMS_FILE}`), 'nom du fichier');
  assert.ok(nsi.includes('MUI_PAGE_LICENSE "${CONDITIONS}"'), 'page des conditions');
  const line = nsi.split(/\r?\n/).find((l) => l.includes('FileWrite') && l.includes('CONDITIONS_VERSION'));
  assert.ok(line, 'écriture de l’acceptation');
  // Le JSON que l'installeur écrit, avec la version qu'installeur.mjs lui donne.
  const json = line.slice(line.indexOf("'") + 1, line.lastIndexOf("'")).replace(/\$\\r/g, '\r').replace(/\$\\n/g, '\n').replace('${CONDITIONS_VERSION}', TERMS_VERSION);
  const dir = tempDir();
  try {
    fs.writeFileSync(termsFile(dir), json);
    const read = readTermsAcceptance(dir);
    assert.deepEqual(read, { version: TERMS_VERSION, via: 'installeur' });
    assert.equal(termsAccepted(read), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
