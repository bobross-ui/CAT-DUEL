import type { Socket } from 'socket.io';
import admin from '../../config/firebase';
import { registerSocketConnection } from '../../services/socketRateLimit';
import { getCachedUserByFirebaseUid, isFirebaseUidBlocked } from '../../services/userCache';
import { socketAuthMiddleware } from '../socketAuth';

jest.mock('../../config/firebase', () => ({
  __esModule: true,
  default: {
    auth: jest.fn(),
  },
}));

jest.mock('../../services/socketRateLimit', () => ({
  registerSocketConnection: jest.fn(),
}));

jest.mock('../../services/userCache', () => ({
  getCachedUserByFirebaseUid: jest.fn(),
  isFirebaseUidBlocked: jest.fn(),
}));

const verifyIdToken = jest.fn();
const mockedAdmin = admin as unknown as { auth: jest.Mock };
const mockedGetCachedUserByFirebaseUid = getCachedUserByFirebaseUid as jest.Mock;
const mockedIsFirebaseUidBlocked = isFirebaseUidBlocked as jest.Mock;
const mockedRegisterSocketConnection = registerSocketConnection as jest.Mock;

function createSocket(token = 'valid-token') {
  return {
    handshake: { auth: { token } },
    data: {},
  } as unknown as Socket;
}

describe('socketAuthMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAdmin.auth.mockReturnValue({ verifyIdToken });
    mockedIsFirebaseUidBlocked.mockResolvedValue(false);
  });

  it('uses Firebase checkRevoked for socket handshakes', async () => {
    const user = { id: 'user-1', firebaseUid: 'firebase-uid-1' };
    verifyIdToken.mockResolvedValue({ uid: user.firebaseUid });
    mockedGetCachedUserByFirebaseUid.mockResolvedValue(user);
    mockedRegisterSocketConnection.mockResolvedValue(true);
    const socket = createSocket();
    const next = jest.fn();

    await socketAuthMiddleware(socket, next);

    expect(verifyIdToken).toHaveBeenCalledWith('valid-token', true);
    expect(mockedIsFirebaseUidBlocked).toHaveBeenCalledWith(user.firebaseUid);
    expect(socket.data.user).toBe(user);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects app-blocked Firebase UIDs', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-1' });
    mockedIsFirebaseUidBlocked.mockResolvedValue(true);
    const next = jest.fn();

    await socketAuthMiddleware(createSocket(), next);

    expect(next).toHaveBeenCalledWith(new Error('UNAUTHORIZED'));
    expect(mockedGetCachedUserByFirebaseUid).not.toHaveBeenCalled();
    expect(mockedRegisterSocketConnection).not.toHaveBeenCalled();
  });
});
