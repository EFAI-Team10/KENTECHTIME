import { requireAuth, errorJson, AuthError } from '@/lib/server/auth';
import { generateRecommendations } from '@/lib/server/recommender';

export async function POST(request) {
  let auth;
  try {
    auth = requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return errorJson(err.message, err.status);
    return errorJson('서버 오류', 500);
  }

  const body = await request.json().catch(() => ({}));
  const { semester, preferences = {} } = body;
  const maxCredits = preferences.max_credits ?? 21;

  try {
    const plans = await generateRecommendations(auth.userId, semester, preferences, 3, null, maxCredits);
    return Response.json({ plans });
  } catch (err) {
    console.error('recommend error:', err);
    return errorJson('추천 생성 실패', 500);
  }
}
