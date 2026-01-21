const userId = localStorage.getItem("user_id");

if (!userId) {
  window.location.href = "login.html";
}

function toggleCreate() {
  document.getElementById("useCasePanel").classList.toggle("hidden");
}

function goToCreate() {
  const selected = document.querySelector('input[name="use_case"]:checked');

  if (!selected) {
    alert("Please select a use case");
    return;
  }

  localStorage.setItem("use_case", selected.value);
  window.location.href = "agent_name.html";
}

document.addEventListener("DOMContentLoaded", loadElements);

async function loadElements(){
  loadAgents();
  loadPhones();
}

async function loadPhones() {
  const userId = localStorage.getItem("user_id");

  if (!userId) {
    window.location.href = "/phone-system";
    return;
  }

  try {
    const res = await fetch(
      `${window.OPSMIND_API_URL}/api/phones?user_id=${userId}`
    );

    const phones = await res.json();
    const container = document.getElementById("phoneList");

    container.innerHTML = "";

    if (phones.length === 0) {
      container.innerHTML = "<p>No phones created yet</p>";
      return;
    }

    phones.forEach(phone => {
      const btn = document.createElement("button");
      btn.className = "item-btn";
      btn.innerHTML = `
        <p class="item-title">${phone.name} - ${phone.number}</p>
        <p class="item-meta">Click to view insights</p>
      `;

      btn.onclick = () => {
        localStorage.setItem("phone_id", phone.id);
        localStorage.setItem("phone_number", phone.number);
        window.location.href = "/phone-system/phone_logs.html";
      };

      container.appendChild(btn);
    });

  } catch (err) {
    console.error("Error loading agents:", err);
  }
}

async function loadAgents() {
  const userId = localStorage.getItem("user_id");

  if (!userId) {
    window.location.href = "/phone-system/";
    return;
  }

  try {
    const res = await fetch(
      `${window.OPSMIND_API_URL}/api/agents?user_id=${userId}`
    );

    const agents = await res.json();
    const container = document.getElementById("agentsList");

    container.innerHTML = "";

    if (agents.length === 0) {
      container.innerHTML = "<p>No agents created yet</p>";
      return;
    }

    agents.forEach(agent => {
      const btn = document.createElement("button");
      btn.className = "item-btn";
      btn.innerHTML = `
        <p class="item-title">${agent.name}</p>
        <p class="item-meta">Click to view stats</p>
      `;

      btn.onclick = () => {
        localStorage.setItem("assistant_id", agent.id);
        localStorage.setItem("assistant_name", agent.name);
        window.location.href = "/phone-system/agent_dashboard.html";
      };

      container.appendChild(btn);
    });

  } catch (err) {
    console.error("Error loading agents:", err);
  }
}

function openAgent(agentId) {
  localStorage.setItem("agentId", agentId);
  window.location.href = "/phone-system/agent_detail.html";
}