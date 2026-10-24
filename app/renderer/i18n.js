// Langue des fenêtres : chargé avant les autres scripts de chaque page. Même règle que le
// cœur (packages/core/src/i18n.ts) : t('texte français', { param }) donne la traduction du
// catalogue envoyé par le processus principal (préchargement, window.cyberI18n) ;
// tn(n, singulier, pluriel) choisit selon le nombre. Les éléments marqués data-i18n dans
// les pages sont traduits ici, au chargement. Sans préchargement (page de démonstration
// ouverte seule), le texte français reste.

const I18N = window.cyberI18n ?? { language: 'fr', locale: 'fr-FR', messages: {} };
const I18N_MISSING = new Set();

/** Remplace {nom} par params.nom ; une accolade sans paramètre reste telle quelle. */
function fillI18n(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(params, name) ? String(params[name]) : whole));
}

/** Texte dans la langue de l'interface ; `source` : le texte français, littéral. */
function t(source, params) {
  let text = source;
  if (I18N.language !== 'fr') {
    const translated = I18N.messages[source];
    if (translated === undefined) {
      if (!I18N_MISSING.has(source)) {
        I18N_MISSING.add(source);
        console.warn(`Traduction manquante : « ${source} »`);
      }
    } else text = translated;
  }
  return fillI18n(text, params);
}

/** `one` pour un seul (0 et 1 en français, 1 en anglais), `many` sinon ; {n} : le nombre. */
function tn(count, one, many, params) {
  const single = I18N.language === 'en' ? count === 1 : Math.abs(count) < 2;
  return t(single ? one : many, { n: count.toLocaleString(I18N.locale), ...params }); // i18n-ignore : les deux formes sont relevées dans l'appel de tn
}

/** Locale des dates et des nombres : fr-FR ou en-GB. */
function uiLocale() {
  return I18N.locale;
}

document.documentElement.lang = I18N.language;
// Textes des pages, relevés par le test dans les éléments data-i18n. La clé est le texte de
// l'élément, ou la valeur de data-i18n quand un même texte français a deux sens (contexte).
if (I18N.language !== 'fr') {
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n || node.textContent.replace(/\s+/g, ' ').trim()); // i18n-ignore
}
