jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  expressIntegration: jest.fn(),
  setupExpressErrorHandler: jest.fn(),
}));

jest.mock('../../config/env', () => ({
  env: { SENTRY_DSN: undefined, NODE_ENV: 'test' },
}));

import * as Sentry from '@sentry/node';
import { withSentry } from '../sentry';

const mockCaptureException = Sentry.captureException as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('withSentry', () => {
  it('calls captureException and rethrows when the handler throws', async () => {
    const err = new Error('boom');
    const handler = withSentry(async () => { throw err; });

    await expect(handler()).rejects.toBe(err);
    expect(mockCaptureException).toHaveBeenCalledWith(err);
  });

  it('does not call captureException when the handler succeeds', async () => {
    const handler = withSentry(async () => {});
    await handler();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('passes arguments through to the wrapped handler', async () => {
    const inner = jest.fn();
    const handler = withSentry(inner);
    await handler('a', 'b');
    expect(inner).toHaveBeenCalledWith('a', 'b');
  });

  it('preserves the original error identity when rethrowing', async () => {
    const err = new TypeError('type mismatch');
    const handler = withSentry(async () => { throw err; });

    const caught = await handler().catch((e) => e);
    expect(caught).toBe(err);
  });
});
