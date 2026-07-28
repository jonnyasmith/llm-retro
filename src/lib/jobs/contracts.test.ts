import { describe, expect, it } from 'vitest';
import {
  harnessLabels,
  isHarness,
  isJobTriggerPayload,
  isTerminalJobRunStatus,
  jobRunStatuses,
  mapHarnesses,
  parseJobEventData,
  type Harness,
  type JobLogPayload,
  type JobRunStatus,
} from './contracts';

function frame(data: string): MessageEvent<string> {
  return new MessageEvent<string>('log', { data });
}

describe('isHarness', () => {
  it('accepts every Harness the app ingests', () => {
    expect(isHarness('claude')).toBe(true);
    expect(isHarness('codex')).toBe(true);
    expect(isHarness('pi')).toBe(true);
    expect(isHarness('omp')).toBe(true);
  });

  it('rejects a string outside the union', () => {
    expect(isHarness('gemini')).toBe(false);
    expect(isHarness('')).toBe(false);
    expect(isHarness('claude ')).toBe(false);
  });

  it('rejects a display label in place of a Harness', () => {
    expect(isHarness('Claude')).toBe(false);
    expect(isHarness('Codex')).toBe(false);
  });

  it('rejects an inherited property name', () => {
    // The guard scans the list rather than indexing an object, so nothing a
    // route reads off an untrusted URL can widen the union.
    expect(isHarness('toString')).toBe(false);
    expect(isHarness('constructor')).toBe(false);
    expect(isHarness('__proto__')).toBe(false);
  });
});

describe('harnessLabels', () => {
  it('names each Harness the way the app writes it', () => {
    expect(harnessLabels).toEqual({
      claude: 'Claude',
      codex: 'Codex',
      pi: 'pi',
      omp: 'omp',
    });
  });
});

describe('mapHarnesses', () => {
  it('produces an entry for every Harness', () => {
    expect(mapHarnesses((harness) => harness.length)).toEqual({
      claude: 6,
      codex: 5,
      pi: 2,
      omp: 3,
    });
  });

  it('keys the record by Harness and nothing else', () => {
    expect(Object.keys(mapHarnesses(() => null))).toEqual([
      'claude',
      'codex',
      'pi',
      'omp',
    ]);
  });

  it('calls the mapper once per Harness', () => {
    const seen: Harness[] = [];

    mapHarnesses((harness) => seen.push(harness));

    expect(seen).toEqual(['claude', 'codex', 'pi', 'omp']);
  });
});

// Exhaustive by type as well as by value: a new Job run status cannot land
// without a decision about which side of the split it falls on — the app
// offers View for the finished ones and Watch for the rest.
const terminal: Record<JobRunStatus, boolean> = {
  pending: false,
  running: false,
  succeeded: true,
  failed: true,
  interrupted: true,
};

describe('isTerminalJobRunStatus', () => {
  it.each(jobRunStatuses.filter((status) => terminal[status]))(
    'counts a finished Job run as terminal',
    (status) => {
      expect(isTerminalJobRunStatus(status)).toBe(true);
    },
  );

  it.each(jobRunStatuses.filter((status) => !terminal[status]))(
    'counts a Job run still in flight as unfinished',
    (status) => {
      expect(isTerminalJobRunStatus(status)).toBe(false);
    },
  );

  it('rejects a status the app does not have', () => {
    expect(isTerminalJobRunStatus('')).toBe(false);
    expect(isTerminalJobRunStatus('cancelled')).toBe(false);
    expect(isTerminalJobRunStatus('Succeeded')).toBe(false);
    expect(isTerminalJobRunStatus('succeeded ')).toBe(false);
    expect(isTerminalJobRunStatus('toString')).toBe(false);
  });
});

describe('isJobTriggerPayload', () => {
  it('accepts the payload the trigger endpoint answers with', () => {
    expect(
      isJobTriggerPayload({ correlation_id: 'run-1', disposition: 'started' }),
    ).toBe(true);
    expect(
      isJobTriggerPayload({ correlation_id: 'run-1', disposition: 'joined' }),
    ).toBe(true);
  });

  it('rejects a body that is not an object', () => {
    expect(isJobTriggerPayload(null)).toBe(false);
    expect(isJobTriggerPayload('run-1')).toBe(false);
    expect(isJobTriggerPayload(undefined)).toBe(false);
    expect(isJobTriggerPayload([])).toBe(false);
  });

  it('rejects a payload naming no Job run', () => {
    expect(isJobTriggerPayload({ disposition: 'started' })).toBe(false);
    expect(
      isJobTriggerPayload({ correlation_id: '', disposition: 'started' }),
    ).toBe(false);
    expect(
      isJobTriggerPayload({ correlation_id: 7, disposition: 'started' }),
    ).toBe(false);
  });

  it('rejects a disposition the app cannot act on', () => {
    expect(isJobTriggerPayload({ correlation_id: 'run-1' })).toBe(false);
    expect(
      isJobTriggerPayload({ correlation_id: 'run-1', disposition: 'queued' }),
    ).toBe(false);
    expect(
      isJobTriggerPayload({ correlation_id: 'run-1', disposition: 'Started' }),
    ).toBe(false);
  });
});

describe('parseJobEventData', () => {
  it('decodes a frame into the payload its kind carries', () => {
    const payload: JobLogPayload = {
      correlation_id: 'run-1',
      message: 'Found 3 Claude session files',
      timestamp: 1_000,
    };

    expect(
      parseJobEventData<JobLogPayload>(frame(JSON.stringify(payload))),
    ).toEqual(payload);
  });

  it('refuses a frame that is not JSON', () => {
    expect(() => parseJobEventData(frame(''))).toThrow(SyntaxError);
    expect(() => parseJobEventData(frame('not json'))).toThrow(SyntaxError);
    expect(() => parseJobEventData(frame('{"correlation_id":'))).toThrow(
      SyntaxError,
    );
  });

  it('passes a well-formed frame of any shape straight through', () => {
    // Decoding is the only guard. The Job event stream is the sole producer of
    // these frames, so a payload that parses is trusted rather than narrowed.
    expect(parseJobEventData(frame('null'))).toBeNull();
    expect(parseJobEventData(frame('{}'))).toEqual({});
    expect(parseJobEventData(frame('[1,2]'))).toEqual([1, 2]);
  });
});
