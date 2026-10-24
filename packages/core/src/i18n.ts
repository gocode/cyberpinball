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
  return value.toLocaleString(locale(), options);
}

/** Liste dite à la façon de la langue : « a, b et c », « a, b and c » (`or` : « ou », « or »). */
export function formatList(items: readonly string[], kind: 'and' | 'or' = 'and'): string {
  return new Intl.ListFormat(locale(), { type: kind === 'and' ? 'conjunction' : 'disjunction' }).format(items);
}

/** Date seule, longue par défaut (« 24 octobre 2026 », « 24 October 2026 »). */
export function formatDate(value: Date | number | string, options: Intl.DateTimeFormatOptions = { dateStyle: 'long' }): string {
  return new Date(value).toLocaleDateString(locale(), options);
}

/** Date et heure (« 24 octobre 2026 à 14:05 », « 24 October 2026 at 14:05 »). */
export function formatDateTime(value: Date | number | string, options: Intl.DateTimeFormatOptions = { dateStyle: 'long', timeStyle: 'short' }): string {
  return new Date(value).toLocaleString(locale(), options);
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
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ language: lang }, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/** Langue du processus : CYBERPINBALL_LANGUE, sinon le choix enregistré, sinon celle de Windows. */
export function resolveLanguage(opts: { env?: NodeJS.ProcessEnv; dataDir?: string; system: readonly string[] }): Language {
  const forced = opts.env?.[LANGUAGE_ENV]?.trim().toLowerCase();
  if (isLanguage(forced)) return forced;
  return (opts.dataDir ? loadLanguageSetting(opts.dataDir) : undefined) ?? systemLanguage(opts.system);
}
