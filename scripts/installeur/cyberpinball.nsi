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
;             et pour la version complète : COMPLET, VPX_ARCHIVE, VPX_ARCHIVE_NOM, VPX_NOTICE, VPX_VERSION,
;             VCREDIST, VCREDIST_NOM (installateur du runtime Visual C++ de Microsoft).
;   SITE : adresse du dépôt (« repository » du package.json racine).
;   CONDITIONS_VERSION : version des conditions d'utilisation (packages/core/src/terms.ts) ; les
;   accepter écrit <racine>\data\conditions.json.
;   CONDITIONS_FR, CONDITIONS_EN : le même texte dans chaque langue de l'installeur.
;   VPX_PAREFEU_REEL, VPX_PAREFEU_JONCTION : l'exécutable de VPX sous la racine, par le dossier de sa
;   version et par la jonction current (règle « Cyber Pinball VPX » du pare-feu).
;
; Mise à jour depuis l'application (/MAJ, lancé par le menu système, voir
; packages/core/src/update.ts) : seule la page de progression s'affiche ; l'installeur
; attend que Cyber Pinball se ferme, garde les raccourcis choisis à l'installation
; précédente, remet l'ancien dossier app en place s'il échoue, puis relance Cyber Pinball
; avec les arguments de CYBERPINBALL_MAJ_ARGS.
;
; Langue : français ou anglais, choisie dans une petite fenêtre au tout début (présélection : la
; langue déjà choisie dans Cyber Pinball, sinon celle de Windows si c'est le français, l'anglais
; sinon, comme l'application), ou par /LANGUE=fr|en. Le choix vaut aussi pour Cyber Pinball : il est
; écrit dans <racine>\data\language.json. Jamais de fenêtre en mise à jour (/MAJ) ni en silence (/S) :
; la langue de l'application reste alors celle qu'elle a. Textes : langues.nsh, dans les deux langues.
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
!define DESINSTALLEUR_NOM "Désinstaller Cyber Pinball.exe" ; i18n-ignore : nom de fichier gardé par les mises à jour
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
; /PAREFEU : la règle du pare-feu est demandée même en installation silencieuse (/S).
Var ParefeuSilencieux
; « 1 » : conditions d'utilisation acceptées sur leur page (jamais en mise à jour ni en silencieux :
; l'application les présente alors elle-même).
Var ConditionsAcceptees
; « fr » ou « en » : langue choisie (fenêtre du début ou /LANGUE=), écrite dans data\language.json ;
; vide : rien à écrire, l'application garde la sienne.
Var LangueChoisie

; ---------------------------------------------------------------------------
; Interface

!define MUI_ICON "${ICONE}"
!define MUI_UNICON "${ICONE}"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${BANDEAU}"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${BANDEAU}"
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "$(L_ABANDON)"
; Fenêtre du choix de la langue, avant toute page : écrite dans les deux langues.
!define MUI_LANGDLL_ALLLANGUAGES
!define MUI_LANGDLL_WINDOWTITLE "Cyber Pinball"
!define MUI_LANGDLL_INFO "Langue de l'installation et de Cyber Pinball :$\r$\nSetup and Cyber Pinball language:" ; i18n-ignore : bilingue

!ifndef ECRIRE_DESINSTALLEUR
  !define MUI_WELCOMEPAGE_TITLE "$(L_ACCUEIL_TITRE)"
  !define MUI_WELCOMEPAGE_TEXT "$(L_ACCUEIL_TEXTE)"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE PasserEnMiseAJour
  !insertmacro MUI_PAGE_WELCOME

  !define MUI_PAGE_HEADER_TEXT "$(L_CONDITIONS_TITRE)"
  !define MUI_PAGE_HEADER_SUBTEXT "$(L_CONDITIONS_SOUS_TITRE)"
  !define MUI_LICENSEPAGE_TEXT_TOP "$(L_CONDITIONS_HAUT)"
  !define MUI_LICENSEPAGE_TEXT_BOTTOM "$(L_CONDITIONS_BAS)"
  ; Même libellé que le bouton du menu (« J’accepte », « I accept »), que le texte des conditions cite.
  !define MUI_LICENSEPAGE_BUTTON "$(L_CONDITIONS_BOUTON)"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE PasserEnMiseAJour
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE PageConditionsQuitter
  !insertmacro MUI_PAGE_LICENSE "$(L_CONDITIONS_FICHIER)"

  !define MUI_PAGE_HEADER_TEXT "$(L_RACINE_TITRE)"
  !define MUI_PAGE_HEADER_SUBTEXT "$(L_RACINE_SOUS_TITRE)"
  !define MUI_DIRECTORYPAGE_TEXT_TOP "$(L_RACINE_HAUT)"
  !define MUI_DIRECTORYPAGE_TEXT_DESTINATION "$(L_RACINE_DESTINATION)"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE PasserEnMiseAJour
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE PageRacineQuitter
  !insertmacro MUI_PAGE_DIRECTORY

  !define MUI_COMPONENTSPAGE_SMALLDESC
  !define MUI_COMPONENTSPAGE_TEXT_TOP "$(L_OPTIONS_HAUT)"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE PasserEnMiseAJour
  !insertmacro MUI_PAGE_COMPONENTS

  !insertmacro MUI_PAGE_INSTFILES

  !define MUI_FINISHPAGE_TITLE "$(L_FIN_TITRE)"
  !define MUI_FINISHPAGE_TEXT "$(L_FIN_TEXTE)"
  !define MUI_FINISHPAGE_RUN "$Racine\app\${EXE}"
  !define MUI_FINISHPAGE_RUN_TEXT "$(L_FIN_LANCER)"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE PasserEnMiseAJour
  !insertmacro MUI_PAGE_FINISH
!else
  ; L'explication complète va sur la page d'accueil : celle de confirmation n'a
  ; que trois lignes de texte.
  !define MUI_WELCOMEPAGE_TITLE "$(L_DESINST_TITRE)"
  !define MUI_WELCOMEPAGE_TEXT "$(L_DESINST_ACCUEIL)"
  !insertmacro MUI_UNPAGE_WELCOME
  !define MUI_PAGE_HEADER_TEXT "$(L_DESINST_TITRE)"
  !define MUI_PAGE_HEADER_SUBTEXT "$(L_DESINST_SOUS_TITRE)"
  !define MUI_UNCONFIRMPAGE_TEXT_TOP "$(L_DESINST_CONFIRMATION)"
  !define MUI_UNCONFIRMPAGE_TEXT_LOCATION "$(L_DESINST_EMPLACEMENT)"
  !insertmacro MUI_UNPAGE_CONFIRM
  !insertmacro MUI_UNPAGE_INSTFILES
  !define MUI_FINISHPAGE_TITLE "$(L_DESINST_FIN_TITRE)"
  !define MUI_FINISHPAGE_TEXT "$(L_DESINST_FIN_TEXTE)"
  !insertmacro MUI_UNPAGE_FINISH
!endif

; Le français d'abord : langue des sources. Les textes de chaque langue : langues.nsh.
!insertmacro MUI_LANGUAGE "French"
!insertmacro MUI_LANGUAGE "English"
!include "${__FILEDIR__}\langues.nsh"

; Propriétés du fichier (Explorateur), dans les deux langues.
VIProductVersion "${VERSION_WIN}"
!macro INFORMATIONS_VERSION LANGUE TXT_LIBRE TXT_DESINST TXT_INST TXT_INST_COMPLET
  VIAddVersionKey /LANG=${LANGUE} "ProductName" "${PRODUIT}"
  VIAddVersionKey /LANG=${LANGUE} "CompanyName" "${PRODUIT}"
  VIAddVersionKey /LANG=${LANGUE} "LegalCopyright" "${TXT_LIBRE}"
  VIAddVersionKey /LANG=${LANGUE} "FileVersion" "${VERSION}"
  VIAddVersionKey /LANG=${LANGUE} "ProductVersion" "${VERSION}"
  !ifdef ECRIRE_DESINSTALLEUR
    VIAddVersionKey /LANG=${LANGUE} "FileDescription" "${TXT_DESINST}"
  !else ifdef COMPLET
    VIAddVersionKey /LANG=${LANGUE} "FileDescription" "${TXT_INST_COMPLET}"
  !else
    VIAddVersionKey /LANG=${LANGUE} "FileDescription" "${TXT_INST}"
  !endif
!macroend
!insertmacro INFORMATIONS_VERSION ${LANG_FRENCH} "Cyber Pinball, logiciel libre" "Désinstalleur de ${PRODUIT}" "Installeur de ${PRODUIT}" "Installeur de ${PRODUIT} (version complète, avec Visual Pinball X)" ; i18n-ignore : propriétés en français
!insertmacro INFORMATIONS_VERSION ${LANG_ENGLISH} "Cyber Pinball, free software" "${PRODUIT} uninstaller" "${PRODUIT} setup" "${PRODUIT} setup (full edition, with Visual Pinball X)"

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
    StrCpy $MenuDir "$BacASable\Menu Démarrer" ; i18n-ignore : dossier d'essai
    StrCpy $BureauDir "$BacASable\Bureau"
    StrCpy $DemarrageDir "$BacASable\Démarrage" ; i18n-ignore : dossier d'essai
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
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(L_APPLI_OUVERTE)" /SD IDCANCEL IDRETRY essai
  Abort "$(L_APPLI_OUVERTE_RIEN)"
FunctionEnd
!macroend

; Arrête le veilleur de la relance par Start (CyberPinball.exe --veilleur, sans fenêtre) : il
; tient l'exécutable ouvert. Son pid est dans data\relance-start\veilleur.pid ; taskkill ne
; vise ce pid que si c'est bien CyberPinball.exe. Cyber Pinball relancé le relance.
!macro FONCTION_ARRET_VEILLEUR un
Function ${un}ArreterVeilleur
  ClearErrors
  FileOpen $1 "$Racine\data\relance-start\veilleur.pid" r
  ${If} ${Errors}
    Return
  ${EndIf}
  FileRead $1 $2
  FileClose $1
  IntOp $2 $2 + 0
  ${If} $2 > 0
    nsExec::Exec '"$SYSDIR\taskkill.exe" /T /F /FI "PID eq $2" /FI "IMAGENAME eq ${EXE}"'
    Pop $1
    Sleep 500
  ${EndIf}
FunctionEnd
!macroend

; Langue proposée : celle déjà choisie dans Cyber Pinball (<racine>\data\language.json, écrit par
; l'application ou par cet installeur), sinon celle de Windows si c'est le français, l'anglais sinon
; (comme systemLanguage, packages/core/src/i18n.ts). Entrée : $R9 = racine. Sortie : $LANGUAGE, et
; $0 = « fr » ou « en ».
!macro FONCTION_LANGUE un
Function ${un}LangueParDefaut
  StrCpy $0 ""
  ClearErrors
  FileOpen $1 "$R9\data\language.json" r
  ${IfNot} ${Errors}
    StrCpy $2 ""
    ${Do}
      ClearErrors
      FileRead $1 $3
      ${If} ${Errors}
        ${ExitDo}
      ${EndIf}
      StrCpy $2 "$2$3"
    ${Loop}
    FileClose $1
    ; {"language": "en"} : le premier texte entre guillemets après "language".
    ClearErrors
    ${WordFind} $2 '"language"' "E+1}" $3
    ${IfNot} ${Errors}
      ${WordFind} $3 '"' "E+2" $3
      ${IfNot} ${Errors}
        ${If} $3 == "fr"
        ${OrIf} $3 == "en"
          StrCpy $0 $3
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
  ${If} $0 == ""
    ; Langue principale de l'interface de Windows (LANG_FRENCH = 0x0C, quelle que soit la région).
    System::Call "kernel32::GetUserDefaultUILanguage() i .r1"
    IntOp $1 $1 & 0x3FF
    ${If} $1 == 12
      StrCpy $0 "fr"
    ${Else}
      StrCpy $0 "en"
    ${EndIf}
  ${EndIf}
  ${If} $0 == "fr"
    StrCpy $LANGUAGE ${LANG_FRENCH}
  ${Else}
    StrCpy $LANGUAGE ${LANG_ENGLISH}
  ${EndIf}
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
!insertmacro FONCTION_ARRET_VEILLEUR "un."
!insertmacro FONCTION_LANGUE "un."

; Le désinstalleur reste dans <racine>\app : $INSTDIR est ce dossier.
Function un.onInit
  ${GetParent} "$INSTDIR" $Racine
  ; La langue de Cyber Pinball sur cette borne, avant tout message.
  StrCpy $R9 $Racine
  Call un.LangueParDefaut
  ${GetFileName} "$INSTDIR" $0
  ; Sécurité : on ne supprime qu'un dossier app\ créé par cet installeur.
  ${If} $0 != "app"
  ${OrIfNot} ${FileExists} "$INSTDIR\installation.ini"
  ${OrIfNot} ${FileExists} "$INSTDIR\${EXE}"
    MessageBox MB_ICONSTOP "$(L_DESINST_MAUVAIS_DOSSIER)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ReadINIStr $BacASable "$INSTDIR\installation.ini" "installation" "bac_a_sable"
  Call un.Emplacements
  ; Borne dédiée active (Shell Launcher, ou réglage « Interface utilisateur personnalisée » du
  ; compte) : sans l'application, la session s'ouvrirait sur un écran noir. Le désinstalleur
  ; n'a pas les droits pour la défaire : on le dit, et on n'avance qu'à la demande.
  ${If} ${FileExists} "$Racine\data\borne-dediee\etat.json"
  ${OrIf} ${FileExists} "$Racine\data\borne-dediee\reglages-windows.json"
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "$(L_DESINST_BORNE_DEDIEE)" /SD IDYES IDYES +3
    SetErrorLevel 2
    Quit
  ${EndIf}
FunctionEnd

Section "Uninstall"
  Call un.ArreterVeilleur
  StrCpy $0 "$INSTDIR\${EXE}"
  Call un.ApplicationFermee

  DetailPrint "$(L_DESINST_RACCOURCIS)"
  Delete "$MenuDir\${PRODUIT}.lnk"
  Delete "$BureauDir\${PRODUIT}.lnk"
  Delete "$DemarrageDir\${PRODUIT}.lnk"
  Delete "$DemarrageDir\${PRODUIT} - relance par Start.lnk" ; i18n-ignore : nom du raccourci posé par l'application
  Delete "$Racine\${PRODUIT}.lnk"

  ; L'entrée de Programmes et fonctionnalités, si elle désigne bien cette racine.
  ReadINIStr $1 "$INSTDIR\installation.ini" "installation" "registre"
  ReadRegStr $2 HKCU "${CLE_DESINSTALLATION}" "RacineCyberPinball"
  ${If} $1 == "1"
  ${AndIf} $2 == $Racine
    DeleteRegKey HKCU "${CLE_DESINSTALLATION}"
  ${EndIf}

  ; Règles du pare-feu de cette application (section SEC_PAREFEU) : retirées avec l'autorisation de
  ; Windows, chacune seulement si elle vise bien cette racine, en une seule demande, et que quelqu'un
  ; est devant l'écran.
  ${If} $BacASable == ""
  ${AndIfNot} ${Silent}
    StrCpy $4 ""
    nsExec::ExecToStack '"$SYSDIR\netsh.exe" advfirewall firewall show rule name="Cyber Pinball" verbose'
    Pop $1
    Pop $2
    ClearErrors
    ${WordFind} "$2" "$INSTDIR\${EXE}" "E#" $3
    ${If} $1 == "0"
    ${AndIfNot} ${Errors}
      StrCpy $4 'netsh advfirewall firewall delete rule name="Cyber Pinball"'
    ${EndIf}
    nsExec::ExecToStack '"$SYSDIR\netsh.exe" advfirewall firewall show rule name="Cyber Pinball VPX" verbose'
    Pop $1
    Pop $2
    ClearErrors
    ${WordFind} "$2" "$Racine\emulators\vpx\" "E#" $3
    ${If} $1 == "0"
    ${AndIfNot} ${Errors}
      ${If} $4 != ""
        StrCpy $4 "$4 & "
      ${EndIf}
      StrCpy $4 '$4netsh advfirewall firewall delete rule name="Cyber Pinball VPX"'
    ${EndIf}
    ; La tâche de réparation des règles (posée par l'application), sous la même autorisation.
    nsExec::ExecToStack '"$SYSDIR\schtasks.exe" /query /tn "Cyber Pinball pare-feu"' ; i18n-ignore : nom de la tâche
    Pop $1
    Pop $2
    ${If} $1 == "0"
      ${If} $4 != ""
        StrCpy $4 "$4 & "
      ${EndIf}
      StrCpy $4 '$4schtasks /delete /tn "Cyber Pinball pare-feu" /f' ; i18n-ignore : nom de la tâche
    ${EndIf}
    ${If} $4 != ""
      DetailPrint "$(L_DESINST_PAREFEU)"
      ExecShellWait "runas" "$SYSDIR\cmd.exe" '/d /c $4' SW_HIDE
    ${EndIf}
  ${EndIf}

  DetailPrint "$(L_DESINST_APPLICATION)"
  SetOutPath "$TEMP"
  RMDir /r "$INSTDIR"
  ${If} ${FileExists} "$INSTDIR\*.*"
    DetailPrint "$(L_DESINST_FICHIERS_UTILISES)"
  ${EndIf}

  ; root.json est gardé : une réinstallation retrouve la même racine.
  DetailPrint "$(L_DESINST_CONSERVES)"
SectionEnd

!else
; ---------------------------------------------------------------------------
; Passe 2 : l'installeur.

!insertmacro FONCTION_EMPLACEMENTS ""
!insertmacro FONCTION_APPLICATION_FERMEE ""
!insertmacro FONCTION_ARRET_VEILLEUR ""
!insertmacro FONCTION_LANGUE ""

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
    DetailPrint "$(L_POINTEUR_ECHEC)"
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
  DetailPrint "$(L_POINTEUR_OK)"
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
        StrCpy $5 "${DOSSIER}"
        StrCpy $0 "$(L_RACINE_PROTEGEE)"
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
    StrCpy $0 "$(L_RACINE_RESEAU)"
    Return
  ${ElseIf} $2 != ":"
  ${OrIf} $3 != "\"
    StrCpy $0 "$(L_RACINE_INCOMPLETE)"
    Return
  ${EndIf}

  StrCpy $1 $Racine 3
  System::Call "kernel32::GetDriveTypeW(w r1) i .r2"
  ${If} $2 == 4
    StrCpy $0 "$(L_RACINE_LECTEUR_RESEAU)"
    Return
  ${ElseIf} $2 == 1
    StrCpy $0 "$(L_RACINE_DISQUE_ABSENT)"
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

; « J'accepte » : l'installation note l'accord, l'application ne le redemande pas.
Function PageConditionsQuitter
  StrCpy $ConditionsAcceptees "1"
FunctionEnd

Function PageRacineQuitter
  Call VerifierRacine
  ${If} $0 != ""
    MessageBox MB_ICONEXCLAMATION "$0"
    Abort
  ${EndIf}
  ${If} ${FileExists} "$Racine\app\*.*"
  ${AndIfNot} ${FileExists} "$Racine\app\${EXE}"
    MessageBox MB_ICONEXCLAMATION "$(L_RACINE_APP_ETRANGER)"
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

  Call ArreterVeilleur
  StrCpy $0 "$Racine\app\${EXE}"
  Call ApplicationFermee

  ; app\ est remplacé en entier, comme au déploiement : rien d'autre n'y vit. L'ancien
  ; dossier devient app.precedente jusqu'à la fin de l'installation : remis en place si
  ; elle échoue (.onInstFailed), supprimé si elle réussit (.onInstSuccess).
  ; Hors de app\ : un dossier de travail ne se renomme pas (le nôtre, s'il était dans app\).
  SetOutPath "$TEMP"
  RMDir /r "$Racine\app.precedente"
  ${If} ${FileExists} "$Racine\app\${EXE}"
    DetailPrint "$(L_REMPLACEMENT)"
    ; Un antivirus ou l'Explorateur peut tenir un fichier un instant : jusqu'à 10 s d'essais.
    StrCpy $2 0
    renommer:
    ClearErrors
    Rename "$Racine\app" "$Racine\app.precedente"
    ${If} ${Errors}
      ${If} $2 < 20
        IntOp $2 $2 + 1
        Sleep 500
        Goto renommer
      ${EndIf}
      ${If} $Maj == "1"
        ; Mise à jour : rien n'a changé ; Cyber Pinball repart tel quel, sans clic à faire.
        DetailPrint "$(L_MAJ_FICHIERS_UTILISES)"
        Call Relancer
        SetErrorLevel 3
        Quit
      ${EndIf}
      Abort "$(L_FICHIERS_UTILISES)"
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

  ; Conditions d'utilisation acceptées sur leur page : notées comme l'application le fait
  ; (packages/core/src/terms.ts), pour qu'elle ne les présente pas une seconde fois.
  ${If} $ConditionsAcceptees == "1"
    CreateDirectory "$Racine\data"
    ClearErrors
    FileOpen $1 "$Racine\data\conditions.json" w
    ${IfNot} ${Errors}
      FileWrite $1 '{$\r$\n  "version": "${CONDITIONS_VERSION}",$\r$\n  "via": "installeur"$\r$\n}$\r$\n'
      FileClose $1
    ${EndIf}
  ${EndIf}

  ; Langue choisie au début de l'installation : celle de Cyber Pinball aussi, au même format que
  ; l'application (saveLanguageSetting, packages/core/src/i18n.ts).
  ${If} $LangueChoisie != ""
    ClearErrors
    FileOpen $1 "$Racine\data\language.json" w
    ${IfNot} ${Errors}
      FileWrite $1 '{$\n  "language": "$LangueChoisie"$\n}$\n'
      FileClose $1
      DetailPrint "$(L_LANGUE_OK)"
    ${EndIf}
  ${EndIf}

  ; Données d'avant le choix d'une racine (comme setupRoot) : modèle de borne,
  ; sauvegardes, VPinballX.ini du bac à sable. Copiées si absentes, jamais écrasées.
  ${If} ${FileExists} "$AnciennesDonnees\cabinet.json"
  ${AndIfNot} ${FileExists} "$Racine\data\cabinet.json"
    DetailPrint "$(L_REPRISE_MODELE)"
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
    WriteINIStr "$Racine\app\installation.ini" "installation" "edition" "complète" ; i18n-ignore : valeur du journal
  !else
    WriteINIStr "$Racine\app\installation.ini" "installation" "edition" "légère" ; i18n-ignore : valeur du journal
  !endif

  ; Raccourcis : à la racine (comme le déploiement) et dans le menu Démarrer.
  ; Ceux du bureau et du démarrage sont refaits selon les options cochées.
  SetOutPath "$Racine\app"
  CreateShortCut "$Racine\${PRODUIT}.lnk" "$Racine\app\${EXE}" "" "$Racine\app\${EXE}" 0
  CreateDirectory "$MenuDir"
  CreateShortCut "$MenuDir\${PRODUIT}.lnk" "$Racine\app\${EXE}" "" "$Racine\app\${EXE}" 0 SW_SHOWNORMAL "" "$(L_RACCOURCI_DESCRIPTION)"
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
    DetailPrint "$(L_BAC_A_SABLE)"
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
  ; L'installateur officiel du runtime Visual C++ de Microsoft, sans lequel VPX ne démarre pas sur
  ; un Windows neuf : l'application le lance, avec l'accord de Windows, seulement s'il manque.
  File "/oname=${VCREDIST_NOM}" "${VCREDIST}"
SectionEnd
!endif

; Runtime Visual C++ de Microsoft, s'il manque à Windows (décidé le 12/11/2026). VPX ne démarre pas
; sans lui, et sa bibliothèque SDL, qui lit les boutons et le lanceur d'un Pinscape ou d'un encodeur
; en mode manette, ne se charge pas non plus : sur un Windows neuf, le premier assistant ne pouvait
; pas relever ces boutons. Son installation demande l'accord de Windows, auquel les boutons de la
; borne ne peuvent pas répondre : on la fait ici, où l'utilisateur a une souris en main, avant le
; premier lancement. Cyber Pinball lui-même s'en charge, en mode Node (app/src/runtime-vc.ts) : même
; téléchargement vérifié et même signature de Microsoft que depuis le menu ; l'installeur complet a
; déjà déposé le fichier dans downloads\. Rien n'est demandé si le runtime suffit déjà. Jamais en
; mise à jour (/MAJ), en silence (/S) ni dans un bac à sable d'essai : le menu le propose alors.
Section "$(L_NOM_RUNTIME)" SEC_RUNTIME
  SectionIn RO
  ${If} $BacASable != ""
    DetailPrint "$(L_RUNTIME_BAC)"
    Return
  ${EndIf}
  ${If} $Maj == "1"
  ${OrIf} ${Silent}
    DetailPrint "$(L_RUNTIME_PLUS_TARD)"
    Return
  ${EndIf}
  DetailPrint "$(L_RUNTIME_VERIFICATION)"
  System::Call 'kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1")'
  nsExec::Exec '"$Racine\app\${EXE}" "$Racine\app\resources\app\dist\runtime-vc.js" "$Racine\downloads"'
  Pop $0
  ; Jamais hérité par la suite : « Lancer Cyber Pinball » ouvrirait sinon l'exécutable en mode Node.
  System::Call 'kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", p 0)'
  ${If} $0 == "0"
    DetailPrint "$(L_RUNTIME_PRET)"
  ${ElseIf} $0 == "2"
    DetailPrint "$(L_RUNTIME_REFUS)"
  ${Else}
    DetailPrint "$(L_RUNTIME_ECHEC)"
  ${EndIf}
SectionEnd

Section "$(L_NOM_BUREAU)" SEC_BUREAU
  SetOutPath "$Racine\app"
  CreateDirectory "$BureauDir"
  CreateShortCut "$BureauDir\${PRODUIT}.lnk" "$Racine\app\${EXE}" "" "$Racine\app\${EXE}" 0
  WriteINIStr "$Racine\app\installation.ini" "installation" "bureau" "1"
SectionEnd

Section /o "$(L_NOM_DEMARRAGE)" SEC_DEMARRAGE
  SetOutPath "$Racine\app"
  CreateDirectory "$DemarrageDir"
  CreateShortCut "$DemarrageDir\${PRODUIT}.lnk" "$Racine\app\${EXE}" "" "$Racine\app\${EXE}" 0
  WriteINIStr "$Racine\app\installation.ini" "installation" "demarrage" "1"
SectionEnd

; Réseau des bornes (Menu système > Amis) : la règle du pare-feu de Windows pour CyberPinball.exe,
; pour que Windows n'affiche pas son invite « Autoriser l'accès » sur une borne sans souris (décidé
; le 28/10/2026) ; et, sous la même autorisation, celle qui ferme VPX au réseau (entrée bloquée,
; décidé le 30/10/2026) : l'inspector de VPX, qui donne l'état en direct des tables Stern SAM
; pendant une partie entre amis, n'est activé que si elle est posée. Elle vise la version de VPX
; que l'application installera (VPX_PAREFEU_REEL, d'après packages/installer/components.json) et la
; jonction emulators\vpx\current (VPX_PAREFEU_JONCTION). Mêmes noms et mêmes arguments que
; packages/core/src/firewall.ts (relu par firewall.test.ts). L'autorisation de Windows (UAC) n'est
; demandée que si une règle manque ou vise un autre dossier, et seulement pendant une installation
; où quelqu'un est devant l'écran : jamais en mise à jour (/MAJ), en silence (/S, sauf /PAREFEU) ni
; dans un bac à sable d'essai. Toute règle d'entrée sur CyberPinball.exe est retirée d'abord (dont
; celles, bloquantes, que Windows pose quand son invite « Autoriser l'accès » reste sans réponse).
; En mise à jour, c'est l'application qui vérifie les règles à sa relance et les repose
; (app/src/firewall-guard.ts : par la tâche de réparation, sans invite, ou en le demandant une fois).
Section "$(L_NOM_PAREFEU)" SEC_PAREFEU
  ${If} $BacASable != ""
    DetailPrint "$(L_PAREFEU_BAC)"
    Return
  ${EndIf}
  Call RegleParefeuPresente
  ${If} $0 == "1"
    DetailPrint "$(L_PAREFEU_DEJA)"
    WriteINIStr "$Racine\app\installation.ini" "installation" "pare_feu" "1"
    Return
  ${EndIf}
  ${If} $Maj == "1"
    DetailPrint "$(L_PAREFEU_PLUS_TARD)"
    Return
  ${EndIf}
  ${If} ${Silent}
  ${AndIf} $ParefeuSilencieux != "1"
    DetailPrint "$(L_PAREFEU_PLUS_TARD)"
    Return
  ${EndIf}
  DetailPrint "$(L_PAREFEU_DEMANDE)"
  ExecShellWait "runas" "$SYSDIR\cmd.exe" '/d /c netsh advfirewall firewall delete rule name="Cyber Pinball" >nul 2>&1 & netsh advfirewall firewall delete rule name="all" dir=in program="$Racine\app\${EXE}" >nul 2>&1 & netsh advfirewall firewall add rule name="Cyber Pinball" dir=in action=allow program="$Racine\app\${EXE}" enable=yes profile=any & netsh advfirewall firewall delete rule name="Cyber Pinball VPX" >nul 2>&1 & netsh advfirewall firewall add rule name="Cyber Pinball VPX" dir=in action=block program="$Racine\${VPX_PAREFEU_REEL}" enable=yes profile=any & netsh advfirewall firewall add rule name="Cyber Pinball VPX" dir=in action=block program="$Racine\${VPX_PAREFEU_JONCTION}" enable=yes profile=any' SW_HIDE
  Call RegleParefeuPresente
  WriteINIStr "$Racine\app\installation.ini" "installation" "pare_feu" "$0"
  ${If} $0 == "1"
    DetailPrint "$(L_PAREFEU_OK)"
  ${Else}
    DetailPrint "$(L_PAREFEU_REFUS)"
  ${EndIf}
SectionEnd

; $0 = "1" si la règle « Cyber Pinball » vise $Racine\app\CyberPinball.exe et que la règle
; « Cyber Pinball VPX » vise la version de VPX à installer (lecture sans élévation).
Function RegleParefeuPresente
  StrCpy $0 "0"
  nsExec::ExecToStack '"$SYSDIR\netsh.exe" advfirewall firewall show rule name="Cyber Pinball" verbose'
  Pop $1
  Pop $2
  ${If} $1 != "0"
    Return
  ${EndIf}
  ClearErrors
  ${WordFind} "$2" "$Racine\app\${EXE}" "E#" $3
  ${If} ${Errors}
    Return
  ${EndIf}
  nsExec::ExecToStack '"$SYSDIR\netsh.exe" advfirewall firewall show rule name="Cyber Pinball VPX" verbose'
  Pop $1
  Pop $2
  ${If} $1 != "0"
    Return
  ${EndIf}
  ClearErrors
  ${WordFind} "$2" "$Racine\${VPX_PAREFEU_REEL}" "E#" $3
  ${IfNot} ${Errors}
    StrCpy $0 "1"
  ${EndIf}
FunctionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_APP} "$(L_DESC_APP)"
  !ifdef COMPLET
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC_VPX} "$(L_DESC_VPX)"
  !endif
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_BUREAU} "$(L_DESC_BUREAU)"
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_DEMARRAGE} "$(L_DESC_DEMARRAGE)"
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_PAREFEU} "$(L_DESC_PAREFEU)"
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
;   /LANGUE=fr|en langue de l'installeur et de Cyber Pinball, sans fenêtre de choix
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

  ; Langue : /LANGUE=fr|en, sinon proposée dans une petite fenêtre (présélection : celle de
  ; Cyber Pinball dans cette racine, sinon celle de Windows). En mise à jour et en silence, pas de
  ; fenêtre : la langue déjà choisie, et rien n'est écrit.
  StrCpy $R9 $INSTDIR
  Call LangueParDefaut
  ClearErrors
  ${GetOptions} $R0 "/LANGUE=" $R1
  ${IfNot} ${Errors}
    ${If} $R1 == "fr"
      StrCpy $LANGUAGE ${LANG_FRENCH}
      StrCpy $LangueChoisie "fr"
    ${ElseIf} $R1 == "en"
      StrCpy $LANGUAGE ${LANG_ENGLISH}
      StrCpy $LangueChoisie "en"
    ${EndIf}
  ${EndIf}
  ${If} $LangueChoisie == ""
  ${AndIf} $Maj != "1"
  ${AndIfNot} ${Silent}
    !insertmacro MUI_LANGDLL_DISPLAY
    ${If} $LANGUAGE == ${LANG_FRENCH}
      StrCpy $LangueChoisie "fr"
    ${Else}
      StrCpy $LangueChoisie "en"
    ${EndIf}
  ${EndIf}
FunctionEnd

!endif
