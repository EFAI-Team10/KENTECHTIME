# Final Project Task 1: Service Idea & PRD Draft

## 1. Team Information
* **Team Name:** EFAI-Team10
* **Team Members:**
  * **Mingi Kang (강민기):** Google OAuth Authentication, Vercel Deployment, README & Project Documentation.
  * **Hyungjoon Koo (구형준):** Interactive Timetable Grid UI, Graduation Requirement Dashboard.
  * **Wooseong Kwon (권우성):** OpenAI API Integration, LLM Chatbot Interface, Intent Parsing Logic.
  * **Hyundam Park (박현담):** Recommendation Algorithm, PostgreSQL/Supabase Database Schema Design & Optimization.

---

## 2. Service Name
**KENTECHTIME**
*(A customized timetable recommendation and interactive editing web service for KENTECH undergraduate students)*

---

## 3. Product Overview
**KENTECHTIME** is an AI-assisted web service designed to help KENTECH undergraduate students manage their graduation progress and build optimized academic schedules. By analyzing students' credit history against the complex KENTECH graduation guidelines and track-specific prerequisites, KENTECHTIME automatically generates multiple personalized timetable plans. Students can then refine these plans using a natural language chat assistant powered by an LLM (Large Language Model) that dynamically adjusts their schedule in real-time.

---

## 4. Target Users
* **Primary Target:** KENTECH undergraduate students (restricted to users with official `@kentech.ac.kr` Google Workspace accounts).
* **Detailed User Groups:**
  * **Freshmen and Sophomores:** Students who are unfamiliar with the track curriculum and prerequisite trees (VC, EF, EL) and need automated guidance to select courses aligned with their intended specialization tracks (AI, Materials, Grid, Hydrogen, Climate, Nuclear).
  * **Juniors and Seniors:** Students seeking to fulfill their remaining credit requirements while optimizing their schedule to secure free blocks for lab internships, research, or job preparation.
  * **Lifestyle-focused Students:** Students who want to customize their timetables around personal constraints (e.g., avoiding 9 AM morning classes, creating consecutive day-offs, or setting minimum lunch/gap periods).

---

## 5. Problem or Need
* **Complexity of KENTECH's Graduation Policy:** The undergraduate curriculum at KENTECH features complex requirements, dividing courses into Visionary Course (VC: 8 credits), Engineering Foundation (EF: 28 credits), Energy Literacy (EL: 40 credits), and track-specific sequences. Fulfilling these while tracking prerequisites manually is highly error-prone and stressful for students.
* **Lifestyle Constraint Optimization:** Balancing academic requirements with personal lifestyle needs (e.g., "no morning classes", "keep Friday empty for traveling home") is a difficult constraint-satisfaction puzzle. Students spend hours manually testing various combinations.
* **Rigid Existing Timetable Tools:** Conventional timetable builders are static, requiring manual searching, drag-and-drop actions, and manual conflict resolution if a student wants to adjust their schedule.
* **Lack of Course Demand Visibility:** Students have no way of knowing how popular a course is before the official registration period, leading to unexpected failures to enroll due to high competition.

---

## 6. Core User Scenario
1. **Onboarding & Setup:** Jun-ho, a sophomore majoring in energy engineering, logs into **KENTECHTIME** using his official school Google account. During onboarding, he selects his completed courses and indicates that he wants to focus on the **AI** and **Hydrogen** tracks. He also sets his lifestyle preferences to avoid classes before 10 AM and wants a **Friday-off** schedule.
2. **Reviewing Graduation Progress:** On his dashboard, Jun-ho sees a visual ring chart highlighting that he has completed 16 out of 28 required EF credits, and that he still needs to take 3 more EL credits.
3. **Automated Recommendation:** The system immediately recommends three diverse schedules (Plan A, B, and C) that automatically insert his missing required sophomore courses, align with his chosen tracks, respect prerequisite sequences, and strictly satisfy his lifestyle preferences (no classes before 10 AM, and completely free Fridays).
4. **Conversational Tuning:** Jun-ho reviews Plan A but wants to make one adjustment. Instead of manually searching, he types into the sidebar chat: *"Could you remove the Thursday afternoon class and recommend a HASS course instead?"*
5. **Real-Time Update:** The LLM parses his natural language request, interacts with the recommendation engine to fetch compatible HASS electives, and updates the timetable grid dynamically on the screen.
6. **Saving:** Satisfied with the updated Plan A, Jun-ho saves it as his final schedule. His choice is anonymously registered in the system to update the course demand tracker.

---

## 7. Key Features
* **Feature 1: Graduation Requirement & Track-prerequisite Visualizer**
  * *Description:* A real-time dashboard analyzing the student's academic history. It tracks credit completion against KENTECH graduation standards (VC, EF, EL) and tracks (AI, Grid, Hydrogen, New Materials, Climate, Nuclear). Areas with missing credits are highlighted in red to prompt action, while completed sections appear in blue.
* **Feature 2: Constraint-Satisfying Timetable Generator (Soft & Hard Matching)**
  * *Description:* An algorithmic engine that generates three distinct timetable templates (Plan A/B/C). It handles academic constraints (VC/EF/EL requirements, prerequisite courses) as soft targets and personal lifestyle choices (no morning classes, day-offs, gap times) as hard constraints to prevent any scheduling conflicts.
* **Feature 3: LLM-Powered Conversational Timetable Tuner**
  * *Description:* A chatbot interface integrated with the timetable layout. It leverages an LLM (`gpt-4o-mini`) to understand natural language scheduling instructions (e.g., "swap calculus for physics", "make Tuesday afternoon free") and translates them into structured actions (`remove_codes`, `exclude_days`, `include_codes`) that immediately trigger the recommendation engine to redraw the schedule.
* **Feature 4: Real-Time Course Demand Tracker**
  * *Description:* A dashboard showing simulated course competition ratios. It anonymously aggregates saved schedules from all users and updates course demand statistics in 10-minute batches, highlighting courses on the student's active schedule for easy tracking.

---

## 8. AI Usage Plan
* **In-App AI (Conversational Agent):** The application integrates the OpenAI API (`gpt-4o-mini`) to power the scheduling chatbot. By supplying the LLM with the student's current timetable state, available course lists, and natural language input, the model functions as a structured query transformer. It translates free-form Korean/English text into actionable, structured JSON parameters (e.g., specific course code insertions or day/time exclusions) that can be processed programmatically by the recommender engine.
* **Development AI:** The team uses AI pair programming agents (such as Antigravity and Claude Code) to accelerate database migrations, optimize the relational PostgreSQL schemas on Supabase, and write unit tests for the constraint-satisfaction matching logic.

---

## 9. Page Structure
* **Auth Page (`/auth`):** A modern, minimalistic entry point featuring a secure Google Login button. It enforces domain restriction, only allowing accounts from `@kentech.ac.kr`.
* **Onboarding Page (`/onboarding`):** A guided 3-step setup flow for new users:
  * *Step 1: Profile Setup:* Fills in basic student information (semester, student ID).
  * *Step 2: Completed Courses:* A categorized checklist (VC, EF, EL) to select previously completed classes.
  * *Step 3: Preference Survey:* Fields to choose target tracks and specify lifestyle preferences (day-offs, morning-class avoidance, preferred gap between classes).
* **Main Dashboard Page (`/`):** The core workspace containing:
  * *Top Section:* Visual credit progress charts (Recharts) for graduation requirements.
  * *Left Section:* Interactive weekly timetable grid displaying the active plan (A/B/C toggles).
  * *Right Sidebar:* AI Chatbot window for natural language commands and the live course demand leaderboard.
* **Admin Page (`/admin`):** A restricted administration panel that allows academic staff to upload new semester schedules via Excel files (`개설교과목 리스트.xlsx`), which are parsed and populated into the database.

---

## 10. Development Plan
* **Milestone 1: Database & Routing Setup (Done)**
  * Design PostgreSQL schema with courses, prerequisites, users, and schedules on Supabase.
  * Initialize the Next.js 14 App Router project.
* **Milestone 2: Authentication & Onboarding (Done)**
  * Set up Google OAuth and restrict access to the `@kentech.ac.kr` domain.
  * Implement the 3-step onboarding flow.
* **Milestone 3: Core Algorithm & Interactive UI (Done)**
  * Write the timetable recommendation logic including soft/hard constraint matches.
  * Construct the responsive Weekly Timetable Grid and Recharts Dashboard.
* **Milestone 4: LLM Chat & Tracker Integration (In Progress)**
  * Integrate OpenAI API for natural language intent parsing.
  * Implement the 10-minute demand tracker updates.
* **Milestone 5: Deployment & QA (Expected)**
  * Deploy the unified project to Vercel.
  * Execute comprehensive user testing and address edge cases.
