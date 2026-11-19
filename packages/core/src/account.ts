// Mon compte : ce qui fait le compte d'un joueur, pris d'un bloc pour le garder hors de la racine
// de Cyber Pinball et le reprendre ailleurs (« Mon compte > Protéger et transférer »).
//
// Le compte tient dans quelques fichiers du dossier des données : social.json (la clé du joueur, son
// pseudo, son pays, ses amis, ses badges), niveau.json (XP et niveau), compte.json (ce qui le protège)
// et l'image de son avatar. Un « paquet de compte » les rassemble en un seul JSON :
// - la copie de secours, écrite d'office dans %APPDATA%\CyberPinball\comptes (hors de la racine :
//   une désinstallation, une racine effacée ou une réinstallation ailleurs la laissent), proposée
//   par une installation neuve au premier lancement (profile-welcome.ts) ;
// - le contenu du coffre chiffré (vault.ts), sans l'annuaire (il se reremplit seul).
// Rien ici ne parle au réseau : app/src/account-service.ts écrit la copie et envoie le coffre.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { avatarPath, isAvatarFileName } from './avatar';
import { LEVELS_FILE, levelOf, parseLevels } from './levels';
import { parseSocialState, playerSeed, SOCIAL_FILE, socialFile } from './social';

export const ACCOUNT_FILE = 'compte.json';
/** Dossier des copies de secours, sous %APPDATA%\CyberPinball. */
export const ACCOUNT_COPIES_DIR = 'comptes';
/** Copies gardées au plus (une par compte joué sur ce PC) ; au-delà, les plus anciennes partent. */
export const ACCOUNT_COPIES_MAX = 8;

/** Ce qui protège le compte (data\compte.json) ; aucun secret : ni mot de passe, ni mots du code. */
export interface AccountProtection {
  v: 1;
  /** Le joueur a noté son code de récupération (et l'a vérifié) : date. */
  codeNotedAt?: string;
  /** Mot de passe créé : l'identifiant (son pseudo au moment de la création) et la date. */
  password?: { name: string; at: string };
  /** Copie chiffrée gardée sur le serveur (coffre) ; false : le joueur l'a coupée. */
  vault?: boolean;
  /** Dernier envoi du coffre réussi : empreinte du paquet et date. */
  vaultSent?: { hash: string; at: string };
}

export const emptyProtection = (): AccountProtection => ({ v: 1 });

const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

export function parseProtection(raw: unknown): AccountProtection {
  const out = emptyProtection();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (isIso(r.codeNotedAt)) out.codeNotedAt = r.codeNotedAt;
  const p = r.password as Record<string, unknown> | undefined;
  if (p && typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 40 && isIso(p.at)) out.password = { name: p.name, at: p.at };
  if (r.vault === false) out.vault = false;
  const s = r.vaultSent as Record<string, unknown> | undefined;
  if (s && typeof s.hash === 'string' && /^[0-9a-f]{64}$/.test(s.hash) && isIso(s.at)) out.vaultSent = { hash: s.hash, at: s.at };
  return out;
}

export function loadProtection(dataDir: string): AccountProtection {
  try {
    return parseProtection(JSON.parse(fs.readFileSync(path.join(dataDir, ACCOUNT_FILE), 'utf8')));
  } catch {
    return emptyProtection();
  }
}

export function saveProtection(dataDir: string, p: AccountProtection): void {
  fs.mkdirSync(dataDir, { recursive: true });
  writeFileAtomic(path.join(dataDir, ACCOUNT_FILE), `${JSON.stringify(p, null, 2)}\n`);
}

/** Le compte est-il protégé (code noté ou mot de passe) ? Seul un compte protégé a un coffre. */
export const isProtected = (p: AccountProtection): boolean => Boolean(p.codeNotedAt || p.password);
/** Le coffre est-il à tenir à jour sur le serveur ? */
export const vaultWanted = (p: AccountProtection): boolean => isProtected(p) && p.vault !== false;

// ---------------------------------------------------------------------------
// Paquet

export interface AccountBundle {
  v: 1;
  /** Date du paquet (ISO). */
  at: string;
  /** social.json tel quel (clé privée comprise) ; sans l'annuaire dans un paquet « léger ». */
  social: Record<string, unknown>;
  level?: unknown;
  protection?: AccountProtection;
  avatar?: { name: string; data: string };
}

/** Résumé d'un paquet, pour le montrer avant de le reprendre. */
export interface AccountSummary {
  key: string;
  name: string;
  country?: string;
  xp: number;
  level: number;
  badges: number;
  friends: number;
  at: string;
  avatar?: string;
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Le paquet du compte de ce dossier de données ; undefined sans social.json lisible. `lean` : sans
 * l'annuaire (le coffre reste petit ; l'annuaire se reremplit au retour sur le réseau).
 */
export function readAccountBundle(dataDir: string, opts: { lean?: boolean; now?: Date } = {}): AccountBundle | undefined {
  const raw = readJson(socialFile(dataDir));
  const state = parseSocialState(raw);
  if (!state || !raw || typeof raw !== 'object') return undefined;
  const social = { ...(raw as Record<string, unknown>) };
  if (opts.lean) delete social.directory;
  const bundle: AccountBundle = { v: 1, at: (opts.now ?? new Date()).toISOString(), social };
  const level = readJson(path.join(dataDir, LEVELS_FILE));
  if (level !== undefined) bundle.level = level;
  const protection = readJson(path.join(dataDir, ACCOUNT_FILE));
  if (protection !== undefined) bundle.protection = parseProtection(protection);
  if (state.avatar && isAvatarFileName(state.avatar)) {
    try {
      // lecture entière : avatar de Cyber Pinball, réduit à l'enregistrement
      bundle.avatar = { name: state.avatar, data: fs.readFileSync(avatarPath(dataDir, state.avatar)).toString('base64') };
    } catch {
      // image absente : le pseudo reste, les initiales en attendant
    }
  }
  return bundle;
}

/** Paquet relu (copie de secours, coffre ouvert) : undefined s'il n'a pas de clé de joueur valable. */
export function parseAccountBundle(raw: unknown): AccountBundle | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const b = raw as Record<string, unknown>;
  if (b.v !== 1 || !isIso(b.at) || !b.social || typeof b.social !== 'object' || !parseSocialState(b.social)) return undefined;
  const out: AccountBundle = { v: 1, at: b.at, social: b.social as Record<string, unknown> };
  if (b.level !== undefined && parseLevels(b.level)) out.level = b.level;
  if (b.protection !== undefined) out.protection = parseProtection(b.protection);
  const a = b.avatar as Record<string, unknown> | undefined;
  if (a && isAvatarFileName(a.name) && typeof a.data === 'string' && a.data.length < 4_000_000) out.avatar = { name: a.name, data: a.data };
  return out;
}

export function accountSummary(bundle: AccountBundle): AccountSummary | undefined {
  const s = parseSocialState(bundle.social);
  if (!s) return undefined;
  const lv = bundle.level ? parseLevels(bundle.level) : undefined;
  const xp = lv?.xp ?? 0;
  return {
    key: s.key.publicKey,
    name: s.name,
    ...(s.country ? { country: s.country } : {}),
    xp,
    level: levelOf(xp).level,
    badges: s.badges.length,
    friends: s.friends.length,
    at: bundle.at,
    ...(bundle.avatar ? { avatar: bundle.avatar.name } : {}),
  };
}

/**
 * Pose le paquet dans le dossier des données : social.json, niveau.json, compte.json et l'avatar.
 * Le reste du compte d'avant (conversations, salons…) est à effacer avant par l'appelant
 * (account-delete.ts, eraseAccountFiles) : il appartient à une autre clé.
 */
export function writeAccountBundle(dataDir: string, bundle: AccountBundle): void {
  fs.mkdirSync(dataDir, { recursive: true });
  if (bundle.avatar) {
    const file = avatarPath(dataDir, bundle.avatar.name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomic(file, Buffer.from(bundle.avatar.data, 'base64'));
  }
  if (bundle.level !== undefined) writeFileAtomic(path.join(dataDir, LEVELS_FILE), `${JSON.stringify(bundle.level, null, 2)}\n`);
  else fs.rmSync(path.join(dataDir, LEVELS_FILE), { force: true });
  saveProtection(dataDir, bundle.protection ?? emptyProtection());
  // La clé en dernier : une coupure au milieu laisse l'ancien compte entier, jamais un mélange.
  writeFileAtomic(path.join(dataDir, SOCIAL_FILE), `${JSON.stringify(bundle.social, null, 2)}\n`);
}

/** Empreinte d'un paquet, sans sa date : deux paquets du même compte inchangé ont la même. */
export function bundleHash(bundle: AccountBundle): string {
  const { at: _at, protection, ...rest } = bundle;
  // L'état d'envoi du coffre change à chaque envoi : il ne compte pas.
  const p = protection ? { ...protection, vaultSent: undefined } : undefined;
  return createHash('sha256').update(JSON.stringify({ ...rest, protection: p })).digest('hex');
}

// ---------------------------------------------------------------------------
// Copies de secours (%APPDATA%\CyberPinball\comptes)

/**
 * Dossier des copies de secours : sous %APPDATA%\CyberPinball, hors de toute racine. En bac à sable
 * (essais, CYBERPINBALL_HOME), dans le dossier des données : un essai ne touche jamais les vraies.
 */
export function accountCopiesDir(loc: { legacyDataDir: string; dataDir: string; sandbox: boolean }): string {
  return loc.sandbox ? path.join(loc.dataDir, 'secours', ACCOUNT_COPIES_DIR) : path.join(loc.legacyDataDir, ACCOUNT_COPIES_DIR);
}

const copyName = (key: string) => `compte-${createHash('sha256').update(key).digest('hex').slice(0, 16)}.json`; // i18n-ignore : nom de fichier

/** Écrit la copie de secours du paquet (une par compte) ; rend false si elle était déjà à jour. */
export function saveAccountCopy(dir: string, bundle: AccountBundle): boolean {
  const summary = accountSummary(bundle);
  if (!summary) return false;
  const file = path.join(dir, copyName(summary.key));
  const old = parseAccountBundle(readJson(file));
  if (old && bundleHash(old) === bundleHash(bundle)) return false;
  fs.mkdirSync(dir, { recursive: true });
  writeFileAtomic(file, JSON.stringify(bundle));
  pruneAccountCopies(dir);
  return true;
}

export interface AccountCopy {
  file: string;
  bundle: AccountBundle;
  summary: AccountSummary;
}

/** Les copies de secours lisibles, la plus récente d'abord. */
export function listAccountCopies(dir: string): AccountCopy[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: AccountCopy[] = [];
  for (const name of names) {
    if (!/^compte-[0-9a-f]{16}\.json$/.test(name)) continue;
    const file = path.join(dir, name);
    const bundle = parseAccountBundle(readJson(file));
    const summary = bundle && accountSummary(bundle);
    if (bundle && summary) out.push({ file, bundle, summary });
  }
  return out.sort((a, b) => b.bundle.at.localeCompare(a.bundle.at));
}

function pruneAccountCopies(dir: string): void {
  for (const old of listAccountCopies(dir).slice(ACCOUNT_COPIES_MAX)) fs.rmSync(old.file, { force: true });
}

/**
 * La copie à proposer au premier lancement : la plus récente d'un autre compte que celui de cette
 * borne, qui a un vrai pseudo, des XP, un badge ou un ami (un compte jamais utilisé ne vaut pas
 * d'être repris).
 */
export function copyToOffer(copies: readonly AccountCopy[], currentKey: string, isDefaultName: (s: { name: string; key: { publicKey: string } }) => boolean): AccountCopy | undefined {
  return copies.find((c) => c.summary.key !== currentKey && (!isDefaultName({ name: c.summary.name, key: { publicKey: c.summary.key } }) || c.summary.xp > 0 || c.summary.badges > 0 || c.summary.friends > 0));
}

/** La graine du joueur d'un paquet (pour le coffre) ; undefined si la clé est illisible. */
export function bundleSeed(bundle: AccountBundle): Buffer | undefined {
  const s = parseSocialState(bundle.social);
  return s ? playerSeed(s.key) : undefined;
}
