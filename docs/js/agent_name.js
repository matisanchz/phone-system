    const userId = localStorage.getItem("user_id");

    if (!userId) {
      window.location.href = "login.html";
    }

    function goToCreate() {
      const agentName = document.getElementById("name").value.trim(); 

      localStorage.setItem("agent_name", agentName);
      window.location.href = "agent_prompts.html";
    }