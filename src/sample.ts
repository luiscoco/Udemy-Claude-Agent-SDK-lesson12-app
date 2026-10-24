import { runAgent, requestContinue } from "./agent.js";
import type { Experiment } from "./protocol.js";
const experiment = (process.argv[2] || "switch") as Experiment;
console.log("CLI demonstration: automatically continue after the first result. The web app waits for its button.");
await runAgent({ experiment }, event => {
  console.log(JSON.stringify(event));
  if (event.type === "waiting") queueMicrotask(() => requestContinue(event.runId));
});
