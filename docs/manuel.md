[English](manual.md) · Français

# Cyber Pinball : manuel technique

Référence complète du prototype, en français : fonctionnement de chaque partie, fichiers écrits, commandes, essais sans opérateur et limites connues. Présentation du projet : [README.fr.md](../README.fr.md) (en anglais : [README.md](../README.md)).

Les notes de conception citées ici (`docs/recherche/…`) sont des documents de travail internes : elles ne sont pas publiées avec le code.

Frontend open source de borne de flipper virtuel. Son principe : on décrit la borne une fois, et Cyber Pinball écrit et maintient la configuration de tous les composants (VPX, puis B2S, PinUP, DMD, DOF). Plus besoin d'éditer un `.ini` à la main.

**État : prototype des jalons 1 et 2.**
- **Écrans** : détection par EDID, assistant piloté par les boutons de la borne (rôles, bord des flippers, diagonale du playfield), génération de `VPinballX.ini` avec le cadrage automatique des tables, corrigé automatiquement quand Windows renumérote ou déplace les écrans.
- **Configurations de la borne** : plusieurs jeux d'écrans pour une même installation (deux postes, un PC de bureau et une borne), chacun avec ses rôles, son son, ses boutons et son `VPinballX.ini` ; celui qui est branché est reconnu d'office au démarrage, avant chaque partie et à la commande `sync` (voir [Configurations de la borne](#configurations-de-la-borne)).
- **Son** : étape de l'assistant qui joue un son sur chaque sortie audio et fait choisir celle du fronton et celle du plateau, puis teste les haut-parleurs d'une carte 5.1 ou 7.1 ; `SoundDeviceBG`, `SoundDevice` et `Sound3D` réécrits à chaque démarrage avec le nom courant des sorties (voir [Son](#son)).
- **Menu des tables** : une fenêtre par écran de la borne, lancement de VPX en `-Play`, écran de chargement avec les commandes de la partie, retour au menu avec reprise du premier plan, statistiques dans le fichier `.info` de chaque table, erreurs de VPX rapportées en clair. Écran du playfield couché et tourné, Windows resté en paysage : le menu, la fiche, la gestion des tables et les réglages pivotent pour un joueur placé au bord des flippers (`playfield.flipperEdge` du modèle de borne, ramené à l'orientation actuelle de l'écran), en portrait à 90° et 270° ; le backglass, le DMD et le topper ne pivotent pas.
- **Fenêtres plein écran** : chaque fenêtre (menu, fiche, réglages, assistant) couvre tout son écran, barre des tâches de Windows comprise, sans liseré : plein écran d'Electron (`coverDisplay`, `app/src/cover-display.ts`), sans premier plan forcé. VPX passe devant pendant une partie, les boîtes de dialogue de Windows (« Choisir des fichiers ») restent au-dessus, et la touche Windows ou Alt+Tab font revenir le bureau et la barre des tâches. Menu système > « Bureau Windows » réduit toutes les fenêtres ; le bouton du playfield dans la barre des tâches (ou Alt+Tab) rouvre le menu sur tous les écrans.
- **Aucun écran ne montre le bureau Windows** (gardien des écrans, `app/src/screen-guard.ts`), du démarrage à la fin d'une partie : un voile noir par écran, ouvert avant toute autre fenêtre et jamais au premier plan ; les fenêtres du menu restent derrière VPX pendant le chargement et la partie ; la relance menu ↔ assistant passe le relais sans trou ; les barres des tâches sont masquées pendant une partie. Un écran qui reste découvert plus d'une seconde est signalé dans la console (voir [Lancement d'une partie](#lancement-dune-partie)).

## Démarrer

Prérequis : Windows 10 ou 11, Node.js 22 ou plus.

Le plus simple : double-cliquez sur `lanceur.cmd`. Il propose un menu (jouer, installation, ouverture de VPX, détection, assistant, synchronisation, endurance, tests, démonstrations hors écran, dossier de données) et compile ce qu'il faut avant chaque action. `.\lanceur.cmd sync` lance une action directement. Les scénarios à tester à la main sont dans [docs/tests-manuels.md](tests-manuels.md).

**Comme un utilisateur final** : l'action « Fabriquer et déployer » (ou `npm run deployer`) produit `CyberPinball.exe` et le copie dans `<racine>\app\`, avec un raccourci `Cyber Pinball.lnk` à la racine. L'exécutable trouve sa racine tout seul (le dossier qui contient `app\`) ; s'il manque VPX, il propose de l'installer depuis l'écran.

**Pour distribuer** : l'action « Fabriquer l'installeur » (ou `npm run installeur`) produit `release\CyberPinball-Setup.exe` (version légère) et `release\CyberPinball-Setup-complet.exe` (avec VPX). Voir [Installeur Windows](#installeur-windows).

Les mêmes commandes avec npm :

```bash
npm install
npm test          # compile et lance les tests du cœur
npm run probe     # liste les écrans et les sorties audio détectés, leur empreinte et le nom attendu par VPX
npm start         # menu des tables (assistant d'écrans au premier démarrage)
npm run assistant # assistant complet (-- --boutons, --ecrans, --playfield, --disposition, --son : une seule étape)
npm run fabriquer # exécutable dans release\win-unpacked\ (npm run deployer : et copie dans <racine>\app\)
npm run installeur # idem, puis release\CyberPinball-Setup.exe et -complet.exe (-- --leger : sans la complète)
npm run sync      # ce que fera l'application à chaque démarrage : corrige VPinballX.ini si les écrans ont bougé
npm run vpx-schema # régénère le schéma des réglages de VPX depuis son code source (-- --check : vérifie seulement)
```

Les touches sont celles des boutons de la borne, relevées à la première étape de l'assistant (« Boutons », voir plus bas). Tant qu'elle n'a pas été faite, ce sont celles qu'envoient par défaut les encodeurs de borne :

| Bouton | Touche par défaut | Assistant | Menu des tables |
| --- | --- | --- | --- |
| Flipper gauche / droit | Shift gauche / droit | Changer d'écran ; son : fronton / plateau | Choisir une table |
| Start | 1 | Valider ; son : les deux | Jouer |
| Exit | Échap | Passer un rôle, recommencer ; son : aucun rôle ; boutons : passer un bouton facultatif | Menu : revenir, réglages de VPX, boutons, quitter |
| (clavier) | flèches, Entrée, Échap | Comme les flippers, Start, Exit | Comme les flippers, Start, Exit |
| (clavier) | Tab | Bouton : refusé (réservé) | Menu et configuration, depuis n'importe où dans le menu ; puis Tab / Maj+Tab pour s'y déplacer |
| (souris) | ⚙ en haut à droite | | Menu et configuration |
| (clavier) | H | | Afficher les commandes |
| (clavier) | R | | Réglages de VPX |
| (clavier) | Retour arrière | Étape précédente | |
| (clavier) | Ctrl+Q | Quitter | Quitter |
| (clavier) | Ctrl+Maj+K | | Arrêter une partie bloquée |

Les touches du clavier ne servent que si aucun bouton de la borne ne les envoie déjà (une flèche relevée comme flipper droit ne recule plus) ; H et R non plus.

Pendant une partie, ce sont les touches écrites dans `[Input]` de VPX (rappelées sur l'écran de chargement) : par défaut Shift pour les flippers, Entrée pour le lanceur, 5 pour un crédit, 1 pour Start, Échap pour quitter (VPX 10.8.1 quitte dès l'appui), et les deux MagnaSave ensemble (sans eux, Crédit et Start) pour le menu de VPX, où se placent les écrans (« Régler l'affichage en partie »).

## Installation et organisation des fichiers

Tout Cyber Pinball vit dans une **racine choisie à l'installation** (action « Installer » du lanceur), par exemple `D:\CyberPinball`. L'organisation est fixe : une mise à jour ne déplace rien.

```
D:\CyberPinball\
  app\                         Cyber Pinball, remplacé en entier à chaque mise à jour
  emulators\vpx\10.8.1-5436\   VPX tel que publié, une version par dossier
  emulators\vpx\current\       jonction vers la version active
  tables\  media\              tables et médias, toutes familles d'émulateurs
  pinmame\roms\                bibliothèque de ROM : chaque ROM une fois, liée dans chaque table
  config\VPinballX.ini         passé à VPX par -Ini, indépendant de sa version ; VPinballX-<id>.ini : autres configurations
  data\                        modèle de borne (cabinet.json, toutes ses configurations), sauvegardes
  downloads\                   archives vérifiées, pour réinstaller sans réseau ; base VPS
  import\                      tables déposées depuis une clé USB, proposées à l'ajout
```

- Les composants tiers (VPX aujourd'hui, d'autres émulateurs ensuite) sont décrits dans [packages/installer/components.json](../packages/installer/components.json) : version, URL officielle, SHA-256, et mode de distribution (`automatic` si la licence permet de les livrer, `manual` sinon). Ils ne sont pas dans le dépôt git.
- Une archive dont l'empreinte ne correspond pas au manifeste est supprimée, jamais installée. Relancer l'installation ne retélécharge rien.
- La racine est refusée dans Program Files, dans Windows et sur un partage réseau. Le choix est mémorisé dans `%APPDATA%\CyberPinball\root.json`.
- Avant le choix d'une racine, tout s'écrit dans un bac à sable (`%APPDATA%\CyberPinball\sandbox\`). Il est repris automatiquement lors de l'installation.
- Avant chaque écriture de `VPinballX.ini`, l'ancienne version est sauvegardée dans `data\backups\` (10 versions conservées). Seules les clés possédées par Cyber Pinball sont modifiées.
- Une clé possédée changée à la main (ou par le menu en jeu de VPX) n'est jamais écrasée en silence : `data\vpx-owned.json` garde les valeurs écrites la dernière fois dans chaque `VPinballX.ini` (un jeu de valeurs par configuration de la borne), et le menu demande au démarrage de garder la nouvelle valeur ou de remettre celle de Cyber Pinball (`npm run sync -- --reecrire` en ligne de commande). Garder une taille d'écran la réimporte dans le modèle de borne ; garder une autre clé la laisse à l'utilisateur (`vpxManual` dans `cabinet.json`, modifiable dans les réglages de VPX) jusqu'au prochain passage de l'assistant d'écrans, qui reprend la main sur toutes les clés. Un nombre réécrit par VPX avec d'autres décimales ne compte pas comme une modification.
- Variables pour les tests : `CYBERPINBALL_ROOT` (autre racine), `CYBERPINBALL_HOME` (bac à sable isolé), `CYBERPINBALL_VPX_INI` (autre fichier).

En ligne de commande : `node packages/installer/dist/cli.js setup <racine>`, `install [id]`, `status`.

### Installeur Windows

`npm run installeur` fabrique l'exécutable, puis deux installeurs NSIS en français dans `release\` :

| Fichier | Taille | VPX |
| --- | --- | --- |
| `CyberPinball-Setup.exe` (légère) | 111 Mio | téléchargé au premier lancement (173 Mo), vérifié par SHA-256 |
| `CyberPinball-Setup-complet.exe` | 276 Mio | archive officielle incluse, posée dans `downloads\` : installée au premier lancement, sans connexion |

Ce que fait l'installeur :
- **Dossier racine** au choix. Proposé : celui de l'installation précédente, sinon la racine mémorisée dans `root.json`, sinon `D:\CyberPinball` si `D:` est un disque local, sinon `C:\CyberPinball`. Mêmes refus que `packages/installer` : Program Files, Windows, dossier réseau (lecteur réseau compris), plus un disque absent ou un chemin incomplet. Un dossier `app\` qui ne contient pas Cyber Pinball est refusé aussi.
- L'application va dans `<racine>\app\` (remplacée en entier à chaque mise à jour), l'organisation de la racine est créée et la racine est mémorisée dans `%APPDATA%\CyberPinball\root.json`.
- Les données d'avant le choix d'une racine (`%APPDATA%\CyberPinball` : modèle de borne, sauvegardes, `sandbox\VPinballX.ini`) sont reprises comme par `setup`, sans jamais écraser celles de la racine.
- Raccourcis : `Cyber Pinball.lnk` à la racine et dans le menu Démarrer ; sur le bureau (coché par défaut) ; au démarrage de Windows en option, pour une borne dédiée (dossier Démarrage de la session).
- Installation pour l'utilisateur courant, sans droits d'administrateur, avec une entrée dans « Programmes et fonctionnalités » (`HKCU`).
- Si Cyber Pinball est ouvert, l'installeur et le désinstalleur demandent de le fermer.
- Ligne de commande : `/S` silencieux, `/DEMARRAGE` lancement au démarrage de Windows, `/SANSBUREAU` sans raccourci sur le bureau, `/D=D:\Borne` racine (en dernier, sans guillemets). Code de sortie 2 si la racine est refusée.

**La désinstallation retire l'application seulement** : le dossier `app\`, les raccourcis et l'entrée de « Programmes et fonctionnalités ». Les tables, médias, configuration, données (modèle de borne, sauvegardes), émulateurs, téléchargements, `import\` et `root.json` restent : une réinstallation dans la même racine les retrouve tels quels. Pour tout effacer, il faut supprimer la racine à la main. Le désinstalleur (`app\Désinstaller Cyber Pinball.exe`, `/S` pour le mode silencieux) refuse de s'exécuter hors d'un dossier `app\` qui contient `CyberPinball.exe` et le journal `installation.ini`.

**Licence de VPX et version complète.** VPX est sous GPLv3+ pour la majorité de ses fichiers ; le reste garde une licence dérivée de celle de MAME (`docs\license.txt` de l'archive), qui autorise la redistribution à trois conditions : ne pas la vendre ni l'utiliser dans un produit ou une activité commerciale, livrer les sources d'une version modifiée, reproduire la licence. La version complète embarque l'archive officielle inchangée (empreinte vérifiée à la fabrication contre le manifeste) et, à côté, `<archive>.licence.txt` : le texte complet de la licence lu dans l'archive elle-même, l'adresse de l'archive et le commit de ses sources. Elle est donc redistribuable gratuitement, mais **ne doit jamais être vendue, ni livrée avec une borne vendue ou exploitée commercialement**. La fabrication s'arrête si la licence trouvée dans l'archive change. L'archive est prise dans `CYBERPINBALL_VPX_ARCHIVE` si la variable est définie, sinon dans `cache\downloads\` (téléchargée au besoin).

Le script NSIS est [scripts/installeur/cyberpinball.nsi](../scripts/installeur/cyberpinball.nsi), compilé par [scripts/installeur.mjs](../scripts/installeur.mjs) avec le NSIS 3 qu'electron-builder télécharge (empreinte vérifiée). L'icône est dessinée dans [app/renderer/icone.svg](../app/renderer/icone.svg), qui sert aussi de logo au topper dessiné ; `node scripts/icone.mjs` la rend hors écran à chaque taille du `.ico` et en tire le bandeau des pages d'accueil (dans `app\ressources\`). Dans l'exécutable, koffi est réduit au JavaScript chargé à l'exécution et au binaire `win32-x64`.

### Signature

Rien n'est signé sans certificat : la fabrication continue sans rien demander. Avec un certificat de signature de code (Authenticode), `CyberPinball.exe`, le désinstalleur et les deux installeurs sont signés et horodatés par `signtool` (le désinstalleur est écrit et signé avant d'être embarqué). Le certificat se désigne par variables d'environnement, jamais dans le dépôt ([scripts/signature.mjs](../scripts/signature.mjs)) :

| Variable | Rôle |
| --- | --- |
| `CYBERPINBALL_SIGN_SHA1` | empreinte d'un certificat du magasin Windows : clé USB ou HSM, obligatoires pour les certificats délivrés depuis juin 2023 |
| `CYBERPINBALL_SIGN_PFX`, `CYBERPINBALL_SIGN_PASSWORD` | fichier `.pfx` et son mot de passe (certificat ancien ou de test) |
| `CYBERPINBALL_SIGN_ARGS` | arguments de `signtool` à la place des précédents, par exemple `/dlib … /dmdf …` pour un service de signature dans le nuage (Azure Trusted Signing) |
| `CYBERPINBALL_SIGN_TIMESTAMP` | serveur d'horodatage RFC 3161 (défaut : `http://timestamp.digicert.com`) |
| `SIGNTOOL_PATH` | `signtool.exe` à utiliser (défaut : le plus récent des Windows Kits, sinon celui fourni par electron-builder) |

Procédure, une fois le certificat obtenu au nom de l'éditeur de Cyber Pinball :

```powershell
certutil -user -store My                    # empreinte (« Hachage cert. (sha1) ») du certificat
$env:CYBERPINBALL_SIGN_SHA1 = '<empreinte>'
npm run installeur
Get-AuthenticodeSignature release\CyberPinball-Setup.exe, release\win-unpacked\CyberPinball.exe   # Status : Valid
```

Un certificat OV donne une signature valide, mais SmartScreen avertit encore tant que la réputation de l'éditeur n'est pas établie ; un certificat EV ou Azure Trusted Signing l'établit d'emblée.

### Mise à jour depuis la borne

Une borne installée se met à jour depuis le menu système, entrée **« Mise à jour de Cyber Pinball »** (détail : version installée, et version disponible une fois cherchée). Rien ne s'installe d'office : une recherche discrète part 30 s après le démarrage puis toutes les 6 h, sans rien télécharger ni rien afficher en cas d'échec (pas de réseau) ; une version disponible met une **pastille rouge** sur la roue dentée du menu (⚙) et sur l'entrée « Mise à jour de Cyber Pinball » du menu système (`attention` des entrées du menu système, repris par la roue dentée dès qu'une entrée en porte une). Ouverte, l'entrée montre aussitôt les nouveautés de chaque version manquée depuis celle de la borne (`history` du flux), et « Mettre à jour maintenant », choisi d'office : l'installation est à un bouton. Un résultat de plus de 10 minutes est recherché à nouveau. Hors écran, les essais ne cherchent que leur site d'essai (`CYBERPINBALL_MAJ_URL`), jamais GitHub. Code : [packages/core/src/update.ts](../packages/core/src/update.ts) (flux, versions, téléchargement), [app/src/updates-menu.ts](../app/src/updates-menu.ts) (écran).

- **Où** : les releases du dépôt public [github.com/gocode/cyberpinball](https://github.com/gocode/cyberpinball). La borne lit `https://github.com/gocode/cyberpinball/releases/latest/download/cyberpinball-maj.json` (redirection de GitHub, sans la limite de débit de son API ; les préversions n'y figurent pas). Le dépôt est écrit à un seul endroit (`UPDATE_REPOSITORY`), égal à `repository` du `package.json` (vérifié par les tests) ; l'installeur en tire le site de « Programmes et fonctionnalités ».
- **Flux signé** : `cyberpinball-maj.json` contient le manifeste (version, date, nouveautés en français et, si `CHANGELOG.en.md` a la section de la version, en anglais (`notesByLanguage.en`) : la borne affiche celles de sa langue, sinon les françaises ; installeur léger : adresse de la release, taille, SHA-256) et sa signature Ed25519. La borne ne lit qu'un flux signé par la clé de publication, dont la moitié publique est livrée dans l'application ([update-key.ts](../packages/core/src/update-key.ts)) : un compte GitHub compromis ne suffit pas à faire installer un programme sur les bornes. L'installeur téléchargé (`<racine>\downloads\cyberpinball\CyberPinball-Setup-<version>.exe`, les précédents sont supprimés) est vérifié (taille et SHA-256 du flux signé) avant d'être lancé ; un fichier faux est supprimé.
- **Écrans** : recherche ; « à jour » (dernière version publiée et sa date) ; « Cyber Pinball x.y.z est disponible » (nouveautés, taille, vérification) avec « Mettre à jour maintenant » et « Plus tard » ; téléchargement (Mio reçus, pourcentage, « Annuler ») ; « Installation » ; « Mise à jour impossible » (pas de réseau, aucune version publiée, signature ou empreinte refusée) avec « Réessayer ». Lancé depuis les sources (`npm start`), la recherche marche mais l'installation n'est pas proposée.
- **Installation** : l'installeur habituel, en mode `/MAJ /D=<racine>` (en plus `/S` hors écran). Seule sa page de progression s'affiche ; il attend que Cyber Pinball se ferme (jusqu'à 60 s), garde les raccourcis choisis à l'installation précédente (bureau, démarrage de Windows, lus dans `app\installation.ini` ; pour une borne déployée par `npm run deployer`, qui n'en a pas, ceux qui existent), renomme l'ancien `app\` en `app.precedente` le temps de l'installation (remis en place si elle échoue, supprimé si elle réussit), puis relance Cyber Pinball avec ses arguments d'avant (`CYBERPINBALL_MAJ_ARGS`). Tables, médias, configuration et données ne sont pas touchés, comme pour toute réinstallation.
- **Au démarrage suivant** : `data\mise-a-jour.json`, écrit avant de lancer l'installeur, dit si la version attendue tourne : bandeau « Cyber Pinball x.y.z est installé (avant : …) », ou « La mise à jour vers x.y.z n'a pas abouti : la version … est restée en place ».

#### Publier une version

```powershell
# 1. Version dans package.json, nouveautés dans CHANGELOG.md (section « ## 0.2.0 », une ligne « - » par point), commit, envoi sur GitHub.
# 2. Une fois pour toutes : jeton GitHub à grain fin, limité au dépôt gocode/cyberpinball, permissions
#    « Contents » et « Administration » en lecture et écriture, rangé seul dans ce fichier (hors du dépôt) :
#    %USERPROFILE%\.cyberpinball\jeton-github.txt   (ou la variable CYBERPINBALL_GITHUB_TOKEN)
npm run publier                      # -- --brouillon : release laissée en brouillon, invisible des bornes
```

[scripts/publier.mjs](../scripts/publier.mjs) passe le contrôle de publication, fabrique les deux installeurs, écrit et signe le flux, le relit avec la clé livrée, crée la release `v<version>` sur le commit envoyé (refusé si des modifications ne sont pas enregistrées, si le commit n'est pas sur GitHub ou si la release existe), y joint `CyberPinball-Setup.exe`, `CyberPinball-Setup-complet.exe` et `cyberpinball-maj.json`, la publie, puis relit le flux comme une borne. Une version avec préversion (`0.2.0-beta.1`) part en « pre-release » : les bornes ne la voient pas. Elle applique enfin la description et les sujets du dépôt, tirés de `description` et `keywords` du `package.json` ; `npm run decrire` les applique seuls (`-- --essai` : vérifie sans rien envoyer). Le jeton a alors besoin, en plus, de la permission « Administration : read and write ».

**Clé de publication** : créée une fois par `node scripts/cle-publication.mjs` (jamais remplacée ensuite ; `--verifier` contrôle qu'elle correspond à la clé livrée). La clé privée n'est jamais dans le dépôt : `%USERPROFILE%\.cyberpinball\cle-publication-maj.pem`, ou `CYBERPINBALL_MAJ_CLE_PRIVEE`. **À sauvegarder hors du poste** : perdue, les bornes installées refuseraient toutes les mises à jour suivantes et devraient être réinstallées à la main.

**Contrôle de publication** ([scripts/audit-publication.mjs](../scripts/audit-publication.mjs), lancé par `npm test` et par la publication) : le dépôt étant public, il refuse dans les fichiers suivis les clés privées, jetons (GitHub, OpenAI, AWS, Slack, Google), mots de passe écrits en clair, chemins d'un profil Windows (`C:\Users\<nom>`), adresses e-mail hors de sa liste (co-auteur des commits, auteurs des polices, exemples) et les noms d'une liste privée gardée hors du dépôt (`%USERPROFILE%\.cyberpinball\audit-noms.txt`, un par ligne, ou `CYBERPINBALL_AUDIT_NOMS`). `--commits <a..b>` vérifie aussi les messages et auteurs de ces commits.

**Essai sans opérateur** : `.\docs\demo-mise-a-jour.ps1` (bureau caché, écrans simulés) fabrique l'installeur de la version du dépôt, publie la suivante dans un site local (`CYBERPINBALL_VERSION_ESSAI`, `publier --local`, flux signé par la vraie clé), installe l'ancienne dans un bac à sable avec lancement au démarrage et sans raccourci sur le bureau, fait refuser un flux falsifié, puis déroule la vraie mise à jour : l'ancienne version télécharge, lance l'installeur et se ferme, l'installeur la remplace et relance la nouvelle, qui l'annonce et se dit à jour. Il vérifie la version installée, les raccourcis gardés, `app.precedente` supprimé, le suivi consommé, les requêtes du site, la mise en page et le guet hors écran. `CYBERPINBALL_MAJ_URL` remplace l'adresse du flux ; `CYBERPINBALL_MAJ_CLE` (fichier PEM) la clé publique, seulement dans un bac à sable (`CYBERPINBALL_HOME`). Dans un bac à sable aussi, `CYBERPINBALL_MAJ_INSTALLEE=1` fait passer sa racine pour une installation : l'écran propose « Mettre à jour maintenant » même lancé depuis les sources (captures de la page du projet).

## Base VPS

L'ajout de tables reconnaît chaque table dans la [base VPS](https://github.com/VirtualPinballSpreadsheet/vps-db) (Virtual Pinball Spreadsheet, fichier `db/vpsdb.json`, environ 2 600 jeux) et s'en sert pour nommer le dossier « Titre (Fabricant Année) » et remplir le `.info` : `Title`, `Manufacturer`, `Year`, `VPSId` (identifiant du jeu, partagé par toutes les versions du dossier), `Authors` (ceux de la version de la table reconnue) et `IPDBId`. Les champs déjà présents dans un `.info` existant ou apporté par l'archive sont conservés.

- **Licence** : le dépôt `vps-db` ne déclare aucune licence (vérifié le 20 octobre 2026 : pas de fichier LICENSE, `license: null` dans l'API GitHub, rien sur le site). Sans licence, la redistribution n'est pas permise : Cyber Pinball ne livre pas la base. Elle est téléchargée au premier ajout de table depuis son adresse officielle (`https://raw.githubusercontent.com/VirtualPinballSpreadsheet/vps-db/main/db/vpsdb.json`) et gardée dans `<racine>\downloads\vpsdb.json`, comme les composants. Les tests utilisent un extrait de quelques jeux recopié à la main.
- **Mise à jour** : au plus toutes les 12 heures, en arrière-plan, quand on ouvre « Ajouter une table » ; `lastUpdated.json` (quelques octets) dit si la base a changé. Sans réseau, le cache sert tel quel ; sans cache ni réseau, les noms sont déduits des fichiers, comme avant. Une réponse invalide ne remplace jamais le cache.
- **Rapprochement** ([packages/core/src/vps.ts](../packages/core/src/vps.ts)) : d'après le nom des `.vpx`, du `.directb2s` du même paquet, de l'archive et des dossiers, et d'après la ROM lue dans le script. Préfixe numérique de VPUniverse ignoré, titre comparé sans casse, accents ni ponctuation, avec ou sans article (« Addams Family » pour « The Addams Family »), titre principal (« Terminator 2 » pour « Terminator 2 - Judgment Day »), « Dr. » pour « Doctor » ; fabricant et année départagent les homonymes ; auteurs (« VPW », « g5k », « Bigus ») et numéro de version désignent la version de la table. Résultat : une liste de jeux avec un score entre 0 et 1.
- **Confiance** : à partir de 0,85 avec 0,08 d'avance sur le suivant, le jeu est retenu sans question. Sinon, l'écran « Quel jeu est-ce ? » propose jusqu'à cinq jeux, plus « Garder » le nom déduit des fichiers (jeu absent de la base) ; jeu absent sans proposition : nom des fichiers, sans question. Depuis le plan, « Choisir le jeu » ou « Changer le jeu » rouvre l'écran pour chaque table. Rien ne bouge avant « Installer ».
- Mesure sur la base entière (nom fabriqué « Nom (Fabricant Année).vpx » pour chacun des 2 366 jeux qui ont une table VPX) : 99,7 % reconnus en premier, aucune certitude erronée ; les autres sont des doublons de la base.

## Trouver une table : catalogue, « Récupérer », liste d'attente

Menu système > **« Trouver une table (catalogue VPS) »** : chaque jeu de la base VPS jouable en VPX (2 370 le 22 octobre 2026, dont 960 sans ROM à trouver), ses versions, et ce qu'il faut pour le jouer sur cette borne. Conception, droits et conditions des sites : `docs/recherche/acquisition.md`.

- **Ce que Cyber Pinball ne fait pas** : télécharger à la place de l'utilisateur. Presque tous les liens de VPS mènent à des fiches de forum (vpuniverse.com, vpforums.org…) qui demandent un compte, dont les conditions interdisent les robots et le ré-hébergement ; aucun fabricant n'autorise la diffusion de ses ROM pour l'émulation. L'avertissement s'affiche au premier usage (accepté une fois, date dans `<données>\acquisition.json`).
- **Catalogue** : douze jeux par page, avec leur vignette VPS, leur sorte, leurs versions et leur ROM ; « Chercher un titre… » (titre, initiales, nom de ROM, comme la recherche des médias) ; filtres « Jeux » (tous, sans ROM à trouver, électroniques, électromécaniques, créations originales) et « Sur la borne » (pas encore installés, installés ou non, déjà installés) ; tri par titre ou nouveautés d'abord.
- **Fiche d'un jeu** : ses versions VPX, la **conseillée** en tête (pas un MOD si l'on peut, VPW de préférence, la plus récemment mise à jour, avec un lien vivant ; ses raisons sont écrites), puis les autres, avec leurs particularités (MOD, VR, nFozzy, Fleep, ce qu'elles fournissent), la date et le site.
- **Ce qu'il faut**, calculé sans rien télécharger, d'après les écrans de la borne et les ROM déjà là : la table ; le fronton (`.directb2s`), sauf s'il est fourni avec la table ou que la borne n'a pas d'écran de fronton, ceux qui vont avec ses écrans d'abord ; la ROM, sauf jeu sans ROM ou ROM fournie (« déjà sur la borne » si la bibliothèque ou une table l'a) ; puis, facultatifs, PuP-Pack, sons remasterisés, couleurs du DMD (s'il y a un afficheur), musique, topper (s'il y a un écran de topper), point de vue. Chaque ligne dit son site et s'il faut un compte.
- **Fenêtre « Récupérer »** (Start sur une ligne) : la fiche du fichier s'ouvre sur l'écran principal, sous un bandeau de Cyber Pinball qui rappelle quoi télécharger (jeu, version, auteurs, ROM), avec « Précédent », « Retour à la fiche », « Ouvrir dans mon navigateur » et « Fermer (Échap) ». On s'y connecte et on télécharge soi-même, au clavier et à la souris ; Cyber Pinball ne clique rien, ne remplit rien et ne voit aucun mot de passe (session à part, `persist:acquisition`, comme un navigateur). Chaque fichier téléchargé est rangé dans `<racine>\downloads\acquisition` et rattaché à ce qu'on attendait par la fiche traversée.
- **Liste d'attente** (menu système, ou depuis le catalogue) : ce qu'on récupère, jeu par jeu, « Attendu » ou « Reçu ». Un fichier téléchargé dans son propre navigateur est retrouvé par « Surveiller Téléchargements : oui » (le dossier Téléchargements de Windows, seulement tant que quelque chose est attendu ; un fichier en cours, `.crdownload` ou `.part`, est ignoré) ou par « Chercher dans Téléchargements » ; il est rapproché par son nom (zip au nom de la ROM, `.directb2s`, nom du jeu) et laissé à sa place.
- **Installation** : « Installer : <jeu> » ouvre le plan d'ajout habituel avec les fichiers reçus, le jeu VPS déjà choisi ; rien ne bouge avant « Installer », puis le médecin vérifie la table. La provenance va dans le `.info` (`CyberPinball.source` : jeu et fichier VPS, version, auteurs, page, date) ; les copies de `downloads\acquisition` sont effacées, les fichiers de Téléchargements restent.
- **Mises à jour des tables** (menu système) : une table dont le fichier VPS a une version plus récente, d'après sa provenance, ou, sans provenance, d'après l'auteur et la version écrits dans la table ; Start ouvre ce qu'il faut pour la nouvelle version.
- **Comptes des sites** (menu système) : vpuniverse.com, vpforums.org, pinballnirvana.com et pinsound-community.org, chacun « Connecté » (avec la date jusqu'à laquelle la connexion est gardée), « connecté pour cette fois seulement » ou « Pas connecté », lu dans les cookies de la session « Récupérer », tous sous-domaines compris. « Se connecter » ouvre la page de connexion du site dans la fenêtre « Récupérer » : on y entre son propre compte et l'on coche « Se souvenir de moi » ; la connexion est alors gardée d'un démarrage à l'autre, comme dans un navigateur (environ 3 mois sur vpuniverse.com, un an sur pinballnirvana.com). « Se déconnecter » efface les cookies de ce site, rien d'autre. Cyber Pinball ne voit ni ne garde aucun mot de passe.
- **Téléchargement direct** (réglage de « Comptes des sites », désactivé par défaut) : quand l'utilisateur est connecté au site, « Récupérer » charge la fiche dans une vue cachée de sa session et suit le lien de téléchargement que le site lui propose (fiche, page de confirmation, au plus quatre pages), sans montrer la page ; le fichier arrive dans la liste d'attente comme d'habitude. Dès que le site demande quelque chose, la page s'ouvre dans la fenêtre « Récupérer », la raison en orange dans le bandeau : pas connecté, vérification Cloudflare ou CAPTCHA, plusieurs fichiers au choix, délai imposé (minuteur des comptes gratuits), conditions à accepter, plafond atteint, proxy refusé, fichier sur un autre site, page non reconnue. Cyber Pinball ne fabrique aucune adresse, n'accepte aucune condition, ne saute aucun délai et ne résout aucune vérification : un téléchargement, une fiche, à la demande de l'utilisateur. Parcours et conditions des sites : `docs/recherche/comptes-sites.md` et `docs/recherche/acquisition.md`, § 14.
- **Code** : `packages/core/src/acquisition.ts` (hôtes, catalogue, conseil, ce qu'il faut, liste d'attente, rattachement, provenance, mises à jour), tests dans `packages/core/src/test/acquisition.test.ts` ; écrans dans `app/src/catalog.ts`, fenêtre dans `app/src/acquire-window.ts` (bandeau `app/renderer/acquire.*`), surveillance dans `app/src/downloads-watch.ts`, comptes et sondes de téléchargement dans `packages/core/src/sitesessions.ts` (tests `sitesessions.test.ts`). Démonstrations hors écran, sur de fausses fiches (aucune page des forums n'est chargée) : `.\docs\demo-catalogue.ps1`, et `.\docs\demo-comptes.ps1` pour les comptes et le téléchargement direct. Tests manuels : [docs/tests-manuels.md](tests-manuels.md), « Trouver une table ».

## Bibliothèque de ROM

Une ROM sert souvent à plusieurs tables (versions, mods d'une même machine). Chaque ROM est stockée **une seule fois**, dans `<racine>\pinmame\roms`, et chaque table qui la joue en a, dans son propre `pinmame\roms` (là où VPX 10.8.1 la cherche d'abord), un **lien physique** : le même fichier sur le disque, sans place en plus. Le dossier n'a pas été inventé : `<racine>\pinmame` est déjà le dossier commun de PinMAME que la synchronisation propose pour `[Plugin.PinMAME] PinMAMEPath` dès qu'il contient `roms` ; une table sans lien y trouve donc encore sa ROM, en secours, **à condition de ne pas avoir de dossier `pinmame\roms`** : dès que ce dossier existe, le plugin PinMAME n'y cherche que là (`PinMAMEPlugin.cpp`, l. 436-477, commit af26b2d93), et le médecin le signale comme bloquant quand la ROM n'y est pas. Code : [packages/core/src/romlibrary.ts](../packages/core/src/romlibrary.ts).

**Alias de ROM par table** ([packages/core/src/romalias.ts](../packages/core/src/romalias.ts)) : le plugin lit aussi `alias.txt` dans le dossier PinMAME de la table (`<table>\pinmame`), une ligne « nom demandé par le script,jeu chargé », avant même la ROM. Le médecin s'en sert de trois façons :

- **Révision voisine** : la ROM demandée manque, mais une autre révision du même jeu (`t2_l6` pour `t2_l8`) est dans la table ou la bibliothèque ; sur demande, il la lie et écrit l'alias. L'avertissement le dit : lampes, bobines ou contacts peuvent différer, les réglages et records (NVRAM) ne sont pas repris, les sons remasterisés et couleurs du DMD rangés sous l'autre nom ne sont plus trouvés. Tant que l'alias sert, un rappel reste dans le diagnostic.
- **Anciens noms de VPinMAME** (« goldfinger » pour « bond », 119 noms tirés de `release/VPMAlias.txt` de PinMAME, dans [packages/core/src/vpmalias.ts](../packages/core/src/vpmalias.ts)) : VPinMAME les traduisait de lui-même, le plugin de VPX 10.8.1 ne les connaît plus ; le médecin écrit la ligne, et dit s'il manque aussi la ROM réelle.
- **Alias devenu inutile** : la ROM demandée est arrivée, mais l'alias passe avant elle ; « Revenir à la ROM demandée » retire la ligne (et le fichier, s'il n'en reste aucune).

- **Même volume obligatoire** : un lien physique ne relie que deux dossiers d'un même disque (NTFS). Une table sur un autre volume que la racine (jonction vers un autre disque, clé en FAT32 ou exFAT) reçoit une **copie**, et le plan le dit.
- **Identité** : deux fichiers de même nom sont la même ROM si leur empreinte SHA-1 est la même. Deux contenus différents sous le même nom : le plus récent (date du fichier) est gardé, ou celui qu'on choisit dans le plan (« Garder plutôt… ») ; l'autre part à la corbeille. Une copie identique remplacée par un lien est supprimée (son contenu reste dans la bibliothèque, octet pour octet : c'est vérifié juste avant) ; tout autre fichier remplacé va à la corbeille.
- **Ajout** : une ROM importée entre dans la bibliothèque, puis est liée dans **toutes les tables installées qui la jouent** : celles dont le script la demande sans en avoir aucune, celles qui en ont déjà une copie, et la table à laquelle l'import la destine. Une nouvelle table dont la ROM est déjà dans la bibliothèque la reçoit sans rien importer de plus. Une ROM qu'aucune table n'attend encore est rangée quand même, pour la table à venir. Les scripts des tables pas encore lus le sont avant le plan (VPX `-ExtractVBS`, environ une seconde chacun, puis gardés en cache).
- **Rangement** (menu système, Exit dans le menu : « Ranger les ROM dans la bibliothèque ») : pour les ROM d'avant la bibliothèque. Le plan montre, ROM par ROM, celle qui entre dans la bibliothèque, les copies remplacées par un lien, les liens ajoutés, les versions écartées et la place libérée ; rien ne bouge avant « Ranger ». Le bilan donne la place des ROM mesurée avant et après.
- **Vue globale** (menu système : « Bibliothèque de ROM »), aux boutons : chaque ROM, les tables qui l'utilisent et sa taille ; les ROM à ranger ; les ROM **inutilisées** (aucune table ne l'a ni ne l'attend), avec la corbeille proposée une par une ou toutes ; les ROM **attendues mais absentes**, avec « Ajouter ». La place sur le disque compte chaque fichier physique une fois et dit ce que les liens économisent. Seules les ROM des dossiers `pinmame\roms` sont concernées : les `.zip` rangés ailleurs (polices FlexDMD, par exemple) ne sont pas des ROM.
- **Médecin** : « ROM pas liée dans la table » (elle est dans la bibliothèque, pas dans `pinmame\roms` : la lier) et « Copie de ROM au lieu d'un lien » (la remplacer par un lien ; pour une autre version, utiliser celle de la bibliothèque, l'autre va à la corbeille). La fiche de la table marque « (bibliothèque) » une ROM liée.

Supprimer une table ne met à la corbeille que son lien : la ROM reste dans la bibliothèque, et la vue globale la propose ensuite comme inutilisée si plus aucune table ne la joue.

## PuP-Packs

Cyber Pinball vise le **mode plugins de VPX 10.8.1** : le plugin PUP livré avec VPX remplace PinUP Player, qui n'a rien à installer ni à enregistrer (décision du 20 octobre 2026 ; le mode classique et DOF viendront plus tard). Le plugin cherche le pack dans `<dossier de la table>\pupvideos\<nom>`, sans tenir compte de la casse, où `<nom>` est la valeur passée par le script à `PuPlayer.B2SInit` ou `Init`, ou à défaut la ROM jouée. La recherche complète, avec les références au code de VPX, est dans `docs/recherche/pup-packs.md`.

**À l'ajout** ([packages/core/src/puppack.ts](../packages/core/src/puppack.ts), [tableimport.ts](../packages/core/src/tableimport.ts)), un pack (dossier qui contient `screens.pup`, `playlists.pup`, `triggers.pup`, ou des options qui en contiennent) est :

- **nommé** comme le script le charge : nom passé à `B2SInit` (littéral, ou variable comme `pGameName`, `cPuPPack`), puis la ROM, puis le nom passé à `Init`. Un pack déjà bien nommé garde son nom ; un pack nommé autrement (« Monster Bash PuP-Pack v2 ») prend le nom attendu. Sans script lisible (VPX absent), il garde le nom de son dossier et le plan le signale ;
- **aplati** : `rom\rom\…`, ou un dossier d'archive qui ne contient que le pack (un lisez-moi à côté ne gêne pas) ;
- **nettoyé** : `._*`, `.DS_Store`, `__MACOSX` et MP4 de 0 octet ne sont pas installés ;
- **remplacé en entier** s'il existe déjà : l'ancien dossier part à la corbeille, jamais de mélange ;
- **configuré** : l'option de disposition des écrans est appliquée en recopiant ses fichiers, **sans jamais exécuter de `.bat`**.

**Les options.** Les packs publiés rangent leurs variantes dans `PuP-Pack_Options\<option>\` et livrent un `.bat` par option à la racine, par exemple `Option 2 - FullDMD on Backglass.bat` :

```bat
rem echo off
xcopy /y "PuP-Pack_Options\Option 2 - FullDMD on Backglass\*"
del /Q PuPDesktopPunch.exe
del /Q PuPInit.bat
```

Chaque `.bat` dont le nom parle d'option (ou qui copie des fichiers) est **lu, pas exécuté**. Sont reconnus : `copy` et `xcopy` d'un dossier, d'un motif (`*`, `*.pup`) ou d'un fichier du pack vers sa racine ou un de ses dossiers (`/s`, `/e` pour descendre), `del`/`erase` de fichiers de la racine (ils partent à la corbeille), et ce qui n'a pas d'effet : `rem`, `::`, `echo`, `@echo off`, `pause`, `cls`, `exit`, `title`, `cd`/`pushd` vers le dossier du `.bat` (`%~dp0`, `.`), `>nul`. Tout le reste fait échouer l'analyse : chemin absolu, `..`, variable (`%PUPDIR%`), `start`, `if`, `for`, `call`, `set`, `move`, `ren`, `rd`, enchaînements (`&`, `|`), redirection vers un fichier, copie sans fichier correspondant. Les dossiers d'options sans `.bat` lisible (packs livrés avec seulement `PuP-Pack_Options`, comme ceux qu'on applique à la main sous Linux) deviennent aussi des options. Les `.bat` d'outils du mode classique (`PuPInit.bat`, `configdisplays.bat`) sont ignorés.

**Choix de l'option**, d'office, d'après le modèle de borne : le nom de l'option (« Topper », « FullDMD on Backglass », « 2 Screen », « Desktop », « 16x9 », « 4x3 », « AIO », « Stream »…) puis son `screens.pup` (écran 0 allumé : topper ; écran 5 ou 1 dans le backglass par CustomPos : DMD dans le backglass) sont comparés aux rôles affectés (backglass, DMD, topper) et aux proportions du DMD (4:1 réel ou FullDMD 16:9) et du backglass. Une option de bureau ou pour borne tout-en-un n'est jamais retenue sur une borne. Si le choix n'est pas net, si la borne n'est pas configurée, ou si un `.bat` n'a pas pu être lu, l'écran « Quelle option du PuP-Pack ? » s'ouvre avant le plan, avec le `.bat` refusé et sa raison ; depuis le plan, « Changer l'option du PuP-Pack » le rouvre. L'option retenue et le nom d'origine du pack sont gardés dans le `.info` de la table (`CyberPinball.pup.<nom>`, les autres champs sont conservés) : à la mise à jour du pack, la même option est reprise sans question.

**Encart DMD sur le backglass.** Beaucoup de packs n'ont ni écran DMD (1) ni FullDMD (5), mais un écran posé sur le backglass dont le nom ou la playlist parle de DMD (*Star Trek LE* : écran 13 « BGdmdText », à 26 %, 79 %, sur 48 % × 21 % du backglass). Allumé, le pack y passe ses propres animations : le vrai DMD reste sur son écran (option pour borne à DMD). Éteint, l'encart reste vide pour qu'on y pose le DMD (option pour borne à deux écrans). Sans écran 1 ni 5 ni encart, rien n'est déduit du `screens.pup` sur le DMD : l'absence d'écran DMD du pack ne veut pas dire « borne sans DMD » (règle corrigée le 24 octobre 2026 : l'option faite pour une borne à quatre écrans passait derrière celle à l'encart vide). Le DMD de la ROM ne peut pas s'afficher dans un encart du pack : le plugin PUP, qui dessine alors la fenêtre du backglass, ne dessine jamais le DMD (`docs/recherche/pup-packs.md`).

**Changer d'option après l'installation** : fiche de la table > « PuP-Pack », proposé dès qu'un pack de la table a des options (`tablePupPacks`, `packages/core/src/doctor.ts`). L'écran montre l'option appliquée, celle qui convient à la borne, et chaque option avec ce qu'elle vise (topper, DMD sur son écran ou dans le backglass, FullDMD, proportions). Start applique l'option choisie : ses fichiers sont recopiés, les anciens `.pup` partent à la corbeille, aucun `.bat` n'est exécuté (`pupOptionOps`). Le choix est retenu dans le `.info` (`option`, et `chosen: "user"` : le médecin ne le remet plus en cause) et sert dès la partie suivante ; « Jouer » est proposé sur le même écran pour le voir. Sur la fiche, la ligne « PuP-Pack » passe en orange quand une autre option convient mieux à la borne.

**Le médecin** ([doctor.ts](../packages/core/src/doctor.ts)) vérifie, sans lancer VPX :

| Constat | Quand | Correction |
| --- | --- | --- |
| PuP-Pack introuvable | le script charge un pack (ou un dossier `pupvideos` existe) et aucun `pupvideos\<nom attendu>` | renommer le seul dossier présent ; sinon, ajouter le pack |
| PuP-Pack rangé un dossier trop bas | `pupvideos\X\X\screens.pup` | remonter le pack |
| PuP-Pack inutilisé | un autre dossier de `pupvideos` qu'aucune version du dossier ne charge | corbeille |
| Option non appliquée, ou modifiée | des options, et une racine sans `.pup` (ou dont les `.pup` ne sont ceux d'aucune option) | recopier l'option retenue (mémorisée, sinon d'après la borne) et la mémoriser |
| Option inadaptée à la borne | une option appliquée, une autre nettement mieux notée pour la borne actuelle (borne changée depuis l'installation, ancien choix d'office), sauf si l'option a été choisie dans la fiche | appliquer la meilleure et la mémoriser |
| Écrans du pack absents de la borne | un écran visible vise le topper, le DMD ou le backglass alors que le rôle n'est pas affecté | — (information) |
| Vidéos sur le plateau non affichées | l'écran 3 (Playfield) est visible : le plugin ne le rend pas | — |
| PuP-Pack piloté par le script | `playlistadd` dans le script et aucun `.pup` | — |
| Pack prévu pour une autre ROM | dossier `PupCapture` et ROM différente du nom d'origine du pack, ou ROM d'une autre langue (suffixe `f`, `g`, `i`, `s` après la version, supposé) | — |
| Journal de VPX | dernière partie de la table dans `vpinball.log` : pack chargé sans `screens.pup`, aucun pack chargé, fonctions `Not implemented` | — |

**Cas non reconnus** (le plan propose alors les options aux boutons, ou le médecin le signale) : `.bat` qui demandent un choix (`choice`, `set /p`) ou testent des fichiers (`if exist`), `.bat` qui lancent un exécutable (`PuPDesktopPunch.exe`, installeurs), options rangées hors d'un dossier dont le nom contient « option » et sans `.bat` lisible, packs sans aucun `.pup` hors d'un dossier `pupvideos` (packs anciens pilotés par le script : reconnus seulement s'ils arrivent déjà dans `pupvideos\`), `PinUpPlayer.ini` propre au pack (ignoré par le plugin), modifications faites dans le PuP-Pack Editor (activer les vidéos du topper, par exemple) qui ne correspondent plus à aucune option : signalées en information, jamais écrasées sans le bouton. Les DLL FFmpeg de VPX et les clés `Priority.PUP` de `VPinballX.ini` (qui font passer le pack devant le directb2s) relèvent de la synchronisation de VPX, pas de ce module.

Sources de la règle des options : l'exemple de `.bat` du [wiki vpinball de dekay](https://github-wiki-see.page/m/dekay/vpinball-wiki/wiki/PUP-Packs), [pup-research](https://github.com/francisdb/pup-research) (« copier les .pup de `PuP-Pack_Options/<option>` à la racine »), le [wiki Batocera](https://wiki.batocera.org/systems:vpinball) (Batman 66 : `Option 3 - Desktop`), les noms d'options des packs VPUniverse et vpinball.com, d'après les résumés des moteurs de recherche (Tron Legacy, Transformers, Aliens, Pirates of the Caribbean, packs PinEvent : « Option 1 - Backglass and Topper », « 2 Screen - 4x3 or 5x4 », « Full DMD on Backglass », « Backbox AIO », « PUP Stream »). Les pages de VPUniverse refusent la lecture automatique (403) : la règle reste à confirmer sur des packs réels (tests manuels 44 à 51).

## Structure

| Dossier | Rôle |
| --- | --- |
| `packages/core` | Modèle de borne, EDID, empreintes, correspondance des écrans, INI, générateur VPX, boutons et touches (`buttons.ts`). Sans Electron ni Windows. |
| `packages/win-displays` | Fonctions Windows via FFI (koffi) : détection des écrans (DisplayConfig, EDID, échelle, ContainerId), sorties audio (`audio.ts`, registre MMDevices lu par `registry.ts`), périphériques USB présents (`usb.ts`, pour les DMD réels), fenêtres et premier plan (`windows.ts`), orientation d'un écran (`orientation.ts`). |
| `packages/installer` | Manifeste des composants tiers, choix de la racine, téléchargement vérifié, extraction, jonction vers la version active. |
| `app` | Application Electron : point d'entrée (`main.ts`), assistant des boutons, des écrans et du son (`wizard.ts`, sons de test dans `renderer/sound.js`), menu des tables (`frontend.ts`), réglages de VPX (`settings.ts`), gestion des tables (`library.ts`), lancement et surveillance de VPX (`launcher.ts`), commande `sync`. |
| `docs/design-system` | Langage visuel de la refonte (tokens, composants `.cp-*`, icônes, maquettes d'écrans) et sa page `index.html` ; régénéré par `node docs/design-system/src/construire.mjs`. Appliqué à l'interface (`app/renderer/theme.css`), aux replis intégrés (`fallback.css`) et à l'icône (`app/renderer/icone.svg`). |

## Réglages de VPX

Menu des tables, touche R (ou Exit puis « Réglages de VPX ») ; seul : `npx electron app --reglages [--table=<morceau du nom>]`, action « reglages » du lanceur.

- La liste des réglages n'est pas codée à la main : `npm run vpx-schema` lit `src/core/Settings_properties.inl` du code source de VPX au commit de la version installée (`sourceCommit` du manifeste) et écrit `packages/installer/vpx-settings/<version>.json`. Il y ajoute les réglages que les plugins déclarent à leur chargement, lus dans le dossier `plugins/` du même commit (`packages/core/src/vpx-plugin-settings.ts`) : `[Plugin.<id>] Enable` de chaque plugin (`plugin.cfg`), les macros `MSGPI_*_SETTING` réellement enregistrées (`RegisterSetting`), et `[Backglass|ScoreView|Topper] Priority.<moteur>` pour chaque moteur de rendu des fenêtres annexes. Pour 10.8.1-5436 : 1240 réglages, dont 101 de plugins. Chaque réglage de plugin porte le plugin qui le déclare : sans effet quand ce plugin est éteint. Avec `-- --ini <VPinballX.ini>`, il vérifie que chaque réglage du schéma figure dans un fichier écrit par cette version (sauf ceux des plugins que VPX n'a pas chargés) ; avec `-- --check`, il échoue si le fichier committé diffère du code source.
- Onglet « Essentiels » : une sélection traduite (`packages/core/src/vpx-essentials.ts`), dont les groupes « Backglass, PuP et DMD réel » et « Dossiers communs à toutes les tables ». Onglet « Avancé » : tout le schéma par section, avec les libellés et descriptions d'origine, plus les clés hors schéma (touches, options déclarées par les tables) en lecture seule ; une touche `[Input] Mapping.*` s'affiche avec le nom de l'action et de la touche.
- Flippers : se déplacer et choisir une valeur ; Start : modifier, valider ; Exit : annuler, revenir ; Suppr : valeur par défaut ; souris et molette.
- Les clés écrites par Cyber Pinball (fenêtres, plugins activés ou éteints, priorités des plugins sur les fenêtres affectées, `SecurityLevel` et `AskToTurnOn` qui évitent les questions de VPX en partie (voir [Lancement d'une partie](#lancement-dune-partie)), DMD réel détecté, touches des boutons une fois l'étape « Boutons » faite, et sorties audio une fois l'étape « Son » faite) sont affichées sans pouvoir être modifiées, avec l'origine de leur valeur et la façon de la changer.
- Écriture : seule la ligne du réglage change (`IniDocument`), avec sauvegarde horodatée (`writeWithBackup`). « Valeur par défaut » laisse la clé vide, la convention de VPX.
- Par table (`openSettings({ scope: 'table', table })`) : le fichier `<table>.ini` à côté du .vpx, trouvé comme VPX le fait (nom de la table, sinon nom du dossier). Seules les valeurs différentes du réglage général y sont gardées, comme VPX ; un fichier vide est supprimé. En bac à sable (`CYBERPINBALL_HOME`), il est écrit dans `<bac à sable>\sandbox\tables\` et jamais à côté du vrai .vpx.

## Assistant et menu de configuration

L'assistant (`app/src/wizard.ts`, écrans `app/renderer/screen.*`) enchaîne au premier démarrage, ou par « Assistant complet » : **boutons** (relevé de chaque bouton), **écrans et rôles** (playfield, backglass, DMD, topper), **orientation et taille du playfield** (bord des flippers, retournement de l'écran dans Windows si VPX en a besoin, diagonale), **disposition des écrans** (zones), **son** (sorties audio, test des haut-parleurs), puis le récapitulatif et l'écriture de `cabinet.json` et de `VPinballX.ini`. La liste des étapes, ce que chacune décide et ses clés sont dans [packages/core/src/wizardsteps.ts](../packages/core/src/wizardsteps.ts) (`WIZARD_PHASES`, `WIZARD_STEPS`), testés dans [wizardsteps.test.ts](../packages/core/src/test/wizardsteps.test.ts).

**Menu système (Exit, Tab ou ⚙) > « Configuration de la borne »** regroupe tout ce qui règle la borne. Chaque étape s'y refait seule et revient au menu des tables, enregistrée ou non :

| Entrée | Option | Ce qui est refait | Clés de `VPinballX.ini` écrites |
| --- | --- | --- | --- |
| Boutons de la borne | `--boutons` | relevé des boutons et essai | `[Input]` |
| Écrans et rôles | `--ecrans` | l'écran de chaque rôle ; bord des flippers et diagonale seulement si le playfield change d'écran | fenêtres de VPX et cadrage |
| Orientation et taille du playfield | `--playfield` | bord des flippers, retournement de l'écran, diagonale | fenêtres de VPX et cadrage |
| Disposition des écrans | `--disposition` | zone de chaque rôle sur son écran | fenêtres de VPX et cadrage |
| Son de la borne | `--son` | sorties du fronton et du plateau, test des haut-parleurs | `SoundDevice`, `SoundDeviceBG`, `Sound3D` |
| Assistant complet | | toutes les étapes à la suite | toutes les clés gérées |
| Touches par défaut des encodeurs | | remise immédiate, sans assistant | `[Input]` |
| Configurations de la borne | | choix, renommage, corbeille, nouvelle configuration | |

Une étape seule part du modèle enregistré (rôles, écrans, bord des flippers), ne change que ses champs de `cabinet.json` (`stepCabinet`) et n'écrit que ses clés de `VPinballX.ini` (option `only` de la synchronisation), même changées à la main ; les autres restent telles quelles jusqu'à la synchronisation suivante du menu. Le récapitulatif ne montre que ces clés ; Exit y recommence l'étape, Retour arrière revient à la dernière question. Fenêtres et cadrage : `[Player] Playfield*`, `[Backglass]`, `[ScoreView]`, `[Topper]`, `BGSet`, `ScreenWidth`, `ScreenHeight`, `CabinetAutofitMode`.

**Quitter sans enregistrer, à toute étape** (éditeur de disposition, compte à rebours du retournement et récapitulatif compris) : la question « Quitter sans enregistrer ? » s'ouvre par

- le bouton **« Quitter sans enregistrer »**, toujours affiché en haut à droite de chaque écran (cliquable aussi dans l'éditeur de disposition) ;
- **Ctrl+Q** d'un clavier ; Ctrl+Q de nouveau répond oui ;
- **Échap ou Exit maintenu 2 s** (le bouton affiche « Maintenu : quitter sans enregistrer ? dans 1 s ») ;
- **pendant le relevé des boutons, n'importe quelle touche maintenue 3 s**, qui n'est pas relevée. À ce moment, on ne sait pas encore quelle touche est Exit : c'est le seul geste qui marche avec n'importe quel encodeur. Pour qu'il ne gêne pas le relevé, un bouton est relevé **au relâchement** : un appui sur un bouton de borne dure bien moins d'une seconde, la différence ne se voit pas, et une touche tenue n'est jamais relevée (rien à défaire). Hors du relevé, seuls Échap et Exit maintenus ouvrent la question : les flippers maintenus gardent leur effet (accélérer un réglage de l'éditeur) ;
- **Exit (ou Retour arrière) à la première question** d'une étape, quand il n'y a rien avant : le playfield de l'assistant complet, le bord des flippers de l'orientation seule, la première sortie du son seul, l'éditeur de la disposition seule.

La question dit ce qui serait perdu (« Boutons : Flipper gauche sur A », « DMD : … », « Flippers à gauche de l'image », « Son… », « Écran du playfield : remis dans son orientation d'origine », ou « Rien n'a été changé ») et où l'on va. **Start (ou Entrée) : oui** · **Exit, Échap ou Retour arrière : non** · le même geste encore (une touche maintenue de nouveau) : oui · sans réponse en 20 s, l'assistant reprend. Pendant le relevé, le Start et l'Exit déjà relevés répondent aussi. Oui : rien n'est écrit, ni `cabinet.json` ni `VPinballX.ini` ; une orientation d'écran non confirmée est remise ; retour au menu des tables, ou, au premier démarrage sans modèle (le menu ne peut pas s'ouvrir), fermeture de Cyber Pinball annoncée à l'écran (« l'assistant reprendra au prochain démarrage »). Un test fixe l'invariant : la question passe avant toute étape dans `handleKey`, la souris avant toute autre action, chaque état envoyé aux écrans porte le bouton, et rien n'est écrit hors des deux fonctions d'enregistrement.

**« Placer librement… »** : à l'étape des écrans, après les écrans entiers et les emplacements tout faits (bas du backglass en 4:1 ou 16:9, incrustation dans le playfield), le backglass, le DMD et le topper proposent « Placer librement… ». Start ouvre l'éditeur de disposition sur ce rôle, posé sur son écran enregistré (sinon un écran libre, sinon celui du backglass), le curseur sur la ligne « Zone » ; « Revenir à l'assistant » garde la place choisie et passe au rôle suivant, Exit revient à la question telle qu'elle était.

## Langue de l'interface

Tout ce qu'affiche Cyber Pinball existe en français et en anglais : menu des tables et fiches, menu système, assistant, réglages de VPX, fenêtre « Récupérer », messages et constats du cœur (médecin, synchronisation, import, mise à jour). Les dates et les nombres suivent la langue (`fr-FR` ou `en-GB`). Les journaux de la console, les rapports des essais et les fichiers écrits pour d'autres outils restent en français.

- **Par défaut** : la langue de Windows si c'est le français, l'anglais sinon (`app.getPreferredSystemLanguages()`).
- **Menu système > « Langue / Language »** : l'entrée est nommée dans les deux langues, pour qu'on la retrouve quelle que soit la langue affichée, et chaque langue se présente dans la sienne (« Français », « English »). Le choix, aux boutons comme le reste, est gardé dans `<données>\language.json` (`{ "language": "en" }`) ; le menu se relance aussitôt par le gardien des écrans (`relaunchCovered`), comme pour un changement de configuration, et rouvre ses fenêtres dans la nouvelle langue.
- **`CYBERPINBALL_LANGUE=fr|en`** impose la langue (essais, captures) ; un choix fait dans le menu la remplace aussi pour la relance.

**Méthode** (`packages/core/src/i18n.ts`) : chaque texte affiché passe par `t('texte français', { paramètre })`, sa forme française servant de clé ; le catalogue anglais, rangé par partie de l'interface dans `packages/core/src/i18n/en/*.ts`, en donne la traduction. Paramètres entre accolades (`t('{role} : aucun écran', { role })`), pluriels par `tn(n, '{n} table', '{n} tables')` (0 et 1 au singulier en français, 1 seul en anglais), listes par `formatList` (« a, b et c » / « a, b and c »), dates et nombres par `formatDate`, `formatDateTime`, `formatNumber`. La langue est fixée une fois par processus, au démarrage (`app/src/language.ts`, importé par `main.ts` avant les modules qui affichent quelque chose) : aucun texte ne se traduit au chargement d'un module, et les tables de libellés du cœur (`ROLES`, `BUTTONS`, `WIZARD_STEPS`…) sont des accesseurs (`get label()`). Les fenêtres reçoivent la langue et le catalogue par leur préchargement (`cyberI18n`) ; `app/renderer/i18n.js`, chargé avant les autres scripts de chaque page, leur donne les mêmes `t`, `tn` et `uiLocale()`, et traduit les textes fixes des pages, marqués `data-i18n` (avec une clé de contexte, `data-i18n="…"`, quand un même texte français a deux sens).

**Invariant** (`packages/core/src/test/i18n.test.ts`, lancé par `npm test`) : le relevé des sources de l'interface (`i18n-scan.ts` : `app/src`, `app/renderer`, `packages/core/src`, `packages/installer/src`, `packages/win-displays/src`) retrouve chaque clé passée à `t()`, `tn()` et `data-i18n`, et échoue sur une clé sans traduction, une clé qui n'est pas un littéral (gabarit `${…}`, variable), des `{paramètres}` différents entre la clé et sa traduction, une même clé traduite de deux façons, une traduction restée en français, une clé que plus rien n'utilise, et un texte qui a l'air français hors de `t()` (accents, mots courants ; hors commentaires et journaux de console). Un texte qui ne se traduit pas (nom de fichier, motif de recherche, nom propre) porte `// i18n-ignore` en fin de ligne. Le test vérifie aussi qu'aucun texte n'est traduit au chargement des modules du cœur. À la main, sur quelques fichiers :

```bash
npx tsc -b packages/core && node packages/core/dist/test/i18n-scan.js app/src/wizard.ts app/renderer/screen.js
```

En partie, un texte demandé sans traduction s'affiche en français et la console le signale une fois (« Traduction manquante : … »).

## Boutons de la borne

Première étape de l'assistant, puisque tout le reste se pilote aux boutons : l'écran demande « Appuyez sur le bouton » flipper gauche, flipper droit, Start, Exit, crédit, lanceur, puis les boutons facultatifs (MagnaSave gauche et droit, Extra Ball, Tilt, tremblements à gauche, à droite et vers l'avant, volume − et +), qu'Exit passe. La même question s'affiche sur tous les écrans (droite pour le joueur sur l'ancien playfield), au-dessus de la liste de tous les boutons : ceux déjà relevés avec leur touche, celui en cours, ceux à venir, pour choisir à l'avance quel bouton de la borne tiendra quel rôle. Une touche déjà relevée pour un autre bouton est refusée, comme la touche Windows et les touches que VPX ne sait pas lire ; un bouton compte quand on le relâche, une seule fois, et une touche maintenue 3 s ouvre « Quitter sans enregistrer ? » au lieu d'être relevée.

Ce relevé bouton par bouton est celui d'une borne neuve (pas encore de touches enregistrées) ; chaque bouton à venir y montre en retrait la touche en vigueur, celle des encodeurs. Sur une borne déjà configurée, et toujours pour l'étape seule, l'étape s'ouvre directement sur le récapitulatif : chaque bouton avec sa touche actuelle, sans rien à refaire. Un bouton se change seul : clic sur sa ligne, ou flippers jusqu'à sa ligne (après les actions) puis Start ; on appuie sur le nouveau bouton et l'on revient au récapitulatif, les autres touches gardées (Retour arrière annule). « Tout relever » repart du relevé complet.

Une erreur se corrige sans les boutons de la borne, puisqu'ils sont justement en train d'être relevés : clic sur une ligne de la liste (ce bouton est redemandé, puis l'étape reprend au premier bouton sans réponse), Retour arrière ou « ◀ Précédent » (le bouton d'avant ; Retour arrière ne peut donc pas être relevé comme bouton), « Touches par défaut » et « Tout relever », toujours affichés et cliquables (le pointeur apparaît quand on bouge la souris).

Le récapitulatif est aussi un essai : les flippers choisissent l'action (Valider, Précédent, Touches par défaut, Tout relever) ou un bouton à refaire, Start lance ce choix. Un flipper, Start ou Exit dont la touche vient d'être relevée (différente de celle en vigueur) doit avoir été pressé au moins une fois avant que Valider soit accepté (coche dans la liste, « Essai des touches relevées : Flipper gauche ✓ · … ») : un relevé faux ne peut donc pas être enregistré sans que le joueur s'en aperçoive. Les touches gardées et les touches par défaut des encodeurs, connues, n'ont pas à être essayées : « Touches par défaut » puis « Enregistrer » enregistre aussitôt. Les flèches et Entrée d'un clavier choisissent et lancent aussi, sans compter comme essai. Valider passe aux écrans (ou enregistre, étape seule). Dans l'assistant complet, si personne n'appuie sur rien pendant 20 secondes, les touches actuelles sont gardées (celles des encodeurs sur une borne neuve) : une borne sans opérateur, ou dont l'encodeur est en mode manette, passe ainsi aux écrans comme avant.

Seule : menu système (Exit) > « Configuration de la borne » > « Boutons de la borne », `npm run assistant -- --boutons`, action `boutons` du lanceur, ou l'action « Affecter les boutons de la borne » d'une touche dans les réglages de VPX. Le reste du modèle est gardé ; seules les clés `[Input]` sont reprises en main.

**Accès à la configuration sans les boutons** : un relevé faux (par exemple Exit sur un bouton qu'on ne retrouve plus) ne doit jamais fermer l'accès aux réglages. Depuis le menu des tables et ses messages, une roue dentée discrète en haut à droite (⚙, cliquable par-dessus tout, plus visible quand on bouge la souris) et la touche Tab d'un clavier ouvrent « Menu et configuration » : ajouter une table, réglages de VPX, configuration de la borne (boutons, écrans, playfield, disposition, son, assistant complet, touches par défaut des encodeurs, configurations), bibliothèque de ROM, quitter. Dans ces menus, Tab et Maj+Tab déplacent le curseur quels que soient les boutons relevés, et chaque ligne se clique. Tab et Retour arrière sont réservés : l'étape « Boutons » les refuse, et un relevé qui en contiendrait est traité comme incohérent (touches par défaut).

**Touches par défaut des encodeurs** (Maj gauche / droite, 1, Échap, 5, Entrée…), le recours quand un relevé enregistré ne pilote plus la borne : menu système > « Configuration de la borne » > « Touches par défaut des encodeurs » (à la souris : clic sur « Exit : menu » au pied du menu, puis sur les lignes), « Remettre les touches par défaut des encodeurs » dans le détail d'une touche des réglages de VPX (Avancé > Input), et sans aucun bouton l'action `boutons-defaut` du lanceur (`node app/dist/sync-cli.js --boutons-par-defaut`). `cabinet.json` reprend les touches par défaut, et `[Input]` est réécrit : les actions de VPX qui avaient perdu leur touche la retrouvent (`withDefaultButtons`, `app/src/buttons-reset.ts`).

**Relevé incohérent** (bouton obligatoire sans touche, même touche pour deux boutons, touche refusée, par exemple après une modification de `cabinet.json` à la main) : `buttonProblems` le détecte, toute l'interface revient aux touches par défaut (`buttonKeys`), la synchronisation n'écrit plus `[Input]` et le signale, et le menu propose au démarrage de refaire l'étape « Boutons ».

Les touches sont rangées dans `cabinet.json` (`buttons`, codes `KeyboardEvent.code` : `ShiftLeft`, `Digit1`…) et toute l'interface les lit : assistant, menu, fiche et gestion des tables (`navigationKeys`, `packages/core/src/buttons.ts`), réglages de VPX, aide-mémoire de la partie (`gameKeys`). Un modèle sans `buttons` garde les touches par défaut et ne touche pas à `[Input]`.

**Ce que VPX attend** (relevé dans `src/input/InputManager.cpp` et `InputAction.cpp` au commit `af26b2d93` de 10.8.1-5436) : VPX n'enregistre plus de codes DirectInput (`LFlipKey`, `JoyLFlipKey`… n'existent plus). Chaque action a sa clé `[Input] Mapping.<action>`, une liste d'alternatives séparées par ` | `, chacune une combinaison séparée par ` & ` ; une touche du clavier s'écrit `Key;<scancode SDL>` (usage HID : A = 4, 1 = 30, Entrée = 40, Shift gauche = 225), un bouton de manette `SDLJoy_<GUID SDL>_<n>;<bouton>`. Une valeur vide vaut la touche par défaut de VPX. Cyber Pinball traduit `KeyboardEvent.code` en scancode SDL (`SDL_SCANCODES`) et écrit :

| Bouton | Clés `[Input]` (défaut de VPX) |
| --- | --- |
| Flipper gauche / droit | `Mapping.LeftFlipper`, `LeftStagedFlipper`, `UILeft` (`Key;225`) / `RightFlipper`, `RightStagedFlipper`, `UIRight` (`Key;229`) |
| Start, Exit | `Mapping.Start` (`Key;30`), `Mapping.ExitGame` (`Key;41`) |
| Crédit, lanceur | `Mapping.Credit1` (`Key;34`), `Mapping.LaunchBall` (`Key;40`) |
| MagnaSave gauche / droit | `Mapping.LeftMagna`, `UIUp` (`Key;224`) / `RightMagna`, `UIDown` (`Key;228`) |
| Extra Ball, Tilt | `Mapping.ExtraBall` (`Key;5`), `Mapping.Tilt` (`Key;23`) |
| Tremblements | `Mapping.LeftNudge` (`Key;29`), `RightNudge` (`Key;56`), `CenterNudge` (`Key;44`) |
| Volume − / + | `Mapping.VolumeDown` (`Key;45`), `Mapping.VolumeUp` (`Key;46`) |

- Un bouton facultatif passé garde la touche par défaut de VPX.
- Seules les touches seules du clavier sont remplacées : un bouton de manette ou une combinaison ajoutés dans le menu de VPX (F12, « Input Settings ») restent à côté.
- Une autre action de VPX dont la touche par défaut est celle d'un bouton la perd (`Key;0`, aucune touche : une valeur vide la lui rendrait) : sinon, un bouton Extra Ball sur D ouvrirait aussi le débogueur. Les doublons voulus par VPX restent (Volume − et Service 7 partagent `-`). L'action retrouve sa touche quand le conflit disparaît. Le récapitulatif et les constats de la synchronisation les nomment.
- Ces clés sont gérées comme les autres : une touche changée à la main dans VPX est signalée au démarrage, gardée ou remise au choix (`[Input] Mapping.LeftFlipper = Key;4 au lieu de Key;225`). Les réglages de VPX les montrent dans l'onglet Avancé, section Input, avec le nom de l'action et de la touche.
- Les scripts des tables ne voient pas la différence : `LeftFlipperKey`, `StartGameKey`… valent l'identifiant de l'action, pas la touche (`ScriptGlobalTable.cpp`). VPX envoie en plus au script le code DirectInput de chaque touche pressée, qu'une vieille table peut tester directement.

**Manettes et encodeurs en mode joystick** : non traités. VPX désigne une manette par son GUID SDL (bus, fabricant, produit, version et somme de contrôle du nom) suivi de son rang, et numérote boutons (0…), chapeaux (0x100…) et axes (0x200…) à sa façon ; Chromium ne donne ni la version du périphérique ni la même numérotation : l'assistant ne peut pas écrire ces clés sans matériel pour les vérifier. L'interface de Cyber Pinball ne lit d'ailleurs que le clavier. Avec un encodeur en mode joystick : le passer en mode clavier (la plupart le permettent), ou laisser VPX proposer sa disposition par défaut (il le fait au premier branchement d'une manette, d'un Pinscape ou d'un Arcade2TV) puis l'affiner dans F12 > « Input Settings ». Ces affectations sont gardées par Cyber Pinball.

## Configurations de la borne

Une même installation peut servir sur plusieurs postes : trois écrans en plus du principal sur l'un, deux sur l'autre, une borne. `data\cabinet.json` contient toutes les **configurations** ; chacune est un modèle de borne complet (écrans par empreinte EDID, rôles, zones, bord des flippers, diagonale, son, boutons, clés laissées à l'utilisateur) avec son **propre `VPinballX.ini`** et sa propre mémoire des clés écrites. Les tables, les ROM, les médias, les réglages propres à chaque table et les statistiques restent communs. Code : [packages/core/src/configurations.ts](../packages/core/src/configurations.ts) (calcul), [packages/core/src/store.ts](../packages/core/src/store.ts) (fichiers), [app/src/configurations-menu.ts](../app/src/configurations-menu.ts) (écrans), tests dans [configurations.test.ts](../packages/core/src/test/configurations.test.ts).

- **Migration** : un `cabinet.json` d'avant les configurations devient, à sa première lecture, la configuration « Borne », reprise telle quelle, qui garde `config\VPinballX.ini` et sa mémoire ; l'ancien fichier est gardé dans `data\cabinet-v1.json`. Rien à faire.
- **Reconnaissance** (démarrage, avant chaque partie, `sync`) : chaque configuration reçoit un score d'après les écrans branchés (`scoreConfiguration`) : 100 par écran retrouvé par son numéro de série, 60 par modèle et port (empreinte faible), 30 par modèle et taille seulement (câble changé de port), −50 par écran introuvable, −10 par écran branché en plus. Elle est candidate avec au moins un écran retrouvé, au plus un introuvable (un écran éteint) et pas plus d'écrans en trop que d'écrans retrouvés. La seule candidate complète est choisie d'office ; sinon un choix déjà fait pour ces mêmes écrans ; sinon la meilleure candidate si elle est seule à son score. Une configuration retrouvée en partie reste choisie avec un avertissement, et la synchronisation avertit pour le rôle de l'écran éteint (et bloque si c'est le playfield), comme avant. Chaque choix est expliqué : « « Second poste » reconnue : 3 écrans sur 3 retrouvés (2 par numéro de série, 1 par modèle et port) — score 260, devant « Borne » (score -110) ».
- **Ambiguïté ou aucune correspondance** : rien n'est écrit. Le menu s'ouvre sur l'écran principal avec « Quelle configuration est branchée ? » : les configurations connues, de la plus proche à la plus lointaine avec leur score, « Nouvelle configuration » (assistant complet) et « Plus tard » (le menu reste utilisable ; une partie redemande la configuration). Le choix est retenu pour ces écrans (10 jeux d'écrans mémorisés) et le menu redémarre sur les bons écrans. En ligne de commande : code de sortie 3, et `npm run sync -- --configuration "Nom"` fait le même choix.
- **Changement de configuration** : constat de la synchronisation (« Configuration changée : « Borne » à la place de « Second poste »… ») et bandeau de 12 s en haut du menu, sans bouton à presser.
- **Menu système > « Configuration de la borne » > « Configurations de la borne »** (son détail nomme la configuration active, et dit si elle est forcée) : la liste avec le score de chacune pour les écrans branchés ; pour chacune, « Utiliser avec ces écrans », « Toujours utiliser celle-ci » (forcée : la reconnaissance est suspendue jusqu'à « Reconnaissance automatique »), « Renommer » (clavier à l'écran, ou un vrai clavier), « Supprimer » (corbeille des configurations, restaurable avec son fichier ; la dernière ne se supprime pas) ; « Nouvelle configuration » relance l'assistant avec `--nouvelle-configuration`.
- **Nouvelle configuration** : l'assistant crée la configuration (« Poste à 3 écrans », à renommer), retenue pour les écrans branchés. Son fichier `VPinballX-<id>.ini` part d'une copie de celui de la configuration active : les réglages faits à la main qui ne dépendent pas des écrans (qualité graphique, physique, touches) suivent ; l'assistant y écrit ensuite les écrans, le son et les boutons. « Assistant complet » refait la configuration active, l'étape « Boutons » seule aussi.
- **Un `VPinballX.ini` par configuration, plutôt qu'un seul réécrit à chaque bascule** : VPX réenregistre lui-même son fichier, et l'utilisateur y règle aussi bien des clés gérées (gardées dans `vpxManual`) que des clés libres. Un fichier unique obligerait, à chaque bascule, à mettre de côté puis restaurer les valeurs propres à chaque poste, et la détection des modifications à la main prendrait les valeurs de l'autre poste pour des retouches : une valeur réglée à la main sur un poste serait écrasée ou perdue au retour. Avec un fichier chacun, synchroniser une configuration ne touche jamais au fichier d'une autre, et la mémoire des clés écrites reste celle de son fichier (test « bascule aller-retour »). Contrepartie : un réglage général changé plus tard (Réglages de VPX) ne vaut que pour la configuration active.
- **Garde-fou** : tout le code de l'application passe par le fichier de la configuration active (`activeVpxIni`, `syncConfiguration` dans [app/src/vpx-ini.ts](../app/src/vpx-ini.ts)) ; un test refuse tout autre accès à `Locations.vpxIni`.

## Orientation et cadrage des tables

Après le choix du playfield, l'assistant demande où se tient le joueur : les flippers font tourner l'affichage jusqu'à ce que le texte soit à l'endroit, la bande « Flippers · vous êtes ici » de son côté. Il demande ensuite la diagonale, proposée d'après l'EDID (la taille au millimètre du timing détaillé, sinon les centimètres), et refusée si elle ne colle pas aux proportions de l'image : c'est le cas de certains téléviseurs et des projecteurs. Le tout est rangé dans `cabinet.json` (`playfield.flipperEdge`, `playfield.manualSizeCm` seulement si la diagonale diffère de l'EDID ; `packages/core/src/layout.ts`). Ces questions se refont seules par menu système > « Configuration de la borne » > « Orientation et taille du playfield » (`--assistant --playfield`), et avec « Écrans et rôles » quand le playfield change d'écran.

Clés écrites dans `VPinballX.ini` (`vpxLayoutSettings`, relevées dans `ViewSetup.cpp` et `player.cpp` de VPX 10.8.1) :

| Clé | Valeur | Gérée |
| --- | --- | --- |
| `[Player] BGSet` | 1 (borne) si l'image est plus haute que large pour le joueur, sinon 0 | oui |
| `[Player] ScreenWidth`, `ScreenHeight` | taille réelle en cm, le grand côté en largeur quelle que soit l'orientation | oui |
| `[Player] CabinetAutofitMode` | 1 (« Ajuster la table ») en vue borne, seulement si la clé est vide | non, modifiable dans les réglages |

Avec le cadrage automatique, VPX recalcule toute la vue borne de la table et en déduit la rotation de la forme de la fenêtre : flippers à droite d'une image paysage, en bas d'une image portrait, sans réglage possible.

Pour un joueur à gauche ou en haut, l'assistant tourne lui-même l'écran du playfield dans Windows. À l'étape « Où sont les flippers ? », il annonce « Start : retourner l'écran pour VPX » ; Start passe l'écran en orientation retournée (`setDisplayOrientation`, `packages/win-displays/src/orientation.ts` : `ChangeDisplaySettingsExW` essayé à blanc, appliqué, relu, et remis comme avant si Windows a fait autre chose). L'assistant refait la détection, replace ses fenêtres et recalcule le bord du joueur dans la nouvelle image (gauche ↔ droite, haut ↔ bas) : le joueur voit toujours le texte à l'endroit. Comme Windows, il demande ensuite de garder cette orientation : sans Start dans les 15 secondes, ou avec Exit, l'écran reprend son orientation d'origine, et Start continue alors sans retourner (tables à l'envers). Le choix de la rotation est dans `vpxOrientationFix` (`packages/core/src/vpx.ts`) : un retournement, qui garde la définition et la disposition des autres écrans ; un quart de tour seulement pour un Windows en portrait vu de côté. La synchronisation, elle, ne touche pas à l'orientation : elle signale le problème et renvoie vers l'assistant. Avec un autre menu de borne installé ou ouvert (PinUP Popper, PinballX, PinballY), le premier Start ne retourne rien : il avertit que l'orientation est un réglage de Windows que cet autre menu subit aussi ; Start retourne quand même, Exit garde l'orientation de Windows (voir [Cohabitation avec un autre menu de borne](#cohabitation-avec-un-autre-menu-de-borne)).

Le bord enregistré vaut pour l'orientation que Windows avait au moment de l'assistant, gardée avec l'écran (`lastSeen.rotation`). Si elle change ensuite hors de l'assistant (Paramètres > Affichage, pilote, retour de veille), l'image tourne sous le joueur : `currentFlipperEdge` (`packages/core/src/layout.ts`) fait tourner le bord enregistré de l'écart entre les deux orientations, et c'est ce bord actuel qui sert au cadrage, à l'avertissement « à l'envers » de la synchronisation, à la rotation des fenêtres de Cyber Pinball sur le playfield (`playfieldRotation`) et au bord proposé quand on relance l'assistant. Sans orientation relevée à l'enregistrement, le bord enregistré est gardé tel quel.

Un modèle enregistré avant cette étape ne reçoit aucune clé de cadrage tant que l'assistant n'a pas été relancé.

### Cadrage d'une table, en partie

Le cadrage d'une table se juge sur la table lancée, pas sur une liste de valeurs. Fiche d'une table > « Régler l'affichage en partie » lance la table avec `-PovEdit` au lieu de `-Play` (VPX 10.8.1, `AppCommands.cpp`) : la même partie, le menu de VPX ouvert d'emblée sur « Point Of View ». L'écran « Ajuster la vue » de la fiche, qui choisissait ces valeurs hors partie puis les essayait, est retiré (24 octobre 2026), avec son essai par `-TableIni`.

Avec le cadrage automatique, VPX recalcule la vue borne après avoir lu les surcharges de la table : les clés `[TableOverride] ViewCab*` ne servent qu'en cadrage manuel. La page « Point Of View » ne propose donc que ce que le cadrage relit (code de VPX 10.8.1 : `docs/recherche/vue-par-table.md`) :

| Mode (`[Player] CabinetAutofitMode`) | Réglages de la page | Effet |
| --- | --- | --- |
| « Fit Table » (1) | le mode et `CabinetAutofitPos` (0 à 20 %) | position des flippers du bas sur l'écran ; plus haut, le tablier remonte dans l'écran, au prix du haut de la table |
| « Fit Screen » (2) | le mode seul | toute la longueur de la table, étirée ou tassée |
| manuel (0) | décalages, échelles, vitre, rotation, puis `ScreenPlayerX/Y/Z` | vue réglée à la main, que le médecin signale quand une table l'impose |

- **Enregistrer** (Start) > « Save as Table Override » : dans le `.ini` de la table. Au retour, la fiche dit « Affichage enregistré pour cette table » si ce fichier a changé.
- **Hors partie**, ces clés ne se modifient plus pour une table : dans « Réglages de cette table », elles ont le badge « En partie » et seule leur valeur propre à la table peut être retirée (`isLiveVisual`, `packages/core/src/vpx-settings.ts`) ; les essentiels de la table ne les montrent plus.
- **Médecin** : « Cadrage manuel imposé par la table » quand le `.ini` de la table (souvent livré avec elle, réglé pour l'écran de son auteur) contient `CabinetAutofitMode = 0` ; la réparation retire la clé, l'ancien fichier part à la corbeille.

## Son

VPX 10.8.1 n'a que deux sorties : `[Player] SoundDeviceBG` (fronton : musique et voix de la ROM, AltSound, PuP-Pack, musique de la table) et `[Player] SoundDevice` (plateau : bruits mécaniques, mixés selon `Sound3D`). Il les désigne par le **nom Windows** de la sortie (« Haut-parleurs (USB Audio Device) »), comparé au caractère près ; un nom introuvable l'envoie sans un mot sur la sortie par défaut de Windows. Ce nom est localisé, renommable et parfois partagé par deux cartes identiques : comme pour les écrans, Cyber Pinball garde sa propre empreinte et réécrit le nom courant à chaque synchronisation.

**Détection** (`probeAudioOutputs`, `packages/win-displays/src/audio.ts`) : sorties actives lues dans `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\{guid}`, en lecture seule et par l'API Unicode (`RegGetValueW`), car `reg.exe` abîme les accents. Pour chacune : identifiant MMDevice (`{0.0.0.00000000}.{guid}`), nom attendu par VPX (« DeviceDesc (interface) »), bus, facteur de forme, canaux et masque des haut-parleurs réglés dans Windows, ContainerId, et sortie par défaut (la sortie active au plus grand `Level:0`, recoupé avec Chromium sur le PC de développement). Une sortie HDMI se rattache à son écran par le ContainerId du moniteur PnP (`ObservedDisplay.containerId`) ; le conteneur commun à tout ce qui est intégré au PC (`{00000000-0000-0000-FFFF-FFFFFFFFFFFF}`) ne rattache rien. `npm run probe` affiche tout cela.

**Étape « Son » de l'assistant**, après les écrans, ou seule (menu système > « Configuration de la borne » > « Son de la borne », `--assistant --son` : seules `SoundDevice`, `SoundDeviceBG` et `Sound3D` sont écrites). Les sorties virtuelles (Steam, Oculus : bus `ROOT`) et Bluetooth sont écartées, sauf si elles avaient déjà un rôle. Chaque sortie joue sur elle-même un son généré par oscillateur (aucun fichier), n bips pour la sortie n, en boucle : `AudioContext.setSinkId` dans une fenêtre de l'assistant, la sortie étant trouvée par `enumerateDevices` sous son nom Windows (Chromium ajoute « (vid:pid) » au nom des sorties USB, ignoré pour la comparaison). Le joueur répond aux boutons :

| Bouton | Sortie jouée | Test des haut-parleurs |
| --- | --- | --- |
| Flipper gauche | fronton | plateau, près du joueur |
| Flipper droit | plateau | plateau, côté fronton |
| Start | les deux (SSF à une seule carte) | dans le fronton |
| Exit | aucun rôle, sortie suivante | rien entendu |
| Retour arrière | sortie précédente | paire précédente |

Le haut-parleur de l'écran du fronton est proposé d'office pour le fronton, une carte réglée en 7.1 (à défaut le haut-parleur de l'écran du playfield) pour le plateau ; ces sorties sont jouées en premier, et l'écran dont la sortie est le haut-parleur s'allume. Relancer l'assistant repart des sorties enregistrées. Si la sortie du plateau annonce 6 ou 8 canaux, chaque paire de haut-parleurs (avant, arrière, côté) bipe à gauche puis plus aigu à droite (`ChannelMergerNode`, canaux discrets dans l'ordre du masque Windows, comme SDL) et le joueur dit où il l'entend. Les réponses choisissent le mixage (`playfieldModeFromTest`, `packages/core/src/audio.ts`) : l'avant au fronton et une autre paire sur le plateau donnent le SSF ; l'avant et une autre paire sur le plateau, le surround dans le sens entendu ; sinon la stéréo. Un câblage arrière / côté inversé pour le SSF est signalé. Le récapitulatif montre les sorties choisies et le `Sound3D` qui sera écrit.

Permissions : Chromium ne donne le nom des sorties et n'autorise `setSinkId` qu'avec la permission `media` ou `speaker-selection` ; l'assistant accorde ces deux-là à ses fenêtres (`setPermissionCheckHandler`) et autorise la lecture sans geste de l'utilisateur (`autoplayPolicy`), puisque les boutons passent par le processus principal. Si la sortie n'est pas trouvée, ou si Chromium ouvre moins de canaux qu'annoncé, l'écran le dit et le joueur peut répondre quand même.

Modèle (`cabinet.json`, champ `audio`) : sorties mémorisées par `endpointId`, avec le `containerId` en repli (un pilote qui recrée la sortie HDMI d'un écran) et l'empreinte de l'écran dont c'est le haut-parleur ; `roles` (fronton, plateau, éventuellement la même sortie) ; `playfieldMode` (`stereo`, `surround`, `ssf`) et `lockbarPair` en surround. À chaque synchronisation, les sorties sont retrouvées par identifiant, puis par ContainerId s'il n'y a pas d'ambiguïté, jamais par le nom.

Clés écrites dans `VPinballX.ini` (`vpxAudioSettings`), gérées comme les autres (une valeur changée à la main n'est jamais écrasée en silence) :

| Clé | Valeur |
| --- | --- |
| `[Player] SoundDeviceBG` | nom courant de la sortie du fronton ; vide si aucune (sortie par défaut de Windows) |
| `[Player] SoundDevice` | nom courant de la sortie du plateau ; vide si aucune |
| `[Player] Sound3D` | stéréo : 0, ou 1 sur une sortie 7.1 (le mode 0 y annule les gains) ; surround : 3 (avant côté lockbar) ou 2 (arrière côté lockbar) ; SSF : 5 |

Un modèle sans étape « Son » (enregistré avant elle, ou sans aucune sortie à proposer) n'écrit aucune de ces clés, et l'écran de réglages les laisse modifiables. Points à vérifier signalés par la synchronisation et l'assistant : sortie introuvable (la clé reste telle quelle, VPX jouera sur la sortie par défaut), deux sorties actives du même nom (VPX prend la dernière), `Sound3D` trop ambitieux pour les canaux réglés dans Windows (surround avec moins de 4 canaux, SSF avec moins de 8 : VPX retombe en stéréo, il faut régler la sortie en 5.1 ou 7.1 dans le panneau Son). Cyber Pinball ne change jamais lui-même un réglage audio de Windows ni la sortie par défaut. Les volumes (`MusicVolume`, `SoundVolume`) restent des réglages du joueur.

À confirmer sur une vraie borne (`docs/tests-manuels.md`, scénarios 29 à 38) : le rendu des modes 2, 3 et 5 de `Sound3D`, le sens attendu des paires arrière et côté en SSF (guide Pinscape : arrière côté joueur), les canaux qu'ouvre réellement Chromium sur une carte 7.1, le ContainerId d'une sortie HDMI après changement de port, et la disparition de la sortie HDMI d'un écran en veille.

## Plugins de VPX : backglass, PuP et DMD

VPX 10.8.1 dessine lui-même le backglass, les packs PuP et le DMD par ses plugins (mode « plugins ») : `ScreenRes.txt`, `B2STableSettings.xml` et `DmdDevice.ini` n'y sont lus par personne (`docs/recherche/generateurs-classiques.md`). Tout passe donc par `VPinballX.ini`. Le mode classique (VPX 10.8.0, composants COM) et DOF viendront plus tard.

**Qui dessine sur chaque fenêtre.** Plusieurs plugins peuvent dessiner sur les fenêtres Backglass, ScoreView (rôle DMD) et Topper. Pour chaque image, VPX essaie leurs moteurs de rendu dans l'ordre décroissant de `Priority.<moteur>` et garde le premier qui dessine (`player.cpp`, `OnAuxRendererChanged`). Sans ces clés, tous valent 0 et l'ordre dépend du chargement des plugins. Un pack PuP ne dessine que quand il a une vidéo à montrer : placé devant, il laisse le backglass du .directb2s visible le reste du temps (`docs/recherche/pup-packs.md`, § 4.3).

Clés écrites (`vpxSettingsFor` et `vpxPluginDefaults` dans `packages/core/src/vpx.ts`, `packages/core/src/dmd.ts`) :

| Clé | Valeur | Gérée |
| --- | --- | --- |
| `[Backglass] Priority.PUP`, `Priority.B2S` | 100, 50 ; si le rôle backglass est affecté | oui |
| `[ScoreView] Priority.PUP`, `Priority.B2S`, `Priority.ScoreView` | 100, 50, 10 ; si le rôle DMD est affecté | oui |
| `[Topper] Priority.PUP` | 100 ; si le rôle topper est affecté (B2S ne dessine pas sur le topper) | oui |
| `[Plugin.B2SLegacy] Enable` | 0 tant que B2S est activé : les deux répondent aux tables qui demandent `B2S.Server`, et le dernier chargé l'emporte | oui |
| `[Plugin.B2S] ScoreViewDMDOverlay`, `ScoreViewDMDAutoPos` | 1 et 1 si le rôle DMD existe. Le FullDMD d'un .directb2s passe devant ScoreView : sans incrustation, on ne verrait que son cadre. La position du DMD est cherchée dans l'image | non, proposées si la clé est vide |
| `[Plugin.DMDUtil] Enable`, et `ZeDMD`, `PIN2DMD` ou `Pixelcade` | 1 pour le DMD réel reconnu ; rien sans DMD réel | oui |
| `[Plugin.PinMAME] PinMAMEPath` | `<racine>\pinmame`, s'il contient `roms` | non, proposée si la clé est vide |
| `[Plugin.Serum] SerumPath`, `[Plugin.VNI] VniPath` | `<racine>\pinmame\altcolor`, s'il contient un `<rom>\<rom>.cRZ` ou `.cROMc` (Serum), `.pal` ou `.vni` (VNI) | non, proposées si la clé est vide |

Chaque table cherche d'abord ses ROM et ses couleurs dans son propre dossier (`pinmame\roms`, `serum`, `vni`, `pinmame\altcolor`) ; les dossiers communs ne servent qu'ensuite. La synchronisation signale « B2S et B2SLegacy activés ensemble » quand les deux le sont (B2SLegacy rallumé à la main, puis gardé).

**DMD réel.** `probeUsbDevices` (`packages/win-displays/src/usb.ts`) liste les périphériques USB présents par le gestionnaire de configuration de Windows (`CM_Get_Device_ID_ListW`) et lit leur nom et leur port série dans le registre, en lecture seule. Aucun port n'est ouvert, alors que les détecteurs de libdmdutil envoient une demande de connexion à chaque port. Identifiants reconnus (`HARDWARE_DMD_IDS`) :

| DMD | VID:PID | Source |
| --- | --- | --- |
| ZeDMD | `303A:1001` (ESP32-S3), `1A86:55D3` (CH343) ; `1A86:7523` (CH340) et `10C4:EA60` (CP210x), convertisseurs courants signalés « à confirmer » | filtre de détection automatique de libzedmd (`ZeDMDComm.cpp`) |
| PIN2DMD | `0314:E457` | libdmdutil (`PIN2DMD.cpp`) |
| Pixelcade | `1B4F:0008` (carte IOIO-OTG) | firmware IOIO ; libdmdutil la reconnaît à sa réponse « IOIO » |

DMDUtil cherche lui-même le port : Cyber Pinball n'écrit ni `ZeDMDDevice` ni `PixelcadeDevice`. Débranché, le DMD garde ses clés telles quelles. `npm run probe` affiche les DMD reconnus (`npm run probe -- --usb` : tous les périphériques USB).

### Plusieurs rôles sur un écran : zones

Une borne à deux écrans met souvent le backglass et le DMD sur le moniteur du fronton. Une borne sans écran de DMD l'incruste dans l'image du playfield. Un poste de bureau met tout sur un écran : la table d'un côté, le backglass de l'autre. Dans le modèle de borne, plusieurs rôles peuvent donc pointer vers le même écran, chacun dans sa zone (`zones`), playfield compris. Une zone est un rectangle en fractions de l'image de l'écran (0 à 1) : elle survit à un changement de définition. Elle peut garder un format (`aspect`, largeur sur hauteur : 16/9, 4…) : on la redimensionne alors sans en changer les proportions. Sans zone, le rôle occupe l'écran entier, comme avant. Code : [packages/core/src/zones.ts](../packages/core/src/zones.ts).

VPX 10.8.1 sait faire les deux, sans outil tiers (`src/renderer/Window.cpp`, `Renderer.cpp`) :

| Le rôle est… | Clés écrites | Effet dans VPX |
| --- | --- | --- |
| seul sur son écran | `<Préfixe>Output = 1`, `FullScreen = 1`, `WndX = WndY = 0`, `Width` et `Height` de l'écran | fenêtre plein écran sans bordure |
| sur une zone d'un écran (playfield compris) | `Output = 1` (pas pour le playfield), `Display`, `FullScreen = 0` (« Windowed »), `WndX`, `WndY`, `Width`, `Height` de la zone, en pixels relatifs à l'écran | fenêtre sans bordure posée sur la zone (toutes les fenêtres de VPX sont sans bordure) |
| dans la zone du playfield, sur son écran | `Output = 2` (« Embedded in playfield »), `WndX`, `WndY`, `Width`, `Height` de la zone, relatifs à la fenêtre du playfield | dessiné dans l'image du playfield, sur un fond noir, après la table : pas de fenêtre à garder au premier plan |

Un rôle sur l'écran du playfield mais hors de sa zone (poste de bureau) est une fenêtre à part. Le cadrage des tables suit la fenêtre du playfield, pas l'écran : vue borne quand la fenêtre est plus haute que large, `ScreenWidth` et `ScreenHeight` à la taille réelle de la zone. « Garder » une taille changée dans VPX la ramène à l'écran entier.

**Ordre de superposition.** VPX n'a aucun réglage : les incrustations sont dessinées backglass, puis DMD, puis topper (`Renderer.cpp`), et c'est Windows qui empile deux fenêtres qui se chevauchent. Rien n'empêche deux zones de se chevaucher (un DMD posé sur le bas du backglass, par exemple) : c'est signalé pour information, avec ce qui passera devant. Seuls deux rôles affectés au même écran sans zone ni l'un ni l'autre donnent un avertissement : c'est un oubli.

**Pas de rotation par zone.** VPX 10.8.1 n'a de réglage de rotation que pour la vue de la table (`ViewDTRotation`, `ViewCabRotation`…) et la VR : ses fenêtres Backglass, ScoreView et Topper, et leurs incrustations, sont toujours dessinées dans le sens de l'image Windows.

**Fenêtre DMD : FullDMD et DMD superposés.** La zone du rôle DMD est celle de la fenêtre ScoreView. Elle a deux couches : en fond, le FullDMD (image FullDMD du .directb2s, ou écran 5 d'un PuP-Pack, que le plugin PUP prend comme racine de ScoreView, avec repli sur l'écran 1 : `PUPManager.cpp`) ; par-dessus, le DMD de la ROM, que les plugins placent eux-mêmes dans la fenêtre (B2S : `ScoreViewDMDOverlay` et `ScoreViewDMDAutoPos`, qui cherche la place du DMD dans l'image ; PuP : écran 1 posé sur l'écran 5 par `CustomPos`). Une zone n'a donc pas à viser le DMD 128×32 : elle donne la place du FullDMD. `splitBackglassDmd` partage un écran entre le backglass en haut et une bande DMD centrée en bas, aux proportions demandées (4:1 pour un DMD seul, 16:9 pour un FullDMD), au plus un tiers de la hauteur.

- **Synchronisation** : signale deux rôles qui se recouvrent sur un même écran (le cas de deux rôles affectés au même écran sans zone), une zone invalide dans `cabinet.json` (l'écran entier est alors utilisé), un rôle incrusté sur tout le playfield, et une incrustation vue de côté ou à l'envers par le joueur : VPX ne tourne pas les incrustations.
- **Disposition des écrans** ([app/src/arrange.ts](../app/src/arrange.ts)) : étape de l'assistant après les rôles, ouverte sur « Terminer » (un Start garde tout tel quel), ou seule depuis le menu système (« Configuration de la borne » > « Disposition des écrans », `--assistant --disposition`) ; à l'étape des écrans, « Placer librement… » l'ouvre sur un rôle et revient à l'assistant. Le panneau s'affiche sur l'écran du playfield ; chaque écran montre ses zones, celle choisie avec ses coins. Lignes : la zone (n'importe quel rôle), son écran (« Aucun écran » pour un rôle annexe), le format conservé (Libre, 16:9, 16:10, 4:3, 5:4, 21:9, 4:1, 9:16, 3:4), le plein écran (avec un format verrouillé : la plus grande zone à ce format, centrée), la position horizontale et verticale, la largeur, la hauteur, la taille précise, la position précise, le placement au-dessus, en dessous, à gauche ou à droite d'un autre rôle du même écran (réduit, format gardé, s'il manque de la place), l'alignement sur un bord ou au centre, l'aimantation et « Annuler les changements ». Position et taille sont libres au pixel près sur tout l'écran ; une zone n'en sort jamais et garde au moins 16 px de côté. Ouverte depuis le menu, l'étape commence sur la ligne « Zone » ; dans l'assistant, sur « Terminer ». Le panneau se range en haut ou en bas, à l'opposé de la zone choisie quand elle est sur son écran.
  - **Aux boutons** : flippers pour choisir une ligne, Start pour l'ouvrir, flippers pour régler au pixel près (aperçu immédiat ; maintenus, ils accélèrent jusqu'à 64 px par cran), Start pour valider, Exit pour annuler.
  - **Au clavier** : flèches pour déplacer la zone (ligne fermée) ou régler dans les deux sens ; chiffres puis Entrée pour la taille précise (la largeur seule quand un format est verrouillé) et pour la position précise (X, puis Y).
  - **À la souris** : clic sur une ligne, sur une zone pour la choisir ; zone tirée pour la déplacer, jusque sur un autre écran (elle y passe aussitôt, même taille si elle y tient, et devient incrustée si elle tombe dans la zone du playfield), coin tiré pour la redimensionner, le coin opposé restant en place. Chaque zone montre ses coins, et chaque écran rappelle le geste. Les bords tirés s'aimantent à 12 px près à ceux et au milieu de l'écran et aux bords des autres zones (`snapRect`) ; ligne « Aimantation » pour la couper, ou Alt maintenu pendant le geste. Le playfield ne change pas d'écran à la souris : c'est l'étape des rôles qui le décide.
  - **Disposition seule** : enregistre le modèle et ne reprend dans `VPinballX.ini` que les fenêtres et le cadrage ; un rôle dont l'écran est seulement débranché garde son écran.
- **Réglage dans VPX** : une fenêtre fenêtrée ou incrustée déplacée ou redimensionnée dans l'interface de VPX (page d'affichage de la fenêtre, qui encadre l'incrustation) est signalée au démarrage comme toute clé changée à la main. « Garder » la reprend dans la zone du rôle, et la clé reste gérée. Une fenêtre plein écran retouchée est laissée à l'utilisateur.
- **PuP-Packs** : le choix de l'option du pack compare les proportions de la zone, pas celles de l'écran entier.
- **Assistant d'écrans** : à l'étape du DMD, les flippers proposent, après les écrans libres, le bas de l'écran du backglass (bande 4:1 pour un DMD seul, ou 16:9 pour un FullDMD avec le DMD par-dessus ; le backglass garde le haut) et l'incrustation dans le playfield (4:1, au bord opposé aux flippers, sur 40 % de la largeur). Une borne à deux écrans a donc toujours une place pour le DMD. La zone proposée est dessinée sur l'écran, en pointillés, à l'endroit exact où VPX l'affichera. La disposition enregistrée est reproposée d'office, telle quelle si elle a été retouchée dans VPX depuis (« comme enregistré »). Le réglage fin se fait dans VPX (ci-dessus).
- **Menu** : une fenêtre par écran physique, pas par rôle. Les rôles qui partagent un écran sont dessinés dans la même fenêtre, chacun dans sa zone ; un DMD incrusté se dessine sur le playfield sans pivoter, comme dans VPX. Deux fenêtres sur un même écran se disputeraient le plein écran qui couvre la barre des tâches (`coverDisplay`). La page du playfield tient dans sa zone, tailles comprises (`cqmin`, relatives à la zone).
- **Démonstration** : `.\docs\demo-zones.ps1`, hors écran sur `docs\ecrans\pc-dev.json` (`-Ecrans`). Dispositions : `fronton` (DMD sous le backglass), `incruste` (DMD dans le playfield), `editeur` (disposition seule : DMD choisi, format 4:1, placé sous le backglass, coin tiré à la souris, tiré jusque sur l'écran du playfield où il devient incrusté, 960 px de large et position 100, 50 au clavier, aimantation coupée, enregistré), `bureau` (un écran : playfield en 9:16 à gauche, backglass à droite, DMD incrusté) ; `assistant` en plus, pour les écrans du PC de développement. Les clés écrites et les captures (`tmp\captures\zones`) s'affichent ; ni le vrai modèle ni le vrai `VPinballX.ini` ne sont touchés. L'autopilote de l'assistant sait tirer une zone : `drag:<écran>:<rôle>:<move|nw|ne|sw|se>:<dx>:<dy>`.

### Régler l'affichage en partie

Tout réglage visuel qui demande de voir le résultat se fait **pendant une partie**, sur l'image réelle, avec le menu de VPX 10.8.1 lui-même : cadrage de la table (ci-dessus), place et taille du fronton, du DMD et du topper (`DisplaySettingsPage`, lu dans le code au commit af26b2d93), aspect des afficheurs. Un PuP-Pack, par exemple, dessine souvent un cadre sur le fronton (en bas, au centre) où le DMD doit tomber, et chaque pack a le sien.

1. **Entrer dans le menu de VPX** : depuis la fiche, « Régler l'affichage en partie » (la table démarre menu ouvert sur le cadrage, la partie ne compte pas dans les statistiques) ; ou, pendant n'importe quelle partie, les deux MagnaSave appuyés ensemble (Crédit et Start sur une borne sans MagnaSave, F12 au clavier). Cyber Pinball écrit cette combinaison dans `[Input] Mapping.InGameUI`, à côté de F12 (`inGameMenuButtons`, `packages/core/src/buttons.ts`), **même sans relevé des boutons** : c'est alors la seule clé de `[Input]` qu'il écrit, avec les touches par défaut des encodeurs (`inGameMenuSetting`). Exit n'y entre jamais : seul, il quitte la partie.
2. **Régler** : « Point Of View » pour le cadrage ; Exit ramène à l'accueil du menu, puis « Display Settings » > « Backglass Display », « ScoreView Display » (le DMD) ou « Topper Display » : position et taille au pixel près, appliquées en direct ; la fenêtre se tire aussi à la souris.
3. **Enregistrer** (Start) : « Save as Table Override » écrit dans le `.ini` de la table, pour elle seule ; « Save Globally » dans `VPinballX.ini`, pour toutes les tables.

Boutons du menu de VPX (`InputManager.cpp`), rappelés sur l'écran de chargement du réglage (« Réglage de l'affichage », `displayKeys`) :

| Bouton | Dans le menu de VPX |
| --- | --- |
| MagnaSave gauche, droit | changer de ligne |
| Flippers | régler la valeur |
| Start | enregistrer : pour cette table ou pour toutes |
| Crédit | annuler les changements |
| Lanceur | valeur par défaut |
| Exit | page précédente, puis fermer le menu ; menu fermé, quitter la partie |

| Le rôle est… | Réglable en direct | Remarque |
| --- | --- | --- |
| sur une zone d'un écran (fenêtre « Windowed ») | position et taille | le cas du DMD posé sur le fronton |
| seul sur son écran (plein écran) | non | passer en fenêtré dans ce menu écrit `FullScreen` tout de suite dans les réglages généraux, appliqué au lancement suivant |
| incrusté dans le playfield | position et taille | encadré en vert tant que la page est ouverte |

- **Après la partie** : une place enregistrée pour la table donne au médecin le constat « Écrans placés pour cette table » (information, avec les tailles et positions), et sa correction « Revenir à la disposition générale » retire ces clés seulement (`tableWindowsFinding`, `packages/core/src/doctor.ts`). Une place enregistrée pour toutes les tables est une clé gérée changée à la main : le menu demande au démarrage s'il faut la garder (voir « Plusieurs rôles sur un écran : zones »).
- **Hors partie** : dans « Réglages de cette table », les réglages visuels (cadrage et caméra, fenêtres, profils des afficheurs `[DMD]` et `[Alpha]`, place du DMD dans l'image B2S, marges des écrans PuP) portent le badge « En partie » et ne se modifient plus ; seule la valeur propre à la table peut être retirée. Les mesures du meuble (largeur de l'écran, lockbar) restent réglables.
- **Qui dessine dans la fenêtre du DMD** : le plugin PUP ne dessine jamais le DMD de la ROM. S'il prend la fenêtre ScoreView (pack avec un écran 5, ou un écran 1 qui n'est pas posé sur le fronton), le DMD de la ROM n'y paraît pas ; il faut alors `[ScoreView] Priority.PUP` plus bas que `Priority.ScoreView` pour cette table. Non géré par Cyber Pinball pour l'instant.
- **Limites** : sans MagnaSave, on ne change pas de ligne dans le menu de VPX (`UIUp`, `UIDown`) ; l'ordre d'empilement de deux fenêtres de VPX qui se chevauchent (DMD sur le fronton) est laissé à Windows. À vérifier sur la borne : tests manuels 86 à 89, 225 et 226.

## Médias des jeux

Chaque jeu peut avoir ses médias de présentation : logo, vidéo du plateau, fronton, afficheur, topper, vidéo de chargement, musique, son de lancement, prospectus et règles. Le menu montre chacun sur l'écran prévu et au bon moment. Quand un média manque, il montre à sa place un repli dessiné par Cyber Pinball : jamais un écran vide, jamais le bureau Windows. Conception : `docs/recherche/medias.md`, § 5.

Les médias d'un jeu se rangent dans le dossier de sa table, sous-dossier `medias\`, et s'appellent `(Type) <nom du dossier>.ext`, comme le propose VPX 10.8.1 : `medias\(Backglass) Terminator 2 (Williams 1991).mp4`. Le nom du `.vpx` convient aussi, pour un média propre à une version. Le prospectus et les règles peuvent avoir plusieurs pages : `(GameHelp) <nom>.png`, puis `(GameHelp) <nom> 2.png`, `… 3.png`. Aucun réglage par écran : l'écran de chaque média, ses proportions et sa rotation viennent du modèle de la borne.

| Type (fichier) | Dans le menu | À quoi il sert | Où et quand il s'affiche | Formats | Sans fichier |
| --- | --- | --- | --- | --- | --- |
| `(Wheel)` | Logo | Identifie la table dans la liste du menu, sur fond transparent. | Playfield : liste des tables ; mode attente | png, apng, webp, gif | le titre en texte stylisé |
| `(Playfield)` | Plateau | La table qui joue, en fond derrière la liste. | Playfield, assombri sous la liste ; mode attente | mp4, webm, m4v, ou une image | verre fumé sarcelle, discret, sans faux visuel de table |
| `(Backglass)` | Fronton | L'image ou l'animation du fronton du jeu. | Fronton : table choisie, chargement, mode attente ; en partie si VPX laisse l'écran libre | mp4, webm, m4v, ou une image | l'image allumée du `.directb2s`, sinon une carte : titre, fabricant, année |
| `(DMD)` | Afficheur | Animation de l'afficheur 4:1. | Afficheur étroit (4:1), aux mêmes moments que le fronton | comme le fronton | l'Afficheur large réduit, sinon le titre en points sur une grille 128 × 32 |
| `(FullDMD)` | Afficheur large | Animation 16:9 pour un afficheur large. | Afficheur large (16:9), aux mêmes moments | comme le fronton | l'Afficheur centré, sinon le titre en points |
| `(Topper)` | Topper | Le bandeau animé au-dessus du fronton. | Topper, aux mêmes moments | comme le fronton | logo animé et marque de Cyber Pinball, fabricant et année |
| `(Loading)` | Chargement | Vidéo jouée pendant que VPX charge la table. | Playfield, du Start à l'apparition de la partie, sous le bandeau des commandes | mp4, webm, m4v | écran de chargement : titre, fabricant, année, commandes de la partie |
| `(Audio)` | Musique du jeu | La musique de la table choisie. | Haut-parleurs du fronton, tant que la table est choisie (« Musique des jeux », coupée par défaut) ; en attente si son son est réduit | mp3, ogg, m4a, flac, wav | la musique de la borne, sinon le silence |
| `(AudioLaunch)` | Son de lancement | Un son court au lancement. | Haut-parleurs du fronton, une fois, au Start | comme la musique | rien (ou le son de la vidéo de chargement) |
| `(GameInfo)` | Prospectus | Une ou plusieurs pages de présentation du jeu. | Playfield, sur demande : fiche > « Prospectus », page par page | png, apng, webp, jpg, jpeg, gif, mp4 | une fiche générée depuis le `.info` : titre, fabricant, année, auteurs |
| `(GameHelp)` | Règles | Une ou plusieurs cartes de règles. | Playfield, sur demande : fiche > « Règles », page par page | comme le prospectus | les commandes de la partie |

`(Other)`, `(RealDMD)` et `(RealColorDMD)` (Popper, PinballX) n'ont pas d'écran chez Cyber Pinball : ils sont lus, gardés et ignorés. Les anciens formats de Popper (`flv`, `f4v`, `avi`, `mov`, `wmv`, `mpg`, `mpeg`) ne se lisent pas : le médecin les signale, l'import les laisse de côté.

Pour chaque écran, le menu prend le premier média trouvé : `(Type) <nom du .vpx>`, `(Type) <nom du dossier>`, les noms fixes de VPinFE (`bg.png`, `wheel.png`, `table.mp4`…), l'image du `.directb2s` (fronton seulement), le **défaut de la borne** `<racine>\media\(Type).ext`, et enfin le repli intégré.

### Ajouter des médias

- **Fiche d'une table > « Médias du jeu »** (le plus simple, aux boutons ou à la souris) : chaque média avec son rôle, l'écran et le moment où il s'affiche, un aperçu, et ce que le menu montre aujourd'hui. On prend un fichier copié dans `<racine>\import` (depuis une clé USB), on le choisit sur ce PC ou on le glisse sur la fenêtre ; on remplace, on retire, on règle le demi-tour du plateau et le volume du jeu. Rien n'est écrit avant « Enregistrer », qui montre d'abord le plan. Voir « Gestionnaire : « Médias du jeu » ».
- **Avec la table** : une archive qui contient des médias rangés à la façon de PinUP Popper (`POPMedia\…\Wheel\<jeu>.png`), de PinballX ou de VPinFE est reconnue à l'ajout (« Ajouter une table ») ; les médias sont renommés `(Type) <dossier>` dans `medias\`. Un pack de médias seul, sans `.vpx`, complète une table installée. Voir « Import des médias ».
- **Depuis une installation de PinUP Popper ou de PinballX** : menu système > « Reprendre les médias de PinUP Popper / PinballX ». Tout est copié, l'installation d'origine n'est pas modifiée.
- **À la main** : copier le fichier dans `medias\` sous son nom `(Type) <nom du dossier>.ext`. Le menu le voit dans les 10 secondes. Le médecin (fiche > « Diagnostiquer et réparer ») signale un nom qui ne correspond pas au jeu, un fichier rangé hors de `medias\`, un format illisible, des proportions qui ne collent pas à l'écran, et propose le renommage.
- **Défauts de la borne** : un fichier `<racine>\media\(Type).ext`, sans nom de jeu, sert à tous les jeux qui n'ont pas ce média : un topper aux couleurs de la salle, une musique d'ambiance, une vidéo de fond. Il passe avant le repli intégré.

- **En ligne, à la demande** : « Chercher les médias » prend dans VPinMediaDB tout ce qu'il a pour le jeu, avec un plan à valider (« Médias depuis VPinMediaDB »). Pour un média précis, « Voir les propositions » montre toutes les versions trouvées, en ligne et sur la borne, et l'on choisit sur les aperçus (« Propositions de chaque média et recherche approfondie »).

### Prospectus et règles

Fiche d'une table > « Prospectus » ou « Règles » (le nombre de pages est écrit sous l'action) : la page occupe l'écran du playfield, tournée pour le joueur, entière et sans déformation. Les flippers passent à la page précédente ou suivante, Start à la suivante puis revient à la fiche après la dernière, Exit revient à la fiche ; à la souris, les boutons sous la page font de même. Une page vidéo (`mp4`) tourne en boucle, muette. Sans fichier, le prospectus est une fiche générée depuis le `.info` (carte de fronton avec le titre, puis fabricant, année, auteurs, version, description), et les règles montrent les commandes de la partie, chacune avec une phrase qui dit comment ajouter le vrai média. Code : `sheetPages` ([packages/core/src/mediaview.ts](../packages/core/src/mediaview.ts)), écran `pages` de `app/src/library.ts`, rendu `renderPages` de `app/renderer/library.js`.


### Dans les fenêtres du menu

Chaque fenêtre du menu montre les médias de la table choisie. La recherche suit l'ordre du § 5.3 de la recherche (`resolveMedia`, [packages/core/src/medias.ts](../packages/core/src/medias.ts)) : nom du `.vpx`, nom du dossier, noms de VPinFE, image du `.directb2s` (fronton), défauts de la borne, puis repli intégré.

| Écran | Média | Affichage |
| --- | --- | --- |
| playfield, en fond du menu | `(Playfield)` | `cover`, assombri sous la liste ; tourné pour que les flippers du média tombent au bord des flippers de la borne (un fichier en portrait a les flippers en bas, un fichier en paysage à droite, comme chez Popper et dans VPinMediaDB) |
| liste du menu | `(Wheel)` | logo au-dessus du titre de la table choisie et dans une case de taille fixe devant chaque titre de la liste (l'initiale du titre sans logo) |
| backglass | `(Backglass)`, sinon l'image allumée du `.directb2s` | `contain` sur fond noir |
| DMD | `(DMD)` ou `(FullDMD)` selon les proportions de la zone du DMD (4:1 ou 16:9), l'autre sinon | `contain` sur fond noir |
| topper | `(Topper)` | `contain` sur fond noir |

- **Zones** : chaque rôle d'un écran partagé (fronton et bande DMD, DMD incrusté dans le playfield) a son propre média dans sa zone.
- **Lecture** (`app/renderer/media.js`) : vidéos en boucle, muettes, sauf celle du fond du playfield quand le réglage « Son des vidéos du menu » le demande (voir « Son du menu ») ; fondu enchaîné de 280 ms au changement de table ; médias des deux tables voisines de chaque côté préchargés, et une vidéo quittée gardée prête un moment (huit éléments au plus, dont quatre vidéos) ; fond du playfield en pause sous une superposition opaque (aide, fiche, message) ; toutes les vidéos en pause quand la fenêtre est cachée. Une navigation rapide n'empile rien : une couche qui attend encore sa première image est abandonnée.
- **Repli** sans média ou sur erreur de lecture : les composants de `app/renderer/fallback.js` (tâche T3) dès qu'ils sont chargés par `frontend.html` (`window.CyberFallback`), sinon un repli minimal : le titre, le fabricant et l'année sur fond noir, réduits jusqu'à tenir dans leur zone, et rien sur le fond du playfield. Le topper dessiné porte la marque et le **titre du jeu** (deux lignes au plus), pas le fabricant et l'année, déjà sur le fronton et dans le menu.
- **Fond de partie**, réglage « Médias pendant la partie » de l'écran « Médias, son et attente » (menu système ; Start passe au choix suivant, enregistré dans `<données>\medias.json`) : **figés** par défaut (première image, dessinée une fois sur un canvas, sans décodeur vidéo ouvert pendant la partie), **animés** (le playfield et les écrans que VPX occupe restent figés), ou **éteints** (noir et titre en discret). Voir « Chargement et partie ».
- **Protocole `cyber-media://`** ([app/src/media-protocol.ts](../app/src/media-protocol.ts), règles dans [packages/core/src/mediaview.ts](../packages/core/src/mediaview.ts)) : seul chemin des fenêtres vers les fichiers (la CSP de `frontend.html` n'autorise rien d'autre pour les images et les vidéos). Il ne sert qu'un fichier de média (extension du catalogue) posé directement dans `medias\` d'une table connue, dans `<racine>\media\` ou dans le cache des images du `.directb2s` (`<données>\cache\medias\`), plus, un par un, les fichiers que « Médias du jeu » montre en aperçu avant de les ranger (dossier d'import, fichier choisi sur ce PC, `allowPreview`) ; les replis intégrés sont dessinés par la fenêtre, sans fichier : sous-dossier, sortie par `..`, flux de données alternatif, lien symbolique et autre extension sont refusés (403). Il répond aux requêtes partielles (206), dont la lecture des vidéos a besoin. L'adresse change avec la date et la taille du fichier : un média remplacé sous le même nom n'est pas repris du cache.
- **Image du `.directb2s`** : extraite en tâche de fond, une table à la fois, au premier passage sur la table ; le repli s'affiche en attendant, puis l'image le remplace en fondu.
- **Erreurs de lecture** (vidéo indécodable, image abîmée) : remontées par la fenêtre au processus principal avec le code de l'erreur, écrites dans la console et dans le journal unique `<données>\logs\medias-erreurs.json` (format décrit dans « Le médecin des médias »), une entrée par fichier ; une entrée disparaît quand le fichier change. Le médecin les signale.
- **Tests** : [mediaview.test.ts](../packages/core/src/test/mediaview.test.ts) (adresses, dossiers autorisés, rotation pour chaque bord des flippers, DMD ou FullDMD, `.directb2s`, réglage, journal des erreurs, CSP et branchements du rendu).
- **Démonstration hors écran** : `npm run build` puis `npx electron docs/demo-medias-menu.cjs` fabrique un bac à sable dans `tmp\medias-menu\racine` (huit tables, images et vidéos WebM générées, un `.directb2s`, une vidéo abîmée, un topper par défaut), ouvre les fenêtres du menu sans les montrer (rendu hors écran) sur trois bornes simulées (flippers à gauche avec fronton partagé et topper, paysage avec DMD incrusté, flippers à droite avec DMD 4:1), et capture chaque écran : médias présents, absents, portrait, paysage, vidéo, image, fondu en cours, rafale, aide, partie figée, animée, éteinte. `tmp\medias-menu\rapport.json` liste ce qu'affiche chaque couche, les textes qui se chevauchent ou débordent (aucun attendu), la pause des vidéos fenêtre cachée, et les erreurs de lecture remontées.

### Son du menu

Le son du menu sort d'une seule fenêtre, celle du playfield (`app/renderer/menu-audio.js`). Le processus principal décide quoi jouer à chaque moment (`menuSound`, [packages/core/src/menumoments.ts](../packages/core/src/menumoments.ts)) ; tout se règle dans **Menu système > « Médias, son et attente »** (`app/src/menu-settings.ts`), enregistré dans `<données>\medias.json` et appliqué aussitôt.

| Moment | On entend | Réglage (défaut) |
| --- | --- | --- |
| Navigation, fiche, messages | la musique du jeu choisi, `(Audio)` (sinon celle de la borne, `<racine>\media\(Audio).*`), en boucle | « Musique des jeux » : **coupée** par défaut, pour une borne silencieuse dans une pièce de vie ; « Volume de la musique » (60 %) |
| Navigation, jeu sans musique ou musique coupée | le son de la vidéo du fond du playfield | « Son des vidéos du menu » (0 % : muettes) |
| Chargement | le son de lancement, `(AudioLaunch)`, une fois ; sans lui, le son de la vidéo de chargement | « Volume du lancement » (80 %) |
| Partie | rien : tout se tait en fondu dès que la fenêtre de jeu de VPX apparaît | — |
| Attente | comme en navigation, pour la table montrée | « Son en attente » : **coupé** par défaut, ou réduit (30 % du volume) |

- **Volume d'un jeu** : chaque volume est multiplié par le volume relatif du jeu (fiche > « Médias du jeu » > « Volume de ce jeu », `CyberPinball.medias.volume` du `.info`), sans dépasser le maximum. Un jeu à 50 % joue sa musique à 30 % quand le réglage est à 60 %.
- **Enchaînements** : au changement de table, l'ancienne musique s'éteint en fondu (700 ms) et la nouvelle ne démarre que si la table reste choisie 350 ms : faire défiler la liste ne joue rien. Le son d'une vidéo suit son fondu enchaîné. Au lancement, la musique s'éteint et le son de lancement part.
- **Sortie** : celle du fronton dans le modèle de la borne (étape « Son » de l'assistant ; c'est aussi celle de la musique de VPX, `SoundDeviceBG`), sinon celle du plateau, sinon la sortie par défaut de Windows. Elle est retrouvée parmi les sorties de Chromium par son nom Windows (suffixe « (vid:pid) » des sorties USB ignoré), puis musique, son de lancement et vidéos y sont envoyés (`setSinkId`). Sortie introuvable : la sortie par défaut. Les fenêtres du menu ont pour cela les permissions `media` et `speaker-selection` et la lecture sans geste de l'utilisateur (`autoplayPolicy`), comme l'assistant.
- **Bureau Windows** (fenêtres réduites) : la musique se tait, puis reprend au retour.
- **Hors écran**, toute fenêtre de l'application est muette (`createWindow`, `app/src/offscreen.ts`) : un essai sans opérateur ne fait aucun bruit. L'autopilote relève après chaque étape ce qui aurait joué (`CyberMenuAudio.status()` : fichier, volume, lecture, sortie, son de la vidéo) et ce que montre chaque écran (`cyberEtat()` : phase, position, table montrée en attente, et pour chaque couche de média l'élément affiché, vidéo en lecture ou en pause, image, image figée ou repli) dans `son.txt`, à côté des captures.
- **Tests** : [menumoments.test.ts](../packages/core/src/test/menumoments.test.ts) (réglages et valeurs écrites à la main, volumes, son de chaque moment, sortie du menu, médias sonores résolus sur le disque, branchements du rendu, fenêtres muettes hors écran). Démonstration : `.\docs\demo-moments.ps1` (voir « Tests de bout en bout sans opérateur »).

### Chargement et partie

Ce que montre chaque écran du lancement à la fin de la partie (`momentScreen`, [packages/core/src/menumoments.ts](../packages/core/src/menumoments.ts) ; rendu dans `app/renderer/frontend.js`) :

| Moment | Playfield | Autres écrans |
| --- | --- | --- |
| Chargement (du Start à l'apparition de la fenêtre de jeu de VPX) | la vidéo `(Loading)` du jeu, plein écran et tournée d'après le bord des flippers, sous un bandeau avec le titre et les commandes de la partie ; sans elle, l'écran de chargement de secours (`fallback.js` : titre, fabricant, année, barre d'attente) avec les commandes dessous | les médias du jeu, animés, jusqu'à ce que les fenêtres de VPX les recouvrent |
| Partie | première image du fond du playfield, sous VPX | écran que VPX **n'occupe pas** : selon « Médias pendant la partie » (figés par défaut, animés, éteints) ; écran qu'il **occupe** (fronton du `.directb2s`, DMD de PinMAME, PuP) : figé, il ne se voit pas et ne doit rien coûter |

- **Écrans occupés** : dès que la fenêtre de jeu apparaît, puis toutes les 2 s, la pile des fenêtres de Windows est relue (`occupiedRoles`) : un rôle est occupé quand une fenêtre d'un autre processus couvre au moins la moitié de sa zone (l'écran entier, ou sa part d'un écran partagé : bande DMD sous le fronton, DMD incrusté) au-dessus de la fenêtre de Cyber Pinball. La console le dit : « Partie : écrans occupés par VPX : backglass, dmd. »
- **Focus** : rien de tout cela ne montre une fenêtre ni ne la met au premier plan ; seul l'état envoyé aux fenêtres du menu change, et elles restent derrière celles de VPX (gardien des écrans).
- **Partie simulée** (essais hors écran seulement) : `CYBERPINBALL_PARTIE_SIMULEE=<rôles occupés>` (« backglass,dmd », ou vide) remplace VPX par une fausse partie (`simulateVpx`, `app/src/launcher.ts`) : chargement, partie de 10 s avec l'autopilote, retour au menu, sans rien lancer ni prendre de raccourci global. À l'écran, la variable est ignorée.

### Mode attente

Après un temps sans bouton sur le menu des tables, la borne se présente toute seule (`AttractMode`, `pickAttractTable`, [packages/core/src/menumoments.ts](../packages/core/src/menumoments.ts)) :

- **Délai** : « Mode attente » (5 min par défaut ; 1, 2, 3, 5, 10, 15 ou 30 min ; **jamais**). Le compte repart à chaque bouton et à chaque clic, et quand on revient au menu des tables : il ne court jamais sur la fiche, l'aide, un message, un écran de réglage ou pendant une partie.
- **Tables** : une table tirée au hasard toutes les N secondes (« Table suivante en attente », 20 s par défaut), jamais la table choisie dans le menu ni l'une des dernières montrées (un tiers des tables environ), si bien que toutes finissent par passer. Chaque écran montre les médias de cette table ; le playfield, son fond (moins assombri qu'au menu), son logo ou à défaut son titre en logo de secours (`fallback.js`), fabricant et année, et « Appuyez sur un bouton pour revenir au menu ».
- **Sortie** : le premier bouton, quel qu'il soit, ou un clic, revient au menu tel qu'il était, sans autre effet : la sélection ne bouge pas, Start n'ouvre pas la fiche, Exit n'ouvre pas le menu système.
- **Son** : « Son en attente » coupé par défaut ; réduit, la musique de la table montrée (ou le son de sa vidéo) joue à 30 % de son volume.

### Gestionnaire : « Médias du jeu »

Fiche d'une table > « Médias du jeu » : ce que le menu montre pour ce jeu, écran par écran, sans manipuler de fichier (conception : `docs/recherche/medias.md`, § 5). Une carte par média : son libellé (Logo, Plateau, Fronton, Afficheur, Afficheur large, Topper, Chargement, Musique du jeu, Son de lancement, Prospectus, Règles) et son nom de fichier entre parenthèses, **où** il s'affiche (écran et moment, en clair, au lieu des noms d'écran de Popper), son **rôle** en une phrase, un aperçu (l'image, une image de la vidéo, ou la description du repli), et l'état : « Présent », ou le repli utilisé et lequel (« Repli : image du .directb2s », « Repli : défaut de la borne », « Repli : Afficheur large », « Repli intégré »), avec dimensions et poids. Un média que la borne ne montre pas le dit (« Cette borne n'a pas d'écran topper », afficheur étroit qui montre l'Afficheur et non l'Afficheur large). Les fichiers de `medias\` que le jeu n'utilise pas sont listés avec la raison (nom d'un autre jeu, format illisible, type sans écran).

- **Actions**, aux boutons ou à la souris : prendre un fichier dans `<racine>\import` (sous-dossiers compris, seulement les formats que le menu lit pour ce média), le choisir sur ce PC, ou le glisser sur la fenêtre (sur la vue d'ensemble, le type se lit dans le nom : `(Wheel) …`, `bg.png` de VPinFE, dossier `Wheel` de Popper ou `Backglass Images` de PinballX, sinon c'est le média choisi) ; remplacer ; mettre à la corbeille ; demi-tour du plateau et de la vidéo de chargement (l'aperçu est tourné comme le menu le montrera, vu du joueur) ; volume relatif du jeu (0 à 200 %) ; pour le prospectus et les règles, la liste des pages, et pour chaque page monter, descendre, remplacer ou retirer.
- **Rien n'est écrit avant « Enregistrer »**, qui montre d'abord le plan, une ligne par média. Les fichiers sont rangés sous `(Type) <nom du dossier>[ N].ext` (un fichier venu du dossier d'import le quitte, un fichier choisi sur ce PC ou glissé est copié) ; tout autre fichier de ce type pour ce jeu (ancien fichier, autre format qui passerait devant, nom de VPinFE, format illisible) va à la corbeille ; les pages sont renumérotées en deux temps, sans qu'aucune n'en écrase une autre. Demi-tour et volume vont dans le `.info` sous `CyberPinball.medias` (`halfTurn`, `volume`), ses autres champs conservés. Quitter avec des changements demande « Quitter sans enregistrer ? ».
- Code : `packages/core/src/mediaedit.ts` (où s'affiche chaque média, brouillon, plan, renommage, `.info`), tests dans `packages/core/src/test/mediaedit.test.ts` ; écrans dans `app/src/library-medias.ts`, cartes dans `app/renderer/library.js` et `library.css`.

### Import des médias

Les autres frontends les rangent autrement ; l'import les reconnaît et les renomme. Code : [packages/core/src/mediaimport.ts](../packages/core/src/mediaimport.ts), raccordé à l'ajout de tables ([tableimport.ts](../packages/core/src/tableimport.ts)) et à l'écran de reprise ([app/src/media-import.ts](../app/src/media-import.ts)) ; tests dans [mediaimport.test.ts](../packages/core/src/test/mediaimport.test.ts).

**Ce qui est reconnu**, dans une archive, une sélection ou le dossier d'import :

| Rangement | Exemple | Type |
| --- | --- | --- |
| PinUP Popper | `POPMedia\Visual Pinball X\Wheel\<jeu>.png`, dossiers `PlayField`, `Backglass`, `DMD`, `Menu` (FullDMD), `Topper`, `Loading`, `Audio`, `AudioLaunch`, `GameInfo`, `GameHelp`, `Other2` | nom du dossier ; pages `<jeu>01.png`, `<jeu>02.mp4` dans l'ordre |
| PinballX | `Media\Visual Pinball\Wheel Images\<jeu>.png`, `Table Videos`, `Table Images`, `Backglass Videos`, `DMD Videos`, `FullDMD Videos`, `Topper Videos`, `Launch Audio`, `Table Audio`, `Loading Videos`, `Real DMD…` ; `Media\Flyer Images\Front`, `Back`, `Inside1`… (pages du prospectus, dans cet ordre) | nom du dossier |
| VPinFE | `medias\bg.png`, `wheel.png`, `table.mp4`, `dmd.png` (FullDMD)… | nom fixe du fichier |
| Déjà nommé | `(Backglass) <n'importe quel nom>.mp4`, partout | le nom |

Un dossier de Popper au nom ambigu (`DMD`, `Audio`, `Backglass`, `Topper`, `Loading`, `Menu`) n'est reconnu que sous `POPMedia` ou à côté d'un dossier sans équivoque (`Wheel`, `PlayField`, `GameHelp`…) : seul dans une archive, un dossier `DMD` est plus souvent le contenu FlexDMD d'une table. Un dossier DMD que charge le script reste toujours un dossier DMD.

**Attribution au jeu** : dans le paquet d'une seule table, le média lui revient. Sinon, d'après le nom du fichier (nom du jeu chez Popper et PinballX, `(Type) <nom>`, dossier de la table pour VPinFE) : nom d'un `.vpx` ou du dossier, ROM, titre (fabricant et année départagent), jeu reconnu par la base VPS (comparé au `VPSId` du `.info` des tables installées). Un média nommé d'après un jeu absent de l'import et des tables installées reste où il est (« Non importé »).

**Rangement** : `(Type) <nom du dossier>.ext`, pour toutes les versions du jeu. Un seul fichier par type, le meilleur format (vidéo avant image pour les écrans, Visual Pinball X avant Visual Pinball 9) ; les autres sont signalés « Doublon ». Prospectus et règles gardent toutes leurs pages (`(GameHelp) <nom>.png`, `(GameHelp) <nom> 2.png`…). Un média du même type déjà présent dans la table (autre extension ou autres pages comprises) part à la corbeille ; le plan le marque « remplace l'existant ».

**Jamais rangés, toujours signalés dans le plan** : les formats que le menu ne lit pas (`flv`, `f4v`, `avi`, `mov`, vérifié sur Electron 44.5.1 : à convertir en mp4 ou webm), un format non prévu pour le type (une vidéo en guise de logo, par exemple), les médias d'un autre émulateur que Visual Pinball (`POPMedia\Future Pinball\…`). En mode déplacement (dossier d'import), ils restent dans `import\`.

**Reprendre les médias de PinUP Popper / PinballX** (menu système, Exit dans le menu) : propose les installations trouvées aux emplacements habituels (`C:\vPinball\PinUPSystem\POPMedia`, `C:\PinballX\Media`…) ou un dossier choisi (`PinUPSystem`, `POPMedia`, le dossier d'un émulateur ou d'un type, le dossier de PinballX ou son `Media`). Chaque média est rapproché d'une table installée, sans jamais deviner : un nom qui désigne plusieurs tables (« Fathom » pour deux versions rangées dans deux dossiers) n'est pas copié. Le plan donne, table par table, les types reçus, leur taille, comment la table a été reconnue et ce qui est remplacé ; puis les formats illisibles, les jeux sans table et les autres émulateurs. La place libre est vérifiée avant. « Copier » **copie** : l'installation d'origine n'est jamais modifiée. Les PuP-Packs (`PUPVideos`) et les médias par défaut de Popper (`System`, `Default`) ne sont pas repris.

**Cas non reconnus** : le champ `MediaSearch` de Popper (un média partagé par plusieurs tables, avec joker) et `MediaWildCard` (plusieurs fichiers tirés au hasard : un seul est gardé) ; les médias nommés autrement que le jeu dans la base de Popper ou de PinballX, quand ce nom ne ressemble ni au `.vpx`, ni au dossier, ni au titre, ni à un jeu VPS (ils sont listés « Sans table ») ; `Table Images Desktop` et `Table Videos Desktop` de PinballX (vues de bureau) ; `Wheelbar` et les thèmes de Popper ; les sous-dossiers d'un dossier de type autres que les prospectus de PinballX.

Démonstration sans opérateur, fenêtre jamais montrée (captures dans `tmp\captures\import-medias`) : `npm run build`, puis `npx electron docs/demo-import-medias.js`.

### Le médecin des médias

Le médecin ([doctor.ts](../packages/core/src/doctor.ts), fiche > « Diagnostiquer et réparer ») vérifie, sans rien lancer :

| Constat | Quand | Correction |
| --- | --- | --- |
| Format que le menu ne lit pas | `flv`, `f4v`, `avi`, `mov` (vérifié avec `canPlayType` dans Electron 44.5.1), `wmv`, `mpg`, `mpeg` (absents des formats de Chromium) ; ou format non prévu pour le type (`(Wheel)` en `jpg`, `(Loading)` en image…) | corbeille si une version lisible porte le même nom ; sinon, convertir (HandBrake) |
| Afficheur rangé sous le mauvais type | `(DMD)` en 16:9, ou `(FullDMD)` en 4:1 : le menu choisit DMD ou FullDMD d'après les proportions de l'écran du DMD (frontière 8:3) | renommer dans l'autre type, si le nom est libre |
| Média mal nommé | `(Type) nom` dont le nom n'est ni celui d'un `.vpx` du dossier ni celui du dossier (pages comprises : `Nom 2`, `Nom_02`) ; fichier sans `(Type)` ni nom de VPinFE | renommer `(Type) <dossier>` (la page suivante libre pour le prospectus et les règles), sauf si `medias\` montre déjà ce type |
| Média rangé hors de `medias\` | rangement de PinUP Popper (`POPMedia\…\Wheel\<jeu>.png`) ou de PinballX (`Media\Visual Pinball\Wheel Images\…`) dans le dossier de la table, ou `(Type) nom` posé à côté de la table ; les dossiers `pupvideos`, `pinmame`, `cache` et celui du DMD du script sont ignorés | ranger et renommer `medias\(Type) <dossier>.ext` ; l'arborescence vidée part à la corbeille |
| Proportions différentes de l'écran | écart de plus de 15 % (`MEDIA_RATIO_TOLERANCE`, mesuré en rapport) avec la zone du rôle dans le modèle de borne : plateau recadré (seul le rapport des côtés compte, le menu tourne le média ; un fichier presque carré ne dit pas où sont les flippers), bandes noires ou média en portrait sur un écran en paysage pour le fronton, le DMD et le topper, FullDMD montré réduit faute de DMD | — (information) |
| Média très lourd | image de plus de 25 Mo ou de plus de 7680 × 4320 pixels, vidéo de plus de 300 Mo, son de plus de 50 Mo (`MEDIA_SIZE_LIMITS`, `MEDIA_MAX_PIXELS`) | — (réencoder) |
| Médias en double | plusieurs fichiers d'un même type pour un même jeu (`.png` et `.webp`, nom du `.vpx` et nom du dossier, `(Wheel)` et `wheel.png` de VPinFE) : un seul est montré ; une version du dossier qui a son propre média n'est pas un doublon | corbeille des fichiers jamais montrés de même nature ; une image à côté d'une vidéo du même type est seulement signalée |
| Média que le menu n'a pas pu lire | erreur enregistrée par l'affichage dans le fichier des erreurs, pour un fichier inchangé depuis | corbeille pour un fichier abîmé ou refusé (décodage, format, image) ; seulement signalé pour une erreur de disque |

Chaque correction est sûre : renommer, déplacer dans `medias\`, ou mettre à la corbeille (`trash\`) ; rien n'est converti ni supprimé. « Tout réparer » enchaîne les corrections sans qu'elles visent deux fois le même fichier ; ce qui dépend d'un renommage (le type d'un afficheur mal nommé, par exemple) est vérifié à l'analyse suivante.

**Fichier des erreurs de lecture** : `<racine>\data\logs\medias-erreurs.json`, écrit par le processus principal ([mediaerrors.ts](../packages/core/src/mediaerrors.ts), `recordMediaError`) quand l'affichage lui transmet une erreur de `<video>`, `<audio>` ou `<img>`. Format, version 1 :

```json
{
  "version": 1,
  "errors": [
    {
      "file": "D:\\CyberPinball\\tables\\T2 (Williams 1991)\\medias\\(Backglass) T2 (Williams 1991).mp4",
      "type": "Backglass",
      "role": "backglass",
      "kind": "decode",
      "message": "PIPELINE_ERROR_DECODE",
      "size": 48211763,
      "mtimeMs": 1792500000000.123,
      "first": "2026-10-21T20:14:03.512Z",
      "last": "2026-10-21T20:31:40.007Z",
      "count": 3
    }
  ]
}
```

`kind` vient de `MediaError.code` (2 `network`, 3 `decode`, 4 `unsupported`, autre `other`) ou vaut `image` pour `<img>` ; une lecture interrompue (code 1, on a changé de table) n'est pas enregistrée. `type`, `role` et `message` (300 caractères au plus) sont facultatifs. Une entrée ne vaut que pour le fichier tel qu'il était (même taille, même date) : un fichier remplacé ou réencodé n'est plus signalé, et ses anciennes entrées disparaissent au prochain enregistrement. 200 entrées au plus, les plus récentes.

### Preuves sans opérateur

`.\docs\demo-medias.ps1` rejoue tout le jalon hors écran, sur le bureau Windows caché, avec le vrai menu : un bac à sable de trois tables aux médias générés (`docs\demo-medias.cjs`) : une complète (tous les types, deux pages de prospectus, une carte de règles, musique, son de lancement, vidéo de chargement), une partielle (logo, plateau en image, fronton tiré du `.directb2s`), une sans aucun média au titre très long, et un topper par défaut dans `<racine>\media`. Sur la borne type (`docs\ecrans\borne.json` : playfield 4K couché, joueur au bord gauche, fronton, DMD 4:1, topper), puis sur le poste à deux écrans (`poste-deux-ecrans.json` : playfield en paysage, fronton et DMD en bande sur l'autre écran), une même séquence capture chaque écran à chaque moment : navigation sur les trois tables, prospectus page par page, règles, leurs replis, « Médias du jeu » et ses pages, chargement (vidéo, puis écran de secours), partie simulée qui occupe le fronton (écrans libres animés, replis « en partie »), retour au menu, mode attente et sa sortie. Le script échoue si un écran est vide (image uniforme, `vides.txt`), si un texte chevauche un autre, sort de l'écran ou est coupé (`mise-en-page.txt`, garde-fou sur chaque écran), ou si un écran ne montre pas le média ou le repli attendu (couches relevées dans `son.txt`). Une planche par étape, tous les écrans côte à côte et le playfield redressé comme le joueur le voit, dans `tmp\captures\medias\<écrans>\planches`. `-Ecrans borne` n'en rejoue qu'un.

### Médias depuis VPinMediaDB : « Chercher les médias »

[VPinMediaDB](https://github.com/superhac/vpinmediadb) (dépôt `superhac/vpinmediadb` sur GitHub) range les médias d'environ 1 155 jeux, un dossier par identifiant VPS. Cyber Pinball les télécharge **à la demande seulement**, jamais d'office (conception : `docs/recherche/medias.md`, § 3.1, § 3.4 et § 5.5).

- **Avertissement** : VPinMediaDB ne déclare aucune licence (`license: null` dans l'API GitHub, ni fichier LICENSE ni conditions d'usage, vérifié le 21 octobre 2026). Ses médias appartiennent à leurs auteurs, et les images des jeux à leurs fabricants : **usage personnel, sur sa borne seulement**, sans les redistribuer. Cyber Pinball n'en livre aucun. L'avertissement s'affiche au premier usage (accepté une fois, date dans `<données>\mediadb.json`) et en tête de chaque plan. La source est citée dans le plan, sur la fiche du média (« Source : VPinMediaDB (github.com/superhac/vpinmediadb), téléchargé le … », puis l'adresse du fichier) et ici.
- **Deux entrées** :
  - fiche d'une table > « Médias du jeu » > « Chercher les médias » : tout ce que VPinMediaDB a pour ce jeu ;
  - menu système > « Médias manquants : chercher sur VPinMediaDB » : ce qui manque à chaque table, une table par dossier. D'ici, un média existant n'est jamais remplacé, et une table reconnue au titre seulement n'est pas servie d'office.
- **Correspondance** : par le `VPSId` du `.info`. Sinon, par le nom de la table (titre, initiales, fabricant, année) rapproché de la base VPS (section « Base VPS »), qui donne l'identifiant. Un identifiant connu mais absent de VPinMediaDB mène seulement aux autres éditions du même jeu (Pro, Premium, LE), à vérifier sur les aperçus. Quand rien n'est sûr, la recherche approfondie prend le relais (section suivante). « Pas le bon jeu ? » est toujours proposé : il montre les jeux possibles avec leurs raisons, et permet de chercher un autre titre au clavier.
- **Ce qui est repris** :

  | VPinMediaDB | Média | Remarque |
  | --- | --- | --- |
  | `wheel.png` | Logo `(Wheel)` | 500 × 500, transparent |
  | `1k/table.mp4`, sinon `table.png` en 1k ou 4k | Plateau `(Playfield)` | la vidéo d'abord ; en largeur, flippers à droite, et le menu le tourne |
  | `1k/bg.png` | Fronton `(Backglass)` | 1k seulement |
  | `1k/dmd.mp4`, sinon `1k/dmd.png` | Afficheur large `(FullDMD)` | 16:9 ; réduit sur un afficheur 4:1 |
  | `flyer.png` | Prospectus `(GameInfo)` | page 1 |
  | `audio.mp3` | Musique du jeu `(Audio)` | |

  Non repris : `cab.png` (photo du meuble), `fss.png` (plateau et fronton pour un seul écran), `realdmd*.png` (DMD physique, que Cyber Pinball ne gère pas). VPinMediaDB n'a jamais d'afficheur 4:1, de topper, de vidéo de chargement, de son de lancement ni de règles.
- **1k ou 4k** : seule l'image du plateau existe en 4k. Le réglage « Qualité téléchargée (VPinMediaDB) » se trouve dans menu système > « Médias, son et attente » :
  - automatique : 4k si la zone du plateau, dans la configuration active, dépasse 2 560 points de côté ;
  - ou 1k, ou 4k, imposé.

  Le plan dit ce qui a été choisi, et pourquoi.
- **Plan à valider** : une carte par média.
  - Chaque carte montre l'aperçu (l'image 1k du même média, reçue et vérifiée, qui sert ensuite au téléchargement), le poids (requête HEAD, gardé par MD5 dans `downloads\vpinmdb.sizes.json`), ce qui est remplacé et le nom sous lequel le média sera rangé.
  - Start sur une carte passe à la variante suivante : vidéo, image, ou rien.
  - Sont retenus d'office : les médias qui manquent, et la nouvelle version d'un fichier déjà venu de VPinMediaDB. Un média mis par l'utilisateur reste « Gardé » ; pour le remplacer, il faut le demander (« Remplace l'actuel », l'ancien part à la corbeille).
- **Téléchargement** : un fichier à la fois, reçu sous `downloads\vpinmediadb\<md5>.ext.part`. La taille et le MD5 de l'index sont vérifiés, puis le fichier est rangé sous `medias\(Type) <nom du dossier>.ext`, et l'ancien fichier part dans `trash\<date> Médias <dossier> (VPinMediaDB)`. Un téléchargement interrompu (coupure, 30 s sans données) ou invalide (MD5, taille, réponse HTTP) est effacé : il ne reste rien, et les autres médias continuent. Progression : « Plateau (2 sur 6) : 1,2 Mo sur 1,7 Mo… ».
- **Source dans le `.info`** : `CyberPinball.medias.sources.<Type>` reçoit `{ origin: "VPinMediaDB", url, date, vpsId, key, md5, file }`. Le demi-tour forcé d'un plateau remplacé est retiré : le nouveau fichier suit le standard, que le menu tourne de lui-même. Une recherche suivante dit « À jour », ou propose la nouvelle version si le MD5 de l'index a changé.
- **Index** : `vpinmdb.json` (1,7 Mo), téléchargé au premier usage depuis `https://raw.githubusercontent.com/superhac/vpinmediadb/main/vpinmdb.json` et gardé dans `<racine>\downloads`.
  - Il est revérifié au plus toutes les 12 heures, en arrière-plan ; GitHub répond 304 (ETag) s'il n'a pas changé.
  - Sans réseau, le cache sert, et une réponse invalide ne le remplace jamais.
  - Seules les adresses du dépôt `superhac/vpinmediadb` sont acceptées. L'entrée `bg_thumbs`, vide, est ignorée.
- **Volumes mesurés** (21 octobre 2026, requêtes HEAD) :

  | | 1k | 4k |
  | --- | --- | --- |
  | Terminator 2, tout par défaut (vidéos du plateau et de l'afficheur) | 14 Mo | 14 Mo |
  | Terminator 2, images seulement | 9,8 Mo | 20 Mo |
  | Image du plateau seule (Terminator 2) | 3,5 Mo | 13 Mo |
  | Moyenne de 12 jeux, tout par défaut | 11 Mo | 17 Mo |
  | Moyenne de 12 jeux, image du plateau | 3,2 Mo | 13 Mo |

  Le 4k ne change que l'image du plateau, environ quatre fois plus lourde. Par défaut, la vidéo du plateau (1k) passe avant elle, quand elle existe.
- **Code** : `packages/core/src/mediadb.ts`, tests dans `packages/core/src/test/mediadb.test.ts` (index et fichiers factices servis par un serveur local, aucun accès au réseau) ; écrans dans `app/src/media-download.ts`. Essai réel sans fenêtre : `npm run build`, puis `node docs/essai-vpinmediadb.mjs --types Wheel` (bac à sable `tmp\essai-vpinmediadb`). Démonstration : `.\docs\demo-vpinmediadb.ps1` (section « Tests de bout en bout sans opérateur »). Tests manuels : [docs/tests-manuels.md](tests-manuels.md), scénarios 160 à 168.

### Propositions de chaque média et recherche approfondie

Le choix automatique ne suffit pas toujours : le nom de la table a été changé, abrégé ou traduit (« GOTG_2.1.1.vpx », titre « Gardiens de la galaxie »), ou l'on préfère une autre version du fronton. Fiche d'une table > « Médias du jeu » > un média > **« Voir les propositions »** montre toutes les versions trouvées pour ce média, chacune avec son aperçu, d'où elle vient et pourquoi.

- **Ce qui est proposé**, dans cet ordre :
  - VPinMediaDB, pour **chaque jeu retenu** : le jeu reconnu, ses autres éditions (Pro, Premium, LE), et les jeux proches que l'on ajoute ; chaque variante (vidéo ou image, 1k ou 4k), un fichier partagé par deux éditions une seule fois ;
  - ce que la **table a déjà**, sans le savoir :
    - dans le **PuP-Pack** : le fichier que `screens.pup` donne à l'écran du fronton, du topper ou de l'afficheur ; ceux que `triggers.pup` pose au démarrage (`D0`) ou en attente (`E454`), et la musique de ses écrans `MusicOnly` (les fonds des modes de jeu sont des scènes de partie, écartés) ; les cadres de `PupImages` à la proportion d'un fronton (`-4x3`, `-5x4`, `-16x9`) ; les dossiers dont le nom parle (`BGDefault`, `Topper`, `DMDAttract`…), sauf pour un fichier dont `screens.pup` ou `triggers.pup` disent déjà l'écran ; les musiques (plus de 500 ko) ;
    - les animations du dossier FlexDMD ou UltraDMD que charge le script ;
    - dans **chaque `.directb2s` du dossier** : l'image allumée et l'afficheur, puis les mêmes **« tout allumés »**, toutes les ampoules visibles de `<Illumination>` posées dessus comme le serveur B2S les montre quand elles s'allument (un morceau d'image allumée se pose tel quel, une lueur prend la couleur de l'ampoule). La composition se fait une fois, sans dépendance (lecture et écriture des PNG dans `packages/core/src/png.ts`), et est gardée dans `<données>\cache\medias` (`b2sLitImages`, `packages/core/src/b2simage.ts`) ; sur Terminator 2 (8 flashers, image de 2 517 × 2 397), environ 4 s la première fois. Un second `.directb2s` est un autre fronton possible, proposé avec son nom (« que VPX ne charge pas ») ; une copie du même fichier sous un autre nom, fréquente (le nom du site à côté du nom de la table), n'est lue ni montrée qu'une fois ;
    - dans le **`.vpx`** : la capture que l'auteur y a rangée ; l'image du plateau à plat (champ `IMAG`, sauf les atlas du Visual Light Mapper) ; la carte de règles que désigne le Markdown des règles (`![…](nom)`), sinon une image au nom de carte ; le fronton et le logo de la pièce VR. Seul le début de chaque image est lu pour son nom ; les images retenues sont écrites une fois dans `<données>\cache\medias` (`vpx-<clé>-…`), relues si le `.vpx` change ;
  - les **sites communautaires**, avec le compte de l'utilisateur : **VPForums**, puis **VPUniverse** en dernier recours (voir « Médias des sites communautaires » ci-dessous) ;
  - les **vignettes de la base VPS** : le plateau de chaque version de la table et le fronton de chaque `.directb2s` (de 352 × 626 à 1 000 × 750, « basse définition »), souvent la seule image d'un jeu absent de VPinMediaDB : 2 608 jeux en ont une du plateau, 1 746 du fronton ;
  - les **musiques de la base VPS** (`soundFiles`) : liens de partage Dropbox vers un mp3 ou un ogg, téléchargés seulement quand on choisit la carte, un par un. Le fichier reçu est contrôlé à sa signature (`isAudioFile`) : un lien mort renvoie une page HTML, la carte dit alors « Lien mort ».
- **Choisir** : Start sur une proposition la met dans le brouillon, comme un fichier du dossier d'import (une nouvelle page pour le prospectus et les règles). Un fichier en ligne est téléchargé et vérifié (MD5 de VPinMediaDB) au moment du choix ; un fichier de la table est copié, l'original reste en place. La carte dit « Actuel » ou « Choisi, à enregistrer ». Rien n'est écrit avant « Enregistrer », qui montre le plan ; la provenance d'un fichier téléchargé (VPinMediaDB ou Base VPS, adresse, date, identifiant VPS) va dans le `.info`, et disparaît si le média est ensuite remplacé à la main. Une musique proposée s'écoute dès que sa carte est choisie.
- **« Autres jeux… »** : les jeux possibles, le plus probable d'abord, avec leur logo (ou une vignette), ce qu'ils ont en ligne et leurs raisons ; Start ajoute ou retire un jeu des propositions. Sont retenus d'office le premier jeu, ses autres éditions et ceux presque aussi probables (quatre au plus).
- **« Chercher un autre titre… »** : saisie au clavier de l'écran (ou au vrai clavier) d'un titre en anglais (« lord of the rings »), d'initiales (« TMNT ») ou d'un nom de ROM (« t2_l8 ») ; le premier jeu trouvé s'ajoute aux propositions.
- **Recherche approfondie** : tous les indices que la table donne d'elle-même, confrontés un par un à la base VPS, chaque piste gardant ses raisons en clair :
  - le **nom écrit dans la table** par son auteur (Fichier > Informations de la table dans l'éditeur de VPX : stockage `TableInfo` du `.vpx`, lu sans charger la table) : « GOTG_2.1.1.vpx » s'y appelle « Guardians Of The Galaxy » ; son **auteur et sa version** désignent la recréation exacte chez VPS ; un **numéro IPDB** cité dans sa description désigne le jeu ;
  - le titre de la fiche, le nom du `.vpx`, du dossier et du `.directb2s` ;
  - la **ROM**, le **PuP-Pack** et le **dossier du DMD** lus dans le script (le script est lu par VPX s'il ne l'a jamais été) ;
  - les **initiales** (« GOTG », « TMNT », « TAF », « T2 ») et les **mots approchés**, pour un titre traduit (« gardiens », « galaxie ») ;
  - plusieurs indices indépendants qui désignent le même jeu le font monter ; les noms de fichiers, qui se recopient l'un l'autre, comptent pour un.

  Le plan automatique (« Chercher les médias ») et les « médias manquants » du menu système s'en servent quand le nom ne suffit pas : une table reconnue ainsi est montrée à vérifier, jamais servie d'office.
- **Code** : `packages/core/src/vps.ts` (initiales, mots approchés, autres éditions, recherche libre), `vpxinfo.ts` (lecture du `.vpx`), `mediasearch.ts` (indices et pistes), `mediachoices.ts` (propositions), `mediaedit.ts` (provenance à l'enregistrement), tests dans `packages/core/src/test/mediasearch.test.ts` et `b2slit.test.ts` ; écrans dans `app/src/media-proposals.ts` et `app/src/media-search.ts`. Démonstration hors écran, avec le vrai VPinMediaDB : `.\docs\demo-propositions.ps1` (captures dans `tmp\demo-propositions\captures`). Tests manuels : [docs/tests-manuels.md](tests-manuels.md), scénarios 182 à 187 et 206 à 211.

### Médias des sites communautaires

PinUP Popper n'est pas sur la borne : Cyber Pinball le remplace. Son serveur de médias n'est accessible que depuis Popper Setup, mais les mêmes auteurs publient sur les forums, avec un compte gratuit. Les propositions de chaque média y cherchent, dans la session de la fenêtre « Récupérer » (où l'on se connecte soi-même ; Cyber Pinball ne voit aucun mot de passe). Relevé du 24/10/2026 : `docs/recherche/sources-medias.md` § 6.

- **VPForums d'abord** : 808 packs de médias complets, 4 153 logos, 1 829 vidéos. Sa recherche est réservée aux membres : sans connexion, une ligne le dit et « Se connecter à VPForums… » ouvre sa page de connexion.
- **VPUniverse en dernier recours** : environ 24 000 médias de menu (logos, vidéos du plateau, du fronton, du DMD et du topper, chargements, cartes, sons de lancement, prospectus), mais **environ 45 s d'attente avant chaque fichier** avec un compte gratuit, et un nombre de téléchargements limité. Ses résultats se voient sans compte ; le téléchargement le demande.
- **Recherche** : quand on ouvre les propositions, une page de résultats par site et par titre (le titre de chaque jeu retenu sans son sous-titre, « terminator 2 », ou la saisie de « Chercher un autre titre… »), lue dans une vue cachée et limitée aux catégories des médias de menu (`SITE_CATEGORIES`). Les résultats se gardent une demi-heure ; rien n'est cherché en tâche de fond. Chaque résultat garde son titre, sa catégorie, son auteur, sa date, son nombre de téléchargements et la vignette déposée par l'auteur (image fixe, même pour une vidéo).
- **Rapprochement** : le titre de chaque résultat, débarrassé des mots du média (« Topper Video », « Animated Wheel »…), est confronté à toute la base VPS ; il ne compte que s'il désigne un jeu retenu (un résultat « Terminator 3 » ne passe pas pour Terminator 2). Le type de média vient de la catégorie (« Topper Videos » : topper) ; pour les vidéos mêlées de VPForums, du titre ; un pack complet vaut pour tous les médias.
- **File** : Start sur une carte la met dans la file de son site, un fichier à la fois par site, chaque site de son côté. Le téléchargement se fait dans une vue cachée, comme le téléchargement direct de « Récupérer » ; le **minuteur de VPUniverse se déroule dans la page**, comme pour un membre qui clique : la page demande l'attente au serveur, décompte, puis lance le fichier, et la carte montre les secondes restantes (« Attente du site · 31 s »). Cyber Pinball attend, ne raccourcit rien. Start sur une carte en file l'en retire ; « Arrêter la file » arrête tout. Un plafond de téléchargements arrête la file de ce site ; une page qui demande quelque chose (plusieurs fichiers au choix, conditions, vérification) s'ouvre dans la fenêtre visible, et le fichier qu'on y télécharge revient au média.
- **Réception** : le fichier est rangé dans `<téléchargements>\sites\<site>-<fiche>\fichiers`, l'archive déballée ; un pack rangé à la manière de Popper ou de PinballX dit le type de chaque fichier par son dossier. Les fichiers reçus sont notés dans `<téléchargements>\sites\recus.json` et proposés aux visites suivantes, pour ce média comme pour les autres écrans d'un pack (« Reçu de VPForums »). Le fichier attendu par la dernière carte choisie pour un média passe de lui-même dans le brouillon ; un autre choix fait entre-temps n'est jamais remplacé. Rien n'est écrit dans `medias\` avant « Enregistrer » ; la provenance (site, adresse de la fiche) va dans le `.info`.
- **Code** : `packages/core/src/mediasites.ts` (catégories, adresses, scripts des pages de résultats, rapprochement, fichiers reçus), `sitesessions.ts` (minuteur, `WAIT_PROBES`), `app/src/media-sites.ts` (recherche, vignettes, file, reçus), `app/src/acquire-window.ts` (vue cachée, destinataire d'un téléchargement), `app/src/media-proposals.ts` (cartes) ; tests dans `packages/core/src/test/mediasites.test.ts`. Démonstration hors écran : `.\docs\demo-medias-sites.ps1` (une page de résultats de chaque vrai site, en visiteur, puis de fausses fiches pour la connexion, la file, le minuteur et le pack ; captures dans `tmp\demo-medias-sites\captures`). Tests manuels : [docs/tests-manuels.md](tests-manuels.md), scénarios 241 à 246.

## Lancement d'une partie

`app/src/launcher.ts` lance la table comme un frontend : `VPinballX_BGFX64.exe -Ini <VPinballX.ini> -Play <table.vpx>`, puis surveille les fenêtres du processus toutes les 250 ms jusqu'à sa fin. La partie commence quand la fenêtre « Visual Pinball Player » apparaît (elle reprend le premier plan si besoin) ; fermer cette fenêtre termine VPX proprement (code 0). Ctrl+Maj+K arrête une partie bloquée (fermeture polie, puis forcée après 5 s).

**Aucun écran ne montre le bureau Windows.** Les fenêtres du menu ne sont plus masquées pendant une partie : elles restent derrière celles de VPX, sans lui prendre le focus. Le playfield garde l'écran de chargement (vidéo de chargement du jeu, ou écran de secours, et les commandes) jusqu'à l'apparition de la fenêtre de jeu, puis chaque écran passe à son **fond de partie** : le média du jeu, figé par défaut, visible seulement sur un écran que VPX n'occupe pas (topper sans fenêtre, backglass sans `.directb2s`, DMD absent) ; voir « Chargement et partie ». Chaque fenêtre reçoit pour cela un état `game` (table, médias, lecture de chaque rôle), rendu par `renderGame` (`app/renderer/frontend.js`). Au retour, le menu reprend le premier plan comme avant.

Une seule règle couvre tous les moments, le **gardien des écrans** (`app/src/screen-guard.ts`, démarré par `main.ts` avant toute autre fenêtre, sauf l'écran d'attente d'un autre menu ouvert) :

- **un voile noir par écran**, présent du démarrage à la fermeture, qui suit l'ajout, le retrait et la rotation des écrans ; il ne prend jamais le focus (`focusable: false`) et n'apparaît qu'une fois peint : montrée avant sa première image, une fenêtre reste blanche près d'une seconde. Il couvre les écrans sans fenêtre de Cyber Pinball : écran sans rôle, écrans autres que le principal avec `--reglages` ;
- **relance sans trou** (`relaunchCovered`, seule façon de relancer l'application : menu → assistant, assistant → menu, réglages → assistant) : le nouveau processus ouvre ses voiles et ses fenêtres par-dessus celles de l'ancien, qui ne se ferme qu'ensuite (au plus 15 s d'attente) ;
- **barres des tâches masquées pendant une partie** : quand VPX prend le premier plan, avant que sa fenêtre de jeu soit en plein écran, Windows remet un instant la barre des tâches devant les écrans qu'il n'occupe pas (vu sur l'écran du DMD). Elles reviennent à la fin de la partie, à la fermeture de l'application, et au démarrage suivant si l'application s'est arrêtée en pleine partie (témoin `barres-des-taches-masquees` dans le dossier des données) : seulement celles que Cyber Pinball a masquées, une barre déjà masquée par un autre menu le reste ;
- **constat dans la console** : deux fois par seconde, la pile des fenêtres de Windows est relue (`screenCover`, `packages/core/src/screencover.ts`) ; un écran qui reste plus d'une seconde sans fenêtre de Cyber Pinball qui le couvre, ou sous une barre des tâches, donne « Écran « Topper » : aucune fenêtre de Cyber Pinball ne le couvre, le bureau Windows se voit. », puis « de nouveau couvert ». Le test d'endurance compte ces constats par lancement (« écrans découverts »). « Bureau Windows » du menu système suspend la règle jusqu'au retour.

Des tests fixent la règle : aucune fenêtre n'est masquée par `hide()`, l'application ne se relance que par `relaunchCovered`, le gardien démarre avant les autres fenêtres (`packages/core/src/test/screencover.test.ts`).

**Aucune fenêtre d'éditeur ni d'audit.** En `-Play`, VPX 10.8.1 ne crée pas son éditeur (`PlayTableCommand`, `src/core/AppCommands.cpp`) : pas d'audit de la table (la boîte « Table audit » n'existe que dans l'éditeur, à l'ouverture d'une table en erreur), pas d'éditeur de script (une erreur de script va au journal et en notification dans la partie), pas de fenêtre de progression, de débogueur ni de choix de table. Vérifié sur le PC de développement avec trois tables, dont Terminator 2 1.25, dont l'audit signale 18 erreurs : seules les fenêtres « Visual Pinball Player », « Visual Pinball Backglass » et « Visual Pinball Score View » (classe `SDL_app`) s'affichent ; « Visual Pinball Topper » est créée cachée quand le topper n'est pas affecté ; rien de plus à la sortie.

Deux réglages de VPinballX.ini font encore poser une question à VPX en plein chargement ; Cyber Pinball les gère (écrits à chaque synchronisation, modification à la main repérée et jamais écrasée en silence, comme les autres clés gérées) :

| Réglage | Valeur écrite | Sinon |
| --- | --- | --- |
| `[Player] SecurityLevel` | `0` : tous les objets ActiveX du script autorisés (défaut de VPX) | de 1 à 3, « This table is attempting to create an object of type … » (Oui / Non) pour chaque objet, même `Scripting.Dictionary` ; à 4, tous refusés et le script s'arrête |
| `[PlayerVR] AskToTurnOn` | `2` : VR éteinte (défaut de VPX) | à 0, « Connection to VR headset failed / Retry connection ? » (Oui / Non) ou « VR mode activated but OpenXR initialization failed. » ; la version Windows de VPX inclut OpenXR |

Chaque autre fenêtre visible de VPX est classée (`classifyVpxWindow`, `packages/core/src/vpxwindows.ts`) :

- **boîte de dialogue** (`#32770`) : la partie s'arrête et son texte devient le message à l'écran, sans les boutons. L'invite ActiveX et celle du casque VR sont reconnues : le message nomme le réglage à remettre. Le texte est lu par `WM_GETTEXT` (`windowTexts`) : c'est le seul moyen de lire une zone d'édition d'un autre processus, où VPX met le rapport d'audit et les erreurs de script ;
- **fenêtre de l'éditeur**, si une autre version de VPX en ouvrait une : l'éditeur (classe `VPinball`), l'éditeur de script (`CVFrame`), « Preparing Table » et le débogueur sont masqués (les fermer quitterait VPX ou poserait une question), l'audit de la table (boîte « Dialog » dont le texte commence par « Table audit: » ou « This table contains error(s) ») est fermé ; la partie continue, le jeu reprend le premier plan ;
- **fenêtre inconnue** : laissée à l'écran.

Les deux derniers cas laissent un constat d'une phrase (`LaunchResult.notices`) : écrit dans la console à la fin de la partie, ajouté au message d'une partie échouée et au bilan du test d'endurance (« autres fenêtres de VPX »).

`node scripts/sonde-fenetres.mjs --exe … --ini … --table …` (après `npm run build`) relève toutes les fenêtres d'une partie, cachées comprises, avec ce qu'en ferait le lanceur ; `--commande Edit` ouvre la table dans l'éditeur pour vérifier la reconnaissance de l'éditeur et de l'audit sur de vraies fenêtres. Toujours sur des copies de la table et de VPinballX.ini.

## Cohabitation avec un autre menu de borne

Cyber Pinball s'installe sur une borne qui a déjà PinUP Popper, PinballX ou PinballY sans rien changer à leur installation. Code : [packages/core/src/coexistence.ts](../packages/core/src/coexistence.ts) (menus connus, barres des tâches, liste des réglages de Windows modifiés) et [app/src/frontend-gate.ts](../app/src/frontend-gate.ts) (écran d'attente) ; l'invariant est fixé par [coexistence.test.ts](../packages/core/src/test/coexistence.test.ts).

**Ce qui reste séparé.**

- Tout vit dans la racine de Cyber Pinball : sa propre copie de VPX (`emulators\vpx\`), ses tables, ses ROM, ses médias.
- VPX est lancé avec `-Ini <racine>\config\VPinballX.ini` : le `VPinballX.ini` de l'autre menu n'est ni lu ni écrit. Seul le journal `%APPDATA%\VPinballX\10.8\vpinball.log` est commun si l'autre menu utilise aussi VPX 10.8 : chaque partie le réécrit.
- Mode plugins de VPX : aucun composant n'est enregistré dans Windows (VPinMAME, B2S et PinUP Player restent ceux de l'autre menu) ; `B2STableSettings.xml`, `DmdDevice.ini`, la configuration de DOF et `PUPDatabase.db` ne sont pas touchés.
- Les fichiers de l'autre menu ne sont jamais déplacés : « Reprendre les médias de PinUP Popper / PinballX » les copie, une table choisie hors de `import\` est copiée.
- ROM et NVRAM sont rangées à part : records et réglages des jeux ne sont pas partagés.

**Ce qui est commun : quelques réglages de Windows.** Leur liste complète est `WINDOWS_CHANGES`. Le test refuse un appel déclaré ailleurs que dans son fichier, et tout appel qui modifierait autre chose (`FORBIDDEN_WINDOWS_CALLS` : registre hors de l'installeur, sortie audio par défaut, lancement à l'ouverture de session par l'application, paramètres système, processus arrêtés par leur nom).

| Réglage | Quand | Ce que Cyber Pinball fait pour l'autre menu |
| --- | --- | --- |
| Orientation de l'écran du playfield | assistant, étape « Où sont les flippers ? », seulement si VPX ne sait pas mettre les flippers du côté du joueur | Autre menu installé ou ouvert : le premier Start avertit (« Retourner l'écran dans Windows ? » : son menu et ses tables seraient aussi à l'envers). Start retourne quand même, puis demande confirmation en 15 s comme d'habitude ; Exit garde l'orientation de Windows, tables à l'envers dans Cyber Pinball. |
| Barres des tâches | pendant une partie | Seules celles que Cyber Pinball a masquées reviennent (`taskbarsToRestore`) : une barre déjà masquée par l'autre menu le reste. Le témoin `barres-des-taches-masquees` garde le HWND de chacune. |
| Raccourci Ctrl+Maj+K | pendant une partie | Rendu à la fin de la partie. |
| Lancement à l'ouverture de session | option de l'installeur, décochée par défaut | À laisser décochée si l'autre menu démarre avec Windows : les deux se disputeraient les écrans. |
| Entrée de « Programmes et fonctionnalités » | installation (`HKCU`) | Retirée à la désinstallation. |

**Autre menu déjà ouvert.** Les deux menus se disputeraient les écrans, l'afficheur DMD et les boutons de la borne. Au démarrage, avant de couvrir le moindre écran (`otherFrontendsGate`, appelé par `main.ts` avant le gardien des écrans), Cyber Pinball cherche les processus des menus connus (`OTHER_FRONTENDS` : `PinUpMenu.exe` et `PinUpDisplay.exe` pour PinUP Popper, `PinballX.exe`, `PinballY.exe` ; `PinUpPlayer.exe`, le lecteur des PuP-Packs, n'en fait pas partie). S'il en trouve un, l'écran principal seul affiche « PinUP Popper est ouvert » : Cyber Pinball démarre tout seul dès qu'il est fermé (vérifié chaque seconde) ; Start ou « Continuer quand même » démarre tout de suite ; Exit ou « Quitter Cyber Pinball » quitte. Rien n'est fermé ni modifié chez l'autre menu. Avant chaque partie, le menu vérifie de nouveau : un menu ouvert depuis donne « PinUP Popper est ouvert » (Start : jouer quand même · Exit : revenir au menu). Un menu accepté une fois n'est plus signalé jusqu'à la fermeture de Cyber Pinball, relances menu ↔ assistant comprises (`CYBERPINBALL_AUTRES_MENUS_ACCEPTES`, transmis au nouveau processus).

**Menus installés** (`installedFrontends`, pour l'avertissement de l'orientation) : l'exécutable, ou le dossier `POPMedia` ou `Media`, aux emplacements par défaut (`vPinball\PinUPSystem`, `PinUPSystem`, `PinballX`, `PinballY`…, sur C:, D: et E:).

**Essai sans opérateur** : `.\docs\demo-autre-menu.ps1` (hors écran) déroule l'écran d'attente puis le démarrage du menu à la « fermeture » de Popper, le message avant une partie puis la partie simulée, et l'avertissement de l'assistant (orientation gardée, puis retournement simulé). Hors écran, seuls les menus simulés comptent : `CYBERPINBALL_AUTRES_MENUS` (ouverts, noms d'exécutables séparés par des virgules ; avec `CYBERPINBALL_AUTRES_MENUS_FICHIER`, fermés quand ce fichier disparaît) et `CYBERPINBALL_AUTRES_MENUS_INSTALLES` (installés). Sur une vraie borne équipée de PinUP Popper : tests manuels 231 à 235.

## Tests de bout en bout sans opérateur

**Règle, pour tout essai et toute session de développement : hors écran par défaut.** Un essai sans opérateur ne doit jamais ouvrir de fenêtre sur les écrans du poste, lui prendre le focus ni dépendre des écrans branchés : le poste sert à travailler pendant que les essais tournent, en arrière-plan.

- **Hors écran** (`app/src/offscreen.ts`, règles dans `packages/core/src/offscreen.ts`) : automatique dès que `CYBERPINBALL_AUTOPILOT`, `CYBERPINBALL_CAPTURE` ou `CYBERPINBALL_STRESS` est défini, ou imposé par `CYBERPINBALL_HORS_ECRAN=1`. Toutes les fenêtres naissent par `createWindow` et sont rendues en mémoire (rendu hors écran d'Electron, `webPreferences.offscreen`) à la taille de leur écran, au facteur d'échelle 1 : jamais montrées, jamais au premier plan, absentes de la barre des tâches, son coupé. `coverDisplay` ne fait que les dimensionner (pivotement simulé compris) ; `show`, `focus`, plein écran, réduction et reprise du premier plan sont sans effet. Le rendu est celui d'une vraie fenêtre : captures (`capturePage`), garde-fou de mise en page, touches rejouées et clics (`click:<sélecteur>`, `sendInputEvent`) fonctionnent de la même façon.
- **Écrans simulés** : `CYBERPINBALL_DISPLAYS=<fichier.json>` remplace la détection des écrans partout (assistant, menu, réglages, `sync`, remise des boutons : `observedDisplays`, `app/src/displays.ts`), même forme que `npm run probe -- --json` (champ `displays`), EDID compris ; un fichier mal formé est refusé avec l'écran et le champ fautifs. Jeux versionnés dans `docs\ecrans\` : `pc-dev` (les quatre écrans du PC de développement, ceux du modèle de borne de `D:\CyberPinball`), `borne` (playfield 4K couché, fronton 1080p, DMD 4:1, topper), `poste-deux-ecrans` (le poste actuel : principal et deux écrans), `un-ecran`. Avec des écrans simulés, l'orientation n'est jamais appliquée à un vrai écran.
- **Guet** : pendant un essai hors écran, toute fenêtre de l'application visible ou au premier plan (`isVisible`, `isFocused`, fenêtres natives du processus, boîtes de dialogue comprises) est signalée dans la console (« Hors écran : … ») et dans `<captures>\hors-ecran.txt` (« Aucune fenêtre visible ni au premier plan » sinon). Les scripts de démonstration échouent si une fenêtre est apparue ; `npm test` rejoue l'assistant hors écran sur la borne simulée et le vérifie.
- **Bureau caché, obligatoire pour les démonstrations** (`docs\hors-ecran.ps1`) : chaque `docs\demo-*.ps1`, `docs\demos-hors-ecran.ps1` et les actions de démonstration du lanceur se relancent tout entiers (PowerShell, node, Electron, outils) sur un bureau Windows à part, `CyberPinballEssais` (`Enter-BureauCache`, `CreateDesktop` puis `CreateProcess` avec ce bureau), que l'utilisateur ne voit jamais ; leur sortie revient dans la console d'origine. Même si une fenêtre se montrait par erreur, rien n'apparaîtrait sur les écrans du poste. L'application applique la même règle à tout essai sans opérateur, quel que soit son lanceur (`npx electron app` à la main, autre script, autre session) : hors écran et hors du bureau caché, elle s'y relance avec les mêmes arguments (`relaunchOnHiddenDesktop`, `app/src/offscreen.ts` ; `packages/win-displays/src/desktop.ts`), recopie sa sortie et rend son code de sortie ; `npm test` le vérifie. **Seule faille connue : une nouvelle console.** Windows 11 la confie au Terminal, qui s'ouvre sur le bureau de l'utilisateur et prend le focus, même depuis le bureau caché : les scripts lancent leurs outils dans leur propre console (`Start-Process … -NoNewWindow`, jamais `start`), l'application les lance avec `windowsHide` (tests d'invariant dans `offscreen.test.ts`). `.\docs\preuve-bureau-cache.ps1 -Etape notepad|console|electron` le vérifie : il lance un bloc-notes, des consoles héritées ou une fenêtre Electron plein écran sur le bureau caché, constate qu'elles y sont visibles, et échoue si quoi que ce soit apparaît ou prend le premier plan sur le bureau de l'utilisateur.
- **Réservé aux écrans du poste** : une partie de VPX (« Jouer », « Régler l'affichage en partie »), l'endurance et les captures du bureau entier sont refusées hors écran avec le message « … nécessite les écrans du poste », et ne se lancent qu'avec `CYBERPINBALL_A_L_ECRAN=1` (fenêtres réelles, plein écran, focus pris) : `docs\demo-barre-taches.ps1`, `docs\demo-fenetres.ps1`, l'action « Endurance » du lanceur. La boîte de dialogue « Choisir des fichiers » est aussi refusée hors écran. Lire le script d'une table (`VPinballX -ExtractVBS`) reste permis : VPX n'ouvre alors aucune fenêtre visible.
- **Démonstrations** : chaque `docs\demo-*.ps1` charge `docs\hors-ecran.ps1` et tourne hors écran sur `docs\ecrans\pc-dev.json` (`-Ecrans borne`, par exemple, pour une autre borne). `.\docs\demos-hors-ecran.ps1` (action « demos » du lanceur) les rejoue toutes à la suite, sortie de chacune dans `tmp\demos\`, et échoue si l'une échoue. Un essai à la main :

  ```powershell
  $env:CYBERPINBALL_DISPLAYS = "$PWD\docs\ecrans\borne.json"
  $env:CYBERPINBALL_HOME = "$PWD\tmp\essai\home"; $env:CYBERPINBALL_CAPTURE = "$PWD\tmp\essai\captures"
  $env:CYBERPINBALL_AUTOPILOT = 'SansBoutons,Digit1'
  npx electron app --assistant
  ```

**Garde-fou de mise en page** (`app/src/layout-check.ts`) : à chaque touche rejouée par l'autopilote (assistant, menu des tables, réglages de VPX), chaque fenêtre est inspectée dans son rendu réel. Sont signalés deux textes ou commandes qui se chevauchent (un calque au fond opaque qui en cache un autre, comme l'aide par-dessus le menu, n'en est pas un), ce qui sort de la fenêtre, et un texte coupé par un conteneur qui masque ce qui dépasse, lui-même compris. Une coupure voulue (« … », lignes limitées par `-webkit-line-clamp`) n'excuse que l'élément qui la fait : les lignes gardées ne doivent être rognées par aucun autre conteneur (un titre limité à deux lignes dans une zone haute d'une seule perdait sa première ligne sans être signalé). Un test vérifie que les scripts injectés se compilent (`packages/core/src/test/layout-check.test.ts`) : une erreur de syntaxe y rendait le garde-fou muet. La hauteur retenue pour un texte est celle de sa police, dans le bon sens pour une vue pivotée. Les problèmes vont dans la console (« Mise en page : … ») et dans `<captures>\mise-en-page.txt` (« Aucun problème de mise en page. » sinon) ; `docs\demo-boutons.ps1` échoue s'il y en a. `.\docs\demo-mise-en-page.ps1` rejoue tous les états de l'assistant sur tous les écrans de la borne simulée (1920 × 1080 et 1366 × 768 avec `pc-dev`) : étape « Boutons » en paysage et sur un playfield pivoté à gauche et à droite, écrans, orientation et retournement, diagonale, son avec deux sorties fictives (dont une 7.1), récapitulatif et enregistrement ; il échoue au premier problème relevé.

L'écran de l'assistant est construit en flux (`app/renderer/screen.*`) : en-tête, contenu centré dans la place qui reste, pied (message, étape, aide) et bande des flippers, sans position absolue ; un contenu trop haut repousse le pied au lieu de passer dessous. Le panneau des récapitulatifs, qui ne défile pas, réduit son corps d'un ou deux crans tant qu'il déborde. La liste des boutons passe sur deux colonnes quand l'écran est plus haut que large.

**Garde-fou du bac à sable** (`packages/core/src/sandbox.ts`, `app/src/sandbox-guard.ts`) : dès que `CYBERPINBALL_HOME` est défini avec `CYBERPINBALL_AUTOPILOT`, `CYBERPINBALL_CAPTURE` ou `CYBERPINBALL_STRESS`, l'application et `sync` refusent toute écriture de fichier hors de `CYBERPINBALL_HOME`, de `CYBERPINBALL_ROOT`, du dossier `tmp\` du projet et du dossier temporaire de Windows ; le chemin fautif est écrit dans la console et l'opération échoue. Il est né de deux incidents du 20 octobre 2026 où un essai a touché la vraie racine (un chemin d'ini recopié d'un vrai modèle de borne, un paramètre d'installeur ignoré). Un essai volontaire sur la vraie racine se fait sans `CYBERPINBALL_HOME`.

- **Assistant** : `CYBERPINBALL_AUTOPILOT` rejoue une suite de touches, `CYBERPINBALL_CAPTURE` enregistre une capture de chaque écran après chaque touche. Le pseudo-code `SansBoutons` fait comme si personne n'avait touché à rien pendant l'étape « Boutons » (touches actuelles gardées, sans attendre 20 s). Chaque touche est enfoncée puis relâchée (le relevé des boutons compte au relâchement) ; `Maintenir3:KeyA` la tient 3 s, `CtrlQ` fait Ctrl+Q.

  ```bash
  CYBERPINBALL_HOME=tmp/home CYBERPINBALL_AUTOPILOT=SansBoutons,ShiftLeft,Digit1,Digit1,Digit1,Digit1,ShiftRight,Digit1,Escape,Digit1 CYBERPINBALL_CAPTURE=tmp/captures npx electron app --assistant
  ```

  Sans opérateur, l'orientation des écrans est simulée (la géométrie change en mémoire, aucun écran ne tourne). Le pseudo-code `Attendre16` laisse passer 16 secondes sans touche, pour voir le compte à rebours expirer. Proposition, annulation, expiration puis confirmation du retournement :

  ```bash
  CYBERPINBALL_HOME=tmp/flip/home CYBERPINBALL_AUTOPILOT=SansBoutons,Digit1,ShiftRight,Digit1,Escape,Digit1,Escape,ShiftRight,Digit1,Attendre16,ShiftLeft,Digit1,Digit1,Digit1,Escape,Escape,Escape,Digit1 CYBERPINBALL_CAPTURE=tmp/flip/captures npx electron app --assistant
  ```

  L'étape « Son » joue vraiment ses bips (brefs : chaque touche arrive 400 ms après la précédente) et écrit dans la console le compte rendu de chaque son (sortie trouvée, canaux ouverts). `CYBERPINBALL_AUDIO_OUTPUTS=<fichier.json>` remplace les sorties détectées par une liste au format du champ `audio` de `npm run probe -- --json`, par exemple pour ajouter une carte 7.1 fictive et capturer le test des haut-parleurs (Electron ne la trouve pas : aucun son, message à l'écran). Avec quatre écrans, un HDMI fictif du fronton et une carte 7.1 fictive :

  ```bash
  CYBERPINBALL_AUDIO_OUTPUTS=tmp/son/sorties-simulees.json CYBERPINBALL_HOME=tmp/son/home CYBERPINBALL_AUTOPILOT=SansBoutons,ShiftRight,ShiftRight,ShiftRight,Digit1,Digit1,Digit1,Digit1,Escape,Escape,ShiftLeft,ShiftRight,Escape,Escape,Digit1,ShiftLeft,ShiftRight,Digit1 CYBERPINBALL_CAPTURE=tmp/son/captures npx electron app --assistant
  ```

- **Sorties et étapes seules** : `.\docs\demo-sorties.ps1` fabrique un modèle de borne par l'assistant complet (écrans simulés, sorties audio fictives) dans `tmp\demo-sorties`, puis quitte chaque mode de l'assistant sans enregistrer, chacun par un geste différent (touche maintenue 3 s pendant le relevé au premier démarrage, Ctrl+Q, Échap ou Exit maintenu 2 s, bouton à la souris, Exit à la première question ; « Placer librement… » au DMD dans `sortie-ecrans`), et vérifie que `cabinet.json`, `VPinballX.ini` et `vpx-owned.json` n'ont pas changé et que la question annonçait ce qui serait perdu ; enfin il enregistre chaque étape seule (écrans, playfield, son, disposition) et vérifie qu'aucune clé ni aucun champ hors de l'étape n'a changé. `-Scenarios sortie-son,etape-son` n'en rejoue que certains. Captures dans `tmp\captures\sorties`.
- **Boutons de la borne** : `.\docs\demo-boutons.ps1 -Run` copie le modèle de borne et le `VPinballX.ini` réels dans un bac à sable (`tmp\demo-boutons`), puis rejoue l'étape « Boutons » seule avec un encodeur réglé sur d'autres touches (doublon et touche Windows refusés, Exit refait par Retour arrière, validation refusée sans essai, Crédit refait par un clic sur sa ligne, essai puis enregistrement) et affiche le `[Input]` obtenu ; l'assistant complet sans réponse pendant 21 s (touches par défaut gardées) ; l'assistant complet avec « Touches par défaut » et « Recommencer » cliqués, puis piloté avec les nouvelles touches ; l'aide-mémoire du menu, puis la remise aux touches par défaut depuis le menu système à la souris. Pseudo-code de l'autopilote de l'assistant : `click:<sélecteur>` clique dans la fenêtre du premier écran. Captures dans `tmp\captures\boutons`.

- **Endurance du lanceur** (critère du jalon 2, **nécessite les écrans du poste** : `CYBERPINBALL_A_L_ECRAN=1`, posé par l'action du lanceur) : `CYBERPINBALL_STRESS="N,S"` lance N fois la table choisie par `CYBERPINBALL_TABLE`, arrête chaque partie après S secondes et vérifie que le menu reprend le premier plan. Le bilan s'affiche et part dans `data\logs\stress-*.json` ; ces parties ne comptent pas dans les statistiques. Action « Endurance » du lanceur.

  ```bash
  CYBERPINBALL_A_L_ECRAN=1 CYBERPINBALL_STRESS=50,10 CYBERPINBALL_TABLE=1.25 npx electron app
  ```

- **Fenêtres de VPX** (**nécessite les écrans du poste** : `$env:CYBERPINBALL_A_L_ECRAN = '1'`) : `.\docs\demo-fenetres.ps1 -Run` copie Terminator 2 1.25 (audit en erreur), le modèle de borne et le `VPinballX.ini` réels dans un bac à sable (`tmp\demo-fenetres`), puis joue trois parties par le test d'endurance : INI tel quel (Cyber Pinball écrit `SecurityLevel = 0` et `AskToTurnOn = 2`, partie réussie, aucune autre fenêtre), `SecurityLevel = 1` puis `AskToTurnOn = 0` mis à la main (gardés, partie arrêtée sur la question de VPX avec le réglage à remettre). Il vérifie à la fin que le vrai `VPinballX.ini` n'a pas changé.

- **Barre des tâches** (**nécessite les écrans du poste** : `$env:CYBERPINBALL_A_L_ECRAN = '1'`) : `.\docs\demo-barre-taches.ps1 -Etiquette apres` lance le menu, les réglages et l'assistant dans un bac à sable (`tmp\demo-barre-taches`) et capture le bureau entier pendant ce temps (`capturePage` ne voit pas la barre des tâches) ; `bords.txt` donne la luminosité de la première et de la dernière ligne de chaque écran. Le scénario `bureau` choisit « Bureau Windows » dans le menu système, puis rouvre le playfield comme par son bouton dans la barre des tâches. `-Scenarios` n'en rejoue que certains ; `-Partie` joue une partie de Terminator 2 avec le vrai VPX et vérifie le retour au menu. Captures dans `tmp\captures\barre-taches`.

- **Écrans couverts** : `.\docs\demo-ecrans-couverts.ps1 -Etiquette apres` capture le bureau entier en continu pendant une partie de Terminator 2 (vrai VPX, copie dans `tmp\demo-ecrans-couverts`), la relance menu → assistant et assistant → menu, les réglages seuls et un test d'endurance (`-Lancements`, 10 par défaut). Chaque capture est comparée, écran par écran, à une capture du bureau prise juste avant : un point identique au bureau est un point de bureau visible (`couverture.txt` : part de l'écran et de sa bande du bas, celle de la barre des tâches). Le bilan sépare le démarrage (avant les premières fenêtres), la suite (tout doit être couvert) et la fermeture ; les captures prises pendant qu'une autre instance de Cyber Pinball tourne sont ignorées, et le script attend qu'elle se termine avant chaque scénario. `-Scenarios partie,endurance` n'en rejoue que certains. Captures dans `tmp\captures\ecrans-couverts`.

- **Rotation du menu** : `CYBERPINBALL_FLIPPERS=bottom|left|top|right` force le bord des flippers sans modifier `cabinet.json` (gauche : 90°, droite : 270°, haut : 180°). Avec `--reglages`, l'écran seul ne pivote que si cette variable est posée. Étape `drag` de l'autopilote : le cadre de dépôt des fichiers.

  ```bash
  CYBERPINBALL_FLIPPERS=left CYBERPINBALL_HOME=tmp/home CYBERPINBALL_AUTOPILOT=Digit1,Escape,Escape CYBERPINBALL_CAPTURE=tmp/captures npx electron app
  ```

- **Ajout de tables avec la base VPS** : `.\docs\demo-vps.ps1 -Run` remplit le dossier d'import d'un bac à sable (`tmp\demo-vps`) de fichiers vides aux noms de vraies tables (jeux sûrs, incertains, absent), copie la base VPS en cache, puis rejoue l'écran « Quel jeu est-ce ? », le plan et l'installation ; captures dans `tmp\captures\vps`, `.info` écrits affichés dans le terminal.

- **Plugins de VPX** : `.\docs\demo-plugins.ps1 -Run` copie le modèle de borne et le `VPinballX.ini` réels dans un bac à sable (`tmp\demo-plugins`), y crée un dossier `pinmame` commun et simule un ZeDMD (`CYBERPINBALL_USB_DEVICES=<fichier.json>`, au format du champ `usb` de `npm run probe -- --json`). Il synchronise, rallume B2SLegacy à la main, resynchronise (modification et constat signalés), remet les valeurs de Cyber Pinball, puis parcourt l'écran des réglages ; captures dans `tmp\captures\plugins`.
- **PuP-Packs** : `.\docs\demo-pup.ps1 -Run` construit des packs factices (options dans `PuP-Pack_Options`, un `.bat` par option dont un illisible, restes de macOS, dossier en trop) et deux tables factices dont le script est pré-enregistré dans le cache (VPX n'est jamais lancé sur ces fichiers), puis rejoue le choix de l'option, le plan, l'installation et la vérification, et le médecin sur une table au pack mal rangé (« Tout réparer », puis l'option). Un second bac à sable rejoue l'ajout sur une borne simulée à deux écrans : l'option est retenue d'office. Captures dans `tmp\captures\pup` et `tmp\captures\pup-deux-ecrans`.

- **Bibliothèque de ROM** : `.\docs\demo-roms.ps1 -Run` prépare un bac à sable (`tmp\demo-roms`) de neuf tables factices au script pré-enregistré dans le cache, avec leurs ROM copiées comme avant la bibliothèque (la vraie `t2_l8` de la table de test, trois copies identiques et une autre version plus ancienne ; d'autres ROM de taille réaliste), une ROM inutilisée dans la bibliothèque et une ROM absente dans le dossier d'import. Il rejoue la vue globale, le plan de rangement (choix de la version gardée puis retour à la plus récente), le rangement et son bilan, la corbeille d'une ROM inutilisée, puis l'ajout de la ROM absente ; captures dans `tmp\captures\roms`, place des ROM mesurée avant et après dans le terminal.

- **Captures de la page du projet** : `.\docs\demo-captures.ps1` refait les images de `docs\images\en` et `docs\imagesr` (README.md et README.fr.md). Tables inventées (aucune œuvre de tiers, aucun nom de jeu réel) : plateau, fronton et topper des trois jeux principaux tirés de `docs\demo-captures-medias` (illustrations originales générées une fois par Codex), logos de la roue (médaillon à lunette de métal, illustration du fronton, titre qui déborde) et autres médias dessinés par `docs\demo-captures.cjs`, borne simulée `borne`, modèle de borne de `demo-medias.cjs modele`, version suivante annoncée par un site local au flux signé d'une clé d'essai (`CYBERPINBALL_MAJ_CLE`). Pour chaque langue (`CYBERPINBALL_LANGUE`) : menu des tables, fiche, menu système et mise à jour disponible ; étape « Écrans et rôles » de l'assistant ; réglages de VPX (VPinballX.ini lu sur un lecteur `subst`, pour un chemin court). Puis assemblage en WebP (`demo-captures.cjs --planche`) : playfield couché remis debout, borne entière écran par écran. Le garde-fou de mise en page et le guet hors écran doivent rester muets. `-Langues en`, `-Etapes menu, images` n'en refont qu'une partie.
- **Moments du menu** : `.\docs\demo-moments.ps1` fabrique un bac à sable de tables aux médias générés (`docs\demo-moments.cjs` : images, vidéos WebM dont certaines avec une piste son, musiques et sons de lancement en WAV, un `.directb2s`, un volume de jeu à 50 %), puis rejoue le vrai menu hors écran, sur le bureau caché, avec le modèle de borne réel (sortie du fronton : la première sortie active du poste). Scénarios `navigation` (musique de chaque jeu, volume relatif, son de la vidéo du plateau, écran « Médias, son et attente »), `silence` (réglages par défaut : rien ne joue) `partie` (trois parties simulées, `CYBERPINBALL_PARTIE_SIMULEE=backglass` : vidéo de chargement et son de lancement, écran de chargement de secours au titre très long, vidéo de chargement en portrait avec son ; en partie, fronton occupé figé, topper animé, silence ; retour au menu et à sa musique) `pivotee` (la même partie, menu tourné avec `CYBERPINBALL_FLIPPERS=left` et DMD en bande sous le fronton, puis le mode attente tourné) et `attente` (mode attente après 5 s, une table toutes les 3 s au son réduit ; un flipper, Start puis Exit en sortent sans changer la sélection ni rien ouvrir). Le son et les couches de médias de chaque écran attendus à chaque étape sont comparés au relevé `son.txt`. Fenêtres muettes ; le garde-fou de mise en page doit rester muet ; captures dans `tmp\captures\moments\<scénario>`. Le script échoue sinon. Avant cela, le garde-fou de mise en page passe ses cas témoins.
- **Médias des jeux, tout le jalon** : `.\docs\demo-medias.ps1` (borne type puis poste à deux écrans ; navigation, prospectus et règles, « Médias du jeu », chargement, partie, attente ; écrans vides, mise en page et replis vérifiés) : voir « Médias des jeux », « Preuves sans opérateur ». Aussi dans `.\docs\demos-hors-ecran.ps1`.
- **Médias d'un jeu** : `npm run build`, puis `npx electron docs\demo-medias-fiche.cjs`. Entièrement hors écran (fenêtres jamais montrées, rendu `offscreen`) : génère un bac à sable par écran dans `tmp\demo-medias-fiche` (images, vidéos WebM, son, `.directb2s`, défaut de la borne, dossier d'import), puis parcourt la fiche, la vue d'ensemble, le plateau et son demi-tour, les pages des règles (déplacement, ajout), le remplacement du logo et du fronton depuis le dossier d'import, l'afficheur et son repli, un dépôt sur la vue d'ensemble, le volume, le plan et l'enregistrement, une table sans médias (fronton tiré du `.directb2s`), le dépôt d'un fichier rangé à la Popper et « Quitter sans enregistrer ? ». Trois écrans : paysage 1920 × 1080, le même couché (menu tourné d'un quart de tour) et portrait 1080 × 1920. Captures et contrôle de mise en page dans `tmp\demo-medias-fiche\captures`, fichiers obtenus dans `resultat.txt`.
- **Médias depuis VPinMediaDB** : `.\docs\demo-vpinmediadb.ps1` (connexion à Internet nécessaire : c'est le vrai dépôt). Sur le bureau caché, entièrement hors écran (`docs\demo-vpinmediadb.cjs`, fenêtres jamais montrées) : bac à sable `tmp\demo-vpinmediadb` de trois tables (Terminator 2 avec son `VPSId` et un logo de l'utilisateur, Medieval Madness sans `VPSId`, une table inconnue), en paysage et en portrait. Parcours : avertissement du premier usage, plan avec aperçus, logo remplacé, plateau en vidéo ou en image 4k, progression, fiche du média avec sa source, puis menu système « Médias manquants » (détail d'une table, téléchargement, seconde recherche sans rien à faire). Captures, relevé `resultat.txt` (fichiers rangés, corbeille, sources du `.info`) et garde-fou de mise en page dans `tmp\demo-vpinmediadb\captures`. Les vignettes des vidéos H.264 restent noires dans ces captures : leurs images sont décodées par la carte graphique et n'apparaissent pas dans un rendu hors écran ; à l'écran, elles s'affichent.
- **Régler l'affichage en partie** : il n'a pas de démonstration sans opérateur, puisque tout se passe dans VPX (`-PovEdit`) ; tests manuels 86 à 90.
- **Réglages de VPX** : `CYBERPINBALL_AUTOPILOT` et `CYBERPINBALL_CAPTURE` fonctionnent aussi avec `--reglages`. Action « demo-reglages » du lanceur : copie le vrai VPinballX.ini dans un bac à sable, change un réglage général et deux réglages d'une table, garde les captures dans `tmp\demo-reglages`.

- **Installeur** : en bac à sable (`CYBERPINBALL_HOME` défini), l'installeur range `root.json` et les raccourcis (`Menu Démarrer`, `Bureau`, `Démarrage`) dans ce dossier et n'écrit rien dans le registre. En mode silencieux, `/D=` y est obligatoire (à défaut, seule la racine mémorisée dans ce bac à sable est acceptée) : jamais de repli sur la vraie racine. Le désinstalleur relit ce choix dans `installation.ini`. Installation, premier lancement (`--user-data-dir` garde aussi les données de Chromium dans `tmp\`), puis désinstallation :

  ```powershell
  $env:CYBERPINBALL_HOME = "$PWD\tmp\essai\home"
  Start-Process release\CyberPinball-Setup-complet.exe -ArgumentList '/S', "/D=$PWD\tmp\essai\racine" -Wait
  $env:CYBERPINBALL_AUTOPILOT = 'wait:500'; $env:CYBERPINBALL_CAPTURE = "$PWD\tmp\essai\captures"
  Start-Process tmp\essai\racine\app\CyberPinball.exe -ArgumentList "--user-data-dir=$PWD\tmp\essai\electron" -Wait
  Start-Process 'tmp\essai\racine\app\Désinstaller Cyber Pinball.exe' -ArgumentList '/S'
  ```

## Limites connues du prototype

- Démarrage de l'application : entre son lancement et ses premiers voiles (environ 1 à 2 s), le bureau reste visible ; aucune fenêtre ne peut exister plus tôt. Arrêtée de force en pleine partie, l'application laisse les barres des tâches masquées jusqu'à son démarrage suivant (ou au redémarrage de l'Explorateur). Une fenêtre plein écran montrée pour la première fois est claire quelques dizaines de millisecondes avant sa première image (mesuré : environ 45 ms) ; à une relance menu ↔ assistant, cet éclair peut se voir. La faire apparaître transparente puis opaque (`setOpacity`) a été essayé et retiré : transparente, elle n'est pas peinte, et l'éclair revient à l'opacité, au démarrage sur les quatre écrans. Un écran rebranché ou réveillé pendant que le menu tourne (moniteurs mis en veille par le verrouillage de Windows, renumérotés au réveil) reçoit de nouveau son voile noir, mais les fenêtres du menu ne suivent pas encore ce changement : le gardien signale l'écran découvert ou mal couvert dans la console, et un redémarrage de Cyber Pinball remet tout en place.
- Clés de VPX 10.8.1 (fenêtres `Player`, `Backglass`, `ScoreView`, `Topper`, `[Plugin.<id>] Enable`, priorités et réglages des plugins B2S, PUP et DMDUtil). Le format des noms d'écran et les plugins à activer changent selon la version de VPX : ils sont décrits par version dans le manifeste (`adapterSettings`).
- Journal de VPX pour diagnostiquer : `%APPDATA%\VPinballX\10.8\vpinball.log` (lignes « The selected display … is not available »).
- Exécutable et installeurs non signés tant qu'aucun certificat n'est fourni (configuration prête, voir [Signature](#signature)) : SmartScreen avertit au lancement de l'installeur.
- Mise à jour à la demande seulement (menu système, voir [Mise à jour depuis la borne](#mise-à-jour-depuis-la-borne)) : pas de recherche en arrière-plan. Pendant l'installation (une minute environ), le bureau Windows et la page de progression de l'installeur se voient sur l'écran principal. Le retour à l'ancienne version en cas d'échec de l'installeur n'a pas encore été provoqué en essai.
- VPX repère les écrans en coordonnées logiques : avec une mise à l'échelle Windows différente de 100 %, la position écrite peut ne pas correspondre. L'assistant le signale.
- Modèle stocké en JSON. La spec prévoit SQLite.
- Configurations de la borne : les réglages propres à chaque table (dont le cadrage réglé en partie, qui dépend pourtant de l'écran du playfield) sont communs à toutes les configurations. Un réglage général de VPX changé après la création d'une configuration ne vaut que pour la configuration active. L'écran de choix, la gestion des configurations et le bandeau n'ont pas encore été capturés (en attente du mode de test hors écran, pour ne pas occuper les écrans du poste).
- Mode plugins de VPX 10.8.1 seulement : pas encore de `ScreenRes.txt`, `DmdDevice.ini` ni `B2STableSettings.xml` pour le mode classique, pas de DOF.
- Zones : l'ordre de superposition de deux zones qui se chevauchent et la rotation d'une zone ne se règlent pas (VPX n'en a pas de réglage). Le rendu réel dans VPX reste à vérifier sur une borne (tests manuels 101 à 106, 144 et 145), en particulier le playfield fenêtré d'un poste de bureau.
- Boutons : clavier seulement. Les encodeurs en mode joystick et les manettes ne sont ni lus par l'interface ni écrits dans `[Input]` (voir « Boutons de la borne ») ; un bouton d'encodeur qui envoie une combinaison de touches n'est pas pris en charge.
- Son : les vidéos et la musique du menu jouent encore sur la sortie par défaut de Windows, comme les composants COM hors plugins (VPinMAME, B2S, PinUP Player autonomes). Rien ne vérifie encore que la sortie par défaut est celle du fronton.
