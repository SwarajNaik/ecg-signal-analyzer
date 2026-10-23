import { useEffect, useRef } from "react";
import Plotly from "plotly.js-basic-dist-min";
import type { AnalysisResult, ECGData } from "./types";

interface Props {
  data: ECGData;
  result: AnalysisResult | null;
}

const chartTokens = {
  raw: "#82928f",
  filtered: "#17837b",
  peak: "#d45d50",
  paper: "#fffefa",
  text: "#667674",
  grid: "#e3e6e0"
};

function thin(values: number[], samplingRate: number, maxPoints = 6000) {
  const step = Math.max(1, Math.ceil(values.length / maxPoints));
  const x: number[] = [];
  const y: number[] = [];
  for (let index = 0; index < values.length; index += step) {
    x.push(index / samplingRate);
    y.push(values[index]);
  }
  return { x, y };
}

export function ECGChart({ data, result }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const raw = thin(data.samples, data.samplingRate);
  const filtered = result ? thin(result.filtered_samples, data.samplingRate) : null;
  const traces: Plotly.Data[] = [
    {
      x: raw.x,
      y: raw.y,
      type: "scattergl",
      mode: "lines",
      name: "Raw ECG",
      line: { color: chartTokens.raw, width: 1.2 },
      xaxis: "x",
      yaxis: "y"
    }
  ];
  if (filtered && result) {
    traces.push({
      x: filtered.x,
      y: filtered.y,
      type: "scattergl",
      mode: "lines",
      name: "Filtered ECG",
      line: { color: chartTokens.filtered, width: 1.7 },
      xaxis: "x2",
      yaxis: "y2"
    });
    traces.push({
      x: result.peak_times_seconds,
      y: result.peak_indices.map((index) => result.filtered_samples[index]),
      type: "scatter",
      mode: "markers",
      name: "R peaks",
      marker: { color: chartTokens.peak, size: 8, line: { color: chartTokens.paper, width: 1.5 } },
      xaxis: "x2",
      yaxis: "y2"
    });
  }
  useEffect(() => {
    if (!container.current) return;
    void Plotly.react(
      container.current,
      traces,
      {
        autosize: true,
        height: result ? 540 : 330,
        margin: { l: 58, r: 24, t: 30, b: 48 },
        paper_bgcolor: "transparent",
        plot_bgcolor: chartTokens.paper,
        font: { family: "IBM Plex Sans, system-ui, sans-serif", color: chartTokens.text, size: 12 },
        hovermode: "x unified",
        legend: { orientation: "h", x: 0, y: 1.08 },
        xaxis: { domain: [0, 1], anchor: "y", showticklabels: !result, title: result ? undefined : { text: "Time (s)" }, gridcolor: chartTokens.grid },
        yaxis: { domain: result ? [0.57, 1] : [0, 1], title: { text: "Raw" }, gridcolor: chartTokens.grid, zeroline: false },
        xaxis2: { domain: [0, 1], anchor: "y2", matches: "x", title: { text: "Time (s)" }, gridcolor: chartTokens.grid },
        yaxis2: { domain: [0, 0.43], title: { text: "Filtered" }, gridcolor: chartTokens.grid, zeroline: false }
      },
      { responsive: true, displaylogo: false, scrollZoom: true, modeBarButtonsToRemove: ["lasso2d", "select2d"] }
    );
    const resize = () => { if (container.current) Plotly.Plots.resize(container.current); };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (container.current) Plotly.purge(container.current);
    };
  }, [data, result]);

  return <div ref={container} style={{ width: "100%", minHeight: result ? 540 : 330 }} />;
}

