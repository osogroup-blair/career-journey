export const DEFAULT_CAREER_JOURNEY = {
  meta: {
    owner: "Alex Morgan",
    version: "2.4.0",
    framework: "Career Journey Master Taxonomy v2",
    description: "Senior Product & Engineering Lead with 8+ years experience scaling high-throughput transaction rails, distributed AI platforms, and enterprise cloud architectures.",
    last_updated: new Date().toISOString().split('T')[0],
    target_role: "Staff Product Manager / Principal Engineer",
    target_role_alignment: 94,
    total_scale_managed: "4M+ Daily QPS / $1.2B Volume",
    total_financial_impact: "+$12.4M ARR & -$360k Ops",
    version_X_Y_changes: [
      "Updated Q3 AI integration deliverables and LLMOps pipelines",
      "Added multi-tenant distributed API gateway architecture benchmarks",
      "Mapped 28 verified quantitative achievements and 34 indexed competencies"
    ]
  },
  roles: [
    {
      id: "ROLE-001",
      title: "Senior Product & Technical Lead",
      company: "Apex Tech Innovations",
      organization: "Apex Tech Innovations",
      industry: "Enterprise AI & Distributed Systems",
      team_scope: "Led 11 engineers & 2 ML scientists across US & APAC",
      dates: "2022 - Present",
      start_date: "2022-01",
      end_date: "Present",
      duration: "2+ Years",
      location: "San Francisco, CA (Hybrid)",
      summary: "Direct cross-functional engineering and AI product teams delivering enterprise-grade ML inference pipelines, low-latency API gateways, and developer tool ecosystems.",
      mission: "Modernize legacy transaction orchestration and scale real-time AI capabilities for enterprise tier-1 clients.",
      initiatives: [
        {
          id: "INIT-001",
          name: "Real-Time RAG & LLMOps Engine",
          description: "Architected multi-tenant hybrid vector-search ingestion pipelines with dynamic context caching.",
          impact: "Processed 4M+ daily queries with sub-90ms p99 latency.",
          skills: ["LLMOps", "Vector Databases", "TypeScript", "Node.js"]
        },
        {
          id: "INIT-002",
          name: "Global API Gateway Consolidation",
          description: "Re-engineered distributed microservice edge routing with automated circuit-breaking and rate limiting.",
          impact: "Decreased p99 response times by 42% across all public endpoints.",
          skills: ["System Architecture", "Go", "Docker", "Redis"]
        }
      ],
      deliverables: [
        "Designed and shipped real-time RAG ingestion engine serving 4M+ daily queries.",
        "Architected multi-tenant API gateway reducing p99 response times by 42%.",
        "Author of enterprise Security & Compliance Audit framework adopted company-wide."
      ],
      achievements: [
        {
          id: "ACH-001",
          metric: "+99.99% SLA",
          label: "Platform Reliability",
          description: "Increased enterprise core platform availability from 99.4% to 99.99% SLA across multi-region deployments.",
          category: "Scale & Reliability"
        },
        {
          id: "ACH-002",
          metric: "-$180k / yr",
          label: "Cloud Cost Optimization",
          description: "Reduced annual AWS infrastructure spend by $180k through automated right-sizing and spot instance fleet orchestration.",
          category: "Cost Savings"
        },
        {
          id: "ACH-003",
          metric: "+32% Adoption",
          label: "Developer Velocity",
          description: "Standardized internal SDK and CLI tooling, accelerating client onboarding from 3 weeks to 4 business days.",
          category: "Product Growth"
        }
      ],
      methodologies: ["Domain-Driven Design (DDD)", "PADRE Diagnostics", "LLMOps Platforming", "Agile at Scale"],
      skills: ["TypeScript", "Node.js", "Python", "LLMOps", "Vector Databases", "System Architecture", "React", "Docker", "Kubernetes", "AWS"]
    },
    {
      id: "ROLE-002",
      title: "Lead Full-Stack Engineer",
      company: "CloudScale Systems",
      organization: "CloudScale Systems",
      industry: "Fintech & SaaS Analytics",
      team_scope: "Led team of 6 engineers & mentored 4 junior developers",
      dates: "2019 - 2022",
      start_date: "2019-04",
      end_date: "2022-01",
      duration: "2 yrs 10 mos",
      location: "Austin, TX (Remote)",
      summary: "Spearheaded frontend and API microservices redesign for scalable SaaS analytics and high-volume billing dashboard.",
      mission: "Replace monolithic legacy codebase with modular micro-frontends and real-time streaming infrastructure.",
      initiatives: [
        {
          id: "INIT-003",
          name: "Micro-Frontend & Component System",
          description: "Created standardized design system and modular component library consumed by 14 internal web properties.",
          impact: "Reduced frontend build times by 65% and boosted Lighthouse performance scores to 98.",
          skills: ["React", "TypeScript", "Tailwind CSS", "Vite"]
        },
        {
          id: "INIT-004",
          name: "High-Throughput WebSocket Event Stream",
          description: "Engineered distributed pub/sub event pipeline handling 50k telemetry metrics per second.",
          impact: "Zero data drop during quarterly peak financial reconciliation windows.",
          skills: ["Node.js", "Redis", "WebSockets", "PostgreSQL"]
        }
      ],
      deliverables: [
        "Built modular component library used across 14 internal and client-facing applications.",
        "Engineered real-time WebSockets event stream handling 50k events/sec.",
        "Authored CI/CD automated test pipeline with 94% code coverage requirement."
      ],
      achievements: [
        {
          id: "ACH-004",
          metric: "+$12.4M Volume",
          label: "Transaction Throughput",
          description: "Eliminated transaction processing bottlenecks, supporting a 3x growth in daily processed invoice volume.",
          category: "Revenue & Scale"
        },
        {
          id: "ACH-005",
          metric: "98/100 Perf",
          label: "Lighthouse Score",
          description: "Cut client application bundle sizes by 65%, reducing average page load times from 3.8s down to 850ms.",
          category: "Performance"
        },
        {
          id: "ACH-006",
          metric: "Zero Downtime",
          label: "Migration Execution",
          description: "Successfully executed zero-downtime database migration of 45M customer records to partitioned PostgreSQL.",
          category: "Architecture"
        }
      ],
      methodologies: ["Micro-Frontends", "CI/CD Pipeline Automation", "Event-Driven Architecture", "Scrum"],
      skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "Redis", "GraphQL", "Docker", "Tailwind CSS", "Jest"]
    },
    {
      id: "ROLE-003",
      title: "Software Engineer",
      company: "DataForge Analytics",
      organization: "DataForge Analytics",
      industry: "Data Engineering & Business Intelligence",
      team_scope: "Individual Contributor within core data pipeline squad",
      dates: "2017 - 2019",
      start_date: "2017-06",
      end_date: "2019-03",
      duration: "1 yr 10 mos",
      location: "Seattle, WA",
      summary: "Developed automated ETL data pipelines and RESTful backend microservices for enterprise business intelligence reports.",
      mission: "Transform slow batch data extraction processes into automated, resilient distributed worker pools.",
      initiatives: [
        {
          id: "INIT-005",
          name: "Distributed ETL Celery Pipeline",
          description: "Migrated legacy cron batching tasks to distributed RabbitMQ worker pools.",
          impact: "Reduced daily client sync from 4 hours to 18 minutes.",
          skills: ["Python", "Django", "RabbitMQ", "SQL"]
        }
      ],
      deliverables: [
        "Migrated legacy cron batching tasks to distributed Celery/RabbitMQ workers.",
        "Built automated REST API connectors for 8 major ERP platforms."
      ],
      achievements: [
        {
          id: "ACH-007",
          metric: "92% Faster",
          label: "Pipeline Sync Speed",
          description: "Accelerated nightly business intelligence data sync from 4 hours down to 18 minutes.",
          category: "Performance"
        },
        {
          id: "ACH-008",
          metric: "100% Automated",
          label: "Data Verification",
          description: "Built automated anomaly detection scripts preventing erroneous data imports into client reporting dashboards.",
          category: "Quality Assurance"
        }
      ],
      methodologies: ["ETL Automation", "Test-Driven Development (TDD)", "RESTful API Standards"],
      skills: ["Python", "Django", "SQL", "RabbitMQ", "AWS S3", "Git", "Linux", "PostgreSQL"]
    }
  ],
  skills_index: [
    { name: "TypeScript / JavaScript", category: "Core Languages", level: "Expert", years: "7+", rolesCount: 2 },
    { name: "Python", category: "Core Languages", level: "Expert", years: "6+", rolesCount: 2 },
    { name: "React & Modern Web", category: "Frontend", level: "Expert", years: "7+", rolesCount: 2 },
    { name: "LLMOps & RAG Architecture", category: "AI & ML Systems", level: "Advanced", years: "3+", rolesCount: 1 },
    { name: "Node.js & Express", category: "Backend & Systems", level: "Expert", years: "7+", rolesCount: 2 },
    { name: "System Design & Microservices", category: "Architecture", level: "Advanced", years: "5+", rolesCount: 2 },
    { name: "PostgreSQL & Vector DBs", category: "Databases", level: "Advanced", years: "6+", rolesCount: 3 },
    { name: "Docker & Kubernetes", category: "DevOps & Cloud", level: "Intermediate", years: "4+", rolesCount: 2 },
    { name: "Redis & WebSockets", category: "Backend & Systems", level: "Advanced", years: "5+", rolesCount: 2 },
    { name: "Domain-Driven Design (DDD)", category: "Methodologies", level: "Advanced", years: "4+", rolesCount: 1 },
    { name: "AWS Cloud Infrastructure", category: "DevOps & Cloud", level: "Advanced", years: "5+", rolesCount: 2 }
  ],
  education: [
    {
      institution: "University of Washington",
      degree: "B.S. in Computer Science & Engineering",
      graduationDate: "2017",
      location: "Seattle, WA",
      honors: "Magna Cum Laude"
    }
  ],
  certifications: [
    { name: "AWS Certified Solutions Architect - Professional", issuer: "Amazon Web Services", date: "2023" },
    { name: "Certified Kubernetes Application Developer (CKAD)", issuer: "Cloud Native Computing Foundation", date: "2022" }
  ]
};
