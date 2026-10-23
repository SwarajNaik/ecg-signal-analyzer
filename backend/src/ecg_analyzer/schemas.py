from pydantic import BaseModel, Field, model_validator


class FilterConfig(BaseModel):
    highpass_hz: float = Field(default=0.5, ge=0)
    lowpass_hz: float = Field(default=40.0, gt=0)
    notch_hz: float | None = Field(default=50.0, gt=0)
    filter_order: int = Field(default=4, ge=1, le=8)


class AnalyzeRequest(BaseModel):
    samples: list[float] = Field(min_length=16, max_length=2_000_000)
    sampling_rate_hz: float = Field(gt=0, le=20_000)
    config: FilterConfig = Field(default_factory=FilterConfig)

    @model_validator(mode="after")
    def validate_frequencies(self) -> "AnalyzeRequest":
        nyquist = self.sampling_rate_hz / 2
        if self.config.highpass_hz >= self.config.lowpass_hz:
            raise ValueError("High-pass cutoff must be lower than low-pass cutoff")
        if self.config.lowpass_hz >= nyquist:
            raise ValueError("Low-pass cutoff must be below the Nyquist frequency")
        if self.config.notch_hz is not None and self.config.notch_hz >= nyquist:
            raise ValueError("Notch frequency must be below the Nyquist frequency")
        return self


class AnalysisResult(BaseModel):
    sampling_rate_hz: float
    duration_seconds: float
    filtered_samples: list[float]
    peak_indices: list[int]
    peak_times_seconds: list[float]
    rr_intervals_seconds: list[float]
    instantaneous_bpm: list[float]
    median_bpm: float | None
    mean_bpm: float | None
    beat_count: int
    warnings: list[str]


class DemoResponse(BaseModel):
    sampling_rate_hz: float
    time_seconds: list[float]
    samples: list[float]
    expected_bpm: float
    source: str

