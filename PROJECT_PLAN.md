# ECG Signal Analyzer: End-to-End Project Plan

## 1. Project definition

Build a polished ECG analysis application with a Python signal-processing backend and a modern TypeScript frontend that can:

1. Load an ECG from CSV or a bundled demonstration record.
2. Validate the signal and sampling frequency.
3. Remove baseline drift, high-frequency noise, and optional power-line interference.
4. Detect R peaks and calculate RR intervals and heart rate.
5. Plot the raw ECG, filtered ECG, detected peaks, and analysis results.
6. Export the processed data and a summary report.

The application is an educational signal-processing tool. It must not claim to diagnose bradycardia, tachycardia, arrhythmia, or any medical condition.

## 2. Scope from the presentation

The presentation already establishes the core scope:

- Input: CSV with time and amplitude, plus an optional MIT-BIH record.
- Processing: preprocessing, filtering, R-peak detection, and BPM calculation.
- Output: raw and filtered plots, peak markers, RR intervals, BPM, and a configurable educational status label.
- Initial technology direction: Python, NumPy, SciPy, Pandas, Matplotlib, and a desktop UI.
- Testing: clean signals, noisy signals, known BPM, and invalid inputs.

The production plan extends this with a maintainable architecture, reproducible sample data, quantitative algorithm validation, exports, packaging, and a more polished UI.

## 3. Recommended architecture and technology stack

The strongest version of this project does not need an all-Python interface. Use Python for the signal-processing backend and TypeScript for a modern web frontend.

### Recommended option: React frontend with a FastAPI backend

| Area | Choice | Reason |
|---|---|---|
| Analysis backend | Python 3.11 or 3.12 with FastAPI | Mature scientific ecosystem plus a typed HTTP API |
| Frontend | React with TypeScript and Vite | Modern, responsive UI with a clear component model |
| Plotting | Plotly.js | Interactive zooming, panning, range selection, and peak overlays |
| Styling | Tailwind CSS or CSS modules | Consistent styling without mixing presentation into analysis code |
| Signal processing | NumPy and SciPy | Filtering, numerical operations, and peak utilities |
| CSV import | Pandas | Flexible column parsing and missing-value handling |
| MIT-BIH import | WFDB | Reads PhysioNet records and annotations |
| API models | Pydantic | Validated request and response schemas |
| Backend tests | pytest and coverage | Core, API, and integration testing |
| Frontend tests | Vitest and React Testing Library | Component and user-flow testing |
| Browser E2E tests | Playwright | Full upload, analysis, and export validation |
| Quality | Ruff and mypy; ESLint and Prettier | Automated checks on both sides |
| Deployment | Local FastAPI server plus static frontend | Simple offline demonstration and a path to hosting |

Matplotlib can generate exported figures or reports. Plotly.js should render interactive charts in the browser.

### Delivery choices

- **Recommended first release:** run FastAPI locally and open the React UI in the browser. This is the fastest route to a polished, reliable demonstration.
- **Optional desktop package:** wrap the same React UI with Tauri and launch the Python backend as a sidecar process. This creates an installable desktop application but adds Rust and packaging complexity.
- **Future hosted version:** deploy the React build and FastAPI service. Only do this after adding upload limits, temporary-file cleanup, authentication if needed, and a privacy policy.

Do not start with Electron unless the team already knows it. It produces a large package and still needs a strategy for shipping Python.

## 4. System architecture

Keep signal processing independent of the UI. React should call the backend API and must not contain a second implementation of the ECG algorithm.

```text
CSV / bundled sample / WFDB record
                |
                v
        Input and validation
                |
                v
        ECGRecord data model
                |
                v
    Preprocess and quality checks
                |
                v
      Display filter + detector
                |
                v
  Peaks, RR intervals, BPM, warnings
                |
                v
 React UI plots and downloadable exports
```

Recommended project structure:

```text
ecg-signal-analyzer/
├── README.md
├── LICENSE
├── backend/
│   ├── pyproject.toml
│   ├── src/ecg_analyzer/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── routes.py
│   │   │   └── schemas.py
│   │   ├── models.py
│   │   ├── config.py
│   │   ├── io/
│   │   │   ├── csv_loader.py
│   │   │   ├── wfdb_loader.py
│   │   │   └── exporters.py
│   │   ├── signal/
│   │   │   ├── validation.py
│   │   │   ├── preprocessing.py
│   │   │   ├── filters.py
│   │   │   ├── qrs.py
│   │   │   ├── heart_rate.py
│   │   │   └── quality.py
│   │   └── services/
│   │       └── analysis_service.py
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── fixtures/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── api/client.ts
│   │   ├── components/
│   │   ├── features/analysis/
│   │   ├── pages/
│   │   ├── types/
│   │   └── styles/
│   └── tests/
├── e2e/
│   └── analysis.spec.ts
├── data/
│   ├── demo/
│   └── README.md
├── docs/
│   ├── algorithm.md
│   ├── csv-format.md
│   └── validation-report.md
└── scripts/
    ├── download_demo_record.py
    ├── run_dev.sh
    └── build_release.sh
```

### API boundary

Use a small, versioned API:

- `GET /api/v1/health`: backend readiness.
- `GET /api/v1/demo`: bundled demonstration metadata or data.
- `POST /api/v1/signals/preview`: validate a CSV and return column and sampling information.
- `POST /api/v1/analyze`: accept a signal plus configuration and return waveform data and metrics as JSON.
- `POST /api/v1/export`: produce CSV, JSON, PNG, or report output.

Keep the first release stateless. Send the file, settings, and selected range with each analysis request. If large files later become a problem, introduce temporary analysis IDs with automatic expiry.

## 5. Data contracts

Use explicit models so every stage has a clear input and output.

### `ECGRecord`

- `samples`: one-dimensional NumPy array
- `sampling_rate_hz`: positive float
- `time_seconds`: calculated or supplied time array
- `lead_name`: optional string
- `source`: file name or dataset record
- `metadata`: dictionary for non-critical source information

### `FilterConfig`

- high-pass cutoff, default 0.5 Hz
- low-pass cutoff, default 40 Hz
- optional notch frequency, 50 Hz or 60 Hz
- notch quality factor
- filter order

### `AnalysisResult`

- cleaned signal
- detected R-peak sample indices and times
- RR intervals in seconds
- instantaneous BPM values
- summary BPM, preferably the median of valid recent RR intervals
- signal-quality warnings
- full processing configuration for reproducibility

## 6. Input workflow

### CSV mode

Support these two forms:

- `time, amplitude`: infer sampling rate from the median time difference.
- `amplitude` only: require the user to enter the sampling rate.

Validation rules:

- Data must be numeric, finite, and contain enough samples for filtering.
- Time must increase and be sufficiently uniform.
- Sampling rate must be positive and compatible with every selected cutoff under the Nyquist limit.
- Missing values may be interpolated only when gaps are short. Larger gaps should stop analysis or split the signal into valid sections.
- Duplicate timestamps and unsupported multi-column layouts should produce a clear message.

### Demonstration mode

Bundle a short, license-compatible sample or generate a deterministic synthetic ECG for the first launch. Add an optional script that downloads a chosen MIT-BIH record and its reference annotations through WFDB. Do not make the live demonstration depend on internet access.

## 7. Signal-processing pipeline

### Stage A: validation and preparation

1. Convert values to `float64`.
2. Remove or flag non-finite samples.
3. Estimate sampling rate when timestamps exist.
4. Remove the mean or median offset.
5. Preserve the original data for the raw-signal plot.

Do not normalize away the original amplitude units. If detector normalization is needed, create a separate normalized copy.

### Stage B: display filter

For offline analysis, use numerically stable second-order sections and forward-backward filtering:

- high-pass near 0.5 Hz for baseline drift
- low-pass near 40 Hz for muscle and high-frequency noise
- optional 50 Hz or 60 Hz notch when the frequency is valid for the sampling rate

Use `scipy.signal.butter(..., output="sos")` and `sosfiltfilt`. This avoids phase shift in the offline waveform and reduces numerical problems. Handle short recordings explicitly because forward-backward filtering requires padding.

### Stage C: QRS/R-peak detector

Implement an understandable Pan-Tompkins-inspired detector:

1. Create a detector-specific band-pass signal, approximately 5 to 20 Hz, scaled to the sampling rate.
2. Differentiate to emphasize QRS slope.
3. Square the derivative.
4. Apply moving-window integration of about 150 ms.
5. Use an adaptive threshold to identify candidate QRS regions.
6. Enforce a refractory interval of about 200 ms so one heartbeat cannot create multiple detections.
7. Refine each candidate to the strongest local R peak in the cleaned ECG within a small search window.
8. Estimate polarity so records with inverted QRS complexes remain usable.

Keep the detector parameters configurable in an advanced panel, but ship tested defaults.

### Stage D: RR and heart-rate calculation

- `RR seconds = diff(peak_indices) / sampling_rate_hz`
- `instantaneous BPM = 60 / RR seconds`
- Show median BPM as the stable main value and mean BPM as optional detail.
- Flag physiologically implausible or isolated RR values instead of silently deleting them.
- Require at least two detected peaks before calculating BPM.
- Show `Insufficient beats` rather than zero when a valid rate cannot be calculated.

Status text should say `Below configured range`, `Within configured range`, or `Above configured range`. The UI must keep the non-diagnostic disclaimer visible.

## 8. Frontend UI and user experience

### Main window

Build a responsive single-page React application with one clear analysis workspace:

- Top bar: application name, Open ECG, Load Demo, Export, Help.
- Left control area: source details, sampling rate, lead selection, filter settings, and Analyze button.
- Main plot area: stacked raw and filtered plots sharing the same time axis. R peaks appear as high-contrast markers on the filtered plot.
- Results area: BPM, beat count, median RR, duration, and warnings.
- Bottom status bar: current file, processing state, and non-diagnostic notice.

### Interactions

- Open by file dialog or drag and drop.
- Preview the file before analysis.
- Zoom, pan, reset view, and inspect peak time/RR values.
- Allow a visible time-range selection for long recordings.
- Disable Analyze until inputs pass validation.
- Show progress while the API request runs and allow cancellation with `AbortController`.
- Show actionable errors, such as `Sampling rate must exceed twice the 40 Hz low-pass cutoff`.
- Add Reset to defaults and a collapsible Advanced settings section.
- Preserve analysis settings in browser storage so an accidental refresh does not wipe the setup.
- Downsample only the plotted waveform for browser performance. Always run detection on the full selected signal in Python.

### Visual direction

- White or very light gray workspace with navy headings and one violet accent, matching the presentation.
- Use red only for peak markers and warnings.
- Use readable labels, generous spacing, and consistent units.
- Provide a dark theme only after the main flow works well.
- Ensure keyboard focus, tooltips, sufficient contrast, and responsive behavior. Optimize the main experience for a laptop screen.

### Export

Provide:

- processed CSV containing time, raw amplitude, filtered amplitude, peak flag, RR, and BPM where applicable
- PNG plot export
- JSON analysis summary containing parameters and warnings
- optional PDF report after the core application is complete

## 9. Testing and validation

### Unit tests

- Sampling-rate inference from regular timestamps.
- Rejection of non-increasing or severely irregular time data.
- Filter cutoff and Nyquist validation.
- Filter output length and finite values.
- Peak detection on deterministic synthetic ECG at several known rates.
- BPM and RR calculations for known peak positions.
- Edge cases: short signal, flat line, excessive noise, one peak, no peak, NaNs, and inverted signal.

### Integration tests

- Load a valid CSV, analyze it, and export results.
- Analyze selected MIT-BIH segments and compare detected peaks with reference annotations.
- Confirm that the same input and configuration produce the same output.
- Confirm that UI controls map to the saved analysis configuration.

### Detector metrics

For reference annotations, match a detected peak to a reference peak within a declared tolerance, for example 100 ms. Report:

- sensitivity: matched reference beats divided by all reference beats
- positive predictive value: matched detections divided by all detections
- absolute BPM error on chosen segments
- runtime for a fixed signal duration

Set a project target only after selecting the evaluation records. A reasonable educational target is at least 95% sensitivity and 95% positive predictive value on the documented clean demonstration segments. Do not present that as performance on all patients or noise conditions.

### Frontend and E2E tests

- React component tests for initial disabled/enabled button states.
- File selection and validation messages.
- Successful analysis updates plots and metrics.
- API success, error, timeout, and cancellation paths.
- Export creates the expected files.
- Playwright flow: load demo, adjust settings, analyze, inspect a peak, and export.

## 10. Delivery milestones

### Milestone 1: project foundation

- Create backend and frontend workspaces, linting, and test setup.
- Define data models and configuration.
- Define and document the API schemas shared by Python and TypeScript.
- Add a deterministic synthetic ECG fixture and CSV contract.

**Done when:** both development servers start, the frontend reaches the FastAPI health route, and all test suites run successfully.

### Milestone 2: processing engine

- Implement loading, validation, filters, QRS detection, RR calculation, and warnings.
- Add unit tests for each stage.

**Done when:** a backend test calls the analysis service and API with a fixture and receives stable results.

### Milestone 3: dataset validation

- Add the optional WFDB loader and selected MIT-BIH evaluation segments.
- Compare detections with annotations and write the first validation report.
- Tune documented defaults without hard-coding for a single record.

**Done when:** the report contains sensitivity, positive predictive value, BPM error, and known failure cases.

### Milestone 4: polished React UI

- Build the React workspace, Plotly charts, controls, loading states, and errors.
- Apply the presentation-inspired theme.

**Done when:** a new user can load a file, analyze it, inspect peaks, and reset the view without using the terminal.

### Milestone 5: export and reliability

- Add CSV, PNG, and JSON export.
- Add API, component, and browser E2E tests.
- Improve handling of long files and invalid inputs.

**Done when:** all acceptance scenarios pass and the UI remains responsive.

### Milestone 6: packaging and demonstration

- Build the frontend into static assets and provide one command that starts FastAPI and opens the local application.
- Optionally create a Tauri desktop package after the local web release passes acceptance tests.
- Write the README, installation guide, CSV example, algorithm explanation, limitations, and demo script.
- Record final measured results for the presentation.

**Done when:** the application runs on a clean test computer and the project can be demonstrated without internet access.

## 11. Suggested team split

- Signal-processing owner: filters, QRS detector, BPM, and validation metrics.
- Backend owner: input models, FastAPI, analysis service, export, and error handling.
- Frontend owner: React screens, Plotly integration, API state, and theme.
- Test and documentation owner: fixtures, automated tests, validation report, README, and final demo flow.

Each owner should work against the same data contracts. Avoid separate copies of the detector inside the UI or notebooks.

## 12. Definition of done

The project is complete when:

- A user can analyze both a documented CSV and a bundled offline demo.
- Filter settings respect the sampling rate and cannot create invalid configurations.
- Detected peaks and RR intervals are visible and exportable.
- The displayed BPM is reproducible from exported peak positions.
- Clean selected reference segments meet the documented validation target.
- Failure cases produce clear warnings rather than crashes or misleading zero values.
- Automated tests cover the core pipeline and main UI flow.
- The local release launches on a clean machine with one documented command or installer.
- The interface and documentation clearly state that the project is educational and non-diagnostic.

## 13. Later enhancements

Only add these after the local web version is reliable:

- live serial/Bluetooth ECG acquisition
- causal real-time filters and latency reporting
- multi-lead comparison
- signal-quality index and artifact region marking
- manual peak correction for teaching demonstrations
- additional QRS detectors for comparison
- Tauri desktop packaging
- hosted deployment with privacy and upload controls

Do not add arrhythmia classification or diagnosis without a separately defined dataset, validation protocol, risk analysis, and appropriate clinical oversight.
