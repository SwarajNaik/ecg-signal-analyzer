import { parseECGFile } from "./csv";

describe("CSV parser", () => {
  it("infers sampling frequency from a time column", async () => {
    const file = {
      name: "sample.csv",
      text: async () => "time,amplitude\n0,0.1\n0.004,0.2\n0.008,0.3\n"
    } as File;
    const result = await parseECGFile(file, 100);
    expect(result.samples).toEqual([0.1, 0.2, 0.3]);
    expect(result.samplingRate).toBeCloseTo(250);
  });

  it("rejects non-numeric signal values", async () => {
    const file = {
      name: "bad.csv",
      text: async () => "time,ecg\n0,0.1\n0.004,nope\n"
    } as File;
    await expect(parseECGFile(file, 250)).rejects.toThrow(/non-numeric/);
  });
});

