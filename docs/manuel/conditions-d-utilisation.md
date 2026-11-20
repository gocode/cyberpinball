[English](../manual/terms-of-use.md) · Français · [Sommaire du manuel](../manuel.md)

## Conditions d'utilisation

Cyber Pinball ne fournit aucune table, ROM ni média de jeu commercial : ses conditions d'utilisation disent ce dont l'utilisateur répond et écartent toute garantie.
Elles couvrent les contenus de tiers (droit d'auteur, marques, ROM des fabricants), le partage entre bornes (activé d'office ; attestation des droits pour une ROM ou un PuP-Pack récupéré chez un ami), les sites et services tiers, l'usage commercial (licence de VPX, lieux ouverts au public), la santé et la sécurité (épilepsie photosensible, réalité virtuelle, matériel de la borne), l'absence de garantie et la limitation de responsabilité, les données, et leur évolution.
Elles ne restreignent pas la licence GPL du code.

- **Un seul texte**, dans [packages/core/src/terms.ts](../../packages/core/src/terms.ts), traduit comme le reste de l'interface.
  `TERMS_VERSION` est sa date : la changer quand le fond du texte change, pour qu'il soit présenté de nouveau à chacun.
- **À l'installation** : la page « Conditions d'utilisation » de l'installeur, avec « J'accepte » (voir [Installeur Windows](installation-et-organisation-des-fichiers.md#installeur-windows)).
- **Au démarrage du front-end**, tant que `<données>\conditions.json` ne porte pas la version en cours (installation sans l'installeur, ou mise à jour qui change le texte) : un écran par partie du texte, aux boutons de la borne ([app/src/terms-menu.ts](../../app/src/terms-menu.ts)), avant « Votre profil de joueur » et après l'ouverture.
  « J'accepte » l'enregistre et reprend le démarrage ; « Je refuse » demande confirmation, puis ferme Cyber Pinball.
  Exit n'y fait que revenir à la page précédente.
  Pas en mode invité ni pendant un essai sans opérateur (sauf `CYBERPINBALL_CONDITIONS=1`).
- **À relire** dans Menu système > Aide et infos > Conditions d’utilisation, avec la date de l'acceptation.

Garde-fou : [terms.test.ts](../../packages/core/src/test/terms.test.ts) vérifie le texte dans les deux langues, sa forme pour l'installeur, et que l'application relit le fichier écrit par l'installeur.
