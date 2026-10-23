import type { AnalysisResult, ECGData, FilterConfig } from "./types";

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

function rcLowpass(values: number[], cutoff: number, fs: number): number[] {
  const dt = 1 / fs;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = dt / (rc + dt);
  const output = new Array<number>(values.length);
  output[0] = values[0];
  for (let index = 1; index < values.length; index += 1) {
    output[index] = output[index - 1] + alpha * (values[index] - output[index - 1]);
  }
  return output;
}

function rcHighpass(values: number[], cutoff: number, fs: number): number[] {
  if (cutoff <= 0) return [...values];
  const dt = 1 / fs;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = rc / (rc + dt);
  const output = new Array<number>(values.length);
  output[0] = 0;
  for (let index = 1; index < values.length; index += 1) {
    output[index] = alpha * (output[index - 1] + values[index] - values[index - 1]);
  }
  return output;
}

function zeroPhase(values: number[], filter: (input: number[]) => number[]): number[] {
  const forward = filter(values);
  return filter([...forward].reverse()).reverse();
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function validateConfig(samplingRate: number, config: FilterConfig): void {
  const nyquist = samplingRate / 2;
  if (!Number.isFinite(samplingRate) || samplingRate <= 0) throw new Error("Sampling frequency must be positive.");
  if (config.highpass_hz < 0 || config.highpass_hz >= config.lowpass_hz) {
    throw new Error("High-pass cutoff must be lower than low-pass cutoff.");
  }
  if (config.lowpass_hz >= nyquist) throw new Error("Low-pass cutoff must be below the Nyquist frequency.");
  if (config.notch_hz !== null && config.notch_hz >= nyquist) {
    throw new Error("Notch frequency must be below the Nyquist frequency.");
  }
}

export function analyzeLocally(data: ECGData, config: FilterConfig): AnalysisResult {
  validateConfig(data.samplingRate, config);
  if (data.samples.length < data.samplingRate) throw new Error("At least one second of ECG data is required.");
  if (data.samples.some((sample) => !Number.isFinite(sample))) throw new Error("The ECG contains invalid values.");
  const range = Math.max(...data.samples) - Math.min(...data.samples);
  if (range <= Number.EPSILON) throw new Error("The ECG signal is flat.");

  const offset = median(data.samples);
  let filtered = data.samples.map((value) => value - offset);
  const repeats = Math.max(1, Math.min(4, Math.round(config.filter_order / 2)));
  for (let pass = 0; pass < repeats; pass += 1) {
    filtered = zeroPhase(filtered, (values) => rcHighpass(values, config.highpass_hz, data.samplingRate));
    filtered = zeroPhase(filtered, (values) => rcLowpass(values, config.lowpass_hz, data.samplingRate));
  }

  const absolute = filtered.map(Math.abs);
  const sorted = [...absolute].sort((a, b) => a - b);
  const q90 = sorted[Math.floor(sorted.length * 0.9)];
  const q99 = sorted[Math.floor(sorted.length * 0.99)];
  const threshold = q90 + 0.35 * (q99 - q90);
  const refractory = Math.max(1, Math.round(0.25 * data.samplingRate));
  const candidates: number[] = [];
  for (let index = 1; index < absolute.length - 1; index += 1) {
    if (absolute[index] >= threshold && absolute[index] > absolute[index - 1] && absolute[index] >= absolute[index + 1]) {
      if (!candidates.length || index - candidates[candidates.length - 1] >= refractory) {
        candidates.push(index);
      } else if (absolute[index] > absolute[candidates[candidates.length - 1]]) {
        candidates[candidates.length - 1] = index;
      }
    }
  }

  const rr = candidates.slice(1).map((peak, index) => (peak - candidates[index]) / data.samplingRate);
  const bpm = rr.map((interval) => 60 / interval);
  const warnings: string[] = [];
  if (candidates.length < 2) warnings.push("Insufficient beats were detected to calculate heart rate.");
  if (bpm.some((value) => value < 30 || value > 220)) {
    warnings.push("Some RR intervals fall outside the educational review range.");
  }

  return {
    sampling_rate_hz: data.samplingRate,
    duration_seconds: data.samples.length / data.samplingRate,
    filtered_samples: filtered,
    peak_indices: candidates,
    peak_times_seconds: candidates.map((index) => index / data.samplingRate),
    rr_intervals_seconds: rr,
    instantaneous_bpm: bpm,
    median_bpm: bpm.length ? median(bpm) : null,
    mean_bpm: bpm.length ? bpm.reduce((sum, value) => sum + value, 0) / bpm.length : null,
    beat_count: candidates.length,
    warnings
  };
}

export async function analyze(data: ECGData, config: FilterConfig): Promise<{ result: AnalysisResult; mode: string }> {
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
    }
  }
  return { result: analyzeLocally(data, config), mode: "Private in-browser analysis" };
}

