import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EN_MESSAGES } from '../i18n/en';
import { MANUAL, MANUEL, splitDocs } from './manuels';

const REPO = path.join(__dirname, '..', '..', '..', '..');

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

// « Repli » est un mot de développeur : personne ne comprend « Repli intégré » (17/11/2026).
// Ce que Cyber Pinball dessine sans média : « Affichage par défaut ». Ce qui est montré à la place
// du fichier du jeu : « À la place : … ». Le fichier commun de <racine>\media : « média commun de la borne ».
// Le mot reste permis dans les commentaires et les noms de code, que le joueur ne voit pas.
const MOTS_DE_DEVELOPPEUR = /\breplis?\b|défauts? de la borne/i;
// Anglais : « fallback key » (touche de secours) et le paramètre {fallback} restent.
const FALLBACK_EN = /\bfallbacks?\b(?! keys?\b)(?!\})|cabinet(?:['’]s)? defaults?/i;

test('vocabulaire : aucun texte de l’interface ne dit « repli » (ni « fallback » en anglais)', () => {
  const fautifs = Object.entries(EN_MESSAGES)
    .filter(([source, en]) => MOTS_DE_DEVELOPPEUR.test(source) || FALLBACK_EN.test(en))
    .map(([source, en]) => `${source}  →  ${en}`);
  assert.deepEqual(fautifs, [], `Dire « affichage par défaut », « À la place : … » ou « média commun de la borne » :\n${fautifs.join('\n')}`);
});

test('vocabulaire : manuels et pages publiées ne citent plus « repli intégré » ni l’état « Repli : … »', () => {
  const docs = [
    ...splitDocs(MANUEL),
    ...splitDocs(MANUAL),
    ...['README.md', 'README.fr.md', 'docs/fonctionnalites.md', 'docs/features.md'].map((file) => ({ file, text: fs.readFileSync(path.join(REPO, file), 'utf8') })),
    ...fs.readdirSync(path.join(REPO, 'changements')).filter((f) => f.endsWith('.md')).map((f) => ({ file: `changements/${f}`, text: fs.readFileSync(path.join(REPO, 'changements', f), 'utf8') })),
  ];
  const ancien = /replis? intégrés?|built-in fallbacks?|« Repli : |"Repli : |"Fallback: |\bdéfauts? de la borne\b|\bcabinet(?:['’]s)? defaults?\b/i;
  const fautifs = docs.flatMap(({ file, text }) =>
    text.split(/\r?\n/).flatMap((ligne, i) => (ancien.test(ligne) ? [`${file}:${i + 1} : ${ligne.match(ancien)![0]}`] : [])),
  );
  assert.deepEqual(fautifs, [], `Ancien vocabulaire des médias :\n${fautifs.join('\n')}`);
});
