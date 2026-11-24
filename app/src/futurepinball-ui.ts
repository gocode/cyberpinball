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
  FUTURE_PINBALL_LICENSES,
  FUTURE_PINBALL_NAME,
  futurePinballAt,
  futurePinballInstalledTables,
  futurePinballTableInMenu,
  installFuturePinballArchive,
  licensePages,
  looksLikePupTable,
  managedFuturePinballDir,
  migrateFuturePinball,
  planFuturePinballMigration,
  t,
  tn,
  writeFuturePinballConfig,
  type DownloadManager,
  type FuturePinballInstall,
  type FuturePinballLicense,
  type FuturePinballMigrationPlan,
  type TableEntry,
  type VpsDb,
} from '@cyberpinball/core';
import type { Action, Built, Row } from './library-types';
import { onGesture } from './gesture-flash';
import { detectFuturePinball } from './futurepinball-play';
import { findPinupPlayer, type PinupPlayer } from './pinup-player';
import { downloadFuturePinball, extractManagedFuturePinball, futurePinballComponent, type FuturePinballDownload, type FuturePinballDownloaded, type FuturePinballSetup } from './futurepinball-install';

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
  /** Ouvre un fichier ou un dossier avec Windows ; renvoie ce qui l'en a empêché. */
  openPath(target: string, what: string): Promise<string | undefined>;
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
    pinup = findPinupPlayer();
    read = true;
    return install;
  }

  /**
   * PuP-Packs (24/11/2026) : les tables « PinEvent » pilotent des vidéos par PinUP Player, que Future Pinball n'a pas.
   * Il s'installe avec PinUP Popper (ensemble PinUPSystem) ; Popper n'a pas besoin d'être ouvert. Relu avec le jeu.
   */
  let pinup: PinupPlayer | undefined;
  function pupRow(): Row {
    return pinup
      ? {
          text: t('PuP-Packs : PinUP Player présent'),
          detail: t('{dir}. Les tables « PinEvent » jouent leurs vidéos (fronton, DMD, topper) ; leurs PuP-Packs se rangent dans {videos}. PinUP Popper n’a pas besoin d’être ouvert : Cyber Pinball reste le front-end.', { dir: pinup.dir, videos: pinup.videos }),
          tone: 'ok',
        }
      : {
          text: t('PuP-Packs : PinUP Player absent'),
          detail: t('Certaines tables (« PinEvent ») pilotent un PuP-Pack : les vidéos du fronton, du DMD et du topper. {game} n’a pas de lecteur intégré : il faut PinUP Player, qui s’installe avec PinUP Popper (ensemble PinUPSystem). Popper n’a pas besoin d’être ouvert : Cyber Pinball reste le front-end. Sans lui, ces tables se jouent sans leurs vidéos.', { game: FUTURE_PINBALL_NAME }),
          tone: 'quiet',
        };
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
        { title: FUTURE_PINBALL_NAME, rows: [game, pupRow()] },
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
   * Demande d'accord avant tout téléchargement : ce qui vient, d'où, où cela va, et ce qui suit (les deux
   * contrats à lire et à accepter : Cyber Pinball ne livre pas le jeu, c'est le joueur qui le télécharge
   * chez l'auteur de BAM). Puis le téléchargement, les contrats (showContract), et seulement après l'accord
   * l'extraction (futurepinball-install.ts) : pas de demande de Windows, rien n'est écrit hors du dossier géré.
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
              { text: t('Ce qui est téléchargé'), detail: t('{game} {version} et BAM, l’installateur « 2-en-1 » ({size}), et innoextract, l’outil libre qui en sort les fichiers (moins d’1 Mo)', { game: FUTURE_PINBALL_NAME, version: component.version, size: formatSize(component.size) }), icon: 'download' },
              { text: t('D’où'), detail: t('{host} : le site de l’auteur de BAM. Son empreinte SHA-256 est vérifiée ; un fichier différent est refusé.', { host: new URL(component.url).hostname }), icon: 'globe' },
              { text: t('Où'), detail: t('{dir} : le dossier de Cyber Pinball ; rien ailleurs, ton installation actuelle n’est pas touchée. Aucune demande d’administrateur.', { dir }), icon: 'folder' },
              { text: t('Licences'), detail: t('Deux contrats, celui de Future Pinball et celui de BAM : tu les lis en entier après le téléchargement, et rien n’est installé tant que tu ne les as pas acceptés. Les fichiers sont posés sans aucune modification.'), icon: 'rules', tone: 'quiet' },
              { text: t('Ce que fait cette installation en moins'), detail: t('L’installateur n’est pas lancé : pas de désinstalleur, pas de raccourcis, pas d’association des fichiers .fpt (Cyber Pinball lance lui-même les tables). Supprimer le dossier ci-dessus suffit à tout retirer.'), icon: 'info', tone: 'quiet' },
              {
                text: t('PuP-Packs'),
                detail: pinup
                  ? t('Pas fournis ici, mais PinUP Player est déjà sur ce PC ({dir}) : les tables « PinEvent » joueront leurs vidéos (fronton, DMD, topper).', { dir: pinup.dir })
                  : t('Pas fournis ici : les tables « PinEvent » pilotent leurs vidéos (fronton, DMD, topper) par PinUP Player, qui s’installe avec PinUP Popper (ensemble PinUPSystem). Popper n’a pas besoin d’être ouvert. Sans lui, ces tables se jouent sans leurs vidéos.'),
                icon: 'info',
                tone: 'quiet',
              },
            ],
          },
        ],
        actions: [
          { label: t('Plus tard'), icon: 'back', key: 'later', run: () => open() },
          { label: t('Télécharger'), detail: t('Puis les deux contrats à lire et à accepter'), icon: 'download', key: 'go', run: () => void download_() },
        ],
        back: () => open(),
      }),
      0,
    );
  }

  /** Ce que le téléchargement a rapporté, en attente de l'accord du joueur aux contrats. */
  let downloaded: FuturePinballDownload | undefined;
  /** Page du contrat affichée : les pages de chacun des deux contrats, bout à bout. */
  let contractPage = 0;
  let refusing = false;

  async function download_(): Promise<void> {
    const root = host.root();
    if (!root) return;
    let result: FuturePinballDownloaded | undefined;
    await host.task(t('Téléchargement de {game} et de BAM…', { game: FUTURE_PINBALL_NAME }), async () => {
      result = await downloadFuturePinball(root, { ...(host.downloads() ? { downloads: host.downloads()! } : {}) });
    });
    if (result?.ok) {
      downloaded = result;
      contractPage = 0;
      refusing = false;
      return showContract();
    }
    const failure = result && !result.ok ? result : undefined;
    // L'installateur est là et vérifié, mais l'outil qui l'ouvre manque : le joueur peut l'installer à la main.
    if (failure?.installer) return showManual(failure.installer, failure.reason);
    notice = t('{game} n’est pas installé : {reason}.', { game: FUTURE_PINBALL_NAME, reason: failure?.reason ?? '?' });
    open();
  }

  // ---------------------------------------------------------------------------
  // Repli : installer à la main (24/11/2026). L'extraction peut échouer sur un poste que nous ne voyons pas
  // (antivirus, droits, disque, variante de Windows) : le joueur lance alors l'installateur de l'auteur,
  // déjà téléchargé et vérifié, qui montre lui-même son contrat ; Cyber Pinball retrouve ensuite le jeu.

  /** L'installateur à ouvrir à la main, et pourquoi l'installation automatique n'a pas abouti. */
  let manual: { installer: string; reason: string } | undefined;
  /** Ce que le joueur a lu au dernier essai de vérification ou d'ouverture. */
  let manualNote: { text: string; tone: 'ok' | 'error' } | undefined;

  function showManual(installer: string, reason: string): void {
    manual = { installer, reason };
    manualNote = undefined;
    host.openCustom(buildManual, 0);
  }

  function leaveManual(message?: string): void {
    manual = undefined;
    manualNote = undefined;
    downloaded = undefined;
    if (message) notice = message;
    open();
  }

  function buildManual(): Built {
    const root = host.root();
    const dir = root ? managedFuturePinballDir(root) : '';
    const file = manual?.installer ?? '';
    const note = (text: string, tone: 'ok' | 'error') => {
      manualNote = { text, tone };
      host.openCustom(buildManual, 0);
    };
    const rows: Row[] = [
      { text: t('1. Ouvre l’installateur'), detail: t('{file} : celui de l’auteur de BAM, déjà téléchargé ; son empreinte SHA-256 a été vérifiée. Selon le dossier choisi, Windows peut demander l’accord d’administrateur : c’est normal pour lui.', { file }), icon: 'download' },
      { text: t('2. Lis son contrat, accepte-le, puis laisse-le faire'), detail: t('Quand il demande le dossier d’installation, tape celui de Cyber Pinball ({dir}) ou garde celui qu’il propose : Cyber Pinball cherche aussi {game} aux emplacements habituels.', { dir, game: FUTURE_PINBALL_NAME }), icon: 'rules' },
      { text: t('3. Reviens ici : Cyber Pinball vérifie'), detail: t('« J’ai fini » contrôle que {game} est là ; rien d’autre n’est lu ni changé.', { game: FUTURE_PINBALL_NAME }), icon: 'check' },
    ];
    if (manualNote) rows.push({ text: manualNote.text, icon: manualNote.tone === 'ok' ? 'check' : 'info', tone: manualNote.tone });
    return {
      heading: t('Installer {game} à la main', { game: FUTURE_PINBALL_NAME }),
      icon: 'download',
      lead: t('L’installation automatique n’a pas abouti ({reason}). Tu peux installer {game} et BAM toi-même avec l’installateur de leur auteur.', { reason: manual?.reason ?? '?', game: FUTURE_PINBALL_NAME }),
      sections: [{ rows }],
      actions: [
        {
          label: t('Ouvrir l’installateur'),
          detail: t('Le lance comme n’importe quel programme'),
          icon: 'download',
          key: 'manual:open',
          run: () => void host.openPath(file, t('L’installateur de {game}', { game: FUTURE_PINBALL_NAME })).then((problem) => note(problem ?? t('L’installateur est ouvert : suis ses pages, puis reviens ici.'), problem ? 'error' : 'ok')),
        },
        {
          label: t('J’ai fini : vérifier'),
          detail: t('Cherche {game} installé', { game: FUTURE_PINBALL_NAME }),
          icon: 'check',
          tone: 'ok',
          key: 'manual:check',
          run: () => {
            const found = refresh();
            if (!found) return note(t('{game} est encore introuvable. Termine l’installateur, ou choisis son dossier à la main dans « Tables de {game} ».', { game: FUTURE_PINBALL_NAME }), 'error');
            // Une installation de Cyber Pinball remplace un dossier choisi autrefois à la main.
            if (found.source === 'managed') writeFuturePinballConfig(host.dataDir(), undefined);
            leaveManual(t('{game} est installé. {used}.', { game: FUTURE_PINBALL_NAME, used: usedFolder(found) }));
          },
        },
        { label: t('Abandonner'), detail: t('Le fichier téléchargé reste dans le dossier des téléchargements de Cyber Pinball'), icon: 'close', key: 'manual:leave', run: () => leaveManual(t('{game} n’est pas installé : {reason}.', { game: FUTURE_PINBALL_NAME, reason: manual?.reason ?? '?' })) },
      ],
      back: () => leaveManual(),
    };
  }

  /** Les pages des deux contrats, l'un après l'autre : chacun est montré en entier, dans sa langue d'origine. */
  function contractPages(): { license: FuturePinballLicense; number: number; paragraphs: string[]; page: number; of: number }[] {
    const out: { license: FuturePinballLicense; number: number; paragraphs: string[]; page: number; of: number }[] = [];
    FUTURE_PINBALL_LICENSES.forEach((license, index) => {
      const pages = licensePages(license.paragraphs);
      pages.forEach((paragraphs, page) => out.push({ license, number: index + 1, paragraphs, page: page + 1, of: pages.length }));
    });
    return out;
  }

  function contractName(license: FuturePinballLicense): string {
    return license.id === 'bam' ? t('Contrat de BAM') : t('Contrat de {game}', { game: FUTURE_PINBALL_NAME });
  }

  function showContract(): void {
    host.openCustom(buildContract, 0);
  }

  function buildContract(): Built {
    if (refusing) return buildRefusal();
    const pages = contractPages();
    const current = pages[Math.min(contractPage, pages.length - 1)]!;
    const last = contractPage >= pages.length - 1;
    const go = (to: number) => {
      contractPage = to;
      showContract();
    };
    const actions: Action[] = [];
    if (!last) actions.push({ label: t('Page suivante'), detail: t('Lire la suite du contrat'), icon: 'chevron-right', key: 'contract:next', run: () => go(contractPage + 1) });
    if (contractPage > 0) actions.push({ label: t('Page précédente'), icon: 'chevron-left', key: 'contract:previous', run: () => go(contractPage - 1) });
    if (last)
      actions.push({
        label: t('J’accepte les deux contrats'),
        detail: t('Extraire {game} et BAM dans le dossier de Cyber Pinball', { game: FUTURE_PINBALL_NAME }),
        icon: 'check',
        tone: 'ok',
        key: 'contract:accept',
        run: () => void extract_(),
      });
    actions.push({ label: t('Je refuse'), detail: t('Rien n’est installé'), icon: 'close', key: 'contract:refuse', run: () => ((refusing = true), showContract()) });
    const rows: Row[] = current.paragraphs.flatMap((paragraph) => paragraph.split('\n').map((line) => ({ text: line.replace(/\t/g, ' ') })));
    return {
      heading: t('{contract} ({n} sur {count})', { contract: contractName(current.license), n: current.number, count: FUTURE_PINBALL_LICENSES.length }),
      icon: 'rules',
      subheading: [t('Page {n} sur {count}', { n: contractPage + 1, count: pages.length }), t('Texte d’origine, en anglais : {author}', { author: current.license.author })].join(' · '),
      ...(contractPage === 0 ? { lead: t('Lis ces deux contrats en entier : {game} et BAM ne s’installent qu’avec ton accord à l’un et à l’autre.', { game: FUTURE_PINBALL_NAME }) } : {}),
      sections: [{ rows }],
      actions,
      back: () => (contractPage > 0 ? go(contractPage - 1) : ((refusing = true), showContract())),
    };
  }

  function buildRefusal(): Built {
    return {
      heading: t('Refuser les contrats ?'),
      icon: 'rules',
      lead: t('Sans ton accord aux deux contrats, {game} et BAM ne sont pas installés. Le fichier téléchargé reste dans le dossier des téléchargements de Cyber Pinball.', { game: FUTURE_PINBALL_NAME }),
      sections: [],
      actions: [
        { label: t('Revoir les contrats'), icon: 'back', key: 'contract:review', run: () => ((refusing = false), showContract()) },
        {
          label: t('Ne pas installer'),
          icon: 'close',
          tone: 'error',
          key: 'contract:decline',
          run: () => {
            downloaded = undefined;
            refusing = false;
            notice = t('{game} n’est pas installé : tu n’as pas accepté les contrats.', { game: FUTURE_PINBALL_NAME });
            open();
          },
        },
      ],
      back: () => ((refusing = false), showContract()),
    };
  }

  /** Après l'accord aux deux contrats : l'accord est gardé, puis les fichiers sont extraits et posés. */
  async function extract_(): Promise<void> {
    const root = host.root();
    if (!root || !downloaded) return;
    const files = downloaded;
    let result: FuturePinballSetup | undefined;
    await host.task(t('Installation de {game}…', { game: FUTURE_PINBALL_NAME }), async () => {
      result = await extractManagedFuturePinball(root, files);
    });
    if (result && !result.ok) return showManual(files.installer, result.reason);
    downloaded = undefined;
    if (result?.ok) {
      // Le joueur a voulu celui de Cyber Pinball : le dossier choisi autrefois à la main ne passe plus devant.
      writeFuturePinballConfig(host.dataDir(), undefined);
      notice = result.bam
        ? t('{game} et BAM sont installés dans {dir}. Les tables que tu ajoutes y sont rangées.', { game: FUTURE_PINBALL_NAME, dir: result.dir })
        : t('{game} est installé dans {dir}, mais BAM n’y est pas : les tables récentes en ont besoin.', { game: FUTURE_PINBALL_NAME, dir: result.dir });
      if (!findPinupPlayer()) notice += ` ${t('Les tables « PinEvent » jouent leurs vidéos (PuP-Pack) par PinUP Player, qui s’installe avec PinUP Popper : voir la ligne « PuP-Packs ».')}`;
    } else {
      // Pas de réponse de la tâche (annulée) : rien n'a été posé.
      notice = t('{game} n’est pas installé : {reason}.', { game: FUTURE_PINBALL_NAME, reason: '?' });
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

  /** Une table ajoutée dont le nom annonce un PuP-Pack (« PinEvent ») alors que PinUP Player manque : sans ses vidéos. */
  function pupWarning(added: TableEntry[]): string | undefined {
    const pup = added.filter((e) => looksLikePupTable(e.title) || looksLikePupTable(path.basename(e.file)));
    if (!pup.length || findPinupPlayer()) return undefined;
    return tn(pup.length, '« {title} » semble piloter un PuP-Pack : sans PinUP Player (installé avec PinUP Popper), elle se joue sans ses vidéos.', '{n} tables semblent piloter un PuP-Pack : sans PinUP Player (installé avec PinUP Popper), elles se jouent sans leurs vidéos.', { title: pup[0]!.title });
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
      pupWarning(added),
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
