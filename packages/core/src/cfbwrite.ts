// Écriture d'un fichier composé OLE (format de VPReg.stg), pour reprendre dans une table ce que
// VPX avait enregistré pour elle dans une autre installation (vpreg.ts).
//
// Version 3 (secteurs de 512 octets), comme VPX en écrit. Les flux de moins de 4 096 octets vont
// dans le mini-flux (mini-secteurs de 64 octets), les autres dans des secteurs à eux. Les enfants
// d'un stockage forment un arbre rouge-noir valide, trié comme Windows le cherche (nom le plus court
// d'abord, puis en majuscules) : StgOpenStorage y retrouve un stockage par son nom
// (IStorage::OpenStorage). Au plus 109 secteurs de FAT (pas de DIFAT) : près de 7 Mo, bien plus
// qu'un VPReg.stg.

const SECTOR = 512;
const MINI_SECTOR = 64;
const MINI_CUTOFF = 4096;
const FREE = 0xffffffff;
const END = 0xfffffffe;
const FATSECT = 0xfffffffd;
const NOSTREAM = 0xffffffff;
const SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export interface CfbStream {
  name: string;
  data: Buffer;
}

export interface CfbStorage {
  name: string;
  storages?: CfbStorage[];
  streams?: CfbStream[];
}

interface Node {
  name: string;
  type: 1 | 2 | 5;
  children: Node[];
  data?: Buffer;
  left: number;
  right: number;
  child: number;
  color: 0 | 1;
  start: number;
  size: number;
}

/** Ordre des noms dans l'arbre d'un stockage : la longueur d'abord, puis les caractères en majuscules. */
export function compareCfbNames(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  const ua = a.toUpperCase();
  const ub = b.toUpperCase();
  for (let i = 0; i < ua.length; i++) {
    const d = ua.charCodeAt(i) - ub.charCodeAt(i);
    if (d) return d;
  }
  return 0;
}

/** Fichier composé qui contient ces stockages (et ces flux) sous sa racine. */
export function writeCompoundFile(root: { storages?: CfbStorage[]; streams?: CfbStream[] }): Buffer {
  const nodes: Node[] = [];
  const add = (name: string, type: Node['type'], data?: Buffer): Node => {
    if (type !== 5 && (!name || name.length > 31 || /[/\\:!]/.test(name))) throw new Error(`nom refusé dans un fichier composé : « ${name} »`); // i18n-ignore : erreur interne
    const node: Node = { name, type, children: [], data, left: NOSTREAM, right: NOSTREAM, child: NOSTREAM, color: 1, start: END, size: 0 };
    nodes.push(node);
    return node;
  };
  const fill = (parent: Node, storages: CfbStorage[] = [], streams: CfbStream[] = []) => {
    for (const s of storages) {
      const node = add(s.name, 1);
      parent.children.push(node);
      fill(node, s.storages, s.streams);
    }
    for (const s of streams) parent.children.push(add(s.name, 2, s.data));
  };
  const rootNode = add('Root Entry', 5);
  fill(rootNode, root.storages, root.streams);
  for (const node of nodes) {
    const names = new Set<string>();
    for (const c of node.children) {
      const key = c.name.toUpperCase();
      if (names.has(key)) throw new Error(`nom en double dans un fichier composé : « ${c.name} »`); // i18n-ignore : erreur interne
      names.add(key);
    }
    node.child = tree(node.children, nodes);
  }

  // Mini-flux et gros flux.
  const mini: Buffer[] = [];
  const miniFat: number[] = [];
  const big: { node: Node; sectors: number }[] = [];
  for (const node of nodes) {
    if (node.type !== 2) continue;
    const data = node.data!;
    node.size = data.length;
    if (!data.length) continue;
    if (data.length < MINI_CUTOFF) {
      const first = miniFat.length;
      const count = Math.ceil(data.length / MINI_SECTOR);
      for (let i = 0; i < count; i++) miniFat.push(i === count - 1 ? END : first + i + 1);
      mini.push(data, Buffer.alloc(count * MINI_SECTOR - data.length));
      node.start = first;
    } else big.push({ node, sectors: Math.ceil(data.length / SECTOR) });
  }
  const miniStream = Buffer.concat(mini);
  const dirSectors = Math.ceil((nodes.length * 128) / SECTOR);
  const miniFatSectors = Math.ceil((miniFat.length * 4) / SECTOR);
  const miniStreamSectors = Math.ceil(miniStream.length / SECTOR);
  const bigSectors = big.reduce((n, b) => n + b.sectors, 0);
  const others = dirSectors + miniFatSectors + miniStreamSectors + bigSectors;
  let fatSectors = 1;
  while (fatSectors * (SECTOR / 4) < others + fatSectors) fatSectors++;
  if (fatSectors > 109) throw new Error('fichier composé trop gros pour une FAT sans DIFAT'); // i18n-ignore : erreur interne

  // Secteurs : FAT, répertoire, mini-FAT, mini-flux, puis chaque gros flux.
  const fat = new Array<number>(fatSectors * (SECTOR / 4)).fill(FREE);
  let next = 0;
  const chain = (count: number): number => {
    if (!count) return END;
    const first = next;
    for (let i = 0; i < count; i++) fat[first + i] = i === count - 1 ? END : first + i + 1;
    next += count;
    return first;
  };
  for (let i = 0; i < fatSectors; i++) fat[next++] = FATSECT;
  const dirAt = chain(dirSectors);
  const miniFatAt = chain(miniFatSectors);
  const miniStreamAt = chain(miniStreamSectors);
  for (const b of big) b.node.start = chain(b.sectors);
  rootNode.start = miniStream.length ? miniStreamAt : END;
  rootNode.size = miniStream.length;

  const header = Buffer.alloc(SECTOR);
  SIGNATURE.copy(header, 0);
  header.writeUInt16LE(0x3e, 0x18);
  header.writeUInt16LE(3, 0x1a);
  header.writeUInt16LE(0xfffe, 0x1c);
  header.writeUInt16LE(9, 0x1e);
  header.writeUInt16LE(6, 0x20);
  header.writeUInt32LE(fatSectors, 0x2c);
  header.writeUInt32LE(dirAt, 0x30);
  header.writeUInt32LE(MINI_CUTOFF, 0x38);
  header.writeUInt32LE(miniFatSectors ? miniFatAt : END, 0x3c);
  header.writeUInt32LE(miniFatSectors, 0x40);
  header.writeUInt32LE(END, 0x44);
  for (let i = 0; i < 109; i++) header.writeUInt32LE(i < fatSectors ? i : FREE, 0x4c + i * 4);

  const fatBuf = Buffer.alloc(fatSectors * SECTOR);
  fat.forEach((v, i) => fatBuf.writeUInt32LE(v, i * 4));

  const dir = Buffer.alloc(dirSectors * SECTOR);
  nodes.forEach((n, i) => {
    const o = i * 128;
    dir.write(`${n.name}\0`, o, 'utf16le');
    dir.writeUInt16LE((n.name.length + 1) * 2, o + 0x40);
    dir[o + 0x42] = n.type;
    dir[o + 0x43] = n.color;
    dir.writeUInt32LE(n.left, o + 0x44);
    dir.writeUInt32LE(n.right, o + 0x48);
    dir.writeUInt32LE(n.child, o + 0x4c);
    dir.writeUInt32LE(n.start, o + 0x74);
    dir.writeUInt32LE(n.size, o + 0x78);
  });
  for (let i = nodes.length; i < dirSectors * (SECTOR / 128); i++) {
    for (const at of [0x44, 0x48, 0x4c]) dir.writeUInt32LE(NOSTREAM, i * 128 + at);
  }

  const miniFatBuf = Buffer.alloc(miniFatSectors * SECTOR, 0xff);
  miniFat.forEach((v, i) => miniFatBuf.writeUInt32LE(v, i * 4));
  const pad = (b: Buffer, sectors: number) => Buffer.concat([b, Buffer.alloc(sectors * SECTOR - b.length)]);
  return Buffer.concat([header, fatBuf, dir, miniFatBuf, pad(miniStream, miniStreamSectors), ...big.map((b) => pad(b.node.data!, b.sectors))]);
}

/**
 * Arbre rouge-noir des enfants d'un stockage : trié, chaque nœud au milieu de son intervalle.
 * Toutes les feuilles sont alors sur les deux derniers niveaux ; ceux du dernier niveau sont
 * rouges quand l'arbre n'est pas complet : même nombre de nœuds noirs sur chaque chemin, jamais
 * deux rouges de suite. Renvoie l'index de la racine (NOSTREAM sans enfant).
 */
function tree(children: Node[], nodes: Node[]): number {
  const sorted = [...children].sort((a, b) => compareCfbNames(a.name, b.name));
  const height = Math.floor(Math.log2(sorted.length + 1));
  const perfect = sorted.length + 1 === 2 ** height;
  const build = (lo: number, hi: number, depth: number): number => {
    if (lo > hi) return NOSTREAM;
    const mid = (lo + hi) >> 1;
    const node = sorted[mid]!;
    node.left = build(lo, mid - 1, depth + 1);
    node.right = build(mid + 1, hi, depth + 1);
    node.color = !perfect && depth > height ? 0 : 1;
    return nodes.indexOf(node);
  };
  return build(0, sorted.length - 1, 1);
}
