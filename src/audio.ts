// KNOT — Client-side audio manager.
// Respects browser autoplay policy: music only starts after a user gesture.
// SFX and music are independent volume controls stored in sessionStorage.

export type AudioKind = "music" | "sfx";

const STORAGE_PREFIX = "knot_audio_";
const DEFAULT_MUSIC = 0.5;
const DEFAULT_SFX = 0.7;

let initialized = false;
let musicEnabled = true;
let sfxEnabled = true;
let musicVolume = DEFAULT_MUSIC;
let sfxVolume = DEFAULT_SFX;
let musicAudio: HTMLAudioElement | null = null;
let musicSrc: string | null = null;
let musicLoop = false;

function loadPersisted() {
  try {
    const m = sessionStorage.getItem(`${STORAGE_PREFIX}music`);
    const s = sessionStorage.getItem(`${STORAGE_PREFIX}sfx`);
    const mv = sessionStorage.getItem(`${STORAGE_PREFIX}music_vol`);
    const sv = sessionStorage.getItem(`${STORAGE_PREFIX}sfx_vol`);
    if (m !== null) musicEnabled = m === "1";
    if (s !== null) sfxEnabled = s === "1";
    if (mv !== null) musicVolume = clamp(parseFloat(mv));
    if (sv !== null) sfxVolume = clamp(parseFloat(sv));
  } catch {
    // ignore storage errors
  }
}

function persist() {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}music`, musicEnabled ? "1" : "0");
    sessionStorage.setItem(`${STORAGE_PREFIX}sfx`, sfxEnabled ? "1" : "0");
    sessionStorage.setItem(`${STORAGE_PREFIX}music_vol`, String(musicVolume));
    sessionStorage.setItem(`${STORAGE_PREFIX}sfx_vol`, String(sfxVolume));
  } catch {
    // ignore
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function ensureMusic(path: string, loop = true) {
  if (!musicAudio) {
    musicAudio = new Audio();
    musicAudio.loop = loop;
    musicAudio.preload = "auto";
  }
  if (musicSrc !== path) {
    musicSrc = path;
    musicAudio.src = path;
  }
  musicAudio.loop = loop;
  musicAudio.volume = musicEnabled ? musicVolume : 0;
  return musicAudio;
}

export function initAudio() {
  if (initialized) return;
  initialized = true;
  loadPersisted();
}

export function setMusicEnabled(on: boolean) {
  musicEnabled = on;
  if (musicAudio) musicAudio.volume = on ? musicVolume : 0;
  if (on && musicSrc) playMusic(musicSrc, musicLoop);
  else if (!on && musicAudio) musicAudio.pause();
  persist();
}

export function setSfxEnabled(on: boolean) {
  sfxEnabled = on;
  persist();
}

export function setMusicVolume(v: number) {
  musicVolume = clamp(v);
  if (musicAudio) musicAudio.volume = musicEnabled ? musicVolume : 0;
  persist();
}

export function setSfxVolume(v: number) {
  sfxVolume = clamp(v);
  persist();
}

export function getMusicEnabled() { return musicEnabled; }
export function getSfxEnabled() { return sfxEnabled; }
export function getMusicVolume() { return musicVolume; }
export function getSfxVolume() { return sfxVolume; }

/**
 * Play background music. Requires a prior user gesture (call from a button
 * click handler) due to browser autoplay policy. Returns a promise that
 * resolves when playback starts or is blocked by autoplay policy.
 */
export async function playMusic(path: string, loop = true): Promise<void> {
  musicLoop = loop;
  const audio = ensureMusic(path, loop);
  try {
    await audio.play();
  } catch {
    // Autoplay blocked: music will start on the next user gesture.
  }
}

export function stopMusic() {
  if (musicAudio) {
    musicAudio.pause();
    musicAudio.currentTime = 0;
    musicSrc = null;
  }
}

export function playSfx(path: string) {
  if (!sfxEnabled) return;
  try {
    const audio = new Audio(path);
    audio.volume = sfxVolume;
    audio.play().catch(() => {
      // Autoplay/playback blocked for this SFX; non-fatal.
    });
  } catch {
    // ignore
  }
}

export function destroyAudio() {
  stopMusic();
  musicAudio = null;
  musicSrc = null;
}
