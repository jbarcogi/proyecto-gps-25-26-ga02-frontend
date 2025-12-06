import React, { useState } from 'react';
import { confirmPasswordReset } from '../../services/userApi.js';
import './ResetPasswordForm.css';

const ResetPasswordForm = ({ token, onBack, onSuccess }) => {
    const [formData, setFormData] = useState({
        newPassword: '',
        confirmPassword: ''
    });
    const [errors, setErrors] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);

    const validatePassword = (password) => {
        if (!password) {
            return 'La contraseña es requerida';
        } else if (password.length < 8) {
            return 'La contraseña debe tener al menos 8 caracteres';
        }
        return null;
    };

    const validateConfirmPassword = (confirmPassword) => {
        if (!confirmPassword) {
            return 'Confirma tu contraseña';
        } else if (confirmPassword !== formData.newPassword) {
            return 'Las contraseñas no coinciden';
        }
        return null;
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value
        });

        if (name === 'newPassword') {
            const error = validatePassword(value);
            setErrors(prev => ({ ...prev, newPassword: error }));
        } else if (name === 'confirmPassword') {
            const error = validateConfirmPassword(value);
            setErrors(prev => ({ ...prev, confirmPassword: error }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!token) {
            setErrors({ general: 'Token de recuperación no válido.' });
            return;
        }

        const newPasswordError = validatePassword(formData.newPassword);
        const confirmPasswordError = validateConfirmPassword(formData.confirmPassword);

        if (newPasswordError || confirmPasswordError) {
            setErrors({
                newPassword: newPasswordError,
                confirmPassword: confirmPasswordError
            });
            return;
        }

        setIsLoading(true);
        setErrors({});

        try {
            const response = await confirmPasswordReset(
                token,
                formData.newPassword,
                formData.confirmPassword
            );

            setSuccessMessage('¡Contraseña actualizada correctamente! Redirigiendo al login...');
            setShowSuccess(true);

            setTimeout(() => {
                if (onSuccess) {
                    onSuccess();
                }
            }, 2000);

        } catch (error) {
            if (error.status === 422 && error.data && error.data.details) {
                setErrors(error.data.details);
            } else if (error.status === 0) {
                setErrors({ general: 'Error de conexión con el servidor. Intenta nuevamente.' });
            } else {
                setErrors({ general: error.data?.message || 'Ha ocurrido un error al restablecer la contraseña.' });
            }
            setShowSuccess(false);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="reset-password-container">
            <button onClick={onBack} className="back-btn">← Volver al Inicio</button>
            <h2>Restablecer Contraseña</h2>

            {showSuccess && (
                <div className="success-message">
                    <div className="success-icon">✓</div>
                    <div className="success-content">
                        <strong>¡Contraseña Actualizada!</strong>
                        <p>{successMessage}</p>
                        <small>Redirigiendo al login...</small>
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="reset-password-form">
                <div className="form-group">
                    <label htmlFor="newPassword">Nueva Contraseña</label>
                    <input
                        type="password"
                        id="newPassword"
                        name="newPassword"
                        value={formData.newPassword}
                        onChange={handleChange}
                        className={errors.newPassword ? 'error' : ''}
                        disabled={isLoading || showSuccess}
                        placeholder="Mínimo 8 caracteres"
                    />
                    {errors.newPassword && (
                        <span className="error-text">{errors.newPassword}</span>
                    )}
                </div>

                <div className="form-group">
                    <label htmlFor="confirmPassword">Confirmar Contraseña</label>
                    <input
                        type="password"
                        id="confirmPassword"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        className={errors.confirmPassword ? 'error' : ''}
                        disabled={isLoading || showSuccess}
                        placeholder="Repite tu contraseña"
                    />
                    {errors.confirmPassword && (
                        <span className="error-text">{errors.confirmPassword}</span>
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
                    {isLoading ? 'Actualizando...' : 'Restablecer Contraseña'}
                </button>
            </form>
        </div>
    );
};

export default ResetPasswordForm;