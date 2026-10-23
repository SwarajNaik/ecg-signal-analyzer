import numpy as np


def synthetic_ecg(
    duration_seconds: float = 12.0,
    sampling_rate_hz: float = 250.0,
    bpm: float = 72.0,
    seed: int = 7,
) -> tuple[np.ndarray, np.ndarray]:
    """Create a deterministic ECG-like waveform for demonstrations and tests."""
    rng = np.random.default_rng(seed)
    time = np.arange(0, duration_seconds, 1 / sampling_rate_hz)
    signal = 0.08 * np.sin(2 * np.pi * 0.28 * time)
    beat_period = 60 / bpm

    for beat_time in np.arange(0.6, duration_seconds, beat_period):
        signal += 0.10 * np.exp(-0.5 * ((time - (beat_time - 0.18)) / 0.035) ** 2)
        signal -= 0.15 * np.exp(-0.5 * ((time - (beat_time - 0.025)) / 0.012) ** 2)
        signal += 1.10 * np.exp(-0.5 * ((time - beat_time) / 0.014) ** 2)
        signal -= 0.22 * np.exp(-0.5 * ((time - (beat_time + 0.025)) / 0.014) ** 2)
        signal += 0.28 * np.exp(-0.5 * ((time - (beat_time + 0.25)) / 0.060) ** 2)

    signal += 0.025 * rng.standard_normal(time.size)
    signal += 0.018 * np.sin(2 * np.pi * 50 * time)
    return time, signal

