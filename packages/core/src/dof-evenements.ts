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

import { scriptCode } from './vbscript';

export const DOF_TAP_ENV = 'CYBERPINBALL_DOF_TAP';
/** Repère des lignes ajoutées à controller.vbs : leur présence dit qu'il est déjà retouché. */
export const DOF_TAP_MARK = "' CyberPinball-dof-tap";
const TAP_SUB = 'CyberPinball_DofTap';
/**
 * Écoute posée dans le script d'une table qui définit sa propre `Sub DOF` (copie de controller.vbs collée dans le
 * script, comme Stranger Things) : ses appels DOF n'atteignent jamais la Sub DOF de controller.vbs. Nom distinct de
 * celui de controller.vbs, pour qu'une table qui charge aussi controller.vbs n'ait pas deux Sub du même nom.
 */
export const DOF_TAP_TABLE_SUB = 'CyberPinball_DofTapTable';

/** La Sub qui écrit « E,numéro,état,secondes » (Timer : secondes depuis minuit), et ses deux variables globales. */
function tapSubLines(name: string): string[] {
  return [
    `Dim ${name}File, ${name}Ready`,
    `Sub ${name}(n, s)`,
    '\tOn Error Resume Next',
    `\tIf ${name}Ready = "" Then`,
    `\t\t${name}Ready = "no"`,
    '\t\tDim p : p = CreateObject("WScript." & "Shell").Environment("Process").Item("' + DOF_TAP_ENV + '")',
    `\t\tIf p <> "" Then Set ${name}File = CreateObject("Scripting.FileSystemObject").OpenTextFile(p, 8, True) : If Err.Number = 0 Then ${name}Ready = "yes"`,
    '\tEnd If',
    `\tIf ${name}Ready = "yes" Then ${name}File.WriteLine "E," & CLng(n) & "," & CLng(s) & "," & Replace(CStr(Round(Timer, 3)), ",", ".")`,
    'End Sub',
  ];
}

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
  const body = [DOF_TAP_MARK + ': copy of the DOF events for Cyber Pinball (variable ' + DOF_TAP_ENV + ')', ...tapSubLines(TAP_SUB)];
  const out = lines.join(eol);
  return out + (/\r?\n$/.test(out) ? '' : eol) + body.join(eol) + eol;
}

/** En-tête d'une `Sub DOF(événement, état)` ou `Sub DOFALT(…)` : groupe 1 l'en-tête entier, 2 et 3 les paramètres. */
const OWN_DOF_SUB = /^(\s*(?:(?:public|private)\s+)?sub\s+(?:DOF|DOFALT)\s*\(\s*(?:by(?:val|ref)\s+)?(\w+)\s*,\s*(?:by(?:val|ref)\s+)?(\w+)\s*\))/i;
/** Un appel DOF du script : `DOF 101, DOFOn`, `DOF(101, 2)`, `DOFALT …`, `SoundFXDOF(…)` ; jamais la déclaration d'une Sub. */
const DOF_CALL = /(?:^|[^\w.])(?:(?:DOF|DOFALT)(?!\w)\s*\(?\s*[\w.]+\s*,|SoundFXDOF\s*\()/i;
const CONTROLLER_LOAD = /\(\s*"controller\.vbs"\s*\)/i;

/** Les `Sub DOF` / `Sub DOFALT` que le script définit lui-même (hors classes), avec l'écoute déjà branchée ou non. */
export function ownDofSubs(code: string): { line: number; tapped: boolean }[] {
  const found: { line: number; tapped: boolean }[] = [];
  let inClass = false;
  code.split('\n').forEach((line, i) => {
    if (/^\s*(?:(?:public|private)\s+)?class\s+\w/i.test(line)) inClass = true;
    else if (/^\s*end\s+class\b/i.test(line)) inClass = false;
    else if (!inClass && OWN_DOF_SUB.test(line)) found.push({ line: i, tapped: line.toLowerCase().includes(DOF_TAP_TABLE_SUB.toLowerCase()) });
  });
  return found;
}

/** Nombre de lignes de code qui appellent DOF (déclarations des Sub exclues). */
export function dofCallLines(code: string): number {
  // Seul l'en-tête « Sub DOF(e, s) » est écarté : « Sub Flipper_Hit : DOF 101, 2 : End Sub » est un appel.
  return code.split('\n').filter((l) => DOF_CALL.test(l.replace(OWN_DOF_SUB, ''))).length;
}

const DOF_EVENT = /(?:^|[^\w.])(?:DOF|DOFALT)(?!\w)\s*\(?\s*([\w.]+)\s*,|SoundFXDOF\s*\([^,()]*(?:\([^()]*\)[^,()]*)*,\s*([\w.]+)/gi;
const CONST_NUMBER = /\bconst\s+(\w+)\s*=\s*(\d+)\b/gi;

/**
 * Événements DOF que le script envoie (`DOF 101, …`, `DOFALT`, `SoundFXDOF(son, 101, …)`) et combien de fois
 * chacun est appelé ; les numéros donnés par une constante (`Const dLeftFlipper = 101`) comptent aussi. Un
 * numéro passé par une variable (la Sub DOF elle-même, une boucle) ne se lit pas : il n'est pas compté.
 */
export function dofScriptEvents(code: string): Map<number, number> {
  const consts = new Map<string, number>();
  for (const m of code.matchAll(CONST_NUMBER)) consts.set(m[1]!.toLowerCase(), Number(m[2]));
  const events = new Map<number, number>();
  for (const line of code.split('\n')) {
    for (const m of line.replace(OWN_DOF_SUB, '').matchAll(DOF_EVENT)) {
      const raw = (m[1] ?? m[2])!;
      const n = /^\d+$/.test(raw) ? Number(raw) : consts.get(raw.toLowerCase());
      if (n !== undefined && n > 0) events.set(n, (events.get(n) ?? 0) + 1);
    }
  }
  return events;
}

/**
 * Le script avec l'écoute branchée en tête de chacune de ses propres `Sub DOF` / `Sub DOFALT`, sur la même ligne
 * (« Sub DOF(e, s) : CyberPinball_DofTapTable e, s ») : aucune ligne ne bouge, les erreurs de script gardent leurs
 * numéros. La Sub d'écoute est ajoutée à la fin. Inerte sans CYBERPINBALL_DOF_TAP, comme celle de controller.vbs, et
 * appelée avant tout test de la table (B2SOn) : elle reçoit l'état 2 (impulsion) tel que le script l'envoie.
 * undefined si le script n'a pas de Sub DOF à lui.
 */
export function addTableDofTap(text: string): string | undefined {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const subs = ownDofSubs(scriptCode(text));
  if (!subs.length) return undefined;
  for (const { line, tapped } of subs) {
    if (tapped) continue;
    const m = OWN_DOF_SUB.exec(lines[line]!);
    if (!m) return undefined;
    lines[line] = `${m[1]} : ${DOF_TAP_TABLE_SUB} ${m[2]}, ${m[3]}${lines[line]!.slice(m[1]!.length)}`;
  }
  let out = lines.join(eol);
  if (new RegExp(`^\\s*sub\\s+${DOF_TAP_TABLE_SUB}\\b`, 'im').test(out)) return out;
  if (out && !/\r?\n$/.test(out)) out += eol;
  return out + [DOF_TAP_MARK + ': copy of the DOF events of the table for Cyber Pinball (variable ' + DOF_TAP_ENV + ')', ...tapSubLines(DOF_TAP_TABLE_SUB)].join(eol) + eol;
}

/**
 * Par où passent les appels DOF du script : 'table', ses propres Sub DOF, toutes écoutées ; 'controller', la Sub DOF
 * de controller.vbs, que le script charge (écoutée par addDofTap) ; 'missed', des appels qui n'atteignent aucune
 * écoute (Sub DOF du script pas encore retouchée, ou Sub DOF venue d'ailleurs) ; 'none', aucun appel DOF.
 */
export function dofTapReach(text: string): 'table' | 'controller' | 'missed' | 'none' {
  const code = scriptCode(text);
  if (!dofCallLines(code)) return 'none';
  const own = ownDofSubs(code);
  if (own.length) return own.every((s) => s.tapped) ? 'table' : 'missed';
  return CONTROLLER_LOAD.test(code) ? 'controller' : 'missed';
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
  /** false : pas d'effets de repli écrits pour les ROM dont la config DOF n'a presque rien sur les bandes (dof-repli.ts). Absent : allumé. */
  romFallback?: boolean;
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
