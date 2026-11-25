// Effets LED pour une table sans configuration DOF : écoute des événements `DOF n, état` du script.
//
// Constat : le plugin DOF de VPX ne démarre que pour une
// ROM PinMAME, et libdof ne joue que les ROM nommées dans les ini du configtool. Mais TOUT appel DOF d'un
// script de table (DOF, DOFALT, SoundFXDOF) passe par `Sub DOF` / `Sub DOFALT` de scripts/controller.vbs,
// avec des numéros d'événement communs à toutes les tables (101 flipper gauche, 102 flipper droit…).
// Une ligne ajoutée à ces deux Sub recopie l'événement dans un fichier que Cyber Pinball lit ; un profil
// d'effets générique en tire des ordres pour le pilote LED. Une seule retouche (controller.vbs), au lieu
// d'un .vbs par table.
//
// Sécurité : la ligne ne fait rien tant que la variable d'environnement CYBERPINBALL_DOF_TAP n'est pas
// posée (un autre front-end, un VPX lancé à la main : aucun effet), s'exécute avant le test « If B2SOn »
// (elle marche donc aussi sans B2S), ne lève jamais d'erreur (On Error Resume Next) et ne fait qu'ajouter
// une ligne à un fichier.

export const DOF_TAP_ENV = 'CYBERPINBALL_DOF_TAP';
/** Repère des lignes ajoutées à controller.vbs : leur présence dit qu'il est déjà retouché. */
export const DOF_TAP_MARK = "' CyberPinball-dof-tap";
const TAP_SUB = 'CyberPinball_DofTap';

/**
 * controller.vbs avec l'écoute : un appel en tête de `Sub DOF` et de `Sub DOFALT`, et la Sub qui écrit
 * « E,numéro,état,secondes » (Timer : secondes depuis minuit) ajoutée à la fin. Idempotent. undefined si
 * `Sub DOF` n'est plus là (un autre controller.vbs : on n'y touche pas).
 */
export function addDofTap(text: string): string | undefined {
  if (text.includes(DOF_TAP_MARK)) return text;
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  let found = 0;
  const lines = text.split(/\r?\n/).flatMap((line) => {
    const head = /^\s*(?:Public\s+)?Sub\s+(DOF|DOFALT)\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*$/i.exec(line);
    if (!head) return [line];
    found++;
    return [line, ['\tOn Error Resume Next', ': ' + TAP_SUB + ' ' + head[2] + ', ' + head[3], ': On Error Goto 0', DOF_TAP_MARK].join(' ')];
  });
  if (!found || !lines.some((l) => /^\s*(?:Public\s+)?Sub\s+DOF\s*\(/i.test(l))) return undefined;
  const body = [
    DOF_TAP_MARK + ': copy of the DOF events for Cyber Pinball (variable ' + DOF_TAP_ENV + ')',
    'Dim CyberPinball_DofTapFile, CyberPinball_DofTapReady',
    `Sub ${TAP_SUB}(n, s)`,
    '\tOn Error Resume Next',
    '\tIf CyberPinball_DofTapReady = "" Then',
    '\t\tCyberPinball_DofTapReady = "no"',
    '\t\tDim p : p = CreateObject("WScript." & "Shell").Environment("Process").Item("' + DOF_TAP_ENV + '")',
    '\t\tIf p <> "" Then Set CyberPinball_DofTapFile = CreateObject("Scripting.FileSystemObject").OpenTextFile(p, 8, True) : If Err.Number = 0 Then CyberPinball_DofTapReady = "yes"',
    '\tEnd If',
    '\tIf CyberPinball_DofTapReady = "yes" Then CyberPinball_DofTapFile.WriteLine "E," & CLng(n) & "," & CLng(s) & "," & Replace(CStr(Round(Timer, 3)), ",", ".")',
    'End Sub',
  ];
  const out = lines.join(eol);
  return out + (/\r?\n$/.test(out) ? '' : eol) + body.join(eol) + eol;
}

/** controller.vbs d'origine : les lignes de l'écoute retirées. */
export function removeDofTap(text: string): string {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`${DOF_TAP_MARK}:`));
  const kept = (start < 0 ? lines : lines.slice(0, start)).filter((l) => !l.endsWith(DOF_TAP_MARK));
  while (kept.length && kept[kept.length - 1] === '') kept.pop();
  return kept.join(eol) + eol;
}

export interface DofEvent {
  /** Numéro d'événement DOF (E101…). */
  number: number;
  /** 0 éteint, 1 allumé (2, impulsion, est déjà cassé en 1 puis 0 par controller.vbs). */
  state: number;
  /** Secondes depuis minuit, d'après Timer de VBS. */
  at: number;
}

/** Une ligne du fichier ; undefined si elle est incomplète (ligne coupée en cours d'écriture) ou étrangère. */
export function parseTapLine(line: string): DofEvent | undefined {
  const m = /^E,(\d{1,5}),(-?\d{1,3}),(\d+(?:\.\d+)?)$/.exec(line.trim());
  return m ? { number: Number(m[1]), state: Number(m[2]), at: Number(m[3]) } : undefined;
}

/** Les événements d'un morceau de fichier ; `rest` : fin sans saut de ligne, à rejoindre au morceau suivant. */
export function parseTapChunk(chunk: string): { events: DofEvent[]; rest: string } {
  const cut = chunk.lastIndexOf('\n');
  const complete = cut < 0 ? '' : chunk.slice(0, cut);
  const events = complete.split(/\r?\n/).flatMap((l) => {
    const e = parseTapLine(l);
    return e ? [e] : [];
  });
  return { events, rest: cut < 0 ? chunk : chunk.slice(cut + 1) };
}

export type DofZone = 'left' | 'right' | 'center' | 'all';

/** Ordre pour le pilote LED : ce que le profil demande, sans rien savoir du contrôleur. */
export interface DofEffect {
  zone: DofZone;
  /** Couleur #rrggbb, déjà à l'intensité réglée. */
  color: string;
  /** Durée en ms ; 0 : tant que l'événement dure (flipper tenu), éteint à l'état 0. */
  durationMs: number;
  /** 'hold' suit l'état ; 'pulse' dure durationMs. */
  mode: 'hold' | 'pulse';
}

export interface DofEventSettings {
  /** Interrupteur général. */
  enabled: boolean;
  /** 0 à 100 %. */
  intensity: number;
  /** false : les tables originales n'ont pas leurs effets DOF par le relais (app/src/dof-relais.ts). Absent : allumé. */
  originals?: boolean;
}

export const DOF_EVENT_DEFAULTS: DofEventSettings = { enabled: false, intensity: 70 };

interface Standard {
  zone: DofZone;
  color: [number, number, number];
  mode: 'hold' | 'pulse';
  durationMs: number;
}

/**
 * Événements communs à toutes les tables qui parlent DOF (liste du configtool de VPUniverse : 101 et 102
 * flippers, 103 et 104 slingshots). Les autres numéros (bumpers, bille, jackpot…) varient d'une table à
 * l'autre ou n'ont pas été vérifiés ici : ils s'ajoutent à cette liste après lecture d'un ini réel.
 */
export const DOF_STANDARD_EVENTS: Readonly<Record<number, Standard>> = {
  101: { zone: 'left', color: [0, 120, 255], mode: 'hold', durationMs: 0 },
  102: { zone: 'right', color: [0, 120, 255], mode: 'hold', durationMs: 0 },
  103: { zone: 'left', color: [255, 60, 0], mode: 'pulse', durationMs: 120 },
  104: { zone: 'right', color: [255, 60, 0], mode: 'pulse', durationMs: 120 },
};

function hex(rgb: [number, number, number], intensity: number): string {
  const k = Math.max(0, Math.min(100, intensity)) / 100;
  return `#${rgb.map((c) => Math.round(c * k).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * L'effet d'un événement, ou undefined (profil coupé, numéro inconnu, flipper relâché : le mode « hold »
 * s'éteint à l'état 0, que le pilote gère avec l'ordre d'origine). Une impulsion ne joue qu'à l'état 1.
 */
export function effectFor(event: Pick<DofEvent, 'number' | 'state'>, settings: DofEventSettings): DofEffect | undefined {
  if (!settings.enabled || settings.intensity <= 0) return undefined;
  const std = DOF_STANDARD_EVENTS[event.number];
  if (!std || event.state < 1) return undefined;
  return { zone: std.zone, color: hex(std.color, settings.intensity), durationMs: std.durationMs, mode: std.mode };
}

/** La zone à éteindre quand un événement « hold » (flipper) est relâché (état 0) ; undefined pour tout autre cas. */
export function releaseFor(event: Pick<DofEvent, 'number' | 'state'>, settings: DofEventSettings): DofZone | undefined {
  const std = DOF_STANDARD_EVENTS[event.number];
  return settings.enabled && std?.mode === 'hold' && event.state < 1 ? std.zone : undefined;
}
