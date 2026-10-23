import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

vi.mock("plotly.js-basic-dist-min", () => ({
  default: { react: vi.fn(), purge: vi.fn(), Plots: { resize: vi.fn() } }
}));

describe("App", () => {
  it("loads and analyzes the demonstration", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load demonstration ecg/i }));
    expect(screen.getByText(/synthetic 72 bpm demonstration/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /analyze ecg/i }));
    await waitFor(() => expect(screen.getByText(/analysis complete/i)).toBeInTheDocument());
    expect(screen.getByText(/detected beats/i)).toBeInTheDocument();
  });
});

