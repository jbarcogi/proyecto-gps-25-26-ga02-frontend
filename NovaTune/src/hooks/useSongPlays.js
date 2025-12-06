import { useEffect, useState } from 'react'
import { getSongPlays } from '../api/statsApi'

export function useSongPlays(songId, opts) {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (!songId) return
        let cancel = false
        setLoading(true)
        setError(null)

        getSongPlays(songId, opts)
            .then((json) => { if (!cancel) { setData(json); setLoading(false) } })
            .catch((e)    => { if (!cancel) { setError(e); setLoading(false) } })

        return () => { cancel = true }
    }, [songId, JSON.stringify(opts)])

    return { data, loading, error }
}
