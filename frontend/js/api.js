const API_BASE = '/api/v1';

function getToken() {
    return localStorage.getItem('cco_token') || localStorage.getItem('token') || sessionStorage.getItem('token');
}

function getUser() {
    const raw = localStorage.getItem('cco_user') || localStorage.getItem('user');
    try {
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function setAuth(token, user) {
    if (token) {
        localStorage.setItem('cco_token', token);
        localStorage.setItem('token', token);
    }
    if (user) {
        localStorage.setItem('cco_user', JSON.stringify(user));
        localStorage.setItem('user', JSON.stringify(user));
    }
}

function clearAuth() {
    localStorage.removeItem('cco_token');
    localStorage.removeItem('token');
    localStorage.removeItem('cco_user');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
}

function isAuthenticated() {
    return !!getToken();
}

async function apiRequest(endpoint, options = {}) {
    const url = API_BASE + endpoint;
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const token = getToken();

    if (token && !endpoint.startsWith('/auth/login') && !endpoint.startsWith('/formulario')) {
        headers['Authorization'] = 'Bearer ' + token;
    }

    try {
        const response = await fetch(url, { ...options, headers });
        const text = await response.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch (jsonErr) {
            data = { error: text || response.statusText };
        }

        if (!response.ok) {
            const errorMsg = data.error || data.message || `Erro ${response.status}: ${response.statusText}`;
            console.error(`[API ERROR] ${options.method || 'GET'} ${url} -> Status ${response.status}:`, errorMsg, data);
            throw new Error(errorMsg);
        }

        return data;
    } catch (error) {
        console.error(`[API EXCEPTION] ${options.method || 'GET'} ${url}:`, error.message);
        throw error;
    }
}

async function apiGet(endpoint) { return apiRequest(endpoint); }
async function apiPost(endpoint, body) { return apiRequest(endpoint, { method: 'POST', body: JSON.stringify(body) }); }
async function apiPut(endpoint, body) { return apiRequest(endpoint, { method: 'PUT', body: JSON.stringify(body) }); }
async function apiDelete(endpoint) { return apiRequest(endpoint, { method: 'DELETE' }); }
