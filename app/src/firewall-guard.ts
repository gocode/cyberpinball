// Vérification des règles du pare-feu à chaque démarrage, et juste après une mise à jour (complète
// ou légère : la relance qui suit) — décidé le 01/11/2026, après une mise à jour qui avait laissé
// le réseau des bornes bloqué. Chaque règle est lue (firewall-rule.ts) et son état écrit au
// journal ; si l'une manque ou ne correspond plus, la tâche de réparation la repose d'elle-même,
// sans invite. Sans tâche (jamais autorisée sur ce poste), ou si la réparation n'a pas suffi, la
// raison reste à l'écran : « Partage et réseau », la présence des amis, et, juste après une mise à
// jour, l'écran « Pare-feu de Windows » ouvert d'office, qui demande l'autorisation de Windows une
// seule fois (elle enregistre la tâche : plus rien à valider ensuite).

import { firewallLogLine, firewallProblems, type FirewallProblem, type FirewallState, type VpxFirewallState } from '@cyberpinball/core';
import type { FirewallRule } from './firewall-rule';

export interface FirewallGuardReport {
  app: FirewallState;
  vpx: VpxFirewallState | undefined;
  task: boolean | undefined;
  /** La tâche de réparation a été lancée, et a-t-elle tout reposé ? */
  repaired?: boolean;
  /** Ce qui reste à reposer après la réparation (vide : tout est en ordre). */
  problems: FirewallProblem[];
}

/** `update` : la version d'avant, quand ce démarrage suit une mise à jour. */
export async function guardFirewall(rule: FirewallRule, opts: { update?: { from: string; to: string }; log: (line: string) => void }): Promise<FirewallGuardReport> {
  const moment = opts.update ? `après la mise à jour ${opts.update.from} → ${opts.update.to}` : 'démarrage'; // i18n-ignore : journal
  const app = await rule.check();
  opts.log(firewallLogLine(moment, app, rule.vpxState(), rule.taskState()));
  for (const p of firewallProblems(app, rule.vpxState())) opts.log(`Pare-feu : à reposer (${p.rule === 'app' ? 'Cyber Pinball' : 'VPX'}, ${p.state}) : ${p.reason}.`); // i18n-ignore : journal
  if (!firewallProblems(app, rule.vpxState()).length) return { app, vpx: rule.vpxState(), task: rule.taskState(), problems: [] };
  if (!rule.taskState()) {
    opts.log('Pare-feu : pas de réparation automatique sur ce poste ; « Autoriser dans le pare-feu de Windows » la pose (une seule autorisation de Windows).'); // i18n-ignore : journal
    return { app, vpx: rule.vpxState(), task: rule.taskState(), problems: firewallProblems(app, rule.vpxState()) };
  }
  opts.log('Pare-feu : réparation automatique lancée (sans invite).'); // i18n-ignore : journal
  const repaired = await rule.repair();
  const after = rule.state() ?? app;
  opts.log(firewallLogLine(`${moment}, après la réparation`, after, rule.vpxState(), rule.taskState())); // i18n-ignore : journal
  return { app: after, vpx: rule.vpxState(), task: rule.taskState(), repaired, problems: firewallProblems(after, rule.vpxState()) };
}
