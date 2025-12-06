import React from 'react'
import PlaysBadge from '../components/plays/PlaysBadge'

export default function _DevArtistSongsPage() {
    const songs = [
        { id: 'song_demo_1', title: 'Canción demo 1', artistName: 'Artista Demo' },
        { id: 'song_other',  title: 'Otra canción',   artistName: 'Artista Demo' },
    ]

    return (
        <ul style={{ display: 'grid', gap: 12, padding: 16 }}>
            {songs.map((s) => (
                <li key={s.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8
                }}>
                    <div>
                        <div style={{ fontWeight: 600 }}>{s.title}</div>
                        <div style={{ color: '#6b7280' }}>{s.artistName}</div>
                    </div>
                    <PlaysBadge songId={s.id} onlyValid={true} />
                </li>
            ))}
        </ul>
    )
}
