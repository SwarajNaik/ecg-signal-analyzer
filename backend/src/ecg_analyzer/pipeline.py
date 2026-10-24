"""Portable NumPy/SciPy ECG pipeline shared by CPython and browser Pyodide."""

from dataclasses import dataclass

import numpy as np
from scipy.signal import butter, find_peaks, iirnotch, sosfiltfilt, tf2sos


@dataclass(frozen=True)
class PipelineConfig:
    highpass_hz: float = 0.5
    lowpass_hz: float = 40.0
    notch_hz: float | None = 50.0
    filter_order: int = 4


@dataclass(frozen=True)
class PeakDetection:
    peak_indices: np.ndarray
    warnings: list[str]


def _ensure_valid_signal(samples: list[float] | np.ndarray, sampling_rate_hz: float) -> np.ndarray:
    signal = np.asarray(samples, dtype=np.float64)
    if signal.ndim != 1:
        raise ValueError("ECG samples must be one-dimensional")
    if signal.size < max(16, int(sampling_rate_hz)):
        raise ValueError("At least one second of ECG data is required")
    if not np.all(np.isfinite(signal)):
        raise ValueError("ECG samples contain missing or non-finite values")
    if np.ptp(signal) <= np.finfo(float).eps:
        raise ValueError("The ECG signal is flat")
    return signal


def validate_config(sampling_rate_hz: float, config: PipelineConfig) -> None:
    if not np.isfinite(sampling_rate_hz) or sampling_rate_hz <= 0:
        raise ValueError("Sampling frequency must be positive")
    frequencies = [config.highpass_hz, config.lowpass_hz]
    if config.notch_hz is not None:
        frequencies.append(config.notch_hz)
    if not all(np.isfinite(frequency) for frequency in frequencies):
        raise ValueError("Filter frequencies must be finite")
    if not isinstance(config.filter_order, int) or not 1 <= config.filter_order <= 8:
        raise ValueError("Filter order must be an integer from 1 to 8")

    nyquist = sampling_rate_hz / 2
    if not 0 <= config.highpass_hz < config.lowpass_hz < nyquist:
        raise ValueError("Filter cutoffs must satisfy 0 <= high-pass < low-pass < Nyquist")
    if config.notch_hz is not None:
        if config.notch_hz <= 0:
            raise ValueError("Notch frequency must be positive")
        if config.notch_hz >= nyquist:
            raise ValueError("Notch frequency must be below the Nyquist frequency")


def filter_signal(signal: np.ndarray, sampling_rate_hz: float, config: PipelineConfig) -> np.ndarray:
    validate_config(sampling_rate_hz, config)
    if config.highpass_hz > 0:
        sos = butter(
            config.filter_order,
            [config.highpass_hz, config.lowpass_hz],
            btype="bandpass",
            fs=sampling_rate_hz,
            output="sos",
        )
    else:
        sos = butter(
            config.filter_order,
            config.lowpass_hz,
            btype="lowpass",
            fs=sampling_rate_hz,
            output="sos",
        )

    try:
        filtered = sosfiltfilt(sos, signal)
    except ValueError as exc:
        raise ValueError("The recording is too short for the selected filter") from exc

    if config.notch_hz is not None:
        b, a = iirnotch(config.notch_hz, Q=30.0, fs=sampling_rate_hz)
        filtered = sosfiltfilt(tf2sos(b, a), filtered)
    return filtered


def detect_r_peaks(filtered: np.ndarray, sampling_rate_hz: float) -> PeakDetection:
    warnings: list[str] = []
    detector_high = min(20.0, sampling_rate_hz * 0.40)
    detector_low = min(5.0, detector_high * 0.5)
    sos = butter(
        2,
        [detector_low, detector_high],
        btype="bandpass",
        fs=sampling_rate_hz,
        output="sos",
    )
    detector_signal = sosfiltfilt(sos, filtered)
    differentiated = np.diff(detector_signal, prepend=detector_signal[0])
    squared = differentiated**2
    window = max(1, round(0.15 * sampling_rate_hz))
    integrated = np.convolve(squared, np.ones(window) / window, mode="same")

    baseline = float(np.median(integrated))
    spread = float(np.median(np.abs(integrated - baseline)))
    threshold = baseline + max(3.0 * spread, 0.18 * (float(np.max(integrated)) - baseline))
    refractory = max(1, round(0.25 * sampling_rate_hz))
    candidates, _ = find_peaks(integrated, height=threshold, distance=refractory)

    search_radius = max(1, round(0.12 * sampling_rate_hz))
    refined: list[int] = []
    polarity = 1.0 if abs(np.percentile(filtered, 99)) >= abs(np.percentile(filtered, 1)) else -1.0
    oriented = filtered * polarity
    for candidate in candidates:
        start = max(0, candidate - search_radius)
        stop = min(filtered.size, candidate + search_radius + 1)
        peak = start + int(np.argmax(oriented[start:stop]))
        if not refined or peak - refined[-1] >= refractory:
            refined.append(peak)
        elif oriented[peak] > oriented[refined[-1]]:
            refined[-1] = peak

    peaks = np.asarray(refined, dtype=int)
    if peaks.size < 2:
        warnings.append("Insufficient beats were detected to calculate heart rate")
    if peaks.size and peaks.size / (filtered.size / sampling_rate_hz / 60) > 220:
        warnings.append("The detector produced an unusually high beat count; review the signal and settings")
    return PeakDetection(peaks, warnings)


def analyze_signal(
    samples: list[float] | np.ndarray,
    sampling_rate_hz: float,
    config: PipelineConfig,
) -> dict[str, object]:
    signal = _ensure_valid_signal(samples, sampling_rate_hz)
    centered = signal - np.median(signal)
    filtered = filter_signal(centered, sampling_rate_hz, config)
    detection = detect_r_peaks(filtered, sampling_rate_hz)
    rr = np.diff(detection.peak_indices) / sampling_rate_hz
    bpm = 60.0 / rr if rr.size else rr

    warnings = list(detection.warnings)
    if rr.size and np.any((bpm < 30) | (bpm > 220)):
        warnings.append("Some RR intervals fall outside the configured educational review range")

    return {
        "sampling_rate_hz": sampling_rate_hz,
        "duration_seconds": signal.size / sampling_rate_hz,
        "filtered_samples": filtered.tolist(),
        "peak_indices": detection.peak_indices.tolist(),
        "peak_times_seconds": (detection.peak_indices / sampling_rate_hz).tolist(),
        "rr_intervals_seconds": rr.tolist(),
        "instantaneous_bpm": bpm.tolist(),
        "median_bpm": float(np.median(bpm)) if bpm.size else None,
        "mean_bpm": float(np.mean(bpm)) if bpm.size else None,
        "beat_count": int(detection.peak_indices.size),
        "warnings": warnings,
    }
