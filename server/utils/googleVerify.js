const { OAuth2Client } = require('google-auth-library');

const ALLOWED_DOMAIN = 'kentech.ac.kr';

class GoogleAuthError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GoogleAuthError';
    this.status = status;
  }
}

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new Error('GOOGLE_CLIENT_ID is not set in environment');
    }
    client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return client;
}

async function verifyIdToken(idToken) {
  let ticket;
  try {
    ticket = await getClient().verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch (err) {
    throw new GoogleAuthError('Invalid Google ID Token', 401);
  }

  const payload = ticket.getPayload();
  if (!payload || payload.email_verified !== true) {
    throw new GoogleAuthError('이메일이 확인되지 않은 Google 계정입니다.', 403);
  }
  if (payload.hd !== ALLOWED_DOMAIN) {
    throw new GoogleAuthError('@kentech.ac.kr 계정만 사용할 수 있습니다.', 403);
  }
  if (typeof payload.email !== 'string' || !payload.email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
    throw new GoogleAuthError('@kentech.ac.kr 계정만 사용할 수 있습니다.', 403);
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || '',
  };
}

module.exports = { verifyIdToken, GoogleAuthError };
