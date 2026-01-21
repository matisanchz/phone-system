let isLogin = true;

function toggleMode() {
    isLogin = !isLogin;
    document.getElementById('title').innerText = isLogin ? "Log in" : "Sign up";
    document.getElementById('btnText').innerText = isLogin ? "Enter" : "Create account";
    document.getElementById('toggleText').innerText = isLogin ? "Don't have an account? Register here" : "Do you already have an account? Log in";
    document.getElementById('tel').hidden = isLogin;
    document.getElementById('tel').required = !isLogin;
}

document.getElementById('authForm').onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const endpoint = isLogin ? '/auth/login' : '/auth/signup';

    try {
        const response = await fetch(`${window.OPSMIND_API_URL}${endpoint}`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            if (isLogin) {
                localStorage.setItem('user_id', data.user.id);
                localStorage.setItem('user_email', data.user.email);
                localStorage.setItem('user_tel', data.user.telephone);
                window.location.href = '/phone-system/home.html';
            } else {
                alert("Account created. You can now log in.");
                toggleMode();
            }
        } else {
            alert("Error: " + data.detail);
        }
    } catch (err) {
        alert(err)
        alert("Server connection error.");
    }
};