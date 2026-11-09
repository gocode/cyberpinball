// Vision 3D, page de la webcam (app/src/vision3d.ts) : jamais montrée. Elle ouvre la caméra, repère
// le visage à chaque image avec MediaPipe (BlazeFace, sur le processeur) et renvoie la position des
// deux yeux. Les images ne quittent pas cette page. Modèle longue portée : devant une borne, le
// joueur est à plus d'un mètre de la caméra, son visage ne fait qu'un dixième de l'image ; le
// modèle courte portée (selfie) ne l'y trouve pas.
//
// Les images sont lues par MediaStreamTrackProcessor, pas par un élément vidéo de la page : dans une
// fenêtre cachée, Chromium peut cesser de décoder une vidéo qu'on ne voit pas. Aucun son.
'use strict';

(async () => {
  const api = window.cyberVision3d;
  const status = (text) => api.send({ type: 'status', text });
  const fail = (reason) => api.send({ type: 'failed', reason });

  const assets = await api.assets();
  if (!assets) return fail('fichiers de MediaPipe introuvables'); // i18n-ignore : journal de Cyber Pinball

  // MediaPipe en script classique (vision_bundle.js définit Vision), reçu en texte : un blob.
  const blobOf = (text, type) => URL.createObjectURL(new Blob([text], { type }));
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = blobOf(assets.bundle, 'text/javascript');
    s.onload = resolve;
    s.onerror = () => reject(new Error('MediaPipe illisible'));
    document.head.appendChild(s);
  }).catch((error) => fail(error.message));
  if (!window.Vision) return;

  let detector;
  try {
    const wasmUrl = URL.createObjectURL(new Blob([assets.wasm], { type: 'application/wasm' }));
    detector = await window.Vision.FaceDetector.createFromOptions(
      { wasmLoaderPath: blobOf(assets.loader, 'text/javascript'), wasmBinaryPath: wasmUrl },
      { baseOptions: { modelAssetBuffer: new Uint8Array(assets.model), delegate: 'CPU' }, runningMode: 'VIDEO', minDetectionConfidence: 0.5 },
    );
  } catch (error) {
    return fail(`détecteur de visage impossible à charger (${error.message})`); // i18n-ignore : journal de Cyber Pinball
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 } } });
  } catch (error) {
    return fail(`caméra indisponible (${error.name === 'NotReadableError' ? 'déjà utilisée par un autre logiciel' : error.message})`); // i18n-ignore : journal de Cyber Pinball
  }
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  status(`caméra ouverte : ${track.label || 'webcam'}, ${settings.width}×${settings.height} à ${Math.round(settings.frameRate || 0)} i/s`); // i18n-ignore : journal de Cyber Pinball

  const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
  let seen = 0;
  let missed = 0;
  let lastTs = -1;
  for (;;) {
    const { value: frame, done } = await reader.read();
    if (done) return;
    try {
      // Horodatage strictement croissant exigé par MediaPipe (millisecondes).
      const ts = Math.max(lastTs + 1, Math.round(frame.timestamp / 1000));
      lastTs = ts;
      const result = detector.detectForVideo(frame, ts);
      const face = (result.detections || []).reduce((best, d) => (!best || (d.boundingBox?.width ?? 0) > (best.boundingBox?.width ?? 0) ? d : best), undefined);
      const k = face?.keypoints;
      if (k && k.length >= 2) {
        // BlazeFace : 0 = œil droit du joueur, 1 = œil gauche (coordonnées normalisées).
        api.send({ type: 'eyes', eyes: { leftX: k[1].x, leftY: k[1].y, rightX: k[0].x, rightY: k[0].y }, width: frame.displayWidth, height: frame.displayHeight });
        if (seen++ === 0 || missed > 30) status('visage repéré'); // i18n-ignore : journal de Cyber Pinball
        missed = 0;
      } else if (++missed === 30) status('aucun visage devant la caméra'); // i18n-ignore : journal de Cyber Pinball
    } catch (error) {
      fail(`détection interrompue (${error.message})`); // i18n-ignore : journal de Cyber Pinball
      frame.close();
      return;
    }
    frame.close();
  }
})();
