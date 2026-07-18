import { db } from "@/db";
import { candidates, jobOrders, placements, recruitmentClients, recruitmentTasks } from "@/db/recruitment-schema";
import { refreshRecruitmentSnapshotAndGetPrevious } from "@/db/recruitment-snapshots";
import { asc } from "drizzle-orm";
import RecruitmentDashboard from "./recruitment-dashboard";
import type { PipelineStageKey } from "@/lib/recruitment-metrics";

export const dynamic = "force-dynamic";

export default async function RecruitmentPage() {
  const [clientRows, candidateRows, jobOrderRows, placementRows, taskRows] = await Promise.all([
    db.select().from(recruitmentClients).orderBy(asc(recruitmentClients.id)),
    db.select().from(candidates).orderBy(asc(candidates.id)),
    db.select().from(jobOrders).orderBy(asc(jobOrders.id)),
    db.select().from(placements).orderBy(asc(placements.id)),
    db.select().from(recruitmentTasks).orderBy(asc(recruitmentTasks.id)),
  ]);

  const candidateViews = candidateRows.map((candidate) => ({
    ...candidate,
    lastContactAt: candidate.lastContactAt.toISOString(),
  }));

  const jobOrderViews = jobOrderRows.map((jobOrder) => ({
    ...jobOrder,
    openedAt: jobOrder.openedAt.toISOString(),
  }));

  const placementViews = placementRows.map((placement) => ({
    ...placement,
    stage: placement.stage as PipelineStageKey,
    lastActivityAt: placement.lastActivityAt.toISOString(),
    submittedAt: placement.submittedAt ? placement.submittedAt.toISOString() : null,
    interviewAt: placement.interviewAt ? placement.interviewAt.toISOString() : null,
    offerAt: placement.offerAt ? placement.offerAt.toISOString() : null,
    placedAt: placement.placedAt ? placement.placedAt.toISOString() : null,
    createdAt: placement.createdAt.toISOString(),
  }));

  const previousSnapshot = await refreshRecruitmentSnapshotAndGetPrevious(placementViews, jobOrderViews);

  return (
    <RecruitmentDashboard
      clients={clientRows}
      candidates={candidateViews}
      jobOrders={jobOrderViews}
      placements={placementViews}
      tasks={taskRows}
      previousSnapshot={
        previousSnapshot
          ? {
              day: previousSnapshot.day,
              activePipelineValue: previousSnapshot.activePipelineValue,
              placementsThisMonth: previousSnapshot.placementsThisMonth,
              openJobOrders: previousSnapshot.openJobOrders,
              avgTimeToFillDays: previousSnapshot.avgTimeToFillDays,
            }
          : null
      }
    />
  );
}
