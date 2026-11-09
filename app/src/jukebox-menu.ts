// Juke-box, étape 4 : Menu système > Juke-box, la gestion des playlists et leur import.
// - La liste des playlists, chacune en carte (morceaux, durée, place, qualité, sources ou dernière
//   synchro) ; les actions de la playlist choisie : ajouter des fichiers, renommer, réordonner,
//   qualité, resynchroniser avec YouTube, tout télécharger, libérer la place, supprimer ; la place
//   prise et l'espace libre. Créer et importer en tête.
// - L'import d'une playlist (ou d'une vidéo) YouTube : le lien vient du téléphone (le clavier à
//   l'écran se remplit depuis la télécommande), du clavier (Ctrl+V) ou de « Récupérer » (bouton
//   « Ajouter au Juke-box »). Nombre de morceaux, durée, taille estimée ; un seul choix par groupe :
//   tout prendre ou choisir, nouvelle ou existante, en ligne ou télécharger, la qualité. Les vidéos
//   sautées le sont avec leur raison.
// - L'ajout de fichiers locaux : un fichier ou un dossier, sous-dossiers compris, le nombre trouvé
//   annoncé avant l'ajout, les formats acceptés, les refusés avec leur raison. Au bureau par
//   l'explorateur de Windows, en borne par le sélecteur de Cyber Pinball.
// - La correction des informations d'un morceau (titre, artiste, album) : elle l'emporte sur YouTube.
// Toute fonction indisponible (hors ligne, yt-dlp absent, disque plein) reste visible, grisée avec
// sa raison. Le cœur : packages/core/src/jukebox-manage.ts ; le service : jukebox-library.ts.
// Maquettes de la gestion et de l'import validées le 09/11/2026.

import * as path from 'node:path';
import {
  acceptedFormatsText,
  availabilityText,
  createPlaylist,
  defaultImportChoices,
  deletePlaylist,
  downloadAllPlan,
  downloadBlocker,
  estimateText,
  findPlaylist,
  formatSize,
  formatTotalTime,
  formatTrackTime,
  importActionLabel,
  importBlocker,
  isVideoAnalysis,
  JUKEBOX_AUDIO_EXTENSIONS,
  JUKEBOX_QUALITIES,
  JUKEBOX_VIDEO_EXTENSIONS,
  localScanSummary,
  mediaUrl,
  movePlaylist,
  parseMusicTitle,
  playlistEstimate,
  playlistFacts,
  playlistKind,
  playlistNameProblem,
  playlistSecondLine,
  qualityBadge,
  moveTrack,
  removeTrack,
  renamePlaylist,
  retainedText,
  setCorrection,
  skippedText,
  songKey,
  summarizeImport,
  t,
  tn,
  youtubeBlocker,
  type ImportChoices,
  type JukeboxAbility,
  type JukeboxQuality,
  type LocalScan,
  type NavigationKeys,
  type PlaylistAnalysis,
  type PlaylistEntry,
  type TrackInfo,
} from '@cyberpinball/core';
import type { Input } from 'electron';
import type { PickRequest } from './file-picker';
import type { JukeboxLibrary, TrackView } from './jukebox-library';
import type { Action, Built, Row, Section, Tone } from './library';
import { allowPreview } from './media-protocol';

export interface JukeboxMenuHost {
  jukebox: JukeboxLibrary;
  /** Ouvre un écran décrit (openCustom), le curseur sur `at`. */
  show(build: () => Built, at?: number): void;
  /** Cet écran est affiché (une analyse finie ne rouvre pas l'import si l'on est parti ailleurs). */
  showing(build: () => Built): boolean;
  openSystem(): void;
  /** Le lecteur du Juke-box, sur cette playlist (la gestion ouverte du lecteur y revient). */
  openPlayer(playlist?: string): void;
  /** Retour à la roue des tables. */
  leave(): void;
  /** Saisie d'un texte : clavier à l'écran, vrai clavier (Ctrl+V), ou téléphone. */
  prompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
  /** Sélecteur de fichiers de Cyber Pinball (borne). */
  pick(request: Omit<PickRequest, 'done' | 'cancel'>): Promise<string[] | undefined>;
  /** Explorateur de Windows (bureau) ; absent : le sélecteur de Cyber Pinball partout. */
  pickNative?(mode: 'files' | 'folder', title: string): Promise<string[] | undefined>;
  /** Le menu est au bureau (playfield en largeur) : explorateur de Windows, la musique continue. */
  landscape(): boolean;
  cursor(): number;
  redraw(): void;
  keys(): NavigationKeys;
  /** Ce dont dépendent les fonctions : installé, réseau, yt-dlp, espace libre. */
  ability(): JukeboxAbility;
  /** Opération longue (relevé d'un dossier) : l'écran d'attente du menu. */
  task(message: string, work: () => Promise<void> | void): Promise<void>;
  /** Un téléphone pilote le menu : l'écran d'import le dit. */
  phone?(): boolean;
}

type Flash = { text: string; tone: Tone };

/** Où l'on en est d'un import. */
interface ImportState {
  link: string;
  /** Playlist visée d'abord (import lancé depuis ses morceaux). */
  prefer?: string;
  /** D'où vient le lien : téléphone ou clavier (saisie), fenêtre « Récupérer ». */
  from: 'prompt' | 'recuperer';
  phase: 'analyzing' | 'ready' | 'failed' | 'done';
  abort?: AbortController;
  /** Seconde lecture en cours (champs musicaux, indisponibilités) : l'import est déjà possible. */
  checking?: boolean;
  analysis?: PlaylistAnalysis;
  reason?: string;
  choices?: ImportChoices;
  /** Import lancé : la playlist et les morceaux ajoutés. */
  result?: { playlist: string; keys: string[]; duplicates: number; skipped: number };
}

const SOURCE_ICON = { online: 'globe', download: 'download', file: 'folder' } as const;

export function createJukeboxMenu(host: JukeboxMenuHost) {
  const jb = host.jukebox;
  /** Dernier écran de la gestion ouvert, et saisie en cours : le lecteur habille le fronton et le DMD tant que l'un d'eux est affiché. */
  let shown: (() => Built) | undefined;
  let asking = false;
  /** Sélecteur de fichiers ouvert depuis la gestion (galerie en borne) : on y est toujours. */
  let picking = false;
  const display = (build: () => Built, at?: number) => {
    shown = build;
    host.show(build, at);
  };
  const ask = (heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string) => {
    asking = true;
    host.prompt(heading, label, value, (v) => {
      asking = false;
      done(v);
    }, lead);
  };
  /** Playlist choisie : les actions s'y appliquent ; elle suit le curseur dans la liste. */
  let chosen: string | undefined;
  let flash: Flash | undefined;
  /** Resynchronisations en cours, par playlist. */
  const syncing = new Set<string>();
  let current: ImportState | undefined;

  const store = () => jb.store();
  const playlistOf = (id: string | undefined) => (id ? findPlaylist(store(), id) : undefined);
  const chosenPlaylist = () => playlistOf(chosen) ?? store().playlists[0];

  /** Adresse d'une image locale pour le rendu (protocole des médias) ; une image en ligne n'en a pas. */
  function imageUrl(file: string | undefined): string | undefined {
    if (!file || /^https?:/i.test(file)) return undefined;
    allowPreview(file);
    return mediaUrl(file);
  }

  /** Vignette d'une playlist : la miniature du premier morceau qui en a une sur la borne. */
  function playlistImage(id: string): string | undefined {
    const p = playlistOf(id);
    if (!p) return undefined;
    for (const tr of p.tracks) {
      const thumb = tr.youtube ? jb.songs().get(tr.youtube)?.thumbnail : undefined;
      if (thumb) return imageUrl(thumb);
    }
    return undefined;
  }

  /**
   * Gestes de retour, une seule fonction par destination : l'action « Retour » d'un écran et son
   * Exit sont alors le même geste, et le bouton en tête nomme la bonne destination (library.ts, backLabel).
   */
  const returns = new Map<string, () => void>();
  const to = (key: string, go: () => void) => returns.get(key) ?? (returns.set(key, go), go);
  const toManage = (id: string) => to(`manage:${id}`, () => open(id));
  const toTracks = (id: string, key?: string) => to(`tracks:${id}:${key ?? ''}`, () => openTracks(id, key));
  const toImport = () => to('import', () => showImport());

  /**
   * D'où la gestion a été ouverte : du lecteur (« Gestion du Juke-box », Start sur le médaillon sans
   * playlist), où Exit ramène, ou du menu système (son raccourci « Juke-box »), où il ramène.
   */
  let from: 'player' | 'system' = 'player';
  /** Exit de la gestion : le lecteur sur la playlist choisie, la roue s'il n'y a aucune playlist, ou le menu système. */
  const back = () => {
    flash = undefined;
    if (from === 'system') return host.openSystem();
    if (store().playlists.length) host.openPlayer(chosen);
    else host.leave();
  };
  /** En tête de chaque écran : le nom de l'interface, et d'où l'on vient. */
  const app = (trail?: string) => ({ name: t('Juke-box'), ...(trail ? { trail } : {}) });
  /** Une action indisponible : grisée, sa raison en détail, rien au Start. */
  const quiet = (reason: string) => ({ tone: 'quiet' as const, detail: reason });

  // ---------- « Menu système > Juke-box » ----------

  /** L'entrée du menu système : son détail résume la bibliothèque. */
  function detail(): string {
    const s = store();
    if (!s.playlists.length) return t('Aucune playlist : importez-en une de YouTube, ou ajoutez vos fichiers');
    const usage = jb.usage();
    return [tn(s.playlists.length, '{n} playlist', '{n} playlists'), tn(usage.entries, '{n} morceau', '{n} morceaux'), ...(usage.duration ? [formatTotalTime(usage.duration)] : []), ...(usage.bytes ? [t('{size} sur la borne', { size: formatSize(usage.bytes) })] : [])].join(' · ');
  }

  /** La gestion des playlists ; `focus` : la playlist à choisir. En borne, la musique s'arrête. */
  function open(focus?: string, origin?: 'player' | 'system'): void {
    if (origin) from = origin;
    if (focus) chosen = focus;
    jb.manageOpened(!host.landscape());
    show(manageScreen);
  }

  /**
   * Ouvre la gestion, le curseur sur la playlist choisie (ou sur « Importer » s'il n'y en a pas) :
   * ses deux premières actions sont « Importer » et « Nouvelle playlist », puis les playlists.
   */
  function show(build: () => Built): void {
    const playlists = store().playlists;
    const index = Math.max(0, playlists.findIndex((p) => p.id === chosen));
    display(build, playlists.length ? 2 + index : 0);
  }

  function manageScreen(): Built {
    const s = store();
    const ability = host.ability();
    const usage = jb.usage();
    const actions: Action[] = [];
    const add = (a: Action) => actions.push(a) - 1;
    const sections: Section[] = [];

    // Ce qui vient de se passer (import, ajout, synchro), en tête.
    if (flash) sections.push({ kind: 'jb-flash', rows: [{ text: flash.text, tone: flash.tone, icon: flash.tone === 'ok' ? 'check' : 'alert' }] });

    // En tête : importer de YouTube, créer une playlist vide.
    const youtube = youtubeBlocker(ability);
    const global: Row[] = [];
    const importAt = add({ label: t('Importer de YouTube'), key: 'import', icon: 'link', run: () => (youtube ? undefined : askLink()) });
    global.push({ text: t('Importer de YouTube'), icon: 'link', action: importAt, pick: true, ...(youtube ? quiet(youtube) : {}) });
    const createAt = add({ label: t('Nouvelle playlist'), key: 'create', icon: 'plus', run: () => askName() });
    global.push({ text: t('Nouvelle playlist'), icon: 'plus', action: createAt, pick: true });
    sections.push({ kind: 'jb-global', options: true, rows: global });

    // Les playlists, en cartes ; Start ouvre ses morceaux.
    const cursor = host.cursor();
    const rows: Row[] = [];
    for (const p of s.playlists) {
      const at = add({ label: p.name, key: `playlist:${p.id}`, run: () => openTracks(p.id) });
      if (at === cursor) chosen = p.id;
      const u = usage.playlists.get(p.id);
      const image = playlistImage(p.id);
      const sync = syncing.has(p.id) ? t('Synchronisation avec YouTube…') : undefined;
      rows.push({ text: p.name, detail: playlistFacts(p, u), sub: sync ?? playlistSecondLine(p), aside: qualityBadge(p.quality), thumb: image ?? 'music', action: at, pick: true });
    }
    const pick = chosenPlaylist();
    if (pick) chosen = pick.id;
    for (const row of rows) {
      if (actions[row.action!]!.key !== `playlist:${chosen}`) continue;
      row.current = true;
      row.badges = [t('Choisie')];
    }
    sections.push({ title: t('Playlists'), kind: 'jb-playlists', rows: rows.length ? rows : [{ text: t('Aucune playlist'), detail: t('Importez une playlist de YouTube, ou créez-en une pour y ajouter vos fichiers.'), tone: 'quiet', icon: 'jukebox' }] });

    // Les actions de la playlist choisie : les actions de l'écran, sous son nom.
    let actionsTitle: string | undefined;
    if (pick) {
      const u = usage.playlists.get(pick.id);
      const act = (label: string, icon: Action['icon'], key: string, run: () => void, reason?: string, note?: string) => {
        add({ label, icon, key, run: () => (reason ? undefined : run()), ...(reason ? quiet(reason) : note ? { detail: note } : {}) });
      };
      act(t('Ajouter des fichiers'), 'folder', 'files', () => openFiles(pick.id));
      act(t('Renommer'), 'edit', 'rename', () => askRename(pick.id));
      act(t('Réordonner'), 'sort', 'reorder', () => openReorder(pick.id), s.playlists.length < 2 ? t('Une seule playlist') : undefined);
      act(t('Qualité sur la borne'), 'quality', 'quality', () => openQuality(pick.id), undefined, qualityBadge(pick.quality));
      const resyncReason = !pick.youtube ? t('Pas importée de YouTube') : syncing.has(pick.id) ? t('Synchronisation en cours') : youtube;
      act(t('Resynchroniser avec YouTube'), 'refresh', 'resync', () => void resync(pick.id), resyncReason);
      const plan = downloadAllPlan(pick, jb.songs());
      const onlineCount = pick.tracks.filter((tr) => tr.source === 'online').length;
      act(t('Tout télécharger'), 'download', 'download-all', () => openDownloadAll(pick.id), !onlineCount ? t('Aucun morceau en ligne') : downloadBlocker(ability, plan.bytes));
      const downloaded = pick.tracks.some((tr) => tr.source === 'download');
      act(t('Libérer la place'), 'globe', 'free', () => openFree(pick.id), !downloaded ? t('Rien de téléchargé') : !u?.bytes ? t('Rien n’est encore sur la borne') : undefined);
      act(t('Morceaux et informations'), 'list', 'tracks', () => openTracks(pick.id), !pick.tracks.length ? t('Playlist vide') : undefined);
      act(t('Supprimer la playlist…'), 'trash', 'delete', () => openDelete(pick.id));
      actionsTitle = `${pick.name} · ${playlistKind(pick)}`;
    }

    // La place prise et l'espace libre.
    const free = jb.usage().free;
    sections.push({
      kind: 'jb-disk',
      rows: [
        {
          text: [t('{size} utilisés', { size: formatSize(usage.bytes) }), ...(free !== undefined ? [t('{size} libres', { size: formatSize(free) })] : [])].join(' · '),
          detail: [t('En ligne : 0 octet'), t('un morceau partagé par plusieurs playlists compte une fois'), ...(usage.orphans.length ? [tn(usage.orphans.length, '{n} morceau sans playlist ({size})', '{n} morceaux sans playlist ({size})', { size: formatSize(usage.orphanBytes) })] : [])].join(' · '),
          icon: 'drive',
        },
      ],
    });
    // Exit : le lecteur (ouverte de lui), ou le menu système (son raccourci).
    add({ label: from === 'player' && s.playlists.length ? t('Retour au lecteur') : t('Retour'), icon: 'back', key: 'back', run: back });
    return {
      heading: t('Vos playlists'),
      subheading: s.playlists.length ? detail() : t('Gestion des playlists'),
      app: app(),
      variant: 'jukebox jukebox-manage',
      sections,
      actions,
      ...(actionsTitle ? { actionsTitle } : {}),
      back,
      listStart: t('ouvrir ses morceaux'),
    };
  }

  // ---------- Créer, renommer, réordonner, supprimer ----------

  function askName(value = '', problem?: string): void {
    ask(t('Nouvelle playlist'), t('Nom de la playlist'), value, (name) => {
      if (name === undefined) return open();
      const change = jb.apply(createPlaylist(store(), name, new Date()));
      if (!change.ok) return askName(name, change.reason);
      flash = { text: t('Playlist « {name} » créée : importez-y de YouTube ou ajoutez vos fichiers.', { name: change.playlist.name }), tone: 'ok' };
      open(change.playlist.id);
    }, problem ?? t('Une playlist vide, à remplir de vos fichiers ou de morceaux YouTube.'));
  }

  function askRename(id: string, value?: string, problem?: string): void {
    const p = playlistOf(id);
    if (!p) return open();
    ask(t('Renommer « {name} »', { name: p.name }), t('Nom de la playlist'), value ?? p.name, (name) => {
      if (name === undefined) return open(id);
      const change = jb.apply(renamePlaylist(store(), id, name, new Date()));
      if (!change.ok) return askRename(id, name, change.reason);
      open(id);
    }, problem);
  }

  /** Réordonner : flippers déplacent la playlist, Start enregistre, Exit annule (l'ordre d'avant revient). */
  function openReorder(id: string): void {
    const before = store().playlists.map((p) => p.id);
    const restore = () => {
      const s = store();
      const order = new Map(before.map((x, i) => [x, i]));
      jb.commit({ ...s, playlists: [...s.playlists].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) });
    };
    const cancel = () => {
      restore();
      open(id);
    };
    const save = () => open(id);
    const move = (delta: number) => void jb.commit(movePlaylist(store(), id, delta));
    const build = (): Built => {
      const s = store();
      const rows: Row[] = s.playlists.map((p, i) => ({ text: p.name, detail: playlistFacts(p, undefined), aside: `${i + 1}`, thumb: playlistImage(p.id) ?? 'music', ...(p.id === id ? { current: true, badges: [t('Se déplace')] } : {}) }));
      const at = s.playlists.findIndex((p) => p.id === id);
      return {
        heading: t('Réordonner'),
        icon: 'sort',
        subheading: playlistOf(id)?.name,
        lead: t('Flippers : monter ou descendre la playlist · Start : enregistrer · Exit : annuler. L’ordre est celui des MagnaSave dans le Juke-box.'),
        variant: 'jukebox jukebox-order', app: app(),
        sections: [{ kind: 'jb-playlists', rows }],
        actions: [
          { label: t('Monter'), icon: 'move-up', key: 'up', run: () => move(-1), ...(at <= 0 ? { tone: 'quiet' as const, detail: t('Déjà en tête') } : {}) },
          { label: t('Descendre'), icon: 'move-down', key: 'down', run: () => move(1), ...(at >= s.playlists.length - 1 ? { tone: 'quiet' as const, detail: t('Déjà en dernier') } : {}) },
          { label: t('Enregistrer l’ordre'), icon: 'check', key: 'save', run: save },
          { label: t('Annuler'), icon: 'close', key: 'cancel', run: cancel },
        ],
        back: cancel,
        hint: t('Flippers : déplacer · Start : enregistrer · Exit : annuler'),
        keys: (input: Input) => {
          if (input.type !== 'keyDown') return false;
          const k = host.keys();
          if (k.previous.includes(input.code)) return (move(-1), true);
          if (k.next.includes(input.code)) return (move(1), true);
          if (k.confirm.includes(input.code)) return (save(), true);
          return false;
        },
      };
    };
    display(build, 2);
  }

  /** Suppression : écran à part, « Conserver » choisi d'abord, aucun délai qui valide seul. */
  function openDelete(id: string): void {
    const build = (): Built => {
      const p = playlistOf(id);
      if (!p) return manageScreen();
      const preview = deletePlaylist(store(), id);
      const orphans = preview.ok ? preview.orphans.filter((x) => jb.songs().has(x)) : [];
      const bytes = orphans.reduce((n, x) => n + (jb.songs().get(x)?.bytes ?? 0), 0);
      const remove = (wipe: boolean) => {
        const change = jb.apply(deletePlaylist(store(), id));
        if (!change.ok) return open(id);
        const freed = wipe ? jb.removeSongs(orphans) : 0;
        flash = { text: freed ? t('« {name} » supprimée · {size} libérés', { name: p.name, size: formatSize(freed) }) : t('« {name} » supprimée', { name: p.name }), tone: 'ok' };
        chosen = undefined;
        open();
      };
      const actions: Action[] = [
        { label: t('Conserver la playlist'), icon: 'back', key: 'keep', run: toManage(id) },
        { label: t('Supprimer la playlist'), icon: 'trash', key: 'delete', tone: 'error', run: () => remove(false) },
      ];
      if (bytes) actions.push({ label: t('Supprimer et libérer {size}', { size: formatSize(bytes) }), icon: 'broom', key: 'delete-wipe', tone: 'error', detail: tn(orphans.length, '{n} morceau téléchargé ne sert qu’à elle', '{n} morceaux téléchargés ne servent qu’à elle'), run: () => remove(true) });
      return {
        heading: t('Supprimer « {name} » ?', { name: p.name }),
        icon: 'trash',
        lead: t('La playlist est retirée du Juke-box. Vos fichiers locaux et la playlist sur YouTube ne sont pas touchés.'),
        variant: 'jukebox jukebox-confirm', app: app(),
        sections: [{ rows: [{ text: p.name, detail: playlistFacts(p, jb.usage().playlists.get(p.id)), sub: playlistSecondLine(p), thumb: playlistImage(p.id) ?? 'music' }] }],
        actions,
        back: toManage(id),
      };
    };
    display(build, 0);
  }

  // ---------- Qualité, tout télécharger, libérer la place, resynchroniser ----------

  function openQuality(id: string): void {
    const build = (): Built => {
      const p = playlistOf(id);
      if (!p) return manageScreen();
      const actions: Action[] = [];
      const rows: Row[] = JUKEBOX_QUALITIES.map((q) => {
        const at = actions.push({ label: qualityBadge(q), key: `quality:${q}`, run: () => chooseQuality(id, q) }) - 1;
        const size = playlistEstimate(p, q, new Map());
        return { text: qualityBadge(q), detail: q === 'audio' ? t('Pochette ou visualiseur sur le fronton') : t('Le clip sur le fronton'), aside: size ? estimateText(size) : undefined, check: q === p.quality ? 'on' : 'off', current: q === p.quality, action: at, pick: true };
      });
      actions.push({ label: t('Retour aux playlists'), icon: 'back', key: 'back', run: toManage(id) });
      return {
        heading: t('Qualité sur la borne'),
        icon: 'quality',
        subheading: p.name,
        lead: t('Pour les morceaux téléchargés sur la borne. En ligne, YouTube choisit la qualité. Un morceau partagé par plusieurs playlists est gardé dans la meilleure qualité demandée.'),
        variant: 'jukebox jukebox-quality', app: app(),
        sections: [{ kind: 'jb-fields jb-quality', options: true, rows }],
        actions,
        back: toManage(id),
      };
    };
    display(build, Math.max(0, JUKEBOX_QUALITIES.indexOf(playlistOf(id)?.quality ?? '1080p')));
  }

  function chooseQuality(id: string, q: JukeboxQuality): void {
    const change = jb.setQuality(id, q);
    if (!change.ok) return open(id);
    if (!change.savings) return open(id);
    const savings = change.savings;
    // Passage au son seul : les vidéos déjà sur la borne qu'aucune autre playlist ne veut, à libérer ou garder.
    display(
      () => ({
        heading: t('Libérer les vidéos ?'),
        icon: 'quality',
        subheading: playlistOf(id)?.name,
        lead: tn(savings.songs.length, 'La playlist passe au son seul. {n} vidéo déjà sur la borne ne sert plus qu’à elle : {size} à libérer. Le son reste.', 'La playlist passe au son seul. {n} vidéos déjà sur la borne ne servent plus qu’à elle : {size} à libérer. Le son reste.', { size: formatSize(savings.bytes) }),
        variant: 'jukebox jukebox-confirm', app: app(),
        sections: [],
        actions: [
          { label: t('Libérer {size}', { size: formatSize(savings.bytes) }), icon: 'broom', key: 'free', run: () => {
            const freed = jb.removeVideos(savings.songs);
            flash = { text: t('Son seul · {size} libérés', { size: formatSize(freed) }), tone: 'ok' };
            open(id);
          } },
          { label: t('Garder les vidéos'), icon: 'back', key: 'keep', run: toManage(id) },
        ],
        back: toManage(id),
      }),
      0,
    );
  }

  function openDownloadAll(id: string): void {
    const build = (): Built => {
      const p = playlistOf(id);
      if (!p) return manageScreen();
      const plan = downloadAllPlan(p, jb.songs());
      const ability = host.ability();
      const blocker = downloadBlocker(ability, plan.bytes);
      const files = p.tracks.filter((tr) => tr.source === 'file').length;
      return {
        heading: t('Tout télécharger ?'),
        icon: 'download',
        subheading: p.name,
        lead: [
          tn(plan.songs, '{n} morceau en ligne passe sur la borne, en {quality} : ≈ {size}.', '{n} morceaux en ligne passent sur la borne, en {quality} : ≈ {size}.', { quality: qualityBadge(p.quality), size: formatSize(plan.bytes) }),
          t('Ils se liront sans réseau et sans publicité YouTube.'),
          ...(files ? [tn(files, 'Le fichier local garde sa source.', 'Les {n} fichiers locaux gardent leur source.')] : []),
          ...(ability.free !== undefined ? [t('{size} libres sur le disque.', { size: formatSize(ability.free) })] : []),
        ].join(' '),
        variant: 'jukebox jukebox-confirm', app: app(),
        sections: [],
        actions: [
          { label: t('Tout télécharger'), icon: 'download', key: 'go', ...(blocker ? { tone: 'quiet' as const, detail: blocker } : {}), run: () => {
            if (blocker) return;
            const change = jb.downloadAll(id);
            if (change.ok) flash = { text: tn(change.enqueue.length, '{n} morceau en téléchargement : suivez-les dans Téléchargements.', '{n} morceaux en téléchargement : suivez-les dans Téléchargements.'), tone: 'ok' };
            open(id);
          } },
          { label: t('Annuler'), icon: 'close', key: 'cancel', run: toManage(id) },
        ],
        back: toManage(id),
      };
    };
    display(build, 0);
  }

  function openFree(id: string): void {
    const build = (): Built => {
      const p = playlistOf(id);
      if (!p) return manageScreen();
      const u = jb.usage().playlists.get(id);
      const freeable = u?.freeable ?? 0;
      const shared = (u?.bytes ?? 0) - freeable;
      return {
        heading: t('Libérer la place ?'),
        icon: 'globe',
        subheading: p.name,
        lead: [
          t('Les morceaux téléchargés de la playlist repassent en ligne : ils demanderont le réseau, et YouTube pourra y passer des publicités.'),
          freeable ? t('{size} rendus au disque.', { size: formatSize(freeable) }) : t('Aucune place rendue : ses morceaux servent aussi à d’autres playlists.'),
          ...(shared > 0 ? [t('{size} restent sur le disque pour d’autres playlists.', { size: formatSize(shared) })] : []),
          t('Les fichiers locaux gardent leur source.'),
        ].join(' '),
        variant: 'jukebox jukebox-confirm', app: app(),
        sections: [],
        actions: [
          { label: freeable ? t('Libérer {size}', { size: formatSize(freeable) }) : t('Repasser en ligne'), icon: 'globe', key: 'go', run: () => {
            const change = jb.freePlace(id);
            if (change.ok) flash = { text: t('« {name} » repasse en ligne · {size} libérés', { name: p.name, size: formatSize(change.freed) }), tone: 'ok' };
            open(id);
          } },
          { label: t('Annuler'), icon: 'close', key: 'cancel', run: toManage(id) },
        ],
        back: toManage(id),
      };
    };
    display(build, 1);
  }

  async function resync(id: string): Promise<void> {
    const p = playlistOf(id);
    if (!p || syncing.has(id)) return;
    syncing.add(id);
    host.redraw();
    try {
      const r = await jb.resync(id);
      if (!r.ok) flash = { text: t('« {name} » : synchronisation impossible · {reason}', { name: p.name, reason: r.reason }), tone: 'warning' };
      else {
        const parts = [r.added.length ? tn(r.added.length, '{n} nouveauté ajoutée', '{n} nouveautés ajoutées') : undefined, r.removed.length ? tn(r.removed.length, '{n} morceau retiré de YouTube', '{n} morceaux retirés de YouTube') : undefined, r.back.length ? tn(r.back.length, '{n} morceau revenu', '{n} morceaux revenus') : undefined].filter(Boolean);
        flash = { text: t('« {name} » à jour · {news}', { name: p.name, news: parts.length ? parts.join(' · ') : t('rien de nouveau') }), tone: 'ok' };
      }
    } finally {
      syncing.delete(id);
      host.redraw();
    }
  }

  // ---------- Morceaux et correction des informations ----------

  const FROM: Record<string, () => string> = {
    manual: () => t('Corrigé à la main'),
    tags: () => t('D’après YouTube ou les étiquettes du fichier'),
    title: () => t('D’après le titre de la vidéo ou le nom du fichier'),
    channel: () => t('D’après la chaîne de la vidéo'),
  };

  function trackRow(v: TrackView, action: number): Row {
    const info = v.info;
    return {
      text: info.title,
      detail: [info.artist, info.album].filter(Boolean).join(' · ') || t('Artiste inconnu'),
      sub: v.status.playable ? v.status.label : (v.status.reason ?? v.status.label),
      aside: formatTrackTime(v.track.duration),
      icon: SOURCE_ICON[v.track.source],
      // Toujours une vignette (l'icône à défaut d'image) : les lignes restent alignées.
      thumb: imageUrl(v.image) ?? 'music',
      ...(v.status.playable ? {} : { tone: 'quiet' as const }),
      ...(v.status.percent !== undefined ? { progress: { value: v.status.percent / 100 } } : {}),
      action,
      pick: true,
    };
  }

  function openTracks(id: string, focus?: string): void {
    chosen = id;
    const build = (): Built => {
      const p = playlistOf(id);
      if (!p) return manageScreen();
      const views = jb.views(id);
      const actions: Action[] = [];
      const rows = views.map((v) => trackRow(v, actions.push({ label: v.info.title, key: `track:${v.track.key}`, run: () => openTrack(id, v.track.key) }) - 1));
      const youtube = youtubeBlocker(host.ability());
      actions.push({ label: t('Ajouter de YouTube'), icon: 'link', key: 'import', ...(youtube ? quiet(youtube) : { detail: t('Un lien de vidéo ou de playlist') }), run: () => (youtube ? undefined : askLink('', undefined, id)) });
      actions.push({ label: t('Ajouter des fichiers'), icon: 'folder', key: 'files', detail: t('Un fichier ou un dossier'), run: () => openFiles(id) });
      actions.push({ label: t('Retour aux playlists'), icon: 'back', key: 'back', run: toManage(id) });
      return {
        heading: p.name,
        icon: 'jukebox',
        subheading: [playlistFacts(p, jb.usage().playlists.get(id)), playlistSecondLine(p)].join(' · '),
        variant: 'jukebox jukebox-tracks', app: app(),
        sections: [{ title: t('Morceaux'), kind: 'jb-tracks', rows: rows.length ? rows : [{ text: t('Playlist vide'), detail: t('Importez de YouTube ou ajoutez vos fichiers.'), tone: 'quiet' }] }],
        actions,
        back: toManage(id),
        listStart: t('corriger les informations'),
      };
    };
    const at = focus ? jb.views(id).findIndex((v) => v.track.key === focus) : 0;
    display(build, Math.max(0, at));
  }

  function openTrack(id: string, key: string, at = 0): void {
    const build = (): Built => {
      const p = playlistOf(id);
      const v = jb.views(id).find((x) => x.track.key === key);
      if (!p || !v) return manageScreen();
      const info: TrackInfo = v.info;
      const correction = store().corrections[songKey(v.track)];
      const actions: Action[] = [];
      const field = (name: 'title' | 'artist' | 'album', label: string): Row => {
        const value = info[name];
        const from = name === 'title' ? info.from.title : info.from[name];
        const index = actions.push({ label, key: `field:${name}`, icon: 'edit', run: () => askField(id, key, name, label) }) - 1;
        return { text: label, detail: value ?? t('Inconnu'), sub: from ? FROM[from]!() : t('Rien à reprendre de YouTube'), icon: 'edit', action: index, pick: true, ...(from === 'manual' ? { badges: [t('Corrigé')] } : {}) };
      };
      const rows = [field('title', t('Titre')), field('artist', t('Artiste')), field('album', t('Album'))];
      actions.push({ label: t('Reprendre les informations de YouTube'), icon: 'restore', key: 'restore', ...(correction ? { detail: t('La correction est retirée dans toutes les playlists') } : { tone: 'quiet' as const, detail: t('Aucune correction') }), run: () => {
        if (!correction) return;
        jb.commit(setCorrection(store(), songKey(v.track), { title: '', artist: '', album: '' }));
      } });
      const at = p.tracks.findIndex((tr) => tr.key === key);
      const move = (delta: number) => void jb.commit(moveTrack(store(), id, key, delta, new Date()));
      actions.push({ label: t('Monter'), icon: 'move-up', key: 'up', ...(at <= 0 ? quiet(t('Déjà en tête')) : { detail: t('Place {n} sur {total}', { n: at + 1, total: p.tracks.length }) }), run: () => (at <= 0 ? undefined : move(-1)) });
      actions.push({ label: t('Descendre'), icon: 'move-down', key: 'down', ...(at >= p.tracks.length - 1 ? quiet(t('Déjà en dernier')) : {}), run: () => (at >= p.tracks.length - 1 ? undefined : move(1)) });
      actions.push({ label: t('Retirer de la playlist'), icon: 'trash', key: 'remove', detail: t('Le fichier ou la vidéo ne sont pas touchés'), run: () => {
        jb.commit(removeTrack(store(), id, key, new Date()));
        openTracks(id);
      } });
      actions.push({ label: t('Retour aux morceaux'), icon: 'back', key: 'back', run: toTracks(id, key) });
      const source = v.track.source === 'file' ? v.track.path! : `https://www.youtube.com/watch?v=${v.track.youtube}`;
      return {
        heading: info.title,
        icon: 'edit',
        subheading: [info.artist, p.name].filter(Boolean).join(' · '),
        lead: t('Votre correction l’emporte sur ce que dit YouTube ou le fichier, dans toutes les playlists où le morceau se trouve. Laissez un champ vide pour reprendre l’information d’origine.'),
        variant: 'jukebox jukebox-track', app: app(),
        sections: [
          { kind: 'jb-fields', options: true, rows: [...rows, { text: t('Source'), detail: v.track.source === 'file' ? source : v.track.title, sub: [v.status.playable ? v.status.label : (v.status.reason ?? v.status.label), ...(v.track.source === 'file' ? [] : [source])].join(' · '), icon: SOURCE_ICON[v.track.source], ...(v.status.playable ? {} : { tone: 'quiet' as const }) }] },
        ],
        actions,
        back: toTracks(id, key),
      };
    };
    display(build, at);
  }

  function askField(id: string, key: string, name: 'title' | 'artist' | 'album', label: string): void {
    const v = jb.views(id).find((x) => x.track.key === key);
    if (!v) return openTracks(id);
    ask(t('Corriger : {field}', { field: label }), label, v.info[name] ?? '', (value) => {
      if (value !== undefined) jb.commit(setCorrection(store(), songKey(v.track), { [name]: value }));
      openTrack(id, key, ['title', 'artist', 'album'].indexOf(name));
    }, t('Laissez vide pour reprendre l’information de YouTube ou du fichier.'));
  }

  // ---------- Fichiers locaux ----------

  const MEDIA_FILTER = () => ({ label: t('Musique et vidéos'), extensions: [...JUKEBOX_VIDEO_EXTENSIONS, ...JUKEBOX_AUDIO_EXTENSIONS] });

  /** Ajouter un fichier ou un dossier (sous-dossiers compris) à une playlist ; le nombre trouvé est annoncé avant l'ajout. */
  function openFiles(id: string): void {
    const scanPaths = async (paths: string[], mode: 'files' | 'folder') => {
      let scan: LocalScan | undefined;
      await host.task(t('Recherche des fichiers…'), () => {
        scan = jb.scanFiles(paths);
      });
      if (scan) openScan(id, scan, mode, paths);
    };
    const choose = async (mode: 'files' | 'folder') => {
      const title = mode === 'folder' ? t('Juke-box : choisir un dossier') : t('Juke-box : choisir des fichiers');
      picking = true;
      let paths: string[] | undefined;
      try {
        paths = host.landscape() && host.pickNative ? await host.pickNative(mode, title) : await host.pick({ title, icon: mode === 'folder' ? 'folder' : 'music', purpose: t('Fichiers du Juke-box'), mode, filter: MEDIA_FILTER(), start: 'desktop' });
      } finally {
        picking = false;
      }
      if (!paths?.length) return openFiles(id);
      await scanPaths(paths, mode);
    };
    const build = (): Built => {
      const p = playlistOf(id);
      if (!p) return manageScreen();
      const desk = host.landscape() && Boolean(host.pickNative);
      return {
        heading: t('Ajouter des fichiers'),
        icon: 'folder',
        subheading: p.name,
        lead: desk ? t('L’explorateur de Windows s’ouvre : choisissez des fichiers, ou un dossier entier. Les fichiers sont lus à leur emplacement, rien n’est copié.') : t('Le sélecteur de fichiers s’ouvre : choisissez des fichiers, ou un dossier entier. Les fichiers sont lus à leur emplacement, rien n’est copié.'),
        variant: 'jukebox jukebox-files', app: app(),
        // Fichiers ou dossiers glissés sur la fenêtre (bureau) : relevés comme ceux qu'on choisit.
        drop: (paths) => void scanPaths(paths, paths.length === 1 ? 'folder' : 'files'),
        sections: [
          {
            title: t('Formats acceptés'),
            rows: [
              { text: t('Vidéos'), detail: JUKEBOX_VIDEO_EXTENSIONS.map((x) => (x === 'webm' ? 'WebM' : x.toUpperCase())).join(', '), sub: t('Le clip sur le fronton, avec son son'), icon: 'video' },
              { text: t('Sons'), detail: JUKEBOX_AUDIO_EXTENSIONS.map((x) => x.toUpperCase()).join(', '), sub: t('La pochette du fichier ou du dossier, sinon un visualiseur'), icon: 'music' },
              { text: t('Dossiers'), detail: t('Sous-dossiers compris ; les autres fichiers sont ignorés'), icon: 'folder' },
            ],
          },
        ],
        actions: [
          { label: desk ? t('Choisir des fichiers dans l’explorateur…') : t('Choisir des fichiers…'), icon: 'music', key: 'pick-files', run: () => void choose('files') },
          { label: desk ? t('Choisir un dossier dans l’explorateur…') : t('Choisir un dossier…'), icon: 'folder', key: 'pick-folder', run: () => void choose('folder') },
          { label: t('Retour aux playlists'), icon: 'back', key: 'back', run: toManage(id) },
        ],
        back: toManage(id),
      };
    };
    display(build, 0);
  }

  /** Ce que le relevé a trouvé : acceptés, refusés avec leur raison, puis l'ajout explicite. */
  function openScan(id: string, scan: LocalScan, mode: 'files' | 'folder', chosen: readonly string[]): void {
    const SHOWN = 120;
    // Le dossier d'un fichier, dit depuis ce qu'on a choisi (« Onde Violette\Bonus ») ; à défaut, son nom.
    const base = chosen.length === 1 ? chosen[0]! : path.dirname(chosen[0] ?? '');
    const where = (file: string) => {
      const rel = path.relative(base, path.dirname(file));
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : path.basename(path.dirname(file));
    };
    const build = (): Built => {
      const p = playlistOf(id);
      if (!p) return manageScreen();
      const have = new Set(p.tracks.filter((tr) => tr.source === 'file').map((tr) => songKey(tr)));
      const fresh = scan.files.filter((f) => !have.has(songKey({ source: 'file', path: f.path })));
      const already = scan.files.length - fresh.length;
      const sections: Section[] = [];
      const accepted: Row[] = scan.files.slice(0, SHOWN).map((f) => ({
        text: path.basename(f.path),
        detail: [f.media === 'video' ? t('Vidéo') : t('Son'), formatSize(f.bytes), where(f.path)].join(' · '),
        icon: f.media === 'video' ? 'video' : 'music',
        check: 'on' as const,
        ...(have.has(songKey({ source: 'file', path: f.path })) ? { tone: 'quiet' as const, sub: t('Déjà dans la playlist') } : {}),
      }));
      sections.push({ title: tn(scan.files.length, '{n} fichier accepté', '{n} fichiers acceptés'), kind: 'jb-found', rows: accepted.length ? accepted : [{ text: t('Aucun fichier de musique ou de vidéo'), detail: acceptedFormatsText(), tone: 'quiet' }], more: Math.max(0, scan.files.length - SHOWN) });
      if (scan.refused.length || scan.missing.length) {
        sections.push({
          title: tn(scan.refused.length + scan.missing.length, '{n} refusé', '{n} refusés'),
          kind: 'jb-refused',
          rows: [
            ...scan.refused.slice(0, SHOWN).map((r) => ({ text: path.basename(r.path), detail: where(r.path), sub: r.text, check: 'skip' as const, tone: 'quiet' as const })),
            ...scan.missing.map((m) => ({ text: path.basename(m) || m, detail: m, sub: t('Introuvable'), check: 'skip' as const, tone: 'quiet' as const })),
          ],
          more: Math.max(0, scan.refused.length - SHOWN),
        });
      }
      sections.push({ title: t('Formats acceptés'), rows: [{ text: acceptedFormatsText(), icon: 'info' }] });
      const label = tn(fresh.length, 'Ajouter {n} fichier à « {name} »', 'Ajouter {n} fichiers à « {name} »', { name: p.name });
      return {
        heading: t('Ajouter des fichiers'),
        icon: 'folder',
        subheading: p.name,
        lead: [localScanSummary(scan), ...(already ? [tn(already, '{n} déjà dans la playlist', '{n} déjà dans la playlist')] : []), ...(scan.ignored ? [tn(scan.ignored, '{n} autre fichier ignoré (images, textes…)', '{n} autres fichiers ignorés (images, textes…)')] : [])].join(' · '),
        variant: 'jukebox jukebox-scan', app: app(),
        sections,
        actions: [
          { label, icon: 'plus', key: 'add', ...(fresh.length ? {} : { tone: 'quiet' as const, detail: scan.files.length ? t('Tous ces fichiers sont déjà dans la playlist') : t('Aucun fichier à ajouter') }), run: () => {
            if (!fresh.length) return;
            const change = jb.addFiles(id, { files: fresh });
            if (change.ok) flash = { text: tn(change.added.length, '{n} fichier ajouté à « {name} »', '{n} fichiers ajoutés à « {name} »', { name: p.name }), tone: 'ok' };
            open(id);
          } },
          { label: mode === 'folder' ? t('Choisir un autre dossier') : t('Choisir d’autres fichiers'), icon: 'folder', key: 'again', run: () => openFiles(id) },
          { label: t('Annuler'), icon: 'close', key: 'cancel', run: toManage(id) },
        ],
        back: () => openFiles(id),
      };
    };
    display(build, 0);
  }

  // ---------- Import de YouTube ----------

  /** Le lien, par le clavier à l'écran : rempli depuis le téléphone, ou au clavier (Ctrl+V). */
  function askLink(value = '', problem?: string, prefer?: string): void {
    const phone = host.phone?.();
    ask(
      t('Importer de YouTube'),
      t('Lien de la playlist ou de la vidéo YouTube'),
      value,
      (link) => {
        if (link === undefined) return open();
        startImport(link, 'prompt', prefer);
      },
      problem ?? (phone ? t('Collez le lien sur le téléphone, puis Envoyer. Dans YouTube : Partager, puis Copier le lien.') : t('Collez le lien avec Ctrl+V, ou depuis la télécommande du téléphone. Dans YouTube : Partager, puis Copier le lien.')),
    );
  }

  /** L'écran d'import, le curseur sur « Importer » quand l'analyse est faite (sinon sur sa première action). */
  function showImport(): void {
    const at = importScreen().actions.findIndex((a) => a.key === 'import');
    display(importScreen, Math.max(0, at));
  }

  /** Analyse un lien et ouvre l'écran d'import (aussi depuis « Récupérer »). */
  function startImport(link: string, from: ImportState['from'], prefer?: string): void {
    current?.abort?.abort();
    const state: ImportState = { link: link.trim(), from, phase: 'analyzing', abort: new AbortController(), ...(prefer ? { prefer } : {}) };
    current = state;
    jb.manageOpened(!host.landscape());
    showImport();
    void analyze(state);
  }

  async function analyze(state: ImportState): Promise<void> {
    const signal = state.abort!.signal;
    const r = await jb.analyzeLink(state.link, signal);
    if (current !== state || signal.aborted) return;
    if (!r.ok) {
      state.phase = 'failed';
      state.reason = r.reason;
      host.redraw();
      return;
    }
    state.analysis = r.analysis;
    state.choices = defaultImportChoices(r.analysis, store(), state.prefer ?? (isVideoAnalysis(r.analysis) ? chosen : undefined));
    state.phase = 'ready';
    // Seconde lecture (champs musicaux, vidéos bloquées) : l'import est déjà possible pendant ce temps.
    state.checking = !isVideoAnalysis(r.analysis);
    if (host.showing(importScreen)) showImport();
    else host.redraw();
    if (!state.checking) return;
    try {
      const detailed = await jb.details(r.analysis, undefined, signal);
      if (current !== state || signal.aborted || state.phase !== 'ready') return;
      state.analysis = detailed;
    } finally {
      state.checking = false;
      if (current === state) host.redraw();
    }
  }

  function entryRow(e: PlaylistEntry, checked: boolean, inTarget: boolean, action: number): Row {
    const guess = parseMusicTitle(e.title, e.channel);
    const title = e.track ?? guess.title;
    const artist = e.artist ?? guess.artist;
    if (e.unavailable) return { text: title, detail: t('{reason} · sautée', { reason: e.detail ?? e.title }), aside: t('Sauté'), check: 'skip', tone: 'quiet', thumb: 'music', action, pick: true };
    return {
      text: title,
      detail: [artist, e.album].filter(Boolean).join(' · ') || t('Artiste inconnu'),
      aside: formatTrackTime(e.duration),
      check: checked ? 'on' : 'off',
      thumb: 'music',
      ...(inTarget ? { sub: t('Déjà dans la playlist : ignoré'), tone: 'quiet' as const } : {}),
      action,
      pick: true,
    };
  }

  function importScreen(): Built {
    const state = current;
    const backTo = () => {
      state?.abort?.abort();
      current = undefined;
      open(state?.result?.playlist ?? chosen);
    };
    const linkRow: Row = { text: state?.link ?? '', detail: state?.from === 'recuperer' ? t('Lien reçu de « Récupérer »') : host.phone?.() ? t('Lien reçu du téléphone, ou tapé au clavier') : t('Lien collé au clavier'), icon: 'link' };
    const base = { heading: t('Importer de YouTube'), icon: 'jukebox' as const, subheading: t('YouTube → votre Juke-box'), back: backTo };
    if (!state) return { ...base, sections: [], actions: [{ label: t('Retour aux playlists'), icon: 'back', key: 'back', run: backTo }] };

    if (state.phase === 'analyzing') {
      return {
        ...base,
        variant: 'jukebox jukebox-import jukebox-wait', app: app(),
        sections: [
          { kind: 'jb-link', rows: [linkRow] },
          { kind: 'jb-wait', rows: [{ text: t('Lecture de la playlist…'), detail: t('Nombre de morceaux, durée, disponibilité et morceaux déjà sur la borne. Rien n’est téléchargé à cette étape.'), icon: 'refresh', progress: { busy: true } }] },
        ],
        actions: [
          { label: t('Annuler l’analyse'), icon: 'close', key: 'cancel-analysis', run: backTo },
        ],
      };
    }

    if (state.phase === 'failed') {
      return {
        ...base,
        variant: 'jukebox jukebox-import', app: app(),
        sections: [
          { kind: 'jb-link', rows: [linkRow] },
          { kind: 'jb-flash', rows: [{ text: t('Lecture impossible'), detail: state.reason, tone: 'warning', icon: 'alert' }] },
        ],
        actions: [
          { label: t('Réessayer'), icon: 'refresh', key: 'retry', run: () => startImport(state.link, state.from, state.prefer) },
          { label: t('Coller un autre lien'), icon: 'link', key: 'other', run: () => askLink(state.link) },
          { label: t('Retour aux playlists'), icon: 'back', key: 'back', run: backTo },
        ],
      };
    }

    if (state.phase === 'done' && state.result) return importDoneScreen(state, backTo);

    const analysis = state.analysis!;
    const choices = state.choices!;
    const video = isVideoAnalysis(analysis);
    const target = 'playlist' in choices.target ? playlistOf(choices.target.playlist) : undefined;
    const summary = summarizeImport(analysis, { ...(choices.chosen ? { chosen: choices.chosen } : {}), library: jb.songs(), ...(target ? { target } : {}) });
    const ability = host.ability();
    const blocker = importBlocker(summary, choices, ability);
    const inTarget = new Set(target?.tracks.map((tr) => tr.youtube).filter(Boolean));
    const actions: Action[] = [];
    const add = (a: Action) => actions.push(a) - 1;
    const set = (change: Partial<ImportChoices>) => {
      state.choices = { ...state.choices!, ...change };
      host.redraw();
    };

    // Les morceaux : Start coche ou décoche (on passe alors à « Choisir les morceaux »).
    const entries = analysis.entries.map((e) => {
      const checked = !e.unavailable && (!choices.chosen || choices.chosen.has(e.id));
      const at = add({ label: e.title, key: `entry:${e.id}`, run: () => {
        if (e.unavailable) return;
        const next = new Set(choices.chosen ?? analysis.entries.filter((x) => !x.unavailable).map((x) => x.id));
        if (next.has(e.id)) next.delete(e.id);
        else next.add(e.id);
        set({ chosen: next });
      } });
      return entryRow(e, checked, inTarget.has(e.id), at);
    });

    // Les choix, un seul par groupe.
    const segment = (label: string, on: boolean, key: string, run: () => void, extra: Partial<Row> = {}, reason?: string): Row => {
      const at = add({ label, key, run: () => (reason ? undefined : run()) });
      return { text: label, check: on ? 'on' : 'off', current: on, action: at, pick: true, ...extra, ...(reason ? { tone: 'quiet' as const, detail: reason } : {}) };
    };
    const sections: Section[] = [
      { kind: 'jb-link', rows: [linkRow] },
      {
        kind: 'jb-summary',
        rows: [
          {
            text: video ? t('Une vidéo') : analysis.title,
            detail: [availabilityText(summary), summary.duration ? t('{time} de musique', { time: formatTotalTime(summary.duration) }) : undefined, state.checking ? t('vérification des morceaux…') : undefined].filter(Boolean).join(' · '),
            aside: retainedText(summary),
            icon: 'jukebox',
            ...(analysis.capped ? { sub: t('Mix YouTube : les {n} premiers morceaux seulement', { n: analysis.entries.length }) } : {}),
          },
        ],
      },
      { kind: 'jb-entries', rows: entries },
    ];
    const ytBlock = youtubeBlocker(ability);
    sections.push({
      title: t('Lecture'),
      kind: 'jb-segments jb-mode',
      side: true,
      options: true,
      rows: [
        segment(t('En ligne'), choices.mode === 'online', 'mode:online', () => set({ mode: 'online' }), { icon: 'globe', sub: t('Rien sur le disque · réseau, publicités') }),
        segment(t('Télécharger sur la borne'), choices.mode === 'download', 'mode:download', () => set({ mode: 'download' }), { icon: 'download', sub: t('Sans réseau ni publicité') }, ytBlock),
      ],
    });
    const qualityReason = choices.mode === 'online' ? t('En ligne : rien n’est téléchargé') : target ? t('Celle de « {name} » : {quality}', { name: target.name, quality: qualityBadge(target.quality) }) : undefined;
    const quality = target ? target.quality : choices.quality;
    sections.push({
      title: t('Qualité sur la borne'),
      kind: 'jb-segments jb-quality',
      side: true,
      options: true,
      // Grisée, sa raison dite une seule fois, dans les remarques sous les choix.
      rows: JUKEBOX_QUALITIES.map((q) => segment(qualityBadge(q), q === quality, `quality:${q}`, () => (qualityReason ? undefined : set({ quality: q })), { sub: estimateText(summary.bytes[q]), ...(qualityReason ? { tone: 'quiet' as const } : {}) })),
    });
    const playlists = store().playlists;
    const newName = 'name' in choices.target ? choices.target.name : (video ? t('Mes morceaux') : analysis.title);
    sections.push({
      title: t('Destination'),
      kind: 'jb-segments jb-target',
      side: true,
      options: true,
      rows: [
        segment(t('Nouvelle : {name}', { name: newName }), 'name' in choices.target, 'target:new', () => {
          if ('name' in choices.target) return askImportName(state, newName);
          set({ target: { name: newName } });
        }, { icon: 'plus' }),
        segment(target ? t('Existante : {name}', { name: target.name }) : t('Existante…'), Boolean(target), 'target:existing', () => chooseTarget(state), { icon: 'list' }, playlists.length ? undefined : t('Aucune playlist pour l’instant')),
      ],
    });
    if (!video) {
      sections.push({
        title: t('Morceaux'),
        kind: 'jb-segments jb-take',
        side: true,
        options: true,
        rows: [
          segment(t('Tout prendre'), !choices.chosen, 'take:all', () => set({ chosen: undefined })),
          segment(t('Choisir les morceaux'), Boolean(choices.chosen), 'take:some', () => set({ chosen: new Set(analysis.entries.filter((e) => !e.unavailable).map((e) => e.id)) })),
        ],
      });
    }
    const notes: Row[] = [];
    if (qualityReason) notes.push({ text: t('Qualité sur la borne'), detail: qualityReason, icon: 'quality', tone: 'quiet' });
    const reuse = [summary.reused ? tn(summary.reused, '{n} morceau déjà sur la borne réutilisé', '{n} morceaux déjà sur la borne réutilisés') : undefined, summary.already ? tn(summary.already, '{n} déjà dans la playlist', '{n} déjà dans la playlist') : undefined, ability.free !== undefined ? t('{size} libres', { size: formatSize(ability.free) }) : undefined].filter(Boolean);
    if (reuse.length) notes.push({ text: reuse.join(' · '), icon: 'drive' });
    const skipped = skippedText(summary);
    if (skipped) notes.push({ text: t('À vérifier'), detail: skipped, tone: 'warning', icon: 'alert' });
    if (blocker) notes.push({ text: t('Import impossible'), detail: blocker, tone: 'warning', icon: 'alert' });
    if (notes.length) sections.push({ kind: 'jb-notes', side: true, rows: notes });

    add({ label: importActionLabel(summary, video), icon: 'download', key: 'import', ...(blocker ? { tone: 'quiet' as const, detail: blocker } : {}), run: () => (blocker ? undefined : runImport(state)) });
    add({ label: t('Annuler'), icon: 'close', key: 'cancel', run: backTo });
    return {
      ...base,
      variant: 'jukebox jukebox-import', app: app(),
      sections,
      actions,
      listStart: t('cocher ou décocher'),
    };
  }

  function askImportName(state: ImportState, value: string, problem?: string): void {
    ask(t('Nouvelle playlist'), t('Nom de la playlist'), value, (name) => {
      if (name !== undefined) {
        const reason = playlistNameProblem(store(), name);
        if (reason) return askImportName(state, name, reason);
        state.choices = { ...state.choices!, target: { name: name.trim() } };
      }
      showImport();
    }, problem);
  }

  /** La playlist existante qui reçoit l'import : une liste, Start choisit. */
  function chooseTarget(state: ImportState): void {
    const build = (): Built => {
      const usage = jb.usage();
      const actions: Action[] = [];
      const rows: Row[] = store().playlists.map((p) => {
        const at = actions.push({ label: p.name, key: `playlist:${p.id}`, run: () => {
          state.choices = { ...state.choices!, target: { playlist: p.id } };
          showImport();
        } }) - 1;
        const on = 'playlist' in state.choices!.target && state.choices!.target.playlist === p.id;
        return { text: p.name, detail: playlistFacts(p, usage.playlists.get(p.id)), sub: playlistSecondLine(p), aside: qualityBadge(p.quality), thumb: playlistImage(p.id) ?? 'music', check: on ? 'on' : 'off', current: on, action: at, pick: true };
      });
      actions.push({ label: t('Retour à l’import'), icon: 'back', key: 'back', run: toImport() });
      return { heading: t('Ajouter à une playlist'), icon: 'list', variant: 'jukebox jukebox-target', app: app(), sections: [{ kind: 'jb-playlists', rows }], actions, back: toImport() };
    };
    const at = 'playlist' in state.choices!.target ? store().playlists.findIndex((p) => p.id === (state.choices!.target as { playlist: string }).playlist) : 0;
    display(build, Math.max(0, at));
  }

  function runImport(state: ImportState): void {
    const c = state.choices!;
    const change = jb.importPlaylist({ analysis: state.analysis!, target: c.target, ...(c.chosen ? { chosen: c.chosen } : {}), mode: c.mode, quality: c.quality });
    if (!change.ok) {
      state.phase = 'failed';
      state.reason = change.reason;
      host.redraw();
      return;
    }
    // La seconde lecture n'a plus d'objet : l'import est fait.
    state.abort?.abort();
    state.phase = 'done';
    state.result = { playlist: change.playlist.id, keys: change.added.map((tr) => tr.key), duplicates: change.duplicates, skipped: change.skipped };
    chosen = change.playlist.id;
    showImport();
  }

  /** Import lancé : chaque morceau ajouté avec son état (prêt, en téléchargement, en attente), et les sautés. */
  function importDoneScreen(state: ImportState, backTo: () => void): Built {
    const r = state.result!;
    const p = playlistOf(r.playlist);
    const keys = new Set(r.keys);
    const views = jb.views(r.playlist).filter((v) => keys.has(v.track.key));
    const ready = views.filter((v) => v.status.playable).length;
    const actions: Action[] = [];
    const rows = views.map((v) => trackRow(v, actions.push({ label: v.info.title, key: `track:${v.track.key}`, run: () => openTrack(r.playlist, v.track.key) }) - 1));
    const skipped = (state.analysis?.entries ?? []).filter((e) => e.unavailable);
    const sections: Section[] = [
      {
        kind: 'jb-summary',
        rows: [
          {
            text: p?.name ?? '',
            detail: [tn(views.length, '{n} morceau ajouté', '{n} morceaux ajoutés'), tn(ready, '{n} prêt', '{n} prêts'), ...(r.duplicates ? [tn(r.duplicates, '{n} déjà présent', '{n} déjà présents')] : [])].join(' · '),
            aside: `${ready} / ${views.length}`,
            icon: 'jukebox',
            progress: { value: views.length ? ready / views.length : 1 },
          },
        ],
      },
      { title: t('Morceaux'), kind: 'jb-tracks', rows: rows.length ? rows : [{ text: t('Aucun morceau ajouté'), detail: t('Ils étaient déjà dans la playlist.'), tone: 'quiet' }] },
    ];
    if (skipped.length) sections.push({ title: tn(skipped.length, '{n} vidéo sautée', '{n} vidéos sautées'), kind: 'jb-refused', rows: skipped.map((e) => ({ text: e.title, detail: e.detail ?? t('Vidéo indisponible'), check: 'skip' as const, tone: 'quiet' as const })) });
    actions.push({ label: t('Voir la playlist'), icon: 'list', key: 'open', run: () => {
      current = undefined;
      openTracks(r.playlist);
    } });
    actions.push({ label: t('Importer autre chose'), icon: 'link', key: 'again', run: () => {
      current = undefined;
      askLink();
    } });
    actions.push({ label: t('Retour au Juke-box'), icon: 'back', key: 'back', run: backTo });
    return {
      heading: t('Import lancé'),
      icon: 'jukebox',
      subheading: p?.name,
      lead: ready === views.length ? t('Tout est prêt.') : t('Les morceaux prêts se jouent déjà ; les autres arrivent par la file des téléchargements, même si vous quittez cet écran.'),
      variant: 'jukebox jukebox-import jukebox-done', app: app(),
      sections,
      actions,
      back: backTo,
    };
  }

  return {
    /** Menu système > Juke-box : un raccourci vers la gestion, dont Exit ramène au menu système. */
    item: {
      get detail() {
        return detail();
      },
      run: () => {
        flash = undefined;
        open(undefined, 'system');
      },
    },
    /** Un écran de la gestion (ou sa saisie) est affiché : le fronton montre l'affiche du Juke-box, le DMD ses points. */
    active: () => asking || picking || Boolean(shown && host.showing(shown)),
    /** La gestion, ouverte du lecteur (« Gestion du Juke-box ») : Exit y ramène. */
    open: (focus?: string) => open(focus, 'player'),
    /** Import d'un lien venu d'ailleurs (« Récupérer ») : l'écran d'import s'ouvre sur son analyse. */
    importLink: (link: string) => startImport(link, 'recuperer'),
    /** Lien d'import accepté (playlist ou vidéo YouTube) : le bouton « Ajouter au Juke-box » s'affiche. */
    accepts: (link: string) => jb.linkKind(link) !== undefined,
  };
}

export type JukeboxMenu = ReturnType<typeof createJukeboxMenu>;
