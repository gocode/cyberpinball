// npm run probe [-- --json] : affiche les écrans détectés et leur empreinte,
// les sorties audio actives et le nom que VPX attend pour chacune, puis les DMD
// réels reconnus à leur identifiant USB (lecture seule, aucun port ouvert).

import { audioScreen, channelsLabel, detectHardwareDmds, fingerprintOf, usbIdLabel, vpxDisplayId } from '@cyberpinball/core';
import { probeAudioOutputs, probeDisplays, probeUsbDevices } from './index';

const displays = probeDisplays();
const audio = probeAudioOutputs();
const usb = probeUsbDevices();
const dmd = detectHardwareDmds(usb);

// Facteurs de forme courants (EndpointFormFactor, mmdeviceapi.h).
const FORM_FACTORS: Record<number, string> = {
  1: 'haut-parleurs',
  2: 'ligne',
  3: 'casque',
  4: 'micro-casque',
  5: 'combiné',
  9: 'sortie numérique (HDMI, S/PDIF)',
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ displays, audio, usb, dmd }, null, 2));
} else {
  for (const d of displays) {
    const fp = fingerprintOf(d);
    const scale = d.scale === undefined ? '?' : `${Math.round(d.scale * 100)} %`;
    console.log(`${d.gdiName}${d.primary ? ' (principal)' : ''}`);
    console.log(`  nom          : ${d.friendlyName || '(vide)'}  description : ${d.monitorDescription ?? '(aucune)'}`);
    console.log(`  position     : ${d.bounds.x}, ${d.bounds.y}  taille ${d.bounds.width} × ${d.bounds.height}  rotation ${d.rotation}°  échelle ${scale}`);
    console.log(`  EDID         : ${d.edid ? `${d.edid.manufacturer} ${d.edid.monitorName ?? ''} série ${d.edid.serialText || d.edid.serialNumber} ${d.edid.widthCm}×${d.edid.heightCm} cm${d.edid.imageMm ? ` (image ${d.edid.imageMm.width}×${d.edid.imageMm.height} mm)` : ''}` : '(illisible)'}`);
    console.log(`  empreinte    : ${fp.key} (${fp.strength === 'strong' ? 'forte' : 'faible'})`);
    console.log(`  nom pour VPX : ${vpxDisplayId(d, 'name')} (10.8.1-5436) · ${vpxDisplayId(d)} (versions suivantes)`);
    console.log(`  conteneur    : ${d.containerId ?? '(inconnu)'}`);
    console.log('');
  }

  console.log(`Sorties audio actives (${audio.length})`);
  for (const o of audio) {
    const screen = audioScreen(o, displays);
    const mask = `0x${o.channelMask.toString(16).toUpperCase()}`;
    console.log(`  ${o.friendlyName}${o.isDefault ? ' (par défaut)' : ''}`);
    console.log(`    identifiant  : ${o.endpointId}`);
    console.log(`    bus          : ${o.bus || '?'}  forme : ${FORM_FACTORS[o.formFactor] ?? o.formFactor}  canaux : ${o.channels ? `${o.channels} (${channelsLabel(o.channels)}, masque ${mask})` : '(format illisible)'}`);
    console.log(`    conteneur    : ${o.containerId ?? '(inconnu)'}${screen ? ` : haut-parleur de l'écran ${screen.gdiName} (${screen.friendlyName || screen.monitorDescription})` : ''}`);
  }

  console.log('');
  console.log(`DMD réels (${dmd.length}) parmi ${usb.length} périphériques USB présents`);
  for (const d of dmd) {
    console.log(`  ${d.model}${d.generic ? ' (identifiant de convertisseur série courant : à confirmer)' : ''}`);
    console.log(`    USB          : ${d.usb}  ${d.device.name ?? ''}${d.device.port ? `  port ${d.device.port}` : ''}`);
    console.log(`    instance     : ${d.device.instanceId}`);
    console.log(`    pour VPX     : [Plugin.DMDUtil] Enable = 1, ${d.model} = 1`);
  }
  if (!dmd.length) console.log('  aucun : [Plugin.DMDUtil] ne sera pas touché.');
  if (process.argv.includes('--usb')) {
    for (const d of usb) console.log(`  ${usbIdLabel(d.vid, d.pid)}  ${d.name ?? '(sans nom)'}${d.port ? `  ${d.port}` : ''}  ${d.instanceId}`);
  } else console.log('  (npm run probe -- --usb liste tous les périphériques USB)');
}
