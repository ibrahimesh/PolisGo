import { useSyncExternalStore } from 'react';

// The "Reduce motion" setting. 'system' follows prefers-reduced-motion;
// 'reduce' turns motion off on this device whatever the OS says. It is
// mirrored to <html data-motion="reduce"> so CSS (the motion-reduce variant
// and the global reduced-motion rule) honours it without JS per element.
export type MotionPreference = 'system' | 'reduce';

// Keep in sync with the pre-paint script in index.html.
export const MOTION_STORAGE_KEY = 'polisgo.motion';

const listeners = new Set<() => void>();
let current: MotionPreference = read();

function read(): MotionPreference {
  try {
    return localStorage.getItem(MOTION_STORAGE_KEY) === 'reduce' ? 'reduce' : 'system';
  } catch {
    return 'system';
  }
}

function apply() {
  if (current === 'reduce') document.documentElement.dataset.motion = 'reduce';
  else delete document.documentElement.dataset.motion;
}

apply();

export function getMotionPreference(): MotionPreference {
  return current;
}

export function setMotionPreference(next: MotionPreference) {
  current = next;
  try {
    if (next === 'reduce') localStorage.setItem(MOTION_STORAGE_KEY, next);
    else localStorage.removeItem(MOTION_STORAGE_KEY);
  } catch {
    // Non-fatal: the choice just won't survive a reload.
  }
  apply();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMotionPreference(): MotionPreference {
  return useSyncExternalStore(subscribe, getMotionPreference, () => 'system' as const);
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export function systemPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION).matches;
}

// For code outside React (view transitions, count-ups started imperatively).
export function motionReduced(): boolean {
  return current === 'reduce' || systemPrefersReducedMotion();
}

export function subscribeSystemMotion(callback: () => void) {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
