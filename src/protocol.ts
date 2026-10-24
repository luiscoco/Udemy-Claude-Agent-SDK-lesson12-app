export type Experiment = "switch" | "plan-act" | "runtime" | "persist";
export type RunConfig = { experiment: Experiment };
export type LabEvent =
  | { type: "options"; runId: string; config: RunConfig; options: Record<string, unknown> }
  | { type: "initialized"; phase: string; turn: number; sessionId: string; model: string; permissionMode: string; outputStyle: string; effort: string | null }
  | { type: "assistant-model"; phase: string; turn: number; model: string }
  | { type: "message"; sdkType: string; summary: string }
  | { type: "tool"; name: string; target: string }
  | { type: "hook"; phase: string; turn: number; event: string; permissionMode: string | null; effort: string | null }
  | { type: "answer"; text: string }
  | { type: "result"; phase: string; turn: number; status: string; text: string; sessionId: string; costUsd: number }
  | { type: "waiting"; runId: string; action: string }
  | { type: "control"; method: string; value: string; state: "requested" | "acknowledged" }
  | { type: "lifecycle"; state: string; text: string }
  | { type: "settings"; localOutputStyle: string | null; userEffortEntries: { path: string; value: string }[] }
  | { type: "file"; stage: "before" | "after"; status: string; changed: boolean }
  | { type: "notice" | "error"; text: string };
