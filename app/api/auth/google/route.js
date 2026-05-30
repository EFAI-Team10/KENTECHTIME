import { NextResponse } from 'next/server';
import { verifyIdToken, GoogleAuthError } from '@/lib/server/googleVerify';
import { signJwt, errorJson } from '@/lib/server/auth';
import { getSupabaseAdmin } from '@/lib/server/supabase';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { id_token } = body;
  if (!id_token) return errorJson('id_token이 필요합니다.', 400);

  let payload;
  try {
    payload = await verifyIdToken(id_token);
  } catch (err) {
    if (err instanceof GoogleAuthError) return errorJson(err.message, err.status);
    console.error('Google verify error:', err);
    return errorJson('서버 오류', 500);
  }

  const supabase = getSupabaseAdmin();

  // Match by google_sub first, fall back to email (handles pre-OAuth admin accounts)
  let { data: user, error: err1 } = await supabase
    .from('users')
    .select('id, email, name, role, semester, student_id, google_sub')
    .eq('google_sub', payload.sub)
    .maybeSingle();

  if (err1) console.error('[auth/google] google_sub lookup error:', err1);

  if (!user) {
    const { data: byEmail, error: err2 } = await supabase
      .from('users')
      .select('id, email, name, role, semester, student_id, google_sub')
      .eq('email', payload.email)
      .maybeSingle();

    if (err2) console.error('[auth/google] email lookup error:', err2);
    console.log('[auth/google] lookup by email:', payload.email, '→ found:', !!byEmail);

    if (byEmail) {
      await supabase.from('users').update({ google_sub: payload.sub }).eq('id', byEmail.id);
      user = { ...byEmail, google_sub: payload.sub };
    }
  }

  if (!user) {
    return NextResponse.json({
      is_new_user: true,
      google: { email: payload.email, name: payload.name },
    });
  }

  const token = signJwt(user);
  return NextResponse.json({ token, user: publicUser(user), is_new_user: false });
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role || 'student',
    semester: row.semester,
    student_id: row.student_id,
  };
}
