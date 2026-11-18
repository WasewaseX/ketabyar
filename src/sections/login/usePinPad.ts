import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicUser } from "../../types";
import { usePhysicalKeyboard } from "./usePhysicalKeyboard";
import { usePinSubmit } from "./usePinSubmit";

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
 * submit lock, auto-submit and the authoritative pinRef mirror. Submission
 * lives in usePinSubmit, the window key listener in usePhysicalKeyboard. */
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

  const { submit, scheduleAutoSubmit, clearAutoTimer } = usePinSubmit({
    pinRef,
    submitLock,
    autoTimer,
    setBusy,
    setError,
    setPin,
    inputRef,
    onSuccess,
  });

  const pressDigit = useCallback(
    (asciiDigit: string) => {
      if (submitLock.current) return;
      pinRef.current = (pinRef.current + asciiDigit).slice(0, 8);
      setPin(pinRef.current);
      setError(null);
      scheduleAutoSubmit();
    },
    [submitLock, pinRef, scheduleAutoSubmit],
  );

  const pressBackspace = useCallback(() => {
    if (submitLock.current) return;
    clearAutoTimer();
    pinRef.current = pinRef.current.slice(0, -1);
    setPin(pinRef.current);
  }, [submitLock, clearAutoTimer, pinRef]);

  const pressEnter = useCallback(() => {
    clearAutoTimer();
    void submit(pinRef.current);
  }, [clearAutoTimer, submit, pinRef]);

  // Focus the (visually hidden) input on mount so soft keyboards appear.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  usePhysicalKeyboard({ inputRef, pressDigit, pressBackspace, pressEnter });

  /** Change handler for the hidden input (paste / soft keyboard). */
  const onHiddenInputChange = useCallback(
    (raw: string) => {
      const digits = toAsciiDigits(raw).replace(/\D/g, "").slice(0, 8);
      pinRef.current = digits;
      setPin(digits);
      setError(null);
      scheduleAutoSubmit();
    },
    [pinRef, scheduleAutoSubmit],
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
