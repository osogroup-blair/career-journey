---
name: cover-letter-writer
description: "Use this skill whenever the candidate asks for a cover letter, application letter, letter of interest, or asks to improve/analyze a cover letter for a job application. This skill governs cover-letter strategy, structure, evidence selection, differentiation, sentence-level anti-slop quality control, and final submission quality. It works alongside JD_pipeline_SKILL.md and voice_skill.md. The Career Journey remains the factual source of truth; JD_pipeline governs job-fit/ATS/evidence logic; the voice skill governs tone, anti-AI style, and sentence construction; this skill governs how to turn those ingredients into a cover letter that makes the hiring team want to talk to the candidate."
---

# Cover Letter Writer

This skill exists to create cover letters that do more than prove the candidate is qualified.

The goal is for the hiring team to finish the letter thinking:

> I want to talk to this person, even if every qualification is not obvious on paper.

A strong cover letter should feel like a smart operator has already started thinking about the company’s problem before the interview.

The target quality bar is **8.5–9/10 or better** by the scoring rubric in this skill.

# 1. Skill priority and integration

When this skill is used inside the Job Applications project, follow this priority order:

1. **Career Journey source of truth** — all factual career claims, metrics, roles, tools, accomplishments, and examples must be supported by the candidate's Career Journey.
2. **Job description** — company facts, role requirements, language, and hiring problem come from the specific JD/application materials.
3. **JD_pipeline_SKILL.md** — controls job-specific evidence, gaps, hard gates, ATS logic, role signals, and any Career Journey updates.
4. **This cover-letter skill** — controls narrative strategy, structure, evidence density, differentiation, and quality bar.
5. **voice_skill.md** — controls the candidate's sentence construction, tone, reasoning style, anti-AI editing, and mechanical style constraints.

Never invent or stretch experience to improve the letter.

If evidence is weak, narrow the claim or leave it out.


## 1A. Invocation modes

Use this skill in all of these situations:

- **Pipeline handoff:** Stage 9 of `JD_pipeline_SKILL.md` after a tailored resume has been delivered and the candidate says they need a cover letter.
- **Direct cover-letter request:** the candidate asks for a cover letter, application letter, or letter of interest before or outside the resume workflow. Use the current application context and Career Journey directly. Do not force the candidate through Stages 1–8 again if the company, exact role, and JD are already available.
- **Cover-letter critique:** the candidate asks to analyze, score, improve, rewrite, or make an existing cover letter stronger. Score the existing letter with this skill's rubric, identify the highest-leverage weaknesses, then rewrite only when requested or when the request clearly asks for improvement.
- **Formal document output:** If the candidate asks for a `.docx` or PDF cover letter, use the same approved prose and preserve the resume's contact/header conventions, including the candidate's own clickable website URL when they have one.

When a direct cover-letter request lacks the actual job description or enough application context to identify the company's hiring problem, use the best available application materials before drafting. Do not invent company-specific claims.

## 1B. Division of responsibility

Keep the responsibilities of the project skills separate:

- **Career Journey:** what the candidate has actually done.
- **Job description / application materials:** what this company and role actually need.
- **JD pipeline:** which evidence and gaps matter for this application.
- **Cover-letter skill:** what argument the letter should make, how it should be structured, which proof to select, and whether the result is strong enough to submit.
- **Voice skill:** how the candidate would naturally express that argument and how to remove AI-style writing patterns.

If two skills contain overlapping cover-letter advice, this skill controls **cover-letter strategy and quality**, while `voice_skill.md` controls **voice and sentence-level style**. Neither may override factual evidence.


# 2. Governing principle

A cover letter is **not a prose resume**.

The hiring team already has the resume.

The letter should answer three different questions:

1. **Why this company/problem?**
2. **How does the candidate think about the problem in a way that is useful or distinctive?**
3. **What small amount of evidence proves that this point of view comes from real experience?**

The cover letter should create curiosity, not exhaustively prove every qualification.

# 3. What makes a cover letter stand out

The strongest cover letters do four things well:

## A. Show that the candidate understands the business beneath the job description

Do not merely repeat what the company says about itself.

Look for the operating mechanism underneath the product or role.

Examples of the type of observation to make:

- what messy human behavior the product is structuring
- what workflow the product is actually coordinating
- where customer intent becomes operational action
- what information crosses functional boundaries
- where scale creates ambiguity, waiting, handoff failure, or decision friction
- what customer behavior should become product, GTM, partnership, or operating signals
- what a founder currently has to hold in their head that will eventually need structure

The opening should make the reader think:

> This person understands what we are actually building or solving.

## B. Explain the mechanism, not the slogan

Avoid generic claims such as:

- “I love fast-paced startups.”
- “I thrive in ambiguity.”
- “I am excited by cross-functional work.”
- “I am passionate about AI.”

Instead explain what that work looks like in practice.

For example, rather than saying the candidate is strong cross-functionally, describe how a customer signal can become a product decision, integration priority, GTM change, partnership opportunity, or company-level bet, and how someone has to follow that signal until it becomes a decision, owner, and execution.

## C. Use one strong proof story instead of a resume inventory

Evidence should be selective.

Prefer one high-signal story that demonstrates several relevant behaviors at once.

A strong proof story usually contains:

- the operating situation
- the candidate's role in it
- what the candidate actually changed or built
- a measurable or observable result

Use the logic of STAR without making the prose read like an interview answer.

Do not write two symmetrical “Situation / Action / Result” paragraphs.

## D. Make the candidate's unconventional profile an advantage without defending it

Do not manufacture objections for the hiring team.

Avoid lines such as:

- “I realize I may be overqualified...”
- “Although I have already held a more senior title...”
- “Despite not having the traditional background...”
- “I know my experience is unusual for this role...”

Those sentences introduce concerns that may not have existed yet.

Instead, make the candidate's motivation obvious through what they are drawn to:

- being close to founders
- working near customers and product decisions
- taking ownership of undefined problems
- helping a company build enough operating structure to scale without adding bureaucracy
- being in the room where strategy becomes execution

Let the reader infer that the candidate is choosing the work intentionally.

# 3A. Opening Thesis Gate

The opening is the highest-leverage part of the cover letter. Before drafting the letter, determine the opening idea separately from the rest of the prose.

Internally generate at least **three materially different opening directions**. They must be different ideas, not three rewrites of the same sentence. Build them from one or more of these sources:

- the company's specific business, product, customer, or delivery model
- an unusual or important responsibility in this particular role
- a tension the candidate has personally encountered that directly maps to the company's problem
- a product, operating, customer, commercial, or technical mechanism distinctive to this company
- a verified current company development when research materially changes the argument

Choose the opening direction with the strongest combination of:

1. company specificity
2. relevance to the role's real operating problem
3. connection to the candidate's actual point of view or experience
4. curiosity / reason to continue reading
5. naturalness in the candidate's voice

Do **not** draft the full letter until one opening direction clearly passes.

## Opening rejection test

Reject an opening immediately if any of the following is true:

- The company name could be replaced with another company without materially changing the paragraph.
- The opening begins by announcing the candidate's interest rather than demonstrating why the work is interesting.
- The opening describes a broad category problem common to most technology companies, consultancies, startups, or enterprise-software companies.
- The opening merely paraphrases the job description.
- The opening sounds like the setup to a conventional cover letter.
- The first sentence exists primarily to transition into the real point in sentence two or three.
- A hiring manager could accurately predict the next sentence after reading the first one.

The first sentence should already contain an observation, tension, consequence, or point of view worth reading.

# 4. Recommended structure

Default to **four paragraphs**, usually **325–400 words**.

This is a guideline, not a rigid template. A shorter or longer letter is acceptable if the argument genuinely needs it, but one page is the hard target.

## Paragraph 1 — Start inside the problem

Do not write a "hook." Begin with the most interesting specific observation the candidate has about the work this company is doing, the customer problem it faces, or the unusual responsibility this role owns.

The reader should enter the argument immediately. Do **not** begin by summarizing the candidate's background, announcing that they are applying, or announcing that they find the company interesting.

Do **not** begin with:

- “I am writing to apply for...”
- “I am excited to apply for...”
- “With more than X years of experience...”
- “As a seasoned executive...”
- “What interests me about [Company]...”
- “What attracted me to [Company]...”
- “What caught my attention about...”

Preferred opening sources, in order:

1. A specific operating or technical tension the candidate recognizes from direct experience.
2. A non-obvious implication of the company's product, services model, customer, or market.
3. A distinctive responsibility in the role that reveals how the company actually operates.
4. A verified current company development that materially changes the problem this person will need to solve.

The company name does not need to appear in sentence one. Artificially inserting it often makes the opening sound more like a cover letter.

A strong first paragraph should make sense because it is about this company, not because the company name was inserted into it.

By the end of the paragraph, the reader should understand why this particular problem is compelling to the candidate without seeing the phrases “I am interested,” “I am excited,” or “I was drawn to.”

## Paragraph 2 — Why the role matters

Move from the company problem into the role’s real job.

Explain the mechanism behind why this role exists at this company and stage.

For a Chief of Staff role, for example, the useful observation might be that customer signals and founder ideas often cut across product, GTM, partnerships, finance, operations, and hiring before the organization has clean boundaries for them.

Keep this paragraph short. It should frame the work, not become a philosophy essay.

## Paragraph 3 — One proof story

Use the strongest Career Journey evidence that proves the candidate has operated inside a comparable problem.

Prefer evidence that maps to multiple role signals at once.

For example:

- CEO/founder partnership
- building an operating system or planning cadence
- turning priorities into initiatives, owners, metrics, and execution
- building a GTM motion with measurable revenue impact
- assembling a cross-functional tiger team around an urgent company problem
- turning customer or frontline insights into product or roadmap implications

Use **one important metric** when available.

Do not dump every responsibility.

Bad:

> I worked across strategy, GTM, product, technology, partnerships, operations, finance, and people.

Better:

> As the company scaled, I worked directly with the CEO to build the operating structure connecting company priorities to initiatives, owners, metrics, and execution, which helped grow annual revenue roughly sixfold over two years.

The second sentence proves several competencies at once and gives the reader something memorable.

## Paragraph 4 — Why this stage / conversation close

Return to the company and make the motivation specific.

The best close usually does one or more of these:

- explains what the candidate wants to be close to in this stage of the company
- names the messy, cross-functional work they want to own
- shows that the role’s ambiguity is part of the attraction
- creates a natural reason to talk

Avoid generic closes such as:

- “Thank you for your consideration.”
- “I look forward to the opportunity to discuss how my skills align with your needs.”
- “I am confident I would be a valuable addition to your team.”
- “I am excited to contribute to your mission.”

A better close feels conversational and confident:

> If that is how the role actually works at [Company], I would really like to talk.

Do not force this exact sentence. Use the underlying behavior.

# 5. Evidence density rules

A cover letter should contain enough evidence to establish credibility, but not enough to become a resume.

Default target:

- **1 primary proof story**
- **1 strong metric**
- optionally **1 short secondary example** if it materially strengthens the argument

If the letter contains more than three separate accomplishments, ask whether it has become a resume recap.

Each factual career claim must earn its place by supporting the central argument.

# 6. Company research rules

Research can strengthen a cover letter, but only when it changes the argument.

**Opening research trigger:** if the JD and existing application materials do not provide enough company-specific material to create an opening that passes the Opening Thesis Gate, research the company before drafting. Look for evidence that reveals how the company actually delivers its product or service, what has changed recently, what customers hire it to accomplish, how its technical or commercial model differs from competitors, or where the target role sits in that mechanism. Research is not required when the JD itself provides a strong distinctive opening. It becomes required when the alternative would be a generic category-level introduction.

When current company facts, product changes, funding, leadership, partnerships, or market moves materially affect the argument, verify them using current sources rather than relying on stale memory. Distinguish JD-provided facts from outside research, and do not include a researched detail unless it improves the cover letter's reasoning.

Useful research includes:

- a funding round that changes the company’s scaling problem
- a recent product launch that creates a new operating challenge
- a customer segment expansion
- a new market or partnership
- a company-stage transition
- a product mechanism relevant to the candidate’s point of view

Do not name-drop research merely to prove research happened.

Weak:

> Congratulations on your recent Series A.

Stronger:

> The Series A makes the role particularly interesting because the company is entering the point where decisions that once lived naturally inside a small founder group need enough structure to remain visible without slowing the company down.

If a recent milestone does not improve the argument, omit it.

# 7. JD alignment rules

Use the JD to understand the hiring problem, not to stuff keywords into the letter.

The cover letter should naturally reflect the role’s central language where truthful, but it does not need ATS-level keyword saturation.

Prioritize the role’s top 3–4 themes.

Examples:

- company strategy
- cross-functional execution
- GTM
- product insights
- board/investor materials
- strategic partnerships
- customer feedback
- planning and prioritization

Do not mechanically repeat the JD’s full responsibility list.

# 8. Formatting rules

When exporting a formal cover letter document:

- one page maximum
- 10–12 pt readable body font
- standard margins, approximately 0.75–1 inch
- match the resume’s visual language when practical
- use the same name/contact header style as the candidate's resume
- use the candidate's own website as a real clickable hyperlink in the header, when they have one, unless they explicitly request otherwise
- include the date if a traditional cover-letter document format is being used
- use a specific hiring manager name when known
- otherwise use a natural team salutation such as `Dear [Company] team,`
- never use `To Whom It May Concern`

Formatting should support the writing, not become decorative.

# 9. What to cut

Delete or rewrite any sentence that exists only to sound polished.

Common cuts:

- background summaries the resume already proves
- generic enthusiasm
- long lists of functions the candidate has touched
- repeated claims of being strategic, curious, collaborative, gritty, adaptable, or action-oriented
- generic mission alignment
- defensive explanations of title, seniority, education, industry gaps, or nontraditional background
- closing gratitude paragraphs that add no information

A strong cover letter usually improves when 15–25% of the first draft is removed.

## Cover-letter throat clearing

Do not use introductory constructions whose primary function is to announce interest or establish that the candidate has read the job description.

Default banned opening constructions include:

- “What interests me about [Company]...”
- “What attracted me to [Company]...”
- “What caught my attention about...”
- “I was drawn to...”
- “I am particularly interested in...”
- “The thing that stands out to me about...”
- “[Company]'s [role/product/mission] is interesting because...”
- “This role caught my attention because...”
- “I have spent much of my career...”
- “Throughout my career...”
- “In my experience...” when used only as setup rather than as a necessary boundary for a specific observation

These phrases may occasionally appear later in a letter when natural, but they should not be used to manufacture an opening.

**Do not tell the reader that something is interesting. Show the specific observation that made it interesting.**

# 10. Candidate voice requirements

Apply `voice_skill.md` in the Default Voice.

In particular:

- no em dashes
- no canned AI opening
- no conventional cover-letter throat clearing
- no generic business hype
- no “Here’s why this matters” style transitions
- no symmetrical three-point paragraph structures unless genuinely necessary
- no mini-essay tone when plain language works
- vary sentence length naturally
- use concrete operating nouns and verbs
- explain mechanisms
- stop when the point is made

A successful letter should sound like the candidate has thought about the company, not like an AI has optimized a cover letter.

# 10A. Cover-letter anti-slop hard gate

Cover letters are especially vulnerable to polished-looking slop because the format encourages compression, persuasion, and professional cadence. Apply the **sentence-level anti-slop standard from `voice_skill.md`** before scoring the letter.

A letter does **not** pass simply because the paragraph sounds smart, has a metric in it, or is company-specific. Judge each sentence independently.

## Reject these sentence shapes

### 1. Slogan or aphorism instead of a point

Do not use punchy fragments, slogan pairs, or contrast lines whose main job is to sound insightful.

Examples of shapes to reject:

- "Execution is the strategy."
- "Speed creates trust, not just efficiency."
- "This is not a tooling problem. It is an operating-model problem." when the distinction has not been demonstrated.
- "The opportunity is clear: move faster, align better, scale smarter."

A concise line is fine when it states a concrete, testable distinction or decision. The issue is rhetoric substituting for reasoning.

### 2. Buzzword stack or empty implication

Do not stack adjectives or abstractions as if they constitute an argument.

Reject phrases such as:

- "cross-functional, AI-enabled, outcome-driven transformation"
- "unlock durable value across the organization"
- "create scalable alignment and operational leverage"
- "drive meaningful impact" without naming the measurable or observable impact

If the sentence uses a broad term such as alignment, scale, transformation, enablement, leverage, value, impact, or strategy, the surrounding words must make the object and mechanism clear.

### 3. Unsupported tail attached to good evidence

A real metric does not validate the clause that follows it.

Reject constructions like:

> We grew services revenue significantly, proving that the organization was ready for a new era of scalable execution.

The metric is supportable. The tail is not. Keep the metric and state the actual mechanism the candidate changed.

### 4. Process presented as a reason

"We aligned cross-functionally," "after stakeholder review," or "through close collaboration" does not explain why a decision was made or why an outcome followed.

Name the deciding constraint, evidence, customer signal, acceptance criterion, operating gap, or tradeoff when the reasoning matters.

### 5. Jargon-dense method claims

Do not compress a plausible mechanism into a sentence made mostly of abstractions.

Prefer naming what moved, changed, waited, failed, was routed, was approved, or was measured. Accurate technical language is fine when it makes the mechanism more precise.

### 6. Generic framing and canned conclusions

Delete:

- category-level scene-setting before the company-specific point
- paraphrases of the job description before the candidate's actual observation
- "this role represents an opportunity to..."
- "this combination positions me to..."
- generic gratitude or future-success endings
- recap paragraphs that restate the opening thesis

## Positive standard for a cover-letter sentence

A useful sentence should do at least one of these:

- state a company-specific observation the reader can evaluate
- explain a mechanism or consequence
- name a real constraint, decision, or tradeoff
- provide a sourced or Career-Journey-supported fact, metric, or example
- connect the candidate's evidence to the hiring problem without overstating causality
- move the reader naturally from one necessary part of the argument to the next

Dense sentences are allowed. Technical sentences are allowed. Specific numbers are encouraged. The problem is not density; it is language that cannot be checked, challenged, or tied to a concrete meaning.

## Mixed-sentence rule

If a sentence contains one strong factual clause and one vague or slogan-like clause, the sentence fails. Split it, keep the factual part, and rewrite or delete the weak part.

## Hard-gate behavior

Before the 10-point rubric is applied, perform a sentence-by-sentence pass for the four voice slop categories:

1. formulaic / slogan-like rhetoric
2. vague, inflated, or unsupported substance
3. wordy, jargon-filled, or indirect language
4. unnecessary framing, repetition, or structure

**Any unresolved anti-slop flag blocks delivery**, even if the letter would otherwise score 8.5/10 or higher. Rewrite the flagged sentence or remove it, then re-run the gate.

# 11. Cover Letter Quality Rubric

Score the final letter out of 10 before delivering it.

When the candidate asks to **analyze or improve an existing cover letter**, score the supplied draft first using this same rubric. Give the overall score, identify the 2–4 changes most likely to improve interview interest, and distinguish strategic problems (weak hook, generic point of view, poor proof selection) from sentence-level voice problems. If they ask for a rewrite, revise toward 8.5+ rather than merely polishing the existing structure.

## 1. Opening quality — 0 to 1.5 points

**1.5:** The first 1–2 sentences immediately establish a specific observation, tension, consequence, or point of view that creates curiosity and could not plausibly open a cover letter for several other companies.

**0.75:** Relevant and reasonably specific, but still resembles conventional cover-letter setup language.

**0:** Generic interest statement, JD paraphrase, background introduction, or interchangeable company hook.

**HARD GATE:** A letter scoring below **1.0** on Opening Quality cannot be delivered regardless of its total score. Rebuild the opening rather than wordsmithing it.

## 2. Company specificity — 0 to 1.5 points

**1.5:** The argument is grounded in mechanisms, customers, business realities, or operating conditions that are genuinely specific to this company or its version of the role.

**0.75:** Company-specific details are present, but the core argument could transfer to several similar companies.

**0:** Personalization depends mostly on inserting the company name, product name, or JD language into transferable prose.

## 3. Distinctive point of view — 0 to 1.5 points

**1.5:** The candidate explains the business/role through a useful, non-obvious operating mechanism that makes the reader think differently.

**0.75:** Shows thoughtful understanding but not a particularly distinctive reframe.

**0:** Merely repeats the JD.

## 4. Evidence quality — 0 to 2 points

**2.0:** One or two specific, relevant stories with clear action and outcome; at least one strong metric when available.

**1.0:** Relevant experience is referenced but mostly as responsibilities or scope.

**0:** Generic claims with little proof.

## 5. Motivation credibility — 0 to 1.5 points

**1.5:** The reader can clearly understand why the candidate wants this exact work at this exact stage without the candidate needing to defend their background.

**0.75:** Motivation is stated but partially generic.

**0:** Motivation feels unexplained or opportunistic.

## 6. Voice / human quality — 0 to 1 point

**1.0:** Sounds distinctly like the candidate; low AI-suspicion profile; natural sentence rhythm; no canned cover-letter or professional-writing language; no unresolved slogan-like, unsupported, jargon-heavy, or inflated sentences.

**0.5:** Professional but conventional in places, or contains one sentence that feels packaged rather than reasoned even after the anti-slop pass.

**0:** Sounds generated, formulaic, corporate, or relies on slogans, buzzword stacks, unsupported implications, or manufactured rhythm.

## 7. Compression / readability — 0 to 1 point

**1.0:** Every paragraph earns its place, one-page length, no repetition, easy to read quickly, and uses no unnecessary scene-setting, meta-framing, recap, or decorative structure.

**0.5:** Slightly long, repetitive, or contains avoidable setup that delays the point.

**0:** Bloated, over-structured, repetitive, or difficult to scan.

### Quality thresholds

- **9.0–10:** exceptional; submit
- **8.5–8.9:** strong enough to submit; only revise if there is a clear improvement
- **8.0–8.4:** good but not distinctive enough; revise
- **7.0–7.9:** competent but conventional; significant revision needed
- **below 7:** do not deliver

Default target: **8.5–9.0+**. The numeric score is evaluated only after the Opening Thesis Gate and Cover-letter Anti-Slop Hard Gate both pass.

# 12. Required final self-edit

Before delivering, run the **First-Sentence Test** before the rest of the checklist. Read only the first sentence, without the rest of the letter, and ask:

- Would the candidate themselves keep reading?
- Does this sentence contain an actual idea, or is it setting up an idea?
- Would a hiring manager learn anything from it?
- Is the sentence true because the candidate has observed something, or merely polished because they are applying for a job?
- Could the same grammatical construction plausibly appear in 100 other cover letters?
- If the company name were removed, would the sentence become empty?

If the first sentence is throat clearing, **delete it** and test whether sentence two is the real opening. If not, rebuild the opening.

Then ask:

- Could the first paragraph be sent unchanged to three companies in the same category? If yes, rebuild it.
- Is company specificity carried by an actual mechanism rather than proper nouns?
- Does the first paragraph reveal something about the company’s real operating problem and create a reason to read paragraph two?
- Does the letter explain how the candidate thinks, not just what they have done?
- Is there one proof story strong enough to remember?
- Is there at least one metric when the Career Journey supports one?
- Did I accidentally turn the resume into prose?
- Did I create an objection by talking about overqualification, title regression, industry gaps, education, or consulting availability unnecessarily?
- Does the company research materially strengthen the argument, or is it name-dropping?
- Is the role’s actual hiring problem visible in the letter?
- Does the closing create a reason to have a conversation?
- Can I cut another 10–15% without losing meaning?
- Does it fit comfortably on one page?
- Is the score at least 8.5/10?
- Does any sentence read like an aphorism, slogan, tagline, or "insight line" that asserts more than it explains?
- Does any benefit, causal claim, or recommendation lack a concrete mechanism, source, constraint, or observable result?
- Is any metric followed by a vague atmospheric or promotional clause that the metric does not actually support?
- Is any sentence carrying stacked abstractions or jargon where a direct subject and verb would be clearer?
- Did I use process words such as aligned, collaborated, reviewed, or partnered when the real reason or deciding evidence should be named?
- Did I add scene-setting, meta-framing, a recap, or a polished closing that can be deleted without losing the argument?
- Does each paragraph use only the structure needed to make the hiring decision easier?

If the score is below 8.5 **or any anti-slop flag remains**, revise before delivering.

# 13. Anti-pattern examples

## Generic opening

Avoid:

> I am excited to apply for the Chief of Staff role at [Company]. With more than 10 years of experience in strategy and operations, I believe I am well qualified to contribute to your growing team.

Why it fails:

- resumes the candidate before discussing the company
- sounds like thousands of other letters
- gives the reader no reason to continue

## Resume inventory

Avoid:

> In my previous role I worked across company strategy, GTM, product, operations, partnerships, finance, people, and technology.

Why it fails:

- lists functions without mechanism
- duplicates the resume
- difficult to remember

## Defensive seniority explanation

Avoid:

> I realize I have already held a more senior title, but I am still very interested in this opportunity.

Why it fails:

- introduces overqualification as a problem
- forces the reader to evaluate title regression
- makes the candidate sound defensive

## Generic close

Avoid:

> Thank you for your time and consideration. I look forward to the opportunity to discuss how my experience can contribute to your continued success.

Why it fails:

- no personality
- no additional information
- interchangeable across every application

# 14. Strong-cover-letter test

A successful cover letter should leave the reader with three reactions:

1. **They understand the problem we are actually solving.**
2. **They have operated inside something similar and can prove it.**
3. **I want to hear how they think about this in a conversation.**

If the letter only produces “they seem qualified,” it is not finished.
