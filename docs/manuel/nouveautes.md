[English](../manual/whats-new.md) · Français · [Sommaire du manuel](../manuel.md)

## Nouveautés

**Menu système > Nouveautés** montre les grandes nouveautés de Cyber Pinball, choisies une à une : ce qui change vraiment ce qu'on fait avec la borne.
Ce n'est pas la liste des corrections : celle-ci reste dans les notes de chaque version (« Mise à jour de Cyber Pinball » et le CHANGELOG).

- **Une chronologie** : la plus récente en haut, la date et la version dites une seule fois pour les nouveautés du même jour.
  Chaque ligne a son titre, une phrase qui dit ce qu'elle apporte et, si elle en a un, un petit aperçu ; « Nouveau » marque celles qu'on n'avait pas encore vues, « BÊTA » celles qui sont encore en essai.
- **Une nouveauté en grand** : Start sur une ligne l'agrandit, avec son grand aperçu, son texte entier et où la trouver (« Où : Communauté › Parties instantanées »).
  « Essayer » mène directement à la fonction ; son « Retour » ramène à la nouveauté.
  Quand elle ne peut pas servir maintenant, « Essayer » reste visible, grisé, avec sa raison (mode invité, partage désactivé, aucune table choisie sur la roue).
  « ‹ Précédente » et « Suivante › » passent d'une nouveauté à l'autre sans revenir à la liste.
- **La pastille rouge** : sur la roue dentée et sur l'entrée, tant qu'une nouveauté n'a pas été vue, dès la première installation.
  Ouvrir l'écran les marque toutes vues ; le repère « Nouveau » reste jusqu'à ce qu'on le quitte.
  Une borne neuve, ou mise à jour depuis une version qui n'avait pas cet écran, voit comme nouvelles celles de la dernière date seulement.
  Ce qui a été vu est gardé d'un démarrage à l'autre (`<données>\nouveautes.json`) ; un fichier illisible repart de l'état de départ.
  Une ligne ajoutée après coup rallume la pastille rouge, même sur une borne qui avait déjà tout vu : ainsi les **niveaux**, sortis avec la 0.1.14 sans leur ligne, l'ont reçue ensuite, avec le moment d'un badge en aperçu ; leur « Essayer » ouvre « Mon niveau » (voir [Niveaux et badges](niveaux-et-badges.md#niveaux-et-badges)).
- **Sa place** : en tête du menu système tant qu'une nouveauté n'est pas vue ou que la dernière a moins de trois semaines ; ensuite, seulement dans la rubrique Cyber Pinball, après « Mise à jour de Cyber Pinball ».
- **Ce qui y entre** : une ligne par vraie capacité nouvelle, jamais une correction, un gain de vitesse ou un réglage.
  Une fonction améliorée sur plusieurs versions n'a qu'une ligne, à la date de son arrivée.
  On n'en ajoute pas à chaque version, seulement quand une fonction le mérite : jamais plus de quatre le même jour, ni plus de vingt-quatre en tout (les plus anciennes partent).
  Les textes sont écrits pour le joueur, en français et en anglais ; les aperçus montrent les tables inventées de Cyber Pinball, jamais un vrai jeu.
  Chaque publication, préversions comprises, rappelle les lignes de sa version et la dernière ligne, et demande si une fonction en mérite une ; rien n'est ajouté d'office (`packages/core/src/news.ts`).
- **Mode invité** : l'écran est fermé, comme tout le menu système.
