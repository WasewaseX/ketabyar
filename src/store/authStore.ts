import { create } from "zustand";
import type { PublicUser } from "../types";

interface AuthState {
  user: PublicUser | null;
  setUser: (user: PublicUser | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));

/** Signed-in operator for audit trails and issued_by / received_by stamps. */
export function currentActor(): string {
  return useAuthStore.getState().user?.username ?? "unknown";
}
