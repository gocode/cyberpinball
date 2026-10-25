// Configurations de la borne dans le menu système : la configuration active, le
// choix quand les écrans branchés n'en désignent pas une à coup sûr, et la gestion
// (forcer, renommer, nouvelle configuration, corbeille), et l'écran du navigateur intégré
// de chaque configuration. Tout se pilote aux boutons.
// Changer de configuration relance le menu : ses fenêtres se rouvrent sur les bons écrans.

import {
  browserRoleLabel,
  browserScreenOptions,
  chooseConfiguration,
  describeBrowserScreen,
  configIniPath,
  describeDisplays,
  explainChoice,
  explainScore,
  forceConfiguration,
  formatDateTime,
  formatList,
  loadCabinetSet,
  rememberChoice,
  renameConfiguration,
  restoreConfiguration,
  ROLES,
  setBrowserScreen,
  t,
  tn,
  trashConfiguration,
  updateCabinetSet,
  type CabinetConfiguration,
  type CabinetSet,
  type ConfigurationScore,
  type IconName,
  type Locations,
  type ObservedDisplay,
  type RoleId,
} from '@cyberpinball/core';
import type { Action, Built, Row, SystemItem } from './library';

export interface ConfigurationsHost {
  loc: Locations;
  displays(): ObservedDisplay[];
  library: {
    openCustom(build: () => Built, at?: number): void;
    openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
    openSystem(): void;
    leave(): void;
  };
  /** Relance le menu (nouvelle configuration active), ou l'assistant pour une nouvelle configuration. */
  relaunch(newConfiguration?: boolean): void;
}

const lead = () => t('Chaque configuration a ses écrans, ses rôles, son son, ses boutons et son VPinballX.ini ; les tables, les ROM et les médias sont communs.');
/** Nom d'une configuration entre guillemets, à la façon de la langue. */
const quoted = (name: string) => t('« {name} »', { name });
/** Icône de chaque choix de l'écran du navigateur intégré : deux actions d'un écran n'ont jamais la même. */
const SCREEN_ICONS: Record<RoleId | 'auto', IconName> = { auto: 'auto', playfield: 'playfield', backglass: 'image', dmd: 'dmd', topper: 'bulb' };

export function createConfigurationsMenu(host: ConfigurationsHost) {
  const set = () => loadCabinetSet(host.loc.dataDir)!;
  const active = (s: CabinetSet) => s.configurations.find((c) => c.id === s.active) ?? s.configurations[0];
  const scores = (s: CabinetSet) => chooseConfiguration(s, host.displays()).scores;
  const scoreOf = (all: ConfigurationScore[], id: string) => all.find((x) => x.id === id);

  /** Entrée du menu système ; son détail nomme la configuration active. */
  const systemItem: SystemItem = {
    icon: 'layers',
    get label() {
      return t('Configurations de la borne');
    },
    get detail() {
      const s = loadCabinetSet(host.loc.dataDir);
      const current = s && active(s);
      if (!current) return t('Aucune configuration');
      const count = s.configurations.length;
      return s.forced === current.id
        ? tn(count, 'Active : « {name} » (forcée) · {n} configuration', 'Active : « {name} » (forcée) · {n} configurations', { name: current.name })
        : tn(count, 'Active : « {name} » · {n} configuration', 'Active : « {name} » · {n} configurations', { name: current.name });
    },
    run: () => openManager(),
  };

  function nameOf(s: CabinetSet, id: string): string {
    return s.configurations.find((c) => c.id === id)?.name ?? id;
  }

  /** Écran de choix : au démarrage ou avant une partie, quand la reconnaissance ne tranche pas. */
  function openChooser(reason?: string): void {
    host.library.openCustom(() => {
      const s = set();
      const choice = chooseConfiguration(s, host.displays());
      const actions: Action[] = choice.scores.map((score) => ({
        label: quoted(score.name),
        detail: explainScore(score),
        tone: score.candidate ? 'ok' : 'quiet',
        run: () => {
          updateCabinetSet(host.loc.dataDir, (x) => rememberChoice(x, host.displays(), score.id));
          host.relaunch();
        },
      }));
      actions.push({ label: t('Nouvelle configuration'), detail: t('Assistant complet pour les écrans branchés'), icon: 'plus', run: () => host.relaunch(true) });
      actions.push({ label: t('Plus tard'), detail: t('Le menu reste sur l’écran principal ; une partie redemandera la configuration'), run: () => host.library.leave() });
      return {
        heading: t('Quelle configuration est branchée ?'),
        icon: 'layers',
        lead: reason ?? explainChoice(s, choice),
        sections: [{ title: t('Écrans branchés'), rows: [{ text: describeDisplays(host.displays()) }] }],
        actions,
        back: () => host.library.leave(),
      };
    });
  }

  /** Liste des configurations, avec leur correspondance aux écrans branchés. */
  function openManager(at = 0): void {
    host.library.openCustom(() => {
      const s = set();
      const all = scores(s);
      const current = active(s);
      const rows: Row[] = s.configurations.map((c, i) => {
        const score = scoreOf(all, c.id);
        return {
          text: c.name,
          detail: score ? explainScore(score) : undefined,
          tone: c.id === current?.id ? 'ok' : score?.candidate ? 'info' : 'quiet',
          badges: [...(c.id === current?.id ? [t('active')] : []), ...(s.forced === c.id ? [t('forcée')] : [])],
          action: i,
        };
      });
      const actions: Action[] = s.configurations.map((c) => ({ label: quoted(c.name), detail: t('Utiliser, forcer, renommer, supprimer'), run: () => openConfiguration(c.id) }));
      actions.push({ label: t('Nouvelle configuration'), detail: t('Assistant complet pour les écrans branchés'), icon: 'plus', run: () => host.relaunch(true) });
      if (s.forced) {
        actions.push({
          label: t('Reconnaissance automatique'),
          icon: 'auto',
          detail: t('Ne plus forcer « {name} » : la configuration suivra les écrans branchés', { name: nameOf(s, s.forced) }),
          run: () => {
            updateCabinetSet(host.loc.dataDir, (x) => forceConfiguration(x, undefined));
            host.relaunch();
          },
        });
      }
      if (s.trash?.length) {
        actions.push({ label: t('Corbeille'), detail: tn(s.trash.length, '{n} configuration supprimée', '{n} configurations supprimées'), icon: 'trash', run: () => openTrash() });
      }
      actions.push({ label: t('Retour'), icon: 'back', run: () => host.library.openSystem() });
      return {
        heading: t('Configurations de la borne'),
        icon: 'layers',
        subheading: current
          ? s.forced === current.id
            ? t('Active : « {name} », forcée depuis ce menu', { name: current.name })
            : t('Active : « {name} »', { name: current.name })
          : undefined,
        lead: lead(),
        sections: [
          { title: t('Configurations'), rows },
          { title: t('Écrans branchés'), rows: [{ text: describeDisplays(host.displays()) }] },
        ],
        actions,
        back: () => host.library.openSystem(),
      };
    }, at);
  }

  /** Écran d'une configuration ; `focus` : l'action désignée à l'arrivée (retour d'un réglage). */
  function openConfiguration(id: string, focus?: string): void {
    const build = (): Built => {
      const s = set();
      const c = s.configurations.find((x) => x.id === id);
      if (!c) return { heading: t('Configuration introuvable'), sections: [], actions: [{ label: t('Retour'), run: () => openManager() }], back: () => openManager() };
      const index = s.configurations.indexOf(c);
      const score = scoreOf(scores(s), id);
      const isActive = active(s)?.id === id;
      const actions: Action[] = [];
      if (!isActive) {
        actions.push({
          label: t('Utiliser avec ces écrans'),
          icon: 'check',
          detail: t('Retenue pour les écrans branchés ; la reconnaissance reste automatique'),
          run: () => {
            updateCabinetSet(host.loc.dataDir, (x) => rememberChoice(x, host.displays(), id));
            host.relaunch();
          },
        });
      }
      if (s.forced !== id) {
        actions.push({
          label: t('Toujours utiliser celle-ci'),
          icon: 'pin',
          detail: t('Forcée, quels que soient les écrans branchés'),
          run: () => {
            updateCabinetSet(host.loc.dataDir, (x) => forceConfiguration(x, id));
            host.relaunch();
          },
        });
      }
      actions.push({
        label: t('Écran du navigateur intégré'),
        detail: browserScreenSummary(c),
        icon: 'monitor',
        run: () => openBrowserScreen(id, () => openConfiguration(id, t('Écran du navigateur intégré'))),
      });
      actions.push({
        label: t('Renommer'),
        detail: c.name,
        icon: 'edit',
        run: () =>
          host.library.openPrompt(t('Renommer la configuration'), t('Nom'), c.name, (name) => {
            if (name) updateCabinetSet(host.loc.dataDir, (x) => renameConfiguration(x, id, name));
            openConfiguration(id);
          }),
      });
      if (s.configurations.length > 1) {
        actions.push({ label: t('Supprimer'), detail: t('Mise à la corbeille, restaurable ; son VPinballX.ini reste sur le disque'), tone: 'warning', icon: 'trash', run: () => confirmTrash(id) });
      }
      actions.push({ label: t('Retour'), icon: 'back', run: () => openManager(index) });
      return {
        heading: quoted(c.name),
        icon: 'layers',
        subheading: [isActive && t('active'), s.forced === id && t('forcée')].filter(Boolean).join(' · ') || undefined,
        lead: score ? explainScore(score) : undefined,
        sections: [{ title: t('Écrans'), rows: screenRows(c, score) }, { title: t('Fichiers'), rows: [{ text: 'VPinballX.ini', detail: configIniPath(host.loc.vpxIni, c) }] }],
        actions,
        back: () => openManager(index),
      };
    };
    host.library.openCustom(build, focus ? Math.max(0, build().actions.findIndex((a) => a.label === focus)) : 0);
  }

  function confirmTrash(id: string): void {
    host.library.openCustom(() => {
      const s = set();
      const isActive = active(s)?.id === id;
      return {
        heading: t('Supprimer « {name} » ?', { name: nameOf(s, id) }),
        lead: isActive
          ? t("Elle va dans la corbeille des configurations, d'où elle se restaure telle quelle. C’est la configuration active : le menu redémarre et reconnaît celle qui correspond aux écrans branchés.")
          : t("Elle va dans la corbeille des configurations, d'où elle se restaure telle quelle."),
        sections: [],
        actions: [
          { label: t('Annuler'), icon: 'close', run: () => openConfiguration(id) },
          {
            label: t('Supprimer'),
            tone: 'warning',
            icon: 'trash',
            run: () => {
              updateCabinetSet(host.loc.dataDir, (x) => trashConfiguration(x, id));
              if (isActive) host.relaunch();
              else openManager();
            },
          },
        ],
        back: () => openConfiguration(id),
      };
    });
  }

  function openTrash(): void {
    host.library.openCustom(() => {
      const s = set();
      const trash = s.trash ?? [];
      const actions: Action[] = trash.map((c) => ({
        label: t('Restaurer « {name} »', { name: c.name }),
        detail: t('Supprimée le {date}', { date: formatDateTime(c.deletedAt) }),
        run: () => {
          updateCabinetSet(host.loc.dataDir, (x) => restoreConfiguration(x, c.id));
          openManager();
        },
      }));
      actions.push({ label: t('Retour'), run: () => openManager() });
      return {
        heading: t('Corbeille des configurations'),
        icon: 'trash',
        lead: t('Une configuration restaurée reprend ses écrans, ses réglages et son VPinballX.ini.'),
        sections: [],
        actions,
        back: () => openManager(),
      };
    });
  }

  /** « Automatique (maintenant : Fronton) », « DMD », « DMD (pas branché : automatique) ». */
  function browserScreenSummary(c: CabinetConfiguration): string {
    const options = browserScreenOptions(c, host.displays());
    const current = options.find((o) => o.current) ?? options[0]!;
    if (!current.role) return current.roles.length ? t('Automatique (maintenant : {screen})', { screen: current.roles.map(browserRoleLabel).join(' + ') }) : t('Automatique');
    return current.display ? current.label : t('{screen} (pas branché : automatique)', { screen: current.label });
  }

  /**
   * Écran où s'ouvre le navigateur intégré (fenêtre « Récupérer ») pour une configuration
   * (la configuration active sans `id`) : Automatique, ou un rôle de la borne. Chaque choix a
   * sa ligne d'aperçu (écran, dimensions, sens), surlignée quand on le désigne ; le choix fait,
   * on revient à `back`.
   */
  function openBrowserScreen(id: string | undefined, back: () => void = () => openManager()): void {
    const configurationId = () => id ?? active(set())?.id;
    const build = (): Built => {
      const s = set();
      const c = s.configurations.find((x) => x.id === configurationId());
      if (!c) return { heading: t('Configuration introuvable'), sections: [], actions: [{ label: t('Retour'), run: back }], back };
      const options = browserScreenOptions(c, host.displays());
      const rows: Row[] = options.map((o, i) => ({
        text: o.role ? o.label : t('Automatique'),
        detail: describeBrowserScreen(c, o),
        icon: SCREEN_ICONS[o.role ?? 'auto'],
        tone: !o.display ? 'quiet' : o.tilted ? 'warning' : 'ok',
        badges: [...(o.current ? [t('choisi')] : []), ...(o.display ? [] : [t('pas branché')])],
        action: i,
      }));
      const actions: Action[] = options.map((o) => ({
        label: o.role ? o.label : t('Automatique'),
        detail: o.role
          ? o.tilted
            ? t('Possible, mais la souris y ira de travers')
            : o.display
              ? t('Toujours sur cet écran')
              : t('Pas branché : automatique en attendant')
          : t('Playfield s’il est droit, sinon le plus grand des autres écrans'),
        tone: o.current ? 'ok' : o.tilted ? 'warning' : undefined,
        icon: SCREEN_ICONS[o.role ?? 'auto'],
        run: () => {
          updateCabinetSet(host.loc.dataDir, (x) => setBrowserScreen(x, c.id, o.role));
          back();
        },
      }));
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      return {
        heading: t('Écran du navigateur intégré'),
        icon: 'monitor',
        subheading: t('Configuration {name}', { name: quoted(c.name) }),
        lead: t('La fenêtre « Récupérer » (catalogue, comptes des sites, médias des sites, recherche sur le web) s’ouvre sur cet écran et y amène le pointeur. L’écran est retrouvé par son rôle, même si Windows le renumérote ; pas branché, c’est l’écran automatique, et le bandeau de la fenêtre le dit.'),
        sections: [{ title: t('Aperçu'), rows }],
        actions,
        back,
      };
    };
    const s = set();
    const c = s.configurations.find((x) => x.id === configurationId());
    const at = c ? Math.max(0, browserScreenOptions(c, host.displays()).findIndex((o) => o.current)) : 0;
    host.library.openCustom(build, at);
  }

  return { systemItem, openChooser, openManager, openBrowserScreen };
}

/** Une ligne par écran de la configuration : rôles, et s'il est branché. */
function screenRows(c: CabinetConfiguration, score: ConfigurationScore | undefined): Row[] {
  return c.screens.map((screen) => {
    const roles = ROLES.filter((r) => c.roles[r.id] === screen.fingerprint).map((r) => r.label);
    const missing = score?.missing.some((m) => m.fingerprint === screen.fingerprint);
    return {
      text: screen.label,
      detail: `${roles.length ? formatList(roles) : t('sans rôle')} · ${missing ? t('introuvable') : t('branché')}`,
      tone: missing ? (roles.length ? 'warning' : 'quiet') : 'ok',
    };
  });
}
