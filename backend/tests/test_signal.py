import numpy as np
import pytest

from ecg_analyzer.demo import synthetic_ecg
from ecg_analyzer.schemas import FilterConfig
from ecg_analyzer.signal import analyze_ecg


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

