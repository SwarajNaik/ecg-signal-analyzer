import type { AnalysisResult, ECGData, FilterConfig } from "./types";
import { analyzeWithBrowserPython } from "./pythonAnalyzer";

export const DEFAULT_CONFIG: FilterConfig = {
  highpass_hz: 0.5,
  lowpass_hz: 40,
  notch_hz: 50,
  filter_order: 4
};

export function createDemo(duration = 12, samplingRate = 250, bpm = 72): ECGData {
  const count = Math.floor(duration * samplingRate);
  const samples = Array.from({ length: count }, (_, index) => {
    const t = index / samplingRate;
    let value = 0.08 * Math.sin(2 * Math.PI * 0.28 * t);
    const period = 60 / bpm;
    for (let beat = 0.6; beat < duration; beat += period) {
      value += 0.1 * gaussian(t, beat - 0.18, 0.035);
      value -= 0.15 * gaussian(t, beat - 0.025, 0.012);
      value += 1.1 * gaussian(t, beat, 0.014);
      value -= 0.22 * gaussian(t, beat + 0.025, 0.014);
      value += 0.28 * gaussian(t, beat + 0.25, 0.06);
    }
    const deterministicNoise = 0.018 * Math.sin(2 * Math.PI * 50 * t) + 0.012 * Math.sin(index * 1.731);
    return value + deterministicNoise;
  });
  return { samples, samplingRate, name: "Synthetic 72 BPM demonstration", source: "demo" };
}

function gaussian(time: number, center: number, width: number): number {
  return Math.exp(-0.5 * ((time - center) / width) ** 2);
}

export function validateConfig(samplingRate: number, config: FilterConfig): void {
  const nyquist = samplingRate / 2;
  if (!Number.isFinite(samplingRate) || samplingRate <= 0) throw new Error("Sampling frequency must be positive.");
  if (!Number.isFinite(config.highpass_hz) || !Number.isFinite(config.lowpass_hz)) {
    throw new Error("Filter cutoffs must be finite numbers.");
  }
  if (config.highpass_hz < 0 || config.highpass_hz >= config.lowpass_hz) {
    throw new Error("High-pass cutoff must be lower than low-pass cutoff.");
  }
  if (config.lowpass_hz >= nyquist) throw new Error("Low-pass cutoff must be below the Nyquist frequency.");
  if (config.notch_hz !== null) {
    if (!Number.isFinite(config.notch_hz) || config.notch_hz <= 0) {
      throw new Error("Notch frequency must be a positive finite number.");
    }
    if (config.notch_hz >= nyquist) throw new Error("Notch frequency must be below the Nyquist frequency.");
  }
  if (!Number.isInteger(config.filter_order) || config.filter_order < 1 || config.filter_order > 8) {
    throw new Error("Filter order must be an integer from 1 to 8.");
  }
}

export async function analyze(
  data: ECGData,
  config: FilterConfig,
  onProgress?: (message: string) => void
): Promise<{ result: AnalysisResult; mode: string }> {
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    try {
      const response = await fetch("/api/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples: data.samples, sampling_rate_hz: data.samplingRate, config })
      });
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        throw new Error(payload.detail ?? "Backend analysis failed.");
      }
      return { result: (await response.json()) as AnalysisResult, mode: "Python / SciPy backend" };
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      onProgress?.("Local API unavailable; starting browser Python…");
    }
  }
  const result = await analyzeWithBrowserPython(data, config, onProgress);
  return { result, mode: "Python / SciPy in a private browser worker" };
}

