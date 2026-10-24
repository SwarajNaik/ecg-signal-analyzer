# ECG Signal Analyzer

A complete educational ECG signal-processing application with a React interface and a Python/FastAPI analysis engine.

The analyzer loads ECG samples from CSV, reduces baseline and high-frequency noise, detects R peaks, calculates RR intervals and heart rate, and exports processed results. The public GitHub Pages build also includes a private in-browser analysis mode because Pages cannot run a Python server.

> This project is an educational signal-processing tool. It is not a medical device and must not be used for diagnosis or treatment decisions.

## Features

- Drag-and-drop CSV loading with sampling-rate inference
- Deterministic 72 BPM demonstration ECG
- Configurable high-pass, low-pass, and 50/60 Hz notch filtering
- Pan-Tompkins-inspired R-peak detection in the Python backend
- RR intervals, median BPM, mean BPM, and beat count
- Synchronized raw and filtered Plotly charts
- Responsive presentation-inspired interface
- CSV result export
- FastAPI OpenAPI documentation
- Browser-only fallback for GitHub Pages
- Python, React component, CSV parser, and API tests
- GitHub Actions CI and Pages deployment

## Architecture

```text
React + TypeScript + Plotly
            |
            | JSON API when running locally
            v
FastAPI + Pydantic
            |
            v
NumPy + SciPy ECG pipeline
```

The public static build uses a TypeScript fallback so uploads can be analyzed entirely in the browser. The local application prefers the SciPy backend.

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

The Python backend:

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
backend/    FastAPI application, DSP pipeline, and Python tests
frontend/   React application, browser fallback, and frontend tests
data/       CSV format documentation
scripts/    Local development and production launchers
.github/    CI and GitHub Pages workflows
```

## Limitations

- The browser fallback uses lightweight forward-backward RC high/low-pass filters, a Q=30 biquad notch, and a percentile-based peak detector. Use the local SciPy backend for the documented Butterworth and Pan-Tompkins-inspired pipeline.
- The default detector is designed for educational demonstrations and has not been clinically validated.
- Very noisy, paced, highly irregular, or unusual-morphology ECGs may need different detector settings.
- Uploaded signals are not stored by the application.

## Project team

- Swaraj Naik, N091
- Aneek Nagpal, N089
- Vihaan Konda, N071

MBATECH CE E1, Signals and Systems Mini Project.

## License

[MIT](LICENSE)

