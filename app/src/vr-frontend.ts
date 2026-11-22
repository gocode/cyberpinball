// La réalité virtuelle dans le front-end : l'entrée du Menu système et ses réglages, le casque
// (menu dans le casque, port, repère de la pièce, contour), ses manettes (boutons, assistant), le
// calage de la borne, le réseau de Link, les mesures et la préparation d'une partie dans le casque.
// Sorti de frontend.ts tel quel : l'état du front-end passe par le contexte (accesseurs), et
// frontend.ts lit ce bloc par sa façade `vrFront`.
import {
  activePacks,
  airLinkOverWifi,
  ANCHOR_MAX_RESIDUAL_CM,
  ANCHOR_MIN_CM,
  ANCHOR_MIN_DEG,
  anchorPlace,
  type AnchorResult,
  boundaryOf,
  type CabinetPlace,
  cabinetPlaceFileName,
  cachedVrBackglassView,
  calibrateMenuText,
  CALIBRATION_HOLD_S,
  calibrationCombo,
  CalibrationComboHold,
  calibrationComboLabel,
  calibrationGap,
  type CalibrationOfferReason,
  calibrationProblem,
  calibrationSetting,
  type CalibrationSetting,
  type CalibrationStep,
  CONTROLLER_ELEMENTS,
  CONTROLLER_SCHEMA_PROFILES,
  type ControllerButton,
  type ControllerElement,
  controllerOddity,
  controllerOddityKept,
  controllerProblem,
  type ControllerSetting,
  controllerSettingFileName,
  defaultControllerSetting,
  describeVrCadence,
  describeVrCadenceTest,
  findTableIni,
  fitContour,
  fluidityVerdict,
  freePlace,
  FULL_BACKGLASS_ZONE,
  gameHeadSummary,
  GESTURE_CARD_MS,
  gripOffset,
  type GripOffset,
  HEADSET_PROFILES,
  headsetControls,
  headsetFunctions,
  type HeadsetProfile,
  type HeadsetSource,
  inGameCalibration,
  inGameCalibrationLines,
  inGameCalibrationReport,
  IniDocument,
  isCalibrated,
  isVrImage,
  type JumpTransform,
  lastVrMeasuresBlock,
  linkMinutesBetween,
  linkNetworkSummary,
  type LinkNetworkSummary,
  linkStatsBetween,
  linkStatsSummary,
  type LinkTransport,
  linkTransportSince,
  loadCabinet,
  lockbarMarks,
  lockbarPlace,
  lockbarVpxSettings,
  menuActionOf,
  menuPlayfield,
  mergeVrScreens,
  missingVrSources,
  moveContour,
  movePlace,
  orderCorners,
  packDrawsDmd,
  parseControllerEvent,
  parsePcNetwork,
  parseVrCadence,
  parseVrMeasures,
  parseVrScreensBlock,
  PC_NETWORK_COMMAND,
  type PcNetwork,
  placeFromVpxCentering,
  placeGap,
  placeLockbar,
  placeVpxSettings,
  type Point3,
  poorFillSummary,
  poorlyFilled,
  pupVideosDir,
  readControllerSetting,
  readTextIfExists,
  readVpxBackglassDisplays,
  readVpxGlass,
  readVpxScript as readTableScript,
  type RemoteButton,
  resolveMedia,
  ROOM_LAYER,
  roomDmdSetting,
  RoomFrame,
  roomFromHeads,
  roomFromRecalibration,
  roomKeepingAdvice,
  roomLayerEnv,
  roomLayerFault,
  roomMeasureText,
  roomMismatchProblem,
  roomToCabinet,
  type Rotation,
  samePath,
  SCHEMA_ELEMENTS,
  shouldOfferCalibration,
  staleCalibration,
  t,
  tableHasVrRoom,
  tableUsesPupCapture,
  TRIGGERS_HINT_COMBO,
  TRIGGERS_HINT_S,
  vpxDmdFrames,
  vpxHeadsetInput,
  vpxPlaceProblem,
  vpxRecenteredHead,
  vpxRoomChanges,
  type VpxTableGeometry,
  VR_DMD_BAND,
  vrAudioSettings,
  type VrBackglassView,
  vrCadenceCapped,
  vrCadenceTest,
  type VrGpu,
  vrGraphicsProfile,
  vrMenuText,
  vrNeedsVpxBackglass,
  type VrNetworkFacts,
  vrProfileSettings,
  vrQuitWithoutHeadset,
  vrScreensSettings,
  type VrScreensStore,
  vrSources,
  type VrSources,
  vrTableKey,
  windowsVk,
  writeFileAtomic,
  zoneSetting,
  type InterfaceKeys,
  type LoadingStep,
  type RoleRect,
  type StoredText,
  type SystemItemId,
  type TableEntry,
} from '@cyberpinball/core';
import { keysDown } from '@cyberpinball/win-displays';
import { app, type Input } from 'electron';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type HeadPose, HEADSET_TRIAL_DIR, HeadsetMenu, readCabinetPlace } from './casque';
import { GameRoom, roomLayerDir, roomLayerSetAside, setRoomLayerAside } from './couche-repere';
import type { Message, State } from './frontend';
import { joystickButtonsHeld, watchJoystickButtons } from './joystick-input';
import { type createLibrary } from './library';
import { type locations, vpxInstall } from './paths';
import { installPausePlugin, pauseSettingsFor, QUIT_HOLD_S } from './pause-vr';
import { prepareSchemaImage, type SchemaImage, schemaImageFile } from './schema-image';
import { type OvrJump, OvrProbe } from './sonde-ovr';
import { activeVpxIni } from './vpx-ini';
import {
  prepareVrGame,
  prepareVrTableIni,
  probeVr,
  readVrMirror,
  readVrMode,
  type VrGame,
  writeIniSettings,
  writeVrCalibration,
  writeVrMirror,
  writeVrMode,
} from './vr';

/** Ce que le front-end prête à la réalité virtuelle : ses fonctions, et son état vivant par accesseurs (lu à chaque usage). */
export interface VrFrontendContext {
  auditTurn: () => Promise<void>;
  broadcast: () => void;
  buttonInput: (b: RemoteButton, down: boolean, repeat: boolean) => Input | undefined;
  findHeadsetAudio: () => string | undefined;
  handleKey: (input: Input, fromPhone?: boolean) => boolean;
  handleKeyUp: (input: Input, fromPhone?: boolean) => void;
  KEYS: InterfaceKeys;
  launch: { step: LoadingStep; since: number; slow: boolean; timer: NodeJS.Timeout; stop?: () => void; stopped?: boolean } | undefined;
  library: ReturnType<typeof createLibrary>;
  loc: ReturnType<typeof locations>;
  menuConfiguration: string | undefined;
  playing: TableEntry | undefined;
  roleRects: RoleRect[];
  rotation: Rotation;
  showBanner: (said: StoredText, note?: SystemItemId) => void;
  state: State;
  tables: TableEntry[];
}

export function createVrFrontend(ctx: VrFrontendContext) {
  const { auditTurn, broadcast, buttonInput, findHeadsetAudio, handleKey, handleKeyUp, library, loc, showBanner } = ctx;

  /** Un bouton des manettes du casque : sa touche, remise à handleKey comme celle d'un bouton de la borne. */
  function headsetKey(b: RemoteButton, down: boolean, repeat: boolean): void {
    const input = buttonInput(b, down, repeat);
    if (!input) return;
    if (down) handleKey(input);
    else handleKeyUp(input);
  }

  /** Boutons des manettes du casque tenus (casque.ts), et ce qu'ils tiennent ; les flippers se répètent comme ceux de la borne. */
  const headsetHolds = new Map<string, { b: RemoteButton; timer?: NodeJS.Timeout }>();
  const HEADSET_REPEAT_DELAY_MS = 400;
  const HEADSET_REPEAT_MS = 70;

  /**
   * Manettes du casque, une seule règle au menu et en partie (manettes.ts), d'après le réglage du casque
   * branché (controllerSetting) : flippers = précédent / suivant, joysticks et pavés = déplacer la
   * sélection (répétés tant qu'on les tient), valider, retour, menu du casque, crédit = collection
   * suivante. Chaque bouton tient au menu celui de la borne, par le même chemin que les boutons de la
   * borne : ni le téléphone ni sa combinaison n'y entrent. L'assistant des manettes les prend avant tout.
   */
  function headsetButton(name: string, down: boolean): void {
    // La combinaison du calage d'abord, quel que soit l'écran (assistant des manettes compris) ni le réglage.
    calibrationComboButton(name, down);
    triggersHintButton(name, down);
    if (controllerWizard) {
      if (down) wizardButton(name);
      return;
    }
    const held = headsetHolds.get(name);
    if (held) {
      clearTimeout(held.timer);
      headsetHolds.delete(name);
      if (!down) headsetKey(held.b, false, false);
    }
    if (!down) return;
    const action = menuActionOf(controllerSetting(), name);
    if (!action) return;
    if (action === 'headset-menu') return void openHeadsetMenu();
    const b = action;
    headsetKey(b, true, false);
    if (b !== 'previous' && b !== 'next') return void headsetHolds.set(name, { b });
    const again = (wait: number) =>
      headsetHolds.set(name, {
        b,
        timer: setTimeout(() => {
          headsetKey(b, true, true);
          again(HEADSET_REPEAT_MS);
        }, wait),
      });
    again(HEADSET_REPEAT_DELAY_MS);
  }

  /** Casque retiré, menu de Meta ouvert ou compagnon parti : plus aucun bouton des manettes n'est tenu. */
  function releaseHeadsetButtons(): void {
    for (const name of [...headsetHolds.keys()]) headsetButton(name, false);
    comboHold?.reset();
    triggersHold.reset();
    stopComboHold();
  }

  /**
   * Les deux gâchettes tenues seules TRIGGERS_HINT_S au menu : le geste du calage confondu (les sticks, pas les
   * gâchettes) ; une aide brève le dit, une fois par appui. Jamais pendant le calage (les gâchettes y placent la
   * borne), l'assistant des manettes, ni en partie (les gâchettes sont les flippers) ; seulement si les manettes ont
   * la combinaison des sticks. Toute autre touche annule.
   */
  const triggersHold = new CalibrationComboHold(TRIGGERS_HINT_COMBO, TRIGGERS_HINT_S * 1000);
  let triggersTimer: NodeJS.Timeout | undefined;

  function triggersHintButton(name: string, down: boolean): void {
    const cancel = () => {
      if (triggersTimer) clearTimeout(triggersTimer);
      triggersTimer = undefined;
    };
    if (!TRIGGERS_HINT_COMBO.includes(name as ControllerButton)) {
      if (down) {
        triggersHold.reset();
        cancel();
      }
      return;
    }
    const event = triggersHold.press(name, down, Date.now());
    if (event === 'lachee') return cancel();
    if (event !== 'debut' || calibration || controllerWizard || ctx.playing || ctx.launch || !calibrationCombo(headset?.profile ?? 'touch')) return;
    cancel();
    triggersTimer = setTimeout(() => {
      triggersTimer = undefined;
      if (!triggersHold.due(Date.now()) || calibration || controllerWizard || ctx.playing || ctx.launch) return;
      console.log(`Casque : les deux gâchettes tenues ${TRIGGERS_HINT_S} s dans le front-end ; aide « les sticks, pas les gâchettes » montrée.`); // i18n-ignore : journal
      if (!showGestureCard()) showBanner(t('Pour recaler la borne : enfoncez les deux sticks, pas les gâchettes'));
    }, TRIGGERS_HINT_S * 1000 + 20);
  }

  /** La combinaison du calage au menu (manettes.ts, CalibrationComboHold), pour le profil des manettes branchées. */
  let comboHold: CalibrationComboHold | undefined;
  let comboHoldProfile: HeadsetProfile | undefined;
  let comboTimer: NodeJS.Timeout | undefined;
  /** Jauge de l’appui tenu, envoyée aux écrans rendus pour le casque (fronton : frontend.js, headsetHoldRing). */
  let headsetHoldView: { since: number; durationMs: number; label: string } | undefined;

  function stopComboHold(): void {
    if (comboTimer) clearTimeout(comboTimer);
    comboTimer = undefined;
    if (!headsetHoldView) return;
    headsetHoldView = undefined;
    broadcast();
  }

  /**
   * Les deux joysticks enfoncés ensemble, tenus CALIBRATION_HOLD_S (manettes.ts, CALIBRATION_COMBO) : le calage
   * s'ouvre, d'où qu'on soit au menu (demande du 12 novembre 2026), assistant des manettes compris, avec une jauge
   * circulaire dès que les deux sont tenus ; lâchés avant, rien. Chaque étape au journal. Le même geste en partie
   * passe par le plugin (pause.h).
   */
  function calibrationComboButton(name: string, down: boolean): void {
    const profile = headset?.profile ?? 'touch';
    const combo = calibrationCombo(profile);
    if (!combo) return;
    if (!comboHold || comboHoldProfile !== profile) {
      comboHold = new CalibrationComboHold(combo);
      comboHoldProfile = profile;
    }
    const event = comboHold.press(name, down, Date.now());
    if (!event) return;
    console.log(`Casque : combinaison du calage, ${name} ${down ? 'enfoncé' : 'relâché'}${event === 'debut' ? ', les deux tenus' : event === 'lachee' ? ', lâchée avant 3 s' : ''}${controllerWizard ? ' (assistant des manettes ouvert)' : ''}.`); // i18n-ignore : journal
    if (event === 'lachee') return stopComboHold();
    if (event !== 'debut') return;
    const why = calibration ? 'calage déjà ouvert' : ctx.playing || ctx.launch ? 'partie en cours' : calibrateUnavailable() ? 'menu pas dans le casque' : undefined; // i18n-ignore : journal
    if (why) return void console.log(`Casque : combinaison du calage tenue, rien à ouvrir (${why}).`); // i18n-ignore : journal
    headsetHoldView = { since: Date.now(), durationMs: CALIBRATION_HOLD_S * 1000, label: t('Caler la borne') };
    broadcast();
    comboTimer = setTimeout(() => {
      comboTimer = undefined;
      if (!comboHold?.due(Date.now())) return stopComboHold();
      headsetHoldView = undefined;
      console.log(`Casque : combinaison du calage tenue ${CALIBRATION_HOLD_S} s ; calage de la borne ouvert${controllerWizard ? ' (assistant des manettes fermé)' : ''}.`); // i18n-ignore : journal
      if (controllerWizard) closeControllerWizard(false);
      openCalibration();
      broadcast();
    }, CALIBRATION_HOLD_S * 1000 + 20);
  }

  /** Fichier du réglage des manettes d'un casque, pour la configuration active (un réglage par casque et par configuration). */
  function controllerFile(profile: HeadsetProfile): string {
    return path.join(loc.dataDir, 'vr', controllerSettingFileName(ctx.menuConfiguration, profile));
  }

  /** Réglage des manettes du casque branché (le défaut de son profil sans réglage gardé ; Touch sans casque connu). */
  function controllerSetting(): ControllerSetting {
    const profile = headset?.profile ?? 'touch';
    return readControllerSetting(readTextIfExists(controllerFile(profile)) || undefined, profile);
  }

  /** Assistant des manettes en cours : présentation, une fonction après l'autre, puis le résumé. */
  let controllerWizard:
    | {
        profile: HeadsetProfile;
        phase: 'intro' | 'step' | 'summary';
        index: number;
        functions: ControllerSetting['functions'];
        problem?: string;
        back: 'menu' | 'system';
        /** Réglage gardé à l'envers de l'habitude (controllerOddity) : la remarque, et le réglage qu'on peut garder. */
        odd?: { text: string; kept: ControllerSetting };
      }
    | undefined;
  /** Assistant déjà proposé d'office pendant cette session. */
  let controllerOffered = false;

  /** Assistant proposé d'office : casque porté sans réglage des manettes gardé pour cette configuration. */
  function offerControllerWizard(): void {
    const profile = headset?.profile;
    if (controllerOffered || !profile || !headset?.worn) return;
    if (fs.existsSync(controllerFile(profile))) {
      // Réglage gardé, mais à l'envers de l'habitude (A et B croisés) : dit, avec le réglage par défaut proposé.
      const text = readTextIfExists(controllerFile(profile)) || undefined;
      const kept = readControllerSetting(text, profile);
      const odd = controllerOddity(kept);
      if (!odd || controllerOddityKept(text)) return;
      controllerOffered = true;
      console.log(`Casque : manettes ${profile} réglées à l'envers de l'habitude (${Object.entries(kept.functions).map(([f, el]) => `${f}=${el}`).join(', ')}) ; réglage par défaut proposé.`); // i18n-ignore : journal
      openControllerWizard({ text: odd, kept });
      return;
    }
    controllerOffered = true;
    console.log(`Casque : manettes ${profile} sans réglage pour cette configuration ; assistant des manettes proposé d'office.`); // i18n-ignore : journal
    openControllerWizard();
  }

  /**
   * Assistant des manettes (comme l'étape « Lanceur » de la borne) : le réglage proposé pour ces
   * manettes, gardé tel quel ou refait fonction par fonction, en appuyant sur le bouton voulu.
   */
  function openControllerWizard(odd?: { text: string; kept: ControllerSetting }): void {
    const profile = headset?.profile;
    if (!profile || controllerWizard || calibration || ctx.playing || ctx.launch || !headset?.worn) return;
    // Réglage à l'envers : c'est le réglage par défaut qui est proposé, le sien restant à un bouton.
    const functions = odd ? { ...defaultControllerSetting(profile).functions } : { ...controllerSetting().functions };
    controllerWizard = { profile, phase: 'intro', index: 0, functions, back: ctx.state.phase === 'menu' ? 'menu' : 'system', ...(odd ? { odd } : {}) };
    releaseHeadsetButtons();
    console.log(`Casque : assistant des manettes ouvert (${profile}).`); // i18n-ignore : journal
    showControllerWizard();
  }

  function elementLabel(el: string | undefined): string {
    return el && el in CONTROLLER_ELEMENTS ? CONTROLLER_ELEMENTS[el as keyof typeof CONTROLLER_ELEMENTS].label : '—';
  }

  /** L'écran de l'assistant, à l'étape où il en est. */
  function showControllerWizard(): void {
    const w = controllerWizard;
    if (!w) return;
    let wizardView: Message['wizard'];
    const list = headsetFunctions();
    const table = list.map((f) => t('{fonction} : {bouton}', { fonction: f.label, bouton: elementLabel(w.functions[f.id]) }));
    let lines: string[];
    if (w.phase === 'intro' && w.odd)
      lines = [
        w.odd.text,
        t('{casque} : voici les boutons par défaut.', { casque: HEADSET_PROFILES[w.profile].label }),
        ...table,
        t('{valider} : prendre ces boutons · {retour} : les régler un par un · {menu} : garder mon réglage', { valider: elementLabel(w.functions.valider), retour: elementLabel(w.functions.retour), menu: elementLabel(w.functions.menu) }),
      ];
    else if (w.phase === 'intro')
      lines = [
        t('{casque} : voici les boutons proposés.', { casque: HEADSET_PROFILES[w.profile].label }),
        ...table,
        t('{valider} : garder ces boutons · {retour} : les régler un par un', { valider: elementLabel(w.functions.valider), retour: elementLabel(w.functions.retour) }),
      ];
    else if (w.phase === 'step') {
      const f = list[w.index]!;
      const back = w.functions.retour;
      // Le schéma (manettes dessinées) : le bouton proposé, celui du réglage par défaut, en vert ; une fonction de
      // joystick (pousser, tirer) n'a pas de bouton à dessiner : le texte seul.
      const proposed = defaultControllerSetting(w.profile).functions[f.id];
      const drawn = schemaProfile(w.profile) && !f.axis && proposed !== undefined && SCHEMA_ELEMENTS.includes(proposed);
      if (drawn)
        wizardView = {
          header: t('Manettes du casque · étape {n} sur {total}', { n: w.index + 1, total: list.length }),
          step: f.label,
          schema: [proposed],
          proposedLabel: t('Proposé :'),
          proposed: elementLabel(proposed),
          hint: t('appuyez sur le bouton voulu'),
          ...(back && f.id !== 'retour' && { back: f.optional ? t('{retour} : passer (facultatif)', { retour: elementLabel(back) }) : t('{retour} : étape précédente', { retour: elementLabel(back) }) }),
          ...(w.problem && { problem: w.problem }),
        };
      lines = [
        t('Étape {n} sur {total} : {fonction}', { n: w.index + 1, total: list.length, fonction: f.label }),
        f.id === 'lanceur' ? t('Tirez vers vous le joystick ou le pavé voulu.') : f.axis ? t('Poussez le joystick ou le pavé voulu.') : t('Appuyez sur le bouton voulu.'),
        ...(w.problem ? [w.problem] : []),
        ...(back && f.id !== 'retour' ? [f.optional ? t('{retour} : passer (facultatif)', { retour: elementLabel(back) }) : t('{retour} : étape précédente', { retour: elementLabel(back) })] : []),
      ];
    } else
      lines = [
        ...table,
        ...(w.problem ? [w.problem] : []),
        t('{valider} : garder · {retour} : recommencer', { valider: elementLabel(w.functions.valider), retour: elementLabel(w.functions.retour) }),
      ];
    ctx.state = { ...ctx.state, phase: 'message', help: false, message: { title: t('Manettes du casque'), lines, ...(wizardView && { wizard: wizardView }) } };
    broadcast();
  }

  /** Un bouton appuyé pendant l'assistant : garder, recommencer, ou le bouton de la fonction demandée. */
  function wizardButton(name: string): void {
    const w = controllerWizard;
    const parsed = parseControllerEvent(name);
    if (!w || !parsed || !CONTROLLER_ELEMENTS[parsed.element].profiles.includes(w.profile)) return;
    const el = parsed.element;
    const list = headsetFunctions();
    if (w.phase === 'intro' || w.phase === 'summary') {
      // Réglage à l'envers gardé tel quel, sciemment : noté, plus jamais redemandé.
      if (w.phase === 'intro' && w.odd && el === w.functions.menu) {
        const kept = w.odd.kept;
        try {
          fs.writeFileSync(controllerFile(w.profile), JSON.stringify({ ...kept, keptAsIs: true }, null, 2) + '\n');
        } catch (error) {
          console.warn(`Casque : choix de garder le réglage des manettes pas noté (${(error as Error).message}).`); // i18n-ignore : journal
        }
        console.log(`Casque : réglage des manettes à l'envers gardé tel quel, sur demande (${w.profile}).`); // i18n-ignore : journal
        return closeControllerWizard(false);
      }
      if (el === w.functions.valider) {
        const problem = controllerProblem({ profile: w.profile, functions: w.functions });
        if (problem) {
          w.problem = problem;
          return showControllerWizard();
        }
        return closeControllerWizard(true);
      }
      if (el === w.functions.retour) {
        w.phase = 'step';
        w.index = 0;
        w.functions = {};
        w.problem = undefined;
        return showControllerWizard();
      }
      return;
    }
    const f = list[w.index]!;
    // Le bouton de retour, une fois choisi : passer une fonction facultative, sinon revenir d'une étape.
    if (w.functions.retour && el === w.functions.retour && f.id !== 'retour') {
      w.problem = undefined;
      if (f.optional) {
        delete w.functions[f.id];
        w.index++;
      } else if (w.index > 0) {
        w.index--;
        delete w.functions[list[w.index]!.id];
      }
    } else if (Boolean(f.axis) !== Boolean(parsed.direction)) {
      w.problem = f.axis ? t('Il faut un joystick ou un pavé.') : t('Il faut un bouton.');
    } else {
      const other = list.find((x) => x.id !== f.id && w.functions[x.id] === el);
      if (other) w.problem = t('{bouton} sert déjà à {fonction}', { bouton: elementLabel(el), fonction: other.label });
      else if (calibrationCombo(w.profile)?.includes(el as ControllerButton)) w.problem = t('{bouton} sert à caler la borne (les deux sticks enfoncés ensemble)', { bouton: elementLabel(el) });
      else {
        w.functions[f.id] = el;
        w.problem = undefined;
        w.index++;
      }
    }
    if (w.index >= list.length) w.phase = 'summary';
    showControllerWizard();
  }

  /** Fin de l'assistant : le réglage gardé (fichier par casque et configuration), appliqué au menu et aux parties. */
  function closeControllerWizard(keep: boolean): void {
    const w = controllerWizard;
    if (!w) return;
    controllerWizard = undefined;
    if (keep) {
      const setting: ControllerSetting = { profile: w.profile, functions: w.functions };
      try {
        fs.mkdirSync(path.dirname(controllerFile(w.profile)), { recursive: true });
        fs.writeFileSync(controllerFile(w.profile), JSON.stringify(setting, null, 2) + '\n');
      } catch (error) {
        console.warn(`Casque : réglage des manettes pas gardé (${(error as Error).message}).`); // i18n-ignore : journal
      }
      console.log(`Casque : manettes réglées (${w.profile}, ${ctx.menuConfiguration ?? 'configuration unique'}) : ${Object.entries(w.functions).map(([f, el]) => `${f}=${el}`).join(', ')}.`); // i18n-ignore : journal
    } else console.log('Casque : assistant des manettes annulé.'); // i18n-ignore : journal
    if (w.back === 'menu') {
      ctx.state = { ...ctx.state, phase: 'menu', message: undefined };
      broadcast();
    } else library.openSystem();
    if (headset?.worn) offerCalibration('premier-port');
  }

  // « Réalité virtuelle » (Menu système > Ma borne, vr.ts) : désactivée, ou les tables dans le casque quand il
  // est prêt. Sans runtime OpenXR, l'entrée reste visible, grisée avec sa raison ; Start n'y change rien.
  let vrMode = readVrMode(loc.dataDir);
  /** Sonde LibOVR (sonde-ovr.ts, 13 novembre 2026) : ce que Link donne à un client invisible, au journal. */
  /**
   * Le repère de la pièce (RoomFrame, essai réel du 13 novembre 2026) : le contour lu par la sonde, et les sauts mesurés
   * depuis son dernier rafraîchissement qui le reportent dans le repère courant (contour effectif). La place calée garde
   * toujours le contour effectif (casque.ts, writePlace) : elle et lui restent du même repère, même écrite après un saut
   * (recalage en partie compris).
   */
  const roomFrame = new RoomFrame();
  let lastAnchorAt = 0;
  let anchorRedrawnSaid: string | undefined;
  /** Le dernier saut appliqué : l'instant, et de combien la borne a été reposée (à dire au port). */
  let lastJump: { at: number; jump: JumpTransform; gap: { cm: number; deg: number } } | undefined;
  /** Le repère de la partie dans le casque en cours (couche-repere.ts) : la place lue par VPX et les sauts depuis. */
  let gameRoom: GameRoom | undefined;
  /**
   * Le port en cours (headsetOriginReset) : ce qui a reposé la borne (saut mesuré, contour rafraîchi), la session neuve
   * du compagnon demandée pour relire le contour, et ses minuteries.
   */
  let portWatch: { since: number; jump?: { cm: number; deg: number }; refreshed?: boolean; contour?: AnchorResult; restartAt?: number; timers: NodeJS.Timeout[] } | undefined;
  /** Le dernier bond de la tête refusé par la sonde : une remise d'origine a pu passer sans mesure. */
  let lastRefusedAt = 0;
  /** La dernière session neuve du compagnon demandée au port pour relire le contour (au plus une par minute). */
  let portRestartAt = 0;
  /** Dernière session du compagnon relancée parce que la sonde a retrouvé le casque (au plus une par minute). */
  let contourRestartAt = 0;
  /** Au-delà de ce déplacement (cm), le bandeau dit la borne remise en place. */
  const ANCHOR_BANNER_CM = 5;
  // Le menu dans le casque (casque.ts) : les écrans de la borne montrés dans le casque, hors partie.
  let headset: HeadsetMenu | undefined;
  const ovrProbe = new OvrProbe({
    appDir: path.join(__dirname, '..'),
    log: (line) => console.log(line),
    onContour: (points) => headsetContour(points),
    onJump: (jump) => headsetJump(jump),
    onRefused: () => (lastRefusedAt = Date.now()),
    onTracking: (on, why) => probeTracking(on, why),
    companionReady: () => headset?.state === 'shown',
  });
  /** Partie en cours : le casque est à VPX. */
  let headsetPaused = false;
  library.provideSystemItem('vr', {
    // En plein essai (casque, menu dans le casque) : badge « BÊTA » dans tous ses états.
    badge: 'beta',
    get label() {
      return vrMenuText(vrMode, probeVr()).label;
    },
    get detail() {
      return vrMenuText(vrMode, probeVr(), headset?.state).detail;
    },
    get tone() {
      return vrMenuText(vrMode, probeVr()).unavailable ? ('quiet' as const) : undefined;
    },
    run: () => {
      const readiness = probeVr();
      if (!readiness.ready) return void library.openSystem();
      vrMode = vrMode === 'auto' ? 'off' : 'auto';
      writeVrMode(loc.dataDir, vrMode);
      ovrProbe.set(vrMode === 'auto');
      console.log(`Réalité virtuelle : ${vrMode === 'auto' ? `activée (${readiness.runtime})` : 'désactivée'}.`); // i18n-ignore : journal
      library.openSystem();
    },
  });

  // « Recopie sur le playfield » (Menu système > Ma borne > Réalité virtuelle et vision 3D) : la vue d'un œil du casque sur l'écran du plateau
  // pendant une partie dans le casque. Éteinte par défaut (vr.ts, VR_NO_MIRROR) : VPX ne la tourne pas en
  // portrait, et la copier en 4K à chaque image coûte à la carte graphique pour une image couchée.
  let vrMirror = readVrMirror(loc.dataDir);
  library.provideSystemItem('vr-mirror', {
    get detail() {
      return vrMirror ? t('Oui · la vue d’un œil du casque, en paysage, sur l’écran du plateau') : t('Non · l’écran du plateau garde Cyber Pinball, la carte graphique ne copie rien');
    },
    get tone() {
      return vrMode === 'auto' ? undefined : ('quiet' as const);
    },
    run: () => {
      vrMirror = !vrMirror;
      writeVrMirror(loc.dataDir, vrMirror);
      console.log(`Réalité virtuelle : recopie sur le playfield ${vrMirror ? 'activée' : 'désactivée'}.`); // i18n-ignore : journal
      library.openSystem();
    },
  });

  // « Caler la borne » (Menu système > Ma borne > Réalité virtuelle et vision 3D, après l'activation) : la borne du casque et les
  // tables de VPX posées sur la vraie barre avant, touchée aux manettes (calage.ts). Grisée, avec sa
  // raison, tant que le menu n'est pas dans le casque. Dans le casque : ≡ de la manette gauche (menu du casque).
  library.provideSystemItem('vr-calibrate', {
    get detail() {
      return calibrateMenuText({ vrReady: probeVr().ready, headset: headset?.state, place: headset?.place(), setting: headsetSetting(), combo: calibrationComboLabel(headset?.profile ?? 'touch') }).detail;
    },
    get tone() {
      return calibrateUnavailable() ? ('quiet' as const) : undefined;
    },
    run: () => (calibrateUnavailable() ? library.openSystem() : openCalibration()),
  });

  // « Manettes du casque » (Menu système > Ma borne > Réalité virtuelle et vision 3D, après « Caler la borne ») : l'assistant des manettes,
  // grisé avec sa raison tant que le menu n'est pas dans le casque ou que les manettes ne sont pas connues.
  library.provideSystemItem('vr-controllers', {
    get detail() {
      if (calibrateUnavailable()) return calibrateMenuText({ vrReady: probeVr().ready, headset: headset?.state }).detail;
      const profile = headset?.profile;
      if (!profile) return t('Manettes pas encore reconnues : prenez-les en main, casque porté');
      return t('{casque} · {etat} · Dans le casque : ≡ > « Manettes »', { casque: HEADSET_PROFILES[profile].label, etat: fs.existsSync(controllerFile(profile)) ? t('boutons réglés') : t('boutons proposés par défaut') });
    },
    get tone() {
      return calibrateUnavailable() || !headset?.profile ? ('quiet' as const) : undefined;
    },
    run: () => (calibrateUnavailable() || !headset?.profile ? library.openSystem() : openControllerWizard()),
  });

  /** Le chemin de casque.json : la place de la borne du casque, seule pose de la borne (menu et parties). */
  function headsetPlaceFile(): string {
    // Un calage par configuration : le bureau et la borne n'ont ni la même pièce ni la même limite du Quest.
    return path.join(loc.dataDir, 'vr', cabinetPlaceFileName(ctx.menuConfiguration));
  }

  /** Vraie borne devant le joueur (barre avant à toucher), ou bureau (placement libre) : selon la configuration active. */
  function headsetSetting(): CalibrationSetting {
    return calibrationSetting(ctx.rotation);
  }

  /**
   * Casque remis après avoir été retiré (une autre personne, ou le même joueur) : avec une limite de pièce, le Quest
   * a gardé sa pièce, rien à faire ; en limite fixe ou sans limite, il l'a recentrée sur la tête au réveil (aucun
   * événement : Link ne le dit pas, et ne donne aucune ancre aux applications PC). Écrit au journal, et le calage
   * revient d'office, un geste pour le refaire, A pour le garder tel quel.
   */
  /**
   * Au premier port du casque (une fois pour toutes, noté dans <données>\vr\astuce-calage.json) : le geste du
   * calage, brièvement, pour qu'on le connaisse avant d'en avoir besoin.
   */
  function calibrationComboTip(): void {
    const combo = calibrationComboLabel(headset?.profile ?? 'touch');
    const file = path.join(loc.dataDir, 'vr', 'astuce-calage.json');
    if (!combo || fs.existsSync(file)) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ montree: new Date().toISOString() }, null, 2) + '\n');
    } catch {
      // Dossier de la VR en lecture seule : l'astuce reviendra, sans gravité.
    }
    if (!showGestureCard()) showBanner(t('Recaler la borne à tout moment, dans le front-end comme en partie : {combo}.', { combo }));
  }

  /**
   * L'image de la pause en partie (schema-image.ts) : le titre (« Caler la borne », ou « Borne calée » en vert après
   * un calage), les gâchettes en vert, la ligne d'aide avec « Gâchette » en vert.
   */
  function calibrateImageSpec(done: boolean): SchemaImage | undefined {
    if (!schemaProfile(controllerSetting().profile)) return undefined;
    return {
      title: done ? t('Borne calée') : t('Caler la borne'),
      ...(done && { titleGreen: true }),
      vert: ['gachette-gauche', 'gachette-droite'],
      text: t('Manettes sur les coins de la barre · Gâchette : caler · A ou B : reprendre'),
      lead: t('Gâchette'),
    };
  }

  /**
   * Le chemin de l'image de la pause si elle est prête pour ces manettes et cette langue ; sinon undefined, et elle
   * est faite en arrière-plan pour la partie suivante (une fois par contenu, gardée dans <données>\vr\schemas).
   */
  const calibrateImagePending = new Set<string>();
  function readyCalibrateImage(done: boolean): string | undefined {
    const spec = calibrateImageSpec(done);
    if (!spec) return undefined;
    const file = schemaImageFile(loc.dataDir, spec);
    if (fs.existsSync(file)) return file;
    if (!calibrateImagePending.has(file)) {
      calibrateImagePending.add(file);
      void prepareSchemaImage(loc.dataDir, path.join(__dirname, '..', 'renderer'), spec, (line) => console.log(line)).finally(() => calibrateImagePending.delete(file));
    }
    return undefined;
  }

  /** Les profils de manettes dessinés (schema-manettes.js) : un autre garde le texte seul, jamais un dessin faux. */
  function schemaProfile(profile: HeadsetProfile | undefined): boolean {
    return Boolean(profile && CONTROLLER_SCHEMA_PROFILES.includes(profile));
  }

  /** La carte d'un geste montrée dans le casque (fronton), quelques secondes. */
  let headsetCardView: { schema?: string[]; text: string; detail: string } | undefined;
  let headsetCardTimer: NodeJS.Timeout | undefined;

  /**
   * La carte du geste du calage (maquette validée le 13 novembre 2026) : les deux sticks en vert, « Enfoncez les
   * deux sticks, 3 s », où et avec quel doigt. Seulement pour des manettes dessinées ; sinon false (le bandeau dit
   * le geste en texte).
   */
  function showGestureCard(ms = GESTURE_CARD_MS): boolean {
    const profile = headset?.profile;
    const combo = calibrationCombo(profile ?? 'touch');
    if (!combo || !schemaProfile(profile)) return false;
    headsetCardView = { schema: [...combo], text: t('Enfoncez les deux sticks, 3 s'), detail: t('Sous les pouces, jusqu’au clic · pas les gâchettes') };
    if (headsetCardTimer) clearTimeout(headsetCardTimer);
    headsetCardTimer = setTimeout(() => {
      headsetCardView = undefined;
      headsetCardTimer = undefined;
      broadcast();
    }, ms);
    broadcast();
    return true;
  }

  /**
   * Limite fixe vue pour la première fois sur cette borne (une fois pour toutes, <données>\vr\astuce-limite.json) :
   * comment passer en limite de pièce, la seule façon côté Quest de garder la pièce quand le casque est remis
   * (le recalage d'un geste reste là sinon). Une action dans le casque, environ 3 minutes.
   */
  function roomscaleTip(): void {
    const file = path.join(loc.dataDir, 'vr', 'astuce-limite.json');
    if (fs.existsSync(file) || headsetSetting() === 'bureau') return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ montree: new Date().toISOString() }, null, 2) + '\n');
    } catch {
      // Dossier de la VR en lecture seule : l'astuce reviendra, sans gravité.
    }
    console.log('Casque : limite fixe vue pour la première fois ; le passage en limite de pièce est conseillé une fois.'); // i18n-ignore : journal
    showBanner(t('Le Quest est en limite fixe : la borne se décale chaque fois que le casque est remis. Pour qu’elle reste en place : dans le Quest, réglages de la limite, choisissez « Pièce » et tracez le contour (environ 3 minutes).'));
  }


  /**
   * Ancrage sur la limite du Quest (demande du 13 novembre 2026) : au menu, casque porté, le contour relu par la sonde
   * LibOVR est recalé sur celui gardé au calage ; la borne est reposée d'autant, sans geste ni manettes. Limite fixe
   * (le Quest la recentre sur la tête), bureau, calage, partie : rien. Limite redessinée (nombre de points, contours
   * qui ne se recouvrent plus) : dit une fois, et le calage proposé une fois. Toujours actif, sans option.
   */
  function anchorCheck(): AnchorResult | undefined {
    const current = roomFrame.effective();
    if (!headset || !current || calibration || controllerWizard || ctx.playing || ctx.launch || !headset.worn) return undefined;
    if (headsetSetting() === 'bureau' || headset.roomKeeping === 'recentred') return undefined;
    const place = headset.place();
    if (!place || !isCalibrated(place) || place.free) return undefined;
    const r = anchorPlace(place, current);
    if (!r) {
      noContourCheck(place);
      return r;
    }
    if (r.kind === 'same') return r;
    if (r.kind === 'redrawn') {
      if (anchorRedrawnSaid === r.why) return r;
      anchorRedrawnSaid = r.why;
      console.warn(`Casque : ancrage sur la limite du Quest impossible, ${r.why} ; le calage est proposé une fois (ou les deux joysticks, « Caler la borne »).`); // i18n-ignore : journal
      roomNotice = true;
      offerCalibration('limite-changee');
      return r;
    }
    lastAnchorAt = Date.now();
    originNotice = false;
    headset.showPlace(r.place, true);
    try {
      writeVrCalibration(loc.dataDir, placeVpxSettings(r.place));
    } catch (error) {
      console.warn(`Casque : ancrage sur la limite du Quest pas écrit dans l’INI de la VR (${(error as Error).message}).`); // i18n-ignore : journal
    }
    console.log(`Casque : ancrage sur la limite du Quest, la pièce a sauté : borne reposée de ${r.cm.toFixed(0)} cm et ${r.deg.toFixed(0)}° (contours recalés à ${r.residualCm.toFixed(1)} cm près).`); // i18n-ignore : journal
    if (r.cm > ANCHOR_BANNER_CM) showBanner(t('Borne remise en place sur la limite du Quest'));
    return r;
  }
  /**
   * Une borne calée avant l'ancrage n'a pas de contour gardé : l'ancrage ne peut rien pour elle, et rien ne le disait
   * (13 novembre 2026). Quand la sonde lit un contour, casque porté au menu : dit une fois au journal et à l'écran, et le
   * calage proposé une fois pour cette place (retenu dans `<données>\vr\calage-sans-contour.json`). Le contour courant
   * n'est pas attaché en silence : on ne sait pas si la place est encore du même repère.
   */
  let noContourSaid: string | undefined;
  function noContourCheck(place: CabinetPlace): void {
    const signature = `${place.x.toFixed(3)},${place.z.toFixed(3)},${place.yaw.toFixed(3)}`;
    if (noContourSaid === signature) return;
    const file = path.join(loc.dataDir, 'vr', 'calage-sans-contour.json');
    try {
      if ((JSON.parse(fs.readFileSync(file, 'utf8')) as { signature?: string }).signature === signature) return;
    } catch {
      // Jamais proposé.
    }
    console.log('Casque : borne calée sans contour de la limite gardé (calée avant l’ancrage) : elle ne peut pas se replacer seule ; le calage est proposé une fois.'); // i18n-ignore : journal
    noContourNotice = true;
    if (!offerCalibration('sans-contour')) return;
    noContourSaid = signature;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ signature, proposee: new Date().toISOString() }, null, 2) + '\n');
    } catch {
      // Dossier de la VR en lecture seule : la proposition reviendra, sans gravité.
    }
  }

  /**
   * Une partie dans le casque se lance : la place de la borne que VPX lit dans son INI, et la couche du repère de la
   * pièce chargée dans le seul processus de VPX (son environnement, rendu ici). Sans place calée, ou sans couche : VPX
   * part comme sans elle, dit au journal.
   */
  function startGameRoom(): Record<string, string> | undefined {
    gameRoom = undefined;
    const place = headset?.place();
    if (!place || !isCalibrated(place) || place.free || headsetSetting() === 'bureau') return undefined;
    const vrDir = path.join(loc.dataDir, 'vr');
    // Écartée après une partie finie anormalement avec elle : jusqu'à la prochaine mise à jour, sans option à l'écran.
    const aside = roomLayerSetAside(vrDir, app.getVersion());
    if (aside) console.warn(`Casque : couche du repère écartée depuis ${aside.since} (${aside.why}) ; VPX part sans elle jusqu’à la prochaine mise à jour.`); // i18n-ignore : journal
    const dir = aside ? undefined : roomLayerDir(path.join(__dirname, '..'));
    try {
      gameRoom = new GameRoom(vrDir, place, Boolean(dir));
    } catch (error) {
      console.warn(`Casque : couche du repère pas préparée (${(error as Error).message}) ; VPX part sans elle.`); // i18n-ignore : journal
      return undefined;
    }
    if (!dir) {
      if (!aside) console.warn('Casque : couche du repère absente de l’application ; VPX part sans elle (une remise d’origine en partie ne sera rattrapée qu’à la partie suivante).'); // i18n-ignore : journal
      return undefined;
    }
    return roomLayerEnv(dir, gameRoom.file, process.env);
  }

  /**
   * La partie finie : le journal de la couche au journal, et le repère de la partie rendu (pour le recalage fait en
   * partie). Lancée avec la couche et finie anormalement (roomLayerFault) : la couche nommée au journal, et écartée
   * des parties suivantes jusqu'à la prochaine mise à jour, plutôt que de laisser un joueur sans VR.
   */
  function endGameRoom(game: { failure?: string; exitCode: number | null; seconds: number; stopAsked: boolean }): GameRoom | undefined {
    const room = gameRoom;
    gameRoom = undefined;
    if (!room) return undefined;
    const fault = room.layer ? roomLayerFault(game) : undefined;
    if (fault) {
      console.warn(`Casque : partie dans le casque lancée avec la couche du repère (${ROOM_LAYER}) finie anormalement (${fault}) ; les parties suivantes se lancent sans elle jusqu’à la prochaine mise à jour.`); // i18n-ignore : journal
      try {
        setRoomLayerAside(path.join(loc.dataDir, 'vr'), app.getVersion(), fault);
      } catch (error) {
        console.warn(`Casque : couche du repère pas écartée (${(error as Error).message}).`); // i18n-ignore : journal
      }
    }
    const text = room.journalText().trim();
    for (const line of text ? text.split(/\r?\n/) : []) console.log(`Casque, couche du repère : ${line}`); // i18n-ignore : journal
    if (room.layer && !text) console.warn('Casque, couche du repère : rien écrit ; pas chargée par VPX (son chargeur OpenXR l’a refusée ?), la partie s’est jouée sans elle.'); // i18n-ignore : journal
    if (room.jumps && !room.corrected()) console.warn(`Casque : ${room.jumps} remise(s) d’origine pendant la partie, table de VPX pas corrigée.`); // i18n-ignore : journal
    return room;
  }

  /** Un saut au journal : rotation, déplacement, sol, intervalle des deux relevés. */
  function jumpText(jump: OvrJump): string {
    return `${((jump.angle * 180) / Math.PI).toFixed(1)}°, ${(Math.hypot(jump.tx, jump.tz) * 100).toFixed(0)} cm, sol ${(jump.dy * 100).toFixed(1)} cm, relevés à ${jump.dtMs.toFixed(1)} ms`; // i18n-ignore : journal
  }

  /** Une place au journal : milieu de la barre, cap, hauteur. */
  function placeText(q: CabinetPlace): string {
    return `${q.x.toFixed(3)},${q.z.toFixed(3)} cap ${((q.yaw * 180) / Math.PI).toFixed(1)}° barre ${(q.lockbarHeight ?? 0).toFixed(3)} m`; // i18n-ignore : journal
  }

  /**
   * Un saut mesuré par la sonde (remise d'origine du Quest, sa signature : la tête arrive à l'origine même), au menu
   * comme en partie, calage compris : J le garde (le contour effectif suit), et la borne est reposée tout de suite
   * (movePlace), l'INI de la VR aussi, pour le menu et pour la partie suivante. Une seule correction : la place écrite
   * garde le contour effectif, que l'ancrage retrouve ensuite tel quel.
   */
  function headsetJump(jump: OvrJump): void {
    roomFrame.onJump(jump);
    applyFrameChange(jump, `saut de l’espace de suivi mesuré par la sonde (${jumpText(jump)})`); // i18n-ignore : journal
  }

  /**
   * Le repère de la pièce a changé de `jump` (p' = R p + t), mesuré par un saut de la sonde ou par le contour rafraîchi
   * (contourFrameChange) : la borne reposée, l'INI de la VR réécrit pour la partie suivante, et en partie la correction
   * de la couche de VPX et les têtes relevées pendant la partie reportées dans le nouveau repère.
   */
  function applyFrameChange(jump: JumpTransform, what: string): void {
    // Les têtes de la partie (checkVrRoomAfterGame) restent dans un seul repère, comme la place.
    if (ctx.playing || ctx.launch) gameHeads = gameHeads.map((h) => {
      const [x, z] = moveContour([[h.x, h.z]], jump)[0]!;
      return { ...h, x, z, yaw: h.yaw - jump.angle };
    });
    const place = headset?.place();
    if (!headset || !place || !isCalibrated(place) || place.free || headsetSetting() === 'bureau') {
      console.log(`Casque : ${what}, pas de borne calée à reposer.`); // i18n-ignore : journal
      return;
    }
    const next = movePlace(place, jump);
    const gap = placeGap(place, next);
    headset.showPlace(next, true);
    try {
      writeVrCalibration(loc.dataDir, placeVpxSettings(next));
    } catch (error) {
      console.warn(`Casque : saut appliqué, pas écrit dans l’INI de la VR (${(error as Error).message}).`); // i18n-ignore : journal
    }
    lastJump = { at: Date.now(), jump, gap };
    if (portWatch) portWatch.jump = gap;
    // En partie : la couche de VPX corrige son espace de la composée des sauts depuis son lancement (couche-repere.ts).
    if (gameRoom && (ctx.playing || ctx.launch)) {
      try {
        gameRoom.onJump(jump);
        console.log(`Casque : ${gameRoom.layer ? 'correction de la table de VPX' : 'saut en partie, couche absente : table fausse jusqu’à la partie suivante'} (${gameRoom.jumps} saut(s) depuis le lancement : ${((gameRoom.jump.angle * 180) / Math.PI).toFixed(1)}°, ${(Math.hypot(gameRoom.jump.tx, gameRoom.jump.tz) * 100).toFixed(0)} cm).`); // i18n-ignore : journal
      } catch (error) {
        console.warn(`Casque : correction de la table de VPX pas écrite (${(error as Error).message}).`); // i18n-ignore : journal
      }
    }
    originNotice = false;
    console.log(`Casque : ${what}${ctx.playing || ctx.launch ? ', en partie' : ''} : borne reposée de ${gap.cm.toFixed(0)} cm et ${gap.deg.toFixed(0)}°, de ${placeText(place)} à ${placeText(next)}.`); // i18n-ignore : journal
    if (!ctx.playing && !ctx.launch && headset.worn) showBanner(t('Borne remise en place'));
  }

  /**
   * La sonde suit le casque, ou plus (muette, arrêtée, Link coupé, casque absent pour elle ; essai réel du 13 novembre
   * 2026, 23:35-23:45 : sonde muette toute une séance, et une borne reposée de 121 cm sur un contour d'une connexion
   * passée). Perdu : aucun saut ne peut plus être mesuré, le contour est oublié et rien n'est relu avant une session du
   * compagnon ouverte sonde suivante (RoomFrame). Retrouvé hors partie, compagnon prêt : session neuve du compagnon pour
   * relire le contour aussitôt (au plus une par minute).
   */
  function probeTracking(on: boolean, why: string): void {
    if (!on) {
      roomFrame.probeLost();
      // La sonde sans le casque : Link coupé (ou sonde muette) ; la prochaine connexion relira son transport.
      if (ovrProbe.withoutHeadset()) linkDisconnected();
      if (vrMode === 'auto') console.log(`Casque, sonde LibOVR : ne suit plus le casque (${why}) ; aucun saut ne peut être mesuré, contour de la limite oublié (relu à la prochaine session du compagnon).`); // i18n-ignore : journal
      return;
    }
    const blocked = roomFrame.state() === 'bloque';
    console.log(`Casque, sonde LibOVR : suit le casque${blocked ? ' ; contour relu à la prochaine session du compagnon' : ''}.`); // i18n-ignore : journal
    if (!blocked || headset?.state !== 'shown' || ctx.playing || ctx.launch || calibration || controllerWizard || Date.now() - contourRestartAt < 60_000) return;
    contourRestartAt = Date.now();
    console.log('Casque : session neuve du compagnon pour relire le contour de la limite, la sonde suivant de nouveau le casque (noir le temps de la relance).'); // i18n-ignore : journal
    headset.restart();
  }

  /**
   * Session neuve du compagnon (« pret ») : le contour gardé n'est utilisable que relu dans cette session, et seulement si
   * la sonde suit le casque à cet instant (les sauts mesurés depuis le gardent juste) ; la sonde le redit aussitôt.
   */
  function companionReady(): void {
    linkConnectedAt ??= Date.now() / 1000;
    const following = ovrProbe.tracking();
    const before = roomFrame.state();
    roomFrame.companionSession(following);
    if (following) ovrProbe.send('contour');
    if (vrMode === 'auto' && (before !== 'aucun' || !following)) console.log(`Casque : session du compagnon, contour de la limite ${following ? 'à relire' : 'pas utilisable : la sonde ne suit pas le casque, aucun saut ne peut être mesuré'}.`); // i18n-ignore : journal
  }

  /**
   * Un contour lu par la sonde : rafraîchi (son contenu a changé), J repart de l'identité et l'ancrage rattrape la dérive
   * accumulée ou confirme ; au port, son résultat est gardé pour le dire.
   */
  function headsetContour(points: [number, number][]): void {
    if (points.length < 3) return;
    const before = roomFrame.pending();
    // Le contour effectif d'avant la lecture : dans le repère courant, si les sauts ont tous été mesurés.
    const previous = roomFrame.effective();
    const kind = roomFrame.onRead(points);
    // Pas lu dans une session du compagnon suivie par la sonde : ni ancrage, ni contour gardé.
    if (kind === 'ecarte') return;
    if (kind === 'rafraichi') {
      const restart = portWatch?.restartAt ? `, ${Date.now() - portWatch.restartAt} ms après la session neuve du compagnon` : ''; // i18n-ignore : journal
      console.log(`Casque : contour de la limite rafraîchi par le runtime (${points.length} points${restart})${before.count ? ` ; ${before.count} saut(s) mesuré(s) depuis le précédent, repris par lui` : ''}.`); // i18n-ignore : journal
    }
    if (kind === 'rafraichi' && portWatch) portWatch.refreshed = true;
    // En partie, l'ancrage s'abstient : le changement de repère que le contour mesure est appliqué ici (veille du casque).
    if (kind === 'rafraichi' && previous && (ctx.playing || ctx.launch)) contourFrameChange(previous, points);
    // Le casque pas encore redit porté (session neuve du compagnon) : l'ancrage sera refait à son port et au bilan.
    const r = anchorCheck();
    if (kind === 'rafraichi' && portWatch && r) portWatch.contour = r;
  }

  /**
   * Un contour rafraîchi sans saut à signature mesure le changement de repère : le contour effectif d'avant (repère de la
   * borne) recalé sur le contour relu (essai réel du 14 novembre 2026, Indiana Jones : le Quest s'est endormi 32 s en
   * pleine partie, l'origine a été refaite au réveil sans la signature, saut refusé, et le runtime a redonné le contour
   * dans le nouveau repère 31 ms après ; recalé à 0,05 cm près, -112,3° et 93 cm). Rien en dessous du seuil de l'ancrage
   * (un contour rafraîchi après un saut mesuré ne change rien) ; contours qui ne se recouvrent pas : rien, dit au journal.
   */
  function contourFrameChange(previous: [number, number][], points: [number, number][]): void {
    const fit = fitContour(previous, points);
    if (!fit || fit.residualCm > ANCHOR_MAX_RESIDUAL_CM) {
      console.warn(`Casque : contour rafraîchi en partie, ${fit ? `ne recouvre pas le précédent (résidu ${fit.residualCm.toFixed(1)} cm)` : `${points.length} points au lieu de ${previous.length}`} ; repère de la table pas corrigé.`); // i18n-ignore : journal
      return;
    }
    const deg = Math.abs((fit.angle * 180) / Math.PI);
    const cm = Math.hypot(fit.tx, fit.tz) * 100;
    if (deg < ANCHOR_MIN_DEG && cm < ANCHOR_MIN_CM) return;
    applyFrameChange({ angle: fit.angle, tx: fit.tx, tz: fit.tz, dy: 0 }, `repère de la pièce changé sans saut mesuré, mesuré par le contour rafraîchi (${(deg * Math.sign(fit.angle)).toFixed(1)}°, ${cm.toFixed(0)} cm, contours recalés à ${fit.residualCm.toFixed(1)} cm près)`); // i18n-ignore : journal
  }

  /**
   * La pièce refaite par le Quest au port du casque (origine remise sur la tête). Ordre voulu (demande du 13 novembre
   * 2026) : le saut mesuré par la sonde repose la borne tout de suite (headsetJump) ; puis un contour rafraîchi confirme ou
   * rattrape la dérive. Pas de contour rafraîchi dans PORT_REFRESH_MS : session neuve du compagnon (le contour a suivi
   * 0,5 s après une session neuve le 13 novembre). Au bout de PORT_SETTLE_MS : le journal dit lequel a reposé la borne
   * (et l'écart entre les deux) ; ni l'un ni l'autre, le calage est proposé. Pas de « confirmation » par une distance.
   */
  const PORT_REFRESH_MS = 2500;
  const PORT_SETTLE_MS = 8000;
  function headsetOriginReset(afterRemoval: boolean): void {
    const place = headset?.place();
    if (!place || !isCalibrated(place) || place.free || headsetSetting() === 'bureau') return;
    // Une relance ne se déclenche jamais elle-même (essai réel du 14 novembre 2026, 02:25 : casque posé, tête restée à
    // l'origine, 8 sessions neuves en 40 s) : le premier port de la session neuve demandée ici n'est pas une remise de plus.
    if (!afterRemoval && Date.now() - portRestartAt < PORT_SETTLE_MS + 5000) {
      console.log('Casque, au port : premier port de la session neuve demandée pour relire le contour ; pas une remise d’origine de plus.'); // i18n-ignore : journal
      return;
    }
    // La sonde suit le casque et n'a vu ni saut ni bond refusé, et le contour de cette session est relu et ancré : la tête
    // est restée à l'origine d'une remise déjà prise.
    if (!afterRemoval && ovrProbe.tracking() && roomFrame.state() === 'pret' && !(lastJump && Date.now() - lastJump.at < 3000) && Date.now() - lastRefusedAt > 3000) {
      console.log('Casque, au port : tête à l’origine au premier port, mais la sonde, qui suit le casque, n’a vu aucune remise ; rien à reposer.'); // i18n-ignore : journal
      return;
    }
    originNotice = true;
    for (const timer of portWatch?.timers ?? []) clearTimeout(timer);
    // Le saut est vu par la sonde quelques millisecondes avant le port d'OpenXR.
    const since = Date.now() - 1500;
    const watch: NonNullable<typeof portWatch> = { since, timers: [], ...(lastJump && lastJump.at >= since && { jump: lastJump.gap }) };
    portWatch = watch;
    const measured = watch.jump ? `saut déjà mesuré, borne reposée de ${watch.jump.cm.toFixed(0)} cm et ${watch.jump.deg.toFixed(0)}°` : ovrProbe.tracking() ? 'pas de saut mesuré' : 'sonde sans le casque : aucun saut ne peut être mesuré'; // i18n-ignore : journal
    console.log(`Casque, au port : origine remise sur la tête (${afterRemoval ? 'casque remis' : 'premier port'}) ; ${measured} ; contour à rafraîchir.`); // i18n-ignore : journal
    watch.timers.push(
      setTimeout(() => {
        if (portWatch !== watch || watch.refreshed || ctx.playing || ctx.launch || calibration || !headset) return;
        if (Date.now() - portRestartAt < 60_000) {
          console.log('Casque, au port : contour pas rafraîchi, mais une session neuve a déjà été demandée il y a moins d’une minute ; pas de nouvelle relance.'); // i18n-ignore : journal
          return;
        }
        watch.restartAt = portRestartAt = Date.now();
        console.log('Casque, au port : contour pas rafraîchi ; session neuve du compagnon pour le relire (noir le temps de la relance).'); // i18n-ignore : journal
        headset.restart();
      }, PORT_REFRESH_MS),
      setTimeout(() => settlePort(watch, afterRemoval), PORT_SETTLE_MS),
    );
  }

  function settlePort(watch: NonNullable<typeof portWatch>, afterRemoval: boolean): void {
    if (portWatch !== watch) return;
    if (watch.refreshed && !watch.contour) watch.contour = anchorCheck();
    portWatch = undefined;
    const c = watch.contour;
    const byContour = c && c.kind === 'moved' ? `contour rafraîchi : borne reposée de ${c.cm.toFixed(0)} cm et ${c.deg.toFixed(0)}°` : c && c.kind === 'same' ? 'contour rafraîchi : rien à reposer' : undefined; // i18n-ignore : journal
    if (watch.jump && byContour) {
      // L'écart entre les deux : notre mesure de précision sur le vrai Link.
      const gap = c && c.kind === 'moved' ? `${c.cm.toFixed(1)} cm et ${c.deg.toFixed(1)}°` : 'moins de 1 cm et 0,5°'; // i18n-ignore : journal
      console.log(`Casque, au port : borne reposée par le saut mesuré (${watch.jump.cm.toFixed(0)} cm, ${watch.jump.deg.toFixed(0)}°), puis ${byContour} ; écart entre le saut et le contour : ${gap}.`); // i18n-ignore : journal
      return;
    }
    if (watch.jump) {
      console.log(`Casque, au port : borne reposée par le saut mesuré (${watch.jump.cm.toFixed(0)} cm, ${watch.jump.deg.toFixed(0)}°) ; contour pas rafraîchi.`); // i18n-ignore : journal
      return;
    }
    if (byContour) {
      console.log(`Casque, au port : pas de saut mesuré ; ${byContour}.`); // i18n-ignore : journal
      return;
    }
    const why = c?.kind === 'redrawn' ? c.why : roomFrame.state() === 'bloque' ? 'sonde sans le casque : aucun saut mesurable, contour pas utilisable' : 'pas de contour gardé avec la place, ou contour pas relu'; // i18n-ignore : journal
    console.log(`Casque, au port : ni saut mesuré ni contour rafraîchi (${why}) ; calage proposé, ${afterRemoval ? 'casque remis' : 'premier port'}.`); // i18n-ignore : journal
    offerCalibration('origine-remise');
  }

  function headsetPutBackOn(): void {
    const place = headset?.place();
    if (!place || headsetSetting() === 'bureau' || headset?.roomKeeping !== 'recentred') return;
    if (lastJump && Date.now() - lastJump.at < 3000) {
      console.log('Casque : remis en limite fixe, le saut mesuré par la sonde décide (pas de calage proposé d’office).'); // i18n-ignore : journal
      return;
    }
    console.log('Casque : remis après avoir été retiré, pièce du Quest sans limite (limite fixe) : il l’a recentrée sur la tête au réveil, écart non mesurable sans ancre (Link n’en donne pas) ; calage de la borne proposé d’office.'); // i18n-ignore : journal
    offerCalibration('casque-remis');
  }

  /**
   * Exit de la borne tenu en ce moment, quelle que soit la fenêtre au premier plan : ses touches lues par Windows
   * (GetAsyncKeyState), ses boutons de joystick par SDL (le sondage doit tourner : watchJoystickButtons).
   */
  function exitHeldNow(): boolean {
    const list = ctx.KEYS.exit;
    const joystick = new Set(joystickButtonsHeld());
    const vks = list.filter((c) => !c.startsWith('SDLJoy_')).map(windowsVk).filter((v): v is number => v !== undefined);
    let keyboard: number[] = [];
    try {
      keyboard = vks.length ? keysDown(vks) : [];
    } catch {
      keyboard = [];
    }
    return list.some((c) => (c.startsWith('SDLJoy_') ? joystick.has(c) : keyboard.includes(windowsVk(c) ?? -1)));
  }

  /**
   * Exit de la borne pendant une attente où aucune fenêtre de Cyber Pinball n'a le clavier (VPX attend le casque) :
   * les touches d'Exit de cette borne lues par Windows (GetAsyncKeyState), ses boutons de joystick par SDL, toutes
   * les 50 ms tant que `active()` ; un appui (pas un bouton déjà tenu au départ) appelle `onExit` une fois.
   */
  function watchExitWhileWaiting(active: () => boolean, onExit: () => void): () => void {
    let wasDown = true;
    let done = false;
    const stopJoystick = watchJoystickButtons(() => undefined);
    const timer = setInterval(() => {
      if (done || !active()) return void (wasDown = true);
      const down = exitHeldNow();
      if (down && !wasDown) {
        done = true;
        onExit();
      }
      wasDown = down;
    }, 50);
    return () => {
      clearInterval(timer);
      stopJoystick();
    };
  }

  /** Hauteur des yeux dite par le compagnon (sol mal réglé), et limite du Quest changée depuis le calage. */
  let headsetEyes: number | undefined;
  let roomNotice = false;
  /** La pièce refaite par le Quest au port du casque (headsetOriginReset) : dit à l'écran du calage proposé. */
  let originNotice = false;
  /** La borne calée sans contour gardé (noContourCheck) : dit à l'écran du calage proposé. */
  let noContourNotice = false;
  /** Session neuve d'après un changement de pièce, yeux hors de la plage : les applications qui démarrent ont l'ancienne pièce. */
  let roomStale = false;

  /**
   * Menu du casque (≡ de la manette gauche, au menu de Cyber Pinball) : caler la borne, la recentrer,
   * revenir ; et la légende des manettes, la même règle au menu et en partie (manettes.ts). Par-dessus
   * l'écran du moment, qui revient tel quel (library.interrupt). En partie, ≡ ouvre le menu de VPX.
   */
  function openHeadsetMenu(): void {
    if (calibration || controllerWizard || ctx.playing || ctx.launch || !headset?.worn) return;
    if (ctx.state.phase !== 'menu' && ctx.state.phase !== 'library') return;
    const opened = library.interrupt((back) => {
      const build = () => ({
        heading: t('Menu du casque'),
        icon: 'vr' as const,
        lead: t('Les mêmes boutons partout : A valide, B revient, les joysticks déplacent la sélection.'),
        sections: [
          { title: t('Dans le front-end'), kind: legendKind(), rows: [...headsetControls(controllerSetting()).filter((c) => c.menu).map((c) => ({ text: c.label, detail: c.menu, ...legendControls([c.element]) })), ...comboRows()] },
          { title: t('En partie'), kind: legendKind(), rows: [...headsetControls(controllerSetting()).map((c) => ({ text: c.label, detail: c.game, ...legendControls([c.element]) })), ...comboRows(true)] },
        ],
        actions: [
          { label: t('Caler la borne'), icon: 'layout' as const, detail: calibrateMenuText({ vrReady: probeVr().ready, headset: headset?.state, place: headset?.place(), setting: headsetSetting() }).detail.split(' · ')[0], run: () => {
            back();
            openCalibration();
          } },
          { label: t('Recentrer la borne'), icon: 'restore' as const, detail: t('Devant vous, tournée comme votre regard ; elle ne bouge plus ensuite'), run: () => {
            console.log('Casque : recentrage demandé au menu du casque.'); // i18n-ignore : journal
            headset?.recenter();
            back();
          } },
          { label: t('Manettes'), icon: 'gamepad' as const, detail: t('Régler les boutons de ces manettes, un par un'), run: () => {
            back();
            openControllerWizard();
          } },
          { label: t('Retour'), icon: 'back' as const, run: back },
        ],
        back,
      });
      library.openCustom(build, 0);
    });
    if (opened) console.log('Casque : menu du casque ouvert (≡).'); // i18n-ignore : journal
  }

  /** La combinaison du calage dans la légende des manettes (menu du casque), si ces manettes en ont une. */
  function comboRows(inGame = false): { text: string; detail: string; controls?: string[] }[] {
    const combo = calibrationCombo(controllerSetting().profile);
    return combo ? [{ text: t('Les deux sticks enfoncés jusqu’au clic, 3 s'), detail: inGame ? t('Pause, puis caler la borne ; on reprend où on en était') : t('Caler la borne'), ...legendControls([...combo]) }] : [];
  }

  /** La légende en deux colonnes, un petit schéma par commande (planche validée) ; sans dessin, la liste d'avant. */
  function legendKind(): string | undefined {
    return schemaProfile(controllerSetting().profile) ? 'controls' : undefined;
  }

  /** Les commandes d'une ligne de la légende, si le schéma sait les dessiner ; sinon une case vide (alignement). */
  function legendControls(elements: readonly string[]): { controls?: string[] } {
    if (!schemaProfile(controllerSetting().profile)) return {};
    return { controls: elements.filter((e) => SCHEMA_ELEMENTS.includes(e as ControllerElement)) };
  }

  /** Arrêt de la partie de VPX dans le casque en cours (le casque se perd pendant qu'elle se joue). */
  let vrGameStop: (() => void) | undefined;

  /**
   * Casque éteint, Link coupé ou session perdue : l'affichage revient aux écrans du PC (le compagnon
   * s'arrête). Pendant une partie dans le casque, VPX continuerait sans personne (VPX 10.8.1 ne réagit
   * pas à la perte de sa session) : il est fermé, et le menu revient sur les écrans.
   */
  function headsetLost(inGame: boolean): void {
    linkDisconnected();
    if (inGame && vrGameStop) {
      console.warn('Casque : éteint ou Link coupé pendant la partie ; VPX est fermé, retour aux écrans du PC.'); // i18n-ignore : journal
      vrGameStop();
    } else console.warn('Casque : éteint ou Link coupé ; retour aux écrans du PC.'); // i18n-ignore : journal
    if (calibration) closeCalibration();
  }

  /** Tête du joueur déjà notée pour la partie dans le casque en cours. */
  let headLogged = false;

  /**
   * Diagnostic des frontons en VR, une fois par lancement, au journal : les tables installées dont la pièce
   * VR montre le fronton par la capture de PuP, sans flasher du fronton (vides dans VPX 10.8 : The Matrix,
   * 10 novembre 2026). Cyber Pinball leur ajoute le fronton de VPX à chaque partie dans le casque.
   */
  async function auditVrBackglass(): Promise<void> {
    if (vrMode !== 'auto') return;
    const empty: string[] = [];
    const hidden: string[] = [];
    const uncertain: string[] = [];
    const noSource: string[] = [];
    const roomDmd: string[] = [];
    for (const table of ctx.tables.filter((t) => t.emulator === 'vpx')) {
      await auditTurn();
      try {
        const script = readTableScript(table.file);
        const room = tableHasVrRoom(script);
        const displays = readVpxBackglassDisplays(table.file);
        // Le fronton de VPX leur sera ajouté : sa partie visible, calculée d'avance (3 s au plus par table).
        const needs = vrNeedsVpxBackglass({ room, backglassDisplays: displays, pupCapture: tableUsesPupCapture(script) });
        const sources = vrSourcesOf(table.file, needs);
        const missing = missingVrSources(sources.sources);
        if (missing.length) noSource.push(`${table.title} (${missing.join(', ')})`);
        if (sources.roomDmd) roomDmd.push(`${table.title} (${sources.roomDmd})`);
        if (needs) {
          const view = cachedVrBackglassView(table.file, vrZonesFile());
          if (view && view.hidden >= 0.02) hidden.push(`${table.title} (${Math.round(view.hidden * 100)} %)`);
          if (view?.uncertain.length) uncertain.push(table.title);
        }
        if (!room || !tableUsesPupCapture(script)) continue;
        if (!displays) empty.push(table.title);
      } catch {
        // Table illisible : rien à en dire ici.
      }
    }
    console.log(`Réalité virtuelle : ${empty.length} table(s) au fronton vide dans le casque sans correctif (pièce VR, fronton capté par PuP, aucun flasher du fronton)${empty.length ? ` : ${empty.join(', ')} ; le fronton de VPX leur est ajouté à chaque partie` : ''}.`); // i18n-ignore : journal
    vrSourcesMissing = noSource;
    vrPoorFill = poorFillSummary(readVrScreens());
    // Cadre DMD de pièce VR sans DMD de script (PuP, image) : rempli par le plugin, sans quoi il resterait gris.
    console.log(`Réalité virtuelle : ${roomDmd.length} table(s) au cadre DMD de pièce VR rempli par Cyber Pinball${roomDmd.length ? ` : ${roomDmd.join(' | ')}` : ''}.`); // i18n-ignore : journal
    console.log(`Réalité virtuelle : ${noSource.length} table(s) sans source de fronton ou de DMD dans le casque${noSource.length ? ` : ${noSource.join(' | ')}` : ''}.`); // i18n-ignore : journal
    console.log(`Réalité virtuelle : fronton de VPX en partie caché par la pièce de la table pour ${hidden.length} table(s)${hidden.length ? ` : ${hidden.join(', ')} ; le fronton et la pause y sont dessinés dans la partie visible` : ''}${uncertain.length ? ` ; selon le script, peut-être aussi caché pour ${uncertain.join(', ')} (capture à la prochaine partie)` : ''}.`); // i18n-ignore : journal
  }

  /** Réseau du casque (vr-reseau.ts) : bilan de Link de la dernière partie, transport de Link, carte réseau du PC. */
  let lastLinkNetwork: LinkNetworkSummary | undefined;
  let linkMode: LinkTransport | undefined;
  let pcNetwork: PcNetwork | undefined;
  /** L'avertissement « Air Link sur un PC en Wi-Fi » déjà donné dans cette session du casque. */
  let airLinkWarned = false;
  /**
   * Début de la connexion de Link en cours (secondes depuis 1970) : premier « pret » du compagnon depuis que le casque
   * était perdu (Link coupé, éteint) ou absent. Le transport n'est lu que dans les relevés d'Oculus d'après lui.
   */
  let linkConnectedAt: number | undefined;

  /** Link coupé ou casque éteint : la connexion suivante dira son propre transport. */
  function linkDisconnected(): void {
    linkConnectedAt = undefined;
    linkMode = undefined;
  }

  /** Relève, en arrière-plan et sans fenêtre, la carte réseau du PC et le transport de Link. */
  function refreshVrNetwork(): void {
    // Une seule vérité : le dernier relevé d'Oculus de la connexion en cours ; aucun, et le transport reste inconnu
    // (jamais l'avertissement « Air Link » d'après une connexion passée).
    const found = linkConnectedAt !== undefined ? linkTransportSince(readOculusPerfLog(), linkConnectedAt - 5) : undefined;
    if (found && found.transport !== linkMode) {
      const at = found.at !== undefined ? new Date(found.at * 1000).toISOString().slice(11, 19) : '?';
      console.log(`Casque : Link ${found.transport === 'air' ? 'par Air Link' : 'par câble USB'} (relevé d’Oculus de ${at}).`); // i18n-ignore : journal
    }
    if (found) linkMode = found.transport;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PC_NETWORK_COMMAND], { windowsHide: true, timeout: 15_000 }, (error, stdout) => {
      if (error) return;
      const net = parsePcNetwork(String(stdout));
      if (!net) return;
      if (!pcNetwork || pcNetwork.wireless !== net.wireless) console.log(`Casque, réseau du PC : ${net.adapter} (${net.wireless ? 'sans fil' : 'câble'}) ; Link ${linkMode === 'air' ? 'par Air Link' : linkMode === 'cable' ? 'par câble USB' : 'pas encore relevé'}.`); // i18n-ignore : journal
      pcNetwork = net;
    });
  }

  /** Le réseau du casque, pour la santé de la borne. */
  function vrNetworkFacts(): VrNetworkFacts | undefined {
    if (!linkMode && !pcNetwork && !vrSourcesMissing.length && !vrPoorFill.length) return undefined;
    return {
      ...(linkMode ? { transport: linkMode } : {}),
      ...(pcNetwork ? { network: pcNetwork } : {}),
      ...(vrSourcesMissing.length ? { noSource: vrSourcesMissing } : {}),
      ...(vrPoorFill.length ? { poorFill: vrPoorFill } : {}),
    };
  }

  /**
   * Sources du fronton et du DMD d'une table dans le casque (vr-sources.ts), et les images de secours que le
   * plugin dessine quand rien d'autre ne le fait : celles des médias de la table, ou par défaut de Cyber Pinball.
   */
  function vrSourcesOf(tableFile: string, addBackglass: boolean): { sources: VrSources; roomDmd: 'PUP' | 'image' | ''; dmdFrames: { name: string; ratio?: number }[]; backglassImage?: string; dmdImage?: string } {
    const table = ctx.tables.find((t) => samePath(t.file, tableFile));
    const image = (type: 'Backglass' | 'DMD') => {
      if (!table || !loc.root) return undefined;
      try {
        return resolveMedia(table, loc.root, type).files.find(isVrImage);
      } catch {
        return undefined;
      }
    };
    const backglassImage = image('Backglass');
    const dmdImage = image('DMD');
    const folder = path.dirname(tableFile);
    let directb2s = false;
    try {
      directb2s = fs.readdirSync(folder).some((f) => /\.directb2s$/i.test(f));
    } catch {
      // Dossier illisible : pas de directb2s.
    }
    const packs = activePacks(folder);
    // Cadres DMD de la scène (pièce VR seulement : sinon la bande sous le fronton de VPX).
    const dmdFrames = addBackglass ? [] : (vpxDmdFrames(tableFile) ?? []);
    const facts = {
      ownRoom: !addBackglass,
      pupPack: packs.length > 0,
      dmdFrame: dmdFrames.length > 0,
      pupDmd: packs.some((pack) => {
        const dir = pupVideosDir(folder);
        return dir !== undefined && packDrawsDmd(path.join(dir, pack));
      }),
      directb2s,
      backglassImage: Boolean(backglassImage),
      dmdImage: Boolean(dmdImage),
      script: readTableScript(tableFile),
    };
    return { sources: vrSources(facts), roomDmd: roomDmdSetting(facts), dmdFrames, ...(backglassImage ? { backglassImage } : {}), ...(dmdImage ? { dmdImage } : {}) };
  }

  /** Tables sans source de fronton ou de DMD dans le casque (relevé au démarrage), pour la santé de la borne. */
  let vrSourcesMissing: string[] = [];

  /** Partie visible du fronton de VPX en VR, gardée par table (fronton-vr.ts). */
  function vrZonesFile(): string {
    return path.join(loc.dataDir, 'vr', 'fronton-zones.json');
  }
  function vrMeasuresFile(): string {
    return path.join(loc.dataDir, 'logs', 'casque-vpx.txt');
  }
  function vrCapturesDir(): string {
    return path.join(loc.dataDir, 'logs', 'captures-casque');
  }

  /**
   * Avant une partie dans le casque : la partie précédente reportée si elle ne l'a pas été (Cyber Pinball fermé
   * pendant la partie), le fichier de mesures réduit à ses 400 dernières lignes, les captures gardées à 8.
   */
  /** Fichier des écrans de chaque table dans le casque (vr-ecrans.ts). */
  function vrScreensFile(): string {
    return path.join(loc.dataDir, 'vr', 'ecrans-vr.json');
  }

  function readVrScreens(): VrScreensStore {
    try {
      const data = JSON.parse(readTextIfExists(vrScreensFile()) || '{}') as unknown;
      return data && typeof data === 'object' && !Array.isArray(data) ? (data as VrScreensStore) : {};
    } catch {
      return {};
    }
  }

  /** Tables dont un cadre était mal rempli à la dernière partie, pour la santé de la borne. */
  let vrPoorFill: string[] = [];

  /**
   * Ce qu'une partie dans le casque apprend des écrans de la table, gardé pour la suivante : proportions de PuP,
   * réglage du joueur, remplissage de chaque cadre ; un cadre mal rempli est dit au journal et dans la santé.
   */
  function noteVrScreens(text: string, when: string): void {
    const { table: key, entry } = parseVrScreensBlock(text);
    if (!key) return;
    const title = ctx.tables.find((x) => vrTableKey(x.file) === key)?.title;
    const store = mergeVrScreens(readVrScreens(), key, { ...entry, ...(title ? { title } : {}) });
    try {
      fs.mkdirSync(path.dirname(vrScreensFile()), { recursive: true });
      writeFileAtomic(vrScreensFile(), JSON.stringify(store, null, 1));
    } catch (error) {
      console.warn(`Casque : écrans de la table pas enregistrés (${(error as Error).message}).`); // i18n-ignore : journal
    }
    vrPoorFill = poorFillSummary(store);
    const name = title ?? decodeURIComponent(key);
    if (entry.pupRatio || entry.pupDmdRatio) console.log(`Casque, écrans de ${name}${when} : proportions de PuP apprises${entry.pupRatio ? `, fronton ${entry.pupRatio}` : ''}${entry.pupDmdRatio ? `, DMD ${entry.pupDmdRatio}` : ''} ; reprises à la prochaine partie.`); // i18n-ignore : journal
    if (entry.adjust) console.log(`Casque, écrans de ${name}${when} : réglage du joueur gardé (${Object.entries(entry.adjust).map(([k, v]) => `${k} ${v}`).join(', ')}).`); // i18n-ignore : journal
    const poor = poorlyFilled(entry);
    if (entry.fill) console.log(`Casque, remplissage des écrans de ${name}${when} : ${Object.entries(entry.fill).map(([k, v]) => `${k} ${Math.round((v ?? 0) * 100)} %`).join(', ')}${poor.length ? ` ; VR : écran mal rempli (${poor.map((p) => p.frame).join(', ')}), réglable en partie : Pause, « Ajuster les écrans »` : ''}.`); // i18n-ignore : journal
  }

  function prepareVrMeasures(): void {
    try {
      fs.mkdirSync(path.dirname(vrMeasuresFile()), { recursive: true });
      noteVrMeasures(true);
      const lines = readTextIfExists(vrMeasuresFile()).split(/\r?\n/);
      if (lines.length > 400) fs.writeFileSync(vrMeasuresFile(), lines.slice(-400).join('\n'));
      fs.mkdirSync(vrCapturesDir(), { recursive: true });
      const old = fs
        .readdirSync(vrCapturesDir())
        .filter((f) => f.endsWith('.png'))
        .map((f) => ({ f, t: fs.statSync(path.join(vrCapturesDir(), f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
        .slice(8);
      for (const { f } of old) fs.rmSync(path.join(vrCapturesDir(), f), { force: true });
    } catch (error) {
      console.warn(`Casque : mesures de la partie pas préparées (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }

  /** La partie visible du fronton, en clair pour le journal. */
  function describeBackglassView(view: VrBackglassView): string {
    const pct = (v: number) => `${Math.round(v * 100)} %`;
    const z = view.zone;
    const where = z.left === 0 && z.top === 0 && z.right === 1 && z.bottom === 1 ? 'tout le fronton visible' : `partie visible : de ${pct(z.left)} à ${pct(z.right)} de sa largeur, de ${pct(z.top)} à ${pct(z.bottom)} de sa hauteur depuis le haut`; // i18n-ignore : journal
    const by = view.occluders.length ? ` ; caché à ${pct(view.hidden)} par ${view.occluders.slice(0, 3).map((o) => `${o.name} (${pct(o.share)})`).join(', ')}` : ''; // i18n-ignore : journal
    const maybe = view.uncertain.length ? ` ; selon le script, peut-être aussi par ${view.uncertain.slice(0, 3).map((o) => `${o.name} (${pct(o.share)})`).join(', ')} (la capture de la partie le dira)` : ''; // i18n-ignore : journal
    return `fronton de VPX : ${where}${by}${maybe}, le fronton et la pause y sont dessinés`; // i18n-ignore : journal
  }

  /**
   * Après une partie dans le casque (ou avant la suivante, pour une partie pas encore reportée : `late`) : ce
   * que le plugin a mesuré, et ses captures, au journal ; le bloc est alors marqué « rapporte ».
   */
  function noteVrMeasures(late = false): void {
    const block = lastVrMeasuresBlock(readTextIfExists(vrMeasuresFile()));
    if (!block || block.reported) return;
    try {
      fs.appendFileSync(vrMeasuresFile(), `rapporte ${new Date().toISOString()}\n`);
    } catch {
      // Marque impossible : le bilan pourrait revenir une fois de plus, sans gravité.
    }
    const when = late ? ' (partie précédente, pas reportée à sa fin)' : ''; // i18n-ignore : journal
    noteVrScreens(block.text, when);
    // Le geste du calage en partie (deux joysticks tenus 3 s) : où il s'est arrêté, s'il a été tenté.
    const calibrationReport = inGameCalibrationReport(block.text);
    if (calibrationReport) console.log(`Casque, calage en partie${when} : ${calibrationReport}.`); // i18n-ignore : journal
    for (const line of inGameCalibrationLines(block.text)) console.log(`Casque, calage en partie${when}, ${line}.`); // i18n-ignore : journal
    const m = parseVrMeasures(block.text);
    if (!m) {
      console.log(`Casque, mesures de VPX${when} : aucune (partie de moins de 5 s).`); // i18n-ignore : journal
      return;
    }
    const f = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
    // La cadence : palier (VPX bridé à une cadence fixe) et minuterie de Windows, dits avant le verdict.
    const cadence = parseVrCadence(block.text, lastLinkNetwork?.hz ?? 72);
    const capped = vrCadenceCapped(cadence);
    if (cadence) for (const line of describeVrCadence(cadence)) (capped ? console.warn : console.log)(`Casque, cadence de VPX${when} : ${line}.`); // i18n-ignore : journal
    const cadenceTest = vrCadenceTest(block.text, cadence);
    if (cadenceTest) console.log(`Casque, essai de cadence${when} : ${describeVrCadenceTest(cadenceTest)}.`); // i18n-ignore : journal
    // Sortie demandée casque retiré : VPX se fige en quittant (il attend une image que le casque ne demande plus).
    const quit = vrQuitWithoutHeadset(block.text);
    if (quit) console.log(`Casque, sortie${when} : demandée à ${Math.round(quit.at)} s de partie, casque retiré (VPX sans image depuis ${f(quit.idleMs / 1000)} s) ; VPX attend alors une image que le casque ne demande plus et se fige en quittant, jusqu’à ce que Cyber Pinball le ferme : la partie était finie, ce n’est pas un plantage en jeu.`); // i18n-ignore : journal
    if (m.samples && !late) {
      const verdict = fluidityVerdict(lastLinkNetwork, m.vpx.mean);
      const pct = lastLinkNetwork ? `${(lastLinkNetwork.lostShare * 100).toFixed(1).replace('.', ',')} %` : '';
      const fps = m.vpx.mean.toFixed(1).replace('.', ',');
      if (verdict === 'network') console.log(`Casque, verdict : réseau en cause (${pct} d'images perdues par Link alors que VPX tient sa cadence, ${fps} images/s)${airLinkOverWifi(lastLinkNetwork?.transport, pcNetwork) ? ' ; Air Link sur un PC en Wi-Fi : reliez le PC au routeur par un câble Ethernet, ou passez au câble USB Link' : ''}.`); // i18n-ignore : journal
      else if (verdict === 'render') console.log(`Casque, verdict : ${capped ? 'VPX bridé' : 'rendu en cause'} (VPX à ${fps} images/s, sous la cadence du casque ; Link perd ${pct} des images).`); // i18n-ignore : journal
      else if (verdict === 'both') console.log(`Casque, verdict : réseau et ${capped ? 'bridage de VPX' : 'rendu'} en cause (${pct} d'images perdues par Link, VPX à ${fps} images/s).`); // i18n-ignore : journal
      else if (verdict === 'ok') console.log(`Casque, verdict : fluide (VPX ${fps} images/s, ${pct} d'images perdues par Link).`); // i18n-ignore : journal
    }
    if (m.samples)
      console.log(
        `Casque, mesures de VPX${when} (${m.samples} relevé(s) de 5 s) : VPX ${f(m.vpx.mean)} images/s (de ${f(m.vpx.min)} à ${f(m.vpx.max)}), plus grand écart entre deux images ${Math.round(m.worstGapMs)} ms ; fronton dessiné ${f(m.backglass)} fois/s ; vidéo de PuP la plus active ${f(m.video.mean)} nouvelles images/s (de ${f(m.video.min)} à ${f(m.video.max)}) ; temps de jeu ${f(m.gameTime, 2)} s par seconde.`, // i18n-ignore : journal
      );
    if (m.roomDmd) console.log(`Casque, cadre DMD de la pièce VR${when} : ${m.roomDmd === 'aucune' ? 'rien de dessiné (VR : pas de source DMD pour cette table)' : m.roomDmd === 'PUP' ? 'écran DMD de PuP' : 'image du DMD de Cyber Pinball'}.`); // i18n-ignore : journal
    if (m.drawn) console.log(`Casque, sources dessinées${when} : fronton ${m.drawn.backglass === 'aucune' ? 'aucune (fond de Cyber Pinball)' : m.drawn.backglass}, bande du DMD ${m.drawn.dmd === 'sans_bande' ? 'aucune (DMD de la pièce VR de la table)' : m.drawn.dmd}, scores ${m.drawn.scores === 'rom' ? 'dessinés (ROM, FlexDMD ou UltraDMD)' : (m.drawn.scores ?? 'aucun')}.`); // i18n-ignore : journal
    const shots = fs.existsSync(vrCapturesDir())
      ? fs
          .readdirSync(vrCapturesDir())
          .filter((x) => x.endsWith('.png'))
          .map((x) => path.join(vrCapturesDir(), x))
          .sort()
      : [];
    for (const c of m.captures)
      console.log(`Casque, capture de l'aperçu VR${when} (${c.name === 'pause' ? 'au menu de pause' : c.name === 'essai' ? 'essai de cadence, fenêtre cachée' : '8 s après le début'}) : ${c.ok ? `prise ${c.source === 'ecran' ? "sur l'écran" : 'dans la fenêtre'}, luminosité ${c.brightness}${c.brightness < 2 ? ' (noire)' : ''}, ${shots.filter((x) => x.endsWith(`-${c.name}.png`)).pop() ?? '?'}` : c.reason === 'apercu_reduit' ? 'pas prise (aperçu réduit à un timbre : la recopie sur l’écran du plateau est éteinte)' : 'échec'}.`); // i18n-ignore : journal
  }

  /** Profil graphique appliqué à la partie dans le casque en cours (vr-profil.ts), dit au relevé de Link. */
  let vrProfileApplied: string | undefined;
  /** Début de la partie dans le casque en cours (VPX a le casque), pour le relevé de Link. */
  let vrGameStart: number | undefined;

  /** La carte du casque : dite par le compagnon, sinon gardée de la dernière fois (carte.json). */
  function headsetGpu(): VrGpu | undefined {
    if (headset?.gpu) return headset.gpu;
    try {
      const raw = JSON.parse(readTextIfExists(path.join(loc.dataDir, 'vr', 'carte.json'))) as Partial<VrGpu>;
      return typeof raw.vramMb === 'number' ? { vramMb: raw.vramMb, laptop: Boolean(raw.laptop), name: String(raw.name ?? '') } : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Le profil graphique de la machine dans l'INI de la VR : seulement les clés vides (un réglage du joueur
   * l'emporte). Rend le profil et sa raison, pour le journal.
   */
  function applyVrProfile(ini: string, details: string[]): string {
    const gpu = headsetGpu();
    const { id, why } = vrGraphicsProfile(gpu);
    const doc = IniDocument.parse(readTextIfExists(ini));
    const missing = vrProfileSettings(id).filter((s) => !doc.get(s.section, s.key)?.trim());
    if (missing.length) writeIniSettings(ini, missing);
    const applied = `${id} (${why}${gpu?.name ? `, ${gpu.name}` : ''})`;
    details.push(`profil VR ${applied} : ${missing.length ? missing.map((s) => `${s.key} ${s.value}`).join(', ') : 'rien à écrire, réglages déjà choisis'}`); // i18n-ignore : journal
    return applied;
  }

  /**
   * Après une partie dans le casque : les statistiques de Link minute par minute (journal de performance
   * d'Oculus), et le bilan, avec le profil appliqué ; de quoi comparer un profil à un autre.
   */
  /** Les 4 derniers Mo du journal de performance d'Oculus le plus récent (PerfLog_*.json) ; '' sans journal. */
  function readOculusPerfLog(): string {
    const dir = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Oculus') : undefined;
    let text = '';
    try {
      const logs = dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^PerfLog_.*\.json$/.test(f)).map((f) => path.join(dir, f)) : [];
      const latest = logs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
      if (latest) {
        // Les dernières minutes sont à la fin : 4 Mo suffisent.
        const size = fs.statSync(latest).size;
        const length = Math.min(size, 4 * 1024 * 1024);
        const fd = fs.openSync(latest, 'r');
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, size - length);
        fs.closeSync(fd);
        text = buffer.toString('latin1');
      }
    } catch {
      // Journal d'Oculus illisible : rien à relever.
    }
    return text;
  }

  function noteLinkStats(from: number, to: number): void {
    const text = readOculusPerfLog();
    const rows = linkStatsBetween(text, from / 1000, to / 1000);
    const time = (s: number) => new Date(s * 1000).toISOString().slice(11, 19);
    for (const r of rows) console.log(`Link pendant la partie (${time(r.at)}) : ${r.presented} images présentées, ${r.lost} perdues, ${r.stale} réaffichées plus de 5 fois, ${r.appFrames} images de l’application${r.encode ? `, encodage ${r.encode}` : ''}.`); // i18n-ignore : journal
    const sum = linkStatsSummary(rows);
    // Le réseau de la partie : pertes, coupures, débits, aller-retour ; le verdict vient avec les mesures de VPX (noteVrMeasures).
    lastLinkNetwork = linkNetworkSummary(linkMinutesBetween(text, from / 1000, to / 1000));
    linkMode = lastLinkNetwork?.transport ?? linkMode;
    if (lastLinkNetwork) {
      const n = lastLinkNetwork;
      const f = (v: number | undefined, d = 0) => (v === undefined ? '?' : v.toFixed(d).replace('.', ','));
      console.log(`Link, réseau de la partie (${n.transport === 'air' ? 'Air Link' : n.transport === 'cable' ? 'câble USB' : 'transport inconnu'}) : ${f(n.lostShare * 100, 1)} % d'images perdues, ${f(n.glitchesPerMinute)} coupures par minute, débit d'encodage ${f(n.bitrate)} Mbit/s, débit utile ${f(n.goodput)} Mbit/s, aller-retour réseau au 99e centile jusqu'à ${f(n.worstRttP99)} ms.`); // i18n-ignore : journal
    }
    console.log(sum ? `Link, bilan de la partie (profil VR ${vrProfileApplied ?? 'inconnu'}) : ${sum.minutes} minute(s), par minute ${sum.presented} images présentées, ${sum.lost} perdues, ${sum.stale} réaffichées plus de 5 fois (pire minute : ${sum.worstStale}).` : `Link, bilan de la partie (profil VR ${vrProfileApplied ?? 'inconnu'}) : aucune statistique de Link pour cette partie (journal de performance d’Oculus absent ou partie de moins d’une minute).`); // i18n-ignore : journal
  }

  /**
   * Pendant le chargement d'une partie dans le casque (avant que VPX le prenne) : le bouton qui quitte la
   * partie, en gros sur le fronton (essai du 10 novembre 2026 : impossible de ressortir).
   */
  let headsetExitHint: string | undefined;
  /** Sous la consigne du chargement : l'avertissement du réseau du casque, une fois par session (vr-reseau.ts). */
  let headsetExitNote: string | undefined;
  let headsetWornBefore = false;
  /**
   * Partie lancée dans le casque alors qu'il n'est pas sur la tête : la consigne, en grand sur le playfield et
   * le fronton de la borne, de l'appui sur Start à la fin de la partie. VPX attend le casque pour démarrer la
   * table (essai du 12/11/2026, The Addams Family : 3 min sans rien sur la borne, VPX croyait bloqué).
   */
  let vrWearHint: { status: string; text: string; keys: string[] } | undefined;

  /** Le bouton Pause des manettes, et comment quitter, en clair : « B : pause · tenu : quitter ». */
  function exitHintText(): string | undefined {
    const el = controllerSetting().functions.retour;
    return el ? t('{bouton} : pause · tenu : quitter', { bouton: CONTROLLER_ELEMENTS[el]?.label ?? el }) : undefined;
  }

  /** Le casque est là : le compagnon l'a trouvé (« pret », état « shown ») ou le menu y est. */
  function headsetDetected(): boolean {
    return Boolean(headset && (headset.state === 'shown' || headset.inUse));
  }

  /** Le rappel des touches de la pause dans le casque, avec les vrais boutons : « Joystick : choisir · A : valider ». */
  function pauseKeyLabels(): { help?: string; resumeHint?: string } {
    const { valider, retour } = controllerSetting().functions;
    const label = (el: ControllerElement | undefined) => (el ? CONTROLLER_ELEMENTS[el].label : undefined);
    const ok = label(valider);
    const back = label(retour);
    return {
      ...(ok ? { help: t('Joystick : choisir · {bouton} : valider', { bouton: ok }) } : {}),
      ...(back ? { resumeHint: t('{bouton} : reprendre', { bouton: back }) } : {}),
    };
  }

  /** Têtes relevées par le compagnon en veille pendant la partie dans le casque (toutes les 5 s). */
  let gameHeads: HeadPose[] = [];
  /**
   * Ce que la dernière partie dans le casque a montré de la pièce de VPX : joué dos à la borne calée
   * (roomMismatchProblem), ou « Réinitialiser la vue » fait dans VPX ; dit à l'écran du calage.
   */
  let vrRoomProblem: string | undefined;

  /**
   * Première tête relevée par le compagnon en veille pendant une partie dans le casque : au journal,
   * avec le milieu de la barre avant calée vu de cette tête (devant, à droite, sous les yeux). Une
   * table de VPX ailleurs que là se compare ainsi à la pièce du calage.
   */
  function headInGame(head: HeadPose): void {
    gameHeads.push(head);
    if (headLogged) return;
    headLogged = true;
    const deg = (r: number) => Math.round((r * 180) / Math.PI);
    const place = readCabinetPlace(headsetPlaceFile());
    let where = 'aucune borne calée'; // i18n-ignore : journal
    if (place) {
      const { left, right } = placeLockbar(place);
      const forward = { x: -Math.sin(head.yaw), z: -Math.cos(head.yaw) };
      const dx = (left.x + right.x) / 2 - head.x;
      const dz = (left.z + right.z) / 2 - head.z;
      where = `milieu de la barre avant calée à ${(dx * forward.x + dz * forward.z).toFixed(2)} m devant, ${(dx * -forward.z + dz * forward.x).toFixed(2)} m à droite, ${(head.y - (left.y + right.y) / 2).toFixed(2)} m sous les yeux`; // i18n-ignore : journal
    }
    console.log(`Réalité virtuelle : tête du joueur pendant la partie en (${head.x.toFixed(3)} ; ${head.y.toFixed(3)} ; ${head.z.toFixed(3)}), lacet ${deg(head.yaw)}° ; ${where}.`); // i18n-ignore : journal
  }

  /**
   * Calage proposé d'office dans le casque : seulement quand le casque a été retiré puis remis en limite fixe
   * (shouldOfferCalibration, décision du 13 novembre 2026) ; caler, ou passer en gardant le calage précédent.
   * Les autres moments (premier port, limite changée) sont seulement écrits au journal.
   */
  function offerCalibration(reason: CalibrationOfferReason): boolean {
    if (calibration || controllerWizard || ctx.playing || ctx.launch || calibrateUnavailable() || !headset?.worn) return false;
    if (!shouldOfferCalibration(reason, headset.roomKeeping)) {
      if (reason !== 'premier-port') console.log(`Casque : calage pas proposé d'office (${reason}, pièce ${headset.roomKeeping === 'kept' ? 'gardée par le Quest' : 'inconnue'}) ; les deux joysticks ou « Caler la borne » pour recaler.`); // i18n-ignore : journal
      return false;
    }
    console.log(`Casque : calage de la borne proposé d'office (${reason === 'limite-changee' ? 'calage périmé : la limite du Quest a changé' : reason === 'origine-remise' ? 'pièce refaite par le Quest au port du casque' : reason === 'sans-contour' ? 'borne calée sans contour de la limite, une fois' : 'casque remis, pièce recentrée par le Quest'}).`); // i18n-ignore : journal
    openCalibration(true);
    return true;
  }

  /** Signature du calage périmé déjà dit au journal pendant cette session de Cyber Pinball (staleCalibration). */
  let staleSaid: string | undefined;
  /** L'avis « la limite du Quest a changé » vient du calage périmé (pas d'une limite redessinée) : retiré avec lui. */
  let staleNotice = false;

  /**
   * Calage périmé (staleCalibration : la limite du Quest a changé de type ou de taille depuis le calage) : dit une
   * fois au journal, et le calage proposé une seule fois au menu, retenu dans `<données>\vr\calage-perime.json`
   * (demande du 13 novembre 2026). Pas encore proposable (casque pas sur la tête, partie) : redit au prochain port.
   */
  function checkStaleCalibration(): void {
    if (!headset || headsetSetting() === 'bureau') return;
    const stale = staleCalibration(headset.place(), headset.roomKeeping, headset.room);
    const file = path.join(loc.dataDir, 'vr', 'calage-perime.json');
    if (!stale) {
      // La limite est de nouveau celle du calage (un verdict passé était faux, ou le joueur l'a remise) : l'avis à
      // l'écran et la marque « déjà proposé » sont retirés, un vrai changement futur sera proposé de nouveau.
      if (!boundaryOf(headset.roomKeeping)) return;
      if (staleNotice) roomNotice = false;
      staleNotice = false;
      staleSaid = undefined;
      if (fs.existsSync(file)) {
        try {
          fs.rmSync(file, { force: true });
          console.log('Casque : limite du Quest de nouveau celle du calage ; la marque du calage périmé est retirée.'); // i18n-ignore : journal
        } catch {
          // Dossier de la VR en lecture seule : la marque reste, sans gravité.
        }
      }
      return;
    }
    let offered: string | undefined;
    try {
      offered = (JSON.parse(fs.readFileSync(file, 'utf8')) as { signature?: string }).signature;
    } catch {
      // Jamais proposé.
    }
    if (offered === stale.signature) return;
    if (staleSaid !== stale.signature) {
      staleSaid = stale.signature;
      console.warn(`Casque : calage périmé, ${stale.log} ; le calage est proposé une fois dans le front-end (ou les deux joysticks, « Caler la borne »).`); // i18n-ignore : journal
    }
    roomNotice = true;
    staleNotice = true;
    if (!offerCalibration('limite-changee')) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ signature: stale.signature, proposee: new Date().toISOString() }, null, 2) + '\n');
    } catch {
      // Dossier de la VR en lecture seule : la proposition reviendra, sans gravité.
    }
  }

  function calibrateUnavailable(): boolean {
    return calibrateMenuText({ vrReady: probeVr().ready, headset: headset?.state }).unavailable;
  }

  /**
   * Calage en cours : les points touchés (coin gauche, coin droit, milieu), la place proposée, et où
   * revenir ; `intro` : l'écran d'accueil du calage proposé d'office (caler ou passer) ; `validated` :
   * les calages validés depuis l'ouverture (chacun appliqué aussitôt, le dernier gardé).
   */
  let calibration: { points: Partial<Record<CalibrationStep, Point3>>; place?: CabinetPlace; back: 'menu' | 'system'; placing?: boolean; intro?: boolean; validated: number; grip?: GripOffset; head?: { x: number; z: number } } | undefined;

  function openCalibration(intro = false): void {
    if (!headset || calibration || controllerWizard || ctx.playing || ctx.launch) return;
    calibration = { points: {}, back: ctx.state.phase === 'menu' ? 'menu' : 'system', validated: 0, ...(intro && { intro: true }) };
    headset.calibrate(true);
    console.log(`Casque : calage de la borne ouvert${intro ? ' (caler ou passer)' : ''}.`); // i18n-ignore : journal
    showCalibration();
  }

  /** L'écran du calage, à l'étape où il en est (ou ce qui ne va pas, et il reprend au coin gauche). */
  function showCalibration(problem?: string): void {
    const c = calibration;
    if (!c) return;
    const p = c.points;
    // Une consigne courte, en très gros au milieu du regard (fronton : headsetPrompt) ; un seul bouton
    // valide et sort (A), B sort sans rien changer (demande du 10 novembre 2026).
    const desk = headsetSetting() === 'bureau';
    const text = c.placing ? t('Pose de la borne…') : c.place ? t('Borne placée') : p.left ? t('Touchez l’autre coin') : desk ? t('Regardez droit devant vous') : t('Manettes sur les coins de la barre');
    const keys = c.placing ? '' : t('Gâchette : placer · A : valider');
    // Un vrai problème seulement, le premier : point refusé, pièce de VPX différente, limite changée, table hors de portée.
    const issue =
      problem ??
      vrRoomProblem ??
      (headset?.keyRenewed ? t('Vérifiez la place de la borne.') : undefined) ??
      (roomNotice ? t('La limite du Quest a changé : recalez.') : undefined) ??
      (noContourNotice ? t('Calez la borne une fois : elle se replacera ensuite seule.') : undefined) ??
      (originNotice ? t('Le Quest a déplacé la pièce en remettant le casque : recalez.') : undefined) ??
      // Le geste est dit par la bande du bas quand les manettes l'ont : le conseil ne le répète pas.
      (c.intro ? roomKeepingAdvice(headset?.roomKeeping, calibrationCombo(headset?.profile ?? 'touch') ? undefined : calibrationComboLabel(headset?.profile)) : undefined) ??
      (c.place ? vpxPlaceProblem(placeVpxSettings(c.place)) : undefined);
    headset?.setMarks(calibrationMarks(c));
    // Le schéma des manettes (Touch) : les gâchettes pour placer ; la borne placée, A pour valider. En bas, le geste.
    const drawn = schemaProfile(headset?.profile);
    const combo = calibrationCombo(headset?.profile ?? 'touch');
    const schema = drawn && !desk && !c.placing ? (c.place ? ['a'] : ['gachette-gauche', 'gachette-droite']) : undefined;
    const lead = c.place ? 'A' : t('Gâchette');
    const prompt = {
      text,
      keys: c.place && keys ? t('A : valider · Gâchette : replacer') : keys,
      ...(schema && { schema, keysLead: lead }),
      ...(issue && { problem: issue }),
      ...(combo && !desk && { band: { ...(drawn && { schema: [...combo] }), text: t('À tout moment, enfoncez les deux sticks 3 s'), detail: t('pour recaler la borne, dans le front-end comme en partie') } }),
    };
    ctx.state = { ...ctx.state, phase: 'message', help: false, message: { title: t('Caler la borne'), lines: [text, ...(issue ? [issue] : []), ...(keys ? [keys] : [])], prompt } };
    broadcast();
  }

  /**
   * Repères du calage, dans l'espace de la borne du casque montrée : le coin gauche pris ; puis, la
   * borne posée sur les deux coins, ses coins et le milieu à toucher (ou celui touché).
   */
  function calibrationMarks(c: NonNullable<typeof calibration>): Point3[] {
    const p = c.points;
    if (c.place && p.right) {
      const [left, right] = lockbarMarks(c.place.lockbarWidth ?? 0);
      const middle = p.middle ? roomToCabinet(p.middle, c.place) : { x: 0, y: left!.y, z: left!.z };
      return [left!, right!, middle];
    }
    const shown = headset?.place() ?? { x: 0, z: 0, yaw: 0 };
    return p.left ? [roomToCabinet(p.left, shown)] : [];
  }

  /**
   * Points touchés, gâchette appuyée (compagnon : « pointes » quand les deux manettes sont sur les coins,
   * sinon « pointe »), avec la tête du joueur à cet instant. Les gâchettes prennent ou reprennent les
   * points autant de fois qu'on veut ; la borne vient aussitôt dessus. Le côté de la borne vient de la
   * tête (orderCorners), jamais de l'ordre des points ni de la main.
   */
  function calibrationPoints(points: readonly Point3[], room: boolean, head: { x: number; z: number } | undefined, pressed: 0 | 1 = 0, grips?: readonly [Point3, Point3]): void {
    const c = calibration;
    if (!c || !points.length) return;
    c.intro = false;
    // Les deux bouts et les deux prises au même instant : l'écart que le calage en partie (VPX, sur les prises) reprend.
    if (points.length >= 2 && grips) c.grip = gripOffset([points[0]!, points[1]!], grips) ?? c.grip;
    if (!room) {
      c.points = {};
      c.place = undefined;
      return showCalibration(t('Le casque n’a pas d’espace de la pièce (limite du Quest non définie) : le calage ne tiendrait pas d’une session à l’autre. Définissez la limite dans le Quest, puis recommencez.'));
    }
    // Les deux manettes sur les deux coins : la paire d'un coup, si elle fait une barre avant plausible ;
    // sinon le point de la gâchette pressée, second d'une paire, ou premier d'une nouvelle.
    const both = points.length >= 2 && !calibrationProblem(points[0]!, points[1]!);
    const one = points.length >= 2 ? points[pressed]! : points[0]!;
    const pair: [Point3, Point3] | undefined = both ? [points[0]!, points[1]!] : c.points.left && !c.points.right ? [c.points.left, one] : undefined;
    if (!pair) {
      c.points = { left: one };
      c.place = undefined;
      headset?.showPlace(undefined);
      return showCalibration();
    }
    const problem = calibrationProblem(pair[0], pair[1]);
    if (problem) {
      c.points = {};
      c.place = undefined;
      return showCalibration(problem);
    }
    const fallback = headset?.lastHead ?? { x: (pair[0].x + pair[1].x) / 2, z: (pair[0].z + pair[1].z) / 2 + 1 };
    const [left, right] = orderCorners(pair[0], pair[1], head ?? fallback);
    c.points = { left, right };
    // La tête à cet instant, mains sur les coins : la référence physique de la pièce gardée (roomFromHeads).
    c.head = head;
    // La borne du casque vient aussitôt sur la barre avant, ses coins marqués : de quoi juger avant de valider.
    c.place = lockbarPlace(left, right);
    headset?.showPlace(c.place);
    showCalibration();
  }

  /**
   * Pendant le calage, un seul bouton (demande du 10 novembre 2026) : les gâchettes placent la borne
   * (calibrationPoints), A valide et sort en gardant ce calage, B sort sans rien changer. Au bureau,
   * sans point, A pose la borne où regarde le joueur, puis sort. Joysticks : rien.
   */
  function calibrationKey(input: Input): boolean {
    if (input.isAutoRepeat) return true;
    if (ctx.KEYS.exit.includes(input.code)) closeCalibration();
    else if (ctx.KEYS.confirm.includes(input.code) && calibration?.place) {
      applyCalibration();
      closeCalibration();
    }
    // Au bureau, avant tout point : A pose la borne où regarde le joueur (recentrage, puis « centre »).
    else if (ctx.KEYS.confirm.includes(input.code) && calibration && !calibration.points.left && !calibration.placing && headsetSetting() === 'bureau') {
      calibration.intro = false;
      calibration.placing = true;
      showCalibration();
      headset?.recenter();
    }
    return true;
  }

  /** Recentrage demandé par « poser la borne ici » : la place du regard, barre avant à hauteur de borne, gardée. */
  function calibrationCentre(gaze: { x: number; z: number; yaw: number; eyes?: number }): void {
    const c = calibration;
    if (!c?.placing) return;
    // La hauteur tirée des yeux mesurés dans la même pièce, jamais du sol du Quest (essai du 10 novembre
    // 2026 : sol faux de 70 cm, yeux à 2,35 m, la borne posée « à 88 cm du sol » tombait par terre).
    c.place = freePlace(gaze, gaze.eyes);
    c.placing = false;
    applyCalibration();
    closeCalibration();
  }

  /**
   * Calage validé : appliqué aussitôt, sans quitter le calage. Gardés : la place de la borne du casque
   * (casque.json) et celle de la table de VPX (INI de la VR : [PlayerVR] Orientation, TableX/Y/Z ;
   * [Player] LockbarWidth/Height). Les points sont remis à zéro : on peut recommencer, autant de fois
   * qu'on veut, et le dernier validé reste.
   */
  function applyCalibration(): void {
    const c = calibration;
    if (!c?.place) return;
    const { left, right, middle } = c.points;
    // La limite du Quest est gardée avec le calage : si elle change, le calage est proposé de nouveau.
    const previous = headset?.place();
    const grip = c.grip ?? previous?.grip;
    // Avec le calage : la limite du Quest (taille et type, staleCalibration) et la tête du joueur (roomFromHeads).
    const boundary = boundaryOf(headset?.roomKeeping);
    const head = left && right ? c.head : undefined;
    const place: CabinetPlace = { ...c.place, ...(headset?.room && { room: headset.room }), ...(headsetSetting() === 'bureau' && { free: true }), ...(grip && { grip }), ...(boundary && { boundary }), ...(head && { head }) };
    // Recalage de la même vraie barre : l'écart à la précédente est celui de la pièce (mesuré, pas deviné).
    if (previous && isCalibrated(previous) && !previous.free && !place.free && left && right)
      console.log(`Casque : recalage, ${roomMeasureText(roomFromRecalibration(previous, place), 'barre avant recalée face à la précédente')}.`); // i18n-ignore : journal
    headset?.showPlace(place, true, true);
    roomNotice = false;
    originNotice = false;
    noContourNotice = false;
    roomStale = false;
    vrRoomProblem = undefined;
    if (headset) headset.keyRenewed = false;
    try {
      writeVrCalibration(loc.dataDir, left && right ? lockbarVpxSettings(left, right) : placeVpxSettings(place));
    } catch (error) {
      console.warn(`Casque : calage pas écrit dans l’INI de la VR (${(error as Error).message}).`); // i18n-ignore : journal
    }
    const gap = !left || !right ? ', posée sur le regard du joueur' : middle ? `, milieu touché à ${calibrationGap(left, right, middle).toFixed(1)} cm du milieu calé` : ', milieu pas vérifié'; // i18n-ignore : journal
    if (c.grip) console.log(`Casque : prises des manettes à ${Math.round(c.grip.up * 100)} cm au-dessus et ${Math.round(c.grip.back * 100)} cm en arrière de leurs bouts, écart ×${c.grip.widthRatio.toFixed(2)} (calage en partie par VPX).`); // i18n-ignore : journal
    console.log(`Casque : borne ${place.free ? 'posée au bureau' : 'calée'} (${ctx.menuConfiguration ?? 'configuration unique'}), barre avant de ${Math.round((place.lockbarWidth ?? 0) * 100)} cm à ${Math.round((place.lockbarHeight ?? 0) * 100)} cm du sol${gap} ; calage appliqué, l’écran du calage reste ouvert.`); // i18n-ignore : journal
    c.validated++;
    c.points = {};
    c.place = undefined;
    showCalibration();
  }

  /**
   * Fin du calage (« Terminer », B), ou compagnon parti : le dernier calage validé est déjà gardé ; un
   * calage commencé mais pas validé est oublié, la borne revient à sa place gardée.
   */
  function closeCalibration(): void {
    const c = calibration;
    if (!c) return;
    calibration = undefined;
    headset?.calibrate(false);
    headset?.setMarks([]);
    headset?.showPlace(undefined);
    console.log(c.intro ? 'Casque : calage passé, le calage précédent est gardé.' : `Casque : calage terminé (${c.validated ? `${c.validated} calage(s) validé(s), le dernier gardé` : 'rien de validé, la place précédente gardée'}).`); // i18n-ignore : journal
    if (c.back === 'menu') {
      ctx.state = { ...ctx.state, phase: 'menu', message: undefined };
      broadcast();
    } else library.openSystem();
  }

  /**
   * Rotation du playfield quand le menu est dans le casque : en portrait, comme sur une borne, même
   * sur un écran posé en paysage (demande du 9 novembre 2026). Un playfield déjà tourné (borne) garde
   * la sienne ; sinon un quart de tour, le bord des flippers à gauche de l'image.
   */
  function headsetTurn(): Rotation {
    return ctx.rotation === 0 || ctx.rotation === 180 ? 90 : ctx.rotation;
  }

  /**
   * Ce que le casque montre (casque.ts) : chaque rôle du menu, son rectangle sur le bureau et la
   * taille réelle de son écran (modèle de la borne).
   */
  function headsetSources(): HeadsetSource[] {
    const cabinet = loadCabinet(loc.dataDir);
    return ctx.roleRects.map(({ role, rect }) => {
      const screen = cabinet?.screens.find((s) => s.fingerprint === cabinet.roles[role]);
      return {
        role,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        ...(screen && { screenCm: { width: screen.widthCm, height: screen.heightCm }, screenPx: { width: screen.widthPx, height: screen.heightPx } }),
      };
    });
  }

  /**
   * Partie en VR (vr.ts) : l'INI préparé pour VPX, ou undefined (désactivée, aucun runtime OpenXR,
   * préparation impossible) : la partie se joue alors comme d'habitude, sur les écrans.
   */
  function prepareVr(tableFile: string, doubleIni: string | undefined): VrGame | undefined {
    if (vrMode !== 'auto') return undefined;
    const readiness = probeVr();
    if (!readiness.ready) {
      console.log(`Réalité virtuelle : activée mais indisponible (${readiness.reason}) ; partie sur les écrans.`); // i18n-ignore : journal
      return undefined;
    }
    // Casque éteint ou non relié : le compagnon ne le trouve pas (« casque-absent », casque.ts). La partie se
    // joue en mode normal, sans attente ni écran de Link ; l'option VR reste cochée pour la suivante.
    if (headset && !HEADSET_TRIAL_DIR && !headsetDetected()) {
      console.log(`Réalité virtuelle : casque non détecté (compagnon : ${headset.state}) ; partie en mode normal, l'option reste activée.`); // i18n-ignore : journal
      showBanner(t('Casque non détecté : partie en mode normal'));
      return undefined;
    }
    try {
      const vr = prepareVrGame({ dataDir: loc.dataDir, baseIni: doubleIni ?? activeVpxIni(loc), qualityIni: activeVpxIni(loc), tableFile, inPlace: Boolean(doubleIni), mirror: vrMirror });
      const backglass = !vr.room ? 'fronton ajouté par VPX' : vr.addBackglass ? 'pièce VR de la table, fronton capté par PuP sans flasher du fronton : fronton ajouté par VPX' : `pièce VR de la table, ${vr.backglassDisplays ?? '?'} flasher(s) du fronton`; // i18n-ignore : journal
      const details = [backglass, ...(vr.carried ? [`${vr.carried} réglage(s) de la VR repris`] : []), ...vr.changes]; // i18n-ignore : journal
      // L'INI propre à la table prime sur celui de la partie : ce qu'il impose et que VPX refuse en stéréo est neutralisé dans
      // une copie passée par -TableIni (le fichier du joueur n'est pas touché).
      const tableIni = findTableIni(tableFile);
      try {
        vr.tableIni = prepareVrTableIni(loc.dataDir, tableIni.exists ? tableIni.path : undefined);
      } catch (error) {
        details.push(`INI de la table pas neutralisé pour le casque (${(error as Error).message})`); // i18n-ignore : journal
      }
      if (vr.tableIni) details.push(`INI de la table ${path.basename(tableIni.path)} : ${vr.tableIni.refused.join(', ')}, refusé par VPX en stéréo ; neutralisé pour la partie dans le casque (copie passée par -TableIni, le fichier de la table n'est pas modifié)`); // i18n-ignore : journal
      // La pause dans le casque : le plugin « CyberPinball » dans VPX, activé dans cet INI seulement (pause-vr.ts).
      const vpxDir = vpxInstall(loc)?.exe;
      const pausePlugin = vpxDir ? installPausePlugin(path.dirname(vpxDir), path.join(__dirname, '..')) : 'missing';
      if (pausePlugin === 'missing' || pausePlugin === 'busy') details.push(`pause dans le casque indisponible (plugin ${pausePlugin === 'missing' ? 'absent' : 'occupé'})`); // i18n-ignore : journal
      else {
        writeIniSettings(vr.ini, pauseSettingsFor(readTextIfExists(vr.ini), { pause: t('Pause'), resume: t('Reprendre'), quit: t('Quitter'), ...pauseKeyLabels() }));
        // Fronton de VPX : la partie que la pièce VR de la table laisse voir (fronton-vr.ts), où le plugin dessine
        // le fronton et la pause ; mesures et captures de la partie, reportées au journal à la fin (noteVrMeasures).
        const view = vr.addBackglass ? cachedVrBackglassView(tableFile, vrZonesFile()) : undefined;
        const zone = view?.zone ?? FULL_BACKGLASS_ZONE;
        prepareVrMeasures();
        const sources = vrSourcesOf(tableFile, vr.addBackglass);
        writeIniSettings(vr.ini, [
          // Bande DMD sous le fronton que VPX pose (chaîne PuP, ScoreView, B2S), et images de secours.
          // Bande sous le fronton : le full DMD (PuP, puis l'image DMD du .directb2s avec son DMD incrusté), les scores
          // (ROM, FlexDMD, UltraDMD) dessinés par-dessus par le plugin ; jamais de DMD incrusté dans le fronton.
          { section: 'Plugin.CyberPinball', key: 'DmdOrder', value: 'PUP,B2S' },
          { section: 'Plugin.B2S', key: 'ScoreViewDMDOverlay', value: '1' },
          { section: 'Plugin.B2S', key: 'ScoreViewDMDAutoPos', value: '1' },
          { section: 'Plugin.B2S', key: 'BackglassDMDOverlay', value: '0' },
          { section: 'Plugin.CyberPinball', key: 'DmdBand', value: vr.addBackglass ? String(VR_DMD_BAND) : '0' },
          { section: 'Plugin.CyberPinball', key: 'BackglassImage', value: sources.backglassImage ?? '' },
          { section: 'Plugin.CyberPinball', key: 'DmdImage', value: sources.dmdImage ?? '' },
          // Cadre DMD de la pièce VR : la source que le plugin publie (PuP, image), ou aucune (DMD du script), à sa forme.
          { section: 'Plugin.CyberPinball', key: 'RoomDmd', value: sources.roomDmd },
          { section: 'Plugin.CyberPinball', key: 'RoomDmdRatio', value: String(sources.dmdFrames.find((f) => f.ratio)?.ratio ?? 1.7778) },
          // Écrans de la table : proportions de PuP apprises, réglages du joueur (vr-ecrans.ts), et « Ajuster les écrans ».
          ...vrScreensSettings(vrTableKey(tableFile), readVrScreens()[vrTableKey(tableFile)]),
          { section: 'Plugin.CyberPinball', key: 'AdjustLabel', value: t('Ajuster les écrans') },
          { section: 'Plugin.CyberPinball', key: 'BackglassLabel', value: t('Fronton') },
          { section: 'Plugin.CyberPinball', key: 'DmdLabel', value: 'DMD' },
          { section: 'Plugin.CyberPinball', key: 'AdjustChooseHelp', value: t('Joystick : choisir · A : régler · B : retour') },
          { section: 'Plugin.CyberPinball', key: 'AdjustHelp', value: t('Joysticks : position · Poignées : taille · A : garder · B : retour') },
          { section: 'Plugin.CyberPinball', key: 'Zone', value: zoneSetting(zone) },
          { section: 'Plugin.CyberPinball', key: 'LogFile', value: vrMeasuresFile() },
          { section: 'Plugin.CyberPinball', key: 'CaptureDir', value: vrCapturesDir() },
          // Essai de cadence (vr-cadence.ts) : une partie d'une minute qui fait la preuve du bridage sur la borne.
          ...(process.env.CYBERPINBALL_ESSAI_CADENCE === '1' ? [{ section: 'Plugin.CyberPinball', key: 'CadenceTest', value: '1' }] : []),
        ]);
        if (view) details.push(describeBackglassView(view)); // i18n-ignore : journal
        const missing = missingVrSources(sources.sources);
        const said = (v: string | undefined) => (v === 'room' ? 'celui de la pièce VR de la table' : (v ?? 'aucune')); // i18n-ignore : journal
        const frame = sources.dmdFrames.length ? ` (cadre DMD de la pièce VR : ${sources.dmdFrames.map((f) => f.name).join(', ')}${sources.roomDmd ? `, source publiée par le plugin : ${sources.roomDmd}` : ''})` : ''; // i18n-ignore : journal
        details.push(`sources dans le casque : fronton ${said(sources.sources.backglass)}, DMD ${said(sources.sources.dmd)}${sources.sources.fullDmd ? `, full DMD ${sources.sources.fullDmd}` : ''}${frame}${missing.length ? ` ; VR : pas de source ${missing.join(' ni de ')} pour cette table` : ''}`); // i18n-ignore : journal
        details.push(`pause dans le casque : plugin ${pausePlugin === 'installed' ? 'installé' : 'à jour'}, appui court sur Pause ou tenu ${QUIT_HOLD_S} s pour quitter`); // i18n-ignore : journal
      }
      // Une seule pose : la table de VPX où est la borne du casque (calée ou non), à chaque partie.
      const place = readCabinetPlace(headsetPlaceFile());
      if (place) {
        const table = vpxTableGeometry(tableFile);
        const menuWidth = menuPlayfield(headsetSources(), headsetTurn())?.width;
        const settings = placeVpxSettings(place, table, menuWidth);
        if (table) details.push(`table : plateau de ${table.widthCm.toFixed(1)} cm, vitre du bas à ${table.glassBottomCm.toFixed(1)} cm ; plateau recalé sur celui du front-end${menuWidth ? `, ${Math.round(menuWidth * 100)} cm de large` : ''}`); // i18n-ignore : journal
        writeIniSettings(vr.ini, settings);
        details.push(`place de la borne du casque${isCalibrated(place) ? ' calée' : ''} : ${settings.map((s) => `${s.key} ${s.value}`).join(', ')}`); // i18n-ignore : journal
        // Caler la borne en partie (les deux joysticks, ou « Caler la borne » de la pause) : VPX aligné sur les prises
        // des manettes tombe sur cette même place pour les mêmes bouts (calage.ts, inGameCalibration).
        if (pausePlugin !== 'missing' && pausePlugin !== 'busy') {
          const ig = inGameCalibration(place, table, menuWidth);
          writeIniSettings(vr.ini, [
            { section: 'PlayerVR', key: 'ControllerLockbarScale', value: String(ig.lockbarScale) },
            { section: 'PlayerVR', key: 'ControllerCabYOffset', value: String(ig.cabYOffset) },
            { section: 'Plugin.CyberPinball', key: 'Calibrate', value: '1' },
            { section: 'Plugin.CyberPinball', key: 'CalibrateHeight', value: String(ig.heightSteps) },
            { section: 'Plugin.CyberPinball', key: 'CalibrateLabel', value: t('Caler la borne') },
            { section: 'Plugin.CyberPinball', key: 'CalibrateHelp', value: t('Manettes sur les coins de la barre · Gâchette : caler · A ou B : reprendre') },
            // Le schéma des manettes sous « Caler la borne » (image prête, manettes dessinées) ; sinon le texte seul.
            { section: 'Plugin.CyberPinball', key: 'CalibrateImage', value: readyCalibrateImage(false) ?? '' },
            { section: 'Plugin.CyberPinball', key: 'CalibratedImage', value: readyCalibrateImage(true) ?? '' },
            { section: 'Plugin.CyberPinball', key: 'CalibratedLabel', value: t('Borne calée') },
            // VPX n'a pas calé (calage vérifié dans la couche du repère) : l'étape le dit au lieu de « Borne calée ».
            { section: 'Plugin.CyberPinball', key: 'CalibrateFailedLabel', value: t('Pas calée : manettes immobiles sur les coins de la barre, gâchette de nouveau') },
          ]);
          details.push(`calage en partie : ${calibrationCombo(controllerSetting().profile) ? 'les deux joysticks tenus 3 s, ou ' : ''}« Caler la borne » de la pause ; ControllerLockbarScale ${ig.lockbarScale}, ControllerCabYOffset ${ig.cabYOffset}, hauteur ${ig.heightSteps} cm${ig.measured ? '' : ' (prises des manettes pas encore mesurées : recalez dans le front-end)'}`); // i18n-ignore : journal
        }
        const far = vpxPlaceProblem(settings);
        if (far) details.push(`attention : ${far}`); // i18n-ignore : journal
      }
      // Son de la partie (table, ROM, PuP) dans le casque : sa sortie audio, si Windows en a une.
      const audio = findHeadsetAudio();
      if (audio) {
        writeIniSettings(vr.ini, vrAudioSettings(audio));
        details.push(`son dans le casque : « ${audio} »`); // i18n-ignore : journal
      } else details.push('son sur la sortie de la configuration (aucune sortie audio de casque)'); // i18n-ignore : journal
      // Profil graphique selon la carte du casque (vr-profil.ts), dans les clés vides seulement.
      vrProfileApplied = applyVrProfile(vr.ini, details);
      // Manettes : la même règle qu'au menu (manettes.ts), et plus d'alignement de la table sur les manettes.
      const input = vpxHeadsetInput(readTextIfExists(vr.ini), controllerSetting());
      if (input.length) {
        writeIniSettings(vr.ini, input);
        details.push(`manettes : ${input.length} liaison(s) de VPX alignée(s) sur celles du front-end`); // i18n-ignore : journal
      }
      console.log(`Réalité virtuelle : ${readiness.runtime}, INI de la partie ${vr.ini} (${details.join(' ; ')}).`); // i18n-ignore : journal
      return vr;
    } catch (error) {
      console.log(`Réalité virtuelle : préparation impossible (${(error as Error).message}) ; partie sur les écrans.`); // i18n-ignore : journal
      return undefined;
    }
  }
  /**
   * Après une partie dans le casque : VPX a-t-il gardé la table où est la borne ? Il réécrit sa place
   * en quittant proprement (VRDevice::SaveVRSettings) ; une place changée dit qu'elle a bougé pendant
   * la partie (touche 5, menu de VPX) : au journal, avec l'écart. La suivante repart de la borne.
   */
  /** Largeur du plateau et vitre du bas de la table, comme VPX les lit (readVpxGlass), en cm. */
  function vpxTableGeometry(tableFile: string): VpxTableGeometry | undefined {
    const glass = readVpxGlass(tableFile);
    const vpuCm = (2.54 * 1.0625) / 50;
    return glass ? { widthCm: (glass.right - glass.left) * vpuCm, glassBottomCm: glass.glassBottom * vpuCm } : undefined;
  }

  function checkVrPlaceAfterGame(ini: string, tableFile: string, room?: GameRoom): void {
    const place = readCabinetPlace(headsetPlaceFile());
    if (!place) return;
    // La place que VPX a lue au lancement : la référence de ce qu'il a écrit (les sauts ont reposé `place` depuis).
    const launched = room?.launchPlace ?? place;
    // La couche a corrigé son espace : ce que VPX a calé l'est dans le repère du lancement, reporté par les sauts.
    const carried = room && room.jumps && room.corrected() ? room.jump : undefined;
    const doc = IniDocument.parse(readTextIfExists(ini));
    // Borne recalée pendant la partie (le plugin : « calage-partie … resultat=ok ») : VPX a réécrit la place de sa
    // table en quittant ; la barre avant touchée devient celle de la borne du casque et des parties suivantes.
    const block = lastVrMeasuresBlock(readTextIfExists(vrMeasuresFile()));
    if (block && /^calage-partie .*resultat=ok/m.test(block.text)) {
      const num = (key: string) => Number(doc.get('PlayerVR', key));
      const saved = { orientation: num('Orientation'), tableX: num('TableX'), tableY: num('TableY') };
      if ([saved.orientation, saved.tableX, saved.tableY].every(Number.isFinite)) {
        const table = vpxTableGeometry(tableFile);
        const menuWidth = menuPlayfield(headsetSources(), headsetTurn())?.width;
        const inVpx = placeFromVpxCentering(saved, launched, inGameCalibration(launched, table, menuWidth), table, menuWidth);
        const next = carried ? movePlace(inVpx, carried) : inVpx;
        const gap = placeGap(place, next);
        headset?.showPlace(next, true, true);
        try {
          writeVrCalibration(loc.dataDir, placeVpxSettings(next));
        } catch (error) {
          console.warn(`Casque : calage fait en partie pas écrit dans l’INI de la VR (${(error as Error).message}).`); // i18n-ignore : journal
        }
        console.log(`Casque : borne recalée pendant la partie (les deux joysticks ou la pause) ; barre avant déplacée de ${gap.cm.toFixed(0)} cm, tournée de ${gap.deg.toFixed(0)}° ; la borne du front-end et les parties suivantes la suivent.`); // i18n-ignore : journal
        return;
      }
    }
    const moved = placeVpxSettings(launched, vpxTableGeometry(tableFile), menuPlayfield(headsetSources(), headsetTurn())?.width)
      .filter((s) => s.section === 'PlayerVR' && s.key !== 'TableZ')
      .map((s) => ({ key: s.key, want: Number(s.value), got: Number(doc.get(s.section, s.key)) }))
      .filter((m) => Number.isFinite(m.got) && Math.abs(m.got - m.want) > 1);
    if (!moved.length) return;
    console.warn(`Réalité virtuelle : VPX a déplacé la table pendant la partie (${moved.map((m) => `${m.key} ${m.want} → ${m.got}`).join(', ')}) ; la suivante repart de la borne du casque.`); // i18n-ignore : journal
    // Recentrée sur le regard (5 du pavé) : la tête que VPX a vue, à comparer à celle du compagnon. Un écart
    // dit que VPX et le compagnon n'ont pas la même pièce (calage de la pose de VPX, 10 novembre 2026).
    const num = (section: string, key: string) => (doc.get(section, key)?.trim() ? Number(doc.get(section, key)) : undefined);
    const seen = vpxRecenteredHead({ orientation: num('PlayerVR', 'Orientation') ?? 0, tableX: num('PlayerVR', 'TableX') ?? 0, tableY: num('PlayerVR', 'TableY') ?? 0, playerX: num('Player', 'ScreenPlayerX'), playerY: num('Player', 'ScreenPlayerY') });
    const head = headset?.lastHead;
    const deg = (r: number) => Math.round((r * 180) / Math.PI);
    console.warn(`Réalité virtuelle : si VPX a recentré la table (5 du pavé), il voyait la tête en (${seen.x.toFixed(3)} ; ${seen.z.toFixed(3)}), lacet ${deg(seen.yaw)}° ; le compagnon l'a vue en dernier en ${head ? `(${head.x.toFixed(3)} ; ${head.z.toFixed(3)}), lacet ${deg(head.yaw)}°` : 'aucun relevé'}.`); // i18n-ignore : journal
  }

  /**
   * Après une partie dans le casque : la pièce de VPX était-elle celle de la borne du casque ? Deux
   * signes, notés au journal et dits à l'écran du calage (essai du 10 novembre 2026, table derrière le
   * joueur) : le joueur a joué dos à la borne calée (têtes du compagnon en veille), ou VPX a reçu un
   * changement de pièce (« Réinitialiser la vue » de Link en jeu : le runtime le garde pour VPX seul).
   */
  function checkVrRoomAfterGame(vpxLog: string, from: number): void {
    const place = readCabinetPlace(headsetPlaceFile());
    const summary = place && gameHeads.length ? gameHeadSummary(gameHeads, place) : undefined;
    const measure = roomFromHeads(place, gameHeads);
    if (measure) console.log(`Casque : ${roomMeasureText(measure, `tête pendant la partie face à la tête au calage, ${measure.samples} relevé(s)`)}.`); // i18n-ignore : journal
    if (summary)
      console.log(`Réalité virtuelle : tête pendant la partie, ${summary.samples} relevé(s) : regard à ${Math.round(summary.meanAngle)}° de l’axe de la borne en moyenne, ${summary.turned} relevé(s) dos à elle, à ${summary.meanDistance.toFixed(2)} m de la barre avant en moyenne.`); // i18n-ignore : journal
    let changes = 0;
    try {
      const size = fs.existsSync(vpxLog) ? fs.statSync(vpxLog).size : 0;
      if (size > from) {
        const fd = fs.openSync(vpxLog, 'r');
        const buffer = Buffer.alloc(size - from);
        fs.readSync(fd, buffer, 0, buffer.length, from);
        fs.closeSync(fd);
        changes = vpxRoomChanges(buffer.toString('utf8'));
      }
    } catch {
      // Journal de VPX illisible : seul le relevé des têtes compte.
    }
    const mismatch = roomMismatchProblem(summary);
    if (mismatch) console.warn('Réalité virtuelle : le joueur a joué dos à la borne calée : la table de VPX n’était pas sur elle ; VPX avait une autre pièce que le compagnon.'); // i18n-ignore : journal
    if (changes) console.warn(`Réalité virtuelle : VPX a reçu ${changes} changement(s) de pièce pendant la partie (« Réinitialiser la vue » de Link en jeu) ; le runtime le garde pour VPX : la borne du casque est à recaler.`); // i18n-ignore : journal
    vrRoomProblem = mismatch ?? (changes ? t('« Réinitialiser la vue » a été fait pendant la dernière partie : le runtime garde ce recentrage pour VPX, et la table n’est plus sur la borne du casque. Recalez.') : undefined);
  }

  return {
    headsetButton,
    releaseHeadsetButtons,
    get headsetHoldView() {
      return headsetHoldView;
    },
    get controllerWizard() {
      return controllerWizard;
    },
    offerControllerWizard,
    closeControllerWizard,
    get vrMode() {
      return vrMode;
    },
    roomFrame,
    get portWatch() {
      return portWatch;
    },
    get headset() {
      return headset;
    },
    set headset(value: typeof headset) {
      headset = value;
    },
    ovrProbe,
    get headsetPaused() {
      return headsetPaused;
    },
    set headsetPaused(value: typeof headsetPaused) {
      headsetPaused = value;
    },
    headsetPlaceFile,
    headsetSetting,
    calibrationComboTip,
    readyCalibrateImage,
    get headsetCardView() {
      return headsetCardView;
    },
    roomscaleTip,
    anchorCheck,
    startGameRoom,
    endGameRoom,
    companionReady,
    headsetOriginReset,
    headsetPutBackOn,
    exitHeldNow,
    watchExitWhileWaiting,
    get headsetEyes() {
      return headsetEyes;
    },
    set headsetEyes(value: typeof headsetEyes) {
      headsetEyes = value;
    },
    get roomStale() {
      return roomStale;
    },
    set roomStale(value: typeof roomStale) {
      roomStale = value;
    },
    get vrGameStop() {
      return vrGameStop;
    },
    set vrGameStop(value: typeof vrGameStop) {
      vrGameStop = value;
    },
    headsetLost,
    get headLogged() {
      return headLogged;
    },
    set headLogged(value: typeof headLogged) {
      headLogged = value;
    },
    auditVrBackglass,
    get linkMode() {
      return linkMode;
    },
    get pcNetwork() {
      return pcNetwork;
    },
    get airLinkWarned() {
      return airLinkWarned;
    },
    set airLinkWarned(value: typeof airLinkWarned) {
      airLinkWarned = value;
    },
    refreshVrNetwork,
    vrNetworkFacts,
    noteVrMeasures,
    get vrGameStart() {
      return vrGameStart;
    },
    set vrGameStart(value: typeof vrGameStart) {
      vrGameStart = value;
    },
    noteLinkStats,
    get headsetExitHint() {
      return headsetExitHint;
    },
    set headsetExitHint(value: typeof headsetExitHint) {
      headsetExitHint = value;
    },
    get headsetExitNote() {
      return headsetExitNote;
    },
    set headsetExitNote(value: typeof headsetExitNote) {
      headsetExitNote = value;
    },
    get headsetWornBefore() {
      return headsetWornBefore;
    },
    set headsetWornBefore(value: typeof headsetWornBefore) {
      headsetWornBefore = value;
    },
    get vrWearHint() {
      return vrWearHint;
    },
    set vrWearHint(value: typeof vrWearHint) {
      vrWearHint = value;
    },
    exitHintText,
    headsetDetected,
    get gameHeads() {
      return gameHeads;
    },
    set gameHeads(value: typeof gameHeads) {
      gameHeads = value;
    },
    headInGame,
    offerCalibration,
    checkStaleCalibration,
    get calibration() {
      return calibration;
    },
    showCalibration,
    calibrationPoints,
    calibrationKey,
    calibrationCentre,
    closeCalibration,
    headsetTurn,
    headsetSources,
    prepareVr,
    checkVrPlaceAfterGame,
    checkVrRoomAfterGame,
  };
}
