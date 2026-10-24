// Langue de l'interface, fixée au démarrage du processus, avant que les autres modules
// de l'application ne se chargent (main.ts l'importe juste après le garde-fou du bac à
// sable) : CYBERPINBALL_LANGUE, sinon <données>\language.json, sinon la langue de Windows
// si c'est le français, l'anglais sinon. Les fenêtres reçoivent la langue et son catalogue
// par leur préchargement (« i18n », renderer/i18n.js). Changer de langue relance le menu.

import { app, ipcMain } from 'electron';
import {
  LANGUAGE_ENV,
  earlyTranslations,
  language,
  locale,
  messagesOf,
  resolveLanguage,
  saveLanguageSetting,
  setLanguage,
  type Language,
} from '@cyberpinball/core';
import { locations } from './paths';

/** Langues préférées de Windows (l'API d'Electron, sinon celle de Node). */
function systemLocales(): string[] {
  try {
    const preferred = app.getPreferredSystemLanguages();
    if (preferred.length) return preferred;
  } catch {
    // Avant le démarrage d'Electron, selon la version : la locale de Node suffit.
  }
  return [Intl.DateTimeFormat().resolvedOptions().locale];
}

setLanguage(resolveLanguage({ env: process.env, dataDir: locations().dataDir, system: systemLocales() }));
const early = earlyTranslations();
if (early.length) console.warn(`Langue : ${early.length} texte(s) traduit(s) avant le choix de la langue, restés en français : ${early.slice(0, 5).join(' · ')}`);

// Préchargement des fenêtres : langue, locale et catalogue, demandés une fois au chargement de la page.
ipcMain.on('i18n', (event) => {
  event.returnValue = { language: language(), locale: locale(), messages: messagesOf(language()) };
});

/** Enregistre la langue choisie dans le menu ; elle vaut au prochain démarrage (relance du menu). */
export function chooseLanguage(lang: Language): void {
  saveLanguageSetting(locations().dataDir, lang);
  // Une langue imposée par l'environnement suivrait la relance : elle suit le choix.
  if (process.env[LANGUAGE_ENV]) process.env[LANGUAGE_ENV] = lang;
}
