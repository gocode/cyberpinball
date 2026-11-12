// Écriture du décor de réalité virtuelle (decor.ts) en glTF 2.0 binaire (.glb) : un nœud et un
// maillage par pièce (positions, normales, uv, couleurs cuites en RGBA flottant, indices 32 bits),
// matières « unlit » (KHR_materials_unlit) avec leurs textures embarquées. Les réglages propres à
// Cyber Pinball sont dans `extras` de chaque matière : mélange (opaque, alpha, additif), tonalité,
// teinte de la table. Lu par le compagnon du casque (packages/casque-vr) et la couche OpenXR de VPX.

import type { Decor, DecorTexture } from './decor';

const FLOAT = 5126;
const UINT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

/** Type MIME d'une texture d'après son nom. */
export function textureMime(name: string): string {
  return name.toLowerCase().endsWith('.jpg') || name.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
}

/** Le décor en .glb ; `textures` : les octets de chaque texture utilisée (packages/casque-vr/decor/). */
export function writeGlb(decor: Decor, textures: ReadonlyMap<DecorTexture, Uint8Array>): Uint8Array {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];

  const push = (bytes: Uint8Array, target?: number): number => {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      byteLength += pad;
    }
    chunks.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    byteLength += bytes.byteLength;
    return bufferViews.length - 1;
  };
  const floats = (values: number[], type: 'VEC2' | 'VEC3' | 'VEC4', withBounds = false): number => {
    const data = new Float32Array(values);
    const view = push(new Uint8Array(data.buffer), ARRAY_BUFFER);
    const width = type === 'VEC2' ? 2 : type === 'VEC3' ? 3 : 4;
    const accessor: Record<string, unknown> = { bufferView: view, componentType: FLOAT, count: values.length / width, type };
    if (withBounds) {
      const min = Array<number>(width).fill(Infinity), max = Array<number>(width).fill(-Infinity);
      for (let i = 0; i < values.length; i++) {
        const k = i % width;
        min[k] = Math.min(min[k]!, data[i]!);
        max[k] = Math.max(max[k]!, data[i]!);
      }
      accessor.min = min;
      accessor.max = max;
    }
    accessors.push(accessor);
    return accessors.length - 1;
  };
  const indices = (values: number[]): number => {
    const view = push(new Uint8Array(new Uint32Array(values).buffer), ELEMENT_ARRAY_BUFFER);
    accessors.push({ bufferView: view, componentType: UINT, count: values.length, type: 'SCALAR' });
    return accessors.length - 1;
  };

  // Textures : une image par fichier utilisé.
  const images: Record<string, unknown>[] = [];
  const gltfTextures: Record<string, unknown>[] = [];
  const textureIndex = new Map<string, number>();
  const samplers = [
    { magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }, // bornée
    { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 33071 }, // répétée en u (ciel)
  ];
  const textureOf = (name: DecorTexture, repeat: boolean): number => {
    const key = `${name}|${repeat}`;
    if (textureIndex.has(key)) return textureIndex.get(key)!;
    const bytes = textures.get(name);
    if (!bytes) throw new Error(`texture du décor absente : ${name}`); // i18n-ignore : diagnostic du journal, jamais affiché
    let image = images.findIndex((i) => i.name === name);
    if (image < 0) {
      images.push({ name, mimeType: textureMime(name), bufferView: push(bytes) });
      image = images.length - 1;
    }
    gltfTextures.push({ source: image, sampler: repeat ? 1 : 0 });
    textureIndex.set(key, gltfTextures.length - 1);
    return gltfTextures.length - 1;
  };

  const materials = decor.materials.map((m) => ({
    name: m.name,
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, m.opacity],
      metallicFactor: 0,
      roughnessFactor: 1,
      ...(m.texture ? { baseColorTexture: { index: textureOf(m.texture, !!m.repeat) } } : {}),
    },
    alphaMode: m.blend === 'opaque' ? 'OPAQUE' : 'BLEND',
    doubleSided: true,
    extensions: { KHR_materials_unlit: {} },
    extras: { blend: m.blend, toneMapped: m.toneMapped, tinted: !!m.tinted },
  }));

  const meshes: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];
  for (const part of decor.parts) {
    const material = decor.materials[part.material]!;
    const attributes: Record<string, number> = {
      POSITION: floats(part.mesh.positions, 'VEC3', true),
      NORMAL: floats(part.mesh.normals, 'VEC3'),
      COLOR_0: floats(part.colors, 'VEC4'),
    };
    if (material.texture) attributes.TEXCOORD_0 = floats(part.mesh.uvs, 'VEC2');
    meshes.push({ name: part.name, primitives: [{ attributes, indices: indices(part.mesh.indices), material: part.material, mode: 4 }] });
    nodes.push({ name: part.name, mesh: meshes.length - 1 });
  }

  const json = {
    asset: { version: '2.0', generator: 'Cyber Pinball (packages/core/src/decor.ts)' },
    extensionsUsed: ['KHR_materials_unlit'],
    scene: 0,
    scenes: [{ name: 'decor', nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    ...(gltfTextures.length ? { textures: gltfTextures, images, samplers } : {}),
    accessors,
    bufferViews,
    buffers: [{ byteLength: 0 }],
  };
  const binPad = (4 - (byteLength % 4)) % 4;
  json.buffers[0]!.byteLength = byteLength + binPad;
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(jsonBytes.byteLength + jsonPad).fill(0x20);
    padded.set(jsonBytes);
    jsonBytes = padded;
  }
  const binLength = byteLength + binPad;
  const total = 12 + 8 + jsonBytes.byteLength + 8 + binLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // « glTF »
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true); // JSON
  out.set(jsonBytes, 20);
  let offset = 20 + jsonBytes.byteLength;
  view.setUint32(offset, binLength, true);
  view.setUint32(offset + 4, 0x004e4942, true); // BIN
  offset += 8;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Lecture des deux blocs d'un .glb (pour les tests et les outils) : JSON et données. */
export function readGlb(bytes: Uint8Array): { json: any; bin: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('pas un glb'); // i18n-ignore : diagnostic des outils, jamais affiché
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const binOffset = 20 + jsonLength;
  const binLength = view.getUint32(binOffset, true);
  return { json, bin: bytes.subarray(binOffset + 8, binOffset + 8 + binLength) };
}
