import data from '../data/catalog.json';
import { randomFishWeight } from './fishing';
import proficiency from '../data/proficiency.json';
import type { AnimalType, CropId, FishType, OfflineReport, Quality, Result, SaveData, Skill } from './types';
export const catalog = data;
export const skills = proficiency;
export const itemBase = (key: string) => key.split(':')[0];
export const qualityOf = (key: string): Quality => key.endsWith(':gold') ? 'gold' : key.endsWith(':silver') ? 'silver' : 'normal';
export function itemInfo(key: string) {
  const base = itemBase(key);
  if (!Object.hasOwn(data.items, base)) return null;
  const item = data.items[base as keyof typeof data.items];
  return item ? { ...item, quality: qualityOf(key), sell: Math.floor(item.sell * (qualityOf(key) === 'gold' ? data.progression.goldMultiplier : qualityOf(key) === 'silver' ? data.progression.silverMultiplier : 1)) } : null;
}
export function itemCategory(key: string): string {
  const base = itemBase(key);
  if (base.endsWith('Seed')) return '种子';
  if (Object.hasOwn(data.crops, base)) return '作物';
  if (Object.hasOwn(data.fish, base) || base.endsWith('Fry') && Object.hasOwn(data.fish, base.slice(0, -3))) return '鱼类';
  if (base === 'hay' || Object.values(data.animals).some(animal => animal.product === base)) return '养殖';
  return '其他';
}
export const amount = (s: SaveData, key: string) => Object.entries(s.inventory).filter(([id]) => itemBase(id) === key).reduce((n, [, qty]) => n + qty, 0);
export const level = (s: SaveData) => 1 + Math.floor(s.player.exp / data.progression.levelExp);
export const skillLevel = (s: SaveData, skill: Skill) => [...proficiency.levels].reverse().find(l => s.player.skills[skill] >= l.threshold)!;
export const canHarvestAll = (s: SaveData) => s.player.tools.includes('sickle') || skillLevel(s, 'harvest').level >= proficiency.harvestUnlockLevel;
export const result = (ok: boolean, message: string): Result => ({ ok, message });
export function addItem(s: SaveData, key: string, qty = 1, target = s.inventory) { target[key] = Math.min(data.economy.maxInventory, (target[key] || 0) + qty); }
function take(s: SaveData, key: string, qty: number) {
  if (amount(s, key) < qty) return false;
  for (const id of Object.keys(s.inventory).sort((a, b) => (qualityOf(a) === 'normal' ? -1 : 1) - (qualityOf(b) === 'normal' ? -1 : 1))) {
    if (itemBase(id) !== key) continue;
    const n = Math.min(qty, s.inventory[id]); s.inventory[id] -= n; qty -= n;
    if (!s.inventory[id]) delete s.inventory[id]; if (!qty) break;
  }
  return true;
}
function pay(s: SaveData, gold: number) { if (s.player.gold < gold) return false; s.player.gold -= gold; return true; }
function gain(s: SaveData, skill: Skill, n = 1) { s.player.skills[skill] += n; }
export function createSave(name: string, now: number, day: string, id: string): SaveData {
  const tiles: SaveData['farm']['tiles'] = Array.from({ length: data.grid.cols * data.grid.rows }, () => ({ state: 'wild' }));
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 4; x++) tiles[y * data.grid.cols + x] = { state: 'tilled' };
  [7, 8, 9].forEach(i => { tiles[i] = { state: 'planted', crop: 'carrot', readyAt: now, watered: true }; });
  [13, 14, 15].forEach(i => { tiles[i] = { state: 'planted', crop: 'carrot', readyAt: now + data.crops.carrot.duration, watered: false }; });
  [19, 20, 21].forEach(i => { tiles[i] = { state: 'planted', crop: 'corn', readyAt: now + data.crops.corn.duration, watered: false }; });
  const s: SaveData = {
    version: 1, id, farmName: name.trim().slice(0, 16) || '星星农场',
    meta: { createdAt: now, lastOnlineTime: now, lastSaveTime: now, questDay: '', nextId: 3 },
    player: { gold: data.economy.initialGold, medals: data.economy.initialMedals, exp: 0, tools: [], skin: 'spring', skins: ['spring'], skills: { till: 0, water: 0, harvest: 0 } },
    farm: { tiles, pendingCrops: [] }, ranch: { animals: [{ id: 1, type: 'chicken', affection: 0, readyAt: now, lastPet: 0 }] },
    fishingJournal: { totalCaught: 0, species: {}, recent: [] },
    pond: { capacity: data.economy.initialPondCapacity, fishes: [{ id: 2, type: 'commonCarp', readyAt: null }], lastFishing: 0 },
    inventory: { carrotSeed: data.economy.initialCarrotSeeds, cornSeed: data.economy.initialCornSeeds, berrySeed: data.economy.initialBerrySeeds, hay: data.economy.initialHay },
    quests: [], completedQuests: [], offline: {}, settings: { sound: false, volume: 0.5 }
  };
  refreshQuests(s, now, day); return s;
}
export function validateQuest(itemPool: string[], playerState: SaveData, template = data.quests[0]): boolean {
  return itemPool.includes(template.item) && Number.isInteger(template.count) && template.count > 0 && template.hours > 0 && playerState.quests.length < data.progression.questMax;
}
export function refreshQuests(s: SaveData, now: number, day: string) {
  s.quests = s.quests.filter(q => q.expiresAt === null || q.expiresAt > now);
  if (s.meta.questDay === day) return;
  s.meta.questDay = day;
  const hash = [...day].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  for (let i = 0; i < data.quests.length && s.quests.length < data.progression.questMax; i++) {
    const t = data.quests[(hash + i) % data.quests.length];
    if (!s.quests.some(q => q.template === t.id) && validateQuest(Object.keys(data.items), s, t)) s.quests.push({ id: `${day}-${t.id}`, template: t.id, acceptedAt: null, expiresAt: null });
  }
}
export const questTemplate = (id: string) => data.quests.find(q => q.id === id)!;
export function questAction(s: SaveData, id: string, now: number): Result {
  const q = s.quests.find(q => q.id === id); if (!q) return result(false, '委托已更新，请重新查看');
  const t = questTemplate(q.template);
  if (q.acceptedAt === null) { q.acceptedAt = now; q.expiresAt = now + t.hours * 3600000; return result(true, `已接取「${t.name}」`); }
  if (q.expiresAt! <= now) { s.quests = s.quests.filter(v => v.id !== id); return result(false, '委托已到期，没有失败惩罚'); }
  if (!take(s, t.item, t.count)) return result(false, `${itemInfo(t.item)!.name}还差 ${t.count - amount(s, t.item)} 个`);
  s.completedQuests.push({ id: q.id, template: q.template, acceptedAt: q.acceptedAt, completedAt: now, gold: t.gold, medals: t.medals, exp: t.exp });
  s.player.gold += t.gold; s.player.medals += t.medals; s.player.exp += t.exp; s.quests = s.quests.filter(v => v.id !== id);
  return result(true, `委托完成！金币 +${t.gold}，奖章 +${t.medals}`);
}
export function till(s: SaveData, i: number): Result {
  const t = s.farm.tiles[i]; if (!t || t.state !== 'wild') return result(false, '请选择一块荒地');
  const range = skillLevel(s, 'till').range;
  const targets = nearby(s, i, range).filter(n => s.farm.tiles[n].state === 'wild');
  const count = Math.min(targets.length, Math.floor(s.player.gold / data.economy.tillCost));
  if (!count) return result(false, '金币不足，先出售一些收获吧');
  pay(s, count * data.economy.tillCost); targets.slice(0, count).forEach(n => { s.farm.tiles[n] = { state: 'tilled' }; }); gain(s, 'till', count);
  return result(true, `开垦了 ${count} 块土地`);
}
function nearby(s: SaveData, i: number, range: number) {
  const out = [i];
  for (let d = 1; out.length < range && d < data.grid.cols; d++) {
    for (const j of [i - d, i + d, i - d * data.grid.cols, i + d * data.grid.cols]) if (j >= 0 && j < s.farm.tiles.length && !out.includes(j) && Math.abs(j % data.grid.cols - i % data.grid.cols) <= d) out.push(j);
  }
  return out.slice(0, range);
}
export function plant(s: SaveData, i: number, crop: CropId, now: number): Result {
  const t = s.farm.tiles[i]; if (!t || t.state !== 'tilled') return result(false, '请先选择已开垦的空地');
  const c = data.crops[crop]; if (!take(s, c.seed, 1)) return result(false, '种子不足，可以去种子商店补充');
  const mult = skillLevel(s, 'water').timeMultiplier * (s.player.tools.includes('watering') ? 0.9 : 1);
  s.farm.tiles[i] = { state: 'planted', crop, readyAt: now + Math.round(c.duration * mult), watered: false };
  return result(true, `${c.name}已播种，记得浇水`);
}
export function water(s: SaveData, index: number | 'all', now: number): Result {
  const targets = index === 'all' ? s.farm.tiles.map((_, i) => i) : nearby(s, index, s.player.tools.includes('watering') ? s.farm.tiles.length : skillLevel(s, 'water').range);
  let count = 0;
  for (const i of targets) { const t = s.farm.tiles[i]; if (t.state === 'planted' && !t.watered && t.readyAt! > now) { t.readyAt = now + Math.ceil((t.readyAt! - now) / 2); t.watered = true; count++; } }
  gain(s, 'water', count); return result(count > 0, count ? `浇灌了 ${count} 块作物，剩余时间减半` : '作物都喝饱水了');
}
export function harvest(s: SaveData, index: number | 'all', now: number): Result {
  if (index === 'all' && !canHarvestAll(s)) return result(false, '收获熟练度 Lv.3 或星陨镰刀可解锁');
  const targets = index === 'all' ? s.farm.tiles.map((_, i) => i) : nearby(s, index, skillLevel(s, 'harvest').range);
  let count = 0;
  for (const i of targets) { const t = s.farm.tiles[i]; if (t.state === 'planted' && t.readyAt! <= now) { addItem(s, t.crop!); s.player.exp += data.crops[t.crop!].exp; s.farm.tiles[i] = { state: 'tilled' }; count++; } }
  gain(s, 'harvest', count); return result(count > 0, count ? `收获 ${count} 份作物，已放入背包` : '作物还在慢慢长大');
}
export function maxPurchase(s: SaveData, id: string): number {
  const crop = Object.values(data.crops).find(c => c.seed === id && c.price > 0);
  const fishId = id.endsWith('Fry') ? id.slice(0, -3) as FishType : null;
  const fish = fishId && Object.hasOwn(data.fish, fishId) ? data.fish[fishId] : null;
  const animal = Object.hasOwn(data.animals, id) ? data.animals[id as AnimalType] : null;
  const price = crop?.price ?? fish?.price ?? animal?.price ?? (id === 'hay' ? data.economy.hayPrice : 0);
  if (!price) return 0;
  const capacity = animal ? data.economy.ranchCapacity - s.ranch.animals.length : data.economy.maxInventory - amount(s, id);
  return Math.max(0, Math.min(99, Math.floor(s.player.gold / price), capacity));
}
export function buy(s: SaveData, id: string, qty: number, now: number): Result {
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) return result(false, '请选择 1–99 件');
  const crop = Object.values(data.crops).find(c => c.seed === id && c.price > 0);
  const fishId = id.endsWith('Fry') ? id.slice(0, -3) as FishType : null;
  const fish = fishId && Object.hasOwn(data.fish, fishId) ? data.fish[fishId] : null;
  const animal = data.animals[id as AnimalType];
  const price = crop?.price ?? fish?.price ?? animal?.price ?? (id === 'hay' ? data.economy.hayPrice : 0);
  if (!price) return result(false, '这件物品不能用金币购买');
  if (animal && s.ranch.animals.length + qty > data.economy.ranchCapacity) return result(false, `牧场最多容纳 ${data.economy.ranchCapacity} 只动物`);
  if (!pay(s, price * qty)) return result(false, '金币不足，可以先出售背包里的收获');
  if (animal) for (let n = 0; n < qty; n++) s.ranch.animals.push({ id: s.meta.nextId++, type: id as AnimalType, affection: 0, readyAt: null, lastPet: now - data.timing.petCooldown });
  else addItem(s, id, qty);
  return result(true, animal ? `${qty} 只${animal.name}住进牧场了` : `购买成功，${itemInfo(id)?.name} ×${qty}`);
}
export function sell(s: SaveData, key: string, qty: number): Result {
  const info = itemInfo(key); if (!info || !info.sell || !Number.isInteger(qty) || qty < 1 || (s.inventory[key] || 0) < qty) return result(false, '没有足够的可出售物品');
  s.inventory[key] -= qty; if (!s.inventory[key]) delete s.inventory[key]; s.player.gold = Math.min(data.economy.maxGold, s.player.gold + info.sell * qty);
  return result(true, `售出${info.name} ×${qty}，金币 +${info.sell * qty}`);
}
export function feedAnimal(s: SaveData, id: number, now: number): Result {
  const a = s.ranch.animals.find(a => a.id === id); if (!a) return result(false, '请选择动物');
  if (a.readyAt !== null) return result(false, a.readyAt <= now ? '请先收取产出，再喂食' : '它已经吃饱了');
  if (!take(s, 'hay', data.economy.feedCost)) return result(false, '饲料不足，去商店补充吧');
  a.readyAt = now + data.animals[a.type].duration; return result(true, '喂食成功，开始等待产出');
}
export function petAnimal(s: SaveData, id: number, now: number): Result {
  const a = s.ranch.animals.find(a => a.id === id); if (!a) return result(false, '请选择动物');
  if (now - a.lastPet < data.timing.petCooldown) return result(false, '刚刚抚摸过，1 小时后再来陪它吧');
  a.lastPet = now; a.affection = Math.min(10, a.affection + data.progression.petAffection); return result(true, '它很喜欢你，好感度 +1');
}
const productKey = (a: SaveData['ranch']['animals'][number]) => data.animals[a.type].product + (a.affection >= data.progression.qualityGoldAt ? ':gold' : a.affection >= data.progression.qualitySilverAt ? ':silver' : '');
export function collectAnimals(s: SaveData, now: number, id?: number): Result {
  let count = 0;
  for (const a of s.ranch.animals) if ((id === undefined || id === a.id) && a.readyAt !== null && a.readyAt <= now) { addItem(s, productKey(a)); a.readyAt = null; s.player.exp += 8; count++; }
  return result(count > 0, count ? `收取了 ${count} 份产出，继续喂食可以再生产` : '还没有可以收取的产出');
}
export function stockFish(s: SaveData, type: FishType, all = false): Result {
  if (!Object.hasOwn(data.fish, type)) return result(false, '请选择有效的鱼苗');
  if (s.pond.fishes.length >= s.pond.capacity) return result(false, '鱼塘满了，可以先升级扩容');
  const count = all ? Math.min(amount(s, type + 'Fry'), s.pond.capacity - s.pond.fishes.length) : 1;
  if (!count || !take(s, type + 'Fry', count)) return result(false, '没有鱼苗，去鱼苗商店看看吧');
  for (let i = 0; i < count; i++) s.pond.fishes.push({ id: s.meta.nextId++, type, readyAt: null });
  return result(true, `${count} 尾${data.fish[type].name}苗已入塘，喂鱼后开始成长`);
}
export function feedFish(s: SaveData, now: number): Result {
  const fishes = s.pond.fishes.filter(f => f.readyAt === null); if (!fishes.length) return result(false, '鱼已经喂饱了，或需要先放入鱼苗');
  if (!take(s, 'hay', fishes.length)) return result(false, `需要 ${fishes.length} 份饲料，去商店补充吧`);
  fishes.forEach(f => { f.readyAt = now + data.fish[f.type].duration; }); return result(true, `喂好了 ${fishes.length} 尾鱼，4 小时后收网`);
}
export function netFish(s: SaveData, now: number): Result {
  const ready = s.pond.fishes.filter(f => f.readyAt !== null && f.readyAt <= now);
  if (!ready.length) return result(false, '还没有长成的鱼');
  ready.forEach(f => { addItem(s, f.type); }); const ids = new Set(ready.map(f => f.id)); s.pond.fishes = s.pond.fishes.filter(f => !ids.has(f.id)); s.player.exp += ready.length * 10;
  return result(true, `收网成功，${ready.length} 尾鱼已放入背包`);
}
export const upgradeCost = (s: SaveData) => data.economy.pondUpgradeBase * (1 + (s.pond.capacity - data.economy.initialPondCapacity) / data.economy.pondUpgradeSlots);
export function upgradePond(s: SaveData): Result {
  if (s.pond.capacity >= data.economy.pondMaxCapacity) return result(false, '鱼塘已达到最大容量');
  if (!pay(s, upgradeCost(s))) return result(false, '金币不足'); s.pond.capacity += data.economy.pondUpgradeSlots; return result(true, `鱼塘扩容至 ${s.pond.capacity} 尾`);
}
export function exchange(s: SaveData, id: string): Result {
  const item = data.mystery.find(i => i.id === id); if (!item) return result(false, '商品不存在');
  if (item.kind === 'tool' && s.player.tools.includes(id) || item.kind === 'skin' && s.player.skins.includes(id)) return result(false, '已经拥有这件珍藏了');
  if (s.player.medals < item.price) return result(false, '奖章不足，完成小镇委托可获得奖章');
  s.player.medals -= item.price;
  if (item.kind === 'tool') s.player.tools.push(id); else if (item.kind === 'skin') { s.player.skins.push(id); s.player.skin = id; } else addItem(s, id, item.amount);
  return result(true, `兑换成功：${item.name}`);
}
export function fishingReward(s: SaveData, now: number, roll: number, weightRolls = [Math.random(), Math.random(), Math.random()]): Result {
  if (now - s.pond.lastFishing < data.timing.fishCooldown) return result(false, '水面还没平静，稍等片刻再钓吧');
  const totalWeight = data.fishingPool.reduce((sum, fish) => sum + fish.weight, 0);
  let cursor = Math.max(0, Math.min(0.999999, roll)) * totalWeight;
  const type = (data.fishingPool.find(fish => { cursor -= fish.weight; return cursor < 0; })?.id || 'commonCarp') as FishType;
  const weightJin = randomFishWeight(type, weightRolls);
  const record = { species: type, weightJin, caughtAt: now };
  const journal = s.fishingJournal;
  journal.totalCaught++;
  const previous = journal.species[type];
  journal.species[type] = { count: (previous?.count || 0) + 1, bestWeightJin: Math.max(previous?.bestWeightJin || 0, weightJin) };
  journal.recent.push(record); journal.recent = journal.recent.slice(-1000);
  addItem(s, type); s.pond.lastFishing = now; s.player.exp += data.economy.fishingRewardExp;
  return result(true, `钓到了${data.fish[type].name} · ${weightJin.toFixed(2)} 斤！已放入背包`);
}
export function calculateOfflineRewards(input: SaveData, currentTime: number): { save: SaveData; report: OfflineReport } {
  const s = structuredClone(input); const elapsed = Math.max(0, currentTime - s.meta.lastOnlineTime);
  const credited = Math.min(elapsed, data.timing.offlineCap); const cutoff = s.meta.lastOnlineTime + credited;
  const clockBack = currentTime < s.meta.lastOnlineTime;
  const shift = currentTime - cutoff;
  const items: Record<string, number> = {};
  for (const t of [...s.farm.tiles, ...s.farm.pendingCrops]) if (t.state === 'planted') {
    if (!clockBack && t.readyAt! <= cutoff) { addItem(s, t.crop!, 1, items); s.player.exp += data.crops[t.crop!].exp; gain(s, 'harvest'); t.state = 'tilled'; delete t.crop; delete t.readyAt; delete t.watered; }
    else t.readyAt! += shift;
  }
  s.farm.pendingCrops = s.farm.pendingCrops.filter(t => t.state === 'planted');
  for (const a of s.ranch.animals) {
    if (a.readyAt !== null) { if (!clockBack && a.readyAt <= cutoff) { addItem(s, productKey(a), 1, items); a.readyAt = null; s.player.exp += 8; } else a.readyAt += shift; }
    if (clockBack) a.lastPet += shift;
  }
  const harvested = new Set<number>();
  for (const f of s.pond.fishes) if (f.readyAt !== null) {
    if (!clockBack && f.readyAt <= cutoff) { addItem(s, f.type, 1, items); harvested.add(f.id); s.player.exp += 10; } else f.readyAt += shift;
  }
  s.pond.fishes = s.pond.fishes.filter(f => !harvested.has(f.id));
  if (clockBack) s.pond.lastFishing = Math.max(0, s.pond.lastFishing + shift);
  for (const [key, qty] of Object.entries(items)) addItem(s, key, qty, s.offline);
  s.meta.lastOnlineTime = currentTime;
  return { save: s, report: { elapsed, credited, capped: elapsed > data.timing.offlineCap, clockBack, items } };
}
export function claimOffline(s: SaveData): Result {
  const count = Object.values(s.offline).reduce((a, b) => a + b, 0);
  for (const [key, qty] of Object.entries(s.offline)) addItem(s, key, qty);
  s.offline = {}; return result(count > 0, count ? `${count} 份离线收获已放入背包` : '离线仓库已经收空了');
}

export function collectMigratedCrops(s: SaveData, now: number): Result {
  let count = 0;
  s.farm.pendingCrops = s.farm.pendingCrops.filter(t => {
    if (t.readyAt! > now) return true;
    addItem(s, t.crop!); s.player.exp += data.crops[t.crop!].exp; gain(s, 'harvest'); count++; return false;
  });
  return result(count > 0, count ? `旧农场收获 ${count} 份作物，已放入背包` : '旧农场作物还在生长');
}

/** A gesture is one transaction. Revisited, planted and wild tiles never consume seeds. */
export function plantBatch(s: SaveData, indices: number[], crop: CropId, now: number): Result {
  if (!Object.hasOwn(data.crops, crop)) return result(false, '请选择有效的种子');
  let count = 0;
  for (const i of new Set(indices)) {
    if (!Number.isInteger(i) || s.farm.tiles[i]?.state !== 'tilled') continue;
    if (!amount(s, data.crops[crop].seed)) break;
    if (plant(s, i, crop, now).ok) count++;
  }
  return result(count > 0, count ? `播种${data.crops[crop].name} ${count} 块，消耗 ${count} 颗种子` : '未播种：请拖过空地并确认种子充足');
}
