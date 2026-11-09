// Accès développeur : quelques réglages masqués, ouverts aux seules bornes qui ont un
// fichier d'accès signé par la clé de publication des mises à jour (update-key.ts).
//
// <données>\acces-developpeur.json = { format: 1, access: "<texte JSON>", signature: "<base64>" },
// la signature Ed25519 portant sur le texte exact de `access` :
//   { name, options: ["telechargement-direct", …], cabinets?: ["a3f9-12c0-7be4-55d1", …], date }
// `cabinets` (empreintes de la clé des bornes, rubrique Amis) limite l'accès à ces bornes ;
// absent, il vaut sur toute borne. Fabriqué par scripts/acces-developpeur.mjs.
//
// Le code étant libre, ce n'est pas une protection : c'est un masquage. Un fichier absent,
// illisible, mal signé ou destiné à une autre borne n'ouvre rien, sans message.

import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isPlayerPublicKey, playerFingerprint } from './sharing';
import { SOCIAL_FILE } from './social';
import { UPDATE_PUBLIC_KEY } from './update-key';

export const DEV_ACCESS_FILE = 'acces-developpeur.json';

/** Réglages masqués qu'un accès peut ouvrir. */
export const DEV_OPTIONS = ['telechargement-direct'] as const;
export type DevOption = (typeof DEV_OPTIONS)[number];

export interface DevAccess {
  /** Pour qui (repère de l'éditeur, jamais affiché ailleurs). */
  name: string;
  options: DevOption[];
  /** Empreintes des bornes autorisées ; absent : toute borne. */
  cabinets?: string[];
  date: string;
}

interface DevAccessEnvelope {
  format: 1;
  access: string;
  signature: string;
}

const FINGERPRINT = /^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/;

/** Empreinte écrite à la main (« A3F9 12C0 7BE4 55D1 ») ramenée à la forme de playerFingerprint. */
export function normalizeFingerprint(text: string): string | undefined {
  const hex = text.toLowerCase().replace(/[^0-9a-f]/g, '');
  if (hex.length !== 16) return undefined;
  return hex.match(/.{4}/g)!.join('-');
}

function checkAccess(a: unknown): DevAccess {
  const access = a as DevAccess;
  if (!access || typeof access.name !== 'string' || !access.name.trim()) throw new Error('dev access: no name');
  if (!Array.isArray(access.options) || !access.options.length || access.options.some((o) => !(DEV_OPTIONS as readonly string[]).includes(o))) throw new Error('dev access: unknown options');
  if (access.cabinets !== undefined && (!Array.isArray(access.cabinets) || !access.cabinets.length || access.cabinets.some((c) => typeof c !== 'string' || !FINGERPRINT.test(c)))) throw new Error('dev access: unreadable cabinet fingerprints');
  if (typeof access.date !== 'string' || Number.isNaN(Date.parse(access.date))) throw new Error('dev access: no date');
  return access;
}

/** Signe un accès (scripts/acces-developpeur.mjs) ; renvoie le texte du fichier. */
export function signDevAccess(access: DevAccess, privateKeyPem: string): string {
  checkAccess(access);
  const text = JSON.stringify(access, null, 2);
  const envelope: DevAccessEnvelope = { format: 1, access: text, signature: sign(null, Buffer.from(text, 'utf8'), createPrivateKey(privateKeyPem)).toString('base64') };
  return JSON.stringify(envelope, null, 2) + '\n';
}

/** L'accès porté par ce texte, s'il est bien signé ; undefined sinon. */
export function openDevAccess(raw: string, publicKeyPem: string = UPDATE_PUBLIC_KEY): DevAccess | undefined {
  try {
    const envelope = JSON.parse(raw.replace(/^﻿/, '')) as Partial<DevAccessEnvelope>;
    if (envelope.format !== 1 || typeof envelope.access !== 'string' || typeof envelope.signature !== 'string') return undefined;
    if (!verify(null, Buffer.from(envelope.access, 'utf8'), createPublicKey(publicKeyPem), Buffer.from(envelope.signature, 'base64'))) return undefined;
    return checkAccess(JSON.parse(envelope.access));
  } catch {
    return undefined;
  }
}

/** Clé publique de cette borne (réseau des bornes), lue sans créer ni modifier social.json. */
export function cabinetPublicKey(dataDir: string): string | undefined {
  try {
    const key = (JSON.parse(fs.readFileSync(path.join(dataDir, SOCIAL_FILE), 'utf8').replace(/^﻿/, '')) as { key?: { publicKey?: unknown } }).key?.publicKey;
    return typeof key === 'string' && isPlayerPublicKey(key) ? key : undefined;
  } catch {
    return undefined;
  }
}

/** Cet accès vaut-il pour la borne de cette clé ? */
export function accessFitsCabinet(access: DevAccess, cabinetKey: string | undefined): boolean {
  if (!access.cabinets) return true;
  return cabinetKey !== undefined && access.cabinets.includes(playerFingerprint(cabinetKey));
}

/** Ce réglage masqué est-il ouvert sur cette borne ? */
export function devOptionOpen(dataDir: string, option: DevOption, publicKeyPem: string = UPDATE_PUBLIC_KEY): boolean {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(dataDir, DEV_ACCESS_FILE), 'utf8');
  } catch {
    return false;
  }
  const access = openDevAccess(raw, publicKeyPem);
  return Boolean(access && access.options.includes(option) && accessFitsCabinet(access, cabinetPublicKey(dataDir)));
}
