// Recherche libre d'un média (docs/recherche/sources-medias.md § 7) : quand les sources
// branchées n'ont pas ce qu'il faut (une musique de présentation, un topper précis),
// l'utilisateur cherche lui-même dans le navigateur intégré, et Cyber Pinball voit
// arriver ce qu'il télécharge.
//
// - « Chercher moi-même sur le web… », sur l'écran de chaque média (et « Chercher sur le
//   web… » dans ses propositions), ouvre la fenêtre « Récupérer » sur une recherche
//   préremplie (nom de la table et type de média) que le bandeau laisse changer (web,
//   images, vidéos, YouTube). Fermée (Échap), elle garde la page et son historique.
// - Chaque fichier téléchargé dans la fenêtre, ou arrivé dans Téléchargements de Windows
//   pendant la recherche, est déballé et jugé pour le média (media-sites.ts, webmedia.ts) :
//   accepté tel quel, à convertir (image en PNG, son ou son d'une vidéo en WAV : media-
//   convert.ts), ou refusé avec sa raison.
// - L'écran « Reçu pour … » le montre avec son aperçu, ce qui sera écrit et ce qui part à
//   la corbeille ; « Affecter … et enregistrer » écrit ce seul média aussitôt (le menu le
//   montre sans attendre), les autres changements du brouillon restent à enregistrer.
// - Un son se découpe d'abord (début, fin, fondu de fin) : l'extrait s'écoute sur sa carte
//   et la forme d'onde montre la partie gardée.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  clampTrim,
  defaultTrim,
  extractMp4Sound,
  MP4_VIDEO_EXTENSIONS,
  formatClock,
  formatSize,
  formatTransfer,
  isAcceptedFormat,
  lowerFirst,
  mediaFileName,
  mediaKind,
  mediaTypeInfo,
  mediaUrl,
  t,
  tn,
  TRIM_FADE,
  TRIM_STEPS,
  waveformPng,
  webEngineUrl,
  webHost,
  webMediaChoices,
  webSearchQuery,
  type AudioTrim,
  type MediaKind,
  type MediaOriginDraft,
  type MediaPageEntry,
  type MediaType,
  type TableEntry,
  type WebReceipt,
} from '@cyberpinball/core';
import type { Action, Built, Row, Section, Tone } from './library';
import type { MediaCard, MediaThumb } from './library-medias';
import type { AudioProbe, Converter } from './media-convert';
import { allowPreview } from './media-protocol';
import type { MediaSites } from './media-sites';

export interface WebSearchContext {
  sites: MediaSites;
  convert: Converter;
  /** Dossier des téléchargements de Cyber Pinball (aperçus de la découpe). */
  downloadsDir(): string | undefined;
  /** Opération longue : message à l'écran, touches ignorées. */
  task(message: string, work: () => Promise<void> | void): Promise<void>;
  progress(message: string): void;
  /** Affiche un écran des médias de la session en cours. */
  show(build: () => Built, at?: number): void;
  cursor(): number;
  /** Redessine l'écran affiché (extrait prêt). */
  broadcast(): void;
  find(file: string): TableEntry | undefined;
  /** Le gestionnaire des médias est ouvert sur cette table. */
  active(table: TableEntry): boolean;
  thumb(table: TableEntry, type: MediaType, file: string): MediaThumb;
  facts(file: string): string;
  /** Fichiers montrés aujourd'hui pour ce média. */
  current(table: TableEntry, type: MediaType): string[];
  /** Écrit ce seul média aussitôt (plan d'un média, corbeille) ; renvoie le message à montrer. */
  commit(table: TableEntry, type: MediaType, entry: MediaPageEntry): { text: string; tone: Tone };
  /** Met l'entrée dans le brouillon, sans rien écrire ; renvoie la phrase à montrer. */
  place(table: TableEntry, type: MediaType, entry: MediaPageEntry): string;
  /** Retour à l'écran du média, avec un message. */
  back(type: MediaType, message?: { text: string; tone: Tone }): void;
}

/** Un fichier reçu qui peut servir au média : tel quel, ou après conversion. */
interface Usable {
  file: string;
  kind: MediaKind;
  convert?: { to: 'png' | 'wav'; from: 'image' | 'audio' | 'video' };
}

/** Découpe en cours d'un son. */
interface Trimming {
  key: string;
  item: Usable;
  probe: AudioProbe;
  trim: AudioTrim;
  step: number;
  /** Forme d'onde de la découpe affichée, et l'extrait prêt (avec la découpe qu'il représente). */
  wave?: string;
  /** Formes d'onde déjà affichées : la précédente reste le temps que l'écran passe à la nouvelle. */
  waves: string[];
  extract?: { file: string; trim: string };
  /** Extrait en préparation ; `again` : la découpe a changé entre-temps. */
  busy?: boolean;
  again?: boolean;
  serial: number;
}

/** Largeur et hauteur de l'image de la forme d'onde. */
const WAVE_SIZE = { width: 1200, height: 400 };

export function createWebSearch(ctx: WebSearchContext) {
  /** Dernière recherche ouverte : table et média, pour mener ce qui arrive à son écran. */
  let wanted: { table: string; type: MediaType } | undefined;
  /** Reçus de la session, refusés compris (ils ne sont pas notés dans web.json). */
  const recent = new Map<string, WebReceipt>();
  /** Sons analysés (durée, pics de la forme d'onde), par fichier ; undefined : illisible. */
  const probes = new Map<string, AudioProbe | undefined>();
  const duration = (file: string) => probes.get(file)?.duration;
  let trimming: Trimming | undefined;

  const typeLabel = (type: MediaType) => mediaTypeInfo(type).label;

  // ---------- Ouverture ----------

  /** Texte cherché d'abord : le titre de la table (sans fabricant ni année), ou celui saisi dans les propositions. */
  function queryFor(table: TableEntry, type: MediaType, title?: string): string {
    return webSearchQuery(title ?? table.title, type);
  }

  /** Page de départ : la même d'une visite à l'autre, pour reprendre la page en cours. */
  function startUrl(table: TableEntry, type: MediaType, title?: string): string {
    return webEngineUrl(queryFor(table, type, title), 'web');
  }

  /** Ouvre (ou reprend) la recherche libre pour ce média ; renvoie la phrase à montrer. */
  function open(table: TableEntry, type: MediaType, title?: string): string {
    const query = queryFor(table, type, title);
    wanted = { table: table.file, type };
    ctx.sites.openWeb({ url: webEngineUrl(query, 'web'), table: table.file, title: table.title, type, label: typeLabel(type), query, engine: 'web' });
    return t('Navigateur intégré ouvert : cherchez, téléchargez, le fichier est vérifié puis proposé ici. Fermer (Échap) garde la page.');
  }

  /** Détail de l'action qui ouvre la recherche : téléchargement en cours, reprise, ou le texte cherché. */
  function detail(table: TableEntry, type: MediaType, title?: string): string {
    const loading = ctx.sites.webProgress();
    if (loading) return t('Téléchargement en cours : {got}', { got: formatTransfer(loading, true) });
    if (ctx.sites.resumable(startUrl(table, type, title))) return t('Reprend la page où vous en étiez ; ce que vous téléchargez revient ici');
    return t('Navigateur intégré, recherche libre : « {query} »', { query: queryFor(table, type, title) });
  }

  // Ce qui arrive pendant la recherche : son écran s'ouvre si le gestionnaire est sur cette table.
  ctx.sites.onWebReceived((receipt) => {
    recent.set(receipt.key, receipt);
    const table = ctx.find(receipt.table);
    if (!table || !ctx.active(table)) return;
    if (!wanted || wanted.table !== receipt.table) return;
    showReceived(receipt.key);
  });

  // ---------- Reçu ----------

  function receiptOf(key: string): WebReceipt | undefined {
    return ctx.sites.webReceipt(key) ?? recent.get(key);
  }

  /** Fichiers d'un reçu qui servent à son média : acceptés, puis à convertir. */
  function usables(r: WebReceipt): Usable[] {
    const accepted = webMediaChoices(r.type, [r], r.table).map((c): Usable => ({ file: c.file!, kind: c.kind }));
    const convert = (r.convert ?? []).filter((c) => fs.existsSync(c.file)).map((c): Usable => ({ file: c.file, kind: c.kind, convert: { to: c.to, from: c.from } }));
    return [...accepted, ...convert];
  }

  const fromOf = (r: WebReceipt) => (r.windows ? t('Téléchargements de Windows') : webHost(r.url) || t('le web'));
  const originOf = (r: WebReceipt): MediaOriginDraft => ({ origin: r.windows ? t('Téléchargements de Windows') : webHost(r.url), url: r.url || r.filename });
  const isAudioType = (type: MediaType) => type === 'Audio' || type === 'AudioLaunch';

  function showReceived(key: string, at = 0): void {
    const r = receiptOf(key);
    if (!r) return;
    // Un son : sa durée, lue avant l'écran (rapide, le fichier est sur le disque).
    const sounds = usables(r).filter((u) => isAudioType(r.type) && !probes.has(u.file));
    if (!sounds.length) return ctx.show(() => buildReceived(key), at);
    void ctx.task(t('Lecture du son…'), async () => {
      for (const u of sounds) {
        try {
          probes.set(u.file, await ctx.convert.probeAudio(u.file));
        } catch {
          probes.set(u.file, undefined);
        }
      }
      ctx.show(() => buildReceived(key), at);
    });
  }

  function lost(): Built {
    return { heading: t('Fichier introuvable'), sections: [], actions: [{ label: t('Retour'), run: () => (wanted ? ctx.back(wanted.type) : undefined) }], back: () => (wanted ? ctx.back(wanted.type) : undefined) };
  }

  /** Lignes des fichiers refusés, et de ceux qui vont à d'autres écrans. */
  function asideSections(r: WebReceipt): Section[] {
    const sections: Section[] = [];
    if (r.refused?.length) sections.push({ title: t('Refusé'), rows: r.refused.map((x) => ({ text: x.name, detail: x.reason, tone: 'error' as const })) });
    const others = r.files.filter((f) => f.type && f.type !== r.type);
    if (others.length) {
      const labels = [...new Set(others.map((f) => typeLabel(f.type!)))].join(t(', '));
      sections.push({ rows: [{ text: tn(others.length, '{n} fichier pour un autre écran', '{n} fichiers pour d’autres écrans'), detail: t('{list} : à prendre dans « Voir les propositions » de ce média.', { list: labels }), tone: 'quiet' }] });
    }
    return sections;
  }

  function buildReceived(key: string): Built {
    const r = receiptOf(key);
    const table = r && ctx.find(r.table);
    if (!r || !table) return lost();
    const list = usables(r);
    if (list.length === 1) return buildFile(key, list[0]!);
    const label = typeLabel(r.type);
    const back = () => ctx.back(r.type);
    const research = () => {
      const text = open(table, r.type);
      ctx.back(r.type, { text, tone: 'info' });
    };
    if (!list.length) {
      return {
        heading: t('Reçu : rien d’utilisable pour « {label} »', { label }),
        subheading: `${table.title} · ${fromOf(r)} · ${r.filename}`,
        lead: t('Le fichier a bien été reçu, mais rien dedans ne peut servir de {label} ({formats}). Rien n’a été gardé.', { label: lowerFirst(label), formats: mediaTypeInfo(r.type).formats.join(', ') }),
        sections: asideSections(r),
        actions: [
          { label: t('Retour à la recherche'), detail: t('Reprend la page où vous en étiez'), tone: 'ok', run: research },
          { label: t('Retour : {label}', { label }), run: back },
        ],
        back,
      };
    }
    const actions: Action[] = list.map((u) => ({ label: path.basename(u.file), detail: statusOf(r.type, u).label, run: () => ctx.show(() => buildFile(key, u)) }));
    actions.push({ label: t('Retour à la recherche'), detail: t('Reprend la page où vous en étiez'), run: research }, { label: t('Garder pour plus tard'), detail: t('Restent proposés dans « Voir les propositions »'), run: back });
    return {
      heading: t('Reçu pour « {label} » : {n} fichiers', { label, n: list.length }),
      subheading: `${table.title} · ${fromOf(r)} · ${r.filename}`,
      lead: t('Choisissez celui à affecter : son aperçu, ce qui sera écrit et ce qui part à la corbeille sont montrés avant toute écriture.'),
      sections: asideSections(r),
      actions,
      back,
      media: { cards: list.map((u, i) => cardOf(table, r, u, i)) },
    };
  }

  /** État d'un fichier pour le média : accepté, ou ce qu'il faut en faire. */
  function statusOf(type: MediaType, u: Usable): { label: string; tone: Tone } {
    if (!u.convert) return { label: isAudioType(type) ? t('Accepté · à découper si besoin') : t('Accepté tel quel'), tone: 'ok' };
    if (u.convert.to === 'png') return { label: t('À convertir en PNG'), tone: 'info' };
    return { label: u.convert.from === 'video' ? t('Son de la vidéo, à extraire en WAV') : t('À convertir en WAV'), tone: 'info' };
  }

  /** Aperçu d'un fichier reçu ; un son s'écoute quand sa carte est choisie. */
  function thumbOf(table: TableEntry, type: MediaType, u: Usable): MediaThumb {
    const kind = mediaKind(u.file);
    if (!kind || !fs.existsSync(u.file)) return { kind: u.kind === 'audio' ? 'audio' : 'fallback', rotation: 0, text: u.kind === 'audio' ? '♪' : t('Aperçu après la conversion') };
    if (kind === 'audio' || (u.convert?.to === 'wav' && kind === 'video')) {
      allowPreview(u.file);
      return { kind: 'audio', url: mediaUrl(u.file), rotation: 0, text: '♪', poster: wholeWave(u.file) };
    }
    if (isAcceptedFormat(type, u.file)) return ctx.thumb(table, type, u.file);
    allowPreview(u.file);
    return { kind, url: mediaUrl(u.file), rotation: 0 };
  }

  /** Forme d'onde du son entier d'un fichier reçu, s'il a été analysé : l'image de sa carte. */
  function wholeWave(file: string): string | undefined {
    const probe = probes.get(file);
    if (!probe) return undefined;
    const out = path.join(path.dirname(file), '..', 'apercus', `forme-${path.basename(file).replace(/[^\w.-]+/g, '_')}.png`);
    if (!fs.existsSync(out)) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, waveformPng(probe.peaks, WAVE_SIZE));
    }
    allowPreview(out);
    return mediaUrl(out);
  }

  function factsOf(u: Usable): string {
    const length = duration(u.file);
    let size = '';
    try {
      size = formatSize(fs.statSync(u.file).size);
    } catch {
      return t('fichier introuvable');
    }
    const ext = path.extname(u.file).slice(1).toLowerCase();
    if (u.kind === 'audio' || u.convert?.to === 'wav') return [u.convert?.from === 'video' ? t('vidéo {ext}', { ext }) : t('son {ext}', { ext }), length ? formatClock(length) : undefined, size].filter(Boolean).join(' · ');
    return mediaKind(u.file) ? ctx.facts(u.file) : `${ext} · ${size}`;
  }

  function cardOf(table: TableEntry, r: WebReceipt, u: Usable, action?: number): MediaCard {
    return { action, title: path.basename(u.file), code: fromOf(r), state: statusOf(r.type, u), facts: factsOf(u), thumb: thumbOf(table, r.type, u) };
  }

  /** Ce qui sera écrit pour ce média : le nom rangé, et ce qui part à la corbeille. */
  function planText(table: TableEntry, type: MediaType, ext: string): string {
    const info = mediaTypeInfo(type);
    const now = ctx.current(table, type);
    const name = mediaFileName(table, type, ext, info.pages ? now.length + 1 : 1);
    if (info.pages) return t('À l’enregistrement : nouvelle page {page}, rangée sous « {name} ».', { page: now.length + 1, name });
    if (now[0]) return t('À l’enregistrement : rangé sous « {name} » ; {old}, montré aujourd’hui, part à la corbeille.', { name, old: path.basename(now[0]) });
    return t('À l’enregistrement : rangé sous « {name} ».', { name });
  }

  function buildFile(key: string, u: Usable): Built {
    const r = receiptOf(key);
    const table = r && ctx.find(r.table);
    if (!r || !table) return lost();
    const type = r.type;
    const info = mediaTypeInfo(type);
    const label = info.label;
    const name = path.basename(u.file);
    const ext = path.extname(u.file).slice(1).toLowerCase();
    const back = () => ctx.back(type);
    const research = () => {
      const text = open(table, type);
      ctx.back(type, { text, tone: 'info' });
    };
    const target = u.convert ? u.convert.to : ext;
    let lead: string;
    if (!u.convert) lead = t('« {file} » convient tel quel. « Affecter » l’écrit aussitôt : le menu le montre sans attendre.', { file: name });
    else if (u.convert.to === 'png') {
      lead = t('« {file} » est une image .{ext} que « {label} » ne lit pas : elle sera redessinée en PNG, à l’identique, puis rangée.', { file: name, ext, label });
      if (type === 'Wheel' && /^(jpe?g|jfif|bmp)$/.test(ext)) lead += ` ${t('Ce format n’a pas de transparence : le logo gardera son fond.')}`;
    } else if (u.convert.from === 'video') {
      lead = t('« {file} » est une vidéo : son son sera extrait en WAV, découpé à votre guise, puis rangé.', { file: name });
      if (isMp4(u)) lead += ` ${t('Sa piste son peut aussi être prise telle quelle, en .m4a, sans réencodage.')}`;
    }
    else lead = t('« {file} » est un son .{ext} que le menu ne lit pas : il sera converti en WAV, découpé à votre guise, puis rangé.', { file: name, ext });
    const sections: Section[] = asideSections(r);
    const actions: Action[] = [];
    const entry = (file: string): MediaPageEntry => ({ from: file, mode: 'copy', origin: originOf(r) });
    // « l'ancien fichier » seulement s'il y en a un (une page s'ajoute, rien ne part).
    const written = !info.pages && ctx.current(table, type).length ? t('Écrit aussitôt ; l’ancien fichier va à la corbeille') : t('Écrit aussitôt');
    const commit = (file: string) => {
      const message = ctx.commit(table, type, entry(file));
      ctx.back(type, message);
    };
    if (isAudioType(type)) {
      actions.push({ label: t('Découper puis affecter…'), detail: t('Début, fin, fondu de fin : l’extrait s’écoute avant d’être écrit'), tone: 'ok', run: () => openTrim(key, u) });
      const whole = duration(u.file) ? t('Le son entier : {length}', { length: formatClock(duration(u.file)!) }) : t('Le son entier');
      if (isMp4(u)) actions.push({ label: t('Prendre son son tel quel (.m4a) et affecter'), detail: t('Sans réencodage ; le son entier'), run: () => takeMp4Sound(key, u, commit) });
      if (!u.convert) actions.push({ label: t('Affecter tel quel et enregistrer'), detail: whole, run: () => commit(u.file) });
      else actions.push({ label: t('Convertir en WAV (son entier) et affecter'), detail: whole, run: () => convertWhole(key, u, commit) });
    } else if (!u.convert) {
      actions.push({ label: t('Affecter à « {label} » et enregistrer', { label }), detail: written, tone: 'ok', run: () => commit(u.file) });
    } else {
      actions.push({ label: t('Convertir en PNG, puis affecter'), detail: written, tone: 'ok', run: () => convertImage(key, u, commit) });
    }
    if (!u.convert) {
      actions.push({
        label: t('Mettre dans le brouillon'),
        detail: t('Sans rien écrire : avec les autres changements, à « Enregistrer »'),
        run: () => ctx.back(type, { text: ctx.place(table, type, entry(u.file)), tone: 'info' }),
      });
    }
    actions.push(
      { label: t('Retour à la recherche'), detail: t('Reprend la page où vous en étiez'), run: research },
      { label: t('Garder pour plus tard'), detail: t('Reste proposé dans « Voir les propositions »'), run: back },
    );
    // Un son s'écoute tant que sa carte est choisie : la carte est la première action, « Écouter ».
    const card = cardOf(table, r, u);
    card.pending = planText(table, type, target);
    if (card.thumb.kind === 'audio' && card.thumb.url) {
      actions.unshift({ label: t('Écouter'), detail: t('Le son joue tant que sa carte est choisie'), run: () => undefined });
      card.action = 0;
    }
    return {
      heading: t('Reçu pour « {label} »', { label }),
      subheading: `${table.title} · ${fromOf(r)}${r.filename !== name ? ` · ${r.filename}` : ''}`,
      lead,
      sections,
      actions,
      back,
      media: { cards: [card], large: true },
    };
  }

  /** Dossier d'un reçu, pour les fichiers produits (conversions, extraits, aperçus). */
  function receiptDir(key: string): string | undefined {
    const dir = ctx.downloadsDir();
    return dir ? path.join(dir, 'sites', 'web', key.slice(4)) : undefined;
  }

  /** Nom libre dans le dossier : « nom.png », sinon « nom (2).png ». */
  function freeName(dir: string, base: string, ext: string): string {
    let file = path.join(dir, `${base}.${ext}`);
    for (let n = 2; fs.existsSync(file); n++) file = path.join(dir, `${base} (${n}).${ext}`);
    return file;
  }

  function convertImage(key: string, u: Usable, commit: (file: string) => void): void {
    const dir = receiptDir(key);
    if (!dir) return;
    void ctx.task(t('Conversion en PNG…'), async () => {
      const out = freeName(path.join(dir, 'fichiers'), path.basename(u.file, path.extname(u.file)), 'png');
      try {
        await ctx.convert.imageToPng(u.file, out);
      } catch (error) {
        return ctx.back(receiptOf(key)!.type, { text: t('Conversion impossible : {error}. Rien n’a été écrit.', { error: (error as Error).message }), tone: 'error' });
      }
      ctx.sites.addWebFile(key, out, 'image');
      commit(out);
    });
  }

  /** Vidéo MP4 (ou MOV) dont la piste son peut se prendre telle quelle (mp4audio.ts, « Sons de la table »). */
  const isMp4 = (u: Usable) => u.convert?.from === 'video' && (MP4_VIDEO_EXTENSIONS as readonly string[]).includes(path.extname(u.file).slice(1).toLowerCase());

  /** La piste son d'une vidéo MP4, recopiée en .m4a sans réencodage ; sinon la raison, et le WAV reste possible. */
  function takeMp4Sound(key: string, u: Usable, commit: (file: string) => void): void {
    const dir = receiptDir(key);
    const r = receiptOf(key);
    if (!dir || !r) return;
    const out = freeName(path.join(dir, 'fichiers'), path.basename(u.file, path.extname(u.file)), 'm4a');
    const got = extractMp4Sound(u.file, out);
    if (!got.ok) {
      const reason =
        got.reason === 'no-sound' ? t('la vidéo n’a pas de piste son') : got.reason === 'unplayable' ? t('son dans un codec que le menu ne lit pas') : got.reason === 'fragmented' ? t('vidéo fragmentée') : t('vidéo illisible');
      return ctx.back(r.type, { text: t('Son non extrait tel quel : {reason}. « Découper puis affecter… » le convertit en WAV.', { reason }), tone: 'warning' });
    }
    ctx.sites.addWebFile(key, out, 'audio');
    commit(out);
  }

  function convertWhole(key: string, u: Usable, commit: (file: string) => void): void {
    const dir = receiptDir(key);
    if (!dir) return;
    void ctx.task(t('Conversion en WAV…'), async () => {
      const out = freeName(path.join(dir, 'fichiers'), path.basename(u.file, path.extname(u.file)), 'wav');
      try {
        const length = duration(u.file) || (await ctx.convert.probeAudio(u.file)).duration;
        await ctx.convert.audioToWav(u.file, out, { start: 0, end: length, fade: false }, TRIM_FADE);
      } catch (error) {
        return ctx.back(receiptOf(key)!.type, { text: t('Conversion impossible : {error}. Rien n’a été écrit.', { error: (error as Error).message }), tone: 'error' });
      }
      ctx.sites.addWebFile(key, out, 'audio');
      commit(out);
    });
  }

  // ---------- Découpe d'un son ----------

  function openTrim(key: string, u: Usable): void {
    const r = receiptOf(key);
    if (!r) return;
    void ctx.task(t('Lecture du son…'), async () => {
      let probe: AudioProbe;
      try {
        probe = await ctx.convert.probeAudio(u.file);
      } catch (error) {
        return ctx.back(r.type, { text: t('Son illisible : {error}. Rien n’a été écrit.', { error: (error as Error).message }), tone: 'error' });
      }
      probes.set(u.file, probe);
      trimming = { key, item: u, probe, trim: defaultTrim(r.type, probe.duration), step: TRIM_STEPS[0]!, serial: 0, waves: [] };
      drawWave(trimming);
      void refreshExtract(trimming);
      ctx.show(() => buildTrim(), 0);
    });
  }

  const trimKey = (trim: AudioTrim) => `${trim.start}-${trim.end}-${trim.fade ? 1 : 0}`;

  function previewDir(tr: Trimming): string | undefined {
    const dir = receiptDir(tr.key);
    return dir ? path.join(dir, 'apercus') : undefined;
  }

  /** Forme d'onde de la découpe affichée (un fichier par découpe : l'aperçu change de nom, l'écran le recharge). */
  function drawWave(tr: Trimming): void {
    const dir = previewDir(tr);
    if (!dir) return;
    const d = tr.probe.duration || 1;
    const file = path.join(dir, `forme-${trimKey(tr.trim)}.png`);
    if (!fs.existsSync(file)) {
      fs.mkdirSync(dir, { recursive: true });
      const fade = tr.trim.fade ? Math.max(tr.trim.start, tr.trim.end - TRIM_FADE) / d : undefined;
      fs.writeFileSync(file, waveformPng(tr.probe.peaks, { ...WAVE_SIZE, start: tr.trim.start / d, end: tr.trim.end / d, fade }));
    }
    tr.wave = file;
    tr.waves = [file, ...tr.waves.filter((w) => w !== file)];
    for (const old of tr.waves.splice(2)) fs.rmSync(old, { force: true });
  }

  /** Prépare l'extrait de la découpe affichée, en tâche de fond ; l'écran se redessine quand il est prêt. */
  async function refreshExtract(tr: Trimming): Promise<void> {
    if (tr.busy) {
      tr.again = true;
      return;
    }
    const dir = previewDir(tr);
    if (!dir) return;
    tr.busy = true;
    try {
      do {
        tr.again = false;
        const wantedTrim = { ...tr.trim };
        const file = path.join(dir, `extrait-${tr.serial++}.wav`);
        try {
          await ctx.convert.audioToWav(tr.item.file, file, wantedTrim, TRIM_FADE);
        } catch {
          continue;
        }
        if (tr.extract) fs.rmSync(tr.extract.file, { force: true });
        tr.extract = { file, trim: trimKey(wantedTrim) };
      } while (tr.again);
    } finally {
      tr.busy = false;
    }
    if (trimming === tr) ctx.broadcast();
  }

  function adjust(change: (trim: AudioTrim) => AudioTrim): void {
    const tr = trimming;
    if (!tr) return;
    tr.trim = clampTrim(change({ ...tr.trim }), tr.probe.duration);
    drawWave(tr);
    void refreshExtract(tr);
    ctx.show(() => buildTrim(), ctx.cursor());
  }

  function buildTrim(): Built {
    const tr = trimming;
    const r = tr && receiptOf(tr.key);
    const table = r && ctx.find(r.table);
    if (!tr || !r || !table) return lost();
    const type = r.type;
    const label = typeLabel(type);
    const { trim, step } = tr;
    const duration = tr.probe.duration;
    const length = trim.end - trim.start;
    const back = () => ctx.show(() => buildFile(tr.key, tr.item));
    const ready = tr.extract && tr.extract.trim === trimKey(trim) && fs.existsSync(tr.extract.file) ? tr.extract.file : undefined;
    const nextStep = TRIM_STEPS[(TRIM_STEPS.indexOf(step) + 1) % TRIM_STEPS.length]!;
    const actions: Action[] = [
      { label: t('Écouter l’extrait'), detail: t('Il joue tant que sa carte est choisie'), run: () => undefined },
      {
        label: t('Affecter cet extrait et enregistrer'),
        detail: ctx.current(table, type).length ? t('{length} en WAV ; l’ancien fichier va à la corbeille', { length: formatClock(length) }) : t('{length} en WAV', { length: formatClock(length) }),
        tone: 'ok',
        run: () => commitTrim(tr),
      },
      { label: t('Début plus tard (+{n} s)', { n: step }), detail: t('Début : {time}', { time: formatClock(trim.start) }), run: () => adjust((x) => ({ ...x, start: x.start + step })) },
      { label: t('Début plus tôt (−{n} s)', { n: step }), detail: t('Début : {time}', { time: formatClock(trim.start) }), run: () => adjust((x) => ({ ...x, start: x.start - step })) },
      { label: t('Fin plus tard (+{n} s)', { n: step }), detail: t('Fin : {time}', { time: formatClock(trim.end) }), run: () => adjust((x) => ({ ...x, end: x.end + step })) },
      { label: t('Fin plus tôt (−{n} s)', { n: step }), detail: t('Fin : {time}', { time: formatClock(trim.end) }), run: () => adjust((x) => ({ ...x, end: x.end - step })) },
      {
        label: t('Pas : {n} s', { n: step }),
        detail: t('Start : passer à {n} s', { n: nextStep }),
        run: () => {
          tr.step = nextStep;
          ctx.show(() => buildTrim(), ctx.cursor());
        },
      },
      { label: trim.fade ? t('Fondu de fin : oui') : t('Fondu de fin : non'), detail: t('{n} s pour finir en douceur au lieu d’une coupure nette', { n: TRIM_FADE }), run: () => adjust((x) => ({ ...x, fade: !x.fade })) },
      { label: t('Tout le son'), detail: formatClock(duration), run: () => adjust((x) => ({ ...x, start: 0, end: duration })) },
      { label: t('Retour'), run: back },
    ];
    // La carte montre la forme d'onde de la découpe et fait entendre l'extrait, une fois prêt.
    const thumb: MediaThumb = { kind: 'audio', rotation: 0, text: t('Préparation de l’extrait…') };
    if (tr.wave && fs.existsSync(tr.wave)) {
      allowPreview(tr.wave);
      thumb.poster = mediaUrl(tr.wave);
    }
    if (ready) {
      allowPreview(ready);
      thumb.url = mediaUrl(ready);
    }
    const cards: MediaCard[] = [
      {
        action: 0,
        title: t('Extrait : {from} → {to}', { from: formatClock(trim.start), to: formatClock(trim.end) }),
        code: formatClock(length),
        state: ready ? { label: t('À écouter'), tone: 'ok' } : { label: t('Préparation…'), tone: 'info' },
        facts: [t('Partie gardée en vert, sur {total}', { total: formatClock(duration) }), t('WAV 44,1 kHz'), trim.fade ? t('fondu de fin') : undefined].filter(Boolean).join(' · '),
        extra: [t('L’extrait joue tant que cette carte est choisie.')],
        thumb,
      },
    ];
    return {
      heading: t('Découper : {label}', { label }),
      subheading: `${table.title} · ${path.basename(tr.item.file)}`,
      lead:
        type === 'AudioLaunch'
          ? t('Le son de lancement accompagne le départ de la partie : quelques secondes suffisent. Rien n’est écrit avant « Affecter cet extrait ».')
          : t('La musique du jeu joue en boucle tant que la table est choisie : gardez le passage qui la fait reconnaître. Rien n’est écrit avant « Affecter cet extrait ».'),
      sections: [],
      actions,
      back,
      media: { cards, large: true },
    };
  }

  function commitTrim(tr: Trimming): void {
    const r = receiptOf(tr.key);
    const table = r && ctx.find(r.table);
    const dir = receiptDir(tr.key);
    if (!r || !table || !dir) return;
    void ctx.task(t('Préparation de l’extrait…'), async () => {
      const out = freeName(path.join(dir, 'fichiers'), t('{name} (extrait)', { name: path.basename(tr.item.file, path.extname(tr.item.file)) }), 'wav');
      try {
        if (tr.extract && tr.extract.trim === trimKey(tr.trim) && fs.existsSync(tr.extract.file)) fs.copyFileSync(tr.extract.file, out);
        else await ctx.convert.audioToWav(tr.item.file, out, tr.trim, TRIM_FADE);
      } catch (error) {
        return ctx.back(r.type, { text: t('Découpe impossible : {error}. Rien n’a été écrit.', { error: (error as Error).message }), tone: 'error' });
      }
      ctx.sites.addWebFile(tr.key, out, 'audio');
      trimming = undefined;
      const message = ctx.commit(table, r.type, { from: out, mode: 'copy', origin: originOf(r) });
      ctx.back(r.type, message);
    });
  }

  return {
    open,
    detail,
    /** Fin de la visite du gestionnaire : plus de surveillance de Téléchargements de Windows. */
    stop: () => {
      wanted = undefined;
      trimming = undefined;
      ctx.sites.stopWeb();
    },
    /** Pour les essais : l'écran d'un reçu. */
    showReceived,
  };
}

export type WebSearch = ReturnType<typeof createWebSearch>;
