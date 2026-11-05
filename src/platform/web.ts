import type { AudioAdapter, PlatformAdapter, StorageAdapter } from '../game/types';
import audioData from '../data/audio.json';
class WebStorage implements StorageAdapter {
  read(key: string) { return localStorage.getItem(key); }
  write(key: string, value: string) { localStorage.setItem(key, value); }
  remove(key: string) { localStorage.removeItem(key); }
}
class WebAudio implements AudioAdapter {
  private enabled = false;
  private volume = 0.5;
  private context: AudioContext | null = null;
  private musicTimer: ReturnType<typeof setTimeout> | null = null;
  private musicNotes = new Set<OscillatorNode>();
  setEnabled(enabled: boolean, volume: number) {
    this.enabled = enabled; this.volume = volume;
    if (!enabled) {
      if (this.musicTimer) clearTimeout(this.musicTimer); this.musicTimer = null;
      this.musicNotes.forEach(note => { try { note.stop(); } catch { /* Already ended. */ } }); this.musicNotes.clear();
    } else if (!this.musicTimer) {
      try { this.context ??= new AudioContext(); void this.context.resume(); this.scheduleMusic(); } catch { /* Audio can be unavailable on embedded browsers. */ }
    }
  }
  private scheduleMusic() {
    if (!this.enabled || !this.context) return;
    const context = this.context; const start = context.currentTime;
    audioData.melody.forEach((frequency, index) => {
      if (!frequency) return;
      const note = context.createOscillator(); const gain = context.createGain(); const t = start + index * audioData.stepSeconds;
      note.type = 'triangle'; note.frequency.value = frequency; gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(this.volume * audioData.musicGain, t + 0.015); gain.gain.exponentialRampToValueAtTime(0.0001, t + audioData.noteSeconds);
      note.connect(gain); gain.connect(context.destination); this.musicNotes.add(note); note.onended = () => { this.musicNotes.delete(note); note.disconnect(); gain.disconnect(); };
      note.start(t); note.stop(t + audioData.noteSeconds + 0.01);
    });
    this.musicTimer = setTimeout(() => { this.musicTimer = null; this.scheduleMusic(); }, audioData.loopSeconds * 1000);
  }
  play(kind: 'click' | 'harvest' | 'level') {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume();
      const osc = this.context.createOscillator(); const gain = this.context.createGain(); const t = this.context.currentTime;
      osc.type = 'triangle'; osc.frequency.setValueAtTime(kind === 'harvest' ? 660 : kind === 'level' ? 880 : 440, t);
      osc.frequency.exponentialRampToValueAtTime(kind === 'harvest' ? 1046 : 660, t + 0.1);
      gain.gain.setValueAtTime(this.volume * audioData.effectsGain, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain); gain.connect(this.context.destination); osc.start(); osc.stop(t + 0.2);
    } catch { /* Sound is optional; browser policy must not block play. */ }
  }
}
export const webPlatform: PlatformAdapter = {
  storage: new WebStorage(), audio: new WebAudio(), now: () => Date.now(),
  // getRandomValues works on plain HTTP LAN origins, unlike randomUUID (secure-context only).
  createId: () => [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join(''),
  dayKey: n => { const d = new Date(n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
  vibrate: () => navigator.vibrate?.(25),
  exportFile(name, content) { const url = URL.createObjectURL(new Blob([content], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); },
  readFile: () => new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.oncancel = () => resolve(null);
    input.onchange = () => { const f = input.files?.[0]; if (!f) return resolve(null); if (f.size > 2_000_000) return reject(new Error('存档文件应小于 2MB')); f.text().then(resolve, reject); };
    input.click();
  })
};
