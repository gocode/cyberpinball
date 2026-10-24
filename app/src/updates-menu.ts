// Menu système > « Mise à jour de Cyber Pinball » : recherche de la dernière version
// publiée, ses nouveautés, puis, à la demande seulement, téléchargement vérifié et
// installation. Rien ne se fait d'office (packages/core/src/update.ts).
//
// L'installeur, lancé en mode /MAJ, attend que Cyber Pinball se ferme, remplace app\
// puis le relance : au démarrage suivant, le menu dit si la nouvelle version est là.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  checkForUpdate,
  downloadUpdate,
  formatMebibytes,
  layoutOf,
  recordPendingUpdate,
  relaunchArguments,
  takeUpdateOutcome,
  updateDownloadsDir,
  updateInstallerArguments,
  type Locations,
  type UpdateManifest,
} from '@cyberpinball/core';
import type { Action, Built, Row, SystemItem } from './library';

export interface UpdatesHost {
  loc: Locations;
  /** Version qui tourne (app.getVersion()). */
  version: string;
  /** Dossier de CyberPinball.exe. */
  exeDir: string;
  /** Hors écran (essais) : installeur silencieux, aucune fenêtre. */
  silent: boolean;
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  broadcast(): void;
  /** Ferme Cyber Pinball pour laisser l'installeur remplacer ses fichiers. */
  quit(): void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date'; latest: UpdateManifest }
  | { kind: 'available'; latest: UpdateManifest }
  | { kind: 'downloading'; latest: UpdateManifest; received: number; total: number; abort: AbortController }
  | { kind: 'installing'; latest: UpdateManifest }
  | { kind: 'error'; message: string; latest?: UpdateManifest };

const LEAD_INSTALL =
  'Tables, médias, configuration et données ne sont pas touchés. Pendant l’installation (une minute environ), Cyber Pinball se ferme puis redémarre tout seul ; en cas d’échec, la version actuelle reste en place.';

/** Délai entre l'écran « Installation » et la fermeture : le temps de le lire. */
const QUIT_DELAY_MS = 2500;

export function createUpdatesMenu(host: UpdatesHost) {
  let state: State = { kind: 'idle' };
  const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' });

  /**
   * L'application tourne depuis une installation (app\ d'une racine, posé par l'installeur) ;
   * sinon (npm start, déploiement de développement), on peut chercher mais pas installer.
   */
  function installedRoot(): string | undefined {
    if (path.basename(host.exeDir).toLowerCase() !== 'app' || !fs.existsSync(path.join(host.exeDir, 'installation.ini'))) return undefined;
    return path.dirname(host.exeDir);
  }

  const systemItem: SystemItem = {
    label: 'Mise à jour de Cyber Pinball',
    get detail() {
      const installed = `Version ${host.version} installée`;
      if (state.kind === 'available' || state.kind === 'downloading') return `${installed} · ${state.latest.version} disponible`;
      if (state.kind === 'up-to-date') return `${installed}, la dernière`;
      return `${installed} · chercher une version plus récente`;
    },
    run: () => open(true),
  };

  function show(at = 0): void {
    host.library.openCustom(build, at);
  }

  /** Ouvre l'écran ; une recherche part si l'on n'en a pas déjà le résultat (ou si on le demande). */
  function open(search: boolean): void {
    if (search && state.kind !== 'downloading' && state.kind !== 'installing' && state.kind !== 'checking') void check();
    else show();
  }

  async function check(): Promise<void> {
    state = { kind: 'checking' };
    show();
    try {
      const result = await checkForUpdate({ current: host.version });
      state = result.status === 'available' ? { kind: 'available', latest: result.latest } : { kind: 'up-to-date', latest: result.latest };
    } catch (error) {
      state = { kind: 'error', message: (error as Error).message };
    }
    console.log(`Mise à jour : ${describe()}`);
    show();
  }

  async function download(latest: UpdateManifest): Promise<void> {
    const root = installedRoot();
    if (!root || !host.loc.root) return;
    const abort = new AbortController();
    state = { kind: 'downloading', latest, received: 0, total: latest.installer.size, abort };
    show();
    let shown = 0;
    try {
      const file = await downloadUpdate(latest, updateDownloadsDir(layoutOf(host.loc.root).downloads), {
        signal: abort.signal,
        onProgress: (received, total) => {
          if (state.kind !== 'downloading') return;
          state = { ...state, received, total };
          // Quelques images par seconde suffisent.
          if (Date.now() - shown > 250 || received === total) {
            shown = Date.now();
            host.broadcast();
          }
        },
      });
      install(latest, file, root);
    } catch (error) {
      state = abort.signal.aborted ? { kind: 'available', latest } : { kind: 'error', message: (error as Error).message, latest };
      console.log(`Mise à jour : ${describe()}`);
      show();
    }
  }

  function install(latest: UpdateManifest, installer: string, root: string): void {
    state = { kind: 'installing', latest };
    show();
    recordPendingUpdate(host.loc.dataDir, { from: host.version, to: latest.version, started: new Date().toISOString(), installer });
    const args = updateInstallerArguments(root, { silent: host.silent });
    console.log(`Mise à jour : ${installer} ${args.join(' ')}`);
    try {
      // Détaché : il survit à la fermeture de Cyber Pinball, qu'il attend avant de remplacer app\.
      const child = spawn(installer, args, {
        detached: true,
        stdio: 'ignore',
        // Hors écran, l'installeur est silencieux (/S) : aucune fenêtre ne s'ouvre.
        // L'installeur relance Cyber Pinball avec les mêmes arguments (données de Chromium, configuration…).
        env: { ...process.env, CYBERPINBALL_MAJ_ARGS: relaunchArguments(process.argv.slice(1)) },
      });
      child.on('error', (error) => {
        takeUpdateOutcome(host.loc.dataDir, host.version);
        state = { kind: 'error', message: `L’installeur n’a pas démarré : ${error.message}`, latest };
        show();
      });
      child.unref();
    } catch (error) {
      takeUpdateOutcome(host.loc.dataDir, host.version);
      state = { kind: 'error', message: `L’installeur n’a pas démarré : ${(error as Error).message}`, latest };
      return show();
    }
    setTimeout(() => {
      if (state.kind === 'installing') host.quit();
    }, QUIT_DELAY_MS);
  }

  function describe(): string {
    switch (state.kind) {
      case 'up-to-date':
        return `à jour (${host.version} ; dernière publiée : ${state.latest.version})`;
      case 'available':
        return `${state.latest.version} disponible (installée : ${host.version})`;
      case 'error':
        return `erreur : ${state.message}`;
      default:
        return state.kind;
    }
  }

  function notesRows(latest: UpdateManifest): Row[] {
    return latest.notes.length ? latest.notes.map((text) => ({ text })) : [{ text: 'Pas de liste des nouveautés pour cette version.', tone: 'quiet' }];
  }

  function build(): Built {
    const back = () => host.library.openSystem();
    const heading = 'Mise à jour de Cyber Pinball';
    const subheading = `Version installée : ${host.version}`;
    const retour: Action = { label: 'Retour', run: back };
    const root = installedRoot();

    switch (state.kind) {
      case 'idle':
      case 'checking':
        return {
          heading,
          subheading,
          lead: 'Recherche de la dernière version publiée…',
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
              rows: [{ text: 'Cyber Pinball est à jour', detail: `Dernière version publiée : ${state.latest.version}, le ${date(state.latest.date)}`, tone: 'ok' }],
            },
          ],
          actions: [{ label: 'Rechercher à nouveau', run: () => void check() }, retour],
          back,
        };
      case 'available': {
        const latest = state.latest;
        const actions: Action[] = [];
        const download_: Row[] = [
          {
            text: `Installeur, ${formatMebibytes(latest.installer.size)}`,
            detail: 'Vérifié avant l’installation : flux signé par l’éditeur, empreinte SHA-256',
          },
        ];
        if (root) {
          actions.push({ label: 'Mettre à jour maintenant', detail: `Télécharge et installe ${latest.version} ; Cyber Pinball redémarre`, tone: 'ok', run: () => void download(latest) });
        } else {
          download_.push({
            text: 'Lancé depuis les sources : pas d’installation possible d’ici',
            detail: 'Mettre à jour le dépôt (git pull), puis npm run build ; ou installer avec l’installeur',
            tone: 'warning',
          });
        }
        actions.push({ label: 'Plus tard', run: back });
        return {
          heading: `Cyber Pinball ${latest.version} est disponible`,
          subheading: `${subheading} · publiée le ${date(latest.date)}`,
          lead: root ? LEAD_INSTALL : undefined,
          sections: [
            { title: 'Nouveautés', rows: notesRows(latest) },
            { title: 'Téléchargement', rows: download_ },
          ],
          actions,
          back,
        };
      }
      case 'downloading': {
        const { received, total, latest, abort } = state;
        const percent = total ? Math.floor((received / total) * 100) : 0;
        return {
          heading: `Téléchargement de Cyber Pinball ${latest.version}`,
          subheading,
          lead: 'Une fois vérifié, l’installeur se lance : Cyber Pinball se ferme puis redémarre.',
          sections: [{ rows: [{ text: `${formatMebibytes(received)} sur ${formatMebibytes(total)}`, detail: `${percent} %`, tone: 'info' }] }],
          actions: [{ label: 'Annuler', detail: 'Le téléchargement s’arrête ; rien n’est installé', run: () => abort.abort() }],
          back: () => abort.abort(),
        };
      }
      case 'installing':
        return {
          heading: `Installation de Cyber Pinball ${state.latest.version}`,
          subheading,
          lead: 'Cyber Pinball se ferme pour laisser l’installeur faire, puis redémarre dans une minute environ.',
          sections: [],
          actions: [],
          back: () => undefined,
        };
      case 'error':
        return {
          heading: 'Mise à jour impossible',
          subheading,
          sections: [{ rows: [{ text: state.message, tone: 'error' }] }],
          actions: [
            state.latest ? { label: 'Réessayer le téléchargement', run: () => void download((state as { latest: UpdateManifest }).latest) } : { label: 'Réessayer', run: () => void check() },
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
    const outcome = takeUpdateOutcome(host.loc.dataDir, host.version);
    if (!outcome) return undefined;
    const text =
      outcome.kind === 'installed'
        ? `Cyber Pinball ${outcome.to} est installé (avant : ${outcome.from}).`
        : `La mise à jour vers ${outcome.to} n’a pas abouti : la version ${outcome.current} est restée en place.`;
    console.log(`Mise à jour : ${text}`);
    return text;
  }

  return { systemItem, startupNotice };
}
