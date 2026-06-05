import OpenAI from 'openai';
import { requireAuth, errorJson, AuthError } from '@/lib/server/auth';
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { generateRecommendations, getLatestSemester } from '@/lib/server/recommender';

function hasTimeConflict(a, b) {
  for (const sa of (a.timeslots || [])) {
    for (const sb of (b.timeslots || [])) {
      if (sa.day === sb.day && sa.start < sb.end && sb.start < sa.end) return true;
    }
  }
  return false;
}

export async function POST(request) {
  let auth;
  try {
    auth = requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('서버 오류', 500);
  }

  const body = await request.json().catch(() => ({}));
  const { message, currentSchedule, history = [] } = body;

  if (!message?.trim()) return errorJson('메시지를 입력해주세요.', 400);

  const supabase = getSupabaseAdmin();
  const latestSemester = await getLatestSemester(supabase);

  const [{ data: allCourses }, { data: completedRows }] = await Promise.all([
    supabase
      .from('courses')
      .select('id, code, name, credits, track, category, timeslots')
      .eq('semester', latestSemester),
    supabase
      .from('completed_courses')
      .select('course_id, semester, courses(code, name, category)')
      .eq('user_id', auth.userId),
  ]);

  const courseListText = (allCourses || []).length
    ? allCourses.map(c => {
        const slots = (c.timeslots || []).map(s => `${s.day} ${s.start}-${s.end}`).join(', ');
        return `[${c.code}] ${c.name} (${c.category}, ${c.credits}학점, ${c.track || '공통'}) | ${slots || '시간미정'}`;
      }).join('\n')
    : '(개설 과목 데이터 없음)';

  const scheduleText = (currentSchedule || []).length
    ? currentSchedule.map(c => {
        const slots = (c.timeslots || []).map(s => `${s.day} ${s.start}-${s.end}`).join(', ');
        return `[${c.code}] ${c.name} | ${slots}`;
      }).join('\n')
    : '(없음)';

  const completedText = (completedRows || []).length
    ? completedRows
        .filter(r => r.courses)
        .map(r => `[${r.courses.code}] ${r.courses.name} (${r.courses.category})${r.semester && r.semester !== 'imported' ? ` — ${r.semester}` : ''}`)
        .join('\n')
    : '(없음)';

  const systemPrompt = `당신은 KENTECH 시간표 추천 도우미입니다. 아래 정보를 바탕으로 사용자의 요청을 분석하세요.

[기이수 과목 (수강이력)]
${completedText}

[현재 시간표]
${scheduleText}

[전체 개설 과목 목록]
${courseListText}

[KENTECH 졸업요건 트랙 규칙]
총 졸업학점: 128학점 (GR·RC 체육 3종 제외)

VC (Visionary Course): 8학점 필수. 1학년 전용. S/U 평가.
EF (Engineering Foundation): 28학점 필수. 물리4+화학4+DL4 세부 영역 구성. 수학은 22~24학번 4학점, 25학번 이후 8학점. AP 인정학점은 EF로 인정. Letter Grade.
EL (Energy Literacy): 40학점 필수. 전공 과목군 (전기/전자·재료/화학·인공지능 트랙). Letter Grade.
MN (Minerva): 16학점 필수. 1~2학년 각 학기 1과목씩 총 4과목. 능동적 학습 방식.
HASS (인문예술사회과학): 4학점 필수. 3학년 이후 1과목 이상.
ESP (English for Specific Purposes): 졸업 필수 트랙. 각 과목은 0학점이며 입문(ES1001·ES1002) → 중급(ES2001·ES2002) → 고급(ES3001·ES3002) 순서로 반드시 이수. 건너뛰거나 임의 제거 불가. 고급(ES3001·ES3002) 이수 완료 시 4학점 일괄 부여. 사용자가 ESP 과목 제거를 요청하면 필수 트랙임을 안내하고 action을 "chat"으로 처리.
IR (Independent Research): 4학점 필수. 5학기 이수 후 신청 가능(3학년 권장). IR1 이수 후 IR2 신청 가능. IR1·IR2 동일 학기 수강 불가. S/U 평가.
CAPS (Capstone Design): 4학점 필수. 4학년 권장. 팀 프로젝트. Letter Grade.
EN (Entrepreneurship): 4학점 필수. EN1(지식재산과가치창출)·EN2(기업가정신과창업)·EN3(실전창업) 모두 선수과목 없이 수강 가능.
GR (Global Research): 10학점. 졸업 128학점에 미포함. 수강 학기에 타 정규과목(IR 포함) 수강 불가. S/U 평가.
RC (Residential College): 4학점 졸업학점 포함. RC1011·RC1012·RC1013(체육 3종)은 졸업학점 미포함.
FR (Free Elective): 졸업요건 초과 이수 학점, 타대학 학점교류 등. 128학점 채우기 위한 자유 영역.

[action 가이드]
- "remove": 특정 과목만 현재 시간표에서 제거. remove_codes에 해당 코드 지정.
- "add": 특정 과목만 현재 시간표에 추가. include_codes에 해당 코드 지정.
- "replace": 특정 과목 제거 후 다른 과목 추가. remove_codes + include_codes 모두 지정.
- "filter": 조건(요일·시간대·학점 제한 등)으로 시간표를 새로 구성. 전체 추천이 필요할 때만 사용.
- "chat": 시간표 변경 없이 정보 안내만 할 때.

사용자 요청을 분석하여 반드시 아래 JSON 형식으로만 응답하세요:
{
  "action": "remove" | "add" | "replace" | "filter" | "chat",
  "remove_codes": ["제거할 과목코드 배열, 없으면 []"],
  "exclude_days": ["제외할 요일 MON/TUE/WED/THU/FRI, 없으면 []"],
  "exclude_before": "HH:MM 형식 이 시간 이전 수업 제외, 없으면 null",
  "include_codes": ["추가/우선 포함할 과목코드 배열, 없으면 []"],
  "max_credits": 학점 제한 숫자 없으면 null,
  "description_needed": ["상세 설명이 필요한 과목코드 배열. 사용자가 특정 과목 내용·특징·난이도를 물어볼 때만 지정. 없으면 []"],
  "reply": "사용자에게 보여줄 한국어 응답 메시지. 시간표 변경 시 1~2문장, 과목 정보·설명 질문 시 충분히 자세하게."
}
action이 "chat"이면 시간표를 변경하지 않고 reply만 반환합니다.
description_needed에 코드를 넣으면 해당 과목의 상세 설명을 받아 reply를 보완할 수 있습니다.`;

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: 'https://factchat-cloud.mindlogic.ai/v1/gateway',
    });

    // 최근 10개 메시지만 유지 (토큰 폭발 방지)
    const historyMessages = history
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: message },
    ];

    // 1차 LLM 호출
    const firstCompletion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages,
      response_format: { type: 'json_object' },
    });

    let intent;
    try {
      intent = JSON.parse(firstCompletion.choices[0].message.content);
    } catch {
      return errorJson('LLM 응답 파싱 실패. 다시 시도해주세요.', 500);
    }

    if (!intent.action) return errorJson('LLM 응답 형식 오류. 다시 시도해주세요.', 500);

    // description_needed가 있으면 DB에서 가져와 2차 LLM 호출 (최대 5개)
    if (intent.description_needed?.length) {
      intent.description_needed = intent.description_needed.slice(0, 5);
      const { data: descRows } = await supabase
        .from('courses')
        .select('code, name, description')
        .in('code', intent.description_needed);

      const descText = (descRows || [])
        .filter(r => r.description)
        .map(r => `[${r.code}] ${r.name}\n${r.description}`)
        .join('\n\n');

      if (descText) {
        const secondCompletion = await openai.chat.completions.create({
          model: 'gpt-5-mini',
          messages: [
            ...messages,
            { role: 'assistant', content: firstCompletion.choices[0].message.content },
            { role: 'user', content: `[요청한 과목 상세 설명]\n${descText}\n\n위 설명을 참고하여 reply를 보완한 최종 JSON을 응답하세요.` },
          ],
          response_format: { type: 'json_object' },
        });

        try {
          intent = JSON.parse(secondCompletion.choices[0].message.content);
        } catch {
          // 2차 파싱 실패 시 1차 결과 유지
        }
      }
    }

    // action: chat
    if (intent.action === 'chat') {
      return Response.json({ intent, plans: null, reply: intent.reply });
    }

    // action: add/remove/replace — 현재 시간표 직접 편집
    if (['add', 'remove', 'replace'].includes(intent.action)) {
      let result = [...(currentSchedule || [])];

      if (intent.remove_codes?.length) {
        result = result.filter(c => !intent.remove_codes.includes(c.code));
      }

      if (intent.include_codes?.length) {
        const { data: toAdd } = await supabase
          .from('courses')
          .select('id, code, name, credits, track, category, timeslots')
          .in('code', intent.include_codes)
          .eq('semester', latestSemester);

        for (const course of (toAdd || [])) {
          if (result.find(c => c.code === course.code)) continue;
          const conflict = result.some(c => hasTimeConflict(c, course));
          if (!conflict) result.push(course);
        }
      }

      return Response.json({ intent, plans: [result], reply: intent.reply });
    }

    // action: filter — 전체 추천 엔진
    const maxCredits = intent.max_credits || 21;
    const plans = await generateRecommendations(auth.userId, null, {}, 3, intent, maxCredits);
    return Response.json({ intent, plans, reply: intent.reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    return errorJson('LLM 처리 실패', 500);
  }
}
