import { daysSince, relativeLabel } from "@/lib/metrics";

export { relativeLabel, daysSince };

export const pipelineStages = [
  { key: "sourced", label: "Sourced", color: "#7c8a9e", dot: "bg-slate-400" },
  { key: "screened", label: "Screened", color: "#8b5cf6", dot: "bg-violet-500" },
  { key: "submitted", label: "Submitted to client", color: "#3b82f6", dot: "bg-blue-500" },
  { key: "client_interview", label: "Client interview", color: "#f59e0b", dot: "bg-amber-500" },
  { key: "offer", label: "Offer out", color: "#f97316", dot: "bg-orange-500" },
  { key: "placed", label: "Placed", color: "#18a676", dot: "bg-emerald-500" },
] as const;

export type PipelineStageKey = (typeof pipelineStages)[number]["key"] | "guarantee" | "completed" | "fell_through";

export type CandidateView = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  currentTitle: string;
  currentCompany: string | null;
  location: string;
  skills: string[];
  yearsExperience: number;
  desiredSalary: number;
  availability: string;
  source: string;
  status: string;
  resumeSummary: string | null;
  lastContactAt: string;
};

export type ClientView = {
  id: number;
  name: string;
  industry: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  status: string;
};

export type JobOrderView = {
  id: number;
  title: string;
  clientId: number;
  seniority: string;
  employmentType: string;
  salaryMin: number;
  salaryMax: number;
  feePercentage: number;
  openings: number;
  status: string;
  priority: string;
  openedAt: string;
};

export type PlacementView = {
  id: number;
  candidateId: number;
  jobOrderId: number;
  stage: PipelineStageKey;
  fellThroughReason: string | null;
  agreedSalary: number | null;
  feeAmount: number | null;
  commissionRate: number;
  lastActivityAt: string;
  submittedAt: string | null;
  interviewAt: string | null;
  offerAt: string | null;
  placedAt: string | null;
  guaranteeDays: number;
  createdAt: string;
};

export function feeForSalary(salary: number, feePercentage: number) {
  return Math.round(salary * (feePercentage / 100));
}

export function commissionForFee(feeAmount: number, commissionRate: number) {
  return Math.round(feeAmount * (commissionRate / 100));
}

export function guaranteeDaysRemaining(placement: PlacementView, now: Date = new Date()) {
  if (!placement.placedAt) return null;
  const ends = new Date(placement.placedAt).getTime() + placement.guaranteeDays * 24 * 60 * 60 * 1000;
  const remaining = Math.ceil((ends - now.getTime()) / (24 * 60 * 60 * 1000));
  return remaining;
}

const stageOrder: PipelineStageKey[] = [
  "sourced",
  "screened",
  "submitted",
  "client_interview",
  "offer",
  "placed",
  "guarantee",
  "completed",
];

export function stageIndex(stage: PipelineStageKey) {
  return stageOrder.indexOf(stage);
}

export function nextStage(stage: PipelineStageKey): PipelineStageKey {
  const idx = stageIndex(stage);
  if (idx === -1 || idx >= stageOrder.length - 1) return stage;
  return stageOrder[idx + 1];
}

/**
 * Real scoring for "who should I act on next" — weighs how far along the
 * pipeline entry is (an offer about to be accepted matters more than a
 * freshly sourced candidate), fee value, and how long it's been sitting
 * without activity (an offer going cold is urgent).
 */
export function scorePlacement(placement: PlacementView, jobOrder: JobOrderView | undefined, now: Date = new Date()) {
  if (["placed", "guarantee", "completed", "fell_through"].includes(placement.stage)) return -Infinity;

  const stageWeight: Record<string, number> = {
    sourced: 0.3,
    screened: 0.5,
    submitted: 0.75,
    client_interview: 1,
    offer: 1.4,
  };
  const priorityWeight: Record<string, number> = { High: 1.3, Medium: 1, Low: 0.75 };
  const daysIdle = daysSince(placement.lastActivityAt, now);
  // The further along (esp. at offer stage), the more urgent an idle pipeline becomes.
  const urgency = 0.5 + Math.min(daysIdle, 10) / 6;

  const estimatedFee =
    placement.feeAmount ??
    (jobOrder ? feeForSalary((jobOrder.salaryMin + jobOrder.salaryMax) / 2, jobOrder.feePercentage) : 5000);
  const valueScore = Math.log10(Math.max(estimatedFee, 1000));

  return valueScore * (stageWeight[placement.stage] ?? 0.4) * (priorityWeight[jobOrder?.priority ?? "Medium"] ?? 1) * urgency;
}

export function pickPriorityPlacement(placements: PlacementView[], jobOrders: JobOrderView[], now: Date = new Date()) {
  const open = placements.filter((p) => !["placed", "guarantee", "completed", "fell_through"].includes(p.stage));
  if (open.length === 0) return null;
  const jobOrderMap = new Map(jobOrders.map((jo) => [jo.id, jo]));
  return open.reduce((best, p) => {
    const bestScore = scorePlacement(best, jobOrderMap.get(best.jobOrderId), now);
    const score = scorePlacement(p, jobOrderMap.get(p.jobOrderId), now);
    return score > bestScore ? p : best;
  });
}

export function priorityReason(
  placement: PlacementView,
  jobOrder: JobOrderView | undefined,
  candidate: CandidateView | undefined,
  now: Date = new Date(),
) {
  const days = Math.round(daysSince(placement.lastActivityAt, now));
  const who = candidate?.name ?? "This candidate";
  if (placement.stage === "offer") {
    return `${who}'s offer has been out ${days === 0 ? "today" : `for ${days} day${days === 1 ? "" : "s"}`}. Confirm acceptance before they entertain other offers.`;
  }
  if (placement.stage === "client_interview") {
    return `${who} interviewed with ${jobOrder?.title ?? "the client"} — chase feedback before it goes cold.`;
  }
  if (days > 7) {
    return `${who} hasn't moved in ${days} days. Worth a nudge before the client loses interest.`;
  }
  return `${who} is a strong match for ${jobOrder?.title ?? "an open role"} — keep the momentum going.`;
}

export function computeRecruitmentMetrics(placements: PlacementView[], jobOrders: JobOrderView[]) {
  const activePipeline = placements.filter(
    (p) => !["placed", "guarantee", "completed", "fell_through"].includes(p.stage),
  );
  const jobOrderMap = new Map(jobOrders.map((jo) => [jo.id, jo]));
  const activePipelineValue = activePipeline.reduce((sum, p) => {
    const jo = jobOrderMap.get(p.jobOrderId);
    const fee = p.feeAmount ?? (jo ? feeForSalary((jo.salaryMin + jo.salaryMax) / 2, jo.feePercentage) : 0);
    return sum + fee;
  }, 0);

  const now = new Date();
  const placementsThisMonth = placements.filter((p) => {
    if (!p.placedAt) return false;
    const d = new Date(p.placedAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const openJobOrders = jobOrders.filter((jo) => jo.status === "Open").length;

  const filledOrders = placements.filter((p) => p.placedAt);
  const fillTimes = filledOrders
    .map((p) => {
      const jo = jobOrderMap.get(p.jobOrderId);
      if (!jo || !p.placedAt) return null;
      return (new Date(p.placedAt).getTime() - new Date(jo.openedAt).getTime()) / (1000 * 60 * 60 * 24);
    })
    .filter((v): v is number => v !== null && v >= 0);
  const avgTimeToFillDays = fillTimes.length ? fillTimes.reduce((a, b) => a + b, 0) / fillTimes.length : null;

  const totalFeesEarned = placements
    .filter((p) => p.placedAt && p.feeAmount)
    .reduce((sum, p) => sum + (p.feeAmount ?? 0), 0);

  return { activePipelineValue, placementsThisMonth, openJobOrders, avgTimeToFillDays, totalFeesEarned };
}

export function feeByMonth(placements: PlacementView[], months = 6, now: Date = new Date()) {
  const buckets: { key: string; label: string; total: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(d),
      total: 0,
    });
  }
  for (const p of placements) {
    if (!p.placedAt || !p.feeAmount) continue;
    const d = new Date(p.placedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = buckets.find((b) => b.key === key);
    if (bucket) bucket.total += p.feeAmount;
  }
  return buckets;
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
