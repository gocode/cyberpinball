[English](../manual/known-limitations-of-the-prototype.md) · Français · [Sommaire du manuel](../manuel.md)

## Limites connues du prototype

- Démarrage de l'application : entre son lancement et ses premiers voiles (environ 1 à 2 s), le bureau reste visible ; aucune fenêtre ne peut exister plus tôt.
  Sauf en [borne dédiée](borne-dediee.md#borne-dédiée) (Windows Entreprise, Éducation ou IoT Enterprise) : Cyber Pinball y remplace l'Explorateur, il n'y a plus de bureau à voir.
  Arrêtée de force en pleine partie, l'application laisse les barres des tâches masquées jusqu'à son démarrage suivant (ou au redémarrage de l'Explorateur).
  Avant sa première image, une fenêtre est transparente (sans fond système de Windows) : si rien de Cyber Pinball n'est dessous, le bureau se voit au travers jusque-là ; c'est le cas du voile au démarrage, d'où un bureau visible un peu plus longtemps.
  Un écran rebranché ou réveillé pendant que le front-end tourne (moniteurs mis en veille par le verrouillage de Windows, renumérotés au réveil) reçoit de nouveau son voile noir, mais les fenêtres du front-end ne suivent pas encore ce changement : le gardien signale l'écran découvert ou mal couvert dans la console, et un redémarrage de Cyber Pinball remet tout en place.
- Clés de VPX 10.8.1 (fenêtres `Player`, `Backglass`, `ScoreView`, `Topper`, `[Plugin.<id>] Enable`, priorités et réglages des plugins B2S, PUP et DMDUtil).
  Le format des noms d'écran et les plugins à activer changent selon la version de VPX : ils sont décrits par version dans le manifeste (`adapterSettings`).
- Autres versions de VPX (voir [Autres versions de VPX](autres-versions-de-vpx.md#autres-versions-de-vpx)) : Cyber Pinball n'en est que le lanceur, avec les réglages de ce VPX.
  Pas de réalité virtuelle, de réglage de l'affichage en partie, de partie entre amis, de Vision 3D, de réglages de VPX de Cyber Pinball ni de préparation des PuP-Packs pour les tables jouées ainsi.
- Image du front-end sur le DMD réel : le serveur du DMD n'accepte que le `dmdutil64.dll` de VPX 10.8.1, reconnu à son empreinte.
  Avec toute autre version de VPX, plus récente ou plus ancienne, « Image du front-end » est grisé avec sa raison et VPX garde le DMD en partie.
  Passer à une autre version demande de recopier les en-têtes, de refaire `packages/dmdserver/dmdutil64.def` et d'ajouter l'empreinte (`vendor/PROVENANCE.txt`) ; un test l'exige pour la version de VPX installée.
  Bêta, comme tout le DMD réel, jusqu'à confirmation sur des bornes équipées.
- Journal de VPX pour diagnostiquer : `%APPDATA%\VPinballX\10.8\vpinball.log` (lignes « The selected display … is not available »).
- Exécutable et installeurs non signés tant qu'aucun certificat n'est fourni (configuration prête, voir [Signature](installation-et-organisation-des-fichiers.md#signature)) : SmartScreen avertit au lancement de l'installeur.
- Mise à jour à la demande seulement (menu système, voir [Mise à jour depuis la borne](installation-et-organisation-des-fichiers.md#mise-à-jour-depuis-la-borne)) : pas de recherche en arrière-plan.
  Pendant l'installation (une minute environ), le bureau Windows et la page de progression de l'installeur se voient sur l'écran principal.
  Le retour à l'ancienne version en cas d'échec de l'installeur n'a pas encore été provoqué en essai.
- VPX repère les écrans en coordonnées logiques : avec une mise à l'échelle Windows différente de 100 %, la position écrite peut ne pas correspondre.
  L'assistant le signale.
- Modèle stocké en JSON.
  La spec prévoit SQLite.
- Configurations de la borne : les réglages propres à chaque table (dont le cadrage réglé en partie, qui dépend pourtant de l'écran du playfield) sont communs à toutes les configurations.
  Un réglage général de VPX changé après la création d'une configuration ne vaut que pour la configuration active.
  L'écran de choix, la gestion des configurations et le bandeau n'ont pas encore été capturés (en attente du mode de test hors écran, pour ne pas occuper les écrans du poste).
- Mode plugins de VPX 10.8.1 seulement : pas encore de `ScreenRes.txt`, `DmdDevice.ini` ni `B2STableSettings.xml` pour le mode classique ; DOF par le plugin de VPX seulement (pas de DirectOutput.dll classique), sans essai des LED hors partie.
  Le DMD réel n'en a pas besoin : en mode plugins, VPX l'alimente par son plugin DMDUtil (`[Plugin.DMDUtil]`), et `DmdDevice.ini` n'est lu que par le `DmdDevice64.dll` de VPinMAME, en mode classique.
- Zones : l'ordre de superposition de deux zones qui se chevauchent et la rotation d'une zone ne se règlent pas (VPX n'en a pas de réglage).
  Le rendu réel dans VPX reste à vérifier sur une borne, en particulier le playfield fenêtré d'un poste de bureau.
- Boutons : touches du clavier et boutons de joystick (Pinscape, encodeur en mode manette ; voir « Boutons de la borne »).
  Les croix d'une manette se relèvent comme des boutons, pas encore ses axes (directions du stick d'un Zero Delay, gâchettes) ; un bouton d'encodeur qui envoie une combinaison de touches n'est pas pris en charge.
- Son : les vidéos et la musique du front-end jouent encore sur la sortie par défaut de Windows, comme les composants COM hors plugins (VPinMAME, B2S, PinUP Player autonomes).
  Rien ne vérifie encore que la sortie par défaut est celle du fronton.
- Pinball FX3 (bêta, voir [Tables de Pinball FX3](tables-de-pinball-fx3.md)) : pas encore essayé sur une vraie installation ; lancement direct, `-class` et titre de fenêtre « Pinball FX Classic » viennent des front-ends et de Zen, pas d'un essai.
  Cyber Pinball ne sait pas quelles tables sont achetées (Steam les installe toutes) ni si le jeu est resté sur son écran d'accueil : il le suppose d'une partie de moins de 45 s.
  Vrai DMD : seulement par `dmdext`, qui lit la mémoire du jeu, et que Cyber Pinball ne lance pas encore.
  « Mars » ouvre « Attack from Mars » quand le compte a les deux tables (défaut du jeu).
