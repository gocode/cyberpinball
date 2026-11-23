// Vision 3D dans le front-end : l'entrée du Menu système, son écran (activer, calibrer, régler,
// essayer le capteur, installer le pilote de la Kinect) et ce que le lancement d'une partie lui
// demande (prepareVision3d, warmVision3d, noteVision3dGame). Sorti de frontend.ts tel quel ; le
// capteur et la lecture des réglages restent dans vision3d.ts.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { shell } from 'electron';
import {
  intensityLabel,
  language,
  layoutOf,
  loadCabinet,
  megabytes,
  nextIntensity,
  nextSmoothing,
  smoothingLabel,
  SYSTEM_ITEMS,
  t,
  vision3dGameReport,
  vision3dMenuText,
  vision3dPluginLog,
  vision3dReadiness,
  type IconName,
  type Locations,
  type Vision3dHardware,
  type Vision3dSetting,
  type Vision3dSourceKind,
} from '@cyberpinball/core';
import { findComponent } from '@cyberpinball/installer';
import { setCursorPosition } from '@cyberpinball/win-displays';
import { observedDisplays, simulatedDisplays } from './displays';
import type { createLibrary, Row } from './library';
import { askElevation } from './uac-confirm';
import { downloadKinectDriver, HeadTracker, installKinectDriver, installVision3dPlugin, probeVision3d, readVision3d, vision3dPluginFiles, writeVision3d } from './vision3d';

/** Ce que le front-end prête à la Vision 3D : ses chemins, l'écran des tables, et l'état d'une partie. */
export interface Vision3dMenuContext {
  loc: Locations;
  library: ReturnType<typeof createLibrary>;
  /** Une partie est en cours (le capteur d'essai s'arrête, l'écran ne se rouvre pas). */
  playing(): boolean;
  /** Un lancement est en cours. */
  launching(): boolean;
  /** Le réglage de la VR (`auto` : la partie part dans le casque s'il est vu). */
  vrMode(): string;
  headsetDetected(): boolean;
  /** Libère les écrans (Bureau Windows) avant d'ouvrir une page de Windows. */
  showDesktop(): void;
}

export function createVision3dMenu(ctx: Vision3dMenuContext) {
  const { loc, library } = ctx;
  // « Vision 3D » (Menu système > Ma borne, vision3d.ts) : la perspective des tables suit la tête du joueur,
  // par une webcam ou une Kinect pour Xbox 360. Sans capteur, l'entrée reste visible, grisée avec sa
  // raison ; une Kinect sans pilote propose de l'installer (chez Microsoft, avec l'accord de Windows).
  let vision3d = readVision3d(loc.dataDir);
  const headTracker = new HeadTracker({ dataDir: loc.dataDir, appDir: path.join(__dirname, '..'), log: (line) => console.log(line) });
  /** Capteurs branchés, relus au plus toutes les deux secondes (le menu relit ses entrées à chaque image). */
  let vision3dProbe: { at: number; hardware: Vision3dHardware } | undefined;
  function vision3dHardware(fresh = false): Vision3dHardware {
    if (fresh || !vision3dProbe || Date.now() - vision3dProbe.at > 2000) vision3dProbe = { at: Date.now(), hardware: probeVision3d() };
    return vision3dProbe.hardware;
  }
  const vision3dPluginMissing = () => !vision3dPluginFiles(path.join(__dirname, '..'));
  const kinectDriverMb = () => megabytes(findComponent('kinect-sdk-1.8').size);
  const vision3dText = () => vision3dMenuText(vision3d, vision3dReadiness(vision3dHardware(), vision3d.source), { driverMb: kinectDriverMb(), pluginMissing: vision3dPluginMissing() });
  library.provideSystemItem('vision3d', {
    badge: 'beta',
    get label() {
      return vision3dText().label;
    },
    get detail() {
      return vision3dText().detail;
    },
    get tone() {
      return vision3dText().unavailable ? ('quiet' as const) : undefined;
    },
    run: () => {
      if (vision3dPluginMissing()) return void library.openSystem();
      vision3dHardware(true);
      openVision3dScreen();
    },
  });

  /** Essai du capteur hors partie : positions vues, et quand il s'arrête de lui-même (la caméra ne reste pas allumée). */
  let vision3dTest: { until: number; seen: number; last?: { x: number; y: number; z: number }; timer: NodeJS.Timeout } | undefined;
  const VISION3D_TEST_MS = 20_000;

  function stopVision3dTest(): void {
    if (!vision3dTest) return;
    clearInterval(vision3dTest.timer);
    vision3dTest = undefined;
    headTracker.stop();
  }

  /**
   * Écran « Vision 3D » : où en est le capteur (prêt, ou pourquoi pas, en clair), l'activer, l'essayer
   * sans lancer de table, installer ou réinstaller le pilote de la Kinect, ouvrir « Isolation du noyau ».
   */
  function openVision3dScreen(at = 0): void {
    const back = () => {
      stopVision3dTest();
      vision3dCalibrationDone = false;
      library.openSystem();
    };
    library.openCustom(() => {
      const hw = vision3dHardware();
      const readiness = vision3dReadiness(hw, vision3d.source);
      const rows: Row[] = [
        readiness.ready
          ? { icon: 'check', text: t('{sensor} prête', { sensor: readiness.label }), ...(readiness.note && { detail: readiness.note }), tone: 'ok' as const }
          : { icon: 'alert', text: readiness.reason, tone: 'warning' as const },
        { icon: 'eye', text: vision3d.mode === 'on' ? t('Vision 3D activée : la perspective des tables suit ta tête') : t('Vision 3D désactivée'), tone: vision3d.mode === 'on' ? ('ok' as const) : ('quiet' as const) },
      ];
      const configuration = loadCabinet(loc.dataDir);
      const calibrated = configuration ? vision3d.neutral[configuration.id] : undefined;
      const progress = headTracker.calibrationProgress;
      rows.push(
        progress !== undefined
          ? { icon: 'pin', text: t('Calibrage : reste immobile en position de jeu… {p} %', { p: Math.round(progress * 100) }), tone: 'info' as const, progress: { value: progress, tone: 'info' as const } }
          : vision3dCalibrationDone
            ? { icon: 'pin', text: t('Position de jeu enregistrée pour cette configuration'), tone: 'ok' as const }
            : calibrated
              ? { icon: 'pin', text: t('Position de jeu calibrée pour cette configuration'), detail: t('Intensité {i} · réactivité {r}', { i: intensityLabel(vision3d.intensity), r: smoothingLabel(vision3d.smoothing) }), tone: 'quiet' as const }
              : { icon: 'pin', text: t('Position de jeu pas encore calibrée : elle sera mesurée au début de la prochaine partie'), tone: 'quiet' as const },
      );
      if (vision3dLastGame && !vision3dTest) rows.push({ icon: vision3dLastGame.ok ? 'check' : 'alert', text: vision3dLastGame.text, tone: vision3dLastGame.ok ? ('ok' as const) : ('warning' as const) });
      if (vision3dTest) {
        const failure = headTracker.failureReason;
        const last = vision3dTest.last;
        rows.push(
          failure
            ? { icon: 'alert', text: t('Essai : le capteur ne répond pas ({reason})', { reason: failure }), tone: 'warning' as const }
            : last && headTracker.state === 'tracking'
              ? {
                  icon: 'pulse',
                  text: t('Essai : tête vue à {d} m', { d: (last.z / 100).toLocaleString(language() === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 2 }) }),
                  detail: t('{x} cm à droite, {y} cm en hauteur (depuis le capteur) · penche-toi : les valeurs suivent', { x: Math.round(last.x), y: Math.round(last.y) }),
                  tone: 'ok' as const,
                }
              : { icon: 'pulse', text: vision3dTest.seen ? t('Essai : tête perdue, reviens devant le capteur') : t('Essai : capteur allumé, mets-toi devant lui…'), tone: 'info' as const },
        );
      }
      const actions: { label: string; detail?: string; icon: IconName; run: () => void }[] = [];
      if (readiness.ready) {
        actions.push({
          label: vision3d.mode === 'on' ? t('Désactiver la Vision 3D') : t('Activer la Vision 3D'),
          icon: 'eye',
          run: () => {
            vision3d = { ...readVision3d(loc.dataDir), mode: vision3d.mode === 'on' ? 'off' : 'on' };
            writeVision3d(loc.dataDir, vision3d);
            // Désactivée : le capteur gardé allumé depuis la dernière partie s'éteint aussitôt.
            if (vision3d.mode === 'off' && !vision3dTest) headTracker.stop();
            console.log(`Vision 3D : ${vision3d.mode === 'on' ? `activée (${readiness.label})` : 'désactivée'}.`); // i18n-ignore : journal
            openVision3dScreen(library.cursor());
          },
        });
        actions.push({
          label: t('Calibrer la position de jeu'),
          detail: t('Mets-toi en position de jeu, regarde le milieu du plateau et ne bouge plus pendant deux secondes'),
          icon: 'pin',
          run: () => calibrateVision3d(readiness.source),
        });
        actions.push({
          label: t('Intensité : {v}', { v: intensityLabel(vision3d.intensity) }),
          detail: t('Choisir pour la changer, de 25 % (discrète) à 150 % (marquée) ; 100 % : comme une vraie fenêtre. Aussi en partie, avec les MagnaSave'),
          icon: 'gauge',
          run: () => setVision3dTuning({ intensity: nextIntensity(vision3d.intensity) }),
        });
        actions.push({
          label: t('Réactivité : {v}', { v: smoothingLabel(vision3d.smoothing) }),
          detail: t('Douce : la plus calme, un peu de retard ; vive : anticipe le mouvement de la tête, la moins en retard'),
          icon: 'sliders',
          run: () => setVision3dTuning({ smoothing: nextSmoothing(vision3d.smoothing) }),
        });
        actions.push({
          label: vision3dTest ? t('Arrêter l’essai') : t('Tester le capteur'),
          detail: vision3dTest ? undefined : t('Sans lancer de table : la position de ta tête, en direct, pendant {s} s', { s: VISION3D_TEST_MS / 1000 }),
          icon: 'pulse',
          run: () => (vision3dTest ? (stopVision3dTest(), openVision3dScreen(library.cursor())) : startVision3dTest(readiness.source)),
        });
      }
      if (!readiness.ready && readiness.installKinectDriver) {
        actions.push({ label: t('Installer le pilote de la Kinect'), detail: t('{mb} Mo, téléchargé chez Microsoft ; l’installer vaut acceptation de sa licence', { mb: kinectDriverMb() }), icon: 'download', run: () => askElevation((build, at) => library.openCustom(build, at), { title: t('Vision 3D'), what: t('Installer le pilote de la Kinect (Microsoft), sans fenêtre.'), go: () => installKinect(), later: () => openVision3dScreen(library.cursor()) }) });
      } else if (hw.kinect1 && hw.kinect1Driver && !hw.memoryIntegrity) {
        actions.push({ label: t('Réinstaller le pilote de la Kinect'), detail: t('Si la Kinect ne répond pas malgré son pilote ; Windows demande son accord'), icon: 'refresh', run: () => askElevation((build, at) => library.openCustom(build, at), { title: t('Vision 3D'), what: t('Installer le pilote de la Kinect (Microsoft), sans fenêtre.'), go: () => installKinect(), later: () => openVision3dScreen(library.cursor()) }) });
      }
      if (!readiness.ready && readiness.memoryIntegrity) {
        actions.push({
          label: t('Ouvrir « Isolation du noyau »'),
          detail: t('Dans Sécurité Windows : tu décides ; puis redémarre le PC'),
          icon: 'lock',
          run: () => {
            console.log('Vision 3D : ouverture de « Isolation du noyau » (Sécurité Windows).'); // i18n-ignore : journal
            stopVision3dTest();
            // Les écrans libérés d'abord (Bureau Windows) : la page ne s'ouvre pas derrière le menu.
            ctx.showDesktop();
            void shell.openExternal('windowsdefender://coreisolation');
          },
        });
      }
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      return {
        heading: SYSTEM_ITEMS.vision3d.label,
        icon: SYSTEM_ITEMS.vision3d.icon,
        lead: t('La perspective des tables suit ta tête, comme une fenêtre ouverte sur le plateau. Une webcam suffit ; une Kinect pour Xbox 360 vise seule ta tête. Les images restent sur ce PC.'),
        sections: [{ rows }],
        actions,
        back,
      };
    }, at);
  }

  /** Bilan de la dernière partie avec Vision 3D, montré dans l'écran « Vision 3D » et noté au journal. */
  let vision3dLastGame: { ok: boolean; text: string } | undefined;

  function noteVision3dGame(logFile: string, from: number): void {
    let text = '';
    try {
      // lecture entière : journal de VPX, recommencé à chaque lancement
      const all = fs.readFileSync(logFile);
      // VPX recommence son journal à chaque lancement : plus court qu'avant, il est tout neuf.
      text = all.subarray(all.length >= from ? from : 0).toString('utf8');
    } catch {
      text = '';
    }
    const { sent, failure, trackedAfterMs } = headTracker.summary();
    vision3dLastGame = vision3dGameReport(vision3dPluginLog(text), sent, failure, trackedAfterMs);
    console.log(`Vision 3D : ${vision3dLastGame.text}`); // i18n-ignore : journal (texte déjà traduit)
  }

  /** Calibrage demandé depuis l'écran Vision 3D : fait, il est dit sur l'écran (jusqu'à la sortie). */
  let vision3dCalibrationDone = false;

  /** Intensité ou réactivité changée : enregistrée, appliquée aussitôt au capteur allumé (essai ou partie). */
  function setVision3dTuning(change: Partial<Pick<Vision3dSetting, 'intensity' | 'smoothing'>>): void {
    vision3d = { ...readVision3d(loc.dataDir), ...change };
    writeVision3d(loc.dataDir, vision3d);
    headTracker.configure(vision3d);
    console.log(`Vision 3D : intensité ${intensityLabel(vision3d.intensity)}, réactivité ${vision3d.smoothing}.`); // i18n-ignore : journal
    if (!ctx.playing()) openVision3dScreen(library.cursor());
  }

  /** « Calibrer la position de jeu » : le capteur allumé (essai), deux secondes de mesures, enregistrées. */
  function calibrateVision3d(source: Vision3dSourceKind): void {
    vision3dCalibrationDone = false;
    if (!vision3dTest) startVision3dTest(source);
    if (vision3dTest) vision3dTest.until = Date.now() + VISION3D_TEST_MS;
    headTracker.calibrate((neutral) => {
      if (!neutral) return;
      vision3d = readVision3d(loc.dataDir);
      vision3dCalibrationDone = true;
      openVision3dScreen(library.cursor());
    });
    openVision3dScreen(library.cursor());
  }

  /** « Tester le capteur » : allumé hors partie, l'écran suit la tête en direct, puis s'éteint seul. */
  function startVision3dTest(source: Vision3dSourceKind): void {
    stopVision3dTest();
    const timer = setInterval(() => {
      if (!vision3dTest) return;
      if (Date.now() > vision3dTest.until || ctx.playing() || ctx.launching()) stopVision3dTest();
      openVision3dScreen(library.cursor());
    }, 300);
    vision3dTest = { until: Date.now() + VISION3D_TEST_MS, seen: 0, timer };
    headTracker.test(
      source,
      vision3d,
      (p) => {
        if (!vision3dTest) return;
        vision3dTest.seen++;
        vision3dTest.last = p;
      },
      loadCabinet(loc.dataDir)?.id,
    );
    openVision3dScreen(library.cursor());
  }

  /** Le pilote de la Kinect : téléchargé chez Microsoft, signature vérifiée, installé avec l'accord de Windows ; puis la Vision 3D s'active. */
  async function installKinect(): Promise<void> {
    if (!loc.root) return;
    const downloads = layoutOf(loc.root).downloads;
    let file: string | undefined;
    await library.task(t('Téléchargement du pilote de la Kinect chez Microsoft ({mb} Mo)…', { mb: kinectDriverMb() }), async () => {
      file = await downloadKinectDriver(downloads, library.downloads.manager);
    });
    if (!file) return;
    let installed = false;
    pointAtElevationPrompt();
    await library.task(t('Windows demande son accord : choisis « Oui » à la souris (le pointeur est posé sur sa fenêtre) ou au clavier, Alt+O'), async () => {
      const result = await installKinectDriver(file!);
      console.log(`Vision 3D : pilote de la Kinect ${result.ok ? 'installé' : `pas installé (${result.reason})`}.`); // i18n-ignore : journal
      if (!result.ok) throw new Error(result.cancelled ? t('Autorisation refusée dans la fenêtre de Windows : rien n’a changé') : t('Pilote de la Kinect pas installé : {reason}', { reason: result.reason }));
      installed = true;
    });
    if (!installed) return;
    vision3d = { ...readVision3d(loc.dataDir), mode: 'on' };
    writeVision3d(loc.dataDir, vision3d);
    vision3dHardware(true);
    openVision3dScreen();
  }

  /**
   * La fenêtre « Contrôle de compte d'utilisateur » s'ouvre au milieu de l'écran principal, sur un
   * bureau sécurisé où les boutons de la borne ne servent pas, et le pointeur, caché par le menu, peut
   * être sur un autre écran : il est posé au milieu de l'écran principal, sur le bouton « Oui » ou tout
   * près (constaté sur la borne le 10/11/2026 : pointeur introuvable, réponse impossible au clavier).
   */
  function pointAtElevationPrompt(): void {
    if (simulatedDisplays()) return;
    const main = observedDisplays().find((d) => d.primary);
    if (!main) return;
    try {
      setCursorPosition(main.bounds.x + main.bounds.width / 2, main.bounds.y + main.bounds.height / 2);
    } catch (error) {
      console.warn(`Vision 3D : pointeur non déplacé (${(error as Error).message})`); // i18n-ignore : journal
    }
  }

  /**
   * Partie avec Vision 3D : le capteur à allumer, ou undefined (désactivée, aucun capteur prêt, partie
   * en VR, réglage de l'affichage). Le plugin est remis dans VPX avant chaque partie s'il a changé.
   */
  function prepareVision3d(vpxExe: string, inVr: boolean): Vision3dSourceKind | undefined {
    const plugin = installVision3dPlugin(path.dirname(vpxExe), path.join(__dirname, '..'));
    if (plugin === 'installed') console.log('Vision 3D : plugin copié dans VPX.'); // i18n-ignore : journal
    if (vision3d.mode !== 'on' || inVr) return undefined;
    if (plugin === 'missing') {
      console.log('Vision 3D : activée, mais plugin absent de cette version ; partie sans suivi de la tête.'); // i18n-ignore : journal
      return undefined;
    }
    const readiness = vision3dReadiness(vision3dHardware(true), vision3d.source);
    if (!readiness.ready) {
      console.log(`Vision 3D : activée mais indisponible (${readiness.reason}) ; partie sans suivi de la tête.`); // i18n-ignore : journal
      return undefined;
    }
    return readiness.source;
  }

  /**
   * Au Start : le capteur de la Vision 3D allumé pendant le chargement de la table, rien n'est encore
   * envoyé à VPX (prepareVision3d décide ensuite pour la partie). Lecture du matériel en cache.
   */
  function warmVision3d(): void {
    // Partie qui partira dans le casque (VR activée, casque vu) : pas de Vision 3D, rien à allumer.
    if (vision3d.mode !== 'on' || (ctx.vrMode() === 'auto' && ctx.headsetDetected())) return;
    stopVision3dTest();
    const readiness = vision3dReadiness(vision3dHardware(), vision3d.source);
    if (readiness.ready) headTracker.warm(readiness.source, vision3d);
  }

  return {
    headTracker,
    /** Le réglage en vigueur (relu à chaque changement). */
    setting: () => vision3d,
    /** L'essai du capteur hors partie est en cours. */
    testing: () => vision3dTest !== undefined,
    setVision3dTuning,
    prepareVision3d,
    warmVision3d,
    noteVision3dGame,
  };
}
