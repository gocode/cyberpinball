// Langue de l'interface dans le menu système : français ou anglais, aux boutons comme le
// reste. L'entrée est nommée dans les deux langues (« Langue / Language »), pour qu'on la
// retrouve quelle que soit la langue affichée, et chaque langue se présente dans la sienne.
// Le choix est gardé dans <données>\language.json ; le menu se relance pour l'appliquer.

import { LANGUAGE_NAMES, LANGUAGES, language, t, type Language } from '@cyberpinball/core';
import { chooseLanguage } from './language';
import type { Built, ProvidedSystemItem } from './library';

export interface LanguageMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  /** Relance le menu (relaunchCovered) : il rouvre ses fenêtres dans la nouvelle langue. */
  relaunch(): void;
}

/** Ce que fait le choix d'une autre langue, dit dans cette langue. */
const SWITCH_TO: Record<Language, string> = {
  fr: 'Passer la borne en français ; le menu redémarre', // i18n-ignore : dit en français, quelle que soit la langue affichée
  en: 'Switch the cabinet to English; the menu restarts', // i18n-ignore : said in English, whatever the current language
};

export function createLanguageMenu(host: LanguageMenuHost): ProvidedSystemItem {
  function choose(lang: Language): void {
    if (lang === language()) return host.library.openSystem();
    chooseLanguage(lang);
    host.relaunch();
  }

  function open(): void {
    host.library.openCustom(
      () => ({
        heading: t('Langue / Language'),
        icon: 'language',
        lead: t('Langue de tous les écrans de Cyber Pinball : menu, fiches, assistant et réglages.'),
        sections: [],
        actions: [
          ...LANGUAGES.map((lang) => ({
            label: LANGUAGE_NAMES[lang],
            detail: lang === language() ? t('Langue actuelle') : SWITCH_TO[lang],
            run: () => choose(lang),
          })),
          { label: t('Retour'), run: () => host.library.openSystem() },
        ],
        back: () => host.library.openSystem(),
      }),
      LANGUAGES.indexOf(language()),
    );
  }

  return {
    get label() {
      return t('Langue / Language : {name}', { name: LANGUAGE_NAMES[language()] });
    },
    get detail() {
      return t('Français ou anglais, pour tous les écrans');
    },
    run: open,
  };
}
