// Bibliothèque d'un ami à l'écran (friend-content.ts, packages/core/src/friendlibrary.ts) : ses
// tables, celles qu'on a aussi et les autres ; pour une table, ses médias et ceux qui nous
// manquent, et ses parties (table, fronton, ROM, PuP-Pack, sons…). On récupère toute une table
// qu'on n'a pas ; d'une table qu'on a déjà, on choisit partie par partie ce qu'on prend de l'ami
// et ce qu'on garde. La ROM est décochée d'office (décision du 29/10/2026). Puis la
// réception, avec sa progression et « Annuler » : les médias seuls entrent dans le brouillon de
// « Médias du jeu » ; une table, ou des parties, passent par le plan d'ajout (rien n'est rangé
// avant « Installer »).
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec des services d'essai.

import {
  defaultPartChoice,
  displayName,
  fileRefusalLabel,
  formatSize,
  friendParts,
  installedParts,
  partLabel,
  partRightsNote,
  librarySize,
  MANAGED_MEDIA_TYPES,
  matchLibrary,
  mediaTypeInfo,
  missingMedias,
  ownMediaPages,
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
import type { FetchProgress, FriendContent } from './friend-content';
import type { Action, Built, Row, Section } from './library';
import type { LiveMenu } from './live-game-menu';
import type { SocialNet } from './social-net';

export interface FriendLibraryMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
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
  openMatching(key: string, identity: TableIdentity, back: () => void): void;
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
  let transfer: { key: string; table: TableEntry | string; whole?: boolean; progress?: FetchProgress; abort: AbortController } | undefined;
  /** Parties de la table d'un ami, demandées à l'ouverture de l'écran des parties, et ce qu'on en prend. */
  let parts: { key: string; tableId: string; files?: TableFile[]; error?: string; take: Map<GamePart, boolean> } | undefined;

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
      if (host.net.online(key)) actions.push({ label: t('Inviter {name} à jouer', { name: plain }), detail: t('Partie en direct sur cette table'), icon: 'gamepad', run: () => host.live.inviteOn(owned, key, () => openTable(key, tableId, back)) });
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

  function openParts(key: string, tableId: string, back: () => void): void {
    const job: NonNullable<typeof parts> = { key, tableId, take: new Map() };
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
        for (const p of friendParts(files)) job.take.set(p.part, defaultPartChoice(p.part, have.has(p.part)));
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
        startTableFetch(key, tableId, owned, match?.entry.table, chosen.flatMap((p) => p.files), back);
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
      lead: owned ? t('Pour chaque partie : la sienne remplace la vôtre, ou vous gardez la vôtre. Le plan d’ajout montre tout avant d’installer.') : t('Toutes ses parties d’office, sauf la ROM et le PuP-Pack. Le plan d’ajout montre tout avant d’installer.'),
      sections,
      actions,
      back,
    };
  }

  function startTableFetch(key: string, tableId: string, owned: TableEntry | undefined, identity: TableIdentity | undefined, files: readonly TableFile[], back: () => void): void {
    const folder = identity ? (identity.manufacturer && identity.year ? `${identity.title} (${identity.manufacturer} ${identity.year})` : identity.title) : 'Table';
    const job = { key, table: owned ?? folder, whole: true, abort: new AbortController() } as NonNullable<typeof transfer>;
    transfer = job;
    host.library.openCustom(() => buildTransfer(back));
    void content
      .fetchTable(
        key,
        tableId,
        // Une table qu'on a déjà : le dossier reçu porte le nom du nôtre, le plan l'y range.
        owned ? owned.folder.split(/[\\/]/).pop()! : folder,
        files,
        (p) => {
          job.progress = p;
          host.redraw();
        },
        job.abort.signal,
      )
      .then((result) => {
        if (transfer === job) transfer = undefined;
        const failures = result.failed.filter((f) => f.reason !== 'cancelled');
        if (job.abort.signal.aborted) {
          flash = { text: t('Réception annulée'), tone: 'info' };
          return back();
        }
        if (!result.received.length || failures.length) {
          const why = [...new Set(failures.map((f) => fileRefusalLabel(f.reason)))].join(' ; ');
          flash = { text: tn(failures.length, '{n} fichier pas reçu : rien n’est installé', '{n} fichiers pas reçus : rien n’est installé'), detail: why || undefined, tone: 'warning' };
          return back();
        }
        if (owned) ownedTypes.delete(owned.file);
        host.library.installReceived(result.dir, owned, back);
      });
  }

  // ---------- Réception ----------

  function startFetch(key: string, table: TableEntry, tableId: string, medias: readonly LibraryMedia[], back: () => void): void {
    const job = { key, table, abort: new AbortController() } as NonNullable<typeof transfer>;
    transfer = job;
    host.library.openCustom(() => buildTransfer(back));
    void content
      .fetch(
        key,
        tableId,
        medias,
        (p) => {
          job.progress = p;
          host.redraw();
        },
        job.abort.signal,
      )
      .then((result) => {
        if (transfer === job) transfer = undefined;
        const plain = friendName(key);
        const failures = result.failed.filter((f) => f.reason !== 'cancelled');
        const why = [...new Set(failures.map((f) => fileRefusalLabel(f.reason)))].join(' ; ');
        if (result.received.length) {
          const origin: MediaOriginDraft = { origin: t('la borne de {name}', { name: displayName(plain, key) }), url: `cyberpinball:ami/${key}` };
          const received =
            result.received.length === 1
              ? t('{label} reçu de {name} : vérifiez-le, puis enregistrez.', { label: mediaTypeInfo(result.received[0]!.media.type).label, name: plain })
              : t('{n} médias reçus de {name} : vérifiez-les, puis enregistrez.', { n: result.received.length, name: plain });
          const notice = failures.length ? `${received} ${tn(failures.length, '{n} refusé : {why}.', '{n} refusés : {why}.', { why })}` : received;
          ownedTypes.delete(table.file);
          host.library.openMediasWith(table, result.received.map((r) => ({ type: r.media.type, file: r.file, ...(r.media.page ? { page: r.media.page } : {}) })), origin, notice);
          return;
        }
        flash = job.abort.signal.aborted ? { text: t('Réception annulée'), tone: 'info' } : { text: t('Aucun média reçu'), detail: why || undefined, tone: 'warning' };
        back();
      });
  }

  function buildTransfer(back: () => void): Built {
    const job = transfer;
    const p = job?.progress;
    const plain = job ? friendName(job.key) : '';
    const tableTitle = job ? (typeof job.table === 'string' ? job.table : job.table.title) : '';
    return {
      heading: job?.whole ? t('Réception de la table') : t('Réception des médias'),
      icon: job?.whole ? 'table-add' : 'image-download',
      subheading: job ? t('de {name} · {table}', { name: plain, table: tableTitle }) : undefined,
      lead: job?.whole
        ? t('Chaque fichier est vérifié à l’arrivée (taille, empreinte), puis le plan d’ajout montre tout avant d’installer.')
        : t('Chaque fichier est vérifié à l’arrivée (taille, empreinte, contenu) avant d’entrer dans le brouillon des médias de votre table.'),
      sections: [
        {
          rows: [
            p
              ? { text: t('Fichier {i} sur {n}', { i: p.index, n: p.total }), detail: t('{done} sur {total} · {percent} %', { done: formatSize(p.bytes, true), total: formatSize(p.totalBytes), percent: p.totalBytes ? Math.floor((100 * p.bytes) / p.totalBytes) : 0 }), icon: 'download', tone: 'info' }
              : { text: t('Demande à sa borne…'), icon: 'clock', tone: 'quiet' },
          ],
        },
      ],
      actions: [{ label: t('Annuler'), icon: 'close', run: () => job?.abort.abort() }],
      back: () => {
        job?.abort.abort();
        if (!job) back();
      },
    };
  }

  return {
    open,
    detail,
    openMatching(key, identity, back) {
      const entry = ready(key)?.tables.find((x) => sameTable(x.table, identity));
      if (entry) openTable(key, entry.id, back);
      else open(key, back);
    },
    has(key, table) {
      const library = ready(key);
      if (!library) return false;
      const id = tableIdentity(table, host.romsOf?.(table) ?? []);
      return matchLibrary(library, [{ table, identity: id }]).some((m) => m.mine);
    },
  };
}
