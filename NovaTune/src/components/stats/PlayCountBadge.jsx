// src/components/PlayCountBadge.jsx
import { useState } from 'react';
import { fetchSongPlays, incrementSongPlay, decrementSongPlay } from '../../api/statsApi';

export default function PlayCountBadge({ songId }) {
    const [status, setStatus] = useState('idle'); // idle | loading | success | error
    const [plays, setPlays] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');
    const [wasNotFound, setWasNotFound] = useState(false);

    const consult = async () => {
        // Guard: no requests for missing song id
        if (!songId) {
            setStatus('error');
            setErrorMsg('ID de canción no disponible (no se pueden consultar reproducciones).');
            return;
        }
        setStatus('loading');
        setErrorMsg('');
        setWasNotFound(false);

        const res = await fetchSongPlays(songId);
        if (!res.ok) {
            setStatus('error');
            setErrorMsg(res.error || 'Error consultando estadísticas.');
            return;
        }
        setPlays(res.plays || 0);
        setWasNotFound(Boolean(res.notFound));
        setStatus('success');
    };

    const addOne = async () => {
        setStatus('loading');
        setErrorMsg('');
        const res = await incrementSongPlay(songId);
        if (!res.ok) {
            setStatus('error');
            setErrorMsg(res.error || 'No se pudo incrementar.');
            return;
        }
        setPlays(res.plays);
        setStatus('success');
    };

    const removeOne = async () => {
        setStatus('loading');
        setErrorMsg('');
        const res = await decrementSongPlay(songId);
        if (!res.ok) {
            setStatus('error');
            setErrorMsg(res.error || 'No se pudo decrementar.');
            return;
        }
        setPlays(res.plays);
        setStatus('success');
    };

    const btn = (label, onClick, title) => (
        <button
            onClick={onClick}
            title={title}
            style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid #ccc',
                background: '#fff',
                cursor: 'pointer',
                fontSize: 12,
                color: '#000', // texto negro sobre fondo claro
            }}
        >
            {label}
        </button>
    );

    if (status === 'idle') {
        // If no valid songId, render a disabled/info state instead of a working button
        if (!songId) {
            return (
                <span
                    style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: '#fff1f0',
                        color: '#000',
                        fontSize: 12,
                        border: '1px solid #ffd6d0',
                    }}
                    title="Este elemento no tiene un identificador numérico válido para estadísticas"
                >
                    ID de canción no disponible
                </span>
            );
        }

        return btn('Ver reproducciones', consult, 'Consultar reproducciones en estadísticas');
    }

    if (status === 'loading') {
        return (
            <span
                style={{
                    fontSize: 12,
                    color: '#000', // texto negro
                }}
            >
                Consultando…
            </span>
        );
    }

    if (status === 'error') {
        return (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span
                    style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: '#ffecec',
                        color: '#000', // texto negro sobre fondo claro
                        fontSize: 12,
                        border: '1px solid #ffb3b3',
                    }}
                >
                    {errorMsg}
                </span>
                {btn('Reintentar', consult, 'Volver a consultar')}
            </div>
        );
    }

    // success
    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {plays === 0 ? (
                <span
                    style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: '#eef6ff',
                        color: '#000', // texto negro
                        fontSize: 12,
                        border: '1px solid #cfe3ff',
                    }}
                    title={
                        wasNotFound
                            ? 'La canción no existe aún en estadísticas (equivale a 0).'
                            : undefined
                    }
                >
                    Sin reproducciones registradas
                </span>
            ) : (
                <span
                    style={{
                        padding: '4px 8px',
                        borderRadius: 999,
                        background: '#e9f9ee',
                        color: '#000', // texto negro
                        fontSize: 12,
                        border: '1px solid #b6e2c1',
                        fontWeight: 600,
                    }}
                >
                    {plays} reproducciones
                </span>
            )}

            {/* Acciones */}
            {btn('+1', addOne, 'Sumar una reproducción')}
            {btn('−1', removeOne, 'Restar una reproducción')}
            {btn('Actualizar', consult, 'Actualizar conteo')}
        </div>
    );
}
