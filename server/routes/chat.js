const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const authMiddleware = require('../middleware/auth');
const db = require('../models/db');
const { generateRecommendations } = require('../utils/recommender');

// POST /api/chat
router.post('/', authMiddleware, async (req, res) => {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: 'https://factchat-cloud.mindlogic.ai/v1/api/openai',
  });
  const { message, currentSchedule, semester } = req.body;

  try {
    // 전체 개설 과목 조회
    const coursesResult = await db.query(
      `SELECT id, code, name, credits, track, category, timeslots
       FROM courses WHERE semester = $1 OR semester = 'both'`,
      [semester]
    );
    const allCourses = coursesResult.rows;

    // LLM에게 넘길 과목 목록 포맷
    const courseListText = allCourses.length
      ? allCourses.map(c => {
          const slots = (c.timeslots || []).map(s => `${s.day} ${s.start}-${s.end}`).join(', ');
          return `[${c.code}] ${c.name} (${c.category}, ${c.credits}학점, ${c.track || '공통'}) | ${slots || '시간미정'}`;
        }).join('\n')
      : '(개설 과목 데이터 없음)';

    // 현재 시간표 포맷
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

사용자 요청을 분석하여 반드시 아래 JSON 형식으로만 응답하세요:
{
  "action": "remove" | "add" | "replace" | "filter",
  "remove_codes": ["제거할 과목코드 배열, 없으면 []"],
  "exclude_days": ["제외할 요일 MON/TUE/WED/THU/FRI, 없으면 []"],
  "exclude_before": "HH:MM 형식 이 시간 이전 수업 제외, 없으면 null",
  "include_codes": ["추가/우선 포함할 과목코드 배열, 없으면 []"],
  "reply": "사용자에게 보여줄 한국어 응답 메시지 1~2문장"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      response_format: { type: 'json_object' },
    });

    let intent;
    try {
      intent = JSON.parse(completion.choices[0].message.content);
    } catch {
      return res.status(500).json({ error: 'LLM 응답 파싱 실패. 다시 시도해주세요.' });
    }

    if (!intent.action) {
      return res.status(500).json({ error: 'LLM 응답 형식 오류. 다시 시도해주세요.' });
    }

    const plans = await generateRecommendations(req.userId, semester, {}, 3, intent);
    res.json({ intent, plans, reply: intent.reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'LLM 처리 실패' });
  }
});

module.exports = router;
