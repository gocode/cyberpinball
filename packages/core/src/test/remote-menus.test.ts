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

test('accès direct : une entrée que la borne ne fournit pas n’y est pas (ses rubriques restent, comme à la borne) ; indisponible et pastille suivent', () => {
  const provided = new Set<SystemItemId>(['phone-remote', 'vr', 'updates']);
  const tree = remoteMenuTree((id) => (provided.has(id) ? { detail: id === 'vr' ? 'Indisponible : aucun casque' : 'ok', tone: id === 'vr' ? 'quiet' : undefined, attention: id === 'updates' } : undefined));
  assert.deepEqual(new Set(ids(tree)), new Set(['phone-remote', ...SYSTEM_GROUP_IDS, 'vr', 'updates']));
  assert.deepEqual(tree.find((n) => n.id === 'amis')?.entries, [], 'une rubrique sans entrée fournie : vide, pas absente');
  const borne = tree.find((n) => n.id === 'borne')!;
  const vr = borne.entries!.find((n) => n.id === 'realite-virtuelle')!.entries!.find((n) => n.id === 'vr')!;
  assert.equal(vr.quiet, true, 'indisponible : grisée');
  assert.equal(vr.detail, 'Indisponible : aucun casque', 'avec sa raison');
  assert.equal(tree.find((n) => n.id === 'cyberpinball')?.attention, true, 'la pastille rouge remonte à la rubrique');
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

test('accès direct : mêmes portes que la borne, rien ne se déverrouille du téléphone, un rang d’un écran dépassé est ignoré', () => {
  const frontend = read('app', 'src', 'frontend.ts');
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
  assert.deepEqual(page.match(/send\(\{ t: '(pick|open)'[^}]*\}\)/g), ["send({ t: 'pick', v, i })", "send({ t: 'open', id: node.id })", "send({ t: 'open', id: 'in-game' })"]);
});
