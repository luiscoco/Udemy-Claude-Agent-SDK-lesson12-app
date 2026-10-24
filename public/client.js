import { renderMarkdown } from "./markdown.js";
const $ = (id) => document.getElementById(id);
const run = $("run"), next = $("continue");
const rows = [];
let pausedRunId = "", liveIds = [];
const turns = new Map();
const json = (id, value) => { $(id).textContent = JSON.stringify(value, null, 2); window.Prism?.highlightElement($(id)); };
function drawTurns() {
    $("turns").replaceChildren();
    for (const t of turns.values()) {
        const tr = document.createElement("tr");
        for (const value of [t.phase, String(t.turn), t.model, t.mode, t.effort, t.status, t.session]) {
            const td = document.createElement("td");
            td.textContent = value;
            tr.append(td);
        }
        $("turns").append(tr);
    }
}
function receive(e) {
    rows.push(e);
    if (e.type === "options")
        json("options", e.options);
    if (e.type === "initialized" || e.type === "assistant-model" || e.type === "hook" || e.type === "result") {
        const key = e.phase + e.turn, t = turns.get(key) || { phase: e.phase, turn: e.turn, model: "—", mode: "—", effort: "Not reported", status: "In progress", session: "—" };
        if (e.type === "initialized") {
            t.mode = e.permissionMode;
            t.session = e.sessionId;
            json("init", e);
        }
        if (e.type === "assistant-model")
            t.model = e.model;
        if (e.type === "hook") {
            t.mode = e.permissionMode || t.mode;
            t.effort = e.effort || "Not reported";
        }
        if (e.type === "result") {
            t.status = e.status;
            t.session = e.sessionId;
        }
        turns.set(key, t);
        drawTurns();
    }
    if (e.type === "waiting") {
        pausedRunId = e.runId;
        next.disabled = false;
        $("status").textContent = "Paused after turn 1";
        $("approval-state").textContent = e.action;
    }
    if (e.type === "control") {
        const li = document.createElement("li");
        li.textContent = `${e.method}(${e.value}) · ${e.state}`;
        $("controls-observed").append(li);
    }
    if (e.type === "answer")
        renderMarkdown($("answer"), e.text);
    if (e.type === "result") {
        $("status").textContent = e.status;
        $("cost").textContent = "$" + e.costUsd.toFixed(5);
        $("session").textContent = e.sessionId;
        if (e.text)
            renderMarkdown($("answer"), e.text);
        if (e.phase === "live session") {
            liveIds.push(e.sessionId);
            $("session-proof").textContent = liveIds.length < 2 ? "First live result captured; waiting for turn two." : "Two live results. Same session ID: " + (liveIds[0] === liveIds[1]);
        }
        else
            $("followup").textContent = "A separate query loaded the persisted private settings. Inspect its own model, style and hook effort evidence.";
    }
    if (e.type === "file") {
        $(e.stage === "before" ? "status-before" : "status-after").textContent = e.status;
        if (e.stage === "after")
            $("file-changed").textContent = e.changed ? "Changed on disk" : "Unchanged on disk";
    }
    if (e.type === "settings")
        json("settings", e);
    if (e.type === "lifecycle") {
        const li = document.createElement("li");
        li.textContent = e.state + ": " + e.text;
        $("lifecycle").append(li);
        if (e.state === "approved")
            $("approval-state").textContent = "Continue action received; applying real SDK controls…";
        if (e.state === "released")
            $("approval-state").textContent = "Controls acknowledged; second prompt released.";
    }
    if (e.type === "error" || e.type === "notice")
        $("notice").textContent = e.text;
    if (e.type === "error")
        $("status").textContent = "Could not finish";
    if (["message", "tool", "result", "error"].includes(e.type)) {
        const li = document.createElement("li"), title = document.createElement("strong"), detail = document.createElement("span");
        title.textContent = e.type;
        detail.textContent = JSON.stringify(e);
        li.append(title, detail);
        $("events").append(li);
    }
}
next.onclick = async () => {
    next.disabled = true;
    try {
        const response = await fetch("/api/continue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: pausedRunId }) });
        if (!response.ok)
            throw new Error(await response.text());
        pausedRunId = "";
    }
    catch (error) {
        $("notice").textContent = error instanceof Error ? error.message : "Could not release this paused run.";
    }
};
run.onclick = async () => {
    run.disabled = true;
    next.disabled = true;
    pausedRunId = "";
    liveIds = [];
    turns.clear();
    drawTurns();
    for (const id of ["events", "controls-observed", "lifecycle", "answer"])
        $(id).replaceChildren();
    $("notice").textContent = "";
    $("status").textContent = "Running turn 1…";
    $("approval-state").textContent = "Waiting for the first result. No changes are applied yet.";
    $("session-proof").textContent = "No session comparison yet.";
    $("followup").textContent = "Only the persisted-settings experiment launches a verification query.";
    $("file-changed").textContent = "Waiting for after-run evidence";
    $("status-after").textContent = "Waiting";
    json("settings", { state: "No settings-write evidence in this run" });
    const config = { experiment: $("experiment").value };
    try {
        const response = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
        if (!response.ok)
            throw new Error(await response.text());
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let pending = "";
        while (true) {
            const { done, value } = await reader.read();
            pending += decoder.decode(value, { stream: !done });
            const lines = pending.split("\n");
            pending = lines.pop();
            for (const line of lines)
                if (line.trim())
                    receive(JSON.parse(line));
            if (done)
                break;
        }
    }
    catch (error) {
        $("status").textContent = "Could not finish";
        $("notice").textContent = error instanceof Error ? error.message : "Request failed.";
    }
    finally {
        run.disabled = false;
        next.disabled = true;
    }
};
$("download").onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "lesson12-observations.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
fetch("/api/config").then(r => r.json()).then(c => {
    $("configuration").textContent = c.ready ? "Key configured. First model: " + c.model + ". Model-switch experiment uses pinned Opus 4.6 for turn two." : "Configure your API key in .env and restart. See How to run.";
    run.disabled = !c.ready;
}).catch(() => { $("configuration").textContent = "Cannot reach the local server."; });
