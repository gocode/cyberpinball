[English](../manual/sound.md) · Français · [Sommaire du manuel](../manuel.md)

## Son

VPX 10.8.1 n'a que deux sorties : `[Player] SoundDeviceBG` (fronton : musique et voix de la ROM, AltSound, PuP-Pack, musique de la table) et `[Player] SoundDevice` (plateau : bruits mécaniques, mixés selon `Sound3D`).
Il les désigne par le **nom Windows** de la sortie (« Haut-parleurs (USB Audio Device) »), comparé au caractère près ; un nom introuvable l'envoie sans un mot sur la sortie par défaut de Windows.
Ce nom est localisé, renommable et parfois partagé par deux cartes identiques : comme pour les écrans, Cyber Pinball garde sa propre empreinte et réécrit le nom courant à chaque synchronisation.

**Détection** (`probeAudioOutputs`, `packages/win-displays/src/audio.ts`) : sorties actives lues dans `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\{guid}`, en lecture seule et par l'API Unicode (`RegGetValueW`), car `reg.exe` abîme les accents.
Pour chacune : identifiant MMDevice (`{0.0.0.00000000}.{guid}`), nom attendu par VPX (« DeviceDesc (interface) »), bus, facteur de forme, canaux et masque des haut-parleurs réglés dans Windows, ContainerId, et sortie par défaut (la sortie active au plus grand `Level:0`, recoupé avec Chromium sur le PC de développement).
Une sortie HDMI se rattache à son écran par le ContainerId du moniteur PnP (`ObservedDisplay.containerId`) ; le conteneur commun à tout ce qui est intégré au PC (`{00000000-0000-0000-FFFF-FFFFFFFFFFFF}`) ne rattache rien.
`npm run probe` affiche tout cela.

**Étape « Son » de l'assistant**, après les écrans, ou seule (Menu système > Ma borne > Configuration de la borne > « Son de la borne », dont la ligne dit « Fronton, plateau, SSF et exciters », `--assistant --son` : seules `SoundDevice`, `SoundDeviceBG` et `Sound3D` sont écrites).
Les sorties virtuelles (Steam, Oculus : bus `ROOT`) et Bluetooth sont écartées, sauf si elles avaient déjà un rôle.

**Configurations proposées** (`proposeAudioSetups`, `packages/core/src/audio-setups.ts` ; liste, schéma et vérification dans `app/src/sound-setups.ts`) : avant toute question, l'étape regarde ce que la borne a et propose au plus trois configurations, la plus sûre en tête, sous une phrase qui dit ce qu'elle a détecté (« Détecté : Realtek, prise verte, prise noire branchées, réglée en stéréo dans Windows ; haut-parleurs de … (fronton). », `describeDetected`).
Elle tient compte des prises de la carte son de la carte mère, des haut-parleurs des écrans du fronton et du playfield, d'un ampli branché en HDMI (une sortie HDMI qui n'appartient à aucun écran), des canaux réglés dans Windows et des réglages déjà enregistrés.

- **Garder les réglages actuels** : en tête quand les réglages enregistrés retrouvent leurs sorties.
- **SSF** : les bruits du jeu font vibrer la caisse, deux ou quatre exciters sur la carte (« SSF sur la carte son », « SSF avec deux exciters ») ; le fronton sur la prise verte, ou sur les haut-parleurs de son écran quand rien n'est branché sur l'avant de la carte (« SSF : <écran> + <carte> »).
- **Stéréo** : chaque écran joue son son ; le fronton sur la carte et le plateau sur l'écran du playfield ; tout sur la carte (les exciters restent alors muets) ; ou tout sur l'écran du playfield.
- **« Aucune ne correspond : régler pas à pas »**, toujours en dernier (Exit y mène aussi) : le réglage sortie par sortie décrit plus bas.

Les prises ne sont lues que sur une carte de la carte mère (bus `HDAUDIO`, sortie analogique), dont le pilote décrit chacune ; les prises en façade, souvent un casque, ne comptent pas quand le panneau arrière en a.
Une prise n'est dite branchée que si elle sait détecter un câble (Windows le dit prise par prise) ; une carte USB ou une sortie HDMI est vérifiée par le son, jamais par une couleur de prise supposée.
Les couleurs sont celles de la norme des cartes son : verte à l'avant, noire à l'arrière, grise sur les côtés.
Le SSF passe en tête (« À essayer en premier ») quand un câble est détecté dans la prise arrière ou des côtés ; une carte déjà réglée en 5.1 ou 7.1 dans Windows le propose aussi avant la stéréo, mais « à vérifier par le son ».
Une carte dont les prises ne détectent rien, ou laissée en stéréo, reste proposée en SSF, mais « à vérifier par le son », après les propositions en stéréo (troisième au plus, jamais retirée) : une carte de bureau a presque toujours des prises arrière, rarement des exciters.
Chaque proposition a son **schéma de la borne** vue de dessus : le fronton, le plateau près du fronton et le plateau près du joueur (« VOUS »), avec ce qui doit y jouer (« prise noire », les haut-parleurs d'un écran) ou « non branchée ».
Tests : [audio-setups.test.ts](../../packages/core/src/test/audio-setups.test.ts).

Start essaie la configuration choisie.
En stéréo, ou pour garder les réglages, le récapitulatif suit.
En SSF, une **vérification paire par paire** fait sonner chaque paire attendue, à gauche puis à droite, et demande si on l'entend là où la configuration l'attend (« l'entendez-vous dans le fronton, des deux côtés ? », « vibrent-ils sous le plateau, près de vous ? ») ; le schéma allume la paire en cours et coche celles déjà vérifiées.
Start : oui ; Exit : aucun son ; un flipper : entendu ailleurs, et la paire reçoit la question du pas à pas ; Retour arrière revient à la paire précédente, puis à la liste.

**Carte réglée en stéréo** : une configuration SSF dont la carte annonce moins de canaux qu'il n'en faut (6 pour deux exciters, 8 pour quatre) passe d'abord par le **panneau Son de Windows**.
L'assistant l'ouvre (`mmsys.cpl`, `app/src/sound-panel.ts`) et dit quoi faire (« « <carte> », Configurer, 5.1 Surround, puis Suivant jusqu'au bout ») ; il relit les sorties toutes les 1,5 s et lance la vérification dès que Windows annonce le 5.1 ou le 7.1.
Start rouvre le panneau, Exit reste en stéréo.
Le pas à pas fait de même : quand aucune sortie n'annonce 6 canaux ou plus et qu'une carte son (ou un ampli HDMI) est en stéréo, il demande « Exciters ou haut-parleurs sur le plateau (SSF, surround) ? » (`stereoSurroundCandidate` : la sortie qui a un rôle, puis la carte de la carte mère, puis les autres cartes, puis l'ampli HDMI ; jamais le haut-parleur d'un écran).
« Oui, passer en 7.1 » ouvre le panneau et lance le test des haut-parleurs dès que la carte l'annonce ; « Non, stéréo » garde la stéréo.
Hors écran, le panneau ne s'ouvre pas.

**Deux exciters** : le SSF en 5.1 leur envoie tout le son du plateau (VPX 10.8.1 le joue alors en stéréo sur la paire arrière) ; en 7.1, une part de chaque son partirait vers la prise des côtés, muette.
L'assistant conseille donc le 5.1 (badge de la proposition, consigne du panneau Son, remarque du test), et le récapitulatif présente le SSF en 5.1 comme un réglage, pas comme une erreur.
Deux exciters sur la prise des côtés : il conseille de les brancher sur la prise arrière.

**Rien entendu** sur l'arrière ni sur les côtés d'une carte de la carte mère : le récapitulatif explique le cas des cartes à trois prises (verte, bleue, rose) : réaffecter la prise bleue ou rose dans la console audio du fabricant (Realtek Audio Console), ou brancher sur la prise casque en façade.
Un câble est détecté dans la prise des exciters mais rien n'a vibré : il conseille plutôt de regarder l'ampli des exciters, allumé et volume monté (`pluggedButSilentNotices`).

**Pas à pas** : chaque sortie joue sur elle-même un son généré par oscillateur (aucun fichier), n bips pour la sortie n, en boucle : `AudioContext.setSinkId` dans une fenêtre de l'assistant, la sortie étant trouvée par `enumerateDevices` sous son nom Windows (Chromium ajoute « (vid:pid) » au nom des sorties USB, ignoré pour la comparaison).
Le joueur répond aux boutons :

| Bouton | Sortie jouée | Test des haut-parleurs |
| --- | --- | --- |
| Flipper gauche | fronton | plateau, près du joueur |
| Flipper droit | plateau | plateau, côté fronton |
| Start | les deux (SSF à une seule carte) | dans le fronton |
| Exit | aucun rôle, sortie suivante | rien entendu |
| Retour arrière | sortie précédente | paire précédente |

Le haut-parleur de l'écran du fronton est proposé d'office pour le fronton, une carte réglée en 7.1 (à défaut le haut-parleur de l'écran du playfield) pour le plateau ; ces sorties sont jouées en premier, et l'écran dont la sortie est le haut-parleur s'allume.
Relancer l'assistant repart des sorties enregistrées.
Si la sortie du plateau annonce 6 ou 8 canaux, chaque paire de haut-parleurs (avant, arrière, côté) bipe à gauche puis plus aigu à droite (`ChannelMergerNode`, canaux discrets dans l'ordre du masque Windows, comme SDL) et le joueur dit où il l'entend.
Les réponses choisissent le mixage (`playfieldModeFromTest`, `packages/core/src/audio.ts`) : l'avant au fronton et une autre paire sur le plateau donnent le SSF ; l'avant et une autre paire sur le plateau, le surround dans le sens entendu ; sinon la stéréo.
Un câblage arrière / côté inversé pour le SSF est signalé.
Le récapitulatif montre les sorties choisies et le `Sound3D` qui sera écrit.

Permissions : Chromium ne donne le nom des sorties et n'autorise `setSinkId` qu'avec la permission `media` ou `speaker-selection` ; l'assistant accorde ces deux-là à ses fenêtres (`setPermissionCheckHandler`) et autorise la lecture sans geste de l'utilisateur (`autoplayPolicy`), puisque les boutons passent par le processus principal.
Si la sortie n'est pas trouvée, ou si Chromium ouvre moins de canaux qu'annoncé, l'écran le dit et le joueur peut répondre quand même.

Modèle (`cabinet.json`, champ `audio`) : sorties mémorisées par `endpointId`, avec le `containerId` en repli (un pilote qui recrée la sortie HDMI d'un écran) et l'empreinte de l'écran dont c'est le haut-parleur ; `roles` (fronton, plateau, éventuellement la même sortie) ; `playfieldMode` (`stereo`, `surround`, `ssf`) et `lockbarPair` en surround.
À chaque synchronisation, les sorties sont retrouvées par identifiant, puis par ContainerId s'il n'y a pas d'ambiguïté, jamais par le nom.

Clés écrites dans `VPinballX.ini` (`vpxAudioSettings`), gérées comme les autres (une valeur changée à la main n'est jamais écrasée en silence) :

| Clé | Valeur |
| --- | --- |
| `[Player] SoundDeviceBG` | nom courant de la sortie du fronton ; vide si aucune (sortie par défaut de Windows) |
| `[Player] SoundDevice` | nom courant de la sortie du plateau ; vide si aucune |
| `[Player] Sound3D` | stéréo : 0, ou 1 sur une sortie 7.1 (le mode 0 y annule les gains) ; surround : 3 (avant côté lockbar) ou 2 (arrière côté lockbar) ; SSF : 5 |

Un modèle sans étape « Son » (enregistré avant elle, ou sans aucune sortie à proposer) n'écrit aucune de ces clés, et l'écran de réglages les laisse modifiables.
Points à vérifier signalés par la synchronisation et l'assistant : sortie introuvable (la clé reste telle quelle, VPX jouera sur la sortie par défaut), deux sorties actives du même nom (VPX prend la dernière), `Sound3D` trop ambitieux pour les canaux réglés dans Windows (surround avec moins de 4 canaux, SSF avec moins de 6 : VPX retombe en stéréo, il faut régler la sortie en 5.1 ou 7.1 dans le panneau Son).
Le SSF en 5.1 est dit en simple information : parfait pour deux exciters ; quatre demandent le 7.1.
Cyber Pinball ne change jamais lui-même la sortie par défaut de Windows ni le format d'une sortie (pour le 5.1 ou le 7.1, il ouvre le panneau Son et c'est le joueur qui règle) ; seuls les boutons de volume de la borne règlent le volume de Windows (voir [Volume de la borne](#volume-de-la-borne)).
Les volumes de VPX (`MusicVolume`, `SoundVolume`) restent des réglages du joueur.

À confirmer sur une vraie borne : le rendu des modes 2, 3 et 5 de `Sound3D`, le sens attendu des paires arrière et côté en SSF (guide Pinscape : arrière côté joueur), les canaux qu'ouvre réellement Chromium sur une carte 7.1, le ContainerId d'une sortie HDMI après changement de port, et la disparition de la sortie HDMI d'un écran en veille.

### Volume de la borne

Les boutons **Volume −**, **Volume +** et **Muet** (facultatifs, étape « Boutons ») règlent le son de **toute la borne** : le volume de Windows, celui de la barre des tâches, donc tout ce qui joue (VPX, PinMAME, PuP-Pack, B2S, le front-end de Cyber Pinball), dans le front-end comme pendant une partie.

- **Volume +** : 5 % de plus, sur la grille des 5 % (16 % passe à 20 %) ; le son coupé revient d'abord, comme avec les touches de Windows.
- **Volume −** : 5 % de moins.
  **Maintenu une seconde** (`MUTE_HOLD_MS`), il coupe le son, ou le rétablit s'il l'était ; le niveau d'avant l'appui reste celui du son rétabli.
- **Muet** : coupe ou rétablit le son.
  Aucun encodeur ne l'envoie d'office : il n'a pas de touche par défaut et n'existe qu'une fois relevé.
- Un pas par appui, sans répétition : tenir Volume − sert à couper le son.
- **Sorties réglées** : celles des rôles de l'étape « Son » (fronton, plateau ; deux cartes en SSF), chacune du même pas que la sortie du fronton, leur écart gardé, bornées de 0 à 100 % ; sans étape « Son », la sortie par défaut de Windows (`volumeOutputIds`).
  Une sortie débranchée est passée.
- **Pastille** : au milieu du haut du plateau, tournée vers le joueur (`gameNoticeBounds`, coin `top-center`), l'icône, « Volume » et le niveau avec sa barre ; son coupé, « Son coupé » et comment le rétablir.
  Elle reste 1,6 s après le dernier appui, 4 s le son coupé, et le rappelle au retour d'une partie.
  C'est la fenêtre des notifications en partie (`overlay`, `app/src/game-notice.ts`) : transparente, jamais focalisée, traversée par les clics, absente des captures et des enregistrements ; elle ne prend la main ni à VPX ni dans le front-end.
- **Lecture des boutons** (`app/src/cabinet-volume.ts`) : sondage toutes les 25 ms, quelle que soit la fenêtre au premier plan, touches du clavier par `GetAsyncKeyState` (`keysDown`), boutons du joystick par SDL (`watchJoystickButtons`), comme la combinaison des réglages en partie.
  Un bouton relevé sur une touche multimédia du clavier (`AudioVolumeUp`, `AudioVolumeDown`, `AudioVolumeMute`) est laissé à Windows, qui règle déjà le son à son appui ; la pastille montre le résultat.
- **Volume de Windows** (`readEndpointVolumes`, `writeEndpointVolumes`, `packages/win-displays/src/system-volume.ts`) : Core Audio, `IMMDeviceEnumerator` puis `IAudioEndpointVolume` (`GetMasterVolumeLevelScalar`, `SetMasterVolumeLevelScalar`, `GetMute`, `SetMute`) appelés par leur table de méthodes avec koffi ; les sorties sont désignées par leur identifiant MMDevice, celui de l'étape « Son ».
- **`[Input]`** : `Mapping.VolumeDown` et `Mapping.VolumeUp` n'ont plus de touche (`Key;0`), avec ou sans relevé, et un bouton de joystick qui y avait été écrit est retiré (`vpxVolumeSettings`) ; sinon `-` et `=` régleraient aussi VPX, qui afficherait un autre volume.
  Une manette ajoutée à la main dans F12 > « Input Settings » reste.
- **Hors écran** (essais sans opérateur), le volume de Windows n'est jamais touché : un volume simulé, et les appuis arrivent par les fenêtres du front-end (étapes `hold:` et `release:` de l'autopilote).
  Captures : `volume-borne-niveau.png`, `volume-borne-coupe.png`.
  Tests : [cabinetvolume.test.ts](../../packages/core/src/test/cabinetvolume.test.ts).

### Volume du jeu

Une ROM trop faible face aux bruits mécaniques de la table (Medieval Madness sur un PinCab, 12/11/2026) ne se corrige ni par le volume de la borne, qui monte tout, ni par PinMAME : son réglage `volume` (`HKCU\Software\Freeware\Visual PinMame\<rom>`) est une atténuation, déjà à 0, son maximum.
Le volume est celui de la machine elle-même : sur une WPC, une Stern ou une Data East, la ROM le garde dans sa NVRAM, et on le règle comme sur la vraie machine, porte du monnayeur ouverte, avec ses boutons − et +.

- **Boutons** (facultatifs, étape « Boutons ») : « Porte du monnayeur » (Fin par défaut), « Porte : bouton − » (8) et « Porte : bouton + » (9).
  Un bouton libre de la borne, au joystick comme au clavier, peut tenir chacun d'eux ; un relevé fait avant eux les montre au récapitulatif, où l'on refait ce bouton seul.
- **Chemin jusqu'à la ROM** : les actions `CoinDoor`, `Service2` et `Service3` de VPX arrivent au script de la table comme `keyCoinDoor`, `keyDown` et `keyUp` (`scripts/VPMKeys.vbs`), que `vpmKeyDown` (`WPC.vbs`…) donne aux interrupteurs de la porte.
  La porte bascule à chaque appui (`toggleKeyCoinDoor`).
- **En partie** : porte, puis − ou + autant de fois qu'il faut (la ROM affiche le volume sur le DMD), puis porte pour la refermer.
  Le réglage reste pour cette table, dans sa NVRAM, et Cyber Pinball le garde comme choix du joueur (voir [Volume de la ROM](#volume-de-la-rom)).
- **Limites** : les machines plus anciennes (System 11, Gottlieb, premières électroniques) ont souvent un potentiomètre sur la carte son et pas de volume dans la ROM ; les boutons − et + n'y règlent rien.
  Les boutons Échap et Entrée du menu de service (7 et 0, `Service1` et `Service4`) gardent leurs touches de VPX, sans bouton à relever.
- Tests : [buttons.test.ts](../../packages/core/src/test/buttons.test.ts) (« porte du monnayeur et ses boutons − et + »).

### Volume de la ROM

Les Williams WPC et une partie des Stern SAM gardent leur volume principal dans la mémoire de la ROM (NVRAM, `<pinmame>\nvram\<rom>.nv`), pas dans VPX.
Sans mémoire, la ROM pose au démarrage son volume d'usine : 12 sur 31 en WPC, faible à côté des bruits de la table (Monster Bash presque muet, 17/11/2026), 40 sur 63 en Stern SAM.
Le changer demandait le geste de la porte du monnayeur en partie (ci-dessus), que personne ne connaît.
Cyber Pinball lit ce volume, le dit sur la fiche de la table, le règle hors partie dans « Réglages de cette table », et monte de lui-même un volume d'usine bas au volume conseillé juste avant la partie.
Code : [romvolume.ts](../../packages/core/src/romvolume.ts) (état, conseil, choix du joueur), [romscores.ts](../../packages/core/src/romscores.ts) (lecture et écriture de la mémoire), [app/src/rom-volume.ts](../../app/src/rom-volume.ts) (avant et après la partie), [app/src/settings.ts](../../app/src/settings.ts) (réglage).

- **Où est le volume** (`romMasterVolume`) : la carte mémoire de la ROM (Pinball Memory Maps, la même que pour les billes par partie et les records, lue dans le cache `<données>\cache\cartes-memoire`, sans réseau) situe `game_state.volume` (« Volume », « Master Volume »).
  Il n'est retenu que s'il se lit et s'écrit sûrement : un octet entier, une plage, une seule zone de NVRAM, des sommes de contrôle décrites.
  Sinon (Whitestar, Data East, System 11…), la machine ne garde pas son volume dans une mémoire que Cyber Pinball sait lire.
- **Quelle mémoire** (`tablePinmameDir`, `romVolumeStatus`) : `<table>\pinmame\nvram` quand la table a ses ROM à côté d'elle, sinon le dossier PinMAME commun ; la première ROM que PinMAME charge (alias compris) dont la carte situe le volume.
- **Ce que la ROM jouera** (`readRomVolume`) : la valeur gardée ; sans mémoire (la ROM la crée à sa première partie), avec un bloc vierge, une somme de contrôle fausse ou une valeur hors plage, son volume d'usine.
  Volume d'usine : celui de la carte (Stern SAM), sinon 12 pour une WPC (`WPC_FACTORY_VOLUME`, mesuré au banc libpinmame sur The Addams Family et Monster Bash).
- **Bas et conseillé** (`romVolumeAdvice`), d'après la plage de la ROM, jamais d'après une borne : bas sous la moitié de la plage, conseillé aux trois quarts.
  WPC : bas sous 16, conseillé 23 sur 31 ; Stern SAM : bas sous 32, conseillé 47 sur 63 (leur volume d'usine, 40, n'est pas bas).
- **Écriture** (`writeRomVolume`, `setRomVolume`) : toujours hors partie, sur la mémoire relue juste avant (des records ont pu s'y écrire) ; l'octet et ses copies en miroir posés, chaque somme de contrôle qui les couvre refaite, le résultat relu, puis écrit d'un bloc (`writeFileAtomic`).
  Refusée, avec sa raison, quand elle n'est pas sûre : valeur hors plage, octet qu'aucune somme ne couvre, ou bloc qui mêle le volume à d'autres réglages dont la somme est déjà fausse (la refaire validerait des octets que la ROM rejetait).
  Un bloc qui ne tient que le volume (WPC, SAM) se refait toujours : vierge, il devient juste.
- **Avant la partie** (`beforeGame`) : le volume voulu est posé, s'il ne l'est pas déjà ; le choix du joueur, sinon, en automatique, le volume conseillé à la place d'un volume d'usine bas.
  Sans mémoire, rien n'est écrit : la ROM la crée pendant la première partie, au volume d'usine, et Cyber Pinball monte ce volume bas dès la fin de cette partie.
  Jamais dans le double d'une partie entre amis (son volume est déjà celui de la borne, voir [Communauté : le réseau des bornes](amis-le-reseau-des-bornes.md#communauté--le-réseau-des-bornes)), ni pour « Régler l'affichage en partie ».
  Journal : « Volume de la ROM (…, taf_l7) : 12 → 23 sur 31 avant la partie (volume d'usine bas, conseillé). » (« usine → 23 » pour un bloc vierge).
- **Après la partie** (`afterGame`, `romVolumeChangedInGame`) : un volume changé à la porte du monnayeur pendant la partie devient le choix du joueur, gardé ensuite (journal : « … réglé à la porte pendant la partie, gardé. ») ; un volume resté celui d'usine après une première partie n'est pas un choix.
  Les choix du joueur sont dans `<données>\volumes-rom.json`, par fichier `.nv`.
- **Volume bas réglé ailleurs** : un volume bas qui n'est ni d'usine ni choisi dans Cyber Pinball (réglé dans un autre front-end, ou à la porte avant Cyber Pinball) n'est jamais changé seul, il est peut-être voulu.
  Le diagnostic le signale : constat « Volume de la ROM bas » (`lowRomVolume`, `romVolumeFinding`), À vérifier dans le diagnostic de la table et dans la ligne « Tables » de la [Santé de la borne](sante-de-la-borne.md#santé-de-la-borne), avec la correction « Monter le volume de la ROM à 23 sur 31 » (opération `romVolume` de `applyOps` : la mémoire relue au moment d'écrire, l'ancienne à la corbeille).
- **Fiche de la table** (ligne « Volume de la ROM » du résumé de ses fichiers, `romVolumeLine`) : « 12 sur 31, d'usine, faible : monté à 23 avant la partie », « d'usine, 12 sur 31 (faible) : monté à 23 dès la fin de la première partie », « 18 sur 31 (votre réglage) », « … : remis à … (votre réglage) avant la partie », ou « 10 sur 31 : bas », en orange, avec « volume de la ROM bas » dans la ligne « À vérifier ».
  Une table dont la ROM ne garde pas son volume n'a pas cette ligne.
- **« Réglages de cette table » > Son** : une ligne « Volume de la ROM », après les volumes de VPX, pour toute table qui joue une ROM.
  Start ouvre la liste : « Automatique : 23 si le volume d'usine est bas » (conseillé), puis chaque valeur de la plage (« 12 sur 31 »…), annotée « d'usine », « conseillé » ou « bas ».
  Le choix est écrit aussitôt dans la mémoire ; sans mémoire encore, il est retenu et posé à la fin de la première partie.
  « Valeur par défaut » (Suppr) revient à l'automatique.
  Badge : « Réglé pour cette table », « Monté à 23 avant la partie » (volume d'usine bas que Cyber Pinball monte seul), « Bas » ou « Automatique ».
  Le détail donne la valeur utilisée, le réglage de la table, la plage, le volume d'usine, le conseillé, le fichier de la mémoire (« créée à la première partie » s'il manque) et le geste de la porte avec les touches de la borne.
- **Machine qui ne garde pas son volume en mémoire** (ou carte pas encore connue, dossier de PinMAME introuvable) : la ligne dit « Réglé à la machine », en lecture seule ; Start dit pourquoi Cyber Pinball ne peut pas le régler et rappelle le geste avec les touches de la borne (« pendant la partie, ouvrir la porte du monnayeur (Fin), puis − (8) ou + (9) », `romVolumeGesture`).
  Sans ces boutons relevés, il rappelle que le volume de VPX (« Volume du backglass ») monte aussi la musique et les voix de la ROM.
- Tests : [volume-des-rom.test.ts](../../packages/core/src/test/volume-des-rom.test.ts), sur des mémoires réelles mesurées au banc libpinmame (WPC, Stern SAM, Data East), et le piège `lowRomVolume` de [doctor-traps.test.ts](../../packages/core/src/test/doctor-traps.test.ts).

### Musique et son d'une table

Une table peut se jouer muette sans rien dire à l'écran : VPX passe sans un mot une musique qu'il ne trouve pas, et un réglage propre à la table peut couper son son.
Après chaque partie, le journal de la borne dit quelles sorties du son VPX a ouvertes, celles qu'il n'a pas trouvées et la musique qu'il n'a pas trouvée (« Son de la partie (…) », voir « Son, DMD et erreurs du script au journal de la borne » dans [Lancement d'une partie](lancement-d-une-partie.md#lancement-dune-partie)).

- **Son coupé pour cette table** (`tableAudioMuted`, `mutedAudioSettings`) : le `.ini` propre à la table règle à 0, dans `[Player]`, le volume du fronton (`MusicVolume` : la musique et les sons joués au fronton), celui du plateau (`SoundVolume`), ou les anciens interrupteurs `PlayMusic` et `PlaySound` ; c'est souvent un `.ini` repris d'une autre installation.
  Le diagnostic de la table le signale en avertissement (« Son coupé pour cette table » : « ….ini règle MusicVolume à 0 pour cette table seulement : elle se joue sans ce son. »), avec « Rendre le son à cette table ».
  La correction retire ces seules clés, et met le `.ini` à la corbeille s'il ne contenait qu'elles : la table suit alors le réglage général.
- **Musique introuvable** (`musicMissing`) : VPX cherche la musique que joue le script (`PlayMusic`) dans le dossier `music` de la table, puis dans celui de VPX, et écrit « Failed to stream music: … » dans `vpinball.log` quand il ne la trouve pas.
  Le diagnostic lit la dernière partie de la table dans ce journal et le signale en avertissement : « Musique introuvable » (« À la dernière partie, VPX n'a pas trouvé « … » : il cherche la musique de la table dans « …\music ». »), avec le rappel qu'elle est fournie avec la table d'origine, à mettre dans le dossier d'import avant « Ajouter une table ».
  Le constat disparaît après une partie où VPX trouve la musique.
- **Musique lue dans le script** : Cyber Pinball reconnaît la musique que joue le script, que son nom soit écrit en clair (`PlayMusic "Akira\track.mp3"`), tenu par une variable (`PlayMusic MusicDir & "theme.mp3"`, avec `MusicDir = "Goldorak\"`) ou passé à une procédure du script qui la joue (`Sub PlaySong(s) : PlayMusic s : End Sub`, puis `PlaySong "theme.mp3"`).
  Un nom qui ne se lit pas en entier dans le texte n'est jamais deviné.
  À la reprise des tables d'une autre installation, cette musique suit la table ; si elle n'est ni dans le dossier Music de l'installation ni dans celui de la table, l'écran de la reprise la dit absente (« absent de l'installation : musique « … » »).
- **Musique portée par le PuP-Pack** : une table dont la musique passe par son PuP-Pack (une playlist nommée « Music », « Audio », « Sound »…) est muette tant que cette playlist est vide.
  Le diagnostic signale alors « Playlist du PuP-Pack vide » en avertissement, et non plus en simple information : « La musique de la table passe par ce pack (« Music ») : sans elle, la table est muette. », avec le conseil de reprendre le pack en entier, ses vidéos et sa musique étant souvent un téléchargement à part (voir [PuP-Packs](pup-packs.md#pup-packs)).
- Tests : [son-et-dmd.test.ts](../../packages/core/src/test/son-et-dmd.test.ts) (journal, constats, musique nommée par une variable ou une procédure) et les pièges `tableAudioMuted` et `musicMissing` de [doctor-traps.test.ts](../../packages/core/src/test/doctor-traps.test.ts).
