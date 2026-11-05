import './style.css';
import * as game from './game/engine';
import { validateSave } from './game/validation';
import type { CropId, FishType, Result, SaveData, Scene } from './game/types';
import { SaveRepository, STORAGE_KEY } from './platform/saves';
import { webPlatform as platform } from './platform/web';
import { appView, duration, shopItems, type ViewState } from './ui/views';
import { icon } from './ui/icons';
const root = document.querySelector<HTMLDivElement>('#app')!;
const repo = new SaveRepository(platform.storage);
const v: ViewState = { save: null, scene: 'map', modal: null, tile: 88, animal: 1, bagFilter: '全部', item: null, shopCategory: 'seeds', shopMode: 'buy', buyId: 'carrotSeed', qty: 1, report: null, fishSuccess: 0, fishMisses: 0, deleteId: null, saves: [], now: platform.now(), saving: false, notice: '', saveError: '' };
let fishStart = performance.now(); let fishPointer = 0; let animation = 0; let lastHit = 0; let hidden = document.hidden;
let lastTick = platform.now(); let lastSave = platform.now(); let saveBlocked = false; let previousFocus: HTMLElement | null = null;
const toastRoot = document.createElement('div'); toastRoot.className = 'toast-region'; toastRoot.setAttribute('aria-live', 'polite'); document.body.append(toastRoot);
function toast(message: string, ok = true) {
  const el = document.createElement('div'); el.className = `toast ${ok ? '' : 'error'}`; el.textContent = `${ok ? '✦' : '!'} ${message}`; toastRoot.append(el); setTimeout(() => el.remove(), 4600);
}
function refreshSaves() { try { v.saves = repo.list(); } catch (e) { v.notice = (e as Error).message; } }
function persist() {
  if (!v.save || saveBlocked) return;
  const now = platform.now(); v.save.meta.lastOnlineTime = now; v.save.meta.lastSaveTime = now;
  try { repo.save(v.save); lastSave = now; } catch (e) { saveBlocked = true; v.saveError = (e as Error).message; throw e; }
}
function render(resetScroll = false) {
  v.now = platform.now(); refreshSaves();
  const scroll = document.querySelector('.modal-body')?.scrollTop || 0;
  const sceneScroll = document.querySelector('.scene-content')?.scrollTop || 0;
  root.innerHTML = appView(v); document.body.classList.toggle('has-modal', !!v.modal);
  document.querySelector('.app-shell, .welcome')?.toggleAttribute('inert', !!v.modal);
  const modalBody = document.querySelector('.modal-body'); if (modalBody) modalBody.scrollTop = scroll;
  const content = document.querySelector('.scene-content'); if (content) content.scrollTop = sceneScroll;
  cancelAnimationFrame(animation);
  if (v.modal === 'fishing') animateFishing();
  if (v.modal) document.querySelector<HTMLElement>('.close-button')?.focus({ preventScroll: true });
  if (resetScroll) window.scrollTo({ top: 0, behavior: 'instant' });
}
function openModal(name: string) {
  previousFocus = document.activeElement as HTMLElement;
  if (name === 'fishing' && v.modal !== 'fishing') { v.fishSuccess = 0; v.fishMisses = 0; fishStart = performance.now(); }
  v.modal = name; render();
  (document.querySelector('.modal input') || document.querySelector('.modal'))?.scrollIntoView({ block: 'nearest' });
  (document.querySelector('.modal input') as HTMLElement | null ?? document.querySelector<HTMLElement>('.close-button'))?.focus({ preventScroll: true });
}
function closeModal() { v.modal = null; render(); previousFocus?.focus({ preventScroll: true }); }
function flyReward(before: SaveData) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = document.querySelector<HTMLElement>('.game-dock [data-value="bag"]');
  const source = document.querySelector<HTMLElement>('.selected-tile, .animal-detail, .fish-list');
  if (!source || !target) return;
  const start = source.getBoundingClientRect(); const end = target.getBoundingClientRect();
  const art = v.scene === 'farm' ? game.catalog.crops[before.farm.tiles[v.tile].crop || 'carrot'].icon : v.scene === 'ranch' ? 'egg' : 'fish';
  const particle = document.createElement('div'); particle.className = 'harvest-fly'; particle.innerHTML = icon(art, 36);
  particle.style.left = `${start.left + start.width / 2}px`; particle.style.top = `${start.top}px`; document.body.append(particle);
  const dx = end.left + end.width / 2 - start.left - start.width / 2; const dy = end.top - start.top;
  particle.animate([{ transform: 'translate(-50%,0) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx * 0.4}px), ${Math.min(-60, dy * 0.2)}px) scale(1.2)`, opacity: 1, offset: 0.4 }, { transform: `translate(calc(-50% + ${dx}px), ${dy}px) scale(.3)`, opacity: 0 }], { duration: 800, easing: 'ease-in-out' }).finished.then(() => particle.remove());
}
function transact(action: (s: SaveData) => Result, closeOnSuccess = false) {
  if (!v.save) return;
  if (saveBlocked) { toast('保存暂不可用，请在设置中导出备份或重新载入进度', false); openModal('settings'); return; }
  const before = structuredClone(v.save); const oldLv = game.level(v.save); const oldSkills = (['till', 'water', 'harvest'] as const).map(k => game.skillLevel(v.save!, k).level);
  try {
    v.now = platform.now(); game.refreshQuests(v.save, v.now, platform.dayKey(v.now));
    const r = action(v.save);
    persist(); toast(r.message, r.ok);
    if (r.ok) { platform.audio.play('harvest'); platform.vibrate(); if (closeOnSuccess) v.modal = null; }
    const newSkills = (['till', 'water', 'harvest'] as const).map(k => game.skillLevel(v.save!, k).level);
    newSkills.forEach((n, i) => { if (n > oldSkills[i]) toast(`${['开垦', '浇水', '收获'][i]}熟练度升级 Lv.${n}！`); });
    if (game.level(v.save) > oldLv) { toast(`农场升级！Lv.${game.level(v.save)}`); platform.audio.play('level'); }
    render();
    if (r.ok && /收获|收取|收网|钓到了/.test(r.message)) flyReward(before);
  } catch (e) { v.save = before; toast((e as Error).message, false); render(); }
}
function enterSave(id: string, discard = false) {
  try {
    if (v.save && saveBlocked && !discard) throw new Error('当前进度尚未保存，请先导出备份或重新载入');
    if (v.save && !discard) persist();
    const original = repo.load(id); const computed = game.calculateOfflineRewards(original, platform.now());
    v.save = computed.save; v.report = computed.report; saveBlocked = false; v.saveError = ''; v.scene = 'map'; v.modal = null; v.animal = v.save.ranch.animals[0]?.id || 1;
    game.refreshQuests(v.save, platform.now(), platform.dayKey(platform.now()));
    platform.audio.setEnabled(v.save.settings.sound, v.save.settings.volume); persist();
    if (Object.keys(v.save.offline).length || computed.report.elapsed >= game.catalog.timing.offlineNoticeMin) v.modal = 'offline';
    if (computed.report.clockBack) toast('检测到设备时间倒退，已保留剩余成长时间', false);
    render(true);
  } catch (e) { toast((e as Error).message, false); }
}
function resume() {
  if (!v.save || saveBlocked) return;
  const original = v.save;
  try {
    const computed = game.calculateOfflineRewards(v.save, platform.now()); v.save = computed.save; v.report = computed.report;
    game.refreshQuests(v.save, platform.now(), platform.dayKey(platform.now())); persist();
    if (Object.keys(v.save.offline).length || computed.report.elapsed >= game.catalog.timing.offlineNoticeMin) v.modal = 'offline';
    if (computed.report.clockBack) toast('设备时间发生倒退，已保留剩余进度', false);
    render();
  } catch (e) { v.save = original; toast((e as Error).message, false); }
}
function newFarm(name: string) {
  if (!name.trim()) return toast('先给农场起一个名字吧', false);
  try {
    if (v.save && saveBlocked) throw new Error('当前进度尚未保存，请先导出备份或重新载入');
    if (v.save) persist();
    const now = platform.now(); const save = game.createSave(name, now, platform.dayKey(now), platform.createId()); repo.save(save);
    v.save = save; saveBlocked = false; v.saveError = ''; v.modal = null; v.scene = 'map'; v.animal = 1; v.report = null; platform.audio.setEnabled(false, 0.5); render(true); toast('欢迎来到你的农场！先去收几颗萝卜吧');
  } catch (e) { toast((e as Error).message, false); }
}
async function importSave() {
  try {
    const raw = await platform.readFile(); if (raw === null) return;
    let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new Error('这不是有效的 JSON 存档文件'); }
    const imported = validateSave(parsed); imported.id = platform.createId();
    // Import as a separate farm; never overwrite an existing save or trust file names.
    repo.save(imported, false); refreshSaves(); toast('导入成功，已创建独立存档副本'); openModal('saves');
  } catch (e) { toast((e as Error).message, false); }
}
function exportSave(save: SaveData) { platform.exportFile(`${save.farmName.replace(/[\\/:*?"<>|]/g, '_')}-${platform.dayKey(platform.now())}.json`, JSON.stringify(save, null, 2)); toast('已导出存档，请妥善保存'); }
function animateFishing() {
  if (v.modal !== 'fishing') return;
  const speed = 1800 - v.fishSuccess * 180;
  const progress = ((performance.now() - fishStart) % (speed * 2)) / speed;
  fishPointer = progress <= 1 ? progress : 2 - progress;
  const pointer = document.querySelector<HTMLElement>('#fishing-pointer'); if (pointer) pointer.style.left = `${fishPointer * 100}%`;
  animation = requestAnimationFrame(animateFishing);
}
function hitFishing() {
  if (!v.save || platform.now() - v.save.pond.lastFishing < game.catalog.timing.fishCooldown || performance.now() - lastHit < 250) return;
  lastHit = performance.now();
  if (fishPointer >= 0.35 && fishPointer <= 0.65) { v.fishSuccess++; platform.vibrate(); platform.audio.play('click'); }
  else { v.fishMisses++; toast('差一点！等指针进入绿区再试', false); }
  if (v.fishSuccess >= 3) { transact(s => game.fishingReward(s, platform.now(), Math.random()), true); return; }
  if (v.fishMisses >= 3) { v.fishSuccess = 0; v.fishMisses = 0; toast('鱼儿溜走了，再试一次吧', false); }
  fishStart = performance.now(); render();
}
function moveTile(delta: number) { v.tile = Math.max(0, Math.min(game.catalog.grid.cols * game.catalog.grid.rows - 1, v.tile + delta)); render(); }
root.addEventListener('submit', e => {
  e.preventDefault(); const form = e.target as HTMLFormElement; const name = String(new FormData(form).get('farmName') || '').trim();
  if (form.id === 'create-form') newFarm(name);
  if (form.id === 'rename-form' && name) transact(s => { s.farmName = name.slice(0, 16); return game.result(true, '农场名称已保存'); });
});
root.addEventListener('click', e => {
  const target = e.target as HTMLElement; const el = target.closest<HTMLElement>('[data-action]');
  if (!el) { if (v.modal === 'fishing' && target.closest('.modal-body')) hitFishing(); return; }
  if (el instanceof HTMLButtonElement && el.disabled) return;
  const action = el.dataset.action; const value = el.dataset.value || ''; const now = platform.now();
  if (v.modal === 'fishing' && action === 'backdrop' && target.closest('.modal-body')) { hitFishing(); return; }
  if (action !== 'backdrop') platform.audio.play('click');
  switch (action) {
    case 'scene': e.preventDefault(); v.scene = value as Scene; v.modal = null; render(true); break;
    case 'modal': openModal(value); break;
    case 'close': closeModal(); break;
    case 'backdrop': if (target === el) closeModal(); break;
    case 'load': enterSave(value); break;
    case 'reload': if (v.save) enterSave(v.save.id, true); break;
    case 'import': void importSave(); break;
    case 'export': if (v.save) exportSave(v.save); break;
    case 'raw-export': platform.exportFile('star-farm-raw-backup.json', repo.rawBackup()); break;
    case 'export-target': { const s = v.saves.find(s => s.id === value); if (s) exportSave(s); break; }
    case 'delete-prompt': v.deleteId = value; openModal('delete'); break;
    case 'delete-confirm': try { repo.delete(value); if (v.save?.id === value) { v.save = null; saveBlocked = false; } v.modal = v.save ? 'saves' : null; refreshSaves(); render(); toast('存档已删除'); } catch (e) { toast((e as Error).message, false); } break;
    case 'sound': if (v.save) transact(s => { s.settings.sound = !s.settings.sound; platform.audio.setEnabled(s.settings.sound, s.settings.volume); return game.result(true, s.settings.sound ? '声音已开启 · 音量 50%' : '已静音'); }); break;
    case 'skin': transact(s => { if (!s.player.skins.includes('starlight')) return game.result(false, '尚未解锁星夜装扮'); s.player.skin = s.player.skin === 'spring' ? 'starlight' : 'spring'; return game.result(true, '地图装扮已切换'); }); break;
    case 'tile': {
      v.tile = Number(value); const t = v.save?.farm.tiles[v.tile];
      if (t?.state === 'planted' && t.readyAt! <= now) transact(s => game.harvest(s, v.tile, now));
      else if (t?.state === 'tilled') openModal('seeds'); else render(); break;
    }
    case 'move-tile': moveTile(Number(value)); break;
    case 'till': transact(s => game.till(s, v.tile)); break;
    case 'plant': transact(s => game.plant(s, v.tile, value as CropId, now), true); break;
    case 'water': transact(s => game.water(s, v.tile, now)); break;
    case 'water-all': transact(s => game.water(s, 'all', now)); break;
    case 'harvest': transact(s => game.harvest(s, v.tile, now)); break;
    case 'harvest-all': transact(s => game.harvest(s, 'all', now)); break;
    case 'animal': v.animal = Number(value); render(); break;
    case 'feed-animal': transact(s => game.feedAnimal(s, Number(value), now)); break;
    case 'pet': transact(s => game.petAnimal(s, Number(value), now)); break;
    case 'collect-animal': e.stopPropagation(); transact(s => game.collectAnimals(s, now, Number(value))); break;
    case 'collect-animals': transact(s => game.collectAnimals(s, now)); break;
    case 'feed-fish': transact(s => game.feedFish(s, now)); break;
    case 'net': transact(s => game.netFish(s, now)); break;
    case 'stock-fish': transact(s => game.stockFish(s, value as FishType)); break;
    case 'upgrade': transact(s => game.upgradePond(s), true); break;
    case 'quest': transact(s => game.questAction(s, value, now)); break;
    case 'exchange': transact(s => game.exchange(s, value)); break;
    case 'bag-filter': v.bagFilter = value; v.item = null; render(); break;
    case 'item': v.item = value; render(); break;
    case 'sell-one': transact(s => game.sell(s, value, 1)); break;
    case 'sell-all': transact(s => game.sell(s, value, s.inventory[value] || 0)); break;
    case 'use-item': if (value.endsWith('Seed')) { v.scene = 'farm'; v.modal = null; v.tile = v.save!.farm.tiles.findIndex(t => t.state === 'tilled'); if (v.tile < 0) v.tile = 0; render(); toast('选一块空地，打开播种面板使用种子'); } else { v.scene = 'pond'; openModal('stock'); } break;
    case 'shop': v.shopCategory = value; v.shopMode = 'buy'; v.buyId = shopItems(value)[0].id; v.qty = 1; openModal('shop'); break;
    case 'shop-category': v.shopCategory = value; v.buyId = shopItems(value)[0].id; v.qty = 1; render(); break;
    case 'shop-mode': v.shopMode = value; render(); break;
    case 'buy-select': v.buyId = value; v.qty = 1; render(); break;
    case 'qty': v.qty = Math.max(1, Math.min(99, v.qty + Number(value))); render(); break;
    case 'buy': transact(s => game.buy(s, value, v.qty, now)); break;
    case 'claim-offline': transact(s => game.claimOffline(s), true); break;
    case 'fishing-hit': hitFishing(); break;
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && v.modal) { closeModal(); return; }
  const input = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  if (input) return;
  if (e.code === 'Space' && v.modal === 'fishing') { e.preventDefault(); hitFishing(); return; }
  if (!v.modal && v.scene === 'farm' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); moveTile({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -game.catalog.grid.cols, ArrowDown: game.catalog.grid.cols }[e.key]!); document.querySelector<HTMLElement>('.tile.selected')?.focus(); }
  if (e.key === 'Tab' && v.modal) {
    const elements = [...document.querySelectorAll<HTMLElement>('.modal button:not([disabled]), .modal input, .modal [tabindex="0"]')]; const first = elements[0]; const last = elements.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hidden = true; platform.audio.setEnabled(false, 0.5); if (v.modal === 'fishing') v.modal = null; cancelAnimationFrame(animation); try { persist(); } catch (e) { toast((e as Error).message, false); } }
  else if (hidden) { hidden = false; resume(); if (v.save) platform.audio.setEnabled(v.save.settings.sound, v.save.settings.volume); lastTick = platform.now(); }
});
window.addEventListener('pagehide', () => { if (!hidden) try { persist(); } catch { /* Save error is already reported during active play. */ } });
window.addEventListener('storage', e => { if ((e.key === STORAGE_KEY || e.key === null) && v.save) { saveBlocked = true; v.saveError = '另一标签页更新或清除了存档，请重新载入后继续'; toast('另一标签页更新了存档，请重新载入再继续，避免覆盖', false); openModal('settings'); } });
setInterval(() => {
  if (document.hidden) return;
  const now = platform.now();
  const previousTick = lastTick;
  if (now - lastTick > game.catalog.timing.offlineNoticeMin || now < lastTick) resume();
  lastTick = now; v.now = now;
  if (!v.save) return;
  let matured = false;
  document.querySelectorAll<HTMLElement>('[data-ready]').forEach(el => { const ready = Number(el.dataset.ready); const was = el.textContent; el.textContent = ready <= now ? el.dataset.done || '可收取' : duration(ready - now); if (was !== el.textContent && ready <= now) matured = true; });
  document.querySelectorAll<HTMLElement>('[data-tile-ready]').forEach(el => { if (Number(el.dataset.tileReady) <= now && !el.classList.contains('ripe')) matured = true; });
  const dayChanged = v.save.meta.questDay !== platform.dayKey(now); const expired = v.save.quests.some(q => q.expiresAt !== null && q.expiresAt <= now);
  if (dayChanged || expired) { game.refreshQuests(v.save, now, platform.dayKey(now)); matured = true; }
  // Refresh controls when a deadline passes even when the scene did not display a timer.
  if (v.save.farm.tiles.some(t => t.readyAt !== undefined && t.readyAt > previousTick && t.readyAt <= now) || v.save.ranch.animals.some(a => a.readyAt !== null && a.readyAt > previousTick && a.readyAt <= now) || v.save.pond.fishes.some(f => f.readyAt !== null && f.readyAt > previousTick && f.readyAt <= now)) matured = true;
  if (matured && !v.modal) render();
  if (now - lastSave >= game.catalog.timing.autosave && !saveBlocked) try { persist(); } catch (e) { toast((e as Error).message, false); }
}, 1000);
refreshSaves(); render();
// The service worker caches only this app's local static files; no analytics or remote calls.
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* Offline install is optional. */ }); });
