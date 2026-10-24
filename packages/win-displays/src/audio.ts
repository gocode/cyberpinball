// Sorties audio actives, lues en lecture seule dans le registre MMDevices :
// HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\{guid}.
// Ce sont les mêmes propriétés que SDL (donc VPX) et Chromium lisent par WASAPI ;
// la disposition du registre n'est pas documentée, elle a été relevée sur le PC
// de développement (docs/recherche/audio.md). Rien n'est jamais modifié.

import {
  AUDIO_DEVICE_ACTIVE,
  AUDIO_PROPERTIES,
  audioFormatFromProperty,
  audioFriendlyName,
  guidFromProperty,
  type ObservedAudioOutput,
} from '@cyberpinball/core';
import { hklmSubkeys, hklmValue } from './registry';

const RENDER = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render';
/** Préfixe des identifiants de point de terminaison de rendu (IMMDevice::GetId). */
const RENDER_FLOW = '{0.0.0.00000000}';

/** Sorties audio actives (DeviceState = 1), dans l'ordre du registre. */
export function probeAudioOutputs(): ObservedAudioOutput[] {
  if (process.platform !== 'win32') throw new Error('La détection des sorties audio ne fonctionne que sous Windows pour le moment.');
  const outputs: (ObservedAudioOutput & { level: bigint })[] = [];
  for (const guid of hklmSubkeys(RENDER)) {
    const key = `${RENDER}\\${guid}`;
    if (hklmValue(key, 'DeviceState') !== AUDIO_DEVICE_ACTIVE) continue;
    const props = `${key}\\Properties`;
    const text = (name: string) => {
      const v = hklmValue(props, name);
      return typeof v === 'string' ? v : '';
    };
    const binary = (name: string) => {
      const v = hklmValue(props, name);
      return v instanceof Uint8Array ? v : undefined;
    };
    const deviceDesc = text(AUDIO_PROPERTIES.deviceDesc);
    const interfaceName = text(AUDIO_PROPERTIES.interfaceName);
    const formFactor = hklmValue(props, AUDIO_PROPERTIES.formFactor);
    const formatBytes = binary(AUDIO_PROPERTIES.deviceFormat);
    const format = formatBytes && audioFormatFromProperty(formatBytes);
    const containerBytes = binary(AUDIO_PROPERTIES.containerId);
    const containerId = containerBytes && guidFromProperty(containerBytes);
    const level = hklmValue(key, 'Level:0');
    outputs.push({
      endpointId: `${RENDER_FLOW}.${guid.toLowerCase()}`,
      friendlyName: audioFriendlyName(deviceDesc, interfaceName),
      deviceDesc,
      interfaceName,
      bus: text(AUDIO_PROPERTIES.bus),
      formFactor: typeof formFactor === 'number' ? formFactor : 0,
      channels: format?.channels ?? 0,
      channelMask: format?.channelMask ?? 0,
      ...(containerId && { containerId }),
      level: typeof level === 'bigint' ? level : 0n,
    });
  }
  return markDefault(outputs);
}

/**
 * Sortie par défaut (rôle Console) : Windows numérote chaque choix de sortie par
 * défaut dans « Level:0 » ; la sortie active au numéro le plus élevé est la
 * dernière choisie. Déduit du registre, non documenté : sans numéro, on ne dit rien.
 */
function markDefault(outputs: (ObservedAudioOutput & { level: bigint })[]): ObservedAudioOutput[] {
  const top = outputs.reduce((max, o) => (o.level > max ? o.level : max), 0n);
  return outputs.map(({ level, ...o }) => (top > 0n ? { ...o, isDefault: level === top } : o));
}

/** ContainerId du moniteur PnP d'un chemin de périphérique « \\?\DISPLAY#<modèle>#<instance>#{…} ». */
export function monitorContainerId(devicePath: string): string | undefined {
  const parts = devicePath.split('#');
  if (parts.length < 3) return undefined;
  const value = hklmValue(`SYSTEM\\CurrentControlSet\\Enum\\DISPLAY\\${parts[1]}\\${parts[2]}`, 'ContainerID');
  return typeof value === 'string' && value ? value.toUpperCase() : undefined;
}
