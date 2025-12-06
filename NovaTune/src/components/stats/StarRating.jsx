import React, { useMemo, useState } from 'react'

// Simple StarRating component
// props:
// - value: number (can be float, 0..5)
// - editable: boolean
// - onChange(value)
// - size: number (px)
export default function StarRating({ value = 0, editable = false, onChange, size = 20 }) {
    const [hoverValue, setHoverValue] = useState(null)

    // When editable, show a rounded integer value so the visual selector
    // only displays whole stars. When not editable preserve fractional display.
    const display = typeof hoverValue === 'number'
        ? hoverValue
        : (editable ? Math.round(value || 0) : (value || 0))

    const percentForIndex = (idx) => {
        const v = Math.max(0, Math.min(5, display))
        const full = Math.floor(v)
        const frac = v - full
        if (idx < full) return 100
        if (idx > full) return 0
        // idx === full
        return Math.round(frac * 100)
    }

    // Only allow full-star selection (no halves). Click/move will select
    // the full star represented by the index (0..5). Clicking the currently
    // selected star will toggle it off to 0.
    const handleClick = (evt, idx) => {
        if (!editable) return
        const clicked = Math.min(5, Math.max(0, idx + 1))
        const current = Math.round(value || 0)
        const newVal = clicked === current ? 0 : clicked
        onChange && onChange(newVal)
    }

    const handleMove = (evt, idx) => {
        if (!editable) return
        const v = Math.min(5, Math.max(0, idx + 1))
        setHoverValue(v)
    }

    const handleLeave = () => {
        if (!editable) return
        setHoverValue(null)
    }

    const stars = useMemo(() => [0,1,2,3,4], [])

    return (
        <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            {stars.map((sIdx) => (
                <div
                    key={sIdx}
                    onClick={(e) => handleClick(e, sIdx)}
                    onMouseMove={(e) => handleMove(e, sIdx)}
                    onMouseLeave={handleLeave}
                    role={editable ? 'button' : 'img'}
                    aria-label={`star-${sIdx}`}
                    style={{ width: size, height: size, cursor: editable ? 'pointer' : 'default', display: 'inline-block' }}
                >
                    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
                        <defs>
                            <linearGradient id={`g-${sIdx}`} x1="0%" x2="100%">
                                <stop offset="0%" stopColor="#FFD166" />
                                <stop offset="100%" stopColor="#FFD166" />
                            </linearGradient>
                        </defs>
                        <path
                            d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.787 1.402 8.168L12 18.896l-7.336 3.869 1.402-8.168L.132 9.21l8.2-1.192z"
                            fill="#e6e6e6"
                        />
                        <clipPath id={`clip-${sIdx}`}>
                            <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.787 1.402 8.168L12 18.896l-7.336 3.869 1.402-8.168L.132 9.21l8.2-1.192z" />
                        </clipPath>
                        <rect x="0" y="0" width={`${percentForIndex(sIdx)}%`} height="100%" clipPath={`url(#clip-${sIdx})`} fill="#FFD166" />
                    </svg>
                </div>
            ))}
        </div>
    )
}
