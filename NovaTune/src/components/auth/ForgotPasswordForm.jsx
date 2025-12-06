import React, { useState } from 'react';
import { requestPasswordReset } from '../../services/userApi.js';
import './ForgotPasswordForm.css';

const ForgotPasswordForm = ({ onBack, onSuccess }) => {
    const [email, setEmail] = useState('');
    const [errors, setErrors] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);

    const validateEmail = (email) => {
        if (!email.trim()) {
            return 'El email es requerido';
        } else if (!/\S+@\S+\.\S+/.test(email)) {
            return 'Formato de email inválido';
        }
        return null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const emailError = validateEmail(email);
        if (emailError) {
            setErrors({ email: emailError });
            return;
        }

        setIsLoading(true);
        setErrors({});
        setSuccessMessage('');
        setShowSuccess(false);

        try {
            const response = await requestPasswordReset(email);

            let token = '';
            if (response.reset_link) {
                const url = new URL(response.reset_link);
                token = url.searchParams.get('token');
            }

            setSuccessMessage('¡Enlace de recuperación generado! Redirigiendo...');
            setShowSuccess(true);
            setEmail('');

            setTimeout(() => {
                if (onSuccess && token) {
                    onSuccess(token);
                }
            }, 1500);

        } catch (error) {
            if (error.status === 422 && error.data && error.data.details) {
                setErrors(error.data.details);
            } else if (error.status === 400 && error.data.code === 'TOO_MANY_ATTEMPTS') {
                setErrors({ general: 'Demasiados intentos. Solicita un nuevo enlace.' });
            } else if (error.status === 0) {
                setErrors({ general: 'Error de conexión con el servidor. Intenta nuevamente.' });
            } else {
                setErrors({ general: error.data?.message || 'Ha ocurrido un error inesperado.' });
            }
            setShowSuccess(false);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="forgot-password-container">
            <button onClick={onBack} className="back-btn">← Volver</button>
            <h2>Recuperar Contraseña</h2>

            <p className="forgot-password-description">
                Ingresa tu email y te redirigiremos automáticamente al formulario de restablecimiento.
            </p>

            {showSuccess && (
                <div className="success-message">
                    <div className="success-icon">✓</div>
                    <div className="success-content">
                        <strong>¡Solicitud Enviada!</strong>
                        <p>{successMessage}</p>
                        <small>Redirigiendo al formulario de restablecimiento...</small>
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="forgot-password-form">
                <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={errors.email ? 'error' : ''}
                        disabled={isLoading || showSuccess}
                        placeholder="tu@email.com"
                    />
                    {errors.email && (
                        <span className="error-text">{errors.email}</span>
                    )}
                </div>

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
                    {isLoading ? 'Enviando...' : 'Recuperar Contraseña'}
                </button>

                <div className="forgot-password-links">
                    <p>¿Recordaste tu contraseña? <button type="button" className="link-btn" onClick={onBack}>Iniciar Sesión</button></p>
                </div>
            </form>
        </div>
    );
};

export default ForgotPasswordForm;