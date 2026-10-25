// Écran « Ce qu'il manque pour jouer » : le parcours guidé d'une table jusqu'à « Jouer »
// (plan calculé par packages/core/src/journey.ts). On y arrive depuis la fiche, depuis
// une partie qui a échoué (frontend.ts) et depuis le médecin. Chaque étape propose son
// geste suivant : réparer sur place, ouvrir la page du fichier dans la fenêtre
// « Récupérer » (catalog.ts), installer ce qui a été reçu (plan d'import, puis retour
// ici), ajouter un fichier qu'on a déjà, installer VPX, jouer.
//
// Le parcours se recalcule à chaque retour : fichier reçu, fenêtre « Récupérer » fermée,
// installation finie, réparation. Les étapes montrées sont retenues (parcours.json) pour
// le reprendre plus tard au même point, depuis la fiche ou la liste d'attente.

import {
  cabinetScreens,
  forgetJourney,
  journeyChoices,
  journeyPosition,
  journeyRecord,
  journeySummary,
  loadCabinet,
  loadJourneys,
  planJourney,
  rememberJourney,
  samePath,
  saveJourneys,
  t,
  tn,
  tableSourceOf,
  type Finding,
  type Journey,
  type JourneyAction,
  type JourneyState,
  type JourneyStep,
  type TableEntry,
  type VpsDb,
  type WaitItem,
} from '@cyberpinball/core';
import type { Catalog } from './catalog';
import type { Action, Built, LibraryHost, Tone } from './library';
import type { ScriptResult } from './vbs';

export interface JourneyContext {
  host: LibraryHost;
  find(file: string): TableEntry | undefined;
  show(build: () => Built, at?: number): void;
  cursor(): number;
  task(message: string, work: () => Promise<void> | void): Promise<void>;
  /** Base VPS en cache (téléchargée la première fois) ; undefined sans réseau ni cache. */
  vps(): Promise<VpsDb | undefined>;
  /** Script et constats du médecin pour la table (comme « Diagnostiquer et réparer »). */
  analyse(table: TableEntry): Promise<{ script?: ScriptResult; findings: Finding[] }>;
  /** Applique les corrections du médecin ; renvoie le fichier de la table (il a pu changer de place). */
  repair(table: TableEntry, findings: Finding[]): string;
  catalog: Catalog;
  sheet(table: TableEntry, flash?: string): void;
  doctor(table: TableEntry): void;
  /** Choisir un fichier sur ce PC ; il passe par le plan d'import, puis revient ici. */
  pickFiles(journey: string): void;
  /** Installer les fichiers reçus (plan d'import), puis revenir ici. */
  install(paths: string[], acquisition: { gameId: string; items: WaitItem[] }, journey: string): void;
  /** Fichiers glissés sur l'écran : plan d'import, puis retour ici. */
  drop(paths: string[], journey: string): void;
}

/** Mot et signe de chaque état (design system : jamais la couleur seule). */
function stateLabel(step: JourneyStep): { word: string; sign: string; tone: Tone } {
  if (step.id === 'play' && step.state === 'todo') return { word: t('Prête'), sign: '▶', tone: 'ok' };
  const words: Record<JourneyState, () => { word: string; sign: string; tone: Tone }> = {
    done: () => ({ word: t('Réglé'), sign: '✓', tone: 'ok' }),
    todo: () => (step.required ? { word: t('À faire'), sign: '!', tone: 'warning' } : { word: t('Conseillé'), sign: '!', tone: 'warning' }),
    waiting: () => ({ word: t('Attendu'), sign: '…', tone: 'warning' }),
    received: () => ({ word: t('À installer'), sign: '!', tone: 'warning' }),
    pending: () => ({ word: t('En attente'), sign: '·', tone: 'quiet' }),
    optional: () => ({ word: t('Facultatif'), sign: '○', tone: 'quiet' }),
    unchecked: () => ({ word: t('Non vérifié'), sign: '?', tone: 'quiet' }),
  };
  return words[step.state]();
}

export function createJourney(ctx: JourneyContext) {
  const { host } = ctx;
  /** Parcours affiché : sa table, son dernier calcul, le message du moment. */
  let open: { file: string; journey?: Journey; notice?: { text: string; tone: Tone } } | undefined;

  const memory = () => loadJourneys(host.dataDir);

  /** Calcule le parcours de la table et l'affiche ; `at` : action choisie (sinon le geste conseillé). */
  function show(file: string, notice?: { text: string; tone: Tone }, at?: number): void {
    const table = ctx.find(file);
    if (!table) return;
    open = { file: table.file, notice };
    ctx.catalog.setRefresh(() => {
      if (open && samePath(open.file, table.file)) show(table.file, ctx.catalog.takeNotice(), ctx.cursor());
    });
    void ctx.task(t('Ce qu’il manque pour jouer…'), async () => {
      const [{ script, findings }, vps] = await Promise.all([ctx.analyse(table), ctx.vps()]);
      const mem = memory();
      const journey = planJourney({
        file: table.file,
        vpsId: tableSourceOf(table.info)?.vpsGameId ?? table.info.Info?.VPSId,
        sourceFileId: tableSourceOf(table.info)?.vpsFileId,
        vpxInstalled: Boolean(host.vpxExe()),
        cabinetConfigured: Boolean(loadCabinet(host.dataDir)),
        screens: cabinetScreens(loadCabinet(host.dataDir)),
        script,
        findings,
        vps,
        waitList: ctx.catalog.waitList(),
        seen: journeyRecord(mem, table.file)?.steps,
      });
      rememberJourney(mem, table.file, table.title, journey);
      saveJourneys(host.dataDir, mem);
      if (!open || !samePath(open.file, table.file)) return;
      open.journey = journey;
      ctx.show(() => build(table.file), at ?? 0);
    });
  }

  function run(file: string, action: JourneyAction): void {
    const table = ctx.find(file);
    if (!table) return;
    const back = () => show(table.file, ctx.catalog.takeNotice());
    switch (action.kind) {
      case 'play':
        // Parcours terminé : il n'est plus proposé à la reprise.
        {
          const mem = memory();
          if (forgetJourney(mem, table.file)) saveJourneys(host.dataDir, mem);
        }
        ctx.catalog.setRefresh(undefined);
        open = undefined;
        return host.play(table);
      case 'repair': {
        const moved = ctx.repair(table, [action.finding]);
        return show(moved, { text: t('Réparé : {what}', { what: action.finding.fix!.label }), tone: 'ok' });
      }
      case 'fetch':
        return ctx.catalog.fetchFor(action.source, { table: table.file, back });
      case 'reopen':
        return ctx.catalog.reopen(action.item, back);
      case 'install': {
        // Par la liste d'attente : un fichier reçu qui ne convient pas (un pack de médias pour la
        // table) est à corriger avant ; la table du parcours suit les éléments (WaitItem.table).
        const items = action.items.filter((i) => i.received);
        return ctx.catalog.installGame(items[0]?.gameId ?? '');
      }
      case 'scanDownloads':
        // Chaque fichier est vérifié (contenu des archives) avant d'être rangé : c'est asynchrone.
        return void ctx.catalog.scanDownloads().then((found) =>
          show(table.file, found ? { text: tn(found, '{n} fichier retrouvé dans Téléchargements.', '{n} fichiers retrouvés dans Téléchargements.'), tone: 'ok' } : { text: t('Rien dans Téléchargements qui corresponde à ce qui est attendu.'), tone: 'info' }),
        );
      case 'search':
        ctx.catalog.setRefresh(undefined);
        open = undefined;
        return ctx.catalog.openSearch(action.text);
      case 'addFile':
        return ctx.pickFiles(table.file);
      case 'installVpx':
        ctx.catalog.setRefresh(undefined);
        open = undefined;
        return host.installVpx?.();
      case 'setup':
        ctx.catalog.setRefresh(undefined);
        open = undefined;
        return host.setup?.();
    }
  }

  function build(file: string): Built {
    const table = ctx.find(file);
    const journey = open?.journey;
    const toSheet = () => {
      ctx.catalog.setRefresh(undefined);
      open = undefined;
      if (table) ctx.sheet(table);
      else host.leave();
    };
    if (!table || !journey) return { heading: t('Ce qu’il manque pour jouer'), sections: [], actions: [{ label: t('Retour à la fiche'), run: toSheet }], back: toSheet };
    const actions: Action[] = [];
    /** Première action de chaque étape : un clic sur l'étape la déclenche. */
    const stepAction = new Map<JourneyStep, number>();
    for (const { step, choice } of journeyChoices(journey)) {
      if (!stepAction.has(step)) stepAction.set(step, actions.length);
      actions.push({ label: choice.label, detail: choice.detail, tone: choice.primary ? 'ok' : undefined, run: () => run(table.file, choice.action) });
    }
    actions.push(
      { label: t('Revérifier'), detail: t('Relit la table et ce qui est arrivé'), run: () => show(table.file) },
      { label: t('Diagnostic complet'), detail: t('Tous les constats du médecin, médias compris'), run: () => ((open = undefined), ctx.catalog.setRefresh(undefined), ctx.doctor(table)) },
    );
    const notice = open?.notice;
    const view = (s: JourneyStep, n: number | undefined, current: boolean) => {
      const label = stateLabel(s);
      return { n, title: s.title, detail: s.detail, note: current ? s.note : undefined, state: s.state, word: label.word, sign: label.sign, tone: label.tone, current, action: stepAction.get(s) };
    };
    return {
      heading: journey.ready ? t('Tout est prêt pour jouer') : t('Ce qu’il manque pour jouer'),
      subheading: [table.title, table.manufacturer, table.year].filter(Boolean).join(' · '),
      sections: [],
      journey: {
        position: journeyPosition(journey),
        summary: journeySummary(journey),
        notice,
        steps: journey.steps.map((s, i) => view(s, i + 1, i === journey.current)),
        extrasTitle: t('Pour aller plus loin'),
        extras: journey.extras.map((s) => view(s, undefined, false)),
      },
      actions,
      back: toSheet,
      drop: (paths) => ctx.drop(paths, table.file),
    };
  }

  return {
    /** Ouvre le parcours d'une table (fiche, partie échouée, médecin, liste d'attente). */
    open: (file: string, notice?: { text: string; tone: Tone }) => show(file, notice),
    /** Position retenue au dernier passage (« Étape 3 sur 5 »), pour la fiche et la liste d'attente. */
    position: (file: string) => journeyRecord(memory(), file),
  };
}

export type JourneyUi = ReturnType<typeof createJourney>;
