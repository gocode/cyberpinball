// Retour de partie (engagement, planche validée le 21/11/2026, `homeRetour`) : après une partie qui
// apporte du neuf (record personnel battu, place gagnée, joueur dépassé), un écran avant la roue :
// - le score et le record ;
// - « +N XP » sur la barre du niveau qui vient de monter (la part gagnée en clair) et le détail du
//   barème de levels.ts ;
// - le joueur dépassé, la place gagnée et le prochain à battre (packages/core/src/overtakes.ts) ;
// - « Rejouer », « Défier … » (challenges-menu.ts, avec le score de la partie), « Un mot à … »
//   (phrases préparées, entre amis) et « Retour aux tables ».
// Rien de neuf : pas d'écran. Il se passe d'un appui (Exit, ou Start sur « Retour aux tables ») ; un
// bouton encore tenu en sortant de la partie ne compte pas (GUARD_MS). L'animation des badges et du
// niveau garde son moment à elle : elle attend le bilan de la partie (`holding`), puis cet écran, et se
// montre au retour sur la roue. Ni ligue ni missions : elles n'existent pas encore.
//
// Sans electron à l'exécution : les tests chargent ce module avec des services d'essai.

import {
  badgeLabel,
  countryName,
  formatNumber,
  gainText,
  gameNews,
  gameOvertake,
  levelOf,
  locale,
  rivalPhrases,
  t,
  tierLabel,
  tierOf,
  tn,
  XP,
  type DailyHolder,
  type GameNews,
  type TableEntry,
} from '@cyberpinball/core';
import type { Action, Built } from './library';
import type { DailyTablesService } from './daily-tables';
import type { GameReport } from './level-tracker';
import { createHubScreen, type HubButtonSpec, type HubCardSpec, type HubSectionSpec, type HubSpec } from './hub-screen';

export interface GameReturnHost {
  library: { openCustom(build: () => Built, at?: number): void; leave(): void };
  daily: Pick<DailyTablesService, 'input' | 'face' | 'unavailable'>;
  /** « Un mot à … » : seulement à un ami, par la messagerie (chat-service.ts). */
  friends: { isFriend(key: string): boolean; send(key: string, text: string): boolean; closed?(): string | undefined };
  play(table: TableEntry): void;
  /** « Défier {nom} » (challenges-menu.ts) : le joueur dépassé, avec le score qu'on vient de faire ; absent : pas de bouton. */
  challenge?(rival: DailyHolder, f: GameReturnFacts, reopen: () => void): HubButtonSpec | undefined;
  zoneKeys(): readonly string[];
  /** L'écran peut-il s'ouvrir maintenant (la roue à l'écran, pas de partie, ni jeu local ni invité) ? */
  canOpen(): boolean;
  log(line: string): void;
  now?(): number;
}

/** Ce qu'on sait d'une partie finie, une fois ses scores publiés et ses XP comptés. */
export interface GameReturnFacts {
  table: TableEntry;
  /** Sa version exacte (boardKey) et ses billes ; absente : les classements n'en disent rien. */
  version?: { board: string; balls?: number };
  /** Début de la partie : mes scores publiés depuis sont les siens. */
  since: Date;
  report: GameReport;
}

export interface GameReturn {
  /** Une partie vient de finir : son bilan arrive (le moment des badges l'attend). */
  expect(): void;
  /** Le bilan : l'écran s'ouvre s'il y a du neuf. Rend vrai s'il s'est ouvert. */
  report(f: GameReturnFacts): boolean;
  /** Pas de bilan (erreur, partie qui ne compte pas) : l'attente prend fin. */
  release(): void;
  /** Le moment des badges et du niveau attend le bilan de la partie. */
  holding(): boolean;
  /** Ce qu'il y a de neuf dans ce bilan (essais). */
  news(f: GameReturnFacts): GameNews | undefined;
}

/** Un bouton encore tenu en sortant de la partie ne passe pas l'écran. */
export const GAME_RETURN_GUARD_MS = 1500;
/** Le bilan ne se fait jamais attendre plus que ça : le moment des badges passe quand même. */
const EXPECT_MAX_MS = 30_000;

export function createGameReturn(host: GameReturnHost): GameReturn {
  const now = () => host.now?.() ?? Date.now();
  const thin = String.fromCharCode(0x202f);
  const nbsp = String.fromCharCode(0xa0);
  const fmt = (n: number) => formatNumber(n).split(thin).join(nbsp);
  let expected: number | undefined;
  /** L'écran ouvert : sa partie, son bilan, depuis quand, à qui on a déjà écrit. */
  let shown: { f: GameReturnFacts; news: GameNews; at: number; sent?: string } | undefined;

  function news(f: GameReturnFacts): GameNews | undefined {
    let overtake;
    if (f.version && f.report.best && host.daily.unavailable() === undefined) {
      try {
        overtake = gameOvertake(host.daily.input(), f.version, f.since, { now: new Date(now()) });
      } catch (error) {
        host.log(`Retour de partie : classement non lu (${(error as Error).message}).`); // i18n-ignore : journal
      }
    }
    return gameNews({ ...(f.report.best ? { best: f.report.best } : {}), ...(f.report.previousBest ? { previousBest: f.report.previousBest } : {}), ...(overtake ? { overtake } : {}) });
  }

  // L'écran quitté garde son bilan (un dernier rendu peut encore le lire) ; le suivant le remplace.
  const leave = () => host.library.leave();

  /** « 3ᵉ du jour », « 3ᵉ de tout temps ». */
  const placeText = (rank: number, period: 'today' | 'all') => (period === 'today' ? t('{rank}ᵉ du jour', { rank }) : t('{rank}ᵉ de tout temps', { rank }));
  const levelChip = (h: DailyHolder) => (h.level ? { level: { text: t('Niv. {n}', { n: h.level }), tier: tierOf(h.level) } } : {});

  function writeButton(rival: DailyHolder | undefined, reopen: () => void): HubButtonSpec[] {
    if (!rival) return [];
    const label = t('Un mot à {name}', { name: rival.name });
    if (shown?.sent === rival.key) return [{ label, key: 'word', run: () => undefined, off: t('Envoyé') }];
    const closed = host.friends.closed?.();
    if (closed) return [{ label, key: 'word', run: () => undefined, off: closed }];
    if (!host.friends.isFriend(rival.key)) return [{ label, key: 'word', run: () => undefined, off: t('Entre amis seulement') }];
    return [{ label, key: 'word', run: () => openWord(rival, reopen) }];
  }

  /** « Un mot à Léa » : les phrases préparées ; Start envoie, Exit revient au bilan. */
  function openWord(rival: DailyHolder, reopen: () => void): void {
    host.library.openCustom(() => {
      const actions: Action[] = rivalPhrases().map((text) => ({
        label: text,
        icon: 'message',
        run: () => {
          const ok = host.friends.send(rival.key, text);
          host.log(`Retour de partie : un mot à ${rival.name} ${ok ? 'envoyé' : 'non envoyé'}.`); // i18n-ignore : journal
          if (ok && shown) shown.sent = rival.key;
          reopen();
        },
      }));
      actions.push({ label: t('Retour'), icon: 'back', run: reopen });
      return { heading: t('Un mot à {name}', { name: rival.name }), icon: 'message', lead: t('Une phrase toute prête, envoyée dans ta conversation.'), sections: [], actions, back: reopen };
    }, 0);
  }

  function spec(reopen: () => void): HubSpec {
    const s = shown!;
    const { f, news: n } = s;
    const r = f.report;
    const gained = Math.max(0, r.to - r.from);
    const v = levelOf(r.to);
    const o = n.overtake;
    const rival = o?.passed[0];
    const sections: HubSectionSpec[] = [];
    // Le score, et le record battu.
    const score = r.best ?? n.record?.score;
    if (score !== undefined)
      sections.push({
        layout: 'hero',
        cards: [
          {
            key: 'score',
            icon: 'star',
            eyebrow: n.record ? t('Record personnel battu') : t('Ton score'),
            tone: 'signal',
            title: fmt(score),
            ...(n.record ? { aside: t('+{n}', { n: fmt(n.record.score - n.record.previous) }), detail: t('Ton record d’avant : {n}', { n: fmt(n.record.previous) }) } : {}),
          },
        ],
      });
    // Le joueur dépassé, la place gagnée, le prochain à battre.
    if (o && rival) {
      const cards: HubCardSpec[] = [];
      const others = o.passed.length - 1;
      const gainedPlaces = o.previous !== undefined ? o.previous - o.rank : undefined;
      const detail = [gainedPlaces ? tn(gainedPlaces, '{n} place de gagnée', '{n} places de gagnées') : gainedPlaces === undefined ? t('Tu entres au classement') : undefined, others > 0 ? tn(others, 'et {n} autre joueur dépassé', 'et {n} autres joueurs dépassés') : undefined].filter(Boolean).join(' · ');
      cards.push({ key: 'passed', avatar: host.daily.face(rival), title: t('Tu passes devant {name}', { name: rival.name }), ...levelChip(rival), aside: placeText(o.rank, o.period), ...(detail ? { detail } : {}) });
      if (o.next) cards.push({ key: 'next', avatar: host.daily.face(o.next), title: t('Prochain : {name}', { name: o.next.name }), ...levelChip(o.next), aside: fmt(o.next.score), detail: t('{place} · il te manque {gap}', { place: placeText(o.next.rank, o.period), gap: fmt(o.gap ?? 0) }) });
      else cards.push({ key: 'first', icon: 'trophy', title: t('Personne devant toi'), detail: t('Tu es premier : garde ta place') });
      const where = o.scope === 'country' && host.daily.input().country ? countryName(host.daily.input().country!, locale()) : o.scope === 'friends' ? t('Amis') : t('Monde');
      sections.push({ title: o.period === 'today' ? t('Classement du jour') : t('Classement de tout temps'), note: where, layout: 'list', cards });
    }
    // La suite : rejouer, un mot, retour.
    const target = o?.next;
    sections.push({
      layout: 'list',
      cards: [
        {
          key: 'end',
          icon: 'flipper',
          title: target ? t('Encore {gap} pour passer {name}', { gap: fmt(o!.gap ?? 0), name: target.name }) : t('Et maintenant ?'),
          buttons: [
            { label: t('Rejouer'), xp: t('+{n} XP', { n: XP.personalBest }), primary: true, key: 'replay', run: () => host.play(f.table) },
            // Défier le joueur dépassé, avec le score de cette partie (planche validée : « Défier Léa +40 XP »).
            ...(rival ? [host.challenge?.(rival, f, reopen)].filter((b): b is HubButtonSpec => !!b) : []),
            ...writeButton(rival, reopen),
            { label: t('Retour aux tables'), key: 'back', run: leave },
          ],
        },
      ],
    });
    return {
      heading: t('Partie terminée'),
      icon: 'trophy',
      medallion: 'arene',
      title: t('PARTIE TERMINÉE'),
      facts: [f.table.title, ...(o ? [t('Version classée')] : [])],
      band: {
        level: v.level,
        short: t('NIV.'),
        tier: v.tier,
        tierLabel: tierLabel(v.tier),
        missing: { strong: t('+{n} XP', { n: fmt(gained) }), rest: t('· {n} XP avant le niveau {next}', { n: fmt(v.need - v.into), next: v.level + 1 }) },
        progress: v.progress,
        reach: 0,
        fresh: Math.min(gained, v.into) / v.need,
        lines: r.gains.map((g) => t('{what} +{n}', { what: gainText(g, badgeLabel).text, n: g.xp })),
      },
      tabs: [],
      sections,
      hint: t('Flippers : choisir · Start : valider · Exit : retour aux tables'),
      flat: true,
      focus: 'end:replay',
      keys: () => now() - s.at < GAME_RETURN_GUARD_MS,
    };
  }

  const hub = createHubScreen({ library: host.library, zoneKeys: host.zoneKeys }, (_tab, reopen) => spec(reopen));

  return {
    expect() {
      expected = now();
    },
    release() {
      expected = undefined;
    },
    holding: () => expected !== undefined && now() - expected < EXPECT_MAX_MS,
    news,
    report(f) {
      expected = undefined;
      const n = news(f);
      if (!n) {
        host.log(`Retour de partie : rien de neuf sur ${f.table.title}, pas d'écran.`); // i18n-ignore : journal
        return false;
      }
      if (!host.canOpen()) {
        host.log(`Retour de partie : du neuf sur ${f.table.title}, mais la roue n'est plus à l'écran.`); // i18n-ignore : journal
        return false;
      }
      shown = { f, news: n, at: now() };
      host.log(`Retour de partie : ${f.table.title}${n.record ? ', record battu' : ''}${n.overtake ? `, ${n.overtake.passed.length} joueur(s) dépassé(s)` : ''}.`); // i18n-ignore : journal
      hub.open(leave);
      return true;
    },
  };
}

