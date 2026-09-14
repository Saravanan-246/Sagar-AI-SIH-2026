export function isValidDate(
  value: string | Date
): boolean {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return !Number.isNaN(date.getTime());
}

export function toDate(
  value: string | Date
): Date | null {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return isValidDate(date) ? date : null;
}

export function formatTime24(
  value: string | Date
): string {
  const date = toDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatTime12(
  value: string | Date
): string {
  const date = toDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatDateTimeLocal(
  value: string | Date
): string {
  const date = toDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function minutesBetween(
  from: string | Date,
  to: string | Date
): number {
  const start = toDate(from);
  const end = toDate(to);

  if (!start || !end) {
    return NaN;
  }

  return (
    (end.getTime() - start.getTime()) /
    (1000 * 60)
  );
}

export function hoursBetween(
  from: string | Date,
  to: string | Date
): number {
  const minutes = minutesBetween(from, to);

  return Number.isFinite(minutes)
    ? minutes / 60
    : NaN;
}

export function addMinutes(
  value: string | Date,
  minutes: number
): Date | null {
  const date = toDate(value);

  if (!date || !Number.isFinite(minutes)) {
    return null;
  }

  return new Date(
    date.getTime() + minutes * 60 * 1000
  );
}

export function addHours(
  value: string | Date,
  hours: number
): Date | null {
  return addMinutes(value, hours * 60);
}

export function isPast(
  value: string | Date
): boolean {
  const date = toDate(value);

  return date ? date.getTime() < Date.now() : false;
}

export function isFuture(
  value: string | Date
): boolean {
  const date = toDate(value);

  return date ? date.getTime() > Date.now() : false;
}

export function isWithinRange(
  value: string | Date,
  start: string | Date,
  end: string | Date
): boolean {
  const target = toDate(value);
  const rangeStart = toDate(start);
  const rangeEnd = toDate(end);

  if (!target || !rangeStart || !rangeEnd) {
    return false;
  }

  return (
    target.getTime() >= rangeStart.getTime() &&
    target.getTime() <= rangeEnd.getTime()
  );
}

export function formatRelativeTime(
  value: string | Date
): string {
  const date = toDate(value);

  if (!date) {
    return "—";
  }

  const difference =
    date.getTime() - Date.now();

  const seconds = Math.round(
    difference / 1000
  );

  const absoluteSeconds = Math.abs(seconds);

  const formatter = new Intl.RelativeTimeFormat(
    "en",
    { numeric: "auto" }
  );

  if (absoluteSeconds < 60) {
    return formatter.format(seconds, "second");
  }

  const minutes = Math.round(seconds / 60);

  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, "minute");
  }

  const hours = Math.round(minutes / 60);

  if (Math.abs(hours) < 24) {
    return formatter.format(hours, "hour");
  }

  const days = Math.round(hours / 24);

  if (Math.abs(days) < 30) {
    return formatter.format(days, "day");
  }

  const months = Math.round(days / 30);

  if (Math.abs(months) < 12) {
    return formatter.format(months, "month");
  }

  return formatter.format(
    Math.round(months / 12),
    "year"
  );
}

export function isSameDay(
  first: string | Date,
  second: string | Date
): boolean {
  const a = toDate(first);
  const b = toDate(second);

  if (!a || !b) {
    return false;
  }

  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfDay(
  value: string | Date
): Date | null {
  const date = toDate(value);

  if (!date) {
    return null;
  }

  const result = new Date(date);

  result.setHours(0, 0, 0, 0);

  return result;
}

export function endOfDay(
  value: string | Date
): Date | null {
  const date = toDate(value);

  if (!date) {
    return null;
  }

  const result = new Date(date);

  result.setHours(23, 59, 59, 999);

  return result;
}