import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, Label, Textarea, Badge, useToast } from '../components/ui';
import { normalizeCareerJourney, validateCareerJourney } from '../lib/careerJourneyNormalize';
import { parseCareerJourneyImport } from '../lib/careerJourneyImport';
import { buildCareerJourneyTemplate } from '../lib/careerJourneyTemplate';
import {
  ChevronLeft, Save, Code, Plus, Trash2, Briefcase, Award, Zap,
  BookOpen, Link2, Tag, Check, Layers, Bookmark, Users, GraduationCap,
  ClipboardList, Info, Settings, RefreshCw, Download, Upload, User, FileJson, FileDown, MessageCircle, ChevronDown, ChevronRight
} from 'lucide-react';

// Robust 12-Tier Core Ontology Professional Sample
const COMPREHENSIVE_SAMPLE_JOURNEY = {
  meta: {
    owner: "Jane Doe",
    version: "1.1.0",
    framework: "Career Journey",
    description: "Standardized 12-tier ontology single source of truth for career intelligence matching algorithms.",
    last_updated: new Date().toISOString().split('T')[0],
    version_X_Y_changes: [
      "Initialized professional profile under the 12-tier standardized ontology",
      "Mapped 36 achievements and 64 standardized technical skills",
      "Configured precise cross-referenced search indexing layers"
    ]
  },
  roles: [
    {
      id: "ROLE-001",
      organization: "Stripe",
      company: "Stripe", // Back-compat
      title: "Lead Software Engineer",
      start_date: "2023-01",
      end_date: "Present",
      dates: "2023 - Present", // Back-compat
      location: "San Francisco, CA (Hybrid)",
      description: "Direct Stripe's primary API checkout latency team resolving high-throughput payment bottlenecks.",
      initiatives: [
        {
          id: "INIT-001",
          name: "APAC Latency Core API Rewrite",
          description: "Decreased core checkout endpoint latencies by 140ms, raising overall conversion index by 2.4%."
        },
        {
          id: "INIT-002",
          name: "Dynamic Card Routing Infrastructure",
          description: "Architected automated credit card network fallback routing strategies."
        }
      ],
      // Back-compat structures for other workspace tools (Keywords.tsx, PatchReview, etc.)
      deliverables: [
        {
          id: "del-11",
          description: "Stripe Checkout latency core API rewrite and optimization.",
          skills: ["API Design", "TypeScript", "Performance Tuning"]
        }
      ],
      achievements: [
        {
          id: "ach-11",
          description: "Recovered $12M annually from false-positive regional credit card processing declines.",
          skills: ["Payments Systems", "Performance Tuning"]
        }
      ],
      skills: ["TypeScript", "API Design", "Performance Tuning", "Payments Systems"]
    },
    {
      id: "ROLE-002",
      organization: "Netflix",
      company: "Netflix", // Back-compat
      title: "Senior Product Engineer",
      start_date: "2020-03",
      end_date: "2022-12",
      dates: "2020 - 2022", // Back-compat
      location: "Los Gatos, CA",
      description: "Optimized performance grid elements on smart TV dynamic canvas architectures.",
      initiatives: [
        {
          id: "INIT-003",
          name: "Smart TV Personalization Layouts",
          description: "Devised off-thread tile selection workflows reducing lag during peak content distribution."
        }
      ],
      deliverables: [
        {
          id: "del-21",
          description: "Personalization Grid dynamic layout performance components.",
          skills: ["React", "Performance Tuning"]
        }
      ],
      achievements: [
        {
          id: "ach-21",
          description: "Achieved 98% browser test pass rates across low-resource client smart devices.",
          skills: ["System Architecture"]
        }
      ],
      skills: ["React", "Performance Tuning", "System Architecture"]
    }
  ],
  achievements: [
    {
      id: "ACH-001",
      title: "APAC Latency Optimization",
      description: "Reduced API checkout execution benchmarks by 140ms, increasing checkout completions by 2.4%.",
      category: "Performance"
    },
    {
      id: "ACH-002",
      title: "Regional Acquiring Bank Routing",
      description: "Prevented $12M in false transaction declines through automated banking fallback loops.",
      category: "Revenue Strategy"
    },
    {
      id: "ACH-003",
      title: "Smart TV Grid Responsiveness",
      description: "Boosted client tile clickthrough volumes by 4% using custom web worker state engines.",
      category: "UX Performance"
    }
  ],
  skills_index: [
    {
      id: "SK-001",
      name: "TypeScript",
      category: "Languages & Core",
      proficiency: "Expert",
      years_experience: 8,
      last_used: "2026-05"
    },
    {
      id: "SK-002",
      name: "React",
      category: "Frontend Core",
      proficiency: "Expert",
      years_experience: 7,
      last_used: "2026-05"
    },
    {
      id: "SK-003",
      name: "API Design",
      category: "Architecture",
      proficiency: "Expert",
      years_experience: 6,
      last_used: "2026-05"
    },
    {
      id: "SK-004",
      name: "Performance Tuning",
      category: "Systems",
      proficiency: "Expert",
      years_experience: 5,
      last_used: "2026-05"
    },
    {
      id: "SK-005",
      name: "Payments Systems",
      category: "Domains",
      proficiency: "Intermediate",
      years_experience: 3,
      last_used: "2026-03"
    }
  ],
  capabilities: [
    {
      id: "CAP-001",
      name: "Technical Systems Architecture",
      description: "Structuring high-scale, fault-tolerant financial and media platforms without single points of failure.",
      maturity_level: "Transformational",
      functions: ["FN-001", "FN-002"]
    },
    {
      id: "CAP-002",
      name: "Performance Engineering Ops",
      description: "Drastically reducing operational overhead through hardware, network, and compiler optimizations.",
      maturity_level: "Advanced",
      functions: ["FN-003"]
    }
  ],
  links: {
    keywords: [
      { keyword: "checkout api", entity_type: "achievement", entity_id: "ACH-001" },
      { keyword: "scaling transactions", entity_type: "capability", entity_id: "CAP-001" }
    ],
    industries: [
      { industry: "Fintech / Transaction Rails", role_id: "ROLE-001" },
      { industry: "SaaS Streaming Platforms", role_id: "ROLE-002" }
    ],
    deliverable_achievement: [
      { deliverable_id: "DEL-001", achievement_id: "ACH-001" }
    ],
    education_alignment: [
      { education_id: "EDU-001", capability_id: "CAP-001" }
    ],
    timeline_mappings: [
      { id: "MAP-001", entity_type: "achievement", entity_id: "ACH-001", role_id: "ROLE-001", initiative_id: "INIT-001", context: "Demonstrated during APAC Latency Core API Rewrite." },
      { id: "MAP-002", entity_type: "achievement", entity_id: "ACH-002", role_id: "ROLE-001", initiative_id: "INIT-002", context: "Demonstrated on Dynamic Card Routing fallback paths." },
      { id: "MAP-003", entity_type: "achievement", entity_id: "ACH-003", role_id: "ROLE-002", initiative_id: "INIT-003", context: "Completed for Smart TV off-thread user personalization." },
      { id: "MAP-004", entity_type: "skill", entity_id: "SK-001", role_id: "ROLE-001", initiative_id: "INIT-001", context: "Employed for core payment services rewrite in TS." },
      { id: "MAP-005", entity_type: "skill", entity_id: "SK-002", role_id: "ROLE-002", initiative_id: "INIT-003", context: "Used React custom render frames to raise responsiveness." },
      { id: "MAP-006", entity_type: "capability", entity_id: "CAP-001", role_id: "ROLE-001", initiative_id: "INIT-001", context: "Restructured checkout APIs with zero single point of failures." },
      { id: "MAP-007", entity_type: "methodology", entity_id: "METH-001", role_id: "ROLE-001", initiative_id: "INIT-001", context: "Practiced DDD structures across Stripe enterprise models." },
      { id: "MAP-008", entity_type: "deliverable", entity_id: "DEL-001", role_id: "ROLE-001", initiative_id: "INIT-001", context: "Formulated specification document and network diagrams." }
    ]
  },
  methodologies: [
    {
      id: "METH-001",
      name: "Domain-Driven Design (DDD)",
      description: "A software architecture design methodology mapping complex systems to strict enterprise operations.",
      context: "Formulating model parameters for the checkout API routing rails."
    },
    {
      id: "METH-002",
      name: "PADRE Framework",
      description: "Diagnostics program directing performance issues proactively.",
      context: "Applied directly across regional acquiring bank performance reviews."
    }
  ],
  functions: [
    {
      id: "FN-001",
      name: "Dynamic Logical Routing Mapping",
      description: "Creating granular software routes preventing transaction lockouts dynamically."
    },
    {
      id: "FN-002",
      name: "Sub-Second Microservice Scaling",
      description: "Designing real-time service boots dealing with unexpected traffic bursts."
    },
    {
      id: "FN-003",
      name: "Off-Thread Buffer Scheduling",
      description: "Enforcing thread concurrency locks inside browser sandboxes."
    }
  ],
  deliverables: [
    {
      id: "DEL-001",
      title: "Regional Latency Blueprint Document",
      description: "Architecture roadmap mapping APAC checkout routing networks.",
      type: "Technical Specification"
    },
    {
      id: "DEL-002",
      title: "Optimized WebWorker Grid Library",
      description: "Software package handling TV personalization canvas calculations asynchronously.",
      type: "Software Library"
    }
  ],
  customer_engagements: [
    {
      id: "ENG-001",
      client: "Samsung Hardware Operations",
      project: "Low-spec TV personalization pilot",
      description: "Conducted technical workspace validation deploying localized caching frameworks on smart TVs.",
      dates: "2021-11 to 2022-02",
      display: true
    }
  ],
  education: [
    {
      id: "EDU-001",
      institution: "Stanford University",
      program: "M.S. in Computer Science",
      dates: "2018 - 2020",
      location: "Palo Alto, CA",
      description: "Honors track concentrating on performance engineering and distributed services."
    }
  ],
  vocabularies: {
    maturity_levels: ["Foundational", "Developing", "Established", "Advanced", "Transformational"],
    competency_levels: ["L1-Associate", "L2-Intermediate", "L3-Senior", "L4-Principal", "L5-Distinguished"],
    proficiency_levels: ["Beginner", "Intermediate", "Advanced", "Expert"],
    value_stream_stages: ["Discovery", "Definition", "Refinement", "Validation", "Scale Operations"]
  }
};

export default function CareerJourney() {
  const navigate = useNavigate();
  const toast = useToast();
  const careerJourney = useStore((state) => state.careerJourney);
  const setCareerJourney = useStore((state) => state.setCareerJourney);

  const [activeTier, setActiveTier] = useState<string>('meta');
  const [rawText, setRawText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Synchronize JSON raw tab state
  useEffect(() => {
    if (activeTier === 'raw' && careerJourney) {
      setRawText(JSON.stringify(careerJourney, null, 2));
    }
  }, [careerJourney, activeTier]);

  // Handle uploaded JSON file import
  const handleCJUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const { data, issues, addedSections, isTemplate } = parseCareerJourneyImport(event.target?.result as string);

        const hasExistingData = careerJourney && (careerJourney.roles?.length || careerJourney.achievements?.length);
        if (hasExistingData && !isTemplate) {
          const proceed = window.confirm(
            'This will replace your current Career Journey data with the imported file. This cannot be undone. Continue?'
          );
          if (!proceed) return;
        }

        setCareerJourney(data);
        setRawText(JSON.stringify(data, null, 2));
        setJsonError(
          issues.length > 0
            ? `Loaded, but ${issues.length} field(s) didn't match the expected shape: ${issues.join('; ')}`
            : ''
        );
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      } catch (err: any) {
        setJsonError(`Failed to import JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  // Handle exporting/downloading JSON file of Career Journey (a full backup of this user's own data)
  const handleCJDownload = () => {
    try {
      if (!careerJourney) {
        toast.error("No active career journey data present to export.");
        return;
      }
      const validation = validateCareerJourney(careerJourney);
      if (!validation.success) {
        console.error('Career Journey failed validation before export:', validation.error.issues);
      }
      const blob = new Blob([JSON.stringify(careerJourney, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", url);
      downloadAnchor.setAttribute("download", `career-journey-v${careerJourney?.meta?.version || '1.0'}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(`Failed to export career journey file: ${err.message}`);
    }
  };

  // Downloads a blank, schema-valid starting point — no personal data, one example per section.
  const handleDownloadTemplate = () => {
    const template = buildCareerJourneyTemplate();
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", "career-journey-template.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
  };

  // Save manual JSON edits
  const handleSaveRaw = () => {
    try {
      const parsed = JSON.parse(rawText);
      const normalized = normalizeCareerJourney(parsed);
      setCareerJourney(normalized);
      setJsonError('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) {
      setJsonError(`Invalid JSON syntax: ${e.message}`);
    }
  };

  const handleLoadSample = () => {
    setCareerJourney(COMPREHENSIVE_SAMPLE_JOURNEY);
    setRawText(JSON.stringify(COMPREHENSIVE_SAMPLE_JOURNEY, null, 2));
    setJsonError('');
  };

  const updateRootJourney = (key: string, value: any) => {
    const updated = {
      ...careerJourney,
      [key]: value,
      meta: {
        ...careerJourney?.meta,
        last_updated: new Date().toISOString().split('T')[0]
      }
    };
    setCareerJourney(updated);
  };

  if (!careerJourney) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex items-center justify-center p-6">
        <Card className="max-w-xl w-full p-8 shadow-xl border-slate-200">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 shadow-inner">
              <Briefcase className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Career Journey</h1>
              <p className="text-sm mt-2 text-slate-500 leading-relaxed">
                A structured record of your work history, skills, and evidence — used to score job fit and tailor resumes.
              </p>
            </div>

            <div className="w-full pt-4 border-t border-slate-100 space-y-4">
              <div className="space-y-1">
                <Label className="text-left font-bold text-slate-600">Upload an Existing Career Journey JSON</Label>
                <div className="mt-1 flex items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-5 bg-slate-50 hover:bg-slate-100/50 transition-colors cursor-pointer relative">
                  <input type="file" accept=".json" onChange={handleCJUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                  <div className="text-center">
                    <span className="text-brand-500 text-xs font-bold">Select a Career Journey .json file</span>
                    <p className="text-[10px] text-slate-400 mt-1">Accepts a previous export or a blank template</p>
                  </div>
                </div>
              </div>

              <div className="text-slate-300 text-xs font-semibold flex items-center justify-center py-2">
                <span className="h-px bg-slate-200 flex-1"></span>
                <span className="px-3 uppercase text-[10px] text-slate-400 tracking-widest">OR START FRESH</span>
                <span className="h-px bg-slate-200 flex-1"></span>
              </div>

              <Button onClick={handleDownloadTemplate} variant="outline" className="w-full bg-white font-bold py-3">
                <Download className="w-4 h-4 mr-2" /> Download a Blank Template
              </Button>
              <Button onClick={handleLoadSample} className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 shadow-lg shadow-brand-500/20">
                <Zap className="w-4 h-4 mr-2" /> Load an Example Profile to Explore
              </Button>
            </div>

            <button onClick={() => navigate('/')} className="text-xs text-slate-500 hover:text-slate-700 font-semibold flex items-center gap-1 mt-4">
              <ChevronLeft className="w-4 h-4" /> Return to Dashboard
            </button>
          </div>
        </Card>
      </div>
    );
  }

  // Bind parameters cleanly with absolute typesafety guarantees
  const metaObj = careerJourney?.meta || {};
  const person = careerJourney?.person || { name: '', signature_outcomes: [], positioning: {} };
  const roles = Array.isArray(careerJourney?.roles) ? careerJourney.roles : [];
  const achievements = Array.isArray(careerJourney?.achievements) ? careerJourney.achievements : [];
  const skillsIndex = Array.isArray(careerJourney?.skills_index) ? careerJourney.skills_index : [];
  const capabilities = Array.isArray(careerJourney?.capabilities) ? careerJourney.capabilities : [];
  const links = careerJourney?.links || { keywords: [], industries: [], deliverable_achievement: [], education_alignment: [], deliverable_function: [], certification_alignment: [], timeline_mappings: [] };
  const methodologies = Array.isArray(careerJourney?.methodologies) ? careerJourney.methodologies : [];
  const functionsList = Array.isArray(careerJourney?.functions) ? careerJourney.functions : [];
  const deliverables = Array.isArray(careerJourney?.deliverables) ? careerJourney.deliverables : [];
  const engagements = Array.isArray(careerJourney?.customer_engagements) ? careerJourney.customer_engagements : [];
  const education = Array.isArray(careerJourney?.education) ? careerJourney.education : [];
  const certifications = Array.isArray(careerJourney?.certifications) ? careerJourney.certifications : [];
  const applicationArtifacts = careerJourney?.application_artifacts || { artifacts: [] };
  const interviewAnswers = careerJourney?.interview_answers || { answers: [] };
  const vocabularies = careerJourney?.vocabularies || COMPREHENSIVE_SAMPLE_JOURNEY.vocabularies;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-slate-50 font-sans text-slate-800 overflow-hidden">
      
      {/* Sidebar navigation list */}
      <aside className="w-72 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0 select-none">
        <div className="p-5 border-b border-slate-800 shrink-0">
          <button className="flex items-center text-xs font-bold text-slate-400 hover:text-white transition-colors mb-4 focus:outline-none" onClick={() => navigate('/')}>
             <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back to Dashboard
          </button>
          <div className="flex items-center gap-2">
            <span className="p-1 px-1.5 rounded bg-brand-600 text-white font-black text-xs tracking-wider">CJ</span>
            <h1 className="text-white font-bold text-md tracking-tight">Career Journey</h1>
          </div>
          <p className="text-[10px] mt-1 text-slate-500 uppercase tracking-widest font-semibold">v{metaObj.version || "1.0.0"}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="px-3 pb-1.5">
             <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Core Profile Assets</span>
          </div>

          <button onClick={() => setActiveTier('meta')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'meta' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <Settings className="w-3.5 h-3.5" />
            <span className="flex-1">1. Meta Identity & Changelog</span>
          </button>

          <button onClick={() => setActiveTier('person')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'person' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <User className="w-3.5 h-3.5" />
            <span className="flex-1">2. Person & Positioning</span>
          </button>

          <button onClick={() => setActiveTier('roles')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'roles' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <Briefcase className="w-3.5 h-3.5" />
            <span className="flex-1">3. Roles & Initiatives Timeline</span>
            <Badge className="bg-slate-950/40 border-none text-[9px] py-px px-1 text-slate-300 shrink-0">{roles.length}</Badge>
          </button>

          <button onClick={() => setActiveTier('achievements')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'achievements' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <Award className="w-3.5 h-3.5" />
            <span className="flex-1">4. Mapped Achievements</span>
            <Badge className="bg-slate-950/40 border-none text-[9px] py-px px-1 text-slate-300 shrink-0">{achievements.length}</Badge>
          </button>

          <button onClick={() => setActiveTier('skills')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'skills' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <Zap className="w-3.5 h-3.5" />
            <span className="flex-1">5. Skills Inventory Ledger</span>
            <Badge className="bg-slate-950/40 border-none text-[9px] py-px px-1 text-slate-300 shrink-0">{skillsIndex.length}</Badge>
          </button>

          <button onClick={() => setActiveTier('capabilities')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'capabilities' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <Layers className="w-3.5 h-3.5" />
            <span className="flex-1">6. Strategic Capabilities</span>
            <Badge className="bg-slate-950/40 border-none text-[9px] py-px px-1 text-slate-300 shrink-0">{capabilities.length}</Badge>
          </button>

          <button onClick={() => setActiveTier('links')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'links' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <Link2 className="w-3.5 h-3.5" />
            <span className="flex-1">7. Cross-Reference Indexer</span>
          </button>

          <div className="pt-4 pb-1.5 px-3">
             <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Method & Engineering</span>
          </div>

          <button onClick={() => setActiveTier('methodologies')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'methodologies' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <Bookmark className="w-3.5 h-3.5" />
            <span className="flex-1">8. System Methodologies</span>
            <Badge className="bg-slate-950/40 border-none text-[9px] py-px px-1 text-slate-300 shrink-0">{methodologies.length}</Badge>
          </button>

          <button onClick={() => setActiveTier('functions')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'functions' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <ClipboardList className="w-3.5 h-3.5" />
            <span className="flex-1">9. Legacy Functions Index</span>
            <Badge className="bg-slate-950/40 border-none text-[9px] py-px px-1 text-slate-300 shrink-0">{functionsList.length}</Badge>
          </button>

          <button onClick={() => setActiveTier('deliverables')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'deliverables' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <Tag className="w-3.5 h-3.5" />
            <span className="flex-1">10. Legacy Deliverables Index</span>
            <Badge className="bg-slate-950/40 border-none text-[9px] py-px px-1 text-slate-300 shrink-0">{deliverables.length}</Badge>
          </button>

          <button onClick={() => setActiveTier('engagements')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'engagements' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <Users className="w-3.5 h-3.5" />
            <span className="flex-1">11. Client Engagements</span>
            <Badge className="bg-slate-950/40 border-none text-[9px] py-px px-1 text-slate-300 shrink-0">{engagements.length}</Badge>
          </button>

          <button onClick={() => setActiveTier('education')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'education' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <GraduationCap className="w-3.5 h-3.5" />
            <span className="flex-1">12. Education Register</span>
          </button>

          <button onClick={() => setActiveTier('certifications')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'certifications' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <Award className="w-3.5 h-3.5" />
            <span className="flex-1">13. Certifications</span>
            <Badge className="bg-slate-950/40 border-none text-[9px] py-px px-1 text-slate-300 shrink-0">{certifications.length}</Badge>
          </button>

          <button onClick={() => setActiveTier('artifacts')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'artifacts' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <FileJson className="w-3.5 h-3.5" />
            <span className="flex-1">14. Application Artifacts</span>
            <Badge className="bg-slate-950/40 border-none text-[9px] py-px px-1 text-slate-300 shrink-0">{applicationArtifacts.artifacts.length}</Badge>
          </button>

          <button onClick={() => setActiveTier('interview')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'interview' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="flex-1">15. Interview Answers</span>
            <Badge className="bg-slate-950/40 border-none text-[9px] py-px px-1 text-slate-300 shrink-0">{interviewAnswers.answers.length}</Badge>
          </button>

          <button onClick={() => setActiveTier('vocabularies')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'vocabularies' ? 'bg-brand-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <BookOpen className="w-3.5 h-3.5" />
            <span className="flex-1">16. Vocabulary Enums</span>
          </button>

          <div className="pt-4 pb-1.5 px-3 border-t border-slate-800/80 mt-2">
             <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Developer Tools</span>
          </div>

          <button onClick={() => setActiveTier('raw')} className={`w-full text-left flex items-center gap-2.5 p-2 rounded text-xs transition-all ${activeTier === 'raw' ? 'bg-white text-slate-900 font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
            <Code className="w-3.5 h-3.5" />
            <span className="flex-1 font-mono">Raw JSON</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 text-center space-y-1 bg-slate-950/20">
          <p className="text-[10px] text-slate-500">Auto-Refreshed: {metaObj.last_updated || "Live"}</p>
        </div>
      </aside>

      {/* Main Core Editor Frame */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="h-16 shrink-0 bg-white border-b border-slate-200 px-8 flex items-center justify-between shadow-xs z-10 select-none">
          <div>
            <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <span>Section Explorer:</span>
              <span className="text-brand-600 font-black">
                {activeTier === 'meta' && "1. Meta Identity & Versioning"}
                {activeTier === 'person' && "2. Person & Positioning"}
                {activeTier === 'roles' && "3. Career Roles & Core Initiatives"}
                {activeTier === 'achievements' && "4. Discrete Mapped Achievements"}
                {activeTier === 'skills' && "5. Standardized Skills Index"}
                {activeTier === 'capabilities' && "6. Strategic High-Level Capabilities"}
                {activeTier === 'links' && "7. Cross-Reference Index Maps"}
                {activeTier === 'methodologies' && "8. Named Professional Methodologies"}
                {activeTier === 'functions' && "9. Legacy Functions Index"}
                {activeTier === 'deliverables' && "10. Legacy Deliverables Index"}
                {activeTier === 'engagements' && "11. Client & Partner Engagements"}
                {activeTier === 'education' && "12. Academic & Education Registry"}
                {activeTier === 'certifications' && "13. Certifications"}
                {activeTier === 'artifacts' && "14. Application Artifacts"}
                {activeTier === 'interview' && "15. Interview Answers"}
                {activeTier === 'vocabularies' && "16. Controlled Vocabulary Constants"}
                {activeTier === 'raw' && "JSON Code Console"}
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              {activeTier === 'functions' || activeTier === 'deliverables'
                ? "Superseded by the nested data under Capabilities and Roles → Initiatives — kept here so nothing already referencing these ids is lost."
                : activeTier !== 'raw' && "Maintain and link standardized professional history components with absolute integrity."}
              {activeTier === 'raw' && "Directly copy-paste, backup, or import your Career Journey JSON."}
            </p>
          </div>

          <div className="flex gap-2 items-center">
            <div className="relative inline-flex items-center gap-1.5 h-9 text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg px-3 transition-all cursor-pointer">
              <input type="file" accept=".json" onChange={handleCJUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
              <Upload className="w-3.5 h-3.5 text-brand-500" />
              <span>Import JSON</span>
            </div>
            
            <button onClick={handleCJDownload} className="inline-flex items-center gap-1.5 h-9 text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg px-3 transition-all cursor-pointer" title="Export your full Career Journey data">
              <Download className="w-3.5 h-3.5 text-emerald-500" />
              <span>Export JSON</span>
            </button>

            <button onClick={handleDownloadTemplate} className="inline-flex items-center gap-1.5 h-9 text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg px-3 transition-all cursor-pointer" title="Download a blank template with no personal data">
              <FileDown className="w-3.5 h-3.5 text-brand-500" />
              <span>Template</span>
            </button>

            <button onClick={handleLoadSample} className="inline-flex items-center gap-1.5 h-9 text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg px-3 transition-all cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5 text-brand-500" /> Reset Sample
            </button>
          </div>
        </header>

        {/* Dashboard workspace contents */}
        <div className="flex-1 overflow-y-auto p-8 relative">
          
          {saveSuccess && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-xs font-bold rounded-lg flex items-center gap-2">
              <Check className="w-4 h-4 text-green-600" /> Saved successfully to the career database!
            </div>
          )}

          {jsonError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-mono rounded-lg">
              {jsonError}
            </div>
          )}

          {/* ----- Tab 1: META IDENTITY ----- */}
          {activeTier === 'meta' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <Card className="p-6">
                <HeaderCell title="Metadata Profile Information" desc="Configure standard document version credentials." />
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label>Profile Owner Name</Label>
                    <Input value={metaObj.owner || ''} onChange={e => updateRootJourney('meta', { ...metaObj, owner: e.target.value })} />
                  </div>
                  <div>
                    <Label>Version</Label>
                    <Input value={metaObj.version || ''} onChange={e => updateRootJourney('meta', { ...metaObj, version: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label>Framework Archetype</Label>
                    <Input value={metaObj.framework || ''} onChange={e => updateRootJourney('meta', { ...metaObj, framework: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label>Brief Description</Label>
                    <Textarea value={metaObj.description || ''} onChange={e => updateRootJourney('meta', { ...metaObj, description: e.target.value })} className="min-h-[60px]" />
                  </div>
                </div>
              </Card>

              {(() => {
                // Every `version_*_changes` key in meta is a changelog entry for one version
                // (e.g. version_3_35_changes) — real data carries dozens of these. Show them
                // all, newest first, instead of a single hardcoded key.
                const changelogKeys = Object.keys(metaObj)
                  .filter((k) => /_changes$/.test(k) && Array.isArray(metaObj[k]))
                  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
                const currentVersionKey = metaObj.version
                  ? `version_${String(metaObj.version).replace(/\./g, '_')}_changes`
                  : null;

                return (
                  <Card className="p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-600">Version Changelog</h3>
                      {currentVersionKey && (
                        <Button variant="outline" size="sm" onClick={() => {
                          const changes = [...(metaObj[currentVersionKey] || [])];
                          changes.push('New change entry.');
                          updateRootJourney('meta', { ...metaObj, [currentVersionKey]: changes });
                        }}><Plus className="w-3.5 h-3.5" /> Add Entry to v{metaObj.version}</Button>
                      )}
                    </div>

                    <div className="space-y-5">
                      {changelogKeys.map((key) => (
                        <div key={key}>
                          <Label className="font-mono text-[10px]">{key}</Label>
                          <div className="space-y-2 mt-1">
                            {(metaObj[key] || []).map((ch: string, idx: number) => (
                              <div key={idx} className="flex gap-2 items-center">
                                <Input value={ch} onChange={e => {
                                  const next = [...metaObj[key]];
                                  next[idx] = e.target.value;
                                  updateRootJourney('meta', { ...metaObj, [key]: next });
                                }} className="text-xs" />
                                <button onClick={() => {
                                  const next = metaObj[key].filter((_: any, i: number) => i !== idx);
                                  updateRootJourney('meta', { ...metaObj, [key]: next });
                                }} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-red-600">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {changelogKeys.length === 0 && (
                        <p className="text-xs text-slate-400 italic">No changelog history yet.</p>
                      )}
                    </div>
                  </Card>
                );
              })()}
            </div>
          )}

          {/* ----- Tab: PERSON & POSITIONING ----- */}
          {activeTier === 'person' && (() => {
            const positioning = person.positioning || {};
            const updatePerson = (updates: any) => updateRootJourney('person', { ...person, ...updates });
            const updatePositioning = (updates: any) => updatePerson({ positioning: { ...positioning, ...updates } });

            return (
              <div className="max-w-3xl mx-auto space-y-6">
                <Card className="p-6">
                  <HeaderCell title="Identity & Contact" desc="Powers the resume header and is read directly by the Matches feature for job-fit scoring." />
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <Label>Full Name</Label>
                      <Input value={person.name || ''} onChange={e => updatePerson({ name: e.target.value })} />
                    </div>
                    <div>
                      <Label>Brand / Tagline</Label>
                      <Input value={person.brand || ''} onChange={e => updatePerson({ brand: e.target.value })} />
                    </div>
                    <div>
                      <Label>Location</Label>
                      <Input value={person.location || ''} onChange={e => updatePerson({ location: e.target.value })} />
                    </div>
                    <div>
                      <Label>Work Preference</Label>
                      <Input value={person.work_preference || ''} onChange={e => updatePerson({ work_preference: e.target.value })} placeholder="e.g. Remote-first, open to relocation" />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input value={person.phone || ''} onChange={e => updatePerson({ phone: e.target.value })} />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input value={person.email || ''} onChange={e => updatePerson({ email: e.target.value })} />
                    </div>
                    <div>
                      <Label>LinkedIn</Label>
                      <Input value={person.linkedin || ''} onChange={e => updatePerson({ linkedin: e.target.value })} />
                    </div>
                    <div>
                      <Label>Website</Label>
                      <Input value={person.website || ''} onChange={e => updatePerson({ website: e.target.value })} />
                    </div>
                    <div>
                      <Label>GitHub</Label>
                      <Input value={person.github || ''} onChange={e => updatePerson({ github: e.target.value })} />
                    </div>
                    <div>
                      <Label>Resume Contact Preference</Label>
                      <Input value={person.resume_contact_preference || ''} onChange={e => updatePerson({ resume_contact_preference: e.target.value })} placeholder="e.g. Email + LinkedIn only" />
                    </div>
                    <div className="col-span-2">
                      <Label>Summary</Label>
                      <Textarea value={person.summary || ''} onChange={e => updatePerson({ summary: e.target.value })} className="min-h-[70px]" />
                    </div>
                  </div>
                </Card>

                <Card className="p-6">
                  <HeaderCell title="Signature Outcomes" desc="Top-line proof points, shown near the resume summary." />
                  <div className="mt-4">
                    <StringListEditor
                      items={person.signature_outcomes || []}
                      onChange={(items) => updatePerson({ signature_outcomes: items })}
                      placeholder="Add a signature outcome"
                    />
                  </div>
                </Card>

                <Card className="p-6">
                  <HeaderCell title="Positioning" desc="Drives Match Preferences on the Matches feature — target role families and orientation directly filter job matches." />
                  <div className="grid grid-cols-1 gap-4 mt-4">
                    <div>
                      <Label>Primary Tagline</Label>
                      <Input value={positioning.primary_tagline || ''} onChange={e => updatePositioning({ primary_tagline: e.target.value })} />
                    </div>
                    <div>
                      <Label>Role Orientation</Label>
                      <Input value={positioning.role_orientation || ''} onChange={e => updatePositioning({ role_orientation: e.target.value })} placeholder="e.g. Open to both senior IC and management roles" />
                    </div>
                    <div>
                      <Label>Target Role Families</Label>
                      <StringListEditor
                        items={positioning.target_role_families || []}
                        onChange={(items) => updatePositioning({ target_role_families: items })}
                        placeholder="Add a target role family"
                      />
                    </div>
                    <div>
                      <Label>Narrative Anchors</Label>
                      <StringListEditor
                        items={positioning.narrative_anchors || []}
                        onChange={(items) => updatePositioning({ narrative_anchors: items })}
                        placeholder="Add a narrative anchor"
                      />
                    </div>
                  </div>
                </Card>
              </div>
            );
          })()}

          {/* ----- Tab 2: ROLES & INITIATIVES ----- */}
          {activeTier === 'roles' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex justify-between items-center bg-slate-100 p-3 rounded-lg border border-slate-200/50">
                <span className="text-xs font-bold text-slate-700">Chronological Employment History Ledger ({roles.length})</span>
                <Button size="sm" onClick={() => {
                  const idNum = roles.length + 1;
                  const newRole = {
                    id: `ROLE-${String(idNum).padStart(3, '0')}`,
                    organization: "New Corporate Entity",
                    company: "New Corporate Entity",
                    title: "Specialist Consultant",
                    start_date: new Date().toISOString().split('-')[0],
                    end_date: "Present",
                    dates: "Present",
                    location: "Remote",
                    description: "Describe core accountability standards.",
                    initiatives: [],
                    deliverables: [],
                    achievements: [],
                    skills: []
                  };
                  updateRootJourney('roles', [...roles, newRole]);
                }}><Plus className="w-3.5 h-3.5 mr-1" /> Append Role Mapping</Button>
              </div>

              <div className="space-y-6">
                {roles.map((r: any, rIdx: number) => (
                  <Card key={r.id || rIdx} className="p-6 border-l-4 border-l-brand-600">
                    <div className="flex justify-between items-start pb-4 border-b border-slate-100 mb-4">
                      <div>
                        <Badge variant="outline" className="text-brand-700 bg-brand-50 border-brand-100">{r.id || `ROLE-${rIdx + 1}`}</Badge>
                        <h4 className="text-lg font-bold text-slate-800 mt-1">{r.title} at <span className="text-brand-600">{r.organization}</span></h4>
                      </div>
                      <button onClick={() => {
                        if (confirm("Delete role and all linked initiatives?")) {
                          const next = roles.filter((_: any, idx: number) => idx !== rIdx);
                          updateRootJourney('roles', next);
                        }
                      }} className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <Label>Title</Label>
                        <Input value={r.title || ''} onChange={e => {
                          const next = [...roles];
                          next[rIdx].title = e.target.value;
                          updateRootJourney('roles', next);
                        }} />
                      </div>
                      <div>
                        <Label>Organization/Company</Label>
                        <Input value={r.organization || r.company || ''} onChange={e => {
                          const next = [...roles];
                          next[rIdx].organization = e.target.value;
                          next[rIdx].company = e.target.value; // Sync for compatibility
                          updateRootJourney('roles', next);
                        }} />
                      </div>
                      <div>
                        <Label>Start Date</Label>
                        <Input value={r.start_date || ''} onChange={e => {
                          const next = [...roles];
                          next[rIdx].start_date = e.target.value;
                          next[rIdx].dates = `${e.target.value} - ${next[rIdx].end_date || 'Present'}`;
                          updateRootJourney('roles', next);
                        }} />
                      </div>
                      <div>
                        <Label>End Date</Label>
                        <Input value={r.end_date || ''} onChange={e => {
                          const next = [...roles];
                          next[rIdx].end_date = e.target.value;
                          next[rIdx].dates = `${next[rIdx].start_date || 'Unknown'} - ${e.target.value}`;
                          updateRootJourney('roles', next);
                        }} />
                      </div>
                    </div>

                    <div className="mb-4">
                      <Label>Location / Setting</Label>
                      <Input value={r.location || ''} onChange={e => {
                        const next = [...roles];
                        next[rIdx].location = e.target.value;
                        updateRootJourney('roles', next);
                      }} />
                    </div>

                    <RoleResumeDetails role={r} onChange={(updates) => {
                      const next = [...roles];
                      next[rIdx] = { ...next[rIdx], ...updates };
                      updateRootJourney('roles', next);
                    }} />

                    <div className="mb-6">
                      <Label>Role Accountabilities Scope</Label>
                      <Textarea value={r.description || ''} onChange={e => {
                        const next = [...roles];
                        next[rIdx].description = e.target.value;
                        updateRootJourney('roles', next);
                      }} className="min-h-[60px]" />
                      
                      <div className="mt-1">
                        <RoleInitiativeEvidenceList
                          roleId={r.id}
                          links={links}
                          achievements={achievements}
                          skillsIndex={skillsIndex}
                          capabilities={capabilities}
                          methodologies={methodologies}
                          functionsList={functionsList}
                          deliverables={deliverables}
                          engagements={engagements}
                          education={education}
                        />
                      </div>
                    </div>

                    {/* Core Initiatives block */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200/60">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-bold text-slate-700 block">Named Projects & initiatives ({r.initiatives?.length || 0})</span>
                        <Button variant="outline" size="sm" onClick={() => {
                          const next = [...roles];
                          if (!Array.isArray(next[rIdx].initiatives)) next[rIdx].initiatives = [];
                          const iNum = next[rIdx].initiatives.length + 1;
                          next[rIdx].initiatives.push({
                            id: `INIT-${String(iNum).padStart(3, '0')}`,
                            name: "New Milestone Initiative",
                            description: "Summarize implementation steps and core scope tags."
                          });
                          updateRootJourney('roles', next);
                        }} className="h-7 text-[10px]"><Plus className="w-3" /> Append Initiative</Button>
                      </div>

                      <div className="space-y-3">
                        {(r.initiatives || []).map((init: any, initIdx: number) => {
                          // Clean bind
                          const syncInitiative = (field: string, val: any) => {
                            const next = [...roles];
                            next[rIdx].initiatives[initIdx] = {
                              ...next[rIdx].initiatives[initIdx],
                              [field]: val
                            };
                            updateRootJourney('roles', next);
                          };

                          return (
                            <div key={init.id || initIdx} className="bg-white p-3 rounded border border-slate-200">
                              <div className="flex justify-between items-start gap-2 mb-2">
                                <span className="bg-slate-100 text-slate-700 text-[10px] font-bold p-1 px-1.5 rounded">{init.id || `INIT-${initIdx+1}`}</span>
                                <Input value={init.name || ''} onChange={e => syncInitiative('name', e.target.value)} className="h-7 text-xs font-semibold flex-1" placeholder="Program/Project Name" />
                                <button onClick={() => {
                                  const next = [...roles];
                                  next[rIdx].initiatives = next[rIdx].initiatives.filter((_: any, i: number) => i !== initIdx);
                                  updateRootJourney('roles', next);
                                }} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-red-500">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <Textarea value={init.description || ''} onChange={e => syncInitiative('description', e.target.value)} className="text-xs min-h-[40px] p-2" placeholder="Initiative accountabilities..." />

                              <InitiativeDeliverablesEditor
                                deliverables={init.deliverables || []}
                                onChange={(deliverables) => syncInitiative('deliverables', deliverables)}
                              />

                              <div className="mt-1">
                                <RoleInitiativeEvidenceList
                                  roleId={r.id}
                                  initiativeId={init.id}
                                  links={links}
                                  achievements={achievements}
                                  skillsIndex={skillsIndex}
                                  capabilities={capabilities}
                                  methodologies={methodologies}
                                  functionsList={functionsList}
                                  deliverables={deliverables}
                                  engagements={engagements}
                                  education={education}
                                />
                              </div>
                            </div>
                          );
                        })}
                        {(r.initiatives || []).length === 0 && (
                          <div className="text-[11px] text-slate-400 italic text-center p-2">No initiatives mapped under this role. Use block above to create one.</div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* ----- Tab 3: DISCRETE ACHIEVEMENTS ----- */}
          {activeTier === 'achievements' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-600 font-mono">Total Verified Case Achievements: {achievements.length}</span>
                <Button size="sm" onClick={() => {
                  const nextId = achievements.length + 1;
                  const newAch = {
                    id: `ACH-${String(nextId).padStart(3, '0')}`,
                    title: "New Quantitative Achievement",
                    description: "Quantified metric outcomes proving scope success parameters.",
                    category: "Growth & Delivery"
                  };
                  updateRootJourney('achievements', [...achievements, newAch]);
                }}><Plus className="w-3.5 h-3.5 mr-1" /> Add Proof Point Achievement</Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {achievements.map((ach: any, idx: number) => {
                  const sync = (field: string, val: any) => {
                    const next = [...achievements];
                    next[idx] = { ...next[idx], [field]: val };
                    updateRootJourney('achievements', next);
                  };

                  return (
                    <Card key={ach.id || idx} className="p-4 bg-white relative">
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-100">{ach.id || `ACH-${idx+1}`}</Badge>
                        <button onClick={() => {
                          const next = achievements.filter((_: any, i: number) => i !== idx);
                          updateRootJourney('achievements', next);
                        }} className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <Label>Achievement Title</Label>
                          <Input value={ach.title || ''} onChange={e => sync('title', e.target.value)} className="h-8 text-xs font-bold" />
                        </div>
                        <div>
                          <Label>Category</Label>
                          <Input value={ach.category || ''} onChange={e => sync('category', e.target.value)} className="h-8 text-xs" />
                        </div>
                        <div>
                          <Label>Quantifiable Narrative Proof</Label>
                          <Textarea value={ach.description || ''} onChange={e => sync('description', e.target.value)} className="text-xs min-h-[50px] p-2" />
                        </div>
                        
                        <TimelineLinkingWidget
                          entityType="achievement"
                          entityId={ach.id}
                          roles={roles}
                          links={links}
                          updateRootJourney={updateRootJourney}
                        />
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* ----- Tab 4: SKILLS INDEX ----- */}
          {activeTier === 'skills' && (
            <div className="max-w-5xl mx-auto space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-600 font-mono">Verified Skills Ledger Portfolio: {skillsIndex.length}</span>
                <Button size="sm" onClick={() => {
                  const num = skillsIndex.length + 1;
                  const newSk = {
                    id: `SK-${String(num).padStart(3, '0')}`,
                    name: "API Management",
                    category: "Languages & Frameworks",
                    proficiency: "Expert",
                    years_experience: 5,
                    last_used: new Date().getFullYear().toString()
                  };
                  updateRootJourney('skills_index', [...skillsIndex, newSk]);
                }}><Plus className="w-3.5 h-3.5 mr-1" /> Add Standard Skill</Button>
              </div>

              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs bg-white">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="p-3 font-semibold text-slate-600">ID</th>
                        <th className="p-3 font-semibold text-slate-600">Skill Name</th>
                        <th className="p-3 font-semibold text-slate-600">Category</th>
                        <th className="p-3 font-semibold text-slate-600">Proficiency Level</th>
                        <th className="p-3 font-semibold text-slate-600">Yrs Exp</th>
                        <th className="p-3 font-semibold text-slate-600">Last Used</th>
                        <th className="p-3 font-semibold text-slate-600">Timeline Linkages & Evidence Mappings</th>
                        <th className="p-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {skillsIndex.map((sk: any, idx: number) => {
                        const sync = (field: string, val: any) => {
                          const next = [...skillsIndex];
                          next[idx] = { ...next[idx], [field]: val };
                          updateRootJourney('skills_index', next);
                        };

                        return (
                          <tr key={sk.id || idx}>
                            <td className="p-3"><Badge variant="outline">{sk.id || `SK-${idx+1}`}</Badge></td>
                            <td className="p-3"><Input value={sk.name || ''} onChange={e => sync('name', e.target.value)} className="h-7 text-xs font-semibold w-36" /></td>
                            <td className="p-3"><Input value={sk.category || ''} onChange={e => sync('category', e.target.value)} className="h-7 text-xs w-36" /></td>
                            <td className="p-3">
                              <select value={sk.proficiency || 'Expert'} onChange={e => sync('proficiency', e.target.value)} className="text-[11px] font-bold border border-slate-200 rounded p-1 w-28 bg-white text-slate-700">
                                {vocabularies.proficiency_levels.map((p: string) => (
                                  <option key={p} value={p}>{p}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-3"><Input type="number" value={sk.years_experience || ''} onChange={e => sync('years_experience', parseInt(e.target.value) || 0)} className="h-7 text-xs w-16" /></td>
                            <td className="p-3"><Input value={sk.last_used || ''} onChange={e => sync('last_used', e.target.value)} className="h-7 text-xs w-20" /></td>
                            <td className="p-3 min-w-[320px]">
                              <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100">
                                <TimelineLinkingWidget
                                  entityType="skill"
                                  entityId={sk.id}
                                  roles={roles}
                                  links={links}
                                  updateRootJourney={updateRootJourney}
                                />
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <button onClick={() => {
                                const next = skillsIndex.filter((_: any, i: number) => i !== idx);
                                updateRootJourney('skills_index', next);
                              }} className="p-1 text-slate-300 hover:text-red-500 rounded">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {skillsIndex.length === 0 && <div className="text-center p-6 italic text-slate-400">No skills matching in core ledger portfolio.</div>}
                </div>
              </Card>
            </div>
          )}

          {/* ----- Tab 5: CAPABILITIES ----- */}
          {activeTier === 'capabilities' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-600 font-mono">Strategic Capabilities Matrix: {capabilities.length}</span>
                <Button size="sm" onClick={() => {
                  const num = capabilities.length + 1;
                  const newCap = {
                    id: `CAP-${String(num).padStart(3, '0')}`,
                    name: "New Capability",
                    description: "",
                    maturity_level: vocabularies.maturity_levels[0] || "Established",
                    functions: []
                  };
                  updateRootJourney('capabilities', [...capabilities, newCap]);
                }}><Plus className="w-3.5 h-3.5 mr-1" /> Define Strategic Capability</Button>
              </div>

              <div className="space-y-4">
                {capabilities.map((cap: any, idx: number) => {
                  const sync = (field: string, val: any) => {
                    const next = [...capabilities];
                    next[idx] = { ...next[idx], [field]: val };
                    updateRootJourney('capabilities', next);
                  };

                  return (
                    <Card key={cap.id || idx} className="p-5">
                      <div className="flex justify-between items-center pb-3 border-b mb-4">
                        <Badge variant="outline" className="bg-brand-50 text-brand-700 border-brand-100">{cap.id || `CAP-${idx+1}`}</Badge>
                        <button onClick={() => {
                          const next = capabilities.filter((_: any, i: number) => i !== idx);
                          updateRootJourney('capabilities', next);
                        }} className="p-1 hover:bg-slate-100 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                        <div className="col-span-2">
                          <Label>Capability Area Name</Label>
                          <Input value={cap.name || ''} onChange={e => sync('name', e.target.value)} className="h-8 text-xs font-bold text-slate-800" />
                        </div>
                        <div>
                          <Label>Maturity Benchmark Level</Label>
                          <select value={cap.maturity_level || 'Established'} onChange={e => sync('maturity_level', e.target.value)} className="text-[11px] font-bold border border-slate-200 rounded p-1.5 w-full bg-white text-slate-700 h-8">
                            {vocabularies.maturity_levels.map((ml: string) => (
                              <option key={ml} value={ml}>{ml}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-4">
                          <Label>Strategic Core Competency Description</Label>
                          <Textarea value={cap.description || ''} onChange={e => sync('description', e.target.value)} className="min-h-[50px] text-xs p-2" />
                        </div>

                        <div className="col-span-4 mt-2">
                          <CapabilityFunctionsEditor
                            functions={cap.functions || []}
                            vocabularies={vocabularies}
                            onChange={(fns) => sync('functions', fns)}
                          />
                        </div>

                        <div className="col-span-4 mt-2">
                          <TimelineLinkingWidget
                            entityType="capability"
                            entityId={cap.id}
                            roles={roles}
                            links={links}
                            updateRootJourney={updateRootJourney}
                          />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* ----- Tab 6: CROSS-REFERENCE MATCHES ----- */}
          {activeTier === 'links' && (
            <div className="max-w-4xl mx-auto space-y-6">
              
              {/* Keywords Linked Indices */}
              <Card className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <HeaderCell title="A. Keyword-to-Entity Relational Mapping Table" desc="Maps job-search terms and JD keywords to the career entity that demonstrates them." />
                  <Button size="sm" variant="outline" onClick={() => {
                    const next = { ...links, keywords: [...(links.keywords || [])] };
                    next.keywords.push({ term: "API Strategy", entity_type: "capability", entity_id: "CAP-001" });
                    updateRootJourney('links', next);
                  }} className="h-7 text-[10px]"><Plus className="w-3 h-3 mr-1" /> Map Keyword Relationship</Button>
                </div>

                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                      <tr>
                        <th className="p-2">Term</th>
                        <th className="p-2">Entity Type</th>
                        <th className="p-2">Entity ID</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(links.keywords || []).map((k: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-2"><Input value={k.term ?? k.keyword ?? ''} onChange={e => {
                            const next = { ...links };
                            next.keywords[idx] = { ...next.keywords[idx], term: e.target.value };
                            updateRootJourney('links', next);
                          }} className="h-7 text-xs w-48 font-semibold text-slate-700" /></td>
                          <td className="p-2">
                            <Input value={k.entity_type || ''} onChange={e => {
                              const next = { ...links };
                              next.keywords[idx].entity_type = e.target.value;
                              updateRootJourney('links', next);
                            }} placeholder="role, initiative, achievement, capability…" className="h-7 text-[11px] w-44 font-medium text-slate-600" />
                          </td>
                          <td className="p-2"><Input value={k.entity_id || ''} onChange={e => {
                            const next = { ...links };
                            next.keywords[idx].entity_id = e.target.value;
                            updateRootJourney('links', next);
                          }} className="h-7 text-xs w-32 font-mono" /></td>
                          <td className="p-2 text-right">
                            <button onClick={() => {
                              const next = { ...links };
                              next.keywords = next.keywords.filter((_: any, i: number) => i !== idx);
                              updateRootJourney('links', next);
                            }} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(links.keywords || []).length === 0 && <p className="text-[11px] text-slate-400 italic p-3 text-center">No keywords referenced mapped.</p>}
                </div>
              </Card>

              {/* Industries Linked Indices */}
              <Card className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <HeaderCell title="B. Vertical Industries-to-Entity Registry" desc="Align market/industry verticals to the role (or other entity) they were demonstrated in." />
                  <Button size="sm" variant="outline" onClick={() => {
                    const next = { ...links, industries: [...(links.industries || [])] };
                    next.industries.push({ industry: "Global Commerce / Retail", entity_type: "role", entity_id: "ROLE-001" });
                    updateRootJourney('links', next);
                  }} className="h-7 text-[10px]"><Plus className="w-3 h-3 mr-1" /> Add Vertical Index</Button>
                </div>

                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                      <tr>
                        <th className="p-2">Market Industry/Vertical</th>
                        <th className="p-2">Entity Type</th>
                        <th className="p-2">Entity ID</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(links.industries || []).map((ind: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-2"><Input value={ind.industry || ''} onChange={e => {
                            const next = { ...links };
                            next.industries[idx].industry = e.target.value;
                            updateRootJourney('links', next);
                          }} className="h-7 text-xs w-56 font-semibold text-slate-700" /></td>
                          <td className="p-2"><Input value={ind.entity_type ?? (ind.role_id ? 'role' : '')} onChange={e => {
                            const next = { ...links };
                            next.industries[idx].entity_type = e.target.value;
                            updateRootJourney('links', next);
                          }} placeholder="role, initiative…" className="h-7 text-[11px] w-32 font-medium text-slate-600" /></td>
                          <td className="p-2"><Input value={ind.entity_id ?? ind.role_id ?? ''} onChange={e => {
                            const next = { ...links };
                            next.industries[idx] = { ...next.industries[idx], entity_id: e.target.value };
                            updateRootJourney('links', next);
                          }} className="h-7 text-xs w-36 font-mono" /></td>
                          <td className="p-2 text-right">
                            <button onClick={() => {
                              const next = { ...links };
                              next.industries = next.industries.filter((_: any, i: number) => i !== idx);
                              updateRootJourney('links', next);
                            }} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(links.industries || []).length === 0 && <p className="text-[11px] text-slate-400 italic p-3 text-center">No industry vertical alignments mapped.</p>}
                </div>
              </Card>

              {/* Deliverable to Achievement */}
              <Card className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <HeaderCell title="C. Deliverables-to-Achievements Evidence Connection" desc="Directly map high-performance assets to the explicit material evidence showing transaction results." />
                  <Button size="sm" variant="outline" onClick={() => {
                    const next = { ...links, deliverable_achievement: [...(links.deliverable_achievement || [])] };
                    next.deliverable_achievement.push({ deliverable_id: "DEL-001", achievement_id: "ACH-001" });
                    updateRootJourney('links', next);
                  }} className="h-7 text-[10px]"><Plus className="w-3 h-3 mr-1" /> Create Evidence Link</Button>
                </div>

                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                      <tr>
                        <th className="p-2">Deliverable ID Anchor</th>
                        <th className="p-2">Resulting Metric Achievement ID</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(links.deliverable_achievement || []).map((da: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-2"><Input value={da.deliverable_id || ''} onChange={e => {
                            const next = { ...links };
                            next.deliverable_achievement[idx].deliverable_id = e.target.value;
                            updateRootJourney('links', next);
                          }} className="h-7 text-xs font-mono text-slate-700" /></td>
                          <td className="p-2"><Input value={da.achievement_id || ''} onChange={e => {
                            const next = { ...links };
                            next.deliverable_achievement[idx].achievement_id = e.target.value;
                            updateRootJourney('links', next);
                          }} className="h-7 text-xs font-mono" /></td>
                          <td className="p-2 text-right">
                            <button onClick={() => {
                              const next = { ...links };
                              next.deliverable_achievement = next.deliverable_achievement.filter((_: any, i: number) => i !== idx);
                              updateRootJourney('links', next);
                            }} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Education Alignment mapping */}
              <Card className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <HeaderCell title="D. Education-to-Capabilities Context Map" desc="Align academic degrees and research fields to active system capabilities." />
                  <Button size="sm" variant="outline" onClick={() => {
                    const next = { ...links, education_alignment: [...(links.education_alignment || [])] };
                    next.education_alignment.push({ education_id: "EDU-001", capability_id: "CAP-001" });
                    updateRootJourney('links', next);
                  }} className="h-7 text-[10px]"><Plus className="w-3 h-3 mr-1" /> Map Degree Connection</Button>
                </div>

                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                      <tr>
                        <th className="p-2">Academic Institution ID</th>
                        <th className="p-2">Qualified Capability ID</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(links.education_alignment || []).map((ea: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-2"><Input value={ea.education_id || ''} onChange={e => {
                            const next = { ...links };
                            next.education_alignment[idx].education_id = e.target.value;
                            updateRootJourney('links', next);
                          }} className="h-7 text-xs font-mono text-slate-700" /></td>
                          <td className="p-2"><Input value={ea.capability_id || ''} onChange={e => {
                            const next = { ...links };
                            next.education_alignment[idx].capability_id = e.target.value;
                            updateRootJourney('links', next);
                          }} className="h-7 text-xs font-mono" /></td>
                          <td className="p-2 text-right">
                            <button onClick={() => {
                              const next = { ...links };
                              next.education_alignment = next.education_alignment.filter((_: any, i: number) => i !== idx);
                              updateRootJourney('links', next);
                            }} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Deliverable to Function */}
              <SimplePairLinkCard
                title="E. Deliverable-to-Function Mapping"
                desc="Connects a role/initiative deliverable to the atomic capability function it demonstrated."
                colALabel="Function ID"
                colBLabel="Deliverable ID"
                keyA="function_id"
                keyB="deliverable_id"
                placeholderA="FUNC-001"
                placeholderB="DEL-100"
                items={links.deliverable_function || []}
                onChange={(items) => updateRootJourney('links', { ...links, deliverable_function: items })}
              />

              {/* Certification Alignment */}
              <SimplePairLinkCard
                title="F. Certification Alignment"
                desc="Connects a certification to the capability it supports. No certifications recorded yet as of this data."
                colALabel="Certification ID"
                colBLabel="Capability ID"
                keyA="certification_id"
                keyB="capability_id"
                placeholderA="CERT-001"
                placeholderB="CAP-001"
                items={links.certification_alignment || []}
                onChange={(items) => updateRootJourney('links', { ...links, certification_alignment: items })}
              />

              {/* Master Chronological Timeline Mappings Registry */}
              <Card className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <HeaderCell title="E. Master Chronological Timeline Mappings Registry" desc="Shows all current professional evidence linked to Roles and Project Initiatives across your timeline." />
                  <Button size="sm" variant="outline" onClick={() => {
                    const next = { ...links, timeline_mappings: [...(links.timeline_mappings || [])] };
                    next.timeline_mappings.push({
                      role_id: roles[0]?.id || "ROLE-001",
                      initiative_id: "",
                      entity_type: "achievement",
                      entity_id: achievements[0]?.id || "ACH-001"
                    });
                    updateRootJourney('links', next);
                  }} className="h-7 text-[10px]"><Plus className="w-3" /> Add Manual Linkage Mapping</Button>
                </div>

                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                      <tr>
                        <th className="p-2">Role ID Reference</th>
                        <th className="p-2">Initiative ID (Optional)</th>
                        <th className="p-2">Evidence Entity Type</th>
                        <th className="p-2">Evidence Entity ID</th>
                        <th className="p-2">Linked Title / Name</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(links.timeline_mappings || []).map((map: any, idx: number) => {
                        let displayName = "N/A";
                        if (map.entity_type === 'achievement') {
                          const item = achievements.find((a: any) => a.id === map.entity_id);
                          displayName = item ? item.title : `Achievement: ${map.entity_id}`;
                        } else if (map.entity_type === 'skill') {
                          const item = skillsIndex.find((s: any) => s.id === map.entity_id);
                          displayName = item ? item.name : `Skill: ${map.entity_id}`;
                        } else if (map.entity_type === 'capability') {
                          const item = capabilities.find((c: any) => c.id === map.entity_id);
                          displayName = item ? item.name : `Capability: ${map.entity_id}`;
                        } else if (map.entity_type === 'methodology') {
                          const item = methodologies.find((x: any) => x.id === map.entity_id);
                          displayName = item ? item.name : `Methodology: ${map.entity_id}`;
                        } else if (map.entity_type === 'function') {
                          const item = functionsList.find((f: any) => f.id === map.entity_id);
                          displayName = item ? item.name : `Function: ${map.entity_id}`;
                        } else if (map.entity_type === 'deliverable') {
                          const item = deliverables.find((d: any) => d.id === map.entity_id);
                          displayName = item ? item.title : `Deliverable: ${map.entity_id}`;
                        } else if (map.entity_type === 'customer_engagement') {
                          const item = engagements.find((e: any) => e.id === map.entity_id);
                          displayName = item ? `${item.client} - ${item.project}` : `Engagement: ${map.entity_id}`;
                        } else if (map.entity_type === 'education') {
                          const item = education.find((e: any) => e.id === map.entity_id);
                          displayName = item ? `${item.institution} - ${item.program}` : `Education: ${map.entity_id}`;
                        }

                        const updateMapping = (key: string, value: string) => {
                          const next = { ...links };
                          next.timeline_mappings[idx] = {
                            ...next.timeline_mappings[idx],
                            [key]: value
                          };
                          updateRootJourney('links', next);
                        };

                        return (
                          <tr key={idx} className="hover:bg-slate-50/40">
                            <td className="p-2">
                              <select value={map.role_id || ''} onChange={e => updateMapping('role_id', e.target.value)} className="text-[10px] p-1 border rounded bg-white font-medium text-slate-600 max-w-[140px]">
                                <option value="">-- Role --</option>
                                {roles.map((r: any) => (
                                  <option key={r.id} value={r.id}>{r.id}: {r.title}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2">
                              <Input value={map.initiative_id || ''} onChange={e => updateMapping('initiative_id', e.target.value)} className="h-7 text-xs w-28 font-mono text-slate-700" placeholder="INIT-001" />
                            </td>
                            <td className="p-2">
                              <select value={map.entity_type || 'achievement'} onChange={e => updateMapping('entity_type', e.target.value)} className="text-[10px] p-1 border rounded bg-white font-medium text-slate-600">
                                <option value="achievement">Achievement</option>
                                <option value="skill">Skill</option>
                                <option value="capability">Capability</option>
                                <option value="methodology">Methodology</option>
                                <option value="function">Atomic Function</option>
                                <option value="deliverable">Deliverable</option>
                                <option value="customer_engagement">Client Engagement</option>
                                <option value="education">Education</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <Input value={map.entity_id || ''} onChange={e => updateMapping('entity_id', e.target.value)} className="h-7 text-xs w-24 font-mono text-slate-700" placeholder="ID" />
                            </td>
                            <td className="p-2 font-medium text-slate-600 max-w-[180px] truncate" title={displayName}>
                              {displayName}
                            </td>
                            <td className="p-2 text-right">
                              <button onClick={() => {
                                const next = { ...links };
                                next.timeline_mappings = next.timeline_mappings.filter((_: any, i: number) => i !== idx);
                                updateRootJourney('links', next);
                              }} className="text-slate-300 hover:text-red-500">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(links.timeline_mappings || []).length === 0 && <p className="text-[11px] text-slate-400 italic p-3 text-center">No timeline linkages generated yet. Go to different entities to associate them, or add mappings here!</p>}
                </div>
              </Card>
            </div>
          )}

          {/* ----- Tab 7: METHODOLOGIES ----- */}
          {activeTier === 'methodologies' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-600 font-mono">Process & Design Methodologies: {methodologies.length}</span>
                <Button size="sm" onClick={() => {
                  const num = methodologies.length + 1;
                  const newMeth = {
                    id: `METH-${String(num).padStart(3, '0')}`,
                    name: "Scaled Agile Framework (SAFe)",
                    description: "Scaling agile delivery metrics over large development clusters.",
                    context: "Directing multi-team cadence release plans."
                  };
                  updateRootJourney('methodologies', [...methodologies, newMeth]);
                }}><Plus className="w-3.5 h-3.5 mr-1" /> Add Business Method</Button>
              </div>

              {methodologies.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 bg-white border border-slate-200 border-dashed rounded-xl space-y-4 shadow-xs">
                  <div className="p-3 bg-brand-50 text-brand-600 rounded-full">
                    <Bookmark className="w-6 h-6" />
                  </div>
                  <div className="text-center space-y-1">
                    <h3 className="text-sm font-bold text-slate-800">No Professional Methodologies Listed</h3>
                    <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                      Add systems, agile delivery frameworks, or software design methodologies (e.g. Domain-Driven Design, Scrum, SAFe) to document your process architecture.
                    </p>
                  </div>
                  <Button size="sm" className="bg-brand-600 font-semibold" onClick={() => {
                    const newMeth = {
                      id: "METH-001",
                      name: "Domain-Driven Design (DDD)",
                      description: "A software architecture design methodology mapping complex systems to strict enterprise operations.",
                      context: "Formulating model parameters for the checkout API routing rails."
                    };
                    updateRootJourney('methodologies', [newMeth]);
                  }}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Your First Methodology
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {methodologies.map((m: any, idx: number) => {
                    if (!m || typeof m !== 'object') return null;
                    const sync = (field: string, val: any) => {
                      const next = [...methodologies];
                      next[idx] = { ...next[idx], [field]: val };
                      updateRootJourney('methodologies', next);
                    };

                    return (
                      <Card key={m.id || idx} className="p-4">
                        <div className="flex justify-between items-center mb-2">
                          <Badge variant="outline" className="bg-brand-50 text-brand-700 border-brand-100">{m.id || `METH-${idx+1}`}</Badge>
                          <button onClick={() => {
                            const next = methodologies.filter((_: any, i: number) => i !== idx);
                            updateRootJourney('methodologies', next);
                          }} className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <Label>Methodology Name</Label>
                            <Input value={m.name || ''} onChange={e => sync('name', e.target.value)} className="h-8 text-xs font-bold" />
                          </div>
                          <div>
                            <Label>Context Applied</Label>
                            <Input value={m.context || ''} onChange={e => sync('context', e.target.value)} className="h-8 text-xs text-slate-600" />
                          </div>
                          <div>
                            <Label>Technical Definition Blueprint</Label>
                            <Textarea value={m.description || ''} onChange={e => sync('description', e.target.value)} className="text-xs min-h-[45px] p-2" />
                          </div>
                          
                          <TimelineLinkingWidget
                            entityType="methodology"
                            entityId={m.id}
                            roles={roles}
                            links={links}
                            updateRootJourney={updateRootJourney}
                          />
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ----- Tab 8: FUNCTIONS ----- */}
          {activeTier === 'functions' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-600 font-mono">Atomic Work Execution Functions: {functionsList.length}</span>
                <Button size="sm" onClick={() => {
                  const num = functionsList.length + 1;
                  const newFn = {
                    id: `FN-${String(num).padStart(3, '0')}`,
                    name: "Schema Design Architecture",
                    description: "Enforcing rigorous relational typing mappings."
                  };
                  updateRootJourney('functions', [...functionsList, newFn]);
                }}><Plus className="w-3.5 h-3.5 mr-1" /> Add Work Function</Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {functionsList.map((f: any, idx: number) => {
                  const sync = (field: string, val: any) => {
                    const next = [...functionsList];
                    next[idx] = { ...next[idx], [field]: val };
                    updateRootJourney('functions', next);
                  };

                  return (
                    <Card key={f.id || idx} className="p-4 bg-white shadow-xxs font-sans">
                      <div className="flex justify-between items-center mb-2">
                        <Badge variant="outline" className="text-slate-600 bg-slate-100">{f.id || `FN-${idx+1}`}</Badge>
                        <button onClick={() => {
                          const next = functionsList.filter((_: any, i: number) => i !== idx);
                          updateRootJourney('functions', next);
                        }} className="p-1 hover:bg-slate-50 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="space-y-2">
                        <Input value={f.name || ''} onChange={e => sync('name', e.target.value)} className="h-7 text-[11px] font-bold" />
                        <Textarea value={f.description || ''} onChange={e => sync('description', e.target.value)} className="text-[10px] min-h-[40px] leading-relaxed p-1.5" />
                        
                        <TimelineLinkingWidget
                          entityType="function"
                          entityId={f.id}
                          roles={roles}
                          links={links}
                          updateRootJourney={updateRootJourney}
                        />
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* ----- Tab 9: DELIVERABLES ----- */}
          {activeTier === 'deliverables' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-600 font-mono">Material Asset Deliverables List: {deliverables.length}</span>
                <Button size="sm" onClick={() => {
                  const num = deliverables.length + 1;
                  const newDel = {
                    id: `DEL-${String(num).padStart(3, '0')}`,
                    title: "Dynamic High Threshold Parser API",
                    description: "JSON gateway schema validating transaction limits live.",
                    type: "API Specification"
                  };
                  updateRootJourney('deliverables', [...deliverables, newDel]);
                }}><Plus className="w-3.5 h-3.5 mr-1" /> Append Deliverable</Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {deliverables.map((d: any, idx: number) => {
                  const sync = (field: string, val: any) => {
                    const next = [...deliverables];
                    next[idx] = { ...next[idx], [field]: val };
                    updateRootJourney('deliverables', next);
                  };

                  return (
                    <Card key={d.id || idx} className="p-4 bg-white relative">
                      <div className="flex justify-between items-center mb-2">
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100">{d.id || `DEL-${idx+1}`}</Badge>
                        <button onClick={() => {
                          const next = deliverables.filter((_: any, i: number) => i !== idx);
                          updateRootJourney('deliverables', next);
                        }} className="p-1 hover:bg-slate-50 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label>Asset Title</Label>
                            <Input value={d.title || ''} onChange={e => sync('title', e.target.value)} className="h-7 text-xs font-bold" />
                          </div>
                          <div>
                            <Label>Artifact Type</Label>
                            <Input value={d.type || ''} onChange={e => sync('type', e.target.value)} className="h-7 text-xs font-semibold" />
                          </div>
                        </div>
                        <div>
                          <Label>Technical Description</Label>
                          <Textarea value={d.description || ''} onChange={e => sync('description', e.target.value)} className="text-xs min-h-[45px] p-2" />
                        </div>
                        
                        <TimelineLinkingWidget
                          entityType="deliverable"
                          entityId={d.id}
                          roles={roles}
                          links={links}
                          updateRootJourney={updateRootJourney}
                        />
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* ----- Tab 10: CUSTOMER ENGAGEMENTS ----- */}
          {activeTier === 'engagements' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-600 font-mono">Lead Delivery Engagements ({engagements.length})</span>
                <Button size="sm" onClick={() => {
                  const num = engagements.length + 1;
                  const newEng = {
                    id: `ENG-${String(num).padStart(3, '0')}`,
                    client: "Default Enterprise Partner",
                    project: "Legacy System Retrofit Program",
                    description: "Orchestrated performance audits deploying standardized core libraries.",
                    dates: "2024-01 to 2024-05",
                    display: true
                  };
                  updateRootJourney('customer_engagements', [...engagements, newEng]);
                }}><Plus className="w-3.5 h-3.5 mr-1" /> Add Engagement</Button>
              </div>

              {engagements.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 bg-white border border-slate-200 border-dashed rounded-xl space-y-4 shadow-xs">
                  <div className="p-3 bg-brand-50 text-brand-600 rounded-full">
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="text-center space-y-1">
                    <h3 className="text-sm font-bold text-slate-800">No Client Engagements Found</h3>
                    <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                      Add corporate consultations, external client deliverables, or critical partner-led integration milestones where you directed project scope.
                    </p>
                  </div>
                  <Button size="sm" className="bg-brand-600 font-semibold" onClick={() => {
                    const newEng = {
                      id: "ENG-001",
                      client: "Samsung Hardware Operations",
                      project: "Low-spec TV personalization pilot",
                      description: "Conducted technical workspace validation deploying localized caching frameworks on smart TVs.",
                      dates: "2021-11 to 2022-02",
                      display: true
                    };
                    updateRootJourney('customer_engagements', [newEng]);
                  }}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Your First Engagement
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {engagements.map((eng: any, idx: number) => {
                    if (!eng || typeof eng !== 'object') return null;
                    const sync = (field: string, val: any) => {
                      const next = [...engagements];
                      next[idx] = { ...next[idx], [field]: val };
                      updateRootJourney('customer_engagements', next);
                    };

                    return (
                      <Card key={eng.id || idx} className="p-4">
                        <div className="flex justify-between items-center pb-2 border-b mb-3">
                          <Badge variant="outline" className="bg-brand-50 text-brand-700 border-brand-100">{eng.id || `ENG-${idx+1}`}</Badge>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 cursor-pointer select-none">
                              <input type="checkbox" checked={eng.display !== false} onChange={e => sync('display', e.target.checked)} className="rounded text-brand-600 border-slate-300 focus:ring-brand-500" />
                              Render Display Active
                            </label>
                            <button onClick={() => {
                              const next = engagements.filter((_: any, i: number) => i !== idx);
                              updateRootJourney('customer_engagements', next);
                            }} className="p-1 hover:bg-slate-100 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <Label>Target Client Partner</Label>
                            <Input value={eng.client || ''} onChange={e => sync('client', e.target.value)} className="h-8 text-xs font-bold text-slate-800" />
                          </div>
                          <div>
                            <Label>Project Scope Title</Label>
                            <Input value={eng.project || ''} onChange={e => sync('project', e.target.value)} className="h-8 text-xs font-semibold" />
                          </div>
                          <div>
                            <Label>Involvement Dates</Label>
                            <Input value={eng.dates || ''} onChange={e => sync('dates', e.target.value)} className="h-8 text-xs" />
                          </div>
                          <div className="col-span-3">
                            <Label>Engagement Description</Label>
                            <Textarea value={eng.description || ''} onChange={e => sync('description', e.target.value)} className="min-h-[50px] text-xs p-2" />
                          </div>
                          
                          <div className="col-span-3 mt-2">
                            <TimelineLinkingWidget
                              entityType="customer_engagement"
                              entityId={eng.id}
                              roles={roles}
                              links={links}
                              updateRootJourney={updateRootJourney}
                            />
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ----- Tab 11: EDUCATION REGISTRY ----- */}
          {activeTier === 'education' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-600 font-mono">Academic Degrees & Achievements: {education.length}</span>
                <Button size="sm" onClick={() => {
                  const num = education.length + 1;
                  const newEdu = {
                    id: `EDU-${String(num).padStart(3, '0')}`,
                    institution: "State University",
                    program: "B.S. in Electrical Engineering",
                    degree_type: "Bachelor's",
                    start: "2014",
                    end: "2018",
                    location: "Austin, TX",
                    description: "Focused on low latency compiler software architecture layouts.",
                    capability_alignment: [],
                    skills_reinforced: [],
                    achievements: [],
                    completion_status: "Completed",
                    resume_display: "",
                  };
                  updateRootJourney('education', [...education, newEdu]);
                }}><Plus className="w-3.5 h-3.5 mr-1" /> Append Education</Button>
              </div>

              <div className="space-y-4">
                {education.map((edu: any, idx: number) => {
                  const sync = (field: string, val: any) => {
                    const next = [...education];
                    next[idx] = { ...next[idx], [field]: val };
                    updateRootJourney('education', next);
                  };

                  return (
                    <Card key={edu.id || idx} className="p-5">
                      <div className="flex justify-between items-center pb-2 border-b mb-3">
                        <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-100">{edu.id || `EDU-${idx+1}`}</Badge>
                        <button onClick={() => {
                          const next = education.filter((_: any, i: number) => i !== idx);
                          updateRootJourney('education', next);
                        }} className="p-1 hover:bg-slate-100 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                        <div>
                          <Label>Academic Institution</Label>
                          <Input value={edu.institution || ''} onChange={e => sync('institution', e.target.value)} className="h-8 text-xs font-bold" />
                        </div>
                        <div>
                          <Label>Program</Label>
                          <Input value={edu.program || ''} onChange={e => sync('program', e.target.value)} className="h-8 text-xs font-medium" />
                        </div>
                        <div>
                          <Label>Degree Type</Label>
                          <Input value={edu.degree_type || ''} onChange={e => sync('degree_type', e.target.value)} className="h-8 text-xs" placeholder="e.g. Bachelor's, Certificate" />
                        </div>
                        <div>
                          <Label>Campus Location</Label>
                          <Input value={edu.location || ''} onChange={e => sync('location', e.target.value)} className="h-8 text-xs" />
                        </div>
                        <div>
                          <Label>Start</Label>
                          <Input value={edu.start || ''} onChange={e => sync('start', e.target.value)} className="h-8 text-xs" />
                        </div>
                        <div>
                          <Label>End</Label>
                          <Input value={edu.end || ''} onChange={e => sync('end', e.target.value)} className="h-8 text-xs" />
                        </div>
                        <div>
                          <Label>Completion Status</Label>
                          <Input value={edu.completion_status || ''} onChange={e => sync('completion_status', e.target.value)} className="h-8 text-xs" />
                        </div>
                        <div>
                          <Label>Resume Display</Label>
                          <Input value={edu.resume_display || ''} onChange={e => sync('resume_display', e.target.value)} className="h-8 text-xs" placeholder="How this should read on a resume" />
                        </div>
                        <div className="col-span-4">
                          <Label>Concentration & Study Projects Details</Label>
                          <Textarea value={edu.description || ''} onChange={e => sync('description', e.target.value)} className="min-h-[48px] text-xs p-2" />
                        </div>
                        <div className="col-span-2">
                          <Label>Capability Alignment (IDs)</Label>
                          <StringListEditor items={edu.capability_alignment || []} onChange={(items) => sync('capability_alignment', items)} placeholder="e.g. CAP-001" />
                        </div>
                        <div className="col-span-2">
                          <Label>Skills Reinforced</Label>
                          <StringListEditor items={edu.skills_reinforced || []} onChange={(items) => sync('skills_reinforced', items)} placeholder="e.g. SK-011" />
                        </div>

                        <div className="col-span-4 mt-2">
                          <TimelineLinkingWidget
                            entityType="education"
                            entityId={edu.id}
                            roles={roles}
                            links={links}
                            updateRootJourney={updateRootJourney}
                          />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* ----- Tab: CERTIFICATIONS ----- */}
          {activeTier === 'certifications' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-600 font-mono">Certifications: {certifications.length}</span>
                <Button size="sm" onClick={() => {
                  const num = certifications.length + 1;
                  const newCert = { id: `CERT-${String(num).padStart(3, '0')}`, name: '', issuer: '', date: '', status: '' };
                  updateRootJourney('certifications', [...certifications, newCert]);
                }}><Plus className="w-3.5 h-3.5 mr-1" /> Add Certification</Button>
              </div>

              {certifications.length === 0 ? (
                <p className="text-xs text-slate-400 italic p-3 text-center">None yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {certifications.map((cert: any, idx: number) => {
                    const sync = (field: string, val: any) => {
                      const next = [...certifications];
                      next[idx] = { ...next[idx], [field]: val };
                      updateRootJourney('certifications', next);
                    };
                    return (
                      <Card key={cert.id || idx} className="p-4">
                        <div className="flex justify-between items-center mb-2">
                          <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-100">{cert.id || `CERT-${idx+1}`}</Badge>
                          <button onClick={() => updateRootJourney('certifications', certifications.filter((_: any, i: number) => i !== idx))} className="p-1 hover:bg-slate-100 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                        <div className="space-y-2">
                          <EditableCell label="Name" value={cert.name || ''} onChange={v => sync('name', v)} />
                          <EditableCell label="Issuer" value={cert.issuer || ''} onChange={v => sync('issuer', v)} />
                          <EditableCell label="Date" value={cert.date || ''} onChange={v => sync('date', v)} />
                          <EditableCell label="Status" value={cert.status || ''} onChange={v => sync('status', v)} />
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ----- Tab: APPLICATION ARTIFACTS ----- */}
          {activeTier === 'artifacts' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <Card className="p-4">
                <Label>Description</Label>
                <Textarea
                  value={applicationArtifacts.description || ''}
                  onChange={e => updateRootJourney('application_artifacts', { ...applicationArtifacts, description: e.target.value })}
                  className="min-h-[50px] text-xs p-2"
                />
              </Card>

              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-600 font-mono">Artifacts: {applicationArtifacts.artifacts.length}</span>
                <Button size="sm" onClick={() => {
                  const num = applicationArtifacts.artifacts.length + 1;
                  const newArtifact = { id: `ART-${String(num).padStart(3, '0')}`, name: '', type: '', audience: '', positioning: '', notes: '' };
                  updateRootJourney('application_artifacts', { ...applicationArtifacts, artifacts: [...applicationArtifacts.artifacts, newArtifact] });
                }}><Plus className="w-3.5 h-3.5 mr-1" /> Add Artifact</Button>
              </div>

              <div className="space-y-4">
                {applicationArtifacts.artifacts.map((art: any, idx: number) => {
                  const sync = (field: string, val: any) => {
                    const next = [...applicationArtifacts.artifacts];
                    next[idx] = { ...next[idx], [field]: val };
                    updateRootJourney('application_artifacts', { ...applicationArtifacts, artifacts: next });
                  };
                  return (
                    <Card key={art.id || idx} className="p-4">
                      <div className="flex justify-between items-center mb-2">
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100">{art.id || `ART-${idx+1}`}</Badge>
                        <button onClick={() => {
                          const next = applicationArtifacts.artifacts.filter((_: any, i: number) => i !== idx);
                          updateRootJourney('application_artifacts', { ...applicationArtifacts, artifacts: next });
                        }} className="p-1 hover:bg-slate-100 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <EditableCell label="File Name" value={art.name || ''} onChange={v => sync('name', v)} />
                        <EditableCell label="Type" value={art.type || ''} onChange={v => sync('type', v)} />
                        <EditableCell label="Audience" value={art.audience || ''} onChange={v => sync('audience', v)} />
                        <EditableCell label="Positioning" value={art.positioning || ''} onChange={v => sync('positioning', v)} />
                        <div className="col-span-2">
                          <Label>Notes</Label>
                          <Textarea value={art.notes || ''} onChange={e => sync('notes', e.target.value)} className="min-h-[40px] text-xs p-2" />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* ----- Tab: INTERVIEW ANSWERS ----- */}
          {activeTier === 'interview' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <Card className="p-4">
                <Label>Description</Label>
                <Textarea
                  value={interviewAnswers.description || ''}
                  onChange={e => updateRootJourney('interview_answers', { ...interviewAnswers, description: e.target.value })}
                  className="min-h-[50px] text-xs p-2"
                />
              </Card>

              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-600 font-mono">Answers: {interviewAnswers.answers.length}</span>
                <Button size="sm" onClick={() => {
                  const newAnswer = { question: '', version_general: '' };
                  updateRootJourney('interview_answers', { ...interviewAnswers, answers: [...interviewAnswers.answers, newAnswer] });
                }}><Plus className="w-3.5 h-3.5 mr-1" /> Add Question</Button>
              </div>

              <div className="space-y-4">
                {interviewAnswers.answers.map((ans: any, idx: number) => {
                  // Answers carry `question` plus one or more dynamic `version_for_<audience>`
                  // keys — shown as free-form key/value pairs since the audience set varies.
                  const versionKeys = Object.keys(ans).filter(k => k !== 'question');
                  const syncQuestion = (v: string) => {
                    const next = [...interviewAnswers.answers];
                    next[idx] = { ...next[idx], question: v };
                    updateRootJourney('interview_answers', { ...interviewAnswers, answers: next });
                  };
                  const syncVersion = (key: string, v: string) => {
                    const next = [...interviewAnswers.answers];
                    next[idx] = { ...next[idx], [key]: v };
                    updateRootJourney('interview_answers', { ...interviewAnswers, answers: next });
                  };
                  const renameVersionKey = (oldKey: string, newKey: string) => {
                    const next = [...interviewAnswers.answers];
                    const entry = { ...next[idx] };
                    const val = entry[oldKey];
                    delete entry[oldKey];
                    entry[newKey || oldKey] = val;
                    next[idx] = entry;
                    updateRootJourney('interview_answers', { ...interviewAnswers, answers: next });
                  };
                  const addVersion = () => syncVersion('version_new', '');
                  const removeVersion = (key: string) => {
                    const next = [...interviewAnswers.answers];
                    const entry = { ...next[idx] };
                    delete entry[key];
                    next[idx] = entry;
                    updateRootJourney('interview_answers', { ...interviewAnswers, answers: next });
                  };
                  return (
                    <Card key={idx} className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 mr-2">
                          <Label>Question</Label>
                          <Input value={ans.question || ''} onChange={e => syncQuestion(e.target.value)} className="h-8 text-xs font-bold" />
                        </div>
                        <button onClick={() => {
                          const next = interviewAnswers.answers.filter((_: any, i: number) => i !== idx);
                          updateRootJourney('interview_answers', { ...interviewAnswers, answers: next });
                        }} className="mt-5 p-1 hover:bg-slate-100 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="space-y-3">
                        {versionKeys.map((key) => (
                          <div key={key} className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/50">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Input
                                defaultValue={key}
                                onBlur={e => renameVersionKey(key, e.target.value)}
                                className="h-6 text-[10px] font-mono w-48"
                              />
                              <button onClick={() => removeVersion(key)} className="p-0.5 text-slate-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                            </div>
                            <Textarea value={ans[key] || ''} onChange={e => syncVersion(key, e.target.value)} className="text-xs min-h-[50px] p-2" />
                          </div>
                        ))}
                        <Button type="button" size="sm" variant="outline" className="bg-white h-7 text-[10px]" onClick={addVersion}>
                          <Plus className="w-3 h-3 mr-1" /> Add Answer Version
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* ----- Tab 12: VOCABULARIES ----- */}
          {activeTier === 'vocabularies' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <Card className="p-6">
                <HeaderCell title="Controlled Vocabulary Framework Constants" desc="Maintains perfect internal semantic alignment consistency. These vocabulary keywords represent dropdown option models across the system." />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  {Object.keys(vocabularies).map((vocKey) => {
                    const termsList = Array.isArray(vocabularies[vocKey]) ? vocabularies[vocKey] : [];
                    return (
                      <div key={vocKey} className="bg-slate-50 p-4 rounded-lg border border-slate-200/60">
                        <Label className="text-brand-600 font-extrabold capitalize text-xs block mb-3 border-b pb-1.5">{vocKey.replace(/_/g, ' ')}</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {termsList.map((term: string, termIdx: number) => (
                            <Badge key={termIdx} variant="outline" className="bg-white border-slate-200/80 hover:bg-slate-50 lowercase text-[10px] font-mono py-0.5 px-2">
                              {term}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          {/* ----- Tab: RAW ONTOLOGY JSON CODE COCKPIT ----- */}
          {activeTier === 'raw' && (
            <div className="max-w-4.5xl mx-auto h-full flex flex-col space-y-4">
              
              <div className="flex justify-between items-center bg-slate-100 p-4 rounded-xl border border-slate-200/50">
                <div className="flex gap-4 items-center">
                  <div className="text-[11px] uppercase tracking-widest font-black text-slate-500">Career Journey Workspace:</div>
                  <Badge variant="success">Loaded v{metaObj.version || "1.0"}</Badge>
                </div>

                <div className="flex gap-2">
                  <button onClick={handleCJDownload} className="inline-flex items-center gap-1.5 h-9 text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg px-3 transition-all cursor-pointer">
                    <Download className="w-3.5 h-3.5 text-emerald-500" /> Export JSON Backup
                  </button>
                  <div className="relative inline-block overflow-hidden h-9 bg-white border hover:bg-slate-50 rounded-lg text-xs font-bold transition-all px-3 flex items-center gap-1.5 cursor-pointer text-slate-600">
                    <input type="file" accept=".json" onChange={handleCJUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    <span>Import JSON File</span>
                  </div>
                  <Button onClick={handleSaveRaw} className="bg-brand-600 text-white hover:bg-brand-700 font-semibold h-9 py-0">
                    <Save className="w-4 h-4 mr-1.5" /> Save Raw Edits
                  </Button>
                </div>
              </div>

              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                className="flex-1 w-full bg-slate-900 text-emerald-400 font-mono text-xs p-6 rounded-xl border border-slate-800 outline-none focus:ring-2 focus:ring-brand-500/40 opacity-95"
                style={{ minHeight: '480px', tabSize: 2 }}
                spellCheck={false}
              />
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

// Small subcomponents to guard text length
const HeaderCell = ({ title, desc }: { title: string; desc: string }) => (
  <div className="pb-3 border-b border-slate-100">
    <h3 className="text-sm font-black text-slate-800 tracking-tight">{title}</h3>
    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{desc}</p>
  </div>
);

// Compact labeled text input — used in cards with several short fields.
const EditableCell = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div>
    <Label>{label}</Label>
    <Input value={value} onChange={e => onChange(e.target.value)} className="h-8 text-xs" />
  </div>
);

// Resume-facing fields plus the three free-form structured note fields
// (team_leadership / advisory_ps_scope / organization_scale) real role data carries.
// Shown collapsed by default since most roles don't need every field.
const RoleResumeDetails = ({ role, onChange }: { role: any; onChange: (updates: any) => void }) => {
  const [open, setOpen] = React.useState(false);
  const teamLeadership = typeof role.team_leadership === 'object' && role.team_leadership ? role.team_leadership : {};
  const advisoryScope = typeof role.advisory_ps_scope === 'object' && role.advisory_ps_scope ? role.advisory_ps_scope : {};
  const orgScale = typeof role.organization_scale === 'object' && role.organization_scale ? role.organization_scale : {};

  return (
    <div className="mb-4 border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 text-xs font-bold text-slate-600 hover:bg-slate-100"
      >
        <span className="flex items-center gap-1.5">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} Resume & Positioning Details</span>
      </button>
      {open && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <EditableCell label="Company Descriptor" value={role.company_descriptor || ''} onChange={v => onChange({ company_descriptor: v })} />
            <EditableCell label="Resume Company Descriptor" value={role.resume_company_descriptor || ''} onChange={v => onChange({ resume_company_descriptor: v })} />
            <EditableCell label="Resume Company URL" value={role.resume_company_url || ''} onChange={v => onChange({ resume_company_url: v })} />
          </div>
          <div>
            <Label>Positioning Note</Label>
            <Textarea value={role.positioning_note || ''} onChange={e => onChange({ positioning_note: e.target.value })} className="text-xs min-h-[50px] p-2" />
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div>
              <Label className="text-[10px]">Team Leadership</Label>
              <div className="space-y-1.5">
                <Input value={teamLeadership.team_name || ''} onChange={e => onChange({ team_leadership: { ...teamLeadership, team_name: e.target.value } })} placeholder="Team name" className="h-7 text-[11px]" />
                <div className="flex gap-1.5">
                  <Input value={teamLeadership.starting_size ?? ''} onChange={e => onChange({ team_leadership: { ...teamLeadership, starting_size: e.target.value } })} placeholder="Start size" className="h-7 text-[11px]" />
                  <Input value={teamLeadership.peak_size ?? ''} onChange={e => onChange({ team_leadership: { ...teamLeadership, peak_size: e.target.value } })} placeholder="Peak size" className="h-7 text-[11px]" />
                </div>
                <Textarea value={teamLeadership.growth_narrative || ''} onChange={e => onChange({ team_leadership: { ...teamLeadership, growth_narrative: e.target.value } })} placeholder="Growth narrative" className="text-[11px] min-h-[40px] p-1.5" />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Advisory / PS Scope</Label>
              <div className="space-y-1.5">
                <Input value={advisoryScope.title_external || ''} onChange={e => onChange({ advisory_ps_scope: { ...advisoryScope, title_external: e.target.value } })} placeholder="External title" className="h-7 text-[11px]" />
                <Textarea value={advisoryScope.clarification || ''} onChange={e => onChange({ advisory_ps_scope: { ...advisoryScope, clarification: e.target.value } })} placeholder="Clarification" className="text-[11px] min-h-[40px] p-1.5" />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Organization Scale</Label>
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  <Input value={orgScale.approx_total_people ?? ''} onChange={e => onChange({ organization_scale: { ...orgScale, approx_total_people: e.target.value } })} placeholder="Total people" className="h-7 text-[11px]" />
                  <Input value={orgScale.approx_fte ?? ''} onChange={e => onChange({ organization_scale: { ...orgScale, approx_fte: e.target.value } })} placeholder="FTEs" className="h-7 text-[11px]" />
                </div>
                <Textarea value={orgScale.context || ''} onChange={e => onChange({ organization_scale: { ...orgScale, context: e.target.value } })} placeholder="Context" className="text-[11px] min-h-[40px] p-1.5" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Deliverables nested under a single initiative — real schema shape (impact,
// capability_alignment, skill_ids), replacing the plain-text deliverable list.
const InitiativeDeliverablesEditor = ({ deliverables, onChange }: { deliverables: any[]; onChange: (deliverables: any[]) => void }) => {
  const sync = (idx: number, field: string, val: any) => {
    const next = [...deliverables];
    next[idx] = { ...next[idx], [field]: val };
    onChange(next);
  };
  const addDeliverable = () => {
    onChange([...deliverables, { id: `DEL-${Date.now().toString(36)}`, description: '', impact: '', capability_alignment: [], skill_ids: [] }]);
  };
  const removeDeliverable = (idx: number) => onChange(deliverables.filter((_, i) => i !== idx));

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Deliverables ({deliverables.length})</span>
        <Button type="button" size="sm" variant="outline" className="h-6 text-[10px] bg-white" onClick={addDeliverable}>
          <Plus className="w-3 h-3" /> Add Deliverable
        </Button>
      </div>
      {deliverables.map((d, idx) => (
        <div key={d.id || idx} className="bg-slate-50 border border-slate-200 rounded p-2 space-y-1.5">
          <div className="flex items-start gap-2">
            <span className="text-[9px] font-mono text-slate-400 mt-1.5 shrink-0">{d.id}</span>
            <Textarea value={d.description || ''} onChange={e => sync(idx, 'description', e.target.value)} placeholder="Description" className="text-[11px] min-h-[32px] p-1.5 flex-1" />
            <button onClick={() => removeDeliverable(idx)} className="p-1 text-slate-300 hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          <Textarea value={d.impact || ''} onChange={e => sync(idx, 'impact', e.target.value)} placeholder="Impact" className="text-[11px] min-h-[32px] p-1.5" />
          <div className="grid grid-cols-2 gap-1.5">
            <Input
              value={Array.isArray(d.capability_alignment) ? d.capability_alignment.join(', ') : ''}
              onChange={e => sync(idx, 'capability_alignment', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
              placeholder="Capability IDs (CAP-001, ...)"
              className="h-6 text-[10px] font-mono"
            />
            <Input
              value={Array.isArray(d.skill_ids) ? d.skill_ids.join(', ') : ''}
              onChange={e => sync(idx, 'skill_ids', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
              placeholder="Skill IDs (SK-001, ...)"
              className="h-6 text-[10px] font-mono"
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// A capability's functions are nested objects, each with their own nested skills[] —
// the real schema, not the flat function-id-string list this editor used to show.
// Legacy string-id entries (from older/scaffold data) are still accepted and shown as
// a simple chip with a one-click upgrade to a full entry, rather than silently coerced.
const CapabilityFunctionsEditor = ({
  functions,
  vocabularies,
  onChange,
}: {
  functions: any[];
  vocabularies: any;
  onChange: (functions: any[]) => void;
}) => {
  const sync = (idx: number, updates: any) => {
    const next = [...functions];
    next[idx] = { ...(typeof next[idx] === 'object' ? next[idx] : {}), ...updates };
    onChange(next);
  };
  const addFunction = () => {
    onChange([...functions, { id: `FUNC-${Date.now().toString(36)}`, name: '', description: '', competency_level: '', value_stream_stage: '', skills: [] }]);
  };
  const removeFunction = (idx: number) => onChange(functions.filter((_, i) => i !== idx));
  const upgradeLegacy = (idx: number, legacyId: string) => sync(idx, { id: legacyId, name: '', skills: [] });

  const syncSkill = (fnIdx: number, skillIdx: number, updates: any) => {
    const fn = functions[fnIdx];
    const skills = Array.isArray(fn.skills) ? [...fn.skills] : [];
    skills[skillIdx] = { ...skills[skillIdx], ...updates };
    sync(fnIdx, { skills });
  };
  const addSkill = (fnIdx: number) => {
    const fn = functions[fnIdx];
    const skills = Array.isArray(fn.skills) ? [...fn.skills] : [];
    skills.push({ id: `SK-${Date.now().toString(36)}`, name: '', description: '', proficiency: '', last_used: '' });
    sync(fnIdx, { skills });
  };
  const removeSkill = (fnIdx: number, skillIdx: number) => {
    const fn = functions[fnIdx];
    sync(fnIdx, { skills: (fn.skills || []).filter((_: any, i: number) => i !== skillIdx) });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="mb-0">Functions ({functions.length})</Label>
        <Button type="button" size="sm" variant="outline" className="h-6 text-[10px] bg-white" onClick={addFunction}>
          <Plus className="w-3 h-3" /> Add Function
        </Button>
      </div>
      {functions.map((fn, idx) => {
        if (typeof fn === 'string') {
          return (
            <div key={idx} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded p-2">
              <Badge variant="outline" className="font-mono text-[10px]">{fn}</Badge>
              <span className="text-[10px] text-slate-400 flex-1">Legacy id-only entry</span>
              <button onClick={() => upgradeLegacy(idx, fn)} className="text-[10px] font-semibold text-brand-600 hover:text-brand-800">Upgrade to full entry</button>
              <button onClick={() => removeFunction(idx)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          );
        }
        return (
          <div key={fn.id || idx} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-slate-400 shrink-0">{fn.id}</span>
              <Input value={fn.name || ''} onChange={e => sync(idx, { name: e.target.value })} placeholder="Function name" className="h-7 text-xs font-semibold flex-1" />
              <button onClick={() => removeFunction(idx)} className="p-1 text-slate-300 hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <Textarea value={fn.description || ''} onChange={e => sync(idx, { description: e.target.value })} placeholder="Description" className="text-[11px] min-h-[32px] p-1.5" />
            <div className="grid grid-cols-2 gap-1.5">
              <select value={fn.competency_level || ''} onChange={e => sync(idx, { competency_level: e.target.value })} className="text-[10px] border border-slate-200 rounded p-1 bg-white text-slate-700 h-7">
                <option value="">Competency level…</option>
                {(vocabularies.competency_levels || []).map((c: string) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={fn.value_stream_stage || ''} onChange={e => sync(idx, { value_stream_stage: e.target.value })} className="text-[10px] border border-slate-200 rounded p-1 bg-white text-slate-700 h-7">
                <option value="">Value stream stage…</option>
                {(vocabularies.value_stream_stages || []).map((v: string) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div className="pt-1.5 border-t border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Skills ({(fn.skills || []).length})</span>
                <button onClick={() => addSkill(idx)} className="text-[10px] font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-0.5"><Plus className="w-3 h-3" /> Add Skill</button>
              </div>
              {(fn.skills || []).map((sk: any, skIdx: number) => (
                <div key={sk.id || skIdx} className="bg-white border border-slate-200 rounded p-2 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono text-slate-400 shrink-0">{sk.id}</span>
                    <Input value={sk.name || ''} onChange={e => syncSkill(idx, skIdx, { name: e.target.value })} placeholder="Skill name" className="h-6 text-[11px] flex-1" />
                    <Input value={sk.proficiency || ''} onChange={e => syncSkill(idx, skIdx, { proficiency: e.target.value })} placeholder="Proficiency" className="h-6 text-[11px] w-24" />
                    <Input value={sk.last_used || ''} onChange={e => syncSkill(idx, skIdx, { last_used: e.target.value })} placeholder="Last used" className="h-6 text-[11px] w-20" />
                    <button onClick={() => removeSkill(idx, skIdx)} className="p-0.5 text-slate-300 hover:text-red-500 shrink-0"><Trash2 className="w-3 h-3" /></button>
                  </div>
                  <Textarea value={sk.description || ''} onChange={e => syncSkill(idx, skIdx, { description: e.target.value })} placeholder="Description" className="text-[10px] min-h-[26px] p-1" />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {functions.length === 0 && <p className="text-[11px] text-slate-400 italic">No functions mapped to this capability yet.</p>}
    </div>
  );
};

// Generic two-column id-to-id link table — used for links.deliverable_function and
// links.certification_alignment, which are both simple {keyA, keyB} pair lists.
const SimplePairLinkCard = ({
  title, desc, colALabel, colBLabel, keyA, keyB, placeholderA, placeholderB, items, onChange,
}: {
  title: string; desc: string; colALabel: string; colBLabel: string;
  keyA: string; keyB: string; placeholderA: string; placeholderB: string;
  items: any[]; onChange: (items: any[]) => void;
}) => (
  <Card className="p-6">
    <div className="flex justify-between items-center mb-4">
      <HeaderCell title={title} desc={desc} />
      <Button size="sm" variant="outline" onClick={() => onChange([...(items || []), { [keyA]: '', [keyB]: '' }])} className="h-7 text-[10px]">
        <Plus className="w-3 h-3 mr-1" /> Add Link
      </Button>
    </div>
    <div className="overflow-x-auto text-xs">
      <table className="w-full text-left">
        <thead className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
          <tr>
            <th className="p-2">{colALabel}</th>
            <th className="p-2">{colBLabel}</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {(items || []).map((item, idx) => (
            <tr key={idx}>
              <td className="p-2">
                <Input value={item[keyA] || ''} placeholder={placeholderA} onChange={e => {
                  const next = [...items];
                  next[idx] = { ...next[idx], [keyA]: e.target.value };
                  onChange(next);
                }} className="h-7 text-xs font-mono text-slate-700" />
              </td>
              <td className="p-2">
                <Input value={item[keyB] || ''} placeholder={placeholderB} onChange={e => {
                  const next = [...items];
                  next[idx] = { ...next[idx], [keyB]: e.target.value };
                  onChange(next);
                }} className="h-7 text-xs font-mono" />
              </td>
              <td className="p-2 text-right">
                <button onClick={() => onChange(items.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(!items || items.length === 0) && <p className="text-[11px] text-slate-400 italic p-3 text-center">Nothing mapped yet.</p>}
    </div>
  </Card>
);

// Generic editable list of plain strings — used for signature_outcomes,
// target_role_families, narrative_anchors, and similar string[] fields.
const StringListEditor = ({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) => {
  const [draft, setDraft] = React.useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...(items || []), v]);
    setDraft('');
  };
  return (
    <div className="space-y-2">
      {(items || []).map((item, idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <Input
            value={item}
            onChange={e => {
              const next = [...items];
              next[idx] = e.target.value;
              onChange(next);
            }}
            className="text-xs"
          />
          <button
            onClick={() => onChange(items.filter((_, i) => i !== idx))}
            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-red-600 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder || 'Add an item'}
          className="text-xs"
        />
        <Button type="button" size="sm" variant="outline" className="bg-white shrink-0" onClick={add}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      {(!items || items.length === 0) && <p className="text-xs text-slate-400 italic">Nothing added yet.</p>}
    </div>
  );
};

// Interactive timeline association manager to map roles and initiatives as proofs
interface TimelineLinkingWidgetProps {
  entityType: string;
  entityId: string;
  roles: any[];
  links: any;
  updateRootJourney: (key: string, val: any) => void;
}

const TimelineLinkingWidget = ({
  entityType,
  entityId,
  roles = [],
  links = {},
  updateRootJourney,
}: TimelineLinkingWidgetProps) => {
  const [selectedRoleId, setSelectedRoleId] = React.useState('');
  const [selectedInitId, setSelectedInitId] = React.useState('');
  const toast = useToast();

  const currentMappings = React.useMemo(() => {
    const list = Array.isArray(links.timeline_mappings) ? links.timeline_mappings : [];
    return list.filter((m: any) => m.entity_type === entityType && m.entity_id === entityId);
  }, [links.timeline_mappings, entityType, entityId]);

  const selectedRole = React.useMemo(() => {
    return (roles || []).find((r: any) => r.id === selectedRoleId);
  }, [roles, selectedRoleId]);

  const initiativesForSelectedRole = React.useMemo(() => {
    return selectedRole?.initiatives || [];
  }, [selectedRole]);

  const handleLink = () => {
    if (!selectedRoleId) return;
    const allMappings = Array.isArray(links.timeline_mappings) ? links.timeline_mappings : [];
    
    // Prevent duplicate mappings
    const exists = allMappings.some(
      (m: any) => m.entity_type === entityType && 
                  m.entity_id === entityId && 
                  m.role_id === selectedRoleId && 
                  m.initiative_id === (selectedInitId || undefined)
    );

    if (exists) {
      toast.error("This timeline linkage already exists.");
      return;
    }

    const nextMapId = `MAP-${String(allMappings.length + 1).padStart(3, '0')}-${Math.random().toString(36).substr(2, 3)}`;
    const newMapping = {
      id: nextMapId,
      entity_type: entityType,
      entity_id: entityId,
      role_id: selectedRoleId,
      initiative_id: selectedInitId || undefined,
      context: `Demonstrated in ${selectedRole?.organization || 'Organization'}`
    };

    const nextLinks = {
      ...links,
      timeline_mappings: [...allMappings, newMapping]
    };

    updateRootJourney('links', nextLinks);
    setSelectedRoleId('');
    setSelectedInitId('');
  };

  const handleUnlink = (mapId: string) => {
    const allMappings = Array.isArray(links.timeline_mappings) ? links.timeline_mappings : [];
    const nextLinks = {
      ...links,
      timeline_mappings: allMappings.filter((m: any) => m.id !== mapId)
    };
    updateRootJourney('links', nextLinks);
  };

  return (
    <div className="mt-4 pt-3 border-t border-slate-100 text-slate-800">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
          <Link2 className="w-3 h-3 text-brand-500 animate-pulse" /> Timeline Linkage Proofs ({currentMappings.length})
        </span>
      </div>

      {currentMappings.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {currentMappings.map((m: any) => {
            const role = (roles || []).find((r: any) => r.id === m.role_id);
            const init = (role?.initiatives || []).find((i: any) => i.id === m.initiative_id);
            return (
              <Badge key={m.id} variant="secondary" className="bg-slate-50 text-slate-705 hover:bg-slate-100 flex items-center gap-1 py-1 px-1.5 rounded text-[9px] font-semibold border border-slate-200">
                <Briefcase className="w-2.5 h-2.5 text-brand-500 shrink-0" />
                <span className="font-bold">{role?.organization || role?.company || 'Unknown'}</span>
                {init && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500 italic max-w-[120px] truncate">{init.name}</span>
                  </>
                )}
                <button 
                  onClick={() => handleUnlink(m.id)} 
                  className="ml-1 text-slate-400 hover:text-red-500 rounded-full hover:bg-slate-200 p-0.5 font-bold"
                  title="Remove timeline link"
                >
                  &times;
                </button>
              </Badge>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-slate-400 italic mb-2">Unlinked. Not yet mapped to any role or milestone timeline.</p>
      )}

      {/* Linking Selector Form Controls */}
      <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-150">
        <div className="flex-1">
          <select 
            value={selectedRoleId} 
            onChange={e => {
              setSelectedRoleId(e.target.value);
              setSelectedInitId('');
            }}
            className="w-full text-[10px] p-1 h-7 border rounded bg-white font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">-- Associate Role --</option>
            {(roles || []).map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.organization || r.company} ({r.title})
              </option>
            ))}
          </select>
        </div>

        {selectedRoleId && initiativesForSelectedRole.length > 0 && (
          <div className="flex-1">
            <select 
              value={selectedInitId} 
              onChange={e => setSelectedInitId(e.target.value)}
              className="w-full text-[10px] p-1 h-7 border rounded bg-white font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">-- Initiative Context (Optional) --</option>
              {initiativesForSelectedRole.map((init: any) => (
                <option key={init.id} value={init.id}>
                  {init.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <Button 
          size="sm" 
          disabled={!selectedRoleId}
          onClick={handleLink}
          className="h-7 px-2.5 bg-brand-600 hover:bg-brand-700 text-white text-[10px] font-bold shrink-0 flex items-center gap-1"
        >
          <Link2 className="w-2.5 h-2.5" /> Map Link
        </Button>
      </div>
    </div>
  );
};

interface RoleInitiativeEvidenceListProps {
  roleId: string;
  initiativeId?: string;
  links: any;
  achievements: any[];
  skillsIndex: any[];
  capabilities: any[];
  methodologies: any[];
  functionsList: any[];
  deliverables: any[];
  engagements: any[];
  education: any[];
}

const RoleInitiativeEvidenceList = ({
  roleId,
  initiativeId,
  links = {},
  achievements = [],
  skillsIndex = [],
  capabilities = [],
  methodologies = [],
  functionsList = [],
  deliverables = [],
  engagements = [],
  education = [],
}: RoleInitiativeEvidenceListProps) => {
  const currentMappings = React.useMemo(() => {
    const list = Array.isArray(links.timeline_mappings) ? links.timeline_mappings : [];
    return list.filter((m: any) => {
      const roleMatches = m.role_id === roleId;
      const initMatches = initiativeId ? m.initiative_id === initiativeId : !m.initiative_id;
      return roleMatches && initMatches;
    });
  }, [links.timeline_mappings, roleId, initiativeId]);

  if (currentMappings.length === 0) return null;

  return (
    <div className="mt-3 pt-2.5 border-t border-slate-200 text-slate-800">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 font-mono">
        Mapped Verification Evidence ({currentMappings.length}):
      </span>
      <div className="flex flex-wrap gap-1.5">
        {currentMappings.map((m: any) => {
          let badgeColor = "bg-slate-50 text-slate-700 border-slate-200";
          let icon = <Link2 className="w-2.5 h-2.5" />;
          let label = "";

          if (m.entity_type === 'achievement') {
            const ent = achievements.find((a: any) => a.id === m.entity_id);
            if (!ent) return null;
            badgeColor = "bg-emerald-50 text-emerald-800 border-emerald-150";
            icon = <Award className="w-2.5 h-2.5 text-emerald-500 shrink-0" />;
            label = `${ent.title}`;
          } else if (m.entity_type === 'skill') {
            const ent = skillsIndex.find((s: any) => s.id === m.entity_id);
            if (!ent) return null;
            badgeColor = "bg-brand-50 text-brand-800 border-brand-150";
            icon = <Zap className="w-2.5 h-2.5 text-brand-500 shrink-0" />;
            label = `${ent.name}`;
          } else if (m.entity_type === 'capability') {
            const ent = capabilities.find((c: any) => c.id === m.entity_id);
            if (!ent) return null;
            badgeColor = "bg-brand-50 text-brand-800 border-brand-150";
            icon = <Layers className="w-2.5 h-2.5 text-brand-500 shrink-0" />;
            label = `Capability: ${ent.name}`;
          } else if (m.entity_type === 'methodology') {
            const ent = methodologies.find((x: any) => x.id === m.entity_id);
            if (!ent) return null;
            badgeColor = "bg-rose-50 text-rose-800 border-rose-150";
            icon = <Bookmark className="w-2.5 h-2.5 text-rose-500 shrink-0" />;
            label = `Methodology: ${ent.name}`;
          } else if (m.entity_type === 'function') {
            const ent = functionsList.find((f: any) => f.id === m.entity_id);
            if (!ent) return null;
            badgeColor = "bg-orange-50 text-orange-800 border-orange-150";
            icon = <ClipboardList className="w-2.5 h-2.5 text-orange-500 shrink-0" />;
            label = `Function: ${ent.name}`;
          } else if (m.entity_type === 'deliverable') {
            const ent = deliverables.find((d: any) => d.id === m.entity_id);
            if (!ent) return null;
            badgeColor = "bg-amber-50 text-amber-800 border-amber-150";
            icon = <Tag className="w-2.5 h-2.5 text-amber-500 shrink-0" />;
            label = `Deliverable: ${ent.title}`;
          } else if (m.entity_type === 'customer_engagement') {
            const ent = engagements.find((e: any) => e.id === m.entity_id);
            if (!ent) return null;
            badgeColor = "bg-brand-50 text-brand-800 border-brand-150";
            icon = <Users className="w-2.5 h-2.5 text-brand-500 shrink-0" />;
            label = `Engagement: ${ent.client}`;
          } else if (m.entity_type === 'education') {
            const ent = education.find((ed: any) => ed.id === m.entity_id);
            if (!ent) return null;
            badgeColor = "bg-teal-50 text-teal-800 border-teal-150";
            icon = <GraduationCap className="w-2.5 h-2.5 text-teal-500 shrink-0" />;
            label = `Education: ${ent.institution}`;
          }

          return (
            <Badge key={m.id} variant="outline" className={`text-[9px] py-0.5 px-2 flex items-center gap-1.5 rounded font-semibold ${badgeColor}`}>
              {icon}
              <span className="max-w-[220px] truncate">{label}</span>
            </Badge>
          );
        })}
      </div>
    </div>
  );
};
