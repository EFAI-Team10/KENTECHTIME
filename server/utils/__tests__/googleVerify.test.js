const { verifyIdToken, GoogleAuthError } = require('../googleVerify');

jest.mock('google-auth-library', () => {
  const verifyIdTokenMock = jest.fn();
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: verifyIdTokenMock })),
    __verifyIdTokenMock: verifyIdTokenMock,
  };
});

const { __verifyIdTokenMock } = require('google-auth-library');

beforeEach(() => {
  __verifyIdTokenMock.mockReset();
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
});

function mockPayload(overrides = {}) {
  return {
    getPayload: () => ({
      sub: '1234567890',
      email: 'student@kentech.ac.kr',
      name: '구형준',
      email_verified: true,
      hd: 'kentech.ac.kr',
      aud: 'test-client-id',
      ...overrides,
    }),
  };
}

test('returns sub/email/name on valid kentech.ac.kr token', async () => {
  __verifyIdTokenMock.mockResolvedValue(mockPayload());
  const result = await verifyIdToken('any.id.token');
  expect(result).toEqual({
    sub: '1234567890',
    email: 'student@kentech.ac.kr',
    name: '구형준',
  });
});

test('throws GoogleAuthError when email_verified is false', async () => {
  __verifyIdTokenMock.mockResolvedValue(mockPayload({ email_verified: false }));
  await expect(verifyIdToken('t')).rejects.toThrow(GoogleAuthError);
  await expect(verifyIdToken('t')).rejects.toMatchObject({ status: 403 });
});

test('throws GoogleAuthError when hd is not kentech.ac.kr', async () => {
  __verifyIdTokenMock.mockResolvedValue(mockPayload({ hd: 'gmail.com', email: 'x@gmail.com' }));
  await expect(verifyIdToken('t')).rejects.toMatchObject({ status: 403 });
});

test('throws GoogleAuthError when email domain is not kentech.ac.kr', async () => {
  __verifyIdTokenMock.mockResolvedValue(mockPayload({ email: 'x@other.com' }));
  await expect(verifyIdToken('t')).rejects.toMatchObject({ status: 403 });
});

test('throws GoogleAuthError with 401 when library rejects token', async () => {
  __verifyIdTokenMock.mockRejectedValue(new Error('Invalid token signature'));
  await expect(verifyIdToken('t')).rejects.toMatchObject({ status: 401 });
});
