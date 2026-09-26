document.addEventListener('DOMContentLoaded', () => {
    if (isAuthenticated()) {
        window.location.href = '/dashboard.html';
        return;
    }

    const loginForm = document.getElementById('loginForm');
    const errorContainer = document.getElementById('loginError') || document.getElementById('errorContainer');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value.trim();
            const senhaInput = document.getElementById('senha') || document.getElementById('password');
            const senha = senhaInput ? senhaInput.value : '';
            const submitBtn = document.getElementById('loginBtn') || loginForm.querySelector('button[type="submit"]');
            
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Acessando...';
            }
            if (errorContainer) {
                errorContainer.style.display = 'none';
                errorContainer.textContent = '';
            }
            
            try {
                const response = await apiPost('/auth/login', { email, senha });
                setAuth(response.token, response.usuario || response.user);
                window.location.href = 'dashboard.html';
            } catch (error) {
                if (errorContainer) {
                    errorContainer.textContent = error.message || 'Falha ao autenticar no CCO.';
                    errorContainer.style.display = 'block';
                } else {
                    alert(error.message || 'Falha ao autenticar.');
                }
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'ACESSAR SISTEMA';
                }
            }
        });
    }
});
