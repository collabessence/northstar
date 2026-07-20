import { db } from "@/db";
import { contacts, deals, tasks } from "@/db/schema";
import { recentActivity } from "@/db/activity";
import { refreshSnapshotAndGetPrevious } from "@/db/snapshots";
import { asc } from "drizzle-orm";
import CrmDashboard from "./crm-dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [dealRows, contactRows, taskRows, activityRows] = await Promise.all([
    db.select().from(deals).orderBy(asc(deals.id)),
    db.select().from(contacts).orderBy(asc(contacts.id)),
    db.select().from(tasks).orderBy(asc(tasks.id)),
    recentActivity(8),
  ]);

  const dealViews = dealRows.map((deal) => ({
    ...deal,
    lastContactAt: deal.lastContactAt.toISOString(),
    closedAt: deal.closedAt ? deal.closedAt.toISOString() : null,
    createdAt: deal.createdAt.toISOString(),
  }));

  const taskViews = taskRows.map(({ createdAt: _createdAt, dueAt, ...task }) => ({
    ...task,
    dueAt: dueAt ? dueAt.toISOString() : null,
  }));

  const previousSnapshot = await refreshSnapshotAndGetPrevious(dealViews);

  return (
    <CrmDashboard
      deals={dealViews}
      contacts={contactRows.map(({ createdAt: _createdAt, ...contact }) => contact)}
      tasks={taskViews}
      activity={activityRows.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() }))}
      previousSnapshot={
        previousSnapshot
          ? {
              day: previousSnapshot.day,
              pipeline: previousSnapshot.pipeline,
              forecast: previousSnapshot.forecast,
              wonValue: previousSnapshot.wonValue,
              winRate: previousSnapshot.winRate,
              avgCycleDays: previousSnapshot.avgCycleDays,
            }
          : null
      }
    />
  );
}
