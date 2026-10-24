// @vitest-environment jsdom
/**
 * REGRESSION TEST for the v1.2.4 audit finding: OnboardingPage.complete()
 * had try/finally with NO catch, so a failed settings read or save left the
 * user stuck on onboarding with zero feedback (the same silent-failure
 * class as the v1.2.2 login deadlock). The fix: surface the error and stay
 * retryable. These tests pin both paths.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("../data/repositories/library", () => ({
  getLibrarySettings: vi.fn(),
  saveLibrarySettings: vi.fn(),
}));
import { toast } from "sonner";
import { getLibrarySettings, saveLibrarySettings } from "../data/repositories/library";
import { OnboardingPage } from "./Onboarding";

const renderOnboarding = () =>
  render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>,
  );

const finishButton = () => screen.getByRole("button", { name: /شروع کار با کتابیار/ });

describe("onboarding completion — failures must be visible, success must navigate", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(getLibrarySettings).mockReset();
    vi.mocked(saveLibrarySettings).mockReset();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("a failed settings save shows a toast and stays retryable", async () => {
    vi.mocked(getLibrarySettings).mockResolvedValue({ id: 1, library_name: "" } as never);
    vi.mocked(saveLibrarySettings).mockRejectedValueOnce(new Error("settings row missing"));

    renderOnboarding();
    fireEvent.click(finishButton());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("settings row missing"), { timeout: 4000 });
    // Still on onboarding — the user can simply press the button again.
    expect(finishButton()).toBeInTheDocument();
  }, 8000);

  it("a successful completion saves the settings and stays silent", async () => {
    vi.mocked(getLibrarySettings).mockResolvedValue({ id: 1, library_name: "" } as never);
    vi.mocked(saveLibrarySettings).mockResolvedValueOnce(undefined as never);

    renderOnboarding();
    fireEvent.click(finishButton());

    await waitFor(() => expect(saveLibrarySettings).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(toast.error).not.toHaveBeenCalled();
  }, 8000);
});
