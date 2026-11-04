// Menu système > Cyber Pinball > « Sauvegardes » : une copie de la borne sur une clé USB ou un
// disque, à trois niveaux (réglages et scores, avec les tables, toute l'installation), et sa
// restauration, sur cette borne ou sur une autre, avec le plan avant d'écrire (backup.ts du cœur).
// Maquette revue par Codex : docs/recherche/maquettes/sauvegardes.cjs.
//
// Règles de l'écran : le focus de départ n'est jamais sur une action qui écrit (niveau, plan,
// identité d'une autre borne) ; une action indisponible reste visible, grisée avec sa raison ; une
// copie se fait en tâche de fond, le menu reste utilisable mais pas les parties (une partie écrit
// ses scores pendant la copie). Restaurer prépare les fichiers puis redémarre Cyber Pinball : ils
// sont posés au démarrage (applyPendingRestore, main.ts), avant que quoi que ce soit ne les lise.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec des lecteurs simulés.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyPendingRestore,
  autoBackupDue,
  backupPartLabel,
  cabinetIdentity,
  canUndoLastRestore,
  estimateBackup,
  formatDateTime,
  formatRemaining,
  formatSize,
  isSameCabinet,
  levelLabel,
  listBackups,
  loadBackupSettings,
  loadHashCache,
  loadLastRestore,
  loadPendingRestore,
  localBackupDir,
  markLastRestoreShown,
  planRestore,
  prepareRestore,
  prepareUndoLastRestore,
  pruneBackups,
  runBackup,
  samePath,
  saveBackupSettings,
  scanRoot,
  t,
  tn,
  createTransferMeter,
  BACKUP_DIR_NAME,
  BACKUP_LEVELS,
  BACKUP_PARTS,
  LEVEL_PARTS,
  type AutoBackup,
  type BackupInfo,
  type BackupLevel,
  type BackupPart,
  type BackupProgress,
  type BackupSettings,
  type DriveInfo,
  type RestorePlan,
  type RestoreProgress,
  type ScanEntry,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';

export interface BackupsMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
    /** Opération courte : le message à l'écran, les touches ignorées. */
    task(message: string, work: () => Promise<void> | void): Promise<void>;
  };
  /** Redessine l'écran affiché (progression d'une copie). */
  broadcast(): void;
  /** Racine de la borne ; undefined : pas encore installée, rien à sauvegarder. */
  root: string | undefined;
  dataDir: string;
  /** Corbeille de la racine (<racine>	rash) : ce qu'une restauration remplace y part. */
  trashRoot: string;
  version: string;
  /** Nom de la borne tel que ses amis le voient (réseau des bornes) ; sinon celui du PC. */
  cabinetName(): string | undefined;
  listDrives(): Promise<DriveInfo[]>;
  /** Place libre d'un dossier (essais : lecteurs simulés). */
  diskSpace(dir: string): { free: number; total: number } | undefined;
  /** Éjecter un lecteur : true quand Windows dit qu'il peut être débranché. */
  eject(drive: DriveInfo): Promise<boolean>;
  /** Redémarrer Cyber Pinball (les fichiers d'une restauration sont posés au démarrage). */
  relaunch(): void;
  /** Bandeau bref (une sauvegarde automatique faite, une copie sur la clé). */
  notify?(text: string): void;
  openHealth?(): void;
  now?(): Date;
}

/** FAT32 : un fichier ne peut dépasser 4 Gio moins un octet. */
const FAT32_MAX = 4 * 1024 ** 3 - 1;
/** Sauvegardes automatiques gardées, sur la borne et sur la clé. */
const KEEP_AUTO = 10;

interface Job {
  kind: 'backup' | 'restore';
  level?: BackupLevel;
  /** Où (« clé « SAUVEGARDE » (E:) »). */
  where: string;
  auto?: boolean;
  progress?: BackupProgress;
  restore?: RestoreProgress;
  meter: ReturnType<typeof createTransferMeter>;
  rate?: { remaining?: number };
  stop: boolean;
}

interface Finished {
  kind: 'backup';
  ok: boolean;
  level: BackupLevel;
  where: string;
  drive?: DriveInfo;
  info?: BackupInfo;
  written: number;
  reason?: 'stopped' | 'error';
  error?: string;
  at: string;
}

interface Choice {
  backup: BackupInfo;
  same: boolean;
  parts: Set<BackupPart>;
  /** Autre borne : garder l'identité de celle-ci (sans ses amis) ou prendre la sienne. */
  identity: 'keep' | 'take';
  plan?: RestorePlan;
}

export function createBackupsMenu(host: BackupsMenuHost) {
  const now = () => host.now?.() ?? new Date();
  let drives: DriveInfo[] = [];
  let level: BackupLevel = 'settings';
  let job: Job | undefined;
  let finished: Finished | undefined;
  let entries: ScanEntry[] | undefined;
  let choice: Choice | undefined;
  let found: BackupInfo[] = [];
  let shown = 0;
  /** Dernier échec d'une restauration, sur le plan jusqu'à ce qu'on en ouvre un autre. */
  let restoreError: string | undefined;

  const settings = (): BackupSettings => loadBackupSettings(host.dataDir);
  const save = (s: BackupSettings) => saveBackupSettings(host.dataDir, s);
  const refresh = () => {
    if (Date.now() - shown < 250) return;
    shown = Date.now();
    host.broadcast();
  };

  // ---------- Lecteurs et destination ----------

  const drivePath = (d: DriveInfo) => d.path ?? `${d.letter}\\`;
  const rootDrive = () => (host.root ? path.parse(path.resolve(host.root)).root.slice(0, 2).toUpperCase() : undefined);
  const isRootDrive = (d: DriveInfo) => !d.path && d.letter.toUpperCase() === rootDrive();
  const destOf = (d: DriveInfo) => path.join(drivePath(d), BACKUP_DIR_NAME);

  function driveName(d: DriveInfo): string {
    if (isRootDrive(d)) return t('Disque de la borne ({letter})', { letter: d.letter });
    if (d.type === 'usb') return d.name ? t('Clé « {name} » ({letter})', { name: d.name, letter: d.letter }) : t('Clé USB ({letter})', { letter: d.letter });
    if (d.type === 'network') return d.name ? t('Dossier réseau « {name} » ({letter})', { name: d.name, letter: d.letter }) : t('Dossier réseau ({letter})', { letter: d.letter });
    return d.name ? t('Disque « {name} » ({letter})', { name: d.name, letter: d.letter }) : t('Disque ({letter})', { letter: d.letter });
  }

  /** Le lecteur de la destination choisie : par son numéro de série d'abord (la lettre d'une clé change), sinon par son dossier. */
  function destinationDrive(): DriveInfo | undefined {
    const d = settings().destination;
    if (!d) return undefined;
    if (d.serial) {
      const bySerial = drives.find((x) => x.serial === d.serial);
      if (bySerial) return bySerial;
    }
    return drives.find((x) => samePath(destOf(x), d.path));
  }

  function freeOf(d: DriveInfo): number | undefined {
    return d.free ?? host.diskSpace(drivePath(d))?.free;
  }

  const maxFileOf = (d: DriveInfo | undefined) => (d?.fs && /^fat(32)?$/i.test(d.fs) ? FAT32_MAX : undefined);

  async function readDrives(): Promise<void> {
    try {
      drives = (await host.listDrives()).filter((d) => d.type !== 'cd');
    } catch {
      drives = [];
    }
  }

  // ---------- Dates et tailles ----------

  function when(iso: string): string {
    const text = formatDateTime(iso, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  const shortWhen = (iso: string) => formatDateTime(iso, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  function levelIcon(l: BackupLevel) {
    return l === 'settings' ? ('drive' as const) : l === 'tables' ? ('tables' as const) : ('layers' as const);
  }

  // ---------- Écran principal ----------

  /** Constat de la restauration posée au dernier démarrage : montré en tête tant qu'on reste dans Sauvegardes. */
  let restoredFlash: Row[] | undefined;

  function open(): void {
    const last = loadLastRestore(host.dataDir);
    restoredFlash = last && !last.shown ? restoredRows(last) : undefined;
    if (restoredFlash) markLastRestoreShown(host.dataDir);
    void host.library.task(t('Recherche des clés et des disques…'), readDrives).then(() => host.library.openCustom(buildMain, 0));
  }

  function back(): void {
    restoredFlash = undefined;
    host.library.openSystem();
  }

  const backAction = (run: () => void = back): Action => ({ label: t('Retour'), icon: 'back', run });

  function buildMain(): Built {
    const s = settings();
    const drive = destinationDrive();
    const dest = drive ? destOf(drive) : undefined;
    const here = dest ? listBackups(dest, false).filter((b) => b.manifest.cabinet.id === identity().id) : [];
    const sections: Section[] = [];
    if (restoredFlash) sections.push({ rows: restoredFlash });
    if (job) sections.push({ rows: [{ icon: 'info', text: jobLine(), tone: 'info', progress: { value: jobValue(), tone: 'info' } }] });
    if (drive) {
      sections.push({
        title: t('Sur {where}', { where: driveName(drive) }),
        rows: here.length
          ? here.slice(0, 3).map((b) => ({
              icon: levelIcon(b.manifest.level),
              text: `${when(b.manifest.createdAt)} · ${levelLabel(b.manifest.level).toLowerCase()}`,
              detail: [b.manifest.auto ? t('Automatique') : undefined, formatSize(b.bytes)].filter(Boolean).join(' · '),
              tone: b.manifest.complete ? ('ok' as const) : ('warning' as const),
              badges: [b.manifest.complete ? t('Vérifiée') : t('Incomplète')],
            }))
          : [{ text: t('Aucune sauvegarde de cette borne pour l’instant'), tone: 'quiet' as const }],
      });
    } else {
      sections.push({
        rows: [
          s.destination
            ? { icon: 'usb', text: t('Branchez la clé ou le disque choisi : {where}', { where: s.destination.label ?? s.destination.path }), detail: t('Il est reconnu même si sa lettre change'), tone: 'info' }
            : { icon: 'usb', text: t('Branchez une clé USB ou un disque externe'), detail: t('Les réglages et les scores tiennent sur n’importe quelle clé'), tone: 'info' },
          { icon: 'alert', text: t('Le disque de la borne ne protège pas d’une panne de ce disque'), detail: t('Possible quand même, par « Choisir une destination »'), tone: 'warning' },
        ],
      });
    }
    const noDest = t('Choisissez d’abord une clé, un disque ou un dossier');
    const actions: Action[] = [
      job
        ? { label: job.kind === 'backup' ? t('Sauvegarde en cours') : t('Restauration en cours'), detail: jobLine(), icon: 'drive', run: showJob }
        : {
            label: t('Sauvegarder maintenant'),
            detail: drive ? t('Réglages et scores, avec les tables, ou toute l’installation') : noDest,
            icon: 'drive',
            ...(drive ? {} : { tone: 'quiet' as const }),
            run: () => (drive ? openLevel() : undefined),
          },
      { label: t('Restaurer une sauvegarde'), detail: t('Choisir parmi celles des clés, des disques et de la borne'), icon: 'restore', run: openRestoreList },
      drive
        ? { label: t('Destination : {where}', { where: driveName(drive) }), detail: t('{free} libres · changer de clé, de disque ou de dossier', { free: formatSize(freeOf(drive) ?? 0) }), icon: 'usb', run: openDestination }
        : { label: s.destination ? t('Destination : {where}, absente', { where: s.destination.label ?? s.destination.path }) : t('Choisir une destination'), detail: t('Une clé, un disque externe, un dossier du réseau ou de la borne'), icon: 'usb', run: openDestination },
      { label: autoLabel(s.auto), detail: autoDetail(s), icon: 'clock', run: openAuto },
      backAction(),
    ];
    return {
      heading: t('Sauvegardes'),
      icon: 'drive',
      subheading: s.last ? t('Dernière : {when} · {level}', { when: when(s.last.at), level: levelLabel(s.last.level).toLowerCase() }) : t('Aucune sauvegarde de cette borne pour l’instant'),
      lead: t('Une copie de la borne sur une clé USB ou un disque, pour la retrouver après une panne ou sur un autre PC.'),
      sections,
      actions,
      back,
    };
  }

  function autoLabel(a: AutoBackup): string {
    return a === 'weekly' ? t('Automatique : chaque semaine') : a === 'nightly' ? t('Automatique : chaque nuit') : t('Automatique : désactivée');
  }
  function autoDetail(s: BackupSettings): string {
    if (s.auto === 'off') return t('Réglages et scores, chaque semaine ou chaque nuit');
    return s.auto === 'weekly' ? t('Réglages et scores, le dimanche à 4 h') : t('Réglages et scores, chaque nuit à 4 h');
  }

  function identity() {
    return cabinetIdentity(host.dataDir, host.cabinetName());
  }

  // ---------- Choisir le niveau ----------

  function openLevel(): void {
    void host.library
      .task(t('Calcul de la place nécessaire…'), async () => {
        entries = host.root ? await scanRoot(host.root, LEVEL_PARTS.all, host.dataDir) : [];
      })
      .then(() => host.library.openCustom(buildLevel, 0));
  }

  function levelBlock(l: BackupLevel, drive: DriveInfo): string | undefined {
    const est = estimateFor(l, drive);
    if (!est) return undefined;
    if (est.tooBig.length) return tn(est.tooBig.length, 'FAT32 : {n} fichier dépasse 4 Go', 'FAT32 : {n} fichiers dépassent 4 Go');
    const free = freeOf(drive);
    if (free !== undefined && est.toWrite > free) return t('Il manque {size} : {need} à écrire, {free} libres', { size: formatSize(est.toWrite - free), need: formatSize(est.toWrite), free: formatSize(free) });
    return undefined;
  }

  function estimateFor(l: BackupLevel, drive: DriveInfo) {
    if (!entries) return undefined;
    const parts = new Set(LEVEL_PARTS[l]);
    return estimateBackup(entries.filter((e) => parts.has(e.part)), destOf(drive), loadHashCache(host.dataDir), maxFileOf(drive));
  }

  function buildLevel(): Built {
    const drive = destinationDrive();
    if (!drive) return buildMain();
    const what: Record<BackupLevel, string> = {
      settings: t('La borne, ses écrans et ses boutons, les réglages de VPX et de chaque table, les meilleurs scores, l’historique, les amis'),
      tables: t('En plus : les tables, leurs ROM, PuP-Packs, sons et médias'),
      all: t('En plus : VPX, ses archives pour le réinstaller sans réseau, les outils, les parties enregistrées'),
    };
    const rows: Row[] = BACKUP_LEVELS.map((l, i) => {
      const est = estimateFor(l, drive);
      const blocked = levelBlock(l, drive);
      return {
        action: i,
        pick: true,
        current: l === level,
        text: est ? `${levelLabel(l)} · ${formatSize(est.totalBytes)}` : levelLabel(l),
        detail: blocked ?? what[l],
        ...(blocked ? { tone: 'error' as const, badges: [t('Bloquant')] } : l === level ? { badges: [t('Choisi')] } : {}),
      };
    });
    const est = estimateFor(level, drive);
    const blocked = levelBlock(level, drive);
    const actions: Action[] = [
      ...BACKUP_LEVELS.map((l) => ({ label: levelLabel(l), run: () => {
        level = l;
        host.library.openCustom(buildLevel, BACKUP_LEVELS.indexOf(l));
      } })),
      blocked
        ? { label: t('Lancer la sauvegarde'), detail: blocked, icon: 'check', tone: 'quiet', run: () => undefined }
        : {
            label: t('Lancer la sauvegarde'),
            detail: est ? t('{level} · {size} à écrire · vérifiée à la fin', { level: levelLabel(level), size: formatSize(est.toWrite) }) : levelLabel(level),
            icon: 'check',
            tone: 'ok',
            run: () => void startBackup(level, drive),
          },
      { label: t('Changer de destination'), detail: t('{where} · {free} libres', { where: driveName(drive), free: formatSize(freeOf(drive) ?? 0) }), icon: 'usb', run: openDestination },
      backAction(() => host.library.openCustom(buildMain, 0)),
    ];
    return {
      heading: t('Sauvegarder maintenant'),
      icon: 'drive',
      subheading: t('Vers {where} · {free} libres', { where: driveName(drive), free: formatSize(freeOf(drive) ?? 0) }),
      lead: t('Chaque niveau contient le précédent ; ce qui est déjà sur la destination n’est pas recopié.'),
      hint: t('Flippers ou Tab : choisir · Start ou Entrée : choisir ce niveau · Exit ou Échap : revenir · souris'),
      sections: [
        { title: t('Ce qu’on sauvegarde'), options: true, rows },
        { rows: [{ icon: 'info', text: t('Cyber Pinball lui-même n’est pas dans la sauvegarde'), detail: t('Sur un autre PC : installez d’abord Cyber Pinball, puis restaurez. Jamais copiés : cache, corbeille, journaux'), tone: 'info' }] },
      ],
      actions,
      back: () => host.library.openCustom(buildMain, 0),
    };
  }

  // ---------- Copie ----------

  function jobValue(): number {
    if (!job) return 0;
    if (job.kind === 'backup') return job.progress && job.progress.totalBytes ? job.progress.doneBytes / job.progress.totalBytes : 0;
    return job.restore && job.restore.totalBytes ? job.restore.doneBytes / job.restore.totalBytes : 0;
  }

  function jobLine(): string {
    if (!job) return '';
    const pct = Math.floor(jobValue() * 100);
    const remaining = job.rate?.remaining !== undefined ? formatRemaining(job.rate.remaining) : undefined;
    return [job.kind === 'backup' ? t('Vers {where}', { where: job.where }) : t('Depuis {where}', { where: job.where }), t('{n} %', { n: pct }), remaining ? t('encore {time}', { time: remaining }) : undefined].filter(Boolean).join(' · ');
  }

  /** Une sauvegarde ou une restauration en cours : aucune partie ne se lance (elle écrirait ses scores pendant la copie). */
  function busy(): string | undefined {
    if (!job) return undefined;
    return job.kind === 'backup' ? t('Une sauvegarde est en cours : les parties attendent sa fin.') : t('Une restauration est en cours : les parties attendent sa fin.');
  }

  async function startBackup(l: BackupLevel, drive: DriveInfo, auto = false): Promise<Finished | undefined> {
    if (job || !host.root) return undefined;
    const where = driveName(drive);
    job = { kind: 'backup', level: l, where, auto, meter: createTransferMeter(), stop: false };
    const started = Date.now();
    let firstCopy = 0;
    finished = undefined;
    if (!auto) host.library.openCustom(buildJob, 0);
    const outcome = await runBackup({
      root: host.root,
      dataDir: host.dataDir,
      dest: destOf(drive),
      level: l,
      cabinet: identity(),
      version: host.version,
      auto,
      now,
      maxFileSize: maxFileOf(drive),
      shouldStop: () => Boolean(job?.stop),
      onProgress: (p) => {
        if (!job) return;
        if (p.phase === 'copy' && !firstCopy) {
          firstCopy = Date.now();
          console.log(`Sauvegarde ${l} : ${p.totalBytes} octets à traiter, recherche des fichiers en ${firstCopy - started} ms.`); // i18n-ignore : journal
        }
        job.progress = p;
        const m = job.meter.update(p.doneBytes, p.totalBytes);
        job.rate = { remaining: m.remaining };
        refresh();
      },
    });
    const at = now().toISOString();
    console.log(`Sauvegarde ${l}${auto ? ' automatique' : ''} vers ${where} : ${outcome.ok ? 'vérifiée' : outcome.reason === 'stopped' ? 'arrêtée' : `interrompue (${outcome.error})`}, ${formatSize(outcome.written)} écrits en ${Math.round((Date.now() - started) / 1000)} s${outcome.ok ? `, ${outcome.files} fichiers` : ''}.`); // i18n-ignore : journal
    finished = { kind: 'backup', ok: outcome.ok, level: l, where, drive, info: outcome.info, written: outcome.written, ...(outcome.ok ? {} : { reason: outcome.reason, error: outcome.error }), at };
    job = undefined;
    if (outcome.ok) {
      const s = settings();
      save({ ...s, last: { at, level: l, where } });
      try {
        pruneBackups(destOf(drive), identity().id, KEEP_AUTO);
      } catch {
        // rangement impossible (clé retirée) : il se fera la prochaine fois
      }
    }
    host.broadcast();
    return finished;
  }

  function showJob(): void {
    host.library.openCustom(job?.kind === 'restore' ? buildRestoring : buildJob, 0);
  }

  function buildJob(): Built {
    if (!job) return finished ? buildFinished(finished) : buildMain();
    const p = job.progress;
    const rows: Row[] = LEVEL_PARTS[job.level ?? 'settings'].map((part) => {
      const pp = p?.parts[part];
      if (!pp || pp.totalFiles === 0) return { text: backupPartLabel(part), detail: t('Rien à copier'), tone: 'quiet', progress: { value: 1, tone: 'quiet' } };
      const done = pp.doneFiles >= pp.totalFiles;
      const going = p?.part === part && !done;
      return {
        text: backupPartLabel(part),
        detail: done
          ? t('✓ Copiés et vérifiés · {n}', { n: tn(pp.totalFiles, '{n} fichier', '{n} fichiers') })
          : going
            ? t('{done} sur {total} · {size} sur {all}', { done: pp.doneFiles, total: tn(pp.totalFiles, '{n} fichier', '{n} fichiers'), size: formatSize(pp.doneBytes, true), all: formatSize(pp.totalBytes) })
            : t('En attente · {size}', { size: formatSize(pp.totalBytes) }),
        tone: done ? 'ok' : going ? 'info' : 'quiet',
        progress: { value: pp.totalBytes ? pp.doneBytes / pp.totalBytes : done ? 1 : 0, tone: done ? 'ok' : going ? 'info' : 'quiet' },
      };
    });
    return {
      heading: t('Sauvegarde en cours'),
      icon: levelIcon(job.level ?? 'settings'),
      subheading: `${levelLabel(job.level ?? 'settings')} · ${jobLine()}`,
      sections: [
        { rows: p?.phase === 'scan' ? [{ text: t('Recherche des fichiers…'), tone: 'info', progress: { busy: true } }] : rows },
        { rows: [{ icon: 'info', text: t('Parties indisponibles pendant la sauvegarde'), detail: t('Une partie écrit ses scores : vous pourrez jouer dès la fin de la copie et de sa vérification'), tone: 'info' }] },
      ],
      actions: [
        { label: t('Retour au menu'), detail: t('La sauvegarde continue ; son avancée reste sur « Sauvegardes »'), icon: 'back', run: back },
        job.stop
          ? { label: t('Arrêt demandé'), detail: t('Le fichier en cours se termine'), icon: 'close', tone: 'quiet', run: () => undefined }
          : { label: t('Arrêter la sauvegarde'), detail: t('Ce qui est copié reste, marqué incomplet'), icon: 'close', run: () => void stopJob() },
      ],
      back,
    };
  }

  function stopJob(): void {
    if (job) job.stop = true;
    host.broadcast();
  }

  function buildFinished(f: Finished): Built {
    const drive = f.drive && drives.find((d) => d.letter === f.drive!.letter) ? f.drive : undefined;
    if (f.ok && f.info) {
      const reused = f.info.bytes - f.written;
      const rows: Row[] = [
        {
          text: t('✓ {files} vérifiés · {size}', { files: tn(f.info.manifest.files.length, '{n} fichier', '{n} fichiers'), size: formatSize(f.info.bytes) }),
          detail: reused > 0 ? t('{written} copiés ; le reste était déjà sur la destination', { written: formatSize(f.written) }) : t('{written} copiés', { written: formatSize(f.written) }),
          tone: 'ok',
          badges: [t('Vérifiée')],
        },
        { text: f.info.dir, tone: 'quiet' },
      ];
      const keyRows: Row[] = LEVEL_PARTS[f.level].includes('friends')
        ? [{ icon: 'lock', text: t('Elle contient l’identité de la borne sur le réseau des amis'), detail: t('Qui la restaure se présente à vos amis comme cette borne : gardez-la pour vous'), tone: 'warning' }]
        : [];
      if (drive && drive.type === 'usb') keyRows.push({ icon: 'usb', text: t('Rangez-la hors de la borne'), detail: t('Une sauvegarde qui reste branchée partage le sort du PC (surtension, vol, dégât des eaux)'), tone: 'info' });
      const eject: Action =
        drive && drive.type === 'usb'
          ? { label: t('Éjecter la clé'), detail: t('Attendez le message avant de la débrancher'), icon: 'usb', tone: 'ok', run: () => void ejectDrive(drive) }
          : { label: t('Éjecter la clé'), detail: t('Cette destination ne s’éjecte pas'), icon: 'usb', tone: 'quiet', run: () => undefined };
      return {
        heading: t('Sauvegarde terminée'),
        icon: levelIcon(f.level),
        subheading: `${levelLabel(f.level)} · ${when(f.at)} · ${f.where}`,
        sections: [{ rows }, ...(keyRows.length ? [{ title: t('Cette sauvegarde'), rows: keyRows }] : [])],
        actions: [eject, { label: t('Revenir aux sauvegardes'), icon: 'drive', run: () => leaveFinished() }, backAction(() => leaveFinished(true))],
        back: () => leaveFinished(),
      };
    }
    const done = f.info?.manifest.partsDone ?? [];
    const rows: Row[] = [
      f.reason === 'stopped'
        ? { text: t('Sauvegarde arrêtée à votre demande'), tone: 'warning', badges: [t('Incomplète')] }
        : { text: t('La copie s’est arrêtée : {error}', { error: f.error ?? t('erreur inconnue') }), detail: drive ? undefined : t('{where} n’est plus là', { where: f.where }), tone: 'error', badges: [t('Incomplète')] },
      ...(done.length
        ? [{ text: t('Déjà copié et vérifié : {parts}', { parts: done.map((p) => backupPartLabel(p).toLowerCase()).join(', ') }), detail: t('Ces parties se restaurent déjà depuis cette sauvegarde'), tone: 'ok' as const, badges: [t('Vérifié')] }]
        : []),
    ];
    return {
      heading: t('Sauvegarde interrompue'),
      icon: levelIcon(f.level),
      subheading: `${levelLabel(f.level)} · ${f.where}`,
      sections: [{ rows }],
      actions: [
        destinationDrive()
          ? { label: t('Reprendre la sauvegarde'), detail: t('Seul ce qui manque est copié'), icon: 'refresh', tone: 'ok', run: () => void startBackup(f.level, destinationDrive()!) }
          : { label: t('Reprendre la sauvegarde'), detail: t('Rebranchez la destination : seul ce qui manque sera copié'), icon: 'refresh', tone: 'quiet', run: () => void readDrives().then(() => host.broadcast()) },
        { label: t('Changer de destination'), icon: 'usb', run: openDestination },
        backAction(() => leaveFinished()),
      ],
      back: () => leaveFinished(),
    };
  }

  function leaveFinished(toSystem = false): void {
    finished = undefined;
    if (toSystem) back();
    else host.library.openCustom(buildMain, 0);
  }

  async function ejectDrive(drive: DriveInfo): Promise<void> {
    let ok = false;
    await host.library.task(t('Windows termine l’écriture sur {where}…', { where: driveName(drive) }), async () => {
      ok = await host.eject(drive);
    });
    host.notify?.(ok ? t('Vous pouvez débrancher {where}', { where: driveName(drive) }) : t('{where} est encore utilisée : attendez un peu, puis réessayez', { where: driveName(drive) }));
    if (ok) {
      drives = drives.filter((d) => d.letter !== drive.letter);
      finished = undefined;
      host.library.openCustom(buildMain, 0);
    }
  }

  // ---------- Destination ----------

  function openDestination(): void {
    void host.library.task(t('Recherche des clés et des disques…'), readDrives).then(() => host.library.openCustom(buildDestination, 0));
  }

  function buildDestination(): Built {
    const current = destinationDrive();
    const list = [...drives].sort((a, b) => Number(isRootDrive(a)) - Number(isRootDrive(b)));
    const total = entries ? entries.filter((e) => LEVEL_PARTS.tables.includes(e.part)).reduce((s, e) => s + e.size, 0) : undefined;
    const rows: Row[] = list.map((d, i) => {
      const free = freeOf(d);
      const fat = Boolean(maxFileOf(d));
      const tight = total !== undefined && free !== undefined && free < total;
      const warn = isRootDrive(d)
        ? t('Le même disque que Cyber Pinball : cette copie ne protège pas d’une panne du disque')
        : fat
          ? t('FAT32 : réglages et scores seulement si une table a un fichier de plus de 4 Go')
          : tight
            ? t('Réglages et scores ; pas la place pour les tables')
            : undefined;
      const kind = d.type === 'usb' ? t('Clé USB') : d.type === 'network' ? t('Réseau') : t('Disque');
      const isCurrent = Boolean(current && current.letter === d.letter);
      return {
        action: i,
        pick: true,
        current: isCurrent,
        text: free !== undefined ? t('{where} · {free} libres', { where: driveName(d), free: formatSize(free) }) : driveName(d),
        detail: warn ?? [kind, d.fs].filter(Boolean).join(' · '),
        tone: warn ? 'warning' : 'ok',
        ...(warn ? { badges: [t('À vérifier')] } : isCurrent ? { badges: [t('Choisie')] } : {}),
      };
    });
    const actions: Action[] = list.map((d) => ({
      label: driveName(d),
      key: `drive:${d.letter}`,
      run: () => {
        save({ ...settings(), destination: { path: destOf(d), label: driveName(d), ...(d.serial ? { serial: d.serial } : {}) } });
        host.library.openCustom(buildMain, 0);
      },
    }));
    return {
      heading: t('Destination'),
      icon: 'usb',
      subheading: t('Une clé, un disque ou un dossier · le dossier {dir} y est créé', { dir: BACKUP_DIR_NAME }),
      hint: t('Flippers ou Tab : choisir · Start ou Entrée : choisir cette destination · Exit ou Échap : revenir · souris'),
      sections: rows.length ? [{ options: true, rows }] : [{ rows: [{ icon: 'usb', text: t('Aucune clé ni aucun disque trouvé'), detail: t('Branchez-en un, puis « Chercher de nouveau »'), tone: 'info' }] }],
      actions: [
        ...actions,
        { label: t('Chercher de nouveau'), detail: t('Une clé ou un disque qui vient d’être branché'), icon: 'refresh', run: openDestination },
        backAction(() => host.library.openCustom(buildMain, 0)),
      ],
      back: () => host.library.openCustom(buildMain, 0),
    };
  }

  // ---------- Restaurer ----------

  /** Destinations où chercher : chaque lecteur qui a un dossier de sauvegardes, et la borne. */
  function sources(): { dest: string; where: string }[] {
    const out: { dest: string; where: string }[] = [];
    for (const d of drives) if (fs.existsSync(destOf(d))) out.push({ dest: destOf(d), where: driveName(d) });
    const local = localBackupDir(host.dataDir);
    if (fs.existsSync(local)) out.push({ dest: local, where: t('cette borne') });
    return out;
  }

  function whereOf(b: BackupInfo): string {
    return sources().find((s) => samePath(s.dest, b.dest))?.where ?? b.dest;
  }

  function openRestoreList(): void {
    void host.library
      .task(t('Recherche des sauvegardes…'), async () => {
        await readDrives();
        found = sources().flatMap((s) => listBackups(s.dest));
        found.sort((a, b) => (a.manifest.createdAt < b.manifest.createdAt ? 1 : -1));
      })
      .then(() => host.library.openCustom(buildRestoreList, 0));
  }

  function backupRow(b: BackupInfo, i: number): Row {
    const damaged = b.damaged > 0;
    return {
      action: i,
      pick: true,
      text: `${when(b.manifest.createdAt)} · ${levelLabel(b.manifest.level).toLowerCase()}`,
      detail: [b.manifest.auto ? t('Automatique') : undefined, formatSize(b.bytes), whereOf(b), damaged ? tn(b.damaged, '{n} fichier illisible', '{n} fichiers illisibles') : undefined, b.manifest.version !== host.version ? t('Cyber Pinball {v}', { v: b.manifest.version }) : undefined]
        .filter(Boolean)
        .join(' · '),
      tone: damaged || !b.manifest.complete ? 'warning' : 'ok',
      badges: [damaged ? t('Endommagée') : b.manifest.complete ? t('Vérifiée') : t('Incomplète')],
    };
  }

  function buildRestoreList(): Built {
    const mine = found.filter((b) => isSameCabinet(b.manifest, host.dataDir));
    const others = found.filter((b) => !isSameCabinet(b.manifest, host.dataDir));
    const ordered = [...mine, ...others];
    const sections: Section[] = [];
    if (mine.length) sections.push({ title: t('Cette borne · « {name} »', { name: identity().name }), rows: mine.map((b) => backupRow(b, ordered.indexOf(b))) });
    if (others.length) {
      sections.push({
        title: t('Une autre borne'),
        rows: others.map((b) => ({ ...backupRow(b, ordered.indexOf(b)), text: `« ${b.manifest.cabinet.name} » · ${when(b.manifest.createdAt)}`, detail: `${levelLabel(b.manifest.level)} · ${backupRow(b, 0).detail}` })),
      });
    }
    if (!ordered.length) sections.push({ rows: [{ icon: 'usb', text: t('Aucune sauvegarde trouvée'), detail: t('Branchez la clé ou le disque qui la contient, puis « Chercher de nouveau »'), tone: 'info' }] });
    const undo = canUndoLastRestore(host.dataDir);
    const last = loadLastRestore(host.dataDir);
    const actions: Action[] = [
      ...ordered.map((b) => ({ label: `${b.manifest.cabinet.name} ${b.manifest.createdAt}`, key: b.dir, run: () => void openPlan(b) })),
      undo && last
        ? { label: t('Annuler la dernière restauration'), detail: t('Remettre l’état d’avant celle du {when}', { when: shortWhen(last.appliedAt) }), icon: 'refresh', run: () => void undoLast() }
        : { label: t('Annuler la dernière restauration'), detail: t('Aucun état d’avant gardé dans la corbeille'), icon: 'refresh', tone: 'quiet', run: () => undefined },
      { label: t('Chercher de nouveau'), detail: t('Une clé ou un disque qui vient d’être branché'), icon: 'search', run: openRestoreList },
      backAction(() => host.library.openCustom(buildMain, 0)),
    ];
    return {
      heading: t('Restaurer une sauvegarde'),
      icon: 'restore',
      subheading: ordered.length ? tn(ordered.length, '{n} sauvegarde trouvée', '{n} sauvegardes trouvées') : t('Aucune sauvegarde trouvée'),
      lead: t('Choisissez une sauvegarde pour voir ce qui sera restauré. Rien ne change avant votre validation.'),
      listStart: t('voir le plan'),
      sections,
      actions,
      back: () => host.library.openCustom(buildMain, 0),
    };
  }

  async function openPlan(b: BackupInfo): Promise<void> {
    const same = isSameCabinet(b.manifest, host.dataDir);
    const present = new Set(b.manifest.files.map((f) => f.part));
    const parts = new Set(BACKUP_PARTS.filter((p) => present.has(p) && (same || (p !== 'cabinet' && p !== 'friends'))));
    choice = { backup: b, same, parts, identity: 'keep' };
    restoreError = undefined;
    await computePlan();
    host.library.openCustom(buildPlan, 0);
  }

  async function computePlan(): Promise<void> {
    if (!choice || !host.root) return;
    const c = choice;
    await host.library.task(t('Préparation du plan…'), async () => {
      const wanted = new Set(c.parts);
      if (!c.same) {
        if (c.identity === 'take') wanted.add('friends');
        else wanted.delete('friends');
      }
      c.plan = await planRestore(c.backup, host.root!, host.dataDir, wanted);
    });
  }

  function partEffect(part: BackupPart, c: Choice): string {
    const p = c.plan?.parts.find((x) => x.part === part);
    if (!c.parts.has(part) && !(part === 'friends' && !c.same)) {
      if (part === 'cabinet' && !c.same) return t('Exclus : vos écrans, vos boutons et votre son restent ; inclus, ceux de l’autre borne les remplacent');
      return t('Exclu : rien ne change ici');
    }
    if (!p) return t('Rien à restaurer');
    const changes = p.replace + p.add;
    if (!changes) return t('Déjà identique ici : rien à copier');
    const bits = [p.replace ? tn(p.replace, '{n} fichier remplacé', '{n} fichiers remplacés') : undefined, p.add ? tn(p.add, '{n} fichier remis', '{n} fichiers remis') : undefined];
    if (part === 'tables' && p.tables.length) bits.push(tn(p.tables.length, '{n} table concernée', '{n} tables concernées'));
    if (p.skipped) bits.push(tn(p.skipped, '{n} fichier d’une table absente ici, ignoré', '{n} fichiers de tables absentes ici, ignorés'));
    if (part === 'scores') bits.push(t('les scores de chaque table reviennent à ceux de la sauvegarde'));
    return bits.filter(Boolean).join(' · ');
  }

  function buildPlan(): Built {
    const c = choice;
    if (!c) return buildRestoreList();
    const present = BACKUP_PARTS.filter((p) => c.backup.manifest.files.some((f) => f.part === p) && (c.same || p !== 'friends'));
    const rows: Row[] = present.map((part, i) => ({
      action: i,
      pick: true,
      current: c.parts.has(part),
      text: backupPartLabel(part),
      detail: partEffect(part, c),
      badges: [c.parts.has(part) ? t('✓ Inclus') : t('Exclu')],
    }));
    const sections: Section[] = [{ title: t('À restaurer'), options: true, rows }];
    const actions: Action[] = present.map((part) => ({
      label: backupPartLabel(part),
      key: `part:${part}`,
      run: async () => {
        if (c.parts.has(part)) c.parts.delete(part);
        else c.parts.add(part);
        await computePlan();
        host.library.openCustom(buildPlan, present.indexOf(part));
      },
    }));
    if (!c.same) {
      const base = actions.length;
      sections.push({
        title: t('Amis et identité sur le réseau'),
        options: true,
        rows: [
          { action: base, pick: true, current: c.identity === 'keep', text: t('Garder mes amis et l’identité de cette borne'), detail: t('Les amis de « {name} » ne sont pas repris', { name: c.backup.manifest.cabinet.name }), ...(c.identity === 'keep' ? { badges: [t('Choisi')] } : {}) },
          { action: base + 1, pick: true, current: c.identity === 'take', text: t('Remplacer « {name} » sur le réseau', { name: c.backup.manifest.cabinet.name }), detail: t('Seulement si l’ancienne ne se connectera plus : ses amis verront cette borne à sa place'), tone: 'warning', badges: [c.identity === 'take' ? t('Choisi') : t('À vérifier')] },
        ],
      });
      for (const id of ['keep', 'take'] as const) {
        actions.push({
          label: id === 'keep' ? t('Garder mes amis et l’identité de cette borne') : t('Remplacer « {name} » sur le réseau', { name: c.backup.manifest.cabinet.name }),
          key: `identity:${id}`,
          run: async () => {
            c.identity = id;
            await computePlan();
            host.library.openCustom(buildPlan, base + (id === 'keep' ? 0 : 1));
          },
        });
      }
    }
    const plan = c.plan;
    const free = host.root ? host.diskSpace(host.root)?.free : undefined;
    const noSpace = plan && free !== undefined && plan.bytes > free;
    const damaged = c.backup.damaged > 0;
    const infoRows: Row[] = [];
    if (restoreError) infoRows.push({ icon: 'alert', text: restoreError, tone: 'warning' });
    if (damaged) infoRows.push({ icon: 'alert', text: tn(c.backup.damaged, '{n} fichier de cette sauvegarde est illisible', '{n} fichiers de cette sauvegarde sont illisibles'), detail: t('La restauration s’arrête sur le premier, sans rien poser'), tone: 'error', badges: [t('Bloquant')] });
    if (noSpace) infoRows.push({ icon: 'alert', text: t('Il manque {size} sur le disque de la borne', { size: formatSize(plan!.bytes - free!) }), tone: 'error', badges: [t('Bloquant')] });
    infoRows.push({ icon: 'info', text: t('L’état actuel est mis à la corbeille avant d’écrire'), detail: t('« Annuler cette restauration » le remet, tant qu’il est dans la corbeille'), tone: 'info' });
    sections.push({ rows: infoRows });
    const nothing = !plan || plan.files.length === 0;
    const blocked = damaged ? t('Sauvegarde endommagée') : noSpace ? t('Pas assez de place sur le disque de la borne') : nothing ? t('Aucun changement sélectionné') : undefined;
    actions.push(
      blocked
        ? { label: t('Restaurer la sélection'), detail: blocked, icon: 'restore', tone: 'quiet', run: () => undefined }
        : {
            label: t('Restaurer la sélection'),
            detail: t('{size} à copier · Cyber Pinball redémarre à la fin', { size: formatSize(plan!.bytes) }),
            icon: 'restore',
            tone: 'ok',
            run: () => (!c.same && c.identity === 'take' ? host.library.openCustom(buildConfirmIdentity, 0) : void startRestore()),
          },
      backAction(() => host.library.openCustom(buildRestoreList, 0)),
    );
    return {
      heading: t('Vérifier la restauration'),
      icon: 'restore',
      subheading: c.same
        ? t('{level} du {when} · cette borne · rien n’a encore changé', { level: levelLabel(c.backup.manifest.level), when: shortWhen(c.backup.manifest.createdAt) })
        : t('« {name} » · {level} du {when} · une autre borne que celle-ci', { name: c.backup.manifest.cabinet.name, level: levelLabel(c.backup.manifest.level).toLowerCase(), when: shortWhen(c.backup.manifest.createdAt) }),
      hint: t('Flippers ou Tab : choisir · Start ou Entrée : inclure ou exclure · Exit ou Échap : revenir · souris'),
      sections,
      actions,
      back: () => host.library.openCustom(buildRestoreList, 0),
    };
  }

  function buildConfirmIdentity(): Built {
    const name = choice?.backup.manifest.cabinet.name ?? '';
    return {
      heading: t('Remplacer « {name} » sur le réseau ?', { name }),
      icon: 'lock',
      sections: [{ rows: [{ icon: 'alert', text: t('Cette borne prendra la place de « {name} » pour ses amis', { name }), detail: t('L’ancienne ne doit plus se connecter : deux bornes avec la même identité se disputeraient les amis'), tone: 'warning' }] }],
      actions: [backAction(() => host.library.openCustom(buildPlan, 0)), { label: t('Oui, remplacer et restaurer'), icon: 'restore', run: () => void startRestore() }],
      back: () => host.library.openCustom(buildPlan, 0),
    };
  }

  async function startRestore(): Promise<void> {
    const c = choice;
    if (!c?.plan || job) return;
    job = { kind: 'restore', where: whereOf(c.backup), meter: createTransferMeter(), stop: false };
    host.library.openCustom(buildRestoring, 0);
    const outcome = await prepareRestore(c.plan, host.dataDir, {
      now,
      shouldStop: () => Boolean(job?.stop),
      onProgress: (p) => {
        if (!job) return;
        job.restore = p;
        job.rate = { remaining: job.meter.update(p.doneBytes, p.totalBytes).remaining };
        refresh();
      },
    });
    job = undefined;
    if (outcome.ok) {
      host.library.openCustom(buildRelaunching, 0);
      host.broadcast();
      host.relaunch();
      return;
    }
    restoreError = outcome.reason === 'stopped' ? t('Restauration arrêtée : rien n’a changé') : t('Restauration impossible : {error}. Rien n’a changé.', { error: outcome.error ?? '' });
    host.library.openCustom(buildPlan, 0);
    host.notify?.(restoreError);
  }

  function buildRestoring(): Built {
    if (!job) return buildPlan();
    const p = job.restore;
    return {
      heading: t('Restauration en cours'),
      icon: 'restore',
      subheading: jobLine(),
      sections: [
        {
          rows: [
            { text: t('Copie depuis la sauvegarde, vérifiée fichier par fichier'), detail: p ? t('{done} sur {total} · {size} sur {all}', { done: p.doneFiles, total: tn(p.totalFiles, '{n} fichier', '{n} fichiers'), size: formatSize(p.doneBytes, true), all: formatSize(p.totalBytes) }) : t('Préparation…'), tone: 'info', progress: { value: jobValue(), tone: 'info' } },
            { text: t('Redémarrage de Cyber Pinball, qui pose les fichiers'), detail: t('En attente'), tone: 'quiet', progress: { value: 0, tone: 'quiet' } },
          ],
        },
        { rows: [{ icon: 'alert', text: t('Ne débranchez pas la clé pendant la copie'), detail: t('Rien n’est encore changé : coupée en route, la restauration n’a simplement pas lieu'), tone: 'warning' }] },
      ],
      actions: [job.stop ? { label: t('Arrêt demandé'), icon: 'close', tone: 'quiet', run: () => undefined } : { label: t('Arrêter la restauration'), detail: t('Rien n’a encore changé'), icon: 'close', run: stopJob }],
      back: () => undefined,
    };
  }

  function buildRelaunching(): Built {
    return { heading: t('Redémarrage…'), icon: 'restore', sections: [{ rows: [{ text: t('Cyber Pinball redémarre pour poser les fichiers restaurés'), tone: 'info', progress: { busy: true } }] }], actions: [], back: () => undefined };
  }

  async function undoLast(): Promise<void> {
    if (!prepareUndoLastRestore(host.dataDir, now())) return;
    host.library.openCustom(buildRelaunching, 0);
    host.broadcast();
    host.relaunch();
  }

  /** Lignes du constat après un redémarrage qui a posé une restauration (ou son annulation). */
  function restoredRows(last: NonNullable<ReturnType<typeof loadLastRestore>>): Row[] {
    const title =
      last.kind === 'undo'
        ? t('Restauration annulée : l’état d’avant est revenu')
        : t('Restauration terminée : {level} du {when}', { level: levelLabel(last.label.level).toLowerCase(), when: shortWhen(last.label.createdAt) });
    const rows: Row[] = [{ text: title, detail: tn(last.put.length, '{n} fichier posé et vérifié', '{n} fichiers posés et vérifiés'), tone: last.failed.length ? 'warning' : 'ok', badges: [last.failed.length ? t('À vérifier') : t('Vérifié')] }];
    if (last.failed.length) rows.push({ text: tn(last.failed.length, '{n} fichier n’a pas pu être posé', '{n} fichiers n’ont pas pu être posés'), detail: t('Leur ancienne version est restée : {file}', { file: last.failed[0]!.rel }), tone: 'warning' });
    return rows;
  }

  // ---------- Sauvegarde automatique ----------

  function openAuto(): void {
    host.library.openCustom(buildAuto, 0);
  }

  function buildAuto(): Built {
    const s = settings();
    const choices: AutoBackup[] = ['off', 'weekly', 'nightly'];
    const label: Record<AutoBackup, string> = { off: t('Désactivée'), weekly: t('Chaque semaine, le dimanche à 4 h'), nightly: t('Chaque nuit, à 4 h') };
    const local = localBackupDir(host.dataDir);
    const localLast = listBackups(local, false).find((b) => b.manifest.auto && b.manifest.complete);
    const drive = destinationDrive();
    const rows: Row[] = choices.map((a, i) => ({ action: i, pick: true, current: s.auto === a, text: label[a], ...(a === 'off' ? { detail: t('Seulement à la demande') } : {}), ...(s.auto === a ? { badges: [t('Choisi')] } : {}) }));
    return {
      heading: t('Sauvegarde automatique'),
      icon: 'clock',
      subheading: t('Réglages et scores'),
      lead: t('Les réglages et les scores, quand la borne est libre ; une heure manquée (PC éteint) est rattrapée au démarrage suivant. Pour les tables, « Sauvegarder maintenant ».'),
      hint: t('Flippers ou Tab : choisir · Start ou Entrée : choisir · Exit ou Échap : revenir · souris'),
      sections: [
        { title: t('Quand'), options: true, rows },
        {
          title: t('Où'),
          rows: [
            { icon: 'drive', text: t('Sur cette borne · les {n} dernières gardées', { n: KEEP_AUTO }), detail: localLast ? t('Dernière : {when} · ne protège pas d’une panne du disque', { when: when(localLast.manifest.createdAt) }) : t('Ne protège pas d’une panne du disque'), tone: localLast ? 'ok' : 'quiet', ...(localLast ? { badges: [t('Vérifiée')] } : {}) },
            s.copyToDestination
              ? { icon: 'usb', text: s.destination ? t('Copiée sur {where} dès qu’elle est là', { where: s.destination.label ?? s.destination.path }) : t('Copiée sur la destination choisie dès qu’elle est là'), detail: s.lastCopy ? t('Dernière copie : {when} ; reconnue même si sa lettre change', { when: when(s.lastCopy) }) : drive ? t('Prochaine copie avec la prochaine sauvegarde') : t('En attente de la destination'), tone: s.lastCopy ? 'ok' : 'quiet', ...(s.lastCopy ? { badges: [t('Copiée')] } : {}) }
              : { icon: 'usb', text: t('Pas de copie sur une clé ou un disque'), tone: 'quiet' },
          ],
        },
      ],
      actions: [
        ...choices.map((a) => ({ label: label[a], key: `auto:${a}`, run: () => {
          save({ ...settings(), auto: a });
          host.library.openCustom(buildAuto, choices.indexOf(a));
        } })),
        { label: s.copyToDestination ? t('Copier aussi sur la destination : oui') : t('Copier aussi sur la destination : non'), detail: t('La clé ou le disque choisi dans « Destination »'), icon: 'usb', run: () => {
          save({ ...settings(), copyToDestination: !settings().copyToDestination });
          host.library.openCustom(buildAuto, 3);
        } },
        backAction(() => host.library.openCustom(buildMain, 0)),
      ],
      back: () => host.library.openCustom(buildMain, 0),
    };
  }

  /**
   * Appelée chaque minute : une sauvegarde automatique due se fait sur la borne quand elle est
   * libre, puis est copiée sur la destination si elle est branchée (et dès qu'elle l'est).
   */
  async function autoTick(free: boolean): Promise<void> {
    if (job || !host.root || !free) return;
    const s = settings();
    const at = now();
    if (autoBackupDue(s, at)) {
      // Sur la borne : <data>\sauvegardes, la destination des sauvegardes automatiques.
      const outcome = await runBackup({ root: host.root, dataDir: host.dataDir, dest: localBackupDir(host.dataDir), level: 'settings', cabinet: identity(), version: host.version, auto: true, now });
      if (outcome.ok) {
        save({ ...settings(), lastAuto: at.toISOString(), last: { at: at.toISOString(), level: 'settings', where: t('cette borne') } });
        try {
          pruneBackups(localBackupDir(host.dataDir), identity().id, KEEP_AUTO);
        } catch {
          // rangement plus tard
        }
      }
    }
    const after = settings();
    if (after.auto !== 'off' && after.copyToDestination && after.destination && after.lastAuto && (!after.lastCopy || after.lastCopy < after.lastAuto)) {
      await readDrives();
      const drive = destinationDrive();
      if (!drive) return;
      const done = await startBackup('settings', drive, true);
      if (done?.ok) {
        save({ ...settings(), lastCopy: now().toISOString() });
        host.notify?.(t('Réglages et scores copiés sur {where}', { where: driveName(drive) }));
      }
    }
  }

  // ---------- Entrée du menu système ----------

  const systemItem: ProvidedSystemItem = {
    get detail() {
      if (job) return `${job.kind === 'backup' ? t('Sauvegarde en cours') : t('Restauration en cours')} · ${jobLine()}`;
      const s = settings();
      return s.last ? t('Dernière : {when} · {level}', { when: shortWhen(s.last.at), level: levelLabel(s.last.level).toLowerCase() }) : t('Sur une clé USB ou un disque : réglages, scores, tables');
    },
    run: open,
  };

  /** Texte du bandeau au démarrage qui suit une restauration (ou son annulation) ; undefined sinon. */
  function restoredNotice(): string | undefined {
    const last = loadLastRestore(host.dataDir);
    if (!last || last.shown) return undefined;
    return last.kind === 'undo' ? t('Restauration annulée : l’état d’avant est revenu') : t('Restauration terminée : le constat est dans Sauvegardes');
  }

  /**
   * Nouvel essai des fichiers qu'une restauration n'a pas pu poser au démarrage (encore ouverts par
   * l'ancien processus) : une fois celui-ci fermé, ils sont posés ; ceux qui restent sont dits.
   */
  function retryPendingRestore(): void {
    const pending = loadPendingRestore(host.dataDir);
    if (!pending?.retry || !host.root || job) return;
    const applied = applyPendingRestore(host.root, host.dataDir, host.trashRoot, now());
    if (!applied) return;
    console.log(`Restauration : nouvel essai, ${applied.failed.length} fichier(s) encore impossible(s) à poser.`); // i18n-ignore : journal
    if (applied.failed.length && !loadPendingRestore(host.dataDir)) host.notify?.(tn(applied.failed.length, '{n} fichier n’a pas pu être posé', '{n} fichiers n’ont pas pu être posés'));
  }

  return { systemItem, open, busy, autoTick, restoredNotice, retryPendingRestore };
}

/** Pour les tests : le dernier résultat d'un niveau, sans écran. */
export type BackupsMenu = ReturnType<typeof createBackupsMenu>;
