// Bornes fictives du réseau simulé (CYBERPINBALL_RESEAU=simule et CYBERPINBALL_RESEAU_DEMO=1) :
// la démonstration docs\demo-amis.ps1 montre les écrans « Amis » peuplés, sans aucune borne
// réelle. Elles tournent dans le processus, sur le réseau d'essai de 127.0.0.1 de la borne :
//   Bruno  : ami, en partie sur une table, vient de battre son record et de gagner un badge ;
//   Chloé  : envoie une demande d'ami, à valider ;
//   Dora   : borne voisine (réseau local simulé), sans lien ;
//   Émile  : ami hors ligne depuis trois heures (écrit dans social.json avant le démarrage).
// Leurs dossiers sont dans <données>\reseau-simule\ (le bac à sable de l'essai).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { addEvent, newSocialState, saveSocial, setName, socialFile, type SocialState } from '@cyberpinball/core';
import { createSocialNet, type SocialNet } from './social-net';

export function simulatedPlayersWanted(env: NodeJS.ProcessEnv): boolean {
  return env.CYBERPINBALL_RESEAU_DEMO === '1';
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

async function bot(dataDir: string, name: string, lan: boolean, bootstrap: { host: string; port: number }[]): Promise<SocialNet> {
  const dir = path.join(dataDir, 'reseau-simule', name);
  fs.mkdirSync(dir, { recursive: true });
  saveSocial(dir, { ...setName(newSocialState(), name)!, lan });
  const net = createSocialNet({ dataDir: dir, mode: 'simulated', host: '127.0.0.1', bootstrap });
  await net.start();
  return net;
}

/** Après le démarrage de la borne : les bornes fictives la rejoignent et jouent leur rôle. */
export async function startSimulatedPlayers(main: SocialNet, dataDir: string, log: (line: string) => void): Promise<() => Promise<void>> {
  const bootstrap = main.simulatedBootstrap();
  if (!bootstrap) return async () => undefined;
  const me = { key: main.state().key.publicKey, name: main.state().name };
  const bruno = await bot(dataDir, 'Bruno', false, bootstrap);
  const chloe = await bot(dataDir, 'Chloé', false, bootstrap); // i18n-ignore : nom d'un joueur fictif
  const dora = await bot(dataDir, 'Dora', true, bootstrap);
  bruno.request(me);
  chloe.request(me);
  // Bruno devient ami (la démonstration accepte à la place du joueur), puis joue.
  const accept = setInterval(() => {
    if (main.state().incoming.some((r) => r.key === bruno.state().key.publicKey)) {
      main.accept(bruno.state().key.publicKey);
      clearInterval(accept);
      const table = { title: 'Attack from Mars', manufacturer: 'Bally', year: 1995 };
      bruno.setPresence({ status: 'playing', table, since: new Date(Date.now() - 12 * 60_000).toISOString() });
      bruno.publish({ kind: 'record', table, score: 3_215_480_250, rank: 1, initials: 'BRU' });
    }
  }, 100);
  log('Réseau simulé : bornes fictives Bruno, Chloé, Dora démarrées.'); // i18n-ignore : journal
  return async () => {
    clearInterval(accept);
    await Promise.all([bruno.stop(), chloe.stop(), dora.stop()]);
  };
}
