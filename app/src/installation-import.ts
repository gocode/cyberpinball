// « Depuis une autre installation » (Ajouter une table) : les tables d'une installation
// existante (PinUP Popper, PinballX, VPX rangé à l'ancienne) sont listées une par une ; on coche
// celles qu'on veut, et seules celles-là passent par le plan d'ajout, avec tout ce qui les
// accompagne ailleurs dans l'installation (PuP-Pack, ROM, couleurs, sons, dossier DMD, médias :
// installationCompanions, appelé par le plan d'ajout). Rien n'est copié avant « Installer » ;
// l'installation d'origine n'est jamais modifiée. Cœur : packages/core/src/installation.ts.

import * as path from 'node:path';
import {
  alreadyInstalled,
  findInstallation,
  formatList,
  indexInstallationMedias,
  knownTableInstallations,
  listInstallationTables,
  t,
  tn,
  type InstallationLayout,
  type InstallationTable,
  type TableEntry,
} from '@cyberpinball/core';
import type { Action, Built, Row } from './library';

export interface InstallationImportHost {
  /** Racine de Cyber Pinball : jamais prise pour une autre installation. */
  root(): string | undefined;
  tables(): TableEntry[];
  pickFolder(): Promise<string | undefined>;
  openCustom(build: () => Built, at?: number): void;
  cursor(): number;
  task(message: string, work: () => Promise<void> | void): Promise<void>;
  /** Plan d'ajout de ces .vpx (copiés) ; « Annuler » y revient par `back`. */
  install(paths: string[], back: () => void): void;
  /** « Chercher sur le web… » de l'écran (ADD_SCREENS), `after` : le redessine. */
  web(after: () => void): Action;
  /** Retour à « Ajouter une table ». */
  back(): void;
}

/** Une liste : l'installation lue, ses tables et celles qui sont cochées. */
interface Listing {
  layout: InstallationLayout;
  tables: InstallationTable[];
  checked: Set<string>;
}

export function createInstallationImport(host: InstallationImportHost) {
  let listing: Listing | undefined;
  let notice: string | undefined;
  const exclude = () => [host.root()].filter((r): r is string => Boolean(r));

  /** Point d'entrée : l'installation trouvée sur ce PC s'ouvre directement ; sinon on la choisit. */
  function open(): void {
    const found = knownTableInstallations(['C:', 'D:', 'E:', 'F:'], exclude());
    if (found.length === 1) return openTables(found[0]!);
    host.openCustom(() => buildPlaces(found));
  }

  function buildPlaces(found: InstallationLayout[]): Built {
    const actions: Action[] = found.map((f) => ({ label: f.root, detail: t('Tables : {dir}', { dir: f.tables }), run: () => openTables(f) }));
    actions.push(
      { label: t('Choisir un dossier…'), detail: t('La racine de l’installation, son dossier Tables ou PinUPSystem'), icon: 'folder', run: () => void choose() },
      host.web(() => host.openCustom(() => buildPlaces(found), host.cursor())),
      { label: t('Retour'), icon: 'back', run: () => host.back() },
    );
    const rows: Row[] = found.map((f, i) => ({ text: f.root, detail: placeDetail(f), action: i }));
    return {
      heading: t('Reprendre une table d’une autre installation'),
      icon: 'import',
      lead: lead(),
      sections: [
        ...noticeSection(),
        { title: t('Installations trouvées sur ce PC'), rows: rows.length ? rows : [{ text: t('Aucune aux emplacements habituels'), detail: t('« Choisir un dossier… » : la racine de l’installation, son dossier Tables ou PinUPSystem.'), tone: 'quiet' }] },
      ],
      actions,
      back: () => host.back(),
    };
  }

  async function choose(): Promise<void> {
    const dir = await host.pickFolder();
    if (!dir) return open();
    const layout = findInstallation(dir, exclude());
    if (layout) return openTables(layout);
    notice = t('« {dir} » : aucune installation reconnue (ni VPinMAME, ni PinUPSystem, ni PinballX autour d’un dossier de tables). Pour une table rangée dans son propre dossier, « Choisir un dossier… » de « Ajouter une table » suffit.', { dir });
    host.openCustom(() => buildPlaces(knownTableInstallations(['C:', 'D:', 'E:', 'F:'], exclude())));
  }

  function openTables(layout: InstallationLayout, at = 0): void {
    void host.task(t('Lecture de l’installation…'), () => {
      if (!listing || listing.layout.tables !== layout.tables) {
        const medias = indexInstallationMedias(layout);
        listing = { layout, tables: listInstallationTables(layout, medias), checked: new Set() };
      }
      host.openCustom(() => buildTables(listing!), at);
    });
  }

  function buildTables(l: Listing): Built {
    const installed = host.tables().map((e) => ({ title: e.title, files: [e.file] }));
    const actions: Action[] = [];
    const rows: Row[] = [];
    const redraw = () => host.openCustom(() => buildTables(l), host.cursor());
    let present = 0;
    for (const table of l.tables) {
      const here = alreadyInstalled(table, installed);
      if (here) present++;
      const checked = l.checked.has(table.vpx);
      const index =
        actions.push({
          label: table.title,
          key: `vpx:${table.vpx}`,
          run: () => {
            if (checked) l.checked.delete(table.vpx);
            else l.checked.add(table.vpx);
            redraw();
          },
        }) - 1;
      const name = [table.manufacturer, table.year].filter(Boolean).join(' ');
      const seen = [table.backglass ? t('fronton') : undefined, table.medias ? tn(table.medias, '{n} média', '{n} médias') : undefined].filter((x): x is string => Boolean(x));
      rows.push({
        text: name ? `${table.title} (${name})` : table.title,
        detail: [path.relative(l.layout.tables, table.vpx), seen.length ? formatList(seen) : undefined].filter(Boolean).join(' · '),
        // Cochée ou non, en toutes lettres : jamais l'icône seule ; « déjà dans la borne » à côté.
        badges: [checked ? t('Cochée') : t('Non cochée'), ...(here ? [t('Déjà dans la borne')] : [])],
        tone: checked ? 'ok' : here ? 'quiet' : undefined,
        icon: checked ? 'check' : 'close',
        action: index,
        pick: true,
      });
    }
    const chosen = l.tables.filter((tb) => l.checked.has(tb.vpx));
    actions.push({
      label: chosen.length ? tn(chosen.length, 'Reprendre la table cochée', 'Reprendre les {n} tables cochées') : t('Aucune table cochée'),
      detail: chosen.length ? t('Avec son PuP-Pack, sa ROM, ses couleurs, ses sons et ses médias : le plan d’ajout montre tout avant d’installer') : t('Start sur une table la coche ou la décoche'),
      icon: 'table-add',
      tone: chosen.length ? 'ok' : undefined,
      run: () => {
        if (!chosen.length) return redraw();
        host.install(
          chosen.map((c) => c.vpx),
          () => openTables(l.layout),
        );
      },
    });
    if (chosen.length) actions.push({ label: t('Tout décocher'), icon: 'broom', run: () => (l.checked.clear(), redraw()) });
    actions.push(
      { label: t('Une autre installation…'), detail: t('Choisir son dossier'), icon: 'folder', run: () => void choose() },
      host.web(redraw),
      { label: t('Retour'), icon: 'back', run: () => host.back() },
    );
    return {
      heading: t('Reprendre une table d’une autre installation'),
      icon: 'import',
      subheading: [l.layout.root, tn(l.tables.length, '{n} table', '{n} tables'), present ? tn(present, '{n} déjà dans la borne', '{n} déjà dans la borne') : undefined, chosen.length ? tn(chosen.length, '{n} cochée', '{n} cochées') : undefined].filter(Boolean).join(' · '),
      lead: lead(),
      sections: [
        ...noticeSection(),
        { title: t('Où sont ses parties'), rows: [{ text: placeDetail(l.layout), tone: 'quiet' }] },
        { title: t('Ses tables'), rows: rows.length ? rows : [{ text: t('Aucune table dans {dir}', { dir: l.layout.tables }), tone: 'quiet' }] },
      ],
      actions,
      back: () => host.back(),
      listStart: t('cocher ou décocher la table'),
    };
  }

  const lead = () =>
    t('Seules les tables cochées sont reprises, chacune avec ce que l’installation range ailleurs : son PuP-Pack (PUPVideos), sa ROM, ses couleurs et ses sons (VPinMAME), son dossier DMD, son fronton et ses médias. Tout est copié : l’installation d’origine ne change pas. Rien n’est installé avant que vous ayez validé le plan.');

  function noticeSection() {
    if (!notice) return [];
    const text = notice;
    notice = undefined;
    return [{ rows: [{ text, tone: 'warning' as const }] }];
  }

  /** « Tables : … · VPinMAME : … · PuP-Packs : … · Médias : … » */
  function placeDetail(l: InstallationLayout): string {
    return [
      t('Tables : {dir}', { dir: l.tables }),
      l.pinmame ? t('VPinMAME : {dir}', { dir: l.pinmame }) : t('VPinMAME : absent'),
      l.pupVideos ? t('PuP-Packs : {dir}', { dir: l.pupVideos }) : t('PuP-Packs : absents'),
      l.mediaRoots.length ? t('Médias : {dirs}', { dirs: l.mediaRoots.join(', ') }) : undefined,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  return { open };
}
