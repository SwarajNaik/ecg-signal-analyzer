import { createDemo, DEFAULT_CONFIG, validateConfig } from "./analysis";

describe("browser ECG analyzer", () => {
  it("creates a deterministic demonstration signal", () => {
    expect(createDemo()).toEqual(createDemo());
    expect(createDemo().samples).toHaveLength(3000);
  });

  it("rejects a cutoff above Nyquist", () => {
    expect(() => validateConfig(80, DEFAULT_CONFIG)).toThrow(/Nyquist/);
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

