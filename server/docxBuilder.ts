import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  AlignmentType,
  BorderStyle,
  TabStopType,
  TabStopPosition,
  convertInchesToTwip,
} from "docx";
import { GeneratedResume, ResumeStrategy, CoverLetter } from "../src/types";

// Canonical contact details per project_instructions.md - never left to the model to invent.
const CONTACT_LINE = "Telluride, CO (Remote)  •  616.540.1669  •  blairboylan@gmail.com  •  blairboylan.com";
const FONT = "Calibri";
const BODY_SIZE = 22; // 11pt in half-points
const NAME_SIZE = 32; // 16pt

function sectionHeader(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1F2937" } },
    children: [
      new TextRun({ text: text.toUpperCase(), bold: true, font: FONT, size: 20, color: "1F2937" }),
    ],
  });
}

interface BodyTextOpts {
  bold?: boolean;
  italics?: boolean;
  color?: string;
  size?: number;
  underline?: {};
}

function bodyText(text: string, opts: BodyTextOpts = {}): TextRun {
  return new TextRun({ text, font: FONT, size: BODY_SIZE, ...opts });
}

export async function buildResumeDocx(resume: GeneratedResume, strategy?: ResumeStrategy): Promise<Buffer> {
  const children: Paragraph[] = [];

  // Header: name, tagline, contact
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: (resume.name || "Blair Boylan").toUpperCase(), bold: true, font: FONT, size: NAME_SIZE })],
    })
  );
  if (strategy?.headerTagline) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: strategy.headerTagline, bold: true, font: FONT, size: BODY_SIZE, color: "374151" })],
      })
    );
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [bodyText(resume.contactInfo || CONTACT_LINE, { size: 20, color: "4B5563" })],
    })
  );

  // Executive Summary
  children.push(sectionHeader("Executive Summary"));
  children.push(new Paragraph({ spacing: { after: 200 }, children: [bodyText(resume.summary || "")] }));

  // Selected Executive Outcomes (optional)
  if (strategy?.selectedOutcomes && strategy.selectedOutcomes.length > 0) {
    children.push(sectionHeader("Selected Executive Outcomes"));
    strategy.selectedOutcomes.forEach((outcome) => {
      children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [bodyText(outcome)] }));
    });
  }

  // Core Skills
  children.push(sectionHeader("Core Skills & Domains"));
  (resume.skills || []).forEach((s) => {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [bodyText(`${s.category}: `, { bold: true }), bodyText(s.terms)],
      })
    );
  });

  // Professional Experience
  children.push(sectionHeader("Professional Experience"));
  (resume.experience || []).forEach((exp) => {
    const companyRun = exp.companyUrl
      ? new ExternalHyperlink({
          link: exp.companyUrl,
          children: [new TextRun({ text: exp.company, bold: true, font: FONT, size: BODY_SIZE, color: "1D4ED8", underline: {} })],
        })
      : bodyText(exp.company, { bold: true });

    children.push(
      new Paragraph({
        spacing: { before: 160, after: 20 },
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        children: [companyRun, bodyText(exp.companyDescriptor ? ` — ${exp.companyDescriptor}` : ""), new TextRun({ text: "\t" }), bodyText(exp.dates, { bold: true })],
      })
    );
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        children: [bodyText(exp.title, { italics: true }), new TextRun({ text: "\t" }), bodyText(exp.location || "", { italics: true, color: "6B7280" })],
      })
    );
    (exp.bullets || []).forEach((bullet: any) => {
      const text = typeof bullet === 'string' ? bullet : bullet.text;
      children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [bodyText(text)] }));
    });
  });

  // Education
  children.push(sectionHeader("Education"));
  (resume.education || []).forEach((edu) => {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        children: [bodyText(edu.institution, { bold: true }), bodyText(` — ${edu.degree}`), new TextRun({ text: "\t" }), bodyText(edu.graduationDate || "")],
      })
    );
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.5),
              bottom: convertInchesToTwip(0.5),
              left: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export async function buildCoverLetterDocx(coverLetter: CoverLetter): Promise<Buffer> {
  const paragraphs = (coverLetter?.content || "").split(/\n{2,}/).filter((p) => p.trim().length > 0);

  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: "BLAIR BOYLAN", bold: true, font: FONT, size: NAME_SIZE })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [bodyText(CONTACT_LINE, { size: 20, color: "4B5563" })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [bodyText(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }))],
    }),
  ];

  paragraphs.forEach((p) => {
    children.push(new Paragraph({ spacing: { after: 200 }, children: [bodyText(p.trim())] }));
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
