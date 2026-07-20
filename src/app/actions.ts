"use server";

import { db } from "@/db";
import { activityLog, contacts, deals, metricSnapshots, tasks } from "@/db/schema";
import { logActivity } from "@/db/activity";
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
  notes?: string;
}) {
  const title = input.title.trim();
  const company = input.company.trim();
  const contactName = input.contactName.trim();
  const email = input.email.trim();
  const value = Math.round(Number(input.value));
  const stage = validStages.has(input.stage) ? input.stage : "new";
  const notes = input.notes?.trim() || null;

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
    notes,
    probability: stageProbability(stage),
    temperature: stage === "proposal" ? "Hot" : "Warm",
    ownerInitials: initialsFromName(contactName) || "AM",
    dueLabel: "This week",
    lastContactAt: now,
    closedAt: stage === "won" ? now : null,
  });

  await logActivity(`New opportunity added: ${title} (${company})`, "deal");
  revalidatePath("/");
  return { ok: true, message: "Opportunity added to your pipeline." };
}

export async function updateDeal(
  dealId: number,
  input: { title: string; company: string; contactName: string; email: string; value: number; stage: string; notes?: string },
) {
  const title = input.title.trim();
  const company = input.company.trim();
  const contactName = input.contactName.trim();
  const email = input.email.trim();
  const value = Math.round(Number(input.value));
  const stage = validStages.has(input.stage) ? input.stage : "new";
  const notes = input.notes?.trim() || null;

  if (!Number.isInteger(dealId) || !title || !company || !contactName || !email || !Number.isFinite(value) || value <= 0) {
    return { ok: false, message: "Please complete all fields with a valid deal value." };
  }

  const [existing] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!existing) return { ok: false, message: "This deal no longer exists." };

  const stageChanged = existing.stage !== stage;
  await db
    .update(deals)
    .set({
      title,
      company,
      contactName,
      email,
      value,
      stage,
      notes,
      probability: stageChanged ? stageProbability(stage) : existing.probability,
      closedAt: stage === "won" ? (existing.closedAt ?? new Date()) : stage !== "won" ? null : existing.closedAt,
    })
    .where(eq(deals.id, dealId));

  revalidatePath("/");
  return { ok: true, message: "Opportunity updated." };
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

  const [movedDeal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (movedDeal) {
    if (stage === "won") {
      await logActivity(`🎉 Deal won: ${movedDeal.title} (${movedDeal.company}) — ${movedDeal.value.toLocaleString("pl-PL")} zł`, "deal");
    } else {
      await logActivity(`${movedDeal.title} moved to ${stage}`, "deal");
    }
  }

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
  const [existing] = await db.select().from(deals).where(eq(deals.id, dealId));
  await db.delete(deals).where(eq(deals.id, dealId));
  if (existing) await logActivity(`Opportunity deleted: ${existing.title}`, "deal");
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

  await logActivity(`New contact added: ${name} (${company})`, "contact");
  revalidatePath("/");
  return { ok: true, message: "Contact added." };
}

export async function updateContact(
  contactId: number,
  input: { name: string; company: string; role: string; email: string; phone?: string },
) {
  const name = input.name.trim();
  const company = input.company.trim();
  const role = input.role.trim();
  const email = input.email.trim();
  const phone = input.phone?.trim() || null;

  if (!Number.isInteger(contactId) || !name || !company || !role || !email) {
    return { ok: false, message: "Please complete all required fields." };
  }

  await db
    .update(contacts)
    .set({ name, company, role, email, phone, initials: initialsFromName(name) })
    .where(eq(contacts.id, contactId));

  revalidatePath("/");
  return { ok: true, message: "Contact updated." };
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
  dueAt?: string; // ISO datetime string from a <input type="datetime-local">
}) {
  const title = input.title.trim();
  const company = input.company.trim();
  const dueLabel = input.dueLabel.trim();
  const type = validTaskTypes.has(input.type) ? input.type : "Call";
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;

  if (!title || !company || !dueLabel) {
    return { ok: false, message: "Please complete all required fields." };
  }

  await db.insert(tasks).values({
    title,
    company,
    type,
    dueLabel,
    dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
    completed: false,
  });
  await logActivity(`Activity scheduled: ${title} (${company})`, "task");
  revalidatePath("/");
  return { ok: true, message: "Activity scheduled." };
}

export async function setTaskCompleted(taskId: number, completed: boolean) {
  if (!Number.isInteger(taskId)) {
    return { ok: false };
  }

  await db.update(tasks).set({ completed }).where(eq(tasks.id, taskId));
  if (completed) {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (task) await logActivity(`Task completed: ${task.title}`, "task");
  }
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
  await db.delete(activityLog);
  revalidatePath("/");
  return { ok: true, message: "Workspace cleared." };
}
