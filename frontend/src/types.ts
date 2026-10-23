export interface FilterConfig {
  highpass_hz: number;
  lowpass_hz: number;
  notch_hz: number | null;
  filter_order: number;
}

export interface ECGData {
  samples: number[];
  samplingRate: number;
  name: string;
  source: "demo" | "upload";
}

export interface AnalysisResult {
  sampling_rate_hz: number;
  duration_seconds: number;
  filtered_samples: number[];
  peak_indices: number[];
  peak_times_seconds: number[];
  rr_intervals_seconds: number[];
  instantaneous_bpm: number[];
  median_bpm: number | null;
  mean_bpm: number | null;
  beat_count: number;
  warnings: string[];
}

