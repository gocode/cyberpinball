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
  SYSTEM_ITEMS,
  SYSTEM_ROOT,
  SYSTEM_ROOT_ENTRIES,
  systemEntry,
  systemPathOf,
  type SystemEntryId,
  type SystemGroupId,
  type SystemItemId,
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
  assert.equal(SYSTEM_ROOT.length, 5, 'cinq rubriques');
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
  // La racine telle qu'elle s'affiche : Téléchargements (raccourci), puis les rubriques.
  let at: readonly SystemEntryId[] = SYSTEM_ROOT_ENTRIES;
  for (const part of parts) {
    const found = at.find((id) => namesOf(id).includes(norm(part)));
    if (!found) return `« ${part} » n'est pas dans ${at === SYSTEM_ROOT_ENTRIES ? 'les rubriques' : 'cette rubrique'} (${at.map((id) => systemEntry(id).label).join(', ')})`;
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
  assert.equal(checkPath(['Configuration de la borne']), '« Configuration de la borne » n\'est pas dans les rubriques (Téléchargements, Tables, Médias, Amis, Borne, Cyber Pinball)');
  assert.equal(checkPath(['Téléchargements']), undefined, 'Téléchargements, en tête de la racine');
  assert.equal(checkPath(['Tables', 'Téléchargements']), undefined, 'et toujours dans Tables');
  assert.equal(checkPath(['Cyber Pinball', 'Language / Langue']), undefined);
  assert.equal(checkPath(['Cabinet', 'Cabinet setup', 'Tilt']), undefined);
});

// ---------- Entrées nommées avec leur rubrique, hors chemin « > » ----------
// « Dans la rubrique Borne : « Mettre en veille »… » ou « Menu système > Borne : « … » » : le
// relevé des chemins s'arrête à la rubrique, et la phrase restait juste quand les entrées
// changeaient de rubrique (veille et extinction passées de Borne à Cyber Pinball, 27/10/2026).

/** Rubrique où l'on arrive au bout d'un chemin qui s'arrête sur une rubrique ; undefined sinon. */
function groupAtEnd(parts: string[]): SystemGroupId | undefined {
  let at: readonly SystemEntryId[] = SYSTEM_ROOT;
  let group: SystemGroupId | undefined;
  for (const part of parts) {
    const found = at.find((id) => namesOf(id).includes(norm(part)));
    if (!found || !isSystemGroup(found)) return undefined;
    group = found;
    at = SYSTEM_GROUPS[found].entries;
  }
  return group;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rubriques qu'une phrase désigne comme lieu : « rubrique Borne », « Borne (Cabinet) section », « Menu système > Borne : ». */
function placesIn(sentence: string): SystemGroupId[] {
  const text = norm(sentence);
  const places = new Set<SystemGroupId>();
  for (const group of SYSTEM_GROUP_IDS) {
    for (const name of new Set(namesOf(group))) {
      const n = escape(name);
      const named = new RegExp(`rubriques?\\s+(?:«\\s*)?${n}(?![\\p{L}])|(?<![\\p{L}])"?${n}"?(?:\\s*\\([^)]*\\))?\\s+section|section\\s+"?${n}(?![\\p{L}])`, 'u');
      if (named.test(text)) places.add(group);
    }
  }
  for (const m of sentence.matchAll(/(?:menu système|system menu)\s*(?:\*{0,2}\s*\([^)]*\))?\s*\*{0,2}\s*>\s*(.*)/gi)) {
    const group = groupAtEnd(segments(m[1]!));
    if (group) places.add(group);
  }
  return [...places];
}

/** Entrées du menu (pas les rubriques) nommées entre guillemets dans une phrase. */
function itemsIn(sentence: string): SystemItemId[] {
  const quoted = [...sentence.matchAll(/«\s*([^»]+?)\s*»|“([^”]+)”|"([^"]+)"/g)].map((m) => norm((m[1] ?? m[2] ?? m[3])!));
  return SYSTEM_ITEM_IDS.filter((id) => namesOf(id).some((name) => quoted.includes(name)));
}

/** Erreur d'une phrase qui range une entrée dans une rubrique qui ne la contient pas ; undefined sinon. */
function checkPlace(sentence: string): string | undefined {
  const places = placesIn(sentence);
  if (!places.length) return undefined;
  for (const id of itemsIn(sentence)) {
    const trail = systemPathOf(id) ?? [];
    if (!places.some((group) => trail.includes(group))) {
      return `« ${SYSTEM_ITEMS[id].label} » est dans ${trail.map((g) => SYSTEM_GROUPS[g].label).join(' > ')}, pas dans ${places.map((g) => SYSTEM_GROUPS[g].label).join(' ni ')}`;
    }
  }
  return undefined;
}

test('les entrées nommées « dans la rubrique … » du manuel et de l’interface y sont', () => {
  const problems: string[] = [];
  for (const file of textFiles()) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      // Une phrase, ou une cellule de tableau.
      for (const sentence of line.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«"“])|\s\|\s/)) {
        const problem = checkPlace(sentence);
        if (problem) problems.push(`${path.relative(REPO, file)}:${i + 1} : ${problem}`);
      }
    });
  }
  assert.deepEqual(problems, []);
});

test('lecture des rubriques nommées : rubrique, section, chemin qui s’arrête sur une rubrique', () => {
  assert.match(checkPlace('Dans la rubrique Borne du menu système : « Mettre en veille », « Redémarrer la borne ».')!, /Mettre en veille.+Cyber Pinball, pas dans Borne/);
  assert.match(checkPlace('In the system menu\'s Borne (Cabinet) section: "Mettre en veille" (Sleep).')!, /pas dans Borne/);
  assert.match(checkPlace('Menu système > Borne : « Éteindre la borne », « Annuler ».')!, /Éteindre la borne/);
  assert.equal(checkPlace('Dans la rubrique Cyber Pinball, après « Quitter Cyber Pinball » : « Mettre en veille ».'), undefined);
  assert.equal(checkPlace('« Borne dédiée : activée » dans la rubrique Borne.'), undefined);
  assert.equal(checkPlace('« Mettre en veille », sans rubrique nommée.'), undefined);
});
