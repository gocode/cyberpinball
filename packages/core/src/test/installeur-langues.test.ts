// Langues de l'installeur (scripts/installeur/cyberpinball.nsi) : chaque texte qu'il affiche passe par
// $(L_…), défini dans langues.nsh en français et en anglais, avec les mêmes variables ; aucun texte
// français n'y est codé en dur ; la langue choisie au début est écrite dans <racine>\data\language.json,
// au format que l'application relit ; les conditions d'utilisation existent dans les deux langues.
// Même invariant que i18n.test.ts pour l'application, appliqué au script NSIS.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { LANGUAGE_FILE, loadLanguageSetting, setLanguage } from '../i18n';
import { REPO_ROOT } from './i18n-scan';

const DIR = path.join(REPO_ROOT, 'scripts', 'installeur');
const nsi = fs.readFileSync(path.join(DIR, 'cyberpinball.nsi'), 'utf8');
const langues = fs.readFileSync(path.join(DIR, 'langues.nsh'), 'utf8');

/** Lignes de code, sans les commentaires de ligne. */
function codeLines(text: string): string[] {
  return text.split(/\r?\n/).filter((l) => !/^\s*[;#]/.test(l));
}

/** Textes de langues.nsh : nom → { fr, en }, et les doublons. */
function catalog(): { strings: Map<string, { fr?: string; en?: string }>; duplicates: string[] } {
  const strings = new Map<string, { fr?: string; en?: string }>();
  const duplicates: string[] = [];
  for (const line of codeLines(langues)) {
    const m = /^\s*(?:License)?LangString (\w+) \$\{LANG_(FRENCH|ENGLISH)\} "(.*)"\s*$/.exec(line);
    if (!m) continue;
    const [, name = '', lang = '', value = ''] = m;
    const key = lang === 'FRENCH' ? 'fr' : 'en';
    const entry = strings.get(name) ?? {};
    if (entry[key] !== undefined) duplicates.push(`${name} (${key})`);
    entry[key] = value;
    strings.set(name, entry);
  }
  return { strings, duplicates };
}

/** Variables, définitions et retours à la ligne d'un texte NSIS (le suffixe de langue des définitions mis à part). */
function placeholders(value: string): string[] {
  return (value.match(/\$\{\w+\}|\$\\[rnt]|\$[A-Za-z_]\w*|\$\d/g) ?? []).map((p) => p.replace(/_(FR|EN)\}$/, '}')).sort();
}

const FRENCH_WORDS = /\b(le|la|les|des|du|est|pas|dans|sur|avec|pour|une|vos|votre|sont|ou)\b/i;
const ACCENTS = /[àâäçéèêëîïôöûùüœÀÂÇÉÈÊÎÔÛŒ]/;

test('installeur : chaque texte affiché a sa traduction française et anglaise, et rien de plus', () => {
  const { strings, duplicates } = catalog();
  assert.deepEqual(duplicates, [], 'un texte défini deux fois dans la même langue');
  assert.ok(strings.size > 40, 'textes lus dans langues.nsh');
  for (const [name, { fr, en }] of strings) {
    assert.ok(fr !== undefined && en !== undefined, `${name} : il manque ${fr === undefined ? 'le français' : 'l’anglais'}`);
  }
  const used = new Set<string>();
  for (const line of codeLines(nsi)) for (const m of line.matchAll(/\$\((L_\w+)\)/g)) used.add(m[1] ?? '');
  const missing = [...used].filter((n) => !strings.has(n));
  const unused = [...strings.keys()].filter((n) => !used.has(n));
  assert.deepEqual(missing, [], 'textes utilisés par cyberpinball.nsi sans traduction');
  assert.deepEqual(unused, [], 'textes de langues.nsh que plus rien n’utilise');
});

test('installeur : mêmes variables dans les deux langues, anglais vraiment traduit, typographie française', () => {
  for (const [name, { fr = '', en = '' }] of catalog().strings) {
    assert.deepEqual(placeholders(en), placeholders(fr), `${name} : variables ou retours à la ligne différents`);
    assert.notEqual(en, fr, `${name} : traduction anglaise identique au français`);
    assert.ok(!ACCENTS.test(en) && !en.includes(' '), `${name} : traduction anglaise restée en français : ${en}`);
    // Espace insécable avant « : ; ? ! » et dans les guillemets français, comme le reste de l'interface.
    assert.ok(!/ [:;?!»]|« /.test(fr), `${name} : espace ordinaire devant une ponctuation double : ${fr}`);
  }
});

test('installeur : aucun texte français codé en dur dans cyberpinball.nsi', () => {
  const found: string[] = [];
  for (const line of codeLines(nsi)) {
    if (line.includes('i18n-ignore')) continue;
    for (const m of line.matchAll(/"([^"]*)"|'([^']*)'/g)) {
      const text = m[1] ?? m[2] ?? '';
      if (ACCENTS.test(text) || FRENCH_WORDS.test(text.replace(/\$\{?\w+\}?/g, ''))) found.push(line.trim());
    }
  }
  assert.deepEqual(found, [], 'texte à passer par $(L_…) (langues.nsh), ou à marquer « ; i18n-ignore » s’il ne s’affiche pas');
});

test('installeur : espaces insécables seulement dans les textes, jamais dans le code NSIS', () => {
  // makensis ne reconnaît pas une commande précédée d'une espace insécable (« Invalid command »).
  for (const [file, text] of [['cyberpinball.nsi', nsi], ['langues.nsh', langues]] as const) {
    const bad = codeLines(text).filter((l) => l.replace(/"[^"]*"|'[^']*'/g, '').includes(' '));
    assert.deepEqual(bad, [], `${file} : espace insécable hors d’un texte`);
  }
});

test('installeur : les deux langues chargées avant leurs textes, fenêtre de choix jamais en mise à jour ni en silence', () => {
  const fr = nsi.indexOf('!insertmacro MUI_LANGUAGE "French"');
  const en = nsi.indexOf('!insertmacro MUI_LANGUAGE "English"');
  const include = nsi.indexOf('!include "${__FILEDIR__}\\langues.nsh"');
  assert.ok(fr >= 0 && en > fr && include > en, 'MUI_LANGUAGE French puis English, puis langues.nsh');
  const onInit = nsi.slice(nsi.lastIndexOf('Function .onInit'), nsi.indexOf('FunctionEnd', nsi.lastIndexOf('Function .onInit')));
  const display = onInit.indexOf('!insertmacro MUI_LANGDLL_DISPLAY');
  assert.ok(display > 0, 'fenêtre du choix de la langue');
  for (const guard of ['$Maj != "1"', '${AndIfNot} ${Silent}', '$LangueChoisie == ""', '"/LANGUE="', 'Call LangueParDefaut']) {
    const at = onInit.indexOf(guard);
    assert.ok(at >= 0 && at < display, `« ${guard} » avant la fenêtre`);
  }
  // Le désinstalleur parle la langue de Cyber Pinball sur cette borne, avant tout message.
  const unInit = nsi.slice(nsi.indexOf('Function un.onInit'), nsi.indexOf('FunctionEnd', nsi.indexOf('Function un.onInit')));
  assert.ok(unInit.indexOf('Call un.LangueParDefaut') >= 0 && unInit.indexOf('Call un.LangueParDefaut') < unInit.indexOf('MessageBox'));
});

test('installeur : la langue choisie est écrite au format que l’application relit', () => {
  // Lecture : <racine>\data\language.json, le fichier de l'application.
  assert.ok(nsi.includes(`FileOpen $1 "$R9\\data\\${LANGUAGE_FILE}" r`), 'lecture de la langue de l’application');
  assert.ok(nsi.includes(`FileOpen $1 "$Racine\\data\\${LANGUAGE_FILE}" w`), 'écriture dans les données de la racine');
  const line = nsi.split(/\r?\n/).find((l) => l.includes('FileWrite') && l.includes('$LangueChoisie'));
  assert.ok(line, 'écriture de la langue');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-langue-installeur-'));
  try {
    for (const lang of ['fr', 'en'] as const) {
      const json = line.slice(line.indexOf("'") + 1, line.lastIndexOf("'")).replace(/\$\\n/g, '\n').replace('$LangueChoisie', lang);
      fs.writeFileSync(path.join(dir, LANGUAGE_FILE), json);
      assert.equal(loadLanguageSetting(dir), lang);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installeur : conditions d’utilisation écrites dans les deux langues pour leur page', async () => {
  const build = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'installeur.mjs')).href)) as { termsPage(dir: string): { CONDITIONS_FR: string; CONDITIONS_EN: string; CONDITIONS_VERSION: string } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-conditions-installeur-'));
  try {
    const pages = build.termsPage(dir);
    const read = (file: string): string => {
      const bytes = fs.readFileSync(file);
      assert.deepEqual([...bytes.subarray(0, 2)], [0xff, 0xfe], 'UTF-16 avec marque d’ordre');
      return bytes.subarray(2).toString('utf16le');
    };
    assert.ok(read(pages.CONDITIONS_FR).startsWith('CONDITIONS D’UTILISATION\r\n'));
    assert.ok(read(pages.CONDITIONS_EN).startsWith('TERMS OF USE\r\n'));
    assert.ok(pages.CONDITIONS_VERSION);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    setLanguage('fr');
  }
});
