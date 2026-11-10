import type content from '../data/catalog.json';
export type Scene = 'map' | 'farm' | 'ranch' | 'pond' | 'town' | 'mystery';
export type CropId = keyof typeof content.crops;
export type AnimalType = keyof typeof content.animals;
export type FishType = keyof typeof content.fish;
export type Skill = 'till' | 'water' | 'harvest';
export type Quality = 'normal' | 'silver' | 'gold';
export interface Tile { state: 'wild' | 'tilled' | 'planted'; crop?: CropId; readyAt?: number; watered?: boolean }
export interface Animal { id: number; type: AnimalType; affection: number; readyAt: number | null; lastPet: number }
export interface Fish { id: number; type: FishType; readyAt: number | null }
export interface FishingCatch { species: FishType; weightJin: number; caughtAt: number }
export interface FishingJournal { totalCaught: number; species: Partial<Record<FishType, { count: number; bestWeightJin: number }>>; recent: FishingCatch[] }
export interface Quest { id: string; template: string; acceptedAt: number | null; expiresAt: number | null }
export interface CompletedQuest { id: string; template: string; acceptedAt: number; completedAt: number; gold: number; medals: number; exp: number }
export interface SaveData {
  version: 1; id: string; farmName: string;
  meta: { createdAt: number; lastOnlineTime: number; lastSaveTime: number; questDay: string; nextId: number };
  player: { gold: number; medals: number; exp: number; tools: string[]; skin: string; skins: string[]; skills: Record<Skill, number> };
  farm: { tiles: Tile[]; pendingCrops: Tile[] };
  ranch: { animals: Animal[] };
  pond: { capacity: number; fishes: Fish[]; lastFishing: number };
  inventory: Record<string, number>;
  quests: Quest[];
  completedQuests: CompletedQuest[];
  fishingJournal: FishingJournal;
  offline: Record<string, number>;
  settings: { sound: boolean; volume: number };
}
export interface OfflineReport { elapsed: number; credited: number; capped: boolean; clockBack: boolean; items: Record<string, number> }
export interface Result { ok: boolean; message: string }
export interface StorageAdapter { read(key: string): string | null; write(key: string, value: string): void; remove(key: string): void }
export type MusicScene = Scene | 'welcome' | 'shop';
export interface AudioAdapter { setMusic(scene: MusicScene): void; play(kind: 'click' | 'harvest' | 'level'): void; setEnabled(enabled: boolean, volume: number): void }
export interface PlatformAdapter { storage: StorageAdapter; audio: AudioAdapter; now(): number; createId(): string; dayKey(timestamp: number): string; vibrate(): void; exportFile(name: string, content: string): void; readFile(): Promise<string | null> }
