[English](../manual/parental-controls.md) · Français · [Sommaire](../manuel.md)

## Contrôle parental

Le menu système **Ma borne → Contrôle parental** permet de définir un PIN à quatre chiffres, puis de protéger une ou plusieurs collections et des tables individuelles.
La protection est désactivée au départ.
Le propriétaire choisit le code et le confirme sur la borne avant d'activer la protection.
Le PIN en cours est exigé pour modifier les paramètres, désactiver la protection ou choisir un autre code.

Une collection protégée couvre toutes ses tables, aussi quand elles figurent dans Toutes, Favoris, Récentes ou une autre collection.
Une protection individuelle suit la table dans son dossier au remplacement du fichier de jeu.
Si plusieurs versions partagent ce dossier, elles bénéficient de la même protection.
Vérifier les protections en cas de déplacement manuel des tables dans un autre dossier.
Les mises à jour de Cyber et des moteurs conservent le fichier de protection dans le dossier des données.

Sur la borne, les flippers font défiler le chiffre de 0 à 9 dans les deux sens.
**Start** valide un chiffre à la fois et **Exit** annule.
Les cases précédentes affichent des points.
Après cinq échecs, attendre une minute entre les essais.
La temporisation est conservée après redémarrage.

Un code correct ouvre la table ou la collection demandée.
La collection peut rester ouverte pour plusieurs parties, jusqu'à un changement de collection, le verrouillage manuel, le changement de mode, le redémarrage ou le délai d'inactivité configuré.
La partie en cours continue pendant un reverrouillage.
Pour ouvrir un élément masqué, utiliser **Ouvrir une collection protégée** ou **Ouvrir une table protégée** dans le menu du contrôle parental.
Le mode Invité conserve ses restrictions et ne peut pas ouvrir les éléments protégés.

Les médias et le chargement des éléments verrouillés cèdent la place aux visuels de la borne.
Le tirage de Table surprise et le défilement au repos excluent les tables protégées.
Le propriétaire saisit le PIN sur la borne.
Le téléphone peut continuer à piloter les éléments ordinaires hors d'une session parentale.

### Récupération par le propriétaire Windows

En cas de code perdu ou de fichier illisible, fermer Cyber Pinball.
Se connecter au compte Windows autorisé à administrer les données de la borne.
Conserver `controle-parental.json` dans un emplacement réservé au propriétaire, puis le retirer du dossier des données de Cyber.
Relancer Cyber, créer un nouveau code et rétablir les protections sur les tables et collections avant de rendre la borne accessible.
Le fichier contient une empreinte dérivée par scrypt avec un sel aléatoire.
L'ancien PIN ne peut pas être affiché depuis Cyber.

La protection s'applique aux accès depuis Cyber Pinball.
Utiliser aussi les contrôles de Windows, Steam et des autres frontends pour limiter les accès à ces applications ou aux fichiers sur le disque.
