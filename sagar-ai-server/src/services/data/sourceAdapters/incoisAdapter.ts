import type {
  RetrievalRequest,
  RetrievalResult,
} from "../dataRetrieval";

export interface INCOISOceanRecord {
  id: string;

  location: string;

  latitude?: number;
  longitude?: number;

  seaSurfaceTemperatureC?: number;
  chlorophyllMgM3?: number;

  waveHeightM?: number;
  waveDirection?: string;

  productivityIndex?: number;
  productivitySignal?: string;

  fishingAdvisory?: string;

  issuedAt?: string;
  validUntil?: string;

  source: "INCOIS";
}

export interface INCOISAdapter {
  getOceanInformation(
    request: RetrievalRequest
  ): Promise<
    RetrievalResult<INCOISOceanRecord>
  >;
}

/**
 * INCOIS integration boundary.
 *
 * No live INCOIS endpoint is claimed here.
 * The adapter is intentionally kept as a clean
 * integration point for a future supported API.
 */
export const incoisAdapter: INCOISAdapter = {
  async getOceanInformation(
    request
  ): Promise<
    RetrievalResult<INCOISOceanRecord>
  > {
    void request;

    return {
      sourceId: "incois",

      sourceName:
        "Indian National Centre for Ocean Information Services",

      domain: "marine",

      status: "empty",

      records: [],

      recordCount: 0,

      retrievedAt:
        new Date().toISOString(),

      local: false,

      message:
        "INCOIS live ocean-information adapter is not connected. Sagar will continue using the configured prototype ocean datasets.",
    };
  },
};

export async function getINCOISOceanInformation(
  request: RetrievalRequest
): Promise<
  RetrievalResult<INCOISOceanRecord>
> {
  return incoisAdapter.getOceanInformation(
    request
  );
}

export function isINCOISAdapterConfigured(): boolean {
  return false;
}

export default incoisAdapter;