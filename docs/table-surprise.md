[English](surprise-table.md) · Français

# Table surprise

## Utilisation

Depuis la roue des tables, maintenir les deux flippers pendant 1,5 seconde. Les appuis courts gardent leur navigation habituelle. Le voile du playfield fait défiler les logos autorisés pendant environ trois secondes, puis attend que les deux flippers soient relâchés avant de passer au lanceur habituel. Sans logo lisible, le titre reste affiché.

Exit annule. Un MagnaSave annule aussi et garde la priorité à la combinaison de déverrouillage invité. Start, les clics et les commandes du téléphone ne lancent pas une deuxième partie pendant le tirage. Le backglass et le DMD gardent leur présentation courante.

## Autorisations

La V1 n'infère jamais le contenu d'une table à partir de son titre ou de sa collection. Un administrateur ouvre la fiche, **Gérer la table → Table surprise**, puis confirme soit « adaptée à la famille et jouable », soit « mode normal seulement et jouable ». Les tables adultes, masquées ou à vérifier restent exclues. L'invité ne peut pas accorder ou changer ces autorisations.

Les confirmations sont propres à chaque entrée et à cette installation, dans `table-surprise.json` du dossier des données. Elles ne modifient pas les `.info` partagés. Les variantes restent distinctes. Une table sans confirmation n'est jamais envoyée au rendu du tirage, même comme logo intermédiaire.

Le tirage utilise la collection active exacte, sans le repli de navigation vers Toutes. Une collection vide ou disparue ne lance rien. En mode invité, seules les entrées confirmées familiales de la collection imposée participent.

## Disponibilité

Les contrôles relisent les fichiers et le moteur effectivement utilisés. VPX exige un format reconnu et compatible, un script analysable et une ROM trouvée si elle est demandée. Future Pinball exige son FPT et son lanceur. Les dépendances dynamiques et le bon fonctionnement du pack doivent avoir été vérifiés par l'administrateur avant confirmation.

Pour Pinball FX, l'administrateur confirme la possession et l'accessibilité de la table avec le compte Steam actif. La confirmation est liée à ce compte et à l'identifiant de table. Ce n'est pas une interrogation de l'API des droits Steam. Si le compte actif est inconnu, ou pour Epic, FX3 et Pinball M, la V1 exclut l'entrée. Ces moteurs restent utilisables normalement hors tirage.

Les empreintes incluent taille et date du fichier de table, du script externe éventuel, du moteur et des dépendances relevées. Une modification exige une nouvelle confirmation. Ces contrôles ne garantissent ni l'intégrité de toutes les données du jeu ni l'absence d'un futur plantage ; les messages et protections du lanceur natif restent actifs.

## Organisation technique

`packages/core/src/table-surprise.ts` contient le geste, la politique fermée par défaut, le tirage uniforme par ID et la session annulable. Horloge, hasard et lanceur sont injectables. Une génération invalide les résultats tardifs ; le rendu ne décide ni du gagnant ni du lancement.

`app/src/table-surprise.ts` assure les contrôles locaux et le réglage administratif. Les dépendances relevées à la confirmation sont conservées pour ne pas extraire ou analyser toutes les tables à chaque maintien. Aucun exécutable de jeu n'est utilisé pour ces contrôles.

`frontend.ts` raccorde les boutons configurés, la collection exacte, le mode invité et le lanceur existant. Une réservation commune est acquise avant `backups.yieldToGame()`, revérifiée après cette attente et libérée à chaque sortie. Exit peut invalider une préparation encore en attente. Les continuations Zen repassent par cette même porte.

La navigation joystick du menu est suspendue pendant la phase de jeu, avant toute reprise de focus : Electron peut encore croire le menu actif alors que Windows a donné le clavier à VPX. Les observateurs globaux des boutons et le menu des réglages en partie restent disponibles. Exit pendant un chargement lent conserve son comportement habituel.

`app/renderer/table-surprise.js` et sa feuille de style affichent uniquement le playfield, utilisent les médias locaux existants, respectent les rotations et réduisent le mouvement lorsque cette préférence est active. La minuterie du processus principal reste l'autorité, même si le rendu perd une image.

## Validation

`npm run verifier -- table-surprise joystick-menu-game guestmode collections cinema i18n` contrôle la politique, les temporisations, les annulations, les commandes concurrentes, les fichiers, le focus et l'intégration. Le test Electron utilise des fichiers fictifs et une fenêtre rendue en mémoire, muette, jamais montrée. Il couvre les quatre rotations en 4K, le FHD, le titre de secours et l'annulation.

Exécuter également `npm run build`, `npm run test:electron` et `npm test` avant une contribution. Les essais réels de boutons, de lisibilité sur un pincab et du lancement de chaque moteur restent des tests humains séparés. Aucun jeu réel ni contrôleur DOF ne doit être démarré par les tests de Table surprise.
