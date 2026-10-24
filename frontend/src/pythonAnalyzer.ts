import type { AnalysisResult, ECGData, FilterConfig } from "./types";

interface WorkerRequest {
  id: number;
  data: ECGData;
  config: FilterConfig;
}

type WorkerResponse =
  | { type: "progress"; id: number; message: string }
  | { type: "result"; id: number; result: AnalysisResult }
  | { type: "error"; id: number; message: string };

interface PendingRequest {
  resolve: (result: AnalysisResult) => void;
  reject: (error: Error) => void;
  onProgress?: (message: string) => void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

function rejectPending(message: string) {
  for (const request of pending.values()) request.reject(new Error(message));
  pending.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./python.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const request = pending.get(message.id);
    if (!request) return;
    if (message.type === "progress") {
      request.onProgress?.(message.message);
      return;
    }
    pending.delete(message.id);
    if (message.type === "result") request.resolve(message.result);
    else request.reject(new Error(message.message));
  };
  worker.onerror = (event) => {
    rejectPending(event.message || "The browser Python worker stopped unexpectedly.");
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function analyzeWithBrowserPython(
  data: ECGData,
  config: FilterConfig,
  onProgress?: (message: string) => void
): Promise<AnalysisResult> {
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    const request: WorkerRequest = { id, data, config };
    getWorker().postMessage(request);
  });
}
