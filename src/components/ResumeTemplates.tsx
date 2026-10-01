import React from 'react';
import { GeneratedResume, ResumeExperienceEntry } from '../types';
import { EditableText } from './EditableText';
import EvidenceTrace from './EvidenceTrace';
import { resolveExperienceRoleId } from '../lib/resumeBuild';
import * as edits from '../lib/resumeEdits';
import { BulletToolbar, EarlierRowToolbar, ResumeEditActions, RoleToolbar, SectionToolbar } from './tailored/ResumeEditControls';

interface TemplateProps {
  resume: GeneratedResume;
  tagline?: string;
  onUpdate: (newResume: GeneratedResume) => void;
  careerJourney?: any;
  /** Render static text only (no contentEditable, no evidence chips, no edit controls) — used for PDF export. */
  readOnly?: boolean;
  /** Section regenerate + role-mode callbacks for the hover controls. Omitted → only inline text editing. */
  actions?: ResumeEditActions;
}

/** Shared bullet renderer for all three templates — editable text, hover controls (move/delete/add), and an EvidenceTrace chip when the bullet cites real Career Journey evidence. Kept in one place so the three templates don't drift. */
function BulletList({ resume, roleIndex, onUpdate, className, careerJourney, readOnly }: {
  resume: GeneratedResume;
  roleIndex: number;
  onUpdate: (r: GeneratedResume) => void;
  className?: string;
  careerJourney?: any;
  readOnly?: boolean;
}) {
  const bullets = resume.experience[roleIndex]?.bullets || [];
  return (
    <>
      {bullets.map((raw, bi) => {
        const b = edits.normalizeBullet(raw);
        return (
          <li key={bi} className={`${className || ''} ${readOnly ? '' : 'relative group/bullet'}`}>
            <span className="inline-flex items-start gap-1.5 w-full">
              <span className="flex-1">
                <EditableText multiline readOnly={readOnly} value={b.text} onChange={(v) => onUpdate(edits.updateBullet(resume, roleIndex, bi, v))} />
              </span>
              {!readOnly && b.evidenceRefs && b.evidenceRefs.length > 0 && (
                <EvidenceTrace evidenceRefs={b.evidenceRefs} careerJourney={careerJourney} />
              )}
            </span>
            {!readOnly && (
              <BulletToolbar
                index={bi}
                count={bullets.length}
                onMove={(delta) => onUpdate(edits.moveBullet(resume, roleIndex, bi, delta))}
                onRemove={() => onUpdate(edits.removeBullet(resume, roleIndex, bi))}
              />
            )}
          </li>
        );
      })}
    </>
  );
}

/** Wraps one experience entry with the role-level hover toolbar (move, regenerate, condense, remove). */
function RoleBlock({ resume, index, onUpdate, careerJourney, readOnly, actions, className, children }: {
  // No @types/react here, so `key` must be listed explicitly (see JobTracker.tsx).
  key?: string | number;
  resume: GeneratedResume;
  index: number;
  onUpdate: (r: GeneratedResume) => void;
  careerJourney?: any;
  readOnly?: boolean;
  actions?: ResumeEditActions;
  className?: string;
  children: React.ReactNode;
}) {
  if (readOnly) return <div className={className}>{children}</div>;
  const entry = resume.experience[index];
  const roleId = careerJourney ? resolveExperienceRoleId(entry, careerJourney) : entry.roleId || null;
  return (
    <div className={`relative group/role ${className || ''}`}>
      <RoleToolbar
        roleId={roleId}
        index={index}
        count={resume.experience.length}
        actions={actions}
        onMove={(delta) => onUpdate(edits.moveRole(resume, index, delta))}
        onAddBullet={() => onUpdate(edits.addBullet(resume, index))}
        onCondense={() => {
          onUpdate(edits.condenseRole(resume, index, careerJourney));
          if (roleId) actions?.onRoleModeChange?.(roleId, 'condensed');
        }}
        onRemove={() => {
          onUpdate(edits.removeRole(resume, index));
          if (roleId) actions?.onRoleModeChange?.(roleId, 'excluded');
        }}
      />
      {children}
    </div>
  );
}

/** Summary/skills wrapper carrying the section regenerate control. */
function Section({ kind, label, actions, readOnly, className, children }: {
  kind: 'summary' | 'skills';
  label: string;
  actions?: ResumeEditActions;
  readOnly?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (readOnly) return <div className={className}>{children}</div>;
  return (
    <div className={`relative group/section ${className || ''}`}>
      <SectionToolbar section={{ kind }} actions={actions} label={label} />
      {children}
    </div>
  );
}

/** One Earlier Experience line with its hover controls. `render` draws the template-specific markup. */
function EarlierRows({ resume, onUpdate, careerJourney, readOnly, actions, rowClassName, render }: {
  resume: GeneratedResume;
  onUpdate: (r: GeneratedResume) => void;
  careerJourney?: any;
  readOnly?: boolean;
  actions?: ResumeEditActions;
  rowClassName?: string;
  render: (e: NonNullable<GeneratedResume['earlierExperience']>[number]) => React.ReactNode;
}) {
  return (
    <>
      {(resume.earlierExperience || []).map((e, i) => {
        if (readOnly) return <div key={e.roleId || i} className={rowClassName}>{render(e)}</div>;
        const section = { kind: 'role' as const, roleId: e.roleId };
        return (
          <div key={e.roleId || i} className={`relative group/earlier ${rowClassName || ''}`}>
            {render(e)}
            <EarlierRowToolbar
              canRestore={!!e.restorable}
              canRewrite={!!e.roleId && !!actions?.onRegenerateSection}
              busy={!!e.roleId && !!actions?.isSectionBusy?.(section)}
              onRestore={() => {
                onUpdate(edits.restoreEarlier(resume, i, careerJourney));
                if (e.roleId) actions?.onRoleModeChange?.(e.roleId, 'full');
              }}
              onRewrite={() => actions?.onRegenerateSection?.(section)}
              onRemove={() => {
                onUpdate(edits.removeEarlier(resume, i));
                if (e.roleId) actions?.onRoleModeChange?.(e.roleId, 'excluded');
              }}
            />
          </div>
        );
      })}
    </>
  );
}

function SkillTerms({ resume, index, onUpdate, readOnly, className }: { resume: GeneratedResume; index: number; onUpdate: (r: GeneratedResume) => void; readOnly?: boolean; className?: string }) {
  return (
    <EditableText
      readOnly={readOnly}
      value={resume.skills[index]?.terms || ''}
      onChange={(v) => onUpdate({ ...resume, skills: resume.skills.map((s, i) => (i === index ? { ...s, terms: v } : s)) })}
      className={className}
    />
  );
}

function CompanyName({ exp, className }: { exp: ResumeExperienceEntry; className?: string }) {
  return exp.companyUrl ? (
    <a href={exp.companyUrl} target="_blank" rel="noopener noreferrer" className={className}>{exp.company}</a>
  ) : (
    <>{exp.company}</>
  );
}

export const ClassicTemplate: React.FC<TemplateProps> = ({ resume, tagline, onUpdate, careerJourney, readOnly, actions }) => {
  return (
    <div className="text-black font-sans leading-relaxed">
      {/* Header */}
      <div className="text-center mb-6">
        <EditableText readOnly={readOnly} 
          tagName="h1"
          value={resume.name} 
          onChange={(v) => onUpdate({...resume, name: v})}
          className="text-[28px] font-bold uppercase tracking-wide text-slate-900" 
        />
        {tagline && (
          <h2 className="text-sm font-semibold tracking-wider text-slate-700 mt-1 uppercase">
            {tagline}
          </h2>
        )}
        <div className="text-[13px] text-slate-600 flex justify-center gap-3 mt-2 font-medium">
          <EditableText readOnly={readOnly}
            value={resume.contactInfo}
            onChange={(v) => onUpdate({...resume, contactInfo: v})}
          />
        </div>
      </div>

      {/* Summary */}
      <Section kind="summary" label="the summary" actions={actions} readOnly={readOnly} className="mb-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-2">Executive Summary</h3>
        <EditableText readOnly={readOnly}
          tagName="p"
          multiline
          value={resume.summary}
          onChange={(v) => onUpdate({...resume, summary: v})}
          className="text-[13px] leading-relaxed text-slate-800"
        />
      </Section>

      {/* Core Skills */}
      <Section kind="skills" label="the skills" actions={actions} readOnly={readOnly} className="mb-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-2">Core Competencies</h3>
        <div className="grid grid-cols-1 gap-1 text-[13px]">
          {resume.skills.map((s, i) => (
            <div key={i}>
              <span className="font-semibold text-slate-900">{s.category}:</span> <SkillTerms resume={resume} index={i} onUpdate={onUpdate} readOnly={readOnly} className="text-slate-700" />
            </div>
          ))}
        </div>
      </Section>

      {/* Professional Experience — hidden when every role was condensed or removed */}
      <div className={`mb-5${resume.experience.length ? '' : ' hidden'}`}>
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-3">Professional Experience</h3>
        <div className="space-y-4">
          {resume.experience.map((exp, i) => (
            <RoleBlock key={exp.roleId || i} resume={resume} index={i} onUpdate={onUpdate} careerJourney={careerJourney} readOnly={readOnly} actions={actions} className="break-inside-avoid">
              <div className="flex justify-between items-end mb-1">
                <div>
                  <h4 className="font-bold text-slate-900 text-[14px]">{exp.title}</h4>
                  <div className="font-semibold text-slate-700 text-[13px]">
                    <CompanyName exp={exp} className="text-brand-700 underline decoration-1 underline-offset-2" />
                    {exp.companyDescriptor && <span className="text-slate-500 font-normal"> — {exp.companyDescriptor}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] text-slate-800 font-medium">{exp.dates}</div>
                  <div className="text-[12px] text-slate-500">{exp.location}</div>
                </div>
              </div>
              <ul className="list-disc pl-5 mt-1.5 space-y-1 text-[13px] text-slate-800">
                <BulletList
                  readOnly={readOnly}
                  resume={resume}
                  roleIndex={i}
                  onUpdate={onUpdate}
                  className="leading-snug"
                  careerJourney={careerJourney}
                  />
              </ul>
            </RoleBlock>
          ))}
        </div>
      </div>

      {/* Earlier Experience — condensed roles, one line each */}
      {(resume.earlierExperience?.length ?? 0) > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-2">Earlier Experience</h3>
          <div className="space-y-1">
            <EarlierRows
              resume={resume} onUpdate={onUpdate} careerJourney={careerJourney} readOnly={readOnly} actions={actions}
              rowClassName="flex justify-between items-baseline text-[13px] break-inside-avoid"
              render={(e) => (
                <>
                  <div><span className="font-bold text-slate-900">{e.title}</span> — <span className="text-slate-700">{e.company}</span></div>
                  <div className="text-slate-800 font-medium">{e.dates}</div>
                </>
              )}
            />
          </div>
        </div>
      )}

      {/* Education */}
      <div className="mb-2">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-2">Education</h3>
        <div className="space-y-2">
          {resume.education.map((edu, i) => (
            <div key={i} className="flex justify-between items-center text-[13px] break-inside-avoid">
              <div>
                <span className="font-bold text-slate-900">{edu.institution}</span> — <span className="text-slate-800">{edu.degree}</span>
              </div>
              <div className="text-slate-600 font-medium">{edu.graduationDate}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const ModernTemplate: React.FC<TemplateProps> = ({ resume, tagline, onUpdate, careerJourney, readOnly, actions }) => {
  return (
    <div className="text-zinc-800 font-sans leading-relaxed">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between border-b pb-4 border-zinc-300">
        <div>
          <EditableText readOnly={readOnly}
            tagName="h1"
            value={resume.name}
            onChange={(v) => onUpdate({...resume, name: v})}
            className="text-4xl font-extrabold text-zinc-900 tracking-tight"
          />
          {tagline && (
            <h2 className="text-lg font-medium text-brand-600 mt-1">
              {tagline}
            </h2>
          )}
        </div>
        <div className="text-[13px] text-zinc-500 font-medium text-right mt-4 md:mt-0 max-w-[200px]">
          <EditableText readOnly={readOnly}
             multiline
             value={resume.contactInfo}
             onChange={(v) => onUpdate({...resume, contactInfo: v})}
          />
        </div>
      </div>

      {/* Summary */}
      <Section kind="summary" label="the summary" actions={actions} readOnly={readOnly} className="mb-6">
        <EditableText readOnly={readOnly}
          tagName="p"
          multiline
          value={resume.summary}
          onChange={(v) => onUpdate({...resume, summary: v})}
          className="text-[14px] leading-relaxed text-zinc-700 font-medium"
        />
      </Section>

      {/* Core Skills */}
      <Section kind="skills" label="the skills" actions={actions} readOnly={readOnly} className="mb-8">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-3">Skills & Technologies</h3>
        <div className="grid grid-cols-1 gap-2 text-[13px]">
          {resume.skills.map((s, i) => (
            <div key={i} className="flex gap-2">
              <span className="font-bold text-zinc-900 min-w-[120px]">{s.category}</span>
              <SkillTerms resume={resume} index={i} onUpdate={onUpdate} readOnly={readOnly} className="text-zinc-600" />
            </div>
          ))}
        </div>
      </Section>

      {/* Professional Experience — hidden when every role was condensed or removed */}
      <div className={`mb-8${resume.experience.length ? '' : ' hidden'}`}>
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Experience</h3>
        <div className="space-y-6">
          {resume.experience.map((exp, i) => (
            <RoleBlock key={exp.roleId || i} resume={resume} index={i} onUpdate={onUpdate} careerJourney={careerJourney} readOnly={readOnly} actions={actions} className="break-inside-avoid">
              <div className="flex flex-col md:flex-row md:justify-between mb-2">
                <div>
                  <h4 className="font-bold text-zinc-900 text-base">{exp.title}</h4>
                  <div className="text-brand-600 font-semibold text-[14px]">
                    <CompanyName exp={exp} className="underline decoration-1 underline-offset-2" />
                    {exp.companyDescriptor && <span className="text-zinc-500 font-normal"> — {exp.companyDescriptor}</span>}
                  </div>
                </div>
                <div className="text-left md:text-right mt-1 md:mt-0">
                  <div className="text-[14px] text-zinc-900 font-medium">{exp.dates}</div>
                  <div className="text-[12px] text-zinc-500">{exp.location}</div>
                </div>
              </div>
              <ul className="list-disc pl-4 space-y-1.5 text-[13px] text-zinc-700">
                <BulletList
                  readOnly={readOnly}
                  resume={resume}
                  roleIndex={i}
                  onUpdate={onUpdate}
                  className="leading-relaxed"
                  careerJourney={careerJourney}
                  />
              </ul>
            </RoleBlock>
          ))}
        </div>
      </div>

      {/* Earlier Experience — condensed roles, one line each */}
      {(resume.earlierExperience?.length ?? 0) > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-3">Earlier Experience</h3>
          <div className="space-y-1.5">
            <EarlierRows
              resume={resume} onUpdate={onUpdate} careerJourney={careerJourney} readOnly={readOnly} actions={actions}
              rowClassName="flex justify-between items-baseline text-[13px] break-inside-avoid"
              render={(e) => (
                <>
                  <div><span className="font-bold text-zinc-900">{e.title}</span> <span className="text-brand-600 font-semibold">{e.company}</span></div>
                  <div className="text-zinc-900 font-medium">{e.dates}</div>
                </>
              )}
            />
          </div>
        </div>
      )}

      {/* Education */}
      <div className="mb-2">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-3">Education</h3>
        <div className="space-y-3">
          {resume.education.map((edu, i) => (
            <div key={i} className="break-inside-avoid text-[14px]">
              <div className="font-bold text-zinc-900">{edu.institution}</div>
              <div className="flex justify-between text-zinc-700 mt-0.5">
                <span>{edu.degree}</span>
                <span className="text-zinc-500 font-medium">{edu.graduationDate}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const ExecutiveTemplate: React.FC<TemplateProps> = ({ resume, tagline, onUpdate, careerJourney, readOnly, actions }) => {
  return (
    <div className="text-gray-900 font-serif leading-relaxed">
      {/* Header */}
      <div className="text-center mb-6">
        <EditableText readOnly={readOnly}
          tagName="h1"
          value={resume.name}
          onChange={(v) => onUpdate({...resume, name: v})}
          className="text-[32px] font-normal tracking-wide text-gray-900"
        />
        <div className="w-16 h-0.5 bg-gray-900 mx-auto my-3"></div>
        {tagline && (
          <h2 className="text-sm font-medium tracking-wide text-gray-700 mt-1 uppercase">
            {tagline}
          </h2>
        )}
        <div className="text-[12px] text-gray-600 flex justify-center mt-2 font-sans">
          <EditableText readOnly={readOnly}
            value={resume.contactInfo}
            onChange={(v) => onUpdate({...resume, contactInfo: v})}
          />
        </div>
      </div>

      {/* Summary */}
      <Section kind="summary" label="the summary" actions={actions} readOnly={readOnly} className="mb-6">
        <EditableText readOnly={readOnly}
          tagName="p"
          multiline
          value={resume.summary}
          onChange={(v) => onUpdate({...resume, summary: v})}
          className="text-[13px] leading-relaxed text-gray-800 text-justify"
        />
      </Section>

      {/* Core Skills */}
      <Section kind="skills" label="the skills" actions={actions} readOnly={readOnly} className="mb-6 px-4">
        <div className="border-t border-b border-gray-300 py-3 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-[12px] font-sans">
          {resume.skills.map((s, i) => (
            <div key={i}>
              <span className="font-bold text-gray-900">{s.category}:</span> <SkillTerms resume={resume} index={i} onUpdate={onUpdate} readOnly={readOnly} className="text-gray-700" />
            </div>
          ))}
        </div>
      </Section>

      {/* Professional Experience — hidden when every role was condensed or removed */}
      <div className={`mb-6 flex${resume.experience.length ? '' : ' hidden'}`}>
        <div className="w-1/4 pr-4 border-r border-gray-300">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-900 font-sans mt-1">Experience</h3>
        </div>
        <div className="w-3/4 pl-4 space-y-6">
          {resume.experience.map((exp, i) => (
            <RoleBlock key={exp.roleId || i} resume={resume} index={i} onUpdate={onUpdate} careerJourney={careerJourney} readOnly={readOnly} actions={actions} className="break-inside-avoid">
              <div className="mb-2">
                <div className="flex justify-between items-baseline">
                  <h4 className="font-bold text-gray-900 text-[15px]">
                    <CompanyName exp={exp} className="underline decoration-1 underline-offset-2" />
                  </h4>
                  <div className="text-[12px] text-gray-600 font-sans">{exp.dates}</div>
                </div>
                {exp.companyDescriptor && (
                  <div className="text-[11px] text-gray-500 font-sans mb-0.5">{exp.companyDescriptor}</div>
                )}
                <div className="flex justify-between items-baseline">
                  <div className="italic text-gray-800 text-[14px]">{exp.title}</div>
                  <div className="text-[11px] text-gray-500 font-sans uppercase tracking-wider">{exp.location}</div>
                </div>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-[13px] text-gray-800">
                <BulletList
                  readOnly={readOnly}
                  resume={resume}
                  roleIndex={i}
                  onUpdate={onUpdate}
                  className="leading-normal"
                  careerJourney={careerJourney}
                  />
              </ul>
            </RoleBlock>
          ))}
        </div>
      </div>

      {/* Earlier Experience — condensed roles, one line each */}
      {(resume.earlierExperience?.length ?? 0) > 0 && (
        <div className="mb-6 flex">
          <div className="w-1/4 pr-4 border-r border-gray-300">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-900 font-sans mt-1">Earlier</h3>
          </div>
          <div className="w-3/4 pl-4 space-y-1.5">
            <EarlierRows
              resume={resume} onUpdate={onUpdate} careerJourney={careerJourney} readOnly={readOnly} actions={actions}
              rowClassName="flex justify-between items-baseline break-inside-avoid"
              render={(e) => (
                <>
                  <div className="text-[13px]"><span className="font-bold text-gray-900">{e.company}</span> <span className="italic text-gray-800">{e.title}</span></div>
                  <div className="text-[12px] text-gray-600 font-sans">{e.dates}</div>
                </>
              )}
            />
          </div>
        </div>
      )}

      {/* Education */}
      <div className="mb-2 flex">
        <div className="w-1/4 pr-4 border-r border-gray-300">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-900 font-sans mt-1">Education</h3>
        </div>
        <div className="w-3/4 pl-4 space-y-3">
          {resume.education.map((edu, i) => (
            <div key={i} className="break-inside-avoid">
              <div className="flex justify-between items-baseline">
                <span className="font-bold text-gray-900 text-[14px]">{edu.institution}</span>
                <span className="text-gray-600 text-[12px] font-sans">{edu.graduationDate}</span>
              </div>
              <div className="italic text-gray-800 text-[13px]">
                {edu.degree}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
