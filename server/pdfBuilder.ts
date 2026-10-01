import PDFDocument from "pdfkit";
import { GeneratedResume, ResumeStrategy, CoverLetter } from "../src/types";

// Text-based (not rasterized) PDF so ATS parsers can extract the content —
// same structure and section order as docxBuilder.ts. Uses PDFKit's built-in
// Helvetica, which is WinAnsi-encoded, so text goes through toWinAnsi() first.

const REGULAR = "Helvetica";
const BOLD = "Helvetica-Bold";
const ITALIC = "Helvetica-Oblique";
const BODY_SIZE = 10.5;
const INK = "#111827";
const MUTED = "#4B5563";
const LINK = "#1D4ED8";
const RULE = "#1F2937";
const BULLET_INDENT = 14;

const REPLACEMENTS: Record<string, string> = {
  "→": "->", "←": "<-", "≥": ">=", "≤": "<=", "≈": "~", "×": "x", "−": "-",
  " ": " ", " ": " ", " ": " ", "​": "", "﻿": "",
};

// Characters PDFKit's standard fonts can draw: printable ASCII, Latin-1, and
// the WinAnsi extras (smart quotes, dashes, bullet, ellipsis, euro, trademark).
const WIN_ANSI_EXTRAS = "–—‘’‚“”„†‡•…‰‹›€™";

function toWinAnsi(input: unknown): string {
  const text = String(input ?? "").replace(/\r\n?/g, "\n");
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === "\n" || ch === "\t" || (code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff) || WIN_ANSI_EXTRAS.includes(ch)) {
      out += ch;
    } else if (ch in REPLACEMENTS) {
      out += REPLACEMENTS[ch];
    } else {
      // Decompose (e.g. "ł" has no mapping, but "ǎ" -> "a" + combining mark) and keep what survives.
      out += ch.normalize("NFKD").replace(/[^\x20-\x7e\xa1-\xff]/g, "");
    }
  }
  return out;
}

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 40);
  doc.moveDown(0.7);
  const top = doc.y;
  doc.font(BOLD).fontSize(10).fillColor(RULE).text(toWinAnsi(title).toUpperCase(), doc.page.margins.left, top, { lineBreak: false });
  // lineBreak:false leaves doc.y at the top of the text, so step past it manually.
  const y = top + doc.currentLineHeight() + 2;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.margins.left + contentWidth(doc), y).lineWidth(0.75).strokeColor(RULE).stroke();
  doc.y = y + 5;
  doc.x = doc.page.margins.left;
}

/** One line with left-aligned text and right-aligned text sharing a baseline. */
function splitRow(
  doc: PDFKit.PDFDocument,
  left: { text: string; font?: string; color?: string; link?: string }[],
  right: { text: string; font?: string; color?: string },
  gap: number
): void {
  ensureSpace(doc, BODY_SIZE * 2);
  const x = doc.page.margins.left;
  const w = contentWidth(doc);
  const y = doc.y;
  doc.fontSize(BODY_SIZE);

  if (right.text) {
    doc.font(right.font || REGULAR);
    const rw = doc.widthOfString(right.text);
    doc.fillColor(right.color || INK).text(right.text, x + w - rw, y, { lineBreak: false });
  }

  doc.x = x;
  doc.y = y;
  left.forEach((run, i) => {
    doc.font(run.font || REGULAR).fillColor(run.color || INK);
    doc.text(run.text, i === 0 ? x : undefined, i === 0 ? y : undefined, {
      continued: i < left.length - 1,
      lineBreak: false,
      link: run.link,
      underline: !!run.link,
    });
  });
  doc.x = x;
  doc.y = y + doc.currentLineHeight() + gap;
}

function bullet(doc: PDFKit.PDFDocument, text: string, gap = 2.5): void {
  const x = doc.page.margins.left;
  const w = contentWidth(doc);
  doc.font(REGULAR).fontSize(BODY_SIZE);
  ensureSpace(doc, doc.heightOfString(text, { width: w - BULLET_INDENT }) + 2);
  const y = doc.y;
  doc.fillColor(INK).text("•", x + 2, y, { lineBreak: false });
  doc.text(text, x + BULLET_INDENT, y, { width: w - BULLET_INDENT });
  doc.x = x;
  doc.y += gap;
}

function newDoc(margins: { top: number; bottom: number; left: number; right: number }, title: string): PDFKit.PDFDocument {
  return new PDFDocument({ size: "LETTER", margins, info: { Title: toWinAnsi(title), Producer: "Career Journey" } });
}

export async function buildResumePdf(resume: GeneratedResume, strategy?: ResumeStrategy): Promise<Buffer> {
  const doc = newDoc({ top: 36, bottom: 36, left: 54, right: 54 }, `${resume.name || "Resume"} — Resume`);
  const done = collect.bind(null, doc);
  const x = doc.page.margins.left;
  const w = contentWidth(doc);

  // Header: name, tagline, contact
  doc.font(BOLD).fontSize(16).fillColor(INK).text(toWinAnsi(resume.name).toUpperCase(), x, doc.y, { width: w, align: "center" });
  doc.moveDown(0.15);
  if (strategy?.headerTagline) {
    doc.font(BOLD).fontSize(BODY_SIZE).fillColor("#374151").text(toWinAnsi(strategy.headerTagline), x, doc.y, { width: w, align: "center" });
    doc.moveDown(0.15);
  }
  doc.font(REGULAR).fontSize(10).fillColor(MUTED).text(toWinAnsi(resume.contactInfo), x, doc.y, { width: w, align: "center" });

  sectionHeader(doc, "Executive Summary");
  doc.font(REGULAR).fontSize(BODY_SIZE).fillColor(INK).text(toWinAnsi(resume.summary), x, doc.y, { width: w });

  sectionHeader(doc, "Core Competencies");
  (resume.skills || []).forEach((s) => {
    ensureSpace(doc, BODY_SIZE * 2);
    doc.font(BOLD).fontSize(BODY_SIZE).fillColor(INK).text(`${toWinAnsi(s.category)}: `, x, doc.y, { continued: true, width: w });
    doc.font(REGULAR).text(toWinAnsi(s.terms), { width: w });
    doc.moveDown(0.15);
  });

  if ((resume.experience || []).length > 0) sectionHeader(doc, "Professional Experience");
  (resume.experience || []).forEach((exp) => {
    // Keep the company/title lines and first bullet together on one page.
    ensureSpace(doc, BODY_SIZE * 6);
    doc.y += 5;
    splitRow(
      doc,
      [
        { text: toWinAnsi(exp.company), font: BOLD, color: exp.companyUrl ? LINK : INK, link: exp.companyUrl || undefined },
        ...(exp.companyDescriptor ? [{ text: ` — ${toWinAnsi(exp.companyDescriptor)}` }] : []),
      ],
      { text: toWinAnsi(exp.dates), font: BOLD },
      1
    );
    splitRow(doc, [{ text: toWinAnsi(exp.title), font: ITALIC }], { text: toWinAnsi(exp.location), font: ITALIC, color: "#6B7280" }, 3);
    (exp.bullets || []).forEach((b: any) => bullet(doc, toWinAnsi(typeof b === "string" ? b : b.text)));
  });

  if ((resume.earlierExperience || []).length > 0) {
    sectionHeader(doc, "Earlier Experience");
    (resume.earlierExperience || []).forEach((e) => {
      splitRow(doc, [{ text: toWinAnsi(e.title), font: BOLD }, { text: ` — ${toWinAnsi(e.company)}` }], { text: toWinAnsi(e.dates) }, 2);
    });
  }

  sectionHeader(doc, "Education");
  (resume.education || []).forEach((edu) => {
    splitRow(
      doc,
      [{ text: toWinAnsi(edu.institution), font: BOLD }, { text: ` — ${toWinAnsi(edu.degree)}` }],
      { text: toWinAnsi(edu.graduationDate) },
      2
    );
  });

  return done();
}

export async function buildCoverLetterPdf(coverLetter: CoverLetter, candidate?: { name?: string; contactInfo?: string }): Promise<Buffer> {
  const doc = newDoc({ top: 72, bottom: 72, left: 72, right: 72 }, `${candidate?.name || "Candidate"} — Cover Letter`);
  const done = collect.bind(null, doc);
  const x = doc.page.margins.left;
  const w = contentWidth(doc);

  doc.font(BOLD).fontSize(16).fillColor(INK).text(toWinAnsi(candidate?.name).toUpperCase(), x, doc.y, { width: w, align: "center" });
  doc.moveDown(0.15);
  doc.font(REGULAR).fontSize(10).fillColor(MUTED).text(toWinAnsi(candidate?.contactInfo), x, doc.y, { width: w, align: "center" });
  doc.moveDown(1.5);
  doc.font(REGULAR).fontSize(11).fillColor(INK).text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), x, doc.y, { width: w });
  doc.moveDown(1);

  toWinAnsi(coverLetter?.content)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((p) => {
      doc.font(REGULAR).fontSize(11).fillColor(INK).text(p, x, doc.y, { width: w, lineGap: 2 });
      doc.moveDown(1);
    });

  return done();
}
