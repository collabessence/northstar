import type { Deal } from "@/db/schema";

export type DealView = {
  id: number;
  title: string;
  company: string;
  contactName: string;
  email: string;
  value: number;
  stage: string;
  probability: number;
  temperature: string;
  ownerInitials: string;
  dueLabel: string;
  notes: string | null;
  lastContactAt: string; // ISO string once serialized to the client
  closedAt: string | null;
  createdAt: string;
};

const DAY_MS = 1000 * 60 * 60 * 24;

export function daysSince(iso: string, now: Date = new Date()) {
  return Math.max(0, (now.getTime() - new Date(iso).getTime()) / DAY_MS);
}

/**
 * Relative "last contact" label computed from a real timestamp, e.g.
 * "12 min ago", "3 hours ago", "Yesterday", "Jun 14". Replaces the old
 * hand-typed strings that never updated.
 */
export function relativeLabel(iso: string, now: Date = new Date()) {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(iso),
  );
}

/**
 * Real scoring function for "Smart priority" instead of picking an arbitrary
 * deal. Weighs: deal value (bigger deals matter more), stage (further along
 * = closer to revenue), temperature, and freshness (a deal going cold is
 * more urgent than one just touched). Every factor traces back to a real
 * column on the deal row.
 */
export function scoreDeal(deal: DealView, now: Date = new Date()) {
  if (deal.stage === "won") return -Infinity;

  const stageWeight: Record<string, number> = { new: 0.4, qualified: 0.7, proposal: 1 };
  const tempWeight: Record<string, number> = { Hot: 1.3, Warm: 1, Cold: 0.7 };
  const daysCold = daysSince(deal.lastContactAt, now);

  // Urgency rises the longer a deal has gone untouched, then decays once it's
  // clearly stale (>14 days) since re-engagement value drops off a cliff.
  const urgency = daysCold <= 14 ? 0.5 + daysCold / 14 : Math.max(0.3, 1.5 - (daysCold - 14) / 30);

  const valueScore = Math.log10(Math.max(deal.value, 1000));

  return (
    valueScore *
    (stageWeight[deal.stage] ?? 0.5) *
    (tempWeight[deal.temperature] ?? 1) *
    urgency
  );
}

export function pickPriorityDeal(deals: DealView[], now: Date = new Date()) {
  const open = deals.filter((deal) => deal.stage !== "won");
  if (open.length === 0) return null;
  return open.reduce((best, deal) => (scoreDeal(deal, now) > scoreDeal(best, now) ? deal : best));
}

export function priorityReason(deal: DealView, now: Date = new Date()) {
  const days = daysSince(deal.lastContactAt, now);
  const freshness =
    days < 1
      ? "was just in touch"
      : days < 2
        ? "was in touch yesterday"
        : `hasn't been contacted in ${Math.round(days)} days`;
  if (deal.stage === "proposal") {
    return `${deal.contactName} ${freshness}. A proposal is out — this is the closest deal to closing.`;
  }
  if (days > 10) {
    return `${deal.contactName} ${freshness}. This deal risks going cold — worth a check-in.`;
  }
  return `${deal.contactName} ${freshness}. High value relative to the rest of your pipeline.`;
}

export function computeCoreMetrics(deals: DealView[]) {
  const openDeals = deals.filter((deal) => deal.stage !== "won");
  const pipeline = openDeals.reduce((sum, deal) => sum + deal.value, 0);
  const forecast = deals.reduce((sum, deal) => sum + deal.value * (deal.probability / 100), 0);
  const won = deals.filter((deal) => deal.stage === "won");
  const wonValue = won.reduce((sum, deal) => sum + deal.value, 0);
  const winRate = deals.length ? Math.round((won.length / deals.length) * 100) : 0;

  const cycles = won
    .filter((deal) => deal.closedAt)
    .map((deal) =>
      Math.max(0, (new Date(deal.closedAt as string).getTime() - new Date(deal.createdAt).getTime()) / DAY_MS),
    );
  const avgCycleDays = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null;

  return { pipeline, forecast, wonValue, winRate, avgCycleDays };
}

/** Monthly won-revenue series for the last `months` calendar months, built
 * from real `closedAt` timestamps rather than a hardcoded SVG path. */
export function revenueByMonth(deals: DealView[], months = 6, now: Date = new Date()) {
  const buckets: { key: string; label: string; total: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(d),
      total: 0,
    });
  }
  for (const deal of deals) {
    if (deal.stage !== "won" || !deal.closedAt) continue;
    const d = new Date(deal.closedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = buckets.find((b) => b.key === key);
    if (bucket) bucket.total += deal.value;
  }
  return buckets;
}

export function stageProbability(stage: string) {
  return stage === "won" ? 100 : stage === "proposal" ? 75 : stage === "qualified" ? 45 : 20;
}

export function initialsFromName(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??"
  );
}

export function todayKey(now: Date = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function percentDelta(current: number, previous: number | null | undefined) {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
