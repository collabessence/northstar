"use server";

import { parseCvText, type ParsedCvFields } from "@/lib/cv-parser";

type ParseCvResult =
  | { ok: true; fields: ParsedCvFields; rawTextPreview: string }
  | { ok: false; message: string };

/**
 * Extracts text from an uploaded CV (PDF or DOCX) and runs local regex
 * heuristics over it — no external API calls. Returns extracted fields for
 * the person to review and correct before a candidate record is actually
 * created; nothing is written to the database here.
 */
export async function parseCvFile(formData: FormData): Promise<ParseCvResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, message: "No file was uploaded." };
  }

  const name = file.name.toLowerCase();
  const isPdf = name.endsWith(".pdf");
  const isDocx = name.endsWith(".docx");

  if (!isPdf && !isDocx) {
    return { ok: false, message: "Please upload a .pdf or .docx file." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";

  try {
    if (isPdf) {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      text = data.text;
    } else {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    }
  } catch {
    return { ok: false, message: "Could not read this file. It may be corrupted, scanned as an image, or password-protected." };
  }

  if (!text || text.trim().length < 20) {
    return { ok: false, message: "Couldn't find readable text in this file. Scanned/image-only PDFs aren't supported." };
  }

  const fields = parseCvText(text);
  return { ok: true, fields, rawTextPreview: text.slice(0, 400) };
}
