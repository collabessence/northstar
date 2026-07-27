import { db } from "@/db";
import { candidates, jobOrders, placements, recruitmentClients, recruitmentTasks } from "@/db/recruitment-schema";
import { feeForSalary } from "@/lib/recruitment-metrics";
import { sql } from "drizzle-orm";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function ago(ms: number) {
  return new Date(Date.now() - ms);
}

/**
 * Inserts sample data — but only if the recruitment workspace is currently
 * empty. Never runs automatically; only ever triggered by an explicit
 * "Load sample data" button.
 */
export async function seedRecruitmentSampleData(): Promise<{ inserted: boolean }> {
  await db.execute(sql`SELECT pg_advisory_lock(4839202)`);
  try {
    const existing = await db.select({ id: recruitmentClients.id }).from(recruitmentClients).limit(1);
    if (existing.length > 0) return { inserted: false };

    const [atlas, vertex, meridian, kiteworks] = await db
      .insert(recruitmentClients)
      .values([
        { name: "Atlas Labs", industry: "B2B SaaS", contactName: "Priya Shah", contactEmail: "priya@atlaslabs.io", contactPhone: "+1 415 555 0142", status: "Active" },
        { name: "Vertex AI", industry: "Applied AI", contactName: "Daniel Cho", contactEmail: "daniel@vertex.ai", contactPhone: "+1 415 555 0198", status: "Active" },
        { name: "Meridian Health", industry: "Healthcare tech", contactName: "Grace Idowu", contactEmail: "grace@meridian.health", contactPhone: null, status: "Active" },
        { name: "Kiteworks", industry: "Fintech infrastructure", contactName: "Owen Bright", contactEmail: "owen@kiteworks.eu", contactPhone: null, status: "Prospect" },
      ])
      .returning({ id: recruitmentClients.id });

    const [jo1, jo2, jo3, jo4, jo5] = await db
      .insert(jobOrders)
      .values([
        { title: "Senior Backend Engineer", clientId: atlas.id, seniority: "Senior", employmentType: "Permanent", salaryMin: 150000, salaryMax: 175000, feePercentage: 22, openings: 1, status: "Open", priority: "High", openedAt: ago(18 * DAY) },
        { title: "Product Designer", clientId: atlas.id, seniority: "Mid", employmentType: "Permanent", salaryMin: 110000, salaryMax: 130000, feePercentage: 20, openings: 1, status: "Open", priority: "Medium", openedAt: ago(9 * DAY) },
        { title: "Machine Learning Engineer", clientId: vertex.id, seniority: "Senior", employmentType: "Permanent", salaryMin: 165000, salaryMax: 195000, feePercentage: 22, openings: 2, status: "Open", priority: "High", openedAt: ago(25 * DAY) },
        { title: "Engineering Manager", clientId: meridian.id, seniority: "Lead", employmentType: "Permanent", salaryMin: 180000, salaryMax: 210000, feePercentage: 25, openings: 1, status: "Open", priority: "High", openedAt: ago(40 * DAY) },
        { title: "Solutions Architect", clientId: kiteworks.id, seniority: "Senior", employmentType: "Contract", salaryMin: 140000, salaryMax: 160000, feePercentage: 18, openings: 1, status: "OnHold", priority: "Low", openedAt: ago(5 * DAY) },
      ])
      .returning({ id: jobOrders.id });

    const [c1, c2, c3, c4, c5, c6, c7] = await db
      .insert(candidates)
      .values([
        { name: "Jordan Reyes", email: "jordan.reyes@mail.com", phone: "+1 628 555 0110", currentTitle: "Senior Backend Engineer", currentCompany: "Northline", location: "Austin, TX", skills: ["Go", "PostgreSQL", "Kubernetes"], yearsExperience: 7, desiredSalary: 168000, availability: "Immediate", source: "Referral", status: "Active", resumeSummary: "7 years building distributed payment systems; led a 5-engineer platform team.", lastContactAt: ago(3 * HOUR) },
        { name: "Priya Nair", email: "priya.nair@mail.com", phone: "+1 646 555 0176", currentTitle: "Product Designer", currentCompany: "Fieldstone", location: "Remote (US)", skills: ["Figma", "Design systems", "User research"], yearsExperience: 5, desiredSalary: 122000, availability: "1 month notice", source: "Sourced", status: "Active", resumeSummary: "Led design system rebuild for a Series B fintech; strong systems thinker.", lastContactAt: ago(1 * DAY) },
        { name: "Marcus Webb", email: "marcus.webb@mail.com", phone: null, currentTitle: "ML Engineer", currentCompany: "Delta Signal", location: "Seattle, WA", skills: ["PyTorch", "MLOps", "Python"], yearsExperience: 6, desiredSalary: 178000, availability: "2 weeks notice", source: "Network", status: "Active", resumeSummary: "Shipped recommendation models at scale; strong MLOps background.", lastContactAt: ago(6 * HOUR) },
        { name: "Elena Cruz", email: "elena.cruz@mail.com", phone: "+1 212 555 0133", currentTitle: "Engineering Manager", currentCompany: "Coastline Health", location: "Boston, MA", skills: ["Leadership", "Healthcare systems", "Roadmapping"], yearsExperience: 10, desiredSalary: 195000, availability: "1 month notice", source: "Referral", status: "Active", resumeSummary: "Managed 12-person platform org at a healthtech scale-up.", lastContactAt: ago(2 * DAY) },
        { name: "Sam O'Neill", email: "sam.oneill@mail.com", phone: null, currentTitle: "Backend Engineer", currentCompany: "Alto Systems", location: "Denver, CO", skills: ["Node.js", "AWS", "PostgreSQL"], yearsExperience: 4, desiredSalary: 142000, availability: "Immediate", source: "Applied", status: "Active", resumeSummary: "Solid generalist backend engineer, quick ramp-up on new stacks.", lastContactAt: ago(4 * DAY) },
        { name: "Ines Torres", email: "ines.torres@mail.com", phone: "+1 917 555 0155", currentTitle: "ML Engineer", currentCompany: "Vantage Analytics", location: "Remote (US)", skills: ["TensorFlow", "Data pipelines", "Python"], yearsExperience: 5, desiredSalary: 172000, availability: "2 weeks notice", source: "Sourced", status: "Active", resumeSummary: "Built the core recommendation pipeline serving 4M weekly users.", lastContactAt: ago(10 * HOUR) },
        { name: "Diego Fischer", email: "diego.fischer@mail.com", phone: null, currentTitle: "Solutions Architect", currentCompany: "Bridgeway", location: "Chicago, IL", skills: ["Systems design", "Fintech", "Client delivery"], yearsExperience: 9, desiredSalary: 150000, availability: "1 month notice", source: "Network", status: "Active", resumeSummary: "Client-facing architect with deep fintech infra background.", lastContactAt: ago(6 * DAY) },
      ])
      .returning({ id: candidates.id });

    await db.insert(placements).values([
      {
        candidateId: c1.id, jobOrderId: jo1.id, stage: "offer",
        agreedSalary: 168000, feeAmount: feeForSalary(168000, 22), commissionRate: 20,
        submittedAt: ago(14 * DAY), interviewAt: ago(8 * DAY), offerAt: ago(1 * DAY),
        lastActivityAt: ago(1 * DAY), guaranteeDays: 90,
      },
      {
        candidateId: c2.id, jobOrderId: jo2.id, stage: "client_interview",
        submittedAt: ago(6 * DAY), interviewAt: ago(2 * DAY),
        lastActivityAt: ago(2 * DAY), guaranteeDays: 90,
      },
      {
        candidateId: c3.id, jobOrderId: jo3.id, stage: "submitted",
        submittedAt: ago(3 * DAY),
        lastActivityAt: ago(3 * DAY), guaranteeDays: 90,
      },
      {
        candidateId: c6.id, jobOrderId: jo3.id, stage: "screened",
        lastActivityAt: ago(1 * DAY), guaranteeDays: 90,
      },
      {
        candidateId: c4.id, jobOrderId: jo4.id, stage: "submitted",
        submittedAt: ago(9 * DAY),
        lastActivityAt: ago(9 * DAY), guaranteeDays: 120,
      },
      {
        candidateId: c5.id, jobOrderId: jo1.id, stage: "sourced",
        lastActivityAt: ago(5 * DAY), guaranteeDays: 90,
      },
      {
        candidateId: c7.id, jobOrderId: jo5.id, stage: "sourced",
        lastActivityAt: ago(4 * DAY), guaranteeDays: 90,
      },
    ]);

    // A couple of already-completed placements so the fee revenue chart and
    // time-to-fill metric have real history to compute from on day one.
    const [oldJobOrder] = await db
      .insert(jobOrders)
      .values({
        title: "Staff Backend Engineer", clientId: vertex.id, seniority: "Lead", employmentType: "Permanent",
        salaryMin: 185000, salaryMax: 210000, feePercentage: 22, openings: 1, status: "Filled", priority: "High",
        openedAt: ago(55 * DAY),
      })
      .returning({ id: jobOrders.id });

    const [placedCandidate] = await db
      .insert(candidates)
      .values({
        name: "Wren Abara", email: "wren.abara@mail.com", phone: null, currentTitle: "Staff Backend Engineer",
        currentCompany: "Formerly at Delta Signal", location: "Remote (US)", skills: ["Go", "Distributed systems"],
        yearsExperience: 8, desiredSalary: 198000, availability: "Placed", source: "Referral", status: "Placed",
        resumeSummary: "Placed at Vertex AI as Staff Backend Engineer.", lastContactAt: ago(20 * DAY),
      })
      .returning({ id: candidates.id });

    await db.insert(placements).values({
      candidateId: placedCandidate.id, jobOrderId: oldJobOrder.id, stage: "placed",
      agreedSalary: 198000, feeAmount: feeForSalary(198000, 22), commissionRate: 20,
      submittedAt: ago(48 * DAY), interviewAt: ago(38 * DAY), offerAt: ago(22 * DAY), placedAt: ago(20 * DAY),
      lastActivityAt: ago(20 * DAY), guaranteeDays: 90,
    });

    await db.insert(recruitmentTasks).values([
      { title: "Confirm offer acceptance", relatedLabel: "Jordan Reyes · Senior Backend Engineer", candidateId: c1.id, type: "Call", dueLabel: "Due today", completed: false },
      { title: "Collect interview feedback", relatedLabel: "Priya Nair · Product Designer", candidateId: c2.id, type: "Reference check", dueLabel: "Due tomorrow", completed: false },
      { title: "Schedule client submission call", relatedLabel: "Marcus Webb · ML Engineer", candidateId: c3.id, type: "Call", dueLabel: "Fri, 2:00 PM", completed: false },
      { title: "Re-engage idle candidate", relatedLabel: "Sam O'Neill · Backend Engineer", candidateId: c5.id, type: "Email", dueLabel: "This week", completed: false },
      { title: "Send updated job brief", relatedLabel: "Kiteworks · Solutions Architect", type: "Email", dueLabel: "Next week", completed: false },
      { title: "Reference check follow-up", relatedLabel: "Elena Cruz · Engineering Manager", candidateId: c4.id, type: "Reference check", dueLabel: "Completed", completed: true },
    ]);

    return { inserted: true };
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(4839202)`);
  }
}
