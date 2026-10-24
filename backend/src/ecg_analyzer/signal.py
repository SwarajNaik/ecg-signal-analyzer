import numpy as np

from .pipeline import (
    PipelineConfig,
    analyze_signal,
    filter_signal,
)
from .schemas import AnalysisResult, FilterConfig


def _pipeline_config(config: FilterConfig) -> PipelineConfig:
    return PipelineConfig(**config.model_dump())


def filter_ecg(signal: np.ndarray, sampling_rate_hz: float, config: FilterConfig) -> np.ndarray:
    return filter_signal(signal, sampling_rate_hz, _pipeline_config(config))


def analyze_ecg(
    samples: list[float] | np.ndarray,
    sampling_rate_hz: float,
    config: FilterConfig,
) -> AnalysisResult:
    return AnalysisResult(**analyze_signal(samples, sampling_rate_hz, _pipeline_config(config)))

