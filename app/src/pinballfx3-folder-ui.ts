// « Tables de Pinball FX3 » (Ajouter une table) : où est le jeu, et le choix de son dossier à la main
// (19/11/2026), pour des tables rangées hors de la bibliothèque de Steam. Le dossier choisi est vérifié
// (exécutable du jeu, tables dans data\steam), gardé dans le dossier des données, et les tables de
// l'écran viennent alors de lui. Les parties se lancent par son exécutable (pinballfx3-folder.ts).
// Sans dossier choisi, rien ne change : le jeu de Steam. Branché dans library.ts (buildZen).

import { checkPinballFx3Folder, pinballFx3FolderProblemReason, pinballFx3FolderProblemText, pinballFx3InstalledTables, samePath, t, tn, writePinballFx3Folder } from '@cyberpinball/core';
import * as path from 'node:path';
import type { Action, Row } from './library-types';
import { onGesture } from './gesture-flash';
import type { ZenSetup } from './pinballfx-install';

const GAME = 'Pinball FX3';

export interface PinballFx3FolderUiHost {
  dataDir(): string;
  /** État du jeu sur ce PC, relu (Steam, dossier choisi). */
  setup(): ZenSetup;
  pickFolder(): Promise<string | undefined>;
  /** L'écran des tables de Pinball FX3, relu (tables du nouveau dossier) et redessiné ; `stay` : rien n'a changé, le curseur reste où il est. */
  reopen(stay?: boolean): void;
}

export function createPinballFx3FolderUi(host: PinballFx3FolderUiHost) {
  /** Ce que le dernier choix a donné ; effacé au geste suivant. */
  let notice: string | undefined;
  onGesture(() => (notice = undefined));

  /** Section « Pinball FX3 » de l'écran : où est le jeu, et le dossier choisi s'il ne convient plus. */
  function rows(setup: ZenSetup): Row[] {
    const out: Row[] = [];
    const install = setup.install;
    const chosen = setup.chosen;
    if (install?.store === 'folder')
      out.push({ text: install.gameDir ?? chosen?.dir ?? '', detail: t('Dossier choisi à la main · les parties se lancent par son exécutable, sans passer par Steam'), tone: 'ok' });
    else if (install)
      out.push({
        text: install.gameDir ?? setup.steamDir ?? '',
        detail: chosen?.install ? t('Installé par Steam (c’est aussi le dossier choisi) · les parties passent par Steam') : t('Installé par Steam · les parties passent par Steam'),
        tone: 'ok',
      });
    else
      out.push({
        text: t('Introuvable'),
        detail: setup.downloading ? t('Téléchargement en cours dans Steam : la liste des tables s’ouvre une fois le jeu installé') : t('Ni dans Steam, ni dans un dossier choisi : l’installer avec Steam, ou choisir le dossier du jeu.'),
        tone: 'warning',
      });
    if (chosen?.problem) out.push({ text: chosen.dir, detail: `${t('Dossier choisi, pas utilisé :')} ${pinballFx3FolderProblemReason(chosen.problem)}`, tone: 'warning' });
    return out;
  }

  /** « Choisir le dossier du jeu… », et « Oublier ce dossier » quand il y en a un. */
  function actions(setup: ZenSetup): Action[] {
    const out: Action[] = [
      {
        label: setup.chosen ? t('Changer le dossier du jeu…') : t('Choisir le dossier du jeu…'),
        detail: t('Celui de « Pinball FX Classic.exe » ou « Pinball FX3.exe », pour des tables rangées hors de Steam'),
        icon: 'folder',
        key: 'pinballfx3:folder',
        run: () => void choose(),
      },
    ];
    if (setup.chosen)
      out.push({
        label: t('Oublier ce dossier'),
        detail: setup.steamDir ? t('Revenir au jeu installé par Steam') : t('Cyber Pinball ne lancera plus le jeu depuis ce dossier'),
        icon: 'refresh',
        key: 'pinballfx3:forget',
        run: () => {
          writePinballFx3Folder(host.dataDir(), undefined);
          console.log(`${GAME} : dossier choisi oublié (${setup.chosen!.dir}).`); // i18n-ignore : journal
          notice = setup.steamDir ? t('Dossier oublié : les parties passent de nouveau par Steam.') : t('Dossier oublié.');
          host.reopen();
        },
      });
    return out;
  }

  async function choose(): Promise<void> {
    const dir = await host.pickFolder();
    if (!dir) return host.reopen(true);
    const check = checkPinballFx3Folder(dir);
    if (!check.ok) {
      // Rien n'est gardé : le dossier précédent (ou Steam) reste en place.
      notice = pinballFx3FolderProblemText(check.problem, check.dir);
      console.log(`${GAME} : dossier refusé, ${check.dir} (${check.problem}).`); // i18n-ignore : journal
      return host.reopen(true);
    }
    const install = check.install;
    const steamDir = host.setup().steamDir;
    if (steamDir && samePath(steamDir, install.gameDir)) {
      // Le dossier de Steam lancé directement : Steam demanderait une confirmation à chaque partie.
      writePinballFx3Folder(host.dataDir(), undefined);
      notice = t('C’est le dossier du jeu de Steam : rien à changer, les parties passent par Steam.');
      return host.reopen();
    }
    writePinballFx3Folder(host.dataDir(), install.gameDir);
    const n = pinballFx3InstalledTables(install).length;
    console.log(`${GAME} : dossier choisi ${install.gameDir}, ${n} table(s), lancé par ${install.launcher}.`); // i18n-ignore : journal
    notice = `${t('Dossier gardé : {dir}.', { dir: install.gameDir })} ${tn(n, '{n} table trouvée.', '{n} tables trouvées.')} ${t('Les parties se lancent par « {exe} », sans passer par Steam ; si le jeu exige Steam, c’est lui qui refusera de s’ouvrir.', { exe: path.basename(install.launcher) })}`;
    host.reopen();
  }

  return { rows, actions, notice: () => notice };
}
