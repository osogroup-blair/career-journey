import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, Badge, CardContent, Input } from '../components/ui';
import JourneyGuide from '../components/JourneyGuide';
import {
  Briefcase,
  Sparkles,
  Pencil,
  Calendar,
  MapPin,
  CheckCircle2,
  Target,
  Search,
  Copy,
  Check,
  Building2,
  Users2,
  Cpu,
  Layers,
  Flame,
  ArrowUpRight,
  ArrowRight,
  Filter,
  BookOpen,
  DollarSign,
  Zap,
  X
} from 'lucide-react';

const PROFICIENCY_WIDTH: Record<string, number> = {
  Expert: 95,
  Advanced: 78,
  Intermediate: 55,
  Beginner: 32,
};

function proficiencyWidth(level?: string) {
  return PROFICIENCY_WIDTH[level || ''] ?? 65;
}

// Parses "2022-01" / "2019-04" / "Present" style strings into a rough month count.
function parseMonthIndex(value?: string): number | null {
  if (!value) return null;
  if (/present/i.test(value)) {
    const now = new Date();
    return now.getFullYear() * 12 + now.getMonth();
  }
  const match = value.match(/(\d{4})(?:-(\d{2}))?/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = match[2] ? parseInt(match[2], 10) - 1 : 0;
  return year * 12 + month;
}

function computeYearsOfExperience(roles: any[]): number | null {
  const starts = roles.map((r) => parseMonthIndex(r.start_date || r.dates)).filter((v): v is number => v !== null);
  const ends = roles.map((r) => parseMonthIndex(r.end_date || r.dates) ?? parseMonthIndex(new Date().toISOString())).filter((v): v is number => v !== null);
  if (starts.length === 0) return null;
  const earliest = Math.min(...starts);
  const latest = Math.max(...ends, earliest);
  return Math.max(0, Math.round(((latest - earliest) / 12) * 10) / 10);
}

export default function Dashboard() {
  const { jobs, careerJourney } = useStore();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'timeline' | 'skills' | 'applications'>('timeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkillFilter, setSelectedSkillFilter] = useState<string | null>(null);
  const [copiedRoleId, setCopiedRoleId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const meta = careerJourney?.meta || {};
  const roles = useMemo(() => careerJourney?.roles || [], [careerJourney]);
  const skills = useMemo(() => careerJourney?.skills_index || [], [careerJourney]);
  const jobList = useMemo(() => Object.values(jobs || {}), [jobs]);

  // Aggregate Metrics — derived from real data, not fixed copy.
  const totalAchievements = useMemo(() => {
    return roles.reduce((acc: number, r: any) => acc + (r.achievements?.length || 0), 0);
  }, [roles]);

  const totalDeliverables = useMemo(() => {
    return roles.reduce((acc: number, r: any) => acc + (r.deliverables?.length || 0), 0);
  }, [roles]);

  const yearsOfExperience = useMemo(() => computeYearsOfExperience(roles), [roles]);

  const skillsGroupedByCategory = useMemo(() => {
    const groups: Record<string, any[]> = {};
    skills.forEach((s: any) => {
      const cat = s.category || 'Core Competency';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    });
    return groups;
  }, [skills]);

  // Top distinct skills for quick filter pills
  const availableSkillPills = useMemo(() => {
    const set = new Set<string>();
    roles.forEach((r: any) => {
      r.skills?.forEach((s: string) => set.add(s));
    });
    return Array.from(set).slice(0, 10);
  }, [roles]);

  // Filtered Roles (drives the role switcher list)
  const filteredRoles = useMemo(() => {
    return roles.filter((role: any) => {
      const matchesSearch =
        !searchQuery ||
        role.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        role.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        role.industry?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        role.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        role.skills?.some((s: string) => s.toLowerCase().includes(searchQuery.toLowerCase())) ||
        role.deliverables?.some((d: any) => (typeof d === 'string' ? d : d.description)?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        role.achievements?.some((a: any) => (typeof a === 'string' ? a : a.description)?.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesSkill =
        !selectedSkillFilter ||
        role.skills?.some((s: string) => s.toLowerCase() === selectedSkillFilter.toLowerCase()) ||
        role.initiatives?.some((init: any) => init.skills?.some((sk: string) => sk.toLowerCase() === selectedSkillFilter.toLowerCase()));

      return matchesSearch && matchesSkill;
    });
  }, [roles, searchQuery, selectedSkillFilter]);

  const selectedRole = useMemo(() => {
    return filteredRoles.find((r: any) => r.id === selectedRoleId) || filteredRoles[0] || null;
  }, [filteredRoles, selectedRoleId]);

  const handleCopyBullets = (role: any) => {
    const bullets: string[] = [];
    if (role.achievements) {
      role.achievements.forEach((ach: any) => {
        if (typeof ach === 'string') bullets.push(`• ${ach}`);
        else if (ach.metric && ach.description) bullets.push(`• [${ach.metric}] ${ach.description}`);
        else if (ach.description) bullets.push(`• ${ach.description}`);
      });
    }
    if (role.deliverables) {
      role.deliverables.forEach((del: any) => {
        if (typeof del === 'string') bullets.push(`• ${del}`);
        else if (del.description) bullets.push(`• ${del.description}`);
      });
    }
    const textToCopy = `${role.title} at ${role.company || role.organization} (${role.dates})\n\n${bullets.join('\n')}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedRoleId(role.id);
    setTimeout(() => setCopiedRoleId(null), 2500);
  };

  const goEdit = (roleId?: string) => {
    navigate('/edit', roleId ? { state: { roleId } } : undefined);
  };

  return (
    <div className="min-h-screen bg-slate-900/5 font-sans text-slate-900 pb-20">

      {/* Hero Header Section with Rich Dark Gradient */}
      <section className="bg-gradient-to-br from-brand-950 via-slate-900 to-slate-950 text-white pt-10 pb-24 px-4 sm:px-6 lg:px-8 border-b border-brand-950 relative overflow-hidden">
        {/* Background ambient lighting */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-80 h-80 bg-brand-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="mx-auto max-w-7xl relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                  {meta.framework || 'Career Journey'}
                </span>
                <span className="text-xs text-slate-400 font-mono">v{meta.version || '1.0.0'}</span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs text-slate-400">Updated {meta.last_updated || 'Today'}</span>
              </div>

              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
                {meta.owner || 'Your Name'}
              </h1>

              <p className="mt-3 text-base sm:text-lg text-slate-300 leading-relaxed font-normal">
                {meta.description || 'Add a description of your career story to introduce yourself here.'}
              </p>

              {meta.target_role && (
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-brand-900/60 border border-brand-700/50 text-brand-200 text-sm font-medium">
                    <Target className="w-4 h-4 text-brand-400 shrink-0" />
                    <span>Target Focus: <strong className="text-white">{meta.target_role}</strong></span>
                  </div>
                  {meta.target_role_alignment && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-slate-200 text-xs font-semibold">
                      <Zap className="w-3.5 h-3.5 text-brand-400" />
                      <span>{meta.target_role_alignment}% Target Readiness</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
              <Button
                onClick={() => goEdit()}
                className="bg-brand-600 hover:bg-brand-500 text-white font-semibold shadow-lg shadow-brand-600/30 px-5 py-2.5 h-auto text-sm"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit Career Journey
              </Button>
            </div>
          </div>

          {/* Metric Bar — derived from actual career journey data */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-10">

            <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <span>Timeline Depth</span>
                <Calendar className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-bold text-white">{yearsOfExperience !== null ? `${yearsOfExperience}+ Years` : '—'}</div>
                <div className="text-xs text-slate-400 mt-0.5">{roles.length} Professional Role{roles.length === 1 ? '' : 's'}</div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <span>Total Scale</span>
                <Flame className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-bold text-white">{meta.total_scale_managed || '—'}</div>
                <div className="text-xs text-slate-400 mt-0.5">High-Throughput Systems</div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <span>Business Impact</span>
                <DollarSign className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-bold text-white">{meta.total_financial_impact || '—'}</div>
                <div className="text-xs text-slate-400 mt-0.5">Revenue & Cost Efficiencies</div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <span>Evidence Points</span>
                <CheckCircle2 className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-bold text-white">{totalAchievements + totalDeliverables}</div>
                <div className="text-xs text-slate-400 mt-0.5">{totalAchievements} Metrics • {totalDeliverables} Deliverables</div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10 flex flex-col justify-between col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <span>Master Skills</span>
                <Cpu className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-bold text-white">{skills.length || availableSkillPills.length}</div>
                <div className="text-xs text-slate-400 mt-0.5">Indexed Competencies</div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Main Showcase Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 -mt-10 relative z-20">

        <JourneyGuide />

        {/* Tab Bar */}
        <div className="flex flex-wrap items-center border-b border-slate-200 bg-white rounded-t-2xl px-6 py-2 shadow-sm gap-1 sm:gap-4">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex items-center gap-2 py-3 px-3 sm:px-4 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'timeline'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Timeline</span>
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-normal">{roles.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('skills')}
            className={`flex items-center gap-2 py-3 px-3 sm:px-4 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'skills'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Skills</span>
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-normal">{skills.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('applications')}
            className={`flex items-center gap-2 py-3 px-3 sm:px-4 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'applications'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Applications</span>
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-normal">{jobList.length}</span>
          </button>
        </div>

        {/* ===================================================================== */}
        {/* CAREER TIMELINE — role switcher (list) + detail panel */}
        {/* ===================================================================== */}
        {activeTab === 'timeline' && (
        <div className="bg-white rounded-b-2xl p-6 sm:p-8 shadow-sm border border-t-0 border-slate-200 space-y-6">

          <div>
            <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-brand-600" />
              Career Timeline & Milestones
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Pick a role to see the full story — initiatives, achievements, and evidence.</p>
          </div>

          {/* Search + Skill Filter Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Search roles, deliverables, metrics, tech stack..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-50/70 border-slate-200 text-sm h-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Filter Tech:
              </span>
              {availableSkillPills.map((skill) => (
                <button
                  key={skill}
                  onClick={() => setSelectedSkillFilter(selectedSkillFilter === skill ? null : skill)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    selectedSkillFilter === skill
                      ? 'bg-brand-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {skill}
                </button>
              ))}
              {selectedSkillFilter && (
                <button
                  onClick={() => setSelectedSkillFilter(null)}
                  className="text-xs text-brand-600 hover:text-brand-800 underline font-semibold ml-1"
                >
                  Clear Filter
                </button>
              )}
            </div>
          </div>

          {filteredRoles.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
              <Search className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <h4 className="text-base font-bold text-slate-800">No matching timeline entries found</h4>
              <p className="text-xs text-slate-500 mt-1">Try clearing your search query or skill filter.</p>
              <Button
                onClick={() => { setSearchQuery(''); setSelectedSkillFilter(null); }}
                variant="outline"
                size="sm"
                className="mt-3 bg-white"
              >
                Reset Filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">

              {/* Role Switcher List */}
              <div className="space-y-2 lg:sticky lg:top-24">
                {filteredRoles.map((role: any, idx: number) => {
                  const isSelected = selectedRole?.id === role.id;
                  return (
                    <button
                      key={role.id || idx}
                      onClick={() => setSelectedRoleId(role.id)}
                      className={`w-full text-left rounded-xl border p-3.5 transition-all ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50 shadow-sm ring-1 ring-brand-500/30'
                          : 'border-slate-200 bg-white hover:border-brand-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className={`text-sm font-bold truncate ${isSelected ? 'text-brand-800' : 'text-slate-900'}`}>
                            {role.title}
                          </div>
                          <div className="text-xs text-slate-500 font-medium truncate">{role.company || role.organization}</div>
                        </div>
                        <ArrowRight className={`w-3.5 h-3.5 shrink-0 mt-0.5 transition-transform ${isSelected ? 'text-brand-600 translate-x-0.5' : 'text-slate-300'}`} />
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-1.5">{role.dates}</div>
                      {role.skills && role.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {role.skills.slice(0, 4).map((sk: string, sIdx: number) => (
                            <span
                              key={sIdx}
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                isSelected ? 'bg-white text-brand-700 border border-brand-200' : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {sk}
                            </span>
                          ))}
                          {role.skills.length > 4 && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 text-slate-400">+{role.skills.length - 4}</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Selected Role Detail Panel */}
              {selectedRole && (
                <Card className="shadow-sm border-slate-200">

                  <CardHeader className="bg-slate-50/90 border-b border-slate-100 pb-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-xl font-extrabold text-slate-900">{selectedRole.title}</CardTitle>
                          {selectedRole.industry && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-100">
                              {selectedRole.industry}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 mt-1">
                          <span className="font-bold text-brand-600 flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5" />
                            {selectedRole.company || selectedRole.organization}
                          </span>

                          {selectedRole.location && (
                            <span className="text-slate-500 flex items-center gap-1 text-xs">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              {selectedRole.location}
                            </span>
                          )}

                          {selectedRole.team_scope && (
                            <span className="text-slate-500 flex items-center gap-1 text-xs font-medium">
                              <Users2 className="w-3.5 h-3.5 text-slate-400" />
                              {selectedRole.team_scope}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start lg:self-auto">
                        <Badge variant="outline" className="bg-white border-slate-200 text-slate-800 font-mono text-xs px-3 py-1">
                          {selectedRole.dates}
                        </Badge>
                        {selectedRole.duration && (
                          <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2.5 py-1 rounded-md">
                            {selectedRole.duration}
                          </span>
                        )}
                      </div>
                    </div>

                    {selectedRole.mission && (
                      <div className="mt-3 text-xs bg-brand-50/60 p-2.5 rounded-lg border border-brand-100/70 text-brand-950 flex items-start gap-2 font-medium">
                        <Target className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                        <span><strong>Core Mandate:</strong> {selectedRole.mission}</span>
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="pt-5 space-y-6">

                    {selectedRole.summary && (
                      <p className="text-sm text-slate-700 leading-relaxed font-normal">
                        {selectedRole.summary}
                      </p>
                    )}

                    {/* Skills used in this role — surfaced up top, not buried */}
                    {selectedRole.skills && selectedRole.skills.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
                          <Cpu className="w-4 h-4 text-brand-500" /> Skills Used in This Role
                        </h4>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {selectedRole.skills.map((sk: string, sIdx: number) => (
                            <button
                              key={sIdx}
                              onClick={() => setSelectedSkillFilter(selectedSkillFilter === sk ? null : sk)}
                              className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                                selectedSkillFilter === sk
                                  ? 'bg-brand-600 text-white'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }`}
                            >
                              {sk}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedRole.achievements && selectedRole.achievements.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                          <Flame className="w-4 h-4 text-slate-400" /> Key Measured Achievements & ROI
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {selectedRole.achievements.map((ach: any, aIdx: number) => {
                            const isObj = typeof ach === 'object' && ach !== null;
                            const metric = isObj ? ach.metric : 'Impact';
                            const label = isObj ? ach.label : (ach.category || 'Result');
                            const desc = isObj ? ach.description : ach;

                            return (
                              <div
                                key={aIdx}
                                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:border-brand-300 transition-colors"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-base font-extrabold text-brand-800">{metric}</span>
                                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-brand-100 text-brand-800">
                                    {label}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-700 leading-snug mt-1 font-medium">
                                  {desc}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {selectedRole.initiatives && selectedRole.initiatives.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                          <Zap className="w-4 h-4 text-brand-500" /> Strategic Initiatives & Systems Architecture
                        </h4>
                        <div className="space-y-3">
                          {selectedRole.initiatives.map((init: any, iIdx: number) => (
                            <div key={iIdx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                                <h5 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-brand-600" />
                                  {init.name}
                                </h5>
                                {init.impact && (
                                  <span className="text-xs font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md self-start sm:self-auto">
                                    {init.impact}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed mb-2">
                                {init.description}
                              </p>
                              {init.skills && init.skills.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {init.skills.map((s: string, sIdx: number) => (
                                    <span key={sIdx} className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedRole.deliverables && selectedRole.deliverables.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
                          <BookOpen className="w-4 h-4 text-brand-500" /> Verified Shipped Deliverables
                        </h4>
                        <ul className="space-y-2">
                          {selectedRole.deliverables.map((del: any, dIdx: number) => {
                            const text = typeof del === 'string' ? del : del.description;
                            return (
                              <li key={dIdx} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700">
                                <CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                                <span className="leading-relaxed">{text}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {selectedRole.methodologies && selectedRole.methodologies.length > 0 && (
                      <div className="pt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-brand-400" /> Methodologies:
                        </span>
                        {selectedRole.methodologies.map((m: string, mIdx: number) => (
                          <span key={mIdx} className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                            {m}
                          </span>
                        ))}
                      </div>
                    )}

                  </CardContent>

                  {/* Card Action Controls Footer */}
                  <div className="p-4 bg-slate-50/80 border-t border-slate-100 rounded-b-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyBullets(selectedRole)}
                      className="bg-white text-slate-700 hover:bg-slate-100"
                    >
                      {copiedRoleId === selectedRole.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1 text-brand-600" />
                          <span className="text-brand-700 font-bold">Copied Bullets!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 mr-1" />
                          Copy ATS Bullets
                        </>
                      )}
                    </Button>

                    <button
                      onClick={() => goEdit(selectedRole.id)}
                      className="font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1 uppercase tracking-wider"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit This Role
                    </button>
                  </div>

                </Card>
              )}
            </div>
          )}

        </div>
        )}

        {/* ===================================================================== */}
        {/* SKILLS & COMPETENCIES */}
        {/* ===================================================================== */}
        {activeTab === 'skills' && (
        <div className="bg-white rounded-b-2xl p-6 sm:p-8 shadow-sm border border-t-0 border-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-brand-600" />
                Skills & Competencies
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Indexed cross-role technical proficiencies, architectures, and domain depth.
              </p>
            </div>
          </div>

          {Object.keys(skillsGroupedByCategory).length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">
              No skills indexed yet.
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {Object.entries(skillsGroupedByCategory).map(([category, catSkills]: [string, any[]]) => (
              <div key={category} className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{category}</h3>
                <div className="space-y-3">
                  {catSkills.map((skill: any, idx: number) => (
                    <div key={idx}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-sm font-semibold text-slate-800">{skill.name}</span>
                        <span className="text-xs text-slate-500 font-medium">{skill.level || skill.proficiency || 'Expert'} • {skill.years || `${skill.years_experience || ''}`}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${proficiencyWidth(skill.level || skill.proficiency)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* ===================================================================== */}
        {/* RECENT TAILORING PROJECTS (compact preview) */}
        {/* ===================================================================== */}
        {activeTab === 'applications' && (
        <div className="bg-white rounded-b-2xl p-6 sm:p-8 shadow-sm border border-t-0 border-slate-200 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-brand-600" />
                Tailoring Projects
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                {jobList.length} job{jobList.length === 1 ? '' : 's'} analyzed against this Career Journey.
              </p>
            </div>
            <Button onClick={() => navigate('/applications')} variant="outline" size="sm" className="bg-white">
              View All <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>

          {jobList.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">
              No tailoring projects yet.{' '}
              <button onClick={() => navigate('/applications')} className="text-brand-600 font-semibold hover:underline">
                Start one
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {jobList.slice(0, 3).map((job) => (
                <Card
                  key={job.id}
                  className="hover:border-brand-400 transition-all cursor-pointer group shadow-xs hover:shadow-md"
                  onClick={() => navigate(`/job/${job.id}/intake`)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start gap-2">
                      <div className="pr-2 min-w-0">
                        <p className="text-sm font-bold truncate group-hover:text-brand-600 transition-colors">{job.roleTitle}</p>
                        <p className="text-xs font-semibold text-slate-500 truncate">{job.companyName}</p>
                      </div>
                      <Badge variant={job.status === 'Resume Build Ready' ? 'success' : 'default'} className="truncate shrink-0 max-w-[100px] text-[10px]">
                        {job.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
        )}

      </main>

    </div>
  );
}
