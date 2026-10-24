// @vitest-environment jsdom
/**
 * REGRESSION TEST for the v1.2.2 login deadlock (reported since 1.1.1 as
 * "nothing happens after typing the pin").
 *
 * Root cause: `Boot` in App.tsx read `useAuthStore.getState().user` in its
 * render body — a NON-reactive read. Boot rendered LoginPage once and never
 * re-rendered when `setUser()` fired after a successful login, so the app
 * stayed on the login screen forever: session saved, PIN accepted, zero
 * navigation, on every release since the gate was introduced.
 *
 * These tests mount the REAL App (Providers + Boot + gate + LoginPage) and
 * drive the exact user path: wait for boot, type 6-7-6-7 on the keyboard,
 * and require the app to leave the login screen. The data layer is mocked
 * at the dispatcher boundary (auth + repositories + database) so the test
 * covers the gate, not the engine.
 */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── jsdom stubs for the UI stack (sonner Toaster, radix, accents) ──
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
if (!(globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// ── Auth dispatcher mock (App.tsx + Login.tsx both import "../data/auth") ──
vi.mock("../data/auth", () => ({
  activeAuthBackend: "ts",
  ...Object.fromEntries([
    "getLoginAccounts", "hasPin", "setPin", "checkPin", "logout",
    "changeOwnPassword", "listUsers", "createUser", "updateUser",
    "resetPassword", "deleteUser", "applicationDiagnostics",
  ].map((n) => [n, vi.fn()])),
  bootstrapAdminIfNeeded: vi.fn(async () => false),
  currentSession: vi.fn(async () => null),
  login: vi.fn(),
}));

// ── Repository dispatcher mock (settings store, Onboarding, sections) ──
vi.mock("../data/repositories/library", () => ({
  activeBackend: "ts",
  ...Object.fromEntries([
    "dashboard", "books", "saveBook", "updateBook", "deleteBook", "getCopiesForBook",
    "addCopy", "updateCopy", "deleteCopy", "copies", "members", "saveMember",
    "updateMember", "deleteMember", "hardDeleteMember", "banMember", "unbanMember",
    "loans", "getLoansForMember", "getReservationsForMember", "checkout", "returnCopies",
    "renewLoan", "updateLoanDueDate", "sweepReservations", "reservations", "addReservation",
    "acceptReservation", "declineReservation", "fulfilReservation", "extendReservation",
    "updateReservation", "cancelReservation", "deleteReservation", "fines", "payFine",
    "waiveFine", "getRooms", "createRoom", "renameRoom", "deleteRoom", "getColumns",
    "createColumn", "deleteColumn", "getShelves", "createShelf", "updateShelf",
    "notifications", "markNotificationRead", "markAllNotificationsRead", "auditLog",
    "exportLibraryBackup", "importLibraryBackup", "deleteAllLibraryData", "reportBreakdowns",
    "clearCirculation",
  ].map((n) => [n, vi.fn()])),
  getLibrarySettings: vi.fn(async () => ({ id: 1, library_name: "کتابخانه مرکزی دانشگاه" })),
  saveLibrarySettings: vi.fn(async () => {}),
}));

// ── Database bootstrap + Tauri invoke ──
vi.mock("../data/database", () => ({
  initializeDatabase: vi.fn(async () => {}),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({})),
}));

import { bootstrapAdminIfNeeded, currentSession, login } from "../data/auth";
import { getLibrarySettings } from "../data/repositories/library";
import { App } from "./App";
import { useAuthStore } from "../store/authStore";

const OPERATOR = {
  id: "local-ketabdar",
  username: "ketabdar",
  full_name: "کتابدار",
  email: null,
  role: "admin" as const,
  status: "active" as const,
  avatar_path: null,
  must_change_password: false,
  created_at: new Date().toISOString(),
  last_login_at: null,
};

const typePin = (pin: string) => {
  for (const digit of pin) fireEvent.keyDown(window, { key: digit });
};

describe("login gate (v1.2.2 deadlock regression)", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null });
    vi.mocked(bootstrapAdminIfNeeded).mockResolvedValue(false);
    vi.mocked(currentSession).mockResolvedValue(null);
    vi.mocked(getLibrarySettings).mockResolvedValue({ id: 1, library_name: "کتابخانه مرکزی دانشگاه" } as never);
    vi.mocked(login).mockReset();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    useAuthStore.setState({ user: null });
  });

  it("boots to the login screen when no session exists", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "PIN" })).toBeInTheDocument(), { timeout: 6000 });
    expect(login).not.toHaveBeenCalled();
  }, 15000);

  it("types the correct PIN and REACHES THE APP (the deadlock: it used to stay on LoginPage forever)", async () => {
    vi.mocked(login).mockResolvedValueOnce({ ...OPERATOR, last_login_at: new Date().toISOString() });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "PIN" })).toBeInTheDocument(), { timeout: 6000 });

    typePin("6767");

    // The gate must re-render on setUser: Onboarding (first run) appears and
    // the login screen is gone. Before the fix this expectation hung forever.
    await waitFor(
      () => expect(screen.getByDisplayValue(/کتابخانه مرکزی دانشگاه/)).toBeInTheDocument(),
      { timeout: 6000 },
    );
    expect(screen.queryByRole("button", { name: "PIN" })).not.toBeInTheDocument();
    expect(login).toHaveBeenCalledWith("6767");
    expect(useAuthStore.getState().user?.username).toBe("ketabdar");
  }, 15000);

  it("a failed library-settings load must NOT mask a successful login", async () => {
    vi.mocked(login).mockResolvedValueOnce({ ...OPERATOR, last_login_at: new Date().toISOString() });
    vi.mocked(getLibrarySettings).mockRejectedValueOnce(new Error("settings row missing"));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "PIN" })).toBeInTheDocument(), { timeout: 6000 });

    typePin("6767");

    await waitFor(
      () => expect(screen.getByDisplayValue(/کتابخانه مرکزی دانشگاه/)).toBeInTheDocument(),
      { timeout: 6000 },
    );
    expect(screen.queryByRole("button", { name: "PIN" })).not.toBeInTheDocument();
  }, 15000);

  it("a wrong PIN shows the error and stays on the login screen", async () => {
    vi.mocked(login).mockRejectedValueOnce(new Error("پین اشتباه است. دوباره تلاش کنید."));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "PIN" })).toBeInTheDocument(), { timeout: 6000 });

    typePin("1111");

    // Auto-submit fires after the ~550ms idle window, not instantly.
    expect(await screen.findByText("پین اشتباه است. دوباره تلاش کنید.", {}, { timeout: 6000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PIN" })).toBeInTheDocument();
    expect(useAuthStore.getState().user).toBeNull();
  }, 15000);

  it("a 6-digit PIN is submitted ONCE and in FULL (regression: auto-submit used to fire at 4 digits, sending a partial PIN and wiping the field mid-typing)", async () => {
    vi.mocked(login).mockResolvedValueOnce({ ...OPERATOR, last_login_at: new Date().toISOString() });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "PIN" })).toBeInTheDocument(), { timeout: 6000 });

    typePin("123456");

    // Old behaviour: login("1234") immediately on the 4th digit — a partial
    // PIN that can only fail — plus a cleared field while the user was still
    // typing. New behaviour: exactly one attempt with the complete PIN.
    await waitFor(
      () => expect(screen.getByDisplayValue(/کتابخانه مرکزی دانشگاه/)).toBeInTheDocument(),
      { timeout: 6000 },
    );
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith("123456");
  }, 15000);

  it("backspacing below 4 digits cancels the pending auto-submit", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "PIN" })).toBeInTheDocument(), { timeout: 6000 });

    typePin("6767");
    fireEvent.keyDown(window, { key: "Backspace" });

    // Longer than the 550ms idle window: nothing may fire.
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(login).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "PIN" })).toBeInTheDocument();
  }, 15000);
});
