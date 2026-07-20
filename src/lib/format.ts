// Formatting helpers shared across every CRM vertical in this app (Sales,
// Recruiting, and future ones). Kept separate from lib/metrics.ts, which is
// specific to the sales-deal domain model.

export function money(value: number, compact = false) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: compact ? 0 : 0,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

export function todayLabel() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}
