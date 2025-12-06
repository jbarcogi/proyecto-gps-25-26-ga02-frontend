import React, { useState } from 'react';
import { registerUser } from '../../services/userApi.js';
import './RegisterForm.css';

const RegisterForm = ({ onBack }) => {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        user_type: 'user' // default
    });
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState(''); // ← NUEVO STATE para éxito
    const [showSuccess, setShowSuccess] = useState(false); // ← Controlar visibilidad del éxito

    // Validación en tiempo real
    const validateField = (name, value) => {
        const newErrors = { ...errors };

        switch (name) {
            case 'username':
                if (!value.trim()) {
                    newErrors.username = 'El nombre de usuario es requerido';
                } else if (value.length < 3) {
                    newErrors.username = 'Mínimo 3 caracteres';
                } else {
                    delete newErrors.username;
                }
                break;

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
                } else if (value.length < 8) {
                    newErrors.password = 'Mínimo 8 caracteres';
                } else {
                    delete newErrors.password;
                }
                break;

            case 'user_type':
                if (!value) {
                    newErrors.user_type = 'El tipo de usuario es requerido';
                } else {
                    delete newErrors.user_type;
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

        // Limpiar mensajes cuando el usuario empiece a escribir
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

        // Validar todos los campos antes de enviar
        Object.keys(formData).forEach(key => {
            validateField(key, formData[key]);
        });

        // Marcar todos los campos como tocados
        setTouched({
            username: true,
            email: true,
            password: true,
            user_type: true
        });

        // Si hay errores de validación, no enviar
        if (Object.keys(errors).length > 0) {
            return;
        }

        // Si todo está bien, enviar al backend
        setIsLoading(true);
        setErrors({});
        setSuccessMessage('');
        setShowSuccess(false);

        try {
            const response = await registerUser(formData);

            // ÉXITO - Mostrar mensaje bonito
            setSuccessMessage(`¡Cuenta creada exitosamente! Tu ID de usuario es: ${response.user_id}`);
            setShowSuccess(true);

            // Limpiar formulario
            setFormData({
                username: '',
                email: '',
                password: '',
                user_type: 'user'
            });

            // REDIRECCIÓN AUTOMÁTICA después de 3 segundos
            setTimeout(() => {
                // Redirigir a la página principal
                window.location.href = '/';
            }, 3000);

        } catch (error) {
        // ERRORES - Mostrar mensajes específicos
        console.log('Error completo:', error); // Para debugging

        if (error.status === 422 && error.data && error.data.details) {
            // Errores de validación del servidor (email duplicado, etc.)
            setErrors(error.data.details);
        } else if (error.status === 409 && error.data) {
            // Conflicto - email duplicado
            setErrors({ general: 'Este email ya está registrado. ¿Ya tienes una cuenta?' });
        } else if (error.data && error.data.message) {
            // Error general del servidor
            setErrors({ general: error.data.message });
        } else if (error.status === 0) {
            // Error de conexión
            setErrors({ general: 'Error de conexión con el servidor. Intenta nuevamente.' });
        } else {
            // Error inesperado
            setErrors({ general: 'Ha ocurrido un error inesperado. Intenta nuevamente.' });
        }
        setShowSuccess(false);
    } finally {
            setIsLoading(false);
        }
    };

    const showError = (field) => touched[field] && errors[field];

    return (
        <div className="register-container">
            <button onClick={onBack} className="back-btn">← Volver</button>
            <h2>Crear Cuenta en NovaTune</h2>

            {/* ✅ MENSAJE DE ÉXITO */}
            {showSuccess && (
                <div className="success-message">
                    <div className="success-icon">✓</div>
                    <div className="success-content">
                        <strong>¡Registro Exitoso!</strong>
                        <p>{successMessage}</p>
                        <small>Serás redirigido automáticamente...</small>
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="register-form">
                <div className="form-group">
                    <label htmlFor="username">Nombre de usuario</label>
                    <input
                        type="text"
                        id="username"
                        name="username"
                        value={formData.username}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={showError('username') ? 'error' : ''}
                        disabled={isLoading || showSuccess}
                    />
                    {showError('username') && (
                        <span className="error-text">{errors.username}</span>
                    )}
                </div>

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
                    />
                    {showError('password') && (
                        <span className="error-text">{errors.password}</span>
                    )}
                </div>

                {/* Role selection card */}
                <div className="role-card">
                    <div className="form-group">
                        <label htmlFor="user_type">Tipo de usuario</label>
                        <select
                            id="user_type"
                            name="user_type"
                            value={formData.user_type}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            className={showError('user_type') ? 'error' : ''}
                            disabled={isLoading || showSuccess}
                        >
                            <option value="user">Usuario</option>
                            <option value="artist">Artista</option>
                            <option value="label">Discográfica</option>
                        </select>
                        {showError('user_type') && (
                            <span className="error-text">{errors.user_type}</span>
                        )}
                    </div>
                </div>

                {/* ❌ ERROR GENERAL */}
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
                    {isLoading ? 'Registrando...' : 'Registrarse'}
                </button>
            </form>
        </div>
    );
};

export default RegisterForm;