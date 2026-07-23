"use server";

import { db } from "@/db";
import { candidates, jobOrders, placements, recruitmentClients, recruitmentSnapshots, recruitmentTasks } from "@/db/recruitment-schema";
import { feeForSalary, nextStage, type PipelineStageKey } from "@/lib/recruitment-metrics";
import { seedRecruitmentSampleData } from "./seed";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const validStages = new Set(["sourced", "screened", "submitted", "client_interview", "offer", "placed", "fell_through"]);
const validTaskTypes = new Set(["Call", "Email", "Interview", "Submission", "Reference check"]);

// ---------- Clients ----------

export async function createClient(input: {
  name: string;
  industry: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
}) {
  const name = input.name.trim();
  const industry = input.industry.trim();
  const contactName = input.contactName.trim();
  const contactEmail = input.contactEmail.trim();
  if (!name || !industry || !contactName || !contactEmail) {
    return { ok: false, message: "Please complete all required fields." };
  }
  await db.insert(recruitmentClients).values({
    name,
    industry,
    contactName,
    contactEmail,
    contactPhone: input.contactPhone?.trim() || null,
  });
  revalidatePath("/recruitment");
  return { ok: true, message: "Client added." };
}

export async function updateClient(
  clientId: number,
  input: { name: string; industry: string; contactName: string; contactEmail: string; contactPhone?: string },
) {
  const name = input.name.trim();
  const industry = input.industry.trim();
  const contactName = input.contactName.trim();
  const contactEmail = input.contactEmail.trim();
  if (!Number.isInteger(clientId) || !name || !industry || !contactName || !contactEmail) {
    return { ok: false, message: "Please complete all required fields." };
  }
  await db
    .update(recruitmentClients)
    .set({ name, industry, contactName, contactEmail, contactPhone: input.contactPhone?.trim() || null })
    .where(eq(recruitmentClients.id, clientId));
  revalidatePath("/recruitment");
  return { ok: true, message: "Client updated." };
}

export async function deleteClient(clientId: number) {
  if (!Number.isInteger(clientId)) return { ok: false };
  await db.delete(recruitmentClients).where(eq(recruitmentClients.id, clientId));
  revalidatePath("/recruitment");
  return { ok: true };
}

// ---------- Candidates ----------

export async function createCandidate(input: {
  name: string;
  email: string;
  phone?: string;
  birthDate?: string;
  currentTitle: string;
  currentCompany?: string;
  location: string;
  skills: string;
  yearsExperience: number;
  desiredSalary: number;
  availability: string;
  source: string;
}) {
  const name = input.name.trim();
  const email = input.email.trim();
  const currentTitle = input.currentTitle.trim();
  const location = input.location.trim();
  const skills = input.skills
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
  const desiredSalary = Math.round(Number(input.desiredSalary));
  const yearsExperience = Math.round(Number(input.yearsExperience));

  if (!name || !email || !currentTitle || !location || !Number.isFinite(desiredSalary) || desiredSalary <= 0) {
    return { ok: false, message: "Please complete all required fields with a valid salary." };
  }

  await db.insert(candidates).values({
    name,
    email,
    phone: input.phone?.trim() || null,
    birthDate: input.birthDate?.trim() || null,
    currentTitle,
    currentCompany: input.currentCompany?.trim() || null,
    location,
    skills,
    yearsExperience: Number.isFinite(yearsExperience) ? yearsExperience : 0,
    desiredSalary,
    availability: input.availability.trim() || "2 weeks notice",
    source: input.source.trim() || "Sourced",
    status: "Active",
    lastContactAt: new Date(),
  });

  revalidatePath("/recruitment");
  return { ok: true, message: "Candidate added to your talent pool." };
}

export async function deleteCandidate(candidateId: number) {
  if (!Number.isInteger(candidateId)) return { ok: false };
  await db.delete(candidates).where(eq(candidates.id, candidateId));
  revalidatePath("/recruitment");
  return { ok: true };
}

export async function updateCandidate(
  candidateId: number,
  input: {
    name: string;
    email: string;
    phone?: string;
    birthDate?: string;
    currentTitle: string;
    currentCompany?: string;
    location: string;
    skills: string;
    yearsExperience: number;
    desiredSalary: number;
    availability: string;
    source: string;
  },
) {
  const name = input.name.trim();
  const email = input.email.trim();
  const currentTitle = input.currentTitle.trim();
  const location = input.location.trim();
  const skills = input.skills
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
  const desiredSalary = Math.round(Number(input.desiredSalary));
  const yearsExperience = Math.round(Number(input.yearsExperience));

  if (
    !Number.isInteger(candidateId) ||
    !name ||
    !email ||
    !currentTitle ||
    !location ||
    !Number.isFinite(desiredSalary) ||
    desiredSalary <= 0
  ) {
    return { ok: false, message: "Please complete all required fields with a valid salary." };
  }

  await db
    .update(candidates)
    .set({
      name,
      email,
      phone: input.phone?.trim() || null,
      birthDate: input.birthDate?.trim() || null,
      currentTitle,
      currentCompany: input.currentCompany?.trim() || null,
      location,
      skills,
      yearsExperience: Number.isFinite(yearsExperience) ? yearsExperience : 0,
      desiredSalary,
      availability: input.availability.trim() || "2 weeks notice",
      source: input.source.trim() || "Sourced",
    })
    .where(eq(candidates.id, candidateId));

  revalidatePath("/recruitment");
  return { ok: true, message: "Candidate updated." };
}

export async function touchCandidate(candidateId: number) {
  if (!Number.isInteger(candidateId)) return { ok: false };
  await db.update(candidates).set({ lastContactAt: new Date() }).where(eq(candidates.id, candidateId));
  revalidatePath("/recruitment");
  return { ok: true };
}

// ---------- Job orders ----------

export async function createJobOrder(input: {
  title: string;
  clientId: number;
  seniority: string;
  employmentType: string;
  salaryMin: number;
  salaryMax: number;
  feePercentage: number;
  openings: number;
  priority: string;
}) {
  const title = input.title.trim();
  const clientId = Math.round(Number(input.clientId));
  const salaryMin = Math.round(Number(input.salaryMin));
  const salaryMax = Math.round(Number(input.salaryMax));
  const feePercentage = Number(input.feePercentage);
  const openings = Math.max(1, Math.round(Number(input.openings)) || 1);

  if (!title || !Number.isInteger(clientId) || !Number.isFinite(salaryMin) || !Number.isFinite(salaryMax) || salaryMin <= 0 || salaryMax < salaryMin) {
    return { ok: false, message: "Please complete all required fields with a valid salary range." };
  }

  await db.insert(jobOrders).values({
    title,
    clientId,
    seniority: input.seniority || "Mid",
    employmentType: input.employmentType || "Permanent",
    salaryMin,
    salaryMax,
    feePercentage: Number.isFinite(feePercentage) && feePercentage > 0 ? feePercentage : 20,
    openings,
    priority: input.priority || "Medium",
    status: "Open",
  });

  revalidatePath("/recruitment");
  return { ok: true, message: "Job order opened." };
}

export async function updateJobOrderStatus(jobOrderId: number, status: string) {
  if (!Number.isInteger(jobOrderId)) return { ok: false };
  await db.update(jobOrders).set({ status }).where(eq(jobOrders.id, jobOrderId));
  revalidatePath("/recruitment");
  return { ok: true };
}

export async function updateJobOrder(
  jobOrderId: number,
  input: {
    title: string;
    clientId: number;
    seniority: string;
    employmentType: string;
    salaryMin: number;
    salaryMax: number;
    feePercentage: number;
    openings: number;
    priority: string;
  },
) {
  const title = input.title.trim();
  const clientId = Math.round(Number(input.clientId));
  const salaryMin = Math.round(Number(input.salaryMin));
  const salaryMax = Math.round(Number(input.salaryMax));
  const feePercentage = Number(input.feePercentage);
  const openings = Math.max(1, Math.round(Number(input.openings)) || 1);

  if (
    !Number.isInteger(jobOrderId) ||
    !title ||
    !Number.isInteger(clientId) ||
    !Number.isFinite(salaryMin) ||
    !Number.isFinite(salaryMax) ||
    salaryMin <= 0 ||
    salaryMax < salaryMin
  ) {
    return { ok: false, message: "Please complete all required fields with a valid salary range." };
  }

  await db
    .update(jobOrders)
    .set({
      title,
      clientId,
      seniority: input.seniority || "Mid",
      employmentType: input.employmentType || "Permanent",
      salaryMin,
      salaryMax,
      feePercentage: Number.isFinite(feePercentage) && feePercentage > 0 ? feePercentage : 20,
      openings,
      priority: input.priority || "Medium",
    })
    .where(eq(jobOrders.id, jobOrderId));

  revalidatePath("/recruitment");
  return { ok: true, message: "Job order updated." };
}

export async function deleteJobOrder(jobOrderId: number) {
  if (!Number.isInteger(jobOrderId)) return { ok: false };
  await db.delete(jobOrders).where(eq(jobOrders.id, jobOrderId));
  revalidatePath("/recruitment");
  return { ok: true };
}

// ---------- Placements (pipeline) ----------

export async function createPlacement(input: { candidateId: number; jobOrderId: number }) {
  const candidateId = Math.round(Number(input.candidateId));
  const jobOrderId = Math.round(Number(input.jobOrderId));
  if (!Number.isInteger(candidateId) || !Number.isInteger(jobOrderId)) {
    return { ok: false, message: "Select both a candidate and a job order." };
  }

  await db.insert(placements).values({
    candidateId,
    jobOrderId,
    stage: "sourced",
    lastActivityAt: new Date(),
  });

  revalidatePath("/recruitment");
  return { ok: true, message: "Candidate added to the pipeline." };
}

/**
 * Moves a placement to a new stage. When moving into "offer", locks in the
 * fee based on the job order's fee % and the agreed salary — this fee value
 * then stays fixed even if the job order's fee % changes later, which is
 * how real recruitment finance actually works (the fee is set at the time
 * of the deal, not recalculated retroactively).
 */
export async function movePlacement(
  placementId: number,
  stage: string,
  agreedSalary?: number,
) {
  if (!Number.isInteger(placementId) || !validStages.has(stage)) {
    return { ok: false };
  }

  const [existing] = await db.select().from(placements).where(eq(placements.id, placementId));
  if (!existing) return { ok: false };

  const now = new Date();
  const patch: Record<string, unknown> = {
    stage,
    lastActivityAt: now,
  };

  if (stage === "submitted" && !existing.submittedAt) patch.submittedAt = now;
  if (stage === "client_interview" && !existing.interviewAt) patch.interviewAt = now;

  if (stage === "offer") {
    patch.offerAt = existing.offerAt ?? now;
    if (agreedSalary && agreedSalary > 0) {
      const [jobOrder] = await db.select().from(jobOrders).where(eq(jobOrders.id, existing.jobOrderId));
      patch.agreedSalary = Math.round(agreedSalary);
      patch.feeAmount = jobOrder ? feeForSalary(Math.round(agreedSalary), jobOrder.feePercentage) : existing.feeAmount;
    }
  }

  if (stage === "placed") {
    patch.placedAt = now;
    if (!existing.feeAmount && existing.agreedSalary) {
      const [jobOrder] = await db.select().from(jobOrders).where(eq(jobOrders.id, existing.jobOrderId));
      patch.feeAmount = jobOrder ? feeForSalary(existing.agreedSalary, jobOrder.feePercentage) : null;
    }
    // Mark the candidate placed and bump the job order's filled count.
    await db.update(candidates).set({ status: "Placed" }).where(eq(candidates.id, existing.candidateId));
  }

  if (stage === "fell_through") {
    patch.fellThroughReason = "Marked as fell through";
  }

  await db.update(placements).set(patch).where(eq(placements.id, placementId));
  revalidatePath("/recruitment");
  return { ok: true };
}

export async function advancePlacement(placementId: number) {
  const [existing] = await db.select().from(placements).where(eq(placements.id, placementId));
  if (!existing) return { ok: false };
  const target = nextStage(existing.stage as PipelineStageKey);
  return movePlacement(placementId, target);
}

export async function deletePlacement(placementId: number) {
  if (!Number.isInteger(placementId)) return { ok: false };
  await db.delete(placements).where(eq(placements.id, placementId));
  revalidatePath("/recruitment");
  return { ok: true };
}

// ---------- Tasks ----------

export async function createRecruitmentTask(input: {
  title: string;
  relatedLabel: string;
  type: string;
  dueLabel: string;
}) {
  const title = input.title.trim();
  const relatedLabel = input.relatedLabel.trim();
  const dueLabel = input.dueLabel.trim();
  const type = validTaskTypes.has(input.type) ? input.type : "Call";

  if (!title || !relatedLabel || !dueLabel) {
    return { ok: false, message: "Please complete all required fields." };
  }

  await db.insert(recruitmentTasks).values({ title, relatedLabel, type, dueLabel, completed: false });
  revalidatePath("/recruitment");
  return { ok: true, message: "Activity scheduled." };
}

export async function setRecruitmentTaskCompleted(taskId: number, completed: boolean) {
  if (!Number.isInteger(taskId)) return { ok: false };
  await db.update(recruitmentTasks).set({ completed }).where(eq(recruitmentTasks.id, taskId));
  revalidatePath("/recruitment");
  return { ok: true };
}

export async function deleteRecruitmentTask(taskId: number) {
  if (!Number.isInteger(taskId)) return { ok: false };
  await db.delete(recruitmentTasks).where(eq(recruitmentTasks.id, taskId));
  revalidatePath("/recruitment");
  return { ok: true };
}

/** Loads the bundled sample dataset — only if the recruitment workspace is
 * currently empty. Never runs automatically. */
export async function loadRecruitmentSampleData() {
  const result = await seedRecruitmentSampleData();
  revalidatePath("/recruitment");
  return result.inserted
    ? { ok: true, message: "Sample data loaded." }
    : { ok: true, message: "Workspace already has data — nothing changed." };
}

/** Permanently deletes every client, candidate, job order, placement, task,
 * and metric snapshot in the recruitment workspace. Irreversible — the UI
 * confirms with the person before calling this. Deleted in dependency order
 * so it doesn't rely solely on cascade rules. */
export async function resetRecruitmentWorkspace() {
  await db.delete(placements);
  await db.delete(candidates);
  await db.delete(jobOrders);
  await db.delete(recruitmentClients);
  await db.delete(recruitmentTasks);
  await db.delete(recruitmentSnapshots);
  revalidatePath("/recruitment");
  return { ok: true, message: "Workspace cleared." };
}
