// Conditions d'utilisation de Cyber Pinball : le texte, et son acceptation.
//
// Un seul texte, ici, traduit comme le reste de l'interface (i18n/en/terms.ts) :
// - l'installeur le montre en français sur sa page « Conditions d'utilisation » (scripts/installeur.mjs
//   l'écrit avec termsPlainText, à chaque fabrication) ; l'accepter y écrit <données>\conditions.json ;
// - le menu le montre au démarrage tant que la version en cours n'est pas acceptée (app/src/terms-menu.ts) :
//   installation sans l'installeur, mise à jour vers une version qui change le texte ;
// - il reste consultable dans Menu système > Cyber Pinball > Conditions d’utilisation.
//
// Ces conditions ne restreignent pas la licence GPL du code : elles disent ce dont l'utilisateur
// répond (contenus de tiers, partage, usage commercial, santé, matériel) et écartent la garantie.
// Changer le fond du texte : avancer TERMS_VERSION, pour qu'il soit présenté à nouveau à chacun.

import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { formatDate, t } from './i18n';
import { readKeptJson } from './store';

/** Version du texte (date de sa rédaction) : une acceptation plus ancienne le fait présenter à nouveau. */
export const TERMS_VERSION = '2026-11-12';

/** Fichier de l'acceptation, dans le dossier des données (aussi écrit par l'installeur). */
export const TERMS_FILE = 'conditions.json';

export interface TermsSection {
  title: string;
  paragraphs: string[];
}

export interface TermsDocument {
  title: string;
  /** « Version du 12 novembre 2026 ». */
  version: string;
  lead: string;
  sections: TermsSection[];
}

/** Le texte complet, dans la langue de l'interface. */
export function termsDocument(): TermsDocument {
  return {
    title: t('Conditions d’utilisation'),
    version: t('Version du {date}', { date: formatDate(`${TERMS_VERSION}T12:00:00`) }),
    lead: t('À lire avant d’utiliser Cyber Pinball. En choisissant « J’accepte », vous déclarez les avoir lues et vous engagez à les respecter.'),
    sections: [
      {
        title: t('Ce qu’est Cyber Pinball'),
        paragraphs: [
          t('Cyber Pinball est un logiciel libre et gratuit, publié sous licence GPL-3.0-or-later. Il organise une borne de flipper virtuel : il règle les écrans et les commandes, puis lance des émulateurs et des tables que vous installez vous-même.'),
          t('Il ne contient aucune table, aucune ROM ni aucun média de jeu commercial, et n’en vend aucun.'),
          t('Ces conditions ne restreignent aucun des droits que la licence GPL vous donne sur le code de Cyber Pinball : elles disent ce dont vous êtes responsable quand vous l’utilisez.'),
        ],
      },
      {
        title: t('Contenus de tiers : votre responsabilité'),
        paragraphs: [
          t('Les tables, ROM, frontons, vidéos, sons, musiques, PuP-Packs et autres médias appartiennent à leurs auteurs et à leurs ayants droit (fabricants de flippers, studios, éditeurs, artistes). Ils peuvent être protégés par le droit d’auteur, le droit des marques ou une licence.'),
          t('Cyber Pinball n’héberge, ne fournit et ne distribue aucun de ces contenus. Quand il vous aide à en trouver, il vous oriente vers des sites tiers : c’est vous qui décidez de télécharger, depuis ces sites et, le cas échéant, avec votre propre compte.'),
          t('Avant de télécharger, d’installer, de conserver ou d’utiliser un contenu, vérifiez que vous en avez le droit, selon la loi de votre pays et les conditions du site d’où il vient. Les ROM, en particulier, restent la propriété des fabricants, qui n’en autorisent pas la diffusion.'),
          t('N’utilisez pas Cyber Pinball pour copier, diffuser, remettre en ligne ou exploiter un contenu dont vous ne détenez pas les droits.'),
        ],
      },
      {
        title: t('Partage entre bornes'),
        paragraphs: [
          t('Le réseau des bornes est activé d’office : vos amis voient votre pseudo, votre avatar, votre pays, votre présence en ligne et vos scores publiés, et peuvent parcourir votre bibliothèque de tables et de médias.'),
          t('Vous êtes seul responsable de ce que vous partagez et de ce que vous récupérez : messages, images, médias, tables. Ne partagez rien d’illicite ou d’offensant, ni aucun contenu dont vous n’avez pas le droit de faire profiter d’autres personnes.'),
          t('Une ROM ou un PuP-Pack ne se récupère chez un ami qu’après votre attestation d’en avoir le droit : cette attestation vous engage.'),
          t('Pour tout couper : Menu système > Amis > Partage et réseau.'),
        ],
      },
      {
        title: t('Sites, services et logiciels tiers'),
        paragraphs: [
          t('Visual Pinball X, PinMAME, les sites de téléchargement, les bases de médias, YouTube et les autres services que Cyber Pinball utilise, ou vers lesquels il vous oriente, sont édités par des tiers indépendants. Cyber Pinball n’y est pas affilié et ne répond ni de leur contenu, ni de leur disponibilité.'),
          t('Leurs propres conditions s’appliquent et vous devez les respecter, par exemple celles de YouTube pour le Juke-box.'),
          t('Les noms de jeux, de fabricants et de marques cités appartiennent à leurs propriétaires ; les citer n’implique aucun partenariat ni aucune approbation de leur part.'),
        ],
      },
      {
        title: t('Usage commercial'),
        paragraphs: [
          t('L’installeur complet contient Visual Pinball X, dont la licence interdit tout usage commercial : il ne doit être ni vendu, ni fourni avec une borne vendue, louée ou exploitée commercialement.'),
          t('Sauf mention contraire, les contenus de tiers sont réservés à un usage personnel et privé. Une borne installée dans un lieu ouvert au public (bar, salle de jeux, salon, évènement) demande l’autorisation de leurs ayants droit, y compris pour la musique diffusée : il vous revient de l’obtenir.'),
        ],
      },
      {
        title: t('Santé et sécurité'),
        paragraphs: [
          t('Épilepsie : les lumières clignotantes, les effets du DMD et des écrans, l’éclairage et les toys de la borne peuvent déclencher une crise chez certaines personnes, même sans antécédent. Si vous ou un membre de votre famille en avez déjà eu, demandez l’avis d’un médecin avant de jouer. Arrêtez immédiatement et consultez en cas de vertige, de trouble de la vue, de contraction musculaire, de mouvement involontaire, de désorientation ou de perte de conscience.'),
          t('Réalité virtuelle et vision 3D : elles peuvent causer nausées, fatigue visuelle ou perte d’équilibre. Jouez dans un espace dégagé, faites des pauses, et respectez l’âge minimal et les consignes du fabricant de votre casque.'),
          t('Matériel : Cyber Pinball pilote des écrans, des contrôleurs et des toys (moteurs, solénoïdes, éclairage) et modifie certains réglages de Windows (démarrage, pare-feu, écrans). Le montage, le câblage et l’alimentation électrique de votre borne relèvent de votre seule responsabilité. Gardez des sauvegardes de vos données.'),
        ],
      },
      {
        title: t('Sans garantie'),
        paragraphs: [
          t('Cyber Pinball est fourni « tel quel », gratuitement, sans aucune garantie, expresse ou implicite : ni de fonctionnement sans erreur, ni d’adéquation à un usage particulier, ni de compatibilité avec votre matériel ou vos tables.'),
          t('Dans toute la mesure permise par la loi, ni l’auteur ni les contributeurs de Cyber Pinball ne sont responsables d’un dommage, direct ou indirect, lié à son utilisation ou à l’impossibilité de l’utiliser : perte de données, panne ou détérioration de matériel, interruption, ou réclamation d’un tiers à propos des contenus que vous avez installés, utilisés ou partagés. Vous assumez seul les conséquences de cet usage.'),
          t('Rien dans ces conditions ne vous prive des droits que la loi de votre pays vous accorde de façon impérative, notamment en tant que consommateur.'),
        ],
      },
      {
        title: t('Vos données'),
        paragraphs: [
          t('Cyber Pinball ne vous demande aucun compte et n’envoie à son auteur aucune donnée d’utilisation : ni publicité, ni mesure d’audience.'),
          t('Ce que vous partagez avec d’autres bornes passe de borne à borne. La recherche des mises à jour interroge GitHub, et les services tiers que vous utilisez (YouTube, sites de téléchargement) reçoivent ce que leur usage demande.'),
        ],
      },
      {
        title: t('Évolution de ces conditions'),
        paragraphs: [
          t('Ces conditions peuvent évoluer : une nouvelle version vous est présentée avant de continuer. Elles restent à lire dans Menu système > Cyber Pinball > Conditions d’utilisation.'),
          t('Si vous ne les acceptez pas, n’installez pas Cyber Pinball, ou cessez de l’utiliser.'),
          t('Elles sont régies par le droit français, sans préjudice des règles impératives du pays où vous résidez.'),
        ],
      },
    ],
  };
}

/**
 * Le texte en clair, pour la page de l'installeur (NSIS : fichier texte, retours à la ligne de
 * Windows). Titres en capitales, un paragraphe par ligne, une ligne vide entre chaque.
 */
export function termsPlainText(doc: TermsDocument = termsDocument()): string {
  const blocks = [`${doc.title.toUpperCase()}\n${doc.version}`, doc.lead];
  for (const s of doc.sections) blocks.push(s.title.toUpperCase(), ...s.paragraphs);
  return `${blocks.join('\n\n')}\n`.replace(/\n/g, '\r\n');
}

export interface TermsAcceptance {
  version: string;
  /** Date ISO de l'acceptation ; absente quand l'installeur l'écrit. */
  at?: string;
  /** Où les conditions ont été acceptées. */
  via: 'installeur' | 'menu';
}

export function termsFile(dataDir: string): string {
  return path.join(dataDir, TERMS_FILE);
}

/** L'acceptation gardée, si elle est lisible. */
export function readTermsAcceptance(dataDir: string): TermsAcceptance | undefined {
  const { value } = readKeptJson(termsFile(dataDir));
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Partial<TermsAcceptance>;
  if (typeof v.version !== 'string') return undefined;
  return { version: v.version, ...(typeof v.at === 'string' ? { at: v.at } : {}), via: v.via === 'installeur' ? 'installeur' : 'menu' };
}

/** La version en cours est-elle acceptée ? Les versions sont des dates AAAA-MM-JJ : elles se comparent en texte. */
export function termsAccepted(acceptance: TermsAcceptance | undefined, current = TERMS_VERSION): boolean {
  return Boolean(acceptance && acceptance.version >= current);
}

export function recordTermsAccepted(dataDir: string, now = new Date()): TermsAcceptance {
  const acceptance: TermsAcceptance = { version: TERMS_VERSION, at: now.toISOString(), via: 'menu' };
  writeFileAtomic(termsFile(dataDir), `${JSON.stringify(acceptance, null, 2)}\n`);
  return acceptance;
}
