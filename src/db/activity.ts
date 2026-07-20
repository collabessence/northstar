import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function logActivity(message: string, kind: "deal" | "contact" | "task" | "system" = "system") {
  await db.insert(activityLog).values({ message, kind });
}

export async function recentActivity(limit = 8) {
  return db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(limit);
}
