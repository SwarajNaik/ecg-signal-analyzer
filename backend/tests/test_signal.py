import numpy as np
import pytest

from ecg_analyzer.demo import synthetic_ecg
from ecg_analyzer.schemas import FilterConfig
from ecg_analyzer.signal import analyze_ecg, filter_ecg


def tone_amplitude(samples: np.ndarray, sampling_rate_hz: float, frequency_hz: float) -> float:
    trim = round(sampling_rate_hz)
    values = samples[trim:-trim]
    time = np.arange(trim, trim + values.size) / sampling_rate_hz
    cosine = np.sum(values * np.cos(2 * np.pi * frequency_hz * time))
    sine = np.sum(values * np.sin(2 * np.pi * frequency_hz * time))
    return float(2 * np.hypot(cosine, sine) / values.size)


def test_synthetic_ecg_rate_is_close_to_expected() -> None:
    _, samples = synthetic_ecg(duration_seconds=20, bpm=72)
    result = analyze_ecg(samples, 250.0, FilterConfig())
    assert result.beat_count >= 20
    assert result.median_bpm == pytest.approx(72, abs=2)


def test_flat_signal_is_rejected() -> None:
    with pytest.raises(ValueError, match="flat"):
        analyze_ecg(np.zeros(500), 250.0, FilterConfig())


def test_short_signal_is_rejected() -> None:
    with pytest.raises(ValueError, match="one second"):
        analyze_ecg(np.arange(20), 250.0, FilterConfig())


def test_result_lengths_match_input() -> None:
    _, samples = synthetic_ecg(duration_seconds=5)
    result = analyze_ecg(samples, 250.0, FilterConfig())
    assert len(result.filtered_samples) == len(samples)
    assert len(result.rr_intervals_seconds) == max(0, result.beat_count - 1)


@pytest.mark.parametrize("frequency_hz", [50.0, 60.0])
def test_notch_attenuates_matching_power_line_tone(frequency_hz: float) -> None:
    sampling_rate_hz = 250.0
    time = np.arange(0, 8, 1 / sampling_rate_hz)
    samples = np.sin(2 * np.pi * 10 * time) + 0.5 * np.sin(2 * np.pi * frequency_hz * time)
    common = {"highpass_hz": 0.5, "lowpass_hz": 100.0, "filter_order": 2}
    without_notch = filter_ecg(samples, sampling_rate_hz, FilterConfig(**common, notch_hz=None))
    with_notch = filter_ecg(samples, sampling_rate_hz, FilterConfig(**common, notch_hz=frequency_hz))

    assert tone_amplitude(with_notch, sampling_rate_hz, frequency_hz) < (
        tone_amplitude(without_notch, sampling_rate_hz, frequency_hz) * 0.1
    )


@pytest.mark.parametrize("notch_hz", [None, 50.0, 60.0])
def test_demo_bpm_is_stable_across_notch_settings(notch_hz: float | None) -> None:
    _, samples = synthetic_ecg(duration_seconds=20, bpm=72)
    result = analyze_ecg(samples, 250.0, FilterConfig(notch_hz=notch_hz))

    assert result.median_bpm == pytest.approx(72, abs=2)

