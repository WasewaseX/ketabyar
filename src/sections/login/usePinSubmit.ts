import { type RefObject, useCallback, useRef } from "react";
import { login } from "../../data/auth";
import { refreshLibrarySettingsAfterLogin } from "../../store/librarySettingsStore";
import type { PublicUser } from "../../types";

/**
 * PIN submit + auto-submit. Owns the submit lock and the auto-submit timer
 * refs (their writes live here by design); the PIN mirror and input ref stay
 * with the caller, whose onFailure callback performs their writes.
 */
export function usePinSubmit(deps: {
  pinRef: RefObject<string>;
  setBusy: (value: boolean) => void;
  setError: (value: string | null) => void;
  onSuccess: (user: PublicUser) => void;
  onFailure: () => void;
}) {
  const { pinRef, setBusy, setError, onSuccess, onFailure } = deps;
  const submitLock = useRef(false);
  const autoTimer = useRef<number | null>(null);

  const clearAutoTimer = useCallback(() => {
    if (autoTimer.current !== null) {
      window.clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
  }, []);

  const submit = useCallback(
    async (candidate: string) => {
      if (submitLock.current || candidate.length < 4) return;
      submitLock.current = true;
      setBusy(true);
      setError(null);
      try {
        const user: PublicUser = await login(candidate);
        // The gate in App.tsx re-renders on setUser — navigation happens here.
        onSuccess(user);
        // Non-fatal: the dashboard needs library settings (store has defaults).
        refreshLibrarySettingsAfterLogin();
      } catch (loginError) {
        setError(
          loginError instanceof Error ? loginError.message : String(loginError),
        );
        onFailure();
      } finally {
        submitLock.current = false;
        setBusy(false);
      }
    },
    [submitLock, setBusy, setError, onSuccess, onFailure],
  );

  const scheduleAutoSubmit = useCallback(() => {
    clearAutoTimer();
    if (pinRef.current.length < 4) return;
    // Short idle window so 5–8-digit PINs can finish typing before the
    // automatic attempt fires. Enter always submits immediately.
    autoTimer.current = window.setTimeout(() => {
      autoTimer.current = null;
      void submit(pinRef.current);
    }, 550);
  }, [clearAutoTimer, submit, pinRef]);

  return { submit, scheduleAutoSubmit, clearAutoTimer };
}
