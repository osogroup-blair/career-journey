import { useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { ClassicTemplate, ModernTemplate, ExecutiveTemplate } from '../components/ResumeTemplates';
import type { GeneratedResume } from '../types';

/**
 * Print-only entry used by server/pdfRenderer.ts: headless Chromium opens
 * /print.html with `window.__PRINT__` injected before the page scripts run,
 * and this renders the exact same template components the Tailored
 * Application page shows — read-only, with no auth, store, or Firebase — so the
 * exported PDF is the on-screen resume.
 */
interface PrintPayload {
  resume: GeneratedResume;
  tagline?: string;
  template: 'classic' | 'modern' | 'executive';
}

const TEMPLATES = { classic: ClassicTemplate, modern: ModernTemplate, executive: ExecutiveTemplate };

// Same normalization the server does, so a stray "javascript:" company URL can't become a link annotation.
function safeUrl(url?: string): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

/**
 * Chromium lays out for print at the paper's width (7.5in here), which is below
 * Tailwind's md breakpoint — so Modern/Executive would collapse to their narrow
 * layouts, while on screen (a wide viewport, 7.5in content column) they use the
 * md: layouts. Treat every min-width breakpoint a desktop browser satisfies as
 * always-on so the PDF matches the on-screen preview.
 */
const DESKTOP_PX = 1280;
function applyDesktopBreakpoints(): void {
  const toPx = (n: string, unit: string) => parseFloat(n) * (unit === 'rem' ? 16 : 1);
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        const m = rule.media.mediaText.match(/(?:width\s*>=|min-width:)\s*([\d.]+)(rem|px)/);
        if (m && toPx(m[1], m[2]) <= DESKTOP_PX && !/max-width|<=/.test(rule.media.mediaText)) rule.media.mediaText = 'all';
        else visit(rule.cssRules);
      } else if ('cssRules' in rule) {
        visit((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      /* cross-origin sheet — not ours */
    }
  }
}

function Ready({ children }: { children: ReactNode }) {
  // Flag the page once React has committed, so the server knows it can print.
  useEffect(() => {
    applyDesktopBreakpoints();
    document.body.dataset.ready = 'true';
  }, []);
  return <>{children}</>;
}

const payload = (window as any).__PRINT__ as PrintPayload | undefined;

if (payload?.resume) {
  const Template = TEMPLATES[payload.template] || ClassicTemplate;
  const resume: GeneratedResume = {
    ...payload.resume,
    skills: payload.resume.skills || [],
    education: payload.resume.education || [],
    experience: (payload.resume.experience || []).map((e) => ({ ...e, bullets: e.bullets || [], companyUrl: safeUrl(e.companyUrl) })),
    earlierExperience: (payload.resume.earlierExperience || []).map(({ restorable: _omit, ...e }) => e),
  };
  createRoot(document.getElementById('root')!).render(
    // 7.5in = the 8.5in Letter page minus the 0.5in margins applied by page.pdf(),
    // the same content width as the on-screen preview (8.5in with 0.5in padding).
    <Ready>
      <div style={{ width: '7.5in' }} className="bg-white">
        <Template resume={resume} tagline={payload.tagline} onUpdate={() => {}} readOnly />
      </div>
    </Ready>,
  );
}
