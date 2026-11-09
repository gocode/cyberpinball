// Runtime OpenXR actif : celui que charge VPX en VR. Le chargeur d'OpenXR le prend dans la variable
// d'environnement XR_RUNTIME_JSON, sinon dans le registre (HKLM\SOFTWARE\Khronos\OpenXR\1, valeur
// ActiveRuntime, que Meta Quest Link, SteamVR ou Virtual Desktop écrivent quand on les choisit comme
// runtime). Lecture seule.

import { hklmValue } from './registry';

/** Clé du chargeur d'OpenXR 1.x sous HKEY_LOCAL_MACHINE. */
const OPENXR_KEY = 'SOFTWARE\\Khronos\\OpenXR\\1';

/** Chemin du manifeste du runtime OpenXR actif ; undefined : aucun déclaré (ou registre illisible). */
export function openXrActiveRuntime(): string | undefined {
  const env = process.env.XR_RUNTIME_JSON?.trim();
  if (env) return env;
  try {
    const value = hklmValue(OPENXR_KEY, 'ActiveRuntime');
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}
