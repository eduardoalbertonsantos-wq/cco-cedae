document.addEventListener('DOMContentLoaded', () => {
    if (window.location.search.includes('logout') || window.location.search.includes('sair') || window.location.search.includes('limpar') || window.location.search.includes('sessao_expirada')) {
        clearAuth();
        try { localStorage.clear(); sessionStorage.clear(); } catch (err) {}
    } else if (isAuthenticated()) {
        window.location.href = 'dashboard.html';
        return;
    }

    const loginForm = document.getElementById('loginForm');
    const errorContainer = document.getElementById('loginError');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value.trim();
            const senha = document.getElementById('senha').value;
            const submitBtn = document.getElementById('loginBtn');
            
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Autenticando...';
            }
            if (errorContainer) {
                errorContainer.style.display = 'none';
                errorContainer.textContent = '';
            }
            
                const response = await apiPost('/auth/login', { email, senha });
                const userObj = response.usuario || response.user;
                setAuth(response.token, userObj);
                
                if (userObj && userObj.perfil === 'supervisor') {
                    window.location.href = 'app-supervisao.html';
                } else {
                    window.location.href = 'dashboard.html';
                }
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
