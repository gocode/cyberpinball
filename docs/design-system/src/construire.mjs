// Régénère tout le design system : icônes et feuille de styles, aperçus, tokens.css, page HTML.
//   node docs/design-system/src/construire.mjs
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const script of ['icones.mjs', 'composants.mjs', 'tokens-css.mjs', 'page.mjs']) {
  execFileSync(process.execPath, [fileURLToPath(new URL(`./${script}`, import.meta.url))], { stdio: 'inherit' });
}
