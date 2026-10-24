// Guet rapide des écrans clairs, lancé par docs\demo-ecrans-couverts.ps1 pendant chaque scénario.
// Les captures du bureau entier n'en prennent que deux ou trois par seconde : elles ratent les
// éclairs de 30 à 200 ms que Windows peint à l'apparition d'une fenêtre (app\src\no-flash.ts).
// Ici, seule la ligne de pixels du milieu de chaque écran est lue (chaque lecture de l'écran
// composé par DWM attend une image, ~16 ms, et coûte d'autant plus que la zone est grande) :
// une lecture par rangée d'écrans, une vingtaine de relevés par seconde. Un écran dont au moins
// 80 % des points relevés sont clairs (chaque composante à 200 ou plus) est noté clair, avec sa
// durée. Un point déjà clair sur le bureau d'avant le lancement ne compte qu'après avoir été
// sombre (couvert par Cyber Pinball) : une fenêtre claire du bureau n'est pas un écran clair.
//   node docs\guet-ecrans-clairs.cjs <dossier> <secondes> <nom:x,y,l,h> [<nom:x,y,l,h>…]
// Écrit <dossier>\clair.txt (une ligne par écran clair, et ce qui l'a suivi) ; s'arrête à la création de <dossier>\fin-guet.
const fs = require('node:fs');
const path = require('node:path');
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const gdi32 = koffi.load('gdi32.dll');
const GetDC = user32.func('void* __stdcall GetDC(void*)');
const ReleaseDC = user32.func('int __stdcall ReleaseDC(void*, void*)');
const SetProcessDpiAwarenessContext = user32.func('bool __stdcall SetProcessDpiAwarenessContext(intptr)');
const CreateCompatibleDC = gdi32.func('void* __stdcall CreateCompatibleDC(void*)');
const CreateCompatibleBitmap = gdi32.func('void* __stdcall CreateCompatibleBitmap(void*, int, int)');
const SelectObject = gdi32.func('void* __stdcall SelectObject(void*, void*)');
const BitBlt = gdi32.func('bool __stdcall BitBlt(void*, int, int, int, int, void*, int, int, uint32)');
const GetPixel = gdi32.func('uint32 __stdcall GetPixel(void*, int, int)');
const SRCCOPY = 0x00cc0020;
/** Points relevés sur la ligne du milieu de chaque écran, bords exclus. */
const POINTS = 24;
// Coordonnées physiques, comme celles des écrans que donne le script (Screen.Bounds, DPI système).
SetProcessDpiAwarenessContext(-4);

const [dir, seconds, ...specs] = process.argv.slice(2);
const screens = specs.map((spec) => {
  const [name, rect] = spec.split(':');
  const [x, y, w, h] = rect.split(',').map(Number);
  const xs = Array.from({ length: POINTS }, (_, i) => Math.round(x + (w * (i + 1)) / (POINTS + 1)));
  return { name, row: Math.round(y + h / 2), xs, start: [], dark: xs.map(() => false), since: undefined, color: '' };
});
const rows = [...new Set(screens.map((s) => s.row))];
const left = Math.min(...screens.map((s) => s.xs[0]));
const width = Math.max(...screens.map((s) => s.xs[POINTS - 1])) - left + 1;
const out = path.join(dir, 'clair.txt');
fs.writeFileSync(out, '');
const hex = (c) => '#' + [c & 255, (c >> 8) & 255, (c >> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('');
const dark = (c) => Math.max(c & 255, (c >> 8) & 255, (c >> 16) & 255) < 60;
const light = (c) => Math.min(c & 255, (c >> 8) & 255, (c >> 16) & 255) >= 200;
const clock = (t) => new Date(t).toTimeString().slice(0, 8) + '.' + String(t % 1000).padStart(3, '0');

const dc = GetDC(null);
const mem = CreateCompatibleDC(dc);
SelectObject(mem, CreateCompatibleBitmap(dc, width, rows.length));
const read = () => rows.forEach((row, i) => BitBlt(mem, 0, i, width, 1, dc, left, row, SRCCOPY));
const colorsOf = (s) => s.xs.map((x) => GetPixel(mem, x - left, rows.indexOf(s.row)));
read();
for (const s of screens) s.start = colorsOf(s);
const end = Date.now() + Number(seconds) * 1000;
let rounds = 0;
const tick = () => {
  read();
  const now = Date.now();
  for (const s of screens) {
    const colors = colorsOf(s);
    colors.forEach((c, i) => dark(c) && (s.dark[i] = true));
    const lit = colors.filter((c, i) => light(c) && (!light(s.start[i]) || s.dark[i]));
    if (lit.length >= 0.8 * POINTS) {
      if (s.since === undefined) {
        s.since = now;
        s.color = hex(lit[0]);
      }
    } else if (s.since !== undefined) {
      // Redevenu sombre : un éclair. Sinon (le bureau qui revient à la fermeture), noté à part.
      const after = colors.filter(dark).length >= 0.8 * POINTS ? 'puis sombre' : 'puis autre chose';
      fs.appendFileSync(out, `${clock(s.since)} ${s.name} clair ${now - s.since} ms (${s.color}), ${after}\n`);
      s.since = undefined;
    }
  }
  rounds++;
  if (now < end && !fs.existsSync(path.join(dir, 'fin-guet'))) return void setImmediate(tick);
  for (const s of screens) if (s.since !== undefined) fs.appendFileSync(out, `${clock(s.since)} ${s.name} clair ${now - s.since} ms (${s.color}), encore à la fin\n`);
  ReleaseDC(null, dc);
  console.log(`guet des écrans clairs : ${rounds} relevés en ${seconds} s au plus`);
};
tick();
