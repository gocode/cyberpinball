// Nouveautés (news.ts, app/src/news-menu.ts) : la chronologie des grandes nouveautés, choisie à la
// main (17/11/2026). Ces tests fixent la classe de comportement, pas un cas :
// - la liste reste une sélection : des nouveautés datées, la plus récente en haut, pas plus de
//   quatre le même jour ni plus de vingt-quatre en tout (jamais une ligne par version) ;
// - chacune existe en entier dans les deux langues, mène à une fonction qui existe, et a son aperçu
//   (sauf raison écrite), livré en français et en anglais (et rien d'autre dans le dossier) ;
// - la pastille rouge s'allume dès la première installation (la dernière date à voir), s'éteint
//   quand on ouvre l'écran, se rallume pour une nouveauté ajoutée ensuite ;
// - l'entrée est en tête du menu système tant que les nouveautés sont récentes ou pas vues, puis
//   seulement dans la rubrique Cyber Pinball ;
// - l'écran dit la date une seule fois par jour, « Nouveau » sur ce qui n'était pas vu, et chaque
//   nouveauté agrandie a « Essayer », grisé avec sa raison quand il ne peut pas servir.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { setLanguage } from '../i18n';
import { EN_MESSAGES } from '../i18n/en';
import { NEWS, NEWS_FILE, loadNewsState, markNewsSeen, newestNewsDate, saveNewsState, unreadNews, type NewsItem, type NewsReach } from '../news';
import { SYSTEM_GROUPS, SYSTEM_GROUP_IDS, SYSTEM_ITEM_IDS, SYSTEM_ROOT_ENTRIES } from '../systemmenu';
import { REPO_ROOT } from './i18n-scan';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nouveautes-'));
const PREVIEWS = path.join(REPO_ROOT, 'app', 'renderer', 'nouveautes');

/** Tous les textes d'une nouveauté, lus dans la langue du moment. */
const texts = (n: NewsItem) => [n.title, n.detail, ...n.more, n.where];

test('nouveautés : une sélection datée, la plus récente en haut, jamais une ligne par version', () => {
  setLanguage('fr');
  const ids = NEWS.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, 'identifiants uniques');
  for (const n of NEWS) {
    assert.match(n.id, /^[a-z0-9-]+$/, n.id);
    assert.match(n.date, /^\d{4}-\d{2}-\d{2}$/, n.id);
    assert.ok(!Number.isNaN(Date.parse(n.date)), n.id);
    assert.match(n.version, /^\d+\.\d+\.\d+$/, `${n.id} : la version finale qui l'a apportée`);
    assert.ok(n.more.length >= 1 && n.more.length <= 3, `${n.id} : une à trois phrases de détail`);
    assert.ok(n.detail.length <= 110, `${n.id} : la ligne tient en une phrase (${n.detail.length} signes)`);
    // Le texte agrandi tient dans sa case sans défiler (une borne n'a pas de souris) : 460 signes au plus, dans les deux langues.
    for (const lang of ['fr', 'en'] as const) {
      setLanguage(lang);
      const size = n.more.join(' ').length;
      assert.ok(size <= 460, `${n.id} (${lang}) : texte agrandi de ${size} signes, au-delà de 460 il ne tient plus au bureau`);
    }
    setLanguage('fr');
  }
  for (let i = 1; i < NEWS.length; i++) assert.ok(NEWS[i - 1]!.date >= NEWS[i]!.date, `${NEWS[i]!.id} : la plus récente en haut`);
  const perDay = new Map<string, number>();
  for (const n of NEWS) perDay.set(n.date, (perDay.get(n.date) ?? 0) + 1);
  for (const [date, count] of perDay) assert.ok(count <= 4, `${date} : ${count} nouveautés le même jour, la liste n'est plus une sélection`);
  assert.ok(NEWS.length <= 24, `${NEWS.length} nouveautés : retirer les plus anciennes plutôt qu'allonger la liste`);
});

test('nouveautés : chaque texte existe en anglais, en entier', () => {
  setLanguage('fr');
  const missing: string[] = [];
  for (const n of NEWS) for (const s of texts(n)) if (!EN_MESSAGES[s]) missing.push(`${n.id} : « ${s} »`);
  assert.deepEqual(missing, []);
  setLanguage('en');
  try {
    for (const n of NEWS) for (const s of texts(n)) assert.doesNotMatch(s, /[éèêàùç]|\b(?:les|des|une|votre|vos)\b/, `${n.id} : resté en français : ${s}`);
  } finally {
    setLanguage('fr');
  }
});

// La nouveauté du Menu système énumère sa racine : l'Arène y est entrée sans que le texte suive
// (« Huit rubriques » pour neuf, 21/11/2026). L'énumération suit SYSTEM_ROOT_ENTRIES, rubriques comprises.
test('nouveautés : la racine du Menu système décrite est la vraie', () => {
  setLanguage('fr');
  const n = NEWS.find((x) => x.id === 'menu-systeme');
  if (!n) return;
  const listed = /: ([^.]+)\./.exec(n.more[0]!)?.[1]?.split(', ') ?? [];
  assert.equal(listed.length, SYSTEM_ROOT_ENTRIES.length, `menu-systeme : ${listed.length} rubriques citées, la racine en a ${SYSTEM_ROOT_ENTRIES.length}`);
  for (const id of SYSTEM_ROOT_ENTRIES) {
    const group = (SYSTEM_GROUPS as Record<string, { label: string } | undefined>)[id];
    if (group) assert.ok(listed.includes(group.label), `menu-systeme : « ${group.label} » manque à l'énumération`);
  }
});

test('nouveautés : « Essayer » mène à une fonction qui existe', () => {
  const entries = new Set<string>([...SYSTEM_ITEM_IDS, ...SYSTEM_GROUP_IDS]);
  const ok = (r: NewsReach) => (r.kind === 'system' ? entries.has(r.id) : true);
  for (const n of NEWS) assert.ok(ok(n.reach), `${n.id} : ${JSON.stringify(n.reach)} n'est pas une entrée du menu système`);
});

// Une liste sans images était terne : 12 nouveautés sur 24 n'en avaient pas, l'aperçu étant
// facultatif (21/11/2026). Désormais chacune a le sien, un écran de la fonction ou une illustration ;
// l'exception s'écrit (`noPreview`, la raison), et chaque image a sa recette dans la démonstration
// interne des aperçus, pour être refaite quand l'écran change.
test('nouveautés : chacune a son aperçu, en français et en anglais, et rien d’autre', () => {
  for (const n of NEWS) if (n.noPreview !== undefined) assert.ok(n.noPreview.trim().length >= 30, `${n.id} : sans aperçu, la raison s'écrit en entier (noPreview)`);
  const wanted = new Set(NEWS.filter((n) => !n.noPreview).flatMap((n) => [`${n.id}-fr.webp`, `${n.id}-en.webp`]));
  const present = new Set(fs.existsSync(PREVIEWS) ? fs.readdirSync(PREVIEWS) : []);
  for (const f of wanted) assert.ok(present.has(f), `aperçu manquant : app/renderer/nouveautes/${f} (un écran de la fonction, ou une illustration)`);
  for (const f of present) assert.ok(wanted.has(f), `fichier sans nouveauté : app/renderer/nouveautes/${f}`);
  for (const f of wanted) {
    const size = fs.statSync(path.join(PREVIEWS, f)).size;
    assert.ok(size < 400_000, `${f} : ${Math.round(size / 1000)} ko, trop lourd pour un aperçu`);
    assert.ok(size > 6_000, `${f} : ${Math.round(size / 1000)} ko, une image presque vide n'est pas un aperçu`);
    const head = fs.readFileSync(path.join(PREVIEWS, f)).subarray(0, 12).toString('latin1');
    assert.ok(head.startsWith('RIFF') && head.endsWith('WEBP'), `${f} : pas un WebP`);
  }
  // Chaque aperçu se refait : son identifiant figure dans la recette (absente d'une copie publiée).
  const recipe = path.join(REPO_ROOT, 'interne', 'demos', 'nouveautes-apercus.ps1');
  if (fs.existsSync(recipe)) {
    const text = fs.readFileSync(recipe, 'utf8');
    for (const n of NEWS) if (!n.noPreview) assert.ok(text.includes(`'${n.id}'`), `${n.id} : aperçu sans recette dans la démonstration des aperçus`);
    // Et pas de recette d'une nouveauté retirée : elle referait une image sans ligne.
    const ids = new Set(NEWS.map((n) => n.id));
    for (const m of text.matchAll(/^\s*'([a-z0-9-]+)'\s*=/gm)) assert.ok(ids.has(m[1]!), `${m[1]} : recette d'une nouveauté qui n'est plus dans la liste`);
  }
});

test('nouveautés : pastille dès la première installation, éteinte une fois vues, rallumée par une nouvelle', () => {
  const dir = tmp();
  const file = path.join(dir, NEWS_FILE);
  // Pas encore de fichier : seule la dernière date est à voir (pas toute la chronologie).
  const first = loadNewsState(file);
  assert.equal(first.fresh, true);
  const newest = newestNewsDate()!;
  assert.deepEqual(
    unreadNews(first.state).map((n) => n.id),
    NEWS.filter((n) => n.date === newest).map((n) => n.id),
  );
  assert.ok(unreadNews(first.state).length > 0, 'la pastille s’allume dès la première installation');
  // Vues : gardé d'un démarrage à l'autre.
  assert.ok(markNewsSeen(first.state, unreadNews(first.state).map((n) => n.id)));
  assert.equal(markNewsSeen(first.state, [NEWS[0]!.id]), false, 'déjà vue : rien ne change');
  saveNewsState(file, first.state);
  const again = loadNewsState(file);
  assert.equal(again.fresh, false);
  assert.equal(unreadNews(again.state).length, 0);
  // Une nouveauté ajoutée par une version suivante : à voir, sans rallumer les anciennes.
  const later: NewsItem = { ...NEWS[0]!, id: 'plus-tard', date: '2099-01-01' };
  assert.deepEqual(unreadNews(loadNewsState(file, [later, ...NEWS]).state, [later, ...NEWS]).map((n) => n.id), ['plus-tard']);
  // Un fichier abîmé repart de l'état de départ, sans planter.
  fs.writeFileSync(file, '{ abîmé');
  assert.equal(loadNewsState(file).fresh, true);
});

test('nouveautés : dans Aide et infos seulement, la pastille sur la ligne de la rubrique', () => {
  // 20/11/2026 : « Nouveautés est très bien dans Aide et infos, pas besoin de l'avoir dans le menu principal ».
  assert.ok(SYSTEM_GROUPS.aide.entries.includes('news'));
  assert.ok(!SYSTEM_ROOT_ENTRIES.includes('news'));
});

/* eslint-disable @typescript-eslint/no-require-imports */
interface Built {
  heading: string;
  subheading?: string;
  sections: { kind?: string; rows: { text: string; detail?: string; action?: number; news?: { date: string; version: string; first: boolean; last: boolean; preview?: string; unread?: boolean; badges: { text: string; kind: string }[] } }[] }[];
  actions: { label: string; tone?: string; detail?: string; run: () => void }[];
  newsPage?: { preview?: string; lines: string[]; where: string };
  back: () => void;
}
const { createNewsMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'news-menu.js')) as {
  createNewsMenu(host: object): { open(back?: () => void): void; unread(): number; item: { attention?: boolean; detail?: string; run(): void } };
};
/* eslint-enable @typescript-eslint/no-require-imports */

function newsScreen(dataDir: string, reach: (r: NewsReach) => { run?: () => void; gone?: string } = () => ({ run: () => undefined }), now = Date.parse(`${newestNewsDate()}T12:00:00`)) {
  const opened: (() => Built)[] = [];
  const did: string[] = [];
  const menu = createNewsMenu({
    dataDir,
    library: { openCustom: (build: () => Built) => opened.push(build), openSystem: () => did.push('menu système') },
    reach: (r: NewsReach, back: () => void) => {
      const out = reach(r);
      return out.run ? { run: () => { did.push(`essayer ${JSON.stringify(r)}`); back(); } } : out;
    },
    now: () => now,
  });
  return { menu, did, shown: () => opened.at(-1)!() };
}

test('nouveautés, écran : la date une fois par jour, « Nouveau » sur ce qui n’était pas vu, la pastille part à l’ouverture', () => {
  setLanguage('fr');
  const dir = tmp();
  const { menu, shown } = newsScreen(dir);
  assert.equal(menu.item.attention, true, 'pastille dès la première installation');
  assert.match(menu.item.detail!, /nouvelles? :/);
  menu.open();
  assert.equal(menu.item.attention, false, 'ouvrir l’écran, c’est les avoir vues');
  const view = shown();
  const rows = view.sections.flatMap((s) => s.rows);
  assert.equal(rows.length, NEWS.length);
  assert.equal(view.sections[0]!.kind, 'news');
  rows.forEach((r, i) => {
    const first = i === 0 || NEWS[i - 1]!.date !== NEWS[i]!.date;
    assert.equal(r.news!.first, first, `${NEWS[i]!.id} : date dite ${first ? '' : 'pas '}sur cette ligne`);
    assert.equal(r.action, i, 'chaque ligne s’ouvre');
    assert.equal(Boolean(r.news!.preview), !NEWS[i]!.noPreview);
  });
  assert.equal(rows.at(-1)!.news!.last, true);
  const newest = newestNewsDate();
  for (const [i, r] of rows.entries()) assert.equal(r.news!.badges.some((b) => b.kind === 'new'), NEWS[i]!.date === newest, `${NEWS[i]!.id} : « Nouveau » sur la dernière date seulement`);
  assert.match(view.subheading!, /nouvelles? depuis votre dernière visite/);
  // Revenue plus tard : plus rien de nouveau, plus de pastille, le fichier l'a gardé.
  const later = newsScreen(dir);
  assert.equal(later.menu.item.attention, false);
  later.menu.open();
  assert.ok(later.shown().sections[0]!.rows.every((r) => !r.news!.badges.some((b) => b.kind === 'new')));
});

test('nouveautés, écran : une nouveauté agrandie, « Essayer » qui mène à sa fonction ou dit pourquoi pas', () => {
  setLanguage('fr');
  const { menu, did, shown } = newsScreen(tmp(), (r) => (r.kind === 'community' ? { gone: 'Indisponible : partage désactivé (Partage et réseau)' } : { run: () => undefined }));
  menu.open();
  const i = NEWS.findIndex((n) => n.reach.kind === 'system');
  shown().actions[i]!.run();
  const page = shown();
  assert.equal(page.heading, NEWS[i]!.title);
  assert.deepEqual(page.newsPage!.lines, [...NEWS[i]!.more]);
  assert.match(page.newsPage!.where, /^Où : /);
  assert.match(page.actions[0]!.label, /^Essayer : /);
  page.actions[0]!.run();
  assert.equal(did.at(-1), `essayer ${JSON.stringify(NEWS[i]!.reach)}`);
  assert.equal(shown().heading, NEWS[i]!.title, '« Retour » de la fonction : la nouveauté');
  // Une porte fermée : « Essayer » grisé, sa raison dessous, et rien ne s'ouvre.
  const c = NEWS.findIndex((n) => n.reach.kind === 'community');
  menu.open();
  shown().actions[c]!.run();
  const closed = shown();
  assert.equal(closed.actions[0]!.tone, 'quiet');
  assert.match(closed.actions[0]!.detail!, /partage désactivé/);
  // Précédente et Suivante seulement là où il y en a une ; « Retour à la liste » toujours.
  menu.open();
  shown().actions[0]!.run();
  assert.ok(!shown().actions.some((a) => a.label === '‹ Précédente'));
  assert.ok(shown().actions.some((a) => a.label === 'Suivante ›'));
  assert.equal(shown().actions.at(-1)!.label, 'Retour à la liste');
  shown().actions.at(-1)!.run();
  assert.equal(shown().heading, 'Nouveautés');
});

test('nouveautés, écran : en anglais aussi, rien ne reste en français', () => {
  setLanguage('en');
  try {
    const { menu, shown } = newsScreen(tmp());
    menu.open();
    const view = shown();
    assert.equal(view.heading, 'What’s new');
    for (const r of view.sections[0]!.rows) assert.equal(r.news!.date, new Date(`${NEWS[view.sections[0]!.rows.indexOf(r)]!.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
    view.actions[0]!.run();
    const page = shown();
    assert.match(page.actions[0]!.label, /^Try it: /);
    assert.match(page.newsPage!.where, /^Where: /);
    assert.ok(page.newsPage!.preview === undefined || page.newsPage!.preview.endsWith('-en.webp'));
  } finally {
    setLanguage('fr');
  }
});
