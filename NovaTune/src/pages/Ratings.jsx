import React, { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import StarRating from '../components/stats/StarRating'
import { fetchArtistSongs } from '../api/contentsApi'

const API_CONTENT_BASE = import.meta.env.VITE_CONTENT_API_BASE || '/api/content'
const API_STATS_BASE = 'http://127.0.0.1:8002/api/v1'

function decodeJwt(token) {
    if (!token) return null
    try {
        const parts = token.split('.')
        if (parts.length !== 3) return null
        const raw = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        const decoded = atob(raw)
        try { return JSON.parse(decodeURIComponent(escape(decoded))) } catch (e) { return JSON.parse(decoded) }
    } catch (e) { return null }
}

const isJwtValid = (t) => {
    if (!t || typeof t !== 'string') return false
    const parts = t.split('.')
    if (parts.length !== 3) return false
    try {
        const raw = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        const decoded = atob(raw)
        const payload = (() => { try { return JSON.parse(decodeURIComponent(escape(decoded))) } catch (e) { try { return JSON.parse(decoded) } catch (e2) { return null } } })()
        if (!payload || !payload.exp) return false
        const now = Math.floor(Date.now() / 1000)
        return payload.exp > now + 5
    } catch (e) { return false }
}

// Build authentication headers for fetch/axios calls.
// In DEV prefer `X-Dev-User` impersonation to avoid cross-service JWT issues;
// otherwise include `Authorization: Bearer <token>` when a valid token exists.
const buildAuthHeaders = () => {
    const headers = { 'Content-Type': 'application/json' }
    const token = localStorage.getItem('access_token')
    const devUser = localStorage.getItem('dev_user')
    const tokenLooksValid = isJwtValid(token)
    if (token && tokenLooksValid) {
        if (import.meta.env.DEV) {
            const p = decodeJwt(token)
            if (p && (p.username || p.user || p.sub)) headers['X-Dev-User'] = p.username || p.user || p.sub
            if (!headers['X-Dev-User']) headers['X-Dev-User'] = devUser || 'user1'
        } else {
            headers['Authorization'] = `Bearer ${token}`
        }
    } else if (devUser) {
        headers['X-Dev-User'] = devUser
    } else if (import.meta.env.DEV) {
        headers['X-Dev-User'] = devUser || 'user1'
    }
    return headers
}

export default function Ratings() {
    const [artists, setArtists] = useState([])
    const [loadingArtists, setLoadingArtists] = useState(true)
    const [expanded, setExpanded] = useState({})
    const [songsMap, setSongsMap] = useState({})
    const [ratingsMap, setRatingsMap] = useState({})
    const [artistAggregates, setArtistAggregates] = useState({})
    const [selectedValues, setSelectedValues] = useState({})
    const [saving, setSaving] = useState({})
    const [errorMessages, setErrorMessages] = useState({})
 



    // Load artists and prefetch songs/aggregates on mount
    useEffect(() => {
        let cancelled = false
        const load = async () => {
            try {
                const url = `${API_CONTENT_BASE}/artists/`
                const { data } = await axios.get(url)
                let items = []
                if (Array.isArray(data?.items)) items = data.items
                else if (Array.isArray(data?.results)) items = data.results
                else if (Array.isArray(data)) items = data

                const mapped = items.map(a => ({ id: a.artist_id ?? a.id, name: a.name ?? 'Sin nombre' }))
                if (cancelled) return
                setArtists(mapped)

                const stored = localStorage.getItem('ratings_expanded')
                let toExpand = []
                try { toExpand = stored ? JSON.parse(stored) : [] } catch (e) { toExpand = [] }
                const expandObj = {}
                for (const art of mapped) if (toExpand.includes(art.id)) expandObj[art.id] = true
                setExpanded(expandObj)

                for (const art of mapped) {
                    try {
                        const items = await fetchArtistSongs(art.id)
                        if (items && items.length) {
                            setSongsMap(prev => ({ ...prev, [art.id]: items }))
                            setRatingsMap(prev => {
                                const copy = { ...prev }
                                for (const s of items) {
                                    const sid = s.id || s.song_id || s.track_id || s.title
                                    if (!copy[sid]) copy[sid] = { average: null, count: 0, user_rating: null, _loading: true }
                                }
                                return copy
                            })
                            for (const s of items) {
                                const sid = s.id || s.song_id || s.track_id || s.title
                                if (sid) {
                                    // scheduling fetchRatingForSong for sid
                                    void fetchRatingForSong(sid)
                                }
                            }
                        } else {
                            setSongsMap(prev => ({ ...prev, [art.id]: [] }))
                        }
                    } catch (e) {
                        console.warn('Preloading songs failed for', art.id, e)
                    }
                    try {
                        // scheduling fetchArtistAggregate for art.id
                        void fetchArtistAggregate(art.id)
                    } catch (e) { /* ignore */ }
                }

                try {
                    const aggPromises = mapped.map(a => fetchArtistAggregate(a.id).catch(err => console.warn('fetchArtistAggregate failed for', a.id, err)))
                    void Promise.allSettled(aggPromises)
                } catch (e) { console.warn('Error scheduling artist aggregate fetches', e) }
            } catch (err) {
                console.error('Error loading artists', err)
            } finally {
                if (!cancelled) setLoadingArtists(false)
            }
        }
        load()
        return () => { cancelled = true }
    }, [])

    // Ensure artist aggregates update shortly after any change to ratingsMap.
    // This is a debounced sweep that recomputes aggregates for artists we have
    // tracks for when ratingsMap changes (covers missed paths and eventual
    // consistency across canonical/original id keys).
    useEffect(() => {
        if (!songsMap || Object.keys(songsMap).length === 0) return;
        const timer = setTimeout(() => {
            for (const aid of Object.keys(songsMap)) {
                try { computeArtistAggregate(aid) } catch (e) { /* ignore per-artist errors */ }
            }
        }, 120);
        return () => clearTimeout(timer);
    }, [ratingsMap]);
    // Resolve a canonical song id from a possibly-noncanonical identifier (title or legacy value)
    // Searches the songsMap for a matching track by id, song_id, track_id or title.
    // Returns the canonical id (prefer numeric id) or the original value if not found.
    const resolveCanonicalSongId = (maybeId) => {
        if (!maybeId) return maybeId
        const asStr = String(maybeId)
        // First try: if maybeId already looks numeric, return it
        if (/^\d+$/.test(asStr)) return asStr

        for (const aid of Object.keys(songsMap || {})) {
            const arr = songsMap[aid]
            if (!Array.isArray(arr)) continue
            for (const t of arr) {
                const candidates = [t.id, t.song_id, t.track_id, t.title]
                for (const c of candidates) {
                    if (c == null) continue
                    if (String(c) === asStr) {
                        // return the canonical numeric id if available
                        const canonical = t.id || t.track_id || t.song_id
                        return canonical ? String(canonical) : String(c)
                    }
                }
            }
        }

        // Not found locally: return original (caller should validate and avoid POST if non-numeric)
        return asStr
    }

    // Return a ratingsMap entry for a song id, trying canonical numeric id first,
    // then falling back to the original key. This centralizes lookup so UI
    // components always see the most up-to-date store regardless of which key
    // the data was written under.
    const getRatingEntry = (maybeId) => {
        if (maybeId == null) return undefined
        const canonical = resolveCanonicalSongId(maybeId)
        if (canonical && ratingsMap[canonical]) return ratingsMap[canonical]
        if (ratingsMap[maybeId]) return ratingsMap[maybeId]
        // also try stringified forms
        const s1 = String(canonical)
        if (s1 && ratingsMap[s1]) return ratingsMap[s1]
        const s2 = String(maybeId)
        if (s2 && ratingsMap[s2]) return ratingsMap[s2]
        return undefined
    }

    const computeArtistAggregate = (artistId) => {
        const songs = songsMap[artistId]
        if (!Array.isArray(songs) || !songs.length) {
            setArtistAggregates(prev => ({ ...prev, [artistId]: { average: null, count: 0, _loading: false } }))
            return
        }
        let totalCount = 0
        let totalSum = 0
        let loading = false
        for (const s of songs) {
            const sid = s.id || s.song_id || s.track_id || s.title
            const r = getRatingEntry(sid)
            if (!r) { loading = true; continue }
            if (r._loading) { loading = true; continue }
            const count = (typeof r.count === 'number') ? r.count : (Array.isArray(r.ratings_list) ? r.ratings_list.length : 0)
            let avg = (typeof r.average === 'number') ? r.average : null
            if ((avg == null) && Array.isArray(r.ratings_list) && r.ratings_list.length) {
                const sum = r.ratings_list.reduce((acc, it) => acc + (Number(it.stars) || 0), 0)
                avg = count ? (sum / count) : null
            }
            if (count) {
                totalCount += count
                totalSum += (avg || 0) * count
            }
        }
        const avg = totalCount ? (totalSum / totalCount) : null
        setArtistAggregates(prev => ({ ...prev, [artistId]: { average: avg, count: totalCount, _loading: loading } }))
    }

    // Polling interval (ms) for auto-refreshing ratings of expanded artists
    const POLL_INTERVAL_MS = 10000 // 10s

    // --- Concurrency limiter for rating fetches (persistent across renders) ---
    const MAX_CONCURRENT_RATING_REQUESTS = 6
    const ratingActiveRef = useRef(0)
    const ratingQueueRef = useRef([])
    const _acquireRatingSlot = () => new Promise(resolve => {
        if (ratingActiveRef.current < MAX_CONCURRENT_RATING_REQUESTS) {
            ratingActiveRef.current += 1
            resolve()
        } else {
            ratingQueueRef.current.push(resolve)
        }
    })
    const _releaseRatingSlot = () => {
        ratingActiveRef.current = Math.max(0, ratingActiveRef.current - 1)
        if (ratingQueueRef.current.length) {
            const r = ratingQueueRef.current.shift()
            ratingActiveRef.current += 1
            try { r() } catch (e) { /* ignore */ }
        }
    }

    const toggleArtist = async (artistId) => {
        setExpanded(prev => ({ ...prev, [artistId]: !prev[artistId] }))
        if (!songsMap[artistId]) {
            try {
                const items = await fetchArtistSongs(artistId)
                setSongsMap(prev => ({ ...prev, [artistId]: items }))
                // initialize placeholders for ratings to avoid empty UI
                setRatingsMap(prev => {
                    const copy = { ...prev }
                    for (const s of items) {
                        const sid = s.id || s.song_id || s.track_id || s.title
                        if (!copy[sid]) {
                            copy[sid] = { average: null, count: 0, user_rating: null, _loading: true }
                        }
                    }
                    return copy
                })
                // fetch ratings for each song (rate-limited by fetchRatingForSong)
                for (const s of items) {
                    const sid = s.id || s.song_id || s.track_id || s.title
                    if (sid) void fetchRatingForSong(sid)
                }
            } catch (err) {
                console.error('Error loading songs for artist', err)
            }
        }
    }

    const fetchArtistAggregate = async (artistId) => {
        // First, try the server-side artist aggregate endpoint (single call).
        try {
            const url = `${API_STATS_BASE}/stats/artists/${encodeURIComponent(artistId)}/aggregate/`
            const headers = buildAuthHeaders()
            const resp = await fetch(url, { headers })
            if (resp && resp.ok) {
                try {
                    const body = await resp.json()
                    const count = typeof body.ratings_count === 'number' ? body.ratings_count : (body.count || body.ratings || 0)
                    const avg = (typeof body.ratings_average === 'number') ? body.ratings_average : (typeof body.average === 'number' ? body.average : null)
                    setArtistAggregates(prev => ({ ...prev, [artistId]: { average: (avg == null ? null : Number(avg)), count: Number(count || 0), _loading: false } }))
                    const existing = songsMap[artistId]
                    if (existing && existing.length) {
                        computeArtistAggregate(artistId)
                        return
                    }
                    return
                } catch (e) {
                    // fallback to per-track aggregation below
                }
            }
        } catch (e) {
            // ignore and fallback to previous behavior
        }

        // If server-side aggregate not available or failed, fall back to per-track aggregation
        try {
            const existing = songsMap[artistId]
            if (existing && existing.length) {
                const ag = artistAggregates[artistId]
                if (ag && ag._loading) return
                computeArtistAggregate(artistId)
                return
            }

            const items = await fetchArtistSongs(artistId)
            if (!items || !items.length) {
                setSongsMap(prev => ({ ...prev, [artistId]: [] }))
                setArtistAggregates(prev => ({ ...prev, [artistId]: { average: null, count: 0, _loading: false } }))
                return
            }
            setSongsMap(prev => ({ ...prev, [artistId]: items }))
            setRatingsMap(prev => {
                const copy = { ...prev }
                for (const s of items) {
                    const sid = s.id || s.song_id || s.track_id || s.title
                    if (!copy[sid]) {
                        copy[sid] = { average: null, count: 0, user_rating: null, _loading: true }
                    }
                }
                return copy
            })
            for (const s of items) {
                const sid = s.id || s.song_id || s.track_id || s.title
                if (sid) void fetchRatingForSong(sid)
            }
        } catch (e) {
            console.warn('fetchArtistAggregate failed for', artistId, e)
        }
    }

    // Poll all artists periodically so aggregates stay fresh even when the
    // user doesn't expand an artist. This provides near-live updates.
    useEffect(() => {
        if (!artists || !artists.length) return
        let timer = null
        const tick = () => {
            for (const art of artists) {
                try {
                    void fetchArtistAggregate(art.id)
                } catch (e) { /* ignore */ }
            }
        }
        // start after a short delay to avoid clashing with initial load
        timer = setInterval(tick, POLL_INTERVAL_MS)
        return () => { if (timer) clearInterval(timer) }
    }, [artists, songsMap])

    const fetchRatingForSong = async (songId) => {
        if (!songId || String(songId) === 'undefined' || String(songId) === 'null') {
            console.warn('fetchRatingForSong called with invalid songId, skipping request', songId)
            return null
        }
        // Resolve canonical id and use that as the single source-of-truth key
        const canonicalId = resolveCanonicalSongId(songId)
        // mark as loading immediately so UI shows spinner while refreshing
        setRatingsMap(prev => ({ ...prev, [canonicalId]: { ...(prev[canonicalId] || {}), _loading: true } }))
        await _acquireRatingSlot()
            try {
                // Try fast song-level aggregate endpoint first so UI shows avg/count quickly
                const headers = buildAuthHeaders()
                try {
                    const aggUrl = `${API_STATS_BASE}/stats/songs/${encodeURIComponent(canonicalId)}/songAggregate/`
                    const aggResp = await fetch(aggUrl, { headers })
                    if (aggResp && aggResp.ok) {
                        const aggBody = await aggResp.json()
                        const preCount = typeof aggBody.ratings_count === 'number' ? aggBody.ratings_count : (aggBody.count || 0)
                        const preAvg = (typeof aggBody.ratings_average === 'number') ? aggBody.ratings_average : (typeof aggBody.average === 'number' ? aggBody.average : null)
                        // populate aggregate immediately and mark not loading so UI shows stars + count
                        setRatingsMap(prev => ({ ...prev,
                            [canonicalId]: { ...(prev[canonicalId] || {}), count: Number(preCount || 0), average: (preAvg == null ? null : Number(preAvg)), _loading: false },
                            [songId]: { ...(prev[songId] || {}), count: Number(preCount || 0), average: (preAvg == null ? null : Number(preAvg)), _loading: false }
                        }))
                    }
                } catch (e) {
                    // ignore aggregate failures and continue to fetch full list
                }

                // Fetch individual ratings list for the song and compute aggregates client-side
                let ratingsList = []
                try {
                    const listUrl = `${API_STATS_BASE}/stats/songs/${encodeURIComponent(canonicalId)}/ratings/`
                    const listRes = await axios.get(listUrl, { headers, timeout: 5000 })
                    const lr = listRes.data
                    if (Array.isArray(lr.results)) ratingsList = lr.results
                    else if (Array.isArray(lr.items)) ratingsList = lr.items
                    else if (Array.isArray(lr)) ratingsList = lr
                } catch (e) {
                    // non-fatal: ratingsList stays empty
                }

                // compute aggregate from ratingsList
                let avg = null, count = 0
                if (Array.isArray(ratingsList) && ratingsList.length) {
                    count = ratingsList.length
                    const sum = ratingsList.reduce((s, it) => s + (Number(it.stars) || 0), 0)
                    avg = count ? (sum / count) : null
                }

                // decode JWT to obtain current user id/username for client-side presence check
                const token = localStorage.getItem('access_token')
                const devUser = localStorage.getItem('dev_user')
                let payload = decodeJwt(token)
                if (!payload && devUser) payload = { username: devUser }
                let hasRated = false
                let userRatingId = null
                if (payload && Array.isArray(ratingsList) && ratingsList.length) {
                    const uid = payload.user_id || payload.user || payload.sub || payload.id
                    const uname = payload.username || payload.user_name || payload.name
                    for (const r of ratingsList) {
                        if ((uid != null && String(r.user_id) === String(uid)) || (uname && String(r.username) === String(uname))) {
                            hasRated = true
                            userRatingId = r.id
                            setSelectedValues(prev => ({ ...prev, [canonicalId]: r.stars, [songId]: r.stars }))
                            break
                        }
                    }
                }

                const store = { song_id: canonicalId, count, average: avg, ratings_list: ratingsList, _has_rated: hasRated, _user_rating_id: userRatingId, _loading: false }
                setRatingsMap(prev => ({ ...prev, [canonicalId]: store, [songId]: store }))
                setSelectedValues(prev => ({ ...prev, [canonicalId]: prev[canonicalId] ?? (hasRated ? (ratingsList.find(r=>r.id===userRatingId)?.stars ?? 0) : 0), [songId]: prev[songId] ?? (hasRated ? (ratingsList.find(r=>r.id===userRatingId)?.stars ?? 0) : 0) }))
                // Update artist aggregates for any artist that contains this song
                try {
                    for (const aid of Object.keys(songsMap || {})) {
                                const arr = songsMap[aid]
                                if (Array.isArray(arr)) {
                                    const found = arr.find(x => {
                                        const candidate = x.id || x.song_id || x.track_id || x.title
                                        // if any key matches either the canonical id or the original songId
                                        return String(candidate) === String(canonicalId) || String(candidate) === String(songId)
                                    })
                                    if (found) {
                                        try { computeArtistAggregate(aid) } catch (e) { /* ignore */ }
                                    }
                                }
                            }
                } catch (e) {
                    // ignore errors when updating aggregates
                }
                return store
        } catch (err) {
            // Suppress noisy 401 logs during DEV impersonation flow
            if (err?.response?.status === 401 && import.meta.env.DEV) {
                console.warn('Fetching rating unauthorized; no user_rating available (DEV)')
            } else {
                console.error('Error fetching rating', err)
            }
            return null
        } finally {
            _releaseRatingSlot()
        }
    }

    // Auto-refresh: when artists are expanded, poll their songs' ratings periodically
    useEffect(() => {
        let timer = null
        const startPolling = () => {
            // only start if we have at least one expanded artist
            const expandedIds = Object.keys(expanded).filter(k => expanded[k])
            if (!expandedIds.length) return
            timer = setInterval(() => {
                // for each expanded artist, refresh ratings for its songs (if loaded)
                for (const aid of expandedIds) {
                    const songs = songsMap[aid]
                    if (Array.isArray(songs) && songs.length) {
                        for (const s of songs) {
                            try { const sid = s.id || s.song_id || s.track_id || s.title; if (sid) void fetchRatingForSong(sid) } catch (e) { /* ignore */ }
                        }
                    }
                }
            }, POLL_INTERVAL_MS)
        }

        // start immediately if any expanded
        startPolling()
        return () => { if (timer) clearInterval(timer) }
    }, [expanded, songsMap])

    // When authentication changes (access_token or dev_user), clear cached ratings
    // and re-fetch ratings for currently expanded artists so the UI reflects the
    // active user and doesn't accidentally reuse previous user's presence state.
    useEffect(() => {
        let prevToken = localStorage.getItem('access_token')
        let prevDev = localStorage.getItem('dev_user')

        const handleAuthChange = async () => {
            const curToken = localStorage.getItem('access_token')
            const token = localStorage.getItem('access_token')
            const headers = { 'Content-Type': 'application/json' }
            const tokenLooksValid = isJwtValid(token)
            if (token && tokenLooksValid) {
                headers['Authorization'] = `Bearer ${token}`
            }
        }
    }, [expanded, songsMap])

    const handleChangeRating = (songId, val) => {
        setSelectedValues(prev => ({ ...prev, [songId]: val }))
    }

    const handleSubmitRating = async (songId) => {
        let v = selectedValues[songId]
        if (v == null) return
        // Backend expects integer stars 0..5 — round to nearest integer
        const stars = Math.max(0, Math.min(5, Math.round(v)))
        setSaving(prev => ({ ...prev, [songId]: true }))
        try {
            const token = localStorage.getItem('access_token')
            const devUser = localStorage.getItem('dev_user')
            const headers = { 'Content-Type': 'application/json' }

            // Helper: check JWT expiry locally (so we avoid sending obviously expired tokens)
            const tokenLooksValid = isJwtValid(token)
            // Prefer a valid JWT if available; otherwise fall back to `dev_user` for local development.
            if (token && tokenLooksValid) {
                // In development prefer dev-user impersonation to avoid cross-db
                // JWT mismatches between backends. Do not send `Authorization`
                // when running in DEV so the stats service will resolve the
                // user from `X-Dev-User` (local auth_user table).
                if (import.meta.env.DEV) {
                    // decode token to provide a friendly X-Dev-User when possible
                    const p = decodeJwt(token)
                    if (p && (p.username || p.user || p.sub)) headers['X-Dev-User'] = p.username || p.user || p.sub
                    if (!headers['X-Dev-User']) headers['X-Dev-User'] = localStorage.getItem('dev_user') || 'user1'
                } else {
                    headers['Authorization'] = `Bearer ${token}`
                }
            } else if (devUser) {
                headers['X-Dev-User'] = devUser
            } else if (import.meta.env.DEV) {
                // Only use the dev-user fallback when nothing else is set.
                // Default to `user1` which exists in the local seeded usuarios DB.
                headers['X-Dev-User'] = localStorage.getItem('dev_user') || 'user1'
            }

            // Use the per-song ratings list endpoint to create a new individual rating,
            // or update an existing user rating via the rating detail endpoint.
            const canonicalSongId = resolveCanonicalSongId(songId)
            // Ensure canonicalSongId is numeric — otherwise abort to avoid storing titles as ids
            if (!/^[0-9]+$/.test(String(canonicalSongId))) {
                setErrorMessages(prev => ({ ...prev, [songId]: 'No se pudo resolver el ID numérico de la pista. Recarga la página.' }))
                setSaving(prev => ({ ...prev, [songId]: false }))
                return
            }
            const postUrl = `${API_STATS_BASE}/stats/songs/${encodeURIComponent(canonicalSongId)}/ratings/`
            // try to include artist_id when available so backend can attribute rating immediately
            let artist_id = null
            for (const aid of Object.keys(songsMap || {})) {
                const arr = songsMap[aid]
                if (Array.isArray(arr)) {
                    const found = arr.find(x => {
                        const candidate = x.id || x.song_id || x.track_id || x.title
                        return String(candidate) === String(canonicalSongId) || String(candidate) === String(songId)
                    })
                    if (found) {
                        artist_id = found.artist_id || aid
                        break
                    }
                }
            }
            const body = artist_id ? { stars, artist_id } : { stars }
            // Create a new rating for everyone: always POST to the per-song
            // ratings endpoint. This will POST a new rating and does not enforce client-side ownership checks.
            let resp
            resp = await axios.post(postUrl, body, { headers, timeout: 5000 })
            

            // Persist expanded artists so page state survives navigation
            try {
                const expandedIds = Object.keys(expanded).filter(k => expanded[k])
                localStorage.setItem('ratings_expanded', JSON.stringify(expandedIds))
            } catch (e) {
                console.warn('Could not persist expanded state', e)
            }

            // Re-fetch the rating and individual ratings list for this song to update the UI
            try {
                await fetchRatingForSong(canonicalSongId)
                // ensure selected value reflects the saved (rounded) stars (store under both keys)
                setSelectedValues(prev => ({ ...prev, [canonicalSongId]: stars, [songId]: stars }))
                // Notify listeners (dashboard) that ratings changed so they can refresh
                try { window.dispatchEvent(new Event('ratings:changed')); } catch (e) { /* ignore */ }
            } catch (e) {
                console.warn('Could not refresh rating after save', e)
            }

            // Immediately update fast aggregates (song + artist) so UI shows updated
            // counts/averages without waiting for full list re-fetch.
            try {
                const aggUrl = `${API_STATS_BASE}/stats/songs/${encodeURIComponent(canonicalSongId)}/songAggregate/`
                const aresp = await fetch(aggUrl)
                if (aresp && aresp.ok) {
                    const ab = await aresp.json()
                    const preCount = typeof ab.ratings_count === 'number' ? ab.ratings_count : (ab.count || 0)
                    const preAvg = (typeof ab.ratings_average === 'number') ? ab.ratings_average : (ab.average || null)
                    setRatingsMap(prev => ({ ...prev, [canonicalSongId]: { ...(prev[canonicalSongId] || {}), count: Number(preCount || 0), average: (preAvg == null ? null : Number(preAvg)), _loading: false }, [songId]: { ...(prev[songId] || {}), count: Number(preCount || 0), average: (preAvg == null ? null : Number(preAvg)), _loading: false } }))
                }
            } catch (e) {
                // ignore fast-aggregate failures
            }

            // Refresh artist aggregate header if we have artist_id
            try {
                if (artist_id) {
                    try { await fetchArtistAggregate(artist_id) } catch (e) { /* ignore */ }
                }
            } catch (e) { /* ignore */ }
        } catch (err) {
            // For DEV, suppress noisy 401 logs — retry/handling logic applies above
            const status = err?.response?.status
            if (status === 401 && import.meta.env.DEV) {
                console.warn('Error saving rating: unauthorized (DEV). Retried with dev user or needs login.')
                setErrorMessages(prev => ({ ...prev, [songId]: 'No autorizado. Inicia sesión o usa dev_user en local.' }))
            } else if (status === 403) {
                // Ownership or permission problem. If the client did not send a valid
                // access token, explain that authentication is required; otherwise
                // indicate ownership issue.
                const clientToken = localStorage.getItem('access_token')
                if (!clientToken) {
                    console.warn('Error saving rating: forbidden (no token sent)', err)
                    setErrorMessages(prev => ({ ...prev, [songId]: 'Autenticación requerida. Inicia sesión para guardar valoraciones.' }))
                } else {
                    console.warn('Error saving rating: forbidden', err)
                    setErrorMessages(prev => ({ ...prev, [songId]: 'No puedes modificar la valoración de otro usuario.' }))
                }
            } else if (status === 409) {
                console.warn('Error saving rating: conflict', err)
                setErrorMessages(prev => ({ ...prev, [songId]: 'Conflicto: la valoración ya existe.' }))
            } else {
                console.error('Error saving rating', err)
                setErrorMessages(prev => ({ ...prev, [songId]: 'Error guardando valoración. Comprueba la conexión.' }))
            }
        } finally {
            setSaving(prev => ({ ...prev, [songId]: false }))
        }
    }

    const handleDeleteLastRating = async (songId) => {
        setSaving(prev => ({ ...prev, [songId]: true }))
        try {
            const token = localStorage.getItem('access_token')
            const devUser = localStorage.getItem('dev_user')
            const headers = { 'Content-Type': 'application/json' }
            const tokenLooksValid = isJwtValid(token)
            if (token && tokenLooksValid) {
                if (import.meta.env.DEV) {
                    const p = decodeJwt(token)
                    if (p && (p.username || p.user || p.sub)) headers['X-Dev-User'] = p.username || p.user || p.sub
                    if (!headers['X-Dev-User']) headers['X-Dev-User'] = localStorage.getItem('dev_user') || 'user1'
                } else {
                    headers['Authorization'] = `Bearer ${token}`
                }
            } else if (devUser) {
                headers['X-Dev-User'] = devUser
            } else if (import.meta.env.DEV) {
                headers['X-Dev-User'] = localStorage.getItem('dev_user') || 'user1'
            }

            // Resolve canonical song id before operations
            const canonicalSongId = resolveCanonicalSongId(songId)
            if (!/^[0-9]+$/.test(String(canonicalSongId))) {
                setErrorMessages(prev => ({ ...prev, [songId]: 'No se pudo resolver el ID numérico de la pista. Recarga la página.' }))
                setSaving(prev => ({ ...prev, [songId]: false }))
                return
            }

            // Delete the user's individual rating if we have its id
            // Ensure we have the full ratings list for this song so we can choose
            // the most recently created rating (highest id), regardless of user.
            let store = getRatingEntry(canonicalSongId) || getRatingEntry(songId)
            if (!store || !Array.isArray(store.ratings_list)) {
                store = await fetchRatingForSong(canonicalSongId)
            }

            const ratingsList = Array.isArray(store?.ratings_list) ? store.ratings_list : []

            if (!ratingsList.length) {
                setErrorMessages(prev => ({ ...prev, [songId]: 'No hay valoraciones para esta canción.' }))
                setSaving(prev => ({ ...prev, [songId]: false }))
                return
            }

            // Choose the most recently created rating (by highest id) regardless
            // of author so anyone can delete any rating.
            let toDelete = null
            for (const r of ratingsList) {
                const rId = Number(r.id ?? r.pk ?? r._id ?? 0)
                if (!toDelete) { toDelete = r; continue }
                const curId = Number(toDelete.id ?? toDelete.pk ?? toDelete._id ?? 0)
                if (rId > curId) toDelete = r
            }

            if (!toDelete) {
                setErrorMessages(prev => ({ ...prev, [songId]: 'No hay valoraciones para borrar.' }))
                setSaving(prev => ({ ...prev, [songId]: false }))
                return
            }

            const existingId = toDelete && (toDelete.id || toDelete.pk || toDelete._id) ? String(toDelete.id || toDelete.pk || toDelete._id) : null
            if (!existingId) {
                setErrorMessages(prev => ({ ...prev, [songId]: 'No se pudo determinar la valoración a borrar.' }))
                setSaving(prev => ({ ...prev, [songId]: false }))
                return
            }

            const delUrl = `${API_STATS_BASE}/stats/ratings/${existingId}/`
            const resp = await axios.delete(delUrl, { headers, timeout: 5000 })

            // Refresh rating store and fast aggregates
            await fetchRatingForSong(canonicalSongId)
            try {
                const aggUrl = `${API_STATS_BASE}/stats/songs/${encodeURIComponent(canonicalSongId)}/songAggregate/`
                const aresp = await fetch(aggUrl)
                if (aresp && aresp.ok) {
                    const ab = await aresp.json()
                    const preCount = typeof ab.ratings_count === 'number' ? ab.ratings_count : (ab.count || 0)
                    const preAvg = (typeof ab.ratings_average === 'number') ? ab.ratings_average : (ab.average || null)
                    setRatingsMap(prev => ({ ...prev, [canonicalSongId]: { ...(prev[canonicalSongId] || {}), count: Number(preCount || 0), average: (preAvg == null ? null : Number(preAvg)), _loading: false } }))
                }
            } catch (e) {}

            // Refresh artist aggregates for containing artist(s)
            try {
                for (const aid of Object.keys(songsMap || {})) {
                    const arr = songsMap[aid]
                    if (Array.isArray(arr)) {
                        const found = arr.find(x => (x.id || x.song_id || x.track_id || x.title) === (canonicalSongId || songId))
                        if (found) {
                            try { await fetchArtistAggregate(aid) } catch (e) { /* ignore */ }
                        }
                    }
                }
            } catch (e) { /* ignore */ }
        } catch (err) {
            console.error('Error deleting last rating', err)
            setErrorMessages(prev => ({ ...prev, [songId]: 'Error borrando la última valoración' }))
        } finally {
            setSaving(prev => ({ ...prev, [songId]: false }))
        }
    }
    return (
        <div style={{ maxWidth: 1100, margin: '24px auto', color: 'white', padding: '0 16px' }}>
            <h1>Valoraciones de Canciones (usuario)</h1>
            {import.meta.env.DEV && !localStorage.getItem('access_token') && (
                <div style={{ marginBottom: 12, padding: 8, background: '#222', borderRadius: 6 }}>
                    <strong>Modo desarrollo:</strong> enviando peticiones como <code>{localStorage.getItem('dev_user') || 'user1'}</code>
                    {!localStorage.getItem('dev_user') && (
                        <div style={{ fontSize: 12, color: '#bbb', marginTop: 6 }}>
                            Usando <code>user1</code> por defecto (fallback) — guarda una valoración como este usuario.
                        </div>
                    )}
                </div>
            )}

            {loadingArtists ? (
                <p>Cargando artistas…</p>
            ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
                    {artists.map(a => (
                        <li key={a.id} style={{ border: '1px solid #333', padding: 12, borderRadius: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontWeight: 700 }}>{a.name}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ textAlign: 'right', fontSize: 12, color: '#bbb', minWidth: 140 }}>
                                        {artistAggregates[a.id] && artistAggregates[a.id]._loading ? (
                                            <div>Valoración artista: cargando…</div>
                                        ) : (
                                            <div>
                                                Valoración artista: {artistAggregates[a.id] && artistAggregates[a.id].average != null ? Number(artistAggregates[a.id].average).toFixed(2) : '—'}
                                                {artistAggregates[a.id] && typeof artistAggregates[a.id].count !== 'undefined' ? ` (${artistAggregates[a.id].count})` : ''}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <button onClick={() => toggleArtist(a.id)}>{expanded[a.id] ? 'Ocultar' : 'Ver canciones'}</button>
                                    </div>
                                </div>
                            </div>

                            {expanded[a.id] && (
                                <div style={{ marginTop: 12 }}>
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                                        {(songsMap[a.id] || []).map(s => {
                                            const songId = s.id || s.title
                                            const canonicalSongId = resolveCanonicalSongId(songId)
                                            const rating = getRatingEntry(songId) || {}
                                            const avg = rating.average ?? null
                                            const user_rating = rating.user_rating ?? rating._user_rating_id ? rating._user_rating_id : null
                                            const hasRated = (rating._has_rated === true) || (rating._user_rating_id != null) || (user_rating != null)
                                            const existingRatingId = rating._user_rating_id ?? null
                                            return (
                                                <li key={songId} style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fff', color: '#000', padding: 10, borderRadius: 8 }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 600 }}>{s.title}</div>
                                                        <div style={{ fontSize: 12, color: '#444' }}>{s.album?.title ?? s.album?.name ?? s.album_id ?? 'Álbum desconocido'}</div>
                                                    </div>

                                                    <div style={{ width: 220, textAlign: 'center' }}>
                                                        <div style={{ fontSize: 12, color: '#666' }}>Valoración media</div>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                                            <StarRating value={avg ?? 0} size={18} editable={false} />
                                                            <div style={{ fontSize: 12 }}>
                                                                {rating && rating._loading ? (
                                                                    <span style={{ color: '#666' }}>cargando…</span>
                                                                ) : (
                                                                    <>
                                                                        {avg != null ? Number(avg).toFixed(2) : '—'}
                                                                        {typeof rating.count !== 'undefined' ? ` (${rating.count})` : ''}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div style={{ width: 240, textAlign: 'center' }}>
                                                        <div style={{ fontSize: 12, color: '#666' }}>Tu valoración</div>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                                            <StarRating value={selectedValues[canonicalSongId] ?? selectedValues[songId] ?? (user_rating ?? 0)} editable={true} onChange={(v)=>handleChangeRating(canonicalSongId ?? songId, v)} size={22} />
                                                            {hasRated ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                                                    <div style={{ fontSize: 12, color: '#666' }}>
                                                                        <span style={{ background: '#111', color: '#fff', padding: '4px 8px', borderRadius: 12, fontSize: 11 }}>Valor previa</span>
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                                        <button onClick={() => handleSubmitRating(songId)} disabled={saving[songId]} style={{ padding: '6px 10px' }}>{saving[songId] ? '…' : 'Reemplazar'}</button>
                                                                        <button onClick={() => handleDeleteLastRating(songId)} disabled={saving[songId]} style={{ padding: '6px 10px', background: '#f44336', color: '#fff' }}>{saving[songId] ? '…' : 'Borrar última'}</button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                                    <button onClick={() => handleSubmitRating(songId)} disabled={saving[songId]} style={{ padding: '6px 10px' }}>{saving[songId] ? '…' : 'Guardar'}</button>
                                                                    <button onClick={() => handleDeleteLastRating(songId)} disabled={saving[songId]} style={{ padding: '6px 10px', background: '#f44336', color: '#fff' }}>{saving[songId] ? '…' : 'Borrar última'}</button>
                                                                </div>
                                                            )}

                                                            {/* Error message area for this song */}
                                                            {errorMessages[songId] && (
                                                                <div style={{ color: 'crimson', fontSize: 12, marginTop: 6 }}>{errorMessages[songId]}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
