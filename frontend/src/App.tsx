import { useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, Download, FileHeart, HeartPulse, RotateCcw, Sparkles, Upload } from "lucide-react";
import { analyze, createDemo, DEFAULT_CONFIG, validateConfig } from "./analysis";
import { parseECGFile } from "./csv";
import { ECGChart } from "./ECGChart";
import type { AnalysisResult, ECGData, FilterConfig } from "./types";
import "./styles.css";

function format(value: number | null, digits = 1) {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

export default function App() {
  const [data, setData] = useState<ECGData | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [config, setConfig] = useState<FilterConfig>(DEFAULT_CONFIG);
  const [samplingRate, setSamplingRate] = useState(250);
  const [status, setStatus] = useState("Ready");
  const [mode, setMode] = useState("Waiting for analysis");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const analysisGeneration = useRef(0);

  const duration = useMemo(() => data ? data.samples.length / data.samplingRate : 0, [data]);

  const loadDemo = () => {
    analysisGeneration.current += 1;
    const demo = createDemo();
    setData(demo);
    setSamplingRate(demo.samplingRate);
    setResult(null);
    setError("");
    setStatus("Demo loaded");
    setMode("Ready to analyze");
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    const generation = ++analysisGeneration.current;
    setBusy(true);
    setError("");
    try {
      const parsed = await parseECGFile(file, samplingRate);
      if (generation !== analysisGeneration.current) return;
      setData(parsed);
      setSamplingRate(parsed.samplingRate);
      setResult(null);
      setStatus("Signal loaded");
      setMode("Ready to analyze");
    } catch (caught) {
      if (generation === analysisGeneration.current) {
        setError(caught instanceof Error ? caught.message : "Could not read the CSV file.");
      }
    } finally {
      if (generation === analysisGeneration.current) setBusy(false);
    }
  };

  const runAnalysis = async () => {
    if (!data) return;
    setBusy(true);
    setError("");
    setStatus("Analyzing signal…");
    setMode("Preparing the scientific Python pipeline");
    const generation = ++analysisGeneration.current;
    try {
      const current = { ...data, samplingRate };
      validateConfig(samplingRate, config);
      const response = await analyze(current, config, (progress) => {
        if (generation === analysisGeneration.current) setStatus(progress);
      });
      if (generation !== analysisGeneration.current) return;
      setData(current);
      setResult(response.result);
      setMode(response.mode);
      setStatus("Analysis complete");
    } catch (caught) {
      if (generation === analysisGeneration.current) {
        setError(caught instanceof Error ? caught.message : "Analysis failed.");
        setStatus("Analysis stopped");
        setMode("Python runtime unavailable");
      }
    } finally {
      if (generation === analysisGeneration.current) setBusy(false);
    }
  };

  const reset = () => {
    analysisGeneration.current += 1;
    setData(null);
    setResult(null);
    setConfig(DEFAULT_CONFIG);
    setSamplingRate(250);
    setError("");
    setBusy(false);
    setStatus("Ready");
    setMode("Waiting for analysis");
  };

  const exportCSV = () => {
    if (!data || !result) return;
    const peakSet = new Set(result.peak_indices);
    const header = "time_seconds,raw_amplitude,filtered_amplitude,is_r_peak\n";
    const rows = data.samples.map((raw, index) => `${index / data.samplingRate},${raw},${result.filtered_samples[index]},${peakSet.has(index) ? 1 : 0}`).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([header + rows], { type: "text/csv" }));
    link.download = "ecg-analysis.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><HeartPulse size={25} /></span><div><strong>ECG Signal Analyzer</strong><small>Signals and Systems Lab</small></div></div>
        <div className="top-actions">
          <button className="button ghost" onClick={reset}><RotateCcw size={17} /> Reset</button>
          <button className="button primary" disabled={!result} onClick={exportCSV}><Download size={17} /> Export CSV</button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div><span className="eyebrow"><Activity size={15} /> Educational signal processing</span><h1>See every heartbeat.<br /><em>Understand the signal.</em></h1><p>Load an ECG, reduce noise, detect R peaks, and inspect heart-rate measurements in one focused workspace.</p></div>
          <div className="hero-wave" aria-hidden="true"><svg viewBox="0 0 480 120"><path d="M0 70 L80 70 L95 60 L110 75 L127 70 L154 70 L170 18 L187 105 L205 70 L270 70 L285 61 L302 75 L318 70 L350 70 L365 20 L382 105 L400 70 L480 70" /></svg></div>
        </section>

        <section className="workspace">
          <aside className="control-panel">
            <div className="panel-heading"><div><span>01</span><h2>Signal input</h2></div><FileHeart size={21} /></div>
            <div
              className="dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); void loadFile(event.dataTransfer.files[0]); }}
              onClick={() => fileInput.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => { if (event.key === "Enter") fileInput.current?.click(); }}
            >
              <Upload size={24} /><strong>Drop an ECG CSV here</strong><span>or click to choose a file</span>
              <input ref={fileInput} type="file" accept=".csv,.txt,.tsv" hidden onChange={(event) => void loadFile(event.target.files?.[0])} />
            </div>
            <button className="button demo" onClick={loadDemo}><Sparkles size={17} /> Load demonstration ECG</button>

            <div className="divider" />
            <div className="panel-heading compact"><div><span>02</span><h2>Analysis settings</h2></div></div>
            <label>Sampling frequency <span>Hz</span><input type="number" min="1" value={Number(samplingRate.toFixed(3))} onChange={(event) => setSamplingRate(Number(event.target.value))} /></label>
            <div className="field-row">
              <label>High-pass <span>Hz</span><input type="number" min="0" step="0.1" value={config.highpass_hz} onChange={(event) => setConfig({ ...config, highpass_hz: Number(event.target.value) })} /></label>
              <label>Low-pass <span>Hz</span><input type="number" min="1" step="1" value={config.lowpass_hz} onChange={(event) => setConfig({ ...config, lowpass_hz: Number(event.target.value) })} /></label>
            </div>
            <label>Power-line notch<select value={config.notch_hz ?? "off"} onChange={(event) => setConfig({ ...config, notch_hz: event.target.value === "off" ? null : Number(event.target.value) })}><option value="off">Off</option><option value="50">50 Hz</option><option value="60">60 Hz</option></select></label>
            <button className="button analyze" disabled={!data || busy} onClick={() => void runAnalysis()}>{busy ? <span className="spinner" /> : <Activity size={18} />}{busy ? "Processing…" : "Analyze ECG"}</button>
            <p className="privacy-note">Python, NumPy, and SciPy load on demand. Your ECG stays in this browser worker.</p>
          </aside>

          <section className="analysis-panel">
            <div className="analysis-header"><div><span className={`status-dot ${result ? "complete" : ""}`} /> <strong>{status}</strong><small>{mode}</small></div>{data && <div className="file-summary"><strong>{data.name}</strong><span>{duration.toFixed(1)} s · {data.samples.length.toLocaleString()} samples</span></div>}</div>
            {error && <div className="error-banner"><AlertTriangle size={19} /><span>{error}</span></div>}
            {!data ? (
              <div className="empty-state"><div className="empty-icon"><Activity size={40} /></div><h2>Your ECG workspace is ready</h2><p>Upload a CSV with an amplitude column, or use the demonstration signal to explore the complete analysis flow.</p><button className="button primary" onClick={loadDemo}>Explore with demo data</button></div>
            ) : (
              <>
                {result && <div className="metrics"><article className="metric featured"><span>Heart rate</span><strong>{format(result.median_bpm, 0)} <small>BPM</small></strong><em>Median estimate</em></article><article className="metric"><span>Detected beats</span><strong>{result.beat_count}</strong><em>R peaks found</em></article><article className="metric"><span>Median RR</span><strong>{result.rr_intervals_seconds.length ? format([...result.rr_intervals_seconds].sort((a, b) => a - b)[Math.floor(result.rr_intervals_seconds.length / 2)] * 1000, 0) : "—"} <small>ms</small></strong><em>Beat interval</em></article><article className="metric"><span>Signal duration</span><strong>{format(result.duration_seconds, 1)} <small>s</small></strong><em>{result.sampling_rate_hz.toFixed(0)} Hz sampling</em></article></div>}
                <div className="chart-card"><div className="chart-title"><div><h2>{result ? "Signal comparison" : "Raw ECG preview"}</h2><p>Scroll to zoom, drag to pan, and double-click to reset.</p></div>{result && <div className="legend-note"><span /> R peaks</div>}</div><ECGChart data={{ ...data, samplingRate }} result={result} /></div>
                {result?.warnings.length ? <div className="warning-list">{result.warnings.map((warning) => <p key={warning}><AlertTriangle size={16} />{warning}</p>)}</div> : null}
              </>
            )}
          </section>
        </section>
      </main>
      <footer><span>Educational signal-processing project</span><span>Not a medical diagnostic system</span></footer>
    </div>
  );
}

