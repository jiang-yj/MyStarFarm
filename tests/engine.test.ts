import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/game/engine';
import { validateSave } from '../src/game/validation';
import { SaveRepository } from '../src/platform/saves';
import type { StorageAdapter } from '../src/game/types';
const NOW = 1793865600000;
const farm = () => g.createSave('测试农场', NOW, '2026-11-05', 'test-farm');
class MemoryStorage implements StorageAdapter {
  data = new Map<string, string>(); read(k: string) { return this.data.get(k) ?? null; }
  write(k: string, v: string) { this.data.set(k, v); } remove(k: string) { this.data.delete(k); }
}
test('initial save has a fixed 6x5 field and is importable', () => {
  const s = farm(); assert.equal(s.farm.tiles.length, 30); assert.equal(s.player.gold, 1280); assert.equal(s.quests.length, 3); assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))), s);
});
test('plant → one water halves remaining time → harvest only once → sell', () => {
  const s = farm(); const i = 10; const originalSeeds = g.amount(s, 'carrotSeed');
  assert.equal(g.plant(s, i, 'carrot', NOW).ok, true); assert.equal(g.amount(s, 'carrotSeed'), originalSeeds - 1);
  assert.equal(g.harvest(s, i, NOW + 1000).ok, false);
  assert.equal(g.water(s, i, NOW + 120000).ok, true); assert.equal(s.farm.tiles[i].readyAt, NOW + 360000);
  assert.equal(g.water(s, i, NOW + 120000).ok, false);
  assert.equal(g.harvest(s, i, NOW + 360000).ok, true); assert.equal(g.amount(s, 'carrot'), 1);
  assert.equal(g.harvest(s, i, NOW + 360000).ok, false); const gold = s.player.gold;
  assert.equal(g.sell(s, 'carrot', 1).ok, true); assert.equal(s.player.gold, gold + 38); assert.equal(g.sell(s, 'carrot', 1).ok, false);
});
test('locked one-click harvest does not mutate crops; skill unlocks it', () => {
  const s = farm(); const before = structuredClone(s.farm);
  assert.equal(g.harvest(s, 'all', NOW).ok, false); assert.deepEqual(s.farm, before);
  s.player.skills.harvest = 45; assert.equal(g.harvest(s, 'all', NOW).ok, true); assert.equal(g.amount(s, 'carrot'), 3);
});
test('upgraded tool scope and watering mastery affect gameplay', () => {
  const s = farm(); s.player.skills.till = 15; assert.equal(g.till(s, 0).ok, true); assert.equal(s.farm.tiles.filter(t => t.state === 'tilled').length, 6);
  s.player.skills.water = 45; s.player.tools.push('watering'); g.plant(s, 10, 'carrot', NOW); assert.equal(s.farm.tiles[10].readyAt, NOW + 486000);
});
test('animal feed, pet cooldown, quality and one output per feed', () => {
  const s = farm(); assert.equal(g.collectAnimals(s, NOW).ok, true); assert.equal(g.amount(s, 'egg'), 1);
  assert.equal(g.collectAnimals(s, NOW).ok, false); assert.equal(g.feedAnimal(s, 1, NOW).ok, true);
  assert.equal(g.feedAnimal(s, 1, NOW).ok, false); assert.equal(g.amount(s, 'hay'), 23);
  assert.equal(g.petAnimal(s, 1, NOW).ok, true); assert.equal(g.petAnimal(s, 1, NOW + 1).ok, false);
  s.ranch.animals[0].affection = 7; assert.equal(g.collectAnimals(s, NOW + 3600000).ok, true); assert.equal(s.inventory['egg:gold'], 1);
});
test('fish must be stocked and fed, respect capacity, and net once', () => {
  const s = farm(); assert.equal(g.stockFish(s, 'commonCarp').ok, false);
  assert.equal(g.buy(s, 'commonCarpFry', 2, NOW).ok, true); assert.equal(g.stockFish(s, 'commonCarp').ok, true);
  assert.equal(g.feedFish(s, NOW).ok, true); assert.equal(g.amount(s, 'hay'), 22);
  assert.equal(g.netFish(s, NOW).ok, false); assert.equal(g.netFish(s, NOW + 14400000).ok, true); assert.equal(g.amount(s, 'commonCarp'), 2);
  assert.equal(g.netFish(s, NOW + 14400000).ok, false); assert.equal(s.pond.fishes.length, 0);
});
test('quest accept/fulfil grants rewards once and consumes quality stacks', () => {
  const s = farm(); s.quests = [{ id: 'q', template: 'egg', acceptedAt: null, expiresAt: null }];
  assert.equal(g.questAction(s, 'q', NOW).ok, true); assert.equal(g.questAction(s, 'q', NOW).ok, false);
  s.inventory.egg = 2; s.inventory['egg:silver'] = 1; const gold = s.player.gold;
  assert.equal(g.questAction(s, 'q', NOW).ok, true); assert.equal(g.amount(s, 'egg'), 0); assert.equal(s.player.medals, 4); assert.equal(s.player.gold, gold + 180);
  assert.equal(g.questAction(s, 'q', NOW).ok, false);
});
test('real daily quests fill up to three, do not reroll on refresh, silently expire', () => {
  const s = farm(); const quests = structuredClone(s.quests); g.refreshQuests(s, NOW + 1, '2026-11-05'); assert.deepEqual(s.quests, quests);
  s.quests[0].acceptedAt = NOW; s.quests[0].expiresAt = NOW + 1; g.refreshQuests(s, NOW + 2, '2026-11-05'); assert.equal(s.quests.length, 2);
  const gold = s.player.gold; g.refreshQuests(s, NOW + 86400000, '2026-11-06'); assert.equal(s.quests.length, 3); assert.equal(s.player.gold, gold);
  assert.equal(g.validateQuest([], s), false);
});
test('exchange requires medals, tools are nonrepeatable, ordinary coins untouched', () => {
  const s = farm(); assert.equal(g.exchange(s, 'sickle').ok, false); s.player.medals = 60; const gold = s.player.gold;
  assert.equal(g.exchange(s, 'sickle').ok, true); assert.equal(s.player.medals, 30); assert.equal(s.player.gold, gold); assert.equal(g.canHarvestAll(s), true);
  assert.equal(g.exchange(s, 'sickle').ok, false); assert.equal(s.player.medals, 30);
});
test('offline calculation is pure, capped and claim is idempotent', () => {
  const s = farm(); g.feedFish(s, NOW); g.plant(s, 10, 'ancient', NOW); const before = structuredClone(s);
  const { save, report } = g.calculateOfflineRewards(s, NOW + 36000000);
  assert.deepEqual(s, before); assert.equal(report.credited, 14400000); assert.equal(report.capped, true); assert.equal(save.offline.carrot, 6); assert.equal(save.offline.commonCarp, 1);
  assert.equal(g.claimOffline(save).ok, true); assert.equal(g.claimOffline(save).ok, false);
  const again = g.calculateOfflineRewards(save, NOW + 36000000); assert.equal(Object.keys(again.save.offline).length, 0);
});
test('offline cap shifts unfinished deadlines instead of immediately completing them', () => {
  const s = farm(); s.farm.tiles[10] = { state: 'planted', crop: 'ancient', readyAt: NOW + 18000000, watered: false };
  const { save } = g.calculateOfflineRewards(s, NOW + 36000000);
  assert.equal(save.farm.tiles[10].readyAt, NOW + 39600000); assert.equal(save.farm.tiles[10].state, 'planted');
});
test('backward device clock preserves remaining growth instead of generating rewards', () => {
  const s = farm(); const original = s.farm.tiles[13].readyAt!; const { save, report } = g.calculateOfflineRewards(s, NOW - 3600000);
  assert.equal(report.clockBack, true); assert.equal(Object.keys(report.items).length, 0); assert.equal(save.farm.tiles[13].readyAt! - (NOW - 3600000), original - NOW);
  assert.doesNotThrow(() => validateSave(save));
});
test('fishing reward enforces cooldown and one grant per completed attempt', () => {
  const s = farm(); assert.equal(g.fishingReward(s, NOW, 0.1).ok, true); assert.equal(g.amount(s, 'herring'), 1);
  assert.equal(g.fishingReward(s, NOW + 1, 0.3).ok, false); assert.equal(g.fishingReward(s, NOW + 60000, 0.3).ok, true); assert.equal(g.amount(s, 'sunfish'), 1);
});
test('negative quantities, unavailable currency and capacity cannot bypass purchases', () => {
  const s = farm(); const gold = s.player.gold;
  assert.equal(g.buy(s, 'carrotSeed', -1, NOW).ok, false); assert.equal(g.buy(s, 'carrotSeed', 1.5, NOW).ok, false); assert.equal(s.player.gold, gold);
  assert.equal(g.buy(s, 'chicken', 8, NOW).ok, false); s.player.gold = 0; assert.equal(g.upgradePond(s).ok, false); assert.equal(s.pond.capacity, 10);
});
test('save repository round-trip, independent farms and concurrent writer rejection', () => {
  const storage = new MemoryStorage(); const a = new SaveRepository(storage); const b = new SaveRepository(storage); const s = farm();
  a.save(s); assert.deepEqual(a.load(s.id), s); const second = farm(); second.id = 'other'; a.save(second);
  assert.equal(a.list().length, 2); const bCopy = b.load(s.id); const aCopy = a.load(s.id); aCopy.player.gold += 1; a.save(aCopy); assert.throws(() => b.save(bCopy), /另一标签页/);
  assert.equal(a.load('other').player.gold, 1280);
});
test('malformed imports rejected without modifying current database', () => {
  for (const mutate of [
    (s: any) => { s.player.gold = -1; }, (s: any) => { s.farm.tiles = []; },
    (s: any) => { s.inventory = { secret: 5 }; }, (s: any) => { s.player.tools = ['admin']; },
    (s: any) => { s.ranch.animals[0].type = 'dragon'; }, (s: any) => { s.pond.capacity = 999; },
    (s: any) => { s.quests[0].expiresAt = null; s.quests[0].acceptedAt = NOW; }, (s: any) => { s.version = 99; }
  ]) { const s = farm(); mutate(s); assert.throws(() => validateSave(s)); }
});
test('corrupt database is never replaced and remains available as raw backup', () => {
  const storage = new MemoryStorage(); const repo = new SaveRepository(storage);
  for (const raw of ['null', '{broken', '{"version":1,"saves":[null]}']) {
    storage.write('star-farm:v1', raw); assert.throws(() => repo.list()); assert.throws(() => repo.save(farm())); assert.equal(repo.rawBackup(), raw);
  }
});
test('prototype-like and unknown inventory keys are not valid imported items', () => {
  for (const key of ['toString', 'constructor', '__proto__:gold', 'carrot:platinum']) {
    const s = farm(); s.inventory = { [key]: 1 }; assert.throws(() => validateSave(s));
  }
});
test('completed quest is archived once with completion time and actual rewards', () => {
  const s = farm(); s.quests = [{ id: 'archive-egg', template: 'egg', acceptedAt: null, expiresAt: null }];
  g.questAction(s, 'archive-egg', NOW); s.inventory.egg = 3;
  assert.equal(g.questAction(s, 'archive-egg', NOW + 1000).ok, true);
  assert.deepEqual(s.completedQuests, [{ id: 'archive-egg', template: 'egg', acceptedAt: NOW, completedAt: NOW + 1000, gold: 180, medals: 4, exp: 25 }]);
  assert.equal(g.questAction(s, 'archive-egg', NOW + 2000).ok, false); assert.equal(s.completedQuests.length, 1);
  g.refreshQuests(s, NOW + 86400000, '2026-11-06');
  assert.equal(s.completedQuests.length, 1);
  const repo = new SaveRepository(new MemoryStorage()); repo.save(s);
  assert.deepEqual(repo.load(s.id).completedQuests, s.completedQuests);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))).completedQuests, s.completedQuests);
});
test('old version-1 saves migrate without losing progress or requiring a new farm', () => {
  const old = JSON.parse(JSON.stringify(farm())); delete old.completedQuests;
  const migrated = validateSave(old); assert.deepEqual(migrated.completedQuests, []); assert.equal(migrated.player.gold, old.player.gold);
  const storage = new MemoryStorage(); storage.write('star-farm:v1', JSON.stringify({ version: 1, active: old.id, saves: [{ data: old, revision: 1 }] }));
  const repo = new SaveRepository(storage); assert.deepEqual(repo.load(old.id).completedQuests, []);
  assert.equal(JSON.parse(repo.rawBackup()).saves[0].data.completedQuests, undefined);
});
test('expired and unaccepted quests are never archived as completed', () => {
  const s = farm(); s.quests = [{ id: 'expired', template: 'egg', acceptedAt: NOW - 2000, expiresAt: NOW - 1 }, { id: 'board', template: 'carrot', acceptedAt: null, expiresAt: null }];
  s.inventory.egg = 3; assert.equal(g.questAction(s, 'expired', NOW).ok, false);
  g.refreshQuests(s, NOW, '2026-11-05'); assert.deepEqual(s.completedQuests, []); assert.equal(s.quests.length, 1);
});
test('invalid completed records and duplicate reward records are rejected on import', () => {
  const s = farm(); s.completedQuests = [{ id: 'completed', template: 'egg', acceptedAt: NOW, completedAt: NOW + 1, gold: 180, medals: 4, exp: 25 }];
  assert.doesNotThrow(() => validateSave(s));
  const backwards = structuredClone(s); backwards.completedQuests[0].completedAt = NOW - 1; assert.throws(() => validateSave(backwards));
  const duplicate = structuredClone(s); duplicate.completedQuests.push(duplicate.completedQuests[0]); assert.throws(() => validateSave(duplicate));
});
test('quest panel separates accepted quests from board offers and completed history', async () => {
  const { appView } = await import('../src/ui/views');
  const s = farm(); s.quests = [
    { id: 'accepted', template: 'carrot', acceptedAt: NOW, expiresAt: NOW + 86400000 },
    { id: 'unaccepted', template: 'corn', acceptedAt: null, expiresAt: null }
  ];
  s.completedQuests = [{ id: 'done', template: 'egg', acceptedAt: NOW - 2000, completedAt: NOW - 1000, gold: 180, medals: 4, exp: 25 }];
  const state: import('../src/ui/views').ViewState = { save: s, scene: 'map', modal: 'quests', questTab: 'active', selectedSeed: null, tile: 10, animal: 1, bagFilter: '全部', item: null, shopCategory: 'seeds', shopMode: 'buy', buyId: 'carrotSeed', qty: 1, report: null, fishSuccess: 0, fishMisses: 0, deleteId: null, saves: [s], now: NOW, saving: false, notice: '', saveError: '' };
  const active = appView(state).split('<div class="modal-body">')[1];
  assert.match(active, /新鲜的收获/); assert.doesNotMatch(active, /金黄的午餐|早餐准备/);
  const completed = appView({ ...state, questTab: 'completed' }).split('<div class="modal-body">')[1];
  assert.match(completed, /早餐准备/); assert.match(completed, /完成于/); assert.doesNotMatch(completed, /新鲜的收获|金黄的午餐/);
});
test('legacy 300 plots migrate losslessly, preserving crop timers and overflow', () => {
  const legacy = JSON.parse(JSON.stringify(farm()));
  const planted = { state: 'planted', crop: 'carrot', readyAt: NOW + 600000, watered: false };
  legacy.farm = { tiles: Array.from({ length: 300 }, (_, i) => i < 42 ? { ...planted, readyAt: NOW + 600000 + i } : { state: 'tilled' }) };
  const migrated = validateSave(legacy);
  assert.equal(migrated.farm.tiles.length, 30); assert.equal(migrated.farm.pendingCrops.length, 12);
  assert.equal(migrated.player.gold, legacy.player.gold); assert.deepEqual(migrated.inventory, legacy.inventory);
  assert.deepEqual([...migrated.farm.tiles, ...migrated.farm.pendingCrops].map(t => t.readyAt), legacy.farm.tiles.slice(0, 42).map((t: any) => t.readyAt));
  assert.deepEqual(validateSave(migrated), migrated);
  assert.equal(g.collectMigratedCrops(migrated, NOW).ok, false);
  assert.equal(g.collectMigratedCrops(migrated, NOW + 601000).ok, true); assert.equal(g.amount(migrated, 'carrot'), 12);
  assert.equal(g.collectMigratedCrops(migrated, NOW + 601000).ok, false);
});
test('migrated overflow follows offline cap and is awarded only once', () => {
  const s = farm(); s.farm.pendingCrops = [{ state: 'planted', crop: 'corn', readyAt: NOW + 7200000, watered: true }];
  const computed = g.calculateOfflineRewards(s, NOW + 14400000);
  assert.equal(computed.save.farm.pendingCrops.length, 0); assert.equal(computed.save.offline.corn, 4);
  assert.equal(g.collectMigratedCrops(computed.save, NOW + 14400000).ok, false);
  assert.equal(s.farm.pendingCrops.length, 1);
});
test('legacy empty plots do not displace crops, and new farms open exactly twelve plots', () => {
  const s = farm(); assert.equal(s.farm.tiles.filter(t => t.state !== 'wild').length, 12);
  const legacy = JSON.parse(JSON.stringify(s)); legacy.farm = { tiles: Array.from({ length: 300 }, () => ({ state: 'wild' })) };
  legacy.farm.tiles[299] = { state: 'planted', crop: 'corn', readyAt: NOW + 1000, watered: true };
  const migrated = validateSave(legacy); assert.equal(migrated.farm.tiles[0].crop, 'corn'); assert.equal(migrated.farm.pendingCrops.length, 0);
  const bad = structuredClone(migrated); bad.farm.pendingCrops = [{ state: 'tilled' }]; assert.throws(() => validateSave(bad));
});
test('batch planting consumes one seed per unique tilled tile and skips invalid plots', () => {
  const s = farm(); const before = g.amount(s, 'carrotSeed');
  assert.equal(g.plantBatch(s, [10, 10, 16, 22, 7, 0, -1, 99, 1.5], 'carrot', NOW).ok, true);
  assert.equal(g.amount(s, 'carrotSeed'), before - 3);
  for (const index of [10, 16, 22]) { assert.equal(s.farm.tiles[index].crop, 'carrot'); assert.equal(s.farm.tiles[index].readyAt, NOW + 600000); }
  assert.equal(s.farm.tiles[0].state, 'wild');
  assert.equal(g.plantBatch(s, [10, 16, 22], 'carrot', NOW).ok, false); assert.equal(g.amount(s, 'carrotSeed'), before - 3);
});
test('batch planting stops at available stock without negative inventory or overwriting crops', () => {
  const s = farm(); s.inventory.carrotSeed = 2;
  g.plantBatch(s, [10, 16, 22], 'carrot', NOW);
  assert.equal(g.amount(s, 'carrotSeed'), 0); assert.equal(s.farm.tiles[22].state, 'tilled'); assert.equal(s.farm.tiles[7].crop, 'carrot');
  assert.equal(g.plantBatch(s, [22], 'carrot', NOW).ok, false);
});
test('batch planting uses the normal tool and skill timing and survives storage roundtrip', () => {
  const s = farm(); s.player.skills.water = 45; s.player.tools.push('watering');
  g.plantBatch(s, [10, 16], 'corn', NOW);
  assert.equal(s.farm.tiles[10].readyAt, NOW + 5832000);
  const repo = new SaveRepository(new MemoryStorage()); repo.save(s);
  assert.deepEqual(repo.load(s.id).farm, s.farm);
});

test('maximum purchase respects gold, transaction limit and remaining capacity', () => {
  const s = farm(); s.player.gold = 913;
  assert.equal(g.maxPurchase(s, 'coffeeSeed'), 45);
  assert.equal(g.buy(s, 'coffeeSeed', g.maxPurchase(s, 'coffeeSeed'), NOW).ok, true);
  assert.equal(s.player.gold, 13);
  assert.equal(g.maxPurchase(s, 'coffeeSeed'), 0);
  s.player.gold = 100000;
  assert.equal(g.maxPurchase(s, 'coffeeSeed'), 99);
  assert.equal(g.maxPurchase(s, 'chicken'), g.catalog.economy.ranchCapacity - s.ranch.animals.length);
  s.inventory.coffeeSeed = g.catalog.economy.maxInventory - 2;
  assert.equal(g.maxPurchase(s, 'coffeeSeed'), 2);
  assert.equal(g.maxPurchase(s, 'unknown'), 0);
});

test('successful fishing records species, weight, totals and best weight once and persists', () => {
  const s = farm();
  assert.ok(g.fishingReward(s, NOW, 0, [0.5, 0.5, 0.5]).ok);
  const caught = s.fishingJournal.recent[0];
  assert.equal(caught.species, 'commonCarp'); assert.equal(caught.weightJin, 6.25); assert.equal(caught.caughtAt, NOW);
  assert.equal(g.amount(s, 'commonCarp'), 1);
  const before = structuredClone(s);
  assert.equal(g.fishingReward(s, NOW + 1, 0, [1, 1, 1]).ok, false);
  assert.deepEqual(s, before);
  assert.ok(g.fishingReward(s, NOW + g.catalog.timing.fishCooldown, 0, [1, 1, 1]).ok);
  assert.equal(s.fishingJournal.totalCaught, 2);
  assert.deepEqual(s.fishingJournal.species.commonCarp, { count: 2, bestWeightJin: 12 });
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))), s);
  const legacy = JSON.parse(JSON.stringify(s)); delete legacy.fishingJournal;
  assert.deepEqual(validateSave(legacy).fishingJournal, { totalCaught: 0, species: {}, recent: [] });
  const invalid = JSON.parse(JSON.stringify(s)); invalid.fishingJournal.recent[0].weightJin = 999;
  assert.throws(() => validateSave(invalid));
});

test('stock all adds only available fry up to remaining pond capacity', () => {
  const s = farm(); s.inventory.commonCarpFry = 20;
  const remaining = s.pond.capacity - s.pond.fishes.length;
  assert.ok(g.stockFish(s, 'commonCarp', true).ok);
  assert.equal(s.pond.fishes.length, s.pond.capacity);
  assert.equal(g.amount(s, 'commonCarpFry'), 20 - remaining);
  assert.equal(new Set(s.pond.fishes.map(f => f.id)).size, s.pond.capacity);
  assert.ok(s.pond.fishes.every(f => f.readyAt === null));
  const full = structuredClone(s);
  assert.equal(g.stockFish(s, 'commonCarp', true).ok, false); assert.deepEqual(s, full);
  const other = farm(); other.inventory.herringFry = 2;
  assert.ok(g.stockFish(other, 'herring', true).ok);
  assert.equal(other.pond.fishes.filter(f => f.type === 'herring').length, 2);
  assert.equal(g.amount(other, 'herringFry'), 0);
  const empty = structuredClone(other);
  assert.equal(g.stockFish(other, 'herring', true).ok, false); assert.deepEqual(other, empty);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))), s);
});
