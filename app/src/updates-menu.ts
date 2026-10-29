// Menu système > « Cyber Pinball » > « Mise à jour de Cyber Pinball » : recherche de la dernière version
// publiée, ses nouveautés, puis, à la demande seulement, téléchargement vérifié et
// installation (packages/core/src/update.ts).
//
// Une recherche discrète part aussi en arrière-plan : dès le démarrage, puis toutes les 6 h
// tant que Cyber Pinball tourne (toutes les 5 min tant qu'elle échoue : réseau pas encore prêt
// au démarrage de la borne). Elle ne télécharge rien, elle signale seulement une version
// disponible par une pastille rouge sur la roue dentée et sur cette entrée (attention), sans
// qu'il faille ouvrir le menu. Sans réseau, rien ne s'affiche.
//
// L'installeur, lancé en mode /MAJ, attend que Cyber Pinball se ferme, remplace app\
// puis le relance : au démarrage suivant, le menu dit si la nouvelle version est là.
// Mise à jour légère (même socle : Electron et l'exécutable inchangés) : le paquet de
// l'application est téléchargé, vérifié et déplié à côté, puis maj-legere.ts le met en place
// une fois Cyber Pinball fermé et le relance. Les préversions se règlent ici aussi.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type DownloadManager,
  checkForUpdate,
  downloadAppPackage,
  downloadUpdate,
  formatDate,
  formatMebibytes,
  installedSocle,
  layoutOf,
  loadPrereleaseSetting,
  recordPendingUpdate,
  relaunchArguments,
  removePreviousApp,
  savePrereleaseSetting,
  stagedAppDir,
  t,
  takeUpdateOutcome,
  unpackAppPackage,
  updateDownloadsDir,
  updateInstallerArguments,
  updatePlan,
  missedReleases,
  type LightUpdateJob,
  type Locations,
  type UpdateManifest,
  type UpdatePlan,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';

export interface UpdatesHost {
  loc: Locations;
  /** Version qui tourne (app.getVersion()). */
  version: string;
  /** Dossier de CyberPinball.exe. */
  exeDir: string;
  /** Dossier de l'application (app.getAppPath()) : app\resources\app d'une installation. */
  appDir: string;
  /** Hors écran (essais) : installeur silencieux, aucune fenêtre. */
  silent: boolean;
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  broadcast(): void;
  /** Ferme Cyber Pinball pour laisser l'installeur remplacer ses fichiers. */
  quit(): void;
  /** Recherche en arrière-plan : faux pendant les essais hors écran sans site d'essai. */
  background: boolean;
  /** Gestionnaire de téléchargements : le téléchargement de la mise à jour y est suivi. */
  downloads?: DownloadManager;
}

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date'; latest: UpdateManifest }
  | { kind: 'available'; latest: UpdateManifest }
  | { kind: 'downloading'; latest: UpdateManifest; received: number; total: number; abort: AbortController }
  | { kind: 'installing'; latest: UpdateManifest; light: boolean }
  | { kind: 'error'; message: string; latest?: UpdateManifest };

const leadInstall = () =>
  t('Tables, médias, configuration et données ne sont pas touchés. Pendant l’installation (une minute environ), Cyber Pinball se ferme puis redémarre tout seul ; en cas d’échec, la version actuelle reste en place.');
const leadLight = () =>
  t('Tables, médias, configuration et données ne sont pas touchés. Cyber Pinball se ferme, remplace ses fichiers et redémarre en quelques secondes ; en cas d’échec, la version actuelle reste en place.');

/** Délai entre l'écran « Installation » et la fermeture : le temps de le lire. */
const QUIT_DELAY_MS = 2500;
/** Première recherche en arrière-plan : dès que le menu est affiché. */
const FIRST_CHECK_MS = 2_000;
/** Puis toutes les 6 h tant que l'application tourne ; toutes les 5 min tant qu'elle échoue. */
const CHECK_EVERY_MS = 6 * 3600_000;
const RETRY_MS = 5 * 60_000;
/** Un résultat plus récent que cela s'affiche tel quel à l'ouverture de l'entrée. */
const FRESH_MS = 10 * 60_000;

export function createUpdatesMenu(host: UpdatesHost) {
  let state: State = { kind: 'idle' };
  /** Heure du dernier résultat (à jour ou disponible). */
  let checkedAt = 0;
  const date = (iso: string) => formatDate(iso);

  /**
   * L'application tourne installée : CyberPinball.exe dans le dossier app\ d'une racine, qu'il
   * y ait été posé par l'installeur ou par npm run deployer (sans installation.ini). Lancée
   * depuis les sources (npm start), on peut chercher mais pas installer.
   */
  function installedRoot(): string | undefined {
    // Captures et essais, dans un bac à sable seulement : sa racine passe pour une installation.
    if (process.env.CYBERPINBALL_HOME && process.env.CYBERPINBALL_MAJ_INSTALLEE === '1') return host.loc.root;
    if (path.basename(host.exeDir).toLowerCase() !== 'app' || !fs.existsSync(path.join(host.exeDir, 'CyberPinball.exe'))) return undefined;
    return path.dirname(host.exeDir);
  }

  /** L'application installée peut être remplacée par le paquet léger : celle de app\resources\app, à côté de CyberPinball.exe. */
  const swappable = () => path.resolve(host.appDir).toLowerCase() === path.join(host.exeDir, 'resources', 'app').toLowerCase();

  /** Socle de l'application qui tourne, s'il peut recevoir la mise à jour légère. */
  const socle = () => (swappable() ? installedSocle(host.appDir) : undefined);

  const prereleases = () => loadPrereleaseSetting(host.loc.dataDir);
  const plan = (latest: UpdateManifest): UpdatePlan => updatePlan(latest, host.version, socle());

  /** Préversions reçues ou non : le choix est gardé, puis une recherche repart. */
  function togglePrereleases(): void {
    try {
      savePrereleaseSetting(host.loc.dataDir, !prereleases());
    } catch (error) {
      state = { kind: 'error', message: (error as Error).message };
      return show();
    }
    void check();
  }

  const prereleaseAction = (): Action =>
    prereleases()
      ? { label: t('Préversions : reçues'), detail: t('Les versions d’essai sont proposées aussi ; choisir pour ne plus les recevoir'), icon: 'flask', run: togglePrereleases }
      : { label: t('Préversions : non reçues'), detail: t('Choisir pour recevoir aussi les versions d’essai (0.2.0-essai.1…)'), icon: 'flask', run: togglePrereleases };

  const systemItem: ProvidedSystemItem = {
    /** Pastille rouge : une version plus récente attend l'utilisateur. */
    get attention() {
      return state.kind === 'available';
    },
    get detail() {
      const installed = prereleases() ? t('Version {version} installée, préversions reçues', { version: host.version }) : t('Version {version} installée', { version: host.version });
      if (state.kind === 'available' || state.kind === 'downloading') return t('{installed} · {version} disponible', { installed, version: state.latest.version });
      if (state.kind === 'up-to-date') return t('{installed}, la dernière', { installed });
      return t('{installed} · chercher une version plus récente', { installed });
    },
    run: () => open(true),
  };

  function show(at = 0): void {
    host.library.openCustom(build, at);
  }

  /**
   * Ouvre l'écran. Un résultat récent (recherche en arrière-plan) s'affiche aussitôt : une
   * version disponible montre ses nouveautés et « Mettre à jour maintenant », à un bouton.
   * Sinon, une recherche part.
   */
  function open(search: boolean): void {
    const fresh = (state.kind === 'available' || state.kind === 'up-to-date') && Date.now() - checkedAt < FRESH_MS;
    if (search && !fresh && state.kind !== 'downloading' && state.kind !== 'installing' && state.kind !== 'checking') void check();
    else show();
  }

  /** Une recherche discrète peut remplacer l'état : rien n'est en cours (recherche, téléchargement, installation). */
  const quietAllowed = () => state.kind === 'idle' || state.kind === 'up-to-date' || state.kind === 'available' || state.kind === 'error';

  /**
   * Recherche discrète : aucun écran, aucune erreur affichée ; seul l'état (et la pastille)
   * change. Vrai si elle a abouti, ou si elle n'avait pas à se faire (opération en cours).
   * Une erreur d'une recherche faite à la main ne l'arrête pas : elle la remplace si elle aboutit.
   */
  async function checkQuietly(): Promise<boolean> {
    if (!quietAllowed()) return true;
    try {
      const result = await checkForUpdate({ current: host.version, prereleases: prereleases() });
      // L'utilisateur a pu lancer une opération entre-temps : son état prime.
      if (!quietAllowed()) return true;
      state = result.status === 'available' ? { kind: 'available', latest: result.latest } : { kind: 'up-to-date', latest: result.latest };
      checkedAt = Date.now();
      console.log(`Mise à jour (arrière-plan) : ${describe()}`);
      host.broadcast();
      return true;
    } catch (error) {
      console.log(`Mise à jour (arrière-plan) : pas de réponse (${(error as Error).message}) ; nouvel essai dans 5 min`); // i18n-ignore : journal
      return false;
    }
  }

  /** Recherches en arrière-plan, du démarrage à la fermeture : chacune programme la suivante. */
  function startBackgroundChecks(): void {
    if (!host.background) return;
    const next = (ms: number) => {
      const timer = setTimeout(async () => next((await checkQuietly()) ? CHECK_EVERY_MS : RETRY_MS), ms);
      timer.unref?.();
    };
    next(FIRST_CHECK_MS);
  }

  async function check(): Promise<void> {
    state = { kind: 'checking' };
    show();
    try {
      const result = await checkForUpdate({ current: host.version, prereleases: prereleases() });
      state = result.status === 'available' ? { kind: 'available', latest: result.latest } : { kind: 'up-to-date', latest: result.latest };
      checkedAt = Date.now();
    } catch (error) {
      state = { kind: 'error', message: (error as Error).message };
    }
    console.log(`Mise à jour : ${describe()}`);
    show();
  }

  async function download(latest: UpdateManifest): Promise<void> {
    const root = installedRoot();
    const how = plan(latest);
    if (!root || !host.loc.root || how.kind === 'none') return;
    const abort = new AbortController();
    state = { kind: 'downloading', latest, received: 0, total: how.asset.size, abort };
    show();
    let shown = 0;
    const dir = updateDownloadsDir(layoutOf(host.loc.root).downloads);
    // Suivi dans le gestionnaire de téléchargements ; « Revenir à » ramène à cet écran.
    const job = host.downloads?.track({
      id: `maj-${latest.version}`,
      kind: 'update',
      title: t('Cyber Pinball {version}', { version: latest.version }),
      source: { kind: 'http', label: 'github.com' },
      files: [{ ref: how.asset.url, name: path.basename(new URL(how.asset.url).pathname), bytes: how.asset.size, part: path.join(dir, `${path.basename(new URL(how.asset.url).pathname)}.part`) }],
      back: { screen: 'updates' },
      resumable: true,
    });
    const progress = {
      signal: abort.signal,
      onProgress: (received: number, total: number) => {
        job?.progress(received, total);
        if (state.kind !== 'downloading') return;
        state = { ...state, received, total };
        // Quelques images par seconde suffisent.
        if (Date.now() - shown > 250 || received === total) {
          shown = Date.now();
          host.broadcast();
        }
      },
    };
    try {
      if (how.kind === 'light') {
        const file = await downloadAppPackage(latest, dir, progress);
        job?.done();
        const staged = stagedAppDir(dir, latest);
        unpackAppPackage(file, staged, latest);
        installLight(latest, staged, dir);
      } else {
        const installer = await downloadUpdate(latest, dir, progress);
        job?.done();
        install(latest, installer, root, how.installs);
      }
    } catch (error) {
      if (abort.signal.aborted) job?.cancel();
      // Un partiel gardé : une coupure, que « Réessayer le téléchargement » reprendra là où elle s'est arrêtée.
      else job?.fail(fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.part')) ? 'network' : 'http', (error as Error).message);
      state = abort.signal.aborted ? { kind: 'available', latest } : { kind: 'error', message: (error as Error).message, latest };
      console.log(`Mise à jour : ${describe()}`);
      show();
    }
  }

  function install(latest: UpdateManifest, installer: string, root: string, installs: string): void {
    state = { kind: 'installing', latest, light: false };
    show();
    recordPendingUpdate(host.loc.dataDir, { from: host.version, to: installs, started: new Date().toISOString(), installer });
    const args = updateInstallerArguments(root, { silent: host.silent });
    console.log(`Mise à jour : ${installer} ${args.join(' ')}`);
    try {
      // Détaché : il survit à la fermeture de Cyber Pinball, qu'il attend avant de remplacer app\.
      const child = spawn(installer, args, {
        detached: true,
        stdio: 'ignore',
        // Hors de app\ : un dossier de travail ne se renomme pas, et Cyber Pinball tourne souvent
        // depuis app\ (raccourci). L'installeur hériterait de ce dossier et ne pourrait plus le remplacer.
        cwd: path.dirname(installer),
        // Hors écran, l'installeur est silencieux (/S) : aucune fenêtre ne s'ouvre.
        // L'installeur relance Cyber Pinball avec les mêmes arguments (données de Chromium, configuration…).
        env: { ...process.env, CYBERPINBALL_MAJ_ARGS: relaunchArguments(process.argv.slice(1)) },
      });
      child.on('error', (error) => {
        takeUpdateOutcome(host.loc.dataDir, host.version);
        state = { kind: 'error', message: t('L’installeur n’a pas démarré : {message}', { message: error.message }), latest };
        show();
      });
      child.unref();
    } catch (error) {
      takeUpdateOutcome(host.loc.dataDir, host.version);
      state = { kind: 'error', message: t('L’installeur n’a pas démarré : {message}', { message: (error as Error).message }), latest };
      return show();
    }
    setTimeout(() => {
      if (state.kind === 'installing') host.quit();
    }, QUIT_DELAY_MS);
  }

  /**
   * Mise à jour légère : maj-legere.js de la nouvelle version, lancé par CyberPinball.exe en mode
   * Node, attend la fermeture, remplace app\resources\app puis relance Cyber Pinball.
   */
  function installLight(latest: UpdateManifest, staged: string, dir: string): void {
    state = { kind: 'installing', latest, light: true };
    show();
    const fail = (message: string) => {
      takeUpdateOutcome(host.loc.dataDir, host.version);
      state = { kind: 'error', message: t('La mise à jour légère n’a pas démarré : {message}', { message }), latest };
      show();
    };
    try {
      // Hors du paquet déplié : il est renommé pendant la mise en place.
      const helper = path.join(dir, 'maj-legere.js');
      fs.copyFileSync(path.join(staged, 'dist', 'maj-legere.js'), helper);
      const job: LightUpdateJob = {
        pid: process.pid,
        appDir: host.appDir,
        staged,
        version: latest.version,
        exe: process.execPath,
        // Relance avec les mêmes arguments (données de Chromium, configuration…).
        args: process.argv.slice(1),
        cwd: process.cwd(),
        // Dans un bac à sable (essais), « Programmes et fonctionnalités » n'est pas touché.
        registry: !process.env.CYBERPINBALL_HOME,
        log: path.join(dir, 'maj-legere.txt'),
      };
      const jobFile = path.join(dir, 'maj-legere.json');
      fs.writeFileSync(jobFile, `${JSON.stringify(job, null, 2)}\n`, 'utf8');
      recordPendingUpdate(host.loc.dataDir, { from: host.version, to: latest.version, started: new Date().toISOString(), installer: staged });
      console.log(`Mise à jour légère : ${helper} ${jobFile}`);
      const child = spawn(process.execPath, [helper, jobFile], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        // Hors de app\ : rien ne doit tenir le dossier à remplacer.
        cwd: dir,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
      child.on('error', (error) => fail(error.message));
      child.unref();
    } catch (error) {
      return fail((error as Error).message);
    }
    setTimeout(() => {
      if (state.kind === 'installing') host.quit();
    }, QUIT_DELAY_MS);
  }

  /** Pour le journal de la console : reste en français. */
  function describe(): string {
    switch (state.kind) {
      case 'up-to-date':
        return `à jour (${host.version} ; dernière publiée : ${state.latest.version})`; // i18n-ignore : journal
      case 'available':
        return `${state.latest.version} disponible (installée : ${host.version})`; // i18n-ignore : journal
      case 'error':
        return `erreur : ${state.message}`; // i18n-ignore : journal
      default:
        return state.kind;
    }
  }

  /** Nouveautés de chaque version manquée, la plus récente d'abord : une section par version. */
  function notesSections(latest: UpdateManifest): Section[] {
    const releases = missedReleases(latest, host.version);
    return releases.map((release) => ({
      title: releases.length > 1 ? t('Nouveautés de la {version}', { version: release.version }) : t('Nouveautés'),
      rows: release.notes.length ? release.notes.map((text) => ({ text })) : [{ text: t('Pas de liste des nouveautés pour cette version.'), tone: 'quiet' as const }],
    }));
  }

  /** Chaque état de l'écran garde l'icône de l'entrée du menu système. */
  function build(): Built {
    return { icon: 'upgrade', ...buildState() };
  }

  function buildState(): Built {
    const back = () => host.library.openSystem();
    const heading = t('Mise à jour de Cyber Pinball');
    const subheading = t('Version installée : {version}', { version: host.version });
    const retour: Action = { label: t('Retour'), icon: 'back', run: back };
    const root = installedRoot();

    switch (state.kind) {
      case 'idle':
      case 'checking':
        return {
          heading,
          subheading,
          lead: t('Recherche de la dernière version publiée…'),
          sections: [],
          actions: [retour],
          back,
        };
      case 'up-to-date':
        return {
          heading,
          subheading,
          sections: [
            {
              rows: [{ text: t('Cyber Pinball est à jour'), detail: t('Dernière version publiée : {version}, le {date}', { version: state.latest.version, date: date(state.latest.date) }), tone: 'ok' }],
            },
          ],
          actions: [{ label: t('Rechercher à nouveau'), icon: 'refresh', run: () => void check() }, prereleaseAction(), retour],
          back,
        };
      case 'available': {
        const latest = state.latest;
        const how = plan(latest);
        const actions: Action[] = [];
        const checked = t('Vérifié avant l’installation : flux signé par l’éditeur, empreinte SHA-256');
        const download_: Row[] = [
          how.kind === 'light'
            ? { text: t('Mise à jour légère, {size}', { size: formatMebibytes(how.asset.size) }), detail: t('L’application seule, sans réinstallation. {checked}', { checked }) }
            : how.kind === 'installer' && how.thenLight
              ? { text: t('Installeur de la {installs}, {size}', { installs: how.installs, size: formatMebibytes(how.asset.size) }), detail: t('Puis la mise à jour légère vers {version}, proposée au redémarrage. {checked}', { version: latest.version, checked }) }
              : how.kind === 'installer'
                ? { text: t('Installeur, {size}', { size: formatMebibytes(how.asset.size) }), detail: checked }
                : { text: t('Cette version demande une réinstallation, et son installeur n’est pas encore publié'), detail: t('Installeur publié : {installs}', { installs: how.installs }), tone: 'warning' },
        ];
        if (root && how.kind !== 'none') {
          actions.push({
            label: t('Mettre à jour maintenant'),
            detail: how.kind === 'light' ? t('Télécharge {version} ; Cyber Pinball redémarre en quelques secondes', { version: latest.version }) : t('Télécharge et installe {version} ; Cyber Pinball redémarre', { version: how.installs }),
            tone: 'ok',
            icon: 'download',
            run: () => void download(latest),
          });
        } else if (!root) {
          download_.push({
            text: t('Lancé depuis les sources : pas d’installation possible d’ici'),
            detail: t('Mettre à jour le dépôt (git pull), puis npm run build ; ou installer avec l’installeur'),
            tone: 'warning',
          });
        }
        actions.push(prereleaseAction(), { label: t('Plus tard'), icon: 'back', run: back });
        return {
          heading: t('Cyber Pinball {version} est disponible', { version: latest.version }),
          subheading: t('{subheading} · publiée le {date}', { subheading, date: date(latest.date) }),
          lead: !root || how.kind === 'none' ? undefined : how.kind === 'light' ? leadLight() : leadInstall(),
          sections: [...notesSections(latest), { title: t('Téléchargement'), rows: download_ }],
          actions,
          back,
        };
      }
      case 'downloading': {
        const { received, total, latest, abort } = state;
        const percent = total ? Math.floor((received / total) * 100) : 0;
        return {
          heading: t('Téléchargement de Cyber Pinball {version}', { version: latest.version }),
          subheading,
          lead:
            plan(latest).kind === 'light'
              ? t('Une fois vérifiée, la mise à jour se met en place : Cyber Pinball se ferme puis redémarre.')
              : t('Une fois vérifié, l’installeur se lance : Cyber Pinball se ferme puis redémarre.'),
          sections: [{ rows: [{ text: t('{received} sur {total}', { received: formatMebibytes(received), total: formatMebibytes(total) }), detail: t('{percent} %', { percent }), tone: 'info' }] }],
          actions: [{ label: t('Annuler'), detail: t('Le téléchargement s’arrête ; rien n’est installé'), icon: 'close', run: () => abort.abort() }],
          back: () => abort.abort(),
        };
      }
      case 'installing':
        return {
          heading: t('Installation de Cyber Pinball {version}', { version: state.latest.version }),
          subheading,
          lead: state.light
            ? t('Cyber Pinball se ferme, remplace ses fichiers puis redémarre dans quelques secondes.')
            : t('Cyber Pinball se ferme pour laisser l’installeur faire, puis redémarre dans une minute environ.'),
          sections: [],
          actions: [],
          back: () => undefined,
        };
      case 'error':
        return {
          heading: t('Mise à jour impossible'),
          subheading,
          sections: [{ rows: [{ text: state.message, tone: 'error' }] }],
          actions: [
            state.latest
              ? { label: t('Réessayer le téléchargement'), icon: 'download', run: () => void download((state as { latest: UpdateManifest }).latest) }
              : { label: t('Réessayer'), icon: 'refresh', run: () => void check() },
            prereleaseAction(),
            retour,
          ],
          back,
        };
    }
  }

  /**
   * Au démarrage : constat de la mise à jour lancée avant la fermeture (version attendue
   * là, ou ancienne version restée en place). Undefined s'il n'y en avait pas.
   */
  function startupNotice(): string | undefined {
    // Reste d'une mise à jour légère dont l'ancienne version était encore tenue à la mise en place.
    if (swappable() && fs.existsSync(`${host.appDir}.precedente`)) console.log(`Mise à jour légère : ancienne version ${removePreviousApp(host.appDir) ? 'retirée' : 'toujours tenue'}.`); // i18n-ignore : journal
    const outcome = takeUpdateOutcome(host.loc.dataDir, host.version);
    if (!outcome) return undefined;
    const text =
      outcome.kind === 'installed'
        ? t('Cyber Pinball {to} est installé (avant : {from}).', { to: outcome.to, from: outcome.from })
        : t('La mise à jour vers {to} n’a pas abouti : la version {current} est restée en place.', { to: outcome.to, current: outcome.current });
    console.log(`Mise à jour : ${text}`);
    return text;
  }

  return { systemItem, startupNotice, startBackgroundChecks };
}
