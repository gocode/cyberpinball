// Analyseur de src/core/Settings_properties.inl, le fichier du code source de
// VPX qui déclare tous ses réglages (une macro PropBool, PropInt, PropEnum… par
// réglage). On en tire un schéma JSON par version de VPX : l'écran de réglages
// est généré à partir de ce schéma plutôt que codé à la main.
//
// Ce n'est pas un compilateur C++ : on traite exactement ce que ce fichier
// utilise, et tout le reste provoque une erreur explicite plutôt qu'un réglage
// faux : commentaires, blocs #if/#ifdef/#elif/#else, macros sur plusieurs lignes,
// chaînes concaténées ("a"s "b"s), expressions numériques simples, constantes
// (#define et énumérations des en-têtes de VPX), CMTOVPU(), RGB(), ternaires sur
// g_isMobile.

export type VpxSettingType = 'bool' | 'int' | 'float' | 'enum' | 'string';

export interface VpxSettingDef {
  /** Section du fichier .ini, telle que VPX l'écrit (Settings::GetBackwardCompatibleSection). */
  section: string;
  key: string;
  type: VpxSettingType;
  /** Libellé et description d'origine, en anglais. */
  label: string;
  description: string;
  /** Bornes ; absentes pour les réglages « Unbounded ». */
  min?: number;
  max?: number;
  /** Pas imposé par VPX (PropFloatStepped). */
  step?: number;
  /** Valeur par défaut : booléen, nombre (énumération : valeur numérique), ou texte. */
  default: boolean | number | string;
  /** Énumération : libellés dans l'ordre, la valeur i vaut min + i. */
  values?: string[];
  /** Réglage « Dyn » (contextuel) : toujours écrit dans le .ini de table, même égal au global. */
  contextual?: boolean;
  /** Entier qui code une couleur 0xRRGGBB (bornes 0..0xFFFFFF). */
  color?: boolean;
  /**
   * Plugin qui déclare ce réglage à son chargement (MsgPluginAPI::RegisterSetting,
   * Player::OnAuxRendererChanged) ; absent pour ceux de Settings_properties.inl.
   * Sans effet tant que ce plugin n'est pas activé.
   */
  plugin?: string;
}

export interface ParseOptions {
  /** Symboles du préprocesseur définis pour ce build, par exemple ENABLE_BGFX. */
  defines: string[];
  /** Valeurs des constantes utilisées dans les valeurs par défaut et les bornes. */
  constants: Record<string, number>;
  /** Constantes texte, par exemple VP_VERSION_STRING_DIGITS pour string(VP_VERSION_STRING_DIGITS). */
  strings?: Record<string, string>;
}

interface MacroShape {
  base: VpxSettingType;
  /** Noms des arguments après (groupe, clé, libellé, description). */
  args: string[];
  contextual: boolean;
  minDefault?: number;
}

// Signatures relevées dans src/core/Settings.h.
const MACROS: Record<string, MacroShape> = {
  PropBool: { base: 'bool', args: ['def'], contextual: false },
  PropBoolDyn: { base: 'bool', args: ['def'], contextual: true },
  PropInt: { base: 'int', args: ['min', 'max', 'def'], contextual: false },
  PropIntDyn: { base: 'int', args: ['min', 'max', 'def'], contextual: true },
  PropIntUnbounded: { base: 'int', args: ['def'], contextual: false },
  PropEnum: { base: 'enum', args: ['type', 'def', '...'], contextual: false, minDefault: 0 },
  PropEnumDyn: { base: 'enum', args: ['type', 'def', '...'], contextual: true, minDefault: 0 },
  PropEnum1: { base: 'enum', args: ['type', 'def', '...'], contextual: false, minDefault: 1 },
  PropEnumWithMin: { base: 'enum', args: ['type', 'min', 'def', '...'], contextual: false },
  PropFloat: { base: 'float', args: ['min', 'max', 'def'], contextual: false },
  PropFloatDyn: { base: 'float', args: ['min', 'max', 'def'], contextual: true },
  PropFloatStepped: { base: 'float', args: ['min', 'max', 'step', 'def'], contextual: false },
  PropFloatSteppedDyn: { base: 'float', args: ['min', 'max', 'step', 'def'], contextual: true },
  PropFloatUnbounded: { base: 'float', args: ['def'], contextual: false },
  PropString: { base: 'string', args: ['def'], contextual: false },
  PropStringDyn: { base: 'string', args: ['def'], contextual: true },
};

/** Macros qui ne déclarent pas de réglage (PropArray : accès par indice à des réglages déjà déclarés). */
const IGNORED_MACROS = new Set(['PropArray']);

export class SettingsParseError extends Error {
  constructor(message: string, readonly line?: number) {
    super(line !== undefined ? `ligne ${line} : ${message}` : message);
  }
}

export function parseSettingsProperties(source: string, options: ParseOptions): VpxSettingDef[] {
  const code = preprocess(stripComments(source), new Set(options.defines));
  const settings: VpxSettingDef[] = [];
  const seen = new Set<string>();
  for (const call of macroCalls(code)) {
    if (IGNORED_MACROS.has(call.name)) continue;
    const shape = MACROS[call.name];
    if (!shape) throw new SettingsParseError(`macro inconnue ${call.name}`, call.line);
    const def = toSetting(call, shape, options);
    const id = `${def.section}\u0000${def.key}`.toLowerCase();
    if (seen.has(id)) throw new SettingsParseError(`réglage déclaré deux fois : [${def.section}] ${def.key}`, call.line); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
    seen.add(id);
    settings.push(def);
  }
  return settings;
}

// ---------------------------------------------------------------------------
// Commentaires et préprocesseur

/** Retire // et /* *\/ en respectant les chaînes ; conserve les fins de ligne (numéros de ligne). */
export function stripComments(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    const next = text[i + 1];
    if (c === '"' || c === "'") {
      const end = endOfQuoted(text, i);
      out += text.slice(i, end);
      i = end;
    } else if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, '');
      i = stop;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function endOfQuoted(text: string, start: number): number {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length && text[i] !== quote) {
    if (text[i] === '\\') i++;
    if (text[i] === '\n') throw new SettingsParseError('chaîne non terminée'); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
    i++;
  }
  return i + 1;
}

interface Branch {
  /** Le bloc parent est actif. */
  parentActive: boolean;
  /** Une branche de ce #if a déjà été prise. */
  taken: boolean;
  active: boolean;
}

/** Garde les lignes des branches actives ; les directives et les lignes écartées deviennent vides. */
export function preprocess(text: string, defines: Set<string>): string {
  const lines = text.split('\n');
  const stack: Branch[] = [];
  const active = () => stack.every((b) => b.active);
  return lines
    .map((raw, index) => {
      const m = /^\s*#\s*(\w+)\s*(.*?)\s*$/.exec(raw);
      if (!m) return active() ? raw : '';
      const [, directive, rest] = m as unknown as [string, string, string];
      const line = index + 1;
      switch (directive) {
        case 'if':
        case 'ifdef':
        case 'ifndef': {
          const parentActive = active();
          const cond =
            directive === 'if' ? evalCondition(rest, defines, line) : directive === 'ifdef' ? defines.has(rest) : !defines.has(rest);
          stack.push({ parentActive, taken: cond, active: parentActive && cond });
          break;
        }
        case 'elif': {
          const top = stack.at(-1);
          if (!top) throw new SettingsParseError('#elif sans #if', line); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
          const cond = !top.taken && evalCondition(rest, defines, line);
          top.active = top.parentActive && cond;
          top.taken ||= cond;
          break;
        }
        case 'else': {
          const top = stack.at(-1);
          if (!top) throw new SettingsParseError('#else sans #if', line); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
          top.active = top.parentActive && !top.taken;
          top.taken = true;
          break;
        }
        case 'endif':
          if (!stack.pop()) throw new SettingsParseError('#endif sans #if', line); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
          break;
        default:
          if (active()) throw new SettingsParseError(`directive non gérée #${directive}`, line); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
      }
      return '';
    })
    .join('\n');
}

/** Condition de #if / #elif : defined(X), X (vaut 1 s'il est défini), !, &&, ||, parenthèses. */
function evalCondition(expr: string, defines: Set<string>, line: number): boolean {
  const tokens = expr.match(/defined\s*\(\s*\w+\s*\)|defined\s+\w+|&&|\|\||!|\(|\)|\w+/g) ?? [];
  let pos = 0;
  const fail = (): never => {
    throw new SettingsParseError(`condition de préprocesseur non gérée : ${expr}`, line); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
  };
  const primary = (): boolean => {
    const t = tokens[pos++];
    if (t === undefined) return fail();
    if (t === '!') return !primary();
    if (t === '(') {
      const v = or();
      if (tokens[pos++] !== ')') fail();
      return v;
    }
    const def = /^defined\s*\(?\s*(\w+)/.exec(t);
    if (def) return defines.has(def[1]!);
    if (/^\d+$/.test(t)) return Number(t) !== 0;
    if (/^\w+$/.test(t)) return defines.has(t);
    return fail();
  };
  const and = (): boolean => {
    let v = primary();
    while (tokens[pos] === '&&') {
      pos++;
      v = primary() && v;
    }
    return v;
  };
  const or = (): boolean => {
    let v = and();
    while (tokens[pos] === '||') {
      pos++;
      v = and() || v;
    }
    return v;
  };
  const result = or();
  if (pos !== tokens.length) fail();
  return result;
}

// ---------------------------------------------------------------------------
// Appels de macros

interface MacroCall {
  name: string;
  args: string[];
  line: number;
}

function* macroCalls(code: string): Generator<MacroCall> {
  const re = /\b(Prop\w*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const line = code.slice(0, m.index).split('\n').length;
    const open = m.index + m[0].length - 1;
    const { args, end } = splitArguments(code, open, line);
    yield { name: m[1]!, args, line };
    re.lastIndex = end;
  }
}

/** Arguments d'un appel, séparés aux virgules de premier niveau (hors chaînes et parenthèses). */
export function splitArguments(code: string, open: number, line: number): { args: string[]; end: number } {
  const args: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = open + 1; i < code.length; i++) {
    const c = code[i]!;
    if (c === '"' || c === "'") {
      const end = endOfQuoted(code, i);
      current += code.slice(i, end);
      i = end - 1;
    } else if (c === '(' || c === '{') {
      depth++;
      current += c;
    } else if ((c === ')' || c === '}') && depth > 0) {
      depth--;
      current += c;
    } else if (c === ')') {
      args.push(current.trim());
      return { args, end: i + 1 };
    } else if (c === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  throw new SettingsParseError('parenthèse non fermée', line); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
}

function toSetting(call: MacroCall, shape: MacroShape, options: ParseOptions): VpxSettingDef {
  const [group, key, labelSrc, descSrc, ...rest] = call.args;
  if (!group || !key || labelSrc === undefined || descSrc === undefined) {
    throw new SettingsParseError(`${call.name} : arguments manquants`, call.line);
  }
  const named: Record<string, string> = {};
  let values: string[] | undefined;
  shape.args.forEach((name, i) => {
    if (name === '...') values = rest.slice(i).map((v) => parseString(v, call.line));
    else if (rest[i] === undefined) throw new SettingsParseError(`${call.name}(${group}, ${key}) : argument ${name} manquant`, call.line); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
    else named[name] = rest[i]!;
  });
  const variadic = shape.args.includes('...');
  if (!variadic && rest.length !== shape.args.length) {
    throw new SettingsParseError(`${call.name}(${group}, ${key}) : ${rest.length} arguments au lieu de ${shape.args.length}`, call.line); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
  }

  const num = (src: string) => evalNumber(src, options.constants, call.line);
  const def: VpxSettingDef = {
    section: iniSection(group),
    key,
    type: shape.base,
    label: parseString(labelSrc, call.line),
    description: parseString(descSrc, call.line),
    default: '',
  };
  if (shape.contextual) def.contextual = true;

  switch (shape.base) {
    case 'bool':
      def.default = num(named.def!) !== 0;
      break;
    case 'int': {
      if (named.min !== undefined) {
        const min = num(named.min);
        const max = num(named.max!);
        // INT_MIN..INT_MAX revient à « sans bornes ».
        if (min !== INT_MIN || max !== INT_MAX) Object.assign(def, { min, max });
        if (min === 0 && max === 0xffffff) def.color = true;
      }
      def.default = toInt32(num(named.def!));
      break;
    }
    case 'float':
      if (named.min !== undefined) {
        def.min = toFloat(num(named.min));
        def.max = toFloat(num(named.max!));
      }
      if (named.step !== undefined && num(named.step) !== 0) def.step = toFloat(num(named.step));
      def.default = toFloat(num(named.def!));
      break;
    case 'enum': {
      if (!values?.length) throw new SettingsParseError(`${call.name}(${group}, ${key}) : énumération sans valeurs`, call.line); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
      const min = named.min !== undefined ? num(named.min) : shape.minDefault!;
      def.min = min;
      def.max = min + values.length - 1;
      def.values = values;
      def.default = num(named.def!);
      if (def.default < def.min || def.default > def.max) {
        throw new SettingsParseError(`${call.name}(${group}, ${key}) : défaut ${def.default} hors de ${def.min}..${def.max}`, call.line); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
      }
      break;
    }
    case 'string': {
      // string(VP_VERSION_STRING_DIGITS) : valeur calculée à la compilation.
      const computed = /^(?:string\s*\(\s*)?(\w+)\s*\)?$/.exec(named.def!);
      if (computed) {
        const value = options.strings?.[computed[1]!];
        if (value === undefined) throw new SettingsParseError(`${call.name}(${group}, ${key}) : constante texte inconnue ${computed[1]}`, call.line);
        def.default = value;
      } else {
        def.default = parseString(named.def!, call.line);
      }
      break;
    }
  }
  return def;
}

/** Settings::GetBackwardCompatibleSection : PluginPinMAME -> Plugin.PinMAME, DefaultPropsBall -> DefaultProps\Ball. */
export function iniSection(group: string): string {
  if (group.startsWith('Plugin')) return `Plugin.${group.slice(6)}`;
  if (group.startsWith('DefaultProps')) return `DefaultProps\\${group.slice(12)}`;
  return group;
}

// ---------------------------------------------------------------------------
// Littéraux

/** Chaîne C++ : un ou plusieurs littéraux "…"s accolés. */
export function parseString(src: string, line?: number): string {
  let out = '';
  let rest = src.trim();
  if (!rest.startsWith('"')) throw new SettingsParseError(`chaîne attendue : ${src}`, line); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
  while (rest.startsWith('"')) {
    const end = endOfQuoted(rest, 0);
    out += unescape(rest.slice(1, end - 1));
    rest = rest.slice(end).replace(/^s\b/, '').trim();
  }
  if (rest) throw new SettingsParseError(`chaîne attendue : ${src}`, line); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
  return out;
}

function unescape(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) => ({ n: '\n', t: '\t', r: '\r', '0': '\0' })[c] ?? c);
}

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;

const BUILTIN_CONSTANTS: Record<string, number> = { INT_MIN, INT_MAX, true: 1, false: 0 };

// Macros fonctions de VPX (src/core/def.h).
const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  CMTOVPU: (x) => x * (50 / (2.54 * 1.0625)),
  VPUTOCM: (x) => x * ((2.54 * 1.0625) / 50),
  RGB: (r, g, b) => (r & 0xff) | ((g & 0xff) << 8) | ((b & 0xff) << 16),
};

/**
 * Expression numérique C++ : littéraux (12, 0x1F, 0.5f, 3.f, 1u), constantes,
 * CMTOVPU(), RGB(), conversions ((int), (float)…), + - * / % | & << >>, ternaire.
 */
export function evalNumber(src: string, constants: Record<string, number>, line?: number): number {
  const tokens = src.match(/0[xX][0-9a-fA-F]+[uUlL]*|\d+\.\d*(?:[eE][-+]?\d+)?[fF]?|\.\d+(?:[eE][-+]?\d+)?[fF]?|\d+(?:[eE][-+]?\d+)?[fFuUlL]*|\w+|<<|>>|\S/g) ?? [];
  let pos = 0;
  const fail = (why: string): never => {
    throw new SettingsParseError(`expression non gérée (${why}) : ${src}`, line); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
  };
  const peek = () => tokens[pos];
  const take = (expected?: string) => {
    const t = tokens[pos++];
    if (t === undefined || (expected !== undefined && t !== expected)) fail(`attendu ${expected ?? 'un terme'}`); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
    return t!;
  };
  const CASTS = /^(int|float|double|unsigned|uint32_t|int32_t|long)$/;

  const primary = (): number => {
    const t = take();
    if (t === '(') {
      // Conversion : (int)x, (unsigned int)x, (float)(…).
      if (CASTS.test(peek() ?? '')) {
        const types: string[] = [];
        while (CASTS.test(peek() ?? '')) types.push(take());
        take(')');
        const v = unary();
        return types.includes('float') || types.includes('double') ? v : toInt32(Math.trunc(v));
      }
      const v = ternary();
      take(')');
      return v;
    }
    if (t === '-') return -unary();
    if (t === '+') return unary();
    if (t === '!') return unary() === 0 ? 1 : 0;
    if (/^0[xX]/.test(t)) return parseInt(t.replace(/[uUlL]+$/, ''), 16);
    if (/^[\d.]/.test(t)) return Number(t.replace(/[fFuUlL]+$/, ''));
    if (/^\w+$/.test(t)) {
      if (peek() === '(') {
        const fn = FUNCTIONS[t];
        if (!fn) fail(`fonction inconnue ${t}`);
        take('(');
        const args: number[] = [];
        if (peek() !== ')') {
          args.push(ternary());
          while (peek() === ',') {
            take(',');
            args.push(ternary());
          }
        }
        take(')');
        return fn!(...args);
      }
      const value = constants[t] ?? BUILTIN_CONSTANTS[t];
      if (value === undefined) fail(`constante inconnue ${t}`);
      return value!;
    }
    return fail(`symbole ${t}`);
  };
  const unary = primary;
  const binary = (ops: string[], next: () => number) => (): number => {
    let v = next();
    while (ops.includes(peek() ?? '')) {
      const op = take();
      const r = next();
      v =
        op === '*' ? v * r
        : op === '/' ? (Number.isInteger(v) && Number.isInteger(r) && !/\./.test(src) ? Math.trunc(v / r) : v / r)
        : op === '%' ? v % r
        : op === '+' ? v + r
        : op === '-' ? v - r
        : op === '<<' ? v << r
        : op === '>>' ? v >> r
        : op === '&' ? v & r
        : v | r;
    }
    return v;
  };
  const mul = binary(['*', '/', '%'], unary);
  const add = binary(['+', '-'], mul);
  const shift = binary(['<<', '>>'], add);
  const band = binary(['&'], shift);
  const bor = binary(['|'], band);
  const ternary = (): number => {
    const cond = bor();
    if (peek() !== '?') return cond;
    take('?');
    const a = ternary();
    take(':');
    const b = ternary();
    return cond !== 0 ? a : b;
  };
  const value = ternary();
  if (pos !== tokens.length) fail(`reste « ${tokens.slice(pos).join(' ')} »`); // i18n-ignore : erreur de l’outil npm run vpx-schema, pour le développeur
  return value;
}

/** Les réglages flottants de VPX sont des float 32 bits : 0.2f vaut 0.2, pas 0.20000000298. */
export function toFloat(v: number): number {
  return Number(Math.fround(v).toPrecision(7));
}

function toInt32(v: number): number {
  return v | 0;
}

// ---------------------------------------------------------------------------
// Constantes des en-têtes

/**
 * Constantes extraites d'en-têtes C++ : « #define NOM valeur » et énumérations
 * (« enum Nom { A, B = 4, C } »), y compris celles qui en référencent d'autres.
 */
export function extractConstants(headers: string[], base: Record<string, number> = {}): Record<string, number> {
  const constants: Record<string, number> = { ...base };
  const pending: [string, string][] = [];
  for (const header of headers) {
    const code = stripComments(header);
    for (const m of code.matchAll(/^\s*#\s*define\s+(\w+)\s+([^\n\\]+?)\s*$/gm)) pending.push([m[1]!, m[2]!]);
    for (const m of code.matchAll(/^\s*(?:static\s+)?(?:inline\s+)?constexpr\s+[\w:<>]+\s+(\w+)\s*=\s*([^;]+);/gm)) pending.push([m[1]!, m[2]!]);
    for (const m of code.matchAll(/\benum\s+(?:class\s+|struct\s+)?\w*\s*(?::\s*[\w:]+\s*)?\{([^}]*)\}/g)) {
      let next = 0;
      for (const item of m[1]!.split(',')) {
        const em = /^\s*(\w+)\s*(?:=\s*(.+?))?\s*$/.exec(item);
        if (!em) continue;
        let value = next;
        if (em[2] !== undefined) {
          try {
            value = evalNumber(em[2], constants);
          } catch {
            continue;
          }
        }
        if (!(em[1]! in constants)) constants[em[1]!] = value;
        next = value + 1;
      }
    }
  }
  // Les #define peuvent se référencer les uns les autres : on résout jusqu'à stabilité.
  for (let progress = true; progress; ) {
    progress = false;
    for (const [name, expr] of pending) {
      if (name in constants) continue;
      try {
        constants[name] = evalNumber(expr, constants);
        progress = true;
      } catch {
        // Valeur non numérique (chaîne, macro fonction…) : sans intérêt ici.
      }
    }
  }
  return constants;
}
