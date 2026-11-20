// Clé développeur : ce qui ouvre, sur une machine précise, les fonctions réservées à qui maintient Cyber
// Pinball (VPX d'essai, app/src/vpx-essai.ts). Un fichier developpeur.json signé par la clé privée de
// publication des mises à jour (scripts/cle-developpeur.mjs), vérifié avec la clé publique livrée
// (updatePublicKey) : personne ne peut en fabriquer une sans cette clé privée, qui ne quitte jamais le
// poste de publication. La clé est liée à une machine (empreinte de son MachineGuid) : copiée sur un
// autre PC, elle n'ouvre rien.
//
// Fichier : %USERPROFILE%\.cyberpinball\developpeur.json (CYBERPINBALL_CLE_DEV le remplace, essais).
// Hors des données de la borne : ni sauvegardé, ni partagé, ni dans un rapport.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface DevKey {
  format: 1;
  /** Nom donné à la machine (« PC de développement », « PinCab »). */
  nom: string;
  /** Empreinte de la machine (devMachineTag) : rien de son MachineGuid ne s'y lit. */
  machine: string;
  /** Date de délivrance (ISO). */
  le: string;
  /** Signature Ed25519 de devKeyText, en base64. */
  signature: string;
}

/**
 * Emplacement de la clé développeur de ce compte Windows ; undefined dans un bac à sable
 * (CYBERPINBALL_HOME : essais, démonstrations) sans CYBERPINBALL_CLE_DEV : la vraie clé du poste n'y
 * entre jamais, sinon les essais verraient des entrées que les joueurs n'ont pas.
 */
export function devKeyFile(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.CYBERPINBALL_CLE_DEV) return env.CYBERPINBALL_CLE_DEV;
  if (env.CYBERPINBALL_HOME) return undefined;
  return path.join(os.homedir(), '.cyberpinball', 'developpeur.json');
}

/** Empreinte d'une machine pour la clé développeur (MachineGuid de Windows, haché). */
export function devMachineTag(machineGuid: string): string {
  return crypto.createHash('sha256').update(`cyberpinball:developpeur:${machineGuid.trim().toLowerCase()}`).digest('hex').slice(0, 32);
}

/** Texte signé : tout ce que la clé affirme. */
export function devKeyText(key: Pick<DevKey, 'nom' | 'machine' | 'le'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'developpeur', v: 1, nom: key.nom, machine: key.machine, le: key.le });
}

/** Délivre une clé pour une machine (scripts/cle-developpeur.mjs, avec la clé privée de publication). */
export function signDevKey(machineGuid: string, nom: string, privateKeyPem: string, now = new Date()): DevKey {
  const base = { nom: nom.trim(), machine: devMachineTag(machineGuid), le: now.toISOString() };
  const signature = crypto.sign(null, Buffer.from(devKeyText(base), 'utf8'), crypto.createPrivateKey(privateKeyPem)).toString('base64');
  return { format: 1, ...base, signature };
}

/**
 * La clé est-elle valable sur cette machine ? Signée par la clé de publication, et délivrée pour ce
 * MachineGuid. Renvoie son nom, sinon undefined (absente, abîmée, d'une autre machine, mal signée).
 */
export function checkDevKey(text: string | undefined, machineGuid: string | undefined, publicKeyPem: string): { nom: string } | undefined {
  if (!text || !machineGuid) return undefined;
  try {
    const k = JSON.parse(text.replace(/^﻿/, '')) as Partial<DevKey>;
    if (k.format !== 1 || typeof k.nom !== 'string' || typeof k.machine !== 'string' || typeof k.le !== 'string' || typeof k.signature !== 'string') return undefined;
    if (k.machine !== devMachineTag(machineGuid)) return undefined;
    const ok = crypto.verify(null, Buffer.from(devKeyText({ nom: k.nom, machine: k.machine, le: k.le }), 'utf8'), crypto.createPublicKey(publicKeyPem), Buffer.from(k.signature, 'base64'));
    return ok ? { nom: k.nom } : undefined;
  } catch {
    return undefined;
  }
}

/** Lit la clé développeur de ce compte (devKeyFile) ; undefined si elle manque. */
export function readDevKeyText(file = devKeyFile()): string | undefined {
  if (!file) return undefined;
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}
