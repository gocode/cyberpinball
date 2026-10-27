// Orientation des écrans pendant une session de Cyber Pinball.
//
// Signalement du 27/10/2026 : en quittant Cyber Pinball, le bureau et le menu Démarrer de l'écran
// du playfield restaient à l'envers. L'assistant tournait l'écran dans Windows pour VPX
// (vpxOrientationFix) avec CDS_UPDATEREGISTRY, et l'y laissait : le réglage de Windows était
// changé pour de bon, bureau compris, et rien ne le rendait à la sortie.
//
// Désormais :
// 1. le réglage de Windows ne change pas : un écran n'est tourné que pour la session (changement
//    dynamique, rien d'écrit), d'après l'orientation de jeu du modèle (playfield.windowsRotation) ;
// 2. avant la première rotation, l'orientation d'origine de l'écran est notée dans un fichier
//    (ORIENTATION_FILE), qui survit à un plantage ;
// 3. chaque sortie la rend (quitter, fermer, mise à jour, borne dédiée) et le mode bureau aussi,
//    le temps qu'il dure ; une relance (menu ↔ assistant, Shell Launcher) passe la main au
//    processus suivant, qui reprend le fichier ;
// 4. au démarrage, un fichier resté là (plantage, arrêt forcé) est repris : un écran encore dans
//    l'orientation que Cyber Pinball lui avait donnée retrouve son origine ; un écran tourné depuis
//    par l'utilisateur garde la sienne, qui devient l'origine.
//
// Le tout sans Electron ni Windows : les écrans et la rotation sont fournis (app/src/display-orientation.ts
// pour les vrais, des écrans simulés dans les tests et les démonstrations).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fingerprintOf } from './fingerprint';
import { t } from './i18n';
import { edgeAfterRotation, rotatedDisplay, rotationDelta } from './layout';
import type { Cabinet, ObservedDisplay, Rotation } from './model';
import { vpxOrientationFix } from './vpx';

/** Fichier des orientations d'origine, dans le dossier des données. */
export const ORIENTATION_FILE = 'orientation-ecrans.json';

/** Un écran tel que la session le voit : son nom pour Windows, son empreinte, son orientation actuelle. */
export interface SessionScreen {
  /** Nom GDI (« \\.\DISPLAY13 ») : c'est lui que Windows tourne. Il peut changer d'un démarrage à l'autre. */
  gdiName: string;
  /** Empreinte (fingerprintOf) : elle, ne change pas. */
  fingerprint: string;
  label: string;
  rotation: Rotation;
}

/** Écran tourné par Cyber Pinball, noté avant d'y toucher. */
export interface RecordedOrientation {
  fingerprint: string;
  gdiName: string;
  label: string;
  /** Orientation que Windows avait avant Cyber Pinball : celle du bureau, rendue à la sortie. */
  origin: Rotation;
  /** Orientation que Cyber Pinball lui a donnée. */
  applied: Rotation;
  since: string;
}

export interface OrientationRecordFile {
  version: 1;
  screens: RecordedOrientation[];
  /** Ce que la dernière sortie n'a pas pu rendre : dit au démarrage suivant. */
  problems?: string[];
}

export interface WantedOrientation {
  fingerprint: string;
  rotation: Rotation;
}

export interface OrientationTurn {
  label: string;
  from: Rotation;
  to: Rotation;
}

export interface OrientationReport {
  turned: OrientationTurn[];
  /** Ce qui n'a pas pu se faire, expliqué : à afficher (bandeau) ou à noter (journal). */
  problems: string[];
}

export interface SessionOrientationOptions {
  /** Fichier des orientations d'origine (dataDir/ORIENTATION_FILE). */
  file: string;
  /** Écrans branchés, avec leur orientation du moment. */
  screens(): SessionScreen[];
  /**
   * Tourne un écran ; lève une erreur qui dit pourquoi en cas d'échec. `persist` : le réglage de
   * Windows aussi (seulement pour lui rendre une orientation qu'une version précédente avait changée).
   */
  rotate(gdiName: string, rotation: Rotation, persist: boolean): void;
  now?(): Date;
}

type State = 'idle' | 'active' | 'suspended' | 'ended' | 'handedOver';

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

function isRotation(value: unknown): value is Rotation {
  return ROTATIONS.includes(value as Rotation);
}

/** Lit le fichier des orientations d'origine ; absent ou illisible : rien de noté. */
export function readOrientationRecord(file: string): RecordedOrientation[] {
  return readOrientationFile(file).screens;
}

function readOrientationFile(file: string): OrientationRecordFile {
  let raw: Partial<OrientationRecordFile> | undefined;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as Partial<OrientationRecordFile>;
  } catch {
    return { version: 1, screens: [] };
  }
  const problems = Array.isArray(raw?.problems) ? raw.problems.filter((p): p is string => typeof p === 'string') : [];
  const screens = raw?.screens;
  if (!Array.isArray(screens)) return { version: 1, screens: [], problems };
  return { version: 1, problems, screens: screens.filter(
    (s): s is RecordedOrientation =>
      typeof s?.fingerprint === 'string' && typeof s.gdiName === 'string' && isRotation(s.origin) && isRotation(s.applied),
  ).map((s) => ({ ...s, label: typeof s.label === 'string' ? s.label : s.gdiName, since: typeof s.since === 'string' ? s.since : '' })) };
}

/** Écrans de Windows vus par la session : leur empreinte, et le rôle comme nom quand il est connu. */
export function sessionScreens(displays: ObservedDisplay[], cabinet?: Cabinet): SessionScreen[] {
  return displays.map((d) => {
    const fingerprint = fingerprintOf(d).key;
    const playfield = cabinet?.roles.playfield === fingerprint;
    return { gdiName: d.gdiName, fingerprint, label: playfield ? t('écran du playfield ({name})', { name: d.gdiName }) : d.gdiName, rotation: d.rotation };
  });
}

/** Orientation de jeu voulue par le modèle : celle du playfield, s'il en a une. */
export function wantedOrientations(cabinet: Cabinet | undefined): WantedOrientation[] {
  const fp = cabinet?.roles.playfield;
  const rotation = cabinet?.playfield?.windowsRotation;
  return fp && rotation !== undefined ? [{ fingerprint: fp, rotation }] : [];
}

/**
 * Orientations d'une session. Une instance par processus ; l'état est dans le fichier, que la
 * relance suivante reprend.
 */
export class SessionOrientation {
  private records: RecordedOrientation[] = [];
  private readonly wanted = new Map<string, Rotation>();
  private state: State = 'idle';

  constructor(private readonly options: SessionOrientationOptions) {}

  /** Une orientation de Cyber Pinball est en place (pas au bureau, pas encore rendue). */
  get active(): boolean {
    return this.state === 'active';
  }

  /** Écrans tournés par Cyber Pinball, avec leur orientation d'origine. */
  get recorded(): readonly RecordedOrientation[] {
    return this.records;
  }

  /** Orientation que Windows avait avant Cyber Pinball (celle du moment si l'écran n'a pas été tourné). */
  origin(fingerprint: string): Rotation | undefined {
    const recorded = this.records.find((r) => r.fingerprint === fingerprint);
    return recorded?.origin ?? this.screen(fingerprint)?.rotation;
  }

  /**
   * Démarrage : reprend le fichier d'une session précédente (relance, plantage), puis met chaque
   * écran dans l'orientation voulue ; ceux qui n'en veulent plus retrouvent leur origine.
   */
  start(wanted: WantedOrientation[]): OrientationReport {
    const previous = readOrientationFile(this.options.file);
    const report: OrientationReport = { turned: [], problems: (previous.problems ?? []).map((problem) => t('À la dernière fermeture de Cyber Pinball : {problem}', { problem })) };
    this.records = [];
    for (const r of previous.screens) {
      const screen = this.find(r);
      // Écran débranché : on le garde, il retrouvera son origine quand il reviendra.
      if (!screen) this.records.push(r);
      // Encore dans l'orientation de Cyber Pinball, ou revenu à l'origine (redémarrage) : l'origine tient.
      else if (screen.rotation === r.applied || screen.rotation === r.origin) this.records.push({ ...r, gdiName: screen.gdiName, applied: screen.rotation });
      // Tourné depuis par l'utilisateur : son orientation devient l'origine.
    }
    this.wanted.clear();
    for (const w of wanted) this.wanted.set(w.fingerprint, w.rotation);
    this.state = 'active';
    this.apply(report);
    this.save();
    return report;
  }

  /**
   * L'assistant tourne un écran (ou le remet) : l'origine est notée avant, et la session garde
   * cette orientation (une veille qui la perdrait la reprend, check).
   */
  want(fingerprint: string, rotation: Rotation): OrientationReport {
    const report: OrientationReport = { turned: [], problems: [] };
    if (this.state === 'idle') this.start([]);
    this.wanted.set(fingerprint, rotation);
    this.state = 'active';
    const screen = this.screen(fingerprint);
    if (screen) this.turn(screen, rotation, report, true);
    // Refusé par Windows : la session ne réessaie pas d'elle-même à chaque changement d'écrans.
    if (report.problems.length) this.wanted.delete(fingerprint);
    this.save();
    return report;
  }

  /** L'assistant n'a plus d'orientation à garder pour cet écran (rotation non confirmée, déjà remise). */
  forget(fingerprint: string): void {
    this.wanted.delete(fingerprint);
  }

  /**
   * Réparation d'une borne laissée tournée par une version précédente : Windows reprend `origin`
   * pour de bon (son réglage), puis la session remet l'orientation de jeu.
   */
  giveBack(fingerprint: string, origin: Rotation): OrientationReport {
    const report: OrientationReport = { turned: [], problems: [] };
    const screen = this.screen(fingerprint);
    if (!screen) {
      report.problems.push(t('Écran introuvable : son orientation n’a pas été rendue à Windows.'));
      return report;
    }
    const playing = this.wanted.get(fingerprint) ?? screen.rotation;
    try {
      this.options.rotate(screen.gdiName, origin, true);
      report.turned.push({ label: screen.label, from: screen.rotation, to: origin });
    } catch (error) {
      report.problems.push(t('Windows n’a pas repris l’orientation {origin}° pour {label} : {reason}', { origin, label: screen.label, reason: (error as Error).message }));
      return report;
    }
    this.records = this.records.filter((r) => r.fingerprint !== fingerprint);
    this.wanted.set(fingerprint, playing);
    if (this.state !== 'suspended') this.state = 'active';
    if (this.state === 'active') this.apply(report);
    this.save();
    return report;
  }

  /**
   * Après un changement d'écrans (veille, rebranchement, pilote) : un écran que Windows a remis
   * à son réglage reprend l'orientation de jeu. Rien au bureau ni après la sortie.
   */
  check(): OrientationReport {
    const report: OrientationReport = { turned: [], problems: [] };
    if (this.state !== 'active') return report;
    this.apply(report);
    this.save();
    return report;
  }

  /** Mode bureau : chaque écran retrouve l'orientation de Windows le temps d'y travailler. */
  suspend(): OrientationReport {
    const report = this.restore();
    if (this.state === 'active') this.state = 'suspended';
    this.save();
    return report;
  }

  /** Retour du bureau : l'orientation de jeu revient. */
  resume(): OrientationReport {
    const report: OrientationReport = { turned: [], problems: [] };
    if (this.state !== 'suspended') return report;
    this.state = 'active';
    this.apply(report);
    this.save();
    return report;
  }

  /**
   * Sortie : chaque écran tourné retrouve son origine. Ceux qui n'ont pas pu restent notés dans
   * le fichier : le démarrage suivant réessaiera. Rien après une relance (handOver).
   */
  end(): OrientationReport {
    // Jamais démarrée (autre menu ouvert, sortie avant les fenêtres) : le fichier d'une session
    // précédente reste pour la suivante.
    if (this.state === 'idle' || this.state === 'ended' || this.state === 'handedOver') return { turned: [], problems: [] };
    const report = this.restore();
    this.state = 'ended';
    this.save(report.problems);
    return report;
  }

  /** Relance : le processus suivant reprend le fichier tel quel, sans rien rendre entre les deux. */
  handOver(): void {
    if (this.state !== 'ended') this.state = 'handedOver';
  }

  private restore(): OrientationReport {
    const report: OrientationReport = { turned: [], problems: [] };
    for (const r of [...this.records]) {
      const screen = this.find(r);
      if (!screen) {
        report.problems.push(t('{label} est débranché : il reprendra son orientation d’origine ({origin}°) au prochain démarrage de Cyber Pinball.', { label: r.label, origin: r.origin }));
        continue;
      }
      if (screen.rotation !== r.origin) {
        try {
          this.options.rotate(screen.gdiName, r.origin, false);
          report.turned.push({ label: r.label, from: screen.rotation, to: r.origin });
        } catch (error) {
          report.problems.push(
            t('{label} n’a pas repris son orientation d’origine ({origin}°) : {reason} Paramètres > Affichage > Orientation de l’écran la rétablit.', {
              label: r.label,
              origin: r.origin,
              reason: (error as Error).message,
            }),
          );
          continue;
        }
      }
      r.applied = r.origin;
    }
    return report;
  }

  /** Chaque écran voulu dans son orientation ; chaque écran noté qui n'en veut plus, à son origine. */
  private apply(report: OrientationReport): void {
    for (const screen of this.options.screens()) {
      const wanted = this.wanted.get(screen.fingerprint);
      const recorded = this.records.find((r) => r.fingerprint === screen.fingerprint);
      const target = wanted ?? recorded?.origin;
      if (target !== undefined) this.turn(screen, target, report, wanted !== undefined);
    }
  }

  /** Note l'origine (fichier écrit avant tout changement), puis tourne l'écran pour la session. */
  private turn(screen: SessionScreen, rotation: Rotation, report: OrientationReport, playing: boolean): void {
    let recorded = this.records.find((r) => r.fingerprint === screen.fingerprint);
    if (screen.rotation === rotation) {
      if (recorded) recorded.applied = rotation;
      return;
    }
    if (!recorded && playing) {
      recorded = { fingerprint: screen.fingerprint, gdiName: screen.gdiName, label: screen.label, origin: screen.rotation, applied: screen.rotation, since: (this.options.now?.() ?? new Date()).toISOString() };
      this.records.push(recorded);
    }
    if (recorded) {
      // Noté avant d'y toucher (l'orientation visée comme appliquée) : un plantage pendant la
      // rotation laisse de quoi la rendre.
      recorded.applied = rotation;
      this.save();
    }
    try {
      this.options.rotate(screen.gdiName, rotation, false);
      report.turned.push({ label: screen.label, from: screen.rotation, to: rotation });
    } catch (error) {
      if (recorded) recorded.applied = screen.rotation;
      report.problems.push(t('Windows n’a pas tourné {label} à {rotation}° : {reason}', { label: screen.label, rotation, reason: (error as Error).message }));
    }
  }

  /** Fichier à jour : seulement les écrans encore tournés ; aucun, plus de fichier. */
  private save(problems: string[] = []): void {
    this.records = this.records.filter((r) => r.applied !== r.origin || this.wanted.has(r.fingerprint));
    const turned = this.records.filter((r) => r.applied !== r.origin);
    try {
      if (turned.length === 0) fs.rmSync(this.options.file, { force: true });
      else {
        fs.mkdirSync(path.dirname(this.options.file), { recursive: true });
        const body: OrientationRecordFile = { version: 1, screens: this.records, ...(problems.length && { problems }) };
        const tmp = `${this.options.file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(body, null, 2) + '\n');
        fs.renameSync(tmp, this.options.file);
      }
    } catch {
      // Disque plein ou en lecture seule : la session continue, la reprise après plantage manquera.
    }
  }

  private screen(fingerprint: string): SessionScreen | undefined {
    return this.options.screens().find((s) => s.fingerprint === fingerprint);
  }

  /** L'écran noté : par son empreinte, sinon par son nom GDI. */
  private find(r: RecordedOrientation): SessionScreen | undefined {
    const screens = this.options.screens();
    return screens.find((s) => s.fingerprint === r.fingerprint) ?? screens.find((s) => s.gdiName === r.gdiName);
  }
}

// Bornes configurées avant le 27/10/2026

/** Ce qu'une version précédente de l'assistant a sans doute fait de l'écran du playfield. */
export interface LegacyOrientation {
  /** Orientation dans laquelle l'assistant a configuré le playfield : celle de jeu. */
  playing: Rotation;
  /** Orientation que Windows avait avant (celle du bureau), d'après vpxOrientationFix. */
  origin: Rotation;
  /** Windows a gardé l'orientation de jeu dans son réglage : le bureau est à l'envers hors de Cyber Pinball. */
  desktopTurned: boolean;
}

/**
 * Borne configurée avant le 27/10/2026, dont le modèle ne dit pas l'orientation de jeu
 * (playfield.windowsRotation) : l'assistant tournait alors l'écran dans Windows et l'y laissait.
 * On le reconnaît à l'orientation notée à l'enregistrement (lastSeen) : différente de 0° (le
 * réglage par défaut de Windows), et telle que l'assistant l'aurait choisie en partant de 0°.
 * undefined quand rien ne l'indique.
 */
export function legacyOrientation(cabinet: Cabinet | undefined, display: ObservedDisplay | undefined): LegacyOrientation | undefined {
  if (!cabinet?.playfield || !display || cabinet.playfield.windowsRotation !== undefined) return undefined;
  const fp = cabinet.roles.playfield;
  const lastSeen = cabinet.screens.find((s) => s.fingerprint === fp)?.lastSeen;
  const playing = lastSeen?.rotation;
  if (!lastSeen || playing === undefined || playing === 0) return undefined;
  // L'écran tel qu'il était dans l'assistant (bord enregistré), puis à 0°, le joueur au même endroit.
  const configured = rotatedDisplay(display, rotationDelta(playing, display.rotation));
  const origin: Rotation = 0;
  const back = rotationDelta(origin, playing);
  const fix = vpxOrientationFix(rotatedDisplay(configured, back), edgeAfterRotation(cabinet.playfield.flipperEdge, back));
  if (fix?.rotation !== playing) return undefined;
  return { playing, origin, desktopTurned: display.rotation === playing };
}

// Écrans simulés (CYBERPINBALL_DISPLAYS, essais sans opérateur)

/**
 * Orientations des écrans simulés, dans le dossier des données : `windows`, le réglage de
 * Windows (repris au redémarrage) ; `session`, ce qu'un changement dynamique a mis par-dessus,
 * perdu au redémarrage. Un écran absent garde l'orientation de son fichier d'écrans.
 */
export const SIMULATED_ORIENTATION_FILE = 'ecrans-simules-orientation.json';

export interface SimulatedOrientations {
  windows: Record<string, Rotation>;
  session: Record<string, Rotation>;
}

export function readSimulatedOrientations(file: string): SimulatedOrientations {
  const empty: SimulatedOrientations = { windows: {}, session: {} };
  let raw: Partial<SimulatedOrientations>;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as Partial<SimulatedOrientations>;
  } catch {
    return empty;
  }
  const pick = (o: unknown) => Object.fromEntries(Object.entries((o ?? {}) as Record<string, unknown>).filter((e): e is [string, Rotation] => isRotation(e[1])));
  return { windows: pick(raw.windows), session: pick(raw.session) };
}

/** Tourne un écran simulé : pour la session, ou dans le réglage de Windows (`persist`), comme orientation.ts. */
export function rotateSimulated(file: string, gdiName: string, rotation: Rotation, persist: boolean): void {
  const state = readSimulatedOrientations(file);
  if (persist) {
    state.windows[gdiName] = rotation;
    delete state.session[gdiName];
  } else state.session[gdiName] = rotation;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
}

/** Les écrans simulés dans l'orientation que la session ou le réglage de Windows leur donne. */
export function withSimulatedOrientations(displays: ObservedDisplay[], state: SimulatedOrientations): ObservedDisplay[] {
  return displays.map((d) => {
    const rotation = state.session[d.gdiName] ?? state.windows[d.gdiName];
    return rotation === undefined ? d : rotatedDisplay(d, rotationDelta(rotation, d.rotation));
  });
}
