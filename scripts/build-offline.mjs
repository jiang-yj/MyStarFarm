import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const assets = (await readdir(new URL('../dist/assets/', import.meta.url))).map(name => `./assets/${name}`);
const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const hash = createHash('sha256').update(source + assets.join('|'));
for (const art of ['world.png', 'farm.png', 'ranch.png']) hash.update(await readFile(new URL(`../public/art/${art}`, import.meta.url)));
const revision = hash.digest('hex').slice(0, 12);
await writeFile(new URL('../dist/sw.js', import.meta.url), source.replace("'star-farm-shell-v1'", `'star-farm-shell-${revision}'`).replace("['./', './art/world.png', './favicon.svg', './manifest.webmanifest']", JSON.stringify(['./', './art/world.png', './art/farm.png', './art/ranch.png', './favicon.svg', './manifest.webmanifest', ...assets])));
console.log(`Offline shell: ${revision}, ${assets.length} bundled assets precached`);
