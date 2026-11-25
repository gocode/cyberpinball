// Sonde du pilote NVIDIA pour les lunettes 3D Vision (nvidia-3dvision.ts) : CyberPinball.exe en mode Node
// (ELECTRON_RUN_AS_NODE), sans fenêtre, quelques dixièmes de seconde :
//   CyberPinball.exe <app>\dist\sonde-nvidia-3dvision.js read|enable|disable
//
// Par nvapi64.dll (livrée avec le pilote, dans System32), qui n'exporte que nvapi_QueryInterface
// (identifiants : nvapi_interface.h du SDK NVAPI R450, MIT) : NvAPI_Initialize, puis selon l'opération
// NvAPI_Stereo_Enable ou NvAPI_Stereo_Disable (la 3D stéréoscopique globale du pilote), puis la version
// du pilote et NvAPI_Stereo_IsEnabled, puis NvAPI_Unload.
//
// Un processus neuf à chaque fois : dans un même processus, NvAPI_Stereo_IsEnabled garde l'état lu au
// premier appel et ne voit pas ce qu'un autre programme (3D Fix Manager, le Panneau NVIDIA) change
// ensuite (essai sur la borne, 24/11/2026 : Cyber Pinball lisait « coupée » pendant qu'une sonde neuve
// lisait « activée »). Écrit une ligne JSON sur la sortie standard, puis sort.

// Il n'y a pas de types pour koffi dans ce module regroupé : chargé à l'exécution (paquet externe).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const koffi = require('koffi') as typeof import('koffi');

const NVAPI = {
  initialize: 0x0150e828,
  unload: 0xd22bdd7e,
  driverVersion: 0x2926aaad,
  stereoIsEnabled: 0x348ff8e1,
  stereoEnable: 0x239c4545,
  stereoDisable: 0x2ec50c2b,
} as const;
const NVAPI_OK = 0;

type Op = 'read' | 'enable' | 'disable';

function done(result: Record<string, unknown>): never {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

const op = process.argv[2] as Op;
if (!['read', 'enable', 'disable'].includes(op)) throw new Error('Usage : CyberPinball.exe sonde-nvidia-3dvision.js read|enable|disable (ELECTRON_RUN_AS_NODE=1)'); // i18n-ignore : usage

let query: (id: number) => unknown;
try {
  const lib = koffi.load('nvapi64.dll');
  query = lib.func('void *nvapi_QueryInterface(uint32_t id)') as (id: number) => unknown;
} catch {
  done({ nvapi: false }); // pas de pilote NVIDIA
}
const NoArgs = koffi.proto('int NvNoArgs()');
// Les tampons (Buffer) sont passés tels quels : branche du pilote (64 octets), stéréo activée (un octet).
const DriverVersion = koffi.proto('int NvDriverVersion(_Out_ uint32_t *version, uint8_t *branch)');
const StereoIsEnabled = koffi.proto('int NvStereoIsEnabled(uint8_t *enabled)');
const fn = (id: number) => query(id) || undefined;

const init = fn(NVAPI.initialize);
if (!init || koffi.call(init, NoArgs) !== NVAPI_OK) done({ nvapi: false });
const result: Record<string, unknown> = { nvapi: true };
if (op !== 'read') {
  const change = fn(op === 'enable' ? NVAPI.stereoEnable : NVAPI.stereoDisable);
  // Sans le pilote 3D (retiré après la 425.31, remis par 3D Fix Manager), la fonction manque ou échoue : son code est rendu.
  result.change = change ? (koffi.call(change, NoArgs) as number) : -3; // NVAPI_NO_IMPLEMENTATION
}
const version = fn(NVAPI.driverVersion);
if (version) {
  const out = [0];
  const branch = Buffer.alloc(64);
  if (koffi.call(version, DriverVersion, out, branch) === NVAPI_OK && out[0]) result.driver = out[0];
}
const enabled = fn(NVAPI.stereoIsEnabled);
if (enabled) {
  const out = Buffer.alloc(1);
  if (koffi.call(enabled, StereoIsEnabled, out) === NVAPI_OK) result.stereo = out[0] !== 0;
}
const unload = fn(NVAPI.unload);
if (unload) koffi.call(unload, NoArgs);
done(result);
