import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicUser } from "../../types";
import { normalizePinInput } from "./pinDigits";
import { usePhysicalKeyboard } from "./usePhysicalKeyboard";
import { usePinSubmit } from "./usePinSubmit";

export { PERSIAN_DIGITS } from "./pinDigits";

/**
 * PIN entry state machine: keypad + hidden input + physical keyboard, with
 * submit lock, auto-submit and the authoritative pinRef mirror. The submit
 * lock and timer live in usePinSubmit (their writes stay there); this hook
 * owns the PIN mirror ref and the hidden-input ref.
 */
export function usePinPad(onSuccess: (user: PublicUser) => void) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Authoritative mirror: render state lags one tick, and the lag is exactly
  // where the old bugs lived (double submit, resurrected digits).
  const pinRef = useRef("");

  const { submit, scheduleAutoSubmit, clearAutoTimer } = usePinSubmit({
    pinRef,
    setBusy,
    setError,
    onSuccess,
    onFailure: () => {
      pinRef.current = "";
      setPin("");
      inputRef.current?.focus();
    },
  });

  const pressDigit = useCallback(
    (asciiDigit: string) => {
      if (pinRef.current.length >= 8) return;
      pinRef.current = pinRef.current + asciiDigit;
      setPin(pinRef.current);
      setError(null);
      scheduleAutoSubmit();
    },
    [pinRef, scheduleAutoSubmit],
  );

  const pressBackspace = useCallback(() => {
    clearAutoTimer();
    pinRef.current = pinRef.current.slice(0, -1);
    setPin(pinRef.current);
  }, [clearAutoTimer, pinRef]);

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
      const digits = normalizePinInput(raw);
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
