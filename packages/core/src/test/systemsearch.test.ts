import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { messagesOf, say, setLanguage, type LaterText } from '../i18n';
import { placeNames, placeTargets, searchKey, searchSystem, searchText, type SearchPlace } from '../systemsearch';
import { SEARCH_PLACES } from '../systemsearch-places';
import { SYSTEM_GROUPS, SYSTEM_ITEM_IDS, SYSTEM_ITEMS, systemPathOf, type SystemEntryId } from '../systemmenu';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const everything = () => true;

/** Tous les fichiers .ts d'un dossier, sous-dossiers compris (sans les tests). */
function sources(dir: string): string {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'test' && entry.name !== 'i18n') out.push(sources(full));
    } else if (entry.name.endsWith('.ts')) out.push(fs.readFileSync(full, 'utf8'));
  }
  return out.join('\n');
}

const allNames = (place: SearchPlace): LaterText[] => [...(place.steps ?? []).flatMap((s) => [...placeNames(s)]), ...placeTargets(place)];
const describe = (place: SearchPlace) => `${place.parent} › ${[...(place.steps ?? []).map((s) => placeNames(s)[0]!.key), place.target.key].join(' › ')}`;
const sameStart = (text: string, start: string) => text.toLocaleLowerCase('fr').startsWith(start.toLocaleLowerCase('fr'));

test('recherche : « Rechercher » est en tête d’Aide et infos, et la racine ne change pas', () => {
  assert.equal(SYSTEM_GROUPS.aide.entries[0], 'search');
  assert.deepEqual(systemPathOf('search'), ['aide']);
});

test('recherche : chaque entrée et chaque rubrique se trouvent par leur propre nom, en français et en anglais', () => {
  try {
    for (const lang of ['fr', 'en'] as const) {
      setLanguage(lang);
      for (const id of SYSTEM_ITEM_IDS) {
        if (id === 'search') continue;
        const found = searchSystem(SYSTEM_ITEMS[id].label, everything).slice(0, 5);
        assert.ok(found.some((r) => r.target.kind === 'item' && r.target.id === id), `${lang} : « ${SYSTEM_ITEMS[id].label} » ne trouve pas son entrée (${found.map((r) => r.label).join(', ')})`);
      }
      for (const [id, g] of Object.entries(SYSTEM_GROUPS)) {
        const found = searchSystem(g.label, everything).slice(0, 5);
        assert.ok(found.some((r) => r.target.kind === 'group' && r.target.id === id), `${lang} : la rubrique « ${g.label} » ne se trouve pas`);
      }
    }
  } finally {
    setLanguage('fr');
  }
});

test('recherche : chaque réglage déclaré se trouve par son nom, et son chemin le situe', () => {
  setLanguage('fr');
  for (const place of SEARCH_PLACES) {
    const found = searchSystem(say(place.target), everything);
    const mine = found.find((r) => r.target.kind === 'place' && r.target.place === place);
    assert.ok(mine, `« ${describe(place)} » introuvable par son nom`);
    assert.ok(mine.path.includes(SYSTEM_ITEMS[place.parent].label), `« ${describe(place)} » : le chemin ne nomme pas son entrée`);
  }
});

test('recherche : chaque libellé déclaré existe dans le code (début d’une chaîne de l’application ou du cœur)', () => {
  // Le moteur retrouve la ligne à l'écran par le début de son libellé (actionIndex, library.ts) : un libellé
  // qui n'existe plus dans le code (renommé, retiré) mènerait la recherche nulle part.
  const code = sources(path.join(REPO, 'app', 'src')) + sources(path.join(REPO, 'packages', 'core', 'src'));
  const literals = [...code.matchAll(/(['"`])((?:\\.|(?!\1).)*?)\1/g)].map((m) => m[2]!.replace(/\\(.)/g, '$1'));
  const declaration = fs.readFileSync(path.join(REPO, 'packages', 'core', 'src', 'systemsearch-places.ts'), 'utf8');
  const missing: string[] = [];
  for (const place of SEARCH_PLACES) {
    for (const name of allNames(place)) {
      // Le libellé lui-même compte, pas sa déclaration ici.
      const uses = literals.filter((l) => sameStart(l, name.key)).length;
      const declared = [...declaration.matchAll(new RegExp(`tLater\\('${name.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\)`, 'g'))].length;
      if (uses <= declared) missing.push(`${describe(place)} : « ${name.key} »`);
    }
  }
  assert.deepEqual(missing, [], 'libellés introuvables dans le code');
});

test('recherche : en anglais, chaque nom déclaré commence comme la ligne affichée', () => {
  // La ligne affichée est la traduction du libellé complet (« Table order: {order} ») ; le nom déclaré
  // (« Ordre des tables ») doit en être le début dans les deux langues, sinon la ligne ne se retrouve pas.
  const en = messagesOf('en');
  // Textes plus longs qui commencent comme un nom déclaré sans être sa ligne (le détail d'une autre carte).
  const notLines = new Set(['Activer le partage, le réseau local et la présence publique']);
  const wrong: string[] = [];
  for (const place of SEARCH_PLACES) {
    for (const name of allNames(place)) {
      const mine = en[name.key];
      if (mine === undefined) continue; // le test i18n le signale
      const longer = Object.entries(en).filter(([source]) => source !== name.key && !notLines.has(source) && sameStart(source, name.key));
      if (longer.length && !longer.some(([, text]) => sameStart(text, mine))) wrong.push(`« ${name.key} » → « ${mine} », lignes : ${longer.map(([, x]) => `« ${x} »`).join(', ')}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('recherche : un réglage n’est déclaré qu’une fois', () => {
  const keys = SEARCH_PLACES.map((p) => searchKey({ kind: 'place', place: p }));
  assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), []);
});

test('recherche : sans accents ni majuscules, par le début des mots, les noms avant les mots-clés', () => {
  setLanguage('fr');
  assert.equal(searchText('  Écran du DMD — l’ouverture  '), 'ecran du dmd l ouverture');
  assert.equal(searchSystem('logo', everything)[0]?.label, 'Logos animés');
  assert.ok(searchSystem('ecran du dmd', everything).some((r) => r.label === 'Écran du DMD'));
  assert.deepEqual(searchSystem('   ', everything), []);
  // Plusieurs mots : tous doivent se trouver (« volume musique » : la musique, pas le volume du lancement).
  const volume = searchSystem('volume musique', everything);
  assert.equal(volume[0]?.label, 'Volume de la musique');
  assert.ok(!volume.some((r) => r.label === 'Volume du lancement'));
  // Une ligne ne se trouve pas par son seul chemin : « dmd » ne remonte pas « Image du front-end » (DMD réel).
  assert.ok(!searchSystem('dmd', everything).some((r) => r.label === 'Image du front-end'));
  // L'autre nom d'une bascule la trouve aussi.
  assert.ok(searchSystem('désactiver vision', everything).some((r) => r.label === 'Activer la Vision 3D'));
  // Un mot-clé : « kinect » trouve la Vision 3D.
  assert.ok(searchSystem('kinect', everything).some((r) => r.target.kind === 'item' && r.target.id === 'vision3d'));
});

test('recherche : seulement ce que le menu montre sur cette borne', () => {
  setLanguage('fr');
  const hidden = new Set<SystemEntryId>(['wheel', 'tables']);
  const found = searchSystem('logos', (id) => !hidden.has(id));
  assert.ok(!found.some((r) => r.target.kind === 'place' && r.target.place.parent === 'wheel'), 'un réglage dont l’entrée est absente ne se propose pas');
  assert.ok(!searchSystem('tables', (id) => !hidden.has(id)).some((r) => r.target.kind === 'group' && r.target.id === 'tables'));
  // La recherche ne se trouve pas elle-même.
  assert.ok(!searchSystem('rechercher', everything).some((r) => r.target.kind === 'item' && r.target.id === 'search'));
});

test('recherche : l’application branche la recherche (Aide et infos, lettre tapée, résultats à chaque lettre)', () => {
  const menu = fs.readFileSync(path.join(REPO, 'app', 'src', 'system-search-menu.ts'), 'utf8');
  assert.match(menu, /provideSystemItem\('search',/);
  assert.match(menu, /provideTypeToSearch\(/);
  assert.match(menu, /\{ live \}/);
  const library = fs.readFileSync(path.join(REPO, 'app', 'src', 'library.ts'), 'utf8');
  // Une lettre tapée ouvre la recherche dans le Menu système, jamais une touche relevée comme bouton de la borne.
  assert.match(library, /if \(screen\.kind === 'system' && typeToSearch && host\.guest\.allows\('menu\.system'\)\)/);
  assert.match(library, /if \(buttons\.includes\(input\.code\) \|\| input\.code === CONFIG_KEY/);
  const frontend = fs.readFileSync(path.join(REPO, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(frontend, /createSystemSearch\(\{ library \}\);/);
});
