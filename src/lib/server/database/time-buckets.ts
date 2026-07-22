export interface LocalBuckets {
  localDow: number;
  localHour: number;
  localDate: string;
}

export function deriveLocalBuckets(
  utcEpochMilliseconds: number,
  timezone: string,
): LocalBuckets {
  if (!Number.isFinite(utcEpochMilliseconds)) {
    throw new RangeError('Invalid UTC epoch-millisecond timestamp');
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(utcEpochMilliseconds));
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);

  return {
    localDow: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    localHour: Number(values.hour),
    localDate: `${values.year}-${values.month}-${values.day}`,
  };
}
