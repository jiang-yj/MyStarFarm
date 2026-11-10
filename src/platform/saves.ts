import { validateSave } from '../game/validation';
import type { SaveData, StorageAdapter } from '../game/types';
export const STORAGE_KEY = 'star-farm:v1';
interface Database { version: 1; active: string | null; saves: { data: SaveData; revision: number }[] }
export class SaveRepository {
  private revisions = new Map<string, number>();
  constructor(private storage: StorageAdapter) {}
  private read(): Database {
    const raw = this.storage.read(STORAGE_KEY); if (!raw) return { version: 1, active: null, saves: [] };
    let db: Database;
    try { db = JSON.parse(raw); } catch { throw new Error('本机存档无法读取。请先导出原始备份，不会覆盖现有数据。'); }
    if (!db || typeof db !== 'object' || db.version !== 1 || !Array.isArray(db.saves) || db.saves.length > 20) throw new Error('存档库版本不支持，请先导出原始备份');
    db.saves.forEach(row => { if (!row || typeof row !== 'object') throw new Error('存档条目损坏，请先导出原始备份'); row.data = validateSave(row.data); if (!Number.isInteger(row.revision) || row.revision < 1) throw new Error('存档版本号无效'); });
    return db;
  }
  private write(db: Database) { try { this.storage.write(STORAGE_KEY, JSON.stringify(db)); } catch { throw new Error('保存失败：浏览器存储不可用或空间不足。请立即导出备份。'); } }
  list() { return this.read().saves.map(r => r.data).sort((a, b) => b.meta.lastSaveTime - a.meta.lastSaveTime); }
  active() { return this.read().active; }
  load(id: string) { const db = this.read(); const row = db.saves.find(r => r.data.id === id); if (!row) throw new Error('找不到这份存档'); this.revisions.set(id, row.revision); return structuredClone(row.data); }
  save(data: SaveData, activate = true) {
    const db = this.read(); const row = db.saves.find(r => r.data.id === data.id);
    if (row) {
      if (this.revisions.get(data.id) !== row.revision) throw new Error('另一标签页已更新此存档，请重新载入后继续');
      row.data = structuredClone(data); row.revision++;
    } else {
      if (db.saves.length >= 20) throw new Error('最多保留 20 份存档，请先导出并删除旧存档');
      db.saves.push({ data: structuredClone(data), revision: 1 });
    }
    if (activate) db.active = data.id;
    this.write(db); this.revisions.set(data.id, row ? row.revision : 1);
  }
  delete(id: string) { const db = this.read(); db.saves = db.saves.filter(r => r.data.id !== id); if (db.active === id) db.active = null; this.write(db); this.revisions.delete(id); }
  rawBackup() { return this.storage.read(STORAGE_KEY) || '{}'; }
}
