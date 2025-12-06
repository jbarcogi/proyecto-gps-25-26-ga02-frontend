// hooks/useAuth.js
import { createContext, useState, useEffect, useContext } from 'react';
import { refreshTokens } from '../services/userApi';

// Crear el contexto
const AuthContext = createContext();

// Hook personalizado para usar el contexto
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth debe usarse dentro de un AuthProvider');
    }
    return context;
};

// Proveedor del contexto
export const AuthProvider = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Verificar autenticación al cargar
        const checkAuth = async () => {
            const accessToken = localStorage.getItem('access_token');
            const refreshToken = localStorage.getItem('refresh_token');

            if (!accessToken || !refreshToken) {
                setIsAuthenticated(false);
                setIsLoading(false);
                return;
            }

            setIsAuthenticated(true);
            setIsLoading(false);
        };

        checkAuth();
    }, []);

    const login = (tokens) => {
        localStorage.setItem('access_token', tokens.access_token);
        localStorage.setItem('refresh_token', tokens.refresh_token);
        // If we are doing a real authenticated login, remove any dev_user
        // impersonation that could cause requests to be sent as the wrong
        // developer account (e.g. 'seeduser'). This prevents accidental
        // updates to other users' ratings when switching accounts during dev.
        try {
            localStorage.removeItem('dev_user');
        } catch (e) {
            // ignore storage errors
        }
        setIsAuthenticated(true);
    };

    const logout = () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        setIsAuthenticated(false);
        window.location.href = '/';
    };

    const refreshAuth = async () => {
        try {
            const refreshToken = localStorage.getItem('refresh_token');
            if (!refreshToken) {
                logout();
                return null;
            }

            const newTokens = await refreshTokens(refreshToken);
            localStorage.setItem('access_token', newTokens.access_token);
            localStorage.setItem('refresh_token', newTokens.refresh_token);
            return newTokens.access_token;
        } catch (error) {
            console.error('Error refreshing token:', error);
            logout();
            return null;
        }
    };

    const value = {
        isAuthenticated,
        isLoading,
        login,
        logout,
        refreshAuth,
        // role helper: consumers can call getCurrentUserRole() to resolve role
        getCurrentUserRole: async () => {
            // Try to decode role from JWT first
            try {
                const token = localStorage.getItem('access_token');
                if (token && typeof token === 'string') {
                    const parts = token.split('.');
                    if (parts.length === 3) {
                        try {
                            const payload = JSON.parse(decodeURIComponent(escape(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))));
                            const roleClaim = payload.role || payload.roles || payload.user_type || payload.type;
                            if (roleClaim) {
                                const resolved = Array.isArray(roleClaim) ? String(roleClaim[0]).toLowerCase() : String(roleClaim).toLowerCase()
                                return resolved;
                            }
                        } catch (e) {
                            // ignore malformed token payload
                        }
                    }
                }
            } catch (e) {
                // ignore
            }

            // If JWT did not include role, try /me endpoint
            try {
                const accessToken = localStorage.getItem('access_token');
                if (accessToken) {
                    const resp = await fetch('http://127.0.0.1:8000/api/v1/me', {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${accessToken}`,
                        },
                    });
                    if (resp.ok) {
                        const body = await resp.json();
                        if (body && body.user_type) { return String(body.user_type).toLowerCase(); }
                        // try common fields
                        if (body && body.role) { return String(body.role).toLowerCase(); }
                    }
                }
            } catch (e) {
                // ignore network errors here
            }

            // DEV fallbacks: support dev_user or X-User-Role emulation
            try {
                if (import.meta.env && import.meta.env.DEV) {
                    const devRole = localStorage.getItem('dev_user_role') || localStorage.getItem('dev_user') || localStorage.getItem('dev_role');
                    if (devRole) { return String(devRole).toLowerCase(); }
                }
            } catch (e) {}

            return null;
        }
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};