import type { NextFunction, Request, Response } from 'express';
import admin from '../../config/firebase';
import { getCachedUserByFirebaseUid } from '../../services/userCache';
import { authenticatedGlobalRateLimit } from '../rateLimit';
import { authMiddleware } from '../auth';

jest.mock('../../config/firebase', () => ({
  __esModule: true,
  default: {
    auth: jest.fn(),
  },
}));

jest.mock('../../services/userCache', () => ({
  getCachedUserByFirebaseUid: jest.fn(),
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
});
