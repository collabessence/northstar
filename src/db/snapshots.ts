import { db } from "@/db";
import { metricSnapshots } from "@/db/schema";
import { computeCoreMetrics, todayKey, type DealView } from "@/lib/metrics";
import { desc, ne } from "drizzle-orm";

/**
 * Writes (or refreshes) today's metric snapshot and returns the most recent
 * *prior* day's snapshot to diff against. This is what makes the KPI deltas
 * on the dashboard real: the first day an app is used there is nothing to
 * compare to (deltas show "New"), and from day two onward every percentage
 * shown is an actual comparison against real historical data, not a made-up
 * number.
 */
export async function refreshSnapshotAndGetPrevious(deals: DealView[]) {
  const metrics = computeCoreMetrics(deals);
  const today = todayKey();

  await db
    .insert(metricSnapshots)
    .values({
      day: today,
      pipeline: Math.round(metrics.pipeline),
      forecast: metrics.forecast,
      wonValue: Math.round(metrics.wonValue),
      winRate: metrics.winRate,
      avgCycleDays: metrics.avgCycleDays,
    })
    .onConflictDoUpdate({
      target: metricSnapshots.day,
      set: {
        pipeline: Math.round(metrics.pipeline),
        forecast: metrics.forecast,
        wonValue: Math.round(metrics.wonValue),
        winRate: metrics.winRate,
        avgCycleDays: metrics.avgCycleDays,
      },
    });

  const [previous] = await db
    .select()
    .from(metricSnapshots)
    .where(ne(metricSnapshots.day, today))
    .orderBy(desc(metricSnapshots.day))
    .limit(1);

  return previous ?? null;
}
