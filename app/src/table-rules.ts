// Rubrique « Règles » du livret de la fiche (Prospectus et règles) : ce que Cyber Pinball trouve
// seul pour expliquer le jeu, dans cet ordre :
//   1. les cartes de règles de la table (ses médias GameHelp ; sinon la carte rangée dans le .vpx) ;
//   2. le texte de règles que l'auteur a rangé dans le .vpx ;
//   3. une feuille de règles publique (The Pinball Primer, Pinball Rule Sheets), lue sur la
//      machine du joueur au moment où il en a besoin et gardée en cache (core/tablerules.ts) ;
//   4. une vidéo d'explication que VPS connaît (YouTube, à regarder sur le téléphone) ;
//   5. les commandes de la partie, toujours en dernier, avec ce que chaque source a donné.
// Rien ne bloque la fiche : la recherche part en arrière-plan, le livret se complète à son retour.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  authorRuleBlocks,
  b2sCacheDir,
  findRuleSheet,
  looksEnglish,
  mediaUrl,
  paginateRules,
  RULE_SITES,
  ruleVideo,
  t,
  type RuleBlock,
  type RuleSheet,
  type RuleVideo,
  type SheetPage,
  type TableEntry,
  type VpsGame,
} from '@cyberpinball/core';
import { qrRows } from './remote-qr';

/** Où en est une source de règles, pour la dernière page. */
export type RuleSourceState = 'found' | 'none' | 'offline' | 'searching' | 'no-game' | 'no-catalog';

export interface RuleSourceLine {
  label: string;
  detail: string;
  state: RuleSourceState;
}

export type HelpPage =
  | { kind: 'media'; page: SheetPage; source: string }
  | {
      kind: 'text';
      /** D'où vient le texte, affiché sous la page. */
      source: string;
      url?: string;
      title: string;
      /** Texte en anglais montré dans l'interface française. */
      english: boolean;
      blocks: (RuleBlock & { more?: boolean })[];
      part: number;
      parts: number;
    }
  | { kind: 'video'; source: string; title?: string; authors?: string; url: string; thumb?: string; qr: string[] }
  | { kind: 'controls'; keys: [string, string][]; sources: RuleSourceLine[] };

interface Found {
  /** Fichier, taille, date : une table remplacée est recherchée de nouveau. */
  key: string;
  /** Début de la recherche : une recherche faite sans réseau se refait à la fiche suivante, une minute après. */
  at: number;
  running: boolean;
  vpxCard?: string;
  vpxCardDone: boolean;
  author: RuleBlock[];
  authorDone: boolean;
  game: { state: 'searching' | 'found' | 'no-game' | 'no-catalog'; game?: VpsGame };
  sheet: { state: RuleSourceState; sheet?: RuleSheet };
  video: { state: RuleSourceState; video?: RuleVideo; thumb?: string };
}

export interface TableRulesContext {
  dataDir: string;
  /** Langue de l'interface : un texte anglais est signalé ailleurs qu'en anglais. */
  english: () => boolean;
  /** Jeu VPS de la table, sans rien télécharger ; `no-catalog` : la base n'est pas encore là. */
  game(table: TableEntry): Promise<VpsGame | 'no-game' | 'no-catalog'>;
  /** Carte de règles rangée dans le .vpx (fichier du cache des médias). */
  vpxCard(table: TableEntry): string | undefined;
  /** Texte TableRules du .vpx. */
  vpxRules(table: TableEntry): string | undefined;
  broadcast(): void;
  fetch?: typeof fetch;
}

/** Pages de texte, au plus : au-delà, la feuille se lit sur son site (adresse sous chaque page). */
const MAX_TEXT_PAGES = 80;

export function createTableRules(ctx: TableRulesContext) {
  const found = new Map<string, Found>();

  function keyOf(table: TableEntry): string {
    try {
      const st = fs.statSync(table.file);
      return `${table.file.toLowerCase()}|${st.size}|${st.mtimeMs}`;
    } catch {
      return table.file.toLowerCase();
    }
  }

  function stateOf(table: TableEntry): Found | undefined {
    const f = found.get(table.file.toLowerCase());
    return f && f.key === keyOf(table) ? f : undefined;
  }

  /**
   * Lance la recherche des règles de la table, une fois (et de nouveau si la table change) :
   * le .vpx d'abord (carte, texte de l'auteur), puis VPS et la feuille de règles au réseau.
   * `ownCards` : la table a déjà ses cartes, la carte du .vpx n'est pas relue.
   */
  function ensure(table: TableEntry, ownCards: boolean): void {
    const known = stateOf(table);
    if (known && !(known.sheet.state === 'offline' && !known.running && Date.now() - known.at > 60_000)) return;
    const f: Found = {
      key: keyOf(table),
      at: Date.now(),
      running: true,
      vpxCardDone: ownCards,
      author: [],
      authorDone: false,
      game: { state: 'searching' },
      sheet: { state: 'searching' },
      video: { state: 'searching' },
    };
    found.set(table.file.toLowerCase(), f);
    // Après l'affichage de la fiche : la lecture du .vpx prend un instant.
    setTimeout(() => void run(table, f), 60);
  }

  async function run(table: TableEntry, f: Found): Promise<void> {
    try {
      try {
        f.author = authorRuleBlocks(ctx.vpxRules(table));
      } catch {
        f.author = [];
      }
      f.authorDone = true;
      if (!f.vpxCardDone) {
        try {
          f.vpxCard = ctx.vpxCard(table);
        } catch {
          f.vpxCard = undefined;
        }
        f.vpxCardDone = true;
      }
      ctx.broadcast();
      const game = await ctx.game(table).catch(() => 'no-game' as const);
      if (typeof game === 'string') {
        f.game = { state: game };
        f.sheet = { state: game };
        f.video = { state: game };
        return;
      }
      f.game = { state: 'found', game };
      const video = ruleVideo(game);
      f.video = video ? { state: 'found', video } : { state: 'none' };
      ctx.broadcast();
      const sheet = await findRuleSheet(ctx.dataDir, game, { fetch: ctx.fetch });
      f.sheet = sheet.sheet ? { state: 'found', sheet: sheet.sheet } : { state: sheet.status === 'offline' ? 'offline' : 'none' };
      if (video) f.video.thumb = await thumbnail(video.youtubeId);
    } finally {
      f.running = false;
      ctx.broadcast();
    }
  }

  /** Vignette de la vidéo, gardée dans le cache des médias (que le protocole cyber-media sert). */
  async function thumbnail(id: string): Promise<string | undefined> {
    const file = path.join(b2sCacheDir(ctx.dataDir), `regles-video-${id}.jpg`);
    if (fs.existsSync(file)) return file;
    try {
      const response = await (ctx.fetch ?? fetch)(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) return undefined;
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length < 1000) return undefined;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, data);
      return file;
    } catch {
      return undefined;
    }
  }

  const siteLabel = (sheet: RuleSheet) => RULE_SITES[sheet.site].name;

  /** Ce que chaque source a donné, pour la page des commandes. */
  function sourceLines(table: TableEntry, ownCards: number): RuleSourceLine[] {
    const f = stateOf(table);
    const wait = (s: RuleSourceState | undefined) => s === 'searching' || s === undefined;
    const reason = (s: RuleSourceState) =>
      s === 'searching'
        ? t('recherche en cours…')
        : s === 'offline'
          ? t('pas de réseau : nouvel essai à la prochaine ouverture')
          : s === 'no-game'
            ? t('jeu non reconnu dans le catalogue VPS')
            : s === 'no-catalog'
              ? t('catalogue VPS pas encore téléchargé')
              : t('aucune pour ce jeu');
    const card: RuleSourceLine = ownCards
      ? { label: t('Cartes de règles'), detail: t('{n} dans les médias du jeu', { n: ownCards }), state: 'found' }
      : !f?.vpxCardDone
        ? { label: t('Cartes de règles'), detail: reason('searching'), state: 'searching' }
        : f.vpxCard
          ? { label: t('Cartes de règles'), detail: t('rangée dans la table'), state: 'found' }
          : { label: t('Cartes de règles'), detail: t('aucune dans la table ni dans ses médias'), state: 'none' };
    const author: RuleSourceLine = !f?.authorDone
      ? { label: t('Texte de l’auteur'), detail: reason('searching'), state: 'searching' }
      : f.author.length
        ? { label: t('Texte de l’auteur'), detail: t('rangé dans la table'), state: 'found' }
        : { label: t('Texte de l’auteur'), detail: t('aucun dans la table'), state: 'none' };
    const sheetState = f?.sheet.state ?? 'searching';
    const sheet: RuleSourceLine = f?.sheet.sheet
      ? { label: t('Feuille de règles'), detail: siteLabel(f.sheet.sheet), state: 'found' }
      : { label: t('Feuille de règles'), detail: reason(sheetState), state: wait(sheetState) ? 'searching' : sheetState };
    const videoState = f?.video.state ?? 'searching';
    const video: RuleSourceLine = f?.video.video
      ? { label: t('Vidéo d’explication'), detail: 'YouTube', state: 'found' } // i18n-ignore : nom propre
      : { label: t('Vidéo d’explication'), detail: reason(videoState), state: wait(videoState) ? 'searching' : videoState };
    return [card, author, sheet, video];
  }

  /** Pages de la rubrique Règles, la dernière toujours celle des commandes. */
  function pages(table: TableEntry, own: readonly SheetPage[], keys: [string, string][]): HelpPage[] {
    const f = stateOf(table);
    const out: HelpPage[] = own.map((page) => ({ kind: 'media' as const, page, source: t('Carte de règles du jeu') }));
    if (!own.length && f?.vpxCard && fs.existsSync(f.vpxCard)) {
      out.push({ kind: 'media', page: { url: mediaUrl(f.vpxCard), kind: 'image' }, source: t('Carte de règles rangée dans la table par son auteur') });
    }
    const text = (blocks: RuleBlock[], title: string, source: string, english: boolean, url?: string) => {
      const chunks = paginateRules(blocks).slice(0, MAX_TEXT_PAGES);
      chunks.forEach((chunk, i) => out.push({ kind: 'text', title, source, english, url, blocks: chunk, part: i + 1, parts: chunks.length }));
    };
    if (f?.author.length) text(f.author, t('Règles de l’auteur de la table'), t('Texte rangé dans la table par son auteur'), !ctx.english() && looksEnglish(f.author));
    const sheet = f?.sheet.sheet;
    if (sheet) text(sheet.blocks, sheet.title, siteLabel(sheet), !ctx.english(), sheet.url);
    const video = f?.video.video;
    if (video) {
      out.push({
        kind: 'video',
        source: t('Vidéo d’explication connue du catalogue VPS'),
        title: video.title,
        authors: video.authors?.join(', '),
        url: video.url,
        thumb: f.video.thumb && fs.existsSync(f.video.thumb) ? mediaUrl(f.video.thumb) : undefined,
        qr: qrRows(video.url),
      });
    }
    out.push({ kind: 'controls', keys, sources: sourceLines(table, own.length) });
    return out;
  }

  /** « carte, texte de l'auteur, feuille de règles, vidéo · commandes » : ce que le livret montre. */
  function summary(table: TableEntry, ownCards: number): string {
    const f = stateOf(table);
    const parts: string[] = [];
    if (ownCards || f?.vpxCard) parts.push(t('carte'));
    if (f?.author.length) parts.push(t('texte de l’auteur'));
    if (f?.sheet.sheet) parts.push(siteLabel(f.sheet.sheet));
    if (f?.video.video) parts.push(t('vidéo'));
    if (f?.running) parts.push(t('recherche en cours…'));
    parts.push(t('commandes'));
    return parts.join(', ');
  }

  return { ensure, pages, summary, sourceLines };
}

export type TableRules = ReturnType<typeof createTableRules>;
