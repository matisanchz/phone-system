const agentId = localStorage.getItem("assistant_id");
const customerNumber = encodeURIComponent(localStorage.getItem("user_tel"));

async function testAssistant() {
    const systemRes = await fetch(
      `http://localhost:8000/api/test-call?customer_number=${customerNumber}&assistant_id=${agentId}`,
      {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            customer_number: customerNumber,
            assistant_id: agentId
        })
      }
    );
}

async function deleteAssistant() {
    const systemRes = await fetch(
      `http://localhost:8000/api/delete-assistant?id=${agentId}`,
      {
        method: "DELETE",
        headers: {
            "Content-Type": "application/json"
        }
      }
    );

    window.location.href = "home.html";
}

document.addEventListener("DOMContentLoaded", () => {

  const agentName = localStorage.getItem("assistant_name");
  if (agentName) {
    document.getElementById("agentTitle").innerText = agentName;
    document.getElementById("agentSubtitle").innerText = "Manage this assistant";
  }

  loadCalls();
  loadCharts();
});

async function loadCalls() {
  const agentId = localStorage.getItem("assistant_id");
  const tbody = document.getElementById("callsTbody");

  if (!agentId) {
    tbody.innerHTML = `<tr><td colspan="10" class="table-empty">Missing agentId</td></tr>`;
    return;
  }

  tbody.innerHTML = `<tr><td colspan="10" class="table-empty">Loading calls…</td></tr>`;

  try {
    const res = await fetch(`http://localhost:8000/api/calls?assistant_id=${encodeURIComponent(agentId)}`);
    const data = await res.json();

    const calls = Array.isArray(data) ? data : (data.results || data.calls || []);

    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="10" class="table-empty">Error loading calls</td></tr>`;
      return;
    }

    if (!calls.length) {
      tbody.innerHTML = `<tr><td colspan="10" class="table-empty">No calls found</td></tr>`;
      return;
    }

    tbody.innerHTML = "";

    calls.forEach(call => {
      const callId = call.id ?? "-";

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

      const score =
        call.score ??
        call.analysis?.score ??
        (call.scorecards && Object.keys(call.scorecards).length ? "Has scorecard" : "-");

      const startedAt = call.startedAt ? formatDateTime(call.startedAt) : "-";
      const duration = formatDuration(call.startedAt, call.endedAt, call.duration);

      const cost =
        (typeof call.cost === "number" ? call.cost : null) ??
        call.costBreakdown?.total ??
        call.costBreakdown?.cost ??
        "-";

      const tr = document.createElement("tr");
      tr.classList.add("call-row");

      tr.innerHTML = `
        <td class="mono">${escapeHtml(shortId(callId))}</td>
        <td class="mono">${escapeHtml(assistantPhone)}</td>
        <td class="mono">${escapeHtml(customerPhone)}</td>
        <td>${escapeHtml(type)}</td>
        <td>${escapeHtml(endedReason)}</td>
        <td>${formatBoolish(successEval)}</td>
        <td>${escapeHtml(String(score))}</td>
        <td>${escapeHtml(startedAt)}</td>
        <td>${escapeHtml(duration)}</td>
        <td>${formatCost(cost)}</td>
      `;

      tr.addEventListener("click", () => {
        document.querySelectorAll(".data-table tbody tr.call-row")
          .forEach(r => r.classList.remove("active"));
        tr.classList.add("active");

        localStorage.setItem("call_id", call.id);
        localStorage.setItem("assistant_id", call.assistantId);

        window.location.href = "/views/call_messages.html";
      });

      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="10" class="table-empty">Server connection error</td></tr>`;
  }
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

function formatCost(cost) {
  if (typeof cost === "number") return `$${cost.toFixed(4)}`;
  const num = Number(cost);
  if (!Number.isNaN(num)) return `$${num.toFixed(4)}`;
  return "-";
}

function formatBoolish(v) {
  const s = String(v).toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return "✅ true";
  if (s === "false" || s === "0" || s === "no") return "❌ false";
  return escapeHtml(String(v));
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

loadCharts();

async function loadCharts() {
  const agentId = localStorage.getItem("assistant_id");
  if (!agentId) return;

  try {
    const res = await fetch(`http://localhost:8000/api/calls?assistant_id=${encodeURIComponent(agentId)}`);
    const data = await res.json();
    const calls = Array.isArray(data) ? data : (data.results || data.calls || []);

    const series = buildDailySeries(calls);

    renderLineChart("chartMinutes", series.labels, series.minutes, "Minutes", "minutes");
    renderLineChart("chartCalls", series.labels, series.calls, "Calls", "calls");
    renderLineChart("chartSpent", series.labels, series.spent, "USD", "money");
    renderLineChart("chartAvgCost", series.labels, series.avgCost, "USD", "money");

  } catch (e) {
    console.error("loadCharts error", e);
  }
}

function buildDailySeries(calls) {
  const map = new Map(); // YYYY-MM-DD -> { minutes, calls, spent }

  for (const c of calls) {
    const day = isoDay(c.startedAt || c.createdAt);
    if (!day) continue;

    const acc = map.get(day) || { minutes: 0, calls: 0, spent: 0 };

    acc.calls += 1;

    const durationSec = calcDurationSec(c.startedAt, c.endedAt, c.duration);
    acc.minutes += durationSec / 60;

    acc.spent += pickCost(c);

    map.set(day, acc);
  }

  const labels = Array.from(map.keys()).sort();
  return {
    labels,
    minutes: labels.map(d => round2(map.get(d).minutes)),
    calls: labels.map(d => map.get(d).calls),
    spent: labels.map(d => round4(map.get(d).spent)),
    avgCost: labels.map(d => {
      const a = map.get(d);
      return a.calls ? round4(a.spent / a.calls) : 0;
    })
  };
}

function isoDay(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function calcDurationSec(startedAt, endedAt, durationMsOrSec) {
  if (startedAt && endedAt) {
    const s = new Date(startedAt).getTime();
    const e = new Date(endedAt).getTime();
    if (!Number.isNaN(s) && !Number.isNaN(e) && e >= s) return (e - s) / 1000;
  }

  if (typeof durationMsOrSec === "number") {
    if (durationMsOrSec > 10000) return durationMsOrSec / 1000;
    return durationMsOrSec;
  }

  return 0;
}

function pickCost(call) {
  if (typeof call.cost === "number") return call.cost;

  if (call.costBreakdown && typeof call.costBreakdown.total === "number") {
    return call.costBreakdown.total;
  }

  if (Array.isArray(call.costs)) {
    return call.costs.reduce((sum, x) => sum + (typeof x.cost === "number" ? x.cost : 0), 0);
  }

  return 0;
}

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }

const charts = {};

function renderLineChart(canvasId, labels, values, yLabel, formatKind) {
  const el = document.getElementById(canvasId);
  if (!el) return;

  if (charts[canvasId]) charts[canvasId].destroy();

  charts[canvasId] = new Chart(el, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: yLabel,
        data: values,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y;
              if (formatKind === "money") return `$${Number(v).toFixed(4)}`;
              return `${v}`;
            }
          }
        }
      },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true }
      }
    }
  });
}