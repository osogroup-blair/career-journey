# Career Spotlight — Plan

A public, read-only page that presents a Career Journey to someone deciding whether to hire its owner. Everything else in the app is a tool the candidate uses on themselves. Spotlight is the one surface built for **someone else**: a hiring manager, recruiter or founder who has never heard of this person and is deciding whether to spend 30 minutes on a call.

Status: Phases 0–2 built (2026-10-07). Phase 0: `src/types/spotlight.ts`, `src/lib/spotlightSnapshot.ts`. Phase 1: `src/components/spotlight/`, `src/lib/spotlightView.ts`, the `#/spotlight` editor. Phase 2: `server/spotlight.ts`, `spotlight.html` + `src/spotlight/main.tsx`, `src/lib/spotlightClient.ts`. Phase 3 (Open Graph image, PDF download, view counts) is next.
- Public page: https://claude.ai/artifact/762BiRJbahioftTTx3LceN
- Owner editor: https://claude.ai/artifact/L5i3Gp5FgYKREnh4F2GyX4

---

## 1. Where the app is today (as of writing)

- The Career Journey (`src/types/careerJourney.ts`) is a deep evidence graph, not a résumé: roles → initiatives → deliverables (each with `impact`, `capability_alignment`, `skill_ids`), top-level `achievements[]` linked back to roles, `capabilities[].functions[].skills[]`, `skills_index` with `years_experience`/`last_used`, plus `links.*` cross-references. Real data is large (≈120 achievements as of v3.35).
- There is **no viewer-facing surface**. `/journey` (`src/pages/CareerJourney.tsx`, ~2900 lines) is the owner's editor/JSON workbench. The only presentation output is the tailored résumé (DOCX/PDF via `print.html` + `server/pdfRenderer.ts`), which exists per job and is flattened to a page.
- The whole SPA sits behind `AuthGate` when Firebase is configured (`src/main.tsx`), and `users/{uid}/careerJourney` is owner-only in `firestore.rules`. So nothing can be shown to an anonymous visitor today.
- There's precedent for a second, chrome-free entry point: `print.html` → `src/print/main.tsx`, registered as a separate Rollup input in `vite.config.ts`.

The data to build a strong hiring page already exists. What's missing is curation, presentation, and a safe public path.

---

## 2. Who the page is for, and what they need

**Primary reader: a hiring manager or recruiter.** They're busy, skeptical, and comparing this person against others. They didn't ask to be here; someone sent them a link. Their questions, in order:

| Time on page | Their question | What the page must make obvious |
|---|---|---|
| 0–10 s | *Who is this and what level are they?* | Name, one-line positioning, current title/company, years of experience, location/work preference |
| 10–60 s | *Have they done things like what I need?* | 3 headline outcomes with numbers; a career arc that shows scope growing |
| 1–5 min | *Is that real? How did they do it?* | Role-by-role evidence: initiatives, deliverables, measurable impact, skills used |
| any time | *How do I reach them?* | One always-visible, low-friction contact action |

**Secondary reader: the candidate**, previewing and curating what the first reader sees. They need confidence that nothing private leaks and that the page makes them look good.

**What this audience does not want:** self-rated skill bars ("Python ████░ 80%"), keyword clouds, radar charts, animated counters, a dashboard aesthetic, or making them hunt for contact details. Self-rated proficiency in particular reads as noise to hiring managers. Factual signals (years, last used, where it was used) carry more weight.

---

## 3. Design principles

1. **Answer in ten seconds.** The first screen has to work alone. If the reader leaves after the hero, they should still know who this is, what level, and how to make contact.
2. **Evidence, not adjectives.** This is the product's advantage over LinkedIn and a PDF résumé. Every claim on the page is one click from its proof: an outcome links to the deliverable it came from, a skill to the work that used it, a capability to the roles that show it. Make "show me" a first-class interaction.
3. **Progressive disclosure in three depths:** *Glance* (hero) → *Scan* (career arc, outcomes, role summaries) → *Dive* (initiatives, deliverables, evidence drawer). Each depth is complete on its own, and nothing important is buried more than two interactions deep.
4. **Editorial, not dashboard.** Typography and whitespace do the work. It should read like a well-set magazine profile, not an admin panel. Use one accent color, no gradients on content, no card-in-card nesting.
5. **The candidate's page, not ours.** No app navbar, no feedback widget, no upsell. App branding is limited to a single quiet footer mark.
6. **Curated, never dumped.** 120 achievements is an archive. The page shows the best few, with "view all" behind a filterable index. Defaults come from data the owner already maintains (e.g. `resume_default: 'excluded'` roles are hidden), so a decent page exists with zero curation.
7. **Private by construction.** A public page is built from an explicit allowlist projection of the journey. It's never the journey with fields stripped out.

---

## 4. Information architecture

A single long-scroll page with a sticky section nav. Hiring managers scroll and skim; tabs hide content and break "find in page" and print. Sections in order (each one can be hidden by the owner, and empty sections hide themselves):

1. **Hero:** name, headline (the owner's override, else `person.brand`, else `positioning.primary_tagline`), current title @ company, location + `work_preference`, availability status, primary CTA "Get in touch", secondary links (LinkedIn, GitHub, website). On the right sits an *At a glance* fact list: career start year (shown as "In product since 2015", not a computed year count), current scope, peak team size (`team_leadership.peak_size` when present), industries (`links.industries`).
   - **Dates win over prose.** The demo data says "9 years" in `person.summary` while its role dates span 11. The page shows facts derived from the visible roles' dates. A summary that states a different year count is flagged to the owner in the editor; it's never silently "corrected".
2. **Signature outcomes:** three large outcome statements (`person.signature_outcomes` by default, owner-reorderable). The leading figure is set large in tabular numerals ("$4M", "60%", "3 → 11"), with a short **caption** under it ("ARR in 18 months"). The figure is extracted by rule; the caption can't be, so it's an owner setting that defaults to blank (figure + sentence still read fine without it). An outcome with no figure is shown as text. Each outcome links to its evidence: the owner can pick the supporting deliverables/achievements, and by default the builder suggests them (items whose impact contains the same figure, or which share most of the outcome's words).
3. **Career arc:** a horizontal timeline with segments proportional to tenure and titles stacked to show progression. It's the at-a-glance "scope keeps growing" story. Clicking a segment scrolls to that role. Roles ended before `resume_preferences.condense_roles_ended_before` collapse into one "Earlier career" segment (same rule the résumé builder uses, via `src/lib/resumeBuild.ts`).
4. **Experience:** one "chapter" per role, newest first.
   - Header: title, organization + `company_descriptor`, dates + computed duration, location.
   - Scope chips from structured data only: team size, org scale, advisory scope (`team_leadership` / `organization_scale` / `advisory_ps_scope`).
   - `description`, then the **top 2–3 impacts** (deliverables with an `impact`, ranked by "has a metric" then by order) shown as bold-metric lines.
   - "Show all N initiatives" expands to initiatives → deliverables, each with impact and skill tags. Achievements linked to the role (`getRoleAchievements`) appear inline. An achievement linked to a deliverable via `links.deliverable_achievement` is shown **once**, never twice.
   - Roles with `resume_default: 'condensed'` render as one line and expand on click.
5. **Selected achievements:** 6 featured cards (owner-pinned; defaults are ones with a metric, most recent role first), category chips to filter, then "View all 120 →", which opens a searchable index.
6. **Capabilities** ("What I'm built for"): one card per capability with name, description, the functions listed as plain text, and an **evidence count** ("Shown in 9 deliverables across 3 roles"), which opens the evidence drawer. There are no maturity bars. Maturity is shown as a word only if the owner opts in.
7. **Skills:** grouped by `category`, ordered by recency then years. Each skill shows "6 yrs · used Jul 2026". A "Recent (last 2 years)" toggle is on by default. Clicking a skill opens the evidence drawer listing every deliverable tagged with it.
8. **How I work:** `methodologies[]` with `context`, plus `positioning.narrative_anchors` as short principle statements.
9. **Selected clients & engagements:** only `customer_engagements` with `display: true`.
10. **Education & certifications**, using `resume_display` when present.
11. **Closing contact block:** repeats the CTA, with a short "What I'm looking for" line (optional, from `target_role_families` / `role_orientation`, off by default because it's sensitive).

### The evidence drawer (the signature interaction)

One shared component for "show me the proof", opened from any outcome, skill, capability or achievement:

- Desktop: a right-side sheet over a dimmed page (480 px). Mobile: a bottom sheet at 90 % height.
- Content: what you clicked, then a list of the deliverables/achievements that support it, grouped by role, each with impact and a "Go to role" link that closes the drawer and scrolls to and highlights the role chapter.
- It's deep-linkable (`?evidence=SK-001`), so a candidate can send "here's my Kubernetes work" as a URL.
- It's built on a precomputed **evidence index** in the snapshot (skill → deliverables, capability → deliverables, achievement → roles), so it costs nothing at view time.

---

## 5. Wireframes

Desktop, first screen (1280 px):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  JORDAN RIVERA                                       AT A GLANCE             │
│  Product leader who ships                            ───────────────────     │
│                                                      Experience   9+ years   │
│  B2B SaaS product leader focused on 0-to-1           Now          Sr PM,     │
│  growth and platform scale.                                       Meridian   │
│                                                      Led teams    up to 11   │
│  Denver, CO · Remote or hybrid                       Industries   SaaS,      │
│  ● Open to select opportunities                                   Logistics  │
│                                                                              │
│  [ Get in touch ]   in  ⌂  gh                                                │
│                                                                              │
│  ──────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  $4M          │  60%            │  3 → 11                                    │
│  ARR in 18 mo │  faster         │  team grown                                │
│  from a 0-to-1│  onboarding via │  across PM, design,                        │
│  analytics    │  funnel redesign│  engineering                               │
│  product  →   │            →    │                 →                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

Career arc + role chapter:

```
  2015        2018                 2022                          now
  ├─ APM ─────┼─ Product Manager ──┼─ Senior Product Manager ─────┤
  Hollowell   Fernbank Logistics   Meridian Cloudworks

  ────────────────────────────────────────────────────────────────
  Senior Product Manager                          Mar 2022 – now · 4 yr 7 mo
  Meridian Cloudworks — B2B SaaS infrastructure, ~450 people
  [ 2 PMs · 6 eng · 2 design ]

  Own the platform analytics product line…

  ▸ $4M ARR within 18 months of launch; #2 revenue driver
  ▸ Time-to-first-value 12 days → under 5; 30-day churn −18%

  Show all 3 initiatives ⌄
```

Mobile (390 px): hero stacks (name → tagline → meta → CTA → glance facts as a 2×2 grid). Outcomes become a horizontal snap-scroll row with peek. The career arc goes vertical. The sticky bar shrinks to name + "Contact".

---

## 6. Visual language

- **Typography:** a display serif for the name, section titles and outcome numerals (recommend **Newsreader** or **Fraunces**, self-hosted via `@fontsource` so no third-party font request leaks viewers' IPs), paired with the app's existing sans for body. Type scale is 1.25 ratio, body is 17 px/1.6, prose measure is ~65ch, and all metrics use tabular figures.
- **Color:** monochrome slate plus one accent. The default accent is the app's existing brand navy (`--color-brand-*` in `src/index.css`). The owner picks from ~5 curated, contrast-checked accents (not a free color picker; that's how pages end up illegible). Supports light and dark through `prefers-color-scheme`, with tokens defined once.
- **Layout:** 12-column grid, 1120 px max width, 8 px spacing scale, generous section rhythm (96 px between sections on desktop, 56 px on mobile). Hairline dividers are preferred over boxed cards.
- **Metric emphasis:** a deterministic `extractLeadMetric(text)` (regex for currency, %, multipliers, "X → Y", "from X to Y") pulls the leading number out of an impact string for typographic emphasis. If nothing matches, the text renders plainly. It never invents or reformats numbers, and there's no AI involved.
- **Motion** (`motion` is already a dependency): one restrained fade-and-rise as sections enter, the drawer slide, and smooth anchor scrolling. All of it is disabled under `prefers-reduced-motion`. There are no counters, parallax or typewriter effects.
- **Print:** a real `@media print` stylesheet. All roles are expanded, nav/drawer/CTA buttons are hidden, contact details are printed, and there are page-break rules per role. Many hiring managers save as PDF or print to share internally, and this gives a good PDF for free in Phase 1.

---

## 7. Architecture

### 7.1 The snapshot (the core idea)

The public page never reads the live journey. The owner **publishes a snapshot**:

```
CareerJourney + SpotlightSettings ──buildSpotlightSnapshot()──▶ SpotlightSnapshot (public, allowlisted)
```

- `src/lib/spotlightSnapshot.ts` is a pure function shared by client and server. The in-app preview and the published page render from the exact same output, so **what you preview is what's published.**
- **Explicit field picking, never spreading.** Every schema in `careerJourney.ts` is `.passthrough()`, so a role may carry arbitrary unknown fields (private notes, future additions). The projection constructs each output object field by field. `{ ...role }` is banned in this file, and a unit test enforces it by feeding a journey full of sentinel private fields and asserting none appear in the output.
- **Never published, under any setting:** `phone` (unless explicitly opted in), `positioning_note`, `resume_preferences`, `resume_*` fields, `interview_answers`, `application_artifacts`, `meta` changelog keys, `vocabularies`, `links.keywords`, `customer_engagements` with `display !== true`, and anything not on the allowlist.
- **Opt-in only (default off):** email (shown as click-to-reveal, never in the HTML source as plain text), phone, `target_role_families`/`role_orientation`, maturity/competency/proficiency words.
- The snapshot also carries derived data so the viewer bundle stays dumb: computed durations, career start year, the evidence index, lead figures, per-role highlights, and `journeyVersion` + `builtAt`. The career arc is drawn from the roles' start/end months; it needs no separate data.
- **Hidden means hidden everywhere.** A role set to "Hidden" removes its deliverables from every evidence list, its achievements from the featured list and the full index, and its dates from the career start year. Achievements with no role link at all (most of them in real data) stay eligible, so the preview is where the owner checks them.
- **Email** is stored split into user and domain parts and only joined in the browser after a click, so the published HTML never contains the address.
- **Snapshot, not live mirroring:** edits to the journey don't appear publicly until the owner republishes. The editor names what changed ("1 new deliverable at Meridian Cloudworks, 1 edited achievement") by diffing a fresh build against the stored snapshot entity by entity, not just "something changed".

### 7.2 Data model (Firestore)

| Path | Contents | Client access |
|---|---|---|
| `users/{uid}/spotlight/settings` | Curation choices (section visibility, pinned achievements, outcome order, role overrides, accent, contact opt-ins, visibility, slug) | owner read/write |
| `spotlights/{slug}` | `{ ownerUid, slug, visibility: 'unlisted' \| 'public', snapshot, publishedAt, updatedAt, viewCount? }` | **denied**; server-only through Admin SDK, same pattern as `discoveredJobs` |

- The top-level collection is keyed by slug, so the public read is one doc fetch with no query and no index (in line with the repo's "no composite indexes" constraint).
- Slugs are claimed in a Firestore transaction (create-if-absent), validated (`^[a-z0-9-]{3,40}$`) and checked against a reserved list (`admin`, `api`, `app`, `demo`, …). Changing the slug deletes the old doc, and the UI warns that old links break.
- **Account deletion:** `purgeUserData` (`server/userData.ts`) only recursive-deletes `users/{uid}`, so it must also delete `spotlights/{slug}` (the slug is read from `users/{uid}/spotlight/settings` before the purge). Add it to the GDPR export too. Both are covered by tests in `server/__tests__/userData.test.ts`.
- New `firestore.rules` entries are **not live until someone runs `firebase deploy`** (see AGENTS.md). Because `spotlights/*` is server-only, a missing rule fails closed, which is the safe direction.

### 7.3 Server (`server/spotlight.ts`, registered from `server.ts`)

Keep the new routes in their own module with a single registration call, so this doesn't grow `server.ts` by hand. That's a scoped addition, not the drive-by refactor AGENTS.md warns about.

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/spotlight` | owner | settings + current published snapshot metadata |
| `PUT /api/spotlight/settings` | owner | save curation (validated with Zod) |
| `POST /api/spotlight/publish` | owner | **server reads the journey from Firestore** with the Admin SDK, runs `buildSpotlightSnapshot`, and writes `spotlights/{slug}`. `uid` comes from the verified token, never the body |
| `DELETE /api/spotlight/publish` | owner | unpublish (delete the public doc) |
| `GET /api/public/spotlights/:slug` | none | returns the snapshot. Unpublished and missing get an **identical 404**, so slug existence doesn't leak. Per-IP rate limit and `Cache-Control: public, max-age=60, stale-while-revalidate=600` |
| `GET /s/:slug` | none | serves `spotlight.html` with `<title>`, meta description and Open Graph/Twitter tags injected server-side (recruiters paste links into Slack/LinkedIn, so the unfurl is part of the first impression). `noindex` unless visibility is `public`. Must be registered before the SPA fallback; in dev, use `vite.transformIndexHtml` |

Gating: add a `career_spotlight` `FeatureKey` and a `killSwitches.spotlight` flag (Admin › Flags), checked server-side on the owner routes and the public routes (the kill switch makes public pages 404). Without Firebase (local-only mode), the public routes don't exist and the editor offers Preview and Print only. Static-HTML export is covered in Phase 4.

### 7.4 Front end

- **New Vite entry** `spotlight.html` → `src/spotlight/main.tsx`, added to `rollupOptions.input` next to `print`. It has no `AuthGate`, no Zustand store, no Firebase SDK, no Navbar/FeedbackWidget: it just fetches the snapshot and renders it. The budget is **< 90 KB JS gzipped and LCP < 1.5 s** on a mid-range phone. This is the main reason it's a separate entry and not a route inside the SPA.
- **Shared view components** in `src/components/spotlight/` (`SpotlightPage`, `Hero`, `OutcomeStrip`, `CareerArc`, `RoleChapter`, `AchievementGrid`, `CapabilityList`, `SkillGroups`, `EvidenceDrawer`, `StickyNav`, `ContactCta`) take a `SpotlightSnapshot` as props and nothing else. The public entry and the in-app preview both import them.
- **Owner editor** at `#/spotlight` inside the app (added to the Journey nav menu), in the app's own styling (`ui.tsx` cards, labels, buttons). It's a split view with the curation panel on the left and a sticky live preview on the right. The preview has a device toggle (desktop / phone / print) and a light/dark toggle, and is laid out with container queries so "phone" is the real phone layout, not a scaled screenshot. Changing a setting scrolls the preview to the part it affects and briefly outlines it. Below ~980 px the two panes become an Edit / Preview switch. Panels:
  - *Publishing:* URL slug (with inline reserved/taken/available checks), visibility (Unlisted is the default, Public is opt-in), copy link, Unpublish with an inline confirm. The header shows Live / Unpublished changes / Not published, and the change banner says exactly what changed.
  - *What visitors can see:* a live checklist built from the settings (indexed or not, phone shown, email behind a click, target roles shown, "Open to work" shown), with anything riskier than the default flagged amber. A fixed footer line lists what is never published. It makes the privacy model visible to the owner instead of only enforcing it in code.
  - *Introduction:* headline override with reset, availability (`Open to work` / `Open to select roles` / hidden), "say what roles you're looking for" (off by default, with a warning about current employers).
  - *Headline outcomes:* choose and reorder 3, each showing the detected figure (or "No figure") and an editable caption.
  - *Experience:* per-role Full / One line / Hidden, defaulting to the résumé setting and marked when changed from it.
  - *Featured achievements:* pin up to 6, with "Suggested" on ones that have a figure and come from recent roles.
  - *Sections:* toggle each section, plus "show self-rated levels" (off by default; the help text says evidence counts read better).
  - *Contact:* per channel, with phone discouraged and website/GitHub disabled when the Profile has none.
  - *Style:* accent color and the footer mark.
- Reuse what exists: `getRoleAchievements` / `getRoleDeliverables` (`src/lib/careerJourneyRoleEvidence.ts`), `rolesRecentFirst` / `roleStartYear` / condensing rules (`src/lib/resumeBuild.ts`), `normalizeCareerJourney`, and `useLocalPreference` for editor panel state.

### 7.5 Accessibility

WCAG 2.2 AA throughout: semantic landmarks (`header`/`nav`/`main`/`section` with headings in order), the sticky nav is a real `nav` with `aria-current`, and the drawer is a focus-trapped `dialog` that returns focus and closes on Esc. The career arc has a text equivalent (an ordered list), contrast is checked for every curated accent in both themes, focus rings are visible, tap targets are ≥ 44 px, and everything works without JavaScript animations.

---

## 8. Phases

Each phase can ship on its own and is verified before the next starts.

### Phase 0: Snapshot model and privacy projection (built)
- `src/types/spotlight.ts`: `SpotlightSettingsSchema` (Zod, every field falls back to its default on bad input, since it will arrive in a request body in Phase 2) and the `SpotlightSnapshot` type.
- `src/lib/spotlightSnapshot.ts` (pure, shared by client and server): `defaultSpotlightSettings`, `normalizeSpotlightSettings`, `buildSpotlightSnapshot` (returns the snapshot plus warnings such as a pinned outcome that no longer exists or a summary whose year count contradicts the dates), `extractLeadMetric`, `suggestOutcomeEvidence`, `diffSpotlightSnapshots` (the named-changes banner) and `validateSpotlightSlug`.
- Tests (`src/lib/__tests__/spotlightSnapshot.test.ts`): the **privacy allowlist test** (sentinel private fields on every passthrough object never reach the output), hidden roles leaking nowhere, defaults respecting `resume_default` and `display`, achievement/deliverable dedup, figure extraction cases (and non-cases), dates with gaps and "Present", outcome evidence suggestions, the diff, slug rules, and the demo journey producing a sensible snapshot.

### Phase 1: The page and an in-app preview (built)
- All `src/components/spotlight/*` components, the light/dark tokens, the print stylesheet and the evidence drawer.
- The `#/spotlight` editor with live preview, using local `useLocalPreference`-backed settings until Phase 2 adds persistence (keyed by uid, so two accounts on one browser don't share them).
- As built: the page's styles live in one scoped stylesheet (`spotlight.css`, everything under `.sp`) rather than Tailwind, because it has its own theme tokens, container queries and print rules. Container queries make `.sp` the containing block for `position: fixed`, so the evidence drawer renders in a portal (`.sp-layer` carries the theme). In-page navigation uses refs, not `#anchors`, because of the HashRouter. "Print or save as PDF" opens a full-screen preview that prints without the app around it.
- Works in local-only mode. The candidate can already print/save a good PDF.
- Verification: unit tests, `npm run lint`, and a browser checklist against the demo account (`npm run seed:demo`) at desktop, 390 px, dark mode, print preview and keyboard-only.
- **This is the design phase.** Iterate on the real demo data and the real (large) journey before building any publishing plumbing.

### Phase 2: Publishing (built)
- As built: settings moved to the server too (`PUT /api/spotlight/settings`, debounced from the editor), not just the published page — new `firestore.rules` entries aren't deployed, so the client can't write new Firestore paths directly. Phase 1's per-browser settings are carried over on first load.
- Open question found while building: an "unlisted" page's address is based on the owner's name, so it can be guessed. Unlisted currently means "not indexed", not "secret". If that matters, add an optional random suffix (`/s/jordan-rivera-k7x2`) for unlisted pages.
- Firestore settings persistence, `spotlights/{slug}`, the `server/spotlight.ts` routes, the `spotlight.html` entry, `/s/:slug` with injected OG meta, the rate limit, the feature flag and kill switch, purge and GDPR-export integration, and `firestore.rules` entries.
- Tests: `server/__tests__/spotlight.test.ts` (publish derives uid from the token; an unpublished slug and a missing slug return the same 404; the kill switch 404s; slug collision and reserved words; snapshot built server-side ignores client-sent journey content) plus a `userData` purge test.
- Docs: ARCHITECTURE.md (route table, data model, Spotlight section) and AGENTS.md env/feature table.

### Phase 3: First-impression polish
- Generated OG image per spotlight (1200×630: name, tagline, top outcome), rendered with the existing `puppeteer-core` pipeline and cached on publish.
- A "Download résumé (PDF)" button that renders the spotlight's print view through `server/pdfRenderer.ts`.
- Privacy-respecting view counts for the owner (a counter increment per day per slug, no cookies, no IP storage).

### Phase 4: Optional, decide later
- **Contact form** relayed over the existing SMTP setup instead of exposing email (needs abuse handling; the support-ticket daily limit is a template).
- **Static HTML export** for local-only users: a single self-contained file they can host anywhere.
- **"How do I fit your role?"** A recruiter pastes a job description and sees the matching evidence. This is the most differentiated idea and also the riskiest: unauthenticated AI spend, abuse, and it runs through the un-migrated AI shim. It should be quota'd against the *owner's* plan and built only after the AI provider migration. It's listed here so the snapshot's evidence index is designed to support it.

---

## 9. Decisions for Blair

Each has a recommendation; none blocks Phase 0–1.

1. **Plan gating.** *Recommend:* available on Free with a small "Made with Career Journey" footer mark (every shared page becomes acquisition), with Pro removing the mark and unlocking accents and the OG image.
2. **Show self-rated proficiency/maturity?** *Recommend:* off by default, showing years + last used + evidence count instead. The owner can opt in to words, never bars.
3. **Email exposure.** *Recommend:* LinkedIn as the default CTA target, email opt-in and click-to-reveal. Phase 4 contact form if spam becomes real.
4. **Default visibility.** *Recommend:* Unlisted (`noindex`) by default; Public (indexable) as an explicit choice.
5. **URL shape.** *Recommend:* `/s/{slug}` on the app domain now. A custom domain or subdomain is a later conversation.
6. **Display font.** *Recommend:* add `@fontsource/newsreader` (one new dependency, self-hosted).

---

## 10. Out of scope

- Editing journey content from the Spotlight editor. It curates and presents only; content edits stay in `/edit`.
- Multiple spotlights per user (e.g. one per target role family). The settings shape should not preclude it, but one is enough to learn from.
- Comments, endorsements and testimonials (no data source exists for them yet).
