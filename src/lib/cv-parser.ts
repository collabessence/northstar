// Heuristic, regex-based CV field extraction. No external AI/API calls —
// works entirely offline. Deliberately conservative: when a field can't be
// found with reasonable confidence, it's left blank rather than guessed,
// so the review step never has to un-do a wrong guess silently baked in.

export type ParsedCvFields = {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null; // ISO YYYY-MM-DD
  city: string | null;
};

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

export function extractPhone(text: string): string | null {
  // Polish mobile/landline formats: +48 XXX XXX XXX, 0XX XXX XX XX, or 9
  // bare digits, optionally grouped with spaces/dashes.
  const candidates = text.match(/(?:\+?48[\s-]?)?(?:\d[\s-]?){9}/g) ?? [];
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, "");
    const normalized = digits.length === 11 && digits.startsWith("48") ? digits.slice(2) : digits;
    if (normalized.length === 9) {
      return `+48 ${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6, 9)}`;
    }
  }
  return null;
}

export function extractBirthDate(text: string): string | null {
  // Only trust dates that sit next to an explicit label — picking up the
  // first date-looking string on the page (a job start date, a graduation
  // year) would be worse than leaving this blank.
  const labelPattern =
    /(?:data\s+urodzenia|data\s+ur\.?|ur(?:odzon[ay])?\.?)\s*[:\-]?\s*(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/i;
  const match = text.match(labelPattern);
  if (!match) return null;
  const [, day, month, year] = match;
  const d = day.padStart(2, "0");
  const m = month.padStart(2, "0");
  const dayNum = Number(day);
  const monthNum = Number(month);
  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) return null;
  return `${year}-${m}-${d}`;
}

export function extractCity(text: string): string | null {
  // 1) Explicit label: "Miejscowość: Warszawa", "Miasto: Kraków"
  const labeled = firstMatch(text, [
    /(?:miejscowo[śs][ćc])\s*[:\-]?\s*([A-ZŁŚŻŹĆŃÓĄĘ][\p{L}\-]+)/iu,
    /(?:miasto)\s*[:\-]?\s*([A-ZŁŚŻŹĆŃÓĄĘ][\p{L}\-]+)/iu,
    /(?:lokalizacja)\s*[:\-]?\s*([A-ZŁŚŻŹĆŃÓĄĘ][\p{L}\-]+)/iu,
  ]);
  if (labeled) return labeled;

  // 2) Polish postal code followed by a city name, e.g. "00-950 Warszawa"
  const postal = text.match(/\d{2}-\d{3}\s+([A-ZŁŚŻŹĆŃÓĄĘ][\p{L}\-]+)/u);
  if (postal?.[1]) return postal[1];

  return null;
}

export function extractName(text: string): { firstName: string | null; lastName: string | null; fullName: string | null } {
  // 1) Explicit labels are the most reliable signal.
  const labeledFull = firstMatch(text, [/(?:imi[ęe]\s+i\s+nazwisko)\s*[:\-]?\s*([\p{L}\-]+\s+[\p{L}\-]+)/iu]);
  if (labeledFull) {
    const parts = labeledFull.split(/\s+/);
    return { firstName: parts[0] ?? null, lastName: parts.slice(1).join(" ") || null, fullName: labeledFull };
  }

  const labeledFirst = firstMatch(text, [/(?:imi[ęe])\s*[:\-]\s*([\p{L}\-]+)/iu]);
  const labeledLast = firstMatch(text, [/(?:nazwisko)\s*[:\-]\s*([\p{L}\-]+)/iu]);
  if (labeledFirst || labeledLast) {
    const fullName = [labeledFirst, labeledLast].filter(Boolean).join(" ") || null;
    return { firstName: labeledFirst, lastName: labeledLast, fullName };
  }

  // 2) Fallback: the first line of the document that looks like "Firstname
  // Lastname" — two capitalized words, no digits, not a CV header word.
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 15); // only look near the top of the document

  const skipWords = /curriculum|resume|\bcv\b|życiorys/i;
  // "Jan Kowalski" style (title case).
  const titleCasePattern = /^([\p{Lu}][\p{Ll}\-]+)\s+([\p{Lu}][\p{Ll}\-]+)$/u;
  // "JAN KOWALSKI" style — very common as a CV header — every letter
  // uppercase, two to three words, nothing else on the line.
  const allCapsPattern = /^([\p{Lu}\-]{2,})\s+([\p{Lu}\-]{2,})(?:\s+([\p{Lu}\-]{2,}))?$/u;

  for (const line of lines) {
    if (skipWords.test(line)) continue;
    const titleMatch = line.match(titleCasePattern);
    if (titleMatch) {
      return { firstName: titleMatch[1], lastName: titleMatch[2], fullName: `${titleMatch[1]} ${titleMatch[2]}` };
    }
    const capsMatch = line.match(allCapsPattern);
    if (capsMatch) {
      const toTitleCase = (word: string) => word[0] + word.slice(1).toLowerCase();
      const first = toTitleCase(capsMatch[1]);
      const last = [capsMatch[2], capsMatch[3]].filter(Boolean).map(toTitleCase).join(" ");
      return { firstName: first, lastName: last, fullName: `${first} ${last}` };
    }
  }

  return { firstName: null, lastName: null, fullName: null };
}

export function parseCvText(text: string): ParsedCvFields {
  const { firstName, lastName, fullName } = extractName(text);
  return {
    firstName,
    lastName,
    fullName,
    email: extractEmail(text),
    phone: extractPhone(text),
    birthDate: extractBirthDate(text),
    city: extractCity(text),
  };
}
