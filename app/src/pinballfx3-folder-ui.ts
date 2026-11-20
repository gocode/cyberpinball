// « Tables de Pinball FX3 » (Ajouter une table) : où est le jeu, et le choix de son dossier à la main
// (19/11/2026), pour des tables rangées hors de la bibliothèque de Steam. Le dossier choisi est vérifié
// (exécutable du jeu, tables dans data\steam), gardé dans le dossier des données, et les tables de
// l'écran viennent alors de lui. Les parties se lancent par son exécutable (pinballfx3-folder.ts).
// Sans dossier choisi, rien ne change : le jeu de Steam. Branché dans library.ts (buildZen).

import {
  checkPinballFx3Folder,
  PINBALLFX3_BACKGLASS_PAGE,
  PINBALLFX3_BACKGLASS_TITLE,
  pinballFx3FolderProblemReason,
  pinballFx3FolderProblemText,
  pinballFx3InstalledTables,
  samePath,
  t,
  tn,
  writePinballFx3Folder,
  type DownloadManager,
  type PinballFx3Install,
} from '@cyberpinball/core';
import * as path from 'node:path';
import type { Action, Row } from './library-types';
import { onGesture } from './gesture-flash';
import { installPinballFx3Backglasses } from './pinballfx3-backglass';
import type { ZenSetup } from './pinballfx-install';

const GAME = 'Pinball FX3';

export interface PinballFx3FolderUiHost {
  dataDir(): string;
  /** État du jeu sur ce PC, relu (Steam, dossier choisi). */
  setup(): ZenSetup;
  pickFolder(): Promise<string | undefined>;
  /** L'écran des tables de Pinball FX3, relu (tables du nouveau dossier) et redessiné ; `stay` : rien n'a changé, le curseur reste où il est. */
  reopen(stay?: boolean): void;
  /** Redessine l'écran affiché, sans y aller (avancée d'un téléchargement). */
  broadcast(): void;
  /** Gestionnaire de téléchargements, où le lot des frontons est suivi. */
  downloads?(): DownloadManager;
}

export function createPinballFx3FolderUi(host: PinballFx3FolderUiHost) {
  /** Ce que le dernier choix a donné ; effacé au geste suivant. */
  let notice: string | undefined;
  onGesture(() => (notice = undefined));
  /** Frontons (pinballfx3-backglass.ts) : avancée, puis bilan, montrés sous l'entrée ; vrai pendant le téléchargement. */
  let backglass: string | undefined;
  let fetching = false;

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
    // Frontons : l'image que FX3 affiche sur l'écran du fronton, en mode borne (pinballfx3-backglass.ts).
    const tablesDir = setup.install?.tablesDir;
    if (tablesDir)
      out.push({
        label: t('Télécharger les frontons des tables'),
        detail:
          backglass ??
          t('« {title} » ({url}), images faites par des joueurs : le fronton de chaque table qui n’en a pas, déposé à côté de son fichier .pxp, où {game} le cherche. Aucune image déjà là n’est remplacée.', {
            title: PINBALLFX3_BACKGLASS_TITLE,
            url: PINBALLFX3_BACKGLASS_PAGE.replace(/^https:\/\//, ''),
            game: GAME,
          }),
        icon: 'image-download',
        key: 'pinballfx3:backglass',
        run: () => void fetchBackglasses({ tablesDir }),
      });
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

  /** Télécharge les frontons manquants ; l'avancée et le bilan s'affichent sous l'entrée. */
  async function fetchBackglasses(install: Pick<PinballFx3Install, 'tablesDir'>): Promise<void> {
    if (fetching) return;
    fetching = true;
    backglass = t('Liste du catalogue en cours de lecture…');
    host.broadcast();
    try {
      const report = await installPinballFx3Backglasses(install, {
        workDir: path.join(host.dataDir(), 'pinballfx3-frontons'),
        ...(host.downloads ? { downloads: host.downloads() } : {}),
        onProgress: (done, total) => {
          backglass = t('Téléchargement des frontons : {done} sur {total}…', { done, total });
          host.broadcast();
        },
      });
      const parts = [
        tn(report.placed.length, '{n} fronton déposé', '{n} frontons déposés'),
        report.present.length ? tn(report.present.length, '{n} déjà là, gardé', '{n} déjà là, gardés') : undefined,
        report.missing.length ? tn(report.missing.length, '{n} absent du catalogue', '{n} absents du catalogue') : undefined,
        report.failed.length ? tn(report.failed.length, '{n} en échec : réessayez, le téléchargement reprendra', '{n} en échec : réessayez, le téléchargement reprendra') : undefined,
      ].filter(Boolean);
      backglass = parts.join(' · ');
      console.log(
        `${GAME} : frontons, ${report.placed.length} déposé(s) dans ${install.tablesDir}, ${report.present.length} déjà là, absents du catalogue : ${report.missing.join(', ') || 'aucun'}${report.failed.length ? `, en échec : ${report.failed.map((f) => `${f.target} (${f.reason})`).join(', ')}` : ''}.`, // i18n-ignore : journal
      );
    } catch (error) {
      backglass = t('Catalogue des frontons injoignable : vérifiez la connexion, puis réessayez.');
      console.log(`${GAME} : catalogue des frontons injoignable (${(error as Error).message}).`); // i18n-ignore : journal
    } finally {
      fetching = false;
      host.broadcast();
    }
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
    use(check.install);
  }

  /**
   * Garde ce jeu comme dossier de Pinball FX3 et ouvre son écran. Aussi depuis l'ajout général
   * (« Choisir un dossier… », glisser-déposer) : un dossier de FX3 n'y est pas une table VPX, il était
   * listé en « Non importé » (retour d'un joueur, 20/11/2026). `via` : il vient de l'ajout général.
   */
  function use(install: PinballFx3Install, opts: { via?: 'import'; show?: boolean } = {}): void {
    const steamDir = host.setup().steamDir;
    const recognized = opts.via === 'import' ? `${t('Dossier de {game} reconnu dans votre sélection : ses tables ne s’installent pas comme des tables VPX, elles se choisissent ici.', { game: GAME })} ` : '';
    if (steamDir && samePath(steamDir, install.gameDir)) {
      // Le dossier de Steam lancé directement : Steam demanderait une confirmation à chaque partie.
      writePinballFx3Folder(host.dataDir(), undefined);
      notice = `${recognized}${t('C’est le dossier du jeu de Steam : rien à changer, les parties passent par Steam.')}`;
      if (opts.show !== false) host.reopen();
      return;
    }
    writePinballFx3Folder(host.dataDir(), install.gameDir);
    const n = pinballFx3InstalledTables(install).length;
    console.log(`${GAME} : dossier ${opts.via === 'import' ? 'reconnu dans l’ajout' : 'choisi'} ${install.gameDir}, ${n} table(s), lancé par ${install.launcher}.`); // i18n-ignore : journal
    notice = `${recognized}${t('Dossier gardé : {dir}.', { dir: install.gameDir })} ${tn(n, '{n} table trouvée.', '{n} tables trouvées.')} ${t('Les parties se lancent par « {exe} », sans passer par Steam ; si le jeu exige Steam, c’est lui qui refusera de s’ouvrir.', { exe: path.basename(install.launcher) })}`;
    if (opts.show !== false) host.reopen();
  }

  return { rows, actions, use, notice: () => notice };
}
