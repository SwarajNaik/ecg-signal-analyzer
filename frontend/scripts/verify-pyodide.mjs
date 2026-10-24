import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { loadPyodide, version as pyodideVersion } from "pyodide";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../..");
const pipelinePath = resolve(projectRoot, "backend/src/ecg_analyzer/pipeline.py");
const pipelineSource = readFileSync(pipelinePath, "utf8");
const packageBaseUrl = `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`;
const packageCacheDir = mkdtempSync(join(tmpdir(), "ecg-pyodide-packages-"));
const localPython = resolve(projectRoot, ".venv/bin/python");
const nativePython = process.env.PYTHON_EXECUTABLE || (existsSync(localPython) ? localPython : "python3");

function gaussian(time, center, width) {
  return Math.exp(-0.5 * ((time - center) / width) ** 2);
}

function syntheticSignal({ duration = 12, samplingRate = 250, bpm = 72, interference = 50, inverted = false }) {
  const count = Math.floor(duration * samplingRate);
  const samples = Array.from({ length: count }, (_, index) => {
    const time = index / samplingRate;
    let value = 0.08 * Math.sin(2 * Math.PI * 0.28 * time);
    for (let beat = 0.6; beat < duration; beat += 60 / bpm) {
      value += 0.1 * gaussian(time, beat - 0.18, 0.035);
      value -= 0.15 * gaussian(time, beat - 0.025, 0.012);
      value += 1.1 * gaussian(time, beat, 0.014);
      value -= 0.22 * gaussian(time, beat + 0.025, 0.014);
      value += 0.28 * gaussian(time, beat + 0.25, 0.06);
    }
    value += 0.012 * Math.sin(index * 1.731);
    if (interference) value += 0.18 * Math.sin(2 * Math.PI * interference * time);
    return inverted ? -value : value;
  });
  return { samples, sampling_rate_hz: samplingRate };
}

const defaultConfig = { highpass_hz: 0.5, lowpass_hz: 40, notch_hz: 50, filter_order: 4 };
const demo = syntheticSignal({});
const cases = [
  { name: "demo-default", ...demo, config: defaultConfig },
  ...[null, 50, 60].map((notch_hz) => ({
    name: `demo-notch-${notch_hz ?? "off"}`,
    ...syntheticSignal({ duration: 20 }),
    config: { ...defaultConfig, notch_hz }
  })),
  {
    name: "ninety-bpm-50hz",
    ...syntheticSignal({ duration: 20, bpm: 90, interference: 50 }),
    config: { ...defaultConfig, lowpass_hz: 100, notch_hz: 50 }
  },
  {
    name: "inverted-60hz",
    ...syntheticSignal({ duration: 20, bpm: 84, interference: 60, inverted: true }),
    config: { ...defaultConfig, lowpass_hz: 100, notch_hz: 60 }
  },
  { name: "invalid-flat", samples: Array(500).fill(0), sampling_rate_hz: 250, config: defaultConfig },
  { name: "invalid-short", samples: Array.from({ length: 20 }, (_, index) => index), sampling_rate_hz: 250, config: defaultConfig },
  {
    name: "invalid-nyquist",
    samples: Array.from({ length: 200 }, (_, index) => Math.sin(index / 10)),
    sampling_rate_hz: 100,
    config: defaultConfig
  }
];

const runtimeStart = performance.now();
const pyodide = await loadPyodide({ packageBaseUrl, packageCacheDir });
const runtimeMs = performance.now() - runtimeStart;
const packageStart = performance.now();
await pyodide.loadPackage(["numpy", "scipy"]);
const packagesMs = performance.now() - packageStart;
pyodide.FS.writeFile("/home/pyodide/ecg_pipeline.py", pipelineSource);
await pyodide.runPythonAsync(`
import json
import sys
if "/home/pyodide" not in sys.path:
    sys.path.insert(0, "/home/pyodide")
from ecg_pipeline import PipelineConfig, analyze_signal

def _ecg_execute(request_json):
    request = json.loads(request_json)
    try:
        result = analyze_signal(
            request["samples"],
            request["sampling_rate_hz"],
            PipelineConfig(**request["config"]),
        )
        return json.dumps({"ok": True, "result": result}, allow_nan=False)
    except ValueError as error:
        return json.dumps({"ok": False, "error": str(error)})
`);

async function runPyodide(testCase) {
  pyodide.globals.set("_ecg_case_json", JSON.stringify(testCase));
  try {
    return JSON.parse(String(await pyodide.runPythonAsync("_ecg_execute(_ecg_case_json)")));
  } finally {
    pyodide.globals.delete("_ecg_case_json");
  }
}

const firstStart = performance.now();
const firstDemo = await runPyodide(cases[0]);
const firstAnalysisMs = performance.now() - firstStart;
const repeatStart = performance.now();
const repeatedDemo = await runPyodide(cases[0]);
const repeatedAnalysisMs = performance.now() - repeatStart;
assert.deepEqual(repeatedDemo, firstDemo, "Repeated analysis must be deterministic in one runtime");

const pyodideResults = [firstDemo];
for (const testCase of cases.slice(1)) pyodideResults.push(await runPyodide(testCase));

const nativeProgram = `
import json
import sys
sys.path.insert(0, "${resolve(projectRoot, "backend/src")}")
from ecg_analyzer.pipeline import PipelineConfig, analyze_signal

results = []
for request in json.load(sys.stdin):
    try:
        result = analyze_signal(
            request["samples"],
            request["sampling_rate_hz"],
            PipelineConfig(**request["config"]),
        )
        results.append({"ok": True, "result": result})
    except ValueError as error:
        results.append({"ok": False, "error": str(error)})
json.dump(results, sys.stdout, allow_nan=False)
`;
const native = spawnSync(nativePython, ["-c", nativeProgram], {
  cwd: projectRoot,
  input: JSON.stringify(cases),
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024
});
if (native.status !== 0) throw new Error(native.stderr || `Native Python exited ${native.status}`);
const nativeResults = JSON.parse(native.stdout);

for (let index = 0; index < cases.length; index += 1) {
  const name = cases[index].name;
  const browser = pyodideResults[index];
  const local = nativeResults[index];
  assert.equal(browser.ok, local.ok, `${name}: success/error state differs`);
  if (!browser.ok || !local.ok) {
    assert.equal(browser.error, local.error, `${name}: validation error differs`);
    continue;
  }
  assert.deepEqual(browser.result.peak_indices, local.result.peak_indices, `${name}: R peaks differ`);
  assert.deepEqual(browser.result.warnings, local.result.warnings, `${name}: warnings differ`);
  assert.equal(browser.result.beat_count, local.result.beat_count, `${name}: beat count differs`);
  for (const metric of ["median_bpm", "mean_bpm", "duration_seconds"]) {
    const difference = Math.abs((browser.result[metric] ?? 0) - (local.result[metric] ?? 0));
    assert.ok(difference < 1e-9, `${name}: ${metric} differs by ${difference}`);
  }
  const maximumFilterDifference = Math.max(...browser.result.filtered_samples.map(
    (value, sampleIndex) => Math.abs(value - local.result.filtered_samples[sampleIndex])
  ));
  assert.ok(maximumFilterDifference < 1e-8, `${name}: filtered samples differ by ${maximumFilterDifference}`);
}

const versions = pyodide.runPython(`
import json
import numpy
import scipy
json.dumps({"numpy": numpy.__version__, "scipy": scipy.__version__})
`);
console.log(JSON.stringify({
  pyodide: pyodideVersion,
  packages: JSON.parse(String(versions)),
  cases: cases.length,
  runtime_ms: Math.round(runtimeMs),
  packages_ms: Math.round(packagesMs),
  first_demo_analysis_ms: Number(firstAnalysisMs.toFixed(1)),
  repeated_demo_analysis_ms: Number(repeatedAnalysisMs.toFixed(1))
}, null, 2));
