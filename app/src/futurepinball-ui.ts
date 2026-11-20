// « Tables de Future Pinball » (Ajouter une table, 19/11/2026 ; parties par BAM s'il est là, 20/11/2026) : le jeu trouvé
// sur ce PC (ou son dossier choisi à la main, gardé dans le dossier des données), les tables de son
// dossier Tables, et des .fpt choisis ailleurs (clé USB, Téléchargements). Start sur une table l'ajoute au
// front-end : son dossier « Titre (Fabricant Année) », le .fpt lié ou copié, son .info (nom tiré de la base
// VPS, sinon du fichier), puis ses médias du front-end en arrière-plan. Une table déjà ajoutée : Start ouvre
// sa fiche. Cœur : packages/core/src/futurepinball.ts ; partie : futurepinball-play.ts.

import * as path from 'node:path';
import {
  addFuturePinballTable,
  formatList,
  FUTURE_PINBALL_NAME,
  futurePinballAt,
  futurePinballInstalledTables,
  futurePinballTableInMenu,
  t,
  tn,
  writeFuturePinballConfig,
  type FuturePinballInstall,
  type TableEntry,
  type VpsDb,
} from '@cyberpinball/core';
import type { Action, Built, Row } from './library-types';
import { onGesture } from './gesture-flash';
import { detectFuturePinball } from './futurepinball-play';

export interface FuturePinballUiHost {
  dataDir(): string;
  /** Dossier des tables de Cyber Pinball ; vide sans installation. */
  tablesDir(): string;
  tables(): TableEntry[];
  pickFolder(): Promise<string | undefined>;
  /** Des fichiers .fpt, choisis où qu'ils soient. */
  pickTables(): Promise<string[] | undefined>;
  openCustom(build: () => Built, at?: number): void;
  cursor(): number;
  task(message: string, work: () => Promise<void> | void): Promise<void>;
  vps(): Promise<VpsDb | undefined>;
  /** Tables ajoutées : la roue relue, la dernière choisie. */
  added(file: string): void;
  /** Médias du front-end qui manquent à cette table (VPinMediaDB), en arrière-plan. */
  fetchMedias(file: string): void;
  /** Fiche d'une table déjà dans le front-end ; Exit revient ici. */
  openSheet(entry: TableEntry, back: () => void): void;
  back(): void;
}

export function createFuturePinballUi(host: FuturePinballUiHost) {
  let install: FuturePinballInstall | undefined;
  let read = false;
  /** Tables du dossier Tables du jeu, lues à l'ouverture de l'écran (jamais en le dessinant). */
  let list: string[] = [];
  let notice: string | undefined;
  onGesture(() => (notice = undefined));

  /** Relit le jeu sur ce PC : à l'ouverture de « Ajouter une table » et de cet écran. */
  function refresh(): FuturePinballInstall | undefined {
    install = detectFuturePinball(host.dataDir());
    read = true;
    return install;
  }

  /** Entrée de « Ajouter une table ». */
  function action(): Action {
    if (!read) refresh();
    const inMenu = host.tables().filter((x) => x.emulator === 'futurepinball').length;
    return {
      label: t('Tables de {game}', { game: FUTURE_PINBALL_NAME }),
      // Une icône à lui dans l'entonnoir : table-add et flipper sont aux jeux de Zen.
      icon: 'playfield',
      badge: 'beta',
      detail: !install
        ? t('Introuvable aux emplacements habituels : choisir son dossier, ou des fichiers .fpt')
        : inMenu
          ? tn(inMenu, '{n} table dans le front-end · ajouter celles de son dossier Tables', '{n} tables dans le front-end · ajouter celles de son dossier Tables')
          : t('Ajouter les tables de son dossier Tables, ou des fichiers .fpt'),
      run: () => open(),
    };
  }

  /** Chaque table du dossier du jeu et sa table du front-end, si elle y est : lu à l'ouverture (tailles des fichiers). */
  let present = new Map<string, TableEntry | undefined>();

  function open(at?: number): void {
    refresh();
    list = install ? futurePinballInstalledTables(install) : [];
    const tables = host.tables();
    present = new Map(list.map((file) => [file, futurePinballTableInMenu(tables, file)]));
    host.openCustom(build, at);
  }

  function build(): Built {
    const tables = host.tables();
    const actions: Action[] = [];
    const rows: Row[] = list.map((file) => {
      const entry = present.get(file);
      const relative = install ? path.relative(install.tablesDir, path.dirname(file)) : '';
      const action =
        actions.push({
          label: path.basename(file, path.extname(file)),
          key: `fpt:${file}`,
          run: () => (entry ? host.openSheet(entry, () => open(host.cursor())) : void add([file])),
        }) - 1;
      return {
        text: path.basename(file, path.extname(file)),
        detail: relative ? relative : undefined,
        badges: entry ? [t('Dans le front-end')] : [],
        tone: entry ? 'ok' : undefined,
        thumbIcon: 'pinball-app',
        action,
        pick: true,
      };
    });
    actions.push({
      label: t('Choisir des fichiers .fpt…'),
      detail: t('Une table rangée ailleurs : clé USB, Téléchargements, autre disque'),
      icon: 'import',
      key: 'fpt:pick',
      run: () => void pickTables(),
    });
    actions.push({
      label: install ? t('Changer le dossier de {game}…', { game: FUTURE_PINBALL_NAME }) : t('Choisir le dossier de {game}…', { game: FUTURE_PINBALL_NAME }),
      detail: t('Celui de « Future Pinball.exe », ou son dossier Tables'),
      icon: 'folder',
      key: 'fpt:folder',
      run: () => void chooseFolder(),
    });
    if (install?.source === 'chosen')
      actions.push({
        label: t('Revenir aux emplacements habituels'),
        detail: t('Oublier le dossier choisi à la main'),
        icon: 'refresh',
        key: 'fpt:forget',
        run: () => {
          writeFuturePinballConfig(host.dataDir(), undefined);
          notice = t('Dossier oublié : Future Pinball est de nouveau cherché aux emplacements habituels.');
          open();
        },
      });
    actions.push({ label: t('Retour'), icon: 'back', key: 'back', run: () => host.back() });

    const game: Row = install
      ? { text: install.gameDir, detail: install.source === 'chosen' ? t('Dossier choisi à la main') : t('Trouvé sur ce PC'), tone: 'ok' }
      : {
          text: t('Introuvable'),
          detail: t('Ni dans C:\\Games, ni à la racine de C:, D: ou E:, ni dans Program Files. « Choisir le dossier de {game}… » : celui de son exécutable.', { game: FUTURE_PINBALL_NAME }),
          tone: 'warning',
        };
    const inMenu = tables.filter((x) => x.emulator === 'futurepinball').length;
    return {
      heading: t('Tables de {game}', { game: FUTURE_PINBALL_NAME }),
      icon: 'pinball-app',
      subheading: [t('Bêta : {game} est en phase de test dans Cyber Pinball', { game: FUTURE_PINBALL_NAME }), inMenu ? tn(inMenu, '{n} table dans le front-end', '{n} tables dans le front-end') : undefined].filter(Boolean).join(' · '),
      lead:
        notice ??
        t('Start : ajouter une table au front-end. Elle y garde son dossier, ses médias et ses statistiques ; l’original reste dans Future Pinball, intact. La partie se lance dans Future Pinball, par BAM s’il est installé ; ses écrans se règlent dans ses préférences (Vidéo).'),
      sections: [
        { title: FUTURE_PINBALL_NAME, rows: [game] },
        {
          title: tn(rows.length, '{n} table', '{n} tables'),
          rows: rows.length
            ? rows
            : [
                {
                  text: install ? t('Aucune table dans son dossier Tables') : t('Aucune table à lister'),
                  detail: install ? install.tablesDir : t('« Choisir des fichiers .fpt… » marche aussi sans le dossier du jeu.'),
                  tone: 'quiet',
                },
              ],
        },
      ],
      actions,
      back: () => host.back(),
    };
  }

  async function pickTables(): Promise<void> {
    const files = await host.pickTables();
    if (!files?.length) return open(host.cursor());
    await add(files);
  }

  async function chooseFolder(): Promise<void> {
    const dir = await host.pickFolder();
    if (!dir) return open(host.cursor());
    const found = futurePinballAt(dir);
    if (found) {
      writeFuturePinballConfig(host.dataDir(), found.exe);
      notice = t('{game} trouvé : {dir}. Le dossier est gardé.', { game: FUTURE_PINBALL_NAME, dir: found.gameDir });
    } else {
      notice = t('« {dir} » : pas de « Future Pinball.exe » ici, ni au-dessus de ce dossier Tables.', { dir });
    }
    open();
  }

  /** Ajoute ces .fpt au front-end (déjà présentes : rien), puis leurs médias en arrière-plan. */
  async function add(files: string[], opts: { show?: boolean } = {}): Promise<TableEntry[]> {
    const tablesDir = host.tablesDir();
    const added: TableEntry[] = [];
    const failed: string[] = [];
    let already = 0;
    await host.task(tn(files.length, 'Ajout de la table…', 'Ajout des {n} tables…'), async () => {
      const db = await host.vps().catch(() => undefined);
      for (const file of files) {
        try {
          const r = await addFuturePinballTable(tablesDir, file, { db });
          if (r.already) already++;
          else {
            added.push(r.entry);
            console.log(`${FUTURE_PINBALL_NAME} : ${file} ajoutée au front-end, ${r.entry.id} (${r.linked ? 'liée' : 'copiée'}${r.entry.info.Info?.VPSId ? `, jeu VPS ${r.entry.info.Info.VPSId}` : ''}).`); // i18n-ignore : journal
          }
        } catch (error) {
          failed.push(`${path.basename(file)} : ${(error as Error).message}`);
          console.log(`${FUTURE_PINBALL_NAME} : ${file} pas ajoutée (${(error as Error).message}).`); // i18n-ignore : journal
        }
      }
    });
    const last = added[added.length - 1];
    if (last) host.added(last.file);
    for (const entry of added) if (entry.info.Info?.VPSId) host.fetchMedias(entry.file);
    notice = [
      added.length === 1 ? t('« {title} » ajoutée au front-end.', { title: added[0]!.title }) : added.length ? tn(added.length, '{n} table ajoutée au front-end.', '{n} tables ajoutées au front-end.') : undefined,
      added.some((e) => e.info.Info?.VPSId) ? (added.length > 1 ? t('Leurs médias arrivent (Téléchargements).') : t('Ses médias arrivent (Téléchargements).')) : undefined,
      already ? tn(already, '{n} déjà dans le front-end.', '{n} déjà dans le front-end.') : undefined,
      failed.length ? t('Pas ajoutées : {list}', { list: formatList(failed) }) : undefined,
    ]
      .filter(Boolean)
      .join(' ');
    if (opts.show !== false) open(host.cursor());
    return added;
  }

  return { action, open, refresh, add };
}
