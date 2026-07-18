"use server";

import { db } from "@/db";
import { contacts, deals, metricSnapshots, tasks } from "@/db/schema";
import { seedSampleData } from "@/db/seed";
import { initialsFromName, stageProbability } from "@/lib/metrics";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const validStages = new Set(["new", "qualified", "proposal", "won"]);
const validTaskTypes = new Set(["Call", "Email", "Meeting", "Message"]);

export async function createDeal(input: {
  title: string;
  company: string;
  contactName: string;
  email: string;
  value: number;
  stage: string;
}) {
  const title = input.title.trim();
  const company = input.company.trim();
  const contactName = input.contactName.trim();
  const email = input.email.trim();
  const value = Math.round(Number(input.value));
  const stage = validStages.has(input.stage) ? input.stage : "new";

  if (!title || !company || !contactName || !email || !Number.isFinite(value) || value <= 0) {
    return { ok: false, message: "Please complete all fields with a valid deal value." };
  }

  const now = new Date();
  await db.insert(deals).values({
    title,
    company,
    contactName,
    email,
    value,
    stage,
    probability: stageProbability(stage),
    temperature: stage === "proposal" ? "Hot" : "Warm",
    ownerInitials: initialsFromName(contactName) || "AM",
    dueLabel: "This week",
    lastContactAt: now,
    closedAt: stage === "won" ? now : null,
  });

  revalidatePath("/");
  return { ok: true, message: "Opportunity added to your pipeline." };
}

export async function moveDeal(dealId: number, stage: string) {
  if (!Number.isInteger(dealId) || !validStages.has(stage)) {
    return { ok: false };
  }

  const now = new Date();
  // Moving a deal is a real touchpoint, so it refreshes lastContactAt too —
  // this is what "Smart priority" and the "last contact" column rely on.
  await db
    .update(deals)
    .set({
      stage,
      probability: stageProbability(stage),
      lastContactAt: now,
      closedAt: stage === "won" ? now : null,
    })
    .where(eq(deals.id, dealId));
  revalidatePath("/");
  return { ok: true };
}

export async function touchDeal(dealId: number) {
  if (!Number.isInteger(dealId)) return { ok: false };
  await db.update(deals).set({ lastContactAt: new Date() }).where(eq(deals.id, dealId));
  revalidatePath("/");
  return { ok: true };
}

export async function deleteDeal(dealId: number) {
  if (!Number.isInteger(dealId)) return { ok: false };
  await db.delete(deals).where(eq(deals.id, dealId));
  revalidatePath("/");
  return { ok: true };
}

export async function createContact(input: {
  name: string;
  company: string;
  role: string;
  email: string;
  phone?: string;
}) {
  const name = input.name.trim();
  const company = input.company.trim();
  const role = input.role.trim();
  const email = input.email.trim();
  const phone = input.phone?.trim() || null;

  if (!name || !company || !role || !email) {
    return { ok: false, message: "Please complete all required fields." };
  }

  await db.insert(contacts).values({
    name,
    company,
    role,
    email,
    phone,
    initials: initialsFromName(name),
    status: "Active",
  });

  revalidatePath("/");
  return { ok: true, message: "Contact added." };
}

export async function deleteContact(contactId: number) {
  if (!Number.isInteger(contactId)) return { ok: false };
  await db.delete(contacts).where(eq(contacts.id, contactId));
  revalidatePath("/");
  return { ok: true };
}

export async function createTask(input: {
  title: string;
  company: string;
  type: string;
  dueLabel: string;
}) {
  const title = input.title.trim();
  const company = input.company.trim();
  const dueLabel = input.dueLabel.trim();
  const type = validTaskTypes.has(input.type) ? input.type : "Call";

  if (!title || !company || !dueLabel) {
    return { ok: false, message: "Please complete all required fields." };
  }

  await db.insert(tasks).values({ title, company, type, dueLabel, completed: false });
  revalidatePath("/");
  return { ok: true, message: "Activity scheduled." };
}

export async function setTaskCompleted(taskId: number, completed: boolean) {
  if (!Number.isInteger(taskId)) {
    return { ok: false };
  }

  await db.update(tasks).set({ completed }).where(eq(tasks.id, taskId));
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTask(taskId: number) {
  if (!Number.isInteger(taskId)) return { ok: false };
  await db.delete(tasks).where(eq(tasks.id, taskId));
  revalidatePath("/");
  return { ok: true };
}

/** Loads the bundled sample dataset — only if the workspace is currently
 * empty. Never runs automatically; only ever triggered by an explicit
 * button so a fresh database stays genuinely empty until asked otherwise. */
export async function loadSampleData() {
  const result = await seedSampleData();
  revalidatePath("/");
  return result.inserted
    ? { ok: true, message: "Sample data loaded." }
    : { ok: true, message: "Workspace already has data — nothing changed." };
}

/** Permanently deletes every deal, contact, task, and metric snapshot in the
 * sales workspace. Irreversible — the UI confirms with the person before
 * calling this. */
export async function resetWorkspace() {
  await db.delete(tasks);
  await db.delete(deals);
  await db.delete(contacts);
  await db.delete(metricSnapshots);
  revalidatePath("/");
  return { ok: true, message: "Workspace cleared." };
}
