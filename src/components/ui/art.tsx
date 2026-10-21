import { cn } from "../../utils/cn";

/**
 * Original KetabYar artwork, drawn in code. These inline SVGs replace the
 * old bitmap illustrations so every visual in the app is ours, themes with
 * CSS, and adds zero asset weight.
 */

export function ArtReading({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={cn("h-32", className)} aria-hidden>
      <ellipse cx="80" cy="106" rx="54" ry="7" className="fill-ink/8 dark:fill-white/8" />
      <path d="M80 34c-10-9-26-12-40-9v64c14-3 30 0 40 9V34z" className="fill-accent/80 dark:fill-accent-dark/80" />
      <path d="M80 34c10-9 26-12 40-9v64c-14-3-30 0-40 9V34z" className="fill-accent/60 dark:fill-accent-dark/60" />
      {[0, 1, 2].map((row) => (
        <rect key={row} x="50" y={48 + row * 12} width="20" height="3.5" rx="1.75" className="fill-white/70" />
      ))}
      {[0, 1, 2].map((row) => (
        <rect key={row} x="92" y={48 + row * 12} width="20" height="3.5" rx="1.75" className="fill-white/50" />
      ))}
      <path d="M80 30l3.5 7.5L92 39l-6.5 5 1.5 8-7-4.5-7 4.5 1.5-8-6.5-5 8.5-1.5L80 30z" className="fill-copper" />
    </svg>
  );
}

export function ArtMedal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={cn("h-28", className)} aria-hidden>
      <circle cx="80" cy="58" r="34" className="fill-copper/20" />
      <circle cx="80" cy="58" r="26" className="fill-copper/60" />
      <path d="M80 44l4.7 9.5 10.5 1.5-7.6 7.4 1.8 10.4L80 67.9l-9.4 4.9 1.8-10.4-7.6-7.4 10.5-1.5L80 44z" className="fill-white/90" />
      <path d="M62 88l-8 18 15-6 4 14 7-26" className="fill-none stroke-copper/70" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M98 88l8 18-15-6-4 14-7-26" className="fill-none stroke-copper/70" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArtClock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={cn("h-28", className)} aria-hidden>
      <circle cx="80" cy="60" r="38" className="fill-accent/10 dark:fill-accent-dark/15" />
      <circle cx="80" cy="60" r="28" className="fill-white dark:fill-[#1b2723]" />
      <circle cx="80" cy="60" r="28" className="fill-none stroke-accent/50 dark:stroke-accent-dark/50" strokeWidth="4" />
      <path d="M80 60V44" className="fill-none stroke-ink/70 dark:stroke-ivory/70" strokeWidth="4" strokeLinecap="round" />
      <path d="M80 60l12 8" className="fill-none stroke-copper" strokeWidth="4" strokeLinecap="round" />
      <circle cx="80" cy="60" r="3" className="fill-copper" />
    </svg>
  );
}

export function ArtQuill({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={cn("h-28", className)} aria-hidden>
      <path d="M118 18c-30 4-56 22-66 48-3 8-4 16-3 24l8-2c-1-6 0-13 3-20 9-22 30-38 58-42-18 12-30 28-34 46l6 2c4-16 15-30 32-40 2 14-1 28-10 40l6 4c12-16 15-38 8-56l-8-4z" className="fill-accent/70 dark:fill-accent-dark/70" />
      <path d="M44 96c10-2 20-2 28 2" className="fill-none stroke-copper" strokeWidth="4" strokeLinecap="round" />
      <rect x="52" y="84" width="34" height="5" rx="2.5" className="fill-copper/60" />
    </svg>
  );
}

export function ArtShelf({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={cn("h-28", className)} aria-hidden>
      <rect x="30" y="30" width="100" height="8" rx="2" className="fill-ink/15 dark:fill-white/15" />
      <rect x="30" y="66" width="100" height="8" rx="2" className="fill-ink/15 dark:fill-white/15" />
      <rect x="30" y="100" width="100" height="8" rx="2" className="fill-ink/15 dark:fill-white/15" />
      {[0, 1, 2, 3, 4].map((index) => (
        <rect key={index} x={36 + index * 15} y={38} width={11} height={28} rx={2} className={index % 2 ? "fill-accent/70 dark:fill-accent-dark/70" : "fill-copper/70"} />
      ))}
      {[0, 1, 2].map((index) => (
        <rect key={index} x={40 + index * 15} y={74} width={11} height={26} rx={2} className={index % 2 ? "fill-copper/60" : "fill-accent/55 dark:fill-accent-dark/55"} />
      ))}
      <rect x="96" y="60" width="20" height="40" rx="2" className="fill-accent/30 dark:fill-accent-dark/30" transform="skewX(-8)" />
    </svg>
  );
}
