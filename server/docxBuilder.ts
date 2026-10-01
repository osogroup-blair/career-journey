import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  AlignmentType,
  BorderStyle,
  TabStopType,
  Tab,
  Table,
  TableRow,
  TableCell,
  TableBorders,
  TableLayoutType,
  VerticalAlign,
  WidthType,
  LineRuleType,
  LevelFormat,
  convertInchesToTwip,
} from "docx";
import { GeneratedResume, ResumeStrategy, CoverLetter } from "../src/types";

/**
 * Word versions of the three on-screen resume templates in
 * src/components/ResumeTemplates.tsx. Sizes/colours/spacing are taken from the
 * Tailwind classes there (px → pt at 0.75, Tailwind slate/zinc/gray palettes),
 * so a change to a template should be mirrored here. Word has no flexbox/grid,
 * so side-by-side layouts use right tab stops or borderless tables.
 */

export type ResumeTemplateId = "classic" | "modern" | "executive";

const SANS = "Arial";
const SERIF = "Georgia";
const BODY_SIZE = 22; // 11pt in half-points (cover letter)
const NAME_SIZE = 32; // 16pt (cover letter)
const CL_FONT = "Calibri";

const LETTER = { width: 12240, height: 15840 }; // twips
const PAGE_MARGIN = convertInchesToTwip(0.5);
const CONTENT_W = LETTER.width - PAGE_MARGIN * 2; // 10800 twips = 7.5in, same as the on-screen preview

const C = {
  slate900: "0F172A", slate800: "1E293B", slate700: "334155", slate600: "475569", slate500: "64748B",
  zinc900: "18181B", zinc700: "3F3F46", zinc600: "52525B", zinc500: "71717A", zinc400: "A1A1AA", zinc300: "D4D4D8",
  gray900: "111827", gray800: "1F2937", gray700: "374151", gray600: "4B5563", gray500: "6B7280", gray300: "D1D5DB",
  brand700: "253D61", brand600: "2E4D78",
};

interface RunOpts {
  px?: number;
  bold?: boolean;
  italics?: boolean;
  color?: string;
  font?: string;
  caps?: boolean;
  tracking?: number; // CSS letter-spacing in em
  underline?: boolean;
}

/** A text run sized like the CSS px value in the template (px × 0.75 = pt, ×2 = half-points). */
function run(text: string, o: RunOpts = {}): TextRun {
  const px = o.px ?? 13;
  return new TextRun({
    text,
    font: o.font ?? SANS,
    size: Math.round(px * 1.5),
    bold: o.bold,
    italics: o.italics,
    color: o.color,
    allCaps: o.caps,
    characterSpacing: o.tracking ? Math.round(o.tracking * px * 0.75 * 20) : undefined,
    underline: o.underline ? {} : undefined,
  });
}

const tab = () => new TextRun({ children: [new Tab()] });
/** Tailwind leading-* (a multiple of font-size) → Word line spacing (a multiple of the font's natural ~1.15 line). */
const lh = (css: number) => Math.round((css / 1.15) * 240);
/** px → twips */
const tw = (px: number) => Math.round(px * 15);

function link(url: string, text: string, o: RunOpts): ExternalHyperlink {
  return new ExternalHyperlink({ link: url, children: [run(text, { ...o, underline: true })] });
}

/** Left content and right-aligned content on one line, via a right tab stop at the container's width. */
function splitLine(left: (TextRun | ExternalHyperlink)[], right: TextRun[], width: number, spacing: { before?: number; after?: number } = {}, keepNext = true): Paragraph {
  return new Paragraph({
    keepNext,
    keepLines: true,
    spacing,
    tabStops: [{ type: TabStopType.RIGHT, position: width }],
    children: [...left, tab(), ...right],
  });
}

// List indents matching the templates' `list-disc pl-*` (pl-5 = 20px, pl-4 = 16px); Word's default is far deeper.
const BULLETS = { pl5: "bullets-pl5", pl4: "bullets-pl4" };
const bulletLevel = (left: number) => ({
  level: 0,
  format: LevelFormat.BULLET,
  text: "•",
  alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left, hanging: 180 } } },
});

function bulletPara(text: string, o: RunOpts, spacing: { after: number; line: number }, reference: string): Paragraph {
  return new Paragraph({ numbering: { reference, level: 0 }, spacing: { after: spacing.after, line: spacing.line }, children: [run(text, o)] });
}

const bulletText = (b: any): string => (typeof b === "string" ? b : b?.text || "");

/** Collapses to ~1pt so a table-to-table gap can be set precisely with `after`. */
function spacer(after: number): Paragraph {
  return new Paragraph({ spacing: { before: 0, after, line: 20, lineRule: LineRuleType.EXACT }, children: [] });
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

// ---------------------------------------------------------------------------
// Classic

function classicSection(title: string, before: number, after: number): Paragraph {
  return new Paragraph({
    keepNext: true,
    spacing: { before, after },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.slate900, space: 3 } },
    children: [run(title, { px: 14, bold: true, caps: true, tracking: 0.1, color: C.slate900 })],
  });
}

function classicChildren(resume: GeneratedResume, tagline?: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const body = lh(1.625);

  out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(resume.name || "", { px: 28, bold: true, caps: true, tracking: 0.025, color: C.slate900 })] }));
  if (tagline) {
    out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [run(tagline, { px: 14, bold: true, caps: true, tracking: 0.05, color: C.slate700 })] }));
  }
  out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [run(resume.contactInfo || "", { px: 13, color: C.slate600 })] }));

  out.push(classicSection("Executive Summary", 360, 120));
  out.push(new Paragraph({ spacing: { line: body }, children: [run(resume.summary || "", { color: C.slate800 })] }));

  out.push(classicSection("Core Competencies", 300, 120));
  (resume.skills || []).forEach((s) => {
    out.push(new Paragraph({ spacing: { after: 60 }, children: [run(`${s.category}:`, { bold: true, color: C.slate900 }), run(` ${s.terms}`, { color: C.slate700 })] }));
  });

  out.push(classicSection("Professional Experience", 300, 180));
  (resume.experience || []).forEach((exp, i) => {
    const company = exp.companyUrl
      ? link(exp.companyUrl, exp.company, { bold: true, color: C.brand700 })
      : run(exp.company, { bold: true, color: C.slate700 });
    out.push(splitLine([run(exp.title, { px: 14, bold: true, color: C.slate900 })], [run(exp.dates, { color: C.slate800 })], CONTENT_W, { before: i > 0 ? 240 : 0 }));
    out.push(
      splitLine(
        [company, ...(exp.companyDescriptor ? [run(` — ${exp.companyDescriptor}`, { color: C.slate500 })] : [])],
        [run(exp.location || "", { px: 12, color: C.slate500 })],
        CONTENT_W,
        { after: 90 }
      )
    );
    (exp.bullets || []).forEach((b) => out.push(bulletPara(bulletText(b), { color: C.slate800 }, { after: 60, line: lh(1.375) }, BULLETS.pl5)));
  });

  out.push(classicSection("Education", 300, 120));
  (resume.education || []).forEach((edu) => {
    out.push(
      splitLine(
        [run(edu.institution, { bold: true, color: C.slate900 }), run(" — ", {}), run(edu.degree, { color: C.slate800 })],
        [run(edu.graduationDate || "", { color: C.slate600 })],
        CONTENT_W,
        { after: 120 },
        false
      )
    );
  });
  return out;
}

// ---------------------------------------------------------------------------
// Modern

function modernSection(title: string, before: number, after: number): Paragraph {
  return new Paragraph({ keepNext: true, spacing: { before, after }, children: [run(title, { px: 14, bold: true, caps: true, tracking: 0.1, color: C.zinc400 })] });
}

function modernChildren(resume: GeneratedResume, tagline?: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const relaxed = lh(1.625);
  const rule = { style: BorderStyle.SINGLE, size: 6, color: C.zinc300 };
  const leftW = 8000;
  const rightW = CONTENT_W - leftW;

  out.push(
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [leftW, rightW],
      layout: TableLayoutType.FIXED,
      borders: TableBorders.NONE,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: leftW, type: WidthType.DXA },
              verticalAlign: VerticalAlign.BOTTOM,
              borders: { ...NO_BORDERS, bottom: rule },
              margins: { top: 0, bottom: 240, left: 0, right: 0 },
              children: [
                new Paragraph({ children: [run(resume.name || "", { px: 36, bold: true, color: C.zinc900 })] }),
                ...(tagline ? [new Paragraph({ spacing: { before: 60 }, children: [run(tagline, { px: 18, color: C.brand600 })] })] : []),
              ],
            }),
            new TableCell({
              width: { size: rightW, type: WidthType.DXA },
              verticalAlign: VerticalAlign.BOTTOM,
              borders: { ...NO_BORDERS, bottom: rule },
              margins: { top: 0, bottom: 240, left: 0, right: 0 },
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(resume.contactInfo || "", { px: 13, color: C.zinc500 })] })],
            }),
          ],
        }),
      ],
    })
  );

  out.push(new Paragraph({ spacing: { before: 480, line: relaxed }, children: [run(resume.summary || "", { px: 14, color: C.zinc700 })] }));

  out.push(modernSection("Skills & Technologies", 360, 180));
  const hang = tw(128); // min-w-[120px] + gap-2
  (resume.skills || []).forEach((s) => {
    out.push(
      new Paragraph({
        spacing: { after: 120 },
        indent: { left: hang, hanging: hang },
        tabStops: [{ type: TabStopType.LEFT, position: hang }],
        children: [run(s.category, { bold: true, color: C.zinc900 }), tab(), run(s.terms, { color: C.zinc600 })],
      })
    );
  });

  out.push(modernSection("Experience", 480, 240));
  (resume.experience || []).forEach((exp, i) => {
    const company = exp.companyUrl
      ? link(exp.companyUrl, exp.company, { px: 14, bold: true, color: C.brand600 })
      : run(exp.company, { px: 14, bold: true, color: C.brand600 });
    out.push(splitLine([run(exp.title, { px: 16, bold: true, color: C.zinc900 })], [run(exp.dates, { px: 14, color: C.zinc900 })], CONTENT_W, { before: i > 0 ? 360 : 0 }));
    out.push(
      splitLine(
        [company, ...(exp.companyDescriptor ? [run(` — ${exp.companyDescriptor}`, { px: 14, color: C.zinc500 })] : [])],
        [run(exp.location || "", { px: 12, color: C.zinc500 })],
        CONTENT_W,
        { after: 120 }
      )
    );
    (exp.bullets || []).forEach((b) => out.push(bulletPara(bulletText(b), { color: C.zinc700 }, { after: 90, line: relaxed }, BULLETS.pl4)));
  });

  out.push(modernSection("Education", 480, 180));
  (resume.education || []).forEach((edu) => {
    out.push(new Paragraph({ keepNext: true, children: [run(edu.institution, { px: 14, bold: true, color: C.zinc900 })] }));
    out.push(splitLine([run(edu.degree, { px: 14, color: C.zinc700 })], [run(edu.graduationDate || "", { px: 14, color: C.zinc500 })], CONTENT_W, { before: 30, after: 180 }, false));
  });
  return out;
}

// ---------------------------------------------------------------------------
// Executive

function executiveSideBySide(label: string, content: Paragraph[]): Table {
  const leftW = Math.round(CONTENT_W * 0.25);
  const rightW = CONTENT_W - leftW;
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [leftW, rightW],
    layout: TableLayoutType.FIXED,
    borders: TableBorders.NONE,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: leftW, type: WidthType.DXA },
            borders: { ...NO_BORDERS, right: { style: BorderStyle.SINGLE, size: 6, color: C.gray300 } },
            margins: { top: 0, bottom: 0, left: 0, right: 240 },
            children: [new Paragraph({ spacing: { before: 60 }, children: [run(label, { px: 12, bold: true, caps: true, tracking: 0.1, color: C.gray900 })] })],
          }),
          new TableCell({
            width: { size: rightW, type: WidthType.DXA },
            borders: NO_BORDERS,
            margins: { top: 0, bottom: 0, left: 240, right: 0 },
            children: content,
          }),
        ],
      }),
    ],
  });
}

function executiveChildren(resume: GeneratedResume, tagline?: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const rightW = CONTENT_W - Math.round(CONTENT_W * 0.25) - 240; // tab stop inside the right cell
  const ruleW = tw(64);
  const ruleIndent = Math.round((CONTENT_W - ruleW) / 2);

  out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(resume.name || "", { px: 32, font: SERIF, tracking: 0.025, color: C.gray900 })] }));
  out.push(
    new Paragraph({
      spacing: { before: 180, after: 180, line: 20, lineRule: LineRuleType.EXACT },
      indent: { left: ruleIndent, right: ruleIndent },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.gray900, space: 0 } },
      children: [],
    })
  );
  if (tagline) {
    out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [run(tagline, { px: 14, font: SERIF, caps: true, tracking: 0.025, color: C.gray700 })] }));
  }
  out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [run(resume.contactInfo || "", { px: 12, color: C.gray600 })] }));

  out.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 360, line: lh(1.625) }, children: [run(resume.summary || "", { px: 13, font: SERIF, color: C.gray800 })] }));

  // Skills: two-column grid between thin rules, inset px-4 like the screen.
  const skills = resume.skills || [];
  if (skills.length > 0) {
    const inset = 240;
    const tableW = CONTENT_W - inset * 2;
    const colW = Math.round(tableW / 2);
    const rows: TableRow[] = [];
    for (let i = 0; i < skills.length; i += 2) {
      const first = i === 0;
      const last = i + 2 >= skills.length;
      const cell = (s?: { category: string; terms: string }) =>
        new TableCell({
          width: { size: colW, type: WidthType.DXA },
          borders: { ...NO_BORDERS, ...(first ? { top: { style: BorderStyle.SINGLE, size: 6, color: C.gray300 } } : {}), ...(last ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.gray300 } } : {}) },
          margins: { top: first ? 180 : 60, bottom: last ? 180 : 60, left: 0, right: 120 },
          children: [new Paragraph({ children: s ? [run(`${s.category}:`, { px: 12, bold: true, color: C.gray900 }), run(` ${s.terms}`, { px: 12, color: C.gray700 })] : [] })],
        });
      rows.push(new TableRow({ cantSplit: true, children: [cell(skills[i]), cell(skills[i + 1])] }));
    }
    out.push(spacer(360));
    out.push(new Table({ width: { size: tableW, type: WidthType.DXA }, indent: { size: inset, type: WidthType.DXA }, columnWidths: [colW, colW], layout: TableLayoutType.FIXED, borders: TableBorders.NONE, rows }));
  }

  const entries: Paragraph[] = [];
  (resume.experience || []).forEach((exp, i) => {
    const company = exp.companyUrl
      ? link(exp.companyUrl, exp.company, { px: 15, font: SERIF, bold: true, color: C.gray900 })
      : run(exp.company, { px: 15, font: SERIF, bold: true, color: C.gray900 });
    entries.push(splitLine([company], [run(exp.dates, { px: 12, color: C.gray600 })], rightW, { before: i > 0 ? 360 : 0 }));
    if (exp.companyDescriptor) entries.push(new Paragraph({ keepNext: true, spacing: { after: 30 }, children: [run(exp.companyDescriptor, { px: 11, color: C.gray500 })] }));
    entries.push(splitLine([run(exp.title, { px: 14, font: SERIF, italics: true, color: C.gray800 })], [run(exp.location || "", { px: 11, caps: true, tracking: 0.05, color: C.gray500 })], rightW, { after: 120 }));
    (exp.bullets || []).forEach((b) => entries.push(bulletPara(bulletText(b), { px: 13, font: SERIF, color: C.gray800 }, { after: 60, line: lh(1.5) }, BULLETS.pl5)));
  });
  out.push(spacer(360));
  out.push(executiveSideBySide("Experience", entries.length ? entries : [new Paragraph({ children: [] })]));

  const edu: Paragraph[] = [];
  (resume.education || []).forEach((e, i) => {
    edu.push(splitLine([run(e.institution, { px: 14, font: SERIF, bold: true, color: C.gray900 })], [run(e.graduationDate || "", { px: 12, color: C.gray600 })], rightW, { before: i > 0 ? 180 : 0 }));
    edu.push(new Paragraph({ children: [run(e.degree, { px: 13, font: SERIF, italics: true, color: C.gray800 })] }));
  });
  out.push(spacer(360));
  out.push(executiveSideBySide("Education", edu.length ? edu : [new Paragraph({ children: [] })]));
  return out;
}

// ---------------------------------------------------------------------------

export async function buildResumeDocx(
  resume: GeneratedResume,
  _strategy?: ResumeStrategy,
  opts: { template?: ResumeTemplateId; tagline?: string } = {}
): Promise<Buffer> {
  const template = opts.template || "classic";
  const children =
    template === "modern" ? modernChildren(resume, opts.tagline) : template === "executive" ? executiveChildren(resume, opts.tagline) : classicChildren(resume, opts.tagline);

  const doc = new Document({
    numbering: { config: [{ reference: BULLETS.pl5, levels: [bulletLevel(300)] }, { reference: BULLETS.pl4, levels: [bulletLevel(240)] }] },
    title: `${resume.name || "Resume"} — Resume`,
    sections: [
      {
        properties: { page: { size: LETTER, margin: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN } } },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

function bodyText(text: string, opts: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}): TextRun {
  return new TextRun({ text, font: CL_FONT, size: BODY_SIZE, ...opts });
}

export async function buildCoverLetterDocx(coverLetter: CoverLetter, candidate?: { name?: string; contactInfo?: string }): Promise<Buffer> {
  const paragraphs = (coverLetter?.content || "").split(/\n{2,}/).filter((p) => p.trim().length > 0);

  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: (candidate?.name || "").toUpperCase(), bold: true, font: CL_FONT, size: NAME_SIZE })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [bodyText(candidate?.contactInfo || "", { size: 20, color: "4B5563" })],
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
            size: LETTER,
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
