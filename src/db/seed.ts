import { db } from "@/db";
import { contacts, deals, tasks } from "@/db/schema";
import { sql } from "drizzle-orm";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function ago(ms: number) {
  return new Date(Date.now() - ms);
}

// Named separately from ago() rather than calling ago(-ms) — a negative
// duration silently meaning "the future" was exactly the kind of subtle
// bug that made every "overdue" demo task quietly not overdue at all.
function inHours(hours: number) {
  return new Date(Date.now() + hours * HOUR);
}

/**
 * Inserts sample data — but only if the workspace is currently empty. This
 * is called on demand (from a "Load sample data" action), never
 * automatically, so a fresh database starts genuinely empty rather than
 * silently filling up with demo companies the person never asked for.
 * Returns whether it actually inserted anything.
 */
export async function seedSampleData(): Promise<{ inserted: boolean }> {
  await db.execute(sql`SELECT pg_advisory_lock(4839201)`);
  try {
    const existing = await db.select({ id: deals.id }).from(deals).limit(1);
    if (existing.length > 0) return { inserted: false };

    await db.insert(deals).values([
      { title: "Enterprise workspace rollout", company: "Atlas Labs", contactName: "Mia Chen", email: "mia@atlaslabs.io", value: 42000, stage: "proposal", probability: 78, temperature: "Hot", ownerInitials: "MC", dueLabel: "Due tomorrow", lastContactAt: ago(12 * MIN), createdAt: ago(9 * DAY) },
      { title: "Customer data consolidation", company: "Vertex AI", contactName: "Noah Williams", email: "noah@vertex.ai", value: 28500, stage: "qualified", probability: 48, temperature: "Warm", ownerInitials: "NW", dueLabel: "Fri, Jun 14", lastContactAt: ago(1 * HOUR), createdAt: ago(15 * DAY) },
      { title: "Regional sales expansion", company: "Nova Retail", contactName: "Sofia Patel", email: "sofia@novaretail.com", value: 36000, stage: "proposal", probability: 72, temperature: "Hot", ownerInitials: "SP", dueLabel: "This week", lastContactAt: ago(1 * DAY), createdAt: ago(11 * DAY) },
      { title: "Compliance workflow upgrade", company: "Meridian Health", contactName: "Liam Okafor", email: "liam@meridian.health", value: 18500, stage: "new", probability: 22, temperature: "Warm", ownerInitials: "LO", dueLabel: "Jun 18", lastContactAt: ago(2 * DAY), createdAt: ago(4 * DAY) },
      { title: "Multi-team CRM migration", company: "North & Finch", contactName: "Emma Larson", email: "emma@northfinch.co", value: 52000, stage: "qualified", probability: 52, temperature: "Hot", ownerInitials: "EL", dueLabel: "Jun 20", lastContactAt: ago(3 * HOUR), createdAt: ago(20 * DAY) },
      { title: "Partner portal launch", company: "Kiteworks", contactName: "Lucas Moreau", email: "lucas@kiteworks.eu", value: 15500, stage: "new", probability: 18, temperature: "Warm", ownerInitials: "LM", dueLabel: "Next week", lastContactAt: ago(4 * DAY), createdAt: ago(6 * DAY) },
      { title: "Growth operations suite", company: "Marble Studio", contactName: "Ava Johnson", email: "ava@marble.studio", value: 31000, stage: "won", probability: 100, temperature: "Hot", ownerInitials: "AJ", dueLabel: "Closed", lastContactAt: ago(6 * HOUR), createdAt: ago(34 * DAY), closedAt: ago(6 * HOUR) },
      { title: "Account planning program", company: "Fieldwork", contactName: "Ethan Brooks", email: "ethan@fieldwork.co", value: 27500, stage: "won", probability: 100, temperature: "Warm", ownerInitials: "EB", dueLabel: "Closed", lastContactAt: ago(1 * DAY), createdAt: ago(26 * DAY), closedAt: ago(1 * DAY) },
      { title: "Commercial team pilot", company: "Sundial Energy", contactName: "Isla Romero", email: "isla@sundial.energy", value: 22000, stage: "qualified", probability: 42, temperature: "Warm", ownerInitials: "IR", dueLabel: "Jun 21", lastContactAt: ago(4 * HOUR), createdAt: ago(8 * DAY) },
      { title: "Executive reporting hub", company: "Form & Co", contactName: "Theo Martin", email: "theo@formandco.com", value: 12500, stage: "new", probability: 25, temperature: "Warm", ownerInitials: "TM", dueLabel: "Jun 24", lastContactAt: ago(7 * DAY), createdAt: ago(9 * DAY) },
    ]);

    await db.insert(contacts).values([
      { name: "Mia Chen", company: "Atlas Labs", role: "VP of Revenue", email: "mia@atlaslabs.io", phone: "+1 415 555 0142", initials: "MC", status: "Active" },
      { name: "Noah Williams", company: "Vertex AI", role: "Head of Operations", email: "noah@vertex.ai", phone: "+1 415 555 0198", initials: "NW", status: "Active" },
      { name: "Sofia Patel", company: "Nova Retail", role: "Commercial Director", email: "sofia@novaretail.com", phone: "+1 628 555 0110", initials: "SP", status: "Active" },
      { name: "Liam Okafor", company: "Meridian Health", role: "IT Program Lead", email: "liam@meridian.health", phone: null, initials: "LO", status: "Active" },
      { name: "Emma Larson", company: "North & Finch", role: "Chief Revenue Officer", email: "emma@northfinch.co", phone: "+1 646 555 0176", initials: "EL", status: "Active" },
      { name: "Lucas Moreau", company: "Kiteworks", role: "Partnerships Lead", email: "lucas@kiteworks.eu", phone: null, initials: "LM", status: "Active" },
      { name: "Ava Johnson", company: "Marble Studio", role: "Founder", email: "ava@marble.studio", phone: "+1 212 555 0133", initials: "AJ", status: "Customer" },
      { name: "Ethan Brooks", company: "Fieldwork", role: "Managing Partner", email: "ethan@fieldwork.co", phone: null, initials: "EB", status: "Customer" },
    ]);

    await db.insert(tasks).values([
      // Genuinely overdue (past dueAt, not completed) — this is what makes
      // the automatic "Overdue" badge and notification actually visible
      // when exploring the app with sample data instead of silently never
      // firing.
      { title: "Send revised commercial proposal", company: "Atlas Labs", type: "Email", dueLabel: "Was due 10:30 AM", dueAt: ago(2 * HOUR), completed: false },
      { title: "Confirm security review owners", company: "Nova Retail", type: "Email", dueLabel: "Was due yesterday", dueAt: ago(1 * DAY), completed: false },
      // Upcoming (future dueAt, not overdue)
      { title: "Discovery call with buying team", company: "North & Finch", type: "Call", dueLabel: "11:00 AM", dueAt: inHours(1), completed: false },
      { title: "Product walkthrough and Q&A", company: "Vertex AI", type: "Meeting", dueLabel: "2:00 PM", dueAt: inHours(6), completed: false },
      { title: "Share migration timeline", company: "Sundial Energy", type: "Message", dueLabel: "Tomorrow", dueAt: inHours(24), completed: false },
      { title: "Update opportunity notes", company: "Meridian Health", type: "Message", dueLabel: "Completed", dueAt: ago(1 * DAY), completed: true },
    ]);

    return { inserted: true };
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(4839201)`);
  }
}
