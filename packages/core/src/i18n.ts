// Langue de l'interface : français (la langue des sources) ou anglais.
// Chaque texte affiché passe par t() sous sa forme française, qui sert de clé ;
// le catalogue anglais (i18n/en) en donne la traduction. Paramètres entre accolades :
// t('{name} : aucun écran', { name }) ; pluriels par tn(n, singulier, pluriel).
// La langue est fixée une fois par processus, au démarrage (changer de langue relance
// l'application) : aucun texte ne se traduit au chargement d'un module (il garderait la
// langue par défaut), les libellés des tables de constantes sont des accesseurs (get label()).
// Le test i18n.test.ts fixe l'invariant : chaque clé a sa traduction, aucun texte français
// codé en dur dans les sources de l'interface.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { EN_MESSAGES } from './i18n/en';

export type Language = 'fr' | 'en';
export const LANGUAGES: readonly Language[] = ['fr', 'en'];
/** Nom de chaque langue dans cette langue : il ne se traduit pas. */
export const LANGUAGE_NAMES: Record<Language, string> = { fr: 'Français', en: 'English' }; // i18n-ignore
/** Catalogue d'une langue : texte français → traduction. */
export type Catalog = Readonly<Record<string, string>>;
export type TextParams = Readonly<Record<string, string | number>>;

/** Variable d'environnement qui impose la langue (essais, captures) : fr ou en. */
export const LANGUAGE_ENV = 'CYBERPINBALL_LANGUE';
export const LANGUAGE_FILE = 'language.json';

let current: Language = 'fr';
let chosen = false;
const early = new Set<string>();
const missing = new Set<string>();

export function isLanguage(value: unknown): value is Language {
  return value === 'fr' || value === 'en';
}

/** Fixe la langue du processus ; à appeler au démarrage, avant tout affichage. */
export function setLanguage(lang: Language): void {
  current = lang;
  chosen = true;
}

export function language(): Language {
  return current;
}

/** Locale des dates et des nombres : fr-FR ou en-GB. */
export function localeOf(lang: Language = current): string {
  return lang === 'en' ? 'en-GB' : 'fr-FR';
}

export function locale(): string {
  return localeOf(current);
}

/** Catalogue d'une langue (vide pour le français, langue des clés). */
export function messagesOf(lang: Language): Catalog {
  return lang === 'en' ? EN_MESSAGES : {};
}

/** Textes traduits avant setLanguage (au chargement d'un module) : ils resteraient dans la langue par défaut. */
export function earlyTranslations(): string[] {
  return [...early];
}

/** Clés demandées sans traduction pendant ce processus. */
export function missingTranslations(): string[] {
  return [...missing];
}

/** Remplace {nom} par params.nom ; une accolade sans paramètre reste telle quelle. */
export function fillText(text: string, params?: TextParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : whole));
}

/** Texte dans la langue de l'interface. `source` : le texte français, littéral (le test le retrouve). */
export function t(source: string, params?: TextParams): string {
  if (!chosen) early.add(source);
  let text = source;
  if (current === 'en') {
    const translated = EN_MESSAGES[source];
    if (translated === undefined) {
      if (!missing.has(source)) {
        missing.add(source);
        console.warn(`Traduction manquante : « ${source} »`);
      }
    } else text = translated;
  }
  return fillText(text, params);
}

/**
 * Texte selon un nombre : `one` pour un seul (0 et 1 en français, 1 en anglais), `many` sinon.
 * {n} y vaut le nombre, écrit à la façon de la langue.
 */
export function tn(count: number, one: string, many: string, params?: TextParams): string {
  const single = current === 'en' ? count === 1 : Math.abs(count) < 2;
  return t(single ? one : many, { n: formatNumber(count), ...params }); // i18n-ignore : les deux formes sont relevées dans l'appel de tn
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return formatter(`n|${locale()}|${options ? JSON.stringify(options) : ''}`, () => new Intl.NumberFormat(locale(), options)).format(value);
}

/**
 * Formateurs gardés par langue et options : en créer un coûte cher (un relevé de 460 téléchargements
 * prenait 700 ms à ses seules dates et tailles, refaites à chaque touche, 17/11/2026). Même texte que
 * toLocaleString et toLocaleDateString, qui en créent un à chaque appel.
 */
const formatters = new Map<string, { format(value: never): string }>();
function formatter<F extends { format(value: never): string }>(key: string, make: () => F): F {
  let f = formatters.get(key) as F | undefined;
  if (!f) {
    f = make();
    formatters.set(key, f);
  }
  return f;
}

const DATE_FIELDS = ['weekday', 'year', 'month', 'day', 'dateStyle', 'timeStyle'] as const;
const ANY_FIELDS = [...DATE_FIELDS, 'dayPeriod', 'hour', 'minute', 'second', 'fractionalSecondDigits'] as const;

/** Une date (toLocaleDateString, `date` ; toLocaleString, `any`), options complétées comme les leurs. */
function formatDateValue(value: Date | number | string, kind: 'date' | 'any', options: Intl.DateTimeFormatOptions): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(date);
  const fields = kind === 'date' ? DATE_FIELDS : ANY_FIELDS;
  const given = fields.some((f) => (options as Record<string, unknown>)[f] !== undefined);
  const full: Intl.DateTimeFormatOptions = given ? options : { ...options, year: 'numeric', month: 'numeric', day: 'numeric', ...(kind === 'any' ? { hour: 'numeric', minute: 'numeric', second: 'numeric' } : {}) };
  return formatter(`d|${kind}|${locale()}|${JSON.stringify(full)}`, () => new Intl.DateTimeFormat(locale(), full)).format(date as never);
}

/** Liste dite à la façon de la langue : « a, b et c », « a, b and c » (`or` : « ou », « or »). */
export function formatList(items: readonly string[], kind: 'and' | 'or' = 'and'): string {
  return formatter(`l|${kind}|${locale()}`, () => new Intl.ListFormat(locale(), { type: kind === 'and' ? 'conjunction' : 'disjunction' })).format(items as never);
}

/** Date seule, longue par défaut (« 24 octobre 2026 », « 24 October 2026 »). */
export function formatDate(value: Date | number | string, options: Intl.DateTimeFormatOptions = { dateStyle: 'long' }): string {
  return formatDateValue(value, 'date', options);
}

/** Date et heure (« 24 octobre 2026 à 14:05 », « 24 October 2026 at 14:05 »). */
export function formatDateTime(value: Date | number | string, options: Intl.DateTimeFormatOptions = { dateStyle: 'long', timeStyle: 'short' }): string {
  return formatDateValue(value, 'any', options);
}

/** Langue par défaut : celle de Windows si c'est le français, l'anglais sinon. */
export function systemLanguage(preferred: readonly string[]): Language {
  return preferred[0]?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function languageFile(dataDir: string): string {
  return path.join(dataDir, LANGUAGE_FILE);
}

/** Langue enregistrée dans le dossier de données, undefined si elle n'a jamais été choisie. */
export function loadLanguageSetting(dataDir: string): Language | undefined {
  try {
    const value = (JSON.parse(fs.readFileSync(languageFile(dataDir), 'utf8').replace(/^﻿/, '')) as { language?: unknown }).language;
    return isLanguage(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function saveLanguageSetting(dataDir: string, lang: Language): void {
  const file = languageFile(dataDir);
  fs.mkdirSync(dataDir, { recursive: true });
  writeFileAtomic(file, JSON.stringify({ language: lang }, null, 2) + '\n');
}

/** Langue du processus : CYBERPINBALL_LANGUE, sinon le choix enregistré, sinon celle de Windows. */
export function resolveLanguage(opts: { env?: NodeJS.ProcessEnv; dataDir?: string; system: readonly string[] }): Language {
  const forced = opts.env?.[LANGUAGE_ENV]?.trim().toLowerCase();
  if (isLanguage(forced)) return forced;
  return (opts.dataDir ? loadLanguageSetting(opts.dataDir) : undefined) ?? systemLanguage(opts.system);
}

// ---------------------------------------------------------------------------
// Textes enregistrés : jamais traduits sur le disque
//
// Un texte traduit puis écrit dans un fichier de données garde la langue du moment où il a
// été écrit : après un changement de langue, l'écran mélange les deux (« Resume: Étape 3 sur
// 4 »). Ce qui est enregistré est donc soit une donnée neutre (nombres, codes), soit un
// LaterText : la clé française et ses paramètres, traduits à l'affichage par say().
// Les anciens fichiers qui contiennent déjà le texte traduit se convertissent à la lecture
// par recognizeText (le catalogue lu à l'envers, français ou anglais).

/** Texte à traduire à l'affichage : clé française (t) ou paire singulier/pluriel (tn), et paramètres. */
export interface LaterText {
  key: string;
  /** Forme plurielle (tn) : `key` est la forme singulière, `count` choisit. */
  many?: string;
  count?: number;
  params?: Readonly<Record<string, number | StoredText>>;
}

/**
 * Libellé d'une table de constantes (type de média, badge…), désigné par son identifiant et
 * dit à l'affichage par la fonction enregistrée pour `ref` (registerTextRef).
 */
export interface TextRef {
  ref: string;
  id: string;
}

const textRefs = new Map<string, (id: string) => string | undefined>();

/** Déclare comment dire un libellé désigné par { ref, id } ; appelé au chargement du module qui tient la table. */
export function registerTextRef(ref: string, label: (id: string) => string | undefined): void {
  textRefs.set(ref, label);
}

// Un nombre gardé brut ({ ref: 'number', id: '84520310' }), écrit à la façon de la langue à l'affichage.
registerTextRef('number', (id) => (Number.isFinite(Number(id)) ? formatNumber(Number(id)) : id));

/** Un nombre dans un texte enregistré (score) : écrit à la façon de la langue du moment (« 84 520 310 », « 84,520,310 »). */
export function laterNumber(value: number): TextRef {
  return { ref: 'number', id: String(value) };
}

const isTextRef = (value: unknown): value is TextRef => Boolean(value) && typeof value === 'object' && typeof (value as TextRef).ref === 'string' && typeof (value as TextRef).id === 'string';

/**
 * Ce qu'un fichier de données peut contenir comme texte montré : un LaterText, un libellé de
 * table de constantes (TextRef), un texte non traduit (nom, chemin), ou une suite d'entre eux
 * (dite séparée d'une espace).
 */
export type StoredText = LaterText | TextRef | string | readonly StoredText[];

/** Comme t(), mais traduit plus tard (say) : pour ce qui est enregistré. `source` : le texte français, littéral. */
export function tLater(source: string, params?: LaterText['params']): LaterText {
  return params ? { key: source, params } : { key: source };
}

/** Comme tn(), mais traduit plus tard (say). */
export function tnLater(count: number, one: string, many: string, params?: LaterText['params']): LaterText {
  return params ? { key: one, many, count, params } : { key: one, many, count };
}

export function isLaterText(value: unknown): value is LaterText {
  return Boolean(value) && typeof value === 'object' && typeof (value as LaterText).key === 'string';
}

/** Un texte enregistré, dans la langue du moment. Une chaîne est montrée telle quelle (nom, chemin, texte de l'utilisateur). */
export function say(text: StoredText | undefined): string {
  if (text === undefined) return '';
  if (typeof text === 'string') return text;
  if (Array.isArray(text)) return text.map(say).filter(Boolean).join(' ');
  if (isTextRef(text)) return textRefs.get(text.ref)?.(text.id) ?? text.id;
  if (!isLaterText(text)) return '';
  const params: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(text.params ?? {})) {
    params[name] = typeof value === 'number' ? value : say(value);
  }
  if (text.many !== undefined && typeof text.count === 'number') return tn(text.count, text.key, text.many, params); // i18n-ignore : clés relevées dans l'appel de tnLater
  return t(text.key, params); // i18n-ignore : clé relevée dans l'appel de tLater
}

/** Lit un texte enregistré : LaterText gardé, chaîne d'un ancien fichier reconnue si elle sort du catalogue, sinon gardée. */
export function readStoredText(value: unknown): StoredText | undefined {
  if (isLaterText(value) || isTextRef(value)) return value;
  if (Array.isArray(value)) {
    const parts = value.map(readStoredText).filter((p): p is StoredText => p !== undefined);
    return parts.length ? parts : undefined;
  }
  if (typeof value !== 'string') return undefined;
  return recognizeText(value) ?? value;
}

/** `piece` : le plus long morceau de texte hors paramètres, cherché avant l'expression (bien plus rapide). */
type Pattern = { key: string; re: RegExp; names: string[]; weight: number; piece: string };
let patterns: Pattern[] | undefined;

/** Gabarit (« Étape {n} sur {total} ») → expression qui le reconnaît, paramètres en groupes. */
function patternOf(key: string, text: string): Pattern | undefined {
  const names: string[] = [];
  const literal = text.replace(/\{\w+\}/g, '');
  // Au moins quelques lettres hors paramètres : « {a} : {b} » reconnaîtrait n'importe quoi.
  if (literal.replace(/[\s\p{P}]/gu, '').length < 3) return undefined;
  const body = text.split(/(\{\w+\})/).map((part) => {
    const m = /^\{(\w+)\}$/.exec(part);
    if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    names.push(m[1]!);
    return m[1] === 'n' ? '(-?[\\d\\s\\u00a0\\u202f.,]+)' : '(.+?)';
  });
  const piece = text.split(/\{\w+\}/).reduce((a, b) => (b.length > a.length ? b : a), '');
  return { key, re: new RegExp(`^${body.join('')}$`, 'su'), names, weight: literal.length, piece };
}

/**
 * Texte d'un ancien fichier, déjà traduit en français ou en anglais : la clé et les
 * paramètres qui le donnent, pour le redire dans la langue du moment. Le gabarit le plus
 * précis (le plus de texte hors paramètres) l'emporte ; undefined si aucun ne convient
 * (nom de table, texte tapé par l'utilisateur). Un nombre {n} redevient un nombre.
 */
export function recognizeText(text: string, keys?: readonly string[]): LaterText | undefined {
  if (!text) return undefined;
  let list: Pattern[];
  if (keys) {
    list = keys.flatMap((key) => [patternOf(key, key), ...LANGUAGES.map((l) => messagesOf(l)[key]).filter((x): x is string => Boolean(x)).map((x) => patternOf(key, x))]).filter((p): p is Pattern => Boolean(p));
  } else {
    patterns ??= LANGUAGES.flatMap((l) => Object.entries(messagesOf(l)).flatMap(([key, x]) => [patternOf(key, key), patternOf(key, x)]))
      .filter((p): p is Pattern => Boolean(p))
      .sort((a, b) => b.weight - a.weight);
    list = patterns;
  }
  let best: { p: Pattern; m: RegExpExecArray } | undefined;
  for (const p of list) {
    if (best && p.weight <= best.p.weight) continue;
    if (!text.includes(p.piece)) continue;
    const m = p.re.exec(text);
    if (m) best = { p, m };
  }
  if (!best) return undefined;
  const params: Record<string, string | number> = {};
  best.p.names.forEach((name, i) => {
    const raw = best!.m[i + 1]!;
    const digits = raw.replace(/[\s\u00a0\u202f.,]/g, '');
    params[name] = name === 'n' && /^-?\d+$/.test(digits) ? Number(digits) : raw;
  });
  return best.p.names.length ? { key: best.p.key, params } : { key: best.p.key };
}
