document.addEventListener("DOMContentLoaded", () => {
  refreshCall();
});

async function refreshCall() {
  const callId = localStorage.getItem("call_id");
  const list = document.getElementById("messagesList");
  const hint = document.getElementById("messagesHint");
  const statsGrid = document.getElementById("statsGrid");

  if (!callId) {
    hint.textContent = "Missing callId";
    list.innerHTML = `<div class="table-empty">No call selected.</div>`;
    return;
  }

  document.getElementById("callTitle").innerText = `Call ${shortId(callId)}`;
  document.getElementById("callSubtitle").innerText = "Messages & summary";

  hint.textContent = "Loading…";
  list.innerHTML = "";
  statsGrid.innerHTML = "";

  try {
    const res = await fetch(`${window.OPSMIND_API_URL}/api/call?id=${encodeURIComponent(callId)}`);
    const call = await res.json();

    if (!res.ok) {
      hint.textContent = "Error loading call";
      list.innerHTML = `<div class="table-empty">Could not load call.</div>`;
      return;
    }

    renderSummary(call);
    renderLinks(call);
    renderMessages(call);

  } catch (err) {
    console.error(err);
    hint.textContent = "Server connection error";
    list.innerHTML = `<div class="table-empty">Server connection error.</div>`;
  }
}

function renderSummary(call) {
  const statsGrid = document.getElementById("statsGrid");

  const assistantPhone =
    call.phoneNumber?.number ||
    call.variables?.phoneNumber?.number ||
    call.variableValues?.phoneNumber?.number ||
    "-";

  const customerPhone = call.customer?.number || "-";
  const type = call.type || "-";
  const endedReason = call.endedReason || "-";

  const successEval =
    call.analysis?.successEvaluation ??
    call.analysis?.success ??
    call.successEvaluation ??
    "-";

  const startedAt = call.startedAt ? formatDateTime(call.startedAt) : "-";
  const duration = formatDuration(call.startedAt, call.endedAt, call.duration);

  const cost =
    (typeof call.cost === "number" ? call.cost : null) ??
    call.costBreakdown?.total ??
    call.costBreakdown?.cost ??
    "-";

  const callStatus = call.status || "-";

  const items = [
    { label: "Assistant Phone", value: assistantPhone },
    { label: "Customer Phone", value: customerPhone },
    { label: "Status", value: callStatus },
    { label: "Type", value: type },
    { label: "Ended Reason", value: endedReason },
    { label: "Success", value: formatBoolishText(successEval) },
    { label: "Start Time", value: startedAt },
    { label: "Duration", value: duration },
    { label: "Cost", value: formatCostText(cost) },
  ];

  statsGrid.innerHTML = items.map(i => `
    <div class="stat-card">
      <div class="stat-label">${escapeHtml(i.label)}</div>
      <div class="stat-value">${escapeHtml(i.value)}</div>
    </div>
  `).join("");
}

function renderLinks(call) {
  const linksRow = document.getElementById("linksRow");
  const recordingLink = document.getElementById("recordingLink");
  const logLink = document.getElementById("logLink");

  const rec =
    call.recordingUrl ||
    call.artifact?.recordingUrl ||
    call.artifact?.recording?.stereoUrl ||
    call.artifact?.recording?.mono?.combinedUrl ||
    null;

  const logUrl = call.logUrl || call.artifact?.logUrl || null;

  if (!rec && !logUrl) {
    linksRow.style.display = "none";
    return;
  }

  linksRow.style.display = "flex";

  if (rec) {
    recordingLink.href = rec;
    recordingLink.style.display = "inline-flex";
  } else {
    recordingLink.style.display = "none";
  }

  if (logUrl) {
    logLink.href = logUrl;
    logLink.style.display = "inline-flex";
  } else {
    logLink.style.display = "none";
  }
}

function renderMessages(call) {
  const list = document.getElementById("messagesList");
  const hint = document.getElementById("messagesHint");

  const msgs = Array.isArray(call.messages) ? call.messages
            : (Array.isArray(call.artifact?.messages) ? call.artifact.messages : []);

  if (!msgs.length) {
    const transcript = call.transcript || call.artifact?.transcript || "";
    const summary = call.summary || call.analysis?.summary || "";

    hint.textContent = "No structured messages found";

    list.innerHTML = `
      <div class="message-item">
        <div class="message-meta">
          <span class="badge system">transcript</span>
        </div>
        <div class="message-text">${escapeHtml(transcript || "No transcript available")}</div>
      </div>
      ${summary ? `
      <div class="message-item">
        <div class="message-meta">
          <span class="badge system">summary</span>
        </div>
        <div class="message-text">${escapeHtml(summary)}</div>
      </div>` : ""}
    `;
    return;
  }

  hint.textContent = `${msgs.length} messages`;

  list.innerHTML = "";
  msgs.forEach(m => {
    const role = (m.role || "system").toLowerCase();
    const badgeClass =
      role.includes("system") ? "system" :
      (role.includes("bot") || role.includes("assistant")) ? "bot" :
      "user";

    const seconds = (m.secondsFromStart != null) ? `${m.secondsFromStart}s` : "";

    const text = m.message || m.content || "";

    const item = document.createElement("div");
    item.className = "message-item";
    item.innerHTML = `
      <div class="message-meta">
        <span class="badge ${badgeClass}">${escapeHtml(role)}</span>
        <span>${escapeHtml(seconds)}</span>
      </div>
      <div class="message-text">${escapeHtml(text)}</div>
    `;
    list.appendChild(item);
  });
}

function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatDuration(startedAt, endedAt, durationMsOrSec) {
  if (typeof durationMsOrSec === "number") {
    if (durationMsOrSec > 10000) return secondsToMmSs(Math.round(durationMsOrSec / 1000));
    return secondsToMmSs(Math.round(durationMsOrSec));
  }

  if (startedAt && endedAt) {
    const s = new Date(startedAt).getTime();
    const e = new Date(endedAt).getTime();
    if (!Number.isNaN(s) && !Number.isNaN(e) && e >= s) {
      return secondsToMmSs(Math.round((e - s) / 1000));
    }
  }
  return "-";
}

function secondsToMmSs(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatCostText(cost) {
  if (typeof cost === "number") return `$${cost.toFixed(4)}`;
  const num = Number(cost);
  if (!Number.isNaN(num)) return `$${num.toFixed(4)}`;
  return "-";
}

function formatBoolishText(v) {
  const s = String(v).toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return "true";
  if (s === "false" || s === "0" || s === "no") return "false";
  return String(v);
}

function shortId(id) {
  if (!id || id.length < 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}