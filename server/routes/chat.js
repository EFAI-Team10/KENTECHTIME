const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const authMiddleware = require('../middleware/auth');
const { generateRecommendations } = require('../utils/recommender');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// POST /api/chat
router.post('/', authMiddleware, async (req, res) => {
  const { message, currentSchedule, semester } = req.body;

  const systemPrompt = `현재 시간표: ${JSON.stringify(currentSchedule)}
사용자의 요청을 분석하여 다음 JSON 형식으로만 응답하세요:
{
  "action": "remove" | "add" | "replace",
  "target": "과목코드 또는 조건",
  "constraint": "추가 제약 조건"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      response_format: { type: 'json_object' },
    });

    const intent = JSON.parse(completion.choices[0].message.content);
    const plans = await generateRecommendations(req.userId, semester, intent);
    res.json({ intent, plans });
  } catch (err) {
    res.status(500).json({ error: 'LLM 처리 실패' });
  }
});

module.exports = router;
