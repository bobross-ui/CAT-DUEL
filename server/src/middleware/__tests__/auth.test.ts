import type { NextFunction, Request, Response } from 'express';
import admin from '../../config/firebase';
import { getCachedUserByFirebaseUid, isFirebaseUidBlocked } from '../../services/userCache';
import { authenticatedGlobalRateLimit } from '../rateLimit';
import { authMiddleware, requireFirebaseRevocationCheck } from '../auth';

jest.mock('../../config/firebase', () => ({
  __esModule: true,
  default: {
    auth: jest.fn(),
  },
}));

jest.mock('../../services/userCache', () => ({
  getCachedUserByFirebaseUid: jest.fn(),
  isFirebaseUidBlocked: jest.fn(),
}));

jest.mock('../../services/streak', () => ({
  touchStreak: jest.fn(),
}));

jest.mock('../rateLimit', () => ({
  authenticatedGlobalRateLimit: jest.fn(),
}));

const verifyIdToken = jest.fn();
const mockedAdmin = admin as unknown as { auth: jest.Mock };
const mockedGetCachedUserByFirebaseUid = getCachedUserByFirebaseUid as jest.Mock;
const mockedIsFirebaseUidBlocked = isFirebaseUidBlocked as jest.Mock;
const mockedAuthenticatedGlobalRateLimit = authenticatedGlobalRateLimit as unknown as jest.Mock;

function createResponse() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response & { status: jest.Mock; json: jest.Mock };

  res.status.mockReturnValue(res);
  return res;
}

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAdmin.auth.mockReturnValue({ verifyIdToken });
    mockedIsFirebaseUidBlocked.mockResolvedValue(false);
  });

  it('rejects valid Firebase tokens that do not have an app user', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-1' });
    mockedGetCachedUserByFirebaseUid.mockResolvedValue(null);

    const req = {
      headers: { authorization: 'Bearer valid-token' },
    } as Request;
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await authMiddleware(req, res, next);

    expect(mockedGetCachedUserByFirebaseUid).toHaveBeenCalledWith('firebase-uid-1');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User not found' },
    });
    expect(mockedAuthenticatedGlobalRateLimit).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects app-blocked Firebase UIDs before loading the app user', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-1' });
    mockedIsFirebaseUidBlocked.mockResolvedValue(true);

    const req = {
      headers: { authorization: 'Bearer valid-token' },
    } as Request;
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await authMiddleware(req, res, next);

    expect(mockedIsFirebaseUidBlocked).toHaveBeenCalledWith('firebase-uid-1');
    expect(mockedGetCachedUserByFirebaseUid).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token revoked' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('uses Firebase checkRevoked on routes that opt in', async () => {
    const decoded = { uid: 'firebase-uid-1', auth_time: 123 };
    verifyIdToken.mockResolvedValue(decoded);

    const req = {
      headers: { authorization: 'Bearer valid-token' },
      firebaseToken: { uid: 'firebase-uid-1' },
    } as Request;
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireFirebaseRevocationCheck(req, res, next);

    expect(verifyIdToken).toHaveBeenCalledWith('valid-token', true);
    expect(req.firebaseToken).toBe(decoded);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects opt-in revocation checks that are not preceded by base auth', async () => {
    const req = {
      headers: { authorization: 'Bearer valid-token' },
    } as Request;
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireFirebaseRevocationCheck(req, res, next);

    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing token' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects routes that opt in when Firebase reports the token revoked', async () => {
    verifyIdToken.mockRejectedValue(new Error('revoked'));

    const req = {
      headers: { authorization: 'Bearer valid-token' },
      firebaseToken: { uid: 'firebase-uid-1' },
    } as Request;
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireFirebaseRevocationCheck(req, res, next);

    expect(verifyIdToken).toHaveBeenCalledWith('valid-token', true);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token revoked' },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
