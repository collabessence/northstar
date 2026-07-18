import { db } from "@/db";
import { contacts, deals, tasks } from "@/db/schema";
import { refreshSnapshotAndGetPrevious } from "@/db/snapshots";
import { asc } from "drizzle-orm";
import CrmDashboard from "./crm-dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [dealRows, contactRows, taskRows] = await Promise.all([
    db.select().from(deals).orderBy(asc(deals.id)),
    db.select().from(contacts).orderBy(asc(contacts.id)),
    db.select().from(tasks).orderBy(asc(tasks.id)),
  ]);

  const dealViews = dealRows.map((deal) => ({
    ...deal,
    lastContactAt: deal.lastContactAt.toISOString(),
    closedAt: deal.closedAt ? deal.closedAt.toISOString() : null,
    createdAt: deal.createdAt.toISOString(),
  }));

  const previousSnapshot = await refreshSnapshotAndGetPrevious(dealViews);

  return (
    <CrmDashboard
      deals={dealViews}
      contacts={contactRows.map(({ createdAt: _createdAt, ...contact }) => contact)}
      tasks={taskRows.map(({ createdAt: _createdAt, ...task }) => task)}
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
