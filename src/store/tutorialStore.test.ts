import { beforeEach, describe, expect, it } from "vitest";
import { useTutorialStore } from "./tutorialStore";

describe("tutorialStore", () => {
  beforeEach(() => {
    useTutorialStore.setState({ open: false, step: 0 });
  });

  it("opens the tour at the first step", () => {
    useTutorialStore.getState().start();
    expect(useTutorialStore.getState().open).toBe(true);
    expect(useTutorialStore.getState().step).toBe(0);
  });

  it("advances and clamps at the last step", () => {
    const s = useTutorialStore.getState();
    s.start();
    for (let i = 0; i < 10; i++) s.next(6);
    expect(useTutorialStore.getState().step).toBe(5);
  });

  it("never goes below the first step", () => {
    const s = useTutorialStore.getState();
    s.start();
    s.back();
    expect(useTutorialStore.getState().step).toBe(0);
  });

  it("closing hides the overlay and resets nothing else", () => {
    const s = useTutorialStore.getState();
    s.start();
    s.next(6);
    s.close();
    expect(useTutorialStore.getState().open).toBe(false);
    expect(useTutorialStore.getState().step).toBe(1);
  });
});
