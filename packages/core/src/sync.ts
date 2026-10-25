import { vpxAudioSettings } from './audio';
import { managedJoysticks, noAutoLayoutSettings, vpxAnalogSettings } from './plunger';
import { buttonInfo, buttonProblems, DEFAULT_BUTTONS, inGameMenuSetting, isInputKey, keyLabel, codeOfScancode, vpxInputSettings, type SilencedAction } from './buttons';
import { VPX_DMD_OWNED_KEYS, vpxDmdSettings, vpxFolderDefaults, type DetectedDmd, type GlobalDmdFolders } from './dmd';
import { t } from './i18n';
import { IniDocument } from './ini';
import { loadOwnedMemory, readTextIfExists, saveOwnedMemory, writeWithBackup, type WriteReport } from './store';
import { currentFlipperEdge, EDGE_LABELS, playfieldSize } from './layout';
import { matchScreens } from './match';
import { ROLES, type AncillaryRoleId, type AudioRole, type Cabinet, type FlipperEdge, type ObservedAudioOutput, type ObservedDisplay, type ObservedUsbDevice, type RoleId, type ScreenZone } from './model';
import {
  applyVpxDefaults,
  applyVpxSettings,
  DEFAULT_VPX_PROFILE,
  disabledPlugins,
  iniBool,
  vpxDisplayName,
  isVpxAutofit,
  vpxFlipperEdge,
  vpxLayoutSettings,
  vpxPlayedFlipperEdge,
  VPX_PLAY_SETTINGS,
  vpxPluginDefaults,
  vpxSettingsFor,
  VPX_WINDOWS,
  type VpxChange,
  type VpxProfile,
  type VpxSetting,
} from './vpx';
import { cabinetZones, isFullZone, isValidZone, roleZone, zoneDisplay, zoneFindings, zoneRect, zoneSizeCm } from './zones';

export type Severity = 'blocking' | 'warning' | 'info';

export interface SyncFinding {
  severity: Severity;
  message: string;
}

/** Une clé gérée par Cyber Pinball que quelqu'un a changée dans VPinballX.ini depuis la dernière écriture. */
export interface ManualEdit extends VpxSetting {
  /** Valeur trouvée dans le fichier, laissée telle quelle. */
  current: string | undefined;
  /** Valeur écrite la dernière fois par Cyber Pinball. */
  written: string;
}

/**
 * Valeurs des clés gérées telles que Cyber Pinball les a écrites la dernière
 * fois (« Section.Clé » -> valeur). C'est ce qui distingue une valeur changée à
 * la main d'une valeur simplement périmée parce que les écrans ont bougé.
 */
export type OwnedMemory = Record<string, string>;

export interface SyncOptions {
  memory?: OwnedMemory;
  /**
   * Remettre les valeurs de Cyber Pinball même sur les clés changées à la main (assistant,
   * choix explicite) ; une fonction limite la reprise à certaines clés (« Section.Clé »).
   */
  overwriteManual?: boolean | ((id: string) => boolean);
  /** Sorties audio actives. Sans elles, les clés audio ne sont pas touchées. */
  audio?: ObservedAudioOutput[];
  /** Périphériques USB présents, pour reconnaître un DMD réel. Sans eux, [Plugin.DMDUtil] n'est pas touché. */
  usb?: ObservedUsbDevice[];
  /** Dossiers communs de ROM et de colorisation (findGlobalDmdFolders), proposés aux plugins. */
  folders?: GlobalDmdFolders;
  /**
   * Étape de l'assistant refaite seule : seules ces clés (« Section.Clé ») sont écrites ;
   * les autres restent telles quelles dans le fichier, et leur dernière valeur écrite en mémoire.
   */
  only?: (id: string) => boolean;
}

export interface SyncPlan {
  assignments: Partial<Record<RoleId, ObservedDisplay>>;
  /** Sortie audio retrouvée pour chaque rôle (modèle avec l'étape « Son » seulement). */
  audio: Partial<Record<AudioRole, ObservedAudioOutput>>;
  /** DMD réels reconnus (option usb seulement). */
  dmd: DetectedDmd[];
  /** Actions de VPX privées de leur touche, reprise par un bouton de la borne (modèle avec l'étape « Boutons » seulement). */
  silenced: SilencedAction[];
  changes: VpxChange[];
  findings: SyncFinding[];
  /** Contenu à écrire ; undefined quand rien ne doit être écrit. */
  nextIni: string | undefined;
  /** Clés gérées changées à la main : jamais écrasées en silence, l'utilisateur choisit. */
  manualEdits: ManualEdit[];
  /** Mémoire à enregistrer avec le fichier écrit. */
  memory: OwnedMemory;
}

export function ownedId(section: string, key: string): string {
  return `${section}.${key}`;
}

/**
 * Calcule ce qu'il faut écrire dans VPinballX.ini pour que la configuration
 * corresponde aux écrans réellement branchés. Ne lit ni n'écrit aucun fichier.
 */
export function planVpxSync(
  cabinet: Cabinet,
  observed: ObservedDisplay[],
  currentIni: string,
  profile: VpxProfile = DEFAULT_VPX_PROFILE,
  options: SyncOptions = {},
): SyncPlan {
  const findings: SyncFinding[] = [];
  const match = matchScreens(cabinet.screens, observed);
  const assignments: Partial<Record<RoleId, ObservedDisplay>> = {};

  for (const role of ROLES) {
    const fp = cabinet.roles[role.id];
    if (!fp) continue;
    const display = match.matched.get(fp);
    const screen = cabinet.screens.find((s) => s.fingerprint === fp);
    if (display) {
      assignments[role.id] = display;
      if (match.approximate.includes(fp)) {
        findings.push({
          severity: 'warning',
          message: t("{role} : écran « {screen} » retrouvé par son modèle seulement (pas de numéro de série). Vérifiez qu'il s'agit bien du bon écran.", {
            role: role.label,
            screen: screen?.label ?? fp,
          }),
        });
      }
    } else {
      findings.push({
        severity: role.required ? 'blocking' : 'warning',
        message: t("{role} : l'écran « {screen} » est introuvable. Est-il allumé et branché ?", { role: role.label, screen: screen?.label ?? fp }),
      });
    }
  }

  for (const d of observed) {
    if (d.scale !== undefined && d.scale !== 1) {
      findings.push({
        severity: 'warning',
        message: t("{name} est mis à l'échelle à {scale} %. VPX repère les écrans en coordonnées logiques : gardez 100 % sur une borne.", {
          name: d.friendlyName || d.gdiName,
          scale: Math.round(d.scale * 100),
        }),
      });
    }
    if (!d.friendlyName) {
      findings.push({
        severity: 'info',
        message: t("{name} n'a pas de nom convivial : VPX le nommera « {vpxName} », un libellé générique que plusieurs écrans peuvent partager.", { name: d.gdiName, vpxName: vpxDisplayName(d) }),
      });
    }
  }

  // Une version de VPX qui repère les écrans par leur seul nom prend le premier
  // écran qui porte ce nom : deux écrans homonymes sont indiscernables pour elle.
  if (profile.displayIdFormat === 'name') {
    for (const role of ROLES) {
      const display = assignments[role.id];
      if (!display) continue;
      const name = vpxDisplayName(display);
      const sameName = observed.filter((d) => vpxDisplayName(d) === name);
      if (sameName.length > 1) {
        findings.push({
          severity: 'warning',
          message: t(
            "{role} : {n} écrans s'appellent « {name} ». Cette version de VPX repère les écrans par leur seul nom et prendra le premier ; le {role} peut s'ouvrir sur le mauvais écran.",
            { role: role.label, n: sameName.length, name },
          ),
        });
      }
    }
  }

  if (!assignments.playfield) {
    return { assignments, audio: {}, dmd: [], silenced: [], changes: [], findings, nextIni: undefined, manualEdits: [], memory: { ...options.memory } };
  }

  const doc = IniDocument.parse(currentIni);
  const kept = new Set(cabinet.vpxManual ?? []);
  const memory: OwnedMemory = {};
  const manualEdits: ManualEdit[] = [];
  const changes: VpxChange[] = [];

  /**
   * Écrit les clés gérées, sauf celles laissées à l'utilisateur (vpxManual) et
   * celles changées à la main depuis la dernière écriture, qui attendent sa décision.
   */
  const outside = (s: VpxSetting) => options.only !== undefined && !options.only(ownedId(s.section, s.key));
  const applyOwned = (settings: VpxSetting[]) => {
    for (const s of settings) {
      const id = ownedId(s.section, s.key);
      if (kept.has(id)) continue;
      if (outside(s)) {
        const written = options.memory?.[id];
        if (written !== undefined) memory[id] = written;
        continue;
      }
      const current = doc.get(s.section, s.key);
      const written = options.memory?.[id];
      const overwrite = typeof options.overwriteManual === 'function' ? options.overwriteManual(id) : options.overwriteManual;
      if (!overwrite && written !== undefined && !sameValue(current, written) && !sameValue(current, s.value)) {
        manualEdits.push({ ...s, current, written });
        memory[id] = written;
        continue;
      }
      changes.push(...applyVpxSettings(doc, [s]));
      memory[id] = s.value;
    }
  };

  applyOwned(vpxSettingsFor(assignments, profile, cabinetZones(cabinet)));
  findings.push(...zoneFindings(cabinet, assignments));
  applyOwned([...VPX_PLAY_SETTINGS]);
  changes.push(...applyVpxDefaults(doc, [...vpxPluginDefaults(assignments, profile), ...vpxFolderDefaults(options.folders ?? {})].filter((s) => !outside(s))));

  // Cadrage : seulement une fois le bord des flippers indiqué dans l'assistant.
  // Le bord suit l'orientation actuelle de l'écran, même changée hors de l'assistant.
  // Playfield sur une partie de son écran : c'est la forme et la taille réelle de sa
  // fenêtre qui comptent, pas celles de l'écran.
  const zones = cabinetZones(cabinet);
  const edge = currentFlipperEdge(cabinet, assignments.playfield);
  const playfield = zoneDisplay(assignments.playfield, zones.playfield);
  if (edge) {
    const screenSize = playfieldSize(cabinet, assignments.playfield);
    const size = screenSize && zoneSizeCm(screenSize, assignments.playfield, zones.playfield);
    const settings = vpxLayoutSettings(playfield, edge, size);
    applyOwned(settings.settings);
    if (settings.autofit && !outside(settings.autofit)) findings.push(...requireAutofit(doc, settings.autofit, kept, changes));
    if (!size) {
      findings.push({
        severity: 'warning',
        message: t("Playfield : taille de l'écran inconnue. Relancez l'assistant d'écrans et indiquez sa diagonale pour que VPX cadre les tables à la bonne échelle."),
      });
    }
    // Sens des tables d'après ce que VPX lira, valeurs changées ou gardées à la main comprises
    // (étape seule de l'assistant : le cadrage n'est pas de son ressort).
    const finding = !outside(settings.settings[0]!) && orientationFinding(playfield, edge, (section, key) => doc.get(section, key));
    if (finding) findings.push(finding);
  } else {
    findings.push({
      severity: 'info',
      message: t("Playfield : orientation non renseignée. Relancez l'assistant d'écrans pour que les tables soient cadrées automatiquement."),
    });
  }

  // Son : le nom courant de chaque sortie et le mixage du plateau, seulement après l'étape « Son ».
  let audio: SyncPlan['audio'] = {};
  if (cabinet.audio && options.audio) {
    const plan = vpxAudioSettings(cabinet.audio, options.audio);
    audio = plan.assignments;
    findings.push(...plan.findings);
    applyOwned(plan.settings);
    // Sortie absente : la clé reste telle quelle, et sa dernière valeur écrite reste en mémoire.
    for (const id of plan.untouched) {
      const written = options.memory?.[id];
      if (written !== undefined) memory[id] = written;
    }
  }

  // DMD réel : DMDUtil seulement quand un modèle connu est branché ; sinon ses clés
  // restent telles quelles, et leur dernière valeur écrite reste en mémoire.
  let dmd: DetectedDmd[] = [];
  if (options.usb) {
    const plan = vpxDmdSettings(options.usb);
    dmd = plan.detected;
    findings.push(...plan.findings);
    applyOwned(plan.settings);
  }
  for (const key of VPX_DMD_OWNED_KEYS) {
    const id = ownedId('Plugin.DMDUtil', key);
    const written = options.memory?.[id];
    if (written !== undefined && memory[id] === undefined) memory[id] = written;
  }

  // Boutons : touches de l'étape « Boutons » ; sans elle, [Input] reste tel quel, sauf la
  // combinaison qui ouvre le menu de VPX en partie (touches par défaut des encodeurs).
  let silenced: SilencedAction[] = [];
  const buttonIssues = cabinet.buttons ? buttonProblems(cabinet.buttons) : [];
  if (buttonIssues.length) {
    // Relevé incohérent : l'interface suit les touches par défaut, [Input] reste tel quel.
    findings.push({
      severity: 'warning',
      message: t(
        "Boutons de la borne incohérents dans cabinet.json ({issues}) : l'interface suit les touches par défaut des encodeurs et [Input] n'est pas touché. Refaites l'étape « Boutons » ou remettez les touches par défaut.",
        { issues: buttonIssues.join(t(' ; ')) },
      ),
    });
    for (const [id, written] of Object.entries(options.memory ?? {})) if (isInputKey(id)) memory[id] = written;
  } else if (!cabinet.buttons) {
    applyOwned([inGameMenuSetting(DEFAULT_BUTTONS, doc, options.memory)]);
  } else {
    const plan = vpxInputSettings(cabinet.buttons, doc, options.memory);
    silenced = plan.silenced;
    applyOwned(plan.settings);
    changes.push(...applyVpxSettings(doc, plan.released.filter((s) => !outside(s))));
    if (silenced.length) {
      findings.push({
        severity: 'info',
        message: t('Touches de VPX reprises par les boutons de la borne : {list}.', {
          list: silenced.map((s) => t('{action} ({key}, désormais {button})', { action: s.label, key: keyLabel(codeOfScancode(s.scancode)), button: buttonInfo(s.button).label })).join(', '),
        }),
      });
    }
  }

  // Lanceur analogique et accéléromètre : seulement après l'étape « Lanceur ». Les joysticks
  // dont Cyber Pinball écrit les boutons ou les capteurs ne reçoivent plus la disposition par
  // défaut de VPX, qui commencerait par effacer tout ce qui vient d'eux (plunger.ts).
  if (cabinet.analog) applyOwned(vpxAnalogSettings(cabinet.analog));
  applyOwned(noAutoLayoutSettings(managedJoysticks(buttonIssues.length ? undefined : cabinet.buttons, cabinet.analog)));

  // Deux plugins qui réclament le même objet COM : le dernier chargé l'emporte.
  for (const plugin of profile.enabledPlugins) {
    for (const other of disabledPlugins({ ...profile, enabledPlugins: [plugin] })) {
      if (iniBool(doc.get(`Plugin.${plugin}`, 'Enable')) && iniBool(doc.get(`Plugin.${other}`, 'Enable'))) {
        findings.push({
          severity: 'warning',
          message: t(
            "{plugin} et {other} activés ensemble dans VPinballX.ini : les deux répondent aux tables qui demandent {object}, et le dernier chargé l'emporte. Remettez [Plugin.{other}] Enable = 0.",
            { plugin, other, object: plugin === 'B2S' ? 'B2S.Server' : t('le même objet') },
          ),
        });
      }
    }
  }

  // Étape seule : les clés hors de l'étape gardent leur dernière valeur écrite en mémoire.
  if (options.only) for (const [id, written] of Object.entries(options.memory ?? {})) if (!options.only(id) && memory[id] === undefined) memory[id] = written;

  if (manualEdits.length) {
    findings.push({
      severity: 'warning',
      message: t("VPinballX.ini modifié à la main : {edits}. Cyber Pinball n'y a pas touché : gardez ces valeurs ou remettez les siennes.", { edits: manualEdits.map(formatManualEdit).join(t(' ; ')) }),
    });
  }

  return { assignments, audio, dmd, silenced, changes, findings, nextIni: changes.length > 0 ? doc.toString() : undefined, manualEdits, memory };
}

export interface VpxSyncWrite {
  plan: SyncPlan;
  report?: WriteReport;
}

/**
 * Synchronise un VPinballX.ini sur le disque : relit sa mémoire des clés écrites,
 * calcule le plan, écrit le fichier (sauvegarde horodatée) puis la mémoire. Rien
 * n'est écrit quand un constat est bloquant. Chaque configuration de borne a son
 * fichier et sa mémoire : synchroniser l'une ne touche jamais au fichier d'une autre.
 */
export function writeVpxSync(
  dataDir: string,
  iniPath: string,
  cabinet: Cabinet,
  observed: ObservedDisplay[],
  profile: VpxProfile,
  options: Omit<SyncOptions, 'memory'>,
  backupDir: string,
): VpxSyncWrite {
  const plan = planVpxSync(cabinet, observed, readTextIfExists(iniPath), profile, { ...options, memory: loadOwnedMemory(dataDir, iniPath) });
  if (plan.findings.some((f) => f.severity === 'blocking')) return { plan };
  const report = plan.nextIni ? writeWithBackup(iniPath, plan.nextIni, backupDir) : undefined;
  saveOwnedMemory(dataDir, iniPath, plan.memory);
  return { plan, report };
}

/** VPX peut réenregistrer un nombre avec ses propres décimales (47.7 -> 47.700001) : ce n'est pas une modification. */
function sameValue(a: string | undefined, b: string): boolean {
  if (a === b) return true;
  if (a === undefined || a.trim() === '' || b.trim() === '') return false;
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 1e-3;
}

/** Ce que le médecin doit savoir de la borne pour juger le sens d'une table. */
export interface PlayfieldOrientation {
  /** Fenêtre du playfield que VPX ouvrira (sa zone de l'écran). */
  window: ObservedDisplay;
  /** Bord du joueur dans l'image actuelle. */
  edge: FlipperEdge;
  /** VPinballX.ini de la configuration active, sous les .ini des tables. */
  globalIni: string;
}

/** Playfield de la borne tel que VPX le verra ; undefined sans playfield branché ni bord des flippers. */
export function playfieldOrientation(cabinet: Cabinet, observed: ObservedDisplay[], globalIni: string): PlayfieldOrientation | undefined {
  const fp = cabinet.roles.playfield;
  const display = fp ? matchScreens(cabinet.screens, observed).matched.get(fp) : undefined;
  const edge = display && currentFlipperEdge(cabinet, display);
  if (!display || !edge) return undefined;
  return { window: zoneDisplay(display, cabinetZones(cabinet).playfield), edge, globalIni };
}

/**
 * Vue borne : le cadrage automatique de VPX est la seule garantie du sens des tables
 * (vpxPlayedFlipperEdge). Le mode choisi (« Ajuster » ou « Remplir ») est gardé ; une
 * autre valeur, « Manual » compris, est remplacée, sauf si l'utilisateur a gardé la clé
 * (vpxManual) : orientationFinding le signale alors.
 */
function requireAutofit(doc: IniDocument, autofit: VpxSetting, kept: Set<string>, changes: VpxChange[]): SyncFinding[] {
  const before = doc.get(autofit.section, autofit.key);
  if (isVpxAutofit(before) || kept.has(ownedId(autofit.section, autofit.key))) return [];
  changes.push(...applyVpxSettings(doc, [autofit]));
  if (before === undefined || before.trim() === '') return [];
  return [
    {
      severity: 'info',
      message: t(
        "Playfield : cadrage automatique de VPX rétabli ([Player] CabinetAutofitMode = {before} → {value}). En cadrage manuel, chaque table garde la rotation réglée par son auteur et peut s'afficher de travers sur cette borne.",
        { before: before.trim(), value: autofit.value },
      ),
    },
  ];
}

/**
 * Constat quand VPX ne dessinera pas les flippers du côté du joueur, d'après les valeurs
 * qu'il lira (`read` : VPinballX.ini, ou le .ini d'une table par-dessus). Deux causes :
 * l'orientation de Windows (VPX ne sait pas tourner ses tables vers ce bord : l'assistant
 * tourne l'écran) ou une valeur de VPinballX.ini changée à la main ou gardée par l'utilisateur.
 */
export function orientationFinding(window: ObservedDisplay, edge: FlipperEdge, read: (section: string, key: string) => string | undefined): SyncFinding | undefined {
  const played = vpxPlayedFlipperEdge(read, window);
  if (played.edge === edge) return undefined;
  const expected = vpxFlipperEdge(window, edge);
  if (expected !== edge) {
    return {
      severity: 'warning',
      message: t(
        "Playfield : flippers {edge} de l'image, mais VPX les place toujours {expected}. Les tables s'afficheront à l'envers : relancez l'assistant d'écrans, il tournera l'écran du playfield dans Windows pour VPX.",
        { edge: EDGE_LABELS[edge], expected: EDGE_LABELS[expected] },
      ),
    };
  }
  const keys = ['BGSet', 'CabinetAutofitMode'].map((key) => t('[Player] {key} = {value}', { key, value: read('Player', key)?.trim() || t('(absent)') })).join(t(' ; '));
  return {
    severity: 'warning',
    message: played.edge
      ? t("Playfield : flippers {edge} de l'image, mais avec {keys}, VPX les dessinera {played}. Les tables s'afficheront de travers : remettez les valeurs de Cyber Pinball.", {
          edge: EDGE_LABELS[edge],
          keys,
          played: EDGE_LABELS[played.edge],
        })
      : t("Playfield : flippers {edge} de l'image, mais avec {keys}, VPX garde pour chaque table la rotation réglée par son auteur, souvent pour un autre écran : les tables peuvent s'afficher de travers. Remettez le cadrage automatique (CabinetAutofitMode = 1).", {
          edge: EDGE_LABELS[edge],
          keys,
        }),
  };
}

export function formatManualEdit(e: ManualEdit): string {
  return t('[{section}] {key} = {current} au lieu de {value}', { section: e.section, key: e.key, current: e.current ?? t('(absent)'), value: e.value });
}

const SIZE_KEYS = [ownedId('Player', 'ScreenWidth'), ownedId('Player', 'ScreenHeight')];

/**
 * « Garder mes valeurs » : la taille de l'écran est réimportée dans le modèle de
 * borne ; les autres clés sont laissées à l'utilisateur, Cyber Pinball cesse de
 * les écrire (l'assistant d'écrans les reprend).
 */
export function keepManualEdits(cabinet: Cabinet, edits: ManualEdit[], currentIni: string): Cabinet {
  const ids = edits.map((e) => ownedId(e.section, e.key));
  const next: Cabinet = { ...cabinet };
  const doc = IniDocument.parse(currentIni);
  const width = Number(doc.get('Player', 'ScreenWidth'));
  const height = Number(doc.get('Player', 'ScreenHeight'));
  const sizeEdited = ids.some((id) => SIZE_KEYS.includes(id));
  if (sizeEdited && cabinet.playfield && width > 0 && height > 0) {
    // VPX donne la taille de sa fenêtre : ramenée à celle de l'écran entier quand le playfield n'en occupe qu'une partie.
    next.playfield = { ...cabinet.playfield, manualSizeCm: screenSizeCm(cabinet, { width, height }) };
  }
  const reimported = new Set(sizeEdited && next.playfield?.manualSizeCm ? SIZE_KEYS : []);
  for (const { id: role } of ROLES) {
    const keys = ZONE_KEYS.map((k) => ownedId(VPX_WINDOWS[role].section, `${VPX_WINDOWS[role].prefix}${k}`));
    if (!ids.some((id) => keys.includes(id))) continue;
    const zone = zoneFromIni(cabinet, role, doc);
    if (!zone) continue;
    next.zones = { ...next.zones, [role]: zone };
    for (const id of keys) reimported.add(id);
  }
  const handedOver = ids.filter((id) => !reimported.has(id));
  if (handedOver.length) next.vpxManual = [...new Set([...(cabinet.vpxManual ?? []), ...handedOver])];
  return next;
}

const ZONE_KEYS = ['WndX', 'WndY', 'Width', 'Height'];

/**
 * Zone d'un rôle relue dans VPinballX.ini, quand sa fenêtre est posée sur une
 * partie d'écran (« Windowed ») ou incrustée dans le playfield : c'est ce que l'on
 * obtient en la déplaçant dans l'interface de VPX. Une incrustation est repérée
 * dans l'image du playfield : on la ramène à l'écran. undefined pour une fenêtre
 * plein écran (ses positions ne comptent pas) ou des valeurs hors de l'écran. Le
 * format verrouillé de la zone est gardé s'il colle encore.
 */
function zoneFromIni(cabinet: Cabinet, role: RoleId, doc: IniDocument): ScreenZone | undefined {
  const { section, prefix, hasOutput } = VPX_WINDOWS[role];
  const embedded = hasOutput && doc.get(section, `${prefix}Output`)?.trim() === '2';
  const windowed = doc.get(section, `${prefix}FullScreen`)?.trim() === '0';
  if (!embedded && !windowed) return undefined;
  const screen = cabinet.screens.find((s) => s.fingerprint === cabinet.roles[role]);
  if (!screen?.widthPx || !screen.heightPx) return undefined;
  const size = { width: screen.widthPx, height: screen.heightPx };
  const host = embedded ? zoneRect(roleZone(cabinet, 'playfield'), size) : { x: 0, y: 0 };
  const [x, y, width, height] = ZONE_KEYS.map((k) => Number(doc.get(section, `${prefix}${k}`)));
  const zone: ScreenZone = { x: (x! + host.x) / size.width, y: (y! + host.y) / size.height, width: width! / size.width, height: height! / size.height };
  const aspect = cabinet.zones?.[role]?.aspect;
  if (aspect && Math.abs((width! / height!) / aspect - 1) < 0.01) zone.aspect = aspect;
  return isValidZone(zone) ? zone : undefined;
}

/** Taille de l'écran du playfield, depuis celle de sa fenêtre (VPX) et de sa zone. */
function screenSizeCm(cabinet: Cabinet, windowCm: { width: number; height: number }): { width: number; height: number } {
  const zone = roleZone(cabinet, 'playfield');
  const screen = cabinet.screens.find((s) => s.fingerprint === cabinet.roles.playfield);
  if (isFullZone(zone) || !screen?.widthPx || !screen.heightPx) return windowCm;
  // Zone en cm dans le sens de l'image : grand côté de la fenêtre là où la zone est la plus longue en pixels.
  const zonePx = { width: zone.width * screen.widthPx, height: zone.height * screen.heightPx };
  const long = Math.max(windowCm.width, windowCm.height);
  const short = Math.min(windowCm.width, windowCm.height);
  const [w, h] = zonePx.width >= zonePx.height ? [long, short] : [short, long];
  const sw = Math.round((w / zone.width) * 100) / 100;
  const sh = Math.round((h / zone.height) * 100) / 100;
  return sw >= sh ? { width: sw, height: sh } : { width: sh, height: sw };
}
