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
// table qu'ils ont tous deux, lance le départ dès qu'elle accepte, joue quatre secondes et bat
// son record.
// Leurs dossiers sont dans <données>\reseau-simule\ (le bac à sable de l'essai).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { addEvent, encodePng, layoutOf, newSocialState, saveSocial, scanTables, setName, socialFile, type SocialState, type TableEntry } from '@cyberpinball/core';
import { createFriendContent, type FriendContent } from './friend-content';
import { createLiveGames, type LiveGames } from './live-game';
import { createSocialNet, type SocialNet } from './social-net';

export function simulatedPlayersWanted(env: NodeJS.ProcessEnv): boolean {
  return env.CYBERPINBALL_RESEAU_DEMO === '1' || env.CYBERPINBALL_RESEAU_DEMO === 'partie';
}

/** Avant le démarrage : un ami hors ligne et son dernier évènement, dans l'état de la borne. */
export function seedSimulatedFriends(dataDir: string, now = new Date()): void {
  if (fs.existsSync(socialFile(dataDir))) return;
  const me = setName(newSocialState(now), 'Alexis')!;
  let emile = setName(newSocialState(now), 'Émile')!; // i18n-ignore : nom d'un joueur fictif
  const threeHours = new Date(now.getTime() - 3 * 3600_000);
  emile = addEvent(emile, { kind: 'record', table: { title: 'Medieval Madness', manufacturer: 'Williams', year: 1997 }, score: 48_250_110, rank: 2, initials: 'EMI' }, threeHours).state;
  const state: SocialState = {
    ...me,
    friends: [{ key: emile.key.publicKey, name: emile.name, since: new Date(now.getTime() - 20 * 86_400_000).toISOString(), lastSeen: threeHours.toISOString(), events: emile.events }],
    badges: [{ id: 'first-game', at: new Date(now.getTime() - 30 * 86_400_000).toISOString() }, { id: 'first-record', at: new Date(now.getTime() - 9 * 86_400_000).toISOString() }],
    badgesChecked: true,
  };
  saveSocial(dataDir, state);
}

async function bot(dataDir: string, name: string, lan: boolean, bootstrap: { host: string; port: number }[], extra: Partial<SocialState> = {}): Promise<SocialNet> {
  const dir = path.join(dataDir, 'reseau-simule', name);
  fs.mkdirSync(dir, { recursive: true });
  saveSocial(dir, { ...setName(newSocialState(), name)!, lan, ...extra });
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
 * Racine de Bruno : la première table de la borne (même dossier, autre .vpx : une autre version),
 * et une table que la borne n'a pas ; chacune avec quelques médias.
 */
function brunoRoot(dir: string, mine: readonly TableEntry[]): string {
  const root = path.join(dir, 'borne');
  const tables = layoutOf(root).tables;
  const folders = [...(mine[0] ? [path.basename(mine[0].folder)] : []), 'Bride of Pin-bot (Williams 1991)'];
  for (const [i, folder] of folders.entries()) {
    const at = path.join(tables, folder);
    fs.mkdirSync(path.join(at, 'medias'), { recursive: true });
    fs.writeFileSync(path.join(at, `${folder}.vpx`), Buffer.alloc(200_000 + i, 9));
    const hue: [number, number, number] = i ? [200, 90, 220] : [40, 200, 170];
    fs.writeFileSync(path.join(at, 'medias', `(Wheel) ${folder}.png`), picture(256, 256, hue));
    fs.writeFileSync(path.join(at, 'medias', `(Backglass) ${folder}.png`), picture(640, 480, hue));
    fs.writeFileSync(path.join(at, 'medias', `(GameHelp) ${folder}.png`), picture(480, 640, hue));
    fs.writeFileSync(path.join(at, 'medias', `(Topper) ${folder}.png`), picture(768, 256, hue));
    fs.writeFileSync(path.join(at, 'medias', `(FullDMD) ${folder}.png`), picture(640, 360, hue));
    fs.writeFileSync(path.join(at, 'medias', `(Loading) ${folder}.png`), picture(640, 360, hue));
  }
  return root;
}

/** Après le démarrage de la borne : les bornes fictives la rejoignent et jouent leur rôle. */
export async function startSimulatedPlayers(main: SocialNet, dataDir: string, mine: () => readonly TableEntry[], log: (line: string) => void, env: NodeJS.ProcessEnv = process.env): Promise<() => Promise<void>> {
  const bootstrap = main.simulatedBootstrap();
  if (!bootstrap) return async () => undefined;
  const me = { key: main.state().key.publicKey, name: main.state().name };
  const bruno = await bot(dataDir, 'Bruno', false, bootstrap, { shareLibrary: true });
  const chloe = await bot(dataDir, 'Chloé', false, bootstrap); // i18n-ignore : nom d'un joueur fictif
  const dora = await bot(dataDir, 'Dora', true, bootstrap);
  const brunoDir = path.join(dataDir, 'reseau-simule', 'Bruno');
  // Sa bibliothèque se fait à l'amitié : les tables de la borne sont lues d'ici là.
  let root: string | undefined;
  const brunoTables = () => (root ? scanTables(layoutOf(root).tables) : []);
  const content: FriendContent = createFriendContent({ net: bruno, dataDir: brunoDir, tables: brunoTables, root: () => root });
  const timers: NodeJS.Timeout[] = [];
  let games: LiveGames | undefined;
  let starting = false;
  if (env.CYBERPINBALL_RESEAU_DEMO === 'partie') {
    games = createLiveGames({
      net: bruno,
      dataDir: brunoDir,
      tables: brunoTables,
      busy: () => false,
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
  // Bruno devient ami (la démonstration accepte à la place du joueur), puis joue.
  const accept = setInterval(() => {
    if (main.state().incoming.some((r) => r.key === bruno.state().key.publicKey)) {
      root ??= brunoRoot(brunoDir, mine());
      main.accept(bruno.state().key.publicKey);
      clearInterval(accept);
      const table = { title: 'Attack from Mars', manufacturer: 'Bally', year: 1995 };
      bruno.setPresence({ status: 'playing', table, since: new Date(Date.now() - 12 * 60_000).toISOString() });
      bruno.publish({ kind: 'record', table, score: 3_215_480_250, rank: 1, initials: 'BRU' });
      // Partie en direct : l'invitation, une fois la borne reliée et le menu affiché.
      if (games) {
        timers.push(
          setTimeout(async () => {
            bruno.setPresence({ status: 'menu', since: new Date().toISOString() });
            const shared = brunoTables()[0];
            if (!shared) return;
            await games!.create(shared);
            games!.invite(me.key, me.name);
          }, 6000),
        );
      }
    }
  }, 100);
  log('Réseau simulé : bornes fictives Bruno, Chloé, Dora démarrées.'); // i18n-ignore : journal
  return async () => {
    clearInterval(accept);
    for (const timer of timers) clearTimeout(timer);
    content.stop();
    games?.stop();
    await Promise.all([bruno.stop(), chloe.stop(), dora.stop()]);
  };
}
