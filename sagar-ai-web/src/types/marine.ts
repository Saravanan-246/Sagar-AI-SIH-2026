export type RiskLevel =
  | "low"
  | "moderate"
  | "high"
  | "critical";

export type SeaState =
  | "calm"
  | "slight"
  | "moderate"
  | "rough"
  | "very_rough";

export type ProductivitySignal =
  | "low"
  | "moderate"
  | "favourable"
  | "high";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface MarineConditions {
  airTemperatureC: number;

  windSpeedKnots: number;
  windDirection: string;

  waveHeightM: number;
  waveDirection: string;

  seaState: SeaState;

  visibilityKm: number;

  rainProbability: number;
  cloudCover: number;
}

export interface TideInfo {
  currentState:
    | "rising"
    | "falling"
    | "high"
    | "low";

  currentHeightM?: number;

  nextHigh: {
    time: string;
    heightM: number;
  };

  nextLow: {
    time: string;
    heightM: number;
  };
}

export interface MarineIndicators {
  seaSurfaceTemperatureC: number;
  chlorophyllMgM3: number;
  productivitySignal: ProductivitySignal;
  productivityIndex?: number;
}

export interface MarineHazards {
  lightning: boolean;
  cyclone: boolean;
  roughSea: boolean;
  strongWind: boolean;

  visibilityRisk?: boolean;
}

export interface MarineSafety {
  overallRisk: RiskLevel;
  riskScore: number;

  recommendation: string;

  smallCraftSuitability:
    | "favourable"
    | "caution"
    | "not_recommended"
    | "unsafe";
}

export interface MarineArea {
  id: string;
  name: string;

  region?: string;

  coordinates: Coordinates;

  conditions: MarineConditions;

  tide: TideInfo;

  marineIndicators: MarineIndicators;

  hazards: MarineHazards;

  safety: MarineSafety;

  updatedAt?: string;

  metadata?: Record<string, unknown>;
}

export interface MarineSummary {
  areaId: string;
  areaName: string;

  riskLevel: RiskLevel;
  riskScore: number;

  seaState: SeaState;
  windSpeedKnots: number;
  waveHeightM: number;

  seaSurfaceTemperatureC: number;
  chlorophyllMgM3: number;

  productivitySignal: ProductivitySignal;

  recommendation: string;
}