import { analyzeLocally, createDemo, DEFAULT_CONFIG, validateConfig } from "./analysis";

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
});

