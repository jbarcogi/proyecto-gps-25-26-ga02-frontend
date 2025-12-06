// src/pages/ArtistSongs.jsx
import { useEffect, useMemo, useState } from 'react'
import { fetchArtistSongs } from '../api/contentsApi'
import { getSongPlays } from '../api/statsApi'
import './ArtistSongs.css'

const demoSongs = [
    { id: 'song_demo_1', title: 'artist_demo_1' },
    { id: 'song_other', title: 'artist_demo_1' },
]

export default function ArtistSongs() {
    const [artistId, setArtistId] = useState('artist_demo_1')
    const [songs, setSongs] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [plays, setPlays] = useState({}) // { songId: number }

    const apiInfo = useMemo(() => ({
        stats: '/api/v1/stats',
        content: '/api/v1/content',
    }), [])

    async function load() {
        setLoading(true)
        setError('')
        try {
            const data = await fetchArtistSongs(artistId)
            // Normalizamos: DRF suele devolver {results: [...]}
            const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : []
            const normalized = list.map((t) => ({
                // intenta sacar un identificador utilizable por /stats
                id: t.id || t.slug || t.code || t.song_id || t.track_id,
                title: t.title || t.name || t.song_name || t.track_name || '(sin título)',
            })).filter(s => !!s.id)
            if (!normalized.length) {
                setError('El endpoint respondió, pero no devolvió canciones; muestro demo.')
                setSongs(demoSongs)
            } else {
                setSongs(normalized)
            }
        } catch (e) {
            setError(`No se pudo leer canciones del endpoint. Mostrando demo. (${e.message})`)
            setSongs(demoSongs)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, []) // carga inicial

    useEffect(() => {
        // cuando cambien las canciones, pedimos plays de cada una (en paralelo)
        async function fetchPlays() {
            const entries = await Promise.all(songs.map(async s => {
                try {
                    const r = await getSongPlays(s.id)
                    return [s.id, Number(r?.plays || r?.total || 0)]
                } catch {
                    return [s.id, 0]
                }
            }))
            setPlays(Object.fromEntries(entries))
        }
        if (songs.length) fetchPlays()
    }, [songs])

    return (
        <div className="artist-songs">
            <h1>Canciones del artista</h1>

            <div className="toolbar">
                <label>Artista:&nbsp;</label>
                <input
                    value={artistId}
                    onChange={(e) => setArtistId(e.target.value)}
                    placeholder="artist_demo_1"
                />
                <button onClick={load} disabled={loading}>
                    {loading ? 'Cargando...' : 'Recargar'}
                </button>
                <span className="api-hint">API:
                    &nbsp;stats {apiInfo.stats}&nbsp;|&nbsp;content {apiInfo.content}
        </span>
            </div>

            {error && <div className="alert">{error}</div>}

            <div className="songs-list">
                {songs.map((s) => (
                    <div key={s.id} className="song-card">
                        <div className="song-left">
                            <span className="song-icon">🎵</span>
                            <div>
                                <div className="song-title">{s.title}</div>
                                <div className="song-sub">id: {s.id}</div>
                            </div>
                        </div>
                        <div className="song-right">
                            <span className="badge">{(plays[s.id] ?? 0)} plays</span>
                        </div>
                    </div>
                ))}
                {!songs.length && !loading && <div>No hay canciones</div>}
            </div>
        </div>
    )
}
