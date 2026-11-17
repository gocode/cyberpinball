[English](../manual/sound.md) · Français · [Sommaire du manuel](../manuel.md)

## Son

VPX 10.8.1 n'a que deux sorties : `[Player] SoundDeviceBG` (fronton : musique et voix de la ROM, AltSound, PuP-Pack, musique de la table) et `[Player] SoundDevice` (plateau : bruits mécaniques, mixés selon `Sound3D`).
Il les désigne par le **nom Windows** de la sortie (« Haut-parleurs (USB Audio Device) »), comparé au caractère près ; un nom introuvable l'envoie sans un mot sur la sortie par défaut de Windows.
Ce nom est localisé, renommable et parfois partagé par deux cartes identiques : comme pour les écrans, Cyber Pinball garde sa propre empreinte et réécrit le nom courant à chaque synchronisation.

**Détection** (`probeAudioOutputs`, `packages/win-displays/src/audio.ts`) : sorties actives lues dans `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\{guid}`, en lecture seule et par l'API Unicode (`RegGetValueW`), car `reg.exe` abîme les accents.
Pour chacune : identifiant MMDevice (`{0.0.0.00000000}.{guid}`), nom attendu par VPX (« DeviceDesc (interface) »), bus, facteur de forme, canaux et masque des haut-parleurs réglés dans Windows, ContainerId, et sortie par défaut (la sortie active au plus grand `Level:0`, recoupé avec Chromium sur le PC de développement).
Une sortie HDMI se rattache à son écran par le ContainerId du moniteur PnP (`ObservedDisplay.containerId`) ; le conteneur commun à tout ce qui est intégré au PC (`{00000000-0000-0000-FFFF-FFFFFFFFFFFF}`) ne rattache rien.
`npm run probe` affiche tout cela.

**Étape « Son » de l'assistant**, après les écrans, ou seule (menu système > « Borne » > « Configuration de la borne » > « Son de la borne », `--assistant --son` : seules `SoundDevice`, `SoundDeviceBG` et `Sound3D` sont écrites).
Les sorties virtuelles (Steam, Oculus : bus `ROOT`) et Bluetooth sont écartées, sauf si elles avaient déjà un rôle.
Chaque sortie joue sur elle-même un son généré par oscillateur (aucun fichier), n bips pour la sortie n, en boucle : `AudioContext.setSinkId` dans une fenêtre de l'assistant, la sortie étant trouvée par `enumerateDevices` sous son nom Windows (Chromium ajoute « (vid:pid) » au nom des sorties USB, ignoré pour la comparaison).
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
Points à vérifier signalés par la synchronisation et l'assistant : sortie introuvable (la clé reste telle quelle, VPX jouera sur la sortie par défaut), deux sorties actives du même nom (VPX prend la dernière), `Sound3D` trop ambitieux pour les canaux réglés dans Windows (surround avec moins de 4 canaux, SSF avec moins de 8 : VPX retombe en stéréo, il faut régler la sortie en 5.1 ou 7.1 dans le panneau Son).
Cyber Pinball ne change jamais lui-même la sortie par défaut de Windows ni le format d'une sortie ; seuls les boutons de volume de la borne règlent le volume de Windows (voir [Volume de la borne](#volume-de-la-borne)).
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
  Le réglage reste pour cette table, dans sa NVRAM.
- **Limites** : les machines plus anciennes (System 11, Gottlieb, premières électroniques) ont souvent un potentiomètre sur la carte son et pas de volume dans la ROM ; les boutons − et + n'y règlent rien.
  Les boutons Échap et Entrée du menu de service (7 et 0, `Service1` et `Service4`) gardent leurs touches de VPX, sans bouton à relever.
- Tests : [buttons.test.ts](../../packages/core/src/test/buttons.test.ts) (« porte du monnayeur et ses boutons − et + »).
