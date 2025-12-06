const API_BASE_URL = 'http://127.0.0.1:8000/api/v1';

// Función para registrar usuario
export const registerUser = async (userData) => {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        });

        const data = await response.json();

        if (!response.ok) throw { status: response.status, data };
        return data;
    } catch (error) {
        if (error.status) throw error;
        throw {
            status: 0,
            data: { code: 'NETWORK_ERROR', message: 'Error de conexión. Verifica tu internet e intenta nuevamente.' }
        };
    }
};

// Función para login de usuario
export const loginUser = async (userData) => {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        });

        const data = await response.json();
        if (!response.ok) throw { status: response.status, data };
        return data;
    } catch (error) {
        if (error.status) throw error;
        throw {
            status: 0,
            data: { code: 'NETWORK_ERROR', message: 'Error de conexión. Verifica tu internet e intenta nuevamente.' }
        };
    }
};

// Función para logout de usuario
export const logoutUser = async () => {
    const refresh_token = localStorage.getItem('refresh_token');
    if (!refresh_token) throw new Error('No hay token de refresh disponible');

    try {
        const response = await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            },
            body: JSON.stringify({ refresh_token })
        });

        const data = await response.json();
        if (!response.ok) throw { status: response.status, data };
        return data;
    } catch (error) {
        if (error.status) throw error;
        throw {
            status: 0,
            data: { code: 'NETWORK_ERROR', message: 'Error de conexión. Verifica tu internet e intenta nuevamente.' }
        };
    }
};

// Función para refresh token
export const refreshTokens = async (refreshToken) => {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });

        const data = await response.json();
        if (!response.ok) throw { status: response.status, data };
        return data;
    } catch (error) {
        if (error.status) throw error;
        throw {
            status: 0,
            data: { code: 'NETWORK_ERROR', message: 'Error de conexión al refrescar tokens' }
        };
    }
};

// Función para peticiones autenticadas con auto-refresh
export const authFetch = async (url, options = {}) => {
    let accessToken = localStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token');

    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    try {
        let response = await fetch(`${API_BASE_URL}${url}`, { ...options, headers });

        // Si el token expiró (401), intentar refresh
        if (response.status === 401 && refreshToken) {
            try {
                const newTokens = await refreshTokens(refreshToken);
                localStorage.setItem('access_token', newTokens.access_token);
                localStorage.setItem('refresh_token', newTokens.refresh_token);

                headers['Authorization'] = `Bearer ${newTokens.access_token}`;
                response = await fetch(`${API_BASE_URL}${url}`, { ...options, headers });
            } catch (refreshError) {
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/login';
                throw refreshError;
            }
        }

        return response;
    } catch (error) {
        throw error;
    }
};

// Función para solicitar recuperación de contraseña
export const requestPasswordReset = async (email) => {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/password-reset/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });

        const data = await response.json();
        if (!response.ok) throw { status: response.status, data };
        return data;
    } catch (error) {
        if (error.status) throw error;
        throw {
            status: 0,
            data: { code: 'NETWORK_ERROR', message: 'Error de conexión. Verifica tu internet e intenta nuevamente.' }
        };
    }
};

// Función para validar token de recuperación
export const validateResetToken = async (token) => {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/password-reset/validate-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        });

        const data = await response.json();
        if (!response.ok) throw { status: response.status, data };
        return data;
    } catch (error) {
        if (error.status) throw error;
        throw {
            status: 0,
            data: { code: 'NETWORK_ERROR', message: 'Error de conexión. Verifica tu internet e intenta nuevamente.' }
        };
    }
};

// Función para confirmar nueva contraseña
export const confirmPasswordReset = async (token, newPassword, confirmPassword) => {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/password-reset/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, new_password: newPassword, confirm_password: confirmPassword }),
        });

        const data = await response.json();
        if (!response.ok) throw { status: response.status, data };
        return data;
    } catch (error) {
        if (error.status) throw error;
        throw {
            status: 0,
            data: { code: 'NETWORK_ERROR', message: 'Error de conexión. Verifica tu internet e intenta nuevamente.' }
        };
    }
};
