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
test('initial save has a fixed 20x15 field and is importable', () => {
  const s = farm(); assert.equal(s.farm.tiles.length, 300); assert.equal(s.player.gold, 1280); assert.equal(s.quests.length, 3); assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))), s);
});
test('plant → one water halves remaining time → harvest only once → sell', () => {
  const s = farm(); const i = 88; const originalSeeds = g.amount(s, 'carrotSeed');
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
  const s = farm(); s.player.skills.till = 15; assert.equal(g.till(s, 0).ok, true); assert.equal(s.farm.tiles.filter(t => t.state === 'tilled').length, 42);
  s.player.skills.water = 45; s.player.tools.push('watering'); g.plant(s, 88, 'carrot', NOW); assert.equal(s.farm.tiles[88].readyAt, NOW + 486000);
});
test('animal feed, pet cooldown, quality and one output per feed', () => {
  const s = farm(); assert.equal(g.collectAnimals(s, NOW).ok, true); assert.equal(g.amount(s, 'egg'), 1);
  assert.equal(g.collectAnimals(s, NOW).ok, false); assert.equal(g.feedAnimal(s, 1, NOW).ok, true);
  assert.equal(g.feedAnimal(s, 1, NOW).ok, false); assert.equal(g.amount(s, 'hay'), 23);
  assert.equal(g.petAnimal(s, 1, NOW).ok, true); assert.equal(g.petAnimal(s, 1, NOW + 1).ok, false);
  s.ranch.animals[0].affection = 7; assert.equal(g.collectAnimals(s, NOW + 3600000).ok, true); assert.equal(s.inventory['egg:gold'], 1);
});
test('fish must be stocked and fed, respect capacity, and net once', () => {
  const s = farm(); assert.equal(g.stockFish(s, 'carp').ok, false);
  assert.equal(g.buy(s, 'carpFry', 2, NOW).ok, true); assert.equal(g.stockFish(s, 'carp').ok, true);
  assert.equal(g.feedFish(s, NOW).ok, true); assert.equal(g.amount(s, 'hay'), 22);
  assert.equal(g.netFish(s, NOW).ok, false); assert.equal(g.netFish(s, NOW + 14400000).ok, true); assert.equal(g.amount(s, 'carp'), 2);
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
  const s = farm(); g.feedFish(s, NOW); g.plant(s, 88, 'ancient', NOW); const before = structuredClone(s);
  const { save, report } = g.calculateOfflineRewards(s, NOW + 36000000);
  assert.deepEqual(s, before); assert.equal(report.credited, 14400000); assert.equal(report.capped, true); assert.equal(save.offline.carrot, 6); assert.equal(save.offline.carp, 1);
  assert.equal(g.claimOffline(save).ok, true); assert.equal(g.claimOffline(save).ok, false);
  const again = g.calculateOfflineRewards(save, NOW + 36000000); assert.equal(Object.keys(again.save.offline).length, 0);
});
test('offline cap shifts unfinished deadlines instead of immediately completing them', () => {
  const s = farm(); s.farm.tiles[88] = { state: 'planted', crop: 'ancient', readyAt: NOW + 18000000, watered: false };
  const { save } = g.calculateOfflineRewards(s, NOW + 36000000);
  assert.equal(save.farm.tiles[88].readyAt, NOW + 39600000); assert.equal(save.farm.tiles[88].state, 'planted');
});
test('backward device clock preserves remaining growth instead of generating rewards', () => {
  const s = farm(); const original = s.farm.tiles[105].readyAt!; const { save, report } = g.calculateOfflineRewards(s, NOW - 3600000);
  assert.equal(report.clockBack, true); assert.equal(Object.keys(report.items).length, 0); assert.equal(save.farm.tiles[105].readyAt! - (NOW - 3600000), original - NOW);
  assert.doesNotThrow(() => validateSave(save));
});
test('fishing reward enforces cooldown and one grant per completed attempt', () => {
  const s = farm(); assert.equal(g.fishingReward(s, NOW, 0.1).ok, true); assert.equal(g.amount(s, 'koi'), 1);
  assert.equal(g.fishingReward(s, NOW + 1, 0.8).ok, false); assert.equal(g.fishingReward(s, NOW + 60000, 0.8).ok, true); assert.equal(g.amount(s, 'carp'), 1);
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
