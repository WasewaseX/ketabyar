import { type RefObject, useCallback } from "react";
import { login } from "../../data/auth";
import { useLibrarySettingsStore } from "../../store/librarySettingsStore";
import type { PublicUser } from "../../types";

/**
 * PIN submit + auto-submit: the attempt itself, the submit lock bookkeeping
 * and the 550 ms idle window that lets 5–8-digit PINs finish typing.
 */
export function usePinSubmit(deps: {
  pinRef: RefObject<string>;
  submitLock: RefObject<boolean>;
  autoTimer: RefObject<number | null>;
  setBusy: (value: boolean) => void;
  setError: (value: string | null) => void;
  setPin: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onSuccess: (user: PublicUser) => void;
}) {
  const {
    pinRef,
    submitLock,
    autoTimer,
    setBusy,
    setError,
    setPin,
    inputRef,
    onSuccess,
  } = deps;

  const clearAutoTimer = useCallback(() => {
    if (autoTimer.current !== null) {
      window.clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
  }, [autoTimer]);

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
        // Non-fatal: the dashboard needs library settings, but a failure here
        // must never mask a successful login (the store carries defaults).
        useLibrarySettingsStore
          .getState()
          .load()
          .catch((settingsError) =>
            console.error("library settings load failed", settingsError),
          );
      } catch (loginError) {
        setError(
          loginError instanceof Error ? loginError.message : String(loginError),
        );
        pinRef.current = "";
        setPin("");
        inputRef.current?.focus();
      } finally {
        submitLock.current = false;
        setBusy(false);
      }
    },
    [submitLock, setBusy, setError, setPin, pinRef, inputRef, onSuccess],
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
  }, [clearAutoTimer, autoTimer, pinRef, submit]);

  return { submit, scheduleAutoSubmit, clearAutoTimer };
}
