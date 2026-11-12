import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const assets = (await readdir(new URL('../dist/assets/', import.meta.url))).map(name => `./assets/${name}`);
const itemFiles = (await readdir(new URL('../public/art/items/', import.meta.url))).sort();
const itemAssets = itemFiles.map(name => `./art/items/${name}`);
const musicFiles = (await readdir(new URL('../public/audio/', import.meta.url))).sort();
const musicAssets = musicFiles.map(name => `./audio/${name}`);
const iconAssets = ['./favicon-strawberry.png', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
// revision 必须覆盖所有可能影响离线体验的产物：
// 源码模板、bundle 列表、静态图片/音频、dist/index.html（含 <title> 等）、
// 以及 GitHub Pages 用的 404.html fallback。
const distIndex = await readFile(new URL('../dist/index.html', import.meta.url));
const hash = createHash('sha256').update(source + '|' + assets.join('|') + '|' + distIndex);
for (const art of ['world.png', 'farm.png', 'ranch.png']) hash.update(await readFile(new URL(`../public/art/${art}`, import.meta.url)));
for (const name of itemFiles) hash.update(await readFile(new URL(`../public/art/items/${name}`, import.meta.url)));
for (const name of musicFiles) hash.update(await readFile(new URL(`../public/audio/${name}`, import.meta.url)));
for (const path of [...iconAssets, './favicon.svg', './manifest.webmanifest']) hash.update(await readFile(new URL('../public/' + path.slice(2), import.meta.url)));
// 404.html 是 CI workflow 加的 fallback，如果它存在也一起 hash 进去。
try { hash.update(await readFile(new URL('../dist/404.html', import.meta.url))); } catch {}
const revision = hash.digest('hex').slice(0, 12);
await writeFile(new URL('../dist/sw.js', import.meta.url), source.replace("'star-farm-shell-v1'", `'star-farm-shell-${revision}'`).replace("['./', './art/world.png', './favicon.svg', './manifest.webmanifest']", JSON.stringify(['./', './art/world.png', './art/farm.png', './art/ranch.png', './favicon.svg', './manifest.webmanifest', ...assets, ...itemAssets, ...musicAssets, ...iconAssets])));
console.log(`Offline shell: ${revision}, ${assets.length} bundled assets precached`);
