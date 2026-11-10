import { weightRanges } from './fishing';
import { catalog, itemInfo } from './engine';
import type { SaveData, FishingJournal } from './types';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const integer = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => finite(v, max) && Number.isInteger(v);
const strings = (v: unknown, allowed: string[]): v is string[] => Array.isArray(v) && v.length <= allowed.length && new Set(v).size === v.length && v.every(i => typeof i === 'string' && allowed.includes(i));
const inventory = (v: unknown) => object(v) && Object.keys(v).length <= Object.keys(catalog.items).length * 3 && Object.entries(v).every(([k, n]) => !!itemInfo(k) && ['normal', 'silver', 'gold'].includes(k.split(':')[1] || 'normal') && k.split(':').length <= 2 && integer(n, catalog.economy.maxInventory));
export function validateSave(value: unknown): SaveData {
  value = structuredClone(value);
  const bad = () => { throw new Error('存档格式不正确或版本不支持，原有存档未被修改'); };
  if (!object(value) || value.version !== 1 || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id) || typeof value.farmName !== 'string' || !value.farmName.trim() || value.farmName.length > 16) return bad();
  // Discard retired fish so local saves cannot block loading or creating a farm.
  // Work on a copy; malformed saves still fail without changing the stored data.
  const retiredFish = new Set(['carp', 'koi']);
  const retiredItems = new Set(['carp', 'koi', 'carpFry', 'koiFry']);
  for (const key of ['inventory', 'offline']) {
    const entries = value[key];
    if (object(entries)) {
      for (const id of Object.keys(entries)) {
        if (retiredItems.has(id.split(':')[0])) delete entries[id];
      }
    }
  }
  if (object(value.pond) && Array.isArray(value.pond.fishes)) {
    value.pond.fishes = value.pond.fishes.filter(f => !object(f) || !retiredFish.has(String(f.type)));
  }
  const { meta, player, farm, ranch, pond, quests, settings } = value;
  if (!object(meta) || !finite(meta.createdAt) || !finite(meta.lastOnlineTime) || !finite(meta.lastSaveTime) || !integer(meta.nextId) || typeof meta.questDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(meta.questDay)) return bad();
  if (!object(player) || !integer(player.gold, catalog.economy.maxGold) || !integer(player.medals, 99999999) || !integer(player.exp, 99999999) || !strings(player.tools, ['watering', 'sickle']) || !strings(player.skins, ['spring', 'starlight']) || typeof player.skin !== 'string' || !player.skins.includes(player.skin) || !object(player.skills) || !['till', 'water', 'harvest'].every(k => integer((player.skills as Record<string, unknown>)[k], 99999999))) return bad();
  if (!object(farm) || !Array.isArray(farm.tiles) || ![catalog.grid.cols * catalog.grid.rows, 300].includes(farm.tiles.length) || !farm.tiles.every(t => object(t) && ['wild', 'tilled', 'planted'].includes(String(t.state)) && (t.state !== 'planted' || (typeof t.crop === 'string' && Object.hasOwn(catalog.crops, t.crop) && finite(t.readyAt) && typeof t.watered === 'boolean')))) return bad();
  const pendingCrops = farm.pendingCrops === undefined ? [] : farm.pendingCrops;
  if (!Array.isArray(pendingCrops) || pendingCrops.length > 300 || !pendingCrops.every(t => object(t) && t.state === 'planted' && typeof t.crop === 'string' && Object.hasOwn(catalog.crops, t.crop) && finite(t.readyAt) && typeof t.watered === 'boolean')) return bad();
  const size = catalog.grid.cols * catalog.grid.rows;
  const ordered = farm.tiles.length === 300 ? [...farm.tiles.filter(t => t.state === 'planted'), ...farm.tiles.filter(t => t.state === 'tilled'), ...farm.tiles.filter(t => t.state === 'wild')] : farm.tiles;
  const migratedFarm = { tiles: ordered.slice(0, size), pendingCrops: [...pendingCrops, ...ordered.slice(size).filter(t => t.state === 'planted')] };
  if (migratedFarm.pendingCrops.length > 300) return bad();
  if (!object(ranch) || !Array.isArray(ranch.animals) || ranch.animals.length > catalog.economy.ranchCapacity || !ranch.animals.every(a => object(a) && integer(a.id) && typeof a.type === 'string' && Object.hasOwn(catalog.animals, a.type) && integer(a.affection, 10) && (a.readyAt === null || finite(a.readyAt)) && typeof a.lastPet === 'number' && Number.isFinite(a.lastPet))) return bad();
  if (!object(pond) || !integer(pond.capacity, catalog.economy.pondMaxCapacity) || pond.capacity < catalog.economy.initialPondCapacity || (pond.capacity - catalog.economy.initialPondCapacity) % catalog.economy.pondUpgradeSlots !== 0 || !finite(pond.lastFishing) || !Array.isArray(pond.fishes) || pond.fishes.length > pond.capacity || !pond.fishes.every(f => object(f) && integer(f.id) && typeof f.type === 'string' && Object.hasOwn(catalog.fish, f.type) && (f.readyAt === null || finite(f.readyAt)))) return bad();
  const ids = [...ranch.animals.map(a => a.id), ...pond.fishes.map(f => f.id)];
  if (new Set(ids).size !== ids.length || ids.some(id => id >= (meta.nextId as number))) return bad();
  if (!inventory(value.inventory) || !inventory(value.offline)) return bad();
  if (!Array.isArray(quests) || quests.length > catalog.progression.questMax || new Set(quests.map(q => q?.id)).size !== quests.length || !quests.every(q => object(q) && typeof q.id === 'string' && q.id.length < 100 && catalog.quests.some(t => t.id === q.template) && ((q.acceptedAt === null && q.expiresAt === null) || (finite(q.acceptedAt) && finite(q.expiresAt) && (q.expiresAt as number) >= (q.acceptedAt as number))))) return bad();
  const completedQuests = value.completedQuests === undefined ? [] : value.completedQuests;
  if (!Array.isArray(completedQuests) || !completedQuests.every(q => object(q) && typeof q.id === 'string' && q.id.length > 0 && q.id.length < 100 && catalog.quests.some(t => t.id === q.template) && finite(q.acceptedAt) && finite(q.completedAt) && q.completedAt >= q.acceptedAt && integer(q.gold, catalog.economy.maxGold) && integer(q.medals, 99999999) && integer(q.exp, 99999999)) || new Set(completedQuests.map(q => q.id)).size !== completedQuests.length || completedQuests.some(q => quests.some(active => active.id === q.id))) return bad();
  if (!object(settings) || typeof settings.sound !== 'boolean' || !finite(settings.volume, 1)) return bad();
  const fishingJournal = value.fishingJournal === undefined ? { totalCaught: 0, species: {}, recent: [] } : value.fishingJournal;
  const validWeight = (species: unknown, weight: unknown) => {
    if (typeof species !== 'string' || !Object.hasOwn(weightRanges, species) || !finite(weight)) return false;
    const [min, max] = weightRanges[species as keyof typeof weightRanges];
    return weight >= min && weight <= max;
  };
  if (!object(fishingJournal) || !integer(fishingJournal.totalCaught) || !object(fishingJournal.species) || !Array.isArray(fishingJournal.recent) || fishingJournal.recent.length > 1000 || fishingJournal.recent.length > fishingJournal.totalCaught) return bad();
  let caughtCount = 0;
  for (const [species, stats] of Object.entries(fishingJournal.species)) {
    if (!object(stats) || !integer(stats.count) || stats.count < 1 || !validWeight(species, stats.bestWeightJin)) return bad();
    caughtCount += stats.count;
  }
  if (caughtCount !== fishingJournal.totalCaught || !fishingJournal.recent.every(c => object(c) && validWeight(c.species, c.weightJin) && finite(c.caughtAt) && object(fishingJournal.species) && object(fishingJournal.species[String(c.species)]) && Number((fishingJournal.species[String(c.species)] as Record<string, unknown>).bestWeightJin) >= Number(c.weightJin))) return bad();
  // Reconstruct from the schema instead of retaining untrusted top-level properties.
  return structuredClone({ version: 1, id: value.id, farmName: value.farmName.trim(), meta, player, farm: migratedFarm, ranch, pond, quests, completedQuests, fishingJournal: fishingJournal as unknown as FishingJournal, inventory: value.inventory, offline: value.offline, settings }) as SaveData;
}
