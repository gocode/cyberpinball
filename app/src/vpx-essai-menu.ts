// Menu système > Borne > VPX d'essai (vpx-essai.ts) : basculer entre le VPX de Cyber Pinball et une préversion de
// VPX décrite dans le manifeste, sur la même installation. Fournie seulement quand le mode est permis (clé
// développeur signée de la machine, cle-developpeur.ts) : ailleurs, l'entrée n'existe pas.
//
// La préversion vient d'un artefact de la CI de VPX, que GitHub ne laisse télécharger qu'à un compte connecté :
// l'archive est cherchée dans les Téléchargements et dans downloads\ de la racine, reconnue à sa taille et à son
// empreinte (manifeste), installée à côté sans toucher à « current ». Changer de mode redémarre Cyber Pinball.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { componentPaths, layoutOf, t } from '@cyberpinball/core';
import { findComponent, findLocalArchive, installComponent, type Component } from '@cyberpinball/installer';
import type { Action, Built, ProvidedSystemItem } from './library';
import { readTrialChoice, trialVpxEntries, writeTrialChoice } from './vpx-essai';

export interface VpxTrialMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
    openNotice(heading: string, lines: string[], then?: () => void): void;
    task(message: string, work: () => Promise<void> | void): Promise<void>;
  };
  root(): string | undefined;
  dataDir(): string;
  /** Version du VPX de Cyber Pinball (« 10.8.1-5436 ») ; par défaut, celle du manifeste. */
  ownVersion?(): string | undefined;
  /** Redémarre Cyber Pinball : la version de VPX est relue au démarrage. */
  relaunch(): void;
  /** Dossiers où chercher l'archive (Téléchargements, downloads\ de la racine) ; tests : un dossier temporaire. */
  archiveDirs?(): string[];
}

/** « VPX 10.9.0 (essai 6948) » */
export function trialVpxLabel(version: string): string {
  const [number = version, build] = version.split('-');
  return build ? t('VPX {number} (essai {build})', { number, build }) : t('VPX {number} (essai)', { number });
}

/** « VPX 10.8.1 de Cyber Pinball » */
function ownLabel(version: string | undefined): string {
  return version ? t('VPX {number} de Cyber Pinball', { number: version.split('-')[0] ?? version }) : t('VPX de Cyber Pinball');
}

export function createVpxTrialMenu(host: VpxTrialMenuHost): { item: ProvidedSystemItem; open(at?: number): void } {
  const ownVersion = () => (host.ownVersion ? host.ownVersion() : findComponent('vpx').version);
  const installed = (entry: Component) => {
    const root = host.root();
    return root ? fs.existsSync(componentPaths(root, entry.installDir, entry.version).version) : false;
  };
  const archiveDirs = () => host.archiveDirs?.() ?? [path.join(os.homedir(), 'Downloads'), ...(host.root() ? [layoutOf(host.root()!).downloads] : [])];

  function switchTo(version: string | undefined): void {
    if (readTrialChoice(host.dataDir()) === version) return host.library.openSystem();
    writeTrialChoice(host.dataDir(), version);
    console.log(`VPX d'essai : ${version ? `parties lancées avec VPX ${version}` : 'retour au VPX de Cyber Pinball'}, redémarrage.`); // i18n-ignore : journal
    host.library.openNotice(
      version ? t('Mode d’essai : {vpx}', { vpx: trialVpxLabel(version) }) : t('Retour à {vpx}', { vpx: ownLabel(ownVersion()) }),
      [t('Cyber Pinball redémarre pour lancer les parties avec cette version.')],
      () => host.relaunch(),
    );
  }

  async function install(entry: Component): Promise<void> {
    const root = host.root();
    if (!root) return host.library.openNotice(t('VPX d’essai'), [t('Pas de racine Cyber Pinball : rien à installer.')], () => open());
    const archive = await findLocalArchive(entry, archiveDirs());
    if (!archive) {
      return host.library.openNotice(t('Archive de {vpx} introuvable', { vpx: trialVpxLabel(entry.version) }), [
        t('Téléchargez-la depuis GitHub, connecté à un compte : {url}', { url: entry.homepage }),
        t('Puis posez-la dans les Téléchargements, sans la décompresser ({size} Mo).', { size: Math.round(entry.size / 1e6) }),
      ], () => open());
    }
    await installComponent(root, entry, undefined, { archive, activate: false });
    console.log(`VPX d'essai : VPX ${entry.version} installé depuis ${archive}.`); // i18n-ignore : journal
  }

  function build(): Built {
    const chosen = readTrialChoice(host.dataDir());
    const entries = trialVpxEntries();
    const actions: Action[] = [
      {
        label: ownLabel(ownVersion()),
        detail: chosen ? t('Toutes les fonctions de Cyber Pinball, réglages habituels') : t('Toutes les fonctions de Cyber Pinball · choix actuel'),
        icon: 'layers',
        tone: chosen ? undefined : 'ok',
        run: () => switchTo(undefined),
      },
      ...entries.map((entry): Action => {
        const ready = installed(entry);
        const current = chosen === entry.version;
        return {
          label: trialVpxLabel(entry.version),
          detail: current ? t('Réglages de VPX à part · choix actuel') : ready ? t('Installé à côté · réglages de VPX à part') : t('À installer depuis son archive (Téléchargements)'),
          icon: ready ? 'layers' : 'import',
          tone: current ? 'ok' : undefined,
          run: () =>
            ready
              ? switchTo(entry.version)
              : void host.library.task(t('Installation de {vpx}…', { vpx: trialVpxLabel(entry.version) }), async () => {
                  try {
                    await install(entry);
                  } catch (error) {
                    return host.library.openNotice(t('{vpx} non installé', { vpx: trialVpxLabel(entry.version) }), [(error as Error).message], () => open());
                  }
                  if (installed(entry)) switchTo(entry.version);
                }),
        };
      }),
      { label: t('Retour'), icon: 'back', run: () => host.library.openSystem() },
    ];
    return {
      heading: t('VPX d’essai'),
      icon: 'flask',
      lead: [
        t('La préversion suivante de VPX, sur cette installation, pour l’essayer avant qu’elle ne devienne celle de Cyber Pinball.'),
        t('Elle a ses propres réglages de VPX ; tables, médias et ROM restent partagés. Les scores faits avec elle restent sur la borne.'),
      ].join(' '),
      sections: [],
      actions,
      back: () => host.library.openSystem(),
    };
  }

  function open(at = 0): void {
    host.library.openCustom(build, at);
  }

  return {
    item: {
      get detail() {
        const chosen = readTrialChoice(host.dataDir());
        return chosen ? t('Parties lancées avec {vpx}', { vpx: trialVpxLabel(chosen) }) : t('Parties lancées avec {vpx}', { vpx: ownLabel(ownVersion()) });
      },
      run: () => open(),
    },
    open,
  };
}
