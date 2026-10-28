// Règle du pare-feu de Windows pour le réseau des bornes. Sans elle, Windows affiche son invite
// « Autoriser l'accès » au premier démarrage du réseau, invite à laquelle personne ne peut répondre
// sur une borne en plein écran sans souris. Décidé le 28/10/2026 : l'installeur pose la
// règle, avec l'autorisation de Windows (UAC), une seule fois ; l'écran « Partage et réseau » la
// propose aussi quand elle manque (Cyber Pinball lancé depuis ses sources, déployé à la main, UAC
// refusé à l'installation). La règle vise CyberPinball.exe seul, en entrée, tous protocoles.
//
// Les mêmes commandes servent à l'installeur (scripts/installeur/cyberpinball.nsi, relu par
// firewall.test.ts) et à l'application (app/src/firewall-rule.ts). Rien n'est jamais posé sans
// une action de l'utilisateur et l'autorisation de Windows ; jamais pendant un essai.

/** Nom de la règle, le même partout : l'installeur, l'application et la désinstallation. */
export const FIREWALL_RULE = 'Cyber Pinball';

/** Arguments de netsh qui lisent la règle (sans élévation). */
export function firewallShowArgs(): string[] {
  return ['advfirewall', 'firewall', 'show', 'rule', `name=${FIREWALL_RULE}`, 'verbose'];
}

/** Arguments de netsh qui posent la règle pour cet exécutable (élevé). */
export function firewallAddArgs(exe: string): string[] {
  return ['advfirewall', 'firewall', 'add', 'rule', `name=${FIREWALL_RULE}`, 'dir=in', 'action=allow', `program=${exe}`, 'enable=yes', 'profile=any'];
}

/** Arguments de netsh qui retirent la règle (élevé) : avant de la reposer, et à la désinstallation. */
export function firewallDeleteArgs(): string[] {
  return ['advfirewall', 'firewall', 'delete', 'rule', `name=${FIREWALL_RULE}`];
}

export type FirewallState = 'allowed' | 'missing' | 'other-program' | 'unknown';

/**
 * Lecture de `netsh … show rule … verbose` : la règle existe-t-elle, et vise-t-elle bien cet
 * exécutable ? La sortie est traduite selon la langue de Windows (« Program: », « Programme : ») :
 * on n'y cherche que le chemin, quel que soit son intitulé, et le nom de la règle.
 */
export function readFirewallShow(output: string, status: number | null, exe: string): FirewallState {
  if (status === null) return 'unknown';
  const text = output.replace(/\r/g, '');
  if (!text.includes(FIREWALL_RULE)) return status === 0 ? 'unknown' : 'missing';
  const target = exe.toLowerCase();
  const programs = text.split('\n').map((line) => line.trim().toLowerCase()).filter((line) => line.endsWith('.exe'));
  if (programs.some((line) => line.endsWith(target))) return 'allowed';
  return programs.length ? 'other-program' : 'unknown';
}

/** Ligne de commande de netsh, chaque valeur entre guillemets (name="Cyber Pinball", program="C:\…"). */
export function netshCommandLine(args: readonly string[]): string {
  return args.map((a) => (a.includes('=') ? a.replace(/^([^=]+)=(.*)$/, (_m, k: string, v: string) => `${k}="${v}"`) : a)).join(' ');
}
