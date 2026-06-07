# AI Usage Report

This document records how generative AI tools were used in the **KENTECHTIME**
project, and how the team validated, modified, and integrated the AI outputs.

> Core principle: AI was used as a **development partner**. The team takes full
> responsibility for problem definition, system design, code validation,
> debugging, integration, and explanation. Every member can explain the code
> they were responsible for.

---

## 1. AI Tools Used

| Tool | Primary use |
|------|-------------|
| **Claude (Anthropic)** | System design, recommendation-algorithm logic, code review & refactoring, documentation drafts |
| **ChatGPT / GPT** | Component/API boilerplate generation, error-message debugging, SQL schema design support |
| **GitHub Copilot** | In-editor autocompletion (repetitive code, JSX markup) |
| **OpenAI API (`gpt-5-mini`)** | **Runtime feature** &mdash; converts a user's natural-language timetable-edit request into a structured JSON intent (`/api/chat`) |

> Note: `gpt-5-mini` above is not a development tool but an **LLM feature embedded
> in the service**. It is called through an internal gateway
> (`factchat-cloud.mindlogic.ai`).

---

## 2. Tasks Supported by AI

- Brainstorming the project idea (complexity of KENTECH graduation requirements &rarr; an automation service)
- Generating initial React components / Next.js App Router structure
- Assisting the **Express &rarr; Next.js Route Handlers migration**
- Reviewing the Supabase (PostgreSQL) schema and migrations
- Helping implement the Google OAuth + JWT authentication flow
- Discussing the filter / sort / conflict-check logic of the recommendation algorithm
- Debugging API connection, CORS, and token-verification errors
- Drafting the README and documentation structure
- Outlining the presentation

---

## 3. Example Prompts

1. *"How should I model the data and design the recommendation algorithm to
   express KENTECH graduation requirements (per-area credits, EF sub-areas,
   EL4/5, ESP stages) in code?"*
2. *"Write a JavaScript recommendation function that excludes already-taken
   courses and satisfied areas, and fills credits without time conflicts."*
3. *"Refactor this Next.js Route Handler so it queries Supabase with the service
   role after verifying a JWT, and returns 401 on auth failure."*
4. *"Design a system prompt that converts natural language like 'remove Thursday
   morning classes' into a JSON intent the recommendation engine can use."*
5. *"Explain why this React state update is not being reflected, and fix it."*

---

## 4. AI Outputs We Modified

| What AI generated/suggested | What the team modified/extended |
|---|---|
| A simple recommender (only filters unmet mandatory courses) | Added **per-category requirement checks** + **EF sub-areas (Math/Physics/Chem/DL)** + **admission-year EF Math branching** + **ESP stage enforcement** + **EL4/5 prioritization** |
| `gpt-4o-mini` sample code | Replaced with the internal gateway + **`gpt-5-mini`**, extended into a **2-pass call** (intent parsing &rarr; course-detail enrichment) |
| A basic LLM system prompt | Injected the **full KENTECH requirement track rules** and designed 5 `action` types (remove/add/replace/filter/chat) |
| Default classification of AP / exchange courses | Found misclassification &rarr; parser auto-classifies **AP&rarr;EF, exchange&rarr;FR** + added an AP guard in `resolveCategory` |
| Account-deletion API | FK constraint caused a 500 &rarr; fixed by **deleting child-table rows before the user** |
| Settings upsert | Missing columns (`prefer_compact`, `esp_start_level`) failed the whole upsert &rarr; added a migration + failure alert |
| Trusting raw LLM output | LLM hallucination risk &rarr; **time conflicts, credit caps, and requirement checks are verified 100% by deterministic code**; the LLM only does "intent parsing" |

---

## 5. Core Files We Can Explain

| File | Can explain | Role |
|------|-------------|------|
| `lib/server/recommender.js` | Hyundam Park | Analyzes completed courses & requirements &rarr; generates Plans A/B/C (core algorithm) |
| `app/api/chat/route.js` | Wooseong Kwon | Natural language &rarr; LLM JSON intent, 2-pass call, timetable editing |
| `app/api/courses/requirements/route.js` | Hyundam Park | Per-area/sub-area earned-credit calculation, admission-year EF Math requirement |
| `lib/server/auth.js` / `googleVerify.js` | Wooseong Kwon | JWT issuing/verification, Google id_token verification |
| `lib/gradeParser.js` / `public/bookmarklet.js` | Wooseong Kwon | Portal grade & course-offering parsing, auto-classification |
| `components/Timetable/` | Mingi Kang | Timetable grid rendering, block merging, conflict-swap UI |
| `components/Dashboard/` | Hyundam Park | Graduation-requirement donut & per-area gauges |
| `lib/store.js` / `lib/api-client.js` | Hyeongjun Koo | Zustand global state, axios + Bearer-token injection |

---

## 6. What We Learned

- **AI-generated code cannot be used as-is.** For domain-heavy parts like
  graduation requirements, we had to validate and correct AI drafts against the
  official handbook to get them right.
- **LLMs are safe for "translation," not "judgment."** Letting the LLM build the
  timetable directly produced time-conflict/credit-overflow hallucinations, so we
  separated intent parsing (LLM) from the actual assembly (code).
- We learned how the **frontend and backend communicate** consistently via REST
  APIs + JWT.
- **The danger of unverified AI code**: AP misclassification and FK-constraint
  violations were things AI missed, which we found and fixed by testing with real data.
- A good project must show not only functionality but also **reasoning,
  validation, and communication**.

---

## 7. Attribution

- KENTECH 2026 Spring academic handbook (source of graduation-requirement rules)
- School-provided course-offering list (xlsx)
- OpenAI API (accessed via internal gateway)
- Open-source libraries: Supabase, Next.js, React, Zustand, Recharts (licenses respected)
