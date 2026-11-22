// Certificat de compilation : les entrées et les deux binaires doivent encore correspondre.
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as path from 'node:path';

/** Empreinte déterministe des fichiers, y compris les noms et les fichiers ajoutés ou retirés. */
export function filesFingerprint(files) {
  const hash = crypto.createHash('sha256');
  function visit(file, name) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`Lien inattendu dans les entrées de VPX : ${file}`);
    hash.update(JSON.stringify([name, stat.isDirectory() ? 'dir' : stat.size]));
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(file).sort()) visit(path.join(file, child), `${name}/${child}`);
    } else {
      const fd = fs.openSync(file, 'r');
      try {
        const buffer = Buffer.allocUnsafe(1024 * 1024);
        let count;
        while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, count));
      } finally {
        fs.closeSync(fd);
      }
    }
  }
  files.forEach((file, index) => visit(file, String(index)));
  return hash.digest('hex');
}

/** Un certificat absent, tronqué ou portant sur d'autres entrées ne permet aucune réutilisation. */
export function matchingBuild(certificate, inputs, outputs) {
  try {
    const saved = JSON.parse(fs.readFileSync(certificate, 'utf8'));
    return saved.inputs === inputs && saved.outputs === filesFingerprint(outputs)
      && outputs.every((file) => fs.statSync(file).size > 0);
  } catch {
    return false;
  }
}

/** Appelé seulement après une compilation réussie ; un certificat interrompu est sans effet. */
export function saveBuild(certificate, inputs, outputs, writeAtomic) {
  writeAtomic(certificate, JSON.stringify({ inputs, outputs: filesFingerprint(outputs) }));
}
