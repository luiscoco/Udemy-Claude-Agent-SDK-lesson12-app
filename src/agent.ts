import { query, type Options, type Query, type SDKUserMessage, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { RunConfig, LabEvent, Experiment } from "./protocol.js";
export type { RunConfig, LabEvent } from "./protocol.js";
export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const MODEL = "claude-sonnet-4-6", SECOND_MODEL = "claude-opus-4-6";
export const DEFAULT_CONFIG: RunConfig = { experiment: "switch" };
export const PROMPTS = { first: "Read notes.md, then reply with ready and its context marker. Do not edit files.", second: "Read notes.md again, then reply with done and the context marker. Do not edit files." };
const experiments: Experiment[] = ["switch", "plan-act", "runtime", "persist"];
export const project = (config: RunConfig) => resolve(ROOT, ".runtime", config.experiment, "project");
export const sdkHome = (config: RunConfig) => resolve(ROOT, ".runtime", config.experiment, "sdk-home");
type Gate = { runId: string; release: () => void };
let activeGate: Gate | undefined;
export function requestContinue(runId: string) {
  if (!activeGate || activeGate.runId !== runId) return false;
  const gate = activeGate; activeGate = undefined; gate.release(); return true;
}
export function validateConfig(value: unknown): RunConfig {
  if (!value || typeof value !== "object" || Array.isArray(value) || !experiments.includes((value as RunConfig).experiment)) throw new Error("Choose switch, plan-act, runtime or persist.");
  return { experiment: (value as RunConfig).experiment };
}
export async function prepareWorkspace(config: RunConfig) {
  await mkdir(resolve(project(config), ".claude"), { recursive: true }); await mkdir(sdkHome(config), { recursive: true });
  for (const file of ["notes.md", "status.txt"]) await writeFile(resolve(project(config), file), await readFile(resolve(ROOT, "fixtures/project", file)));
  // Reset only the two app-owned experimental settings files.
  await writeFile(resolve(project(config), ".claude/settings.local.json"), "{}\n");
  await writeFile(resolve(sdkHome(config), "settings.json"), "{}\n");
}
export function operationAllowed(config: RunConfig, tool: string, input: Record<string, unknown>, acting: boolean) {
  if (typeof input.file_path !== "string") return false;
  const target = resolve(project(config), input.file_path).toLowerCase();
  if (tool === "Read") return ["notes.md", "status.txt"].some(file => resolve(project(config), file).toLowerCase() === target);
  return tool === "Edit" && config.experiment === "plan-act" && acting && resolve(project(config), "status.txt").toLowerCase() === target;
}
type Tracker = { phase: string; turn: number; acting: boolean };
export function lessonOptions(config: RunConfig, emit: (event: LabEvent) => void, tracker: Tracker, controller = new AbortController()): Options {
  return {
    model: MODEL, cwd: project(config), effort: "low", thinking: { type: "disabled" },
    tools: config.experiment === "plan-act" ? ["Read", "Edit"] : ["Read"], allowedTools: ["Read"],
    disallowedTools: ["Bash", "Write", "WebFetch", "WebSearch"],
    permissionMode: config.experiment === "plan-act" ? "plan" : "default",
    settingSources: config.experiment === "persist" ? ["user", "local"] : [],
    persistSession: false, mcpServers: {}, plugins: [], maxTurns: 6, maxBudgetUsd: 0.5,
    env: { ...process.env, CLAUDE_CONFIG_DIR: sdkHome(config) }, abortController: controller,
    systemPrompt: "You are a concise classroom agent. Read only notes.md and status.txt. Make no edits while proposing a plan. Do not invoke ExitPlanMode. Only when the later prompt explicitly asks for the approved classroom edit may you Edit status.txt from draft to reviewed. Never modify any other file or claim tests ran. Follow the fixed task briefly.",
    hooks: {
      PreToolUse: [{ hooks: [async input => {
        emit({ type: "hook", phase: tracker.phase, turn: tracker.turn, event: "PreToolUse", permissionMode: input.permission_mode || null, effort: input.effort?.level || null });
        if (input.hook_event_name === "PreToolUse" && !operationAllowed(config, input.tool_name, input.tool_input as Record<string, unknown>, tracker.acting))
          return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Only selected classroom reads and an approved status.txt edit are permitted." } };
        return {};
      }] }],
    },
    canUseTool: async () => ({ behavior: "deny", message: "Unresolved operations are denied. The approved edit must run under acceptEdits and the path guard." }),
  };
}
export function optionPreview(options: Options) {
  return { model: options.model, cwd: "private classroom project", effort: options.effort,
    permissionMode: options.permissionMode, tools: options.tools, allowedTools: options.allowedTools,
    settingSources: options.settingSources, maxTurns: options.maxTurns, maxBudgetUsd: options.maxBudgetUsd,
    privateSettingsHome: true };
}
export function redact(text: string) {
  const key = process.env.ANTHROPIC_API_KEY;
  return (key ? text.split(key).join("[REDACTED]") : text).replace(/sk-ant-[A-Za-z0-9_-]{16,}/g, "[REDACTED]").slice(0, 16000);
}
export function userMessage(text: string): SDKUserMessage { return { type: "user", message: { role: "user", content: text }, parent_tool_use_id: null }; }
export function effortEntries(value: unknown, path = ""): { path: string; value: string }[] {
  if (typeof value === "string" && ["low", "medium", "high", "xhigh", "max"].includes(value)) return [{ path, value }];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => effortEntries(child, path ? path + "." + key : key));
}
export async function settingsEvidence(config: RunConfig) {
  const local = JSON.parse(await readFile(resolve(project(config), ".claude/settings.local.json"), "utf8"));
  const user = JSON.parse(await readFile(resolve(sdkHome(config), "settings.json"), "utf8"));
  return { type: "settings" as const, localOutputStyle: typeof local.outputStyle === "string" ? local.outputStyle : null, userEffortEntries: effortEntries(user) };
}
export async function applyChanges(session: Query, config: RunConfig, emit: (event: LabEvent) => void) {
  async function control(method: string, value: string, action: () => Promise<void>) {
    emit({ type: "control", method, value, state: "requested" });
    await action();
    emit({ type: "control", method, value, state: "acknowledged" });
  }
  if (config.experiment === "switch") {
    await control("setModel", SECOND_MODEL, () => session.setModel(SECOND_MODEL));
    await control("setPermissionMode", "acceptEdits", () => session.setPermissionMode("acceptEdits"));
  } else if (config.experiment === "plan-act") {
    await control("setPermissionMode", "acceptEdits", () => session.setPermissionMode("acceptEdits"));
  } else if (config.experiment === "runtime") {
    await control("applyFlagSettings", "effortLevel: medium", () => session.applyFlagSettings({ effortLevel: "medium" }));
  } else {
    await control("updateSettings(localSettings)", "outputStyle: Explanatory", () => session.updateSettings("localSettings", { outputStyle: "Explanatory" }));
    await control("updateSettings(userSettings)", "effortLevel: medium", () => session.updateSettings("userSettings", { effortLevel: "medium" }));
    emit(await settingsEvidence(config));
  }
}
export async function runAgent(config: RunConfig, emit: (event: LabEvent) => void, controller = new AbortController()) {
  config = validateConfig(config); await prepareWorkspace(config);
  const runId = randomUUID(), tracker: Tracker = { phase: "live session", turn: 1, acting: false };
  const before = await readFile(resolve(project(config), "status.txt"), "utf8");
  emit({ type: "file", stage: "before", status: before, changed: false });
  const options = lessonOptions(config, emit, tracker, controller);
  emit({ type: "options", runId, config, options: optionPreview(options) });
  let releaseSecond!: () => void;
  const secondReady = new Promise<void>(resolve => { releaseSecond = resolve; });
  async function* prompts(): AsyncGenerator<SDKUserMessage> {
    yield userMessage(config.experiment === "plan-act" ? "Read status.txt and propose replacing draft with reviewed. Do not edit yet or invoke ExitPlanMode. Briefly state the proposed change." : PROMPTS.first);
    await secondReady;
    if (!controller.signal.aborted) yield userMessage(config.experiment === "plan-act" ? "The student approved this classroom change. Read status.txt, then Edit that file only: replace draft with reviewed. Briefly report the actual result." : PROMPTS.second);
  }
  const session = query({ prompt: prompts(), options });
  let results = 0;
  function observe(message: SDKMessage) {
    emit({ type: "message", sdkType: message.type, summary: "subtype" in message ? String(message.subtype) : "Observed SDK message" });
    if (message.type === "system" && message.subtype === "init") emit({ type: "initialized", phase: tracker.phase, turn: tracker.turn, sessionId: message.session_id, model: message.model, permissionMode: message.permissionMode, outputStyle: message.output_style, effort: message.effort ?? null });
    if (message.type === "assistant") {
      emit({ type: "assistant-model", phase: tracker.phase, turn: tracker.turn, model: message.message.model });
      for (const block of message.message.content) {
        if (block.type === "text") emit({ type: "answer", text: redact(block.text) });
        if (block.type === "tool_use") emit({ type: "tool", name: block.name, target: basename(String((block.input as { file_path?: string }).file_path || "classroom file")) });
      }
    }
    if (message.type === "result") emit({ type: "result", phase: tracker.phase, turn: tracker.turn, status: message.subtype === "success" && message.is_error ? "error" : message.subtype, text: redact(message.subtype === "success" ? message.result : message.errors.join("\n")), sessionId: message.session_id, costUsd: message.total_cost_usd });
  }
  try {
    for await (const message of session) {
      observe(message);
      if (message.type !== "result") continue;
      if (message.subtype !== "success" || message.is_error) throw new Error("A turn did not complete successfully; no configuration change is released.");
      if (++results === 1) {
        await new Promise<void>((resolveGate, reject) => {
          const abort = () => { if (activeGate?.runId === runId) activeGate = undefined; reject(new Error("Classroom run cancelled while paused.")); };
          const release = () => { controller.signal.removeEventListener("abort", abort); resolveGate(); };
          activeGate = { runId, release }; controller.signal.addEventListener("abort", abort, { once: true });
          if (controller.signal.aborted) { abort(); return; }
          emit({ type: "waiting", runId, action: config.experiment === "plan-act" ? "Review the proposal, then approve the scoped status.txt edit." : "Review turn one, then apply the selected configuration change." });
        });
        emit({ type: "lifecycle", state: "approved", text: "The app received the Continue button action for this paused run. Automated tests drive the same button/API." });
        await applyChanges(session, config, emit);
        tracker.turn = 2; tracker.acting = config.experiment === "plan-act";
        emit({ type: "lifecycle", state: "released", text: "Control requests were acknowledged before the generator released prompt two." });
        releaseSecond();
      } else break;
    }
    if (results !== 2) throw new Error("The live demonstration did not yield both results.");
  } finally {
    if (activeGate?.runId === runId) activeGate = undefined;
    releaseSecond(); session.close();
    const after = await readFile(resolve(project(config), "status.txt"), "utf8");
    emit({ type: "file", stage: "after", status: after, changed: before !== after });
    emit({ type: "lifecycle", state: "closed", text: "The host intentionally closed the two-turn live query." });
  }
  if (config.experiment === "persist") {
    tracker.phase = "new-session verification"; tracker.turn = 1;
    const verificationOptions = lessonOptions(config, emit, tracker, controller);
    delete verificationOptions.effort; // Allow the private user-file default to load.
    emit({ type: "lifecycle", state: "new-session", text: "A separate query loads the persisted private local/user settings, with no effort option override." });
    const verification = query({ prompt: PROMPTS.first, options: verificationOptions });
    try { for await (const message of verification) observe(message); }
    finally { verification.close(); }
    emit(await settingsEvidence(config));
  }
}
