// Bornes fictives du réseau simulé (CYBERPINBALL_RESEAU=simule et CYBERPINBALL_RESEAU_DEMO) :
// la démonstration docs\demo-amis.ps1 montre les écrans « Amis » peuplés, sans aucune borne
// réelle. Elles tournent dans le processus, sur le réseau d'essai de 127.0.0.1 de la borne :
//   Bruno  : ami, en partie sur une table, vient de battre son record et de gagner un badge ;
//            partage sa bibliothèque (une table que la borne a aussi, dans une autre version,
//            et une qu'elle n'a pas) ;
//   Chloé  : envoie une demande d'ami, à valider ;
//   Dora   : borne voisine (réseau local simulé), sans lien ;
//   Émile  : ami hors ligne depuis trois heures (écrit dans social.json avant le démarrage).
// CYBERPINBALL_RESEAU_DEMO=partie : de plus, Bruno invite la borne à une partie en direct sur la
// table qu'ils ont tous deux, ici dans la même version (la partie se montre sans avertissement),
// lance le départ dès qu'elle accepte, joue quatre secondes et bat son record. =en-jeu : Bruno
// attend que la borne soit en partie, puis l'invite (la notification pendant la partie,
// game-notice.ts) ; l'invitation s'ouvre au retour au menu.
// CYBERPINBALL_RESEAU_DEMO=coupure (gestionnaire de téléchargements, docs\demo-gestionnaire-telechargements.ps1) :
// la table que la borne n'a pas pèse 24 Mo, Bruno l'envoie à débit bridé et se déconnecte en
// plein envoi ; =retour : au démarrage suivant de Cyber Pinball, Bruno (même borne, même clé)
// revient après quelques secondes, et l'envoi reprend là où il s'était arrêté.
// CYBERPINBALL_RESEAU_DEMO=notifications (menu des tables, docs\demo-notifications-roue.ps1) :
// David, Fanny et Émile sont des amis déjà connus, hors ligne au départ (écrits avant le
// démarrage, leurs bornes aussi), Chloé envoie une demande qui attend ; puis, à heures fixes
// (NOTIFICATIONS_SCRIPT), David et Fanny se connectent ensemble, Bruno lance une partie, bat son record ; sa grosse table part à débit bridé quand on
// la demande, et dès son premier morceau, pendant que le menu système est ouvert (l'écran de
// réception), Émile (l'ami hors ligne) se connecte, Bruno gagne un badge et lance une autre
// partie : trois nouveautés, un seul résumé au retour ; la table finit ensuite au menu des tables.
// Leurs dossiers sont dans <données>\reseau-simule\ (le bac à sable de l'essai).
// Leurs tables sont inventées, comme celles de docs\demo-captures.cjs (DEMO_TABLES) : les captures
// de ces démonstrations vont sur la page publique du projet, aucun vrai jeu ne doit y paraître
// (packages\core\src\test\demo-tables-inventees.test.ts).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { addEvent, encodePng, layoutOf, loadSocial, newSocialState, readHostSettings, saveSocial, scanTables, setName, socialFile, tableContents, type SocialState, type TableEntry } from '@cyberpinball/core';
import { createFriendContent, type FriendContent } from './friend-content';
import { createLiveGames, type LiveGames } from './live-game';
import { createSocialNet, type SocialNet } from './social-net';

export function simulatedPlayersWanted(env: NodeJS.ProcessEnv): boolean {
  return ['1', 'partie', 'en-jeu', 'coupure', 'retour', 'notifications'].includes(env.CYBERPINBALL_RESEAU_DEMO ?? '');
}

/**
 * Tables des bornes fictives, toutes inventées : Bruno joue à une table que la borne a aussi
 * (celles de docs\demo-captures.cjs), Émile a battu son record sur une autre ; Bruno partage une
 * table que la borne n'a pas (`notOnCabinet`, dossier de sa bibliothèque).
 */
export const DEMO_TABLES = {
  brunoPlays: { title: 'Star Courier', manufacturer: 'Halcyon', year: 1987 },
  brunoPlaysAgain: { title: 'Midnight Circuit', manufacturer: 'Voltage Games', year: 1998 },
  emileRecord: { title: 'Thunder Reef', manufacturer: 'Gulfstream', year: 1991 },
  notOnCabinet: 'Glass Lagoon (Gulfstream 1993)',
};

/** Table que la borne n'a pas, dans la démonstration de la coupure : assez lourde pour voir l'envoi avancer, s'arrêter, reprendre. */
const CUT_TABLE_BYTES = 24 * 1024 * 1024;
/** Débit de Bruno dans la démonstration de la coupure : un morceau de 64 Kio toutes les 25 ms (environ 2,5 Mo/s). */
const CUT_CHUNK_MS = 25;
/** Démonstration des notifications : plus lent (environ 0,9 Mo/s), la table finit une fois revenu au menu des tables. */
const NOTICES_CHUNK_MS = 70;
/** Bruno se déconnecte après avoir envoyé tant d'octets. */
const CUT_AFTER_BYTES = 9 * 1024 * 1024;
/** Au démarrage suivant, Bruno revient après ce délai. */
const RETURN_AFTER_MS = 7000;

/**
 * Démonstration des notifications du menu des tables : ce que font les bornes fictives, en
 * millisecondes après leur démarrage (l'autopilote de docs\demo-notifications-roue.ps1 regarde le
 * menu des tables pendant ce temps ; les connexions des dix premières secondes ne sont pas
 * annoncées), puis après le premier morceau de la table de Bruno (l'écran de réception est
 * ouvert : rien ne doit s'y montrer).
 */
export const NOTIFICATIONS_SCRIPT = {
  pairOnline: 15_000,
  brunoPlays: 26_000,
  brunoRecord: 34_000,
  afterFirstChunk: { emileOnline: 300, brunoBadge: 600, brunoPlaysAgain: 900 },
};

/** Contenu reconnaissable de la grosse table : chaque octet dépend de sa position (un décalage se verrait à l'empreinte). */
function bigTable(bytes: number): Buffer {
  const b = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) b[i] = (i * 31 + (i >> 8)) & 0xff;
  return b;
}

/** Avant le démarrage : un ami hors ligne et son dernier évènement, dans l'état de la borne. */
export function seedSimulatedFriends(dataDir: string, now = new Date(), env: NodeJS.ProcessEnv = process.env): void {
  if (fs.existsSync(socialFile(dataDir))) return;
  const me = setName(newSocialState(now), 'Alexis')!;
  let emile = setName(newSocialState(now), 'Émile')!; // i18n-ignore : nom d'un joueur fictif
  const threeHours = new Date(now.getTime() - 3 * 3600_000);
  emile = addEvent(emile, { kind: 'record', table: DEMO_TABLES.emileRecord, score: 48_250_110, rank: 2, initials: 'EMI' }, threeHours).state;
  const state: SocialState = {
    ...me,
    friends: [{ key: emile.key.publicKey, name: emile.name, since: new Date(now.getTime() - 20 * 86_400_000).toISOString(), lastSeen: threeHours.toISOString(), events: emile.events }],
    badges: [{ id: 'first-game', at: new Date(now.getTime() - 30 * 86_400_000).toISOString() }, { id: 'first-record', at: new Date(now.getTime() - 9 * 86_400_000).toISOString() }],
    badgesChecked: true,
  };
  // Notifications : David et Fanny, amis eux aussi ; leurs bornes et celle d'Émile existent (même clé,
  // la borne pour amie) et se connecteront plus tard (startSimulatedPlayers).
  const others = env.CYBERPINBALL_RESEAU_DEMO === 'notifications' ? ['David', 'Fanny'].map((name) => setName(newSocialState(now), name)!) : [];
  const since = state.friends[0]!.since;
  saveSocial(dataDir, { ...state, friends: [...state.friends, ...others.map((o) => ({ key: o.key.publicKey, name: o.name, since, lastSeen: threeHours.toISOString(), events: [] }))] });
  if (env.CYBERPINBALL_RESEAU_DEMO === 'notifications') {
    for (const friend of [emile, ...others]) {
      const dir = path.join(dataDir, 'reseau-simule', friend.name);
      fs.mkdirSync(dir, { recursive: true });
      saveSocial(dir, { ...friend, friends: [{ key: me.key.publicKey, name: me.name, since, events: [] }] });
    }
  }
}

async function bot(dataDir: string, name: string, lan: boolean, bootstrap: { host: string; port: number }[], extra: Partial<SocialState> = {}): Promise<SocialNet> {
  const dir = path.join(dataDir, 'reseau-simule', name);
  fs.mkdirSync(dir, { recursive: true });
  // Une borne fictive déjà venue (démarrage suivant de la démonstration) garde sa clé et ses amis.
  if (fs.existsSync(socialFile(dir))) saveSocial(dir, { ...loadSocial(dir), lan, ...extra });
  else saveSocial(dir, { ...setName(newSocialState(), name)!, lan, ...extra });
  const net = createSocialNet({ dataDir: dir, mode: 'simulated', host: '127.0.0.1', bootstrap });
  await net.start();
  return net;
}

/** Image unie en dégradé, de la taille d'un média de ce format. */
function picture(width: number, height: number, hue: [number, number, number]): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = 0.35 + (0.65 * (x + y)) / (width + height);
      data.set([Math.round(hue[0] * k), Math.round(hue[1] * k), Math.round(hue[2] * k), 255], (y * width + x) * 4);
    }
  }
  return encodePng({ width, height, data });
}

/**
 * Racine de Bruno : la première table de la borne (même dossier, autre .vpx : une autre version ;
 * `sameVersion` : le même .vpx, pour la partie en direct), et une table que la borne n'a pas, avec
 * une ROM et un PuP-Pack (des parties sous droits, à attester avant de les prendre) ; chacune avec
 * quelques médias.
 */
function brunoRoot(dir: string, mine: readonly TableEntry[], cut = false, sameVersion = false): string {
  const root = path.join(dir, 'borne');
  const tables = layoutOf(root).tables;
  const folders = [...(mine[0] ? [path.basename(mine[0].folder)] : []), DEMO_TABLES.notOnCabinet];
  for (const [i, folder] of folders.entries()) {
    const at = path.join(tables, folder);
    fs.mkdirSync(path.join(at, 'medias'), { recursive: true });
    const vpx = path.join(at, `${folder}.vpx`);
    if (!i && sameVersion && mine[0]) fs.copyFileSync(mine[0].file, vpx);
    else if (!fs.existsSync(vpx)) fs.writeFileSync(vpx, i && cut ? bigTable(CUT_TABLE_BYTES) : Buffer.alloc(200_000 + i, 9));
    const hue: [number, number, number] = i ? [200, 90, 220] : [40, 200, 170];
    fs.writeFileSync(path.join(at, 'medias', `(Wheel) ${folder}.png`), picture(256, 256, hue));
    fs.writeFileSync(path.join(at, 'medias', `(Backglass) ${folder}.png`), picture(640, 480, hue));
    fs.writeFileSync(path.join(at, 'medias', `(GameHelp) ${folder}.png`), picture(480, 640, hue));
    fs.writeFileSync(path.join(at, 'medias', `(Topper) ${folder}.png`), picture(768, 256, hue));
    fs.writeFileSync(path.join(at, 'medias', `(FullDMD) ${folder}.png`), picture(640, 360, hue));
    fs.writeFileSync(path.join(at, 'medias', `(Loading) ${folder}.png`), picture(640, 360, hue));
    if (i) {
      // Une archive zip vide (sa seule fin de répertoire) et un écran de PuP-Pack.
      fs.mkdirSync(path.join(at, 'pinmame', 'roms'), { recursive: true });
      fs.writeFileSync(path.join(at, 'pinmame', 'roms', 'glag_l1.zip'), Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]));
      fs.mkdirSync(path.join(at, 'pupvideos', 'glag_l1'), { recursive: true });
      fs.writeFileSync(path.join(at, 'pupvideos', 'glag_l1', 'screens.pup'), 'ScreenNum,ScreenDes\r\n2,Backglass\r\n');
    }
  }
  return root;
}

/** Après le démarrage de la borne : les bornes fictives la rejoignent et jouent leur rôle. */
export async function startSimulatedPlayers(main: SocialNet, dataDir: string, mine: () => readonly TableEntry[], log: (line: string) => void, env: NodeJS.ProcessEnv = process.env): Promise<() => Promise<void>> {
  const bootstrap = main.simulatedBootstrap();
  if (!bootstrap) return async () => undefined;
  const me = { key: main.state().key.publicKey, name: main.state().name };
  const mode = env.CYBERPINBALL_RESEAU_DEMO;
  const notices = mode === 'notifications';
  // La grosse table, envoyée à débit bridé : pour la coupure, et pour voir un téléchargement finir en arrière-plan.
  const cut = mode === 'coupure' || mode === 'retour' || notices;
  // Retour de Bruno : sa borne n'est pas encore là au démarrage, elle arrive quelques secondes après.
  if (mode === 'retour') await new Promise((r) => setTimeout(r, RETURN_AFTER_MS));
  if (mode === 'retour') log('Réseau simulé : Bruno revient.'); // i18n-ignore : journal
  const bruno = await bot(dataDir, 'Bruno', false, bootstrap, { shareLibrary: true });
  const chloe = await bot(dataDir, 'Chloé', false, bootstrap); // i18n-ignore : nom d'un joueur fictif
  const dora = await bot(dataDir, 'Dora', true, bootstrap);
  const brunoDir = path.join(dataDir, 'reseau-simule', 'Bruno');
  // Sa bibliothèque se fait à l'amitié : les tables de la borne sont lues d'ici là.
  let root: string | undefined;
  const brunoTables = () => (root ? scanTables(layoutOf(root).tables) : []);
  // Coupure : Bruno envoie à débit bridé, et se déconnecte en plein envoi (la première fois seulement).
  let sent = 0;
  let gone = false;
  /** Notifications : ce qui se passe pendant que la borne reçoit la table (une fois). */
  let firstChunk: (() => void) | undefined;
  const throttled: Pick<SocialNet, 'state' | 'online' | 'send' | 'sendChunk' | 'onMessage' | 'onChunk'> = {
    state: () => bruno.state(),
    online: (key) => bruno.online(key),
    send: (key, message) => bruno.send(key, message),
    onMessage: (listener) => bruno.onMessage(listener),
    onChunk: (listener) => bruno.onChunk(listener),
    sendChunk: async (key, frame) => {
      if (gone) return false;
      firstChunk?.();
      firstChunk = undefined;
      await new Promise((r) => setTimeout(r, notices ? NOTICES_CHUNK_MS : CUT_CHUNK_MS));
      sent += frame.length - 4;
      if (mode === 'coupure' && sent >= CUT_AFTER_BYTES && !gone) {
        gone = true;
        log(`Réseau simulé : Bruno se déconnecte après ${sent} octets envoyés.`); // i18n-ignore : journal
        void bruno.stop();
        return false;
      }
      return bruno.sendChunk(key, frame);
    },
  };
  const content: FriendContent = createFriendContent({
    net: cut ? throttled : bruno,
    dataDir: brunoDir,
    log: (line) => log(`Bruno : ${line}`), // i18n-ignore : journal
    tables: brunoTables,
    root: () => root,
    contents: (table) => (root ? tableContents(table.file, { ownFolder: true, romLibrary: layoutOf(root).roms }) : undefined),
  });
  const timers: NodeJS.Timeout[] = [];
  // Notifications : David et Fanny se connectent ensemble, Émile plus tard (amis déjà connus, seedSimulatedFriends).
  const pair: SocialNet[] = [];
  let emile: SocialNet | undefined;
  if (notices) {
    const at = (ms: number, run: () => unknown) => timers.push(setTimeout(() => void run(), ms));
    at(NOTIFICATIONS_SCRIPT.pairOnline, async () => {
      log('Réseau simulé : David et Fanny se connectent.'); // i18n-ignore : journal
      pair.push(...(await Promise.all(['David', 'Fanny'].map((name) => bot(dataDir, name, false, bootstrap)))));
    });
    at(NOTIFICATIONS_SCRIPT.brunoPlays, () => bruno.setPresence({ status: 'playing', table: DEMO_TABLES.brunoPlays, since: new Date().toISOString() }));
    at(NOTIFICATIONS_SCRIPT.brunoRecord, () => {
      bruno.setPresence({ status: 'menu', since: new Date().toISOString() });
      bruno.publish({ kind: 'record', table: DEMO_TABLES.brunoPlays, score: 3_215_480_250, rank: 1, initials: 'BRU' });
    });
    firstChunk = () => {
      const later = NOTIFICATIONS_SCRIPT.afterFirstChunk;
      at(later.emileOnline, async () => {
        log('Réseau simulé : Émile se connecte.'); // i18n-ignore : journal
        emile = await bot(dataDir, 'Émile', false, bootstrap); // i18n-ignore : nom d'un joueur fictif
      });
      at(later.brunoBadge, () => bruno.publish({ kind: 'badge', badge: 'ten-tables' }));
      at(later.brunoPlaysAgain, () => bruno.setPresence({ status: 'playing', table: DEMO_TABLES.brunoPlaysAgain, since: new Date().toISOString() }));
    };
  }
  let games: LiveGames | undefined;
  let starting = false;
  if (mode === 'partie' || mode === 'en-jeu') {
    games = createLiveGames({
      net: bruno,
      dataDir: brunoDir,
      tables: brunoTables,
      // Ses réglages partent vers la borne, comme ceux d'une vraie borne (hostsettings.ts).
      settingsOf: (table) => readHostSettings({ folder: table.folder, roms: [] }),
      play: async (_table, playing) => {
        playing();
        await new Promise((r) => setTimeout(r, 4000));
        return { ok: true, seconds: 254, records: [{ score: 2_841_350_120, rank: 1, initials: 'BRU' }] };
      },
      // La borne a accepté : Bruno donne le départ un peu après.
      onChange: () => {
        const game = games?.current();
        if (starting || game?.phase !== 'gathering' || !game.players.some((p) => !p.host && p.state === 'accepted')) return;
        starting = true;
        timers.push(setTimeout(() => games?.start(), 3500));
      },
    });
  }
  bruno.request(me);
  chloe.request(me);
  // Bruno devient ami (la démonstration accepte à la place du joueur), puis joue. Déjà ami (retour) : sa bibliothèque tout de suite.
  const accept = setInterval(() => {
    if (main.state().friends.some((f) => f.key === bruno.state().key.publicKey)) {
      root ??= brunoRoot(brunoDir, mine(), cut, mode === 'partie' || mode === 'en-jeu');
      clearInterval(accept);
      return;
    }
    if (main.state().incoming.some((r) => r.key === bruno.state().key.publicKey)) {
      root ??= brunoRoot(brunoDir, mine(), cut, mode === 'partie' || mode === 'en-jeu');
      main.accept(bruno.state().key.publicKey);
      clearInterval(accept);
      // Notifications : Bruno suit l'horaire de la démonstration (NOTIFICATIONS_SCRIPT).
      if (!notices) {
        const table = DEMO_TABLES.brunoPlays;
        bruno.setPresence({ status: 'playing', table, since: new Date(Date.now() - 12 * 60_000).toISOString() });
        bruno.publish({ kind: 'record', table, score: 3_215_480_250, rank: 1, initials: 'BRU' });
      }
      // Partie en direct : l'invitation, une fois la borne reliée et le menu affiché ; en-jeu, une
      // fois la borne en partie (sa présence le dit).
      if (games) {
        const invite = async () => {
          bruno.setPresence({ status: 'menu', since: new Date().toISOString() });
          const shared = brunoTables()[0];
          if (!shared) return;
          await games!.create(shared);
          games!.invite(me.key, me.name);
        };
        if (mode !== 'en-jeu') timers.push(setTimeout(invite, 6000));
        else {
          const watch = setInterval(() => {
            if (bruno.presenceOf(me.key)?.status !== 'playing') return;
            clearInterval(watch);
            timers.push(setTimeout(invite, 1500));
          }, 300);
          timers.push(watch);
        }
      }
    }
  }, 100);
  log('Réseau simulé : bornes fictives Bruno, Chloé, Dora démarrées.'); // i18n-ignore : journal
  return async () => {
    clearInterval(accept);
    for (const timer of timers) clearTimeout(timer);
    content.stop();
    games?.stop();
    await Promise.all([bruno.stop(), chloe.stop(), dora.stop(), ...pair.map((n) => n.stop()), ...(emile ? [emile.stop()] : [])]);
  };
}
