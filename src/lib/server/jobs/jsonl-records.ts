import { harnessLabels, type Harness } from '../../jobs/contracts';

/**
 * Turning JSONL log lines into records: the guards and decoding every Harness's
 * log reader needs before it can ask a record anything.
 */

/** A decoded line is a record only if it is an object; a bare scalar is not. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A wire timestamp as epoch milliseconds, or null when none was written. */
export function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Every non-empty line of a JSONL slice, decoded. Either failure — invalid JSON
 * or a line that is not an object — names the Harness, the file, and the line,
 * and keeps the original as `cause`, so a corrupt log is diagnosable without
 * re-running Ingestion.
 */
export function parseJsonlRecords<LogRecord>(
  harness: Harness,
  contents: string,
  filePath: string,
  firstLineNumber = 1,
): LogRecord[] {
  const records: LogRecord[] = [];
  for (const [index, line] of contents.split('\n').entries()) {
    if (line.length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) throw new Error('record is not an object');
      records.push(parsed as LogRecord);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        `Invalid ${harnessLabels[harness]} JSONL at ${filePath}:${firstLineNumber + index}: ${message}`,
        { cause },
      );
    }
  }
  return records;
}
