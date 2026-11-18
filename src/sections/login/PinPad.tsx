import { Delete } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PERSIAN_DIGITS } from "./pinDigits";
import type { usePinPad } from "./usePinPad";

type PinPadApi = ReturnType<typeof usePinPad>;

/** PIN dots, the hidden input, and the Persian keypad grid. */
export function PinPad({ api }: { api: PinPadApi }) {
  const { t } = useTranslation();
  const {
    pin,
    busy,
    inputRef,
    pressDigit,
    pressBackspace,
    pressEnter,
    onHiddenInputChange,
  } = api;
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.focus()}
        className="mb-4 flex h-7 items-center justify-center gap-2"
        aria-label="PIN"
      >
        {Array.from({ length: Math.max(4, pin.length) }).map((_, index) => (
          <span
            key={index}
            className={
              index < pin.length
                ? "h-3.5 w-3.5 scale-110 rounded-full bg-[#1a4d40] dark:bg-[#1b9277]"
                : "h-3.5 w-3.5 rounded-full border-2 border-ink/25 dark:border-white/25"
            }
          />
        ))}
      </button>

      <input
        ref={inputRef}
        className="sr-only"
        aria-label={t("auth.pinInput", "Library PIN")}
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={(event) => onHiddenInputChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") pressEnter();
        }}
      />

      <div className="grid grid-cols-3 gap-2" dir="ltr">
        {PERSIAN_DIGITS.map((glyph, index) => {
          const ascii = index === 9 ? "0" : String(index + 1);
          return (
            <button
              key={ascii}
              type="button"
              disabled={busy}
              onClick={() => pressDigit(ascii)}
              className="h-14 rounded-xl border border-ink/8 bg-white text-lg font-semibold text-ink transition hover:bg-[#1a4d40] hover:text-white disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-ivory dark:hover:bg-[#1b9277]"
            >
              {glyph}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="backspace"
          disabled={busy}
          onClick={pressBackspace}
          className="flex h-14 items-center justify-center rounded-xl text-copper transition hover:bg-copper/10 disabled:opacity-50"
        >
          <Delete size={19} />
        </button>
      </div>
    </>
  );
}
