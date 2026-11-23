// Cabinet model: the single source of truth. Every file of the third-party tools
// (VPinballX.ini, later ScreenRes.txt, PinUP, dmddevice.ini) is derived from it.

import type { HardwareDmdSetup } from './dmd';
import { t } from './i18n';
import type { FramingStyle } from './framing-styles';

export type RoleId = 'playfield' | 'backglass' | 'dmd' | 'topper';

export interface RoleInfo {
  id: RoleId;
  label: string;
  required: boolean;
}

/** Order of the setup wizard: from the most important to the most optional. */
export const ROLES: readonly RoleInfo[] = [
  { id: 'playfield', label: 'Playfield', required: true },
  { id: 'backglass', label: 'Backglass', required: false },
  { id: 'dmd', label: 'DMD', required: false },
  { id: 'topper', label: 'Topper', required: false },
];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Rotation = 0 | 90 | 180 | 270;

/** Roles shown in an ancillary window of VPX (Backglass, ScoreView, Topper). */
export type AncillaryRoleId = Exclude<RoleId, 'playfield'>;

/**
 * What the screen of the dmd role shows (VPX's ScoreView window):
 * - `fulldmd`: a wide screen (16:9) that shows the FullDMD media and screen 5 of the
 *   PuP-Packs, with the DMD of the ROM or of FlexDMD overlaid on top;
 * - `dmd`: the DMD alone, as a 4:1 strip (real DMD screen, strip below the backglass or behind
 *   the cut-out of the speaker panel, overlay in the playfield).
 */
export type DmdKind = 'fulldmd' | 'dmd';

/**
 * Part of a screen's image, in fractions of its width and height
 * (0 to 1, origin at the top left of the Windows image). A fraction survives a
 * change of the screen's resolution; pixels do not.
 *
 * The zone of the DMD role is that of VPX's ScoreView window, which stacks
 * two layers: the FullDMD as background (image of the .directb2s, screen 5 of a PuP-Pack)
 * and, on top, the DMD of the ROM, which the plugins place themselves in the
 * window (B2S: ScoreViewDMDOverlay and ScoreViewDMDAutoPos; PuP: screen 1 placed
 * on screen 5 by CustomPos).
 */
export interface ScreenZone {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Aspect ratio kept when the zone is resized (width over height, in pixels:
   * 16/9...). Absent: free aspect ratio.
   */
  aspect?: number;
}

/** What a screen's EDID contains (read from the Windows registry). */
export interface EdidInfo {
  /** Three-letter PNP manufacturer code, for example "SAM". */
  manufacturer: string;
  productCode: number;
  /** Binary serial number; 0 when the manufacturer does not fill it in. */
  serialNumber: number;
  /** Text serial number (descriptor 0xFF), often more reliable than the binary one. */
  serialText?: string;
  /** Model name (descriptor 0xFC). */
  monitorName?: string;
  widthCm: number;
  heightCm: number;
  /** Image size to the millimetre, read from the first detailed timing; more precise than the cm. */
  imageMm?: { width: number; height: number };
}

/**
 * A screen as seen at detection time. The GDI name and the position
 * change from one start to the next: they are observations, never keys.
 */
export interface ObservedDisplay {
  /** Windows GDI name, for example "\\.\DISPLAY13". Unstable. */
  gdiName: string;
  /** Friendly name returned by DisplayConfig; it is also the one VPX (through SDL) shows. */
  friendlyName: string;
  /**
   * Monitor description (EnumDisplayDevicesW, DeviceString), often "Moniteur
   * PnP générique" (Generic PnP Monitor). SDL uses it when the friendly name is empty.
   */
  monitorDescription?: string;
  /** Interface path of the monitor, for example "\\?\DISPLAY#SAM0C8D#8&1f2e3d4c&0&UID257#{...}". */
  devicePath: string;
  /** Position and size on the desktop, in physical pixels. */
  bounds: Rect;
  rotation: Rotation;
  primary: boolean;
  /** Windows scale factor (1 = 100%). Absent when it could not be read. */
  scale?: number;
  edid?: EdidInfo;
  /**
   * ContainerId of the PnP monitor (HKLM\SYSTEM\CurrentControlSet\Enum\DISPLAY\...).
   * The screen's HDMI speakers carry the same one: that is what ties them to it.
   */
  containerId?: string;
}

export type FingerprintStrength = 'strong' | 'weak';

/** A physical screen recorded in the cabinet model. */
export interface PhysicalScreen {
  fingerprint: string;
  strength: FingerprintStrength;
  label: string;
  widthPx: number;
  heightPx: number;
  widthCm: number;
  heightCm: number;
  /** Last observation, kept for diagnosis. */
  lastSeen?: ObservedDisplay;
}

/**
 * Edge of the playfield's Windows image closest to the player, where the
 * flippers are. On a cabinet, the screen often lies flat and rotated while Windows
 * stays in landscape: the player then stands at the left or right edge of the image.
 */
export type FlipperEdge = 'bottom' | 'left' | 'top' | 'right';

/** Clockwise rotation (degrees) to apply to a display so that it is upright as seen by the player. */
export function edgeRotation(edge: FlipperEdge): Rotation {
  return ({ bottom: 0, left: 90, top: 180, right: 270 } as const)[edge];
}

export interface PlayfieldLayout {
  flipperEdge: FlipperEdge;
  /**
   * Size of the display area entered in the setup wizard (diagonal), when the EDID
   * is missing or inconsistent (TVs, projectors). Takes precedence over the EDID.
   */
  manualSizeCm?: { width: number; height: number };
  /**
   * Windows orientation in which the playfield was set up, when the setup wizard had to
   * rotate the screen for VPX (vpxOrientationFix). Cyber Pinball gives it to the screen for the
   * session only and gives Windows its own back on exit (sessionorientation.ts). Absent:
   * the screen keeps the Windows orientation.
   */
  windowsRotation?: Rotation;
}

export interface Cabinet {
  version: 1;
  screens: PhysicalScreen[];
  /**
   * Role -> fingerprint of the physical screen that shows it. Several ancillary roles
   * can share a screen, each in its zone (`zones`); on the playfield's
   * screen, they are overlaid in its image.
   */
  roles: Partial<Record<RoleId, string>>;
  /**
   * Part of its screen taken by each role. Absent: the whole screen, as
   * in the models saved before zones. The playfield too may
   * take only part of its screen (desk PC).
   */
  zones?: Partial<Record<RoleId, ScreenZone>>;
  /**
   * FullDMD or DMD alone, as stated by the user (setup wizard, "Écran du DMD" (DMD screen)). Absent in the
   * models from before this choice: deduced from the proportions of the DMD's zone (dmdscreen.ts).
   */
  dmdKind?: DmdKind;
  /** Absent in the models saved before the orientation wizard: flippers at the bottom. */
  playfield?: PlayfieldLayout;
  /**
   * Managed keys of VPinballX.ini ("Section.Key") that the user chose to
   * keep after changing them by hand: Cyber Pinball no longer writes them.
   */
  vpxManual?: string[];
  /**
   * Cadrage des tables en vue borne, choisi par le joueur sur une image de sa table (framing-styles.ts). Absent :
   * le cadrage par défaut (« Plein écran, apron rogné »), proposé sans être imposé.
   */
  framing?: FramingStyle;
  /** Absent until the "Son" (Sound) step of the setup wizard has been done: no audio key is written. */
  audio?: CabinetAudio;
  /**
   * Key of each button, captured at the "Boutons" (Buttons) step of the setup wizard. Absent until
   * that step has been done: the interface follows the default keys of the encoders
   * and no [Input] key is written.
   */
  buttons?: CabinetButtons;
  /**
   * Buttons that drive the Cyber Pinball interface (previous, next, confirm,
   * back, help, settings), captured at the "Boutons de l'interface" (Interface buttons) step, independent of
   * those of the game. Absent (cabinet from before this step): the interface follows the game's buttons,
   * flippers, Start and Exit (defaultNavigation). VPX does not read them.
   */
  navigation?: NavigationButtons;
  /**
   * Analog plunger and accelerometer, captured at the "Lanceur" (Plunger) step (plunger.ts). Absent
   * until that step has been done: no sensor is written to [Input]; empty: the cabinet
   * has none, VPX reads none.
   */
  analog?: CabinetAnalog;
  /**
   * Cabinet tilt, decided at the "Tilt" step (tilt.ts): the cabinet's plumb bob (the
   * "Balancier de tilt" (Tilt bob) button of the "Boutons" step), plumb simulated by VPX, or none. Absent
   * until that step has been done: [Player] SimulatedPlumb and PlumbThresholdAngle stay as they are.
   */
  tilt?: CabinetTilt;
  /**
   * Screen of the built-in browser ("Récupérer" (Fetch) window): the one of this role, found by
   * its fingerprint whatever its number in Windows (browser-screen.ts). Absent:
   * automatic, the playfield if it is upright, else the largest of the other screens.
   */
  browserScreen?: RoleId;
  /**
   * Real DMDs (system menu > Ma borne > DMD et LED > DMD réel, dmd.ts): each model automatic, forced or
   * off, and the ZeDMD over wifi. Absent: all automatic, from the USB identifiers.
   */
  hardwareDmd?: HardwareDmdSetup;
  vpx: {
    iniPath: string;
  };
  updatedAt: string;
}

/** Cabinet buttons the setup wizard has assigned (list and order in buttons.ts). */
export type ButtonId =
  | 'leftFlipper'
  | 'rightFlipper'
  | 'start'
  | 'exit'
  | 'credit'
  | 'plunger'
  | 'leftMagna'
  | 'rightMagna'
  | 'extraBall'
  | 'pause'
  | 'tilt'
  | 'slamTilt'
  | 'coinDoor'
  | 'serviceDown'
  | 'serviceUp'
  | 'nudgeLeft'
  | 'nudgeRight'
  | 'nudgeCenter'
  | 'volumeDown'
  | 'volumeUp'
  | 'volumeMute';

/**
 * Button -> key it sends (KeyboardEvent.code: "ShiftLeft", "Digit1"...).
 * An optional button the cabinet lacks is not listed.
 */
export type CabinetButtons = Partial<Record<ButtonId, string>>;

/** Interface buttons (list and order in buttons.ts, NAVIGATION). */
export type NavigationId = 'previous' | 'next' | 'confirm' | 'back' | 'help' | 'settings' | 'desktop' | 'quit';

/** Interface button -> key or joystick button, like CabinetButtons. */
export type NavigationButtons = Partial<Record<NavigationId, string>>;

/** Analog sensors of the cabinet: a plunger, an accelerometer ("Lanceur" (Plunger) step). */
export interface CabinetAnalog {
  plunger?: PlungerSensor;
  nudge?: NudgeSensor;
  /** Accelerometer turned off by hand: a Pinscape plugged in is no longer proposed for it. */
  nudgeOff?: boolean;
}

/** Analog plunger: a joystick axis, as VPX reads it ([Input] Mapping.Plunger0.*). */
export interface PlungerSensor {
  /** Joystick, by its VPX identifier: "SDLJoy_<GUID>_<rank>". */
  device: string;
  /** Name given by SDL ("mjrnet Pinscape Controller"), for display. */
  name?: string;
  /** SDL number of the position axis, from 0 (Z of a Pinscape: 2). */
  axis: number;
  /** Pulling the plunger lowers the axis value. */
  reversed: boolean;
  /** Share of the travel ignored around rest, from 0 to 0.3. */
  deadZone: number;
  /** Axis of the speed measured by the board (RZ of a Pinscape in "X/Y/Z + RX/RY/RZ": 5). */
  speedAxis?: number;
}

/**
 * What makes the cabinet tilt: its mechanical plumb bob (a captured button, VPX does not simulate one),
 * the plumb that VPX simulates from nudges, or nothing.
 */
export type TiltMode = 'bob' | 'simulated' | 'none';

export interface CabinetTilt {
  mode: TiltMode;
  /** Angle at which the simulated plumb touches the ring, in degrees ([Player] PlumbThresholdAngle, 0.15 to 4). Kept when the mode changes. */
  threshold: number;
}

/** Cabinet accelerometer for nudges ([Input] Mapping.Nudge0.*, controller). */
export interface NudgeSensor {
  device: string;
  name?: string;
  /** SDL axes of lateral and longitudinal acceleration (X and Y of a Pinscape: 0 and 1). */
  x: number;
  y: number;
  /**
   * Strength of the nudges: VPX scale of both axes (plunger.ts, NUDGE_GAIN). Absent: 1,
   * the value read as is, like VPX's default layout for a Pinscape.
   */
  gain?: number;
  /** Axis inverted in VPX's menu (negative scale), kept as is. */
  invertX?: boolean;
  invertY?: boolean;
}

/**
 * Audio output as Windows sees it at detection time (MMDevices
 * registry, read only). As for screens, the name is an observation:
 * localised, renamable, sometimes shared by two identical cards.
 */
export interface ObservedAudioOutput {
  /** MMDevice identifier "{0.0.0.00000000}.{guid}": stable as long as the driver is not reinstalled. */
  endpointId: string;
  /** Name VPX expects, to the character: "DeviceDesc (interface)", for example "Haut-parleurs (USB Audio Device)". */
  friendlyName: string;
  /** Part before the parentheses, renamable in the Sound panel. */
  deviceDesc: string;
  /** Part between the parentheses, for example "2- USB Audio Device". */
  interfaceName: string;
  /** Bus of the device: HDAUDIO, USB, BTHENUM, ROOT (virtual)... */
  bus: string;
  /** Windows form factor (EndpointFormFactor): 1 speakers, 3 headphones, 9 digital output (HDMI, S/PDIF)... */
  formFactor: number;
  /** Channels set in Windows (2, 6, 8); 0 when the format cannot be read. */
  channels: number;
  /** Speaker mask (WAVEFORMATEXTENSIBLE.dwChannelMask). */
  channelMask: number;
  /** ContainerId of the device, shared with the screen for an HDMI output. */
  containerId?: string;
  /** Default output of Windows (Console role), when the registry tells. */
  isDefault?: boolean;
  /**
   * Jacks of the output, as its driver describes them (IKsJackDescription); absent when the driver
   * describes none (many USB cards, HDMI). Read even when Windows sets the card to stereo.
   */
  jacks?: ObservedAudioJack[];
}

/**
 * One jack of a sound card (KSJACK_DESCRIPTION). The role comes from the channels it carries
 * (front, rear, side, centre/LFE): reliable. The colour declared by the maker is often 0
 * (unspecified); the standard colours (green front, black rear, grey side, orange centre/LFE)
 * are named from the role, and only for a motherboard card (HDAUDIO).
 */
export interface ObservedAudioJack {
  /** Speaker mask carried by the jack (KSAUDIO_SPEAKER bits): 0x3 front, 0x30 rear, 0x600 side, 0xc centre/LFE. */
  channelMapping: number;
  /** Colour declared by the driver, 0xRRGGBB; 0 when unspecified. */
  color: number;
  /** EPcxGeoLocation: 1 rear, 2 front, 11 HDMI... */
  geoLocation: number;
  /** Something plugged in (jack sensing); a jack without sensing reports true. */
  connected: boolean;
  /**
   * The jack can sense a plug (IKsJackDescription2, JACKDESC2_PRESENCE_DETECT_CAPABILITY): without
   * it, `connected` says nothing. Undefined when the driver does not tell. A plug sensed is a cable
   * in the jack, not working exciters (amplifier off, unplugged further on).
   */
  presenceDetect?: boolean;
}

/** The two outputs of VPX: SoundDeviceBG (backglass: ROM, AltSound, PuP, music) and SoundDevice (playfield). */
export type AudioRole = 'backglass' | 'playfield';

export const AUDIO_ROLES: readonly { id: AudioRole; label: string }[] = [
  { id: 'backglass', get label() { return t('Son du fronton'); } },
  { id: 'playfield', get label() { return t('Son du plateau'); } },
];

/**
 * Mix of the table's sounds on the playfield output, translated into [Player] Sound3D:
 * stereo, surround (two pairs on the playfield) or SSF (front at the backglass, rear and sides on the playfield).
 */
export type PlayfieldAudioMode = 'stereo' | 'surround' | 'ssf';

/** An audio output recorded in the cabinet model. */
export interface AudioOutput {
  /** Main fingerprint. */
  endpointId: string;
  /** Fallback: finds an HDMI output recreated by the driver, through its screen. */
  containerId?: string;
  /** Fingerprint of the screen (PhysicalScreen) whose speaker this is. */
  screen?: string;
  label: string;
  /** Last observation, kept for diagnosis. */
  lastSeen?: ObservedAudioOutput;
}

export interface CabinetAudio {
  outputs: AudioOutput[];
  /** Role -> endpointId of the recorded output. Both roles can share an output (SSF on one card). */
  roles: Partial<Record<AudioRole, string>>;
  playfieldMode: PlayfieldAudioMode;
  /** In surround: pair of channels wired on the lockbar side (front: Sound3D 3, rear: 2). */
  lockbarPair?: 'front' | 'rear';
}

/**
 * USB device present, seen passively by the Windows configuration manager
 * (identifiers and registry only: no port is opened).
 */
/**
 * Probe of a PIN2DMD by VPX's libusb, step by step like PIN2DMDInit of libdmdutil: `stage` is
 * the step where it stopped (`list`: libusb does not see it; `open`: libusb_open; `claim`:
 * libusb_claim_interface; `name`: the product name unreadable, or not one of the three that libdmdutil
 * accepts; `ok`: opened, named and released), `code` the libusb error code (0 if all is well, or
 * for a name read but refused). `product`: the name the board gave (iProduct), when it was read.
 * `holders`: programs open at that moment that often hold a real DMD (dmdext, PinUP Popper...).
 */
export interface LibusbProbe {
  stage: 'list' | 'open' | 'claim' | 'name' | 'ok';
  code: number;
  product?: string;
  holders?: string[];
}

export interface ObservedUsbDevice {
  /** PnP instance identifier, for example "USB\VID_1A86&PID_7523\5&2C1E9F&0&3" (...&MI_00\... for an interface). */
  instanceId: string;
  vid: number;
  pid: number;
  /** Device Manager name (FriendlyName, else DeviceDesc). */
  name?: string;
  /** Serial port assigned by Windows (COM3), when there is one. */
  port?: string;
  /** Windows driver class ("Camera", "Image", "HIDClass"...); absent when no driver is installed. */
  deviceClass?: string;
  /** Driver service ("usbser", "WinUSB", "libusbK"...); absent when no driver is installed. */
  service?: string;
  /**
   * libusb0 or libusbK driver only: is libusbK.dll in System32? libusb (VPX's PIN2DMD) only
   * opens these two drivers through it (libusb, windows_winusb.c, winusbx_init). Absent: not checked.
   */
  libusbKDll?: boolean;
  /**
   * PIN2DMD only: what VPX's libusb said when opening then releasing it, as
   * DMDUtil does at the start of a game (app/src/sonde-pin2dmd.ts). Absent: not probed yet.
   */
  libusbProbe?: LibusbProbe;
  /** Device Manager code when the driver is not running (28: no driver); absent: nothing to report. */
  problem?: number;
  /** Name the device gives itself over USB ("PIN2DMD HD"), when Windows knows it. */
  product?: string;
}
