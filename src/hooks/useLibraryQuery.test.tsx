// @vitest-environment jsdom
/**
 * REGRESSION TEST for the v1.2.4 audit finding: sections checked `isLoading`
 * only, so a FAILED query rendered a confidently empty library with zero
 * feedback — the same "nothing loads" experience class as the v1.2.2 login
 * deadlock. `useLibraryQuery` is the single choke point; these tests pin
 * its contract: failure → visible toast, success → silence.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import { toast } from "sonner";
import { useQuery } from "./useLibraryQuery";

function Probe({ fail, label }: { fail: boolean; label: string }) {
  const query = useQuery({
    queryKey: ["probe", label],
    queryFn: async () => {
      if (fail) throw new Error("engine exploded");
      return "ok";
    },
    retry: false,
    staleTime: Infinity,
  });
  return <div>{query.isError ? "ERRED" : query.isLoading ? "LOADING" : `DATA:${String(query.data)}`}</div>;
}

function renderProbe(fail: boolean, label: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Probe fail={fail} label={label} />
    </QueryClientProvider>,
  );
}

describe("useLibraryQuery — failed queries must never be silent", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("a failed query surfaces its error message as a toast", async () => {
    renderProbe(true, "fail-case");
    await waitFor(() => expect(screen.getByText("ERRED")).toBeInTheDocument(), { timeout: 4000 });
    expect(toast.error).toHaveBeenCalledWith("engine exploded");
  }, 8000);

  it("a successful query stays silent", async () => {
    renderProbe(false, "ok-case");
    await waitFor(() => expect(screen.getByText("DATA:ok")).toBeInTheDocument(), { timeout: 4000 });
    expect(toast.error).not.toHaveBeenCalled();
  }, 8000);

  it("non-Error rejections still produce a toast", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function StringProbe() {
      useQuery({ queryKey: ["probe", "string-reject"], queryFn: async () => Promise.reject("boom-string"), retry: false });
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <StringProbe />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalled(), { timeout: 4000 });
    expect(vi.mocked(toast.error).mock.calls[0][0]).toContain("boom-string");
    cleanup();
  }, 8000);
});
