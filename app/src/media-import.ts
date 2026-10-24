// « Reprendre les médias de PinUP Popper / PinballX » (menu système) : les médias
// d'une installation existante sont rapprochés table par table, montrés dans un
// plan à valider, puis copiés sous « medias\(Type) <dossier>.ext » dans chaque
// table. L'installation d'origine n'est jamais modifiée ; un média déjà présent
// du même type part à la corbeille. Cœur : packages/core/src/mediaimport.ts.

import * as path from 'node:path';
import {
  copyPlannedMedias,
  formatSize,
  freeSpace,
  FRONTEND_LABELS,
  installedTables,
  knownInstallations,
  MATCH_LABELS,
  mediaTypeInfo,
  planInstallationMedias,
  scanInstallation,
  trashDirFor,
  type InstallationPlan,
  type InstallationTablePlan,
  type TableEntry,
  type VpsDb,
} from '@cyberpinball/core';
import type { Action, Built, Row, Section } from './library';

export interface MediaImportHost {
  /** Dossier des tables et corbeille de la racine ; undefined si Cyber Pinball n'est pas installé. */
  tablesDir(): string | undefined;
  trashRoot(): string | undefined;
  tables(): TableEntry[];
  /** ROM de la table d'après son script déjà lu (médias nommés d'après la ROM). */
  romsOf(table: TableEntry): string[];
  /** Base VPS pour les noms qui ne ressemblent à aucune table (absente sans réseau). */
  vps(): Promise<VpsDb | undefined>;
  pickDirectory(): Promise<string | undefined>;
  openCustom(build: () => Built, at?: number): void;
  openSystem(): void;
  openNotice(heading: string, lines: string[]): void;
  /** Opération longue : message à l'écran, touches ignorées. */
  task(message: string, work: () => Promise<void> | void): Promise<void>;
  /** Change le message de l'opération en cours. */
  progress(message: string): void;
  reload(): void;
}

const TITLE = 'Reprendre les médias de PinUP Popper / PinballX';
/** Lignes montrées par section ; le reste est compté. */
const MAX_ROWS = 40;

export function createMediaImport(host: MediaImportHost) {
  function open(): void {
    if (!host.tablesDir()) {
      host.openNotice('Cyber Pinball n’est pas installé', ['Lancez « Installer » depuis le lanceur : il crée le dossier des tables.']);
      return;
    }
    const found = knownInstallations();
    host.openCustom(() => {
      const rows: Row[] = found.map((f, i) => ({ text: FRONTEND_LABELS[f.frontend], detail: f.path, action: i }));
      const actions: Action[] = found.map((f) => ({ label: `${FRONTEND_LABELS[f.frontend]} : ${f.path}`, run: () => analyse(f.path) }));
      actions.push(
        { label: 'Choisir un dossier sur ce PC…', detail: 'PinUPSystem, POPMedia, PinballX ou son dossier Media', run: () => void choose() },
        { label: 'Retour', run: () => host.openSystem() },
      );
      return {
        heading: TITLE,
        lead: 'Les médias d’une installation existante (logos, vidéos de plateau, frontons, afficheurs, règles…) sont copiés dans le dossier de chaque table, sous les noms que lit Cyber Pinball. L’installation d’origine n’est pas modifiée. Rien n’est copié avant que vous ayez validé le plan.',
        sections: [{ title: 'Installations trouvées sur ce PC', rows: rows.length ? rows : [{ text: 'Aucune aux emplacements habituels', detail: 'Choisissez le dossier de l’installation.', tone: 'quiet' }] }],
        actions,
        back: () => host.openSystem(),
      };
    });
  }

  async function choose(): Promise<void> {
    const dir = await host.pickDirectory();
    if (dir) analyse(dir);
  }

  function analyse(root: string): void {
    void host.task('Recherche des médias…', async () => {
      const scan = scanInstallation(root);
      host.progress('Rapprochement avec les tables installées…');
      const tables = installedTables(host.tables(), host.romsOf);
      // La base VPS ne sert qu'aux noms qui ne ressemblent à aucune table : chargée seulement alors.
      const quick = planInstallationMedias(scan, tables);
      const vps = quick.unmatched.length ? await host.vps() : undefined;
      const plan = vps ? planInstallationMedias(scan, tables, { vps }) : quick;
      showPlan(plan);
    });
  }

  function showPlan(plan: InstallationPlan): void {
    const free = freeSpace(host.tablesDir()!);
    const tooBig = free !== undefined && plan.bytes > free;
    const replaces = plan.tables.some((t) => t.planned.some((m) => m.replaces));
    host.openCustom(() => {
      const sections: Section[] = [];
      if (tooBig) {
        sections.push({ rows: [{ text: 'Place insuffisante', detail: `Il faut ${formatSize(plan.bytes)}, il reste ${formatSize(free!)} sur le disque des tables.`, tone: 'error' }] });
      }
      if (plan.tables.length) {
        sections.push(capped(`${plan.tables.length} table${plan.tables.length > 1 ? 's reçoivent' : ' reçoit'} des médias`, plan.tables.map(tableRow)));
      }
      const skipped = plan.tables.flatMap((t) => t.skipped);
      if (skipped.length) {
        const unreadable = skipped.filter((s) => s.unreadable).length;
        sections.push(
          capped(
            unreadable ? `Non copié : ${unreadable} vidéo${unreadable > 1 ? 's' : ''} dans un format que le menu ne lit pas` : 'Non copié',
            skipped.map((s) => ({ text: s.source, detail: s.reason, badges: s.type ? [mediaTypeInfo(s.type).label] : undefined, tone: s.unreadable ? 'warning' : 'quiet' })),
          ),
        );
      }
      if (plan.unmatched.length) {
        sections.push(
          capped(
            `Sans table : ${plan.unmatched.length} jeu${plan.unmatched.length > 1 ? 'x' : ''}`,
            plan.unmatched.map((u) => ({ text: u.game, detail: `${u.sources.length} média${u.sources.length > 1 ? 's' : ''} · ${u.reason}`, tone: 'quiet' })),
          ),
        );
      }
      if (plan.ignored.length) {
        sections.push({ title: 'Autres émulateurs', rows: plan.ignored.map((i) => ({ text: i.source, detail: `${i.count} fichier${i.count > 1 ? 's' : ''} · ${i.reason}`, tone: 'quiet' })) });
      }
      const back = () => open();
      const actions: Action[] =
        plan.count && !tooBig
          ? [
              { label: 'Copier', detail: `${plan.count} média${plan.count > 1 ? 's' : ''} · ${formatSize(plan.bytes)}`, tone: 'ok', run: () => apply(plan) },
              { label: 'Annuler', run: back },
            ]
          : [{ label: 'Retour', run: back }];
      const frontends = plan.frontends.map((f) => FRONTEND_LABELS[f]).join(' et ');
      return {
        heading: plan.count ? 'Plan de reprise des médias' : 'Aucun média à reprendre',
        subheading: `${frontends || 'Aucun média de PinUP Popper ni de PinballX'} · ${plan.root}`,
        lead: plan.count
          ? 'Les fichiers sont copiés : l’installation d’origine n’est pas modifiée. Un média du même type déjà présent dans la table va à la corbeille.'
          : 'Aucun média de ce dossier ne correspond à une table installée.',
        sections,
        actions,
        back,
      };
    }, replaces && plan.count && !tooBig ? 1 : 0);
  }

  /** Une ligne par table : les types reçus, la taille, comment elle a été reconnue. */
  function tableRow(t: InstallationTablePlan): Row {
    const counts = new Map<string, number>();
    for (const m of t.planned) counts.set(mediaTypeInfo(m.type).label, (counts.get(mediaTypeInfo(m.type).label) ?? 0) + 1);
    const types = [...counts].map(([label, n]) => (n > 1 ? `${label} (${n} pages)` : label)).join(', ');
    const replaced = t.planned.filter((m) => m.replaces).length;
    return {
      text: t.table.dest.name,
      detail: `${types} · ${formatSize(t.bytes)}`,
      badges: [...t.how.map((h) => MATCH_LABELS[h]), ...(replaced ? [`remplace ${replaced} média${replaced > 1 ? 's' : ''}`] : [])],
      tone: replaced ? 'warning' : undefined,
    };
  }

  function apply(plan: InstallationPlan): void {
    const planned = plan.tables.flatMap((t) => t.planned);
    void host.task('Copie des médias…', async () => {
      const trashDir = trashDirFor(host.trashRoot()!, 'Remplacé par la reprise des médias');
      await copyPlannedMedias(planned, { trashDir }, (done, total) => host.progress(`Copie des médias : ${done} sur ${total}…`));
      const replaced = planned.filter((m) => m.replaces).length;
      host.reload();
      host.openNotice('Médias repris', [
        `${planned.length} média${planned.length > 1 ? 's' : ''} copié${planned.length > 1 ? 's' : ''} dans ${plan.tables.length} table${plan.tables.length > 1 ? 's' : ''}.`,
        ...(replaced ? [`${replaced > 1 ? `Les ${replaced} médias remplacés sont` : 'Le média remplacé est'} dans la corbeille : ${path.basename(trashDir)}.`] : []),
        'L’installation d’origine n’a pas été modifiée.',
      ]);
    });
  }

  return { open, showPlan };
}

function capped(title: string, rows: Row[]): Section {
  const shown = rows.slice(0, MAX_ROWS);
  return { title, rows: shown, more: rows.length - shown.length };
}
