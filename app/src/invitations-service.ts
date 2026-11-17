// Personnes invitées côté application (invitations.ts pour les règles, invite-menu.ts pour l'écran) :
// l'empreinte de la machine (MachineGuid de Windows, lu une fois, jamais envoyé tel quel), l'écran
// « Qui vous a fait découvrir Cyber Pinball ? » et ce que l'accueil du profil et « Mon profil
// public » en montrent.
//
// Essais et démonstrations : CYBERPINBALL_MACHINE remplace le MachineGuid (plusieurs bornes fictives
// sur un même PC ont chacune leur machine).

import { execFile } from 'node:child_process';
import { inviterAsked, machineTag, type InvitationStore, type SocialState } from '@cyberpinball/core';
import { createInviteMenu, type InviteMenuHost } from './invite-menu';

export interface InvitationsServiceHost {
  library: InviteMenuHost['library'];
  net: InviteMenuHost['net'] & { state(): SocialState & { profileOffered?: string }; invitations(): InvitationStore };
  played(): boolean;
}

/** Ce que l'accueil du profil et « Mon profil public » proposent (profile-welcome.ts, profile-menu.ts). */
export interface InviteEntry {
  asked(): boolean;
  chosen(): string | undefined;
  open(back: () => void): void;
}

/** MachineGuid de Windows (HKLM\SOFTWARE\Microsoft\Cryptography) ; undefined si illisible. */
export function readMachineGuid(): Promise<string | undefined> {
  if (process.platform !== 'win32') return Promise.resolve(undefined);
  return new Promise((resolve) => {
    execFile('reg', ['query', String.raw`HKLM\SOFTWARE\Microsoft\Cryptography`, '/v', 'MachineGuid'], { windowsHide: true, timeout: 10_000 }, (error, stdout) => {
      if (error) return resolve(undefined);
      resolve(/MachineGuid\s+REG_SZ\s+([0-9a-f-]{16,})/i.exec(String(stdout))?.[1]);
    });
  });
}

/**
 * L'empreinte de cette machine (invitations.ts, machineTag), lue une fois au démarrage : rend
 * undefined tant qu'elle n'est pas lue, ou si elle est illisible.
 */
export function createMachineTag(log: (line: string) => void): () => string | undefined {
  let machine: string | undefined = process.env.CYBERPINBALL_MACHINE ? machineTag(process.env.CYBERPINBALL_MACHINE) : undefined;
  if (!machine)
    void readMachineGuid().then((guid) => {
      if (guid) machine = machineTag(guid);
      else log('Personnes invitées : empreinte de la machine illisible ; une invitation déclarée attendra.'); // i18n-ignore : journal
    });
  return () => machine;
}

export function createInvitationsService(host: InvitationsServiceHost) {
  const menu = createInviteMenu(host);
  const entry: InviteEntry = {
    asked: () => inviterAsked(host.net.invitations(), host.net.state().profileOffered),
    chosen: () => {
      const inv = host.net.invitations();
      return inv.mine ? undefined : inv.declared?.name;
    },
    open: (back) => menu.open(back),
  };
  return { entry };
}
