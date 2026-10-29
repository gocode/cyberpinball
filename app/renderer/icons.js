// Registre des icônes de Cyber Pinball : le seul endroit où elles sont dessinées. Chaque
// fenêtre le charge (avant ses propres scripts) et demande une icône par son nom :
// cyberIcon('gear'). La planche du design system (docs/design-system) le lit aussi.
// Dessins au trait sur une grille de 24, zone vive de 3 à 21 (2 à 22 pour les pointes) ; ici
// la géométrie seule : le cadre (viewBox, trait arrondi, couleur du texte) est posé par cyberIcon,
// l'épaisseur et la taille par le CSS (theme.css, .icon). Un point plein est un trait de
// longueur nulle (M12 8h.01). Liste des noms côté code : packages/core/src/icons.ts.

const CYBER_ICONS = {
  // Menu système
  'table-add': '<path d="M11 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6M8 15l2 2M16 15l-2 2M18 3v6M15 6h6"/><circle cx="10" cy="8" r="1.5"/>', // Même plateau que playfield, angle ouvert et plus détaché.
  sliders: '<path d="M3 7h8M17 7h4M3 17h4M13 17h8"/><circle cx="14" cy="7" r="3"/><circle cx="10" cy="17" r="3"/>', // Réglages généraux ou par table.
  cabinet: '<rect x="3" y="3" width="7" height="6" rx="1"/><path d="M6 9v3.5M3 12l18 3v3H3zM6 18l-1 3M18 18l1 3"/>', // Fronton séparé sur support, caisse inclinée fermée et deux pieds.
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>', // Catalogue et recherche.
  inbox: '<path d="M3 12l3-8h12l3 8v8H3zM3 12h5l2 4h4l2-4h5"/>', // Fichiers en attente d’installation.
  refresh: '<path d="M20 9A8 8 0 0 0 6 6L3 9M3 3v6h6M4 15a8 8 0 0 0 14 3l3-3M21 21v-6h-6"/>', // Actualisation des tables.
  account: '<circle cx="12" cy="7" r="4"/><path d="M4 21c0-5 3-7 8-7s8 2 8 7"/>', // Comptes des sites.
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>', // Bibliothèque de ROM.
  link: '<path d="m9 15 6-6M8 12l-2 2a3.5 3.5 0 0 0 5 5l2-2M11 7l2-2a3.5 3.5 0 0 1 5 5l-2 2"/>', // Une ROM partagée par liens.
  import: '<path d="M12 4h9v16H3v-5M2 9h12M10 5l4 4-4 4"/>', // Import de médias depuis un autre frontend.
  'image-download': '<path d="M11 4H3v16h18v-5M3 16l5-5 4 4M18 2v9M14 7l4 4 4-4"/>', // Image à récupérer.
  music: '<path d="M9 17V5l11-2v12M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="16" rx="3" ry="3"/>', // Musique et menu des médias.
  language: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>', // Langues, sans lettre ni drapeau.
  upgrade: '<path d="M12 21V6M6 12l6-6 6 6M5 2h14"/>', // Nouvelle version de Cyber Pinball.
  desktop: '<rect x="3" y="3" width="14" height="13" rx="1"/><path d="M10 7h3M21 8v13H8"/>', // Fenêtres en cascade et tiret de réduction, sans flèche.
  'pinball-app': '<circle cx="12" cy="7" r="3"/><path d="M3 15a2 2 0 0 1 3-1l4 3a1.5 1.5 0 0 1-1.5 2.5L4 18a2 2 0 0 1-1-3zM21 15a2 2 0 0 0-3-1l-4 3a1.5 1.5 0 0 0 1.5 2.5L20 18a2 2 0 0 0 1-3z"/>', // Bille et deux batteurs : l’application (rubrique Cyber Pinball du menu système).
  toolbox: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M8 8V4h8v4M3 13h7M14 13h7"/><rect x="10" y="11" width="4" height="4" rx="0.5"/>', // Boîte à outils : configuration de la borne, à côté de l’assistant guidé.
  power: '<path d="M12 3v9M6 6a8.5 8.5 0 1 0 12 0"/>', // Alimentation du PC (quitter l’application : exit).
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>', // Borne dédiée : Cyber Pinball seul, à la place du bureau Windows.
  moon: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>', // Croissant : mettre la borne en veille.
  clock: '<path d="M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16Z M12 7v5l3.5 2"/>', // Cadran : horaire de la borne, heure d’arrêt.
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', // Soleil : fin de la nuit de l’horaire.
  restart: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 3v4h-4M12 8v5"/>', // Flèche qui reboucle autour du trait d’alimentation : redémarrer.
  back: '<path d="M21 12H3M10 5l-7 7 7 7"/>', // Retour à l’écran parent.
  gear: '<path d="M9 2h6l.5 3 2 1.2 2.5-1 2 3.6-2 2v2.4l2 2-2 3.6-2.5-1-2 1.2-.5 3H9l-.5-3-2-1.2-2.5 1-2-3.6 2-2v-2.4l-2-2 2-3.6 2.5 1 2-1.2z"/><circle cx="12" cy="12" r="3"/>', // Accès souris et titre du menu système.
  guest: '<circle cx="9" cy="7" r="3.5"/><path d="M2 21c0-4 3-7 7-7 1.4 0 2.7.3 3.7.9M14 15h7v6h-7zM15.5 15v-2a2 2 0 0 1 4 0v2"/>', // Mode invité : un invité et son cadenas.
  unlock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2M12 14v3"/>', // Mode invité arrêté : cadenas ouvert.

  // Configuration de la borne
  button: '<path d="M6 13v-2a6 6 0 0 1 12 0v2c0 4-12 4-12 0zM6 13a9 4 0 1 0 12 0"/>', // Dôme de bouton d’arcade sur une collerette débordante.
  screens: '<rect x="3" y="3" width="8" height="18" rx="1"/><rect x="14" y="3" width="7" height="8" rx="1"/><path d="M14 16h7M17.5 16v5"/>', // Écrans physiques et rôles.
  playfield: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 15l2 2M16 15l-2 2"/><circle cx="10" cy="8" r="1.5"/>', // Plateau vertical arrondi, bille et deux flippers en bas.
  layout: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M13 4v16M13 12h8"/>', // Zones à l’intérieur d’un écran.
  sound: '<path d="M3 9v6h4l5 4V5L7 9zM16 9a5 5 0 0 1 0 6M19 5a10 10 0 0 1 0 14"/>', // Son de la borne ou de VPX.
  wizard: '<path d="M3 18 16 5l4 4L7 22zM13 8l4 4M5 2v6M2 5h6M21 2h.01"/>', // Baguette : assistant guidé complet.
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 15h6"/>', // Touches par défaut des encodeurs.
  layers: '<path d="m3 7 9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4"/>', // Jeux de configurations enregistrés.

  // Fiche d’un jeu
  play: '<path d="M7 4v16l13-8z"/>', // Lancer la partie.
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>', // Fiche du jeu ou information.
  rules: '<path d="M5 3h10l4 4v14H5zM15 3v4h4M9 12h6M9 16h6"/>', // Règles sur une feuille.
  edit: '<path d="M3 21l1-6L16 3l5 5L9 20zM13 6l5 5"/>', // Modifier les informations.
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 16 5-5 7 9M12 16l4-4 5 5M15 8h.01"/>', // Médias du jeu.
  pup: '<path d="M6 3h15v13M3 7h14v14H3zM8 11l5 3-5 3z"/>', // Paquet de vidéos, deux plans superposés.
  frame: '<path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/>', // Cadrer l’affichage pendant la partie.
  pulse: '<path d="M2 12h5l3-8 4 16 3-8h5"/>', // Diagnostiquer et réparer.
  health: '<path d="M12 5.5C9 1.5 3 2 3 7.5c0 4.5 4.5 9 9 13.5 4.5-4.5 9-9 9-13.5 0-5.5-6-6-9-2z"/><path d="M5.5 10.5h3L10 7.5l2 6.5 2-3.5h4.5"/>', // Santé de la borne : un cœur et son pouls (Codex).
  trash: '<path d="M3 7h18M6 7l1 14h10l1-14M8 7V3h8v4M10 11v6M14 11v6"/>', // Supprimer, envoyer à la corbeille.

  // Médias, son et attente
  'layout-menu': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 14h18M7 18h.01M12 18h.01M17 18h.01"/>', // Présentation du menu et roue de sélection.
  volume: '<path d="M4 9v6h4l4 4V5L8 9zM17 4v16M15 8h4M15 16h4"/>', // Niveau de la musique, réglette distincte du son système.
  video: '<path d="M3 6h12v12H3zM15 10l6-4v12l-6-4"/>', // Son des vidéos du menu.
  rocket: '<path d="M9 16c0-7 5-11 12-13 0 7-4 12-11 13zM10 9H5l-3 6h7M15 14v5l-6 3v-6M5 19l-2 2M16 8h.01"/>', // Lancement de la partie.
  attract: '<path d="M20 16A9 9 0 0 1 8 4a9 9 0 1 0 12 12z"/>', // Mode attente, croissant.
  shuffle: '<path d="M3 6h3c5 0 7 12 12 12h3M17 14l4 4-4 4M3 18h3c2 0 3-2 4-4M14 9c1-2 2-3 4-3h3M17 2l4 4-4 4"/>', // Table aléatoire suivante.
  'volume-low': '<path d="M3 9v6h4l5 4V5L7 9zM17 10a4 4 0 0 1 0 4"/>', // Son réduit pendant l’attente.
  film: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M7 3v18M17 3v18M3 9h4M3 15h4M17 9h4M17 15h4"/>', // Médias pendant la partie.
  quality: '<path d="m3 8 4-5h10l4 5-9 13zM3 8h18M8 8l4 13 4-13"/>', // Qualité des médias, diamant.

  // Onglets et groupes de VPX
  star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>', // Réglages essentiels.
  list: '<path d="M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01"/>', // Tous les réglages, onglet avancé.
  eye: '<path d="M2 12C7 3 17 3 22 12c-5 9-15 9-20 0z"/><circle cx="12" cy="12" r="3"/>', // Vue de la table et cadrage.
  gauge: '<path d="M4 20a10 10 0 1 1 16 0M12 3v3M3 12h3M18 12h3M12 16l5-7"/>', // Performances et synchronisation.
  dmd: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M10 14h.01M14 14h.01M18 14h.01"/>', // Afficheur à points, backglass et DMD réel.
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8z"/><path d="M7.5 11h.01M10 7h.01M15 7.5h.01"/>', // Palette du peintre : couleur des points du DMD.
  folder: '<path d="M3 6V4h6l3 3h9v13H3z"/>', // Dossiers communs.
  'folder-download': '<path d="M10 20H3V4h6l3 3h9v5M17 13v8M14 18l3 3 3-3"/>', // Dossier Téléchargements de Windows : dossier ouvert d’une flèche qui descend.
  drive: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 13h18M7 16h.01M11 16h.01"/>', // Disque ou lecteur de ce PC.
  bulb: '<path d="M8 17v-2a7 7 0 1 1 8 0v2zM9 21h6"/>', // Jeu et éclairage.

  // Actions et états courants
  plus: '<path d="M12 3v18M3 12h18"/>', // Nouveau, ajout générique.
  check: '<path d="m4 12 5 5L20 6"/>', // Valider, utiliser, OK.
  close: '<path d="m5 5 14 14M19 5 5 19"/>', // Annuler, fermer, bloquant.
  restore: '<path d="M3 3v6h6M3 9a9 9 0 1 1 0 6M12 7v6h5"/>', // Restaurer un état antérieur.
  pin: '<path d="M8 3h8l-1 7 4 4H5l4-4zM12 14v7"/>', // Toujours utiliser cette configuration.
  auto: '<path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 12l3 3 7-7"/>', // Reconnaissance automatique validée.
  'chevron-left': '<path d="m15 5-7 7 7 7"/>', // Page précédente.
  'chevron-right': '<path d="m9 5 7 7-7 7"/>', // Page suivante.
  filter: '<path d="M3 4h18l-7 9v6l-4 2v-8z"/>', // Filtrer une liste.
  sort: '<path d="M3 5h11M3 11h7M3 17h3M18 4v16M14 16l4 4 4-4"/>', // Trier une liste.
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 17v4h16v-4"/>', // Télécharger ou installer la mise à jour.
  flask: '<path d="M8 3h8M9 3v7L3 21h18l-6-11V3M7 15h10"/>', // Préversions et essais.
  alert: '<path d="m12 3 10 18H2zM12 9v5M12 18h.01"/>', // À vérifier.

  // Design system : commandes de la borne, sources, objets
  tables: '<path d="M6 3h12v14H6zM3 7v14h12M9 13l3 2 3-2"/>', // Collection de plateaux.
  book: '<path d="M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2zM12 6v15"/>', // Prospectus et documentation.
  monitor: '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5M7 21h10"/>', // Un écran physique.
  flipper: '<path d="m6 21 13-9a4 4 0 0 0-5-6L3 17a2.5 2.5 0 0 0 3 4z"/>', // Batteur de flipper, silhouette élargie.
  start: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>', // Bouton Start vu du dessus.
  exit: '<path d="M14 3h7v18h-7M16 12H3M8 7l-5 5 5 5"/>', // Bouton Exit, sortie d’un parcours, quitter Cyber Pinball.
  coin: '<ellipse cx="10" cy="12" rx="6" ry="9"/><path d="M10 3h4a6 9 0 0 1 0 18h-4M16 12h4"/>', // Pièce vue de biais, face vierge et tranche avec un cran.
  plunger: '<path d="M7 3h10M12 3v10M8 13h8v8H8z"/>', // Lance-bille mécanique.
  tilt: '<path d="M12 2v11M10 13h4l-2 4z"/><ellipse cx="12" cy="15" rx="9" ry="3"/>', // Balancier de tilt : pendule et cône au milieu de son anneau.
  usb: '<path d="M12 17V3M9 6l3-3 3 3M6 9v3l6 3 6-3V7M6 6h.01M16 3h4v4h-4z"/><circle cx="12" cy="20" r="2"/>', // Support USB.
  gamepad: '<path d="M7 7h10c4 0 5 5 5 10 0 3-3 4-5 1l-2-3H9l-2 3c-2 3-5 2-5-1 0-5 1-10 5-10zM7 9v4M5 11h4M15 10h.01M19 12h.01"/>', // Contrôleur générique, hors touches de l’encodeur.
  // Amis : réseau des bornes
  friends: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M15.5 4.5a3.5 3.5 0 0 1 0 7M17 14c2.5.5 4 2.5 4 6"/>', // Deux joueurs : la rubrique Amis.
  'friend-list': '<path d="M11.5 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM4 20v-1a4.5 4.5 0 0 1 9 0v1M16 7h4M16 12h4M16 17h4"/>', // Un joueur et sa liste : mes amis.
  'friend-add': '<path d="M11.5 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM4 20v-1a4.5 4.5 0 0 1 7.5-3.35M17 13v7M13.5 16.5h7"/>', // Un joueur et un plus : trouver un joueur, demander.
  'friend-request': '<path d="M11.5 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM4 20v-1a4.5 4.5 0 0 1 7.5-3.35M20 16.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM16.5 14.5v2l1.5 1"/>', // Un joueur et une horloge : demandes en attente.
  medal: '<circle cx="12" cy="15" r="6"/><path d="M8.5 10.2 5 3h4l3 6 3-6h4l-3.5 7.2M12 13v4"/>', // Médaille à ruban : badges.
  network: '<path d="M14 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM11.1 7.8 6.9 16.2M12.9 7.8l4.2 8.4M8 18h8"/>', // Trois bornes reliées sans centre : partage et réseau.
  // Gestionnaire de téléchargements
  pause: '<path d="M8 5v14M16 5v14"/>', // Deux barres : mettre un téléchargement en pause.
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8M12 3c-3 3.5-3 14.5 0 18M12 3c3 3.5 3 14.5 0 18"/>', // Globe à méridiens : un téléchargement venu d’un site web.
  broom: '<path d="M19 3 11 11M8 10l6 6-2 5c-3 0-7-2-9-5l5-6zM6 15l2 2"/>', // Balai : retirer les finis de la liste, sans toucher aux fichiers.
};

/**
 * Icône du registre, en SVG dans la page : sa couleur suit celle du texte (currentColor),
 * sa taille et son trait le CSS (.icon, theme.css). Un nom inconnu donne un cadre vide
 * marqué .icon-unknown, que le garde-fou de mise en page signale.
 */
function cyberIcon(name, className) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className ? `icon ${className}` : 'icon');
  svg.setAttribute('data-icon', name);
  const body = Object.hasOwn(CYBER_ICONS, name) ? CYBER_ICONS[name] : undefined;
  if (body === undefined) svg.classList.add('icon-unknown');
  else svg.innerHTML = body;
  return svg;
}

// Lu aussi hors d'une page : test du registre (packages/core), planche du design system.
if (typeof module === 'object' && module.exports) module.exports = { CYBER_ICONS };
