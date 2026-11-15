; Textes de l'installeur et du désinstalleur, en français et en anglais (inclus par cyberpinball.nsi,
; après ses MUI_LANGUAGE). Chaque texte affiché par cyberpinball.nsi passe par $(L_…), défini ici
; dans les deux langues, côte à côte. Variables ($Racine…) et définitions (${VERSION}…) : les mêmes
; dans les deux traductions. Invariant fixé par packages/core/src/test/installeur-langues.test.ts :
; chaque nom utilisé a ses deux traductions, aucun nom en trop, aucun texte français codé en dur dans
; cyberpinball.nsi, aucune traduction anglaise restée en français.
;
; Menus de l'application cités : mêmes libellés que son catalogue anglais (packages/core/src/i18n/en).

; ---------------------------------------------------------------------------
; Communs à l'installeur et au désinstalleur

LangString L_ABANDON ${LANG_FRENCH} "Abandonner l'installation de Cyber Pinball ?"
LangString L_ABANDON ${LANG_ENGLISH} "Cancel the installation of Cyber Pinball?"

LangString L_APPLI_OUVERTE ${LANG_FRENCH} "Cyber Pinball est ouvert. Fermez-le, puis cliquez sur Réessayer."
LangString L_APPLI_OUVERTE ${LANG_ENGLISH} "Cyber Pinball is open. Close it, then click Retry."

LangString L_APPLI_OUVERTE_RIEN ${LANG_FRENCH} "Cyber Pinball est ouvert : rien n'a été modifié."
LangString L_APPLI_OUVERTE_RIEN ${LANG_ENGLISH} "Cyber Pinball is open: nothing was changed."

!ifdef ECRIRE_DESINSTALLEUR
; ---------------------------------------------------------------------------
; Désinstalleur

LangString L_DESINST_TITRE ${LANG_FRENCH} "Désinstaller Cyber Pinball"
LangString L_DESINST_TITRE ${LANG_ENGLISH} "Uninstall Cyber Pinball"

LangString L_DESINST_ACCUEIL ${LANG_FRENCH} "Seule l'application est retirée : le dossier app et ses raccourcis (menu Démarrer, bureau, démarrage de Windows).$\r$\n$\r$\nRien d'autre n'est supprimé. Vos tables, médias, configuration, données (modèle de borne, sauvegardes), émulateurs et téléchargements restent dans le dossier racine :$\r$\n$Racine$\r$\n$\r$\nPour tout effacer, supprimez vous-même ce dossier après la désinstallation."
LangString L_DESINST_ACCUEIL ${LANG_ENGLISH} "Only the application is removed: the app folder and its shortcuts (Start menu, desktop, Windows startup).$\r$\n$\r$\nNothing else is deleted. Your tables, media, configuration, data (cabinet model, backups), emulators and downloads stay in the root folder:$\r$\n$Racine$\r$\n$\r$\nTo erase everything, delete this folder yourself after uninstalling."

LangString L_DESINST_SOUS_TITRE ${LANG_FRENCH} "Seule l'application est retirée : vos tables et vos données restent."
LangString L_DESINST_SOUS_TITRE ${LANG_ENGLISH} "Only the application is removed: your tables and data stay."

LangString L_DESINST_CONFIRMATION ${LANG_FRENCH} "L'application va être retirée de l'emplacement ci-dessous. Vos tables, médias, configuration et données ne sont pas touchés."
LangString L_DESINST_CONFIRMATION ${LANG_ENGLISH} "The application will be removed from the location below. Your tables, media, configuration and data are not touched."

LangString L_DESINST_EMPLACEMENT ${LANG_FRENCH} "Application :"
LangString L_DESINST_EMPLACEMENT ${LANG_ENGLISH} "Application:"

LangString L_DESINST_FIN_TITRE ${LANG_FRENCH} "Cyber Pinball est désinstallé"
LangString L_DESINST_FIN_TITRE ${LANG_ENGLISH} "Cyber Pinball is uninstalled"

LangString L_DESINST_FIN_TEXTE ${LANG_FRENCH} "L'application est retirée.$\r$\n$\r$\nVos tables, médias, configuration et données sont toujours dans le dossier racine :$\r$\n$Racine$\r$\n$\r$\nUne réinstallation dans ce dossier les retrouve telles quelles."
LangString L_DESINST_FIN_TEXTE ${LANG_ENGLISH} "The application is removed.$\r$\n$\r$\nYour tables, media, configuration and data are still in the root folder:$\r$\n$Racine$\r$\n$\r$\nReinstalling into this folder finds them as they are."

LangString L_DESINST_MAUVAIS_DOSSIER ${LANG_FRENCH} "Ce désinstalleur doit se trouver dans le dossier app de Cyber Pinball, à côté de ${EXE} et d'installation.ini. Rien n'a été supprimé."
LangString L_DESINST_MAUVAIS_DOSSIER ${LANG_ENGLISH} "This uninstaller must be in the app folder of Cyber Pinball, next to ${EXE} and installation.ini. Nothing was deleted."

LangString L_DESINST_BORNE_DEDIEE ${LANG_FRENCH} "Cyber Pinball s'ouvre encore avec Windows (Menu système > Borne > « Borne dédiée »).$\r$\n$\r$\nDésactivez-le d'abord dans Cyber Pinball : sans lui, la session de ce compte pourrait s'ouvrir sur un écran noir. En secours, les scripts du dossier :$\r$\n$Racine\data\borne-dediee$\r$\n$\r$\nDésinstaller quand même ?"
LangString L_DESINST_BORNE_DEDIEE ${LANG_ENGLISH} "Cyber Pinball still opens with Windows (System menu > Cabinet > “Dedicated cabinet”).$\r$\n$\r$\nTurn it off in Cyber Pinball first: without it, this account's session could open on a black screen. As a fallback, the scripts in the folder:$\r$\n$Racine\data\borne-dediee$\r$\n$\r$\nUninstall anyway?"

LangString L_DESINST_RACCOURCIS ${LANG_FRENCH} "Raccourcis"
LangString L_DESINST_RACCOURCIS ${LANG_ENGLISH} "Shortcuts"

LangString L_DESINST_PAREFEU ${LANG_FRENCH} "Pare-feu de Windows : règles de Cyber Pinball retirées (autorisation demandée)."
LangString L_DESINST_PAREFEU ${LANG_ENGLISH} "Windows Firewall: Cyber Pinball rules removed (approval requested)."

LangString L_DESINST_APPLICATION ${LANG_FRENCH} "Application : $INSTDIR"
LangString L_DESINST_APPLICATION ${LANG_ENGLISH} "Application: $INSTDIR"

LangString L_DESINST_FICHIERS_UTILISES ${LANG_FRENCH} "Certains fichiers de $INSTDIR sont encore utilisés : supprimez-les après un redémarrage."
LangString L_DESINST_FICHIERS_UTILISES ${LANG_ENGLISH} "Some files in $INSTDIR are still in use: delete them after a restart."

LangString L_DESINST_CONSERVES ${LANG_FRENCH} "Conservés dans $Racine : tables, media, config, data, emulators, downloads, import, trash."
LangString L_DESINST_CONSERVES ${LANG_ENGLISH} "Kept in $Racine: tables, media, config, data, emulators, downloads, import, trash."

!else
; ---------------------------------------------------------------------------
; Installeur

; Paragraphe sur VPX de la page d'accueil, selon la version (complète ou légère).
!ifdef COMPLET
  !define TEXTE_VPX_FR "Cette version complète contient aussi Visual Pinball X ${VPX_VERSION} : la borne l'installe au premier lancement, sans connexion à Internet."
  !define TEXTE_VPX_EN "This full edition also contains Visual Pinball X ${VPX_VERSION}: the cabinet installs it on first launch, without an Internet connection."
!else
  !define TEXTE_VPX_FR "Visual Pinball X sera téléchargé au premier lancement (environ 170 Mo), depuis sa page officielle, et vérifié avant installation."
  !define TEXTE_VPX_EN "Visual Pinball X will be downloaded on first launch (about 170 MB), from its official page, and checked before installation."
!endif

LangString L_ACCUEIL_TITRE ${LANG_FRENCH} "Installation de Cyber Pinball ${VERSION}"
LangString L_ACCUEIL_TITRE ${LANG_ENGLISH} "Cyber Pinball ${VERSION} setup"

LangString L_ACCUEIL_TEXTE ${LANG_FRENCH} "Cyber Pinball configure toute la borne de flipper virtuel à partir d'un seul modèle.$\r$\n$\r$\nTout s'installe dans un dossier racine que vous choisissez : l'application dans le sous-dossier app, et à côté les tables, médias, configuration, données et émulateurs.$\r$\n$\r$\n${TEXTE_VPX_FR}$\r$\n$\r$\nLa désinstallation retire l'application seulement : vos tables, médias, configuration et données restent dans le dossier racine."
LangString L_ACCUEIL_TEXTE ${LANG_ENGLISH} "Cyber Pinball sets up the whole virtual pinball cabinet from a single model.$\r$\n$\r$\nEverything is installed in a root folder of your choice: the application in the app subfolder, and next to it the tables, media, configuration, data and emulators.$\r$\n$\r$\n${TEXTE_VPX_EN}$\r$\n$\r$\nUninstalling removes the application only: your tables, media, configuration and data stay in the root folder."

LangString L_CONDITIONS_TITRE ${LANG_FRENCH} "Conditions d'utilisation"
LangString L_CONDITIONS_TITRE ${LANG_ENGLISH} "Terms of use"

LangString L_CONDITIONS_SOUS_TITRE ${LANG_FRENCH} "À lire avant d'installer Cyber Pinball."
LangString L_CONDITIONS_SOUS_TITRE ${LANG_ENGLISH} "To read before installing Cyber Pinball."

LangString L_CONDITIONS_HAUT ${LANG_FRENCH} "Contenus de tiers, partage entre bornes, usage commercial, santé et garantie :"
LangString L_CONDITIONS_HAUT ${LANG_ENGLISH} "Third-party content, sharing between cabinets, commercial use, health and warranty:"

LangString L_CONDITIONS_BAS ${LANG_FRENCH} "Si vous acceptez ces conditions et vous engagez à les respecter, cliquez sur J’accepte. Sinon, l'installation s'arrête. Elles restent à lire dans Menu système > Cyber Pinball > Conditions d’utilisation."
LangString L_CONDITIONS_BAS ${LANG_ENGLISH} "If you accept these terms and agree to follow them, click I accept. Otherwise, the installation stops. They can be read again in System menu > Cyber Pinball > Terms of use."

LangString L_CONDITIONS_BOUTON ${LANG_FRENCH} "J’&accepte"
LangString L_CONDITIONS_BOUTON ${LANG_ENGLISH} "I &accept"

; Le texte des conditions, écrit par scripts/installeur.mjs dans chaque langue (termsPage).
LicenseLangString L_CONDITIONS_FICHIER ${LANG_FRENCH} "${CONDITIONS_FR}"
LicenseLangString L_CONDITIONS_FICHIER ${LANG_ENGLISH} "${CONDITIONS_EN}"

LangString L_RACINE_TITRE ${LANG_FRENCH} "Dossier racine de la borne"
LangString L_RACINE_TITRE ${LANG_ENGLISH} "Cabinet root folder"

LangString L_RACINE_SOUS_TITRE ${LANG_FRENCH} "Cyber Pinball, ses émulateurs, les tables et les médias vivront dans ce dossier."
LangString L_RACINE_SOUS_TITRE ${LANG_ENGLISH} "Cyber Pinball, its emulators, the tables and the media will live in this folder."

LangString L_RACINE_HAUT ${LANG_FRENCH} "Choisissez le dossier racine, de préférence sur un disque local rapide (par exemple D:\CyberPinball). L'application ira dans le sous-dossier app ; les tables, médias, configuration, données, émulateurs et téléchargements à côté.$\r$\n$\r$\nRefusés : Program Files et Windows (protégés en écriture, alors que VPX et les tables écrivent à côté d'eux), et les dossiers réseau (VPX doit lire ses fichiers en local)."
LangString L_RACINE_HAUT ${LANG_ENGLISH} "Choose the root folder, preferably on a fast local drive (for example D:\CyberPinball). The application goes into the app subfolder; the tables, media, configuration, data, emulators and downloads next to it.$\r$\n$\r$\nNot allowed: Program Files and Windows (write-protected, while VPX and the tables write next to themselves), and network folders (VPX must read its files locally)."

LangString L_RACINE_DESTINATION ${LANG_FRENCH} "Dossier racine"
LangString L_RACINE_DESTINATION ${LANG_ENGLISH} "Root folder"

LangString L_OPTIONS_HAUT ${LANG_FRENCH} "Cochez les options souhaitées."
LangString L_OPTIONS_HAUT ${LANG_ENGLISH} "Tick the options you want."

LangString L_FIN_TITRE ${LANG_FRENCH} "Cyber Pinball est installé"
LangString L_FIN_TITRE ${LANG_ENGLISH} "Cyber Pinball is installed"

LangString L_FIN_TEXTE ${LANG_FRENCH} "Cyber Pinball est installé dans $Racine\app.$\r$\n$\r$\nAu premier lancement, il propose d'installer Visual Pinball X puis de configurer les écrans de la borne."
LangString L_FIN_TEXTE ${LANG_ENGLISH} "Cyber Pinball is installed in $Racine\app.$\r$\n$\r$\nOn first launch, it offers to install Visual Pinball X, then to set up the cabinet's screens."

LangString L_FIN_LANCER ${LANG_FRENCH} "Lancer Cyber Pinball"
LangString L_FIN_LANCER ${LANG_ENGLISH} "Launch Cyber Pinball"

LangString L_POINTEUR_ECHEC ${LANG_FRENCH} "Impossible d'écrire $Pointeur : l'application le fera à son premier lancement."
LangString L_POINTEUR_ECHEC ${LANG_ENGLISH} "Could not write $Pointeur: the application will do it on first launch."

LangString L_POINTEUR_OK ${LANG_FRENCH} "Racine mémorisée dans $Pointeur"
LangString L_POINTEUR_OK ${LANG_ENGLISH} "Root folder saved in $Pointeur"

LangString L_LANGUE_OK ${LANG_FRENCH} "Langue de Cyber Pinball : français"
LangString L_LANGUE_OK ${LANG_ENGLISH} "Cyber Pinball language: English"

LangString L_RACINE_PROTEGEE ${LANG_FRENCH} "$5 est protégé en écriture ; VPX et les tables ont besoin d'écrire à côté d'eux (scores, réglages)."
LangString L_RACINE_PROTEGEE ${LANG_ENGLISH} "$5 is write-protected; VPX and the tables need to write next to themselves (scores, settings)."

LangString L_RACINE_RESEAU ${LANG_FRENCH} "Un dossier réseau ne convient pas : VPX doit lire ses fichiers en local."
LangString L_RACINE_RESEAU ${LANG_ENGLISH} "A network folder will not do: VPX must read its files locally."

LangString L_RACINE_INCOMPLETE ${LANG_FRENCH} "Le dossier doit être un chemin complet, par exemple D:\CyberPinball."
LangString L_RACINE_INCOMPLETE ${LANG_ENGLISH} "The folder must be a full path, for example D:\CyberPinball."

LangString L_RACINE_LECTEUR_RESEAU ${LANG_FRENCH} "$1 est un lecteur réseau : VPX doit lire ses fichiers en local."
LangString L_RACINE_LECTEUR_RESEAU ${LANG_ENGLISH} "$1 is a network drive: VPX must read its files locally."

LangString L_RACINE_DISQUE_ABSENT ${LANG_FRENCH} "Le disque $1 n'existe pas."
LangString L_RACINE_DISQUE_ABSENT ${LANG_ENGLISH} "Drive $1 does not exist."

LangString L_RACINE_APP_ETRANGER ${LANG_FRENCH} "$Racine\app existe déjà et ne contient pas Cyber Pinball. Choisissez un autre dossier racine, ou videz ce dossier app."
LangString L_RACINE_APP_ETRANGER ${LANG_ENGLISH} "$Racine\app already exists and does not contain Cyber Pinball. Choose another root folder, or empty this app folder."

LangString L_REMPLACEMENT ${LANG_FRENCH} "Remplacement de la version installée"
LangString L_REMPLACEMENT ${LANG_ENGLISH} "Replacing the installed version"

LangString L_MAJ_FICHIERS_UTILISES ${LANG_FRENCH} "Des fichiers de $Racine\app sont encore utilisés : rien n'a été modifié, Cyber Pinball redémarre."
LangString L_MAJ_FICHIERS_UTILISES ${LANG_ENGLISH} "Some files in $Racine\app are still in use: nothing was changed, Cyber Pinball restarts."

LangString L_FICHIERS_UTILISES ${LANG_FRENCH} "Des fichiers de $Racine\app sont encore utilisés : rien n'a été modifié."
LangString L_FICHIERS_UTILISES ${LANG_ENGLISH} "Some files in $Racine\app are still in use: nothing was changed."

LangString L_REPRISE_MODELE ${LANG_FRENCH} "Reprise du modèle de borne de $AnciennesDonnees"
LangString L_REPRISE_MODELE ${LANG_ENGLISH} "Taking over the cabinet model from $AnciennesDonnees"

LangString L_RACCOURCI_DESCRIPTION ${LANG_FRENCH} "Frontend de borne de flipper virtuel"
LangString L_RACCOURCI_DESCRIPTION ${LANG_ENGLISH} "Virtual pinball cabinet frontend"

LangString L_BAC_A_SABLE ${LANG_FRENCH} "Bac à sable ($BacASable) : pas d'entrée dans Programmes et fonctionnalités."
LangString L_BAC_A_SABLE ${LANG_ENGLISH} "Sandbox ($BacASable): no entry in Programs and Features."

LangString L_NOM_RUNTIME ${LANG_FRENCH} "Runtime Visual C++ de Microsoft, pour VPX (s'il manque)"
LangString L_NOM_RUNTIME ${LANG_ENGLISH} "Microsoft Visual C++ runtime, for VPX (if missing)"

LangString L_RUNTIME_BAC ${LANG_FRENCH} "Runtime Visual C++ : bac à sable d'essai, rien n'est installé."
LangString L_RUNTIME_BAC ${LANG_ENGLISH} "Visual C++ runtime: test sandbox, nothing is installed."

LangString L_RUNTIME_PLUS_TARD ${LANG_FRENCH} "Runtime Visual C++ : vérifié par Cyber Pinball au démarrage."
LangString L_RUNTIME_PLUS_TARD ${LANG_ENGLISH} "Visual C++ runtime: checked by Cyber Pinball at startup."

LangString L_RUNTIME_VERIFICATION ${LANG_FRENCH} "Runtime Visual C++ : vérification ; Windows demande votre accord s'il faut l'installer."
LangString L_RUNTIME_VERIFICATION ${LANG_ENGLISH} "Visual C++ runtime: checking; Windows asks for your approval if it must be installed."

LangString L_RUNTIME_PRET ${LANG_FRENCH} "Runtime Visual C++ : prêt."
LangString L_RUNTIME_PRET ${LANG_ENGLISH} "Visual C++ runtime: ready."

LangString L_RUNTIME_REFUS ${LANG_FRENCH} "Runtime Visual C++ : pas d'accord de Windows ; Cyber Pinball le redemandera."
LangString L_RUNTIME_REFUS ${LANG_ENGLISH} "Visual C++ runtime: no approval from Windows; Cyber Pinball will ask again."

LangString L_RUNTIME_ECHEC ${LANG_FRENCH} "Runtime Visual C++ : pas installé (code $0) ; Cyber Pinball le redemandera."
LangString L_RUNTIME_ECHEC ${LANG_ENGLISH} "Visual C++ runtime: not installed (code $0); Cyber Pinball will ask again."

LangString L_NOM_BUREAU ${LANG_FRENCH} "Raccourci sur le bureau"
LangString L_NOM_BUREAU ${LANG_ENGLISH} "Desktop shortcut"

LangString L_NOM_DEMARRAGE ${LANG_FRENCH} "Lancer au démarrage de Windows (borne dédiée)"
LangString L_NOM_DEMARRAGE ${LANG_ENGLISH} "Start with Windows (dedicated cabinet)"

LangString L_NOM_PAREFEU ${LANG_FRENCH} "Partage entre bornes : autoriser dans le pare-feu de Windows"
LangString L_NOM_PAREFEU ${LANG_ENGLISH} "Sharing between cabinets: allow in Windows Firewall"

LangString L_PAREFEU_BAC ${LANG_FRENCH} "Pare-feu de Windows : bac à sable d'essai, rien n'est demandé."
LangString L_PAREFEU_BAC ${LANG_ENGLISH} "Windows Firewall: test sandbox, nothing is requested."

LangString L_PAREFEU_DEJA ${LANG_FRENCH} "Pare-feu de Windows : Cyber Pinball est déjà autorisé, VPX déjà fermé au réseau."
LangString L_PAREFEU_DEJA ${LANG_ENGLISH} "Windows Firewall: Cyber Pinball is already allowed, VPX already closed to the network."

LangString L_PAREFEU_PLUS_TARD ${LANG_FRENCH} "Pare-feu de Windows : à autoriser depuis Menu système > Amis > Partage et réseau."
LangString L_PAREFEU_PLUS_TARD ${LANG_ENGLISH} "Windows Firewall: to be allowed from System menu > Friends > Sharing and network."

LangString L_PAREFEU_DEMANDE ${LANG_FRENCH} "Pare-feu de Windows : autorisation demandée à Windows."
LangString L_PAREFEU_DEMANDE ${LANG_ENGLISH} "Windows Firewall: approval requested from Windows."

LangString L_PAREFEU_OK ${LANG_FRENCH} "Pare-feu de Windows : Cyber Pinball autorisé, VPX fermé au réseau."
LangString L_PAREFEU_OK ${LANG_ENGLISH} "Windows Firewall: Cyber Pinball allowed, VPX closed to the network."

LangString L_PAREFEU_REFUS ${LANG_FRENCH} "Pare-feu de Windows : pas autorisé (refusé ?) ; Menu système > Amis > Partage et réseau le propose."
LangString L_PAREFEU_REFUS ${LANG_ENGLISH} "Windows Firewall: not allowed (declined?); System menu > Friends > Sharing and network offers it."

LangString L_DESC_APP ${LANG_FRENCH} "L'application, dans le sous-dossier app de la racine, avec un raccourci dans le menu Démarrer."
LangString L_DESC_APP ${LANG_ENGLISH} "The application, in the app subfolder of the root folder, with a shortcut in the Start menu."

!ifdef COMPLET
LangString L_DESC_VPX ${LANG_FRENCH} "Archive officielle de Visual Pinball X ${VPX_VERSION}, vérifiée, copiée dans downloads : installée au premier lancement sans connexion. Licence : redistribution gratuite, sans usage commercial."
LangString L_DESC_VPX ${LANG_ENGLISH} "Official Visual Pinball X ${VPX_VERSION} archive, checked, copied into downloads: installed on first launch without a connection. Licence: free redistribution, no commercial use."
!endif

LangString L_DESC_BUREAU ${LANG_FRENCH} "Un raccourci Cyber Pinball sur le bureau."
LangString L_DESC_BUREAU ${LANG_ENGLISH} "A Cyber Pinball shortcut on the desktop."

LangString L_DESC_DEMARRAGE ${LANG_FRENCH} "Pour une borne dédiée : Cyber Pinball s'ouvre dès l'ouverture de la session Windows."
LangString L_DESC_DEMARRAGE ${LANG_ENGLISH} "For a dedicated cabinet: Cyber Pinball opens as soon as the Windows session opens."

LangString L_DESC_PAREFEU ${LANG_FRENCH} "Amis et partage entre bornes : Windows demande une fois son autorisation, pour que son pare-feu ne bloque pas Cyber Pinball, ferme VPX au réseau, et n'affiche pas son invite sur la borne."
LangString L_DESC_PAREFEU ${LANG_ENGLISH} "Friends and sharing between cabinets: Windows asks once for its approval, so that its firewall does not block Cyber Pinball, closes VPX to the network, and does not show its prompt on the cabinet."

!endif
