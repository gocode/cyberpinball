// Crédits de la communauté à l'écran (packages/core/src/credits.ts, décidés le 12/11/2026) :
// - fiche d'une table > « Crédits » : une ligne par rôle, de la vraie machine aux règles. Start sur
//   une ligne : tous ses auteurs, et la page d'où vient la pièce en QR code, à viser au téléphone ;
// - Menu système > Cyber Pinball > La communauté : les auteurs de la borne, des plus présents aux
//   moins présents, puis les logiciels et les sites sans lesquels rien ne marche ;
// - la ligne de la roue (« par TastyWasps ») et celle du mode attente, demandées par le menu.
//
// Ce que la borne sait d'une table (provenance, fichiers présents, médias, règles) est rassemblé
// par library.ts (host.input) : ce module ne lit rien lui-même.

import {
  attractCredits,
  communityAuthors,
  creditsSummary,
  creditText,
  formatList,
  leadAuthor,
  t,
  tableCredits,
  type CreditGroup,
  type CreditRow,
  type TableCreditsInput,
  type TableEntry,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';
import { qrRows } from './remote-qr';

/** Ce que la borne lit d'une table : rien du disque (« quick »), la table seule (« table »), ou tout (« full »). */
export type CreditsDepth = 'quick' | 'table' | 'full';

export interface CreditsMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  input(table: TableEntry, depth: CreditsDepth): TableCreditsInput;
  tables(): TableEntry[];
  /** Fiche de la table, où « Retour » ramène. */
  openSheet(table: TableEntry): void;
}

/** Logiciels et sites crédités par « La communauté » : noms propres, rôles traduits. */
const SOFTWARE: [string, () => string, () => string | undefined][] = [
  ['Visual Pinball X', () => t('Le simulateur'), () => t('l’équipe de VPX')],
  ['PinMAME', () => t('Le programme des vraies machines'), () => undefined],
  ['B2S Backglass Server', () => t('Les frontons'), () => undefined],
  ['Serum', () => t('Les couleurs du DMD'), () => undefined],
  ['PinUP Player', () => t('Les vidéos des PuP-Packs'), () => undefined],
  ['DOF', () => t('Les toys de la borne'), () => 'Direct Output Framework'],
];
const SITES: [string, () => string][] = [
  ['VPS', () => t('Virtual Pinball Spreadsheet : la base qui relie tout')],
  ['VPinMediaDB', () => t('Les images et vidéos du menu')],
  ['VPUniverse', () => t('Les tables et leur habillage')],
  ['VPForums', () => t('Les tables et leur habillage')],
  ['IPDB', () => t('L’histoire des vraies machines')],
  ['The Pinball Primer', () => t('Les feuilles de règles')],
];

/** Une ligne a-t-elle plus à montrer que ce que la page dit déjà (une adresse, des auteurs coupés) ? */
const hasMore = (row: CreditRow) => Boolean(row.url) || row.authors.length > 4;

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

export function createCreditsMenu(host: CreditsMenuHost) {
  // ---------- Page « Crédits » d'une table ----------

  function credits(table: TableEntry, depth: CreditsDepth = 'full'): CreditGroup[] {
    return tableCredits(host.input(table, depth));
  }

  function open(table: TableEntry, at = 0): void {
    host.library.openCustom(() => page(table), at);
  }

  function page(table: TableEntry): Built {
    const groups = credits(table);
    const picks: CreditRow[] = [];
    const sections: Section[] = groups.map((g) => ({
      title: g.title,
      kind: 'spec',
      rows: g.rows.map((row): Row => {
        const more = hasMore(row);
        if (more) picks.push(row);
        return {
          label: row.role,
          text: creditText(row),
          detail: row.unknown ?? row.detail,
          ...(row.unknown ? { tone: 'quiet' as const } : {}),
          ...(more ? { action: picks.length - 1, pick: true } : {}),
        };
      }),
    }));
    const back = () => host.openSheet(table);
    const actions: Action[] = [
      ...picks.map((row, i): Action => ({ label: row.role, door: 'sheet.credits', run: () => openRow(table, row, () => open(table, i)) })),
      { label: t('La communauté'), detail: t('Tous les auteurs de la borne, les logiciels, les sites'), icon: 'friends', door: 'sheet.credits', run: () => openCommunity(() => open(table, picks.length)) },
      { label: t('Retour à la fiche'), icon: 'back', door: 'sheet.credits', run: back },
    ];
    return {
      heading: t('Crédits'),
      icon: 'credits',
      subheading: [table.title, table.manufacturer, table.year].filter(Boolean).join(' · '),
      lead: picks.length
        ? t('Les auteurs de cette table et de tout ce qui l’entoure. Start sur une ligne : tous ses auteurs, et sa page en QR code pour le téléphone.')
        : t('Les auteurs de cette table et de tout ce qui l’entoure.'),
      // Une colonne de rôles commune à tous les groupes : les noms partent du même bord (library.css, .lib-credits).
      variant: 'credits',
      sections,
      actions,
      back,
    };
  }

  /** Start sur une ligne : la page source en QR code, tous les auteurs, leurs autres travaux sur la borne. */
  function openRow(table: TableEntry, row: CreditRow, back: () => void): void {
    host.library.openCustom(() => {
      const sections: Section[] = [];
      if (row.authors.length) sections.push({ title: row.authors.length > 1 ? t('{n} auteurs', { n: row.authors.length }) : t('Auteur'), rows: [{ text: row.authors.join(', ') }] });
      else sections.push({ rows: [{ text: creditText(row), detail: row.unknown ?? row.detail, ...(row.unknown ? { tone: 'quiet' as const } : {}) }] });
      const elsewhere = row.authors.length ? alsoHere(row.authors, table) : [];
      if (elsewhere.length) sections.push({ title: t('Leur travail sur votre borne'), rows: elsewhere });
      return {
        heading: row.role,
        icon: 'credits',
        subheading: [table.title, row.authors.length ? row.detail : undefined].filter(Boolean).join(' · '),
        ...(row.url
          ? {
              // Le bloc du QR code de la télécommande, avec ses propres phrases : ce code n'appaire rien, il ouvre une page.
              remote: { phase: 'offer' as const, qr: qrRows(row.url), url: row.url, title: '', line: '' },
              remoteWording: {
                offer: t('Sa page sur {site}', { site: siteName(row.url) }),
                offerLines: [t('Visez ce code avec votre téléphone : la page, ses mises à jour, ses commentaires. Un merci y fait toujours plaisir.'), shortUrl(row.url)],
              },
            }
          : {}),
        sections,
        actions: [{ label: t('Retour aux crédits'), icon: 'back', door: 'sheet.credits', run: back }],
        back,
      };
    });
  }

  function siteName(url: string): string {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      return host.endsWith('vpuniverse.com') ? 'VPUniverse' : host.endsWith('vpforums.org') ? 'VPForums' : host.endsWith('youtube.com') ? 'YouTube' : host;
    } catch {
      return url;
    }
  }

  /** Ce que ces auteurs ont fait d'autre sur la borne (trois au plus), d'après le classement de la communauté. */
  function alsoHere(authors: readonly string[], table: TableEntry): Row[] {
    const ranked = community().filter((a) => authors.some((x) => x.toLowerCase() === a.name.toLowerCase()));
    return ranked
      .map((a) => ({ a, others: a.tables.filter((title) => title !== table.title) }))
      .filter(({ others }) => others.length)
      .slice(0, 3)
      .map(({ a, others }) => ({ text: a.name, detail: t('aussi crédité sur {tables}', { tables: others.length > 3 ? t('{names} et {n} autres', { names: others.slice(0, 3).join(', '), n: others.length - 3 }) : formatList(others) }) }));
  }

  // ---------- La communauté ----------

  let ranked: { at: number; list: ReturnType<typeof communityAuthors> } | undefined;

  /** Classement des auteurs de la borne, refait au plus toutes les 30 s (ouvrir puis revenir ne relit rien). */
  function community(): ReturnType<typeof communityAuthors> {
    if (ranked && Date.now() - ranked.at < 30_000) return ranked.list;
    const tables = host.tables();
    const list = communityAuthors(tables.map((table) => ({ title: table.title, groups: credits(table, 'quick') })));
    ranked = { at: Date.now(), list };
    return list;
  }

  function openCommunity(back: () => void, at = 0): void {
    host.library.openCustom(() => communityPage(back), at);
  }

  function communityPage(back: () => void): Built {
    const list = community();
    const shown = list.slice(0, 40);
    const tables = host.tables().length;
    const sections: Section[] = [];
    if (shown.length) {
      sections.push({
        title: t('Sur votre borne'),
        kind: 'spec',
        rows: shown.map((a, i) => ({ label: a.name, text: a.roles, action: i, pick: true })),
        ...(list.length > shown.length ? { more: list.length - shown.length } : {}),
      });
    } else {
      sections.push({ title: t('Sur votre borne'), rows: [{ text: t('Aucun auteur connu pour l’instant'), detail: t('Les auteurs sont notés à l’installation depuis le catalogue ; ceux écrits dans une table s’affichent dans ses crédits.'), tone: 'quiet' }] });
    }
    sections.push({ title: t('Les logiciels'), kind: 'spec', rows: SOFTWARE.map(([name, role, detail]) => ({ label: name, text: role(), detail: detail() })) });
    sections.push({ title: t('Les bases et les sites'), kind: 'spec', rows: SITES.map(([name, role]) => ({ label: name, text: role() })) });
    return {
      heading: t('La communauté'),
      icon: 'friends',
      subheading: shown.length ? t('{authors} auteurs sur cette borne · {tables} tables', { authors: list.length, tables }) : undefined,
      lead: t('Cyber Pinball range et lance. Les tables, les frontons, les couleurs, les sons et les vidéos sont l’œuvre de passionnés, qui les partagent gratuitement.'),
      variant: 'credits',
      sections,
      actions: [
        ...shown.map((a, i): Action => ({ label: a.name, run: () => openAuthor(a, () => openCommunity(back, i)) })),
        { label: t('Retour'), icon: 'back', run: back },
      ],
      back,
    };
  }

  function openAuthor(author: ReturnType<typeof communityAuthors>[number], back: () => void): void {
    host.library.openCustom(() => ({
      heading: author.name,
      icon: 'credits',
      subheading: author.roles,
      sections: [{ title: t('Ses tables sur votre borne'), rows: author.tables.map((title) => ({ text: title })) }],
      actions: [{ label: t('Retour à la communauté'), icon: 'back', run: back }],
      back,
    }));
  }

  return {
    open,
    /** Entrée « Crédits » de la fiche : le résumé sans relire le dossier de la table. */
    summary: (table: TableEntry) => creditsSummary(credits(table, 'table')),
    /** Auteur principal de la recréation, pour la roue (« par TastyWasps ») : le .info d'abord, la table ensuite. */
    lead: (table: TableEntry) => leadAuthor(table.info) ?? leadAuthor({}, host.input(table, 'table').vpxAuthor),
    /** Ligne du mode attente : « Table … · fronton … · couleurs … », vide quand on ne sait rien. */
    attractLine: (table: TableEntry) => attractCredits(credits(table, 'quick')),
    systemItem: {
      get detail() {
        return t('Les auteurs de vos tables, les logiciels, les sites');
      },
      run: () => openCommunity(() => host.library.openSystem()),
    } satisfies ProvidedSystemItem,
  };
}

export type CreditsMenu = ReturnType<typeof createCreditsMenu>;
