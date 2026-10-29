[English](CHANGELOG.en.md) · Français

# Nouveautés de Cyber Pinball

Une section par version, `## <version>` puis une ligne `- ` par point : `npm run publier` en tire
les nouveautés du flux de mise à jour, affichées sur la borne avant l'installation, et de la
release GitHub. Des phrases courtes, pour l'utilisateur de la borne. Chaque section a sa
traduction, point par point, dans [CHANGELOG.en.md](CHANGELOG.en.md) (vérifié par `npm test`) ;
le flux de mise à jour et la release GitHub reprennent les deux langues (la borne affiche celle de
son interface).

## 0.1.4

- Menu système en cinq rubriques, dans cet ordre : Amis, Tables, Médias, puis Téléchargements, Borne et Cyber Pinball ; ce qui ne sert qu'en venant d'un autre frontend est rangé dans « Migration ».
- DMD du menu vivant : Cyber Pinball dessine lui-même l'afficheur, avec le titre, PRESS START, les crédits, l'horloge et les records.
- Sons de l'interface : clic de solénoïde au changement de table, pièce au Start, knocker quand un record tombe ; désactivables dans « Médias, son et attente ».
- Santé de la borne (rubrique Borne) : espace disque, tables qui ne démarrent pas, médias manquants, écrans et version de VPX sur un seul écran.
- Borne dédiée (rubrique Borne), désactivée par défaut : Cyber Pinball peut remplacer l'Explorateur de Windows, avec un moyen de le rappeler.
- Éteindre, redémarrer et mettre en veille depuis la rubrique Cyber Pinball, juste après « Quitter Cyber Pinball » : une confirmation, puis les réglages sont enregistrés et tous les écrans passent au noir, sans jamais montrer le bureau ; au réveil, le menu revient tel quel.
- Mode invité (rubrique Borne) : pour une soirée ou les enfants, on peut seulement choisir une table, jouer et lire sa fiche ; les deux flippers et les deux MagnaSave tenus 3 secondes déverrouillent.
- Force des secousses de l'accéléromètre, réglable dans l'étape « Tilt » de la configuration de la borne : ×2 est proposé pour un Pinscape, que VPX ignorait presque à l'échelle d'origine.
- Lancement en cinéma : au Start, le logo du jeu s'envole du plateau vers le fronton, le DMD charge, un coup de bobine quand VPX prend la main ; VPX n'attend jamais, et « Médias, son et attente » le coupe.
- Listes des menus : une liste trop longue est signalée par un filet en haut ou en bas au lieu d'un fondu, l'entrée choisie reste entière et chaque liste commence juste sous son titre.
- Horaire de la borne (« Médias, son et attente », désactivé par défaut) : comme en salle d'arcade, la borne baisse ses écrans et se tait la nuit, puis se met en veille ou s'éteint à l'heure choisie si personne ne joue, après 30 s de préavis qu'un simple bouton annule.
- Bureau Windows rendu dans son sens : Cyber Pinball ne tourne plus l'écran du plateau dans le réglage de Windows, seulement le temps d'être ouvert ; chaque sortie, même après un plantage, rend au bureau l'orientation d'avant. Une borne déjà laissée tournée le propose au premier démarrage.
- Sens des tables gardé d'un démarrage à l'autre : après un redémarrage ou une reconnexion, les tables ne s'affichent plus à l'envers en partie. « Santé de la borne » dit si elles sont dans votre sens, et répare celles qu'on avait retournées dans le menu de VPX.
- Parties du jeu : chaque fichier reçu va dans la partie que dit son contenu (table, PuP-Pack, fronton, ROM, couleurs, sons, musique…), même si l'on attendait autre chose ; un fichier à corriger ne bloque plus l'installation du reste. La fiche d'une table a une section « Parties du jeu » pour ajouter, remplacer, réaffecter ou retirer chaque partie.
- Téléchargements : un fichier peut être ajouté à une table, à un autre jeu, ou installé comme nouvelle table.
- Tout fichier à choisir (médias, fronton, table, PuP-Pack…) s'affiche en galerie : aperçu, nombre de téléchargements et note lus sur le site, auteur, version et date, avec un tri par popularité ; le média enregistré est toujours celui qu'on a choisi.
- Les listes ne bougent plus pendant un téléchargement : seul un geste de l'utilisateur les fait défiler.
- Fronton et DMD aux couleurs de la marque, avec une police à points dessinée pour Cyber Pinball ; la couleur du DMD se règle (vert signal par défaut, préréglages ou couleur libre).
- Boutons du jeu : les touches du clavier se relèvent de nouveau.
- « Chercher sur le web… » sur chaque écran d'ajout ou de choix : le navigateur intégré s'ouvre sur une recherche déjà remplie. Une partie absente d'un jeu lance d'office la recherche sur VPS, Téléchargements, VPForums et VPUniverse.
- Recherche sur VPUniverse plus fiable : les mots courts du titre (« say », « die ») ne vident plus la recherche, et l'attente imposée par le site n'est plus prise pour « aucun résultat ».
- PuP-Packs visibles en partie : quand le script d'une table garde son PuP-Pack ou son PuP-DMD éteint, Cyber Pinball l'allume à l'installation et avant chaque partie.
- Fenêtres de VPX à leur place en partie : quand deux écrans portent le même nom, le fronton, le DMD et l'afficheur des scores ne se superposent plus ; Cyber Pinball ramène chacun sur l'écran de son rôle.
- Amis (Menu système > Amis), entre bornes et sans serveur central : vos amis en ligne avec la table qu'ils jouent et leurs derniers records, recherche d'un joueur par son nom ou sur le réseau local, demandes d'amis, premiers badges. Le partage est activé par défaut et se coupe dans « Partage et réseau », qui dit aussi ce que voient les autres bornes ; Windows demande une fois d'autoriser Cyber Pinball dans son pare-feu.
- PuP-Packs que la table ne lance pas elle-même (Game of Thrones LE) : Cyber Pinball les range sous le bon nom et les lance avant chaque partie ; le médecin dit quelles vidéos du pack ne peuvent pas se déclencher avec le DMD de la table.
- Vidéos des PuP-Packs déclenchées par les images du DMD sur les tables FlexDMD sans ROM (Game of Thrones LE) : Cyber Pinball reconnaît ces images pendant la partie et lance les vidéos, comme PinUP Player.
- PuP-Packs : le fronton ne clignote plus quand une même vidéo de fond est demandée plusieurs fois de suite (Game of Thrones LE, écran du choix de la maison).
- PuP-Packs : les images livrées sous un nom de vidéo (Game of Thrones LE) s’affichent enfin comme des images, sans clignoter, et les fichiers aux noms accentués sont retrouvés ; Cyber Pinball le corrige pour tout pack, dès l’installation et avant chaque partie.
- La roue des tables a du son dès l'installation : la musique de chaque jeu est jouée par défaut, et une table sans musique fait entendre sa vidéo du plateau (40 %). Les bornes déjà réglées gardent leur choix : « Musique des jeux » se rallume dans Menu système > Médias > « Médias, son et attente ».
- Tout le son passe par les haut-parleurs de la borne : les musiques et sons proposés dans « Médias du jeu », et les vidéos regardées dans « Récupérer » (YouTube…), ne partent plus sur la sortie par défaut de Windows, souvent muette sur un PinCab.
- Bibliothèque des amis, partagée par défaut entre amis (se coupe dans « Partage et réseau ») : « Voir sa bibliothèque » sur la fiche d'un ami montre ses tables et les médias qui vous manquent. On peut récupérer toute une table absente de sa borne, ou choisir partie par partie celles d'une table qu'on a déjà, sa version et la vôtre côte à côte ; ROM et PuP-Pack sont décochés d'office, avec une mention des droits. Tout passe par le plan d'ajout avant d'être installé ; ni sauvegardes, ni records, ni programmes ne sont envoyés.
- Partie en direct entre amis, jusqu'à 4 bornes : l'invitation s'ouvre chez l'ami sur la même table (version vérifiée), un compte à rebours de 5 secondes lance la partie partout, puis chacun voit les résultats.
- Le nom d'un ami suit toujours son dernier renommage, et une demande d'ami en attente repart quand les bornes se retrouvent.
- La barre des tâches de Windows ne passe plus devant le DMD, le fronton ou le playfield au retour d'une partie : Cyber Pinball la remet aussitôt derrière, et « Santé de la borne » dit s'il a dû le faire.
- Longues listes : dans une liste de contenu (jeux, médias, fichiers…), marquée par son cadre et le repère « Exit · Sortir de la liste », Exit ramène aux actions de l'écran au lieu de le quitter ; MagnaSave (F6 au clavier) passe de l'une à l'autre en retrouvant sa place, et un flipper tenu fait défiler de lettre en lettre.
- Téléchargements, dans le menu système et en pastille sur le menu des tables : suit tout ce qui arrive des sites et de vos amis, reprend seul là où il s'était arrêté si la connexion tombe, même le lendemain, et vous ramène d'un geste à l'écran d'où vous l'aviez demandé.
- Les noms sous les petits médaillons de la roue sont plus grands et se lisent de loin, comme tout texte du menu.

## 0.1.3

- Boutons d'un Pinscape (KL25Z) ou d'un encodeur en mode manette : relevés dans l'étape « Boutons » et suivis par tout le menu et par VPX.
- Bouton Pause, facultatif, dans l'étape « Boutons » : un appui met la partie en pause, un autre la reprend (P au clavier par défaut).
- Lanceur analogique (plunger à capteur d'un Pinscape) : détecté en le tirant, réglé et essayé dans l'étape « Lanceur », avec l'accéléromètre pour les tremblements.
- Boutons du jeu et boutons de l'interface réglés séparément ; touches du clavier et boutons de joystick se mélangent librement.
- « Ajouter une table » réunit au même endroit toutes les façons d'ajouter une table, avec des filtres dans le catalogue et l'installation rapide.
- « Ce qu'il manque pour jouer » : un parcours guidé, d'une ROM ou d'un fronton manquant jusqu'à « Jouer ».
- Une ROM rangée dans un sous-dossier de son zip est reconnue ; « Diagnostiquer et réparer » regroupe une ROM éparpillée dans une table.
- Liste d'attente corrigeable : réaffecter, vider, remplacer ou retirer un fichier reçu par erreur ; la fiche d'une table a une section « Fichiers ».
- Une icône pour chaque menu.
- Menu des tables sur la borne : bandeau d'aide réduit à Flippers, Start et Exit (« Commandes de la borne » dans le menu système), halos des flèches et du nom sans coupure.
- Les tables s'affichent dans le bon sens pendant la partie sur une borne dont les flippers sont en bas.
- Seuls le fichier de la table et sa ROM sont obligatoires pour jouer ; contenu du DMD, fronton et PuP-Pack sont proposés pour aller plus loin.
- Écran « Téléchargements » : les fichiers déjà reçus, à reprendre ou à supprimer ; un sélecteur de fichiers intégré remplace celui de Windows.
- Fenêtre « Récupérer » : progression de chaque téléchargement (pourcentage, volume, débit, temps restant) et bouton « Annuler ».
- L'écran où s'ouvre la fenêtre « Récupérer » se choisit dans la configuration de la borne.
- PuP-Pack coupé par le script de sa table (2001, par exemple) : allumé à l'installation, et réparé par « Diagnostiquer et réparer » pour les tables déjà installées.
- La fenêtre « Récupérer » reste au premier plan : le fronton ne passe plus devant au premier clic.
- Fenêtre « Récupérer » sur une borne : elle s'ouvre sur un écran lisible (le fronton si le playfield est tourné), le pointeur amené dessus ; Exit la ferme.
- La fenêtre « Récupérer » rouverte reprend la page où vous en étiez ; recherche des sites plus complète.
- Plus d'écran blanc quand une fenêtre s'ouvre ou change d'écran.
- Mises à jour plus légères (l'application seule, en quelques secondes) et préversions d'essai, à recevoir ou non depuis le menu de la mise à jour.
- Écran du DMD : dites s'il s'agit d'un FullDMD (tout l'écran, DMD du jeu incrusté) ou d'un DMD seul ; le menu, VPX et les PuP-Packs le respectent.
- PuP-Pack sur le fronton : l'option du pack est choisie d'après les écrans de la borne, le DMD du jeu reste devant le pack, et le pack est vérifié avant chaque partie.
- Tilt : nouvelle étape « Tilt » (balancier de la borne, ou balancier simulé par VPX d'après l'accéléromètre), balancier et slam tilt relevés dans l'étape « Boutons ».
- Un média ajouté, remplacé ou retiré (logo de la roue, fronton, vidéo, musique…) et une table ajoutée ou renommée se voient aussitôt sur tous les écrans, sans redémarrer.
- Menu système, réglages, aide et messages : fronton, afficheur et topper passent à l'affichage de Cyber Pinball, sans la vidéo ni la musique de la dernière table ; la fiche d'une table garde ses médias.
- « Sons de la table » (Médias du jeu > Musique ou Son de lancement) : écouter les musiques du PuP-Pack et le son de ses vidéos, et en faire la musique de présentation ou le son de lancement du jeu.
- Médias : « Chercher moi-même sur le web… » sur chaque média ouvre le navigateur intégré sur une recherche que vous changez à votre guise ; le fichier téléchargé est vérifié, converti si besoin (une musique se découpe) et affecté aussitôt.
- « Bureau Windows » libère enfin tous les écrans du PC, et non plus souvent un seul ; Ctrl+Maj+D y va directement depuis le menu et en revient, raccourci affiché à côté de l'entrée.
- Afficheur large (FullDMD) en partie : l'habillage du menu reste à l'écran et le DMD du jeu se place dans son cadre ; sa place s'ajuste en partie, table par table, dans le menu de VPX.
- Médias : sur une page YouTube, Vimeo ou Dailymotion, « Récupérer le son » ou « Récupérer la vidéo » par l'outil yt-dlp, téléchargé depuis GitHub et vérifié à la première utilisation.
- PuP-Pack : l'option appliquée s'affiche enfin telle qu'elle est (l'option 2 de Guardians of the Galaxy ne passe plus pour l'option 0), chaque option une seule fois, la mieux adaptée à la borne conseillée ; « appliquée » n'est annoncé qu'une fois l'option vérifiée en place, sinon le message dit pourquoi.
- Écran de chargement : sur la borne, la vidéo de chargement du jeu seule, plein écran, sans texte ; au bureau, la vidéo dans le cadre du plateau et le titre avec les commandes de la partie dans un encart à côté, sans plus rien recouvrir.

## 0.1.2

- Mise à jour : la recherche part dès le démarrage, puis toutes les 6 heures ; la pastille rouge s'affiche sans ouvrir le menu.
- Mise à jour : l'installation ne bloque plus quand Cyber Pinball est lancé depuis son raccourci, et un échec relance Cyber Pinball sans clic.
- Bouton « ‹ Retour » au-dessus du titre de chaque menu, et dans les réglages de VPX.
- Médias proposés par les sites : afficheur que la borne ne montre pas signalé, nombre de sites par média, recherche sur le web.

## 0.1.1

- Mise à jour depuis la borne, aussi pour une borne copiée sans l'installeur : ses raccourcis restent ceux qui existent.
- Pastille rouge plus discrète sur la roue dentée ; le menu système s'ouvre sur l'entrée qui attend.

## 0.1.0

- Première version publique : assistant d'écrans, de boutons et de son, menu des tables aux boutons de la borne.
- Ajout de tables, bibliothèque de ROM, PuP-Packs, catalogue VPS et liste d'attente.
- Médias des jeux : import depuis PinUP Popper ou PinballX, téléchargement depuis VPinMediaDB, puis VPForums et VPUniverse avec votre compte, mode attente.
- Mise à jour depuis le menu système : « Mise à jour de Cyber Pinball », signalée par une pastille rouge sur la roue dentée quand une version est disponible.
- Interface en français ou en anglais, au choix dans le menu système : « Langue / Language ».
- S'installe à côté de PinUP Popper, PinballX ou PinballY : attend qu'un autre menu ouvert soit fermé, prévient avant de retourner un écran dans Windows.
