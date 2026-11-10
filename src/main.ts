import './style.css';
import { fishingFrame } from './game/fishing';
import * as game from './game/engine';
import { validateSave } from './game/validation';
import type { CropId, FishType, Result, SaveData, Scene } from './game/types';
import { SaveRepository, STORAGE_KEY } from './platform/saves';
import { webPlatform as platform } from './platform/web';
import { appView, modalView, duration, shopItems, type ViewState } from './ui/views';
import { icon } from './ui/icons';
const root = document.querySelector<HTMLDivElement>('#app')!;
const repo = new SaveRepository(platform.storage);
const v: ViewState = { save: null, scene: 'map', modal: null, questTab: 'active', selectedSeed: null, tile: 10, animal: 1, bagFilter: '全部', item: null, shopCategory: 'seeds', shopMode: 'buy', buyId: 'carrotSeed', qty: 1, report: null, fishSuccess: 0, fishMisses: 0, deleteId: null, saves: [], now: platform.now(), saving: false, notice: '', saveError: '' };
let fishStart = performance.now(); let fishZoneStart = Math.random(); let fishZoneDirection = 1; let animation = 0; let lastHit = 0; let hidden = document.hidden;
let lastTick = platform.now(); let lastSave = platform.now(); let saveBlocked = false; let previousFocus: HTMLElement | null = null;
let modalScrollY: number | null = null;
const toastRoot = document.createElement('div'); toastRoot.className = 'toast-region'; toastRoot.setAttribute('aria-live', 'polite'); document.body.append(toastRoot);
function toast(message: string, ok = true) {
  const el = document.createElement('div'); el.className = `toast ${ok ? '' : 'error'}`; el.textContent = `${ok ? '✦' : '!'} ${message}`; toastRoot.replaceChildren(el); setTimeout(() => el.remove(), 4600);
  return el;
}
function showCropCountdown() {
  const tile = v.save?.farm.tiles[v.tile];
  if (saveBlocked || tile?.state !== 'planted') return;
  const el = toast(`${game.catalog.crops[tile.crop!].name} · 距成熟`);
  const remaining = document.createElement('span');
  remaining.className = 'countdown';
  remaining.dataset.ready = String(tile.readyAt);
  remaining.dataset.done = '成熟可收获';
  remaining.textContent = tile.readyAt! <= platform.now() ? '成熟可收获' : duration(tile.readyAt! - platform.now());
  el.append(remaining);
}
function refreshSaves() { try { v.saves = repo.list(); } catch (e) { v.notice = (e as Error).message; } }
function persist() {
  if (!v.save || saveBlocked) return;
  const now = platform.now(); v.save.meta.lastOnlineTime = now; v.save.meta.lastSaveTime = now;
  try { repo.save(v.save); lastSave = now; } catch (e) { saveBlocked = true; v.saveError = (e as Error).message; throw e; }
}
function fitModalToViewport() {
  const frame = document.querySelector<HTMLElement>('.game-frame');
  const overlay = frame?.querySelector<HTMLElement>('.modal-backdrop');
  if (!frame || !overlay) return;
  const rect = frame.getBoundingClientRect();
  const top = window.visualViewport?.offsetTop ?? 0;
  const bottom = top + (window.visualViewport?.height ?? window.innerHeight);
  // Center inside the visible part of the game when its page is taller than the screen.
  overlay.style.paddingTop = `${Math.max(12, top - rect.top + 12)}px`;
  overlay.style.paddingBottom = `${Math.max(12, rect.bottom - bottom + 12)}px`;
  overlay.style.setProperty('--dialog-height', `${Math.max(140, Math.min(rect.bottom, bottom) - Math.max(rect.top, top) - 24)}px`);
}
function render(resetScroll = false) {
  if (seedGesture?.dragging) cancelSeedGesture();
  v.now = platform.now(); refreshSaves();
  if (v.save && v.selectedSeed && !game.amount(v.save, game.catalog.crops[v.selectedSeed].seed)) v.selectedSeed = null;
  platform.audio.setMusic(!v.save ? 'welcome' : v.modal === 'shop' ? 'shop' : v.scene);
  if (!v.save) platform.audio.setEnabled(!document.hidden && v.welcomeSound !== false, 0.5);
  if (v.modal && modalScrollY === null) {
    modalScrollY = resetScroll ? 0 : window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `${-modalScrollY}px`;
    document.body.style.width = '100%';
  }
  const scroll = document.querySelector('.modal-body')?.scrollTop || 0;
  const sceneScroll = resetScroll ? 0 : document.querySelector('.scene-content')?.scrollTop || 0;
  const seedScroll = document.querySelector('.seed-rail')?.scrollLeft || 0;
  root.innerHTML = appView(v); document.body.classList.toggle('has-modal', !!v.modal);
  if (!v.modal && modalScrollY !== null) {
    const restoreY = modalScrollY; modalScrollY = null;
    document.body.style.removeProperty('position'); document.body.style.removeProperty('top'); document.body.style.removeProperty('width');
    window.scrollTo({ top: restoreY, behavior: 'instant' });
  }
  const gameHeader = document.querySelector('.game-header');
  if (gameHeader) gameHeader.append(toastRoot);
  else document.querySelector('.welcome-host')?.prepend(toastRoot);
  document.querySelectorAll('.game-surface, .sidebar, .journal, .desktop-heading, .desktop-footer, .welcome').forEach(el => el.toggleAttribute('inert', !!v.modal));
  const modalBody = document.querySelector('.modal-body'); if (modalBody) modalBody.scrollTop = scroll;
  const seedRail = document.querySelector('.seed-rail'); if (seedRail) seedRail.scrollLeft = seedScroll;
  const content = document.querySelector('.scene-content'); if (content) content.scrollTop = sceneScroll;
  cancelAnimationFrame(animation);
  if (v.modal === 'fishing') animateFishing();
  if (v.modal) document.querySelector<HTMLElement>('.close-button')?.focus({ preventScroll: true });
  if (resetScroll) window.scrollTo({ top: 0, behavior: 'instant' });
  fitModalToViewport();
}
// Keep the overlay, dialog and game scene mounted while switching tabs or selections.
function patchModalNode(current: Node, next: Node) {
  if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
    current.parentNode?.replaceChild(next, current); return;
  }
  if (!(current instanceof Element) || !(next instanceof Element)) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  for (const attribute of [...current.attributes]) if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  for (const attribute of [...next.attributes]) if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
  if (current.classList.contains('modal-scroll')) { current.replaceChildren(...next.childNodes); return; }
  const oldNodes = [...current.childNodes]; const newNodes = [...next.childNodes];
  for (let i = 0; i < Math.max(oldNodes.length, newNodes.length); i++) {
    if (!newNodes[i]) oldNodes[i].remove();
    else if (!oldNodes[i]) current.append(newNodes[i]);
    else patchModalNode(oldNodes[i], newNodes[i]);
  }
}
function refreshModal() {
  v.now = platform.now();
  const body = document.querySelector<HTMLElement>('.modal-body');
  if (!body) return render();
  const active = document.activeElement as HTMLElement | null;
  const action = active?.dataset.action; const value = active?.dataset.value;
  const template = document.createElement('template'); template.innerHTML = modalView(v);
  const next = template.content.querySelector('.modal-body');
  if (!next) return;
  const scroll = body.scrollTop;
  const listScroll = body.querySelector<HTMLElement>('.modal-scroll')?.scrollTop ?? 0;
  patchModalNode(body, next);
  body.scrollTop = scroll;
  const list = body.querySelector<HTMLElement>('.modal-scroll');
  if (list) list.scrollTop = action && ['quest-tab', 'shop-category', 'shop-mode', 'bag-filter'].includes(action) ? 0 : listScroll;
  if (action && !active?.isConnected) [...body.querySelectorAll<HTMLElement>('[data-action]')].find(el => el.dataset.action === action && el.dataset.value === value)?.focus({ preventScroll: true });
}
function openModal(name: string) {
  previousFocus = document.activeElement as HTMLElement;
  if (name === 'fishing' && v.modal !== 'fishing') { v.fishSuccess = 0; v.fishMisses = 0; resetFishingRound(); }
  if (name === 'quests' && v.modal !== 'quests') v.questTab = 'active';
  v.modal = name; render();
  const frame = document.querySelector('.game-frame');
  const rect = frame?.getBoundingClientRect();
  if (rect && (rect.bottom <= 0 || rect.top >= window.innerHeight)) frame?.scrollIntoView({ block: 'nearest' });
  // Opening settings should not enter rename mode or raise the mobile keyboard.
  document.querySelector<HTMLElement>('.close-button')?.focus({ preventScroll: true });
  fitModalToViewport();
}
function closeModal() { v.modal = null; render(); previousFocus?.focus({ preventScroll: true }); }
function flyReward(before: SaveData) {
  if (v.modal === 'fishing-result' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = document.querySelector<HTMLElement>('.game-dock [data-value="bag"]');
  const source = document.querySelector<HTMLElement>('.tile.selected, .animal-detail, .fish-list');
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
function resetFishingRound() {
  fishStart = performance.now(); fishZoneStart = Math.random(); fishZoneDirection = Math.random() < 0.5 ? -1 : 1;
}
function currentFishingFrame() {
  return fishingFrame(v.fishSuccess, performance.now() - fishStart, fishZoneStart, fishZoneDirection);
}
function animateFishing() {
  if (v.modal !== 'fishing') return;
  const frame = currentFishingFrame();
  const pointer = document.querySelector<HTMLElement>('#fishing-pointer'); if (pointer) pointer.style.left = `${frame.pointer * 100}%`;
  const zone = document.querySelector<HTMLElement>('.green-zone');
  if (zone) { zone.style.left = `${frame.left * 100}%`; zone.style.width = `${frame.width * 100}%`; }
  animation = requestAnimationFrame(animateFishing);
}
function hitFishing() {
  if (!v.save || platform.now() - v.save.pond.lastFishing < game.catalog.timing.fishCooldown || performance.now() - lastHit < 250) return;
  lastHit = performance.now();
  const frame = currentFishingFrame();
  if (frame.pointer >= frame.left && frame.pointer <= frame.left + frame.width) { v.fishSuccess++; platform.vibrate(); platform.audio.play('click'); }
  else { v.fishMisses++; toast('差一点！等指针进入绿区再试', false); }
  if (v.fishSuccess >= 3) {
    transact(s => {
      const reward = game.fishingReward(s, platform.now(), Math.random());
      if (reward.ok) v.modal = 'fishing-result';
      return reward;
    });
    return;
  }
  if (v.fishMisses >= 3) { v.fishSuccess = 0; v.fishMisses = 0; toast('鱼儿溜走了，再试一次吧', false); }
  resetFishingRound(); render();
}
function moveTile(delta: number) { v.tile = Math.max(0, Math.min(game.catalog.grid.cols * game.catalog.grid.rows - 1, v.tile + delta)); render(); }
interface SeedGesture {
  pointer: number; crop: CropId; startX: number; startY: number; x: number; y: number;
  lastX: number; lastY: number; rail: HTMLElement; scrollLeft: number; moved: boolean;
  dragging: boolean; timer: ReturnType<typeof setTimeout>; ghost: HTMLElement | null; tiles: Set<number>; stock: number;
}
let seedGesture: SeedGesture | null = null;
let suppressSeedClickUntil = 0;
let seedAutoFrame = 0;
function cancelSeedGesture() {
  const gesture = seedGesture; seedGesture = null;
  cancelAnimationFrame(seedAutoFrame);
  if (!gesture) return;
  clearTimeout(gesture.timer); gesture.ghost?.remove();
  document.body.classList.remove('is-seed-dragging');
  document.querySelectorAll('.plant-preview').forEach(el => el.classList.remove('plant-preview'));
  if (gesture.dragging || gesture.moved) suppressSeedClickUntil = performance.now() + 450;
  try { if (root.hasPointerCapture(gesture.pointer)) root.releasePointerCapture(gesture.pointer); } catch { /* Pointer may have been cancelled by the OS. */ }
}
function previewSeedPath(x: number, y: number) {
  const gesture = seedGesture; if (!gesture?.dragging || !v.save) return;
  const steps = Math.max(1, Math.ceil(Math.hypot(x - gesture.lastX, y - gesture.lastY) / 6));
  for (let step = 1; step <= steps && gesture.tiles.size < gesture.stock; step++) {
    const hit: HTMLElement | null | undefined = document.elementFromPoint(gesture.lastX + (x - gesture.lastX) * step / steps, gesture.lastY + (y - gesture.lastY) * step / steps)?.closest<HTMLElement>('.field .tile');
    if (!hit) continue;
    const index = Number(hit.dataset.value);
    if (v.save.farm.tiles[index]?.state !== 'tilled' || gesture.tiles.has(index)) continue;
    gesture.tiles.add(index); hit.classList.add('plant-preview');
  }
  gesture.lastX = x; gesture.lastY = y;
  if (gesture.ghost) {
    gesture.ghost.style.left = `${x}px`; gesture.ghost.style.top = `${y}px`;
    gesture.ghost.querySelector('span')!.textContent = `播种 ${gesture.tiles.size} 块 / 库存 ${gesture.stock}`;
  }
}
function autoScrollSeeds() {
  const gesture = seedGesture; if (!gesture?.dragging) return;
  const delta = gesture.y < 70 ? -10 : gesture.y > window.innerHeight - 70 ? 10 : 0;
  if (delta) { window.scrollBy(0, delta); previewSeedPath(gesture.x, gesture.y); }
  seedAutoFrame = requestAnimationFrame(autoScrollSeeds);
}
function startSeedDragging(gesture: SeedGesture) {
  const crop = gesture.crop;
    if (seedGesture !== gesture || v.modal) return;
    gesture.dragging = true; v.selectedSeed = crop;
    root.setPointerCapture(gesture.pointer); document.body.classList.add('is-seed-dragging');
    document.querySelectorAll<HTMLElement>('.seed-card').forEach(el => { const active = el.dataset.value === crop; el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active)); });
    gesture.ghost = document.createElement('div'); gesture.ghost.className = 'seed-drag-ghost'; gesture.ghost.innerHTML = `${icon(game.catalog.crops[crop].seedIcon, 40)}<span></span>`;
    document.body.append(gesture.ghost); platform.vibrate(); previewSeedPath(gesture.x, gesture.y); autoScrollSeeds();
}
root.addEventListener('pointerdown', e => {
  const card = (e.target as Element).closest<HTMLButtonElement>('.seed-card');
  if (!card || card.disabled || e.button !== 0 || !e.isPrimary || v.modal || !v.save) return;
  if (saveBlocked) { toast('当前存档需要重新载入，暂不能播种', false); return; }
  cancelSeedGesture();
  const crop = card.dataset.value as CropId; const rail = card.closest<HTMLElement>('.seed-rail')!;
  const gesture: SeedGesture = { pointer: e.pointerId, crop, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, rail, scrollLeft: rail.scrollLeft, moved: false, dragging: false, timer: 0 as unknown as ReturnType<typeof setTimeout>, ghost: null, tiles: new Set(), stock: game.amount(v.save, game.catalog.crops[crop].seed) };
  gesture.timer = setTimeout(() => { if (!gesture.moved) startSeedDragging(gesture); }, 350);
  seedGesture = gesture;
});
window.addEventListener('pointermove', e => {
  const gesture = seedGesture; if (!gesture || gesture.pointer !== e.pointerId) return;
  gesture.x = e.clientX; gesture.y = e.clientY;
  if (!gesture.dragging) {
    const dx = e.clientX - gesture.startX; const dy = e.clientY - gesture.startY;
    // A selected seed can be dragged vertically straight away with a mouse.
    // Horizontal movement remains a list scroll; touch uses the long press.
    if (e.pointerType === 'mouse' && v.selectedSeed === gesture.crop && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
      clearTimeout(gesture.timer); startSeedDragging(gesture);
    } else {
      if (Math.hypot(dx, dy) > 8) { gesture.moved = true; clearTimeout(gesture.timer); }
      if (gesture.moved && e.pointerType === 'mouse') { gesture.rail.scrollLeft = gesture.scrollLeft - dx; e.preventDefault(); }
      return;
    }
  }
  e.preventDefault(); previewSeedPath(e.clientX, e.clientY);
}, { passive: false });
window.addEventListener('pointerup', e => {
  const gesture = seedGesture; if (!gesture || gesture.pointer !== e.pointerId) return;
  if (gesture.dragging) previewSeedPath(e.clientX, e.clientY);
  const wasDragging = gesture.dragging; const indices = [...gesture.tiles]; const crop = gesture.crop;
  cancelSeedGesture();
  if (!wasDragging) return;
  e.preventDefault();
  if (indices.length) transact(s => game.plantBatch(s, indices, crop, platform.now()));
  else { render(); toast('拖过上方已开垦的空地，再松手播种'); }
});
window.addEventListener('pointercancel', e => { if (seedGesture?.pointer === e.pointerId) { const dragging = seedGesture.dragging; cancelSeedGesture(); if (dragging) render(); } });
root.addEventListener('contextmenu', e => { if (seedGesture?.dragging || (e.target as Element).closest('.seed-card')) e.preventDefault(); });

root.addEventListener('submit', e => {
  e.preventDefault(); const form = e.target as HTMLFormElement; const name = String(new FormData(form).get('farmName') || '').trim();
  if (form.id === 'create-form') newFarm(name);
  if (form.id === 'rename-form' && name) transact(s => { s.farmName = name.slice(0, 16); return game.result(true, '农场名称已保存'); });
});
root.addEventListener('click', e => {
  if (performance.now() < suppressSeedClickUntil) { e.preventDefault(); return; }
  const target = e.target as HTMLElement; const el = target.closest<HTMLElement>('[data-action]');
  if (!el) { if (v.modal === 'fishing' && target.closest('.modal-body')) hitFishing(); return; }
  if (el instanceof HTMLButtonElement && el.disabled) return;
  const action = el.dataset.action; const value = el.dataset.value || ''; const now = platform.now();
  if (v.modal === 'fishing' && action === 'backdrop' && target.closest('.modal-body')) { hitFishing(); return; }
  if (action !== 'backdrop') platform.audio.play('click');
  switch (action) {
    case 'welcome-sound': {
      v.welcomeSound = v.welcomeSound === false;
      platform.audio.setEnabled(v.welcomeSound, 0.5);
      el.innerHTML = `${icon(v.welcomeSound ? 'sound' : 'mute')}${v.welcomeSound ? '关闭音乐' : '开启音乐'}`;
      break;
    }
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
    case 'select-seed': v.selectedSeed = v.selectedSeed === value ? null : value as CropId; render(); break;
    case 'tile': {
      v.tile = Number(value); const t = v.save?.farm.tiles[v.tile];
      if (t?.state === 'planted' && t.readyAt! <= now) transact(s => game.harvest(s, v.tile, now));
      else if (t?.state === 'tilled') { if (v.selectedSeed) transact(s => game.plant(s, v.tile, v.selectedSeed!, now)); else { render(); toast('先在下方种子篮选择一种种子'); } }
      else if (t?.state === 'wild') transact(s => game.till(s, v.tile));
      else if (t?.state === 'planted' && !t.watered) transact(s => game.water(s, v.tile, now));
      else render();
      showCropCountdown(); break;
    }
    case 'move-tile': moveTile(Number(value)); break;
    case 'till': transact(s => game.till(s, v.tile)); break;
    case 'plant': transact(s => game.plant(s, v.tile, value as CropId, now), true); break;
    case 'water': transact(s => game.water(s, v.tile, now)); break;
    case 'water-all': transact(s => game.water(s, 'all', now)); break;
    case 'harvest': transact(s => game.harvest(s, v.tile, now)); break;
    case 'collect-migrated': transact(s => game.collectMigratedCrops(s, now)); break;
    case 'harvest-all': transact(s => game.harvest(s, 'all', now)); break;
    case 'animal': v.animal = Number(value); render(); break;
    case 'feed-animal': transact(s => game.feedAnimal(s, Number(value), now)); break;
    case 'pet': transact(s => game.petAnimal(s, Number(value), now)); break;
    case 'collect-animal': e.stopPropagation(); transact(s => game.collectAnimals(s, now, Number(value))); break;
    case 'collect-animals': transact(s => game.collectAnimals(s, now)); break;
    case 'feed-fish': transact(s => game.feedFish(s, now)); break;
    case 'net': transact(s => game.netFish(s, now)); break;
    case 'stock-fish-all': transact(s => game.stockFish(s, value as FishType, true)); break;
    case 'stock-fish': transact(s => game.stockFish(s, value as FishType)); break;
    case 'upgrade': transact(s => game.upgradePond(s), true); break;
    case 'quest-tab': v.questTab = value as 'active' | 'completed'; refreshModal(); document.querySelector<HTMLElement>(`#quest-tab-${v.questTab}`)?.focus({ preventScroll: true }); break;
    case 'quest': transact(s => game.questAction(s, value, now)); break;
    case 'exchange': transact(s => game.exchange(s, value)); break;
    case 'bag-filter': v.bagFilter = value; v.item = null; refreshModal(); break;
    case 'item': v.item = value; refreshModal(); break;
    case 'sell-one': transact(s => game.sell(s, value, 1)); break;
    case 'sell-all': transact(s => game.sell(s, value, s.inventory[value] || 0)); break;
    case 'use-item': if (value.endsWith('Seed')) { v.scene = 'farm'; v.modal = null; v.tile = v.save!.farm.tiles.findIndex(t => t.state === 'tilled'); if (v.tile < 0) v.tile = 0; v.selectedSeed = Object.entries(game.catalog.crops).find(([, crop]) => crop.seed === value)?.[0] as CropId || null; render(); toast('已选中种子，点击空地或长按种子拖过农田播种'); } else { v.scene = 'pond'; openModal('stock'); } break;
    case 'shop': v.shopCategory = value; v.shopMode = 'buy'; v.buyId = shopItems(value)[0].id; v.qty = 1; openModal('shop'); break;
    case 'shop-category': v.shopCategory = value; v.buyId = shopItems(value)[0].id; v.qty = 1; refreshModal(); break;
    case 'shop-mode': v.shopMode = value; refreshModal(); break;
    case 'buy-select': v.buyId = value; v.qty = 1; refreshModal(); break;
    case 'qty': v.qty = Math.max(1, Math.min(game.maxPurchase(v.save!, v.buyId), v.qty + Number(value))); refreshModal(); break;
    case 'qty-max': v.qty = Math.max(1, game.maxPurchase(v.save!, v.buyId)); refreshModal(); break;
    case 'buy': transact(s => game.buy(s, value, v.qty, now)); break;
    case 'claim-offline': transact(s => game.claimOffline(s), true); break;
    case 'fishing-hit': hitFishing(); break;
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && seedGesture) { cancelSeedGesture(); render(); return; }
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
  if (document.hidden) { cancelSeedGesture(); hidden = true; platform.audio.setEnabled(false, 0.5); if (v.modal === 'fishing') v.modal = null; cancelAnimationFrame(animation); try { persist(); } catch (e) { toast((e as Error).message, false); } }
  else if (hidden) { hidden = false; resume(); platform.audio.setEnabled(v.save ? v.save.settings.sound : v.welcomeSound !== false, v.save?.settings.volume ?? 0.5); lastTick = platform.now(); }
});
window.addEventListener('pagehide', () => { if (!hidden) try { persist(); } catch { /* Save error is already reported during active play. */ } });
window.addEventListener('storage', e => { if ((e.key === STORAGE_KEY || e.key === null) && v.save) { saveBlocked = true; v.saveError = '另一标签页更新或清除了存档，请重新载入后继续'; toast('另一标签页更新了存档，请重新载入再继续，避免覆盖', false); openModal('settings'); } });
setInterval(() => {
  if (document.hidden) return;
  if (seedGesture?.dragging) return;
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
  if ([...v.save.farm.tiles, ...v.save.farm.pendingCrops].some(t => t.readyAt !== undefined && t.readyAt > previousTick && t.readyAt <= now) || v.save.ranch.animals.some(a => a.readyAt !== null && a.readyAt > previousTick && a.readyAt <= now) || v.save.pond.fishes.some(f => f.readyAt !== null && f.readyAt > previousTick && f.readyAt <= now)) matured = true;
  if (matured && (!v.modal || v.modal === 'quests')) render();
  if (now - lastSave >= game.catalog.timing.autosave && !saveBlocked) try { persist(); } catch (e) { toast((e as Error).message, false); }
}, 1000);
// Retry welcome music inside a user gesture when autoplay is blocked.
function unlockWelcomeMusic() {
  if (!v.save && !document.hidden && v.welcomeSound !== false) platform.audio.setEnabled(true, 0.5);
}
root.addEventListener('pointerup', unlockWelcomeMusic);
root.addEventListener('keydown', unlockWelcomeMusic);
refreshSaves(); render();
// The service worker caches only this app's local static files; no analytics or remote calls.
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* Offline install is optional. */ }); });
window.addEventListener('resize', fitModalToViewport, { passive: true });
window.addEventListener('scroll', fitModalToViewport, { passive: true });
window.visualViewport?.addEventListener('resize', fitModalToViewport, { passive: true });
window.visualViewport?.addEventListener('scroll', fitModalToViewport, { passive: true });

window.addEventListener('blur', () => { if (seedGesture) { const dragging = seedGesture.dragging; cancelSeedGesture(); if (dragging) render(); } });
