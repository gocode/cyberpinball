// « Reprendre les médias de PinUP Popper / PinballX » (menu système) : les médias
// d'une installation existante sont rapprochés table par table, montrés dans un
// plan à valider, puis copiés sous « medias\(Type) <dossier>.ext » dans chaque
// table. L'installation d'origine n'est jamais modifiée ; un média déjà présent
// du même type part à la corbeille. Cœur : packages/core/src/mediaimport.ts.

import * as path from 'node:path';
import {
  copyPlannedMedias,
  formatList,
  formatSize,
  freeSpace,
  FRONTEND_LABELS,
  installedTables,
  knownInstallations,
  MATCH_LABELS,
  mediaTypeInfo,
  planInstallationMedias,
  scanInstallation,
  t,
  tn,
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

const title = () => t('Reprendre les médias de PinUP Popper / PinballX');
/** Lignes montrées par section ; le reste est compté. */
const MAX_ROWS = 40;

export function createMediaImport(host: MediaImportHost) {
  function open(): void {
    if (!host.tablesDir()) {
      host.openNotice(t('Cyber Pinball n’est pas installé'), [t('Lancez « Installer » depuis le lanceur : il crée le dossier des tables.')]);
      return;
    }
    const found = knownInstallations();
    host.openCustom(() => {
      const rows: Row[] = found.map((f, i) => ({ text: FRONTEND_LABELS[f.frontend], detail: f.path, action: i }));
      const actions: Action[] = found.map((f) => ({ label: t('{frontend} : {path}', { frontend: FRONTEND_LABELS[f.frontend], path: f.path }), run: () => analyse(f.path) }));
      actions.push(
        { label: t('Choisir un dossier sur ce PC…'), detail: t('PinUPSystem, POPMedia, PinballX ou son dossier Media'), run: () => void choose() },
        { label: t('Retour'), run: () => host.openSystem() },
      );
      return {
        heading: title(),
        lead: t('Les médias d’une installation existante (logos, vidéos de plateau, frontons, afficheurs, règles…) sont copiés dans le dossier de chaque table, sous les noms que lit Cyber Pinball. L’installation d’origine n’est pas modifiée. Rien n’est copié avant que vous ayez validé le plan.'),
        sections: [
          {
            title: t('Installations trouvées sur ce PC'),
            rows: rows.length ? rows : [{ text: t('Aucune aux emplacements habituels'), detail: t('Choisissez le dossier de l’installation.'), tone: 'quiet' }],
          },
        ],
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
    void host.task(t('Recherche des médias…'), async () => {
      const scan = scanInstallation(root);
      host.progress(t('Rapprochement avec les tables installées…'));
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
        sections.push({
          rows: [{ text: t('Place insuffisante'), detail: t('Il faut {need}, il reste {free} sur le disque des tables.', { need: formatSize(plan.bytes), free: formatSize(free!) }), tone: 'error' }],
        });
      }
      if (plan.tables.length) {
        sections.push(capped(tn(plan.tables.length, '{n} table reçoit des médias', '{n} tables reçoivent des médias'), plan.tables.map(tableRow)));
      }
      const skipped = plan.tables.flatMap((t) => t.skipped);
      if (skipped.length) {
        const unreadable = skipped.filter((s) => s.unreadable).length;
        sections.push(
          capped(
            unreadable
              ? tn(unreadable, 'Non copié : {n} vidéo dans un format que le menu ne lit pas', 'Non copié : {n} vidéos dans un format que le menu ne lit pas')
              : t('Non copié'),
            skipped.map((s) => ({ text: s.source, detail: s.reason, badges: s.type ? [mediaTypeInfo(s.type).label] : undefined, tone: s.unreadable ? 'warning' : 'quiet' })),
          ),
        );
      }
      if (plan.unmatched.length) {
        sections.push(
          capped(
            tn(plan.unmatched.length, 'Sans table : {n} jeu', 'Sans table : {n} jeux'),
            plan.unmatched.map((u) => ({ text: u.game, detail: `${tn(u.sources.length, '{n} média', '{n} médias')} · ${u.reason}`, tone: 'quiet' })),
          ),
        );
      }
      if (plan.ignored.length) {
        sections.push({ title: t('Autres émulateurs'), rows: plan.ignored.map((i) => ({ text: i.source, detail: `${tn(i.count, '{n} fichier', '{n} fichiers')} · ${i.reason}`, tone: 'quiet' })) });
      }
      const back = () => open();
      const actions: Action[] =
        plan.count && !tooBig
          ? [
              { label: t('Copier'), detail: `${tn(plan.count, '{n} média', '{n} médias')} · ${formatSize(plan.bytes)}`, tone: 'ok', run: () => apply(plan) },
              { label: t('Annuler'), run: back },
            ]
          : [{ label: t('Retour'), run: back }];
      const frontends = formatList(plan.frontends.map((f) => FRONTEND_LABELS[f]));
      return {
        heading: plan.count ? t('Plan de reprise des médias') : t('Aucun média à reprendre'),
        subheading: `${frontends || t('Aucun média de PinUP Popper ni de PinballX')} · ${plan.root}`,
        lead: plan.count
          ? t('Les fichiers sont copiés : l’installation d’origine n’est pas modifiée. Un média du même type déjà présent dans la table va à la corbeille.')
          : t('Aucun média de ce dossier ne correspond à une table installée.'),
        sections,
        actions,
        back,
      };
    }, replaces && plan.count && !tooBig ? 1 : 0);
  }

  /** Une ligne par table : les types reçus, la taille, comment elle a été reconnue. */
  function tableRow(plan: InstallationTablePlan): Row {
    const counts = new Map<string, number>();
    for (const m of plan.planned) counts.set(mediaTypeInfo(m.type).label, (counts.get(mediaTypeInfo(m.type).label) ?? 0) + 1);
    const types = [...counts].map(([label, n]) => (n > 1 ? t('{type} ({n} pages)', { type: label, n }) : label)).join(', ');
    const replaced = plan.planned.filter((m) => m.replaces).length;
    return {
      text: plan.table.dest.name,
      detail: `${types} · ${formatSize(plan.bytes)}`,
      badges: [...plan.how.map((h) => MATCH_LABELS[h]), ...(replaced ? [tn(replaced, 'remplace {n} média', 'remplace {n} médias')] : [])],
      tone: replaced ? 'warning' : undefined,
    };
  }

  function apply(plan: InstallationPlan): void {
    const planned = plan.tables.flatMap((t) => t.planned);
    void host.task(t('Copie des médias…'), async () => {
      const trashDir = trashDirFor(host.trashRoot()!, 'Remplacé par la reprise des médias'); // i18n-ignore : nom de dossier de la corbeille
      await copyPlannedMedias(planned, { trashDir }, (done, total) => host.progress(t('Copie des médias : {done} sur {total}…', { done, total })));
      const replaced = planned.filter((m) => m.replaces).length;
      host.reload();
      host.openNotice(t('Médias repris'), [
        t('{media} dans {tables}.', { media: tn(planned.length, '{n} média copié', '{n} médias copiés'), tables: tn(plan.tables.length, '{n} table', '{n} tables') }),
        ...(replaced
          ? [tn(replaced, 'Le média remplacé est dans la corbeille : {folder}.', 'Les {n} médias remplacés sont dans la corbeille : {folder}.', { folder: path.basename(trashDir) })]
          : []),
        t('L’installation d’origine n’a pas été modifiée.'),
      ]);
    });
  }

  return { open, showPlan };
}

function capped(title: string, rows: Row[]): Section {
  const shown = rows.slice(0, MAX_ROWS);
  return { title, rows: shown, more: rows.length - shown.length };
}
