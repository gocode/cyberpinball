// « Santé de la borne » (Menu système > Borne) : le relevé en tâche de fond, gardé d'un
// lancement à l'autre (<données>\cache\sante.json), et la page qui le montre. Les lignes et
// leurs états viennent de packages/core/src/health.ts ; chaque ligne ouvre l'écran qui
// répare : une entrée du menu système, le médecin de la table, l'installation de VPX.
//
// Rien de lent à l'ouverture : la page montre le dernier relevé tout de suite, puis le
// rafraîchit en arrière-plan (« Vérification en cours… »). Le relevé ne lance ni VPX ni
// téléchargement : scripts déjà lus, index de VPinMediaDB déjà gardé, manifeste de
// l'installeur. Il cède la main entre deux tables pour que le menu reste fluide.

import * as fs from 'node:fs';
import {
  diskFacts,
  diskSpace,
  HEALTH_CHECKS,
  healthAge,
  healthAttention,
  healthCheckInfo,
  healthLines,
  healthStateLabel,
  loadCabinetSet,
  loadHealthFacts,
  PUP_PLAY_REPAIRS,
  pupFacts,
  saveHealthFacts,
  screensFacts,
  SYSTEM_ITEMS,
  t,
  tablesFacts,
  tn,
  type Finding,
  type HealthFacts,
  type HealthLine,
  type HealthState,
  type HealthTarget,
  type Layout,
  type MediaFacts,
  type SystemItemId,
  type TableEntry,
} from '@cyberpinball/core';
import { findComponent } from '@cyberpinball/installer';
import type { Action, Built, LibraryHost } from './library';
import { locations, vpxProfile } from './paths';
import { taskbarFacts } from './screen-guard';

export interface HealthContext {
  host: LibraryHost;
  layout(): Layout | undefined;
  /**
   * Médecin d'un relevé, sans lancer VPX : les constats d'une table ; undefined si son script
   * n'a jamais été lu. Ce qu'il partage (modèle de borne, journal de VPX) est lu une fois.
   */
  doctor(): (table: TableEntry) => Finding[] | undefined;
  /** Ce que VPinMediaDB ajouterait aux tables, hors ligne (media-download.ts, offlineSurvey). */
  media(pause: () => Promise<void>): Promise<MediaFacts | undefined>;
  openCustom(build: () => Built, at?: number): void;
  openSystem(): void;
  /** Ouvre une entrée du menu système ; son « Retour » ramène à `back`. */
  runSystemItem(id: SystemItemId, back: () => void): void;
  /** Médecin d'une table ; son « Retour » ramène à `back`. */
  openDoctor(file: string, back: () => void): void;
  /** L'écran affiché est celui que décrit `build`. */
  showing(build: () => Built): boolean;
}

/** Ce que la page montre du relevé (app/renderer/library.js, renderHealth). */
export interface HealthView {
  counts: { state: HealthState; n: number; word: string; sign: string; tone: string }[];
  when: string;
  busy: boolean;
  groups: { title: string; icon: string; meta?: string; lines: (HealthLineView & { action: number })[] }[];
}

interface HealthLineView {
  state: HealthState;
  title: string;
  detail?: string;
  go: string;
  word: string;
  sign: string;
  tone: string;
}

/** Un dossier pupvideos à côté de la table (dossier illisible : non). */
function hasPupFolder(folder: string): boolean {
  try {
    return fs.readdirSync(folder, { withFileTypes: true }).some((d) => d.isDirectory() && d.name.toLowerCase() === 'pupvideos');
  } catch {
    return false;
  }
}

/** Premier relevé après le démarrage : le menu d'abord. */
const FIRST_DELAY_MS = 15_000;
/** Puis un relevé toutes les 30 minutes, et à chaque ouverture de la page. */
const EVERY_MS = 30 * 60_000;

export function createHealth(ctx: HealthContext) {
  const { host } = ctx;
  let facts: HealthFacts | undefined = loadHealthFacts(host.dataDir);
  let running: Promise<void> | undefined;
  /** Page ouverte avant le premier relevé : à son arrivée, la sélection va au premier point à régler. */
  let awaitingFirst = false;

  /** Cède la main au menu (touches, rendu) entre deux tables. */
  const pause = () => new Promise<void>((resolve) => setImmediate(resolve));

  /** Version de VPX que Cyber Pinball installe (manifeste livré avec l'application). */
  function knownVpx(): string | undefined {
    try {
      return findComponent('vpx').version;
    } catch {
      return undefined;
    }
  }

  async function collect(): Promise<HealthFacts> {
    const layout = ctx.layout();
    const disks = diskFacts({ tables: layout?.tables, downloads: layout?.downloads, data: host.dataDir }, host.diskSpace ?? diskSpace);
    const vpx = { installed: host.vpxVersion?.(), known: knownVpx() };
    // Barres des tâches que le gardien des écrans a remises derrière le menu depuis le démarrage.
    const screens = host.displays ? { ...screensFacts(loadCabinetSet(host.dataDir), host.displays(), vpxProfile(locations()).profile.displayIdFormat), taskbars: taskbarFacts() } : undefined;
    let tables: HealthFacts['tables'];
    let pup: HealthFacts['pup'];
    if (layout) {
      const seen: { file: string; title: string; hasPack: boolean; findings?: Finding[] }[] = [];
      const doctor = ctx.doctor();
      for (const table of host.tables()) {
        await pause();
        let findings: Finding[] | undefined;
        try {
          findings = doctor(table);
        } catch (error) {
          // Une table illisible n'arrête pas le relevé : elle est à revoir, chez son médecin.
          findings = [{ code: 'scriptUnreadable', severity: 'warning', title: (error as Error).message, detail: '' }];
        }
        // Un dossier pupvideos à côté de la table : son PuP-Pack est relevé à part.
        const hasPack = hasPupFolder(table.folder);
        seen.push({ file: table.file, title: table.title, hasPack, findings });
      }
      tables = tablesFacts(seen);
      pup = pupFacts(seen, PUP_PLAY_REPAIRS);
    }
    const media = layout ? await ctx.media(pause) : undefined;
    return { at: new Date().toISOString(), disks, tables, pup, media, screens, vpx };
  }

  /** Relève tout en arrière-plan ; un relevé en cours n'est pas doublé. */
  function refresh(): Promise<void> {
    running ??= collect()
      .then((next) => {
        facts = next;
        try {
          saveHealthFacts(host.dataDir, next);
        } catch {
          // Données en lecture seule : le relevé reste en mémoire.
        }
      })
      .catch((error: Error) => console.error(`Santé de la borne : ${error.message}`)) // i18n-ignore : journal
      .finally(() => {
        running = undefined;
        if (awaitingFirst && facts && ctx.showing(build)) open(false);
        awaitingFirst = false;
        host.broadcast();
      });
    host.broadcast();
    return running;
  }

  /**
   * Premier relevé peu après le démarrage, puis régulièrement : la pastille suit sans qu'on ouvre
   * la page. `quiet` : pendant une partie (ou son chargement), le relevé attend le suivant.
   */
  function watch(quiet: () => boolean = () => false): void {
    const tick = () => {
      if (!quiet()) void refresh();
    };
    setTimeout(tick, FIRST_DELAY_MS).unref?.();
    setInterval(tick, EVERY_MS).unref?.();
  }

  // ---------- Cibles ----------

  /** Ce que fait chaque sorte de cible : health.test.ts vérifie qu'aucune n'est oubliée. */
  const OPEN: { [K in HealthTarget['kind']]: (target: Extract<HealthTarget, { kind: K }>) => void } = {
    system: (target) => ctx.runSystemItem(target.item, () => open()),
    doctor: (target) => ctx.openDoctor(target.file, () => open()),
    tables: () => openTables(),
    'install-vpx': () => {
      if (host.installVpx) host.installVpx();
      else ctx.runSystemItem('cabinet', () => open());
    },
  };

  function go(target: HealthTarget): void {
    (OPEN[target.kind] as (t: HealthTarget) => void)(target);
  }

  /** Toutes les tables à revoir, au-delà de celles que la page montre : chacune vers son médecin. */
  function openTables(): void {
    ctx.openCustom(() => {
      const flagged = facts?.tables?.flagged ?? [];
      const back = () => open();
      const actions: Action[] = flagged.map((f) => ({
        label: f.title,
        detail: f.reason,
        tone: f.blocking ? 'error' : 'warning',
        icon: f.blocking ? 'close' : 'alert',
        run: () => ctx.openDoctor(f.file, () => openTables()),
      }));
      return {
        heading: t('Tables à revoir'),
        icon: 'tables',
        lead: tn(flagged.length, '{n} table à revoir : le médecin de chacune dit quoi faire.', '{n} tables à revoir : le médecin de chacune dit quoi faire.'),
        sections: [],
        actions: [...actions, { label: t('Retour'), icon: 'back', run: back }],
        back,
      };
    });
  }

  // ---------- Page ----------

  /** Ouvre la page sur le dernier relevé, la sélection sur la première ligne qui pose problème, et relève à nouveau. */
  function open(check = true): void {
    awaitingFirst = !facts;
    const lines = facts ? healthLines(facts) : [];
    const worst = lines.findIndex((l) => l.state === 'blocking');
    const first = worst >= 0 ? worst : lines.findIndex((l) => l.state === 'check');
    ctx.openCustom(build, Math.max(0, first));
    if (check && !running) void refresh();
  }

  function build(): Built {
    const back = () => ctx.openSystem();
    const lines = facts ? healthLines(facts) : [];
    const actions: Action[] = lines.map((l) => ({ label: l.go, detail: l.title, run: () => go(l.target) }));
    actions.push({ label: t('Vérifier maintenant'), icon: 'refresh', run: () => void refresh() });
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: SYSTEM_ITEMS.health.label,
      icon: SYSTEM_ITEMS.health.icon,
      lead: facts ? undefined : t('Premier relevé en cours : espace disque, tables, PuP-Packs, médias, écrans et VPX.'),
      sections: [],
      actions,
      back,
      health: facts ? view(lines) : undefined,
      hint: t('Flippers : choisir · Start : ouvrir · Exit : revenir'),
    };
  }

  function view(lines: HealthLine[]): HealthView {
    const states: HealthState[] = ['blocking', 'check', 'ok'];
    return {
      counts: states.map((state) => ({ state, n: lines.filter((l) => l.state === state).length, ...healthStateLabel(state) })),
      when: running ? t('{age} · nouvelle vérification en cours…', { age: healthAge(facts!.at) }) : healthAge(facts!.at),
      busy: Boolean(running),
      groups: HEALTH_CHECKS.flatMap((check) => {
        const own = lines.flatMap((l, action) => (l.check === check ? [{ ...l, ...healthStateLabel(l.state), action }] : []));
        if (!own.length) return [];
        const info = healthCheckInfo(check);
        return [{ title: info.title, icon: info.icon, meta: groupMeta(check), lines: own.map(({ state, title, detail, go, word, sign, tone, action }) => ({ state, title, detail, go, word, sign, tone, action })) }];
      }),
    };
  }

  /** Décompte à droite d'un intertitre : lecteurs, tables. */
  function groupMeta(check: (typeof HEALTH_CHECKS)[number]): string | undefined {
    if (check === 'disk') return tn(facts!.disks.length, '{n} lecteur', '{n} lecteurs');
    if (check === 'tables' && facts!.tables?.count) {
      const blocked = facts!.tables.flagged.filter((f) => f.blocking).length;
      const count = tn(facts!.tables.count, '{n} table', '{n} tables');
      return blocked ? t('{count} · {blocked}', { count, blocked: tn(blocked, '{n} ne démarre pas', '{n} ne démarrent pas') }) : count;
    }
    return undefined;
  }

  /** Sous l'entrée du menu : ce que dit le dernier relevé. */
  function summary(): string {
    if (!facts) return t('Espace disque, tables, médias, écrans et VPX en un coup d’œil');
    const lines = healthLines(facts);
    const blocking = lines.filter((l) => l.state === 'blocking').length;
    const check = lines.filter((l) => l.state === 'check').length;
    const parts = [blocking && tn(blocking, '{n} point bloquant', '{n} points bloquants'), check && tn(check, '{n} point à vérifier', '{n} points à vérifier')].filter(Boolean);
    return parts.length ? parts.join(' · ') : t('Tout est en ordre');
  }

  return {
    open,
    refresh,
    summary,
    watch,
    /** Un point bloquant dans le dernier relevé : pastille rouge sur l'entrée, jusqu'à la roue dentée. */
    attention: () => healthAttention(facts),
    /** Dernier relevé (essais). */
    facts: () => facts,
    /** Un relevé est en cours (essais). */
    running: () => Boolean(running),
  };
}
