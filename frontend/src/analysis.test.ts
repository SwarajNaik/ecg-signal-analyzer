import { analyzeLocally, createDemo, DEFAULT_CONFIG, validateConfig } from "./analysis";

function toneAmplitude(samples: number[], samplingRate: number, frequency: number): number {
  const trim = Math.round(samplingRate);
  const values = samples.slice(trim, -trim);
  const cosine = values.reduce((sum, value, index) => sum + value * Math.cos(2 * Math.PI * frequency * (index + trim) / samplingRate), 0);
  const sine = values.reduce((sum, value, index) => sum + value * Math.sin(2 * Math.PI * frequency * (index + trim) / samplingRate), 0);
  return 2 * Math.hypot(cosine, sine) / values.length;
}

describe("browser ECG analyzer", () => {
  it("estimates the demonstration rate", () => {
    const result = analyzeLocally(createDemo(20, 250, 72), DEFAULT_CONFIG);
    expect(result.beat_count).toBeGreaterThan(20);
    expect(result.median_bpm).toBeGreaterThanOrEqual(70);
    expect(result.median_bpm).toBeLessThanOrEqual(74);
  });

  it("rejects a cutoff above Nyquist", () => {
    expect(() => validateConfig(80, DEFAULT_CONFIG)).toThrow(/Nyquist/);
  });

  it.each([50, 60])("attenuates a %i Hz tone only when the matching notch is enabled", (frequency) => {
    const samplingRate = 250;
    const samples = Array.from({ length: samplingRate * 8 }, (_, index) => {
      const time = index / samplingRate;
      return Math.sin(2 * Math.PI * 10 * time) + 0.5 * Math.sin(2 * Math.PI * frequency * time);
    });
    const data = { samples, samplingRate, name: "notch test", source: "demo" as const };
    const config = { ...DEFAULT_CONFIG, lowpass_hz: 100, filter_order: 2 };
    const withoutNotch = analyzeLocally(data, { ...config, notch_hz: null });
    const withNotch = analyzeLocally(data, { ...config, notch_hz: frequency });

    expect(toneAmplitude(withNotch.filtered_samples, samplingRate, frequency)).toBeLessThan(
      toneAmplitude(withoutNotch.filtered_samples, samplingRate, frequency) * 0.1
    );
  });

  it.each([null, 50, 60])("keeps the demonstration BPM stable with notch %s", (notch_hz) => {
    const result = analyzeLocally(createDemo(20, 250, 72), { ...DEFAULT_CONFIG, notch_hz });
    expect(result.median_bpm).toBeGreaterThanOrEqual(70);
    expect(result.median_bpm).toBeLessThanOrEqual(74);
  });

  it("allows notch off at 100 Hz but rejects a 50 Hz notch at Nyquist", () => {
    expect(() => validateConfig(100, { ...DEFAULT_CONFIG, notch_hz: null })).not.toThrow();
    expect(() => validateConfig(100, DEFAULT_CONFIG)).toThrow(/Nyquist/);
  });

  it("rejects non-finite cutoffs and invalid filter orders", () => {
    expect(() => validateConfig(250, { ...DEFAULT_CONFIG, lowpass_hz: Number.NaN })).toThrow(/finite/);
    expect(() => validateConfig(250, { ...DEFAULT_CONFIG, notch_hz: Number.POSITIVE_INFINITY })).toThrow(/finite/);
    expect(() => validateConfig(250, { ...DEFAULT_CONFIG, filter_order: 0 })).toThrow(/order/);
  });
});

