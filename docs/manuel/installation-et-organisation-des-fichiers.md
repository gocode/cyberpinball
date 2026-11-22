[English](../manual/installation-and-file-layout.md) · Français · [Sommaire du manuel](../manuel.md)

## Installation et organisation des fichiers

Tout Cyber Pinball vit dans une **racine choisie à l'installation** (action « Installer » du lanceur), par exemple `D:\CyberPinball`.
L'organisation est fixe : une mise à jour ne déplace rien.

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

- Les composants tiers (VPX aujourd'hui, d'autres émulateurs ensuite) sont décrits dans [packages/installer/components.json](../../packages/installer/components.json) : version, URL officielle, SHA-256, et mode de distribution (`automatic` si la licence permet de les livrer, `manual` sinon).
  Ils ne sont pas dans le dépôt git.
- Une archive dont l'empreinte ne correspond pas au manifeste est supprimée, jamais installée.
  Relancer l'installation ne retélécharge rien.
- **Runtime Visual C++ de VPX.**
  L'archive de VPX ne contient pas le runtime Visual C++ de Microsoft (`vcruntime140.dll`, `vcruntime140_1.dll`, `msvcp140.dll`), que `freeimage64.dll` et `SDL364.dll`, chargés au démarrage de VPX, importent, comme la plupart de ses plugins (PinMAME, DMDUtil, Serum, PUP, DOF).
  Un Windows neuf ne l'a pas toujours, et VPX ne démarre alors pas du tout (0xC0000135).
  Le runtime doit aussi être au moins aussi récent que les outils qui ont compilé VPX : `vcRuntime` de l'entrée `vpx` du manifeste (14.51 pour 10.8.1-5436), avec `requires: ["vc-redist-x64"]`.
  Le composant `vc-redist-x64` (genre `runtime`) est l'installateur officiel de Microsoft, à adresse figée, empreinte SHA-256 et signature Authenticode vérifiées (champ `signer`).
  Cyber Pinball lit la version des trois DLL dans System32 sans rien lancer (`vcRuntimeReady`, [app/src/vc-runtime.ts](../../app/src/vc-runtime.ts)) : au démarrage, un runtime absent ou trop ancien ouvre le message « Il manque le runtime Visual C++ à Windows » ; « Santé de la borne » le marque Bloquant ; l'installation de VPX (« Installer VPX », qui ne fait que vérifier le runtime quand VPX est déjà là) lance l'installateur sans fenêtre (`/install /quiet /norestart`), avec l'accord de Windows, demandé une fois (codes admis : 0, 3010, 1641, 1638).
  L'installeur complet le dépose dans `downloads\` avec l'archive de VPX, pour une borne sans Internet.
  Un VPX qui s'arrête faute d'une DLL (0xC0000135, 0xC0000139, 0xC000007B) est nommé sur l'écran d'échec, qui renvoie à « Santé de la borne » (`vpxMissingLibrary`, [packages/core/src/vpxfailure.ts](../../packages/core/src/vpxfailure.ts)).
  Pour une nouvelle version de VPX : à son installation, Cyber Pinball relit les DLL que ses fichiers importent (`vpxRuntimeNeeds`, [packages/core/src/vc-runtime.ts](../../packages/core/src/vc-runtime.ts)) et écrit au journal un runtime plus récent que `vcRuntime`, ou toute autre bibliothèque de redistribuable absente d'un Windows neuf (DirectX d'origine, OpenAL…) ; `vc-runtime.test.ts` vérifie la même chose sur le VPX installé du poste (`CYBERPINBALL_VPX_DIR` sinon), et que l'installateur de Microsoft du manifeste est assez récent.
- **Fichiers de VPX contrôlés.**
  Le manifeste donne la taille de chaque exécutable et bibliothèque de l'archive de VPX (`files`, relevé par `scripts/composant-fichiers.mjs`) ; à chaque relevé de la santé et de la fiche technique, et après un VPX arrêté en démarrant, Cyber Pinball compare le dossier installé à cette liste (`checkComponentFiles`, [packages/installer/src/component-files.ts](../../packages/installer/src/component-files.ts) ; `app/src/vpx-integrity.ts`), par un simple `stat`.
  Un fichier changé ou absent, le plus souvent parce qu'un autre VPX a été copié par-dessus, est nommé avec sa version dans « Santé de la borne » (« VPX 10.8.1-5436 : 1 fichier modifié hors de Cyber Pinball », « SDL364.dll 3.2.18.0 : VPX peut s'arrêter dès son démarrage, sur toutes les tables ») et dans la fiche technique (bloc « Logiciels »).
  « Remettre les fichiers d'origine » les reprend dans l'archive vérifiée de VPX (téléchargée si elle n'est plus dans `downloads\`, SHA-256 contrôlé), en extrait ces seuls fichiers et les remet un à un, sans toucher au reste du dossier (réglages, plugins de Cyber Pinball, `VPReg.stg`).
  Un autre exécutable de VPX posé à côté de celui de Cyber Pinball n'est ni retiré ni lancé : le lanceur prend toujours l'exécutable que nomme le manifeste (`findExecutable`, `Component.executable`), et le journal le signale.
  Tests : `vpx-fichiers-modifies.test.ts`.
- La racine est refusée dans Program Files, dans Windows et sur un partage réseau.
  Le choix est mémorisé dans `%APPDATA%\CyberPinball\root.json`.
- Avant le choix d'une racine, tout s'écrit dans un bac à sable (`%APPDATA%\CyberPinball\sandbox\`).
  Il est repris automatiquement lors de l'installation.
- Avant chaque écriture de `VPinballX.ini`, l'ancienne version est sauvegardée dans `data\backups\` (10 versions conservées).
  Seules les clés possédées par Cyber Pinball sont modifiées.
- Une clé possédée changée à la main (ou par le menu en jeu de VPX) n'est jamais écrasée en silence : `data\vpx-owned.json` garde les valeurs écrites la dernière fois dans chaque `VPinballX.ini` (un jeu de valeurs par configuration de la borne), et le front-end demande au démarrage de garder la nouvelle valeur ou de remettre celle de Cyber Pinball (`npm run sync -- --reecrire` en ligne de commande).
  Garder une taille d'écran la réimporte dans le modèle de borne ; garder une autre clé la laisse à l'utilisateur (`vpxManual` dans `cabinet.json`, modifiable dans les réglages de VPX) jusqu'au prochain passage de l'assistant d'écrans, qui reprend la main sur toutes les clés.
  Un nombre réécrit par VPX avec d'autres décimales ne compte pas comme une modification.
- **Copies de dossiers** : une seule fonction, `copyTree` ([packages/core/src/copytree.ts](../../packages/core/src/copytree.ts)), pour l'ajout des tables, les déplacements d'un disque à l'autre, la mise à jour légère, l'installation et la fabrication.
  Sous Windows, `fs.cpSync` de Node 22 (22.23.2) écrivait une destination accentuée dans un dossier fantôme (« pupvideos (désactivés) » devenait « pupvideos (dÃ©sactivÃ©s) », même quand le bon dossier existait) et arrêtait net le processus (code 0xC0000409, sans erreur rattrapable) dès que la source ou un dossier parent portait un accent : une table « Été », un profil Windows accentué.
  L'application elle-même tourne dans Electron 44 (Node 24), qui n'a pas ce défaut ; les essais, `fabriquer.mjs` et les outils en ligne de commande tournent sous Node 22.
  `copyTree` n'emploie que `mkdirSync` et `copyFileSync`, sains partout.
  `copie-sure.test.ts` refuse tout `fs.cpSync` dans les sources et copie depuis et vers des dossiers accentués.
  Ce que l'ancien défaut a laissé, le diagnostic le reconnaît à son nom (`folderMangled`, `unmangledName`) et propose de le ranger sous son vrai nom ; un fichier déjà présent sous le vrai nom part à la corbeille, remplacé par la copie, plus récente.
- Variables pour les tests : `CYBERPINBALL_ROOT` (autre racine), `CYBERPINBALL_HOME` (bac à sable isolé), `CYBERPINBALL_VPX_INI` (autre fichier).

En ligne de commande : `node packages/installer/dist/cli.js setup <racine>`, `install [id]`, `status`.

### Installeur Windows

`npm run installeur` fabrique l'exécutable, puis deux installeurs NSIS en français dans `release\` :

| Fichier | Taille | VPX |
| --- | --- | --- |
| `CyberPinball-Setup.exe` (légère) | 111 Mio | téléchargé au premier lancement (173 Mo), vérifié par SHA-256 |
| `CyberPinball-Setup-complet.exe` | 276 Mio | archive officielle incluse, posée dans `downloads\` : installée au premier lancement, sans connexion |

Ce que fait l'installeur :
- **Langue** en tout premier, français ou anglais, dans une petite fenêtre écrite dans les deux langues.
  Présélection : la langue déjà choisie dans Cyber Pinball dans cette racine (`<racine>\data\language.json`), sinon celle de Windows si c'est le français, l'anglais sinon, comme l'application.
  Tout l'installeur la suit (pages, messages, conditions, désinstalleur), et elle devient celle de Cyber Pinball : le choix est écrit dans `<racine>\data\language.json`, au format de l'application (voir [Langue de l'interface](langue-de-l-interface.md#langue-de-linterface)).
  Pas de fenêtre en mise à jour (`/MAJ`) ni en silence (`/S`) : rien n'est écrit, l'application garde sa langue.
  Le désinstalleur prend la langue de Cyber Pinball sur la borne.
  Textes : [scripts/installeur/langues.nsh](../../scripts/installeur/langues.nsh), dans les deux langues côte à côte ; [installeur-langues.test.ts](../../packages/core/src/test/installeur-langues.test.ts) vérifie que chaque texte affiché par le script y a ses deux traductions, avec les mêmes variables, et qu'aucun texte français n'est resté codé en dur dans `cyberpinball.nsi`.
- **Conditions d'utilisation** d'abord, après la page d'accueil : le texte de [packages/core/src/terms.ts](../../packages/core/src/terms.ts), écrit dans les deux langues à chaque fabrication et montré dans la langue choisie, à accepter pour continuer (voir [Conditions d'utilisation](conditions-d-utilisation.md#conditions-dutilisation)).
  « J'accepte » écrit `<racine>\data\conditions.json` ; une mise à jour (`/MAJ`) ou une installation silencieuse (`/S`) n'affiche pas la page, et l'application présente alors elle-même le texte.
- **Dossier racine** au choix.
  Proposé : celui de l'installation précédente, sinon la racine mémorisée dans `root.json`, sinon `D:\CyberPinball` si `D:` est un disque local, sinon `C:\CyberPinball`.
  Mêmes refus que `packages/installer` : Program Files, Windows, dossier réseau (lecteur réseau compris), plus un disque absent ou un chemin incomplet.
  Un dossier `app\` qui ne contient pas Cyber Pinball est refusé aussi.
- L'application va dans `<racine>\app\` (remplacée en entier à chaque mise à jour), l'organisation de la racine est créée et la racine est mémorisée dans `%APPDATA%\CyberPinball\root.json`.
- Les données d'avant le choix d'une racine (`%APPDATA%\CyberPinball` : modèle de borne, sauvegardes, `sandbox\VPinballX.ini`) sont reprises comme par `setup`, sans jamais écraser celles de la racine.
- Raccourcis : `Cyber Pinball.lnk` à la racine et dans le menu Démarrer ; sur le bureau (coché par défaut) ; au démarrage de Windows en option, pour une borne dédiée (dossier Démarrage de la session).
- **Runtime Visual C++ de Microsoft**, s'il manque à Windows : section « Runtime Visual C++ de Microsoft, pour VPX (s'il manque) », toujours cochée.
  VPX ne démarre pas sans lui, et sa bibliothèque SDL, qui lit les boutons et le lanceur d'un Pinscape ou d'un encodeur en mode manette, ne se charge pas non plus : il doit être là avant le premier assistant.
  Son installation demande l'accord de Windows (UAC), auquel les boutons de la borne ne peuvent pas répondre ; l'installeur la fait donc pendant que l'utilisateur a la souris en main.
  C'est Cyber Pinball lui-même, lancé en mode Node (`ELECTRON_RUN_AS_NODE`, [app/src/runtime-vc.ts](../../app/src/runtime-vc.ts)), qui la fait, par la même fonction que le front-end (`ensureVcRuntime`) : téléchargement vérifié, ou fichier déjà déposé dans `downloads\` par l'installeur complet, signature de Microsoft vérifiée.
  Rien n'est demandé si le runtime suffit.
  Jamais en mise à jour (`/MAJ`), en silence (`/S`) ni dans un bac à sable : le front-end le propose alors au démarrage.
  Le mode Node n'est jamais transmis à « Lancer Cyber Pinball » de la dernière page.
- Installation pour l'utilisateur courant, sans droits d'administrateur, avec une entrée dans « Programmes et fonctionnalités » (`HKCU`).
- Si Cyber Pinball est ouvert, l'installeur et le désinstalleur demandent de le fermer.
- Ligne de commande : `/S` silencieux, `/DEMARRAGE` lancement au démarrage de Windows, `/SANSBUREAU` sans raccourci sur le bureau, `/LANGUE=fr` ou `/LANGUE=en` langue de l'installeur et de Cyber Pinball (écrite comme le choix de la fenêtre, qui ne s'affiche pas), `/D=D:\Borne` racine (en dernier, sans guillemets).
  Code de sortie 2 si la racine est refusée.

**La désinstallation retire l'application seulement** : le dossier `app\`, les raccourcis et l'entrée de « Programmes et fonctionnalités ».
Les tables, médias, configuration, données (modèle de borne, sauvegardes), émulateurs, téléchargements, `import\` et `root.json` restent : une réinstallation dans la même racine les retrouve tels quels.
Pour tout effacer, il faut supprimer la racine à la main.
Le désinstalleur (`app\Désinstaller Cyber Pinball.exe`, `/S` pour le mode silencieux) refuse de s'exécuter hors d'un dossier `app\` qui contient `CyberPinball.exe` et le journal `installation.ini`.

**Licence de VPX et version complète.**
VPX est sous GPLv3+ pour la majorité de ses fichiers ; le reste garde une licence dérivée de celle de MAME (`docs\license.txt` de l'archive), qui autorise la redistribution à trois conditions : ne pas la vendre ni l'utiliser dans un produit ou une activité commerciale, livrer les sources d'une version modifiée, reproduire la licence.
La version complète embarque l'archive officielle inchangée (empreinte vérifiée à la fabrication contre le manifeste) et, à côté, `<archive>.licence.txt` : le texte complet de la licence lu dans l'archive elle-même, l'adresse de l'archive et le commit de ses sources.
Elle est donc redistribuable gratuitement, mais **ne doit jamais être vendue, ni livrée avec une borne vendue ou exploitée commercialement**.
La fabrication s'arrête si la licence trouvée dans l'archive change.
L'archive est prise dans `CYBERPINBALL_VPX_ARCHIVE` si la variable est définie, sinon dans `cache\downloads\` (téléchargée au besoin).

Le script NSIS est [scripts/installeur/cyberpinball.nsi](../../scripts/installeur/cyberpinball.nsi), compilé par [scripts/installeur.mjs](../../scripts/installeur.mjs) avec le NSIS 3 qu'electron-builder télécharge (empreinte vérifiée).
L'icône est dessinée dans [app/renderer/icone.svg](../../app/renderer/icone.svg), qui sert aussi de logo au topper dessiné ; `node scripts/icone.mjs` la rend hors écran à chaque taille du `.ico` et en tire le bandeau des pages d'accueil (dans `app\ressources\`).
Dans l'exécutable, koffi est réduit au JavaScript chargé à l'exécution et au binaire `win32-x64`.

### Signature

Rien n'est signé sans certificat : la fabrication continue sans rien demander, et chaque publication rappelle que les exécutables partent non signés.
Avec un certificat de signature de code (Authenticode), `CyberPinball.exe`, le désinstalleur et les deux installeurs sont signés et horodatés par `signtool` (le désinstalleur est écrit et signé avant d'être embarqué).
Tous les binaires que Cyber Pinball livre lui-même dans `natif\` (plugins de VPX, couche OpenXR, compagnon du casque, serveur du DMD) le sont aussi, avant le paquet de mise à jour qui les embarque (`signAll`) : un seul binaire non signé suffit à faire bloquer l'application par certains antivirus.
Le certificat se désigne par variables d'environnement, jamais dans le dépôt ([scripts/signature.mjs](../../scripts/signature.mjs)) :

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

**PowerShell et antivirus.**
Les antivirus qui surveillent le comportement des programmes avaient pris Cyber Pinball pour un cheval de Troie et l'avaient mis en quarantaine au démarrage : un exécutable non signé lançait PowerShell sans fenêtre, avec un script encodé et la politique d'exécution de Windows contournée, et relevait la liste des antivirus du poste.
Depuis, tout script PowerShell de Cyber Pinball de plus d'une ligne passe par un fichier `.ps1` lisible, jamais encodé, lancé par le Windows PowerShell de `System32` avec la politique `RemoteSigned`, jamais `Bypass` ([packages/core/src/powershell.ts](../../packages/core/src/powershell.ts)).
Un script temporaire est retiré après usage, ou remplacé au lancement suivant (nom fixe) ; aucun ne relève les antivirus installés.
Le test `powershell-propre.test.ts` refuse le retour de ces signes dans le code livré.

### Mise à jour depuis la borne

Une borne installée se met à jour depuis Menu système > Aide et infos > **« Mise à jour de Cyber Pinball »** (détail : version installée, et version disponible une fois cherchée).
Rien ne s'installe d'office : une recherche discrète part dès le démarrage, puis toutes les 30 min tant que Cyber Pinball tourne (toutes les 5 min tant qu'elle échoue, par exemple quand le réseau n'est pas encore prêt au démarrage de la borne), sans rien télécharger ni rien afficher en cas d'échec ; une erreur d'une recherche faite à la main ne l'arrête pas ; une version disponible, ou une mise à jour qui n'a pas abouti (constatée au redémarrage, jusqu'à ce qu'on ouvre l'entrée), met une **pastille rouge** sur la roue dentée du front-end (⚙) et sur l'entrée « Mise à jour de Cyber Pinball » du menu système (`attention` des entrées du menu système, repris par la roue dentée dès qu'une entrée en porte une).
Ouverte, l'entrée montre aussitôt les nouveautés de chaque version manquée depuis celle de la borne (`history` du flux), et « Mettre à jour maintenant », choisi d'office : l'installation est à un bouton.
Chaque ouverture relance la recherche, même après un résultat récent.
Hors écran, les essais ne cherchent que leur site d'essai (`CYBERPINBALL_MAJ_URL`), jamais GitHub.
Code : [packages/core/src/update.ts](../../packages/core/src/update.ts) (flux, versions, téléchargement), [app/src/updates-menu.ts](../../app/src/updates-menu.ts) (écran).

- **Où** : les releases du dépôt public [github.com/gocode/cyberpinball](https://github.com/gocode/cyberpinball).
  La borne lit `https://github.com/gocode/cyberpinball/releases/latest/download/cyberpinball-maj.json` (redirection de GitHub, sans la limite de débit de son API ; les préversions n'y figurent pas).
  **Connexion lente** : la recherche aboutit même à faible débit.
  Elle ne s'arrête que si le site ne répond plus du tout pendant 20 s (connexion, premier octet, puis chaque morceau reçu relancent le compte), jamais au bout d'une durée totale ; une coupure passagère, un site muet ou une réponse 429 ou 5xx sont réessayés deux fois, avec une attente qui double (`fetchTextPatiently`, [packages/core/src/patientfetch.ts](../../packages/core/src/patientfetch.ts)).
  La liste des publications lue pour les préversions se limite aux dix dernières (`PUBLIC_RELEASES_LISTED`), environ trois fois plus légère.
  La même lecture patiente sert à la base des tables (VPS), à l'index des médias (VPinMediaDB), aux règles des tables, aux cartes mémoire des ROM et aux fiches des sites de téléchargement ; les fichiers eux-mêmes se téléchargent avec reprise après coupure.
  Le dépôt est écrit à un seul endroit (`UPDATE_REPOSITORY`), égal à `repository` du `package.json` (vérifié par les tests) ; l'installeur en tire le site de « Programmes et fonctionnalités ».
- **Flux signé** : `cyberpinball-maj.json` contient le manifeste (version, date, nouveautés en français et, si `CHANGELOG.en.md` a la section de la version, en anglais (`notesByLanguage.en`) : la borne affiche celles de sa langue, sinon les françaises ; installeur léger : adresse de la release, taille, SHA-256) et sa signature Ed25519.
  La borne ne lit qu'un flux signé par la clé de publication, dont la moitié publique est livrée dans l'application ([update-key.ts](../../packages/core/src/update-key.ts)) : un compte GitHub compromis ne suffit pas à faire installer un programme sur les bornes.
  L'installeur téléchargé (`<racine>\downloads\cyberpinball\CyberPinball-Setup-<version>.exe`, les précédents sont supprimés) est vérifié (taille et SHA-256 du flux signé) avant d'être lancé ; un fichier faux est supprimé.
- **Écrans** : recherche ; « à jour » (dernière version publiée et sa date) ; « Cyber Pinball x.y.z est disponible » (nouveautés, taille, vérification) avec « Mettre à jour maintenant » et « Plus tard » ; téléchargement (Mio reçus, pourcentage, « Annuler ») ; « Installation » ; « Mise à jour impossible » (pas de réseau, aucune version publiée, signature ou empreinte refusée) avec « Réessayer ».
  Lancé depuis les sources (`npm start`), la recherche marche mais l'installation n'est pas proposée.
- **Installation** : l'installeur habituel, en mode `/MAJ /D=<racine>` (en plus `/S` hors écran).
  Seule sa page de progression s'affiche ; il attend que Cyber Pinball se ferme (jusqu'à 60 s), garde les raccourcis choisis à l'installation précédente (bureau, démarrage de Windows, lus dans `app\installation.ini` ; pour une borne déployée par `npm run deployer`, qui n'en a pas, ceux qui existent), est lancé depuis le dossier du téléchargement (un dossier de travail dans `app\`, celui du raccourci de la borne, empêcherait de le renommer), renomme l'ancien `app\` en `app.precedente` le temps de l'installation (10 s d'essais ; s'il reste tenu, rien ne change et Cyber Pinball redémarre, sans clic) (remis en place si elle échoue, supprimé si elle réussit), puis relance Cyber Pinball avec ses arguments d'avant (`CYBERPINBALL_MAJ_ARGS`).
  Tables, médias, configuration et données ne sont pas touchés, comme pour toute réinstallation.
- **Mise à jour légère** : chaque release joint aussi `CyberPinball-application.zip` (1,5 Mio), le contenu de `app\resources\app` seul : le JavaScript, l'interface, koffi.
  Une borne dont le **socle** est celui du paquet le prend à la place de l'installeur.
  Le socle (`cyberpinball.socle` du `package.json` de l'application, par exemple `electron-44.5.1-842034390a0b`) résume tout ce qui, autour de `resources\app`, ne change qu'avec l'installeur : versions d'Electron et d'electron-builder, configuration et icône de l'exécutable ([scripts/fabriquer.mjs](../../scripts/fabriquer.mjs)).
  Le paquet est vérifié comme l'installeur (taille et SHA-256 du flux signé), déplié dans `downloads\cyberpinball\application-<version>\` et refusé s'il ne contient pas la version et le socle annoncés ; Cyber Pinball lance alors `maj-legere.js` de la nouvelle version, par son propre exécutable en mode Node (`ELECTRON_RUN_AS_NODE`), et se ferme.
  Le script ([app/src/maj-legere.ts](../../app/src/maj-legere.ts)) attend la fermeture, renomme `resources\app` en `resources\app.precedente` (10 s d'essais), met la nouvelle à sa place (l'ancienne remise si elle échoue, supprimée sinon ; au démarrage suivant si un processus de Chromium qui finit de se fermer en tient encore un fichier), écrit la version dans « Programmes et fonctionnalités » si l'installation est la sienne, puis relance Cyber Pinball avec ses arguments d'avant ; journal dans `downloads\cyberpinball\maj-legere.txt`.
  Quelques secondes, sans installeur ni fenêtre.
  Une version d'avant la mise à jour légère (sans socle), ou d'un autre socle, passe par l'installeur.
- **Publication rapide** (`publier.mjs --rapide`) : l'application seule est fabriquée (sans electron-builder, en quelques secondes) et publiée avec son flux ; les installeurs ne sont pas refaits.
  Le flux désigne ceux de la dernière publication complète (`installer.version`) : une borne d'un autre socle installe d'abord cette version, puis se voit proposer la mise à jour légère au redémarrage (« Installeur de la x.y.z, puis la mise à jour légère vers … »).
  La publication rapide est refusée si le socle fabriqué n'est plus celui du dernier flux publié (Electron mis à jour, icône changée…) : c'est alors une publication complète.
  Un flux sans paquet léger, ou un installeur qui n'apporte rien de plus récent que la version installée, ne propose rien d'impossible : l'écran le dit, sans bouton « Mettre à jour maintenant ».
- **Versions reçues** : l'entrée « Versions reçues : … » des écrans de la mise à jour ouvre le choix de la source, le curseur sur celle suivie : **Versions finales** (par défaut), **Préversions**, et **Essais privés** sur un poste qui a un canal d'essai (ci-dessous).
  Le choix est gardé dans `<données>\preversions.json` (`source`, et `preversions` pour les versions d'avant), puis une recherche repart.
  Une borne ne revient jamais à une version plus ancienne : en changeant de source, elle garde la sienne jusqu'à ce que la source choisie en publie une plus récente (l'écran le dit).
- **Préversions** : une borne qui les reçoit cherche le flux de la release de plus haute version, préversions comprises, dans la liste des releases de l'API GitHub (sans jeton, 60 requêtes par heure : largement assez) ; une liste illisible la ramène au flux des versions finales.
  Le flux reste vérifié par sa signature.
  Les autres bornes ne voient jamais une préversion (`0.1.3-essai.1`, publiée en « pre-release »), et la version finale (`0.1.3`) passe devant ses préversions.
- **Canal d'essai privé** : pour qui maintient Cyber Pinball et veut essayer ses versions sur ses propres bornes avant de les publier.
  Les essais sont des releases d'un dépôt GitHub **privé** (`publier.mjs --rapide --prive`, action `publier-essai` du lanceur) ; le code n'est pas envoyé sur le dépôt public.
  Un poste qui a le fichier `%USERPROFILE%\.cyberpinball\canal-essai.json` (`{ "depot": "proprietaire/nom", "jeton": "github_pat_…" }`, action `canal-essai` du lanceur) se voit proposer « Essais privés » ; les autres n'en voient rien.
  Le fichier est hors du dossier des données : ni sauvegardé, ni partagé, ni dans la fiche technique.
  Le jeton, à grain fin, ne donne que « Contents » en lecture sur ce seul dépôt ; il n'est joint qu'aux adresses de l'API de ce dépôt, et la redirection de GitHub vers son stockage est suivie sans lui (`channelFetch`).
  La borne prend la plus récente des préversions publiques et des essais privés ; un essai privé se télécharge par l'API (`releases/assets/<id>`), vérifié comme le reste par la signature du flux et le SHA-256 : un jeton volé ne fait rien installer d'autre que ce que l'éditeur a signé.
  Un jeton refusé ou expiré est une erreur affichée (« Canal d'essai … illisible »), jamais un repli silencieux ; un fichier retiré ramène la borne aux préversions publiques.
  Les deux dépôts partagent la numérotation : `publier.mjs --prive` refuse un numéro déjà publié sur le dépôt public, n'accepte qu'une préversion, et pose la release sur la branche du dépôt privé (qui doit avoir un premier commit).
  Le jeton de publication doit alors pouvoir écrire dans ce dépôt.
- **Au démarrage suivant** : `data\mise-a-jour.json`, écrit avant de lancer l'installeur ou la mise en place, dit si la version attendue tourne : bandeau « Cyber Pinball x.y.z est installé (avant : …) », ou « La mise à jour vers x.y.z n'a pas abouti : la version … est restée en place ».
  Une version plus récente que celle d'avant compte comme installée (l'installeur d'une publication rapide pose une version plus ancienne que celle du flux).

#### Aide-mémoire : publier une version

Tout se fait depuis le lanceur : double-clic sur `lanceur.cmd` (dossier `D:\wamp\www\cyberpinball`), rubrique **« Fabrication et publication sur GitHub »**, ou directement `.\lanceur.cmd <action>`.

| Quand | Action du lanceur | Ce qu'elle fait |
| --- | --- | --- |
| Une fois, puis à l'expiration du jeton | `jeton` | Range le jeton GitHub (saisie masquée) dans `%USERPROFILE%\.cyberpinball\jeton-github.txt`, hors du dépôt |
| Avant une version finale | `version` | Passe à la version suivante (correctif, `mineure` ou `majeure`), rassemble les nouveautés en attente (`changements/`) dans les deux CHANGELOG, les ouvre dans le Bloc-notes pour relecture, vérifie les nouveautés (autant en anglais qu'en français), puis enregistre « Version x.y.z » dans git |
| Avant de publier, au besoin | `verifier` | `npm run avant-fusion` (contrôle de publication, tests, traductions) et nouveautés de la version |
| Pour mettre en ligne | `publier` | Les deux installeurs, le flux signé, l'instantané du code sur GitHub, la release, puis la description du dépôt (15 à 20 min). Les bornes voient la version dès la fin |
| Pour aller plus vite | `publier-leger` | Pareil avec l'installeur léger seul, celui que téléchargent les bornes (deux fois plus rapide) |
| Après chaque fusion | `publier-rapide` | La préversion suivante, sans refaire les installeurs (1 à 2 min) : numéro pris après la plus haute étiquette de GitHub, nouveautés de `changements/` rassemblées dans les CHANGELOG, commit « Version … », puis l'application seule et le flux ; les bornes au même socle se mettent à jour en quelques secondes, les autres par les installeurs de la dernière publication complète. Refusée si Electron ou l'exécutable ont changé |
| Pour préparer une préversion sans la publier | `preversion` | Passe à la préversion d'essai suivante (`0.1.3-essai.1`, puis `-essai.2`…) d'après `package.json` et l'enregistre ; `publier-rapide` la met en ligne (ou fait cette étape lui-même), pour les seules bornes réglées sur « Préversions ». `version` donne ensuite la version finale (`0.1.3`) |
| Pour essayer sans que personne d'autre ne la voie | `publier-essai` | La préversion suivante, numérotée comme par `publier-rapide`, dans le dépôt privé du canal d'essai (1 à 2 min) : seules les bornes qui ont ce canal, réglées sur « Essais privés », la voient ; le code ne part pas sur le dépôt public |
| Une fois par poste ou borne d'essai | `canal-essai` | Range le dépôt privé et son jeton de lecture (saisie masquée) dans `%USERPROFILE%\.cyberpinball\canal-essai.json` |
| Pour relire avant tout le monde | `publier-brouillon` | Release en brouillon : invisible des bornes jusqu'à « Publish release » sur GitHub |
| Code seul, sans version | `envoyer` | Instantané du code sur `main`, sans release : les bornes ne voient rien |
| Description du dépôt | `decrire` | Description et sujets du dépôt, tirés du `package.json` |
| Avant une version délicate | `essai-maj` | Essai complet hors écran : installe une version, en publie une suivante sur un site local, met à jour et vérifie (15 min environ) |
| Après un changement de la mise à jour légère | `essai-maj-legere` | Pareil en publication rapide : la borne reçoit le paquet léger, sans installeur (10 min environ) |
| Sur cette borne, sans publier | `deployer` | Fabrique l'application et la copie dans `<racine>\app` (rapide, sans installeur) |

Chaque publication demande une confirmation (« o ») avant d'envoyer quoi que ce soit, et s'arrête sans rien publier si les nouveautés manquent, si une modification n'est pas enregistrée dans git ou si le contrôle de publication trouve un secret.
La clé de signature (`%USERPROFILE%\.cyberpinball\cle-publication-maj.pem`) et le jeton restent hors du dépôt, tout comme les fichiers de secrets que le `.gitignore` écarte.

#### Publier une version

```powershell
# 1. Nouveautés de chaque branche dans changements/<branche>.md (voir plus bas) ; le numéro de version est posé par la publication.
# 2. Une fois pour toutes : jeton GitHub à grain fin, limité au dépôt gocode/cyberpinball, permissions
#    « Contents » et « Administration » en lecture et écriture, rangé seul dans ce fichier (hors du dépôt) :
#    %USERPROFILE%\.cyberpinball\jeton-github.txt   (ou la variable CYBERPINBALL_GITHUB_TOKEN)
npm run publier                      # -- --brouillon : release laissée en brouillon, invisible des bornes
npm run publier -- --rapide          # sans refaire les installeurs : paquet léger et flux seulement
node scripts/publier.mjs --rapide --essai   # après une fusion : préversion suivante, numéro et commit de version compris
```

[scripts/publier.mjs](../../scripts/publier.mjs) passe le contrôle de publication, fabrique les deux installeurs, écrit et signe le flux, le relit avec la clé livrée, crée la release `v<version>` sur le commit envoyé (refusé si des modifications ne sont pas enregistrées, si le commit n'est pas sur GitHub ou si la release existe), y joint `CyberPinball-Setup.exe`, `CyberPinball-Setup-complet.exe`, `CyberPinball-application.zip` et `cyberpinball-maj.json` (avec `--rapide` : le paquet léger et le flux seulement, après avoir relu le dernier flux publié pour en reprendre les installeurs et comparer le socle), la publie, puis relit le flux comme une borne.
Une version avec préversion (`0.2.0-essai.1`) part en « pre-release » : seules les bornes qui acceptent les préversions la voient ; sans section à elle dans le CHANGELOG, elle prend les nouveautés de sa version finale (`## 0.2.0`), sinon « Préversion d'essai de la 0.2.0 ».
Avec `--essai` (ou `--suivante correctif|mineure|majeure`), la publication pose elle-même le numéro : elle lit les étiquettes `v…` de GitHub (dépôt public et dépôt du canal d'essai, une seule numérotation), prend la version qui suit la plus haute, rassemble les nouveautés en attente sous la section de sa version finale dans les deux CHANGELOG, retire leurs fichiers, met à jour `package.json` et `package-lock.json` et enregistre le commit « Version … ».
Une publication interrompue après ce commit se relance telle quelle : le numéro, encore libre sur GitHub, est repris.
Elle applique enfin la description et les sujets du dépôt, tirés de `description` et `keywords` du `package.json` ; `npm run decrire` les applique seuls (`-- --essai` : vérifie sans rien envoyer).
Le jeton a alors besoin, en plus, de la permission « Administration : read and write ».
#### Nouveautés d'une branche

Une branche n'écrit jamais dans `CHANGELOG.md`, `CHANGELOG.en.md` ni le numéro de `package.json` : deux branches qui ajoutaient leurs lignes en tête de la même section se gênaient à chaque fusion.
Elle écrit ses nouveautés dans `changements/<branche>.md`, un fichier à elle, avec les mêmes points dans les deux langues :

```markdown
## Français

- Une phrase courte, pour l'utilisateur de la borne.

## English

- The same point, in English.
```

`npm test` vérifie chaque fichier (les deux sections, autant de points, aucun point déjà publié).
À la publication, ces fichiers sont rassemblés dans les deux CHANGELOG puis retirés ([scripts/version-suivante.mjs](../../scripts/version-suivante.mjs)).
Une branche partie avant ce fonctionnement reporte ses lignes des CHANGELOG avec `node scripts/decoupage.mjs --reporter`, pendant la fusion de la branche principale.

**Paquet complet, une fabrication à la fois** ([scripts/paquet-application.mjs](../../scripts/paquet-application.mjs)) : `fabriquer.mjs` commence par vider `build\` ; deux fabrications lancées dans le même dossier se marchent dessus, et la préversion 0.1.13-essai.1 est ainsi partie sans son code (6,2 Mio au lieu de 17,8).
Un verrou (`release\.fabrication.lock`, le numéro du processus) refuse une seconde fabrication tant que la première tourne ; `publier.mjs` le tient jusqu'à l'envoi.
`fabriquer.mjs` vérifie `build\app` avant d'en faire le paquet, et `publier.mjs` relit le zip avant de l'envoyer : sans `dist/main.js`, `dist/preload.js`, `dist/maj-legere.js`, `dist/veilleur.js`, `renderer/frontend.html`, `renderer/screen.html` ou `components.json`, rien ne part.
Côté borne, `unpackAppPackage` refusait déjà un tel paquet ; il dit maintenant « le code de l’application manque dans le paquet » plutôt qu'un numéro de version faux.

**Téléchargement direct.**
En tête de README.md et README.fr.md, la section « Télécharger » donne des liens `https://github.com/gocode/cyberpinball/releases/latest/download/<fichier>`, qui mènent tout droit à l'installeur de la dernière version finale (GitHub ne donne jamais une préversion pour « latest ») ; ils ne changent jamais, et le badge de la version se met à jour seul.
Ils ne marchent que si chaque version finale porte ses deux installeurs sous leur nom (`CyberPinball-Setup.exe`, `CyberPinball-Setup-complet.exe`) : `npm run publier` refuse donc `--rapide` et `--leger` pour une version finale (une préversion les garde), refuse d'envoyer une version finale sans ses deux installeurs, et vérifie ces liens une fois la version publiée.
`npm test` refuse un README sans ces liens, ou avec un lien figé sur une version (`releases/download/v…`).
Voir [scripts/telechargement-direct.mjs](../../scripts/telechargement-direct.mjs).

**Clé de publication** : créée une fois par `node scripts/cle-publication.mjs` (jamais remplacée ensuite ; `--verifier` contrôle qu'elle correspond à la clé livrée).
La clé privée n'est jamais dans le dépôt : `%USERPROFILE%\.cyberpinball\cle-publication-maj.pem`, ou `CYBERPINBALL_MAJ_CLE_PRIVEE`.
**À sauvegarder hors du poste** : perdue, les bornes installées refuseraient toutes les mises à jour suivantes et devraient être réinstallées à la main.

**Contrôle de publication** ([scripts/audit-publication.mjs](../../scripts/audit-publication.mjs), lancé par `npm run avant-fusion`, par l'envoi et par la publication ; `npm test` ne le lance plus depuis le 17/11/2026) : le dépôt étant public, il refuse dans les fichiers suivis, et dans les fichiers neufs pas encore ajoutés (ni ignorés) qui partiront au prochain commit, les clés privées, jetons (GitHub, OpenAI, AWS, Slack, Google), mots de passe écrits en clair, chemins d'un profil Windows (`C:\Users\<nom>`), adresses e-mail hors de sa liste (co-auteur des commits, auteurs des polices, exemples) et les noms d'une liste privée gardée hors du dépôt (`%USERPROFILE%\.cyberpinball\audit-noms.txt`, un par ligne, ou `CYBERPINBALL_AUDIT_NOMS`).
`--commits <a..b>` vérifie aussi les messages et auteurs de ces commits.

**Mise à jour en bac à sable** : `CYBERPINBALL_MAJ_URL` remplace l'adresse du flux ; `CYBERPINBALL_MAJ_CLE` (fichier PEM) la clé publique, seulement dans un bac à sable (`CYBERPINBALL_HOME`).
Dans un bac à sable aussi, `CYBERPINBALL_MAJ_INSTALLEE=1` fait passer sa racine pour une installation : l'écran propose « Mettre à jour maintenant » même lancé depuis les sources.

### Recherche et secours des mises à jour

La recherche automatique se fait toutes les 30 minutes, au réveil du PC et au retour de partie ; ouvrir « Mise à jour de Cyber Pinball » lance aussi une recherche immédiate, sans résultat ancien gardé en cache.
Le retour de l'écran rejoint sa provenance, notamment l'Activité récente.
Si GitHub est injoignable, le service de Cyber Pinball récupère automatiquement la mise à jour à sa place ; signature et empreinte restent vérifiées.
« Mise à jour impossible » propose « Installer automatiquement la dernière version » par ce service, en conservant tables, médias et configuration.
Les erreurs de réseau indiquent la cause : adresse inaccessible, nom introuvable ou certificat refusé.
Le plan d'une reprise d'installation distingue les gros fichiers liés et les autres fichiers copiés.
