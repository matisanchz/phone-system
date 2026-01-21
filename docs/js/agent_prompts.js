document.addEventListener('DOMContentLoaded', async () => {
  const userId = localStorage.getItem('user_id');
  const useCase = localStorage.getItem('use_case');
  const agentName = localStorage.getItem('agent_name');

  if (!userId || !useCase) {
    alert("Missing user or use case");
    return;
  }

  document.getElementById('user_id').value = userId;
  document.getElementById('use_case').value = useCase;
  document.getElementById('agent_name').value = agentName;

  try {
    const systemRes = await fetch(
      `${window.OPSMIND_API_URL}/api/system_prompt?use_case=${useCase}&agent_name=${agentName}`
    );
    const systemData = await systemRes.json();

    document.getElementById('system_prompt').value = systemData;

    const firstMsgRes = await fetch(
      `${window.OPSMIND_API_URL}/api/first_message?use_case=${useCase}&agent_name=${agentName}`
    );
    const firstMsgData = await firstMsgRes.json();
    document.getElementById('first_message').value = firstMsgData;

  } catch (err) {
    console.error(err);
    alert("Error loading defaults");
  }
});

document.getElementById("createAgentForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);

  // Asegurar multi-file en caso de que el browser no lo agregue como esperás
  const fileInput = document.getElementById("files");
  if (fileInput && fileInput.files && fileInput.files.length > 0) {
    // remove possible previous single "file" field if exists
    formData.delete("file");

    // re-append all
    for (const f of fileInput.files) {
      formData.append("files", f);
    }
  }

  try {
    const res = await fetch("${window.OPSMIND_API_URL}/api/create-agent", {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      alert("Error: " + (data.detail || "Could not create agent"));
      return;
    }

    window.location.href = "/docs/home.html";

  } catch (err) {
    console.error(err);
    alert("Server connection error.");
  }
});