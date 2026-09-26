document.addEventListener('DOMContentLoaded', () => {
    // Check authentication for protected pages
    if (!isAuthenticated() && !window.location.pathname.includes('app-supervisao.html') && !window.location.pathname.includes('login.html') && !window.location.pathname.includes('index.html')) {
        window.location.href = '/login.html';
        return;
    }

    if (isAuthenticated()) {
        const user = getUser();
        // Supervisor não pode acessar telas administrativas
        if (user && user.perfil === 'supervisor' && !window.location.pathname.includes('app-supervisao.html')) {
            alert('ACESSO NEGADO: O painel CCO é restrito à chefia e administração. Redirecionando para a Supervisão Operacional.');
            window.location.href = '/app-supervisao.html';
            return;
        }
        initApp();
    }
});

function initApp() {
    const user = getUser();
    
    // Update user info in header
    const userNameElement = document.getElementById('userName') || document.querySelector('.user-info span');
    if (userNameElement && user) {
        userNameElement.textContent = user.nome || 'Administrador CCO';
    }
    const badgeElement = document.querySelector('.badge-primary') || document.querySelector('.user-badge');
    if (badgeElement && user) {
        if (user.perfil === 'diretoria' || user.perfil === 'consulta') {
            badgeElement.textContent = 'DIRETORIA';
            badgeElement.style.background = '#0284c7';
        } else if (user.perfil === 'admin') {
            badgeElement.textContent = 'ADMIN';
        }
    }

    // Initialize clock
    const clockElement = document.getElementById('headerClock') || document.getElementById('sys-clock');
    if (clockElement) {
        const updateClock = () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('pt-BR');
            const dateStr = now.toLocaleDateString('pt-BR');
            clockElement.textContent = `${dateStr} ${timeStr}`;
        };
        updateClock();
        setInterval(updateClock, 1000);
    }

    // Handle logout
    const logoutBtn = document.getElementById('logoutBtn') || document.querySelector('a[href="index.html"]');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            clearAuth();
        });
    }

    // Sidebar navigation highlighting
    const currentPath = window.location.pathname;
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        if (link.getAttribute('href') && currentPath.includes(link.getAttribute('href'))) {
            link.classList.add('active');
        }
    });

    // Mobile sidebar toggle
    const toggleBtn = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }

    // User dropdown toggle
    const userDropdownBtn = document.getElementById('userDropdownBtn');
    const userDropdownMenu = document.getElementById('userDropdownMenu');
    if (userDropdownBtn && userDropdownMenu) {
        userDropdownBtn.addEventListener('click', () => {
            userDropdownMenu.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!userDropdownBtn.contains(e.target) && !userDropdownMenu.contains(e.target)) {
                userDropdownMenu.classList.remove('show');
            }
        });
    }
}
