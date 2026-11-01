// Règle du pare-feu de Windows pour le réseau des bornes. Sans elle, Windows affiche son invite
// « Autoriser l'accès » au premier démarrage du réseau, invite à laquelle personne ne peut répondre
// sur une borne en plein écran sans souris. Décidé le 28/10/2026 : l'installeur pose la
// règle, avec l'autorisation de Windows (UAC), une seule fois ; l'écran « Partage et réseau » la
// propose aussi quand elle manque (Cyber Pinball lancé depuis ses sources, déployé à la main, UAC
// refusé à l'installation). La règle vise CyberPinball.exe seul, en entrée, tous protocoles.
//
// Les mêmes commandes servent à l'installeur (scripts/installeur/cyberpinball.nsi, relu par
// firewall.test.ts) et à l'application (app/src/firewall-rule.ts). Rien n'est jamais posé sans
// l'autorisation de Windows, donnée une fois par l'utilisateur ; jamais pendant un essai. Depuis le
// 01/11/2026, cette autorisation enregistre aussi la tâche de réparation (plus bas) : les règles
// sont ensuite vérifiées à chaque démarrage et reposées d'elles-mêmes, sans rien à valider.

import { t } from './i18n';

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

/**
 * Arguments de netsh qui retirent toute règle d'entrée sur cet exécutable, quel que soit son nom
 * (élevé) : dont celles, bloquantes, que Windows pose quand son invite reste sans réponse.
 */
export function firewallDeleteProgramArgs(exe: string): string[] {
  return ['advfirewall', 'firewall', 'delete', 'rule', 'name=all', 'dir=in', `program=${exe}`];
}

/**
 * allowed : autorisé en entrée sur tous les réseaux ; blocked : une règle bloque Cyber Pinball (celle
 * que Windows pose quand son invite « Autoriser l'accès » reste sans réponse) ; partial : autorisé
 * sur certains réseaux seulement (privé ou public) ; other-program : la règle vise un autre dossier.
 */
export type FirewallState = 'allowed' | 'missing' | 'blocked' | 'partial' | 'other-program' | 'unknown';

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
 * puis reposée. Celle de l'installeur (relue par vpx-inspector.test.ts) ; l'application passe par
 * PowerShell (firewallSetupScript, plus bas), qui pose en plus la tâche de réparation.
 */
export function firewallCommandLine(rules: { app?: string; vpx?: readonly string[] }): string {
  const parts: string[] = [];
  if (rules.app) parts.push(`netsh ${netshCommandLine(firewallDeleteArgs())} >nul 2>&1`, `netsh ${netshCommandLine(firewallDeleteProgramArgs(rules.app))} >nul 2>&1`, `netsh ${netshCommandLine(firewallAddArgs(rules.app))}`);
  if (rules.vpx?.length) parts.push(`netsh ${netshCommandLine(vpxFirewallDeleteArgs())} >nul 2>&1`, ...rules.vpx.map((p) => `netsh ${netshCommandLine(vpxFirewallAddArgs(p))}`));
  return parts.join(' & ');
}

// ---------------------------------------------------------------------------
// Lecture par programme, et réparation sans invite (01/11/2026)
//
// Constat sur une borne après la mise à jour en 0.1.5 (journal des évènements du pare-feu) : la
// règle « Cyber Pinball » posée par netsh n'existait pas, seulement quatre règles « Query User » que
// Windows avait créées lui-même pour D:\CyberPinball\app\CyberPinball.exe, chaque fois que son
// invite « Autoriser l'accès » s'était affichée. Windows les nomme d'après la description de
// l'exécutable, « Cyber Pinball » : le même nom que la nôtre. Il les pose BLOQUANTES à l'affichage
// de l'invite, et ne les passe en autorisation que si quelqu'un clique ; sur un profil de réseau
// seulement (privé ou public). La lecture par nom (netsh … show rule name="Cyber Pinball") les
// prenait pour la nôtre : « autorisé », alors qu'une règle bloquante l'emporte toujours. Et la règle
// de VPX, arrivée avec la 0.1.5, n'est posée ni par une mise à jour légère (pas d'installeur) ni par
// l'installeur en mise à jour (/MAJ : jamais d'invite) : « Partage et réseau » la demandait.
//
// D'où : la lecture se fait par programme (toute règle d'entrée qui vise l'exécutable, quel que soit
// son nom), par PowerShell, dont les valeurs ne dépendent pas de la langue de Windows ; la pose
// retire toute règle d'entrée sur l'exécutable avant de poser la sienne ; et l'autorisation de
// Windows, donnée une fois, enregistre une tâche planifiée qui refait la même pose, avec les droits
// d'administrateur, sans invite : l'application la lance au démarrage dès qu'une règle manque ou
// ne correspond plus (mise à jour, nouvelle version de VPX, invite de Windows restée sans réponse).
// La tâche ne lance que PowerShell de Windows, sur un script figé à son enregistrement (encodé dans
// ses arguments, jamais un fichier modifiable), qui ne fait que poser ces deux règles.

/** Nom de la tâche planifiée qui repose les règles sans invite. */
export const FIREWALL_REPAIR_TASK = 'Cyber Pinball pare-feu';

/** Une règle du pare-feu qui vise un programme, lue par PowerShell. */
export interface FirewallRuleInfo {
  program: string;
  name: string;
  inbound: boolean;
  allow: boolean;
  block: boolean;
  enabled: boolean;
  /** Profils couverts (domaine 1, privé 2, public 4) : 7 pour tous. */
  profiles: number;
}

export interface FirewallRead {
  rules: FirewallRuleInfo[];
  /** Règles nommées « Cyber Pinball VPX », quel que soit leur programme (other-version plutôt que missing). */
  vpxRules: number;
}

/** Chaîne PowerShell entre apostrophes. PowerShell prend aussi ‘ ’ ‚ ‛ pour des apostrophes : doublées comme elles. */
export function psQuote(value: string): string {
  return `'${value.replace(/['\u2018\u2019\u201a\u201b]/g, (q) => q + q)}'`;
}

/** Script PowerShell (sans élévation) : les règles qui visent ces programmes, en JSON, valeurs numériques de NetSecurity. */
export function firewallReadScript(programs: readonly string[]): string {
  return [
    `$t = @(${programs.map(psQuote).join(', ')})`,
    '$r = foreach ($f in (Get-NetFirewallApplicationFilter -PolicyStore ActiveStore -ErrorAction Stop)) { if ($t -contains $f.Program) { foreach ($x in ($f | Get-NetFirewallRule)) { [pscustomobject]@{ p = $f.Program; n = $x.DisplayName; d = [int]$x.Direction; a = [int]$x.Action; e = [int]$x.Enabled; f = [int]$x.Profile } } } }',
    `$v = @(Get-NetFirewallRule -DisplayName ${psQuote(VPX_FIREWALL_RULE)} -ErrorAction SilentlyContinue).Count`,
    'ConvertTo-Json -Compress -Depth 3 -InputObject @{ rules = @($r); vpx = $v }',
  ].join('\n');
}

/**
 * Lecture de la sortie de firewallReadScript. NetSecurity : Direction 1 entrée ; Action 2 autoriser,
 * 4 bloquer ; Enabled 1 oui ; Profile 0 tous, sinon domaine 1 | privé 2 | public 4.
 */
export function readFirewallRules(output: string, status: number | null): FirewallRead | undefined {
  if (status !== 0) return undefined;
  try {
    const data = JSON.parse(output.trim()) as { rules?: unknown; vpx?: unknown };
    const list: unknown[] = Array.isArray(data.rules) ? data.rules : data.rules ? [data.rules] : [];
    const rules = list.flatMap((item): FirewallRuleInfo[] => {
      const r = item as { p?: unknown; n?: unknown; d?: unknown; a?: unknown; e?: unknown; f?: unknown } | null;
      if (typeof r?.p !== 'string') return [];
      return [{ program: r.p, name: String(r.n ?? ''), inbound: r.d === 1, allow: r.a === 2, block: r.a === 4, enabled: r.e === 1, profiles: r.f === 0 ? 7 : Number(r.f) & 7 }];
    });
    return { rules, vpxRules: typeof data.vpx === 'number' ? data.vpx : 0 };
  } catch {
    return undefined;
  }
}

const sameProgram = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** L'état de Cyber Pinball d'après ses règles d'entrée : une règle bloquante l'emporte, l'autorisation doit couvrir tous les réseaux. */
export function appFirewallState(read: FirewallRead, exe: string): FirewallState {
  const mine = read.rules.filter((r) => r.inbound && r.enabled && sameProgram(r.program, exe));
  if (mine.some((r) => r.block)) return 'blocked';
  const allowed = mine.filter((r) => r.allow).reduce((p, r) => p | r.profiles, 0);
  if (allowed === 7) return 'allowed';
  return allowed ? 'partial' : 'missing';
}

/** L'état de VPX : chacun de ses programmes bloqué en entrée sur tous les réseaux. */
export function vpxFirewallState(read: FirewallRead, programs: readonly string[]): VpxFirewallState {
  if (!programs.length) return 'unknown';
  const closed = programs.every((p) => read.rules.filter((r) => r.inbound && r.enabled && r.block && sameProgram(r.program, p)).reduce((f, r) => f | r.profiles, 0) === 7);
  if (closed) return 'closed';
  return read.vpxRules > 0 ? 'other-version' : 'missing';
}

/** Une règle à reposer, et pourquoi (à l'écran et au journal). */
export interface FirewallProblem {
  rule: 'app' | 'vpx';
  state: FirewallState | VpxFirewallState;
  reason: string;
}

/** Ce qui est à reposer ; unknown n'en fait pas partie (illisible : rien à réparer à l'aveugle). */
export function firewallProblems(app: FirewallState | undefined, vpx: VpxFirewallState | undefined): FirewallProblem[] {
  const out: FirewallProblem[] = [];
  const appReason: Partial<Record<FirewallState, string>> = {
    missing: t('Aucune règle n’autorise Cyber Pinball : Windows bloque les bornes qui vous appellent'),
    blocked: t('Une règle de Windows bloque Cyber Pinball : son invite « Autoriser l’accès » est restée sans réponse'),
    partial: t('Cyber Pinball n’est autorisé que sur certains réseaux (privé ou public)'),
    'other-program': t('La règle vise un autre emplacement de Cyber Pinball'),
  };
  const vpxReason: Partial<Record<VpxFirewallState, string>> = {
    missing: t('VPX n’est pas encore fermé au réseau'),
    'other-version': t('VPX a changé de version : sa règle est à reposer'),
  };
  const a = app && appReason[app];
  const v = vpx && vpxReason[vpx];
  if (app && a) out.push({ rule: 'app', state: app, reason: a });
  if (vpx && v) out.push({ rule: 'vpx', state: vpx, reason: v });
  return out;
}

/** Le réseau des bornes est-il gêné par le pare-feu (la présence des amis le dit, au lieu de « hors ligne ») ? */
export function firewallBlocksNetwork(app: FirewallState | undefined): boolean {
  return app === 'blocked' || app === 'missing' || app === 'partial' || app === 'other-program';
}

/** Ligne du journal : l'état de chaque règle, au démarrage ou après une mise à jour. */
export function firewallLogLine(moment: string, app: FirewallState | undefined, vpx: VpxFirewallState | undefined, task: boolean | undefined): string {
  const taskText = task === undefined ? 'illisible' : task ? 'prête' : 'pas encore autorisée'; // i18n-ignore : journal
  return `Pare-feu (${moment}) : Cyber Pinball ${app ?? 'pas lu'}, VPX ${vpx ?? 'pas installé'}, réparation automatique ${taskText}.`; // i18n-ignore : journal
}

/**
 * Le script de pose (PowerShell, élevé) : toute règle d'entrée sur l'exécutable retirée (dont celles
 * de l'invite de Windows), celle de Cyber Pinball posée pour tous les réseaux ; puis, si VPX est là,
 * l'entrée bloquée pour chacun de ses exécutables, dans chaque dossier de version et par la jonction
 * current : une nouvelle version de VPX se ferme à la prochaine réparation, sans rien redemander.
 */
export function firewallRepairScript(o: { exe: string; vpxDir?: string }): string {
  return [
    `$exe = ${psQuote(o.exe)}`,
    `$vpx = ${psQuote(o.vpxDir ?? '')}`,
    `Get-NetFirewallRule -DisplayName ${psQuote(FIREWALL_RULE)} -ErrorAction SilentlyContinue | Remove-NetFirewallRule`,
    "Get-NetFirewallApplicationFilter | Where-Object { $_.Program -ieq $exe } | Get-NetFirewallRule | Where-Object { $_.Direction -eq 'Inbound' } | Remove-NetFirewallRule",
    `New-NetFirewallRule -DisplayName ${psQuote(FIREWALL_RULE)} -Direction Inbound -Action Allow -Program $exe -Profile Any -Enabled True | Out-Null`,
    'if ($vpx -and (Test-Path -LiteralPath $vpx)) {',
    `  Get-NetFirewallRule -DisplayName ${psQuote(VPX_FIREWALL_RULE)} -ErrorAction SilentlyContinue | Remove-NetFirewallRule`,
    "  foreach ($d in Get-ChildItem -LiteralPath $vpx -Directory -ErrorAction SilentlyContinue) { foreach ($f in Get-ChildItem -LiteralPath $d.FullName -Filter 'VPinballX*.exe' -File -ErrorAction SilentlyContinue) {",
    `    New-NetFirewallRule -DisplayName ${psQuote(VPX_FIREWALL_RULE)} -Direction Inbound -Action Block -Program $f.FullName -Profile Any -Enabled True | Out-Null`,
    '  } }',
    '}',
  ].join('\n');
}

/** Arguments de PowerShell pour un script passé encodé (UTF-16, base 64) : aucun guillemet à échapper. */
export function powershellEncodedArgs(script: string): string[] {
  return ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];
}

/**
 * Le script lancé sous l'autorisation de Windows : la pose, puis l'enregistrement de la tâche de
 * réparation (elle refait la même pose, encodée dans ses arguments). La tâche n'a aucun déclencheur :
 * seule l'application la lance. S4U : elle tourne hors de la session, sans fenêtre, avec les droits
 * d'administrateur de l'utilisateur qui l'a autorisée.
 */
export function firewallSetupScript(o: { exe: string; vpxDir?: string }): string {
  const repair = firewallRepairScript(o);
  return [
    repair,
    "$ps = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'",
    `$a = New-ScheduledTaskAction -Execute $ps -Argument ${psQuote(powershellEncodedArgs(repair).join(' '))}`,
    '$p = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType S4U -RunLevel Highest', // i18n-ignore : script PowerShell
    '$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew',
    `Register-ScheduledTask -TaskName ${psQuote(FIREWALL_REPAIR_TASK)} -Description ${psQuote('Cyber Pinball : repose ses règles du pare-feu de Windows (réseau des bornes, VPX fermé au réseau) quand l’application en trouve une qui manque.')} -Action $a -Principal $p -Settings $s -Force | Out-Null`, // i18n-ignore : script PowerShell, description de la tâche
  ].join('\n');
}

/** Arguments de schtasks : la tâche existe-t-elle (sans élévation) ? */
export function repairTaskQueryArgs(): string[] {
  return ['/query', '/tn', FIREWALL_REPAIR_TASK];
}

/** Arguments de schtasks : lancer la réparation (sans élévation, sans invite). */
export function repairTaskRunArgs(): string[] {
  return ['/run', '/tn', FIREWALL_REPAIR_TASK];
}

/** Arguments de schtasks : retirer la tâche (élevé : désinstallation). */
export function repairTaskDeleteArgs(): string[] {
  return ['/delete', '/tn', FIREWALL_REPAIR_TASK, '/f'];
}
