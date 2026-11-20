// Ordre d'initialisation (incident du PinCab, 0.1.9-essai.66) : la télécommande lisait la règle du
// pare-feu (socialFirewall, frontend.ts) pendant l'initialisation, avant que la constante existe.
// En développement, une erreur de « zone morte » ; dans l'application assemblée (esbuild : const
// devenu var), `undefined` sans bruit, et la télécommande restait « Indisponible : Cannot read
// properties of undefined (reading 'state') » à chaque démarrage d'une borne au téléphone gardé.
//
// Deux gardes :
// - frontend.ts : chaque fermeture qui lit une constante déclarée plus bas est connue et relue (elle
//   ne sert qu'après l'initialisation). Une nouvelle échoue ici : la déclarer plus haut, ou l'ajouter
//   à la liste après avoir vérifié qu'aucun appel ne la déclenche pendant l'initialisation ;
// - la télécommande : son réveil au démarrage est différé (rien n'est lu pendant l'initialisation de
//   l'appelant), une écoute en échec est retentée, et l'utilisateur lit une phrase claire, jamais
//   l'erreur brute.

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { earlyReferences } from './avant-declaration';
import { REPO_ROOT } from './i18n-scan';
import { fakeMenuTarget } from './doublures';

/**
 * Constantes de frontend.ts lues par des rappels écrits plus haut, relus le 11/11/2026 : des rappels
 * donnés aux fabriques et appelés seulement quand la borne tourne (un menu ouvert, un message reçu,
 * une partie), jamais pendant l'initialisation.
 */
const REVIEWED = new Set([
  'activityMenu',
  'chatMenu',
  'chatService',
  'configurations',
  'converter',
  'desktop',
  'friendsMenu',
  'gameNotices',
  // Groupes privés : lus par la télécommande (un message du téléphone), le relevé différé du réseau
  // (socialChanged, minuteur) et l'arrivée d'un message ; jamais pendant l'initialisation, comme la messagerie.
  'groupService',
  'groupsMenu',
  'hours',
  'inGameMenu',
  // Parties instantanées : l'entrée de la fiche d'une table, construite à l'ouverture d'une fiche.
  'instantMenu',
  'jukeboxPlayer',
  // Niveau du joueur : lu par les rappels du salon, des groupes et des parties en ligne (une ligne écrite,
  // une partie finie) et par le relevé différé du réseau ; jamais pendant l'initialisation.
  'levelTracker',
  // Réglages du Juke-box : ouverts depuis sa gestion, par l'utilisateur.
  'jukeboxSettings',
  // Rappel du service des retours : appelé au chargement du tableau, jamais pendant l'initialisation.
  'library',
  'liveDmd',
  'liveGames',
  'menuConfiguration',
  'menuDmd',
  'menuNotices',
  'PLAYED_SECONDS',
  'playing',
  'power',
  'profileMenu',
  // Salons : lus par la file des notifications quand une ligne de salon s'affiche, jamais pendant l'initialisation.
  'roomsMenu',
  'SIMULATED_MANUAL',
  'socialNet',
  'stopNotice',
  'tableRankings',
  // Réalité virtuelle (vr-frontend.ts) : le réseau du casque, lu par le relevé de santé de la borne (minuterie
  // après le démarrage, ou écran ouvert) ; jamais pendant l'initialisation.
  'vrFront',
  'tableScores',
]);

test('frontend.ts : aucune nouvelle fermeture ne lit une constante déclarée plus bas (undefined dans l’application assemblée)', () => {
  const found = earlyReferences(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'));
  assert.ok(found.length > 0, 'l’analyse trouve bien les rappels connus');
  const fresh = found.filter((r) => !REVIEWED.has(r.name)).map((r) => `${r.name} lu ligne ${r.line}, déclaré ligne ${r.declared}`);
  assert.deepEqual(fresh, [], 'déclarer la constante plus haut, ou vérifier que rien ne l’appelle pendant l’initialisation puis l’ajouter à REVIEWED');
  // La règle du pare-feu, lue par la télécommande dès son réveil : déclarée avant elle.
  assert.ok(!found.some((r) => r.name === 'socialFirewall'), 'socialFirewall déclaré avant la télécommande');
});

test('télécommande : réveil différé au démarrage, écoute en échec retentée, message clair', { timeout: 20_000 }, async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createPhoneRemote } = require(path.join(REPO_ROOT, 'app', 'dist', 'phone-remote.js')) as {
    createPhoneRemote(opts: Record<string, unknown>): { setMenu(menu: Record<string, unknown>): void; show(surface: string, on: boolean): void; bar(): { phase: string; line: string } | undefined; close(): void };
  };
  let calls = 0;
  const lines: string[] = [];
  const remote = createPhoneRemote({
    // Le réseau local d'une borne (fictif : rien n'écoute jamais, le pare-feu ne l'autorise pas).
    mode: () => 'lan',
    interfaces: () => ({ Ethernet: [{ address: '192.168.68.54', netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: false, cidr: '192.168.68.54/24' }] }),
    firewall: async () => {
      calls++;
      // Au premier réveil, comme sur le PinCab : la règle lue avant d'exister.
      if (calls === 1) throw new TypeError("Cannot read properties of undefined (reading 'state')");
      return 'blocked';
    },
    // Un téléphone gardé : la télécommande se réveille dès que le menu est là.
    kept: { size: () => 1, keys: () => [], list: () => [], touch: () => undefined, keep: () => undefined, forget: () => false } as never,
    log: (line: string) => lines.push(line),
  });
  remote.setMenu(fakeMenuTarget({
    phase: () => 'menu',
    screen: () => ({ title: 'Menu' }),
    uploadDir: () => ({ refused: '' }),
  }));
  try {
    assert.equal(calls, 0, 'setMenu ne lit rien pendant l’initialisation de l’appelant : le réveil attend');
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(calls, 1, 'le réveil a lieu juste après');
    // L'écran Menu système > Ma borne > Télécommande du téléphone : ce qu'il dit.
    remote.show('menu', true);
    const shown = remote.bar();
    assert.equal(shown?.phase, 'off');
    assert.ok(!/Cannot read|undefined|TypeError/.test(shown?.line ?? ''), `une phrase claire, jamais l’erreur brute : « ${shown?.line} »`);
    assert.match(shown?.line ?? '', /nouvel essai/);
    await new Promise((r) => setTimeout(r, 5_500));
    assert.equal(calls, 2, 'l’écoute en échec est retentée seule (5 s), sans attendre un redémarrage');
    assert.ok(lines.some((l) => l.includes('nouvel essai d')), 'le journal le dit');
  } finally {
    remote.close();
  }
});
