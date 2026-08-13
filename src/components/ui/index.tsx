/**
 * The shared vocabulary. Every screen was writing its own version of the same button and the same card —
 * "rounded-lg border border-espresso/25 px-3 py-1.5" appears in a dozen files with a dozen small
 * variations, which is why nothing quite lined up. These are the primitives; variants are props.
 *
 * Deliberately small. A design system for a six-page operator app does not need forty components, it
 * needs the six that appear on every page to be identical everywhere.
 */
import type { ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- button

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded font-medium transition " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink shadow-sm hover:brightness-110 active:brightness-95",
  secondary: "border border-line-strong bg-raised text-ink hover:bg-sunken",
  ghost: "text-ink-soft hover:bg-sunken hover:text-ink",
  danger: "border border-danger/30 bg-danger-soft text-danger hover:bg-danger hover:text-white",
};

// 36px tall at md: a touch target that still works on a phone, which the old 26px pills did not.
const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-9 px-3.5 text-sm",
};

export function Button({
  variant = "secondary", size = "md", className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)} {...rest} />;
}

export function LinkButton({
  variant = "secondary", size = "md", className, ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <a className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)} {...rest} />;
}

// ---------------------------------------------------------------- surfaces

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-lg border border-line bg-raised shadow-sm", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- badge

type Tone = "neutral" | "ok" | "warn" | "danger" | "accent";

const TONE: Record<Tone, string> = {
  neutral: "border-line bg-sunken text-ink-soft",
  ok: "border-ok/25 bg-ok-soft text-ok",
  warn: "border-warn/25 bg-warn-soft text-warn",
  danger: "border-danger/25 bg-danger-soft text-danger",
  accent: "border-accent/25 bg-accent-soft text-accent",
};

export function Badge({ tone = "neutral", className, children }:
  { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        TONE[tone], className)}>
      {children}
    </span>
  );
}

/** A status dot for rows where a full badge would be noise. */
export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const fill: Record<Tone, string> = {
    neutral: "bg-ink-faint", ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", accent: "bg-accent",
  };
  return <span className={cx("inline-block h-1.5 w-1.5 shrink-0 rounded-full", fill[tone])} />;
}

// ---------------------------------------------------------------- metric

/** One number with its label, and — the part that matters — what the number means.
 *  A metric with no floor to compare against is decoration: 47.5% reads as healthy until you know the
 *  minimum is 55. */
export function Stat({ label, value, hint, tone = "neutral" }:
  { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  const ink: Record<Tone, string> = {
    neutral: "text-ink", ok: "text-ok", warn: "text-warn", danger: "text-danger", accent: "text-accent",
  };
  return (
    <div className="rounded-lg border border-line bg-raised px-4 py-3 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={cx("tabular mt-1 text-2xl font-semibold", ink[tone])}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-soft">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- states

/** Pulsing placeholders, not a spinner. A spinner says "wait"; a skeleton says what is coming. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded bg-sunken", className)} />;
}

export function EmptyState({ title, hint, action }:
  { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-raised/60 px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-xs text-ink-soft">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>tekrar dene</Button>
      )}
    </div>
  );
}
