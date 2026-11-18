import { useCallback, useEffect, useRef, useState } from "react";
import { login } from "../../data/auth";
import { useLibrarySettingsStore } from "../../store/librarySettingsStore";
import type { PublicUser } from "../../types";

/** Persian-digit glyphs in keypad order (۱..۹, ۰). */
export const PERSIAN_DIGITS = [
  "۱",
  "۲",
  "۳",
  "۴",
  "۵",
  "۶",
  "۷",
  "۸",
  "۹",
  "۰",
];

function toAsciiDigits(value: string): string {
  return value.replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** PIN entry state machine: keypad + hidden input + physical keyboard, with
 * submit lock, auto-submit and the authoritative pinRef mirror. */
export function usePinPad(onSuccess: (user: PublicUser) => void) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Authoritative mirror + locks: render state lags one tick, and the lag is
  // exactly where the old bugs lived (double submit, resurrected digits).
  const pinRef = useRef("");
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
    [onSuccess],
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
  }, [clearAutoTimer, submit]);

  const pressDigit = useCallback(
    (asciiDigit: string) => {
      if (submitLock.current) return;
      pinRef.current = (pinRef.current + asciiDigit).slice(0, 8);
      setPin(pinRef.current);
      setError(null);
      scheduleAutoSubmit();
    },
    [scheduleAutoSubmit],
  );

  const pressBackspace = useCallback(() => {
    if (submitLock.current) return;
    clearAutoTimer();
    pinRef.current = pinRef.current.slice(0, -1);
    setPin(pinRef.current);
  }, [clearAutoTimer]);

  const pressEnter = useCallback(() => {
    clearAutoTimer();
    void submit(pinRef.current);
  }, [clearAutoTimer, submit]);

  // Focus the (visually hidden) input on mount so soft keyboards appear.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Physical keyboard: handle digits, backspace and Enter even when the
  // hidden input is not focused — the usual case on first launch. Every
  // handler reads pinRef, so a re-register per render can never go stale.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target === inputRef.current) return; // the input handles its own keys
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = toAsciiDigits(event.key);
      if (/^[0-9]$/.test(key)) {
        pressDigit(key);
        event.preventDefault();
      } else if (event.key === "Backspace") {
        pressBackspace();
        event.preventDefault();
      } else if (event.key === "Enter") {
        pressEnter();
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pressDigit, pressBackspace, pressEnter]);

  /** Change handler for the hidden input (paste / soft keyboard). */
  const onHiddenInputChange = useCallback(
    (raw: string) => {
      const digits = toAsciiDigits(raw).replace(/\D/g, "").slice(0, 8);
      pinRef.current = digits;
      setPin(digits);
      setError(null);
      scheduleAutoSubmit();
    },
    [scheduleAutoSubmit],
  );

  return {
    pin,
    busy,
    error,
    inputRef,
    pressDigit,
    pressBackspace,
    pressEnter,
    onHiddenInputChange,
  };
}
