/** Table surprise : toutes les tables jouables entrent dans le tirage, sauf celles que le joueur exclut. */
export interface SurpriseExclusions {
  /** Tables (TableEntry.id) exclues de tout tirage. */
  tables: string[];
  /** Collections personnelles dont les tables ne sortent pas d'un tirage dans « Toutes les tables ». */
  collections: string[];
}
export interface SurpriseCandidate {
  id: string;
  title: string;
  wheel?: string;
}
/** Lecture tolérante : un fichier absent, abîmé ou d'un ancien format ne retire aucune table. */
export function readSurpriseExclusions(value: unknown): SurpriseExclusions {
  const list = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0))] : [];
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return { tables: list(record.tables), collections: list(record.collections) };
}
/** Exclue si la table l'est elle-même, ou si l'on tire dans « Toutes les tables » et qu'une collection exclue la contient. */
export function surpriseExcluded(tableId: string, exclusions: SurpriseExclusions, drawFrom: string | undefined,
  mine: readonly { id: string; tables: readonly string[] }[]): boolean {
  if (exclusions.tables.includes(tableId)) return true;
  if (drawFrom !== 'all' || !exclusions.collections.length) return false;
  return mine.some((collection) => exclusions.collections.includes(collection.id) && collection.tables.includes(tableId));
}
export function toggleSurpriseExclusion(exclusions: SurpriseExclusions, kind: keyof SurpriseExclusions, id: string): SurpriseExclusions {
  const list = exclusions[kind];
  return { ...exclusions, [kind]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
}
/** Un tirage par entrée distincte, indépendant du moteur et de l'ordre du catalogue. */
export function pickSurprise<T extends SurpriseCandidate>(entries: readonly T[], random: () => number = Math.random): T | undefined {
  const unique = [...new Map(entries.map((entry) => [entry.id, entry])).values()];
  if (!unique.length) return undefined;
  const n = random();
  if (!Number.isFinite(n) || n < 0 || n >= 1) throw new RangeError('Invalid random sample'); // i18n-ignore : erreur de programmation
  return unique[Math.floor(n * unique.length)];
}
export interface SurpriseClock {
  after(ms: number, run: () => void): unknown;
  clear(timer: unknown): void;
}
const clock: SurpriseClock = { after: (ms, run) => setTimeout(run, ms), clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>) };

/** Réservation synchrone, avant le premier await, commune aux différents chemins de lancement. */
export class LaunchReservation {
  private owner?: symbol;
  get busy(): boolean { return this.owner !== undefined; }
  reserve(): symbol | undefined {
    if (this.owner) return undefined;
    return this.owner = Symbol();
  }
  owns(owner: symbol): boolean { return this.owner === owner; }
  release(owner: symbol): void { if (this.owns(owner)) this.owner = undefined; }
  /** Seulement avant le chargement : invalide une préparation qui attend encore un await. */
  cancelPending(): void { this.owner = undefined; }
}

/** Les relâchements restent écoutés hors du menu ; une touche répétée ne réarme pas le geste. */
export class SurpriseGesture {
  private held = new Set<string>();
  private timer?: unknown;
  private fired = false;
  private blocked = false;
  constructor(private readonly host: {
    left(): readonly string[]; right(): readonly string[]; magna(): readonly string[];
    allowed(): boolean; trigger(): void; cancel(reason: 'magna' | 'context' | 'reset'): void; released(): void;
    clock?: SurpriseClock; holdMs?: number;
  }) {}
  private get time(): SurpriseClock { return this.host.clock ?? clock; }
  private down(keys: readonly string[]): boolean { return keys.some((key) => this.held.has(key)); }
  get released(): boolean { return !this.down(this.host.left()) && !this.down(this.host.right()); }
  /** Les deux flippers sont tenus : la roue ignore leurs répétitions pendant le geste. */
  get pair(): boolean { return this.down(this.host.left()) && this.down(this.host.right()); }
  input(code: string, down: boolean): void {
    if (down) {
      if (this.held.has(code)) return;
      this.held.add(code);
    } else this.held.delete(code);
    const magna = this.down(this.host.magna());
    if (magna && !this.released) this.blocked = true;
    if (magna || !this.host.allowed() || this.blocked) {
      this.stop();
      this.host.cancel(this.down(this.host.magna()) ? 'magna' : 'context');
    } else if (this.down(this.host.left()) && this.down(this.host.right())) {
      if (!this.fired && this.timer === undefined) this.timer = this.time.after(this.host.holdMs ?? 1500, () => {
        this.timer = undefined;
        if (this.host.allowed() && !this.down(this.host.magna()) && this.down(this.host.left()) && this.down(this.host.right())) {
          this.fired = true;
          this.host.trigger();
        }
      });
    } else this.stop();
    if (this.released) { this.fired = false; this.blocked = false; this.host.released(); }
  }
  private stop(): void { if (this.timer !== undefined) this.time.clear(this.timer); this.timer = undefined; }
  reset(): void { this.stop(); this.blocked = !this.released; this.fired = false; this.host.cancel('reset'); }
}

export interface SurpriseView {
  token: number;
  phase: 'preparing' | 'spinning' | 'release';
  entries: readonly SurpriseCandidate[];
  selected?: string;
  duration: number;
}
/** Une génération invalide tous les résultats asynchrones d'une session annulée. */
export class SurpriseSession {
  private serial = 0;
  private current?: { token: number; context: string; reservation: symbol; view: SurpriseView; selected?: SurpriseCandidate; timer?: unknown; committing?: boolean };
  constructor(private readonly host: {
    gate: LaunchReservation; context(): string | undefined;
    candidates(): Promise<readonly SurpriseCandidate[]>;
    recheck(id: string): Promise<boolean>; released(): boolean;
    launch(id: string, reservation: symbol): Promise<unknown>;
    changed(): void; empty(): void; failed(error: unknown): void;
    clock?: SurpriseClock; random?: () => number; duration?: number;
  }) {}
  get busy(): boolean { return this.current !== undefined; }
  view(): SurpriseView | undefined { return this.current?.view; }
  private valid(token: number): boolean {
    return this.current?.token === token && this.host.context() === this.current.context;
  }
  async start(): Promise<void> {
    const context = this.host.context();
    if (!context || this.busy) return;
    const reservation = this.host.gate.reserve();
    if (!reservation) return;
    const token = ++this.serial;
    this.current = { token, context, reservation, view: { token, phase: 'preparing', entries: [], duration: this.host.duration ?? 3000 } };
    this.host.changed();
    try {
      const entries = [...new Map((await this.host.candidates()).map((entry) => [entry.id, entry])).values()];
      if (!this.valid(token)) { this.cancelToken(token); return; }
      const selected = pickSurprise(entries, this.host.random);
      if (!selected) { this.cancel(); this.host.empty(); return; }
      const current = this.current!;
      current.selected = selected;
      // Toutes les images envoyées au rendu viennent exclusivement de la liste autorisée.
      current.view = { ...current.view, phase: 'spinning', entries, selected: selected.id };
      current.timer = (this.host.clock ?? clock).after(current.view.duration, () => {
        if (!this.valid(token)) { this.cancelToken(token); return; }
        current.view = { ...current.view, phase: 'release' };
        this.host.changed();
        void this.release();
      });
      this.host.changed();
    } catch (error) { if (this.current?.token === token) { this.cancel(); this.host.failed(error); } }
  }
  refresh(): void { if (this.current && !this.valid(this.current.token)) this.cancel(); }
  async release(): Promise<void> {
    const current = this.current;
    if (!current || current.committing || current.view.phase !== 'release' || !this.host.released()) return;
    current.committing = true;
    try {
      const allowed = await this.host.recheck(current.selected!.id);
      if (!this.valid(current.token)) { this.cancelToken(current.token); return; }
      if (!allowed) { this.cancel(); this.host.empty(); return; }
      // Relâchement revérifié après le contrôle asynchrone ; Exit peut encore annuler jusque-là.
      if (!this.host.released()) { current.committing = false; return; }
      this.current = undefined;
      this.host.changed();
      await this.host.launch(current.selected!.id, current.reservation);
    } catch (error) {
      if (this.current === current) { this.cancel(); this.host.failed(error); }
      else if (this.serial === current.token) this.host.failed(error);
    }
    finally { if (this.current !== current) this.host.gate.release(current.reservation); }
  }
  private cancelToken(token: number): void { if (this.current?.token === token) this.cancel(); }
  cancel(): void {
    const current = this.current;
    if (!current) return;
    if (current.timer !== undefined) (this.host.clock ?? clock).clear(current.timer);
    this.current = undefined;
    ++this.serial;
    this.host.gate.release(current.reservation);
    this.host.changed();
  }
}
