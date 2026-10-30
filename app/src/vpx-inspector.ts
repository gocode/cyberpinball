// L'inspector de VPX pour une partie entre amis (packages/core/src/vpxinspector.ts) : il n'est
// proposé au double de la table que si la règle du pare-feu qui ferme VPX au réseau est posée pour
// la version active de VPX (relue avant chaque partie : VPX a pu changer de version), et sur un port
// libre de 127.0.0.1, cherché sans rien ouvrir en écoute (une connexion refusée : le port est libre).

import * as fs from 'node:fs';
import * as net from 'node:net';
import { INSPECTOR_PORTS, vpxFirewallPrograms } from '@cyberpinball/core';
import type { FirewallRule } from './firewall-rule';

/** Les programmes que la règle de VPX doit viser : le dossier réel de la version active, et la jonction par laquelle VPX est lancé. */
export function vpxFirewallTargets(exe: string | undefined): string[] | undefined {
  if (!exe) return undefined;
  try {
    return vpxFirewallPrograms(fs.realpathSync.native(exe), exe);
  } catch {
    return undefined;
  }
}

/** Le port est-il libre à 127.0.0.1 ? Une connexion refusée le dit ; une réponse, ou rien en 300 ms, non. */
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (free: boolean) => {
      socket.destroy();
      resolve(free);
    };
    socket.setTimeout(300, () => done(false));
    socket.once('connect', () => done(false));
    socket.once('error', (error: NodeJS.ErrnoException) => done(error.code === 'ECONNREFUSED'));
  });
}

export async function freeInspectorPort(ports: readonly number[] = INSPECTOR_PORTS): Promise<number | undefined> {
  for (const port of ports) if (await portFree(port)) return port;
  return undefined;
}

/** L'inspector pour cette partie, ou undefined (règle de VPX absente ou d'une autre version, aucun port libre). */
export async function inspectorFor(firewall: Pick<FirewallRule, 'checkVpx'>, log?: (line: string) => void): Promise<{ port: number } | undefined> {
  const state = await firewall.checkVpx().catch(() => undefined);
  if (state !== 'closed') {
    if (state) log?.(`Partie entre amis : inspector de VPX pas proposé (règle du pare-feu de VPX : ${state}).`); // i18n-ignore : journal
    return undefined;
  }
  const port = await freeInspectorPort();
  if (!port) log?.(`Partie entre amis : inspector de VPX pas proposé (ports ${INSPECTOR_PORTS[0]} à ${INSPECTOR_PORTS.at(-1)} occupés).`); // i18n-ignore : journal
  return port ? { port } : undefined;
}
