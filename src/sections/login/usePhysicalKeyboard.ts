import { type RefObject, useEffect } from "react";

function toAsciiDigits(value: string): string {
  return value.replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/**
 * Physical keyboard: handle digits, backspace and Enter even when the hidden
 * input is not focused — the usual case on first launch. Every handler reads
 * pinRef, so a re-register per render can never go stale.
 */
export function usePhysicalKeyboard(deps: {
  inputRef: RefObject<HTMLInputElement | null>;
  pressDigit: (asciiDigit: string) => void;
  pressBackspace: () => void;
  pressEnter: () => void;
}) {
  const { inputRef, pressDigit, pressBackspace, pressEnter } = deps;

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
  }, [inputRef, pressDigit, pressBackspace, pressEnter]);
}
