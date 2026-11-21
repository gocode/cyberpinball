// Menu système > Ma borne > VPX > Autres versions de VPX (autres-vpx.ts) : les VPX déjà installés sur le PC (10.8.0,
// 10.7…) que des tables peuvent choisir. Ceux des autres installations (PinUP Popper, PinballX, dossier de VPX)
// sont proposés d'un Start ; un autre se choisit par son exécutable. Tant que la liste est vide, ni la fiche ni
// l'installation d'une table ne proposent de choix.

import {
  OTHER_VPX_LIMITS,
  addOtherVpx,
  checkOtherVpx,
  formatList,
  matchOtherVpx,
  otherVpxFor,
  otherVpxLabel,
  ownVpxLabel,
  readOtherVpx,
  readVpxFileVersion,
  tableTooNew,
  removeOtherVpx,
  say,
  t,
  tLater,
  tn,
  vpxChoiceOf,
  withVpxChoice,
  writeOtherVpx,
  type IconName,
  type LaterText,
  type OtherVpx,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem } from './library';

export interface OtherVpxMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
    openNotice(heading: string, lines: string[], then?: () => void): void;
    pick(request: { title: string; icon?: IconName; purpose: LaterText; filter?: { label: string; extensions: string[] }; mode: 'file'; start?: 'cp' | 'windows' }): Promise<string[] | undefined>;
    task(message: string, work: () => Promise<void> | void): Promise<void>;
  };
  dataDir(): string;
  /** Version du VPX de Cyber Pinball (« 10.8.1-5436 ») ; undefined s'il n'est pas installé. */
  ownVersion(): string | undefined;
  /** Le .info de chaque table (le choix CyberPinball.vpx). */
  tables(): { info: { [key: string]: unknown } }[];
  /** Exécutables de VPX des autres installations du PC (InstallationLayout.vpxExes). */
  found(): string[];
  /** La liste a changé : la fiche et l'installation d'une table la relisent. */
  changed(): void;
}

/** Ce que Cyber Pinball ne fait pas pour une table jouée avec un autre VPX, en une phrase. */
export function otherVpxLimitsText(): string {
  return t('Pas de {limits} pour ces tables.', { limits: formatList(OTHER_VPX_LIMITS.map((l) => say(l))) });
}

/** « Jouée avec VPX 10.8.0 » : la ligne de la fiche (Gérer la table) et du plan d'installation. */
export function playedWithText(chosen: OtherVpx | undefined, ownVersion: string | undefined): string {
  return t('Jouée avec {vpx}', { vpx: chosen ? otherVpxLabel(chosen) : ownVpxLabel(ownVersion) });
}

/**
 * Écran du choix du VPX d'une table : depuis sa fiche (`planned` faux) ou depuis le plan d'installation. Le curseur
 * se pose sur le choix actuel (vpxChoiceCursor).
 */
export function buildVpxChoice(o: {
  subheading: string;
  planned: boolean;
  others: OtherVpx[];
  current: string | undefined;
  ownVersion: string | undefined;
  choose(id: string | undefined): void;
  back(): void;
}): Built {
  const lead = o.planned
    ? t('Le VPX qui jouera cette table. Un autre VPX est lancé avec ses propres réglages (écrans, fronton, DMD). {limits}', { limits: otherVpxLimitsText() })
    : t('Le VPX qui joue cette table. Un autre VPX est lancé avec ses propres réglages (écrans, fronton, DMD). {limits}', { limits: otherVpxLimitsText() });
  return {
    heading: t('VPX de cette table'),
    icon: 'layers',
    subheading: o.subheading,
    lead,
    sections: [],
    actions: [
      {
        label: ownVpxLabel(o.ownVersion),
        detail: o.current ? t('Avec toutes les fonctions de Cyber Pinball') : t('Avec toutes les fonctions de Cyber Pinball · choix actuel'),
        icon: 'layers',
        tone: o.current ? undefined : 'ok',
        run: () => o.choose(undefined),
      },
      ...o.others.map(
        (v): Action => ({
          label: otherVpxLabel(v),
          detail: v.id === o.current ? t('{exe} · choix actuel', { exe: v.exe }) : v.exe,
          // Pas d'icône : la même sur chaque VPX ne dirait rien (garde-fou de mise en page) ; le choix
          // actuel se dit dans le détail et la couleur.
          tone: v.id === o.current ? 'ok' : undefined,
          run: () => o.choose(v.id),
        }),
      ),
      { label: t('Retour'), icon: 'back', run: () => o.back() },
    ],
    back: () => o.back(),
  };
}

/** La place du choix actuel dans buildVpxChoice : 0 pour le VPX de Cyber Pinball. */
export function vpxChoiceCursor(others: OtherVpx[], current: string | undefined): number {
  return current ? others.findIndex((v) => v.id === current) + 1 : 0;
}

/**
 * Le VPX des tables d'un plan d'installation. `choiceFor` : le choix fait dans le plan, sinon celui avec lequel
 * l'installation d'origine jouait la table (PinUP Popper : son émulateur et son ALTEXE) s'il est dans la liste,
 * sinon celui de la table déjà installée ; undefined : le VPX de Cyber Pinball. Une table enregistrée par un VPX
 * plus récent que celui-là (vpx-format.ts) prend, faute de choix fait dans le plan, le premier qui sait l'ouvrir.
 */
export function createPlanVpx() {
  /** Version de l'exécutable d'une autre installation, lue une fois par fichier. */
  const versions = new Map<string, string | undefined>();
  const versionOf = (exe: string) => {
    const key = exe.toLowerCase();
    if (!versions.has(key)) {
      const checked = checkOtherVpx(exe, undefined);
      versions.set(key, checked.ok ? checked.version : undefined);
    }
    return versions.get(key);
  };
  /** Format de la table à installer (readVpxFileVersion), lu une fois par fichier. */
  const formats = new Map<string, number | undefined>();
  const formatOf = (table: { steps: { kind: string; from: string }[] }) => {
    const from = table.steps.find((st) => st.kind === 'table')?.from;
    if (!from || !/\.vpx$/i.test(from)) return undefined;
    const key = from.toLowerCase();
    if (!formats.has(key)) formats.set(key, readVpxFileVersion(from));
    return formats.get(key);
  };
  function baseChoice(
    plan: { vpxHints?: Map<string, string> },
    table: { steps: { kind: string; from: string }[]; info: { [key: string]: unknown } },
    others: OtherVpx[],
  ): string | undefined {
    const from = table.steps.find((st) => st.kind === 'table')?.from;
    const exe = from && plan.vpxHints?.get(from.toLowerCase());
    if (exe) return matchOtherVpx(others, exe, versionOf(exe))?.id;
    return otherVpxFor(table.info, others)?.id;
  }
  return {
    choiceFor(
      plan: { vpxChoices?: Map<string, string | null>; vpxHints?: Map<string, string> },
      table: { folder: string; steps: { kind: string; from: string }[]; info: { [key: string]: unknown } },
      others: OtherVpx[],
      ownVersion?: string,
    ): string | undefined {
      const key = table.folder.toLowerCase();
      if (plan.vpxChoices?.has(key)) return plan.vpxChoices.get(key) ?? undefined;
      const base = baseChoice(plan, table, others);
      const tooNew = tableTooNew(formatOf(table), withVpxChoice(table.info, base), ownVersion, others);
      return tooNew?.able.length ? tooNew.able[0]!.id : base;
    },
    /** La table, avec le VPX choisi dans le plan, est-elle plus récente que lui ? (ligne d'avertissement du plan) */
    tooNew(table: { steps: { kind: string; from: string }[]; info: { [key: string]: unknown } }, choice: string | undefined, others: OtherVpx[], ownVersion: string | undefined) {
      return tableTooNew(formatOf(table), withVpxChoice(table.info, choice), ownVersion, others);
    },
  };
}

export function createOtherVpxMenu(host: OtherVpxMenuHost): { item: ProvidedSystemItem; list(): OtherVpx[] } {
  /** Exécutables trouvés dans les autres installations et leur version, relus à chaque ouverture. */
  let candidates: { exe: string; version: string }[] = [];

  // La liste, lue une fois puis gardée : la fiche et le plan d'installation se reconstruisent sans lire le disque.
  // Cet écran est seul à l'écrire (add, openRemove) ; il la relit à chaque ouverture.
  let cached: OtherVpx[] | undefined;
  const list = () => (cached ??= readOtherVpx(host.dataDir()));
  const save = (next: OtherVpx[]) => {
    writeOtherVpx(host.dataDir(), next);
    cached = next;
  };
  const usedBy = (v: OtherVpx) => host.tables().filter((e) => vpxChoiceOf(e.info) === v.id).length;

  function add(exe: string, version: string): void {
    const next = addOtherVpx(list(), exe, version);
    save(next.list);
    console.log(`Autres versions de VPX : ${otherVpxLabel({ version })} ajouté (${exe}).`); // i18n-ignore : journal
    host.changed();
  }

  function build(): Built {
    const own = list();
    const actions: Action[] = own.map((v) => {
      const n = usedBy(v);
      return {
        label: otherVpxLabel(v),
        detail: t('{exe} · {tables} (Start : retirer)', { exe: v.exe, tables: n ? tn(n, '{n} table', '{n} tables') : t('aucune table') }),
        icon: 'layers',
        tone: 'ok',
        run: () => openRemove(v),
      };
    });
    // Une version déjà dans la liste n'est pas reproposée (le même VPX en GL et en DirectX : une seule entrée).
    for (const c of candidates) {
      if (own.some((v) => v.version === c.version)) continue;
      actions.push({
        label: t('Ajouter {vpx}', { vpx: otherVpxLabel(c) }),
        detail: t('Trouvé sur ce PC : {exe}', { exe: c.exe }),
        icon: 'plus',
        run: () => {
          add(c.exe, c.version);
          open(0);
        },
      });
    }
    actions.push({
      label: t('Ajouter un autre VPX…'),
      detail: t('Choisir son exécutable (VPinballX64.exe…) sur ce PC'),
      icon: 'import',
      run: () => void pickExe(),
    });
    actions.push({ label: t('Retour'), icon: 'back', run: () => host.library.openSystem() });
    return {
      heading: t('Autres versions de VPX'),
      icon: 'layers',
      lead: [
        t('Un VPX déjà installé sur ce PC, pour les tables qui tournent mieux avec lui : il se choisit dans la fiche de chaque table (Gérer la table, « Jouée avec ») et quand une table s’installe.'),
        t('Cyber Pinball le lance avec ses propres réglages (écrans, fronton, DMD). {limits}', { limits: otherVpxLimitsText() }),
      ].join(' '),
      sections: [],
      actions,
      back: () => host.library.openSystem(),
    };
  }

  function open(at = 0): void {
    host.library.openCustom(build, at);
  }

  function openRemove(v: OtherVpx): void {
    const n = usedBy(v);
    const back = Math.max(0, list().findIndex((x) => x.id === v.id));
    host.library.openCustom(() => ({
      heading: t('Retirer {vpx} ?', { vpx: otherVpxLabel(v) }),
      icon: 'layers',
      lead: n
        ? tn(n, 'La table qui l’a choisi sera jouée avec le VPX de Cyber Pinball ; elle le retrouvera s’il est ajouté de nouveau. Rien n’est effacé de ce PC.', 'Les {n} tables qui l’ont choisi seront jouées avec le VPX de Cyber Pinball ; elles le retrouveront s’il est ajouté de nouveau. Rien n’est effacé de ce PC.')
        : t('Aucune table ne l’a choisi. Rien n’est effacé de ce PC.'),
      sections: [],
      actions: [
        {
          label: t('Retirer'),
          icon: 'trash',
          run: () => {
            save(removeOtherVpx(list(), v.id));
            console.log(`Autres versions de VPX : ${otherVpxLabel(v)} retiré (${v.exe}).`); // i18n-ignore : journal
            host.changed();
            open(0);
          },
        },
        { label: t('Annuler'), icon: 'back', run: () => open(back) },
      ],
      back: () => open(back),
    }));
  }

  async function pickExe(): Promise<void> {
    const paths = await host.library.pick({
      title: t('Autre VPX : choisir son exécutable'),
      icon: 'layers',
      purpose: tLater('Ajout d’une autre version de VPX'),
      filter: { label: t('Exécutable de VPX'), extensions: ['exe'] },
      mode: 'file',
      start: 'windows',
    });
    const exe = paths?.[0];
    if (!exe) return open(list().length + candidates.length);
    const checked = checkOtherVpx(exe, host.ownVersion());
    if (!checked.ok) return host.library.openNotice(t('Ce VPX ne peut pas être ajouté'), [exe, checked.reason], () => open(list().length + candidates.length));
    add(exe, checked.version);
    open(0);
  }

  return {
    item: {
      get detail() {
        const own = list();
        if (!own.length) return t('Aucune : toutes les tables sont jouées avec le VPX de Cyber Pinball');
        return formatList(own.map((v) => otherVpxLabel(v)));
      },
      run: () =>
        void host.library.task(t('Recherche des VPX installés sur ce PC…'), () => {
          cached = undefined;
          const seen = new Set<string>();
          candidates = [];
          for (const exe of host.found()) {
            const checked = checkOtherVpx(exe, host.ownVersion());
            if (!checked.ok || seen.has(checked.version)) continue;
            seen.add(checked.version);
            candidates.push({ exe, version: checked.version });
          }
          open(0);
        }),
    },
    /** La liste des autres VPX, sans lire le disque à chaque fois (fiche, plan d'installation). */
    list,
  };
}
