// Réglages que les plugins de VPX déclarent à leur chargement, absents de
// Settings_properties.inl. VPX les enregistre à l'exécution :
// - chaque plugin trouvé reçoit [Plugin.<id>] Enable (Player::Player, player.cpp) ;
// - chaque réglage passé à MsgPluginAPI::RegisterSetting devient [Plugin.<id>] <propId>
//   (VPXPluginAPIImpl::UpdateSetting) ; il est déclaré par une macro MSGPI_*_SETTING
//   (plugins/plugins/MsgPlugin.h) ;
// - chaque moteur de rendu des fenêtres annexes (AncillaryRendererDef) reçoit
//   [Backglass|ScoreView|Topper] Priority.<id> (Player::OnAuxRendererChanged).
// Comme pour Settings_properties.inl, on analyse le code source du commit de la
// version : seulement ce que ces fichiers utilisent, et une erreur explicite sinon.

import {
  evalNumber,
  extractConstants,
  parseString,
  SettingsParseError,
  splitArguments,
  stripComments,
  toFloat,
  type VpxSettingDef,
} from './vpx-settings-parser';

export interface SourceFile {
  path: string;
  text: string;
}

export interface PluginInfo {
  /** Identifiant de plugin.cfg, qui donne la section [Plugin.<id>]. */
  id: string;
  name: string;
}

/** Fenêtres annexes de VPX qui ont des moteurs de rendu (VPXWindowId hors playfield). */
export type AncillaryWindow = 'Backglass' | 'ScoreView' | 'Topper';

export interface AncillaryRenderer {
  /** Identifiant du moteur de rendu : la clé est Priority.<id>. */
  id: string;
  name: string;
  description: string;
  plugin: string;
}

/** plugin.cfg : section [configuration], lignes `id = "B2S"` et `name = "B2S"`. */
export function parsePluginConfig(text: string): PluginInfo | undefined {
  const value = (key: string) => new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm').exec(text)?.[1];
  const id = value('id');
  return id ? { id, name: value('name') ?? id } : undefined;
}

/** [Plugin.<id>] Enable, enregistré par VPX pour tout plugin qui n'en a pas dans Settings_properties.inl. */
export function pluginEnableSetting(plugin: PluginInfo): VpxSettingDef {
  return {
    section: `Plugin.${plugin.id}`,
    key: 'Enable',
    type: 'bool',
    label: 'Enable',
    description: `Enable/Disable plugin '${plugin.name}'`,
    default: false,
    contextual: true,
    plugin: plugin.id,
  };
}

/** Priority.<id> d'une fenêtre annexe : entier 0..100, 0 par défaut (player.cpp, OnAuxRendererChanged). */
export function rendererPrioritySetting(window: AncillaryWindow, renderer: AncillaryRenderer): VpxSettingDef {
  return {
    section: window,
    key: `Priority.${renderer.id}`,
    type: 'int',
    label: renderer.name,
    description: `A value that will be used to select if the '${renderer.name}' renderer should be used on the ${window} display. Higher values are priorized other lower ones.`,
    default: 0,
    min: 0,
    max: 100,
    plugin: renderer.plugin,
  };
}

// ---------------------------------------------------------------------------
// Macros MSGPI_*_SETTING

type MacroKind = 'FLOAT' | 'INT' | 'ENUM' | 'BOOL' | 'STRING';

/** Arguments après (variable, id, libellé, description, modifiable) ; les variantes sans _VAL ajoutent getter et setter. */
const MACRO_ARGS: Record<MacroKind, string[]> = {
  FLOAT: ['min', 'max', 'step', 'def'],
  INT: ['min', 'max', 'def'],
  ENUM: ['min', 'count', 'values', 'def'],
  BOOL: ['def'],
  STRING: ['def', 'size'],
};

interface Declaration {
  variable: string;
  def: VpxSettingDef;
}

/**
 * Réglages d'un plugin, dans l'ordre des appels RegisterSetting. Une macro dont la
 * variable n'est jamais enregistrée (appel commenté) ne produit aucun réglage.
 */
export function parsePluginSettings(plugin: PluginInfo, files: SourceFile[]): VpxSettingDef[] {
  const constants = extractConstants(files.map((f) => f.text));
  const declarations = new Map<string, Declaration>();
  const registered: string[] = [];
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const code = stripComments(file.text);
    const arrays = braceArrays(code);
    for (const d of macroDeclarations(code, plugin, constants, arrays, file.path)) {
      const known = declarations.get(d.variable);
      if (known && known.def.key !== d.def.key) {
        throw new SettingsParseError(`${file.path} : variable ${d.variable} déclarée deux fois avec des clés différentes`);
      }
      declarations.set(d.variable, d);
    }
    for (const m of code.matchAll(/\bRegisterSetting\s*\(\s*[^,()]+,\s*&\s*(\w+)\s*\)/g)) registered.push(m[1]!);
  }
  const settings: VpxSettingDef[] = [];
  const seen = new Set<string>();
  for (const variable of registered) {
    const d = declarations.get(variable);
    if (!d) throw new SettingsParseError(`plugin ${plugin.id} : RegisterSetting(&${variable}) sans déclaration MSGPI_*_SETTING`);
    // VPX enregistre une clé par section : un second enregistrement remplace le premier sans en créer un autre.
    const id = d.def.key.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    settings.push(d.def);
  }
  return settings;
}

function* macroDeclarations(
  code: string,
  plugin: PluginInfo,
  constants: Record<string, number>,
  arrays: Map<string, string[]>,
  file: string,
): Generator<Declaration> {
  const re = /\bMSGPI_(FLOAT|INT|ENUM|BOOL|STRING)(_VAL)?_SETTING\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const lineStart = code.lastIndexOf('\n', m.index) + 1;
    if (/^\s*#\s*define\b/.test(code.slice(lineStart, m.index))) continue;
    const line = code.slice(0, m.index).split('\n').length;
    const { args, end } = splitArguments(code, m.index + m[0].length - 1, line);
    re.lastIndex = end;
    const kind = m[1] as MacroKind;
    const names = MACRO_ARGS[kind];
    const expected = 5 + names.length + (m[2] ? 0 : 2);
    if (args.length !== expected) {
      throw new SettingsParseError(`${file} : ${m[0]}…) a ${args.length} arguments au lieu de ${expected}`, line);
    }
    const [variable, idSrc, labelSrc, descSrc] = args as [string, string, string, string];
    const named = Object.fromEntries(names.map((name, i) => [name, args[5 + i]!]));
    const num = (src: string) => evalNumber(src, constants, line);
    const def: VpxSettingDef = {
      section: `Plugin.${plugin.id}`,
      key: parseString(idSrc, line),
      type: 'string',
      label: parseString(labelSrc, line),
      description: parseString(descSrc, line),
      default: '',
      plugin: plugin.id,
    };
    switch (kind) {
      case 'BOOL':
        def.type = 'bool';
        def.default = num(named.def!) !== 0;
        break;
      case 'INT':
        def.type = 'int';
        def.min = num(named.min!);
        def.max = num(named.max!);
        def.default = num(named.def!);
        break;
      case 'FLOAT':
        def.type = 'float';
        def.min = toFloat(num(named.min!));
        def.max = toFloat(num(named.max!));
        if (num(named.step!) !== 0) def.step = toFloat(num(named.step!));
        def.default = toFloat(num(named.def!));
        break;
      case 'ENUM': {
        const values = arrays.get(named.values!);
        if (!values) throw new SettingsParseError(`${file} : tableau ${named.values} introuvable`, line);
        const count = countOf(named.count!, arrays, constants, line);
        def.type = 'enum';
        def.min = num(named.min!);
        def.max = def.min + count - 1;
        def.values = values.slice(0, count).map((v) => parseString(v, line));
        def.default = num(named.def!);
        break;
      }
      case 'STRING':
        def.default = parseString(named.def!, line);
        break;
    }
    yield { variable, def };
  }
}

/** Nombre de valeurs d'une énumération : un entier, ou std::size(tableau). */
function countOf(src: string, arrays: Map<string, string[]>, constants: Record<string, number>, line: number): number {
  const size = /^std::size\s*\(\s*(\w+)\s*\)$/.exec(src.trim());
  if (!size) return evalNumber(src, constants, line);
  const array = arrays.get(size[1]!);
  if (!array) throw new SettingsParseError(`tableau ${size[1]} introuvable`, line);
  return array.length;
}

/** Tableaux initialisés entre accolades : `const char* noms[] = { "a", "b" };` -> noms : ['"a"', '"b"']. */
function braceArrays(code: string): Map<string, string[]> {
  const arrays = new Map<string, string[]>();
  for (const m of code.matchAll(/(\w+)\s*\[\s*\]\s*=\s*\{([^}]*)\}/g)) {
    arrays.set(
      m[1]!,
      m[2]!
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    );
  }
  return arrays;
}

// ---------------------------------------------------------------------------
// Moteurs de rendu des fenêtres annexes

/**
 * Initialiseurs d'AncillaryRendererDef : `{ "PUP", "PinUp Player", "…", nullptr, Render }`
 * ou `m_ancillaryRendererDef({ "B2S", … })`. Sur quelles fenêtres chacun se propose
 * dépend du code de son gestionnaire de messages : le générateur le déclare à part.
 */
export function parseAncillaryRenderers(plugin: PluginInfo, files: SourceFile[]): AncillaryRenderer[] {
  const renderers: AncillaryRenderer[] = [];
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const code = stripComments(file.text);
    if (!/ancillaryrendererdef/i.test(code)) continue;
    for (const m of code.matchAll(/\{\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*,\s*[\w>-]+\s*,\s*\w+\s*\}/g)) {
      const id = parseString(m[1]!);
      if (renderers.some((r) => r.id === id)) continue;
      renderers.push({ id, name: parseString(m[2]!), description: parseString(m[3]!), plugin: plugin.id });
    }
  }
  return renderers;
}
