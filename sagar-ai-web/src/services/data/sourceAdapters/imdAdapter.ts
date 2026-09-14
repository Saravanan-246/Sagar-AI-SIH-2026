import type { RetrievalRequest, RetrievalResult } from "../dataRetrieval";

export interface IMDWeatherRecord {
  id: string;
  location: string;

  latitude?: number;
  longitude?: number;

  temperatureC?: number;
  windSpeedKnots?: number;
  windDirection?: string;

  rainfallMm?: number;
  visibilityKm?: number;

  cyclone?: boolean;
  lightning?: boolean;

  issuedAt?: string;
  validUntil?: string;

  source: "IMD";
}

export interface IMDAdapter {
  getWeather(
    request: RetrievalRequest
  ): Promise<
    RetrievalResult<IMDWeatherRecord>
  >;
}

function createUnavailableResult(
  request: RetrievalRequest,
  message: string
): RetrievalResult<IMDWeatherRecord> {
  return {
    sourceId: "imd",
    sourceName: "India Meteorological Department",
    domain: "weather",

    status: "empty",

    records: [],

    recordCount: 0,

    retrievedAt: new Date().toISOString(),

    local: false,

    message,
  };
}

/**
 * IMD adapter boundary.
 *
 * This adapter is intentionally not presented as
 * a live IMD integration until an authenticated/
 * supported IMD data endpoint is connected.
 *
 * The rest of Sagar can call this interface now,
 * and the implementation can be replaced later
 * without changing the Weather Agent.
 */
export const imdAdapter: IMDAdapter = {
  async getWeather(
    request
  ): Promise<
    RetrievalResult<IMDWeatherRecord>
  > {
    void request;

    return createUnavailableResult(
      request,
      "IMD live weather adapter is not connected. Sagar will continue using the configured prototype weather dataset."
    );
  },
};

export async function getIMDWeather(
  request: RetrievalRequest
): Promise<
  RetrievalResult<IMDWeatherRecord>
> {
  return imdAdapter.getWeather(
    request
  );
}

export function isIMDAdapterConfigured(): boolean {
  return false;
}

export default imdAdapter;