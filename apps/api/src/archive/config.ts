export function archiveDatabaseUrl(env = process.env) {
  const url = env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid DATABASE_URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol))
    throw new Error('Invalid database protocol');
  return url;
}
export function archivePassword(env = process.env) {
  const value = env.PRIVATE_API_PASSWORD;
  if (!value || value.length < 24)
    throw new Error('PRIVATE_API_PASSWORD must have at least 24 characters');
  return value;
}
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const timestamp = Date.parse(value + 'T00:00:00Z');
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}
export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
// Only collect today's KRX daily bars after 19:00 Seoul; earlier runs end yesterday.
export function closedDate(now = new Date()) {
  const seoul = new Date(now.getTime() + 9 * 3600000);
  const day = seoul.toISOString().slice(0, 10);
  return seoul.getUTCHours() >= 19 ? day : shiftDate(day, -1);
}
export function dateWindows(from: string, to: string) {
  if (
    !validDate(from) ||
    !validDate(to) ||
    from > to ||
    Date.parse(to) - Date.parse(from) > 366 * 86400000
  )
    throw new Error('Invalid date range (maximum 366 days)');
  const windows: { from: string; to: string }[] = [];
  for (let day = from; day <= to; day = shiftDate(day, 60))
    windows.push({
      from: day,
      to: shiftDate(day, 59) < to ? shiftDate(day, 59) : to,
    });
  return windows;
}
