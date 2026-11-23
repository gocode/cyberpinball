// Accès direct aux menus depuis le téléphone (remote-menus.ts, app/src/phone-remote.ts,
// app/renderer/telephone/telephone.js) : l'arbre envoyé au téléphone suit celui du menu système
// sans liste recopiée (un menu ajouté paraît tout seul), le téléphone n'envoie que des identifiants
// que la borne vérifie, et le mode invité y vaut comme à la borne. Le parcours de bout en bout, dans
// de vraies pages hors écran : telecommande.test.ts (demo-telephone-menus.cjs).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  ICON_NAMES,
  isSystemGroup,
  parsePhoneMessage,
  REMOTE_ENTRIES_MAX,
  remoteEntries,
  remoteMenuTarget,
  remoteMenuTree,
  remoteLayout,
  REMOTE_SECTION_LAYOUT,
  SYSTEM_GROUP_IDS,
  SYSTEM_GROUPS,
  SYSTEM_ITEM_IDS,
  SYSTEM_ITEMS,
  SYSTEM_ROOT_ENTRIES,
  toRemoteEntry,
  type RemoteMenuNode,
  type SystemItemId,
} from '../index';
import { REPO_ROOT } from './i18n-scan';
import { frontendSource } from './frontend-source';

const read = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');
const ids = (nodes: RemoteMenuNode[]): string[] => nodes.flatMap((n) => [n.id, ...ids(n.entries ?? [])]);

test('accès direct : l’arbre du téléphone reprend celui du menu système, dans son ordre, sans liste recopiée', () => {
  const tree = remoteMenuTree(() => ({}));
  assert.deepEqual(
    tree.map((n) => n.id),
    [...SYSTEM_ROOT_ENTRIES],
  );
  // Chaque rubrique, dans l'ordre de la borne ; chaque entrée de chaque rubrique y est (un menu ajouté à l'arbre paraît donc tout seul).
  const walk = (nodes: RemoteMenuNode[]) => {
    for (const n of nodes) {
      if (!isSystemGroup(n.id as never)) continue;
      assert.deepEqual(
        n.entries?.map((e) => e.id),
        [...SYSTEM_GROUPS[n.id as keyof typeof SYSTEM_GROUPS].entries],
        n.id,
      );
      assert.equal(n.label, SYSTEM_GROUPS[n.id as keyof typeof SYSTEM_GROUPS].label);
      walk(n.entries ?? []);
    }
  };
  walk(tree);
  const all = new Set(ids(tree));
  for (const id of [...SYSTEM_ITEM_IDS, ...SYSTEM_GROUP_IDS]) assert.ok(all.has(id), `${id} absent de l’arbre du téléphone`);
  for (const id of all) assert.ok(remoteMenuTarget(id), `${id} : le téléphone l’envoie, la borne doit le reconnaître`);
  // Chaque entrée garde son nom et son icône de l'arbre ; une icône hors du registre ne part jamais.
  for (const n of tree.filter((x) => !x.entries)) assert.equal(n.icon, SYSTEM_ITEMS[n.id as SystemItemId].icon);
});

test('accès direct : une entrée que la borne ne fournit pas n’y est pas, ni une rubrique dont il ne reste rien (comme à la borne) ; indisponible et pastille suivent', () => {
  const provided = new Set<SystemItemId>(['phone-remote', 'vr', 'updates']);
  const tree = remoteMenuTree((id) => (provided.has(id) ? { detail: id === 'vr' ? 'Indisponible : aucun casque' : 'ok', tone: id === 'vr' ? 'quiet' : undefined, attention: id === 'updates' } : undefined));
  // 20/11/2026 : une rubrique vide (jeu local, entrées absentes de cette borne) n'est plus montrée, à la borne comme au téléphone.
  assert.deepEqual(new Set(ids(tree)), new Set(['borne', 'phone-remote', 'realite-virtuelle', 'vr', 'aide', 'updates']));
  assert.equal(tree.find((n) => n.id === 'amis'), undefined, 'une rubrique sans entrée fournie : absente');
  const borne = tree.find((n) => n.id === 'borne')!;
  const vr = borne.entries!.find((n) => n.id === 'realite-virtuelle')!.entries!.find((n) => n.id === 'vr')!;
  assert.equal(vr.quiet, true, 'indisponible : grisée');
  assert.equal(vr.detail, 'Indisponible : aucun casque', 'avec sa raison');
  assert.equal(tree.find((n) => n.id === 'aide')?.attention, true, 'la pastille rouge remonte à la rubrique');
  assert.equal(borne.attention, undefined);
});

test('accès direct : le téléphone ne demande que des identifiants, bornés ; tout autre identifiant est ignoré', () => {
  assert.deepEqual(parsePhoneMessage({ t: 'pick', s: 3, v: 12, i: 4 }), { t: 'pick', s: 3, v: 12, i: 4 });
  for (const bad of [{ v: '1', i: 0 }, { v: 1, i: -1 }, { v: 1, i: 1.5 }, { v: -1, i: 0 }, { v: 1, i: REMOTE_ENTRIES_MAX }, { v: 1 }, { i: 0 }, { v: 1, i: '0' }])
    assert.equal(parsePhoneMessage({ t: 'pick', s: 3, ...bad }), undefined, JSON.stringify(bad));
  assert.deepEqual(parsePhoneMessage({ t: 'open', s: 3, id: 'phone-remote' }), { t: 'open', s: 3, id: 'phone-remote' });
  for (const id of ['../data', 'C:\\Windows', 'Borne', 'phone remote', '', 'x'.repeat(41), 'quit;shutdown', { id: 'borne' }])
    assert.equal(parsePhoneMessage({ t: 'open', s: 3, id }), undefined, String(id));
  // Classements (vue Scores) : une portée et une période connues, et un rang de la liste avec sa version, ou rien.
  assert.deepEqual(parsePhoneMessage({ t: 'ranks', s: 3, scope: 'world', period: 'week' }), { t: 'ranks', s: 3, scope: 'world', period: 'week' });
  assert.deepEqual(parsePhoneMessage({ t: 'ranks', s: 3, scope: 'cabinet', period: 'all', v: 2, i: 7 }), { t: 'ranks', s: 3, scope: 'cabinet', period: 'all', table: { v: 2, i: 7 } });
  for (const bad of [{ scope: 'galaxie', period: 'all' }, { scope: 'world', period: 'month' }, { scope: 'world' }, { period: 'all' }, { scope: 'world', period: 'all', v: 1 }, { scope: 'world', period: 'all', i: 0 }, { scope: 'world', period: 'all', v: 1, i: -1 }, { scope: 'world', period: 'all', v: 1, i: REMOTE_ENTRIES_MAX }, { scope: 'world', period: 'all', v: 1, i: 'C:\\tables\\x.vpx' }, { scope: '__proto__', period: 'all' }])
    assert.equal(parsePhoneMessage({ t: 'ranks', s: 3, ...bad }), undefined, JSON.stringify(bad));
  assert.deepEqual(parsePhoneMessage({ t: 'ranks-off', s: 4 }), { t: 'ranks-off', s: 4 });
  // Lisible mais inconnu : la borne ne l'ouvre pas.
  for (const id of ['unknown', 'all-tables-x', 'constructor', 'toString', '__proto__']) assert.equal(remoteMenuTarget(id), undefined, id);
  assert.deepEqual(remoteMenuTarget('wheel'), { kind: 'wheel' });
  assert.deepEqual(remoteMenuTarget('in-game'), { kind: 'in-game' });
  assert.deepEqual(remoteMenuTarget('migration'), { kind: 'system', id: 'migration' });
});

test('accès direct : une entrée part bornée, sans caractère de contrôle, sans rien d’autre que ce que le téléphone montre', () => {
  const e = toRemoteEntry({ label: `Neon\u0007 Abyss ${'x'.repeat(300)}`, detail: 'ligne\nsuivante', icon: 'pas-une-icone', tone: 'quiet', attention: true, ...({ run: () => undefined, key: 'table:C:\\tables\\neon.vpx', file: 'C:\\x' } as object) } as never);
  assert.deepEqual(Object.keys(e).sort(), ['attention', 'detail', 'label', 'quiet']);
  assert.equal(e.label.length, 120);
  assert.ok(!/[\u0000-\u001f]/.test(e.label + e.detail));
  assert.ok((ICON_NAMES as readonly string[]).includes(toRemoteEntry({ label: 'a', icon: 'phone' }).icon!));
  const many = remoteEntries({ kind: 'screen', title: 'T', items: Array.from({ length: REMOTE_ENTRIES_MAX + 10 }, (_, i) => ({ label: String(i) })), current: REMOTE_ENTRIES_MAX + 5 });
  assert.equal(many.items.length, REMOTE_ENTRIES_MAX);
  assert.equal(many.current, -1, 'un choix hors de la liste envoyée : aucun');
});

test('accès direct : chaque rôle de section que la borne dessine à part a son dessin décidé au téléphone (badges ou lignes)', () => {
  // Les phrases préparées, en badges à la borne, arrivaient au téléphone en grandes cases l'une sous
  // l'autre (18/11/2026) : la borne ne disait pas le rôle de la section. Tout rôle que library.js
  // dessine ou range à part est désormais classé, et les badges y partent comme badges.
  const borne = read('app', 'renderer', 'library.js');
  // Toute façon de lire le rôle d'une section : `section.kind === …` dans la boucle, ou retrouvée à part
  // (`v.sections.find((s) => s.kind === 'news-reactions')`) : les réactions d'une nouveauté, ainsi
  // trouvées, avaient échappé au classement et tombaient l'une sous l'autre au téléphone (18/11/2026).
  const kinds = new Set([...borne.matchAll(/\b(?:section|sec|s)\.kind === '([a-z-]+)'/g)].map((m) => m[1]!));
  assert.ok(kinds.has('chips'), 'library.js dessine toujours les badges à part');
  assert.ok(kinds.has('news-reactions'), 'une section retrouvée par sections.find est vue aussi');
  assert.equal(remoteLayout('news-reactions'), 'chips', 'les réactions d’une nouveauté : des badges au téléphone');
  for (const kind of kinds) assert.ok(Object.hasOwn(REMOTE_SECTION_LAYOUT, kind), `rôle « ${kind} » dessiné à part à la borne : à classer dans REMOTE_SECTION_LAYOUT (badges ou lignes au téléphone)`);
  assert.equal(remoteLayout('chips'), 'chips');
  assert.equal(remoteLayout('phrases'), 'chips', '« Répondre » d’un fil : les phrases en badges au téléphone');
  assert.equal(remoteLayout('reactions'), 'chips');
  assert.equal(remoteLayout('players'), undefined);
  assert.equal(remoteLayout(undefined), undefined);
  // La borne joint le dessin à l'entrée, d'après la section qui la montre ; le téléphone le lit.
  assert.match(read('app', 'src', 'library.ts'), /remoteLayout\(at\.section\.kind\)/);
  const page = read('app', 'renderer', 'telephone', 'telephone.js');
  assert.match(page, /item\.layout === 'chips'/);
  // Un seul dessin de badges pour toute la page : Écran, fil, salon, messagerie de la partie.
  const community = read('app', 'renderer', 'telephone', 'telephone-community.js');
  assert.ok(!/thread-chip'|className = 'chip'|phone-chat-chip'/.test(page + community), 'plus de badges dessinés à la main hors de chipStrip');
  assert.ok((community.match(/setChips\(/g) ?? []).length >= 4, 'le fil et le salon passent par setChips');
  assert.match(page, /setChips\(\s*\$\('phone-chat-chips'\)/, 'la messagerie de la partie aussi');
  // Un dessin inconnu ne part pas ; « chips » part tel quel.
  const sent = remoteEntries({ kind: 'screen', title: 'T', items: [{ label: 'a', layout: 'chips' }, { label: 'b', layout: 'autre' as never }], current: 0 });
  assert.equal(sent.items[0]!.layout, 'chips');
  assert.ok(!('layout' in sent.items[1]!));
});

test('accès direct : les Nouveautés au téléphone, chronologie, sous-titre et page de texte, bornés', () => {
  // Au téléphone, la liste des Nouveautés n'avait ni date ni version, et la nouveauté ouverte ni son
  // texte, ni sa date, ni sa version (18/11/2026) : la borne envoie désormais ce qu'elle montre.
  const sent = remoteEntries({
    kind: 'screen',
    title: 'Nouveautés',
    lead: `17 novembre 2026 · version 0.1.16\u0007`,
    page: { image: 'nouveautes/amis-fr.webp', lines: ['Première ligne', 'x'.repeat(900)], where: 'Communauté › Amis', note: 'Sois le premier à réagir' },
    items: [
      { label: 'Amis', detail: 'Ajoutez des amis', timeline: { date: '17 nov.', version: '0.1.16', first: true, unread: true, badges: [{ text: 'Nouveau', kind: 'new' }], reacts: { faces: '👍❤️', total: 3, mine: true, label: '3 réactions, dont la vôtre' }, image: 'nouveautes/amis-fr.webp' } },
      { label: 'Ailleurs', timeline: { date: '16 nov.', image: '../../secret.webp' } },
      { label: '👍 J’aime', layout: 'chips', count: '12' },
      { label: 'Sans badge', count: '4' },
    ],
    current: 0,
  });
  assert.equal(sent.lead, '17 novembre 2026 · version 0.1.16 ', 'le sous-titre, sans caractère de contrôle');
  assert.equal(sent.page?.lines[0], 'Première ligne');
  assert.equal(sent.page?.lines[1]?.length, 600, 'chaque ligne bornée');
  assert.equal(sent.page?.image, 'nouveautes/amis-fr.webp');
  const [line, other, chip, plain] = sent.items;
  assert.deepEqual(line?.timeline?.badges, [{ text: 'Nouveau', kind: 'new' }]);
  assert.equal(line?.timeline?.reacts?.total, 3);
  assert.equal(line?.timeline?.image, 'nouveautes/amis-fr.webp');
  assert.equal(other?.timeline?.image, undefined, 'un aperçu hors des Nouveautés ne part pas');
  assert.equal(chip?.count, '12', 'le nombre d’un badge');
  assert.ok(!('count' in plain!), 'un nombre seulement sur un badge');
  assert.equal(remoteEntries({ kind: 'screen', title: 'T', page: { image: 'C:/x.webp', lines: [] }, items: [], current: -1 }).page?.image, undefined);
});

test('accès direct : mêmes portes que la borne, rien ne se déverrouille du téléphone, un rang d’un écran dépassé est ignoré', () => {
  const frontend = frontendSource();
  const library = read('app', 'src', 'library.ts');
  const remote = read('app', 'src', 'phone-remote.ts');
  const page = read('app', 'renderer', 'telephone', 'telephone.js');
  // Le menu système, fermé à l'invité : ni son arbre ni ses entrées.
  assert.match(library, /function remoteMenus\(\): RemoteMenus \{\s*if \(!host\.guest\.allows\('menu\.system'\)\) return \{ nodes: \[\], locked:/);
  assert.match(library, /function openSystemEntry\(id: SystemEntryId\): boolean \{\s*if \(!host\.guest\.allows\('menu\.system'\) \|\| busy\) return false;/);
  assert.match(frontend, /function remoteOpen\(id: string\): void \{\s*const target = remoteMenuTarget\(id\);\s*if \(!target\)/);
  assert.match(frontend, /if \(!guest\.allows\('menu\.system'\)\) return void console\.log/);
  // Les entrées d'un écran : celles que la borne montre (déjà filtrées par les portes), par le chemin d'un clic.
  assert.match(library, /pick: \(\) => handleAction\(\{ type: 'activate', index, id: ids\[index\] \}\)/);
  assert.match(library, /const built = build\(\);\s*const icon = built\.icon/);
  // La roue : les portes de la roue (choisir, puis la fiche ou Jouer par wheelConfirm).
  assert.match(frontend, /function remotePickTable\([\s\S]*?wheelConfirm\(tables\[index\]!, !wheelPlays\(\)\)[\s\S]*?if \(!guest\.knock\('menu\.choose'\)\) return;/);
  // Les réglages en partie : la porte game.settings, comme les deux MagnaSave.
  assert.match(frontend, /inGameMenu\.openable\(\) === true/);
  assert.match(read('app', 'src', 'in-game-menu.ts'), /if \(!opts\.allowed\(\)\) return t\('Fermés en mode invité\.'\);/);
  // Un rang ne vaut que pour l'écran envoyé sous cette version.
  assert.match(remote, /case 'pick': \{[\s\S]*?if \(message\.v !== entriesVersion\) return;/);
  // La page n'envoie que des nombres et des identifiants de l'arbre.
  assert.deepEqual(page.match(/send\(\{ t: '(pick|open)'[^}]*\}\)/g), ["send({ t: 'pick', v, i })", "send({ t: 'open', id: node.id })", "send({ t: 'open', id: 'in-game' })", "send({ t: 'open', id: 'feedback' })"]);
});
