// Lecture des images d'un média dans la page cachée du convertisseur. Le lecteur et son décodeur
// sont libérés sur toutes les issues, y compris après une erreur ou un seek qui ne répond plus.
export const MEDIA_FRAMES_SCRIPT = String.raw`
window.framesOf = async (id, video, times, maxWidth, out) => {
  const controller = new AbortController();
  let url;
  let reader;
  let bitmap;
  let timer;
  let fail;
  const timeout = new Promise((resolve, reject) => {
    fail = reject;
    timer = setTimeout(() => { controller.abort(); reject(new Error('media frame timeout')); }, 15000);
  });
  const grab = async (source, width, height, key) => {
    const w = Math.min(maxWidth, width);
    const h = Math.max(1, Math.round((height * w) / width));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h).data;
    await fetch('/out/' + key + '?w=' + w + '&h=' + h, { method: 'POST', body: pixels.buffer, signal: controller.signal });
  };
  try {
    return await Promise.race([timeout, (async () => {
      const blob = await (await fetch('/in/' + id, { signal: controller.signal })).blob();
      if (controller.signal.aborted) throw new Error('media frame timeout');
      if (!video) {
        bitmap = await createImageBitmap(blob);
        if (controller.signal.aborted) { bitmap.close(); bitmap = undefined; throw new Error('media frame timeout'); }
        await grab(bitmap, bitmap.width, bitmap.height, out + '0');
        return { width: bitmap.width, height: bitmap.height, count: 1 };
      }
      url = URL.createObjectURL(blob);
      reader = document.createElement('video');
      reader.muted = true;
      reader.preload = 'auto';
      reader.onerror = () => fail(new Error(reader.error?.message || 'video'));
      await new Promise((resolve) => { reader.onloadeddata = resolve; reader.src = url; });
      for (let i = 0; i < times.length; i++) {
        const at = reader.duration * times[i];
        if (Math.abs(reader.currentTime - at) > 0.001) {
          await new Promise((resolve) => { reader.onseeked = resolve; reader.currentTime = at; });
        }
        if (controller.signal.aborted) throw new Error('media frame timeout');
        await grab(reader, reader.videoWidth, reader.videoHeight, out + i);
      }
      return { width: reader.videoWidth, height: reader.videoHeight, count: times.length };
    })()]);
  } finally {
    clearTimeout(timer);
    controller.abort();
    bitmap?.close();
    if (reader) {
      reader.onloadeddata = reader.onseeked = reader.onerror = null;
      reader.pause();
      reader.removeAttribute('src');
      reader.load();
    }
    if (url) URL.revokeObjectURL(url);
  }
};
`;
