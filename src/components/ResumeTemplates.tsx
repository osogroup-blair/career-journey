import React from 'react';
import { GeneratedResume } from '../types';
import { EditableText } from './EditableText';

interface TemplateProps {
  resume: GeneratedResume;
  tagline?: string;
  onUpdate: (newResume: GeneratedResume) => void;
}

export const ClassicTemplate: React.FC<TemplateProps> = ({ resume, tagline, onUpdate }) => {
  return (
    <div className="text-black font-sans leading-relaxed">
      {/* Header */}
      <div className="text-center mb-6">
        <EditableText 
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
          <EditableText
            value={resume.contactInfo}
            onChange={(v) => onUpdate({...resume, contactInfo: v})}
          />
        </div>
      </div>

      {/* Summary */}
      <div className="mb-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-2">Executive Summary</h3>
        <EditableText
          tagName="p"
          multiline
          value={resume.summary}
          onChange={(v) => onUpdate({...resume, summary: v})}
          className="text-[13px] leading-relaxed text-slate-800"
        />
      </div>

      {/* Core Skills */}
      <div className="mb-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-2">Core Competencies</h3>
        <div className="grid grid-cols-1 gap-1 text-[13px]">
          {resume.skills.map((s, i) => (
            <div key={i}>
              <span className="font-semibold text-slate-900">{s.category}:</span> <span className="text-slate-700">{s.terms}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Professional Experience */}
      <div className="mb-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-3">Professional Experience</h3>
        <div className="space-y-4">
          {resume.experience.map((exp, i) => (
            <div key={i} className="break-inside-avoid">
              <div className="flex justify-between items-end mb-1">
                <div>
                  <h4 className="font-bold text-slate-900 text-[14px]">{exp.title}</h4>
                  <div className="font-semibold text-slate-700 text-[13px]">
                    {exp.companyUrl ? (
                      <a href={exp.companyUrl} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline decoration-1 underline-offset-2">{exp.company}</a>
                    ) : exp.company}
                    {exp.companyDescriptor && <span className="text-slate-500 font-normal"> — {exp.companyDescriptor}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] text-slate-800 font-medium">{exp.dates}</div>
                  <div className="text-[12px] text-slate-500">{exp.location}</div>
                </div>
              </div>
              <ul className="list-disc pl-5 mt-1.5 space-y-1 text-[13px] text-slate-800">
                {exp.bullets.map((b, bi) => (
                  <li key={bi} className="leading-snug">
                    <EditableText
                      multiline
                      value={b}
                      onChange={(v) => {
                        const newExp = [...resume.experience];
                        newExp[i].bullets[bi] = v;
                        onUpdate({ ...resume, experience: newExp });
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

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

export const ModernTemplate: React.FC<TemplateProps> = ({ resume, tagline, onUpdate }) => {
  return (
    <div className="text-zinc-800 font-sans leading-relaxed">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between border-b pb-4 border-zinc-300">
        <div>
          <EditableText
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
          <EditableText
             multiline
             value={resume.contactInfo}
             onChange={(v) => onUpdate({...resume, contactInfo: v})}
          />
        </div>
      </div>

      {/* Summary */}
      <div className="mb-6">
        <EditableText
          tagName="p"
          multiline
          value={resume.summary}
          onChange={(v) => onUpdate({...resume, summary: v})}
          className="text-[14px] leading-relaxed text-zinc-700 font-medium"
        />
      </div>

      {/* Core Skills */}
      <div className="mb-8">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-3">Skills & Technologies</h3>
        <div className="grid grid-cols-1 gap-2 text-[13px]">
          {resume.skills.map((s, i) => (
            <div key={i} className="flex gap-2">
              <span className="font-bold text-zinc-900 min-w-[120px]">{s.category}</span> 
              <span className="text-zinc-600">{s.terms}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Professional Experience */}
      <div className="mb-8">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Experience</h3>
        <div className="space-y-6">
          {resume.experience.map((exp, i) => (
            <div key={i} className="break-inside-avoid">
              <div className="flex flex-col md:flex-row md:justify-between mb-2">
                <div>
                  <h4 className="font-bold text-zinc-900 text-base">{exp.title}</h4>
                  <div className="text-brand-600 font-semibold text-[14px]">
                    {exp.companyUrl ? (
                      <a href={exp.companyUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-1 underline-offset-2">{exp.company}</a>
                    ) : exp.company}
                    {exp.companyDescriptor && <span className="text-zinc-500 font-normal"> — {exp.companyDescriptor}</span>}
                  </div>
                </div>
                <div className="text-left md:text-right mt-1 md:mt-0">
                  <div className="text-[14px] text-zinc-900 font-medium">{exp.dates}</div>
                  <div className="text-[12px] text-zinc-500">{exp.location}</div>
                </div>
              </div>
              <ul className="list-disc pl-4 space-y-1.5 text-[13px] text-zinc-700">
                {exp.bullets.map((b, bi) => (
                  <li key={bi} className="leading-relaxed">
                    <EditableText
                      multiline
                      value={b}
                      onChange={(v) => {
                        const newExp = [...resume.experience];
                        newExp[i].bullets[bi] = v;
                        onUpdate({ ...resume, experience: newExp });
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

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

export const ExecutiveTemplate: React.FC<TemplateProps> = ({ resume, tagline, onUpdate }) => {
  return (
    <div className="text-gray-900 font-serif leading-relaxed">
      {/* Header */}
      <div className="text-center mb-6">
        <EditableText
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
          <EditableText
            value={resume.contactInfo}
            onChange={(v) => onUpdate({...resume, contactInfo: v})}
          />
        </div>
      </div>

      {/* Summary */}
      <div className="mb-6">
        <EditableText
          tagName="p"
          multiline
          value={resume.summary}
          onChange={(v) => onUpdate({...resume, summary: v})}
          className="text-[13px] leading-relaxed text-gray-800 text-justify"
        />
      </div>

      {/* Core Skills */}
      <div className="mb-6 px-4">
        <div className="border-t border-b border-gray-300 py-3 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-[12px] font-sans">
          {resume.skills.map((s, i) => (
            <div key={i}>
              <span className="font-bold text-gray-900">{s.category}:</span> <span className="text-gray-700">{s.terms}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Professional Experience */}
      <div className="mb-6 flex">
        <div className="w-1/4 pr-4 border-r border-gray-300">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-900 font-sans mt-1">Experience</h3>
        </div>
        <div className="w-3/4 pl-4 space-y-6">
          {resume.experience.map((exp, i) => (
            <div key={i} className="break-inside-avoid">
              <div className="mb-2">
                <div className="flex justify-between items-baseline">
                  <h4 className="font-bold text-gray-900 text-[15px]">
                    {exp.companyUrl ? (
                      <a href={exp.companyUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-1 underline-offset-2">{exp.company}</a>
                    ) : exp.company}
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
                {exp.bullets.map((b, bi) => (
                  <li key={bi} className="leading-normal">
                    <EditableText
                      multiline
                      value={b}
                      onChange={(v) => {
                        const newExp = [...resume.experience];
                        newExp[i].bullets[bi] = v;
                        onUpdate({ ...resume, experience: newExp });
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

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
