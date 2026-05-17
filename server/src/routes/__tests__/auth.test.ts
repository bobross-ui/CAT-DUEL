import express from 'express';
import type { AddressInfo } from 'net';

jest.mock('../../middleware/auth', () => ({
  authMiddleware: jest.fn(),
}));

jest.mock('../../config/firebase', () => ({
  __esModule: true,
  default: { auth: jest.fn() },
}));

jest.mock('../../models/prisma', () => ({
  prisma: {
    user: {
      create: jest.fn(),
      update: jest.fn(),
    },
    match: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
  },
}));

jest.mock('../../services/userCache', () => ({
  cacheUser: jest.fn().mockResolvedValue(undefined),
  getCachedUserByFirebaseUid: jest.fn(),
  isFirebaseUidBlocked: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
}));

import { Prisma } from '../../generated/prisma/client';
import authRouter from '../auth';
import admin from '../../config/firebase';
import { prisma } from '../../models/prisma';
import { authMiddleware } from '../../middleware/auth';
import { cacheUser, getCachedUserByFirebaseUid } from '../../services/userCache';

const mockedAdmin = admin as jest.Mocked<typeof admin> & { auth: jest.Mock };
const userCreate = prisma.user.create as jest.Mock;
const userUpdate = prisma.user.update as jest.Mock;
const mockedAuthMiddleware = authMiddleware as jest.Mock;
const mockedCacheUser = cacheUser as jest.Mock;
const mockedGetCached = getCachedUserByFirebaseUid as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  return app;
}

async function withServer<T>(
  app: express.Express,
  fn: (url: string) => Promise<T>,
): Promise<T> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function p2002OnDisplayCode() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['display_name', 'display_code'] },
  });
}

describe('POST /auth/bootstrap (anonymous provider)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAdmin.auth.mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({
        uid: 'anon-uid-1',
        firebase: { sign_in_provider: 'anonymous' },
      }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    } as any);
    mockedGetCached.mockResolvedValue(null);
  });

  it('creates a guest user with isGuest=true, onboardingCompletedAt set, and a Guest###### display name', async () => {
    let captured: any;
    userCreate.mockImplementation(async ({ data }: { data: any }) => {
      captured = data;
      return { id: 'new-guest', ...data };
    });

    const app = makeApp();
    const res = await withServer(app, async (url) => {
      return fetch(`${url}/auth/bootstrap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer faketoken' },
        body: JSON.stringify({}),
      });
    });

    expect(res.status).toBe(201);
    expect(captured.isGuest).toBe(true);
    expect(captured.onboardingCompletedAt).toBeInstanceOf(Date);
    expect(captured.displayName).toMatch(/^Guest\d{6}$/);
    expect(captured.displayCode).toMatch(/^\d{6}$/);
    expect(captured.firebaseUid).toBe('anon-uid-1');
    expect(captured.email).toBeNull();
    expect(mockedCacheUser).toHaveBeenCalled();
  });

  it('retries with a new display code on P2002 collisions', async () => {
    let attempts = 0;
    userCreate.mockImplementation(async ({ data }: { data: any }) => {
      attempts += 1;
      if (attempts < 3) throw p2002OnDisplayCode();
      return { id: 'new-guest', ...data };
    });

    const app = makeApp();
    const res = await withServer(app, async (url) => {
      return fetch(`${url}/auth/bootstrap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer faketoken' },
        body: JSON.stringify({}),
      });
    });

    expect(res.status).toBe(201);
    expect(attempts).toBe(3);
  });

  it('returns 503 GUEST_NAME_UNAVAILABLE after exhausting attempts', async () => {
    userCreate.mockImplementation(async () => { throw p2002OnDisplayCode(); });

    const app = makeApp();
    const res = await withServer(app, async (url) => {
      return fetch(`${url}/auth/bootstrap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer faketoken' },
        body: JSON.stringify({}),
      });
    });

    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.error.code).toBe('GUEST_NAME_UNAVAILABLE');
  });
});

describe('POST /auth/bootstrap (registered provider)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAdmin.auth.mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({
        uid: 'firebase-uid-1',
        email: 'user@example.com',
        firebase: { sign_in_provider: 'password' },
      }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    } as any);
    mockedGetCached.mockResolvedValue(null);
  });

  it('creates an account with the requested display name and a generated display code', async () => {
    let captured: any;
    userCreate.mockImplementation(async ({ data }: { data: any }) => {
      captured = data;
      return { id: 'new-user', ...data };
    });

    const app = makeApp();
    const res = await withServer(app, async (url) => {
      return fetch(`${url}/auth/bootstrap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer faketoken' },
        body: JSON.stringify({ displayName: 'Same Name' }),
      });
    });

    expect(res.status).toBe(201);
    expect(captured.displayName).toBe('Same Name');
    expect(captured.displayCode).toMatch(/^\d{6}$/);
    expect(mockedCacheUser).toHaveBeenCalled();
  });
});

describe('POST /auth/convert-guest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function setAuthMiddleware(user: { id: string; isGuest: boolean; avatarUrl: string | null }, decoded: { email?: string; picture?: string } = {}) {
    mockedAuthMiddleware.mockImplementation((req, _res, next) => {
      req.user = user;
      req.firebaseToken = { uid: 'firebase-uid-1', ...decoded };
      next();
    });
  }

  it('rejects when the caller is not a guest', async () => {
    setAuthMiddleware({ id: 'user-1', isGuest: false, avatarUrl: null });

    const app = makeApp();
    const res = await withServer(app, async (url) => {
      return fetch(`${url}/auth/convert-guest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'NewName' }),
      });
    });

    expect(res.status).toBe(409);
    const body = await res.json() as any;
    expect(body.error.code).toBe('NOT_GUEST');
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('flips isGuest=false and updates display name / email / avatar', async () => {
    setAuthMiddleware(
      { id: 'guest-1', isGuest: true, avatarUrl: null },
      { email: 'user@example.com', picture: 'https://pic/avatar.png' },
    );
    userUpdate.mockResolvedValue({ id: 'guest-1', isGuest: false, displayName: 'NewName' });

    const app = makeApp();
    const res = await withServer(app, async (url) => {
      return fetch(`${url}/auth/convert-guest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'NewName' }),
      });
    });

    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'guest-1' },
      data: {
        isGuest: false,
        displayName: 'NewName',
        displayCode: expect.stringMatching(/^\d{6}$/),
        email: 'user@example.com',
        avatarUrl: 'https://pic/avatar.png',
      },
    });
    expect(mockedCacheUser).toHaveBeenCalled();
  });

  it('retries when the generated display code collides during conversion', async () => {
    setAuthMiddleware({ id: 'guest-1', isGuest: true, avatarUrl: null }, { email: 'x@y.com' });
    let attempts = 0;
    userUpdate.mockImplementation(async ({ data }: { data: any }) => {
      attempts += 1;
      if (attempts < 2) throw p2002OnDisplayCode();
      return { id: 'guest-1', ...data };
    });

    const app = makeApp();
    const res = await withServer(app, async (url) => {
      return fetch(`${url}/auth/convert-guest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'TakenName' }),
      });
    });

    expect(res.status).toBe(200);
    expect(attempts).toBe(2);
  });
});
