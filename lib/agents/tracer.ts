export type TraceStep = {
  id: string;
  ts: number;
  agent: string;
  model: string;
  thought?: string;
  tool?: string;
  toolInput?: unknown;
  result?: unknown;
  tokens: { input: number; output: number; total: number };
  latencyMs: number;
};

export type AgentTrace = {
  runId: string;
  startedAt: number;
  steps: TraceStep[];
  totalTokens: { input: number; output: number; total: number };
  totalLatencyMs: number;
};

export class Tracer {
  readonly runId = crypto.randomUUID();
  readonly startedAt = Date.now();
  private _steps: TraceStep[] = [];

  log(step: Omit<TraceStep, "id" | "ts">): void {
    this._steps.push({ id: crypto.randomUUID(), ts: Date.now(), ...step });
  }

  get steps(): TraceStep[] {
    return this._steps;
  }

  get trace(): AgentTrace {
    const totalTokens = this._steps.reduce(
      (acc, s) => ({
        input: acc.input + s.tokens.input,
        output: acc.output + s.tokens.output,
        total: acc.total + s.tokens.total,
      }),
      { input: 0, output: 0, total: 0 }
    );
    return {
      runId: this.runId,
      startedAt: this.startedAt,
      steps: [...this._steps],
      totalTokens,
      totalLatencyMs: Date.now() - this.startedAt,
    };
  }
}
