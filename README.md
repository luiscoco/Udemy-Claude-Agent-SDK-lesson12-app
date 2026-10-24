# Claude Agent SDK · Lesson 12 · Changing configuration mid-session

Based on Lesson12_Changing_Configuration_Mid_Session.pptx. Five linked student pages, readable course styling and coloured code for all 13 UML workflow steps.

## What you will learn

- Keep a session alive: Use an async user-message generator. Hold the second prompt on a promise until the first result and the student’s Continue action. Streaming an HTTP response alone is not SDK streaming input.
- Switch models between turns: Call setModel on the existing Query object. Inspect the actual assistant model field for both turns and compare the returned session IDs.
- Change permission mode deliberately: Start the classroom edit in plan mode. Review its proposal, then use the Continue button to call setPermissionMode("acceptEdits") before the scoped status.txt edit.
- Apply runtime settings: Call applyFlagSettings with settings-file keys such as effortLevel, not the query option name effort. Observe actual hook metadata before and after the change.
- Persist settings with clear scope: Call updateSettings for local outputStyle and the user default effort. These writes stay inside this app’s private project and SDK home. The saved user effort does not change the running session’s effort.
- Verify later-session behavior: After writing settings, launch a separate verification query without an effort override. Compare its actual output style and hook effort with the running session’s evidence. Keep model-switch cache costs in mind.

## Configure and run

Use Node.js 24+, npm and your own Anthropic API key. The model-switch experiment needs access to pinned Sonnet 4.6 and Opus 4.6. Model constants are in src/agent.ts. Python is not needed to run the app.

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson12-app.git
cd .\Udemy-Claude-Agent-SDK-lesson12-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

From presentations use `cd .\agent-sdk\lesson12-mid-session` instead of cloning. Open http://127.0.0.1:3112. Keep the terminal running; Ctrl+C stops it.

## Create your .env file

Preserve an existing .env, or copy .env.example. Enter your own key locally and restart after edits. Start and sample:env explicitly load the optional file. Shell variables take precedence. Never commit the real file.

```dotenv
ANTHROPIC_API_KEY=your_api_key
PORT=3112
```

On Windows, if needed, add `CLAUDE_CODE_GIT_BASH_PATH=C:/Program Files/Git/bin/bash.exe` after checking the installed path. Keep optional npm dependencies enabled. A second start recognizes this app; use another PORT for an unrelated listener.

## Run the experiments

1. Switch the model between two turns: Start the default model-switch experiment. Wait for Paused after turn 1. Review the first answer and actual Sonnet model. Click Apply changes and continue. Inspect acknowledged setModel/setPermissionMode calls, actual Opus on turn 2 and the same live session ID.
2. Review a plan, then approve one edit: Select the plan-to-act experiment and Start. Review the draft → reviewed proposal and plan-mode hook evidence. The file has not been approved for editing yet. Click Apply changes and continue. Verify acceptEdits, the actual guarded Edit and status.txt changing on disk.
3. Apply a runtime effort setting: Choose runtime effort, Start, wait for the first result, then Continue. Inspect applyFlagSettings({ effortLevel: "medium" }) being acknowledged. Compare actual hook effort: low on turn 1, medium on turn 2. Do not infer hidden reasoning or guaranteed latency from the setting.
4. Persist private settings and verify later behavior: Choose persisted settings, Start, wait and Continue. The real SDK writer saves local Explanatory style and user medium effort inside private classroom paths. Inspect file projections, live turn 2 still using low effort, and the separate new query loading Explanatory/medium without an effort option override.
5. Read results and lifecycle in the correct scope: The two live results share a session ID. The persisted-settings verification query has its own ID. Read latest cumulative cost for each query; do not sum turn totals. Stay on the lab page while paused. Navigating away closes the response and aborts the run; restart if it times out.

```powershell
npm run sample:env -- switch
npm run sample:env -- plan-act
npm run sample:env -- runtime
npm run sample:env -- persist
npm test
```

`sample` uses only the launching shell environment. CLI samples label their automatic Continue action; the web application waits for its button. Run experiments sequentially. Stay on the page while paused and act before the six-minute host timeout. A failed control does not release prompt two. No recorded answer replaces a live failure.

## How the app was built

### 1. Validate a fixed classroom experiment

The host accepts one of four fixed experiments. The browser cannot supply arbitrary model strings, paths, settings objects or executable callbacks.

Source: `src/server.ts`, lines 61–61. Selected source; surrounding code omitted.

```typescript
const config = validateConfig(input);
```

### 2. Prepare a private project and settings home

Each scenario owns its classroom files and private SDK home. Fresh runs reset only those experimental settings files, never normal user configuration.

Source: `src/agent.ts`, lines 30–30. Selected source; surrounding code omitted.

```typescript
await writeFile(
  resolve(sdkHome(config), "settings.json"), "{}\n"
);
```

### 3. Build a typed asynchronous prompt stream

The generator yields a first user message and holds the next. The displayed normal read-task branch omits the plan-to-act prompt choice and cancellation check.

Source: `src/agent.ts`, lines 109–112. Selected source; surrounding code omitted.

```typescript
async function* prompts(): AsyncGenerator<SDKUserMessage> {
  yield userMessage(PROMPTS.first);
  await secondReady;
  // The actual second prompt depends on the experiment.
  yield userMessage(PROMPTS.second);
}
```

### 4. Start one live Query object

Keep the Query object returned by query. The SDK owns model/tool orchestration, while the host applies controls between completed prompts.

Source: `src/agent.ts`, lines 114–114. Selected source; surrounding code omitted.

```typescript
const session = query({ prompt: prompts(), options });
```

### 5. Observe actual turn-one configuration

Hook metadata supplies observed permission and effort values; assistant messages separately supply actual model IDs. Missing metadata remains missing.

Source: `src/agent.ts`, lines 51–51. Selected source; surrounding code omitted.

```typescript
emit({ type: "hook",
  phase: tracker.phase, turn: tracker.turn,
  event: "PreToolUse",
  permissionMode: input.permission_mode || null,
  effort: input.effort?.level || null
});
```

### 6. Wait for the student’s Continue action

The first result pauses the host. Only a matching active run ID can release its gate through the Continue endpoint. The web button is an actual classroom approval action; tests automate it explicitly.

Source: `src/agent.ts`, lines 137–137. Selected source; surrounding code omitted.

```typescript
activeGate = { runId, release };
// The host awaits this gate after the first result.
```

### 7. Switch the model and permission mode

For the model-switch experiment, await both real methods before prompt two. The plan-to-act branch uses only the permission-mode setter, and its file guard remains active.

Source: `src/agent.ts`, lines 88–89. Selected source; surrounding code omitted.

```typescript
await control("setModel", SECOND_MODEL,
  () => session.setModel(SECOND_MODEL));
await control("setPermissionMode", "acceptEdits",
  () => session.setPermissionMode("acceptEdits"));
```

### 8. Apply settings-file keys at runtime

Use effortLevel, the settings-file key, instead of the query option effort. The acknowledged method changes this session; hooks on the next task verify the active effort.

Source: `src/agent.ts`, lines 93–93. Selected source; surrounding code omitted.

```typescript
await session.applyFlagSettings({
  effortLevel: "medium"
});
```

### 9. Persist local and user settings deliberately

The real SDK writer persists supported keys to private classroom files. Local output style applies on the next request; the user effort default does not change the current live session.

Source: `src/agent.ts`, lines 95–96. Selected source; surrounding code omitted.

```typescript
await session.updateSettings("localSettings", {
  outputStyle: "Explanatory"
});
await session.updateSettings("userSettings", {
  effortLevel: "medium"
});
```

### 10. Release prompt two after acknowledgements

The host awaits every selected method before releasing the second user message. A rejected change prevents that release and remains a failure.

Source: `src/agent.ts`, lines 142–145. Selected source; surrounding code omitted.

```typescript
await applyChanges(session, config, emit);
tracker.turn = 2;
tracker.acting = config.experiment === "plan-act";
// Emit the released lifecycle event, then:
releaseSecond();
```

### 11. Verify the actual file after the live query

Read the real status file after closing the live query. A model claim or Edit request is not proof that the classroom change happened.

Source: `src/agent.ts`, lines 152–152. Selected source; surrounding code omitted.

```typescript
const after = await readFile(
  resolve(project(config), "status.txt"), "utf8"
);
```

### 12. Load persisted settings in a fresh query

The verification query omits an effort override and uses the same private settings files. Its new session has actual style/effort evidence distinct from the two live turns.

Source: `src/agent.ts`, lines 159–161. Selected source; surrounding code omitted.

```typescript
delete verificationOptions.effort;
// Keep the private user/local setting sources.
const verification = query({
  prompt: PROMPTS.first, options: verificationOptions
});
```

### 13. Render results and compare observed turns

Render actual model text with the bundled Markdown parser and sanitizer. Keep acknowledgements, model IDs, hooks, files and new-session evidence separate.

Source: `src/client.ts`, lines 36–36. Selected source; surrounding code omitted.

```typescript
if (e.type === "answer")
  renderMarkdown($("answer"), e.text);
```

## Boundaries and reference material

- Query controls: TypeScript methods live on the Query object. Python uses ClaudeSDKClient for setters; Python query returns an iterator. This app executes TypeScript only.
- setModel default: Passing no model clears the override and selects Claude Code’s default, not necessarily the model originally passed. That variation is reference only here; the live switch uses two explicit pinned IDs.
- Permission changes: acceptEdits changes edit oversight, but application guards and organization policy still apply. This app does not use bypassPermissions or grant access to arbitrary files.
- Runtime versus file settings: applyFlagSettings uses settings-file keys and affects the session. updateSettings allows only supported targets/keys. This app enables private user/local sources for its settings-writing scenario.
- Persisted user effort: The saved default belongs to the current model and does not change its running effort. Actual low effort on live turn 2 and medium in the new query demonstrate that distinction.
- Cache and cwd trade-offs: Switching models can require the conversation to be processed uncached at the new model’s rates. Switch at meaningful phase boundaries. No cwd setter exists; start a new query for another directory. This app does not benchmark cache behavior.

Every experiment has a private project and CLAUDE_CONFIG_DIR under .runtime. Fresh runs reset only owned fixture and experimental settings files. Only plan-to-act may edit its status.txt, after the Continue action and real permission-mode setter. Fixed paths and hooks are application guards, not an OS sandbox. The cost estimate is cumulative per query; do not sum turn totals. The persisted-settings follow-up is a separate query. SDK methods, actual models, hook metadata, file projections and after-run file reads are distinct evidence.

Real .env, dependencies, private settings/history and teaching media are excluded from Git. Markdown output uses bundled parsing and sanitization.

## References

- [SDK configuration](https://code.claude.com/docs/en/agent-sdk/configuration)
- [TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript)
- [Streaming input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)

Optional documentation regeneration: `python scripts/build-pages.py`. Source anchors are checked against the implementation.
