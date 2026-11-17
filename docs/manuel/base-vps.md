[English](../manual/vps-database.md) · Français · [Sommaire du manuel](../manuel.md)

## Base VPS

L'ajout de tables reconnaît chaque table dans la [base VPS](https://github.com/VirtualPinballSpreadsheet/vps-db) (Virtual Pinball Spreadsheet, fichier `db/vpsdb.json`, environ 2 600 jeux) et s'en sert pour nommer le dossier « Titre (Fabricant Année) » et remplir le `.info` : `Title`, `Manufacturer`, `Year`, `VPSId` (identifiant du jeu, partagé par toutes les versions du dossier), `Authors` (ceux de la version de la table reconnue) et `IPDBId`.
Les champs déjà présents dans un `.info` existant ou apporté par l'archive sont conservés.

- **Licence** : le dépôt `vps-db` ne déclare aucune licence (vérifié le 20 octobre 2026 : pas de fichier LICENSE, `license: null` dans l'API GitHub, rien sur le site).
  Sans licence, la redistribution n'est pas permise : Cyber Pinball ne livre pas la base.
  Elle est téléchargée au premier ajout de table depuis son adresse officielle (`https://raw.githubusercontent.com/VirtualPinballSpreadsheet/vps-db/main/db/vpsdb.json`) et gardée dans `<racine>\downloads\vpsdb.json`, comme les composants.
  Les tests utilisent un extrait de quelques jeux recopié à la main.
- **Mise à jour** : au plus toutes les 12 heures, en arrière-plan, quand on ouvre « Ajouter une table » ; `lastUpdated.json` (quelques octets) dit si la base a changé.
  Sans réseau, le cache sert tel quel ; sans cache ni réseau, les noms sont déduits des fichiers, comme avant.
  Une réponse invalide ne remplace jamais le cache.
- **Rapprochement** ([packages/core/src/vps.ts](../../packages/core/src/vps.ts)) : d'après le nom des `.vpx`, du `.directb2s` du même paquet, de l'archive et des dossiers, et d'après la ROM lue dans le script.
  Préfixe numérique de VPUniverse ignoré, titre comparé sans casse, accents ni ponctuation, avec ou sans article (« Addams Family » pour « The Addams Family »), titre principal (« Terminator 2 » pour « Terminator 2 - Judgment Day »), « Dr. » pour « Doctor » ; fabricant et année départagent les homonymes ; auteurs (« VPW », « g5k », « Bigus ») et numéro de version désignent la version de la table.
  Résultat : une liste de jeux avec un score entre 0 et 1.
- **Confiance** : à partir de 0,85 avec 0,08 d'avance sur le suivant, le jeu est retenu sans question.
  Sinon, l'écran « Quel jeu est-ce ? » propose jusqu'à cinq jeux, plus « Garder » le nom déduit des fichiers (jeu absent de la base) ; jeu absent sans proposition : nom des fichiers, sans question.
  Depuis le plan, « Choisir le jeu » ou « Changer le jeu » rouvre l'écran pour chaque table.
  Rien ne bouge avant « Installer ».
- Mesure sur la base entière (nom fabriqué « Nom (Fabricant Année).vpx » pour chacun des 2 366 jeux qui ont une table VPX) : 99,7 % reconnus en premier, aucune certitude erronée ; les autres sont des doublons de la base.
