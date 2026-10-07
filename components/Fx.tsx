"use client";
// Sounds and confetti. Both are tiny and dependency-free; both respect
// reduced-motion and the sound toggle.
import { useRef, useSyncExternalStore } from "react";

let audio: AudioContext | null = null;
function tone(freq: number, at: number, dur: number, type: OscillatorType = "triangle") {
  try {
    audio = audio ?? new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + at;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch { /* no audio */ }
}
export const sounds = {
  ding: () => { tone(784, 0, .18); tone(1175, .09, .28); },
  fanfare: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .11, .4, "square")),
  boop: () => tone(330, 0, .15, "sine"),
  jackpot: () => [392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, i * .08, .5, "triangle")),
};

/* ---------- sound preference, persisted per device ---------- */
const SOUND_KEY = "upandout.sound";
const listeners = new Set<() => void>();
function readSound(): boolean {
  try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; }
}
export function setSoundPref(on: boolean) {
  try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
export function useSoundPref(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); addEventListener("storage", cb); return () => { listeners.delete(cb); removeEventListener("storage", cb); }; },
    readSound,
    () => true,
  );
}

/* ---------- confetti ---------- */
type Bit = { x: number; y: number; vx: number; vy: number; r: number; c: string; a: number; life: number };
const bits: Bit[] = [];
let raf = 0;
let canvasEl: HTMLCanvasElement | null = null;

function step() {
  const cv = canvasEl, cx = cv?.getContext("2d");
  if (!cv || !cx) { raf = 0; return; }
  const s = devicePixelRatio;
  cx.clearRect(0, 0, cv.width, cv.height);
  for (const b of bits) {
    b.vy += .45; b.x += b.vx; b.y += b.vy; b.a += .2; b.life++;
    cx.save(); cx.translate(b.x * s, b.y * s); cx.rotate(b.a); cx.fillStyle = b.c;
    cx.fillRect(-b.r * s / 2, -b.r * s / 4, b.r * s, b.r * s / 2); cx.restore();
  }
  for (let i = bits.length - 1; i >= 0; i--) if (bits[i].y > innerHeight + 40 || bits[i].life >= 200) bits.splice(i, 1);
  if (bits.length) raf = requestAnimationFrame(step);
  else { cx.clearRect(0, 0, cv.width, cv.height); raf = 0; }
}

export function burstAt(cv: HTMLCanvasElement | null, x: number, y: number, colours: string[], count = 90) {
  if (!cv || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  canvasEl = cv;
  cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
  for (let i = 0; i < count; i++) {
    bits.push({ x, y, vx: (Math.random() - .5) * 14, vy: -Math.random() * 15 - 4, r: Math.random() * 6 + 4, c: colours[i % colours.length], a: Math.random() * 6, life: 0 });
  }
  if (!raf) raf = requestAnimationFrame(step);
}

export function useConfettiCanvas() {
  return useRef<HTMLCanvasElement>(null);
}
