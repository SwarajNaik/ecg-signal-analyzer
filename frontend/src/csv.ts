import type { ECGData } from "./types";

export async function parseECGFile(file: File, fallbackSamplingRate: number): Promise<ECGData> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) throw new Error("The CSV must include a header and at least two data rows.");

  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map((header) => header.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => line.split(delimiter).map((cell) => Number(cell.trim())));
  const timeIndex = headers.findIndex((header) => /^(time|timestamp|seconds|time_s)$/.test(header));
  let signalIndex = headers.findIndex((header) => /(ecg|amplitude|signal|lead)/.test(header));
  if (signalIndex < 0) signalIndex = timeIndex === 0 && headers.length > 1 ? 1 : 0;
  const samples = rows.map((row) => row[signalIndex]);
  if (samples.some((sample) => !Number.isFinite(sample))) {
    throw new Error(`Column “${headers[signalIndex]}” contains non-numeric or missing values.`);
  }

  let samplingRate = fallbackSamplingRate;
  if (timeIndex >= 0) {
    const times = rows.map((row) => row[timeIndex]);
    const differences = times.slice(1).map((time, index) => time - times[index]);
    if (differences.some((difference) => !Number.isFinite(difference) || difference <= 0)) {
      throw new Error("Time values must be numeric and strictly increasing.");
    }
    const sorted = [...differences].sort((a, b) => a - b);
    const medianDifference = sorted[Math.floor(sorted.length / 2)];
    samplingRate = 1 / medianDifference;
    const maxDeviation = Math.max(...differences.map((value) => Math.abs(value - medianDifference)));
    if (maxDeviation > medianDifference * 0.05) {
      throw new Error("Time values are too irregular to infer a reliable sampling frequency.");
    }
  }
  if (!Number.isFinite(samplingRate) || samplingRate <= 0) throw new Error("Enter a valid sampling frequency.");
  return { samples, samplingRate, name: file.name, source: "upload" };
}

