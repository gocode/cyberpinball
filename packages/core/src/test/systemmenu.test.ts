import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { setLanguage } from '../i18n';
import { MANUAL, MANUAL_TESTS_EN, MANUEL, TESTS_MANUELS, splitFiles } from './manuels';
import { frontendSource } from './frontend-source';
import {
  isSystemGroup,
  MAX_SYSTEM_ENTRIES,
  SYSTEM_GROUP_IDS,
  SYSTEM_GROUPS,
  SYSTEM_ITEM_IDS,
  SYSTEM_ITEMS,
  SYSTEM_ROOT,
  SYSTEM_ROOT_ENTRIES,
  SYSTEM_ROOT_ITEMS,
  systemEntry,
  systemPathOf,
  type SystemEntryId,
  type SystemGroupId,
  type SystemItemId,
} from '../systemmenu';
import { loadSystemMemory, saveSystemMemory, SYSTEM_MEMORY_FILE } from '../systemmemory';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const APP = path.join(REPO, 'app', 'src');

test('menu système : la ligne d’une rubrique dit son nom, jamais l’état ni le badge d’une de ses entrées (Réalité virtuelle et vision 3D)', () => {
  // 20/11/2026 : la ligne parente affichait « Réalité virtuelle : désactivée BÊTA » (l'entrée de tête, décidée le
  // 13/11/2026) alors que la rubrique contient aussi la vision 3D. L'état et le BÊTA se lisent en entrant, sur l'entrée.
  setLanguage('fr');
  assert.equal(SYSTEM_GROUPS['realite-virtuelle'].label, 'Réalité virtuelle et vision 3D');
  for (const id of SYSTEM_GROUP_IDS) assert.ok(!('lead' in SYSTEM_GROUPS[id]), `${id} : plus d’entrée de tête`);
  const library = fs.readFileSync(path.join(APP, 'library.ts'), 'utf8');
  assert.match(library, /const item = isSystemGroup\(id\) \? undefined : systemItems\.get\(id\);/);
  // Ce que dit l'entrée (son badge compris) est lu à l'ouverture de la rubrique et gardé (kept, 17/11/2026).
  assert.match(library, /\s+badge: item\?\.badge,\s/);
  assert.match(library, /\.\.\.\(shown\.badge && \{ badge: shown\.badge \}\),/);
  // L'entrée d'activation garde son badge et son état (frontend.ts).
  assert.match(frontendSource(), /library\.provideSystemItem\('vr', \{\s*\/\/[^\n]*\n\s*badge: 'beta',\s*get label\(\) \{\s*return vrMenuText\(vrMode, probeVr\(\)\)\.label;/);
});

test('menu système : chaque entrée est rangée une fois, à la racine ou sous une seule rubrique', () => {
  const seen = new Map<SystemEntryId, SystemGroupId | 'racine'>();
  for (const id of SYSTEM_ROOT_ENTRIES) seen.set(id, 'racine');
  for (const group of SYSTEM_GROUP_IDS) {
    for (const id of SYSTEM_GROUPS[group].entries) {
      // 20/11/2026 : plus de raccourcis à la racine qui doublent une rubrique (« une entrée n'a qu'une place »).
      assert.ok(!seen.has(id), `« ${id} » est rangée dans « ${seen.get(id)} » et dans « ${group} »`);
      seen.set(id, group);
    }
  }
  for (const id of SYSTEM_ITEM_IDS) assert.ok(seen.has(id), `« ${id} » n'est rangée nulle part`);
  for (const group of SYSTEM_GROUP_IDS) assert.ok(systemPathOf(group), `« ${group} » n'est accessible depuis aucune rubrique`);
});

test('menu système : aucun écran ne dépasse huit lignes', () => {
  // 20/11/2026 : Borne avait 17 lignes, Cyber Pinball 14, Communauté 12 ; on ne voyait plus la liste
  // d'un coup d'œil. Une entrée de plus va dans une sous-rubrique, jamais au bout d'une liste.
  assert.equal(MAX_SYSTEM_ENTRIES, 8);
  assert.ok(SYSTEM_ROOT_ENTRIES.length <= MAX_SYSTEM_ENTRIES, `la racine a ${SYSTEM_ROOT_ENTRIES.length} lignes`);
  for (const group of SYSTEM_GROUP_IDS) {
    // Bureau Windows et l'Explorateur ne sont jamais fournis ensemble (l'un remplace l'autre en borne dédiée).
    const shown = SYSTEM_GROUPS[group].entries.filter((id) => id !== 'explorer');
    assert.ok(shown.length <= MAX_SYSTEM_ENTRIES, `« ${SYSTEM_GROUPS[group].label} » a ${shown.length} lignes`);
  }
});

test('menu système : la racine suit l’usage, « Quitter ou éteindre » en dernier', () => {
  assert.deepEqual(SYSTEM_ROOT_ENTRIES.filter((id) => isSystemGroup(id)), [...SYSTEM_ROOT]);
  assert.deepEqual(SYSTEM_ROOT_ENTRIES.filter((id) => !isSystemGroup(id)), [...SYSTEM_ROOT_ITEMS]);
  // Ordre décidé le 20/11/2026 : ce qu'on ouvre le plus d'abord ; Quitter ou éteindre en dernier,
  // à deux appuis du flipper gauche depuis l'ouverture (la liste boucle, Retour entre les deux).
  assert.deepEqual(SYSTEM_ROOT_ENTRIES, ['tables', 'borne', 'downloads', 'activity', 'amis', 'jukebox', 'aide', 'quitter']);
  // Langue dans la Configuration de la borne, Nouveautés dans Aide et infos, Collections et Migration dans Tables.
  assert.deepEqual(systemPathOf('news'), ['aide']);
  assert.deepEqual(systemPathOf('collections'), ['tables']);
  assert.deepEqual(systemPathOf('migration'), ['tables']);
  assert.deepEqual(systemPathOf('backups'), ['borne', 'sante']);
  assert.deepEqual(systemPathOf('follow'), ['aide']);
  assert.ok(!(SYSTEM_ITEM_IDS as readonly string[]).includes('language'), 'la langue est une ligne de la Configuration de la borne');
});

test('menu système : il s’ouvre sur la dernière entrée choisie à sa racine, gardée sur le disque', () => {
  // 20/11/2026 : l'ordre reste fixe, le curseur suit les habitudes ; gardée pour survivre à l'extinction.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-menu-systeme-'));
  assert.equal(loadSystemMemory(dir), undefined, 'rien de gardé : la première ligne');
  saveSystemMemory(dir, 'quitter');
  assert.equal(loadSystemMemory(dir), 'quitter');
  // Une entrée qui n'est plus à la racine (une version suivante l'a rangée ailleurs) : oubliée.
  fs.writeFileSync(path.join(dir, SYSTEM_MEMORY_FILE), JSON.stringify({ last: 'cyberpinball' }));
  assert.equal(loadSystemMemory(dir), undefined);
  fs.writeFileSync(path.join(dir, SYSTEM_MEMORY_FILE), '{ abîmé');
  assert.equal(loadSystemMemory(dir), undefined, 'un fichier abîmé ne bloque rien');
  const library = fs.readFileSync(path.join(APP, 'library.ts'), 'utf8');
  assert.match(library, /systemChosen = systemLast;/, 'depuis les tables, le curseur va sur la dernière entrée');
  assert.match(library, /if \(systemGroup === undefined\) \{[\s\S]{0,300}saveSystemMemory\(host\.dataDir, id\);/, 'retenue quand on la choisit à la racine');
});

test('menu système : la Communauté et Mon compte ne vivent qu’à un endroit, l’accueil du médaillon', () => {
  // 20/11/2026 : la rubrique Communauté doublait l'accueil du médaillon, et Mon compte ce qu'on y trouve de soi.
  assert.ok(!SYSTEM_ROOT_ENTRIES.includes('compte'));
  assert.deepEqual(systemPathOf('compte'), ['amis', 'mon-profil']);
  assert.deepEqual(systemPathOf('local-play'), ['amis', 'reglages-communaute']);
  const community = fs.readFileSync(path.join(APP, 'community-menu.ts'), 'utf8');
  assert.match(community, /lib\.openSystemGroupFrom\('amis', back\)/, 'le médaillon ouvre la rubrique elle-même');
  assert.doesNotMatch(community, /function buildHome/, 'plus d’accueil dessiné à part');
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

/** Segments d'un chemin « Menu système > A > B » : le texte entre guillemets, sinon le texte jusqu'à la ponctuation (« · » compris : la suite d'une notification). */
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
      // L'apostrophe droite ferme une chaîne de code (t('Menu système > Amis')) ; suivie d'une lettre,
      // elle est dans le nom (« System menu > What's new », CHANGELOG anglais de la 0.1.14-essai.33).
      const plain = /^((?:[^.;:,()«»"“”*>`'·]|'(?=\p{L}))+?)(?=\s*(?:>|[.;:,()`·]|'(?!\p{L})|$))/u.exec(text);
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
  // La racine telle qu'elle s'affiche : les rubriques et Téléchargements (raccourci).
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
  const docs = [MANUEL, MANUAL, TESTS_MANUELS, MANUAL_TESTS_EN].flatMap(splitFiles).map((f) => path.join(REPO, f));
  const readmes = ['README.md', 'README.fr.md', 'CHANGELOG.md', 'CHANGELOG.en.md'].map((f) => path.join(REPO, f));
  // Les notes des branches (changements/) deviennent le CHANGELOG à la publication : relues dès la
  // branche, sinon un chemin faux n'apparaît qu'une fois publié (« System menu > My account section »,
  // 0.1.16-essai.12).
  const changes = path.join(REPO, 'changements');
  const notes = fs.existsSync(changes) ? fs.readdirSync(changes).filter((f) => f.endsWith('.md')).map((f) => path.join(changes, f)) : [];
  const code = [APP, path.join(REPO, 'packages', 'core', 'src'), path.join(REPO, 'packages', 'core', 'src', 'i18n', 'en')].flatMap((dir) =>
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => path.join(dir, f)),
  );
  return [...docs, ...readmes, ...notes, ...code].filter((f) => fs.existsSync(f));
}

/**
 * Lignes d'un fichier à relire. D'un CHANGELOG, seulement la version en cours (première section
 * « ## ») : ses notes, encore à publier, décrivent le menu d'aujourd'hui ; les anciennes, celui de
 * leur version. Les autres lignes restent vides, pour garder leurs numéros.
 */
function linesOf(file: string): string[] {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  if (!path.basename(file).startsWith('CHANGELOG')) return lines;
  const start = lines.findIndex((l) => l.startsWith('## '));
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines.map((l, i) => (start >= 0 && i > start && (end < 0 || i < end) ? l : ''));
}

test('les chemins « Menu système > … » du manuel et de l’interface existent', () => {
  const problems: string[] = [];
  for (const file of textFiles()) {
    const lines = linesOf(file);
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
  assert.deepEqual(segments("Amis > Demandes d’amis'),"), ['Amis', 'Demandes d’amis'], 'chemin dans une chaîne de code');
  assert.deepEqual(segments("What's new): the big new things"), ["What's new"], 'apostrophe droite dans un nom anglais');
  assert.deepEqual(segments("Friends > Friend's requests'),"), ['Friends', "Friend's requests"], 'apostrophe dans le nom, puis fin de la chaîne de code');
  assert.equal(checkPath(segments("Help and info > What's new): the big new things")), undefined, '« What’s new » est dans Aide et infos');
  assert.deepEqual(segments('Amis · vous : place 2 sur 3 »'), ['Amis'], 'la suite d’une notification, après « · »');
  assert.equal(checkPath(['Configuration de la borne']), '« Configuration de la borne » n\'est pas dans les rubriques (Tables, Ma borne, Téléchargements, Activité récente, Communauté, Juke-box, Aide et infos, Quitter ou éteindre)');
  assert.equal(checkPath(['Téléchargements']), undefined, 'Téléchargements, à la racine');
  assert.match(checkPath(['Tables', 'Téléchargements'])!, /n'est pas dans cette rubrique/, 'et seulement là (20/11/2026)');
  assert.equal(checkPath(['Ma borne', 'Configuration de la borne', 'Language / Langue']), undefined, 'la configuration ouvre son propre écran');
  assert.equal(checkPath(['My cabinet', 'Cabinet setup', 'Tilt']), undefined);
  assert.equal(checkPath(['Communauté', 'Mon profil', 'Mon compte', 'Supprimer mon compte']), undefined);
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
    const lines = linesOf(file);
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
  assert.match(checkPlace('Dans la rubrique Ma borne du menu système : « Mettre en veille », « Redémarrer la borne ».')!, /Mettre en veille.+Quitter ou éteindre, pas dans Ma borne/);
  assert.match(checkPlace('In the system menu\'s Ma borne (My cabinet) section: "Mettre en veille" (Sleep).')!, /pas dans Ma borne/);
  assert.match(checkPlace('Menu système > Ma borne : « Éteindre la borne », « Annuler ».')!, /Éteindre la borne/);
  assert.equal(checkPlace('Dans la rubrique Quitter ou éteindre, après « Quitter Cyber Pinball » : « Mettre en veille ».'), undefined);
  assert.equal(checkPlace('« Borne dédiée : activée » dans la rubrique Ma borne.'), undefined);
  assert.equal(checkPlace('« Mettre en veille », sans rubrique nommée.'), undefined);
});
