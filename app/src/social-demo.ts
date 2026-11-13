// Bornes fictives du réseau simulé (CYBERPINBALL_RESEAU=simule et CYBERPINBALL_RESEAU_DEMO) :
// la démonstration des amis montre les écrans « Amis » peuplés, sans aucune borne
// réelle. Elles tournent dans le processus, sur le réseau d'essai de 127.0.0.1 de la borne :
//   Bruno  : ami, en partie sur une table, vient de battre son record et de gagner un badge ;
//            partage sa bibliothèque (une table que la borne a aussi, dans une autre version,
//            et une qu'elle n'a pas) ;
//   Chloé  : envoie une demande d'ami, à valider ;
//   Dora   : borne voisine (réseau local simulé), sans lien ;
//   Émile  : ami hors ligne depuis trois heures (écrit dans social.json avant le démarrage).
// CYBERPINBALL_RESEAU_DEMO=partie : de plus, Bruno invite la borne à une partie en direct sur la
// table qu'ils ont tous deux, ici dans la même version (la partie se montre sans avertissement),
// lance le départ dès qu'elle accepte, charge sa table (prête huit secondes après la borne, qui l'attend au départ
// commun), joue quatre secondes et bat son record ; l'historique des
// parties a déjà deux soirées avec Émile (seedSimulatedFriends). =en-jeu : Bruno
// attend que la borne soit en partie, puis l'invite (la notification pendant la partie,
// game-notice.ts) ; l'invitation s'ouvre au retour au menu.
// =partie-coupure : la même partie, mais la liaison de Bruno tombe pendant l'attente du départ
// commun (LIVE_CUT_MS, dès que la borne lance sa table) : le « prêt » de la borne se perd, comme
// la salle de Bruno ; la borne le renvoie, et le départ se fait sans attendre le délai (essai réel du
// 01/11/2026). =partie-sans-releve : la même partie sur une table sans relevé (départ manuel, pas
// de score en direct) : marquée dans l'invitation, « Partez ! » qui part seul, un score inconnu.
// =parties-enchainees : trois parties à la suite (essai réel du 04/11/2026 : la deuxième ne
// finissait pas de charger) ; Bruno a deux tables en commun avec la borne, et réinvite après chaque
// partie : la même table deux fois, puis l'autre.
// CYBERPINBALL_RESEAU_DEMO=coupure (gestionnaire de téléchargements) :
// la table que la borne n'a pas pèse 24 Mo, Bruno l'envoie à débit bridé et se déconnecte en
// plein envoi ; =retour : au démarrage suivant de Cyber Pinball, Bruno (même borne, même clé)
// revient après quelques secondes, et l'envoi reprend là où il s'était arrêté.
// CYBERPINBALL_RESEAU_DEMO=notifications (menu des tables) :
// David, Fanny et Émile sont des amis déjà connus, hors ligne au départ (écrits avant le
// démarrage, leurs bornes aussi), Chloé envoie une demande qui attend ; puis, à heures fixes
// (NOTIFICATIONS_SCRIPT), David et Fanny se connectent ensemble, Bruno lance une partie, bat son record ; sa grosse table part à débit bridé quand on
// la demande, et dès son premier morceau, pendant que le menu système est ouvert (l'écran de
// réception), Émile (l'ami hors ligne) se connecte, Bruno gagne un badge et lance une autre
// partie : trois nouveautés, un seul résumé au retour ; la table finit ensuite au menu des tables.
// CYBERPINBALL_RESEAU_DEMO=messagerie (Menu système > Amis > Messages) : la conversation avec Émile
// (hors ligne) a déjà son historique et deux messages qui attendent sa connexion ; Bruno, devenu ami,
// écrit deux messages, puis répond à ce que la borne lui écrit (une réaction, une phrase).
// CYBERPINBALL_RESEAU_DEMO=communaute (médaillon Communauté, Joueurs en ligne) : en plus de Bruno
// (ami, en partie) et de Dora (réseau local), quatre joueurs qui ne sont pas des amis, de plusieurs
// pays, dont deux en partie ; leur présence publique les fait apparaître dans « Joueurs en ligne ».
// Leurs dossiers sont dans <données>\reseau-simule\ (le bac à sable de l'essai).
// Leurs tables sont inventées, comme celles des captures de la page du projet : les captures
// de ces démonstrations vont sur la page publique du projet, aucun vrai jeu ne doit y paraître
// (packages\core\src\test\demo-tables-inventees.test.ts).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { acknowledge, addEvent, addToHistory, newChatState, readAvatarImage, emptyHistory, encodePng, layoutOf, loadSocial, newSocialState, PUP_FOLDER, readHostSettings, receiveLines, saveChat, saveHistory, saveSocial, scanTables, setName, socialFile, tableContents, toWire, verifyWire, writeLine, type LiveGame, type SocialState, type TableEntry } from '@cyberpinball/core';
import { createChatService, type ChatService } from './chat-service';
import { createFriendContent, type FriendContent } from './friend-content';
import { createLiveGames, createTableVersions, type LiveGames } from './live-game';
import { createSocialNet, type SocialNet } from './social-net';

export function simulatedPlayersWanted(env: NodeJS.ProcessEnv): boolean {
  return ['1', ...LIVE_DEMOS, 'coupure', 'retour', 'notifications', 'messagerie', 'communaute'].includes(env.CYBERPINBALL_RESEAU_DEMO ?? '');
}

/** Les démonstrations de la partie en direct : Bruno invite la borne (`en-jeu` : pendant qu'elle joue). */
const LIVE_DEMOS = ['partie', 'en-jeu', 'partie-coupure', 'partie-sans-releve', 'parties-enchainees', 'fins-invitation'];
/** Parties à la suite, démonstration « parties-enchainees » : la table de chacune (rang dans les tables communes). */
const CHAINED_TABLES = [0, 0, 1];
/** Après une partie finie, Bruno réinvite après ce délai : la borne a fermé ses résultats, elle est au menu des tables. */
const CHAINED_AFTER_MS = 9000;
/** Partie en direct, démonstration de la coupure : la liaison de Bruno tombe ce temps, dès que la borne lance sa table ; assez pour couvrir son « prêt » (table chargée quelques secondes après). */
const LIVE_CUT_MS = 12_000;

/**
 * Tables des bornes fictives, toutes inventées : Bruno joue à une table que la borne a aussi
 * (celles des captures de la page du projet), Émile a battu son record sur une autre ; Bruno partage une
 * table que la borne n'a pas (`notOnCabinet`, dossier de sa bibliothèque).
 */
export const DEMO_TABLES = {
  brunoPlays: { title: 'Star Courier', manufacturer: 'Halcyon', year: 1987 },
  brunoPlaysAgain: { title: 'Midnight Circuit', manufacturer: 'Voltage Games', year: 1998 },
  emileRecord: { title: 'Thunder Reef', manufacturer: 'Gulfstream', year: 1991 },
  notOnCabinet: 'Glass Lagoon (Gulfstream 1993)',
};

/**
 * Partie en direct : la table de Bruno charge au moins ce temps, et finit toujours ce temps-ci après
 * celle de la borne : la borne l'attend au départ commun (livestart.ts) quelle que soit sa vitesse
 * (une borne lente à charger était prête en même temps que lui, et l'attente ne se voyait pas).
 */
const BRUNO_LOADING_MS = 6000;
// Huit secondes : la carte d'attente ne compte qu'une fois sa fenêtre chargée, ce qui a pris jusqu'à
// quatre secondes sur un poste chargé (12/11/2026) ; avec cinq, l'attente ne se voyait presque plus.
const BRUNO_LATE_MS = 8000;
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
 * millisecondes après leur démarrage (l'autopilote de la démonstration regarde le
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
  let me = setName(newSocialState(now), 'Alexis')!;
  // Messagerie et profil public : un record de la borne, que Dora aimera (startSimulatedPlayers).
  if (env.CYBERPINBALL_RESEAU_DEMO === 'messagerie') me = addEvent(me, { kind: 'record', table: DEMO_TABLES.brunoPlaysAgain, score: 8_902_110, rank: 1, initials: 'ALX' }, new Date(now.getTime() - 2 * 3600_000)).state;
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
  if (['partie', 'partie-coupure', 'partie-sans-releve', 'parties-enchainees'].includes(env.CYBERPINBALL_RESEAU_DEMO ?? '')) seedHistory(dataDir, me.key.publicKey, emile.key.publicKey, now);
  if (env.CYBERPINBALL_RESEAU_DEMO === 'messagerie') seedChat(dataDir, me, emile, now);
  if (env.CYBERPINBALL_RESEAU_DEMO === 'notifications') {
    for (const friend of [emile, ...others]) {
      const dir = path.join(dataDir, 'reseau-simule', friend.name);
      fs.mkdirSync(dir, { recursive: true });
      saveSocial(dir, { ...friend, friends: [{ key: me.key.publicKey, name: me.name, since, events: [] }] });
    }
  }
}

/**
 * Messagerie : la conversation avec Émile, hier soir (son message, ma réponse reçue), puis deux
 * messages d'aujourd'hui qui attendent sa connexion. Signés par leurs vraies clés, comme sur le réseau.
 */
function seedChat(dataDir: string, me: SocialState, emile: SocialState, now: Date): void {
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600_000);
  const fromEmile = writeLine(newChatState(), emile.key, me.key.publicKey, { text: 'À demain pour la revanche sur Thunder Reef !' }, at(21)).line!; // i18n-ignore : message d'un joueur fictif
  let chat = receiveLines(newChatState(), emile.key.publicKey, [verifyWire(toWire(fromEmile), emile.key.publicKey, me.key.publicKey, now)!]).state;
  chat = { ...chat, conversations: { ...chat.conversations, [emile.key.publicKey]: { ...chat.conversations[emile.key.publicKey]!, unread: 0 } } };
  const reply = writeLine(chat, me.key, emile.key.publicKey, { text: 'Je m’entraîne d’ici là.' }, at(20.9)); // i18n-ignore : message d'un joueur fictif
  chat = acknowledge(reply.state, emile.key.publicKey, [reply.line!.id]);
  chat = writeLine(chat, me.key, emile.key.publicKey, { text: 'Je suis prêt pour Thunder Reef.' }, at(2)).state; // i18n-ignore : message d'un joueur fictif
  chat = writeLine(chat, me.key, emile.key.publicKey, { text: 'Je lance vers 21 h si tu passes.' }, at(1.9)).state; // i18n-ignore : message d'un joueur fictif
  saveChat(dataDir, chat);
}

/** Deux parties entre amis déjà jouées avec Émile (hier soir, et trois jours plus tôt), dans <données>\amis\parties.json. */
function seedHistory(dataDir: string, me: string, emile: string, now: Date): void {
  const day = (days: number, hour: number) => {
    const d = new Date(now.getTime() - days * 86_400_000);
    d.setHours(hour, 40, 0, 0);
    return d.toISOString();
  };
  const game = (id: string, table: { title: string; manufacturer: string; year: number }, at: string, players: LiveGame['players']): LiveGame => ({
    id,
    host: me,
    table: { table, balls: 3 },
    title: `${table.title} (${table.manufacturer} ${table.year})`,
    players,
    phase: 'finished',
    createdAt: at,
    startAt: at,
  });
  const history = emptyHistory();
  addToHistory(history, game('d0d0d0d0d0d00001', DEMO_TABLES.emileRecord, day(1, 21), [
    { key: me, name: 'Alexis', state: 'done', host: true, score: 31_870_400, seconds: 512 },
    { key: emile, name: 'Émile', state: 'done', settings: 'ok', score: 48_250_110, seconds: 655, records: [{ score: 48_250_110, rank: 2, initials: 'EMI' }] }, // i18n-ignore : nom d'un joueur fictif
  ]), me);
  addToHistory(history, game('d0d0d0d0d0d00002', DEMO_TABLES.brunoPlaysAgain, day(3, 20), [
    { key: me, name: 'Alexis', state: 'done', host: true, score: 12_400_950, seconds: 431 },
    { key: emile, name: 'Émile', state: 'done', settings: 'ok', balls: 5, score: 19_007_320, seconds: 803 }, // i18n-ignore : nom d'un joueur fictif
  ]), me);
  saveHistory(path.join(dataDir, 'amis', 'parties.json'), history);
}

async function bot(dataDir: string, name: string, lan: boolean, bootstrap: { host: string; port: number }[], extra: Partial<SocialState> = {}, avatar?: [number, number, number]): Promise<SocialNet> {
  const dir = path.join(dataDir, 'reseau-simule', name);
  fs.mkdirSync(dir, { recursive: true });
  // Une borne fictive déjà venue (démarrage suivant de la démonstration) garde sa clé et ses amis.
  if (fs.existsSync(socialFile(dir))) saveSocial(dir, { ...loadSocial(dir), lan, ...extra });
  else saveSocial(dir, { ...setName(newSocialState(), name)!, lan, ...extra });
  const net = createSocialNet({ dataDir: dir, mode: 'simulated', host: '127.0.0.1', bootstrap });
  // Son avatar (avatar.ts) : une silhouette dessinée, jamais une vraie photo (les captures sont publiques).
  if (avatar) net.setAvatar(readAvatarImage(avatarPicture(avatar)));
  await net.start();
  return net;
}

/** Avatar inventé d'une borne fictive : une silhouette claire (tête et épaules) sur un dégradé de sa teinte. */
function avatarPicture(hue: [number, number, number]): Buffer {
  const size = 128;
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = 0.3 + (0.5 * (x + y)) / (2 * size);
      const head = (x - 64) ** 2 + (y - 50) ** 2 < 22 ** 2;
      const shoulders = ((x - 64) / 46) ** 2 + ((y - 128) / 46) ** 2 < 1;
      const light = head || shoulders ? 1.9 : 1;
      data.set([Math.min(255, Math.round(hue[0] * k * light)), Math.min(255, Math.round(hue[1] * k * light)), Math.min(255, Math.round(hue[2] * k * light)), 255], (y * size + x) * 4);
    }
  }
  return encodePng({ width: size, height: size, data });
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
function brunoRoot(dir: string, mine: readonly TableEntry[], cut = false, sameVersion = false, common = 1): string {
  const root = path.join(dir, 'borne');
  const tables = layoutOf(root).tables;
  // Les tables qu'il a aussi (`common`, celles de la borne d'abord), puis celle qu'elle n'a pas.
  const shared = mine.slice(0, common);
  const folders = [...shared.map((t) => path.basename(t.folder)), DEMO_TABLES.notOnCabinet];
  for (const [i, folder] of folders.entries()) {
    const other = folder === DEMO_TABLES.notOnCabinet;
    const at = path.join(tables, folder);
    fs.mkdirSync(path.join(at, 'medias'), { recursive: true });
    const vpx = path.join(at, `${folder}.vpx`);
    if (!other && sameVersion) fs.copyFileSync(shared[i]!.file, vpx);
    else if (!fs.existsSync(vpx)) fs.writeFileSync(vpx, other && cut ? bigTable(CUT_TABLE_BYTES) : Buffer.alloc(200_000 + i, 9));
    const hue: [number, number, number] = other ? [200, 90, 220] : [40, 200, 170];
    fs.writeFileSync(path.join(at, 'medias', `(Wheel) ${folder}.png`), picture(256, 256, hue));
    fs.writeFileSync(path.join(at, 'medias', `(Backglass) ${folder}.png`), picture(640, 480, hue));
    fs.writeFileSync(path.join(at, 'medias', `(GameHelp) ${folder}.png`), picture(480, 640, hue));
    fs.writeFileSync(path.join(at, 'medias', `(Topper) ${folder}.png`), picture(768, 256, hue));
    fs.writeFileSync(path.join(at, 'medias', `(FullDMD) ${folder}.png`), picture(640, 360, hue));
    fs.writeFileSync(path.join(at, 'medias', `(Loading) ${folder}.png`), picture(640, 360, hue));
    if (other) {
      // Une archive zip vide (sa seule fin de répertoire) et un écran de PuP-Pack.
      fs.mkdirSync(path.join(at, 'pinmame', 'roms'), { recursive: true });
      fs.writeFileSync(path.join(at, 'pinmame', 'roms', 'glag_l1.zip'), Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]));
      fs.mkdirSync(path.join(at, PUP_FOLDER, 'glag_l1'), { recursive: true });
      fs.writeFileSync(path.join(at, PUP_FOLDER, 'glag_l1', 'screens.pup'), 'ScreenNum,ScreenDes\r\n2,Backglass\r\n');
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
  const bruno = await bot(dataDir, 'Bruno', false, bootstrap, { shareLibrary: true }, [70, 150, 200]);
  const chloe = await bot(dataDir, 'Chloé', false, bootstrap, {}, [200, 110, 150]); // i18n-ignore : nom d'un joueur fictif

  /** Minuteurs posés avant ceux des scénarios (le « J'aime » de Dora) : arrêtés avec eux. */
  const timersLater: NodeJS.Timeout[] = [];
  const dora = await bot(dataDir, 'Dora', true, bootstrap, mode === 'communaute' ? { country: 'FR' } : {});
  // Communauté : des joueurs qui ne sont pas des amis, de plusieurs pays ; deux en partie (jamais la table chez les autres).
  const strangers: SocialNet[] = [];
  if (mode === 'communaute') {
    const people: [string, string, boolean, [number, number, number]][] = [
      ['Kiko', 'FR', false, [210, 120, 80]],
      ['Ressort', 'FR', true, [120, 190, 90]],
      ['Vortex', 'BE', true, [80, 120, 210]],
      ['Tiltman', 'CA', false, [200, 90, 160]],
    ];
    for (const [name, country, playing, hue] of people) {
      const net = await bot(dataDir, name, false, bootstrap, { country }, hue);
      if (playing) net.setPresence({ status: 'playing', table: DEMO_TABLES.brunoPlays, since: new Date(Date.now() - 8 * 60_000).toISOString() });
      strangers.push(net);
    }
    // Salon France : ils y entrent (règles acceptées), écrivent quelques lignes, Bruno cite la borne.
    const room = 'pays-FR';
    const say = (net: SocialNet, text: string, ms: number, action = false) => timersLater.push(setTimeout(() => void net.roomSend(room, text, action), ms));
    for (const net of [...strangers, bruno, dora]) {
      net.setRooms({ rulesAt: new Date().toISOString() });
      net.roomOpen(room);
    }
    const [kiko, ressort, vortex] = strangers;
    say(kiko!, 'bonsoir ! quelqu’un sur Star Courier ce soir ?', 1500); // i18n-ignore : ligne d'un joueur fictif
    say(ressort!, 'la nouvelle version de Thunder Reef est sortie, le multibille est enfin jouable', 3000); // i18n-ignore : ligne d'un joueur fictif
    say(dora, 'oui, la rampe de gauche est réglée au millimètre', 4500); // i18n-ignore : ligne d'un joueur fictif
    say(vortex!, 'salut de Bruxelles, je passe par le salon France', 6000); // i18n-ignore : ligne d'un joueur fictif
    say(kiko!, 'lance une partie de Star Courier, qui me suit ?', 7500, true); // i18n-ignore : ligne d'un joueur fictif
    say(bruno, `@${me.name} tu viens ? je finis ma bille et je lance une partie en direct`, 9000); // i18n-ignore : ligne d'un joueur fictif
  }
  // Profil public (messagerie) : Dora, qui n'est pas une amie, publie un record et un badge, puis aime le record de la borne.
  if (mode === 'messagerie') {
    dora.publish({ kind: 'record', table: DEMO_TABLES.emileRecord, score: 14_210_500, rank: 1, initials: 'DOR' });
    dora.publish({ kind: 'badge', badge: 'five-champion' });
    const likeTimer = setInterval(() => {
      const event = dora.publicCard(me.key)?.events[0];
      if (!event) return;
      clearInterval(likeTimer);
      dora.like(me.key, event.id, true);
      log('Réseau simulé : Dora aime le record de la borne.'); // i18n-ignore : journal
    }, 500);
    timersLater.push(likeTimer);
  }
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
  const brunoVersions = createTableVersions(brunoDir);
  const content: FriendContent = createFriendContent({
    net: cut ? throttled : bruno,
    dataDir: brunoDir,
    log: (line) => log(`Bruno : ${line}`), // i18n-ignore : journal
    tables: brunoTables,
    root: () => root,
    contents: (table) => (root ? tableContents(table.file, { ownFolder: true, romLibrary: layoutOf(root).roms }) : undefined),
    // Sa bibliothèque donne la version de ses tables, comme celle d'une borne à jour.
    versionOf: (table) => brunoVersions.of(table),
  });
  const timers: NodeJS.Timeout[] = [];
  // Messagerie : Bruno répond à ce que la borne lui écrit (une réaction, puis une phrase).
  let brunoChat: ChatService | undefined;
  if (mode === 'messagerie') {
    brunoChat = createChatService({
      net: bruno,
      dataDir: brunoDir,
      resendMs: 3000,
      log: (line) => log(`Bruno : ${line}`), // i18n-ignore : journal
      onArrive: (key, lines) => {
        const last = lines.at(-1)!;
        timers.push(setTimeout(() => {
          brunoChat?.react(key, last.id, 'bravo');
          brunoChat?.send(key, 'Parfait, je lance Star Courier.'); // i18n-ignore : message d'un joueur fictif
        }, 1500));
      },
    });
    timers.push(setInterval(() => brunoChat?.observe(), 500));
  }
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
  /** La partie dont Bruno a donné le départ, et celle après laquelle il a déjà réinvité. */
  let startedFor = '';
  let againAfter = '';
  const chained = mode === 'parties-enchainees';
  let round = 0;
  const liveDemo = LIVE_DEMOS.includes(mode ?? '');
  const manual = mode === 'partie-sans-releve';
  // Coupure pendant l'attente : rien ne passe, dans un sens ni dans l'autre, et la borne de Bruno ne voit plus la sienne.
  let cutUntil = 0;
  const cutNow = () => Date.now() < cutUntil;
  const liveNet: Pick<SocialNet, 'state' | 'online' | 'send' | 'onMessage'> = {
    state: () => bruno.state(),
    online: (key) => !cutNow() && bruno.online(key),
    send: (key, message) => !cutNow() && bruno.send(key, message),
    onMessage: (listener) =>
      bruno.onMessage((key, message) => {
        if (cutNow()) return;
        // La borne lance sa table : la liaison tombe, son « prêt » se perdra (une fois).
        const m = message as { t?: string; state?: string; ready?: boolean };
        if (mode === 'partie-coupure' && !cutUntil && m.t === 'game-status' && m.state === 'loading' && !m.ready) {
          cutUntil = Date.now() + LIVE_CUT_MS;
          log(`Réseau simulé : liaison de Bruno coupée ${LIVE_CUT_MS / 1000} s pendant l'attente du départ.`); // i18n-ignore : journal
          timers.push(setTimeout(() => log('Réseau simulé : liaison de Bruno rétablie.'), LIVE_CUT_MS)); // i18n-ignore : journal
        }
        listener(key, message);
      }),
  };
  if (liveDemo) {
    games = createLiveGames({
      net: liveNet,
      dataDir: brunoDir,
      // Son journal, préfixé : ce que fait sa borne se lit avec celui de la borne.
      log: (line) => log(`Bruno : ${line}`), // i18n-ignore : journal
      tables: brunoTables,
      // Ses réglages partent vers la borne, comme ceux d'une vraie borne (hostsettings.ts).
      settingsOf: (table) => readHostSettings({ folder: table.folder, roms: [] }),
      // Sans relevé : sa table le dit dans l'invitation (départ manuel, pas de score en direct).
      ...(manual ? { manualOf: async () => 'script' as const } : {}),
      play: async (_table, playing, _settings, _board, progress, gate) => {
        playing();
        // Départ commun : sa table charge, et n'est prête qu'après celle de la borne (la borne l'attend, et le dit), puis il attend « partez ».
        const loading = Date.now();
        const guestReady = () => games?.current()?.players.some((p) => !p.host && p.ready) ?? true;
        while (!guestReady() && Date.now() - loading < 60_000) await new Promise((r) => setTimeout(r, 100));
        await new Promise((r) => setTimeout(r, Math.max(BRUNO_LATE_MS, BRUNO_LOADING_MS - (Date.now() - loading))));
        gate?.ready({ manual });
        while (gate && !gate.go()) await new Promise((r) => setTimeout(r, 250));
        // Sa progression, comme le relevé d'une vraie borne : le score monte, bille après bille (sans relevé : rien, sa partie dure autant).
        for (let i = 1; i <= 8; i++) {
          await new Promise((r) => setTimeout(r, 500));
          if (!manual) progress?.({ score: i * 355_168_765, ball: Math.min(3, 1 + Math.floor(i / 3)), balls: 3, players: 1 });
        }
        return { ok: true, seconds: 254, records: [{ score: 2_841_350_120, rank: 1, initials: 'BRU' }] };
      },
      // La borne a accepté : Bruno donne le départ un peu après. Parties à la suite : la partie finie,
      // il ferme la sienne et réinvite, jusqu'à la dernière.
      onChange: () => {
        const game = games?.current();
        if (chained && game?.phase === 'finished' && againAfter !== game.id && round + 1 < CHAINED_TABLES.length) {
          againAfter = game.id;
          timers.push(
            setTimeout(() => {
              round++;
              games?.close();
              log(`Réseau simulé : Bruno réinvite la borne (partie ${round + 1} sur ${CHAINED_TABLES.length}).`); // i18n-ignore : journal
              void invite();
            }, CHAINED_AFTER_MS),
          );
        }
        if (!game || startedFor === game.id || game.phase !== 'gathering' || !game.players.some((p) => !p.host && p.state === 'accepted')) return;
        startedFor = game.id;
        timers.push(setTimeout(() => games?.start(), 3500));
      },
    });
  }
  // La borne pas encore vue en ligne chez Bruno (liaison qui se refait) : l'invitation ne part pas ;
  // il réessaie, comme un joueur, toutes les deux secondes, une minute au plus, et le journal le dit.
  // Parties à la suite : la table de cette partie (CHAINED_TABLES), parmi celles qu'ils ont tous deux.
  const invite = async (tries = 0): Promise<void> => {
    if (!games) return;
    bruno.setPresence({ status: 'menu', since: new Date().toISOString() });
    const want = chained ? path.basename(mine()[CHAINED_TABLES[round]!]?.folder ?? '') : undefined;
    const shared = (want && brunoTables().find((t) => path.basename(t.folder) === want)) || brunoTables()[0];
    if (!shared) return;
    try {
      if (!games.current()) await games.create(shared);
    } catch (error) {
      return log(`Réseau simulé : salon de Bruno pas ouvert sur ${shared.title} (${(error as Error).message}).`); // i18n-ignore : journal
    }
    if (games.invite(me.key, me.name)) return log(`Réseau simulé : Bruno invite la borne sur ${shared.title}.`); // i18n-ignore : journal
    if (tries >= 30) return log('Réseau simulé : invitation de Bruno abandonnée après une minute.'); // i18n-ignore : journal
    if (!tries) log('Réseau simulé : invitation de Bruno pas partie (borne pas encore en ligne chez lui), nouvel essai toutes les 2 s.'); // i18n-ignore : journal
    timers.push(setTimeout(() => void invite(tries + 1), 2000));
  };
  /**
   * Fins d'invitation (parcours « fins-invitation » de la démonstration) : Bruno
   * invite la borne pendant qu'elle est dans un sous-écran du menu système, puis annule ; réinvite,
   * et voit son refus ; puis l'invite pendant sa partie, et annule encore. Chaque étape attend ce
   * qu'en voit une vraie borne (le refus, la borne en partie), ou le signal que l'autopilote pose
   * quand la borne est à l'écran voulu (`<données>\reseau-simule\signal-N`, étape « copy: ») : la
   * démonstration ne parie pas sur la durée de ses étapes.
   */
  async function endsScript(): Promise<void> {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const wait = async (what: string, ok: () => boolean, ms = 90_000) => {
      for (const end = Date.now() + ms; !ok(); await sleep(200)) if (Date.now() > end) throw new Error(what);
    };
    const guest = () => games?.current()?.players.find((p) => p.key === me.key);
    const signal = (n: number) => wait(`signal ${n}`, () => fs.existsSync(path.join(dataDir, 'reseau-simule', `signal-${n}`)), 300_000);
    try {
      // La borne est dans un sous-écran du menu système : Bruno lance une partie (une notification, avec le compteur), puis invite.
      await signal(1);
      bruno.setPresence({ status: 'playing', table: DEMO_TABLES.brunoPlays, since: new Date().toISOString() });
      await sleep(4000);
      await invite();
      await wait('invitation reçue', () => // i18n-ignore : journal
        guest()?.state === 'invited');
      // L'invitation vue par-dessus le sous-écran : il annule.
      await signal(2);
      log('Réseau simulé : Bruno annule son invitation.'); // i18n-ignore : journal
      games?.leave();
      // Le second sous-écran : il réinvite.
      await signal(3);
      await invite();
      await wait('réponse de la borne', () => // i18n-ignore : journal
        !!guest() && guest()!.state !== 'invited');
      log(`Réseau simulé : Bruno voit la réponse de la borne (${guest()!.state}).`); // i18n-ignore : journal
      // Dans le second sous-écran : il relance une autre table (une notification de plus là aussi).
      await sleep(1500);
      bruno.setPresence({ status: 'playing', table: DEMO_TABLES.brunoPlaysAgain, since: new Date().toISOString() });
      await wait('borne en partie', () => // i18n-ignore : journal
        bruno.presenceOf(me.key)?.status === 'playing', 180_000);
      await sleep(1500);
      await invite();
      await sleep(6000);
      log('Réseau simulé : Bruno annule son invitation pendant la partie de la borne.'); // i18n-ignore : journal
      games?.leave();
    } catch (error) {
      log(`Réseau simulé : scénario des fins d'invitation interrompu (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }
  bruno.request(me);
  chloe.request(me);
  // Bruno devient ami (la démonstration accepte à la place du joueur), puis joue. Déjà ami (retour) : sa bibliothèque tout de suite.
  const accept = setInterval(() => {
    if (main.state().friends.some((f) => f.key === bruno.state().key.publicKey)) {
      root ??= brunoRoot(brunoDir, mine(), cut, liveDemo, chained ? 2 : 1);
      clearInterval(accept);
      return;
    }
    if (main.state().incoming.some((r) => r.key === bruno.state().key.publicKey)) {
      root ??= brunoRoot(brunoDir, mine(), cut, liveDemo, chained ? 2 : 1);
      main.accept(bruno.state().key.publicKey);
      clearInterval(accept);
      // Notifications : Bruno suit l'horaire de la démonstration (NOTIFICATIONS_SCRIPT).
      if (!notices) {
        const table = DEMO_TABLES.brunoPlays;
        bruno.setPresence({ status: 'playing', table, since: new Date(Date.now() - 12 * 60_000).toISOString() });
        bruno.publish({ kind: 'record', table, score: 3_215_480_250, rank: 1, initials: 'BRU' });
      }
      // Messagerie : deux messages de Bruno, une fois amis.
      if (brunoChat) {
        timers.push(setTimeout(() => brunoChat?.send(me.key, 'Je t’ai repris Star Courier. Revanche ce soir ?'), 3000)); // i18n-ignore : message d'un joueur fictif
        timers.push(setTimeout(() => brunoChat?.send(me.key, 'Je lance la partie à 21 h, tu viens ?'), 4500)); // i18n-ignore : message d'un joueur fictif
      }
      // Partie en direct : l'invitation, une fois la borne reliée et le menu affiché ; en-jeu, une
      // fois la borne en partie (sa présence le dit).
      if (games && mode === 'fins-invitation') void endsScript();
      else if (games) {
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
    for (const timer of [...timers, ...timersLater]) clearTimeout(timer);
    brunoChat?.stop();
    content.stop();
    games?.stop();
    await Promise.all([bruno.stop(), chloe.stop(), dora.stop(), ...strangers.map((n) => n.stop()), ...pair.map((n) => n.stop()), ...(emile ? [emile.stop()] : [])]);
  };
}
