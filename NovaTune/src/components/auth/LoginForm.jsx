import React, { useState } from 'react';
import { loginUser } from '../../services/userApi.js';
import './LoginForm.css';

const LoginForm = ({ onBack, onSuccess, onNavigateToForgotPassword, onNavigateToRegister }) => {
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);

    const validateField = (name, value) => {
        const newErrors = { ...errors };

        switch (name) {
            case 'email':
                if (!value.trim()) {
                    newErrors.email = 'El email es requerido';
                } else if (!/\S+@\S+\.\S+/.test(value)) {
                    newErrors.email = 'Formato de email inválido';
                } else {
                    delete newErrors.email;
                }
                break;

            case 'password':
                if (!value) {
                    newErrors.password = 'La contraseña es requerida';
                } else {
                    delete newErrors.password;
                }
                break;

            default:
                break;
        }

        setErrors(newErrors);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value
        });

        if (showSuccess) setShowSuccess(false);
        if (successMessage) setSuccessMessage('');

        validateField(name, value);
    };

    const handleBlur = (e) => {
        const { name } = e.target;
        setTouched({
            ...touched,
            [name]: true
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        Object.keys(formData).forEach(key => {
            validateField(key, formData[key]);
        });

        setTouched({
            email: true,
            password: true
        });

        if (Object.keys(errors).length > 0) {
            return;
        }

        setIsLoading(true);
        setErrors({});
        setSuccessMessage('');
        setShowSuccess(false);

        try {
            const response = await loginUser(formData);
            setSuccessMessage(`¡Bienvenido de nuevo! Sesión iniciada correctamente.`);
            setShowSuccess(true);

            localStorage.setItem('access_token', response.access_token);
            localStorage.setItem('refresh_token', response.refresh_token);

            console.log('Tokens guardados:', {
                access_token: response.access_token,
                refresh_token: response.refresh_token
            });

            setFormData({
                email: '',
                password: ''
            });

            setTimeout(() => {
                if (onSuccess) {
                    onSuccess(response);
                }
            }, 2000);

        } catch (error) {
            // ERRORES - Mostrar mensajes específicos
            if (error.status === 422 && error.data && error.data.details) {
                // Errores de validación del servidor
                setErrors(error.data.details);
            } else if (error.status === 0) {
                // Error de conexión
                setErrors({ general: 'Error de conexión con el servidor. Intenta nuevamente.' });
            } else {
                // Error inesperado
                setErrors({ general: error.data?.message || 'Ha ocurrido un error inesperado.' });
            }
            setShowSuccess(false);
        } finally {
            setIsLoading(false);
        }
    };

    const showError = (field) => touched[field] && errors[field];

    return (
        <div className="login-container">
            <button onClick={onBack} className="back-btn">← Volver</button>
            <h2>Iniciar Sesión en NovaTune</h2>

            {/* MENSAJE DE ÉXITO */}
            {showSuccess && (
                <div className="success-message">
                    <div className="success-icon">✓</div>
                    <div className="success-content">
                        <strong>¡Sesión Iniciada!</strong>
                        <p>{successMessage}</p>
                        <small>Redirigiendo...</small>
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
                <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={showError('email') ? 'error' : ''}
                        disabled={isLoading || showSuccess}
                        placeholder="tu@email.com"
                    />
                    {showError('email') && (
                        <span className="error-text">{errors.email}</span>
                    )}
                </div>

                <div className="form-group">
                    <label htmlFor="password">Contraseña</label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={showError('password') ? 'error' : ''}
                        disabled={isLoading || showSuccess}
                        placeholder="Tu contraseña"
                    />
                    {showError('password') && (
                        <span className="error-text">{errors.password}</span>
                    )}
                </div>

                {/* ERROR GENERAL */}
                {errors.general && !showSuccess && (
                    <div className="error-message">
                        <div className="error-icon">⚠</div>
                        {errors.general}
                    </div>
                )}

                <button
                    type="submit"
                    className="submit-btn"
                    disabled={isLoading || showSuccess}
                >
                    {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                </button>

                <div className="login-links">
                    <p>¿No tienes cuenta? <button type="button" className="link-btn" onClick={onNavigateToRegister}>Regístrate aquí</button></p>
                    <p>¿Olvidaste tu contraseña? <button type="button" className="link-btn" onClick={onNavigateToForgotPassword}>Recupérala aquí</button></p>
                </div>
            </form>
        </div>
    );
};

export default LoginForm;