import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { joystickButton, joystickCode, joystickDeviceIds } from '../buttons';
import { resolveLocations } from '../locations';

// Lecture des joysticks par la bibliothèque SDL de VPX (packages/win-displays/src/joystick.ts),
// essayée avec des joysticks virtuels de SDL : sans matériel, par le même chemin qu'un Pinscape.
// Il faut un VPX installé (ou CYBERPINBALL_SDL) : sans lui, l'essai est sauté.

/** Bibliothèque SDL de VPX : CYBERPINBALL_SDL, sinon celle du VPX installé à la racine de Cyber Pinball. */
function sdlLibrary(): string | undefined {
  if (process.env.CYBERPINBALL_SDL) return process.env.CYBERPINBALL_SDL;
  const root = resolveLocations(process.env).root;
  if (!root) return undefined;
  const dir = path.join(root, 'emulators', 'vpx', 'current');
  return ['SDL364.dll', 'SDL3.dll'].map((name) => path.join(dir, name)).find((file) => fs.existsSync(file));
}

const dll = process.platform === 'win32' ? sdlLibrary() : undefined;

/** Ce que l'essai utilise du lecteur (JoystickReader de win-displays, que le cœur n'importe pas). */
interface Reader {
  version: string;
  devices(): { id: string; name: string; buttons: number }[];
  poll(): { device: string; button: number; down: boolean }[];
  attachVirtual(name: string, buttons: number): number;
  pressVirtual(sdlId: number, button: number, down: boolean): void;
  close(): void;
}

test('joysticks lus par le SDL de VPX : identifiants de VPX, appuis et relâchements', { skip: dll ? false : 'aucune bibliothèque SDL de VPX sur ce poste' }, () => {
  // Chargé à l'exécution : le cœur ne dépend pas de Windows.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { openJoysticks } = require(path.join(__dirname, '..', '..', '..', 'win-displays', 'dist', 'joystick.js')) as { openJoysticks(dll: string): Reader };
  const reader = openJoysticks(dll!);
  try {
    assert.match(reader.version, /^3\.\d+\.\d+$/);
    const before = reader.devices().length;
    // Deux joysticks identiques (deux Pinscape) : même GUID, rangs 1 et 2, comme dans VPX.
    const first = reader.attachVirtual('Essai Cyber Pinball', 32);
    const second = reader.attachVirtual('Essai Cyber Pinball', 32);
    const devices = reader.devices().slice(before);
    assert.equal(devices.length, 2);
    assert.match(devices[0]!.id, /^SDLJoy_[0-9a-f]{32}_1$/);
    const guid = devices[0]!.id.slice(7, 39);
    assert.deepEqual(devices.map((d) => d.id), joystickDeviceIds([guid, guid]));
    assert.equal(devices[1]!.buttons, 32);

    reader.poll();
    reader.pressVirtual(second, 5, true);
    const down = reader.poll();
    assert.deepEqual(down, [{ device: devices[1]!.id, button: 5, down: true }]);
    // Le code d'un appui est un bouton de la borne valable.
    assert.deepEqual(joystickButton(joystickCode(down[0]!.device, down[0]!.button)), { device: devices[1]!.id, button: 5 });
    // Tenu : rien de nouveau ; relâché : un seul événement.
    assert.deepEqual(reader.poll(), []);
    reader.pressVirtual(second, 5, false);
    reader.pressVirtual(first, 0, true);
    assert.deepEqual(reader.poll(), [
      { device: devices[0]!.id, button: 0, down: true },
      { device: devices[1]!.id, button: 5, down: false },
    ]);
  } finally {
    reader.close();
  }
});
