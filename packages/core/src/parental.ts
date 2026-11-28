import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';

export interface ParentalSettings {
  enabled: boolean;
  hidden: boolean;
  idleMinutes: number;
  tables: string[];
  collections: string[];
}

export type ParentalScope = { kind: 'table' | 'collection'; id: string } | { kind: 'settings' };
export type PinResult = 'ok' | 'incorrect' | 'wait' | 'busy' | 'locked' | 'storage';
type Credential = { salt: string; hash: string };
type Saved = ParentalSettings & { version: 1; credential?: Credential; failures: number; blockedUntil: number };
type Group = { id: string; tables: readonly { id: string }[] };

export const PARENTAL_TIMEOUTS = [2, 5, 15, 30] as const;
export const PARENTAL_FILE = 'controle-parental.json';
const PIN = /^[0-9]{4}$/;
const initial: Saved = { version: 1, enabled: false, hidden: false, idleMinutes: 5, tables: [], collections: [], failures: 0, blockedUntil: 0 };
const key = (id: string) => id.replaceAll('\\', '/').toLowerCase();
/** Le dossier d'une table reste stable quand l'installation remplace le VPX par une nouvelle version. */
export function parentalTableKey(id: string): string {
  const normalized = key(id);
  const slash = normalized.lastIndexOf('/');
  if (slash < 0) return normalized;
  return normalized.slice(0, slash + 1);
}

function ids(raw: unknown): string[] {
  if (!Array.isArray(raw) || !raw.every((item) => typeof item === 'string' && item.length > 0 && item.length < 1000)) {
    throw new Error('Invalid parental item identifiers');
  }
  return [...new Set(raw.map(key))];
}

function load(file: string): Saved {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as Partial<Saved>;
  const credential = raw?.credential;
  if (raw?.version !== 1 || typeof raw.enabled !== 'boolean' || typeof raw.hidden !== 'boolean' ||
      !PARENTAL_TIMEOUTS.some((n) => n === raw.idleMinutes) ||
      !Number.isSafeInteger(raw.failures) || raw.failures! < 0 || raw.failures! > 5 ||
      !Number.isSafeInteger(raw.blockedUntil) || raw.blockedUntil! < 0 ||
      (raw.enabled && !credential) ||
      (credential && (typeof credential.salt !== 'string' || !/^[0-9a-f]{32}$/.test(credential.salt) ||
        typeof credential.hash !== 'string' || !/^[0-9a-f]{64}$/.test(credential.hash)))) throw new Error('Invalid parental settings');
  return { ...raw, tables: ids(raw.tables), collections: ids(raw.collections) } as Saved;
}

function derive(pin: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(pin, Buffer.from(salt, 'hex'), 32, (err, bytes) => err ? reject(err) : resolve(bytes)));
}

export interface ParentalHost {
  dataDir: string;
  groups(): readonly Group[];
  now?(): number;
}

export class ParentalControl {
  private readonly file: string;
  private saved = { ...initial };
  private grant?: { scope: ParentalScope; collection: string | undefined; touched: number };
  private context: { guest: boolean; collection?: string } = { guest: false };
  private checking = false;
  private membership?: { groups: readonly Group[]; saved: Saved; ids: Set<string> };
  private epoch = 0;
  readonly damaged: boolean;

  constructor(private readonly host: ParentalHost) {
    this.file = path.join(host.dataDir, PARENTAL_FILE);
    try {
      this.saved = load(this.file);
      this.damaged = false;
    } catch (error) {
      this.damaged = (error as NodeJS.ErrnoException).code !== 'ENOENT';
    }
  }

  private now(): number { return this.host.now?.() ?? Date.now(); }

  get enabled(): boolean { return this.damaged || this.saved.enabled; }
  get granted(): boolean { return this.currentScope() !== undefined; }
  get hasPin(): boolean { return Boolean(this.saved.credential); }
  get waitingSeconds(): number { return Math.max(0, Math.ceil((this.saved.blockedUntil - this.now()) / 1000)); }
  get settings(): ParentalSettings {
    const { enabled, hidden, idleMinutes, tables, collections } = this.saved;
    return { enabled, hidden, idleMinutes, tables: [...tables], collections: [...collections] };
  }

  private save(next: Saved): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileAtomic(this.file, JSON.stringify(next, null, 2) + '\n');
    this.saved = next;
  }

  lock(): boolean {
    this.epoch++;
    const changed = this.grant !== undefined;
    this.grant = undefined;
    return changed;
  }

  sync(guest: boolean, collection: string | undefined): boolean {
    const old = this.context;
    this.context = { guest, collection };
    if (old.guest !== guest || (old.collection !== collection && this.grant && this.grant.collection !== collection)) {
      return this.lock();
    }
    return this.expire();
  }

  expire(): boolean {
    return this.grant && this.now() - this.grant.touched >= this.saved.idleMinutes * 60_000 ? this.lock() : false;
  }

  touch(): void {
    if (!this.expire() && this.grant) this.grant.touched = this.now();
  }

  private members(collection: string): readonly { id: string }[] {
    return this.host.groups().find((group) => group.id === collection)?.tables ?? [];
  }

  collectionConfigured(id: string): boolean { return this.damaged || this.saved.collections.includes(key(id)); }

  collectionProtected(id: string): boolean {
    return this.enabled && this.collectionConfigured(id);
  }

  tableProtected(id: string): boolean {
    if (!this.enabled) return false;
    const table = key(id);
    if (this.damaged || this.saved.tables.includes(table) || this.saved.tables.includes(parentalTableKey(id))) return true;
    if (!this.saved.collections.length) return false;
    const groups = this.host.groups();
    if (this.membership?.groups !== groups || this.membership.saved !== this.saved) {
      const members = groups.filter((group) => this.saved.collections.includes(key(group.id))).flatMap((group) => group.tables.map((entry) => parentalTableKey(entry.id)));
      this.membership = { groups, saved: this.saved, ids: new Set(members) };
    }
    return this.membership.ids.has(parentalTableKey(table));
  }

  private currentScope(): ParentalScope | undefined {
    this.expire();
    return this.context.guest ? undefined : this.grant?.scope;
  }

  collectionAllowed(id: string): boolean {
    if (!this.collectionProtected(id)) return true;
    const scope = this.currentScope();
    return scope?.kind === 'collection' && scope.id === id;
  }

  memberOf(collection: string, id: string): boolean {
    const target = parentalTableKey(id);
    return this.members(collection).some((entry) => parentalTableKey(entry.id) === target);
  }

  tableAllowed(id: string): boolean {
    if (!this.tableProtected(id)) return true;
    const scope = this.currentScope();
    const target = key(id);
    if (scope?.kind === 'table') return key(scope.id) === target;
    return scope?.kind === 'collection' && this.memberOf(scope.id, target);
  }

  get canConfigure(): boolean {
    return !this.damaged && !this.context.guest && (!this.hasPin || this.currentScope()?.kind === 'settings');
  }

  private async verify(pin: string, credential: Credential): Promise<PinResult> {
    const generation = this.epoch;
    const actual = await derive(pin, credential.salt);
    if (this.epoch !== generation || this.context.guest) return 'locked';
    if (timingSafeEqual(actual, Buffer.from(credential.hash, 'hex'))) {
      if (this.saved.failures || this.saved.blockedUntil) this.save({ ...this.saved, failures: 0, blockedUntil: 0 });
      return 'ok';
    }
    const failures = this.saved.failures + 1;
    // Après cinq erreurs, les suivantes restent temporisées jusqu'au succès, même après relance.
    const blockedUntil = failures >= 5 ? this.now() + 60_000 : 0;
    this.save({ ...this.saved, failures: Math.min(5, failures), blockedUntil });
    return 'incorrect';
  }

  async unlock(scope: ParentalScope, pin: string): Promise<PinResult> {
    const credential = this.saved.credential;
    if (this.damaged || this.context.guest || !credential) return 'locked';
    if (this.waitingSeconds) return 'wait';
    if (this.checking) return 'busy';
    if (!PIN.test(pin)) return 'incorrect';
    this.checking = true;
    try {
      const result = await this.verify(pin, credential);
      if (result !== 'ok') return result;
      this.grant = {
        scope, touched: this.now(),
        collection: scope.kind === 'collection' ? scope.id : this.context.collection,
      };
      return 'ok';
    } catch {
      return 'storage';
    } finally { this.checking = false; }
  }

  async setPin(pin: string, confirmation: string): Promise<PinResult> {
    if (!this.canConfigure) return 'locked';
    if (this.checking) return 'busy';
    if (!PIN.test(pin) || pin !== confirmation) return 'incorrect';
    const generation = this.epoch;
    this.checking = true;
    try {
      const salt = randomBytes(16).toString('hex');
      const hash = (await derive(pin, salt)).toString('hex');
      if (generation !== this.epoch || !this.canConfigure) return 'locked';
      this.save({ ...this.saved, credential: { salt, hash }, failures: 0, blockedUntil: 0 });
      this.grant = { scope: { kind: 'settings' }, collection: this.context.collection, touched: this.now() };
      return 'ok';
    } catch {
      return 'storage';
    } finally { this.checking = false; }
  }

  configure(settings: ParentalSettings): boolean {
    if (!this.canConfigure || this.checking || (settings.enabled && !this.hasPin) ||
        !PARENTAL_TIMEOUTS.some((minutes) => minutes === settings.idleMinutes)) return false;
    try {
      this.save({ ...this.saved, ...settings, collections: ids(settings.collections), tables: ids(settings.tables) });
      this.touch();
      return true;
    } catch { return false; }
  }
}
