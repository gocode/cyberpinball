// Fiche technique de la borne (Menu système > Borne > « Fiche technique ») : ce que l'application
// relève du PC, de Windows, des écrans, des contrôleurs, des logiciels et d'elle-même
// (app/src/tech-facts.ts), mis en blocs lisibles, avec l'état de chacun ; les contrôles du PC
// que « Santé de la borne » ajoute aux siens (groupe « PC et Windows ») ; et le rapport à
// transmettre à qui aide : un ZIP anonymisé (rapport.html, resume.txt, sante.json, journaux,
// réglages), son résumé en texte et un résumé court pour la messagerie.
//
// Tout est pur ici : le relevé de Windows (PowerShell, DisplayConfig, registre) est fait par
// l'application, qui passe sa sortie brute à parseTechProbe. Une partie absente du relevé
// (PowerShell en panne, essai hors Windows) n'est jamais affirmée : la ligne dit « Non relevé ».

import { formatSize } from './fileops';
import type { HealthLine, HealthState, HealthTarget } from './health';
import { formatDate, formatDateTime, formatNumber, language, t, tn } from './i18n';
import type { IconName } from './icons';
import type { RoleId, Rotation } from './model';
import { zipBuffers } from './romzip';

// ---------- Relevé ----------

export type DiskKind = 'nvme' | 'ssd' | 'hdd' | 'usb';
export type PowerScheme = 'high' | 'ultimate' | 'balanced' | 'saver' | 'other';
export type Connection = 'hdmi' | 'displayport' | 'dvi' | 'vga' | 'internal' | 'usb' | 'wireless' | 'other';

export interface TechDisplay {
  /** Rôle dans la configuration retenue, s'il en a un. */
  role?: RoleId;
  /** Nom du modèle (EDID ou nom convivial de Windows). */
  name: string;
  /** Diagonale en pouces, d'après l'EDID. */
  inches?: number;
  width: number;
  height: number;
  /** Fréquence en cours. */
  hz?: number;
  /** Fréquence la plus haute que Windows propose à cette définition. */
  offeredMaxHz?: number;
  /** Fréquence la plus haute que l'écran annonce (EDID, limites de balayage). */
  edidMaxHz?: number;
  connection?: Connection;
  /** Échelle de Windows (1 = 100 %). */
  scale?: number;
  rotation: Rotation;
  primary: boolean;
}

export interface TechFacts {
  /** Date du relevé (ISO). */
  at: string;
  pc?: {
    cpu?: { name: string; cores?: number; threads?: number; mhz?: number };
    memory?: { total: number; free?: number; modules?: number; mhz?: number };
    gpus?: { name: string; driver?: string; driverDate?: string; memory?: number }[];
    board?: { maker?: string; model?: string; bios?: string; biosDate?: string };
    disks?: { root: string; label?: string; model?: string; kind?: DiskKind; size?: number; free?: number }[];
    network?: { name: string; wifi: boolean; bps?: number }[];
    /** Dernier démarrage de Windows (ISO). */
    bootAt?: string;
  };
  windows?: {
    name?: string;
    /** « 24H2 » */
    release?: string;
    build?: string;
    rebootPending?: boolean;
    power?: { scheme: PowerScheme; name?: string; sleepMinutes?: number; screenMinutes?: number };
    gameMode?: boolean;
    gpuScheduling?: boolean;
    notifications?: boolean;
    antivirus?: string[];
    locale?: string;
    keyboard?: string;
    /** Runtime Visual C++ de Windows (vc-runtime.ts). */
    vcRuntime?: { ok: boolean; detail?: string };
  };
  displays?: TechDisplay[];
  /** Configuration retenue : son nom et ses écrans trouvés. */
  configuration?: { name: string; found: number; total: number };
  controllers?: {
    pinscape: boolean;
    /** Boutons de la borne relevés dans « Commandes de la borne ». */
    buttons: number;
    plunger?: string;
    nudge?: string;
    /** Contrôleurs DOF reconnus (« Pinscape », « LedWiz »…). */
    dof: string[];
  };
  software?: {
    vpx?: { version?: string; known?: string };
    /** Plugins de VPX trouvés et leur état dans VPinballX.ini. */
    plugins: { id: string; name: string; enabled: boolean }[];
    pupPacks?: number;
    roms?: number;
  };
  app?: {
    version: string;
    prerelease?: boolean;
    mode: 'cabinet' | 'desktop';
    dedicated?: boolean;
    tables: number;
    ready?: number;
    data: string;
    lastBackup?: string;
    friends?: 'connected' | 'offline' | 'off';
    firewall?: boolean;
    phones?: number;
    /** Erreurs du journal depuis 24 heures. */
    errors: number;
    language: string;
  };
}

/** Plugins de VPX que la fiche nomme d'abord : ceux dont dépendent la plupart des tables. */
export const KEY_PLUGINS = ['PinMAME', 'B2S', 'DOF', 'FlexDMD', 'PUP', 'Serum', 'AltSound', 'DMDUtil'] as const;

// ---------- Lecture de la sortie de PowerShell ----------

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const iso = (v: unknown): string | undefined => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : undefined;
};

/** GUID des modes d'alimentation de Windows. */
const POWER_SCHEMES: Record<string, PowerScheme> = {
  '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c': 'high',
  'e9a42b02-d5df-448d-aa00-03f14749eb61': 'ultimate',
  '381b4222-f694-41f0-9685-ff5bb260df2e': 'balanced',
  'a1841308-3541-4fab-bc81-f71556f20b4a': 'saver',
};

/** Dispositions de clavier les plus courantes (identifiant KLID de Windows) ; une autre garde son identifiant. */
export function keyboardName(klid: string): string {
  switch (klid.toLowerCase()) {
    case '0000040c':
      return t('AZERTY (France)');
    case '0000080c':
      return t('AZERTY (Belgique)');
    case '00000409':
      return t('QWERTY (États-Unis)');
    case '00000809':
      return t('QWERTY (Royaume-Uni)');
    case '0000100c':
      return t('QWERTZ (Suisse)');
    case '00000407':
      return t('QWERTZ (Allemagne)');
    default:
      return klid.toUpperCase();
  }
}

/**
 * Version d'un pilote NVIDIA telle que NVIDIA la nomme (« 566.36 ») depuis celle de Windows
 * (« 32.0.15.6636 ») : les cinq derniers chiffres des deux derniers nombres.
 */
export function nvidiaDriverVersion(windows: string): string | undefined {
  const parts = windows.split('.');
  if (parts.length < 4) return undefined;
  const digits = `${parts[2]}${parts[3]!.padStart(4, '0')}`.slice(-5);
  return /^\d{5}$/.test(digits) ? `${Number(digits.slice(0, 3))}.${digits.slice(3)}` : undefined;
}

/**
 * La sortie JSON du script de relevé (app/src/tech-facts.ts, TECH_PROBE_SCRIPT), lue sans rien
 * supposer : chaque partie absente ou illisible reste absente.
 */
export function parseTechProbe(raw: unknown): { pc: NonNullable<TechFacts['pc']>; windows: NonNullable<TechFacts['windows']> } {
  const r = obj(raw);
  const cpu = obj(list(r.cpu)[0]);
  const mem = obj(r.mem);
  const modules = list(mem.modules).map(obj);
  const board = obj(r.board);
  const os = obj(r.os);
  const power = obj(r.power);
  const pc: NonNullable<TechFacts['pc']> = {};
  if (str(cpu.name)) pc.cpu = { name: str(cpu.name)!.replace(/\s+/g, ' '), cores: num(cpu.cores), threads: num(cpu.threads), mhz: num(cpu.mhz) };
  if (num(mem.total)) pc.memory = { total: num(mem.total)!, free: num(mem.free), modules: modules.length || undefined, mhz: num(modules[0]?.speed) };
  const gpus = list(r.gpu)
    .map(obj)
    .filter((g) => str(g.name) && !/basic display|microsoft basic|remote display|parsec|virtual/i.test(str(g.name)!))
    .map((g) => {
      const raw = str(g.driver);
      const nvidia = /nvidia/i.test(str(g.name)!) && raw ? nvidiaDriverVersion(raw) : undefined;
      return { name: str(g.name)!, driver: nvidia ?? raw, driverDate: iso(g.driverDate), memory: num(g.memory) };
    });
  if (gpus.length) pc.gpus = gpus;
  if (str(board.maker) || str(board.model)) pc.board = { maker: str(board.maker), model: str(board.model), bios: str(board.bios), biosDate: iso(board.biosDate) };
  const disks = list(r.disks)
    .map(obj)
    .filter((d) => str(d.root))
    .map((d) => {
      // Nom (« NVMe », « SSD ») ou code de MSFT_Disk.BusType (17 NVMe, 7 USB) et MSFT_PhysicalDisk.MediaType (4 SSD, 3 HDD).
      const bus = String(d.bus ?? '').toLowerCase();
      const media = String(d.media ?? '').toLowerCase();
      const kind: DiskKind | undefined = bus === 'nvme' || bus === '17' ? 'nvme' : bus === 'usb' || bus === '7' ? 'usb' : media === 'ssd' || media === '4' ? 'ssd' : media === 'hdd' || media === '3' ? 'hdd' : undefined;
      return { root: str(d.root)!, label: str(d.label), model: str(d.model), kind, size: num(d.size), free: num(d.free) };
    });
  if (disks.length) pc.disks = disks;
  const network = list(r.net)
    .map(obj)
    .filter((n) => str(n.name))
    .map((n) => ({ name: str(n.desc) ?? str(n.name)!, wifi: /802\.11|wi-?fi|wireless/i.test(`${str(n.media) ?? ''} ${str(n.desc) ?? ''}`), bps: num(n.bps) }));
  if (network.length) pc.network = network;
  if (iso(os.boot)) pc.bootAt = iso(os.boot);

  const windows: NonNullable<TechFacts['windows']> = {};
  if (str(os.name)) windows.name = str(os.name)!.replace(/^Microsoft\s+/i, '');
  if (str(os.release)) windows.release = str(os.release);
  if (str(os.build)) windows.build = num(os.ubr) !== undefined ? `${str(os.build)}.${num(os.ubr)}` : str(os.build);
  if (typeof r.reboot === 'boolean') windows.rebootPending = r.reboot;
  const guid = (str(power.guid) ?? '').toLowerCase();
  if (guid) {
    const minutes = (s: unknown) => (num(s) === undefined ? undefined : Math.round(num(s)! / 60));
    windows.power = { scheme: POWER_SCHEMES[guid] ?? 'other', name: str(power.name), sleepMinutes: minutes(power.sleep), screenMinutes: minutes(power.screen) };
  }
  // Absents du registre : la valeur par défaut de Windows 11 (mode Jeu actif, notifications actives).
  if (r.gameMode !== undefined) windows.gameMode = num(r.gameMode) !== 0;
  if (num(r.hags) !== undefined) windows.gpuScheduling = num(r.hags) === 2;
  if (r.toast !== undefined) windows.notifications = num(r.toast) !== 0;
  const av = list(r.av).map(str).filter((a): a is string => Boolean(a));
  if (av.length) windows.antivirus = [...new Set(av)];
  if (str(r.culture)) windows.locale = str(r.culture);
  const klid = (str(r.keyboard) ?? '').split(':').pop()?.toLowerCase();
  if (klid) windows.keyboard = keyboardName(klid);
  return { pc, windows };
}

// ---------- Blocs de la fiche ----------

export const TECH_BLOCKS = ['pc', 'windows', 'displays', 'controllers', 'software', 'app'] as const;
export type TechBlockId = (typeof TECH_BLOCKS)[number];

/** État d'une ligne : celui de la santé, ou une information (« info »), ou rien d'établi (« quiet »). */
export type TechRowState = HealthState | 'info' | 'quiet';

export interface TechRow {
  label: string;
  value: string;
  detail?: string;
  state?: TechRowState;
}

export interface TechBlock {
  id: TechBlockId;
  title: string;
  icon: IconName;
  /** Le plus grave de ses lignes. */
  state: HealthState;
  /** Une ligne pour la page : l'essentiel, puis ce qui est à vérifier. */
  summary: string;
  sections: { title?: string; rows: TechRow[] }[];
  /** Explications des points à vérifier, sous les lignes. */
  notes: { state: HealthState; title: string; detail?: string }[];
}

const NOT_READ = () => t('Non relevé');
const worst = (states: (TechRowState | undefined)[]): HealthState => (states.includes('blocking') ? 'blocking' : states.includes('check') ? 'check' : 'ok');
const day = (at: string | undefined) => (at ? formatDate(at, { day: '2-digit', month: '2-digit', year: 'numeric' }) : undefined);
const hz = (n: number) => t('{n} Hz', { n: Math.round(n) });
const pixels = (w: number, h: number) => `${formatNumber(w)} × ${formatNumber(h)}`;
const gb = (bytes: number) => formatSize(bytes);
const joined = (parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' · ');
/** Minuscule initiale, sauf pour un sigle (« VPX », « PC ») ou un nom propre en capitales. */
const lowerFirst = (s: string) => (/^\p{Lu}\p{Ll}/u.test(s) && !/^(Windows|Cyber|Pinscape|Visual)\b/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);

export function roleLabel(role: RoleId): string {
  switch (role) {
    case 'playfield':
      return t('Playfield');
    case 'backglass':
      return t('Fronton');
    case 'dmd':
      return t('DMD');
    case 'topper':
      return t('Topper');
  }
}

export function connectionLabel(c: Connection): string {
  switch (c) {
    case 'hdmi':
      return 'HDMI'; // i18n-ignore : nom de norme
    case 'displayport':
      return 'DisplayPort'; // i18n-ignore : nom de norme
    case 'dvi':
      return 'DVI'; // i18n-ignore : nom de norme
    case 'vga':
      return 'VGA'; // i18n-ignore : nom de norme
    case 'internal':
      return t('écran intégré');
    case 'usb':
      return t('USB');
    case 'wireless':
      return t('sans fil');
    case 'other':
      return t('autre connexion');
  }
}

/** Âge au-delà duquel un pilote graphique est signalé : deux ans. */
export const OLD_DRIVER_MS = 2 * 365 * 24 * 3600_000;
/** Mémoire en deçà de laquelle VPX et ses médias se gênent : 8 Go. */
export const LOW_MEMORY_BYTES = 8 * 1024 ** 3 * 0.95;
/** Disque presque plein (même seuil que la santé : moins de 10 Go). */
const LOW_DISK_BYTES = 10 * 1024 ** 3;

/** Ce qu'un écran gagnerait en fréquence : Windows propose plus, ou l'écran annonce plus. */
export function refreshGap(d: TechDisplay): { kind: 'windows' | 'link'; max: number } | undefined {
  if (!d.hz) return undefined;
  if (d.offeredMaxHz && d.offeredMaxHz > d.hz + 1) return { kind: 'windows', max: d.offeredMaxHz };
  if (d.edidMaxHz && d.edidMaxHz > d.hz + 1 && (!d.offeredMaxHz || d.offeredMaxHz <= d.hz + 1)) return { kind: 'link', max: d.edidMaxHz };
  return undefined;
}

const displayName = (d: TechDisplay) => (d.role ? roleLabel(d.role) : d.name);

/** Les blocs de la fiche, dans l'ordre de la page. */
export function techBlocks(facts: TechFacts, now = Date.now()): TechBlock[] {
  return [pcBlock(facts, now), windowsBlock(facts), displaysBlock(facts), controllersBlock(facts), softwareBlock(facts), appBlock(facts)];
}

function block(id: TechBlockId, title: string, icon: IconName, sections: TechBlock['sections'], notes: TechBlock['notes'], essentials: string[]): TechBlock {
  const state = worst([...sections.flatMap((s) => s.rows.map((r) => r.state)), ...notes.map((n) => n.state)]);
  // Le premier point à voir suit l'essentiel : sa note, sinon sa ligne.
  const flagged = sections.flatMap((s) => s.rows.filter((r) => r.state === 'check' || r.state === 'blocking'))[0];
  const first = notes.find((n) => n.state !== 'ok')?.title ?? (flagged && `${flagged.label} : ${flagged.value}`);
  const summary = joined([...essentials, first && lowerFirst(first)]);
  return { id, title, icon, state, summary: summary || NOT_READ(), sections, notes };
}

function pcBlock(f: TechFacts, now: number): TechBlock {
  const pc = f.pc ?? {};
  const rows: TechRow[] = [];
  const notes: TechBlock['notes'] = [];
  if (pc.cpu) rows.push({ label: t('Processeur'), value: pc.cpu.name, detail: joined([pc.cpu.cores && pc.cpu.threads ? t('{cores} cœurs, {threads} fils', { cores: pc.cpu.cores, threads: pc.cpu.threads }) : undefined, pc.cpu.mhz ? t('{n} GHz', { n: formatNumber(pc.cpu.mhz / 1000, { maximumFractionDigits: 1 }) }) : undefined]) || undefined });
  else rows.push({ label: t('Processeur'), value: NOT_READ(), state: 'quiet' });
  if (pc.memory) {
    const low = pc.memory.total < LOW_MEMORY_BYTES;
    rows.push({
      label: t('Mémoire'),
      value: gb(pc.memory.total),
      detail: joined([pc.memory.modules && pc.memory.mhz ? tn(pc.memory.modules, '{n} barrette à {mhz} MHz', '{n} barrettes à {mhz} MHz', { mhz: formatNumber(pc.memory.mhz) }) : undefined, pc.memory.free !== undefined ? t('{used} utilisés', { used: gb(pc.memory.total - pc.memory.free) }) : undefined]) || undefined,
      ...(low && { state: 'check' as const }),
    });
    if (low) notes.push({ state: 'check', title: t('Moins de 8 Go de mémoire'), detail: t('VPX, ses médias et Cyber Pinball se partagent la mémoire : une table lourde peut ralentir ou ne pas démarrer.') });
  } else rows.push({ label: t('Mémoire'), value: NOT_READ(), state: 'quiet' });
  for (const g of pc.gpus ?? []) {
    const old = g.driverDate !== undefined && now - Date.parse(g.driverDate) > OLD_DRIVER_MS;
    rows.push({
      label: t('Carte graphique'),
      value: joined([g.name, g.memory ? gb(g.memory) : undefined]),
      detail: g.driver ? (g.driverDate ? t('Pilote {version} du {date}', { version: g.driver, date: day(g.driverDate)! }) : t('Pilote {version}', { version: g.driver })) : undefined,
      ...(old && { state: 'check' as const }),
    });
    if (old) notes.push({ state: 'check', title: t('Pilote graphique du {date}', { date: day(g.driverDate)! }), detail: t('Plus de deux ans : un pilote récent du fabricant corrige souvent saccades et écrans noirs.') });
  }
  if (!pc.gpus?.length) rows.push({ label: t('Carte graphique'), value: NOT_READ(), state: 'quiet' });
  if (pc.board) rows.push({ label: t('Carte mère'), value: joined([pc.board.maker, pc.board.model]), detail: pc.board.bios ? (pc.board.biosDate ? t('BIOS {version} du {date}', { version: pc.board.bios, date: day(pc.board.biosDate)! }) : t('BIOS {version}', { version: pc.board.bios })) : undefined });
  for (const n of pc.network ?? []) rows.push({ label: t('Réseau'), value: joined([n.wifi ? t('Wi-Fi') : t('Ethernet'), n.bps ? speed(n.bps) : undefined]), detail: n.name });
  if (pc.bootAt) rows.push({ label: t('Démarré'), value: day(pc.bootAt)!, detail: uptime(now - Date.parse(pc.bootAt)) });
  const disks: TechRow[] = (pc.disks ?? []).map((d) => {
    const low = d.free !== undefined && d.free < LOW_DISK_BYTES;
    return {
      label: joined([d.root.replace(/\\$/, ''), d.label]),
      value: joined([d.model, d.size ? gb(d.size) : undefined]) || t('Disque'),
      detail: joined([d.free !== undefined ? t('{free} libres', { free: gb(d.free) }) : undefined, d.kind && diskKindLabel(d.kind)]) || undefined,
      ...(low && { state: 'check' as const }),
    };
  });
  const sections: TechBlock['sections'] = disks.length ? [{ title: t('Disques'), rows: disks }, { title: t('Matériel'), rows }] : [{ rows }];
  const essentials = [pc.cpu && shortCpu(pc.cpu.name), pc.memory && gb(pc.memory.total), pc.gpus?.[0]?.name.replace(/^NVIDIA\s+/i, '')].filter((s): s is string => Boolean(s));
  if (disks.some((d) => d.state === 'check')) notes.push({ state: 'check', title: t('Disque presque plein'), detail: t('Moins de 10 Go libres : une table, un PuP-Pack ou une mise à jour peut ne plus tenir.') });
  return block('pc', t('PC'), 'chip', sections, notes, essentials);
}

/** « Intel(R) Core(TM) i7-10700K CPU @ 3.80GHz » -> « Core i7-10700K ». */
export function shortCpu(name: string): string {
  return name.replace(/\((R|TM)\)/gi, '').replace(/@.*$/, '').replace(/\b(CPU|Processor)\b/gi, '').replace(/^(Intel|AMD)\s+/i, '').replace(/\s+/g, ' ').trim();
}

function speed(bps: number): string {
  return bps >= 1e9 ? t('{n} Gbit/s', { n: formatNumber(bps / 1e9, { maximumFractionDigits: 1 }) }) : t('{n} Mbit/s', { n: formatNumber(Math.round(bps / 1e6)) });
}

function uptime(ms: number): string {
  const hours = Math.max(0, Math.round(ms / 3600_000));
  return hours < 48 ? tn(hours, 'depuis {n} heure', 'depuis {n} heures') : tn(Math.round(hours / 24), 'depuis {n} jour', 'depuis {n} jours');
}

function diskKindLabel(k: DiskKind): string {
  switch (k) {
    case 'nvme':
      return t('SSD NVMe');
    case 'ssd':
      return t('SSD');
    case 'hdd':
      return t('disque dur');
    case 'usb':
      return t('disque USB');
  }
}

export function powerLabel(p: NonNullable<NonNullable<TechFacts['windows']>['power']>): string {
  switch (p.scheme) {
    case 'high':
      return t('Performances élevées');
    case 'ultimate':
      return t('Performances optimales');
    case 'balanced':
      return t('Utilisation normale');
    case 'saver':
      return t('Économie d’énergie');
    case 'other':
      return p.name ?? t('Mode personnalisé');
  }
}

const never = () => t('jamais');
const minutes = (n: number | undefined) => (n === undefined ? undefined : n === 0 ? never() : tn(n, '{n} minute', '{n} minutes'));

function windowsBlock(f: TechFacts): TechBlock {
  const w = f.windows ?? {};
  const rows: TechRow[] = [];
  const notes: TechBlock['notes'] = [];
  rows.push(w.name ? { label: t('Édition'), value: joined([w.name, w.release]), detail: w.build ? t('Build {build}', { build: w.build }) : undefined } : { label: t('Édition'), value: NOT_READ(), state: 'quiet' });
  if (w.rebootPending !== undefined) {
    rows.push(w.rebootPending ? { label: t('Mises à jour'), value: t('Redémarrage en attente'), detail: t('Windows peut redémarrer seul, même pendant une partie'), state: 'check' } : { label: t('Mises à jour'), value: t('Aucun redémarrage en attente') });
    if (w.rebootPending) notes.push({ state: 'check', title: t('Redémarrage de Windows en attente'), detail: t('Redémarrez la borne quand elle est libre : Windows termine la mise à jour.') });
  }
  if (w.power) {
    const saver = w.power.scheme === 'saver';
    rows.push({ label: t('Alimentation'), value: powerLabel(w.power), detail: joined([w.power.screenMinutes !== undefined ? t('Écran éteint après : {d}', { d: minutes(w.power.screenMinutes)! }) : undefined, w.power.sleepMinutes !== undefined ? t('Veille après : {d}', { d: minutes(w.power.sleepMinutes)! }) : undefined]) || undefined, ...(saver && { state: 'check' as const }) });
    if (saver) notes.push({ state: 'check', title: t('Mode d’alimentation économique'), detail: t('Le processeur et la carte graphique sont bridés : choisissez « Performances élevées » dans les options d’alimentation de Windows.') });
  }
  if (w.gameMode !== undefined) rows.push({ label: t('Mode Jeu'), value: w.gameMode ? t('Activé') : t('Désactivé') });
  if (w.gpuScheduling !== undefined) rows.push({ label: t('Accélération GPU'), value: w.gpuScheduling ? t('Planification matérielle activée') : t('Planification matérielle désactivée') });
  if (w.notifications !== undefined) rows.push({ label: t('Notifications'), value: w.notifications ? t('Activées') : t('Désactivées') });
  if (w.vcRuntime) rows.push(w.vcRuntime.ok ? { label: t('Visual C++'), value: t('Présent') } : { label: t('Visual C++'), value: t('À installer'), detail: w.vcRuntime.detail, state: 'blocking' });
  if (w.antivirus?.length) rows.push({ label: t('Antivirus'), value: w.antivirus.join(', ') });
  if (w.locale || w.keyboard) rows.push({ label: t('Langue'), value: w.locale ?? NOT_READ(), detail: w.keyboard ? t('Clavier {layout}', { layout: w.keyboard }) : undefined });
  return block('windows', t('Windows'), 'desktop', [{ rows }], notes, [joined([w.name, w.release])].filter(Boolean));
}

function displaysBlock(f: TechFacts): TechBlock {
  const notes: TechBlock['notes'] = [];
  const order: RoleId[] = ['playfield', 'backglass', 'dmd', 'topper'];
  const displays = [...(f.displays ?? [])].sort((a, b) => (a.role ? order.indexOf(a.role) : 9) - (b.role ? order.indexOf(b.role) : 9));
  const rows: TechRow[] = displays.map((d) => {
    const gap = refreshGap(d);
    if (gap) notes.push(refreshNote(d, gap));
    return {
      label: displayName(d),
      value: joined([d.role ? d.name : undefined, d.inches ? `${formatNumber(d.inches, { maximumFractionDigits: 1 })}″` : undefined, pixels(d.width, d.height), d.hz ? hz(d.hz) : undefined]),
      detail: joined([
        d.connection && connectionLabel(d.connection),
        gap && t('jusqu’à {max} annoncés', { max: hz(gap.max) }),
        d.scale ? t('échelle {n} %', { n: Math.round(d.scale * 100) }) : undefined,
        d.rotation ? t('tourné de {n}°', { n: d.rotation }) : undefined,
        d.primary && t('écran principal'),
      ]) || undefined,
      state: gap ? 'check' : 'ok',
    };
  });
  if (!rows.length) rows.push({ label: t('Écrans'), value: NOT_READ(), state: 'quiet' });
  const sections: TechBlock['sections'] = [{ title: t('Branchés'), rows }];
  const c = f.configuration;
  if (c) {
    const missing = c.found < c.total;
    sections.push({ rows: [{ label: t('Configuration'), value: c.name, detail: t('{found} écrans sur {total} branchés', { found: c.found, total: c.total }), ...(missing && { state: 'check' as const }) }] });
  }
  const playfield = displays.find((d) => d.role === 'playfield') ?? displays[0];
  // Le playfield en résumé, sauf quand une note parle déjà de lui (elle suit l'essentiel).
  const essentials = [displays.length ? tn(displays.length, '{n} écran branché', '{n} écrans branchés') : '', playfield && !notes.length ? t('{role} à {hz}', { role: displayName(playfield), hz: playfield.hz ? hz(playfield.hz) : pixels(playfield.width, playfield.height) }) : ''].filter(Boolean);
  return block('displays', t('Écrans'), 'screens', sections, notes, essentials);
}

/** Pourquoi un écran est sous sa fréquence, et quoi faire, sans affirmer ce qui n'est pas établi. */
export function refreshNote(d: TechDisplay, gap: { kind: 'windows' | 'link'; max: number }): TechBlock['notes'][number] {
  if (gap.kind === 'windows') {
    return {
      state: 'check',
      title: t('{screen} à {hz}, Windows propose {max}', { screen: displayName(d), hz: hz(d.hz!), max: hz(gap.max) }),
      detail: t('La bille est plus fluide à {max} : choisissez-la dans les paramètres d’affichage de Windows (Affichage avancé).', { max: hz(gap.max) }),
    };
  }
  return {
    state: 'check',
    title: t('{screen} à {hz}, il annonce jusqu’à {max}', { screen: displayName(d), hz: hz(d.hz!), max: hz(gap.max) }),
    detail:
      d.connection === 'hdmi'
        ? t('Windows ne propose pas plus à cette définition : vérifiez le port et le câble. En HDMI, certains câbles et cartes plafonnent la 4K à 60 Hz ; un câble DisplayPort l’évite souvent.')
        : t('Windows ne propose pas plus à cette définition : vérifiez le port, le câble et le réglage de l’écran.'),
  };
}

function controllersBlock(f: TechFacts): TechBlock {
  const c = f.controllers;
  const rows: TechRow[] = [];
  if (!c) rows.push({ label: t('Contrôleurs'), value: NOT_READ(), state: 'quiet' });
  else {
    rows.push({ label: t('Boutons'), value: c.pinscape ? t('Pinscape') : c.buttons ? t('Clavier ou encodeur') : t('Aucun bouton relevé'), detail: c.buttons ? tn(c.buttons, '{n} bouton configuré', '{n} boutons configurés') : t('« Commandes de la borne » les relève'), ...(!c.buttons && { state: 'check' as const }) });
    rows.push({ label: t('Lanceur'), value: c.plunger ? t('Analogique') : t('Bouton seul'), detail: c.plunger });
    rows.push({ label: t('Accéléromètre'), value: c.nudge ? t('Relevé') : t('Aucun'), detail: c.nudge });
    rows.push(c.dof.length ? { label: t('Retours (DOF)'), value: tn(c.dof.length, '{n} contrôleur', '{n} contrôleurs'), detail: c.dof.join(', ') } : { label: t('Retours (DOF)'), value: t('Aucun contrôleur'), state: 'quiet' });
  }
  const notes: TechBlock['notes'] = c && !c.buttons ? [{ state: 'check', title: t('Aucun bouton de la borne relevé'), detail: t('« Commandes de la borne » associe chaque bouton à sa fonction.') }] : [];
  const essentials = c ? [c.pinscape ? t('Pinscape') : tn(c.buttons, '{n} bouton', '{n} boutons'), c.plunger ? t('lanceur analogique') : '', c.dof.length ? t('DOF : {n}', { n: c.dof.length }) : ''].filter(Boolean) : [];
  return block('controllers', t('Contrôleurs'), 'gamepad', [{ rows }], notes, essentials);
}

function softwareBlock(f: TechFacts): TechBlock {
  const s = f.software;
  const play: TechRow[] = [];
  const notes: TechBlock['notes'] = [];
  const vpx = s?.vpx;
  if (vpx?.version) {
    const newer = vpx.known && vpx.known !== vpx.version;
    play.push({ label: t('Visual Pinball X'), value: vpx.version, detail: newer ? t('{version} disponible, facultative', { version: vpx.known! }) : undefined, state: newer ? 'info' : 'ok' });
  } else {
    play.push({ label: t('Visual Pinball X'), value: t('Absent'), detail: t('Sans VPX, aucune table ne démarre'), state: 'blocking' });
    notes.push({ state: 'blocking', title: t('VPX n’est pas installé'), detail: t('« Santé de la borne » propose de l’installer.') });
  }
  const plugins = s?.plugins ?? [];
  const key = KEY_PLUGINS.map((id) => plugins.find((p) => p.id.toLowerCase() === id.toLowerCase())).filter((p): p is (typeof plugins)[number] => Boolean(p));
  for (const p of key) play.push({ label: p.name, value: p.enabled ? t('Activé') : t('Désactivé'), state: p.enabled ? 'ok' : 'quiet' });
  const others = plugins.filter((p) => !key.includes(p));
  if (others.length) play.push({ label: t('Autres plugins'), value: tn(others.filter((p) => p.enabled).length, '{n} activé', '{n} activés'), detail: others.map((p) => p.name).join(', ') });
  if (s?.roms !== undefined) play.push({ label: t('ROM'), value: tn(s.roms, '{n} ROM', '{n} ROM') });
  if (s?.pupPacks !== undefined) play.push({ label: t('PuP-Packs'), value: tn(s.pupPacks, '{n} table avec un PuP-Pack', '{n} tables avec un PuP-Pack') });
  const essentials = [vpx?.version ? t('VPX {version}', { version: vpx.version }) : t('VPX absent'), key.length ? tn(plugins.filter((p) => p.enabled).length, '{n} plugin activé', '{n} plugins activés') : ''].filter(Boolean);
  return block('software', t('Logiciels'), 'layers', [{ rows: play }], notes, essentials);
}

function appBlock(f: TechFacts): TechBlock {
  const a = f.app;
  const rows: TechRow[] = [];
  if (a) {
    rows.push({ label: t('Version'), value: a.version, detail: a.prerelease === undefined ? undefined : a.prerelease ? t('Préversions reçues') : t('Versions finales seulement') });
    rows.push({ label: t('Mode'), value: a.mode === 'cabinet' ? t('Borne, plein écran') : t('Bureau, en fenêtre'), detail: a.dedicated === undefined ? undefined : a.dedicated ? t('Borne dédiée') : t('Borne dédiée : non') });
    rows.push({ label: t('Données'), value: a.data, detail: a.lastBackup ? t('Dernière sauvegarde : {date}', { date: day(a.lastBackup)! }) : undefined });
    rows.push({ label: t('Tables'), value: tn(a.tables, '{n} table', '{n} tables'), detail: a.ready !== undefined ? tn(a.ready, '{n} prête', '{n} prêtes') : undefined });
    if (a.friends)
      rows.push({
        label: t('Réseau des amis'),
        value: a.friends === 'connected' ? t('Connecté') : a.friends === 'offline' ? t('Hors ligne') : t('Désactivé'),
        detail: a.firewall === undefined ? undefined : a.firewall ? t('Règle du pare-feu en place') : t('Règle du pare-feu absente'),
        ...(a.firewall === false && a.friends !== 'off' && { state: 'check' as const }),
      });
    if (a.phones !== undefined) rows.push({ label: t('Télécommande'), value: a.phones ? tn(a.phones, '{n} téléphone jumelé', '{n} téléphones jumelés') : t('Aucun téléphone jumelé') });
    rows.push({ label: t('Journal'), value: a.errors ? tn(a.errors, '{n} erreur depuis hier', '{n} erreurs depuis hier') : t('Aucune erreur depuis hier'), detail: a.errors ? t('Elles sont dans le rapport') : undefined });
    rows.push({ label: t('Langue'), value: a.language });
  } else rows.push({ label: t('Cyber Pinball'), value: NOT_READ(), state: 'quiet' });
  const notes: TechBlock['notes'] = a?.firewall === false && a.friends !== 'off' ? [{ state: 'check', title: t('Règle du pare-feu absente'), detail: t('Sans elle, ni le réseau des amis ni la télécommande ne reçoivent rien.') }] : [];
  const essentials = a ? [t('Version {version}', { version: a.version }), tn(a.tables, '{n} table', '{n} tables'), a.friends === 'connected' ? t('réseau des amis connecté') : ''].filter(Boolean) : [];
  return block('app', t('Cyber Pinball'), 'pinball-app', [{ rows }], notes, essentials);
}

// ---------- Contrôles du PC pour « Santé de la borne » ----------

/** Ce que la santé garde du relevé de la fiche (HealthFacts.pc). */
export interface PcHealthFacts {
  displays: TechDisplay[];
  rebootPending?: boolean;
  power?: NonNullable<NonNullable<TechFacts['windows']>['power']>;
  gpus: { name: string; driverDate?: string }[];
  memory?: number;
}

export function pcHealthFacts(f: TechFacts): PcHealthFacts {
  return {
    displays: f.displays ?? [],
    rebootPending: f.windows?.rebootPending,
    power: f.windows?.power,
    gpus: (f.pc?.gpus ?? []).map((g) => ({ name: g.name, driverDate: g.driverDate })),
    memory: f.pc?.memory?.total,
  };
}

const SHEET = (block: TechBlockId): HealthTarget => ({ kind: 'sheet', block });

/** Lignes du groupe « PC et Windows » : chacune ouvre le bloc de la fiche qui l'explique. */
export function pcLines(facts: PcHealthFacts, now = Date.now()): HealthLine[] {
  const lines: HealthLine[] = [];
  const go = (block: TechBlockId) => t('Fiche technique : {block}', { block: blockTitle(block) });
  const gaps = facts.displays.map((d) => ({ d, gap: refreshGap(d) })).filter((x) => x.gap);
  for (const { d, gap } of gaps) {
    const note = refreshNote(d, gap!);
    lines.push({ check: 'pc', state: 'check', title: note.title, detail: note.detail, go: go('displays'), target: SHEET('displays') });
  }
  if (!gaps.length && facts.displays.some((d) => d.hz)) lines.push({ check: 'pc', state: 'ok', title: t('Écrans à la fréquence la plus haute proposée'), go: go('displays'), target: SHEET('displays') });
  if (facts.rebootPending) lines.push({ check: 'pc', state: 'check', title: t('Redémarrage de Windows en attente'), detail: t('Windows peut redémarrer seul pendant une partie : redémarrez la borne quand elle est libre.'), go: go('windows'), target: SHEET('windows') });
  if (facts.power) {
    const saver = facts.power.scheme === 'saver';
    lines.push(
      saver
        ? { check: 'pc', state: 'check', title: t('Mode d’alimentation économique'), detail: t('Processeur et carte graphique bridés : choisissez « Performances élevées ».'), go: go('windows'), target: SHEET('windows') }
        : { check: 'pc', state: 'ok', title: t('Alimentation : {mode}', { mode: powerLabel(facts.power) }), go: go('windows'), target: SHEET('windows') },
    );
  }
  for (const g of facts.gpus) {
    if (!g.driverDate) continue;
    const old = now - Date.parse(g.driverDate) > OLD_DRIVER_MS;
    lines.push({
      check: 'pc',
      state: old ? 'check' : 'ok',
      title: t('Pilote graphique du {date}', { date: day(g.driverDate)! }),
      ...(old && { detail: t('Plus de deux ans : installez le pilote récent du fabricant de la carte.') }),
      go: go('pc'),
      target: SHEET('pc'),
    });
  }
  if (facts.memory !== undefined && facts.memory < LOW_MEMORY_BYTES) lines.push({ check: 'pc', state: 'check', title: t('{size} de mémoire', { size: gb(facts.memory) }), detail: t('Moins de 8 Go : une table lourde peut ralentir ou ne pas démarrer.'), go: go('pc'), target: SHEET('pc') });
  return lines;
}

export function blockTitle(id: TechBlockId): string {
  switch (id) {
    case 'pc':
      return t('PC');
    case 'windows':
      return t('Windows');
    case 'displays':
      return t('Écrans');
    case 'controllers':
      return t('Contrôleurs');
    case 'software':
      return t('Logiciels');
    case 'app':
      return t('Cyber Pinball');
  }
}

// ---------- Anonymisation ----------

export interface ReportSecrets {
  /** Nom du compte Windows. */
  user?: string;
  /** Dossier du profil (C:\Users\<nom>). */
  profile?: string;
  /** Nom du PC. */
  computer?: string;
  /** Noms des amis, de la borne sur le réseau, des joueurs. */
  names?: readonly string[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Remplace dans un texte ce qui désigne une personne ou ce PC : dossier du profil, nom du compte,
 * nom du PC, noms d'amis (‹ami 1›…), adresses IPv4 et IPv6, adresses e-mail. Les mots trop
 * courts (moins de 3 lettres) ne sont pas remplacés : ils toucheraient n'importe quel texte.
 */
export function anonymizer(secrets: ReportSecrets): (text: string) => string {
  const swaps: [RegExp, string][] = [];
  const word = (s: string) => new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(s)}(?![\\p{L}\\p{N}_])`, 'giu');
  if (secrets.profile && secrets.profile.length > 3) {
    const users = secrets.profile.replace(/[\\/][^\\/]+[\\/]?$/, '');
    const masked = `${users}\\‹${t('utilisateur')}›`;
    for (const variant of new Set([secrets.profile, secrets.profile.replace(/\\/g, '/'), secrets.profile.replace(/\\/g, '\\\\')])) swaps.push([new RegExp(escapeRe(variant), 'gi'), variant.includes('/') ? masked.replace(/\\/g, '/') : variant.includes('\\\\') ? masked.replace(/\\/g, '\\\\') : masked]);
  }
  if (secrets.computer && secrets.computer.length >= 3) swaps.push([word(secrets.computer), '‹PC›']);
  if (secrets.user && secrets.user.length >= 3) swaps.push([word(secrets.user), `‹${t('utilisateur')}›`]);
  [...new Set(secrets.names ?? [])]
    .filter((n) => n.trim().length >= 3)
    .sort((a, b) => b.length - a.length)
    .forEach((n, i) => swaps.push([word(n.trim()), `‹${t('ami {n}', { n: i + 1 })}›`]));
  swaps.push([/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, `‹${t('adresse e-mail')}›`]);
  // IPv4 : quatre nombres de 0 à 255, pas une partie d'un numéro de version plus long.
  swaps.push([/(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])/g, `‹${t('adresse IP')}›`]);
  // IPv6 : avec « :: » ou au moins cinq groupes (une heure 14:32:05 n'en a que trois).
  swaps.push([/(?<![\w:])(?:[0-9a-f]{1,4}:){1,7}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?(?![\w:])|(?<![\w:])(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}(?![\w:])/gi, `‹${t('adresse IP')}›`]);
  return (text) => swaps.reduce((acc, [re, by]) => acc.replace(re, by), text);
}

// ---------- Rapport ----------

export interface ReportInput {
  facts: TechFacts;
  /** Lignes de la santé (toutes, avec celles du PC). */
  health: HealthLine[];
  /** Ce que le joueur a écrit du problème. */
  description?: string;
  /** Fichiers joints, déjà lus : leur nom dans le ZIP et leur texte (anonymisé ici). */
  attachments: { name: string; text: string; about: string }[];
  /** Le relevé de la santé, tel qu'il est gardé (sante.json). */
  healthJson?: unknown;
  secrets: ReportSecrets;
  now?: Date;
}

export interface Report {
  /** « rapport-borne-2026-11-11.zip » */
  name: string;
  zip: Buffer;
  /** resume.txt : le résumé complet, anonymisé. */
  summary: string;
  /** Le résumé pour un message (CHAT_TEXT_MAX caractères au plus). */
  short: string;
  /** Les fichiers du ZIP, dans l'ordre : nom, taille, à quoi ils servent. */
  files: { name: string; size: number; about: string }[];
}

/** Nombre de caractères d'un message de la messagerie (chat.ts, CHAT_TEXT_MAX). */
export const REPORT_SHORT_MAX = 500;

export function reportName(now = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `rapport-borne-${d}.zip`; // i18n-ignore : nom de fichier
}

/** Les points de la santé à voir d'abord : bloquants, puis à vérifier. */
function problems(lines: HealthLine[]): HealthLine[] {
  return [...lines.filter((l) => l.state === 'blocking'), ...lines.filter((l) => l.state === 'check')];
}

/** Résumé en texte : la borne en quelques lignes, puis les points à voir. */
export function reportSummary(facts: TechFacts, lines: HealthLine[], description?: string): string {
  const blocks = techBlocks(facts);
  const out: string[] = [];
  out.push(t('Rapport de la borne · Cyber Pinball {version}', { version: facts.app?.version ?? '?' }));
  out.push(t('Relevé le {date}', { date: formatDate(facts.at, { dateStyle: 'full' }) }));
  if (description?.trim()) out.push('', t('Problème décrit : {text}', { text: description.trim() }));
  out.push('');
  for (const b of blocks) out.push(`${b.title} : ${b.summary}`);
  const p = problems(lines);
  if (p.length) {
    out.push('', t('À voir :'));
    for (const l of p) out.push(`${l.state === 'blocking' ? '✕' : '!'} ${l.title}${l.detail ? ` — ${l.detail}` : ''}`);
  } else out.push('', t('Santé de la borne : tout est en ordre.'));
  return out.join('\n');
}

/** Résumé court pour un message : les points à voir d'abord, puis la borne, coupé à `max`. */
export function reportShort(facts: TechFacts, lines: HealthLine[], max = REPORT_SHORT_MAX): string {
  const blocks = techBlocks(facts);
  const parts = [
    t('Rapport de ma borne (Cyber Pinball {version})', { version: facts.app?.version ?? '?' }),
    ...problems(lines).map((l) => `${l.state === 'blocking' ? '✕' : '!'} ${l.title}`),
    ...blocks.filter((b) => b.id !== 'app').map((b) => `${b.title} : ${b.summary}`),
  ];
  let text = '';
  for (const part of parts) {
    const next = text ? `${text}\n${part}` : part;
    if ([...next].length > max) break;
    text = next;
  }
  return text;
}

/** Lien qui ouvre la messagerie du téléphone avec le résumé (objet et corps), sans destinataire. */
export function reportMailto(summary: string, file: string): string {
  const subject = t('Rapport de ma borne Cyber Pinball');
  const body = `${summary}\n\n${t('Le rapport complet est joint : {file}', { file })}`;
  // Une adresse trop longue est refusée par certaines applications : le corps est coupé.
  const cut = body.length > 1800 ? `${body.slice(0, 1800)}…` : body;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(cut)}`;
}

const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** rapport.html : la page à lire d'abord, autonome (aucune ressource externe), imprimable. */
export function reportHtml(input: Omit<ReportInput, 'attachments' | 'secrets'> & { files: { name: string; about: string }[] }): string {
  const { facts, health } = input;
  const blocks = techBlocks(facts);
  const count = (s: HealthState) => health.filter((l) => l.state === s).length;
  const p = problems(health);
  const sign = (s: TechRowState | undefined) => (s === 'check' ? '! ' : s === 'blocking' ? '✕ ' : '');
  const table = (b: TechBlock) =>
    `<table><caption>${html(b.title)}</caption>${b.sections
      .flatMap((s) => s.rows)
      .map((r) => `<tr><th>${html(r.label)}</th><td class="s-${r.state ?? 'ok'}">${html(sign(r.state) + r.value)}${r.detail ? `<small>${html(r.detail)}</small>` : ''}</td></tr>`)
      .join('')}</table>`;
  const lang = language();
  return `<!doctype html><!-- i18n-ignore : gabarit du rapport -->
<html lang="${html(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${html(t('Rapport de la borne'))} · ${html(formatDate(facts.at, { day: '2-digit', month: '2-digit', year: 'numeric' }))}</title>
<style>
:root{--bg:#030807;--panel:#0a1513;--line:#1d3b36;--ink:#e6f0ee;--muted:#9db3ae;--signal:#8be23a;--warning:#f2b33d;--error:#ff6b6b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 'Segoe UI',system-ui,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:32px 20px 48px}
header{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:16px;padding-bottom:18px;border-bottom:1px solid var(--line)}
.brand{font-size:13px;letter-spacing:.4em;font-weight:600;color:var(--muted)}.brand b{color:var(--signal)}
h1{margin:6px 0 0;font-size:28px;font-weight:600}.when{color:var(--muted);font-size:15px}
h2{margin:30px 0 12px;font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:var(--signal)}
.counts{display:flex;flex-wrap:wrap;gap:12px;margin-top:18px}.count{padding:8px 14px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
.count b{font-size:22px;margin:0 6px}.count.check{border-color:var(--warning);color:var(--warning)}.count.blocking{border-color:var(--error);color:var(--error)}.count.ok{color:var(--signal)}
.issues{list-style:none;margin:0;padding:0;display:grid;gap:8px}.issues li{padding:12px 16px;border:1px solid var(--line);border-left:4px solid var(--warning);border-radius:8px;background:var(--panel)}
.issues li.blocking{border-left-color:var(--error)}.issues .d{color:var(--muted);font-size:15px}
.desc{padding:12px 16px;border:1px dashed var(--line);border-radius:8px;white-space:pre-wrap}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:0 28px}
table{width:100%;border-collapse:collapse;font-size:15px}caption{text-align:left;font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:var(--signal);font-weight:600;padding:26px 0 10px}
th,td{text-align:left;vertical-align:baseline;padding:7px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere}th{width:34%;font-weight:400;color:var(--muted);padding-right:16px}
td small{display:block;color:var(--muted)}td.s-check{color:var(--warning)}td.s-blocking{color:var(--error)}td.s-quiet{color:var(--muted)}
.files{color:var(--muted);font-size:15px;padding-left:20px}.files a{color:var(--ink)}
footer{margin-top:30px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
@media print{:root{--bg:#fff;--panel:#fff;--ink:#111;--muted:#555;--line:#ccc;--signal:#2d7a12;--warning:#9a6200;--error:#b00020}}
</style>
</head>
<body><div class="wrap">
<header><div><div class="brand">CYBER <b>PINBALL</b> · ${html(t('RAPPORT DE LA BORNE'))}</div><h1>${html(t('Cyber Pinball {version}', { version: facts.app?.version ?? '?' }))}</h1></div>
<div class="when">${html(t('Relevé le {date}', { date: formatDateTime(facts.at, { dateStyle: 'full', timeStyle: 'short' }) }))}</div></header>
<div class="counts">${(['blocking', 'check', 'ok'] as HealthState[]).map((s) => `<span class="count ${s}">${s === 'blocking' ? '✕' : s === 'check' ? '!' : '✓'}<b>${count(s)}</b>${html(s === 'blocking' ? t('Bloquant') : s === 'check' ? t('À vérifier') : t('OK'))}</span>`).join('')}</div>
${input.description?.trim() ? `<h2>${html(t('Le problème, selon le joueur'))}</h2><div class="desc">${html(input.description.trim())}</div>` : ''}
<h2>${html(p.length ? t('À voir') : t('Santé de la borne'))}</h2>
${p.length ? `<ul class="issues">${p.map((l) => `<li class="${l.state}"><b>${l.state === 'blocking' ? '✕' : '!'} ${html(l.title)}</b>${l.detail ? `<div class="d">${html(l.detail)}</div>` : ''}</li>`).join('')}</ul>` : `<p>${html(t('Tout est en ordre.'))}</p>`}
<div class="grid">${blocks.map(table).join('')}</div>
<h2>${html(t('Fichiers joints'))}</h2>
<ul class="files">${input.files.map((f) => `<li><a href="${html(encodeURI(f.name))}">${html(f.name)}</a> · ${html(f.about)}</li>`).join('')}</ul>
<footer>${html(t('Anonymisé avant l’envoi : nom d’utilisateur, nom du PC, noms des amis, adresses IP et adresses e-mail remplacés. Aucun mot de passe, message ni clé du réseau.'))}</footer>
</div></body></html>
`;
}

/** Le rapport complet : fichiers anonymisés, ZIP, résumés. */
export function buildReport(input: ReportInput): Report {
  const now = input.now ?? new Date();
  const hide = anonymizer(input.secrets);
  const summary = hide(reportSummary(input.facts, input.health, input.description));
  const short = hide(reportShort(input.facts, input.health));
  const members: { name: string; data: Buffer; about: string }[] = [];
  const add = (name: string, text: string, about: string) => members.push({ name, data: Buffer.from(text, 'utf8'), about });
  const listed = [
    { name: 'rapport.html', about: t('la fiche et la santé, à lire d’abord') }, // i18n-ignore : nom de fichier
    ...(input.description?.trim() ? [{ name: 'probleme.txt', about: t('ce que décrit le joueur') }] : []), // i18n-ignore : nom de fichier
    { name: 'resume.txt', about: t('le résumé en texte') }, // i18n-ignore : nom de fichier
    ...(input.healthJson !== undefined ? [{ name: 'sante.json', about: t('le relevé complet de la santé') }] : []), // i18n-ignore : nom de fichier
    { name: 'fiche.json', about: t('le relevé de la fiche technique') }, // i18n-ignore : nom de fichier
    ...input.attachments.map((a) => ({ name: a.name, about: a.about })),
  ];
  add('rapport.html', hide(reportHtml({ facts: input.facts, health: input.health, description: input.description, files: listed.slice(1) })), listed[0]!.about); // i18n-ignore : nom de fichier
  if (input.description?.trim()) add('probleme.txt', hide(input.description.trim()), t('ce que décrit le joueur')); // i18n-ignore : nom de fichier
  add('resume.txt', summary, t('le résumé en texte')); // i18n-ignore : nom de fichier
  if (input.healthJson !== undefined) add('sante.json', hide(JSON.stringify(input.healthJson, null, 1)), t('le relevé complet de la santé')); // i18n-ignore : nom de fichier
  add('fiche.json', hide(JSON.stringify(input.facts, null, 1)), t('le relevé de la fiche technique')); // i18n-ignore : nom de fichier
  for (const a of input.attachments) add(a.name, hide(a.text), a.about);
  const zip = zipBuffers(members, now);
  return { name: reportName(now), zip, summary, short, files: members.map((m) => ({ name: m.name, size: m.data.length, about: m.about })) };
}


/** Lignes du journal postérieures à `since` (les lignes de suite, indentées, suivent leur ligne). */
export function journalSince(text: string, since: number): string {
  const out: string[] = [];
  let keep = false;
  for (const line of text.split(/\r?\n/)) {
    const at = /^(\d{4}-\d\d-\d\dT[\d:.]+Z)\s/.exec(line)?.[1];
    if (at) keep = Date.parse(at) >= since;
    if (keep && line) out.push(line);
  }
  return out.join('\n');
}

/** Erreurs du journal depuis `since`. */
export function journalErrors(text: string, since: number): number {
  let n = 0;
  for (const m of text.matchAll(/^(\d{4}-\d\d-\d\dT[\d:.]+Z) \[erreur\]/gm)) if (Date.parse(m[1]!) >= since) n++;
  return n;
}
