import { create } from "zustand";

/**
 * Transient tutorial state: which step of the guided tour is showing.
 * The "seen" flag itself lives in uiStore.preferences (persisted, and wiped
 * by a factory reset so the tour comes back on a fresh library).
 */

interface TutorialState {
  open: boolean;
  step: number;
  start: () => void;
  close: () => void;
  next: (total: number) => void;
  back: () => void;
}

export const useTutorialStore = create<TutorialState>((set) => ({
  open: false,
  step: 0,
  start: () => set({ open: true, step: 0 }),
  close: () => set({ open: false }),
  next: (total) => set((s) => ({ step: Math.min(s.step + 1, total - 1) })),
  back: () => set((s) => ({ step: Math.max(s.step - 1, 0) })),
}));
