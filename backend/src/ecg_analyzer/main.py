import csv
import io
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .demo import synthetic_ecg
from .schemas import AnalysisResult, AnalyzeRequest, DemoResponse
from .signal import analyze_ecg

app = FastAPI(
    title="ECG Signal Analyzer API",
    version="1.0.0",
    description="Educational ECG filtering, R-peak detection, and heart-rate analysis.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ecg-signal-analyzer"}


@app.get("/api/v1/demo", response_model=DemoResponse)
def demo() -> DemoResponse:
    time, samples = synthetic_ecg()
    return DemoResponse(
        sampling_rate_hz=250.0,
        time_seconds=time.tolist(),
        samples=samples.tolist(),
        expected_bpm=72.0,
        source="Deterministic synthetic ECG",
    )


@app.post("/api/v1/analyze", response_model=AnalysisResult)
def analyze(request: AnalyzeRequest) -> AnalysisResult:
    try:
        return analyze_ecg(request.samples, request.sampling_rate_hz, request.config)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/v1/export/csv")
def export_csv(request: AnalyzeRequest) -> Response:
    try:
        result = analyze_ecg(request.samples, request.sampling_rate_hz, request.config)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    peak_set = set(result.peak_indices)
    rr_by_peak = {
        peak: result.rr_intervals_seconds[index - 1]
        for index, peak in enumerate(result.peak_indices)
        if index > 0
    }
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["time_seconds", "raw_amplitude", "filtered_amplitude", "is_r_peak", "rr_seconds"])
    for index, (raw, filtered) in enumerate(zip(request.samples, result.filtered_samples, strict=True)):
        writer.writerow(
            [
                index / request.sampling_rate_hz,
                raw,
                filtered,
                1 if index in peak_set else 0,
                rr_by_peak.get(index, ""),
            ]
        )
    return Response(
        output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ecg-analysis.csv"},
    )


frontend_dist = Path(__file__).resolve().parents[3] / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")


