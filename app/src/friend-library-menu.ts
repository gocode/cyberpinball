// Bibliothèque d'un ami à l'écran (friend-content.ts, packages/core/src/friendlibrary.ts) : ses
// tables, celles qu'on a aussi et les autres ; pour une table, ses médias et ceux qui nous
// manquent, et ses parties (table, fronton, ROM, PuP-Pack, sons…). On récupère toute une table
// qu'on n'a pas ; d'une table qu'on a déjà, on choisit partie par partie ce qu'on prend de l'ami
// et ce qu'on garde. La ROM et le PuP-Pack sont décochés d'office et ne se cochent qu'après
// l'attestation des droits, une mention légale que le joueur coche (décisions du 29/10/2026). Puis la
// réception, avec sa progression et « Annuler » : les médias seuls entrent dans le brouillon de
// « Médias du jeu » ; une table, ou des parties, passent par le plan d'ajout (rien n'est rangé
// avant « Installer »).
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec des services d'essai.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  currentFile,
  downloadReasonText,
  downloadStateLabel,
  isSafeTableRel,
  jobBytes,
  type DownloadFile,
  type DownloadJob,
  type DownloadJobKind,
  type DownloadManager,
  type DownloadReturn,
  type DownloadScreen,
  defaultPartChoice,
  displayName,
  fileRefusalLabel,
  formatSize,
  friendParts,
  installedParts,
  partLabel,
  partRightsNote,
  rightsAttestation,
  attestedTableFiles,
  librarySize,
  MANAGED_MEDIA_TYPES,
  matchLibrary,
  mediaTypeInfo,
  missingMedias,
  ownMediaPages,
  parseTableIdentity,
  sameTable,
  t,
  tableIdentity,
  tn,
  type FriendLibrary,
  type GamePart,
  type InstalledPart,
  type LibraryMatch,
  type LibraryMedia,
  type MediaOriginDraft,
  type MediaType,
  type TableContents,
  type TableEntry,
  type TableFile,
  type TableIdentity,
} from '@cyberpinball/core';
import type { FriendContent } from './friend-content';
import type { Action, Built, Row, Section } from './library';
import type { LiveMenu } from './live-game-menu';
import type { SocialNet } from './social-net';

/** Ce que la gestion des tables offre aux amis pour leurs téléchargements (library.ts, downloads). */
export interface FriendDownloads {
  manager: DownloadManager;
  /** Téléchargement fini : vrai s'il a été rendu à son écran de lui-même. */
  finisher(kind: DownloadJobKind, fn: (job: DownloadJob) => boolean): void;
  /** « Revenir à… » d'un téléchargement fini : vrai s'il l'a rendu. */
  deliverer(kind: DownloadJobKind, fn: (job: DownloadJob) => boolean): void;
  /** Ouvreur d'un écran de retour (la bibliothèque d'un ami). */
  opener(screen: DownloadScreen, fn: (back: DownloadReturn) => void): void;
  deliver(job: DownloadJob): void;
  openReturn(back: DownloadReturn): void;
}

export interface FriendLibraryMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    /** Cet écran décrit est affiché (une réception qui finit sous les yeux de l'utilisateur). */
    isShowing(build: () => Built): boolean;
    openSystem(): void;
    openMediasWith(table: TableEntry, files: readonly { type: MediaType; file: string; page?: number }[], origin: MediaOriginDraft, notice: string): void;
    catalogFor(identity: TableIdentity): void;
    /** Dossier d'une table reçue : le plan d'ajout, vers `table` quand on l'a déjà. */
    installReceived(dir: string, table?: TableEntry, back?: () => void): void;
  };
  /** Inventaire du dossier d'une de mes tables : les parties que j'ai déjà. */
  contents?(table: TableEntry): TableContents | undefined;
  /** Place libre du lecteur des données, en octets ; undefined : inconnue. */
  freeSpace?(): number | undefined;
  net: Pick<SocialNet, 'state' | 'online'>;
  content: FriendContent;
  /** Gestionnaire de téléchargements : chaque réception y passe, et reprend seule après une coupure. */
  downloads: FriendDownloads;
  live: Pick<LiveMenu, 'inviteOn'>;
  tables(): readonly TableEntry[];
  romsOf?(table: TableEntry): readonly string[];
  root(): string | undefined;
  redraw(): void;
}

export interface FriendLibraryMenu {
  open(key: string, back: () => void): void;
  /** Ce que la fiche de l'ami dit de sa bibliothèque. */
  detail(key: string): string;
  /** Sa bibliothèque connue a cette table (pour mettre en tête le choix d'une partie en direct). */
  has(key: string, table: TableEntry): boolean;
  /** Le même jeu dans sa bibliothèque (une invitation sur une table qu'on n'a pas) ; sinon sa bibliothèque. */
  /** La table de l'ami qui correspond ; `want` : quand on a déjà le jeu, ses parties à prendre, cochées d'office. */
  openMatching(key: string, identity: TableIdentity, back: () => void, want?: readonly GamePart[]): void;
}

/** Tables montrées par section avant « … et n autres ». */
const SHOWN = 200;

export function createFriendLibraryMenu(host: FriendLibraryMenuHost): FriendLibraryMenu {
  const content = host.content;
  let flash: Row | undefined;
  const takeFlash = (): Section[] => {
    const row = flash;
    flash = undefined;
    return row ? [{ rows: [row] }] : [];
  };
  /** Réception ouverte à l'écran : le téléchargement de la file qu'elle montre. */
  let transfer: { id: string; build: () => Built } | undefined;
  const downloads = host.downloads;
  /** Parties de la table d'un ami, demandées à l'ouverture de l'écran des parties, et ce qu'on en prend. */
  let parts: { key: string; tableId: string; files?: TableFile[]; error?: string; take: Map<GamePart, boolean>; attested: Set<GamePart> } | undefined;

  const friendName = (key: string) => host.net.state().friends.find((f) => f.key === key)?.name ?? '?';
  const mine = () => host.tables().map((table) => ({ table, identity: tableIdentity(table, host.romsOf?.(table) ?? []) }));
  // Médias de mes tables, relus au plus toutes les 5 s : l'écran se redessine à chaque nouvelle du réseau.
  const ownedTypes = new Map<string, { at: number; types: Set<MediaType> }>();
  const have = (table: TableEntry) => (type: MediaType) => {
    const root = host.root();
    if (!root) return false;
    let known = ownedTypes.get(table.file);
    if (!known || Date.now() - known.at > 5000) {
      known = { at: Date.now(), types: new Set(MANAGED_MEDIA_TYPES.filter((x) => ownMediaPages(table, root, x).length > 0)) };
      ownedTypes.set(table.file, known);
    }
    return known.types.has(type);
  };
  const titleOf = (id: TableIdentity) => (id.manufacturer && id.year ? `${id.title} (${id.manufacturer} ${id.year})` : id.title);
  const ready = (key: string): FriendLibrary | undefined => {
    const s = content.library(key);
    return s.state === 'ready' ? s.library : undefined;
  };

  function detail(key: string): string {
    const s = content.library(key);
    switch (s.state) {
      case 'ready': {
        const n = s.library.tables.length;
        return tn(n, '{n} table, ses médias à prendre', '{n} tables, leurs médias à prendre');
      }
      case 'off':
        return t('Il ne partage pas sa bibliothèque');
      case 'loading':
        return t('Demandée à sa borne…');
      case 'offline':
        return t('Visible quand sa borne est en ligne');
    }
  }

  // ---------- Ses tables ----------

  /**
   * Écran ouvert avant l'arrivée de ce qu'il montre (bibliothèque, parties d'une table) : quand
   * c'est arrivé et qu'il est encore à l'écran (son build est appelé), il se rouvre le curseur sur
   * sa première action. Sinon le curseur restait sur « Actualiser » ou « Retour », seules
   * actions de l'attente, et Start ne lançait pas ce qu'on était venu faire.
   */
  let awaiting: string | undefined;
  function reopenWhenReady(id: string, ready: boolean, reopen: () => void): void {
    if (awaiting !== id || !ready) return;
    awaiting = undefined;
    setImmediate(reopen);
  }

  function open(key: string, back: () => void): void {
    awaiting = content.library(key).state === 'loading' ? `library:${key}` : undefined;
    host.library.openCustom(() => buildLibrary(key, back));
  }

  function buildLibrary(key: string, back: () => void): Built {
    const plain = friendName(key);
    const s = content.library(key);
    reopenWhenReady(`library:${key}`, s.state !== 'loading', () => open(key, back));
    const actions: Action[] = [];
    const sections: Section[] = [...takeFlash()];
    if (s.state !== 'ready') {
      const row: Row =
        s.state === 'loading'
          ? { text: t('Demandée à sa borne…'), tone: 'quiet', icon: 'clock' }
          : s.state === 'off'
            ? { text: t('{name} ne partage pas sa bibliothèque', { name: plain }), detail: t('Il peut l’activer dans Menu système > Amis > « Partage et réseau ».'), tone: 'info', icon: 'lock' }
            : { text: t('{name} n’est pas en ligne', { name: plain }), detail: t('Sa bibliothèque se voit quand sa borne est allumée'), tone: 'quiet', icon: 'clock' };
      sections.push({ rows: [row] });
    } else {
      const matches = matchLibrary(s.library, mine());
      const row = (m: LibraryMatch): Row => {
        const index = actions.push({ label: titleOf(m.entry.table), key: `table:${m.entry.id}`, icon: 'tables', run: () => openTable(key, m.entry.id, () => open(key, back)) }) - 1;
        const missing = m.mine ? missingMedias(m.entry, have(m.mine)).length : 0;
        return {
          text: titleOf(m.entry.table),
          detail: [m.entry.version, tn(m.entry.medias.length, '{n} média', '{n} médias'), missing ? tn(missing, '{n} manquant', '{n} manquants') : undefined].filter(Boolean).join(' · '),
          tone: missing ? 'ok' : undefined,
          ...(m.mine ? {} : { badges: [t('Pas sur votre borne')] }),
          action: index,
          pick: true,
        };
      };
      const both = matches.filter((m) => m.mine);
      const other = matches.filter((m) => !m.mine);
      if (!matches.length) sections.push({ rows: [{ text: t('Aucune table dans sa bibliothèque'), tone: 'info' }] });
      if (both.length) sections.push({ title: t('Sur votre borne ({n})', { n: both.length }), rows: both.slice(0, SHOWN).map(row), ...(both.length > SHOWN ? { more: both.length - SHOWN } : {}) });
      if (other.length) sections.push({ title: t('Absentes de votre borne ({n})', { n: other.length }), rows: other.slice(0, SHOWN).map(row), ...(other.length > SHOWN ? { more: other.length - SHOWN } : {}) });
    }
    actions.push({ label: t('Actualiser'), icon: 'refresh', run: () => { content.refresh(key); open(key, back); } });
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: t('Bibliothèque de {name}', { name: plain }),
      icon: 'tables',
      subheading: displayName(plain, key),
      lead: t('Récupérez les médias de {name}. Retrouvez ses autres tables dans le catalogue.', { name: plain }),
      sections,
      actions,
      back,
    };
  }

  // ---------- Une de ses tables ----------

  function openTable(key: string, tableId: string, back: () => void): void {
    host.library.openCustom(() => buildTable(key, tableId, back));
  }

  function buildTable(key: string, tableId: string, back: () => void): Built {
    const plain = friendName(key);
    const library = ready(key);
    const match = library ? matchLibrary({ ...library, tables: library.tables.filter((x) => x.id === tableId) }, mine())[0] : undefined;
    if (!match) return { heading: t('Bibliothèque de {name}', { name: plain }), icon: 'tables', sections: [{ rows: [{ text: t('Cette table n’est plus dans sa bibliothèque'), tone: 'info' }] }], actions: [{ label: t('Retour'), icon: 'back', run: back }], back };
    const entry = match.entry;
    const owned = match.mine;
    const has = owned ? have(owned) : undefined;
    const rows: Row[] = entry.medias.map((m) => ({
      text: m.page ? t('{label}, page {page}', { label: mediaTypeInfo(m.type).label, page: m.page }) : mediaTypeInfo(m.type).label,
      detail: `${m.format.toUpperCase()} · ${formatSize(m.bytes)}`,
      icon: m.kind === 'video' ? 'video' : m.kind === 'audio' ? 'music' : 'image',
      // Le type de média, pas le fichier : « Déjà équipé » veut dire que votre table en a un.
      ...(has ? (has(m.type) ? { badges: [t('Déjà équipé')] } : { badges: [t('Manquant')], tone: 'ok' as const }) : {}),
    }));
    const actions: Action[] = [];
    // La table elle-même, partie par partie : toute la table si on ne l'a pas, sinon au choix.
    actions.push(
      owned
        ? { label: t('Choisir les parties de sa table'), detail: t('Fronton, PuP-Pack, sons… : les siennes ou les vôtres'), icon: 'layers', run: () => openParts(key, tableId, () => openTable(key, tableId, back)) }
        : { label: t('Récupérer toute la table'), detail: t('Table, fronton, sons et médias ; la ROM et le PuP-Pack au choix'), icon: 'table-add', tone: 'ok', run: () => openParts(key, tableId, () => openTable(key, tableId, back)) },
    );
    if (owned) {
      const missing = missingMedias(entry, has!);
      if (missing.length) actions.push({ label: tn(missing.length, 'Récupérer le média manquant', 'Récupérer les {n} médias manquants'), detail: formatSize(librarySize(missing)), icon: 'image-download', tone: 'ok', run: () => startFetch(key, owned, entry.id, missing, back) });
      if (entry.medias.length && missing.length < entry.medias.length) actions.push({ label: tn(entry.medias.length, 'Récupérer son média', 'Récupérer les {n} médias'), detail: t('{size} · remplaceront les vôtres après vérification et enregistrement', { size: formatSize(librarySize(entry.medias)) }), icon: 'download', run: () => startFetch(key, owned, entry.id, entry.medias, back) });
      // Toujours là : grisée hors ligne ; en partie, l'ami la reçoit en notification sur sa table.
      actions.push(
        host.net.online(key)
          ? { label: t('Inviter {name} à jouer', { name: plain }), detail: t('Partie en direct sur cette table'), icon: 'gamepad', run: () => host.live.inviteOn(owned, key, () => openTable(key, tableId, back)) }
          : { label: t('Inviter {name} à jouer', { name: plain }), detail: t('Hors ligne : invitez-le quand il sera connecté'), icon: 'gamepad', tone: 'quiet', run: () => undefined },
      );
    } else {
      actions.push({ label: t('Trouver cette table dans le catalogue'), detail: t('Sur son site, comme toute table'), icon: 'search', run: () => host.library.catalogFor(entry.table) });
    }
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    const sections: Section[] = [...takeFlash()];
    if (!owned) sections.push({ rows: [{ text: t('Vous n’avez pas cette table'), detail: t('« Récupérer toute la table » l’installe, avec ses médias'), tone: 'info' }] });
    sections.push({ title: t('Ses médias'), rows: rows.length ? rows : [{ text: t('Aucun média pour cette table'), tone: 'quiet' }] });
    return {
      heading: entry.table.title,
      icon: 'tables',
      subheading: [entry.table.manufacturer, entry.table.year, entry.version, t('Bibliothèque de {name}', { name: plain })].filter(Boolean).join(' · '),
      sections,
      actions,
      back,
    };
  }

  // ---------- Les parties de sa table ----------

  /** Parties de ma table, d'après son inventaire. */
  function mineParts(table: TableEntry | undefined): Map<GamePart, InstalledPart> {
    const contents = table ? host.contents?.(table) : undefined;
    return contents ? installedParts(contents) : new Map();
  }

  function openParts(key: string, tableId: string, back: () => void, want: readonly GamePart[] = []): void {
    const job: NonNullable<typeof parts> = { key, tableId, take: new Map(), attested: new Set() };
    parts = job;
    awaiting = `parts:${key}/${tableId}`;
    const show = () => host.library.openCustom(() => buildParts(key, tableId, back));
    show();
    void content.tableFiles(key, tableId).then((files) => {
      if (parts !== job) return;
      if (typeof files === 'string') job.error = fileRefusalLabel(files);
      else {
        job.files = files;
        const owned = matchOf(key, tableId)?.mine;
        const have = mineParts(owned);
        for (const p of friendParts(files)) job.take.set(p.part, want.includes(p.part) || defaultPartChoice(p.part, have.has(p.part)));
      }
      host.redraw();
    });
  }

  function matchOf(key: string, tableId: string): LibraryMatch | undefined {
    const library = ready(key);
    return library ? matchLibrary({ ...library, tables: library.tables.filter((x) => x.id === tableId) }, mine())[0] : undefined;
  }

  function buildParts(key: string, tableId: string, back: () => void): Built {
    const plain = friendName(key);
    const match = matchOf(key, tableId);
    const job = parts?.key === key && parts.tableId === tableId ? parts : undefined;
    reopenWhenReady(`parts:${key}/${tableId}`, !!job && (!!job.files || !!job.error), () => host.library.openCustom(() => buildParts(key, tableId, back)));
    const owned = match?.mine;
    const title = match?.entry.table.title ?? '?';
    const heading = owned ? t('Parties de sa table') : t('Récupérer toute la table');
    const actions: Action[] = [];
    const sections: Section[] = [...takeFlash()];
    if (!job?.files) {
      sections.push({ rows: [job?.error ? { text: t('Parties indisponibles : {why}', { why: job.error }), tone: 'warning' } : { text: t('Demande à sa borne…'), icon: 'clock', tone: 'quiet' }] });
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      return { heading, icon: owned ? 'layers' : 'table-add', subheading: title, sections, actions, back };
    }
    const have = mineParts(owned);
    const all = friendParts(job.files);
    const chosen = all.filter((p) => job.take.get(p.part));
    const bytes = chosen.reduce((n, p) => n + p.bytes, 0);
    const free = host.freeSpace?.();
    const room = free === undefined || free > bytes + 2 ** 30;
    // L'action qui lance la réception d'abord (curseur dessus) ; chaque partie se prend ou se laisse dessous.
    actions.push({
      label: chosen.length ? tn(chosen.length, 'Récupérer la partie choisie', 'Récupérer les {n} parties choisies') : t('Aucune partie choisie'),
      detail: chosen.length ? t('{size} · puis le plan d’ajout, avant toute installation', { size: formatSize(bytes) }) : t('Start sur une partie la prend ou la laisse'),
      icon: 'download',
      tone: chosen.length && room ? 'ok' : undefined,
      run: () => {
        if (!chosen.length || !room) return host.redraw();
        startTableFetch(key, tableId, owned, match?.entry.table, chosen.flatMap((p) => p.files), job.attested, back);
      },
    });
    const rows: Row[] = [];
    for (const p of all) {
      const taken = job.take.get(p.part) ?? false;
      const mineHas = have.get(p.part);
      const his = `${tn(p.files.length, '{n} fichier', '{n} fichiers')} · ${formatSize(p.bytes)}`;
      const index =
        actions.push({
          label: partLabel(p.part),
          key: `part:${p.part}`,
          icon: taken ? 'check' : 'close',
          run: () => {
            // Une partie sous droits ne se coche qu'une fois sa mention légale acceptée.
            if (!taken && rightsAttestation(p.part, plain) && !job.attested.has(p.part)) return openAttestation(key, tableId, p.part, back);
            job.take.set(p.part, !taken);
            host.redraw();
          },
        }) - 1;
      rows.push({
        text: partLabel(p.part),
        detail: [
          t('La sienne : {what}', { what: his }),
          owned ? (mineHas ? t('la vôtre : {size}', { size: formatSize(mineHas.size) }) : t('vous ne l’avez pas')) : undefined,
          partRightsNote(p.part),
        ]
          .filter(Boolean)
          .join(' · '),
        badges: [taken ? t('La sienne') : owned && mineHas ? t('La vôtre') : t('Pas prise')],
        tone: taken ? 'ok' : partRightsNote(p.part) ? 'warning' : 'quiet',
        icon: taken ? 'check' : 'close',
        action: index,
        pick: true,
      });
    }
    sections.push({ title: t('Ses parties'), rows });
    sections.push({
      rows: [
        { text: t('Une table contient un script que VPX exécute'), detail: t('Ne prenez que les tables d’amis en qui vous avez confiance'), tone: 'warning', icon: 'alert' },
        ...(room ? [] : [{ text: t('Pas assez de place : {size} libres pour {need}', { size: formatSize(free!), need: formatSize(bytes) }), tone: 'error' as const, icon: 'drive' as const }]),
      ],
    });
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading,
      icon: owned ? 'layers' : 'table-add',
      subheading: [title, t('de {name}', { name: plain })].join(' · '),
      lead: owned ? t('Pour chaque partie : la sienne remplace la vôtre, ou vous gardez la vôtre. Le plan d’ajout montre tout avant d’installer.') : t('Toutes ses parties d’office, sauf la ROM et le PuP-Pack : chacun se coche après l’attestation de vos droits. Le plan d’ajout montre tout avant d’installer.'),
      sections,
      actions,
      back,
    };
  }

  /**
   * La mention légale d'une partie sous droits : le joueur coche l'engagement, puis la prend ;
   * l'attestation vaut pour cette table, le temps de l'écran des parties, et suit le téléchargement.
   */
  function openAttestation(key: string, tableId: string, part: GamePart, back: () => void): void {
    let agreed = false;
    const toParts = () => host.library.openCustom(() => buildParts(key, tableId, back));
    const build = (): Built => {
      const text = rightsAttestation(part, displayName(friendName(key), key))!;
      const actions: Action[] = [
        {
          label: t('J’atteste et je m’engage'),
          key: 'attest',
          icon: agreed ? 'check' : 'close',
          run: () => {
            agreed = !agreed;
            host.redraw();
          },
        },
        {
          label: text.take,
          detail: agreed ? t('Elle rejoint les parties choisies') : t('Cochez d’abord l’attestation'),
          icon: 'download',
          tone: agreed ? 'ok' : undefined,
          run: () => {
            const job = parts?.key === key && parts.tableId === tableId ? parts : undefined;
            if (!agreed || !job) return host.redraw();
            job.attested.add(part);
            job.take.set(part, true);
            toParts();
          },
        },
        { label: t('Retour'), icon: 'back', run: toParts },
      ];
      return {
        heading: text.heading,
        icon: 'alert',
        subheading: partLabel(part),
        lead: text.what,
        sections: [
          { rows: [{ text: text.source, tone: 'warning', icon: 'alert' }] },
          {
            title: t('Attestation'),
            rows: [{ text: text.pledge, badges: [agreed ? t('Cochée') : t('À cocher')], tone: agreed ? 'ok' : 'warning', icon: agreed ? 'check' : 'close', action: 0, pick: true }],
          },
        ],
        actions,
        back: toParts,
      };
    };
    host.library.openCustom(build);
  }

  /** Ce que deviennent les fichiers reçus d'une table : sous un dossier neuf, chacun à son chemin relatif vérifié. */
  function tableJobFiles(dir: string, files: readonly TableFile[]): DownloadFile[] {
    return files
      .filter((f) => isSafeTableRel(f.rel))
      .map((f) => {
        const dest = path.join(dir, ...f.rel.split('/'));
        return { ref: f.id, name: f.rel, bytes: f.bytes, dest, part: `${dest}.part`, meta: { part: f.part } };
      });
  }

  /**
   * Toute la table d'un ami, ou des parties : un téléchargement de la file (il reprend seul si
   * l'ami se déconnecte), suivi ici tant que l'écran est ouvert ; Exit le laisse continuer.
   */
  function startTableFetch(key: string, tableId: string, owned: TableEntry | undefined, identity: TableIdentity | undefined, chosen: readonly TableFile[], attested: ReadonlySet<GamePart>, back: () => void): void {
    const files = attestedTableFiles(chosen, attested);
    const folder = identity ? (identity.manufacturer && identity.year ? `${identity.title} (${identity.manufacturer} ${identity.year})` : identity.title) : 'Table';
    // Une table qu'on a déjà : le dossier reçu porte le nom du nôtre, le plan l'y range.
    const dir = content.tableDir(owned ? owned.folder.split(/[\\/]/).pop()! : folder);
    const job = downloads.manager.add({
      kind: 'friend-table',
      title: owned ? t('Parties de {table}', { table: owned.title }) : t('Toute la table : {table}', { table: identity?.title ?? folder }),
      source: { kind: 'friend', label: friendName(key), key },
      files: tableJobFiles(dir, files),
      back: owned ? { screen: 'game-parts', table: owned.file } : { screen: 'friend-library', friend: key, table: tableId },
      // L'attestation des droits suit le téléchargement : ce que le joueur a accepté, et quand.
      data: { table: tableId, dir, ...(owned ? { owned: owned.file } : identity ? { identity } : {}), ...(attested.size ? { attested: [...attested], attestedAt: new Date().toISOString() } : {}) },
      resumable: true,
    });
    showTransfer(job.id, back);
  }

  /** Médias d'une table d'un ami : un téléchargement de la file, rendu au brouillon de « Médias du jeu ». */
  function startFetch(key: string, table: TableEntry, tableId: string, medias: readonly LibraryMedia[], back: () => void): void {
    const id = `amis-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const label = (m: LibraryMedia) => (m.page ? t('{label}, page {page}', { label: mediaTypeInfo(m.type).label, page: m.page }) : mediaTypeInfo(m.type).label);
    const job = downloads.manager.add({
      id,
      kind: 'friend-media',
      title: medias.length === 1 ? t('{label} de {table}', { label: label(medias[0]!), table: table.title }) : t('{n} médias de {table}', { n: medias.length, table: table.title }),
      source: { kind: 'friend', label: friendName(key), key },
      files: medias.map((m, i) => ({ ref: m.id, name: label(m), bytes: m.bytes, part: path.join(content.receivedDir(), `${id}-${i}.part`), meta: { media: m } })),
      back: { screen: 'table-medias', table: table.file },
      data: { table: tableId, tableFile: table.file },
      resumable: true,
    });
    showTransfer(job.id, back);
  }

  function showTransfer(id: string, back: () => void): void {
    const build = () => buildTransfer(id, back);
    transfer = { id, build };
    host.library.openCustom(build);
  }

  /** Médias reçus et vérifiés : la table s'ouvre sur « Médias du jeu », ces fichiers dans le brouillon. */
  function deliverMedia(job: DownloadJob): boolean {
    const table = host.tables().find((x) => x.file === job.data?.tableFile);
    const got = job.files.filter((f) => f.done && f.file && fs.existsSync(f.file));
    if (!table || !got.length) return false;
    const key = job.source.key ?? '';
    const plain = job.source.label;
    const origin: MediaOriginDraft = { origin: t('la borne de {name}', { name: displayName(plain, key) }), url: `cyberpinball:ami/${key}` };
    const media = (f: DownloadFile) => f.meta?.media as LibraryMedia;
    const notice = got.length === 1 ? t('{label} reçu de {name} : vérifiez-le, puis enregistrez.', { label: mediaTypeInfo(media(got[0]!).type).label, name: plain }) : t('{n} médias reçus de {name} : vérifiez-les, puis enregistrez.', { n: got.length, name: plain });
    ownedTypes.delete(table.file);
    host.library.openMediasWith(table, got.map((f) => ({ type: media(f).type, file: f.file!, ...(media(f).page ? { page: media(f).page } : {}) })), origin, notice);
    return true;
  }

  /** Table reçue, chaque fichier vérifié : le plan d'ajout, vers la nôtre quand on l'a déjà ; « Annuler » ramène à l'écran d'origine. */
  function deliverTable(job: DownloadJob): boolean {
    const dir = typeof job.data?.dir === 'string' ? job.data.dir : undefined;
    if (!dir || !fs.existsSync(dir)) return false;
    const owned = host.tables().find((x) => x.file === job.data?.owned);
    if (owned) ownedTypes.delete(owned.file);
    else seedIdentity(dir, parseTableIdentity(job.data?.identity));
    host.library.installReceived(dir, owned, () => downloads.openReturn(job.back));
    return true;
  }

  /**
   * Toute une table reçue garde le nom qu'elle a chez l'ami : un .info à ses titre, fabricant,
   * année et jeu VPS, que le plan d'ajout prend avant le nom du jeu chez VPS. Sans lui, les deux
   * bornes nommeraient la même table autrement (« Game of Thrones LE » chez l'ami, « Game of
   * Thrones (Limited Edition) » ici) et ne se reconnaîtraient plus : « vous ne l'avez pas » dans
   * sa bibliothèque, à ses invitations.
   */
  function seedIdentity(dir: string, identity: TableIdentity | undefined): void {
    if (!identity?.title) return;
    try {
      if (fs.readdirSync(dir).some((f) => f.toLowerCase().endsWith('.info'))) return;
      const info = { Title: identity.title, ...(identity.manufacturer ? { Manufacturer: identity.manufacturer } : {}), ...(identity.year ? { Year: identity.year } : {}), ...(identity.vpsId ? { VPSId: identity.vpsId } : {}) };
      fs.writeFileSync(path.join(dir, `${path.basename(dir)}.info`), JSON.stringify({ Info: info }, null, 2) + '\n', 'utf8');
    } catch {
      // Sans .info, la table prend le nom de son jeu chez VPS ; l'invitation la reconnaît encore à son .vpx.
    }
  }

  // Le téléchargement finit sous les yeux de l'utilisateur (son écran de réception ouvert) : rendu tout de suite.
  const finishedHere = (deliver: (job: DownloadJob) => boolean) => (job: DownloadJob) => {
    if (!transfer || transfer.id !== job.id || !host.library.isShowing(transfer.build)) return false;
    transfer = undefined;
    if (!deliver(job)) return false;
    downloads.manager.delivered(job.id);
    return true;
  };
  downloads.finisher('friend-media', finishedHere(deliverMedia));
  downloads.finisher('friend-table', finishedHere(deliverTable));
  downloads.deliverer('friend-media', deliverMedia);
  downloads.deliverer('friend-table', deliverTable);
  // « Revenir à : Bibliothèque de Bruno » : sa bibliothèque, sur la table d'où venait le téléchargement.
  downloads.opener('friend-library', (to) => {
    if (to.screen !== 'friend-library') return;
    const home = () => open(to.friend, () => host.library.openSystem());
    if (to.table && ready(to.friend)?.tables.some((x) => x.id === to.table)) openTable(to.friend, to.table, home);
    else home();
  });

  /** Écran de la réception : ce téléchargement de la file, en direct ; Exit le laisse continuer en arrière-plan. */
  function buildTransfer(id: string, back: () => void): Built {
    const job = downloads.manager.get(id);
    const whole = job?.kind === 'friend-table';
    const plain = job?.source.label ?? '';
    const leave = () => {
      if (job && (job.state === 'running' || job.state === 'queued' || job.state === 'waiting')) flash = { text: t('La réception continue'), detail: t('Téléchargements, dans le menu système, pour la suivre'), tone: 'info' };
      transfer = undefined;
      back();
    };
    const rows: Row[] = [];
    if (!job) rows.push({ text: t('Réception retirée de la liste'), tone: 'quiet' });
    else {
      const { index, count } = currentFile(job);
      const { received, total } = jobBytes(job);
      const amount = t('{done} sur {total} · {percent} %', { done: formatSize(received, true), total: formatSize(total ?? received), percent: total ? Math.floor((100 * received) / total) : 0 });
      if (job.state === 'waiting') rows.push({ text: downloadStateLabel(job), detail: [amount, downloadReasonText(job), t('reprise automatique à son retour')].filter(Boolean).join(' · '), icon: 'refresh', tone: 'warning' });
      else if (job.state === 'failed') rows.push({ text: t('Réception arrêtée'), detail: downloadReasonText(job), icon: 'alert', tone: 'error' });
      else if (job.state === 'cancelled') rows.push({ text: t('Réception annulée'), tone: 'info' });
      else if (job.state === 'done') rows.push({ text: t('Reçu et vérifié'), detail: amount, icon: 'check', tone: 'ok' });
      else if (received || job.state === 'running') rows.push({ text: t('Fichier {i} sur {n}', { i: index, n: count }), detail: amount, icon: 'download', tone: 'info' });
      else rows.push({ text: t('Demande à sa borne…'), icon: 'clock', tone: 'quiet' });
    }
    const actions: Action[] = [];
    if (job && (job.state === 'running' || job.state === 'queued' || job.state === 'waiting')) {
      actions.push({ label: t('Continuer en arrière-plan'), detail: t('Suivi dans Téléchargements ; il ramène ici une fois fini'), icon: 'back', run: leave });
      actions.push({ label: t('Annuler la réception'), detail: t('Ce qui est reçu est effacé'), icon: 'close', tone: 'error', run: () => { downloads.manager.cancel(id); flash = { text: t('Réception annulée'), tone: 'info' }; transfer = undefined; back(); } });
    } else if (job?.state === 'done') actions.push({ label: t('Ouvrir ce qui est reçu'), icon: 'check', tone: 'ok', run: () => downloads.deliver(job) });
    else actions.push({ label: t('Retour'), icon: 'back', run: leave });
    return {
      heading: whole ? t('Réception de la table') : t('Réception des médias'),
      icon: whole ? 'table-add' : 'image-download',
      subheading: job ? t('de {name} · {table}', { name: plain, table: job.title }) : undefined,
      lead: whole
        ? t('Chaque fichier est vérifié à l’arrivée (taille, empreinte), puis le plan d’ajout montre tout avant d’installer. Si {name} se déconnecte, la réception reprend seule à son retour.', { name: plain })
        : t('Chaque fichier est vérifié à l’arrivée (taille, empreinte, contenu) avant d’entrer dans le brouillon des médias de votre table. Si {name} se déconnecte, la réception reprend seule à son retour.', { name: plain }),
      sections: [{ rows }],
      actions,
      back: leave,
    };
  }

  return {
    open,
    detail,
    openMatching(key, identity, back, want) {
      const entry = ready(key)?.tables.find((x) => sameTable(x.table, identity));
      if (!entry) return open(key, back);
      // Sa version d'une table qu'on a : droit au choix des parties, celles demandées cochées.
      if (want?.length && matchOf(key, entry.id)?.mine) return openParts(key, entry.id, () => openTable(key, entry.id, back), want);
      openTable(key, entry.id, back);
    },
    has(key, table) {
      const library = ready(key);
      if (!library) return false;
      const id = tableIdentity(table, host.romsOf?.(table) ?? []);
      return matchLibrary(library, [{ table, identity: id }]).some((m) => m.mine);
    },
  };
}
