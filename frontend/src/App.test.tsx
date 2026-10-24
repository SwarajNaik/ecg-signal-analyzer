import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import type { AnalysisResult, ECGData } from "./types";

const pythonMocks = vi.hoisted(() => ({ analyzeWithBrowserPython: vi.fn() }));

vi.mock("./pythonAnalyzer", () => pythonMocks);

function resultFor(data: ECGData): AnalysisResult {
  return {
    sampling_rate_hz: data.samplingRate,
    duration_seconds: data.samples.length / data.samplingRate,
    filtered_samples: data.samples,
    peak_indices: [150, 358, 567],
    peak_times_seconds: [0.6, 1.432, 2.268],
    rr_intervals_seconds: [0.832, 0.836],
    instantaneous_bpm: [72.115, 71.77],
    median_bpm: 71.94,
    mean_bpm: 71.94,
    beat_count: 3,
    warnings: []
  };
}

vi.mock("plotly.js-basic-dist-min", () => ({
  default: { react: vi.fn(), purge: vi.fn(), Plots: { resize: vi.fn() } }
}));

describe("App", () => {
  beforeEach(() => {
    pythonMocks.analyzeWithBrowserPython.mockImplementation(async (data: ECGData) => resultFor(data));
  });

  it("loads and analyzes the demonstration", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load demonstration ecg/i }));
    expect(screen.getByText(/synthetic 72 bpm demonstration/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /analyze ecg/i }));
    await waitFor(() => expect(screen.getByText(/analysis complete/i)).toBeInTheDocument());
    expect(screen.getByText(/detected beats/i)).toBeInTheDocument();
  });

  it("ignores an analysis result after reset", async () => {
    let resolveAnalysis!: (result: AnalysisResult) => void;
    pythonMocks.analyzeWithBrowserPython.mockReturnValueOnce(new Promise((resolve) => {
      resolveAnalysis = resolve;
    }));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load demonstration ecg/i }));
    fireEvent.click(screen.getByRole("button", { name: /analyze ecg/i }));
    await waitFor(() => expect(pythonMocks.analyzeWithBrowserPython).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    const data = pythonMocks.analyzeWithBrowserPython.mock.calls[0][0] as ECGData;
    resolveAnalysis(resultFor(data));
    await waitFor(() => expect(screen.getByText(/workspace is ready/i)).toBeInTheDocument());
    expect(screen.queryByText(/analysis complete/i)).not.toBeInTheDocument();
  });
});

