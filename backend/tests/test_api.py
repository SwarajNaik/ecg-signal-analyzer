from fastapi.testclient import TestClient

from ecg_analyzer.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_demo_can_be_analyzed() -> None:
    demo = client.get("/api/v1/demo").json()
    response = client.post(
        "/api/v1/analyze",
        json={
            "samples": demo["samples"],
            "sampling_rate_hz": demo["sampling_rate_hz"],
            "config": {"highpass_hz": 0.5, "lowpass_hz": 40, "notch_hz": 50, "filter_order": 4},
        },
    )
    assert response.status_code == 200
    assert 70 <= response.json()["median_bpm"] <= 74


def test_invalid_filter_is_explained() -> None:
    response = client.post(
        "/api/v1/analyze",
        json={
            "samples": list(range(200)),
            "sampling_rate_hz": 100,
            "config": {"highpass_hz": 0.5, "lowpass_hz": 40, "notch_hz": 50},
        },
    )
    assert response.status_code == 422

