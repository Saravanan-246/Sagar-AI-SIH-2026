export function formatNumber(
  value: number,
  maximumFractionDigits = 1
): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits,
  }).format(value);
}

export function formatDecimal(
  value: number,
  digits = 1
): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return value.toFixed(digits);
}

export function formatDistance(
  distanceKm: number
): string {
  if (!Number.isFinite(distanceKm)) {
    return "—";
  }

  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }

  return `${formatDecimal(distanceKm, 1)} km`;
}

export function formatDuration(
  hours: number
): string {
  if (!Number.isFinite(hours) || hours < 0) {
    return "—";
  }

  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (wholeHours === 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return `${wholeHours} hr`;
  }

  return `${wholeHours} hr ${minutes} min`;
}

export function formatSpeedKnots(
  knots: number
): string {
  if (!Number.isFinite(knots)) {
    return "—";
  }

  return `${formatDecimal(knots, 1)} kn`;
}

export function formatTemperature(
  celsius: number
): string {
  if (!Number.isFinite(celsius)) {
    return "—";
  }

  return `${formatDecimal(celsius, 1)}°C`;
}

export function formatWaveHeight(
  meters: number
): string {
  if (!Number.isFinite(meters)) {
    return "—";
  }

  return `${formatDecimal(meters, 1)} m`;
}

export function formatPercentage(
  value: number,
  digits = 0
): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return `${value.toFixed(digits)}%`;
}

export function formatDate(
  value: string | Date
): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(
  value: string | Date
): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
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

export function formatTime(
  value: string | Date
): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatRelativeTime(
  value: string | Date
): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const difference = Date.now() - date.getTime();
  const seconds = Math.floor(Math.abs(difference) / 1000);

  const formatter = new Intl.RelativeTimeFormat("en", {
    numeric: "auto",
  });

  if (seconds < 60) {
    return formatter.format(
      difference < 0 ? 0 : -Math.floor(seconds),
      "second"
    );
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return formatter.format(
      difference < 0 ? 0 : -minutes,
      "minute"
    );
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return formatter.format(
      difference < 0 ? 0 : -hours,
      "hour"
    );
  }

  const days = Math.floor(hours / 24);

  if (days < 30) {
    return formatter.format(
      difference < 0 ? 0 : -days,
      "day"
    );
  }

  const months = Math.floor(days / 30);

  if (months < 12) {
    return formatter.format(
      difference < 0 ? 0 : -months,
      "month"
    );
  }

  const years = Math.floor(days / 365);

  return formatter.format(
    difference < 0 ? 0 : -years,
    "year"
  );
}

export function formatCoordinate(
  value: number,
  type: "latitude" | "longitude"
): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const absolute = Math.abs(value);
  const direction =
    type === "latitude"
      ? value >= 0
        ? "N"
        : "S"
      : value >= 0
        ? "E"
        : "W";

  return `${absolute.toFixed(4)}° ${direction}`;
}

export function formatCoordinates(
  latitude: number,
  longitude: number
): string {
  return `${formatCoordinate(latitude, "latitude")} · ${formatCoordinate(
    longitude,
    "longitude"
  )}`;
}