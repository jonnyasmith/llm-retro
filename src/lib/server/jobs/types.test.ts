import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../database/connection';
import { InProcessJobBackend, type JobExecutionObserver } from './types';

describe('in-process Job routing', () => {
  it('routes exact scoped handlers before generic type handlers', async () => {
    const backend = new InProcessJobBackend({} as Database);
    const generic = vi.fn();
    const claude = vi.fn();
    const observer: JobExecutionObserver = {
      correlationId: crypto.randomUUID(),
      progress: vi.fn(),
      log: vi.fn(),
    };
    backend.register('ingest', { run: generic });
    backend.register({ type: 'ingest', scope: 'claude' }, { run: claude });

    await backend.execute(
      { identity: { type: 'ingest', scope: 'claude' }, payload: null },
      observer,
    );
    await backend.execute(
      { identity: { type: 'ingest' }, payload: null },
      observer,
    );

    expect(claude).toHaveBeenCalledOnce();
    expect(generic).toHaveBeenCalledOnce();
    expect(() =>
      backend.execute(
        { identity: { type: 'ingest', scope: 'codex' }, payload: null },
        observer,
      ),
    ).toThrow('No handler registered for Job identity: ["ingest","codex"]');
  });
});
