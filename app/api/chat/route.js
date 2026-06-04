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

  const supabase = getSupabaseAdmin();
  const latestSemester = await getLatestSemester(supabase);
  const { data: allCourses } = await supabase
    .from('courses')
    .select('id, code, name, credits, track, category, timeslots')
    .eq('semester', latestSemester);

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

  const systemPrompt = `당신은 KENTECH 시간표 추천 도우미입니다. 아래 정보를 바탕으로 사용자의 요청을 분석하세요.

[현재 시간표]
${scheduleText}

[전체 개설 과목 목록]
${courseListText}

[ESP 필수 트랙 안내]
ESP(English for Special Purposes)는 비록 0학점이지만 KENTECH 졸업을 위해 반드시 완료해야 하는 필수 트랙입니다.
입문(ES1001 듣기·ES1002 말하기) → 중급(ES2001 듣기·ES2002 말하기) → 고급(ES3001 듣기·ES3002 말하기) 순서로
모두 이수해야 하며, 건너뛰거나 생략할 수 없습니다.
사용자가 ESP 과목 제거나 생략을 요청하면, 졸업 필수 트랙임을 명확히 안내하고 action을 "chat"으로 처리하세요.

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
  "reply": "사용자에게 보여줄 한국어 응답 메시지 1~2문장"
}
action이 "chat"이면 시간표를 변경하지 않고 reply만 반환합니다. 과목 정보 질문, 일반 대화 등에 사용하세요.`;

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: 'https://factchat-cloud.mindlogic.ai/v1/gateway',
    });
    // 이전 대화 히스토리 + 현재 메시지 구성 (system 제외한 user/assistant 메시지만)
    const historyMessages = history
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: message },
      ],
      response_format: { type: 'json_object' },
    });

    let intent;
    try {
      intent = JSON.parse(completion.choices[0].message.content);
    } catch {
      return errorJson('LLM 응답 파싱 실패. 다시 시도해주세요.', 500);
    }

    if (!intent.action) return errorJson('LLM 응답 형식 오류. 다시 시도해주세요.', 500);

    // action이 chat이면 시간표 변경 없이 reply만 반환
    if (intent.action === 'chat') {
      return Response.json({ intent, plans: null, reply: intent.reply });
    }

    // add/remove/replace: 현재 시간표를 기반으로 직접 편집 (전체 재추천 X)
    if (['add', 'remove', 'replace'].includes(intent.action)) {
      let result = [...(currentSchedule || [])];

      // 제거
      if (intent.remove_codes?.length) {
        result = result.filter(c => !intent.remove_codes.includes(c.code));
      }

      // 추가
      if (intent.include_codes?.length) {
        const sem = await getLatestSemester(supabase);
        const { data: toAdd } = await supabase
          .from('courses')
          .select('id, code, name, credits, track, category, timeslots')
          .in('code', intent.include_codes)
          .eq('semester', sem);

        for (const course of (toAdd || [])) {
          if (result.find(c => c.code === course.code)) continue; // 이미 있음
          const conflict = result.some(c => hasTimeConflict(c, course));
          if (!conflict) result.push(course);
        }
      }

      return Response.json({ intent, plans: [result], reply: intent.reply });
    }

    // filter: 전체 추천 엔진 사용
    const maxCredits = intent.max_credits || 21;
    const plans = await generateRecommendations(auth.userId, null, {}, 3, intent, maxCredits);
    return Response.json({ intent, plans, reply: intent.reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    return errorJson('LLM 처리 실패', 500);
  }
}
