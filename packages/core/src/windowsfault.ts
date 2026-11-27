// Le module fautif d'un plantage de VPX, lu dans l'événement « Application Error » (1000) que Windows
// écrit au journal Application quand un programme s'arrête brutalement.
//
// Rapports du 27/11/2026 (The Avengers Pro, PuP-Pack avs_170) : VPX s'arrêtait en 0xC0000409 sans
// écrire de crash.txt (un arrêt d'urgence du runtime C++ ne passe pas par son gestionnaire de
// plantage), et le rapport ne disait pas quel module était en faute. Windows, lui, le note : ici
// plugin-pup64.dll, décalage 0x7c4f5. Ce module lit les champs de l'événement par leur position, pas
// son texte, qui change avec la langue de Windows.

/** Ce que Windows a noté de l'arrêt d'un programme (événement 1000, « Application Error »). */
export interface WindowsFault {
  /** Programme arrêté, par exemple VPinballX_BGFX64.exe. */
  app: string;
  /** Module où l'arrêt a eu lieu, par exemple plugin-pup64.dll. */
  module: string;
  moduleVersion?: string;
  /** Horodatage du module (son en-tête PE), qui distingue deux compilations du même nom. */
  moduleStamp?: string;
  /** Code d'exception, 0xc0000409. */
  code?: string;
  /** Décalage dans le module, 0x000000000007c4f5. */
  offset?: string;
  /** Chemin complet du module, quand Windows le donne. */
  modulePath?: string;
}

/** Séparateur des champs que la commande PowerShell de faultQueryScript écrit, un événement par ligne. */
export const FAULT_FIELD_SEPARATOR = '\t';

/**
 * Script PowerShell qui écrit, un par ligne, les événements 1000 depuis `since` (ms) : leurs champs
 * séparés par une tabulation, dans l'ordre de l'événement (programme, version, horodatage, module,
 * version, horodatage, code, décalage, pid, début, chemin du programme, chemin du module, rapport).
 */
export function faultQueryScript(since: number): string {
  const start = new Date(since - 2000).toISOString();
  return [
    `$s=[datetime]::Parse('${start}').ToLocalTime();`,
    `Get-WinEvent -FilterHashtable @{LogName='Application';ProviderName='Application Error';Id=1000;StartTime=$s} -ErrorAction SilentlyContinue |`,
    `ForEach-Object { ($_.Properties | ForEach-Object { [string]$_.Value }) -join "\`t" }`,
  ].join(' ');
}

/**
 * Lit la sortie de faultQueryScript et rend l'arrêt du programme `exe` (nom de fichier, casse
 * ignorée) le plus récent ; undefined si Windows n'a rien noté pour lui.
 */
export function parseWindowsFault(output: string, exe: string): WindowsFault | undefined {
  const want = basename(exe).toLowerCase();
  for (const line of output.split(/\r?\n/)) {
    const f = line.split(FAULT_FIELD_SEPARATOR).map((x) => x.trim());
    if (f.length < 8 || !f[0] || !f[3]) continue;
    if (want && f[0].toLowerCase() !== want) continue;
    // Get-WinEvent rend le plus récent d'abord.
    return {
      app: f[0],
      module: f[3],
      ...(f[4] && { moduleVersion: f[4] }),
      ...(f[5] && { moduleStamp: hex(f[5]) }),
      ...(f[6] && { code: hex(f[6]) }),
      ...(f[7] && { offset: hex(f[7]) }),
      ...(f[11] && { modulePath: f[11].replace(/^\\\\\?\\/, '') }),
    };
  }
  return undefined;
}

/** « plugin-pup64.dll (0.0.0.0, 0x6b09ec6a), 0xc0000409 au décalage 0x7c4f5 » : la ligne du journal et du rapport. */
export function describeWindowsFault(fault: WindowsFault): string {
  const id = [fault.moduleVersion, fault.moduleStamp].filter(Boolean).join(', ');
  const offset = fault.offset ? fault.offset.replace(/^0x0+(?=[0-9a-f])/i, '0x') : undefined;
  return `${fault.module}${id ? ` (${id})` : ''}${fault.code ? `, ${fault.code}` : ''}${offset ? ` au décalage ${offset}` : ''}`; // i18n-ignore : journal et rapport
}

/** Le module fautif est-il le plugin PUP de VPX (plugin-pup64.dll, plugin-pup.dll) ? */
export function isPupPluginModule(module: string | undefined): boolean {
  return Boolean(module && /^plugin-pup(64)?\.dll$/i.test(basename(module)));
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/**
 * Windows écrit l'horodatage, le code et le décalage en hexadécimal sans « 0x » (c0000409,
 * 000000000007c4f5, relevé le 27/11/2026) : rendus en 0x… minuscule, « 0x » déjà là gardé.
 */
function hex(value: string): string {
  const digits = value.replace(/^0x/i, '');
  return /^[0-9a-f]+$/i.test(digits) ? `0x${digits.toLowerCase()}` : value;
}
