import React from 'react'
import { useSongPlays } from '../../hooks/useSongPlays'
import './PlaysBadge.css'

export default function PlaysBadge({ songId, onlyValid = true }) {
    const { data, loading, error } = useSongPlays(songId, { valid: onlyValid })

    if (!songId) return null
    if (loading) return <span className="plays-badge is-loading" title="Cargando reproducciones…">···</span>
    if (error)   return <span className="plays-badge is-error"   title="Error cargando reproducciones">—</span>

    const plays = data?.plays ?? 0
    const label = onlyValid ? 'reproducciones' : 'repros (todas)'

    return (
        <span className="plays-badge" title={`${plays} ${label}`}>
      {plays.toLocaleString('es-ES')} {label}
    </span>
    )
}
