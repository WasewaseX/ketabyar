import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const rpc = vi.fn();
const listed = [{ id: "r1", status: "ready" }];

vi.mock("../supabaseClient", () => ({
  supabase: {
    rpc: (name: string) => {
      calls.push(`rpc:${name}`);
      return rpc(name);
    },
    from: (table: string) => ({
      select: () => ({
        order: async () => {
          calls.push(`select:${table}`);
          return { data: listed, error: null };
        },
      }),
    }),
  },
  unwrap: <T,>({ data, error }: { data: T | null; error: { message: string } | null }) => {
    if (error) throw new Error(error.message);
    return data as T;
  },
}));

const { reservations } = await import("./library");

describe("reservations()", () => {
  beforeEach(() => {
    calls.length = 0;
    rpc.mockReset();
  });

  it("sweeps expired holds before reading the list", async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    await expect(reservations()).resolves.toEqual(listed);
    expect(calls).toEqual(["rpc:sweep_reservations", "select:reservation_details"]);
  });

  it("still lists reservations when the database has no sweep function yet", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function sweep_reservations() does not exist" } });
    await expect(reservations()).resolves.toEqual(listed);
  });
});
