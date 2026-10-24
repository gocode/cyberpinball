// Site des mises à jour simulé pour docs\demo-mise-a-jour.ps1 : sert les fichiers d'un
// dossier comme le ferait GitHub (flux puis installeur) et note chaque requête.
//   node docs\demo-mise-a-jour-serveur.cjs <dossier> <port> <journal>
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const [dir, port, log] = process.argv.slice(2);
http
  .createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
    const file = path.join(dir, name);
    const ok = name && !name.includes('..') && fs.existsSync(file) && fs.statSync(file).isFile();
    fs.appendFileSync(log, `${new Date().toISOString()} ${req.method} /${name} ${ok ? 200 : 404}\n`);
    if (!ok) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-length': fs.statSync(file).size, 'content-type': name.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(Number(port), '127.0.0.1', () => fs.appendFileSync(log, `prêt sur ${port}\n`));
