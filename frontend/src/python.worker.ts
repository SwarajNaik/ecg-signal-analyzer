/// <reference lib="webworker" />

import { loadPyodide, version, type PyodideInterface } from "pyodide";
import pipelineSource from "../../backend/src/ecg_analyzer/pipeline.py?raw";
import type { AnalysisResult, ECGData, FilterConfig } from "./types";

const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;

interface WorkerRequest {
  id: number;
  data: ECGData;
  config: FilterConfig;
}

let runtimePromise: Promise<PyodideInterface> | null = null;
let workQueue = Promise.resolve();

function report(id: number, message: string) {
  self.postMessage({ type: "progress", id, message });
}

async function initializeRuntime(id: number): Promise<PyodideInterface> {
  report(id, "Loading Python WebAssembly runtime…");
  const pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
  report(id, "Loading NumPy and SciPy…");
  await pyodide.loadPackage(["numpy", "scipy"]);
  report(id, "Preparing the ECG pipeline…");
  pyodide.FS.writeFile("/home/pyodide/ecg_pipeline.py", pipelineSource);
  await pyodide.runPythonAsync(`
import sys
if "/home/pyodide" not in sys.path:
    sys.path.insert(0, "/home/pyodide")
import ecg_pipeline
`);
  return pyodide;
}

async function analyze(request: WorkerRequest) {
  const { id, data, config } = request;
  if (!runtimePromise) {
    runtimePromise = initializeRuntime(id).catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  const pyodide = await runtimePromise;
  report(id, "Analyzing with Python / SciPy…");
  pyodide.globals.set("_ecg_request_json", JSON.stringify({
    samples: data.samples,
    sampling_rate_hz: data.samplingRate,
    config
  }));
  try {
    const resultJson = await pyodide.runPythonAsync(`
import json
from ecg_pipeline import PipelineConfig, analyze_signal

_request = json.loads(_ecg_request_json)
_result = analyze_signal(
    _request["samples"],
    _request["sampling_rate_hz"],
    PipelineConfig(**_request["config"]),
)
json.dumps(_result, allow_nan=False)
`);
    const result = JSON.parse(String(resultJson)) as AnalysisResult;
    self.postMessage({ type: "result", id, result });
  } finally {
    pyodide.globals.delete("_ecg_request_json");
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  workQueue = workQueue.then(() => analyze(request)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ type: "error", id: request.id, message });
  });
};
