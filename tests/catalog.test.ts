import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as g from '../src/game/engine';
import type { CropId, FishType, AnimalType } from '../src/game/types';
import { validateSave } from '../src/game/validation';
import { icon } from '../src/ui/icons';
import { shopItems, appView, modalView, type ViewState } from '../src/ui/views';
const book = JSON.parse(readFileSync(new URL('../src/data/workbook-items.json', import.meta.url), 'utf8'));
const assets: Record<string, string> = JSON.parse(readFileSync(new URL('../src/data/item-assets.json', import.meta.url), 'utf8'));
const NOW = 1793865600000;
const farm = () => { const s = g.createSave('图标验收农场', NOW, '2026-11-05', 'catalog-test'); s.player.gold = 100000; return s; };
test('all workbook categories are represented, and every original image is copied byte for byte', () => {
  assert.equal(book.crops.length, 45); assert.equal(book.fish.length, 16); assert.equal(book.animals.length, 7);
  assert.equal(Object.keys(g.catalog.crops).length, 45); assert.equal(Object.keys(g.catalog.animals).length, 7);
  const originals = [book.sprout, ...book.crops.flatMap((c: any) => [c.item, c.mature]), ...book.fish.map((f: any) => f.image), ...book.animals.flatMap((a: any) => [a.image, a.product.image])];
  for (const source of originals) {
    const path = new URL(`../public${source.path}`, import.meta.url); assert.ok(existsSync(path), source.cell);
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), source.sha256, source.cell);
  }
});
test('crop product, mature and shared planted-stage icons match their exact source cells', () => {
  const sprouts = new Set<string>();
  for (const crop of Object.values(g.catalog.crops)) {
    const source = book.crops.find((c: any) => c.row === crop.sourceRow);
    assert.equal(crop.name, source.name); assert.equal(assets[crop.seedIcon], source.item.path); assert.equal(assets[crop.icon], source.item.path);
    assert.equal(assets[crop.matureIcon], source.mature.path); assert.equal(assets[crop.sproutIcon], book.sprout.path);
    sprouts.add(crop.sproutIcon);
    assert.match(icon(crop.seedIcon), /^<img /); assert.match(icon(crop.matureIcon), /^<img /);
  }
  assert.equal(sprouts.size, 1);
});
test('all 45 crops support purchase or medal exchange, planting, harvest and persistence', () => {
  for (const id of Object.keys(g.catalog.crops) as CropId[]) {
    const s = farm(); const crop = g.catalog.crops[id];
    if (crop.price > 0) assert.equal(g.buy(s, crop.seed, 1, NOW).ok, true, id);
    else { s.player.medals = 8; assert.equal(g.exchange(s, crop.seed).ok, true, id); }
    assert.equal(g.plant(s, 10, id, NOW).ok, true, id); assert.equal(g.harvest(s, 10, NOW + crop.duration).ok, true, id);
    assert.equal(g.amount(s, id), 1, id); assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))), s);
  }
  assert.equal(shopItems('seeds').length, 44);
});
test('all seven animals can be purchased, fed and produce their configured product', () => {
  const s = farm();
  for (const id of Object.keys(g.catalog.animals) as AnimalType[]) {
    const animal = g.catalog.animals[id]; assert.equal(g.buy(s, id, 1, NOW).ok, true);
    const instance = s.ranch.animals.at(-1)!; assert.equal(g.feedAnimal(s, instance.id, NOW).ok, true);
    assert.equal(g.collectAnimals(s, NOW + animal.duration, instance.id).ok, true);
    assert.ok(g.amount(s, animal.product) >= 1); assert.equal(g.itemCategory(animal.product), '养殖');
  }
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))), s); assert.equal(shopItems('animals').length, 7);
});
test('all sixteen workbook fish can be stocked, fed, netted and saved', () => {
  const s = farm(); s.pond.capacity = 30;
  for (const id of Object.keys(g.catalog.fish) as FishType[]) {
    assert.equal(g.buy(s, id + 'Fry', 1, NOW).ok, true, id); assert.equal(g.stockFish(s, id).ok, true, id);
  }
  assert.equal(g.feedFish(s, NOW).ok, true); assert.equal(g.netFish(s, NOW + 14400000).ok, true);
  for (const id of Object.keys(g.catalog.fish)) { assert.ok(g.amount(s, id) >= 1, id); assert.equal(g.itemCategory(id), '鱼类'); }
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))), s); assert.equal(shopItems('fish').length, 16);
});
test('inventory validation accepts every new item without rejecting a full expanded backpack', () => {
  const s = farm(); s.inventory = Object.fromEntries(Object.keys(g.catalog.items).map(id => [id, 1]));
  assert.equal(Object.keys(s.inventory).length, 130); assert.doesNotThrow(() => validateSave(s));
});
test('field renderer uses D-column mature graphics and the D2 shared planted graphic', () => {
  const s = farm(); s.farm.tiles[0] = { state: 'planted', crop: 'coffee', readyAt: NOW, watered: true };
  s.farm.tiles[1] = { state: 'planted', crop: 'tomato', readyAt: NOW + 10000, watered: false };
  const v: ViewState = { save:s,scene:'farm',modal:null,questTab:'active',selectedSeed:null,tile:0,animal:1,bagFilter:'全部',item:null,shopCategory:'seeds',shopMode:'buy',buyId:'coffeeSeed',qty:1,report:null,fishSuccess:0,fishMisses:0,deleteId:null,saves:[s],now:NOW,saving:false,notice:'',saveError:'' };
  const field = appView(v).split('class="field"')[1].split('class="scene-caption"')[0];
  assert.ok(field.includes(assets[g.catalog.crops.coffee.matureIcon])); assert.ok(field.includes(book.sprout.path));
  assert.equal(g.itemInfo('coffeeSeed')!.icon, g.catalog.crops.coffee.seedIcon); assert.equal(g.itemInfo('coffee')!.icon, g.catalog.crops.coffee.icon);
});
test('new fish are reachable in the weighted fishing pool', () => {
  const total = g.catalog.fishingPool.reduce((n, fish) => n + fish.weight, 0); let cursor = 0;
  for (const entry of g.catalog.fishingPool) {
    const s = farm(); const roll = (cursor + entry.weight / 2) / total; assert.equal(g.fishingReward(s, NOW, roll).ok, true); assert.equal(g.amount(s, entry.id), 1, entry.id); cursor += entry.weight;
  }
});

test('retired fish are discarded without blocking save validation', () => {
  const s = farm();
  const legacy = JSON.parse(JSON.stringify(s));
  legacy.pond.fishes[0].type = 'carp';
  legacy.inventory.carpFry = 2; legacy.inventory['koi:gold'] = 1;
  legacy.offline.carp = 3;
  const clean = validateSave(legacy);
  assert.equal(clean.pond.fishes.length, 0);
  assert.equal(clean.inventory.carpFry, undefined);
  assert.equal(clean.inventory['koi:gold'], undefined);
  assert.equal(clean.offline.carp, undefined);
  assert.equal(legacy.pond.fishes[0].type, 'carp');
  assert.equal(clean.player.gold, s.player.gold);
});

test('every town quest references an available item and the town renders all templates', () => {
  const s = farm();
  for (const template of g.catalog.quests) {
    assert.ok(g.itemInfo(template.item), template.id);
    s.quests = [{ id: 'town-render', template: template.id, acceptedAt: null, expiresAt: null }];
    const v: ViewState = { save:s,scene:'town',modal:null,questTab:'active',selectedSeed:null,tile:0,animal:1,bagFilter:'全部',item:null,shopCategory:'seeds',shopMode:'buy',buyId:'coffeeSeed',qty:1,report:null,fishSuccess:0,fishMisses:0,deleteId:null,saves:[s],now:NOW,saving:false,notice:'',saveError:'' };
    assert.ok(appView(v).includes(g.itemInfo(template.item)!.name), template.id);
  }
});

test('scene actions stay in a dock outside the scrolling content in the requested order', () => {
  const s = farm();
  const expected = {
    farm: ['商店', '浇水', '收获', '背包'],
    ranch: ['商店', '喂食', '抚摸', '收获', '背包'],
    pond: ['商店', '喂食', '放苗', '收获', '背包'],
    town: ['背包交付', '奖章兑换']
  } as const;
  for (const scene of Object.keys(expected) as (keyof typeof expected)[]) {
    const v: ViewState = { save:s,scene,modal:null,questTab:'active',selectedSeed:null,tile:0,animal:1,bagFilter:'全部',item:null,shopCategory:'seeds',shopMode:'buy',buyId:'coffeeSeed',qty:1,report:null,fishSuccess:0,fishMisses:0,deleteId:null,saves:[s],now:NOW,saving:false,notice:'',saveError:'' };
    const html = appView(v);
    const dockStart = html.indexOf('<footer class="game-dock scene-dock');
    const dock = html.slice(dockStart, html.indexOf('</footer>', dockStart));
    assert.ok(html.slice(0, dockStart).endsWith('</div>'), scene);
    assert.deepEqual([...dock.matchAll(/<span>([^<]+)<\/span>/g)].map(m => m[1]), [...expected[scene]]);
    const scrollContent = html.slice(html.indexOf('id="scene-content"'), dockStart);
    assert.ok(!scrollContent.includes('class="action-row"'), scene);
  }
});

test('animal products use the exact workbook names and images', () => {
  for (const [index, animal] of Object.values(g.catalog.animals).entries()) {
    const source = book.animals[index].product;
    const item = g.itemInfo(animal.product)!;
    assert.equal(item.name, source.name);
    assert.equal(assets[item.icon], source.image.path);
    assert.match(icon(item.icon), /^<img /);
  }
});

test('seed tray and stocking list show only owned supplies and guide empty inventories to shops', () => {
  const s = farm(); s.inventory = {};
  const v: ViewState = { save:s,scene:'farm',modal:null,questTab:'active',selectedSeed:null,tile:0,animal:1,bagFilter:'全部',item:null,shopCategory:'seeds',shopMode:'buy',buyId:'coffeeSeed',qty:1,report:null,fishSuccess:0,fishMisses:0,deleteId:null,saves:[s],now:NOW,saving:false,notice:'',saveError:'' };
  let html = appView(v);
  assert.ok(html.includes('种子篮空了')); assert.ok(!html.includes('class="seed-card'));
  s.inventory.coffeeSeed = 2; s.inventory.riceSeed = 0;
  html = appView(v);
  assert.equal((html.match(/class="seed-card/g) || []).length, 1);
  assert.ok(html.includes('选择咖啡豆种子，库存2')); assert.ok(!html.includes('种子篮空了'));
  v.modal = 'stock';
  html = modalView(v);
  assert.ok(html.includes('还没有鱼苗')); assert.ok(!html.includes('data-action="stock-fish"'));
  s.inventory.commonCarpFry = 1; s.inventory.herringFry = 0;
  html = modalView(v);
  assert.equal((html.match(/data-action="stock-fish"/g) || []).length, 1);
  assert.ok(html.includes('data-value="commonCarp"')); assert.ok(!html.includes('还没有鱼苗'));
  assert.ok(g.stockFish(s, 'commonCarp').ok);
  assert.ok(modalView(v).includes('还没有鱼苗'));
});
