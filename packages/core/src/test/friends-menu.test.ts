// Écrans « Amis » (app/src/friends-menu.ts, compilé) sur un réseau coupé : ce que chaque entrée
// ouvre, la sélection de « Partage et réseau » sur « Retour » (un Start par mégarde ne coupe pas
// le partage), le pare-feu à autoriser seulement quand la règle manque, les actions uniques.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');

interface Action {
  label: string;
  icon?: string;
  run: () => void | Promise<void>;
}
interface Built {
  heading: string;
  sections: { title?: string; rows: { text: string }[] }[];
  actions: Action[];
}
type Build = () => Built;
interface Item {
  detail?: string;
  attention?: boolean;
  run(): void;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createFriendsMenu } = require(path.join(APP_DIST, 'friends-menu.js')) as { createFriendsMenu(host: object): { items: Record<string, Item> } };
const { createSocialNet } = require(path.join(APP_DIST, 'social-net.js')) as { createSocialNet(o: object): object };
const { createFirewallRule } = require(path.join(APP_DIST, 'firewall-rule.js')) as { createFirewallRule(o: object): { check(): Promise<string> } };
/* eslint-enable @typescript-eslint/no-require-imports */

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-friends-menu-'));
  const opened: { build: Build; at?: number }[] = [];
  const net = createSocialNet({ dataDir: dir, mode: 'off' });
  const firewall = createFirewallRule({ exe: 'C:\\x\\CyberPinball.exe', simulated: true });
  const menu = createFriendsMenu({
    library: { openCustom: (build: Build, at?: number) => opened.push({ build, at }), openSystem: () => undefined, openPrompt: () => undefined },
    net,
    firewall,
  });
  return { menu, opened, firewall, last: () => opened.at(-1)! };
}

test('chaque entrée de la rubrique Amis ouvre son écran, aux actions toutes différentes', () => {
  const { menu, last } = setup();
  for (const [id, heading] of [['friends', 'Mes amis'], ['find-player', 'Trouver un joueur'], ['friend-requests', 'Demandes d’amis'], ['badges', 'Mes badges'], ['sharing', 'Partage et réseau']] as const) {
    menu.items[id]!.run();
    const built = last().build();
    assert.equal(built.heading, heading);
    assert.equal(built.actions.at(-1)!.label, 'Retour', `${id} : Retour en dernier`);
    const icons = built.actions.map((a) => a.icon);
    assert.equal(new Set(icons).size, icons.length, `${id} : une icône par action`);
  }
  assert.equal(menu.items['friend-requests']!.attention, false);
});

test('« Partage et réseau » : sélection sur Retour ; pare-feu à autoriser seulement s’il manque', async () => {
  const { menu, last, firewall } = setup();
  await firewall.check();
  menu.items.sharing!.run();
  assert.equal(last().at, Number.MAX_SAFE_INTEGER);
  const labels = () => last().build().actions.map((a) => a.label);
  assert.ok(labels().includes('Autoriser dans le pare-feu de Windows'));
  const allow = last().build().actions.find((a) => a.label === 'Autoriser dans le pare-feu de Windows')!;
  await allow.run();
  assert.ok(!labels().includes('Autoriser dans le pare-feu de Windows'));
  // Réseau coupé pour les essais : dit, jamais présenté comme une panne.
  assert.ok(last().build().sections.some((s) => s.rows.some((r) => r.text === 'Partage activé')));
});
