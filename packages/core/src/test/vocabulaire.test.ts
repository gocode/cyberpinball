import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EN_MESSAGES } from '../i18n/en';

// Vocabulaire de l'interface : Cyber Pinball se dit « le front-end » (ou « l'OS »), jamais « le menu ».
// Le joueur ne comprend pas « revenir au menu » quand il n'y a pas de menu à l'écran (16/11/2026).
// « menu » reste pour un vrai menu, qui porte ce nom ou qu'on ouvre : la liste ci-dessous.
const VRAIS_MENUS = [
  /[Mm]enu système/g, // écran nommé « Menu système »
  /[Mm]enu de VPX/g,
  /menu Démarrer/g, // Windows
  /menu de service/g, // menu de la ROM, porte ouverte
  /menu du navigateur/g, // téléphone
  /menu ⋮/g,
  /(?:leur|son) menu \(Quitter\)/g, // un autre front-end, fermé par son propre menu
  /\{menu\}/g, // paramètre
  /ce menu/g, // l'écran de choix où l'on se trouve
  /\bses menus\b/g, /Chargement des menus/g, /^Menus$/g, // téléphone : onglet et liste des écrans de réglages
  /Menu du casque/g, // bouton Menu des manettes du casque
  /menu complet/g, /menu fermé/g, /Retour et menu/g, // menu système, menu en partie
  /[Mm]enu en (?:jeu|partie)/g,
];

test('vocabulaire : aucun texte de l’interface ne dit « menu » pour le front-end', () => {
  const fautifs = Object.keys(EN_MESSAGES).filter((source) => {
    let reste = source;
    for (const re of VRAIS_MENUS) reste = reste.replace(re, '');
    return /\bmenus?\b/i.test(reste);
  });
  assert.deepEqual(fautifs, [], `Dire « front-end » (l'interface), « l'OS » (Cyber Pinball en entier) ou « l'écran des tables » (la roue) :\n${fautifs.join('\n')}`);
});
