import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConfig, lessonOptions, operationAllowed, optionPreview, requestContinue, effortEntries } from "./agent.js";
test("only fixed experiment configuration is accepted", () => {
  for (const value of [null, [], {}, { experiment: "arbitrary" }]) assert.throws(() => validateConfig(value));
  assert.deepEqual(validateConfig({ experiment: "switch", cwd: "ignored" }), { experiment: "switch" });
});
test("settings writes are restricted to private enabled sources", () => {
  const tracker = { phase: "test", turn: 1, acting: false };
  const options = lessonOptions({ experiment: "persist" }, () => {}, tracker);
  assert.deepEqual(options.settingSources, ["user", "local"]);
  assert.match(options.env?.CLAUDE_CONFIG_DIR || "", /\.runtime/);
  assert.equal(options.persistSession, false);
});
test("only the approved acting phase can edit the owned status file", () => {
  const config = { experiment: "plan-act" as const };
  assert.ok(operationAllowed(config, "Read", { file_path: "status.txt" }, false));
  assert.ok(!operationAllowed(config, "Edit", { file_path: "status.txt" }, false));
  assert.ok(operationAllowed(config, "Edit", { file_path: "status.txt" }, true));
  assert.ok(!operationAllowed(config, "Edit", { file_path: "../../.env" }, true));
  assert.ok(!operationAllowed({ experiment: "switch" }, "Edit", { file_path: "status.txt" }, true));
});
test("safe options omit raw environment and settings evidence projects only effort values", () => {
  const options = lessonOptions({ experiment: "runtime" }, () => {}, { phase: "test", turn: 1, acting: false });
  assert.doesNotMatch(JSON.stringify(optionPreview(options)), /ANTHROPIC_API_KEY|CLAUDE_CONFIG_DIR/);
  assert.deepEqual(effortEntries({ token: "private", modelDefaults: { effortLevel: "medium" } }), [{ path: "modelDefaults.effortLevel", value: "medium" }]);
});
test("an unknown run cannot release another run's gate", () => { assert.equal(requestContinue("not-owned"), false); });
