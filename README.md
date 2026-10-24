# ECG Signal Analyzer

A complete educational ECG signal-processing application with a React interface and one shared Python/NumPy/SciPy analysis engine.

The analyzer loads ECG samples from CSV, reduces baseline and high-frequency noise, detects R peaks, calculates RR intervals and heart rate, and exports processed results. The public GitHub Pages build runs the same Python signal-processing source in a Pyodide WebAssembly worker; the local application can call it through FastAPI.

> This project is an educational signal-processing tool. It is not a medical device and must not be used for diagnosis or treatment decisions.

## Features

- Drag-and-drop CSV loading with sampling-rate inference
- Deterministic 72 BPM demonstration ECG
- Configurable high-pass, low-pass, and 50/60 Hz notch filtering
- Pan-Tompkins-inspired Python R-peak detection locally and on GitHub Pages
- RR intervals, median BPM, mean BPM, and beat count
- Synchronized raw and filtered Plotly charts
- Responsive presentation-inspired interface
- CSV result export
- FastAPI OpenAPI documentation
- Pyodide 314.0.7 Web Worker with NumPy and SciPy for GitHub Pages
- Python, React component, CSV parser, and API tests
- GitHub Actions CI and Pages deployment

## Architecture

```text
                         React + TypeScript + Plotly
                              /              \
              local JSON API /                \ public static site
                            v                  v
                  FastAPI + Pydantic     Pyodide Web Worker
                              \              /
                               v            v
                         shared pipeline.py
                           NumPy + SciPy
```

`backend/src/ecg_analyzer/pipeline.py` is the authoritative numerical implementation. The browser build embeds that source and executes it with pinned Pyodide 314.0.7, NumPy 2.4.6, and SciPy 1.18.0 in a module Web Worker. There is no JavaScript ECG-analysis fallback. The local application prefers the FastAPI adapter, which calls the same module with the locally installed NumPy and SciPy.

The static site downloads approximately 29.1 MiB of version-pinned Python, NumPy, and SciPy runtime assets from the official jsDelivr Pyodide distribution on the first analysis. Browser caching makes later visits faster. Only runtime code is fetched: ECG samples remain in worker memory and are not transmitted. FastAPI health endpoints, OpenAPI documentation, and the server CSV route remain local-server features; the public interface provides its own client-side CSV export.

## Run the complete local application

Requirements: Python 3.11 or newer and Node.js 20 or newer.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e './backend[dev]'
cd frontend
npm install
cd ..
./scripts/run-local.sh
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

API documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

## Development mode

After installing dependencies:

```bash
./scripts/run-dev.sh
```

The React development server runs at `http://127.0.0.1:5173` and proxies API requests to FastAPI on port 8000.

## Tests

```bash
.venv/bin/python -m pytest backend --cov=ecg_analyzer
.venv/bin/ruff check backend
cd frontend
npm test
npm run test:pyodide
npm run build
```

## CSV format

Recommended:

```csv
time,amplitude
0.000,0.012
0.004,0.018
0.008,0.021
```

Time values must be in seconds and uniformly spaced. If the file contains only an amplitude column, enter its sampling frequency before analysis. See [data/README.md](data/README.md).

## Processing pipeline

The shared Python pipeline, whether invoked by FastAPI or Pyodide:

1. validates numeric samples, duration, sampling frequency, and filter cutoffs;
2. removes the median offset;
3. applies a Butterworth band-pass filter with second-order sections and zero-phase `sosfiltfilt` processing;
4. optionally applies a 50 Hz or 60 Hz notch filter;
5. creates a detector signal, differentiates it, squares it, and uses moving-window integration;
6. finds candidate QRS regions with a refractory period and refines each candidate on the cleaned ECG;
7. calculates RR intervals, instantaneous BPM, median BPM, and mean BPM.

Default display filtering uses 0.5 Hz and 40 Hz cutoffs. Every frequency is checked against the recording's Nyquist frequency.

## Repository structure

```text
backend/    FastAPI adapter, shared portable DSP pipeline, and Python tests
frontend/   React application, Pyodide worker/client, and frontend tests
data/       CSV format documentation
scripts/    Local development and production launchers
.github/    CI and GitHub Pages workflows
```

## Limitations

- The first browser analysis requires downloading and initializing the Python scientific runtime. Loading fails visibly if the pinned CDN is unavailable; the application does not silently substitute a different algorithm.
- The browser and local backend execute the same pipeline source, but small floating-point differences can still occur when their NumPy/SciPy patch versions differ.
- The default detector is designed for educational demonstrations and has not been clinically validated.
- Very noisy, paced, highly irregular, or unusual-morphology ECGs may need different detector settings.
- Uploaded signals are not stored by the application.

## Browser deployment and security

The GitHub Pages build packages the worker and the shared Python source into the application bundle. It loads the version-pinned Pyodide runtime and scientific wheels from `https://cdn.jsdelivr.net/pyodide/v314.0.7/full/`, with Pyodide's package integrity checking enabled by default. No credentials or persistent browser permissions are required.

The current Pages host does not set a Content Security Policy. If one is added, it must deliberately permit the same-origin module worker, WebAssembly execution, and downloads from the pinned jsDelivr origin (for example through suitable `worker-src`, `script-src`, and `connect-src` directives). Self-hosting the selected runtime files is possible if an offline build or a stricter single-origin policy is required.

## Project team

- Swaraj Naik, N091
- Aneek Nagpal, N089
- Vihaan Konda, N071

MBATECH CE E1, Signals and Systems Mini Project.

## License

[MIT](LICENSE)

