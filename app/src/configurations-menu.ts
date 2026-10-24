// Configurations de la borne dans le menu système : la configuration active, le
// choix quand les écrans branchés n'en désignent pas une à coup sûr, et la gestion
// (forcer, renommer, nouvelle configuration, corbeille). Tout se pilote aux boutons.
// Changer de configuration relance le menu : ses fenêtres se rouvrent sur les bons écrans.

import {
  chooseConfiguration,
  configIniPath,
  describeDisplays,
  explainChoice,
  explainScore,
  forceConfiguration,
  loadCabinetSet,
  rememberChoice,
  renameConfiguration,
  restoreConfiguration,
  ROLES,
  trashConfiguration,
  updateCabinetSet,
  type CabinetConfiguration,
  type CabinetSet,
  type ConfigurationScore,
  type Locations,
  type ObservedDisplay,
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

const LEAD = 'Chaque configuration a ses écrans, ses rôles, son son, ses boutons et son VPinballX.ini ; les tables, les ROM et les médias sont communs.';

export function createConfigurationsMenu(host: ConfigurationsHost) {
  const set = () => loadCabinetSet(host.loc.dataDir)!;
  const active = (s: CabinetSet) => s.configurations.find((c) => c.id === s.active) ?? s.configurations[0];
  const scores = (s: CabinetSet) => chooseConfiguration(s, host.displays()).scores;
  const scoreOf = (all: ConfigurationScore[], id: string) => all.find((x) => x.id === id);

  /** Entrée du menu système ; son détail nomme la configuration active. */
  const systemItem: SystemItem = {
    label: 'Configurations de la borne',
    get detail() {
      const s = loadCabinetSet(host.loc.dataDir);
      const current = s && active(s);
      if (!current) return 'Aucune configuration';
      return `Active : « ${current.name} »${s.forced === current.id ? ' (forcée)' : ''} · ${s.configurations.length} configuration${s.configurations.length > 1 ? 's' : ''}`;
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
        label: `« ${score.name} »`,
        detail: explainScore(score),
        tone: score.candidate ? 'ok' : 'quiet',
        run: () => {
          updateCabinetSet(host.loc.dataDir, (x) => rememberChoice(x, host.displays(), score.id));
          host.relaunch();
        },
      }));
      actions.push({ label: 'Nouvelle configuration', detail: 'Assistant complet pour les écrans branchés', run: () => host.relaunch(true) });
      actions.push({ label: 'Plus tard', detail: 'Le menu reste sur l’écran principal ; une partie redemandera la configuration', run: () => host.library.leave() });
      return {
        heading: 'Quelle configuration est branchée ?',
        lead: reason ?? explainChoice(s, choice),
        sections: [{ title: 'Écrans branchés', rows: [{ text: describeDisplays(host.displays()) }] }],
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
          badges: [...(c.id === current?.id ? ['active'] : []), ...(s.forced === c.id ? ['forcée'] : [])],
          action: i,
        };
      });
      const actions: Action[] = s.configurations.map((c) => ({ label: `« ${c.name} »`, detail: 'Utiliser, forcer, renommer, supprimer', run: () => openConfiguration(c.id) }));
      actions.push({ label: 'Nouvelle configuration', detail: 'Assistant complet pour les écrans branchés', run: () => host.relaunch(true) });
      if (s.forced) {
        actions.push({
          label: 'Reconnaissance automatique',
          detail: `Ne plus forcer « ${nameOf(s, s.forced)} » : la configuration suivra les écrans branchés`,
          run: () => {
            updateCabinetSet(host.loc.dataDir, (x) => forceConfiguration(x, undefined));
            host.relaunch();
          },
        });
      }
      if (s.trash?.length) actions.push({ label: 'Corbeille', detail: `${s.trash.length} configuration${s.trash.length > 1 ? 's' : ''} supprimée${s.trash.length > 1 ? 's' : ''}`, run: () => openTrash() });
      actions.push({ label: 'Retour', run: () => host.library.openSystem() });
      return {
        heading: 'Configurations de la borne',
        subheading: current ? `Active : « ${current.name} »${s.forced === current.id ? ', forcée depuis ce menu' : ''}` : undefined,
        lead: LEAD,
        sections: [
          { title: 'Configurations', rows },
          { title: 'Écrans branchés', rows: [{ text: describeDisplays(host.displays()) }] },
        ],
        actions,
        back: () => host.library.openSystem(),
      };
    }, at);
  }

  function openConfiguration(id: string): void {
    host.library.openCustom(() => {
      const s = set();
      const c = s.configurations.find((x) => x.id === id);
      if (!c) return { heading: 'Configuration introuvable', sections: [], actions: [{ label: 'Retour', run: () => openManager() }], back: () => openManager() };
      const index = s.configurations.indexOf(c);
      const score = scoreOf(scores(s), id);
      const isActive = active(s)?.id === id;
      const actions: Action[] = [];
      if (!isActive) {
        actions.push({
          label: 'Utiliser avec ces écrans',
          detail: 'Retenue pour les écrans branchés ; la reconnaissance reste automatique',
          run: () => {
            updateCabinetSet(host.loc.dataDir, (x) => rememberChoice(x, host.displays(), id));
            host.relaunch();
          },
        });
      }
      if (s.forced !== id) {
        actions.push({
          label: 'Toujours utiliser celle-ci',
          detail: 'Forcée, quels que soient les écrans branchés',
          run: () => {
            updateCabinetSet(host.loc.dataDir, (x) => forceConfiguration(x, id));
            host.relaunch();
          },
        });
      }
      actions.push({
        label: 'Renommer',
        detail: c.name,
        run: () =>
          host.library.openPrompt('Renommer la configuration', 'Nom', c.name, (name) => {
            if (name) updateCabinetSet(host.loc.dataDir, (x) => renameConfiguration(x, id, name));
            openConfiguration(id);
          }),
      });
      if (s.configurations.length > 1) {
        actions.push({ label: 'Supprimer', detail: 'Mise à la corbeille, restaurable ; son VPinballX.ini reste sur le disque', tone: 'warning', run: () => confirmTrash(id) });
      }
      actions.push({ label: 'Retour', run: () => openManager(index) });
      return {
        heading: `« ${c.name} »`,
        subheading: [isActive && 'active', s.forced === id && 'forcée'].filter(Boolean).join(' · ') || undefined,
        lead: score ? explainScore(score) : undefined,
        sections: [{ title: 'Écrans', rows: screenRows(c, score) }, { title: 'Fichiers', rows: [{ text: 'VPinballX.ini', detail: configIniPath(host.loc.vpxIni, c) }] }],
        actions,
        back: () => openManager(index),
      };
    });
  }

  function confirmTrash(id: string): void {
    host.library.openCustom(() => {
      const s = set();
      const isActive = active(s)?.id === id;
      return {
        heading: `Supprimer « ${nameOf(s, id)} » ?`,
        lead: `Elle va dans la corbeille des configurations, d'où elle se restaure telle quelle.${isActive ? ' C’est la configuration active : le menu redémarre et reconnaît celle qui correspond aux écrans branchés.' : ''}`,
        sections: [],
        actions: [
          { label: 'Annuler', run: () => openConfiguration(id) },
          {
            label: 'Supprimer',
            tone: 'warning',
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
        label: `Restaurer « ${c.name} »`,
        detail: `Supprimée le ${new Date(c.deletedAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}`,
        run: () => {
          updateCabinetSet(host.loc.dataDir, (x) => restoreConfiguration(x, c.id));
          openManager();
        },
      }));
      actions.push({ label: 'Retour', run: () => openManager() });
      return { heading: 'Corbeille des configurations', lead: 'Une configuration restaurée reprend ses écrans, ses réglages et son VPinballX.ini.', sections: [], actions, back: () => openManager() };
    });
  }

  return { systemItem, openChooser, openManager };
}

/** Une ligne par écran de la configuration : rôles, et s'il est branché. */
function screenRows(c: CabinetConfiguration, score: ConfigurationScore | undefined): Row[] {
  return c.screens.map((screen) => {
    const roles = ROLES.filter((r) => c.roles[r.id] === screen.fingerprint).map((r) => r.label);
    const missing = score?.missing.some((m) => m.fingerprint === screen.fingerprint);
    return {
      text: screen.label,
      detail: `${roles.length ? roles.join(' et ') : 'sans rôle'} · ${missing ? 'introuvable' : 'branché'}`,
      tone: missing ? (roles.length ? 'warning' : 'quiet') : 'ok',
    };
  });
}
