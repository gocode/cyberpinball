; Installeur de Cyber Pinball (NSIS 3, Unicode).
;
; Compilé par scripts/installeur.mjs, qui fournit les !define ci-dessous : ne pas
; lancer makensis à la main. Deux passes :
;   1. ECRIRE_DESINSTALLEUR : un petit exécutable qui écrit le désinstalleur
;      (pour pouvoir le signer avant de l'embarquer) ;
;   2. l'installeur lui-même, léger ou complet (COMPLET : archive de VPX incluse).
;
; Défines : VERSION, VERSION_WIN (a.b.c.d), ICONE, BANDEAU (164 × 314, pages d’accueil et de fin), puis
;   passe 1 : DESINSTALLEUR_ECRIVAIN (exe produit), DESINSTALLEUR_SORTIE (désinstalleur écrit) ;
;   passe 2 : SORTIE, APP_DIR (release\win-unpacked), DESINSTALLEUR (désinstalleur signé ou non),
;             et pour la version complète : COMPLET, VPX_ARCHIVE, VPX_ARCHIVE_NOM, VPX_NOTICE, VPX_VERSION.
;   SITE : adresse du dépôt (« repository » du package.json racine).
;
; Mise à jour depuis l'application (/MAJ, lancé par le menu système, voir
; packages/core/src/update.ts) : seule la page de progression s'affiche ; l'installeur
; attend que Cyber Pinball se ferme, garde les raccourcis choisis à l'installation
; précédente, remet l'ancien dossier app en place s'il échoue, puis relance Cyber Pinball
; avec les arguments de CYBERPINBALL_MAJ_ARGS.
;
; Toute l'installation vit dans une racine choisie (D:\CyberPinball par défaut) :
; l'application dans <racine>\app, le reste (tables, médias, configuration,
; données, émulateurs, téléchargements) à côté. La désinstallation ne retire que
; <racine>\app et les raccourcis.
;
; Bac à sable : si la variable d'environnement CYBERPINBALL_HOME est définie,
; rien n'est écrit hors de ce dossier et de la racine (root.json, raccourcis
; « menu Démarrer », « bureau » et « démarrage » y sont rangés, pas d'entrée
; dans Programmes et fonctionnalités). Sert aux essais de l'installeur.

Unicode true
ManifestDPIAware true
RequestExecutionLevel user
; Non solide : chaque fichier est compressé à part, ce qui permet de stocker
; tel quel l'archive de VPX, déjà compressée.
SetCompressor /FINAL lzma

!define PRODUIT "Cyber Pinball"
!define EXE "CyberPinball.exe"
!define DESINSTALLEUR_NOM "Désinstaller Cyber Pinball.exe"
!define CLE_DESINSTALLATION "Software\Microsoft\Windows\CurrentVersion\Uninstall\CyberPinball"

Name "${PRODUIT}"
BrandingText "${PRODUIT} ${VERSION}"
ShowInstDetails show
ShowUninstDetails show

!ifdef ECRIRE_DESINSTALLEUR
  OutFile "${DESINSTALLEUR_ECRIVAIN}"
!else
  OutFile "${SORTIE}"
!endif

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WordFunc.nsh"
!include "Sections.nsh"

Var Racine
Var Pointeur
Var BacASable
Var MenuDir
Var BureauDir
Var DemarrageDir
Var AnciennesDonnees
; « 1 » : mise à jour depuis l'application (/MAJ).
Var Maj

; ---------------------------------------------------------------------------
; Interface

!define MUI_ICON "${ICONE}"
!define MUI_UNICON "${ICONE}"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${BANDEAU}"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${BANDEAU}"
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "Abandonner l'installation de Cyber Pinball ?"

!ifndef ECRIRE_DESINSTALLEUR
  !define MUI_WELCOMEPAGE_TITLE "Installation de Cyber Pinball ${VERSION}"
  !ifdef COMPLET
    !define TEXTE_VPX "Cette version complète contient aussi Visual Pinball X ${VPX_VERSION} : la borne l'installe au premier lancement, sans connexion à Internet."
  !else
    !define TEXTE_VPX "Visual Pinball X sera téléchargé au premier lancement (environ 170 Mo), depuis sa page officielle, et vérifié avant installation."
  !endif
  !define MUI_WELCOMEPAGE_TEXT "Cyber Pinball configure toute la borne de flipper virtuel à partir d'un seul modèle.$\r$\n$\r$\nTout s'installe dans un dossier racine que vous choisissez : l'application dans le sous-dossier app, et à côté les tables, médias, configuration, données et émulateurs.$\r$\n$\r$\n${TEXTE_VPX}$\r$\n$\r$\nLa désinstallation retire l'application seulement : vos tables, médias, configuration et données restent dans le dossier racine."
  !define MUI_PAGE_CUSTOMFUNCTION_PRE PasserEnMiseAJour
  !insertmacro MUI_PAGE_WELCOME

  !define MUI_PAGE_HEADER_TEXT "Dossier racine de la borne"
  !define MUI_PAGE_HEADER_SUBTEXT "Cyber Pinball, ses émulateurs, les tables et les médias vivront dans ce dossier."
  !define MUI_DIRECTORYPAGE_TEXT_TOP "Choisissez le dossier racine, de préférence sur un disque local rapide (par exemple D:\CyberPinball). L'application ira dans le sous-dossier app ; les tables, médias, configuration, données, émulateurs et téléchargements à côté.$\r$\n$\r$\nRefusés : Program Files et Windows (protégés en écriture, alors que VPX et les tables écrivent à côté d'eux), et les dossiers réseau (VPX doit lire ses fichiers en local)."
  !define MUI_DIRECTORYPAGE_TEXT_DESTINATION "Dossier racine"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE PasserEnMiseAJour
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE PageRacineQuitter
  !insertmacro MUI_PAGE_DIRECTORY

  !define MUI_COMPONENTSPAGE_SMALLDESC
  !define MUI_COMPONENTSPAGE_TEXT_TOP "Cochez les options souhaitées."
  !define MUI_PAGE_CUSTOMFUNCTION_PRE PasserEnMiseAJour
  !insertmacro MUI_PAGE_COMPONENTS

  !insertmacro MUI_PAGE_INSTFILES

  !define MUI_FINISHPAGE_TITLE "Cyber Pinball est installé"
  !define MUI_FINISHPAGE_TEXT "Cyber Pinball est installé dans $Racine\app.$\r$\n$\r$\nAu premier lancement, il propose d'installer Visual Pinball X puis de configurer les écrans de la borne."
  !define MUI_FINISHPAGE_RUN "$Racine\app\${EXE}"
  !define MUI_FINISHPAGE_RUN_TEXT "Lancer Cyber Pinball"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE PasserEnMiseAJour
  !insertmacro MUI_PAGE_FINISH
!else
  ; L'explication complète va sur la page d'accueil : celle de confirmation n'a
  ; que trois lignes de texte.
  !define MUI_WELCOMEPAGE_TITLE "Désinstaller Cyber Pinball"
  !define MUI_WELCOMEPAGE_TEXT "Seule l'application est retirée : le dossier app et ses raccourcis (menu Démarrer, bureau, démarrage de Windows).$\r$\n$\r$\nRien d'autre n'est supprimé. Vos tables, médias, configuration, données (modèle de borne, sauvegardes), émulateurs et téléchargements restent dans le dossier racine :$\r$\n$Racine$\r$\n$\r$\nPour tout effacer, supprimez vous-même ce dossier après la désinstallation."
  !insertmacro MUI_UNPAGE_WELCOME
  !define MUI_PAGE_HEADER_TEXT "Désinstaller Cyber Pinball"
  !define MUI_PAGE_HEADER_SUBTEXT "Seule l'application est retirée : vos tables et vos données restent."
  !define MUI_UNCONFIRMPAGE_TEXT_TOP "L'application va être retirée de l'emplacement ci-dessous. Vos tables, médias, configuration et données ne sont pas touchés."
  !define MUI_UNCONFIRMPAGE_TEXT_LOCATION "Application :"
  !insertmacro MUI_UNPAGE_CONFIRM
  !insertmacro MUI_UNPAGE_INSTFILES
  !define MUI_FINISHPAGE_TITLE "Cyber Pinball est désinstallé"
  !define MUI_FINISHPAGE_TEXT "L'application est retirée.$\r$\n$\r$\nVos tables, médias, configuration et données sont toujours dans le dossier racine :$\r$\n$Racine$\r$\n$\r$\nUne réinstallation dans ce dossier les retrouve telles quelles."
  !insertmacro MUI_UNPAGE_FINISH
!endif

!insertmacro MUI_LANGUAGE "French"

VIProductVersion "${VERSION_WIN}"
VIAddVersionKey /LANG=${LANG_FRENCH} "ProductName" "${PRODUIT}"
VIAddVersionKey /LANG=${LANG_FRENCH} "CompanyName" "${PRODUIT}"
VIAddVersionKey /LANG=${LANG_FRENCH} "LegalCopyright" "Cyber Pinball, logiciel libre"
VIAddVersionKey /LANG=${LANG_FRENCH} "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_FRENCH} "ProductVersion" "${VERSION}"
!ifdef ECRIRE_DESINSTALLEUR
  VIAddVersionKey /LANG=${LANG_FRENCH} "FileDescription" "Désinstalleur de ${PRODUIT}"
!else ifdef COMPLET
  VIAddVersionKey /LANG=${LANG_FRENCH} "FileDescription" "Installeur de ${PRODUIT} (version complète, avec Visual Pinball X)"
!else
  VIAddVersionKey /LANG=${LANG_FRENCH} "FileDescription" "Installeur de ${PRODUIT}"
!endif

; ---------------------------------------------------------------------------
; Fonctions communes à l'installeur et au désinstalleur (préfixe « un. »)

; Emplacements des raccourcis, du fichier root.json et des données d'avant le
; choix d'une racine : les vrais, ou ceux du bac à sable quand CYBERPINBALL_HOME
; est défini ($BacASable non vide ; l'application y range alors ses données).
!macro FONCTION_EMPLACEMENTS un
Function ${un}Emplacements
  SetShellVarContext current
  ${If} $BacASable != ""
    StrCpy $Pointeur "$BacASable\root.json"
    StrCpy $MenuDir "$BacASable\Menu Démarrer"
    StrCpy $BureauDir "$BacASable\Bureau"
    StrCpy $DemarrageDir "$BacASable\Démarrage"
    StrCpy $AnciennesDonnees "$BacASable"
  ${Else}
    StrCpy $Pointeur "$APPDATA\CyberPinball\root.json"
    StrCpy $MenuDir "$SMPROGRAMS"
    StrCpy $BureauDir "$DESKTOP"
    StrCpy $DemarrageDir "$SMSTARTUP"
    StrCpy $AnciennesDonnees "$APPDATA\CyberPinball"
  ${EndIf}
FunctionEnd
!macroend

; Attend que Cyber Pinball soit fermé. Entrée : $0 = chemin de CyberPinball.exe.
; Un exécutable en cours d'exécution ne peut pas être ouvert en écriture.
; En mise à jour, l'application se ferme d'elle-même : jusqu'à 60 s d'attente avant de demander.
!macro FONCTION_APPLICATION_FERMEE un
Function ${un}ApplicationFermee
  ${IfNot} ${FileExists} "$0"
    Return
  ${EndIf}
  StrCpy $2 0
  essai:
  ClearErrors
  FileOpen $1 "$0" a
  ; Tester ${Errors} efface l'indicateur : un seul test.
  ${IfNot} ${Errors}
    FileClose $1
    Return
  ${EndIf}
  ${If} $Maj == "1"
  ${AndIf} $2 < 120
    IntOp $2 $2 + 1
    Sleep 500
    Goto essai
  ${EndIf}
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Cyber Pinball est ouvert. Fermez-le, puis cliquez sur Réessayer." /SD IDCANCEL IDRETRY essai
  Abort "Cyber Pinball est ouvert : rien n'a été modifié."
FunctionEnd
!macroend

; ---------------------------------------------------------------------------
!ifdef ECRIRE_DESINSTALLEUR
; Passe 1 : écrit le désinstalleur, puis quitte.

Function .onInit
  WriteUninstaller "${DESINSTALLEUR_SORTIE}"
  Quit
FunctionEnd

Section
SectionEnd

!insertmacro FONCTION_EMPLACEMENTS "un."
!insertmacro FONCTION_APPLICATION_FERMEE "un."

; Le désinstalleur reste dans <racine>\app : $INSTDIR est ce dossier.
Function un.onInit
  ${GetParent} "$INSTDIR" $Racine
  ${GetFileName} "$INSTDIR" $0
  ; Sécurité : on ne supprime qu'un dossier app\ créé par cet installeur.
  ${If} $0 != "app"
  ${OrIfNot} ${FileExists} "$INSTDIR\installation.ini"
  ${OrIfNot} ${FileExists} "$INSTDIR\${EXE}"
    MessageBox MB_ICONSTOP "Ce désinstalleur doit se trouver dans le dossier app de Cyber Pinball, à côté de ${EXE} et d'installation.ini. Rien n'a été supprimé." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ReadINIStr $BacASable "$INSTDIR\installation.ini" "installation" "bac_a_sable"
  Call un.Emplacements
FunctionEnd

Section "Uninstall"
  StrCpy $0 "$INSTDIR\${EXE}"
  Call un.ApplicationFermee

  DetailPrint "Raccourcis"
  Delete "$MenuDir\${PRODUIT}.lnk"
  Delete "$BureauDir\${PRODUIT}.lnk"
  Delete "$DemarrageDir\${PRODUIT}.lnk"
  Delete "$Racine\${PRODUIT}.lnk"

  ; L'entrée de Programmes et fonctionnalités, si elle désigne bien cette racine.
  ReadINIStr $1 "$INSTDIR\installation.ini" "installation" "registre"
  ReadRegStr $2 HKCU "${CLE_DESINSTALLATION}" "RacineCyberPinball"
  ${If} $1 == "1"
  ${AndIf} $2 == $Racine
    DeleteRegKey HKCU "${CLE_DESINSTALLATION}"
  ${EndIf}

  DetailPrint "Application : $INSTDIR"
  SetOutPath "$TEMP"
  RMDir /r "$INSTDIR"
  ${If} ${FileExists} "$INSTDIR\*.*"
    DetailPrint "Certains fichiers de $INSTDIR sont encore utilisés : supprimez-les après un redémarrage."
  ${EndIf}

  ; root.json est gardé : une réinstallation retrouve la même racine.
  DetailPrint "Conservés dans $Racine : tables, media, config, data, emulators, downloads, import, trash."
SectionEnd

!else
; ---------------------------------------------------------------------------
; Passe 2 : l'installeur.

!insertmacro FONCTION_EMPLACEMENTS ""
!insertmacro FONCTION_APPLICATION_FERMEE ""

; Lit la racine mémorisée dans root.json (UTF-8). Sortie : $0, vide si absente.
Function LirePointeur
  StrCpy $0 ""
  ${IfNot} ${FileExists} "$Pointeur"
    Return
  ${EndIf}
  ClearErrors
  FileOpen $1 "$Pointeur" r
  ${If} ${Errors}
    Return
  ${EndIf}
  System::Alloc 4096
  Pop $2
  System::Call "kernel32::ReadFile(p r1, p r2, i 4095, *i .r3, p 0)"
  FileClose $1
  System::Call "kernel32::MultiByteToWideChar(i 65001, i 0, p r2, i r3, w .r4, i ${NSIS_MAX_STRLEN}) i .r5"
  System::Free $2
  ${If} $5 <= 0
    Return
  ${EndIf}
  StrCpy $4 $4 $5
  ; {"root": "D:\\CyberPinball"} : le texte après "root", puis le premier texte entre guillemets.
  ${WordFind} $4 '"root"' "E+1}" $6
  IfErrors fin
  ${WordFind} $6 '"' "E+2" $7
  IfErrors fin
  ${WordReplace} $7 "\\" "\" "+" $0
  fin:
FunctionEnd

; Écrit root.json en UTF-8, au même format que l'application.
Function EcrirePointeur
  ${WordReplace} $Racine "\" "\\" "+" $1
  StrCpy $1 '{$\n  "root": "$1"$\n}$\n'
  ${GetParent} "$Pointeur" $2
  CreateDirectory "$2"
  ClearErrors
  FileOpen $2 "$Pointeur" w
  ${If} ${Errors}
    DetailPrint "Impossible d'écrire $Pointeur : l'application le fera à son premier lancement."
    Return
  ${EndIf}
  System::Call "kernel32::WideCharToMultiByte(i 65001, i 0, w r1, i -1, p 0, i 0, p 0, p 0) i .r3"
  System::Alloc $3
  Pop $4
  System::Call "kernel32::WideCharToMultiByte(i 65001, i 0, w r1, i -1, p r4, i r3, p 0, p 0)"
  IntOp $3 $3 - 1
  System::Call "kernel32::WriteFile(p r2, p r4, i r3, *i .r5, p 0)"
  System::Free $4
  FileClose $2
  DetailPrint "Racine mémorisée dans $Pointeur"
FunctionEnd

; Refuse un dossier situé dans DOSSIER (ou égal à lui). $0 reçoit le message.
!macro REFUSER_DANS DOSSIER
  ${If} $0 == ""
  ${AndIf} "${DOSSIER}" != ""
    StrLen $2 "${DOSSIER}"
    StrCpy $3 $Racine $2
    StrCpy $4 $Racine 1 $2
    ${If} $3 == "${DOSSIER}"
      ${If} $4 == ""
      ${OrIf} $4 == "\"
        StrCpy $0 "${DOSSIER} est protégé en écriture ; VPX et les tables ont besoin d'écrire à côté d'eux (scores, réglages)."
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

; Mêmes refus que packages/installer (checkRoot) : chemin incomplet, dossier
; réseau, Program Files, Windows. S'y ajoutent les lecteurs réseau et les
; disques absents. Entrée : $INSTDIR. Sortie : $Racine normalisée, $0 = message ou vide.
Function VerifierRacine
  StrCpy $0 ""
  StrCpy $Racine $INSTDIR
  ; Sans la barre oblique finale (sauf pour « D:\ »).
  StrLen $1 $Racine
  ${If} $1 > 3
    StrCpy $2 $Racine 1 -1
    ${If} $2 == "\"
      StrCpy $Racine $Racine -1
    ${EndIf}
  ${EndIf}

  StrCpy $1 $Racine 2
  StrCpy $2 $Racine 1 1
  StrCpy $3 $Racine 1 2
  ${If} $1 == "\\"
    StrCpy $0 "Un dossier réseau ne convient pas : VPX doit lire ses fichiers en local."
    Return
  ${ElseIf} $2 != ":"
  ${OrIf} $3 != "\"
    StrCpy $0 "Le dossier doit être un chemin complet, par exemple D:\CyberPinball."
    Return
  ${EndIf}

  StrCpy $1 $Racine 3
  System::Call "kernel32::GetDriveTypeW(w r1) i .r2"
  ${If} $2 == 4
    StrCpy $0 "$1 est un lecteur réseau : VPX doit lire ses fichiers en local."
    Return
  ${ElseIf} $2 == 1
    StrCpy $0 "Le disque $1 n'existe pas."
    Return
  ${EndIf}

  !insertmacro REFUSER_DANS "$PROGRAMFILES32"
  !insertmacro REFUSER_DANS "$PROGRAMFILES64"
  !insertmacro REFUSER_DANS "$WINDIR"
FunctionEnd

; D'abord l'installation précédente, puis root.json, puis D:\CyberPinball si D:
; est un disque local, sinon C:\CyberPinball.
Function RacineParDefaut
  ${If} $BacASable == ""
    ReadRegStr $0 HKCU "${CLE_DESINSTALLATION}" "RacineCyberPinball"
    ${If} $0 != ""
      StrCpy $INSTDIR $0
      Return
    ${EndIf}
  ${EndIf}
  Call LirePointeur
  ${If} $0 != ""
    StrCpy $INSTDIR $0
    Return
  ${EndIf}
  StrCpy $2 "D:\"
  System::Call "kernel32::GetDriveTypeW(w r2) i .r1"
  ${If} $1 == 3
    StrCpy $INSTDIR "D:\CyberPinball"
  ${Else}
    StrCpy $INSTDIR "C:\CyberPinball"
  ${EndIf}
FunctionEnd

Function PageRacineQuitter
  Call VerifierRacine
  ${If} $0 != ""
    MessageBox MB_ICONEXCLAMATION "$0"
    Abort
  ${EndIf}
  ${If} ${FileExists} "$Racine\app\*.*"
  ${AndIfNot} ${FileExists} "$Racine\app\${EXE}"
    MessageBox MB_ICONEXCLAMATION "$Racine\app existe déjà et ne contient pas Cyber Pinball. Choisissez un autre dossier racine, ou videz ce dossier app."
    Abort
  ${EndIf}
FunctionEnd

Section "Cyber Pinball" SEC_APP
  SectionIn RO
  Call VerifierRacine
  ${If} $0 != ""
    Abort "$0"
  ${EndIf}
  StrCpy $INSTDIR $Racine

  StrCpy $0 "$Racine\app\${EXE}"
  Call ApplicationFermee

  ; app\ est remplacé en entier, comme au déploiement : rien d'autre n'y vit. L'ancien
  ; dossier devient app.precedente jusqu'à la fin de l'installation : remis en place si
  ; elle échoue (.onInstFailed), supprimé si elle réussit (.onInstSuccess).
  RMDir /r "$Racine\app.precedente"
  ${If} ${FileExists} "$Racine\app\${EXE}"
    DetailPrint "Remplacement de la version installée"
    ClearErrors
    Rename "$Racine\app" "$Racine\app.precedente"
    ${If} ${Errors}
      Abort "Des fichiers de $Racine\app sont encore utilisés : rien n'a été modifié."
    ${EndIf}
  ${EndIf}
  SetOutPath "$Racine\app"
  File /r "${APP_DIR}\*.*"
  File "/oname=${DESINSTALLEUR_NOM}" "${DESINSTALLEUR}"

  ; Organisation de la racine (comme setupRoot de packages/installer).
  CreateDirectory "$Racine\emulators"
  CreateDirectory "$Racine\tables"
  CreateDirectory "$Racine\media"
  CreateDirectory "$Racine\data"
  CreateDirectory "$Racine\config"
  CreateDirectory "$Racine\downloads"
  CreateDirectory "$Racine\import"
  Call EcrirePointeur

  ; Données d'avant le choix d'une racine (comme setupRoot) : modèle de borne,
  ; sauvegardes, VPinballX.ini du bac à sable. Copiées si absentes, jamais écrasées.
  ${If} ${FileExists} "$AnciennesDonnees\cabinet.json"
  ${AndIfNot} ${FileExists} "$Racine\data\cabinet.json"
    DetailPrint "Reprise du modèle de borne de $AnciennesDonnees"
    CopyFiles /SILENT "$AnciennesDonnees\cabinet.json" "$Racine\data"
  ${EndIf}
  ${If} ${FileExists} "$AnciennesDonnees\backups\*.*"
  ${AndIfNot} ${FileExists} "$Racine\data\backups\*.*"
    CopyFiles /SILENT "$AnciennesDonnees\backups" "$Racine\data"
  ${EndIf}
  ${If} ${FileExists} "$AnciennesDonnees\sandbox\VPinballX.ini"
  ${AndIfNot} ${FileExists} "$Racine\config\VPinballX.ini"
    CopyFiles /SILENT "$AnciennesDonnees\sandbox\VPinballX.ini" "$Racine\config"
  ${EndIf}

  ; Journal lu par le désinstalleur, en UTF-16 pour garder les accents des chemins.
  FileOpen $1 "$Racine\app\installation.ini" w
  FileWriteWord $1 0xFEFF
  FileClose $1
  WriteINIStr "$Racine\app\installation.ini" "installation" "version" "${VERSION}"
  WriteINIStr "$Racine\app\installation.ini" "installation" "racine" "$Racine"
  WriteINIStr "$Racine\app\installation.ini" "installation" "bac_a_sable" "$BacASable"
  !ifdef COMPLET
    WriteINIStr "$Racine\app\installation.ini" "installation" "edition" "complète"
  !else
    WriteINIStr "$Racine\app\installation.ini" "installation" "edition" "légère"
  !endif

  ; Raccourcis : à la racine (comme le déploiement) et dans le menu Démarrer.
  ; Ceux du bureau et du démarrage sont refaits selon les options cochées.
  SetOutPath "$Racine\app"
  CreateShortCut "$Racine\${PRODUIT}.lnk" "$Racine\app\${EXE}" "" "$Racine\app\${EXE}" 0
  CreateDirectory "$MenuDir"
  CreateShortCut "$MenuDir\${PRODUIT}.lnk" "$Racine\app\${EXE}" "" "$Racine\app\${EXE}" 0 SW_SHOWNORMAL "" "Frontend de borne de flipper virtuel"
  Delete "$BureauDir\${PRODUIT}.lnk"
  Delete "$DemarrageDir\${PRODUIT}.lnk"

  ${If} $BacASable == ""
    WriteRegStr HKCU "${CLE_DESINSTALLATION}" "DisplayName" "${PRODUIT}"
    WriteRegStr HKCU "${CLE_DESINSTALLATION}" "DisplayVersion" "${VERSION}"
    WriteRegStr HKCU "${CLE_DESINSTALLATION}" "Publisher" "${PRODUIT}"
    WriteRegStr HKCU "${CLE_DESINSTALLATION}" "DisplayIcon" "$Racine\app\${EXE}"
    WriteRegStr HKCU "${CLE_DESINSTALLATION}" "InstallLocation" "$Racine\app"
    WriteRegStr HKCU "${CLE_DESINSTALLATION}" "UninstallString" '"$Racine\app\${DESINSTALLEUR_NOM}"'
    WriteRegStr HKCU "${CLE_DESINSTALLATION}" "QuietUninstallString" '"$Racine\app\${DESINSTALLEUR_NOM}" /S'
    WriteRegStr HKCU "${CLE_DESINSTALLATION}" "URLInfoAbout" "${SITE}"
    WriteRegStr HKCU "${CLE_DESINSTALLATION}" "RacineCyberPinball" "$Racine"
    WriteRegDWORD HKCU "${CLE_DESINSTALLATION}" "NoModify" 1
    WriteRegDWORD HKCU "${CLE_DESINSTALLATION}" "NoRepair" 1
    ${GetSize} "$Racine\app" "/S=0K" $1 $2 $3
    WriteRegDWORD HKCU "${CLE_DESINSTALLATION}" "EstimatedSize" $1
    WriteINIStr "$Racine\app\installation.ini" "installation" "registre" "1"
  ${Else}
    DetailPrint "Bac à sable ($BacASable) : pas d'entrée dans Programmes et fonctionnalités."
    WriteINIStr "$Racine\app\installation.ini" "installation" "registre" "0"
  ${EndIf}
SectionEnd

!ifdef COMPLET
Section "Visual Pinball X ${VPX_VERSION}" SEC_VPX
  SectionIn RO
  ; L'archive officielle, inchangée et vérifiée (SHA-256) à la fabrication :
  ; l'application la trouve dans downloads\ et l'installe sans la retélécharger.
  SetOutPath "$Racine\downloads"
  SetCompress off
  File "${VPX_ARCHIVE}"
  SetCompress auto
  File "/oname=${VPX_ARCHIVE_NOM}.licence.txt" "${VPX_NOTICE}"
SectionEnd
!endif

Section "Raccourci sur le bureau" SEC_BUREAU
  SetOutPath "$Racine\app"
  CreateDirectory "$BureauDir"
  CreateShortCut "$BureauDir\${PRODUIT}.lnk" "$Racine\app\${EXE}" "" "$Racine\app\${EXE}" 0
  WriteINIStr "$Racine\app\installation.ini" "installation" "bureau" "1"
SectionEnd

Section /o "Lancer au démarrage de Windows (borne dédiée)" SEC_DEMARRAGE
  SetOutPath "$Racine\app"
  CreateDirectory "$DemarrageDir"
  CreateShortCut "$DemarrageDir\${PRODUIT}.lnk" "$Racine\app\${EXE}" "" "$Racine\app\${EXE}" 0
  WriteINIStr "$Racine\app\installation.ini" "installation" "demarrage" "1"
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_APP} "L'application, dans le sous-dossier app de la racine, avec un raccourci dans le menu Démarrer."
  !ifdef COMPLET
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC_VPX} "Archive officielle de Visual Pinball X ${VPX_VERSION}, vérifiée, copiée dans downloads : installée au premier lancement sans connexion. Licence : redistribution gratuite, sans usage commercial."
  !endif
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_BUREAU} "Un raccourci Cyber Pinball sur le bureau."
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_DEMARRAGE} "Pour une borne dédiée : Cyber Pinball s'ouvre dès l'ouverture de la session Windows."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Function PasserEnMiseAJour
  ${If} $Maj == "1"
    Abort
  ${EndIf}
FunctionEnd

; Relance Cyber Pinball après une mise à jour, réussie ou non, avec ses arguments d'avant.
Function Relancer
  ${If} $Maj != "1"
    Return
  ${EndIf}
  ReadEnvStr $1 CYBERPINBALL_MAJ_ARGS
  SetOutPath "$Racine\app"
  Exec '"$Racine\app\${EXE}" $1'
FunctionEnd

Function .onInstSuccess
  RMDir /r "$Racine\app.precedente"
  Call Relancer
FunctionEnd

; L'ancienne version revient telle qu'elle était.
Function .onInstFailed
  ${If} ${FileExists} "$Racine\app.precedente\${EXE}"
    RMDir /r "$Racine\app"
    Rename "$Racine\app.precedente" "$Racine\app"
  ${EndIf}
  Call Relancer
FunctionEnd

; Après les sections : elle utilise leurs index (SEC_BUREAU, SEC_DEMARRAGE).
Function .onInit
  ReadEnvStr $BacASable CYBERPINBALL_HOME
  Call Emplacements

  ; Options de la ligne de commande (installation silencieuse /S) :
  ;   /DEMARRAGE  lance Cyber Pinball au démarrage de Windows (borne dédiée)
  ;   /SANSBUREAU pas de raccourci sur le bureau
  ;   /D=dossier  dossier racine (en dernier, sans guillemets)
  ;   /MAJ        mise à jour depuis l'application (voir l'en-tête)
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/MAJ" $R1
  ${IfNot} ${Errors}
    StrCpy $Maj "1"
    SetAutoClose true
  ${EndIf}

  ; /D= est relu dans la ligne de commande : NSIS ignore en silence un /D= qu'il
  ; juge invalide (dossier réseau, chemin relatif, disque absent), et l'on
  ; installerait alors dans la racine par défaut. Un /D= donné est donc toujours
  ; celui qu'on vérifie, et refusé s'il ne convient pas.
  ClearErrors
  ${WordFind} $CMDLINE " /D=" "E+1}" $R1
  ${IfNot} ${Errors}
    ; Sans les espaces finaux éventuels.
    ${DoWhile} $R1 != ""
      StrCpy $R2 $R1 1 -1
      ${If} $R2 != " "
        ${ExitDo}
      ${EndIf}
      StrCpy $R1 $R1 -1
    ${Loop}
    StrCpy $INSTDIR $R1
  ${ElseIf} $INSTDIR == ""
  ${AndIf} $BacASable != ""
  ${AndIf} ${Silent}
    ; Bac à sable : seulement la racine qu'il a mémorisée, jamais celle par
    ; défaut (registre, D:\CyberPinball), qui serait la vraie borne.
    Call LirePointeur
    ${If} $0 == ""
      SetErrorLevel 2
      Quit
    ${EndIf}
    StrCpy $INSTDIR $0
  ${ElseIf} $INSTDIR == ""
    Call RacineParDefaut
  ${EndIf}

  ${If} ${Silent}
    Call VerifierRacine
    ${If} $0 != ""
      SetErrorLevel 2
      Quit
    ${EndIf}
  ${EndIf}

  ; Raccourcis : ceux de l'installation précédente dans cette racine, puis la ligne de commande.
  ${If} ${FileExists} "$INSTDIR\app\installation.ini"
    ReadINIStr $R1 "$INSTDIR\app\installation.ini" "installation" "bureau"
    ${If} $R1 != "1"
      !insertmacro UnselectSection ${SEC_BUREAU}
    ${EndIf}
    ReadINIStr $R1 "$INSTDIR\app\installation.ini" "installation" "demarrage"
    ${If} $R1 == "1"
      !insertmacro SelectSection ${SEC_DEMARRAGE}
    ${EndIf}
  ${ElseIf} $Maj == "1"
    ; Mise à jour d'une borne déployée sans l'installeur (npm run deployer) : pas de journal,
    ; les raccourcis restent ceux qui existent.
    ${IfNot} ${FileExists} "$BureauDir\${PRODUIT}.lnk"
      !insertmacro UnselectSection ${SEC_BUREAU}
    ${EndIf}
    ${If} ${FileExists} "$DemarrageDir\${PRODUIT}.lnk"
      !insertmacro SelectSection ${SEC_DEMARRAGE}
    ${EndIf}
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/DEMARRAGE" $R1
  ${IfNot} ${Errors}
    !insertmacro SelectSection ${SEC_DEMARRAGE}
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/SANSBUREAU" $R1
  ${IfNot} ${Errors}
    !insertmacro UnselectSection ${SEC_BUREAU}
  ${EndIf}
FunctionEnd

!endif
