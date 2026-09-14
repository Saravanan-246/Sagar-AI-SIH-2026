export interface LocalMarineData {
  latitude: number;
  longitude: number;

  temperature?: number;
  windSpeed?: number;
  windDirection?: number;
  waveHeight?: number;
  wavePeriod?: number;
  waveDirection?: number;

  seaSurfaceTemperature?: number;
  currentSpeed?: number;
  currentDirection?: number;

  source: "LOCAL";
  timestamp: string;
}

export interface LocalAdapterOptions {
  storageKey?: string;
}

export class LocalAdapter {
  private readonly storageKey: string;

  constructor(
    options: LocalAdapterOptions = {}
  ) {
    this.storageKey =
      options.storageKey ??
      "sagar-ai-marine-data";
  }

  saveData(data: LocalMarineData): boolean {
    try {
      if (
        typeof localStorage === "undefined"
      ) {
        return false;
      }

      localStorage.setItem(
        this.storageKey,
        JSON.stringify(data)
      );

      return true;
    } catch (error) {
      console.error(
        "LocalAdapter save error:",
        error
      );

      return false;
    }
  }

  getData(): LocalMarineData | null {
    try {
      if (
        typeof localStorage === "undefined"
      ) {
        return null;
      }

      const storedData =
        localStorage.getItem(
          this.storageKey
        );

      if (!storedData) {
        return null;
      }

      return JSON.parse(
        storedData
      ) as LocalMarineData;
    } catch (error) {
      console.error(
        "LocalAdapter read error:",
        error
      );

      return null;
    }
  }

  clearData(): void {
    try {
      if (
        typeof localStorage === "undefined"
      ) {
        return;
      }

      localStorage.removeItem(
        this.storageKey
      );
    } catch (error) {
      console.error(
        "LocalAdapter clear error:",
        error
      );
    }
  }

  hasData(): boolean {
    return this.getData() !== null;
  }

  getLastUpdated(): string | null {
    const data = this.getData();

    return data?.timestamp ?? null;
  }

  isOfflineAvailable(): boolean {
    return this.hasData();
  }
}

export const localAdapter =
  new LocalAdapter();