// « Tables de Future Pinball » (Ajouter une table, 19/11/2026 ; parties par BAM s'il est là, 20/11/2026) : le jeu trouvé
// sur ce PC (ou son dossier choisi à la main, gardé dans le dossier des données), les tables de son
// dossier Tables, et des .fpt choisis ailleurs (clé USB, Téléchargements). Start sur une table l'ajoute au
// front-end : son dossier « Titre (Fabricant Année) », le .fpt lié ou copié, son .info (nom tiré de la base
// VPS, sinon du fichier), puis ses médias du front-end en arrière-plan. Une table déjà ajoutée : Start ouvre
// sa fiche. Cœur : packages/core/src/futurepinball.ts ; partie : futurepinball-play.ts.

import * as path from 'node:path';
import {
  addFuturePinballTable,
  findFuturePinball,
  formatList,
  formatSize,
  FUTURE_PINBALL_NAME,
  futurePinballAt,
  futurePinballInstalledTables,
  futurePinballTableInMenu,
  installFuturePinballArchive,
  managedFuturePinballDir,
  migrateFuturePinball,
  planFuturePinballMigration,
  t,
  tn,
  writeFuturePinballConfig,
  type DownloadManager,
  type FuturePinballInstall,
  type FuturePinballMigrationPlan,
  type TableEntry,
  type VpsDb,
} from '@cyberpinball/core';
import type { Action, Built, Row } from './library-types';
import { onGesture } from './gesture-flash';
import { detectFuturePinball } from './futurepinball-play';
import { futurePinballComponent, installManagedFuturePinball } from './futurepinball-install';
import { askElevation } from './uac-confirm';

export interface FuturePinballUiHost {
  dataDir(): string;
  /** Racine de Cyber Pinball (dossier géré <racine>\emulators\futurepinball) ; absente sans installation. */
  root(): string | undefined;
  downloads(): DownloadManager | undefined;
  /** Dossier des tables de Cyber Pinball ; vide sans installation. */
  tablesDir(): string;
  tables(): TableEntry[];
  pickFolder(): Promise<string | undefined>;
  /** Des fichiers .fpt, choisis où qu'ils soient. */
  pickTables(): Promise<string[] | undefined>;
  /** Le catalogue de la base VPS, filtré sur les tables de Future Pinball. */
  openCatalog(): void;
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
    install = detectFuturePinball(host.dataDir(), host.root());
    read = true;
    return install;
  }

  /**
   * Une installation existante (emplacements habituels : l'ancien front-end, un paquet de la communauté)
   * autre que celle utilisée, dont les tables peuvent être reprises dans le dossier géré. Lu à l'ouverture.
   */
  let legacy: FuturePinballMigrationPlan | undefined;
  function readLegacy(): void {
    legacy = undefined;
    const root = host.root();
    if (!root || install?.source !== 'managed') return;
    const other = findFuturePinball({});
    if (!other) return;
    const plan = planFuturePinballMigration(other.gameDir, install.gameDir);
    if (plan.files) legacy = plan;
  }

  /** « Quel dossier est utilisé », dit en clair : à l'écran, dans les notices des tables et des téléchargements. */
  function usedFolder(game: FuturePinballInstall): string {
    const how = game.source === 'managed' ? t('installé par Cyber Pinball') : game.source === 'chosen' ? t('dossier choisi à la main') : t('installation existante trouvée sur ce PC');
    return t('{game} utilisé : {dir} ({how})', { game: FUTURE_PINBALL_NAME, dir: game.gameDir, how });
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
        ? t('Pas installé : Cyber Pinball peut le télécharger avec BAM, ou choisis son dossier ou des fichiers .fpt')
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
    readLegacy();
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
    // Ses tables au catalogue de la base VPS, déjà filtrées : téléchargées, rangées dans le jeu, ajoutées.
    actions.push({
      label: t('Trouver une table en ligne'),
      detail: t('Catalogue VPS, filtré sur les tables de {game} : téléchargée, rangée dans le jeu, ajoutée', { game: FUTURE_PINBALL_NAME }),
      icon: 'search',
      key: 'fpt:catalog',
      run: () => host.openCatalog(),
    });
    actions.push({
      label: t('Choisir des fichiers .fpt…'),
      detail: t('Une table rangée ailleurs : clé USB, Téléchargements, autre disque'),
      icon: 'import',
      key: 'fpt:pick',
      run: () => void pickTables(),
    });
    // Pas de jeu, ou un jeu qui n'est pas celui de Cyber Pinball : le télécharger chez son auteur (avec BAM), dans le dossier géré.
    if (host.root() && install?.source !== 'managed')
      actions.push({
        label: install ? t('Installer celui de Cyber Pinball…') : t('Installer {game} et BAM…', { game: FUTURE_PINBALL_NAME }),
        detail: install
          ? t('Téléchargé chez son auteur ({size}) dans le dossier de Cyber Pinball ; ton installation actuelle reste intacte', { size: formatSize(futurePinballComponent().size) })
          : t('Téléchargé chez l’auteur de BAM ({size}), installé dans le dossier de Cyber Pinball', { size: formatSize(futurePinballComponent().size) }),
        icon: 'download',
        key: 'fpt:install',
        run: () => askInstall(),
      });
    if (legacy)
      actions.push({
        label: t('Reprendre les tables de l’ancienne installation…'),
        detail: t('{files} fichiers ({size}) de {from} copiés dans {to} ; l’ancienne installation n’est pas modifiée', { files: legacy.files, size: formatSize(legacy.bytes), from: legacy.from, to: legacy.to }),
        icon: 'folder-download',
        key: 'fpt:migrate',
        run: () => void migrate(legacy!),
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
      ? {
          text: install.gameDir,
          detail: [
            install.source === 'managed' ? t('Installé par Cyber Pinball') : install.source === 'chosen' ? t('Dossier choisi à la main') : t('Installation existante, trouvée sur ce PC : utilisée telle quelle'),
            install.loader ? t('BAM présent') : t('BAM absent : les tables récentes en ont besoin'),
          ].join(' · '),
          tone: 'ok',
        }
      : {
          text: t('Pas installé'),
          detail: t('Introuvable dans C:\\Games, à la racine de C:, D: ou E:, ni dans Program Files. « Installer {game} et BAM… » le télécharge ; « Choisir le dossier de {game}… » désigne celui de son exécutable.', { game: FUTURE_PINBALL_NAME }),
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

  /**
   * Demande d'accord avant tout téléchargement : ce qui vient, d'où, où cela va, et ce que Cyber Pinball
   * sait de la licence (gratuit, sans clause de redistribution : il ne le livre pas, c'est le joueur qui le
   * télécharge chez l'auteur de BAM). Puis l'avertissement de la demande de Windows (uac-confirm.ts).
   */
  function askInstall(): void {
    const root = host.root();
    if (!root) return;
    const component = futurePinballComponent();
    const dir = managedFuturePinballDir(root);
    host.openCustom(
      () => ({
        heading: t('Installer {game} et BAM', { game: FUTURE_PINBALL_NAME }),
        icon: 'download',
        lead: t('Cyber Pinball ne livre pas {game} : il le télécharge chez l’auteur de BAM, avec ton accord.', { game: FUTURE_PINBALL_NAME }),
        sections: [
          {
            rows: [
              { text: t('Ce qui est téléchargé'), detail: t('{game} {version} et BAM, l’installateur « 2-en-1 » ({size})', { game: FUTURE_PINBALL_NAME, version: component.version, size: formatSize(component.size) }), icon: 'download' },
              { text: t('D’où'), detail: t('{host} : le site de l’auteur de BAM. Son empreinte SHA-256 est vérifiée ; un fichier différent est refusé.', { host: new URL(component.url).hostname }), icon: 'globe' },
              { text: t('Où'), detail: t('{dir} : le dossier de Cyber Pinball ; rien ailleurs, ton installation actuelle n’est pas touchée.', { dir }), icon: 'folder' },
              { text: t('Licence'), detail: t('Gratuits à télécharger et à utiliser d’après leurs auteurs, qui ne parlent pas de redistribution : c’est pourquoi tu le télécharges toi-même chez eux.'), icon: 'info', tone: 'quiet' },
            ],
          },
        ],
        actions: [
          { label: t('Plus tard'), icon: 'back', key: 'later', run: () => open() },
          { label: t('Télécharger et installer'), detail: t('Windows demande ensuite ton autorisation'), icon: 'download', key: 'go', run: () => confirmInstall() },
        ],
        back: () => open(),
      }),
      0,
    );
  }

  function confirmInstall(): void {
    askElevation((build, at) => host.openCustom(build, at), {
      title: t('Installer {game} et BAM', { game: FUTURE_PINBALL_NAME }),
      what: t('Installer {game} et BAM dans le dossier de Cyber Pinball (sans fenêtre).', { game: FUTURE_PINBALL_NAME }),
      go: () => void install_(),
      later: () => open(),
    });
  }

  async function install_(): Promise<void> {
    const root = host.root();
    if (!root) return;
    let result: Awaited<ReturnType<typeof installManagedFuturePinball>> | undefined;
    await host.task(t('Téléchargement et installation de {game}…', { game: FUTURE_PINBALL_NAME }), async () => {
      result = await installManagedFuturePinball(root, { ...(host.downloads() ? { downloads: host.downloads()! } : {}) });
    });
    if (result?.ok) {
      // Le joueur a voulu celui de Cyber Pinball : le dossier choisi autrefois à la main ne passe plus devant.
      writeFuturePinballConfig(host.dataDir(), undefined);
      notice = result.bam
        ? t('{game} et BAM sont installés dans {dir}. Les tables que tu ajoutes y sont rangées.', { game: FUTURE_PINBALL_NAME, dir: result.dir })
        : t('{game} est installé dans {dir}, mais BAM n’y est pas : les tables récentes en ont besoin.', { game: FUTURE_PINBALL_NAME, dir: result.dir });
    } else {
      notice = t('{game} n’est pas installé : {reason}.', { game: FUTURE_PINBALL_NAME, reason: result?.reason ?? '?' }) + (result && !result.ok && result.log ? ' ' + t('Journal de l’installateur : {log}.', { log: result.log }) : '');
    }
    open();
  }

  /** Copie les tables, bibliothèques, musiques et scripts de l'ancienne installation dans le dossier géré (rien d'écrasé, source intacte). */
  async function migrate(plan: FuturePinballMigrationPlan): Promise<void> {
    let copied = 0;
    await host.task(t('Copie des tables de {game}…', { game: FUTURE_PINBALL_NAME }), async () => {
      copied = await migrateFuturePinball(plan);
    });
    console.log(`${FUTURE_PINBALL_NAME} : ${copied} fichier(s) repris de ${plan.from} dans ${plan.to}.`); // i18n-ignore : journal
    notice = tn(copied, '{n} fichier repris dans {dir} ; l’ancienne installation est intacte.', '{n} fichiers repris dans {dir} ; l’ancienne installation est intacte.', { dir: plan.to });
    open();
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

  /**
   * Ajoute ces .fpt au front-end (déjà présentes : rien), puis leurs médias en arrière-plan.
   * `vpsGameId` : le jeu choisi au catalogue ; `lead` : ce qui a été fait avant (archive rangée dans le jeu).
   */
  async function add(files: string[], opts: { show?: boolean; vpsGameId?: string; lead?: string[] } = {}): Promise<TableEntry[]> {
    const tablesDir = host.tablesDir();
    const added: TableEntry[] = [];
    const failed: string[] = [];
    let already = 0;
    await host.task(tn(files.length, 'Ajout de la table…', 'Ajout des {n} tables…'), async () => {
      const db = await host.vps().catch(() => undefined);
      for (const file of files) {
        try {
          const r = await addFuturePinballTable(tablesDir, file, { db, ...(opts.vpsGameId ? { vpsGameId: opts.vpsGameId } : {}) });
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
      ...(opts.lead ?? []),
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

  /**
   * Archives extraites de tables de Future Pinball (catalogue, Téléchargements) : leurs fichiers rangés
   * dans le jeu (Tables, Libraries, Music, Scripts, BAM ; rien d'écrasé), puis leurs tables ajoutées au
   * front-end. Jeu introuvable : rien n'est fait, l'écran dit de choisir son dossier (le fichier reçu reste
   * dans les téléchargements).
   */
  async function addArchives(dirs: string[], opts: { show?: boolean; vpsGameId?: string } = {}): Promise<TableEntry[]> {
    const game = refresh();
    if (!game) {
      notice = t('{game} n’est pas installé sur ce PC : installe-le (Tables de {game}, « Installer… ») ou choisis son dossier, puis ajoute de nouveau la table (le fichier reçu est gardé).', { game: FUTURE_PINBALL_NAME });
      console.log(`${FUTURE_PINBALL_NAME} : archive pas rangée, jeu introuvable (${dirs.join(', ')}).`); // i18n-ignore : journal
      if (opts.show !== false) open(host.cursor());
      return [];
    }
    const tables: string[] = [];
    let copied = 0;
    let kept = 0;
    await host.task(t('Rangement dans {game}…', { game: FUTURE_PINBALL_NAME }), async () => {
      for (const dir of dirs) {
        const r = await installFuturePinballArchive(dir, game.gameDir);
        tables.push(...r.tables);
        const others = r.copied.filter((f) => !r.tables.includes(f));
        copied += others.length;
        kept += r.kept.filter((f) => !r.tables.includes(f)).length;
        console.log(`${FUTURE_PINBALL_NAME} : archive rangée dans ${game.gameDir} : ${r.tables.length} table(s), ${others.length} fichier(s) copié(s), ${r.kept.length} déjà là, ${r.ignored.length} ignoré(s).`); // i18n-ignore : journal
      }
    });
    const lead = [
      usedFolder(game),
      copied ? tn(copied, '{n} fichier rangé dans {game} (bibliothèques, musique…).', '{n} fichiers rangés dans {game} (bibliothèques, musique…).', { game: FUTURE_PINBALL_NAME }) : undefined,
      kept ? tn(kept, '{n} déjà dans le jeu, gardé tel quel.', '{n} déjà dans le jeu, gardés tels quels.') : undefined,
    ].filter((x): x is string => Boolean(x));
    if (!tables.length) {
      // Archive de bibliothèques seules (sons, musique d'une table livrée en deux archives) : rangées, c'est tout.
      notice = [...lead, copied || kept ? t('Les tables qui se servent de ces bibliothèques les trouveront dans le jeu.') : t('Aucune table de {game} dans ce fichier.', { game: FUTURE_PINBALL_NAME })].join(' ');
      if (opts.show !== false) open(host.cursor());
      return [];
    }
    return add(tables, { ...opts, lead });
  }

  return { action, open, refresh, add, addArchives };
}
