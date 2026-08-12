# JD Signal Map

Quick lookup table mapping common JD phrases to the Career Journey items that best demonstrate them. Use this to make sure the resume connects every major JD signal to a specific, evidenced story rather than generic claims.

## How to use this file

When Stage 1 parsing identifies a JD signal, find the matching row below. The "Anchor story" column tells you which Career Journey item to lead with; the "Bullet framing" column gives the language pattern that proves it.

If a JD signal isn't in this table, fall back to the principle: every claim in the resume needs a specific, dated, quantified or named-project anchor in the Career Journey. Generic competence statements don't pass either the ATS or the human screen.

---

## Canonical employer headings

Preserve these exact `resume_company_descriptor` values from the Career Journey in resume employer headings unless Blair explicitly changes the canonical data:

- **Oso Group — Business Operating Systems & AI Transformation Consulting**
- **Nymbl — Custom Enterprise Software & AI Services Platform Development**
- **Gloo — Faith-Based Technology & AI Platform**

These descriptors provide factual company context. Do not rewrite them merely to mirror a target JD or improve keyword matching. Tailor the role title, narrative, bullets, summary, and skills instead.

### Canonical employer links

When `resume_company_url` exists in the Career Journey, hyperlink the visible employer name in the resume heading to the exact canonical URL while leaving the descriptor visible as plain text. Current links:

- **Oso Group:** `https://oso.group/`
- **Nymbl:** `https://www.nymbl.app/`
- **Gloo:** `https://gloo.com/`
- **Starkmedia Digital Agency:** `https://www.starkmedia.com/`

Treat these links as reviewer convenience and optional machine-readable context, not as evidence the ATS/AI will crawl external pages. Resume claims and employer context must remain self-contained.

## Role-family positioning guardrail

Use the signal map not only to find evidence, but to control the **candidate identity** the finished resume communicates. Blair's implementation depth is real, but it should not become the dominant profile for a senior architecture, strategy, or operating role simply because technical tools are easy ATS keywords.

| Target role family | Signals that should dominate top third + first skills rows | Supporting signals that should usually come later |
|---|---|---|
| Enterprise Architecture / Strategy | Enterprise Architecture; Business Capability Mapping; Value-Stream Mapping; Target-State Architecture; Technology Roadmapping; Operating Model Design; Integration Architecture; ERP Modernization; Executive Advisory; Portfolio Governance | Node.js; TypeScript; React.js; Python; SQL; low-code tools |
| Solutions Engineering / Technical Presales | Solutions Engineering; Discovery; Technical Presales; POC / Demo Delivery; Solution Architecture; Executive Stakeholder Management; Sales Enablement; API / Integration Architecture; Acceptance Criteria | Programming languages; CMS tools; low-code implementation details unless the JD asks for them |
| Chief of Staff / Strategy & Operations | Strategic Planning; Operating Rhythm; Organizational Effectiveness; Executive Decision Support; Cross-Functional Execution; KPI / Portfolio Governance; Board / Investor Materials; AI-Enabled Operations | Deep engineering stack details unless they prove a specific operating mechanism |
| Delivery / Professional Services Leadership | Professional Services; Implementation; Client Advisory; Delivery Governance; Scoping & Estimation; Resource / Capacity Planning; Customer Expansion Roadmaps; Change Management | Individual coding frameworks unless the role is player-coach/hands-on |

**Skill-section rule:** for senior non-engineering targets, put implementation languages/frameworks in the final technical-foundation row. The first 8–12 extracted skills should describe the target role family, not Blair's earliest or most tool-specific work.

## Hard gates / screener language — extract these in Stage 1, audit in Stage 4

These are the JD phrases that usually become *required screener questions* — the layer that auto-rejects before keyword scoring. When you see this language, capture it as a hard gate and verdict it CLEAR / FAIL / UNCERTAIN against Blair's position.

| JD language to watch for | Gate type | Blair's position | Verdict guidance |
|---|---|---|---|
| "must be authorized to work in the US", "no sponsorship", "US citizens only" | Work authorization | US-authorized | CLEAR for US roles. "US citizens only" / clearance-tied → verify. |
| "onsite", "hybrid", "X days in office", "must be located in [metro]", "[City]-based" | Location / time zone | Remote-only, Telluride CO, Mountain Time | FAIL if hard onsite/hybrid. UNCERTAIN if "remote" with a metro preference — worth confirming flexibility. |
| "Bachelor's degree required", "degree in [field] required", "will verify education" | Degree | Mechanical Engineering coursework, not completed | UNCERTAIN/soft for senior roles; FAIL only if emphatic + verified. Note honestly. Look for "or equivalent experience" escape hatch. |
| "PMP", "active security clearance", "[vendor] certification required", "licensed [X]" | License / cert / clearance | None held | FAIL if hard-required and Blair lacks it. Clearance can't be acquired quickly — treat as a real gate. |
| "minimum N years of [specific function]" | Minimum years | 10+ yrs leadership/architecture; ~4 yrs in the specific GTM/SE motion | CLEAR if Blair clearly evidences the years *in the function asked*. UNCERTAIN if the threshold is in a function where his years are thinner. |
| "willing to travel N%", "frequent travel", "relocation required" | Travel / relocation | Remote-first, Telluride CO, Mountain Time; willing to travel 10–20% | CLEAR when travel is within the confirmed 10–20% range and no relocation is required. UNCERTAIN/FAIL for materially higher travel, recurring onsite presence, or relocation. Surface to Blair. |
| Application or role in a non-English language | Language + parse risk | English | FAIL on language requirement; also a parser caveat for cross-border ATS. |

If a JD has an explicit "Requirements" list with hard verbs ("must", "required", "minimum"), assume those are the most likely required screeners and audit each one. Soft "nice to have" / "preferred" items are *not* hard gates — they belong in the keyword/content layer, not Stage 4.

---



| JD signal | Anchor story | Bullet framing |
|---|---|---|
| "Scale" / "scaling" / "growth" | Nymbl revenue $1.5M → $9.2M | Lead with the 6x number and the named framework (PADRE). |
| "Transformation" / "transformational change" | Replacing ad-hoc delivery with PADRE + AI workflows at Nymbl | Frame as "replaced X with Y" with the throughput delta. |
| "Vision" / "north star" / "multi-year roadmap" | CSO scope at Nymbl, internal operating system architecture | Position as authorship of the operating model, not execution. |
| "Cross-functional" | Connecting strategy, presales, professional services, delivery, billing at Nymbl | Name the functions connected, not "cross-functional" as an adjective. |
| "Executive stakeholder management" | CSO role reporting to CEO | Lead with reporting line and scope ownership. |
| "Voice of customer" | Surfacing product gaps from frontline services work at Nymbl | Frame as "partnered with product/eng to influence roadmap based on..." |

## Post-sales / customer experience signals

| JD signal | Anchor story | Bullet framing |
|---|---|---|
| "Professional Services" | Nymbl services delivery scaling | Use the exact phrase "Professional Services" in title reframe and bullets. |
| "Customer Education" / "training" / "enablement" | Knowledge center + integration hub (Freelance era); AI intake workflow at Nymbl | Frame contextual/in-product enablement, not classroom training. |
| "Technical Support" / "ticket deflection" | AI-assisted compliance + diagnostic workflow patterns | Frame as "AI-assisted [task] to reduce 1:1 support volume". |
| "Self-service" / "product-led" | AI intake workflow + reusable solution patterns | Frame as "replacing 1:1 delivery with reusable, customer-driven patterns". |
| "Time to value" / "TTV" | Intake-to-proposal time reduced from 2 weeks to 3 days | Use the specific delta. |
| "CSAT" / "NPS" / "customer obsession" | Team transformation bullet; consultative customer partnership | Honest framing — focus on what was built that produces these metrics rather than the metrics themselves (which we don't have hard numbers on). |
| "Implementation" / "onboarding" | Nymbl PADRE framework + templatized engagements | Always say "implementation" if the JD does — don't substitute "delivery". |

## AI & automation signals

| JD signal | Anchor story | Bullet framing |
|---|---|---|
| "AI-powered" / "AI-augmented" / "AI-assisted" | AI intake & solution automation at Nymbl; AI workflows at Oso Group | Frame as workflow orchestration with named inputs/outputs, not "we use AI". |
| "Automation" | Compliance automation; intake automation; provisioning automation (IT mgr) | Lead with the manual process that was eliminated. |
| "In-product guidance" / "contextual" / "embedded" | Knowledge hub architecture (Freelance) + AI intake workflow patterns | Frame as "early prototype" / "underlying pattern" when reaching. Be honest about the gap. |
| "Prompt engineering" / "LLM workflows" | AI workflow at Nymbl + Oso prompt frameworks | Use specific deliverable names ("intelligent prompt and analysis engine"). |

## Technical & architecture signals

| JD signal | Anchor story | Bullet framing |
|---|---|---|
| "Solutions architecture" | Nymbl Solution Architect role; Gloo Enterprise Architect | Lead with named industry verticals (healthcare, fintech, logistics). |
| "Enterprise architecture" | Gloo Enterprise Architect (January 2017–August 2020); Oso productized EA offering | Use "domain maps, API contracts, sequence diagrams" vocabulary. Preserve Gloo progression from Full Stack Developer (January 2015–January 2017) rather than implying Enterprise Architect scope for the full tenure. |
| "API" / "integration" | Microservices work at Gloo; integration adapters at Nymbl | Use specific patterns (REST, contracts, adapters), not just "APIs". |
| "Microservices" | Gloo platform transition work | Frame as "supported transition to service-oriented architecture". |
| "Low-code" / "no-code" | Nymbl low-code platform delivery | Name the platforms used if known; otherwise "low-code platforms". |
| "Node.js" / "TypeScript" / "PostgreSQL" | Reusable TypeScript framework (Freelance) | Include in Core Skills section; mention in summary if JD emphasizes hands-on technical. |
| "Cloud" / "AWS" / "infrastructure" | Cloud hosting patterns work | Be honest — "Established" level, not "Advanced". |

## Operations & governance signals

| JD signal | Anchor story | Bullet framing |
|---|---|---|
| "SOC 2" / "compliance" / "audit" | Nymbl SOC 2 Type II program | Lead with the business outcome ($1.5M new revenue), not just the audit pass. |
| "Security" / "access governance" | IT Manager role at Nymbl | Frame around "access posture" and "audit readiness", not just "IT". |
| "KPIs" / "metrics" / "operational excellence" | Integrated operating system giving leadership visibility | Lead with what leadership could now see. |
| "Program management" / "PMO" | SAFe portfolio implementation at Gloo | Name SAFe, ceremonies, artifacts. |
| "Budget" / "P&L" | Nymbl financial scaling story (proxy) | Be careful — don't claim P&L ownership unless JD framing makes it appropriate. |

## Domain / industry signals

| JD signal | Anchor story | Bullet framing |
|---|---|---|
| "SaaS" / "enterprise SaaS" | Gloo platform experience; Nymbl custom enterprise software & AI services experience is adjacent but is not SaaS | Gloo platform experience can support SaaS/platform JDs where the underlying work maps truthfully, but preserve Gloo's canonical employer heading "Faith-Based Technology & AI Platform." For Nymbl, preserve "Custom Enterprise Software & AI Services Platform Development" and position the experience as enterprise software/services adjacency rather than calling Nymbl a SaaS company. |
| "Healthcare" | Healthcare provider management (Nymbl); credentialing workflow | Name the specific use case. |
| "Fintech" / "banking" / "financial" | Loan banking application; cashflow management app (Nymbl) | Name the specific use case. |
| "Logistics" / "supply chain" | Driver tracking system; group purchasing OS (Nymbl) | Name the specific use case. |
| "Sales" / "revenue operations" | PADRE sales-to-delivery framework | Frame as ownership of the GTM-to-delivery seam. |

---

## Gaps Blair commonly has — and how to handle them

- **No big-name enterprise logos** — Nymbl's customer names aren't public marquee brands. Compensate by leading with the *industry verticals* shipped to (healthcare, fintech, logistics, SaaS) and the *complexity of the work* (SOC 2, multi-million-dollar services scaling), not customer names.

- **No formal degree completion** — Mechanical Engineering coursework, did not complete. Frame as "coursework" honestly; lead the Education paragraph with the founding-leadership story (lacrosse club) rather than the degree status.

- **No prior published title with "VP" in it** — CSO is more senior than VP in title hierarchy, but ATS systems may not know that. Always include a hybrid title in the role line that uses the JD's level vocabulary (e.g. "Chief Strategy Officer | Head of Professional Services & Customer Experience"). This is honest because the scope is real.

- **Smaller company sizes** — Nymbl is a high-growth services org, not a 1000-person SaaS company. Don't try to hide this; lean into it as "founder-led to multi-million-dollar services org" which signals builder credibility.

- **No publicly named AI products** — Blair's AI work is internal tooling, not consumer-facing AI products. Frame as "AI workflow orchestration" and "AI-augmented delivery", which is accurate, rather than "AI products" which would overclaim.
