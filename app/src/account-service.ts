// Mon compte, ce qui tourne en arrière-plan et ce qui touche au réseau (account.ts, recovery.ts,
// vault.ts pour les décisions) :
// - la copie de secours du compte, écrite dans %APPDATA%\CyberPinball\comptes au démarrage, puis
//   toutes les COPY_EVERY_MS si le compte a changé, et à la fermeture ;
// - le coffre chiffré, envoyé au service du projet quand le compte est protégé (code noté ou mot de
//   passe) et que le joueur ne l'a pas coupé, au plus toutes les VAULT_EVERY_MS s'il a changé ;
// - le mot de passe (création, retrait) ;
// - la reprise d'un compte : copie de secours, code de récupération, pseudo et mot de passe. Elle
//   prépare un paquet ; l'application l'applique ensuite (fichiers du compte d'avant effacés, paquet
//   posé, écritures gelées) et redémarre (frontend.ts).
//
// Sans electron à l'exécution : les tests du cœur le chargent avec un service en mémoire.

import {
  bundleHash,
  bundleSeed,
  copyToOffer,
  emptyProtection,
  hasDefaultName,
  listAccountCopies,
  loadProtection,
  newSocialState,
  openVault,
  passwordKeys,
  passwordSetup,
  playerKeyFromSeed,
  playerSeed,
  readAccountBundle,
  recoveryWords,
  saveAccountCopy,
  saveProtection,
  sealVault,
  seedFromWords,
  signVault,
  unwrapDataKey,
  vaultDataKey,
  vaultLogin,
  vaultWanted,
  type AccountBundle,
  type AccountCopy,
  type AccountProtection,
  type PlayerKey,
  type RecoveryProblem,
} from '@cyberpinball/core';

export const COPY_EVERY_MS = 2 * 60_000;
export const VAULT_EVERY_MS = 30 * 60_000;
const TIMEOUT_MS = 20_000;

/** Un appel au service : méthode, chemin, corps JSON ; rend le statut et le JSON de la réponse. */
export type VaultTransport = (method: 'GET' | 'POST', route: string, body?: string) => Promise<{ status: number; json?: unknown }>;

/** Le service par Internet (t.cyberpinball.com, ou CYBERPINBALL_RELAIS en essai). */
export function httpTransport(origin: string): VaultTransport {
  const base = origin.replace(/\/+$/, '');
  return async (method, route, body) => {
    const res = await fetch(`${base}${route}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      json = undefined;
    }
    return { status: res.status, json };
  };
}

export interface AccountServiceOptions {
  dataDir: string;
  /** Dossier des copies de secours (accountCopiesDir). */
  copiesDir: string;
  /** La clé du joueur de cette borne. */
  key(): PlayerKey;
  /** Le service ; absent : coffre et mot de passe indisponibles (essais sans réseau). */
  transport?: VaultTransport;
  /** Le compte a changé d'état (coffre envoyé, protection) : redessiner. */
  changed?(): void;
  log?(line: string): void;
  now?(): Date;
}

export type VaultState = 'off' | 'idle' | 'sending' | 'sent' | 'offline';

export type PasswordResult = { ok: true } | { ok: false; why: 'taken' | 'offline' | 'refused' | 'no-vault' };
export type OpenResult = { ok: true; bundle: AccountBundle; from: 'vault' | 'key' } | { ok: false; why: 'words'; problem: RecoveryProblem } | { ok: false; why: 'unknown' | 'wrong' | 'tries' | 'offline' | 'damaged' };

export interface AccountService {
  protection(): AccountProtection;
  vaultState(): VaultState;
  /** Le service est-il joignable (transport présent) ? */
  online(): boolean;
  /** Les 24 mots du compte de cette borne. */
  words(): string[];
  /** Le code est noté et vérifié : protégé ; le coffre part. */
  noteCode(): void;
  setPassword(password: string, login: string): Promise<PasswordResult>;
  removePassword(): Promise<PasswordResult>;
  /** Garder ou non la copie chiffrée sur le serveur. */
  setVault(on: boolean): void;
  /** Écrit la copie de secours si le compte a changé. */
  backupNow(): boolean;
  /** Envoie le coffre s'il est voulu et a changé (`force` : même inchangé). */
  syncVault(force?: boolean): Promise<VaultState>;
  /** Copies de secours de ce PC, la plus récente d'abord. */
  copies(): AccountCopy[];
  /** La copie d'un autre compte à proposer au premier lancement. */
  offer(): AccountCopy | undefined;
  openWithWords(words: readonly string[]): Promise<OpenResult>;
  openWithPassword(login: string, password: string): Promise<OpenResult>;
  start(): void;
  stop(): void;
}

export function createAccountService(opts: AccountServiceOptions): AccountService {
  const now = () => opts.now?.() ?? new Date();
  let state: VaultState = 'idle';
  let timers: NodeJS.Timeout[] = [];
  let lastVaultTry = 0;
  let sending: Promise<VaultState> | undefined;
  let lastT = 0;
  const log = (line: string) => opts.log?.(`Mon compte : ${line}`); // i18n-ignore : journal

  const protection = () => loadProtection(opts.dataDir);
  const update = (change: (p: AccountProtection) => AccountProtection) => {
    saveProtection(opts.dataDir, change(protection()));
    opts.changed?.();
  };
  // Une date signée par envoi, toujours croissante : deux envois dans la même milliseconde seraient un rejeu.
  const stamp = () => (lastT = Math.max(Date.now(), lastT + 1));
  const call = async (method: 'GET' | 'POST', route: string, body?: string) => {
    if (!opts.transport) return undefined;
    try {
      return await opts.transport(method, route, body);
    } catch {
      return undefined;
    }
  };

  function backupNow(): boolean {
    const bundle = readAccountBundle(opts.dataDir, { now: now() });
    if (!bundle) return false;
    try {
      const wrote = saveAccountCopy(opts.copiesDir, bundle);
      if (wrote) log('copie de secours à jour'); // i18n-ignore : journal
      return wrote;
    } catch (e) {
      log(`copie de secours impossible : ${(e as Error).message}`); // i18n-ignore : journal
      return false;
    }
  }

  async function sendVault(force: boolean): Promise<VaultState> {
    const p = protection();
    if (!vaultWanted(p)) return (state = p.vault === false ? 'off' : 'idle');
    if (!opts.transport) return (state = 'offline');
    const bundle = readAccountBundle(opts.dataDir, { lean: true, now: now() });
    const seed = bundle && bundleSeed(bundle);
    if (!bundle || !seed) return state;
    const hash = bundleHash(bundle);
    if (!force && p.vaultSent?.hash === hash) return (state = 'sent');
    state = 'sending';
    opts.changed?.();
    const sealed = sealVault(bundle, vaultDataKey(seed));
    const r = await call('POST', '/api/coffre', JSON.stringify(signVault(opts.key(), { op: 'coffre', data: sealed.toString('base64'), hash }, stamp())));
    if (r?.status === 204) {
      update((q) => ({ ...q, vaultSent: { hash, at: now().toISOString() } }));
      log('coffre envoyé'); // i18n-ignore : journal
      return (state = 'sent');
    }
    log(`coffre pas envoyé (${r ? `HTTP ${r.status}` : 'injoignable'})`); // i18n-ignore : journal
    state = 'offline';
    opts.changed?.();
    return state;
  }

  function syncVault(force = false): Promise<VaultState> {
    lastVaultTry = Date.now();
    sending ??= sendVault(force).finally(() => (sending = undefined));
    return sending;
  }

  async function openBundle(sealedB64: unknown, dataKey: Buffer): Promise<AccountBundle | undefined> {
    if (typeof sealedB64 !== 'string') return undefined;
    return openVault(Buffer.from(sealedB64, 'base64'), dataKey);
  }

  return {
    protection,
    vaultState: () => (vaultWanted(protection()) ? state : protection().vault === false ? 'off' : 'idle'),
    online: () => Boolean(opts.transport),
    words: () => recoveryWords(playerSeed(opts.key())),
    noteCode() {
      update((p) => ({ ...p, codeNotedAt: now().toISOString() }));
      void syncVault(true);
    },
    async setPassword(password, login) {
      const id = vaultLogin(login);
      if (!id) return { ok: false, why: 'refused' };
      // Le coffre d'abord : le service n'accepte un mot de passe que pour un coffre qui existe.
      update((p) => ({ ...p, ...(p.vault === false ? { vault: undefined } : {}) }));
      const sent = await syncVault(true);
      if (sent !== 'sent') return { ok: false, why: 'offline' };
      const setup = passwordSetup(password, vaultDataKey(playerSeed(opts.key())));
      const r = await call('POST', '/api/coffre/mdp', JSON.stringify(signVault(opts.key(), { op: 'coffre-mdp', login: id, ...setup }, stamp())));
      if (r?.status === 204) {
        update((p) => ({ ...p, password: { name: login, at: now().toISOString() } }));
        log('mot de passe créé'); // i18n-ignore : journal
        return { ok: true };
      }
      const why = (r?.json as { erreur?: string } | undefined)?.erreur;
      return { ok: false, why: !r ? 'offline' : why === 'pris' ? 'taken' : why === 'sans-coffre' ? 'no-vault' : 'refused' };
    },
    async removePassword() {
      const r = await call('POST', '/api/coffre/mdp', JSON.stringify(signVault(opts.key(), { op: 'coffre-mdp', remove: true }, stamp())));
      if (r?.status !== 204) return { ok: false, why: r ? 'refused' : 'offline' };
      update((p) => {
        const { password: _gone, ...rest } = p;
        return rest;
      });
      return { ok: true };
    },
    setVault(on) {
      update((p) => {
        const { vault: _v, vaultSent: _s, ...rest } = p;
        return on ? rest : { ...rest, vault: false };
      });
      if (on) void syncVault(true);
      else state = 'off';
    },
    backupNow,
    syncVault,
    copies: () => listAccountCopies(opts.copiesDir),
    offer: () => copyToOffer(listAccountCopies(opts.copiesDir), opts.key().publicKey, hasDefaultName),
    async openWithWords(words) {
      const read = seedFromWords(words);
      if ('problem' in read) return { ok: false, why: 'words', problem: read.problem };
      const key = playerKeyFromSeed(read.seed);
      const r = await call('GET', `/api/coffre/${key.publicKey}`);
      if (r?.status === 200) {
        const bundle = await openBundle((r.json as { data?: unknown } | undefined)?.data, vaultDataKey(read.seed));
        if (bundle) return { ok: true, bundle, from: 'vault' };
        return { ok: false, why: 'damaged' };
      }
      // Pas de coffre (jamais protégé, ou service injoignable) : la clé seule, le reste revient par le réseau.
      const social = newSocialState(now(), key);
      return { ok: true, bundle: { v: 1, at: now().toISOString(), social: social as unknown as Record<string, unknown>, protection: { ...emptyProtection(), codeNotedAt: now().toISOString() } }, from: 'key' };
    },
    async openWithPassword(login, password) {
      const id = vaultLogin(login);
      if (!id) return { ok: false, why: 'unknown' };
      const salt = await call('POST', '/api/coffre/sel', JSON.stringify({ login: id }));
      if (!salt) return { ok: false, why: 'offline' };
      if (salt.status === 404) return { ok: false, why: 'unknown' };
      const saltB64 = (salt.json as { salt?: unknown } | undefined)?.salt;
      if (salt.status !== 200 || typeof saltB64 !== 'string') return { ok: false, why: salt.status === 429 ? 'tries' : 'offline' };
      const k = passwordKeys(password, Buffer.from(saltB64, 'base64'));
      const r = await call('POST', '/api/coffre/ouvrir', JSON.stringify({ login: id, auth: k.auth.toString('base64') }));
      if (!r) return { ok: false, why: 'offline' };
      if (r.status === 403) return { ok: false, why: 'wrong' };
      if (r.status === 429) return { ok: false, why: 'tries' };
      const j = r.json as { wrap?: unknown; data?: unknown } | undefined;
      if (r.status !== 200 || typeof j?.wrap !== 'string') return { ok: false, why: 'offline' };
      const dataKey = unwrapDataKey(j.wrap, k.wrap);
      const bundle = dataKey && (await openBundle(j.data, dataKey));
      return bundle ? { ok: true, bundle, from: 'vault' } : { ok: false, why: 'damaged' };
    },
    start() {
      backupNow();
      timers.push(setInterval(backupNow, COPY_EVERY_MS));
      // Le coffre deux minutes après le démarrage (le réseau a pris sa place), puis s'il a changé.
      timers.push(setTimeout(() => void syncVault(), 2 * 60_000));
      timers.push(setInterval(() => Date.now() - lastVaultTry >= VAULT_EVERY_MS && void syncVault(), 60_000));
      for (const t of timers) t.unref?.();
    },
    stop() {
      for (const t of timers) clearInterval(t);
      timers = [];
      backupNow();
    },
  };
}

