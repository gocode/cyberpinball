import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { setLanguage } from '../i18n';
import {
  isSystemGroup,
  SYSTEM_GROUP_IDS,
  SYSTEM_GROUPS,
  SYSTEM_ITEM_IDS,
  SYSTEM_ROOT,
  systemEntry,
  systemPathOf,
  type SystemEntryId,
  type SystemGroupId,
} from '../systemmenu';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const APP = path.join(REPO, 'app', 'src');

test('menu système : chaque entrée est rangée une fois, sous une seule rubrique', () => {
  const seen = new Map<SystemEntryId, SystemGroupId>();
  for (const group of SYSTEM_GROUP_IDS) {
    for (const id of SYSTEM_GROUPS[group].entries) {
      assert.ok(!seen.has(id), `« ${id} » est rangée dans « ${seen.get(id)} » et dans « ${group} »`);
      seen.set(id, group);
    }
  }
  for (const id of SYSTEM_ITEM_IDS) assert.ok(seen.has(id), `« ${id} » n'est rangée dans aucune rubrique`);
  for (const group of SYSTEM_GROUP_IDS) {
    if (SYSTEM_ROOT.includes(group)) assert.ok(!seen.has(group), `la rubrique « ${group} » est aussi rangée dans « ${seen.get(group)} »`);
    else assert.ok(systemPathOf(group), `« ${group} » n'est accessible depuis aucune rubrique`);
  }
  assert.equal(SYSTEM_ROOT.length, 4, 'quatre rubriques');
});

test('menu système : dans une rubrique, chaque entrée a son icône, et la rubrique la sienne', () => {
  const root = SYSTEM_ROOT.map((id) => SYSTEM_GROUPS[id].icon);
  assert.equal(new Set(root).size, root.length, `icône répétée parmi les rubriques : ${root.join(', ')}`);
  for (const group of SYSTEM_GROUP_IDS) {
    const icons = SYSTEM_GROUPS[group].entries.map((id) => systemEntry(id).icon);
    assert.equal(new Set(icons).size, icons.length, `icône répétée dans « ${group} » : ${icons.join(', ')}`);
    // L'icône d'une rubrique est en titre de son écran : aucune de ses lignes ne la reprend.
    assert.ok(!icons.includes(SYSTEM_GROUPS[group].icon), `« ${group} » : son icône ${SYSTEM_GROUPS[group].icon} sert aussi à l'une de ses entrées`);
  }
});

test('menu système : l’application fournit chaque entrée de l’arbre', () => {
  const sources = fs
    .readdirSync(APP)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => fs.readFileSync(path.join(APP, f), 'utf8'))
    .join('\n');
  for (const id of SYSTEM_ITEM_IDS) {
    // provideSystemItem('id', …), ou la liste de départ de library.ts (['id', { … }]).
    const listed = new RegExp(`\\[\\s*(?://[^\\n]*\\s*)?'${id}',\\s*\\{`);
    const provided = new RegExp(`provideSystemItem\\(\\s*'${id}',`);
    assert.ok(provided.test(sources) || listed.test(sources), `aucune action fournie pour l'entrée « ${id} » du menu système`);
  }
  // Plus de liste à rallonge : le rang d'une entrée vient de l'arbre, pas d'un splice.
  assert.doesNotMatch(sources, /systemItems\.splice/);
});

// ---------- Chemins écrits dans le manuel et les textes ----------

const norm = (s: string) => s.replace(/[’']/g, "'").replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').trim().toLowerCase();

/** Noms d'une entrée, en français et en anglais (« Langue / Language » s'écrit dans les deux sens). */
function namesOf(id: SystemEntryId): string[] {
  const names: string[] = [];
  for (const lang of ['fr', 'en'] as const) {
    setLanguage(lang);
    const label = systemEntry(id).label;
    names.push(norm(label), norm(label.split('/').reverse().join('/')));
  }
  setLanguage('fr');
  return names;
}

/** Segments d'un chemin « Menu système > A > B » : le texte entre guillemets, sinon le texte jusqu'à la ponctuation. */
function segments(rest: string): string[] {
  const out: string[] = [];
  let text = rest;
  for (;;) {
    text = text.replace(/^[\s*]+/, '');
    const quoted = /^(?:«\s*([^»]+?)\s*»|“([^”]+)”|"([^"]+)")/.exec(text);
    let segment: string;
    if (quoted) {
      segment = (quoted[1] ?? quoted[2] ?? quoted[3])!;
      text = text.slice(quoted[0].length);
    } else {
      const plain = /^([^.;:,()«»"“”*>`]+?)(?=\s*(?:>|[.;:,()`]|$))/.exec(text);
      if (!plain) break;
      segment = plain[1]!;
      text = text.slice(plain[0].length);
    }
    out.push(segment);
    // Traduction entre parenthèses après le nom français (manuel anglais), puis le séparateur.
    const next = /^\s*\*{0,2}\s*(?:\([^)]*\))?\s*\*{0,2}\s*>\s*/.exec(text);
    if (!next) break;
    text = text.slice(next[0].length);
  }
  return out;
}

/** Erreur du chemin, ou undefined : chaque cran nomme une entrée de la rubrique où l'on est, jusqu'à une entrée qui ouvre son propre écran (ou une rubrique). */
function checkPath(parts: string[]): string | undefined {
  let at: readonly SystemEntryId[] = SYSTEM_ROOT;
  for (const part of parts) {
    const found = at.find((id) => namesOf(id).includes(norm(part)));
    if (!found) return `« ${part} » n'est pas dans ${at === SYSTEM_ROOT ? 'les rubriques' : 'cette rubrique'} (${at.map((id) => systemEntry(id).label).join(', ')})`;
    if (!isSystemGroup(found)) return undefined;
    at = SYSTEM_GROUPS[found].entries;
  }
  return undefined;
}

function textFiles(): string[] {
  const docs = ['manuel.md', 'manual.md', 'tests-manuels.md', 'manual-tests.md'].map((f) => path.join(REPO, 'docs', f));
  const readmes = ['README.md', 'README.fr.md'].map((f) => path.join(REPO, f));
  const code = [APP, path.join(REPO, 'packages', 'core', 'src'), path.join(REPO, 'packages', 'core', 'src', 'i18n', 'en')].flatMap((dir) =>
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => path.join(dir, f)),
  );
  return [...docs, ...readmes, ...code].filter((f) => fs.existsSync(f));
}

test('les chemins « Menu système > … » du manuel et de l’interface existent', () => {
  const problems: string[] = [];
  for (const file of textFiles()) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/(?:menu système|system menu)\s*(?:\*{0,2}\s*\([^)]*\))?\s*\*{0,2}\s*>\s*(.*)/gi)) {
        const parts = segments(m[1]!);
        const problem = checkPath(parts);
        if (problem) problems.push(`${path.relative(REPO, file)}:${i + 1} : ${problem}`);
      }
    });
  }
  assert.deepEqual(problems, []);
});

test('lecture des chemins : guillemets, traduction entre parenthèses, texte nu', () => {
  assert.deepEqual(segments('« Borne » > « Configuration de la borne » > « Tilt » : Start…'), ['Borne', 'Configuration de la borne', 'Tilt']);
  assert.deepEqual(segments('"Borne" (Cabinet) > "Configuration de la borne" (Cabinet setup) > "Tilt" (`npm run`)'), ['Borne', 'Configuration de la borne', 'Tilt']);
  assert.deepEqual(segments('Borne > Configuration de la borne > Écran du DMD.'), ['Borne', 'Configuration de la borne', 'Écran du DMD']);
  assert.equal(checkPath(['Configuration de la borne']), '« Configuration de la borne » n\'est pas dans les rubriques (Tables, Médias, Borne, Cyber Pinball)');
  assert.equal(checkPath(['Cyber Pinball', 'Language / Langue']), undefined);
  assert.equal(checkPath(['Cabinet', 'Cabinet setup', 'Tilt']), undefined);
});
