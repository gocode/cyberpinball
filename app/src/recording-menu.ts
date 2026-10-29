// Écrans de l'enregistrement d'une partie (gamerecording.ts, game-recording.ts) :
//   « Jouer et enregistrer », depuis la fiche : ce qui sera filmé (écrans, début, durée, son) et
//   le lancement. Les réglages sont gardés pour la fois suivante (<données>\enregistrement.json) ;
//   « Enregistrement de la partie », au retour : l'aperçu de chaque vidéo, puis le choix. « Utiliser
//   pour la roue » montre d'abord le plan (ce qui arrive dans medias\, ce qui part à la corbeille) :
//   rien n'est remplacé sans « Confirmer ». « Garder de côté » (et Exit) ne change rien sur la roue :
//   l'enregistrement attend parmi les propositions du média (« Médias du jeu »). « Jeter » le met à
//   la corbeille de Cyber Pinball.

import * as path from 'node:path';
import {
  applyOps,
  clockLabel,
  emptyMediaDraft,
  formatSize,
  infoFileFor,
  keptSeconds,
  loadRecordingSettings,
  mediaTypeInfo,
  mediaUrl,
  ownMediaPages,
  planMediaChanges,
  RECORDED_ROLES,
  recordedMediaType,
  RECORDING_DELAYS,
  RECORDING_DURATIONS,
  saveRecordingSettings,
  t,
  tn,
  toggleRecordedRole,
  trashDirFor,
  type Cabinet,
  type Layout,
  type MediaDraft,
  type RecordedRole,
  type RecordingSettings,
  type TableEntry,
} from '@cyberpinball/core';
import type { RecordingOutcome } from './game-recording';
import type { Action, Built, Row, Tone } from './library';
import type { MediaCard, MediaView } from './library-medias';
import { allowPreview } from './media-protocol';

export interface RecordingMenuContext {
  dataDir: string;
  root: string | undefined;
  layout(): Layout | undefined;
  tablesDir(): string;
  find(file: string): TableEntry | undefined;
  cabinet(): Cabinet | undefined;
  /** Écrans de la borne que VPX occupe en partie, en plus du plateau (fronton, DMD). */
  roles(): RecordedRole[];
  show(build: () => Built, at?: number, table?: string): void;
  cursor(): number;
  sheet(table: TableEntry, flash?: string): void;
  /** Retour à la roue, la table choisie. */
  leave(): void;
  /** Lance la partie, l'enregistrement armé. */
  play(table: TableEntry, settings: RecordingSettings): void;
  reload(file?: string): void;
}

const ROLE_LABELS: Record<RecordedRole, () => string> = {
  playfield: () => t('Plateau'),
  backglass: () => t('Fronton'),
  dmd: () => t('Afficheur'),
};

/** Une icône par écran : dans un même écran, deux actions n'ont jamais la même. */
const ROLE_ICONS = { playfield: 'playfield', backglass: 'monitor', dmd: 'dmd' } as const satisfies Record<RecordedRole, string>;

export function createRecordingMenu(ctx: RecordingMenuContext) {
  /** Ce qui est filmé, en clair : « Plateau et fronton · début à 10 s · 30 s · avec le son ». */
  function summary(s: RecordingSettings): string {
    const roles = s.roles.filter((r) => r === 'playfield' || ctx.roles().includes(r)).map((r) => ROLE_LABELS[r]());
    return [roles.join(', '), t('début à {delay} s', { delay: s.delay }), t('{duration} s', { duration: s.duration }), s.sound ? t('avec le son') : t('sans le son')].join(' · ');
  }

  const settings = () => loadRecordingSettings(ctx.dataDir);
  const save = (s: RecordingSettings) => saveRecordingSettings(ctx.dataDir, s);

  // ---------- Avant la partie ----------

  function setup(table: TableEntry, at = 0): void {
    ctx.show(() => buildSetup(table.file), at, table.file);
  }

  function buildSetup(file: string): Built {
    const table = ctx.find(file);
    if (!table) return lost();
    const s = settings();
    const back = () => ctx.sheet(table);
    const others = ctx.roles();
    const shownRoles = s.roles.filter((r) => r === 'playfield' || others.includes(r));
    return {
      heading: t('Jouer et enregistrer'),
      icon: 'record',
      subheading: table.title,
      // Revu par Codex (29/10/2026) : une aide courte, les valeurs restent dans les réglages.
      lead: t('Filmée pendant que vous jouez, la partie devient la vidéo de la table sur la roue. Aucun bouton à presser : l’enregistrement s’arrête seul, ou quand vous quittez la table. Au retour, vous décidez quoi garder.'),
      sections: [],
      actions: [
        { label: t('Lancer et enregistrer'), detail: summary(s), tone: 'ok', icon: 'record', run: () => ctx.play(table, s) },
        ...(others.length
          ? [{ label: t('Écrans filmés'), detail: shownRoles.map((r) => ROLE_LABELS[r]()).join(', '), icon: 'screens' as const, run: () => ctx.show(() => buildRoles(file), 0, file) }]
          : []),
        { label: t('Début de l’enregistrement'), detail: delayText(s.delay), icon: 'clock', run: () => ctx.show(() => buildChoice(file, 'delay'), Math.max(0, RECORDING_DELAYS.indexOf(s.delay)), file) },
        { label: t('Durée'), detail: t('{duration} s de vidéo ; la partie continue', { duration: s.duration }), icon: 'gauge', run: () => ctx.show(() => buildChoice(file, 'duration'), Math.max(0, RECORDING_DURATIONS.indexOf(s.duration)), file) },
        {
          label: t('Son de la partie'),
          detail: s.sound ? t('Avec la vidéo du plateau') : t('Vidéo muette'),
          icon: 'sound',
          run: () => {
            save({ ...s, sound: !s.sound });
            setup(table, ctx.cursor());
          },
        },
        { label: t('Retour à la fiche'), icon: 'back', run: back },
      ],
      back,
    };
  }

  const delayText = (delay: number) => (delay ? t('{delay} s après l’apparition de la table', { delay }) : t('Dès l’apparition de la table'));

  function buildRoles(file: string): Built {
    const table = ctx.find(file);
    if (!table) return lost();
    const s = settings();
    const back = () => setup(table, 1);
    const roles = RECORDED_ROLES.filter((r) => r === 'playfield' || ctx.roles().includes(r));
    return {
      heading: t('Écrans filmés'),
      icon: 'screens',
      subheading: table.title,
      lead: t('Chaque écran filmé devient le média de cet écran sur la roue. Le plateau l’est toujours ; le fronton et l’afficheur, si vous le voulez.'),
      sections: [],
      actions: [
        ...roles.map((role): Action => {
          const on = s.roles.includes(role);
          const type = recordedMediaType(role, ctx.cabinet());
          return {
            label: ROLE_LABELS[role](),
            detail: role === 'playfield' ? t('Toujours filmé · média {label}', { label: mediaTypeInfo(type).label }) : on ? t('Filmé · média {label}', { label: mediaTypeInfo(type).label }) : t('Pas filmé'),
            tone: on ? 'ok' : undefined,
            icon: ROLE_ICONS[role],
            run: () => {
              save(toggleRecordedRole(s, role));
              ctx.show(() => buildRoles(file), ctx.cursor(), file);
            },
          };
        }),
        { label: t('Retour'), icon: 'back', run: back },
      ],
      back,
    };
  }

  function buildChoice(file: string, field: 'delay' | 'duration'): Built {
    const table = ctx.find(file);
    if (!table) return lost();
    const s = settings();
    const back = () => setup(table, field === 'delay' ? 2 - (ctx.roles().length ? 0 : 1) : 3 - (ctx.roles().length ? 0 : 1));
    const values = field === 'delay' ? RECORDING_DELAYS : RECORDING_DURATIONS;
    return {
      heading: field === 'delay' ? t('Début de l’enregistrement') : t('Durée'),
      icon: field === 'delay' ? 'clock' : 'gauge',
      subheading: table.title,
      lead:
        field === 'delay'
          ? t('Temps laissé à la table pour s’installer (fondu de VPX, attract mode) avant de filmer. Lancez la bille pendant ce temps.')
          : t('Longueur de la vidéo : la partie, elle, continue. Une vidéo de roue dure d’ordinaire 20 à 60 s ; elle finit par un fondu au noir, pour boucler sans à-coup.'),
      sections: [],
      actions: [
        ...values.map(
          (v): Action => ({
            label: field === 'delay' ? delayText(v) : t('{duration} s', { duration: v }),
            detail: v === s[field] ? t('choix actuel') : undefined,
            tone: v === s[field] ? 'ok' : undefined,
            run: () => {
              save({ ...s, [field]: v });
              back();
            },
          }),
        ),
        { label: t('Retour'), icon: 'back', run: back },
      ],
      back,
    };
  }

  // ---------- Au retour ----------

  /** Écran du retour de partie : l'aperçu de ce qui a été filmé, puis le choix. */
  function result(outcome: RecordingOutcome): void {
    ctx.show(() => buildResult(outcome), 0, outcome.table.file);
  }

  /** Média montré aujourd'hui pour ce type. */
  const currentOf = (table: TableEntry, type: RecordingOutcome['files'][number]['type']) => (ctx.root ? ownMediaPages(table, ctx.root, type) : []);

  function buildResult(outcome: RecordingOutcome): Built {
    const table = ctx.find(outcome.table.file) ?? outcome.table;
    const leave = () => ctx.leave();
    if (!outcome.usable) {
      return {
        heading: t('Enregistrement de la partie'),
        icon: 'record',
        subheading: table.title,
        lead: outcome.text,
        sections: [],
        actions: [
          { label: t('Rejouer et enregistrer'), detail: summary(outcome.settings), tone: 'ok', icon: 'restart', run: () => ctx.play(table, settings()) },
          { label: t('Retour aux tables'), icon: 'back', run: leave },
        ],
        back: leave,
      };
    }
    const cards: MediaCard[] = outcome.files.map((f) => {
      allowPreview(f.file);
      const now = currentOf(table, f.type)[0];
      // Cartes d'aperçu seulement : rattachées à une action, elles la retireraient de la liste.
      return {
        title: ROLE_LABELS[f.role](),
        code: `(${f.type})`,
        // Une conséquence directe d'abord (revu par Codex) ; les noms exacts sont au plan.
        state: { label: t('Nouvelle prise'), tone: 'info' },
        where: now ? t('Remplace la vidéo actuelle ; l’ancienne restera récupérable dans la corbeille') : t('Ajoute une vidéo ; aujourd’hui : visuel par défaut'),
        facts: `${f.width} × ${f.height} · ${clockLabel(keptSeconds(outcome.clock))} · ${formatSize(f.bytes)}`,
        // L'aperçu (une image, la vidéo n'y joue pas) pris au milieu : la première image est noire (fondu d'entrée).
        thumb: { kind: 'video', url: `${mediaUrl(f.file)}#t=${Math.max(1, Math.round(keptSeconds(outcome.clock) / 2))}`, rotation: 0 },
      };
    });
    const media: MediaView = { cards, large: cards.length === 1 };
    const kept = outcome.files.map((f) => ROLE_LABELS[f.role]()).join(', ');
    return {
      heading: t('Enregistrement prêt'),
      icon: 'record',
      subheading: [table.title, t('{n} s', { n: Math.round(keptSeconds(outcome.clock)) }), tn(cards.length, '{n} écran', '{n} écrans')].join(' · '),
      lead: outcome.text,
      sections: [],
      media,
      actions: [
        { label: t('Utiliser pour la roue'), detail: t('{screens} : vérifier les changements avant de confirmer', { screens: kept }), tone: 'ok', icon: 'check', run: () => ctx.show(() => buildPlan(outcome), 0, table.file) },
        { label: t('Garder de côté'), detail: t('Disponible dans « Médias du jeu » ; Exit fait de même'), icon: 'folder', run: leave },
        { label: t('Rejouer et enregistrer'), detail: t('Cette prise sera gardée de côté'), icon: 'restart', run: () => ctx.play(table, settings()) },
        { label: t('Jeter l’enregistrement'), detail: t('Déplacer vers la corbeille de Cyber Pinball'), tone: 'error', icon: 'trash', run: () => discard(outcome) },
      ],
      // Exit ne perd rien : l'enregistrement reste de côté.
      back: leave,
    };
  }

  function draftOf(outcome: RecordingOutcome): MediaDraft {
    const draft = emptyMediaDraft();
    for (const f of outcome.files) draft.pages[f.type] = [{ from: f.file, mode: 'move', recorded: true }];
    return draft;
  }

  function planOf(outcome: RecordingOutcome, table: TableEntry) {
    return planMediaChanges(table, draftOf(outcome), { infoFile: infoFileFor(table, ctx.tablesDir()), root: ctx.root });
  }

  function buildPlan(outcome: RecordingOutcome): Built {
    const table = ctx.find(outcome.table.file) ?? outcome.table;
    const plan = planOf(outcome, table);
    const back = () => result(outcome);
    // Un groupe par écran, sa conséquence d'abord (revu par Codex) ; les noms exacts en détail.
    const rows: Row[] = outcome.files.map((f) => {
      const steps = plan.steps.filter((st) => st.type === f.type);
      const leaving = steps.filter((st) => st.kind === 'trash');
      const arriving = steps.find((st) => st.kind === 'add');
      const label = ROLE_LABELS[f.role]();
      return {
        text: leaving.length ? t('{screen} : remplacer la vidéo actuelle', { screen: label }) : t('{screen} : ajouter une vidéo', { screen: label }),
        detail: [
          ...leaving.map((st) => t('{name} va dans la corbeille de Cyber Pinball, récupérable', { name: st.text.replace(/ → .*$/, '') })),
          ...(leaving.length ? [] : [t('Aujourd’hui : visuel par défaut')]),
          ...(arriving ? [t('Nouvelle : {name}', { name: arriving.text.replace(/^.* → /, '') })] : []),
        ].join(' · '),
        tone: (leaving.length ? 'warning' : 'ok') as Tone,
        badges: [leaving.length ? t('remplacé') : t('ajouté')],
      };
    });
    return {
      heading: t('Utiliser pour la roue'),
      icon: 'check',
      subheading: table.title,
      lead: t('Ce qui change sur la roue pour cette table. Rien n’est écrit avant « Confirmer ».'),
      sections: [{ rows }, ...(plan.problems.length ? [{ title: t('Impossible pour l’instant'), rows: plan.problems.map((p) => ({ text: p, tone: 'error' as Tone })) }] : [])],
      actions: [
        ...(plan.problems.length ? [] : [{ label: t('Confirmer'), detail: t('La roue montre la nouvelle vidéo dès le retour aux tables'), tone: 'ok' as Tone, icon: 'check' as const, run: () => apply(outcome) }]),
        { label: t('Retour'), icon: 'back', run: back },
      ],
      back,
    };
  }

  function trashDir(table: TableEntry): string | undefined {
    const layout = ctx.layout();
    return layout ? trashDirFor(layout.trash, `Médias ${path.basename(table.folder)}`) : undefined; // i18n-ignore : nom de dossier de la corbeille
  }

  function apply(outcome: RecordingOutcome): void {
    const table = ctx.find(outcome.table.file) ?? outcome.table;
    const plan = planOf(outcome, table);
    const dir = trashDir(table);
    if (plan.problems.length || !dir) return ctx.show(() => buildPlan(outcome), 0, table.file);
    try {
      applyOps(plan.ops, { trashDir: dir });
    } catch (error) {
      ctx.reload(table.file);
      return ctx.sheet(table, t('Écriture interrompue : {error}. Ce qui a déjà été fait est resté ; les fichiers retirés sont dans la corbeille.', { error: (error as Error).message }));
    }
    console.log(`Enregistrement (${table.id}) : utilisé pour la roue (${outcome.files.map((f) => f.type).join(', ')}).`);
    ctx.reload(table.file);
    ctx.leave();
  }

  function discard(outcome: RecordingOutcome): void {
    const table = ctx.find(outcome.table.file) ?? outcome.table;
    const dir = trashDir(table);
    if (dir) applyOps(outcome.files.map((f) => ({ op: 'trash' as const, path: f.file })), { trashDir: dir });
    console.log(`Enregistrement (${table.id}) : jeté (corbeille).`);
    ctx.leave();
  }

  function lost(): Built {
    return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour aux tables'), icon: 'back', run: ctx.leave }], back: ctx.leave };
  }

  return { setup, result };
}
