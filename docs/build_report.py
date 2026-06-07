# -*- coding: utf-8 -*-
"""KENTECHTIME Technical Report PDF generator (English)."""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, ListFlowable, ListItem)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# --- Fonts (Malgun renders both English and Korean fallback) ---
pdfmetrics.registerFont(TTFont('Malgun', 'C:/Windows/Fonts/malgun.ttf'))
pdfmetrics.registerFont(TTFont('MalgunBd', 'C:/Windows/Fonts/malgunbd.ttf'))

OUT = os.path.join(os.path.dirname(__file__), 'KENTECHTIME_Technical_Report.pdf')

NAVY = colors.HexColor('#1f3a5f')
ACCENT = colors.HexColor('#2e7d32')
LIGHT = colors.HexColor('#e8eef5')
GREY = colors.HexColor('#666666')

styles = getSampleStyleSheet()

def S(name, **kw):
    kw.setdefault('fontName', 'Malgun')
    return ParagraphStyle(name, **kw)

title_style = S('T', fontName='MalgunBd', fontSize=24, leading=30,
                textColor=NAVY, alignment=TA_CENTER, spaceAfter=6)
sub_style = S('Sub', fontSize=13, leading=18, textColor=GREY,
              alignment=TA_CENTER, spaceAfter=4)
meta_style = S('Meta', fontSize=10, leading=14, textColor=GREY, alignment=TA_CENTER)
h1 = S('H1', fontName='MalgunBd', fontSize=15, leading=20, textColor=NAVY,
       spaceBefore=16, spaceAfter=8)
h2 = S('H2', fontName='MalgunBd', fontSize=12, leading=16, textColor=ACCENT,
       spaceBefore=10, spaceAfter=4)
body = S('Body', fontSize=10, leading=16, alignment=TA_LEFT, spaceAfter=6)
bullet = S('Bul', fontSize=10, leading=15, leftIndent=6)
small = S('Small', fontSize=9, leading=13, textColor=GREY)
code = S('Code', fontName='Malgun', fontSize=8.5, leading=12,
         backColor=colors.HexColor('#f4f4f4'), borderPadding=6,
         textColor=colors.HexColor('#333333'))

story = []

def para(t, st=body): story.append(Paragraph(t, st))
def gap(h=6): story.append(Spacer(1, h))
def bullets(items, st=bullet):
    story.append(ListFlowable(
        [ListItem(Paragraph(i, st), leftIndent=12, value='•') for i in items],
        bulletType='bullet', start='•', leftIndent=10))

cell_style = S('Cell', fontSize=9, leading=12)
cell_head = S('CellH', fontName='MalgunBd', fontSize=9, leading=12, textColor=colors.white)

def tbl(data, col_widths=None, header=True):
    # wrap every cell in a Paragraph so text wraps within the column width
    wrapped = []
    for r, row in enumerate(data):
        st = cell_head if (header and r == 0) else cell_style
        wrapped.append([c if not isinstance(c, str) else Paragraph(c, st) for c in row])
    t = Table(wrapped, colWidths=col_widths, hAlign='LEFT')
    ts = [
        ('FONTNAME', (0,0), (-1,-1), 'Malgun'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 7),
        ('RIGHTPADDING', (0,0), (-1,-1), 7),
    ]
    if header:
        ts += [('BACKGROUND', (0,0), (-1,0), NAVY),
               ('TEXTCOLOR', (0,0), (-1,0), colors.white),
               ('FONTNAME', (0,0), (-1,0), 'MalgunBd'),
               ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, LIGHT])]
    t.setStyle(TableStyle(ts))
    story.append(t)

# ============ COVER ============
gap(60)
para('KENTECHTIME', title_style)
para('A Graduation-Requirement-Aware Automatic Timetable Recommendation Service for KENTECH Students', sub_style)
gap(10)
para('Introduction to AI Programming &mdash; Final Project Technical Report', meta_style)
gap(30)
tbl([
    ['Team', 'EFAI Team 10'],
    ['Members', 'Mingi Kang, Wooseong Kwon, Hyundam Park, Hyungjoon Koo'],
    ['Deployment', 'https://kentechtime.vercel.app'],
    ['Repository', 'https://github.com/EFAI-Team10/KENTECHTIME'],
    ['Tech Stack', 'Next.js 14 / React 18 / Supabase (PostgreSQL) / OpenAI API'],
    ['Date', '2026-06-07'],
], col_widths=[35*mm, 120*mm], header=False)
story.append(PageBreak())

# ============ 1. Introduction ============
para('1. Introduction', h1)
para('KENTECHTIME is a <b>graduation-requirement-aware automatic timetable '
     'recommendation web service</b> for undergraduate students at the Korea '
     'Institute of Energy Technology (KENTECH). When a student enters their '
     'completed-course history and preferences, the service analyzes the remaining '
     'graduation requirements and automatically generates candidate timetables for '
     'the upcoming semester as Plan A / B / C. The project aims to experience an '
     'AI-assisted ("vibe coding") development workflow, while the team takes full '
     'responsibility for problem definition, system design, code validation, '
     'debugging, integration, and explanation.')

# ============ 2. Problem Definition ============
para('2. Problem Definition', h1)
para('KENTECH graduation requirements are complex: beyond per-category credits, '
     'they include EF sub-areas (Math, Physics, Chemistry, DL), EL4/5 upper-level '
     'courses, sequential ESP stages, and admission-year-dependent requirements. '
     'Every semester, students had to manually cross-reference the requirement '
     'sheet and the course-offering site to figure out "which requirement does '
     'this course satisfy?" This process is time-consuming and error-prone.')
gap(2)
tbl([
    ['Problem', 'How the service solves it'],
    ['Complex requirement calculation', 'Dashboard visualizing requirements from completed-course history'],
    ['"What should I take to graduate?"', 'Auto recommendation using unmet requirements and preferences'],
    ['Tedious manual timetable assembly', 'Copy a recommendation, edit in My Timetable, click to swap conflicts'],
    ['Wanting to edit in natural language', 'LLM conversational editing ("remove Thursday morning classes")'],
], col_widths=[62*mm, 93*mm])

# ============ 3. Target Users ============
para('3. Target Users and User Scenario', h1)
para('<b>Target users:</b> KENTECH undergraduate students with an @kentech.ac.kr '
     'Google account.')
gap(2)
para('New-user scenario', h2)
bullets([
    'Sign in with an @kentech.ac.kr Google account',
    'Onboarding: name, student ID, semester index, completed courses, and preferences (track, max credits, last semester, gap minimization, ESP start level)',
    'Enter the main page &rarr; view graduation-requirement status and recommended timetables A/B/C',
])
para('Returning-user scenario', h2)
bullets([
    'Copy a preferred timetable among recommendations A/B/C',
    'Paste into the My Timetable tab and edit (add/remove, click to swap on conflict)',
    'Save and confirm &rarr; reflected in the course-demand competition tracker',
    'Optionally edit via AI chat in natural language',
])

# ============ 4. Service Features ============
para('4. Service Features', h1)

para('Design rationale', h2)
para('Before the feature list, this subsection explains <b>why</b> the system is '
     'designed this way and <b>why</b> each choice is useful for the target users '
     '(KENTECH undergraduates) described in Section 3.', body)
tbl([
    ['Design decision', 'Why (rationale for the target user)'],
    ['Recommend from graduation requirements, not raw course search',
     'Students struggle most with "which requirement does this course satisfy?" Encoding the rules (per-area credits, EF sub-areas, EL4/5, ESP stages, admission-year branching) removes the manual cross-referencing that is the real pain point.'],
    ['LLM parses intent only; deterministic code makes all judgments',
     'A timetable with a time conflict or a credit overflow is useless to a student. By letting the LLM only translate language into a JSON intent and having code verify conflicts/credits/requirements, the service never produces an invalid timetable, which builds trust.'],
    ['Return three plans (A/B/C) instead of one',
     'Course selection is a personal trade-off (track, morning load, gaps). Offering distinct alternatives lets the student choose rather than accept a single opaque answer.'],
    ['Visual requirement dashboard (donut + gauges)',
     'Reduces the cognitive load of reading a dense requirement sheet, so a student can see at a glance what is left to graduate.'],
    ['Preference settings (track, max credits, compact, last semester)',
     'Recommendations must fit each student\'s situation; preferences personalize the result without requiring manual timetable assembly.'],
    ['Unified Next.js stack + Supabase + OAuth',
     'A single framework for UI and API simplifies the data flow and JWT auth; Supabase provides a managed PostgreSQL so the small team can focus on domain logic; @kentech.ac.kr OAuth restricts the service to real KENTECH students.'],
], col_widths=[52*mm, 103*mm])
gap(4)
para('Core features', h2)
tbl([
    ['Feature', 'Description'],
    ['Auth / Onboarding', 'Google OAuth (@kentech.ac.kr) + JWT; semester index auto-maps to grade; completed-course & preference input'],
    ['Requirement Dashboard', 'Per-area earned/required credits as donut & gauges; EF sub-areas, EL4/5, ESP stages'],
    ['Timetable Recommendation', 'Auto-generates Plan A/B/C from unmet requirements and preferences'],
    ['My Timetable', 'Copy, edit, multi-create, save, rename, confirm; click-to-swap conflicting courses'],
    ['Demand Tracker', 'Competition ratio vs. capacity based on confirmed timetables'],
    ['AI Conversational Edit', 'LLM converts a natural-language request into a JSON intent and edits the timetable'],
    ['UX', 'Dark mode + 9 color themes, mobile responsive'],
], col_widths=[40*mm, 115*mm])
gap(4)
para('Service flow: from user input to AI processing to final output', h2)
para('<b>(A) Recommendation flow.</b> (1) <b>Input</b> &mdash; the student provides '
     'completed courses (via portal import or manual selection) and preferences '
     '(track, max credits, compact, last semester). (2) <b>Processing</b> &mdash; '
     'the client calls POST /api/schedule/recommend; the server analyzes earned '
     'credits per requirement, filters out completed and already-satisfied '
     'courses, sorts by grade and preferred track, then assembles conflict-free '
     'timetables under the credit cap. (3) <b>Output</b> &mdash; three distinct '
     'plans (A/B/C) are returned and rendered next to the requirement dashboard.', body)
para('<b>(B) AI conversational-edit flow.</b> (1) <b>Input</b> &mdash; the student '
     'types a natural-language request such as "remove Thursday morning classes." '
     '(2) <b>AI processing</b> &mdash; POST /api/chat sends the message together with '
     'the current timetable, offered courses, and requirement rules to gpt-5-mini, '
     'which returns a structured JSON intent (action + target codes/days); a second '
     'LLM call enriches the reply when course details are requested. (3) '
     '<b>Output</b> &mdash; deterministic code applies the intent (direct edit for '
     'add/remove/replace, or re-running the engine for filter) and returns the '
     'updated timetable with a natural-language reply.', body)
para('<b>(C) Confirm &amp; track flow.</b> The student copies a plan into My '
     'Timetable, edits and saves it, then confirms it; confirmed timetables feed the '
     'demand tracker, which shows the competition ratio against each course\'s capacity.', body)

# ============ 5. System Architecture ============
para('5. System Architecture', h1)
para('The client (Next.js / React) calls Next.js Route Handlers (server API) '
     'through an axios-based api-client that injects a Bearer JWT. The server '
     'verifies the JWT, then accesses PostgreSQL via Supabase (service role), and '
     'runs the recommendation logic (recommender.js), the LLM integration (OpenAI '
     'API), and Google OAuth verification.')
gap(2)
para('Data flow (login &rarr; data request)', h2)
para('(1) User signs in with Google &rarr; (2) the id_token is sent to '
     '/api/auth/google &rarr; (3) the server verifies the id_token with Google '
     '&rarr; (4) checks registration in Supabase &rarr; (5) issues a JWT (or routes '
     'to onboarding if new) &rarr; (6) all subsequent API calls attach the Bearer '
     'JWT &rarr; (7) requireAuth validates it and queries via service role &rarr; '
     '(8) the result is returned.', body)
gap(2)
para('Main directories', h2)
story.append(Paragraph(
    'app/ (pages + api/ Route Handlers) - components/ (Dashboard, Timetable, Chat, '
    'Tracker) - lib/server/ (recommender, auth, googleVerify, supabase, parser) - '
    'database/ (schema + migrations) - public/bookmarklet.js', code))

# ============ 6. Implementation Details ============
para('6. Implementation Details', h1)
para('Core file: lib/server/recommender.js (timetable recommendation engine)', h2)
para('The entry function generateRecommendations() performs the following steps in order.', body)
tbl([
    ['Step', 'Function', 'Role'],
    ['1', 'getCompletedInfo', 'Aggregate completed courses into earned credits per category'],
    ['2', 'getRequiredCourses', 'Keep only unmet + still-required courses (mandatory / elective)'],
    ['3', 'applyIntent', 'Apply the LLM-parsed intent (add/remove courses, exclude days)'],
    ['4', 'sortByGradeAndTrack / bumpEL45', 'Sort by my grade, preferred track, required EL first'],
    ['5', 'buildPlan', 'Assemble a timetable checking time conflict, credit cap, category cap'],
    ['6', 'loop (n=3)', 'De-prioritize used courses to produce distinct Plans A/B/C'],
], col_widths=[14*mm, 62*mm, 79*mm])
gap(4)
para('Key design decision: the LLM only "translates" natural language into a JSON '
     'intent, while all "judgments" &mdash; time conflicts, credit overflow, '
     'requirement checks &mdash; are performed by deterministic code. This '
     'fundamentally prevents invalid timetables caused by LLM hallucination.')
gap(2)
para('Core conflict-check logic (hasTimeConflict)', h2)
story.append(Paragraph(
    'if (a.day === b.day &amp;&amp; a.start &lt; b.end &amp;&amp; b.start &lt; a.end) '
    'return true;  // overlap on the same day = conflict', code))
gap(4)
para('LLM integration: app/api/chat/route.js', h2)
para('Together with the user message, the system prompt injects the completed-course '
     'history, current timetable, all offered courses, and the KENTECH requirement '
     'track rules, then calls gpt-5-mini in JSON mode. After parsing the intent '
     '(action: remove / add / replace / filter / chat), if course details are '
     'needed it issues a second LLM call to enrich the reply. add/remove/replace '
     'edit the current timetable directly, while filter re-runs the recommendation engine.')

# ============ 7. AI-Assisted Development ============
para('7. AI-Assisted Development Process', h1)
para('Claude, ChatGPT, and GitHub Copilot were used as development assistants, and '
     'the OpenAI API (gpt-5-mini) was used as a runtime LLM feature. AI helped with '
     'component/API scaffolding, the Express-to-Next.js migration, schema design, '
     'debugging, and documentation drafts. See AI_USAGE.md for representative '
     'prompts and the full list of modifications.', body)
gap(2)
para('Representative cases we modified and validated', h2)
bullets([
    'Simple recommender &rarr; extended with per-category / EF sub-area / admission-year / ESP stage / EL4-5 logic',
    'Found AP & exchange-credit misclassification &rarr; parser auto-classifies AP&rarr;EF, exchange&rarr;FR',
    'LLM hallucination risk &rarr; separated intent parsing (LLM) from timetable judgment (code)',
    'Account-deletion FK violation (500) &rarr; fixed by deleting child rows first',
])

# ============ 8. Testing ============
para('8. Testing and Demonstration', h1)
bullets([
    'Validated recommendations with real KENTECH course-offering xlsx data (no time conflicts, credit caps respected)',
    'Verified admission-year EF Math branching (4 cr. before 2025 / 8 cr. from 2025)',
    'End-to-end check: Google OAuth login &rarr; onboarding &rarr; recommend &rarr; save/confirm &rarr; tracker',
    'Live demo of AI natural-language editing ("remove Thursday morning classes")',
    'Visual check of mobile responsiveness, dark mode, and 9 color themes',
])

# ============ 9. Discussion ============
para('9. Discussion and Future Improvements', h1)
para('Limitations', h2)
bullets([
    'Recommendation uses a greedy (priority-ordered) approach and does not guarantee a globally optimal combination',
    'Course offerings and capacities depend on school-provided files',
    'LLM calls incur cost and latency and are affected by network conditions',
])
para('Future directions', h2)
bullets([
    'Adopt constraint-satisfaction (CSP) / optimization techniques to improve recommendation quality',
    'Integrate real-time enrollment data and enhance demand prediction',
    'Strengthen recommendation rationale (which requirement is satisfied) and learn from user feedback',
])

# ============ 10. References ============
para('10. References', h1)
bullets([
    'KENTECH 2026 Spring academic handbook (source of graduation-requirement rules)',
    'School-provided course-offering list (xlsx)',
    'Official docs of Next.js, React, Zustand, Recharts, Supabase',
    'OpenAI API documentation (accessed via internal gateway)',
])

doc = SimpleDocTemplate(OUT, pagesize=A4,
                        topMargin=20*mm, bottomMargin=18*mm,
                        leftMargin=20*mm, rightMargin=20*mm,
                        title='KENTECHTIME Technical Report',
                        author='EFAI Team 10')

def footer(canvas, d):
    canvas.saveState()
    canvas.setFont('Malgun', 8)
    canvas.setFillColor(GREY)
    canvas.drawCentredString(A4[0]/2, 10*mm, f'KENTECHTIME - EFAI Team 10 - {canvas.getPageNumber()}')
    canvas.restoreState()

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print('OK ->', OUT)
