import { db } from "@/db";
import { recruitmentSnapshots } from "@/db/recruitment-schema";
import {
  computeRecruitmentMetrics,
  todayKey,
  type JobOrderView,
  type PlacementView,
} from "@/lib/recruitment-metrics";
import { desc, ne } from "drizzle-orm";

export async function refreshRecruitmentSnapshotAndGetPrevious(
  placements: PlacementView[],
  jobOrders: JobOrderView[],
) {
  const metrics = computeRecruitmentMetrics(placements, jobOrders);
  const today = todayKey();

  await db
    .insert(recruitmentSnapshots)
    .values({
      day: today,
      activePipelineValue: Math.round(metrics.activePipelineValue),
      placementsThisMonth: metrics.placementsThisMonth,
      openJobOrders: metrics.openJobOrders,
      avgTimeToFillDays: metrics.avgTimeToFillDays,
    })
    .onConflictDoUpdate({
      target: recruitmentSnapshots.day,
      set: {
        activePipelineValue: Math.round(metrics.activePipelineValue),
        placementsThisMonth: metrics.placementsThisMonth,
        openJobOrders: metrics.openJobOrders,
        avgTimeToFillDays: metrics.avgTimeToFillDays,
      },
    });

  const [previous] = await db
    .select()
    .from(recruitmentSnapshots)
    .where(ne(recruitmentSnapshots.day, today))
    .orderBy(desc(recruitmentSnapshots.day))
    .limit(1);

  return previous ?? null;
}
