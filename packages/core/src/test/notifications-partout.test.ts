// Notifications partout (essai réel du 04/11/2026, essai.8 sur les deux bornes) : « les
// notifications n'apparaissent que sur la roue ; une invitation à jouer, notamment, n'apparaît que
// sur la roue ; dans les autres écrans, rien ». La règle voulue :
// - dans tous les écrans de Cyber Pinball (roue, menu système et chacun de ses sous-écrans,
//   réglages, fiches, listes, assistant, navigateur intégré…) : le nombre d'amis en ligne et toutes
//   les notifications ;
// - pendant une partie : plus de compteur, mais ce qui compte (une invitation, un ami qui se
//   connecte, la partie entre amis) en haut du plateau, avec son son, sauf « Masquer les
//   notifications pendant les parties ».
//
// Le mécanisme, pas chaque écran : un seul endroit dit la zone de chaque écran (noticezone.ts), un
// seul la nomme (frontend.ts, zoneScreen), la file et le rendu la suivent. Ce test parcourt tous
// les écrans connus.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { MENU_PHASES } from '../menumoments';
import { NOTICE_GATHER_MS, NOTICE_STARTUP_QUIET_MS, type NoticeView } from '../notices';
import { ZONE_SCREENS, noticeZone, type NoticeZone, type ZoneScreen } from '../noticezone';
import { newSocialState } from '../social';

const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8');

/** Les écrans de Cyber Pinball : le compteur et toutes les notifications, toujours. */
const CYBER_PINBALL: readonly ZoneScreen[] = ['menu', 'attract', 'library', 'help', 'message', 'confirmQuit', 'jukebox'];

test('partout : chaque écran de Cyber Pinball a le compteur et toutes les notifications ; les autres disent pourquoi', () => {
  for (const screen of ZONE_SCREENS) {
    const zone = noticeZone(screen);
    if (CYBER_PINBALL.includes(screen)) {
      assert.deepEqual([zone.count, zone.notices], [true, 'all'], `${screen} : compteur et toutes les notifications`);
      assert.ok(zone.place === 'corner' || zone.place === 'head', `${screen} : dessinée dans la fenêtre du plateau`);
    } else assert.ok(zone.why, `${screen} : moins que tout, et pourquoi`);
  }
  // Le navigateur intégré : toutes les notifications, par-dessus sa page.
  assert.deepEqual(noticeZone('browser'), { ...noticeZone('browser'), place: 'over', notices: 'all' });
  // En partie (et pendant son chargement) : ce qui compte, par-dessus VPX, sans compteur ; masquées : tout attend.
  for (const screen of ['loading', 'playing'] as const) {
    assert.deepEqual([noticeZone(screen).place, noticeZone(screen).count, noticeZone(screen).notices], ['over', false, 'away']);
    assert.deepEqual([noticeZone(screen, { quietInGame: true }).place, noticeZone(screen, { quietInGame: true }).notices], ['none', 'wait']);
  }
  // Le réglage ne change rien hors partie.
  for (const screen of CYBER_PINBALL) assert.deepEqual(noticeZone(screen, { quietInGame: true }), noticeZone(screen), screen);
  // Ce qui fait attendre la notification, jamais le compteur : le constat bref sous la marque (sa ligne), le préavis d'arrêt.
  assert.deepEqual([noticeZone('menu', { banner: true }).count, noticeZone('menu', { banner: true }).notices], [true, 'wait']);
  assert.equal(noticeZone('library', { banner: true }).notices, 'all', 'dans un écran plein, le constat est dans son en-tête');
  assert.deepEqual([noticeZone('library', { stopNotice: true }).count, noticeZone('library', { stopNotice: true }).notices], [true, 'wait']);
  assert.equal(noticeZone('menu', { closing: true }).place, 'none');
});

test('partout : chaque phase du menu est nommée par zoneScreen (frontend.ts), et chaque écran par-dessus aussi', () => {
  const main = read('app', 'src', 'frontend.ts');
  const body = main.slice(main.indexOf('function zoneScreen(): ZoneScreen {'), main.indexOf('function currentZone('));
  // Chaque phase du menu (menumoments.ts) a sa ligne ; « menu » est l'écran restant.
  for (const phase of MENU_PHASES.filter((p) => p !== 'menu')) assert.ok(body.includes(`state.phase === '${phase}'`), `zoneScreen nomme la phase ${phase}`);
  // Les écrans par-dessus une phase : le bureau, l'extinction, le navigateur intégré, le mode attente, l'aide.
  for (const over of ['desktop.active', "state.message?.action === 'power'", 'library.browserOpen()', 'attract.active', 'state.help']) assert.ok(body.includes(over), `zoneScreen tient compte de ${over}`);
  // Chaque écran rendu (ZoneScreen) l'est par zoneScreen.
  for (const screen of ZONE_SCREENS.filter((s) => s !== 'loading' && s !== 'playing')) assert.ok(body.includes(`'${screen}'`), `zoneScreen rend « ${screen} »`);
  // La file, le coin et la ligne suivent la même zone ; plus aucune condition d'écran à côté.
  assert.match(main, /zone: \(\) => currentZone\(\),/);
  const corner = main.slice(main.indexOf('function menuCorner('), main.indexOf('function cinemaFor('));
  assert.match(corner, /const zone = currentZone\(\);/);
  assert.doesNotMatch(corner, /state\.phase/, 'menuCorner ne regarde plus la phase : la zone le dit');
  assert.doesNotMatch(main, /canShow: \(\) =>/, 'plus de condition d’écran propre à la file');
  // Le rendu dessine la zone partout où elle le dit, mode attente compris, et ne décide de rien.
  const renderer = read('app', 'renderer', 'frontend.js');
  assert.equal(renderer.match(/const corner = s\.zone \? cornerBox\(s\) : undefined;/g)?.length, 2, 'écrans du menu et mode attente');
  assert.match(renderer, /statusCorner\.box\.classList\.toggle\('on-head', s\.zone === 'head'\)/);
  assert.doesNotMatch(renderer, /s\.phase === 'library' && s\.notice\?\.away/);
  // Le navigateur intégré : la ligne posée sur lui, en bas de sa page (jamais sur sa barre).
  assert.match(corner, /corner: 'bottom-left'/);
  assert.match(read('app', 'src', 'library.ts'), /browserOpen: \(\) => catalogUi\.acquirer\.isOpen\(\)/);
});

test('partout : une invitation s’ouvre d’elle-même sur la roue, le menu système et l’aide, et « Retour » rend l’écran d’avant', () => {
  const main = read('app', 'src', 'frontend.ts');
  const open = main.slice(main.indexOf('function openArrivedInvite('), main.indexOf('// Partie en direct : invitation'));
  assert.match(open, /if \(state\.help\) state = \{ \.\.\.state, help: false \};/);
  assert.match(open, /library\.interrupt\(\(back\) => friendsMenu\.live\.openInvite\(id, back\)\)/);
  const library = read('app', 'src', 'library.ts');
  const interrupt = library.slice(library.indexOf('interrupt: (open'), library.indexOf('browserOpen:'));
  // Jamais pendant une opération longue ni une saisie ; le retour rend l'écran et son curseur.
  assert.match(interrupt, /if \(busyCount > 0 \|\| screen\?\.kind === 'prompt' \|\| \(screen\?\.kind === 'edit' && screen\.editor\)\) return false;/);
  assert.match(interrupt, /screen = was;\s+cursor = at;/);
});

/* eslint-disable @typescript-eslint/no-require-imports */
const { createMenuNotices } = require(path.join(REPO_ROOT, 'app', 'dist', 'menu-notices.js')) as {
  createMenuNotices(host: object): { observe(): void; view(): { notice?: NoticeView; friendsOnline?: { count: number } }; stop(): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

test('partout : la vraie file, écran par écran : un ami connecté, un téléchargement fini, le compteur', () => {
  for (const screen of ZONE_SCREENS) {
    for (const quietInGame of [false, true]) {
      let clock = 5_000_000;
      const online = new Set<string>();
      const friends = ['Bruno', 'Léa'].map((name) => ({ key: name.toLowerCase(), name, since: new Date(0).toISOString(), events: [] }));
      let jobs: object[] = [];
      const zone: NoticeZone = noticeZone(screen, { quietInGame });
      const menu = createMenuNotices({
        social: { state: () => ({ ...newSocialState(new Date(0)), friends }), online: (k: string) => online.has(k), presenceOf: () => undefined },
        jobs: () => jobs,
        mode: () => 'all',
        zone: () => zone,
        redraw: () => undefined,
        now: () => clock,
        live: { game: () => undefined, invites: () => [], me: () => 'moi', onScreen: () => false },
      });
      try {
        online.add('léa');
        menu.observe();
        clock += NOTICE_STARTUP_QUIET_MS + 1000;
        // Un téléchargement fini (seulement dans Cyber Pinball), puis Bruno qui se connecte (partout).
        jobs = [{ id: 'j1', state: 'done', title: 'Medieval Madness', source: { kind: 'site', label: 'VPUniverse' }, delivered: false, seen: false }];
        menu.observe();
        online.add('bruno');
        menu.observe();
        clock += NOTICE_GATHER_MS + 100;
        const v = menu.view();
        const what = `${screen}${quietInGame ? ' (masquées en partie)' : ''}`;
        assert.equal(v.friendsOnline !== undefined, zone.count, `${what} : compteur ${zone.count ? 'affiché' : 'absent'}`);
        if (zone.notices === 'wait') assert.equal(v.notice, undefined, `${what} : rien maintenant`);
        else if (zone.notices === 'away') assert.equal(v.notice?.title, 'Bruno vient de se connecter', `${what} : ce qui compte seulement`);
        else assert.ok(v.notice && v.notice.title !== '', `${what} : une notification (« ${v.notice?.title} »)`);
      } finally {
        menu.stop();
      }
    }
  }
});
