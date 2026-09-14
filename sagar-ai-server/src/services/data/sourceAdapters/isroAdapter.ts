import type {
  RetrievalRequest,
  RetrievalResult,
} from "../dataRetrieval";

export interface ISROSatelliteRecord {
  id: string;

  location: string;

  latitude?: number;
  longitude?: number;

  observationType?:
    | "ocean"
    | "coastal"
    | "marine"
    | "weather"
    | "remote_sensing";

  seaSurfaceTemperatureC?: number;
  chlorophyllMgM3?: number;

  turbidity?: number;
  oceanColour?: number;

  satellite?: string;
  sensor?: string;

  observationTime?: string;

  cloudCover?: number;

  source: "ISRO";
}

export interface ISROAdapter {
  getSatelliteObservations(
    request: RetrievalRequest
  ): Promise<
    RetrievalResult<ISROSatelliteRecord>
  >;
}

/**
 * ISRO satellite-data integration boundary.
 *
 * This adapter does not fabricate satellite
 * observations. It remains unavailable until
 * a supported live source is connected.
 */
export const isroAdapter: ISROAdapter = {
  async getSatelliteObservations(
    request
  ): Promise<
    RetrievalResult<ISROSatelliteRecord>
  > {
    void request;

    return {
      sourceId: "isro",

      sourceName:
        "Indian Space Research Organisation",

      domain: "ocean",

      status: "empty",

      records: [],

      recordCount: 0,

      retrievedAt:
        new Date().toISOString(),

      local: false,

      message:
        "ISRO live satellite-data adapter is not connected. Sagar will continue using the configured prototype ocean and remote-sensing datasets.",
    };
  },
};

export async function getISROSatelliteObservations(
  request: RetrievalRequest
): Promise<
  RetrievalResult<ISROSatelliteRecord>
> {
  return isroAdapter.getSatelliteObservations(
    request
  );
}

export function isISROAdapterConfigured(): boolean {
  return false;
}

export default isroAdapter;