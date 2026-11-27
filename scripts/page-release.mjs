// Texte de la page d'une release GitHub. Le public est d'abord anglophone : la page commence par
// « ## English », puis « ## Français », et le pied (mise à jour, installeurs, licence) donne chaque
// phrase en anglais puis en français. Le 19/11/2026, des joueurs venus d'un groupe Facebook
// anglophone sont tombés sur des notes surtout en français, que la traduction du navigateur a
// rendues bizarres (« médecin des tables » devenu « doctor »).
//
// Texte public : guillemets droits seulement (" et '), jamais « », “ ” ni ’.

/** Lettres et mots qui trahissent une phrase française dans un texte censé être en anglais. */
const FRENCH = /[àâçéèêëîïôûùüœÀÂÇÉÈÊËÎÏÔÛÙÜŒ«»]|\b(?:les|des|une|pour|avec|dans|depuis|sinon|sont|ceux|celles|est)\b/i;

/** Vrai si la ligne ressemble à du français (accents, guillemets français ou mots courants). */
export function looksFrench(line) {
  // Le code, les liens et les noms de fichiers ne comptent pas.
  return FRENCH.test(line.replace(/`[^`]*`/g, '').replace(/\]\([^)]*\)/g, ']'));
}

/**
 * Vrai si une nouveauté anglaise contient du français hors des libellés cités. Une note anglaise
 * peut citer un libellé de l'interface française entre guillemets, suivi de sa traduction :
 * "Partage et réseau" (Sharing and network).
 */
export function frenchOutsideQuotes(line) {
  return looksFrench(line.replace(/"[^"]*"|“[^”]*”|«[^»]*»/g, ''));
}

/** Guillemets et apostrophe droits, comme tout texte public. */
export function straightQuotes(text) {
  return text
    .replace(/«\s*/g, '"')
    .replace(/\s*»/g, '"')
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'");
}

/** Limite de l'API GitHub pour le corps d'une release (caractères) : au-delà, HTTP 422. */
export const RELEASE_BODY_LIMIT = 125000;
/** Plafond visé, avec marge (le 27/11/2026, essai.74 : plus de 125 000 caractères, refusé). */
export const RELEASE_BODY_TARGET = 110000;

/**
 * Nombre de points les plus récents (une section de CHANGELOG commence par eux) qui tiennent dans
 * `budget` caractères. Les préversions d'une même version cumulent leurs nouveautés dans une seule
 * section, qui peut dépasser la limite de GitHub.
 */
export function bulletsThatFit(list, budget) {
  let used = 0;
  let kept = 0;
  for (const n of list) {
    used += n.length + 3;
    if (used > budget - 400) break;
    kept++;
  }
  return kept;
}

/**
 * Corps de la release.
 * repository : "propriétaire/dépôt", pour les liens vers les CHANGELOG complets quand la liste est abrégée.
 * notes / notesEn : points en français et en anglais (autant de chaque côté).
 * reference : { version, url } des installeurs repris d'une publication précédente (--rapide).
 */
export function releaseBody({ version, notes, notesEn, socle, installerName, appName, installerSha256, appSha256, reference, repository }) {
  if (!notesEn?.length) throw new Error(`aucune nouveauté en anglais pour ${version} : la page de release commence par l'anglais.`);
  if (notesEn.length !== notes.length) throw new Error(`${notes.length} nouveauté(s) en français, ${notesEn.length} en anglais pour ${version}.`);
  // Pied : chaque paragraphe en anglais, puis le même en français à la ligne suivante.
  const pairs = [
    [
      `Cabinets that are already installed update from the System menu, "Cyber Pinball update": lightweight update (**${appName}**, the application only) if they already have the same base (${socle}), otherwise through the installer.`,
      `Les bornes déjà installées se mettent à jour depuis le menu système, "Mise à jour de Cyber Pinball" : mise à jour légère (**${appName}**, l'application seule) si elles ont déjà le même socle (${socle}), sinon par l'installeur.`,
    ],
    ...(reference
      ? [
          [
            `**Installers**: those of [${reference.version}](${reference.url}); a cabinet installed with them then receives the lightweight update to ${version}.`,
            `**Installeurs** : ceux de la [${reference.version}](${reference.url}) ; une borne installée avec eux reçoit ensuite la mise à jour légère vers ${version}.`,
          ],
        ]
      : [
          [
            `**${installerName}**: lightweight installer (Visual Pinball X is downloaded on first launch).`,
            `**${installerName}** : installeur léger (Visual Pinball X téléchargé au premier lancement).`,
          ],
          [
            '**CyberPinball-Setup-complet.exe**: includes the official Visual Pinball X archive, for a cabinet without Internet access. Free redistribution only: not to be sold, nor shipped with a cabinet that is sold or operated commercially (VPX license).',
            "**CyberPinball-Setup-complet.exe** : avec l'archive officielle de Visual Pinball X, pour une borne sans Internet. Redistribution gratuite seulement : ni vendue, ni livrée avec une borne vendue ou exploitée commercialement (licence de VPX).",
          ],
        ]),
  ];
  const footer = [
    '---',
    '',
    ...pairs.flatMap(([en, fr]) => [en, fr, '']),
    `SHA-256 (${installerName}): \`${installerSha256}\``,
    `SHA-256 (${appName}): \`${appSha256}\``,
  ];
  const link = (file) => (repository ? `https://github.com/${repository}/blob/main/${file}` : file);
  // Anglais et français se partagent ce qui reste sous le plafond après le pied, avec le même nombre
  // de points dans les deux langues (le plus petit des deux) pour rester appariées.
  const budget = Math.floor((RELEASE_BODY_TARGET - footer.join('\n').length) / 2);
  const kept = Math.min(bulletsThatFit(notesEn, budget), bulletsThatFit(notes, budget));
  const shown = (list, more) => [...list.slice(0, kept).map((n) => `- ${n}`), ...(kept < list.length ? ['', more(list.length - kept)] : [])];
  const body = straightQuotes(
    [
      '## English',
      '',
      ...shown(notesEn, (n) => `_${n} older notes not shown here: see the [full changelog](${link('CHANGELOG.en.md')})._`),
      '',
      '## Français',
      '',
      ...shown(notes, (n) => `_${n} notes plus anciennes non affichées ici : voir le [CHANGELOG complet](${link('CHANGELOG.md')})._`),
      '',
      ...footer,
    ].join('\n'),
  );
  // Contrôle avant l'appel à GitHub : un refus 422 arriverait après l'envoi du code.
  if (body.length > RELEASE_BODY_LIMIT) throw new Error(`texte de release de ${version} trop long : ${body.length} caractères (maximum GitHub ${RELEASE_BODY_LIMIT}).`);
  return body;
}
