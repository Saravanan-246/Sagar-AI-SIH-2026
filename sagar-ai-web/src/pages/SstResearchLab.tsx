import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, Info, Loader, MapPin } from "lucide-react";

import AppShell from "../components/layout/AppShell";
import PageContainer from "../components/layout/PageContainer";
import AskSagarButton from "../components/chat/AskSagarButton";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import {
  fetchSstPrediction,
  type SstDataReadiness,
  type SstPredictionSuccess,
} from "../services/api/sagarApiClient";
import "./SstResearchLab.css";

type LocationPreset = {
  name: string;
  latitude: number;
  longitude: number;
};

const LOCATION_PRESETS: LocationPreset[] = [
  { name: "Thoothukudi", latitude: 8.76, longitude: 78.13 },
  { name: "Central Gulf of Mannar", latitude: 8.85, longitude: 78.6 },
  { name: "Northern Gulf of Mannar", latitude: 9.1, longitude: 78.8 },
  { name: "Southern Gulf of Mannar", latitude: 8.4, longitude: 78.2 },
];

function formatTimestamp(iso: string): string {
  const parsed = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildResearchPrompt(locationName: string, prediction: SstPredictionSuccess): string {
  const top = prediction.featureContributions.slice(0, 3).map((f) => f.feature).join(", ");
  return (
    `In the SST Intelligence Lab, at ${locationName} the current sea-surface temperature is ${prediction.currentSst}°C ` +
    `(Open-Meteo model reading, ${formatTimestamp(prediction.sstObservedAt)}) and the model predicts ${prediction.predictedSst}°C in ${prediction.predictionHorizon} ` +
    `(${prediction.modelInfo.validationLabel}, test MAE ${prediction.modelInfo.metrics.test.mae}°C vs persistence baseline ${prediction.modelInfo.baseline.test.mae}°C). ` +
    `The top contributing factors were: ${top}. What should I understand from this for fishing conditions?`
  );
}

export default function SstResearchLab({ embedded = false }: { embedded?: boolean }) {
  const [selectedLocation, setSelectedLocation] = useState<LocationPreset>(LOCATION_PRESETS[0]!);
  const [customLat, setCustomLat] = useState(selectedLocation.latitude);
  const [customLon, setCustomLon] = useState(selectedLocation.longitude);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<SstPredictionSuccess | null>(null);
  const [readiness, setReadiness] = useState<SstDataReadiness | null>(null);

  // Guards against a stale response overwriting a newer one if the
  // user changes location and re-submits before the first request
  // resolves - only the most recently started request may commit state.
  const requestIdRef = useRef(0);

  useEffect(() => {
    setCustomLat(selectedLocation.latitude);
    setCustomLon(selectedLocation.longitude);
  }, [selectedLocation]);

  const handlePredict = async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setPrediction(null);
    setReadiness(null);
    try {
      const result = await fetchSstPrediction(customLat, customLon);
      if (requestIdRef.current !== requestId) return;
      if (result.status === "success") {
        setPrediction(result);
      } else if (result.status === "insufficient_data") {
        setReadiness(result.data);
      } else {
        setError("Prediction failed");
      }
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError((err as Error).message || "Failed to fetch prediction");
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  };

  const locationLabel =
    LOCATION_PRESETS.find((p) => p.latitude === customLat && p.longitude === customLon)?.name ??
    `${customLat}, ${customLon}`;

  return (
    <AppShell>
      <PageContainer>
        <div className="sst-lab-container">
          <header className="sst-lab-header">
            <h1>SST Intelligence Lab</h1>
            <p className="sst-lab-subtitle">
              Research tool: real historical marine/weather data, a real trained model, and honest validation -
              not a production forecast.
            </p>
          </header>

          <section className="sst-lab-section">
            <h2>Location</h2>
            <div className="sst-lab-location-presets">
              {LOCATION_PRESETS.map((loc) => (
                <button
                  key={loc.name}
                  className={`sst-lab-location-btn ${selectedLocation.name === loc.name ? "active" : ""}`}
                  onClick={() => setSelectedLocation(loc)}
                >
                  <MapPin size={16} />
                  {loc.name}
                </button>
              ))}
            </div>

            <div className="sst-lab-location-custom">
              <label>
                Latitude:
                <input
                  type="number"
                  step={0.01}
                  value={customLat}
                  onChange={(e) => setCustomLat(parseFloat(e.target.value))}
                  placeholder="8.76"
                />
              </label>
              <label>
                Longitude:
                <input
                  type="number"
                  step={0.01}
                  value={customLon}
                  onChange={(e) => setCustomLon(parseFloat(e.target.value))}
                  placeholder="78.13"
                />
              </label>
              <Button variant="primary" onClick={handlePredict} disabled={loading} fullWidth>
                {loading ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    Checking data & training model...
                  </>
                ) : (
                  "Check Data & Predict SST"
                )}
              </Button>
            </div>

            {error && (
              <div className="sst-lab-error">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
          </section>

          {readiness && (
            <section className="sst-lab-section">
              <h2>Data Readiness</h2>
              <div className="sst-lab-readiness">
                <div className="sst-lab-readiness-title">
                  <Info size={16} />
                  Training dataset insufficient
                </div>
                <p>{readiness.reason}</p>
                <div className="sst-lab-meta">
                  <div>Location: {readiness.latitude}, {readiness.longitude}</div>
                  <div>Historical window checked: {readiness.historicalWindow.start} to {readiness.historicalWindow.end}</div>
                  <div>Hourly rows fetched: {readiness.totalHourlyRowsFetched}</div>
                  <div>Usable (complete) rows: {readiness.usableRows} (minimum required: {readiness.minimumRequiredRows})</div>
                </div>
                <p className="sst-lab-readiness-note">
                  No prediction is shown for this location - this is an honest data-availability result, not an
                  error. Try one of the Gulf of Mannar presets above, which have verified year-round coverage.
                </p>
              </div>
            </section>
          )}

          {prediction && (
            <>
              <section className="sst-lab-section">
                <h2>Current SST</h2>
                <div className="sst-lab-grid sst-lab-grid-2">
                  <div className="sst-lab-card">
                    <span className="sst-lab-label">Sea-Surface Temperature</span>
                    <div className="sst-lab-large-value">{prediction.currentSst}°C</div>
                    <div className="sst-lab-meta">
                      <div>Source: {prediction.sourceMetadata.marineProvider} ({prediction.sourceMetadata.marineType})</div>
                      <div>Model reading: {formatTimestamp(prediction.sstObservedAt)}</div>
                      <div>Fetched: {formatTimestamp(prediction.sstFetchedAt)}</div>
                    </div>
                  </div>

                  <div className="sst-lab-card">
                    <span className="sst-lab-label">Predicted SST ({prediction.predictionHorizon})</span>
                    <div className="sst-lab-large-value">{prediction.predictedSst}°C</div>
                    <div className="sst-lab-meta">
                      {prediction.uncertainty && (
                        <div>
                          Typical range: {prediction.uncertainty.lower}°C - {prediction.uncertainty.upper}°C
                        </div>
                      )}
                      <div>Generated: {formatTimestamp(prediction.predictionGeneratedAt)}</div>
                      <Badge tone={prediction.modelInfo.validated ? "success" : "warning"} size="sm">
                        {prediction.modelInfo.validationLabel}
                      </Badge>
                    </div>
                  </div>
                </div>
              </section>

              <section className="sst-lab-section">
                <h2>Environmental Factors</h2>
                <p className="sst-lab-section-note">
                  Model-estimated conditions this prediction was built from, at {locationLabel} - Open-Meteo's own
                  marine/weather model output, not a sensor observation.
                </p>
                <div className="sst-lab-factor-grid">
                  {prediction.featureContributions.map((fc) => (
                    <div key={fc.feature} className="sst-lab-factor">
                      <span className="sst-lab-factor-label">{fc.feature}</span>
                      <span className="sst-lab-factor-value">
                        {fc.value}
                        {fc.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="sst-lab-section">
                <h2>Why This Prediction?</h2>
                <div className="sst-lab-disclaimer">
                  Feature contributions show how model inputs influenced this prediction; they are{" "}
                  <strong>not proof of physical causation</strong>. Method: {prediction.contributionMethod}.
                </div>
                <div className="sst-lab-contributions">
                  {prediction.featureContributions.map((fc) => (
                    <div key={fc.feature} className="sst-lab-contribution">
                      <div className="sst-lab-contrib-header">
                        <span>{fc.feature}</span>
                        <Badge
                          tone={
                            fc.direction === "positive" ? "success" : fc.direction === "negative" ? "danger" : "neutral"
                          }
                        >
                          {`${fc.direction === "positive" ? "+" : fc.direction === "negative" ? "−" : "~"}${Math.abs(fc.contribution).toFixed(3)}°C`}
                        </Badge>
                      </div>
                      <div className="sst-lab-contrib-value">
                        {fc.value}
                        {fc.unit}
                      </div>
                      <div className="sst-lab-contrib-bar">
                        <div
                          className={`sst-lab-contrib-bar-fill sst-lab-contrib-bar-${fc.direction}`}
                          style={{ width: `${Math.min(Math.abs(fc.contribution) * 40, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="sst-lab-section">
                <h2>Model Performance</h2>
                <div className="sst-lab-validation-banner">
                  <Badge tone={prediction.modelInfo.validated ? "success" : "warning"}>
                    {prediction.modelInfo.validationLabel}
                  </Badge>
                  <span>{prediction.modelInfo.validationReason}</span>
                </div>

                <div className="sst-lab-grid sst-lab-grid-3">
                  <div className="sst-lab-metric">
                    <span className="sst-lab-metric-label">MAE (Test)</span>
                    <div className="sst-lab-metric-value">{prediction.modelInfo.metrics.test.mae.toFixed(3)}°C</div>
                    <div className="sst-lab-metric-baseline">baseline {prediction.modelInfo.baseline.test.mae.toFixed(3)}°C</div>
                  </div>
                  <div className="sst-lab-metric">
                    <span className="sst-lab-metric-label">RMSE (Test)</span>
                    <div className="sst-lab-metric-value">{prediction.modelInfo.metrics.test.rmse.toFixed(3)}°C</div>
                    <div className="sst-lab-metric-baseline">baseline {prediction.modelInfo.baseline.test.rmse.toFixed(3)}°C</div>
                  </div>
                  <div className="sst-lab-metric">
                    <span className="sst-lab-metric-label">R² (Test)</span>
                    <div className="sst-lab-metric-value">{prediction.modelInfo.metrics.test.r2.toFixed(3)}</div>
                    <div className="sst-lab-metric-baseline">baseline {prediction.modelInfo.baseline.test.r2.toFixed(3)}</div>
                  </div>
                </div>

                <h3>Train / Validation / Test Split (time-aware, no shuffling)</h3>
                <div className="sst-lab-period-grid">
                  <div className="sst-lab-period">
                    <span className="sst-lab-label">Training</span>
                    <div>{prediction.modelInfo.trainingPeriod.rows} rows</div>
                    <div className="sst-lab-meta">
                      {formatTimestamp(prediction.modelInfo.trainingPeriod.start)} to {formatTimestamp(prediction.modelInfo.trainingPeriod.end)}
                    </div>
                    <div>MAE {prediction.modelInfo.metrics.train.mae.toFixed(3)}°C · R² {prediction.modelInfo.metrics.train.r2.toFixed(3)}</div>
                  </div>
                  <div className="sst-lab-period">
                    <span className="sst-lab-label">Validation</span>
                    <div>{prediction.modelInfo.validationPeriod.rows} rows</div>
                    <div className="sst-lab-meta">
                      {formatTimestamp(prediction.modelInfo.validationPeriod.start)} to {formatTimestamp(prediction.modelInfo.validationPeriod.end)}
                    </div>
                    <div>MAE {prediction.modelInfo.metrics.validation.mae.toFixed(3)}°C · R² {prediction.modelInfo.metrics.validation.r2.toFixed(3)}</div>
                  </div>
                  <div className="sst-lab-period">
                    <span className="sst-lab-label">Test</span>
                    <div>{prediction.modelInfo.testPeriod.rows} rows</div>
                    <div className="sst-lab-meta">
                      {formatTimestamp(prediction.modelInfo.testPeriod.start)} to {formatTimestamp(prediction.modelInfo.testPeriod.end)}
                    </div>
                    <div>MAE {prediction.modelInfo.metrics.test.mae.toFixed(3)}°C · R² {prediction.modelInfo.metrics.test.r2.toFixed(3)}</div>
                  </div>
                </div>

                <h3>Global Feature Importance (permutation, validation set)</h3>
                <div className="sst-lab-importance-list">
                  {prediction.modelInfo.permutationImportance.slice(0, 6).map((entry) => (
                    <div key={entry.feature} className="sst-lab-importance-row">
                      <span>#{entry.rank} {entry.label}</span>
                      <span>{entry.importance >= 0 ? "+" : ""}{entry.importance.toFixed(3)}°C MAE</span>
                    </div>
                  ))}
                </div>
                <p className="sst-lab-section-note">
                  Algorithm: {prediction.modelInfo.algorithm}. Trained {formatTimestamp(prediction.modelInfo.trainedAt)}.
                </p>
              </section>

              <section className="sst-lab-section">
                <h2>Data & Evidence</h2>
                <div className="sst-lab-grid sst-lab-grid-2">
                  <div className="sst-lab-card">
                    <span className="sst-lab-label">Weather Data</span>
                    <div className="sst-lab-meta">
                      <div>Provider: {prediction.sourceMetadata.weatherProvider}</div>
                      <div>Dataset: {prediction.sourceMetadata.weatherDataset}</div>
                      <div>Type: {prediction.sourceMetadata.weatherType}</div>
                    </div>
                  </div>
                  <div className="sst-lab-card">
                    <span className="sst-lab-label">Marine Data</span>
                    <div className="sst-lab-meta">
                      <div>Provider: {prediction.sourceMetadata.marineProvider}</div>
                      <div>Dataset: {prediction.sourceMetadata.marineDataset}</div>
                      <div>Type: {prediction.sourceMetadata.marineType}</div>
                    </div>
                  </div>
                </div>
                <div className="sst-lab-meta sst-lab-attribution">{prediction.sourceMetadata.attribution}</div>

                <div className="sst-lab-limitations">
                  <h3>Limitations</h3>
                  <ul>
                    {prediction.limitations.map((lim, idx) => (
                      <li key={idx}>{lim}</li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="sst-lab-section">
                <h2>Research Question</h2>
                <p className="sst-lab-section-note">
                  Ask Sagar to discuss this specific result in Chat - it narrates the numbers already computed
                  above, it does not recalculate them.
                </p>
                <AskSagarButton
                  prompt={buildResearchPrompt(locationLabel, prediction)}
                  label="Ask Sagar about this result"
                  fullWidth
                />
              </section>
            </>
          )}
        </div>
      </PageContainer>
    </AppShell>
  );
}
