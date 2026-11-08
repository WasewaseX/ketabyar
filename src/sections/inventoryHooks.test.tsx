// @vitest-environment jsdom
/**
 * REGRESSION TEST for the v1.2.6 audit finding: InventoryPage defined its
 * columnDelete / copyDelete / shelfCreate useMutation hooks AFTER the main
 * `return` of the component (dead code). The buttons rendered fine, but
 * clicking "delete bookcase", "add shelf" or "archive copy" dereferenced a
 * binding that was never initialized (temporal dead zone) and threw a
 * ReferenceError - the click did nothing, the mutation never ran.
 *
 * Fix: the three hooks moved above every early return, so they initialize
 * on every render. These tests drive the real buttons and require the
 * mutation functions from the repository dispatcher to actually fire.
 */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── jsdom stubs for the UI stack (radix, lucide) ──
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
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
}

vi.mock("../data/repositories/library", () => ({
  activeBackend: "ts",
  createColumn: vi.fn(async () => ({})),
  createRoom: vi.fn(async () => ({})),
  createShelf: vi.fn(async () => ({})),
  deleteColumn: vi.fn(async () => ({})),
  deleteCopy: vi.fn(async () => ({})),
  deleteRoom: vi.fn(async () => ({})),
  copies: vi.fn(async () => []),
  getColumns: vi.fn(async () => []),
  getRooms: vi.fn(async () => []),
  getShelves: vi.fn(async () => []),
  renameRoom: vi.fn(async () => ({})),
  updateCopy: vi.fn(async () => ({})),
  updateShelf: vi.fn(async () => ({})),
}));

import "../i18n";
import {
  createShelf,
  deleteColumn,
  getColumns,
  getRooms,
  getShelves,
  copies as fetchCopies,
} from "../data/repositories/library";
import { ContextMenuProvider } from "../components/ui/ContextMenu";
import { InventoryPage } from "./Inventory";

const ROOM = { id: "room-1", name: "سالن اصلی", notes: null };
const COLUMN = { id: "column-1", room_id: "room-1", number: 1 };

const renderInventory = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ContextMenuProvider>
        <MemoryRouter>
          <InventoryPage />
        </MemoryRouter>
      </ContextMenuProvider>
    </QueryClientProvider>,
  );
};

describe("inventory circulation buttons (hooks-after-return regression)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getRooms).mockResolvedValue([ROOM] as never);
    vi.mocked(getColumns).mockResolvedValue([COLUMN] as never);
    vi.mocked(getShelves).mockResolvedValue([] as never);
    vi.mocked(fetchCopies).mockResolvedValue([] as never);
    vi.mocked(deleteColumn).mockReset().mockResolvedValue({} as never);
    vi.mocked(createShelf).mockReset().mockResolvedValue({} as never);
    window.confirm = () => true;
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("the delete-bookcase button reaches the deleteColumn mutation", async () => {
    renderInventory();
    // The delete control is the icon button with an explicit aria-label.
    const del = await screen.findByRole("button", {
      name: /حذف کتاب‌چین/,
    });
    fireEvent.click(del);
    await waitFor(() => {
      expect(deleteColumn).toHaveBeenCalled();
    });
    // tanstack passes (variables, context); the variables are the column id.
    expect(vi.mocked(deleteColumn).mock.calls[0][0]).toBe("column-1");
  });

  it("the add-shelf button reaches the createShelf mutation", async () => {
    renderInventory();
    // With zero shelves every lettered slot renders an add-shelf button.
    const add = await screen.findByRole("button", {
      name: /افزودن قفسهٔ A/,
    });
    fireEvent.click(add);
    await waitFor(() => {
      expect(createShelf).toHaveBeenCalled();
    });
    // The mutationFn spreads positional args: createShelf(columnId, code, type).
    expect(vi.mocked(createShelf).mock.calls[0].slice(0, 3)).toEqual([
      "column-1",
      "A",
      "top",
    ]);
  });
});
