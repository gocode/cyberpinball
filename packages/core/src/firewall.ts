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

// ---------------------------------------------------------------------------
// VPX : fermé au réseau, pour l'inspector des parties entre amis
//
// L'état en direct des tables Stern SAM se lit par l'inspector de VPX (livestate.ts), activé pour
// une partie entre amis seulement. Il écoute sur toutes les adresses (0.0.0.0, non réglable dans
// VPX 10.8.1) : sans règle, Windows afficherait son invite « Autoriser l'accès » pour VPX, sans
// souris pour y répondre, et le réseau local pourrait lire l'état des tables. Décidé le 30/10/2026 :
// une règle qui BLOQUE l'entrée pour VPX, posée avec celle de Cyber Pinball (installeur, ou
// « Partage et réseau »), sous la même autorisation de Windows. L'invite ne paraît plus, le réseau
// local n'y entre pas ; Cyber Pinball lit l'inspector par 127.0.0.1, que le pare-feu ne filtre pas.
// Tant que la règle manque, l'inspector n'est jamais activé.
//
// Elle suit la version active de VPX : VPX est lancé par la jonction emulators\vpx\current, mais
// Windows peut nommer le processus par le dossier réel de sa version. La règle vise donc les deux
// chemins ; quand VPX change de version (nouveau dossier, jonction déplacée), le chemin réel ne
// correspond plus : la règle est à reposer, et l'inspector reste éteint d'ici là.

/** Nom de la règle de VPX, le même partout. */
export const VPX_FIREWALL_RULE = 'Cyber Pinball VPX';

/** Les programmes que vise la règle de VPX : le chemin réel de la version active, puis celui par la jonction. */
export function vpxFirewallPrograms(real: string, current: string): string[] {
  return real.toLowerCase() === current.toLowerCase() ? [real] : [real, current];
}

/** Arguments de netsh qui lisent la règle de VPX (sans élévation). */
export function vpxFirewallShowArgs(): string[] {
  return ['advfirewall', 'firewall', 'show', 'rule', `name=${VPX_FIREWALL_RULE}`, 'verbose'];
}

/** Arguments de netsh qui posent la règle de VPX pour un de ses programmes : l'entrée bloquée (élevé). */
export function vpxFirewallAddArgs(program: string): string[] {
  return ['advfirewall', 'firewall', 'add', 'rule', `name=${VPX_FIREWALL_RULE}`, 'dir=in', 'action=block', `program=${program}`, 'enable=yes', 'profile=any'];
}

/** Arguments de netsh qui retirent la règle de VPX (élevé). */
export function vpxFirewallDeleteArgs(): string[] {
  return ['advfirewall', 'firewall', 'delete', 'rule', `name=${VPX_FIREWALL_RULE}`];
}

/** closed : VPX fermé au réseau pour sa version active ; other-version : posée pour une autre version (à reposer). */
export type VpxFirewallState = 'closed' | 'missing' | 'other-version' | 'unknown';

/** Lecture de `netsh … show rule name="Cyber Pinball VPX" verbose` : chaque programme visé, bloqué en entrée. */
export function readVpxFirewallShow(output: string, status: number | null, programs: readonly string[]): VpxFirewallState {
  if (status === null || !programs.length) return 'unknown';
  const text = output.replace(/\r/g, '');
  if (!text.includes(VPX_FIREWALL_RULE)) return status === 0 ? 'unknown' : 'missing';
  const lines = text.split('\n').map((line) => line.trim().toLowerCase());
  const seen = lines.filter((line) => line.endsWith('.exe'));
  if (!seen.length) return 'unknown';
  return programs.every((p) => seen.some((line) => line.endsWith(p.toLowerCase()))) ? 'closed' : 'other-version';
}

/**
 * La commande unique, passée à cmd.exe sous une seule autorisation de Windows : la règle de Cyber
 * Pinball (s'il y a son exécutable), puis celle de VPX (s'il y a ses programmes), chacune retirée
 * puis reposée.
 */
export function firewallCommandLine(rules: { app?: string; vpx?: readonly string[] }): string {
  const parts: string[] = [];
  if (rules.app) parts.push(`netsh ${netshCommandLine(firewallDeleteArgs())} >nul 2>&1`, `netsh ${netshCommandLine(firewallAddArgs(rules.app))}`);
  if (rules.vpx?.length) parts.push(`netsh ${netshCommandLine(vpxFirewallDeleteArgs())} >nul 2>&1`, ...rules.vpx.map((p) => `netsh ${netshCommandLine(vpxFirewallAddArgs(p))}`));
  return parts.join(' & ');
}
