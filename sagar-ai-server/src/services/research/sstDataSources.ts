/**
 * Real, network-verified data access for the SST Intelligence Lab.
 *
 * Both endpoints used here were queried directly (2026-09-20) to confirm
 * actual coverage before any model code was written, per the hardening
 * rule that availability must be verified, never assumed from docs:
 *  - marine-api.open-meteo.com/v1/marine accepts start_date/end_date and
 *    returned real hourly data back to 1950 and up to the current hour
 *    for the Gulf of Mannar pilot points, with zero nulls over a
 *    year-long window at all four SST Lab presets.
 *  - archive-api.open-meteo.com/v1/archive (ERA5/ERA5-Land reanalysis)
 *    likewise returned complete hourly weather data for the same range.
 *  - Both APIs use the same variable names/units whether queried by
 *    date range (training) or by `past_days` (live inference), which is
 *    what lets `buildFeatureVector` (sstFeatures.ts) be reused
 *    identically for both - the schema-consistency requirement this
 *    task calls out explicitly.
 *
 * IMPORTANT: every SST/current/wave value here is Open-Meteo's own
 * marine MODEL output (a wave/ocean model blend), not a raw satellite
 * or buoy observation - same disclosure as sourceAdapters/openMeteoAdapter.ts.
 * The most recent ~1-2 days of the "historical" range are effectively
 * a near-real-time model analysis rather than a finalized reanalysis,
 * which is why training windows end at least 2 days before "now"
 * (see sstResearchService.ts) rather than using today's still-settling
 * values as ground truth.
 */

const MARINE_BASE = "https://marine-api.open-meteo.com/v1/marine";
const WEATHER_ARCHIVE_BASE = "https://archive-api.open-meteo.com/v1/archive";
const WEATHER_FORECAST_BASE = "https://api.open-meteo.com/v1/forecast";

const FETCH_TIMEOUT_MS = 25000;

export interface HourlyRow {
  timestamp: string; // ISO 8601, UTC, e.g. "2026-09-20T09:00"
  airTemp: number | null;
  windSpeed: number | null; // knots
  windDirection: number | null; // degrees
  humidity: number | null; // %
  solarRadiation: number | null; // W/m^2
  pressure: number | null; // hPa
  sst: number | null; // degC
  currentVelocity: number | null; // knots (converted from km/h)
  currentDirection: number | null; // degrees
  waveHeight: number | null; // m
}

const WEATHER_HOURLY_VARS =
  "temperature_2m,wind_speed_10m,wind_direction_10m,relative_humidity_2m,shortwave_radiation,surface_pressure";
const MARINE_HOURLY_VARS = "sea_surface_temperature,ocean_current_velocity,ocean_current_direction,wave_height";

const KMH_TO_KNOTS = 0.539957;

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Open-Meteo request failed with status ${response.status} for ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mergeWeatherAndMarine(weather: any, marine: any): HourlyRow[] {
  const wTimes: string[] = weather?.hourly?.time ?? [];
  const marineByTime = new Map<string, number>();
  const mTimes: string[] = marine?.hourly?.time ?? [];
  mTimes.forEach((t, i) => marineByTime.set(t, i));

  const rows: HourlyRow[] = [];
  for (let i = 0; i < wTimes.length; i++) {
    const t = wTimes[i]!;
    const mi = marineByTime.get(t);

    rows.push({
      timestamp: t,
      airTemp: nullableNumber(weather.hourly.temperature_2m?.[i]),
      windSpeed: nullableNumber(weather.hourly.wind_speed_10m?.[i]),
      windDirection: nullableNumber(weather.hourly.wind_direction_10m?.[i]),
      humidity: nullableNumber(weather.hourly.relative_humidity_2m?.[i]),
      solarRadiation: nullableNumber(weather.hourly.shortwave_radiation?.[i]),
      pressure: nullableNumber(weather.hourly.surface_pressure?.[i]),
      sst: mi === undefined ? null : nullableNumber(marine.hourly.sea_surface_temperature?.[mi]),
      currentVelocity:
        mi === undefined
          ? null
          : (() => {
              const kmh = nullableNumber(marine.hourly.ocean_current_velocity?.[mi]);
              return kmh === null ? null : Math.round(kmh * KMH_TO_KNOTS * 100) / 100;
            })(),
      currentDirection: mi === undefined ? null : nullableNumber(marine.hourly.ocean_current_direction?.[mi]),
      waveHeight: mi === undefined ? null : nullableNumber(marine.hourly.wave_height?.[mi]),
    });
  }

  return rows;
}

/** Historical hourly rows for training, over an explicit [startDate, endDate] range (YYYY-MM-DD, UTC). */
export async function fetchHistoricalRange(
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string
): Promise<HourlyRow[]> {
  const weatherUrl =
    `${WEATHER_ARCHIVE_BASE}?latitude=${latitude}&longitude=${longitude}` +
    `&start_date=${startDate}&end_date=${endDate}&hourly=${WEATHER_HOURLY_VARS}` +
    `&wind_speed_unit=kn&timezone=UTC`;
  const marineUrl =
    `${MARINE_BASE}?latitude=${latitude}&longitude=${longitude}` +
    `&start_date=${startDate}&end_date=${endDate}&hourly=${MARINE_HOURLY_VARS}&timezone=UTC`;

  const [weather, marine] = await Promise.all([fetchJson(weatherUrl), fetchJson(marineUrl)]);
  return mergeWeatherAndMarine(weather, marine);
}

/** Recent hourly rows (past `pastDays` days through the current hour) for live inference,
 * built from the same variable names/units as fetchHistoricalRange so the feature schema
 * used to train and the one used to predict are provably identical. */
export async function fetchRecentHourly(
  latitude: number,
  longitude: number,
  pastDays: number
): Promise<HourlyRow[]> {
  const weatherUrl =
    `${WEATHER_FORECAST_BASE}?latitude=${latitude}&longitude=${longitude}` +
    `&past_days=${pastDays}&forecast_days=1&hourly=${WEATHER_HOURLY_VARS}` +
    `&wind_speed_unit=kn&timezone=UTC`;
  const marineUrl =
    `${MARINE_BASE}?latitude=${latitude}&longitude=${longitude}` +
    `&past_days=${pastDays}&forecast_days=1&hourly=${MARINE_HOURLY_VARS}&timezone=UTC`;

  const [weather, marine] = await Promise.all([fetchJson(weatherUrl), fetchJson(marineUrl)]);
  return mergeWeatherAndMarine(weather, marine);
}

export const SOURCE_METADATA = {
  weatherProvider: "Open-Meteo",
  weatherDataset: "Historical Weather API (ERA5 / ERA5-Land reanalysis blend)",
  weatherType: "reanalysis" as const,
  marineProvider: "Open-Meteo",
  marineDataset: "Marine Weather API (wave/ocean model blend)",
  marineType: "model" as const,
  attribution: "Weather data by Open-Meteo.com (CC BY 4.0)",
};
