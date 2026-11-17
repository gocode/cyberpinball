// Sonde du PIN2DMD (pin2dmd-probe.ts) : CyberPinball.exe en mode Node (ELECTRON_RUN_AS_NODE), sans
// fenêtre, quelques dixièmes de seconde :
//   CyberPinball.exe <app>\dist\sonde-pin2dmd.js <VPX>\plugins\dmdutil\libusb64-1.0.dll
//
// Fait ce que fait DMDUtil au début d'une partie (libdmdutil 3485e2e, PIN2DMD.cpp, PIN2DMDInit), avec
// la même libusb que VPX : chercher 0314:E457, libusb_open, libusb_claim_interface. Puis relâche tout
// aussitôt. libdmdutil abandonne en silence quand l'une de ces étapes échoue ; la sonde rend l'étape et le
// code de libusb, que le cœur traduit en phrase (pin2dmdProbeProblem, dmd.ts).
//
// Un processus à part : un pilote USB qui se fige ne fige pas le front-end, et la libusb de VPX n'est
// jamais chargée dans Cyber Pinball. Écrit une ligne JSON sur la sortie standard, puis sort.

// Il n'y a pas de types pour koffi dans ce module regroupé : chargé à l'exécution (paquet externe).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const koffi = require('koffi') as typeof import('koffi');

const PIN2DMD_VID = 0x0314;
const PIN2DMD_PID = 0xe457;

type Stage = 'list' | 'open' | 'claim' | 'ok';

function done(stage: Stage, code: number): never {
  process.stdout.write(`${JSON.stringify({ stage, code })}\n`);
  process.exit(0);
}

const dll = process.argv[2];
if (!dll) throw new Error('Usage : CyberPinball.exe sonde-pin2dmd.js <libusb64-1.0.dll> (ELECTRON_RUN_AS_NODE=1)'); // i18n-ignore : usage

const lib = koffi.load(dll);
// Type nommé, repris par son nom dans la déclaration de libusb_get_device_descriptor.
koffi.struct('libusb_device_descriptor', {
  bLength: 'uint8_t',
  bDescriptorType: 'uint8_t',
  bcdUSB: 'uint16_t',
  bDeviceClass: 'uint8_t',
  bDeviceSubClass: 'uint8_t',
  bDeviceProtocol: 'uint8_t',
  bMaxPacketSize0: 'uint8_t',
  idVendor: 'uint16_t',
  idProduct: 'uint16_t',
  bcdDevice: 'uint16_t',
  iManufacturer: 'uint8_t',
  iProduct: 'uint8_t',
  iSerialNumber: 'uint8_t',
  bNumConfigurations: 'uint8_t',
});
const init = lib.func('int __stdcall libusb_init(_Out_ void **ctx)');
const exit = lib.func('void __stdcall libusb_exit(void *ctx)');
const getList = lib.func('intptr_t __stdcall libusb_get_device_list(void *ctx, _Out_ void **list)');
const freeList = lib.func('void __stdcall libusb_free_device_list(void *list, int unref)');
const getDescriptor = lib.func('int __stdcall libusb_get_device_descriptor(void *dev, _Out_ libusb_device_descriptor *desc)');
const open = lib.func('int __stdcall libusb_open(void *dev, _Out_ void **handle)');
const close = lib.func('void __stdcall libusb_close(void *handle)');
const claim = lib.func('int __stdcall libusb_claim_interface(void *handle, int iface)');
const release = lib.func('int __stdcall libusb_release_interface(void *handle, int iface)');

const ctxOut: unknown[] = [null];
const rc = init(ctxOut) as number;
if (rc < 0) done('list', rc);
const ctx = ctxOut[0];

const listOut: unknown[] = [null];
const count = Number(getList(ctx, listOut));
if (count < 0) {
  exit(ctx);
  done('list', count);
}
const list = listOut[0];
// koffi.decode, jamais koffi.view : view plante sous Electron (cage mémoire de V8).
const devices = count ? (koffi.decode(list, koffi.array('void *', count)) as unknown[]) : [];
let found: unknown;
for (const dev of devices) {
  const desc: Record<string, number> = {};
  if ((getDescriptor(dev, desc) as number) < 0) continue;
  if (desc.idVendor === PIN2DMD_VID && desc.idProduct === PIN2DMD_PID) {
    found = dev;
    break;
  }
}
if (!found) {
  freeList(list, 1);
  exit(ctx);
  done('list', 0);
}

const handleOut: unknown[] = [null];
const opened = open(found, handleOut) as number;
freeList(list, 1);
if (opened < 0) {
  exit(ctx);
  done('open', opened);
}
const handle = handleOut[0];
const claimed = claim(handle, 0) as number;
if (claimed < 0) {
  close(handle);
  exit(ctx);
  done('claim', claimed);
}
release(handle, 0);
close(handle);
exit(ctx);
done('ok', 0);
