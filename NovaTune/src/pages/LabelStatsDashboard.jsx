// NovaTune/src/pages/LabelStatsDashboard.jsx
import { useEffect, useState } from "react";
import ArtistCompareCharts from "../components/stats/ArtistCompareCharts";

const DEFAULT_AVATAR = "https://static.vecteezy.com/system/resources/previews/036/280/651/original/default-avatar-profile-icon-social-media-user-image-gray-avatar-icon-blank-profile-silhouette-illustration-vector.jpg";
const API_STATS_BASE = "http://127.0.0.1:8002/api/v1";
const API_CONTENT_BASE = "http://127.0.0.1:8001/api/v1";
const ROLE_HEADER = { "X-User-Role": "discografica" };

function formatNumber(value) {
    if (value === null || value === undefined) return "0";
    const num = typeof value === "string" ? Number(value) : value;
    if (Number.isNaN(num)) return "0";
    return new Intl.NumberFormat("es-ES").format(num);
}

function formatCurrency(value) {
    if (value === null || value === undefined) return "—";
    const num = typeof value === "string" ? Number(value) : value;
    if (Number.isNaN(num)) return "—";
    return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2,
    }).format(num);
}

function formatRating(avg, count) {
    if (avg === null || avg === undefined || !count) {
        return "Sin valoraciones";
    }
    const num = typeof avg === "string" ? Number(avg) : avg;
    if (Number.isNaN(num)) return "Sin valoraciones";
    return `${num.toFixed(1)} ★ (${count})`;
}

function formatDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("es-ES");
}

// Componente genérico para listas tipo barra horizontal
function HorizontalBarList({
                               items,
                               labelKey,
                               subtitleKey,
                               valueKey,
                               maxItems = 5,
                               valueFormatter = formatNumber,
                           }) {
    const topItems = items.slice(0, maxItems);

    const maxValue =
        topItems.reduce((max, item) => {
            const raw = item[valueKey];
            const num =
                raw === null || raw === undefined
                    ? 0
                    : typeof raw === "string"
                        ? Number(raw)
                        : raw;
            return num > max ? num : max;
        }, 0) || 1;

    return (
        <ul className="chart-list">
            {topItems.map((item) => {
                const raw = item[valueKey];
                const num =
                    raw === null || raw === undefined
                        ? 0
                        : typeof raw === "string"
                            ? Number(raw)
                            : raw;
                const width = `${(num / maxValue) * 100}%`;

                return (
                    <li key={item.id || item[labelKey]} className="chart-row">
                        <div className="chart-row-labels">
                            <span className="chart-row-main">{item[labelKey]}</span>
                            {subtitleKey && item[subtitleKey] && (
                                <span className="chart-row-sub">{item[subtitleKey]}</span>
                            )}
                        </div>
                        <div className="chart-row-bar">
                            <div className="chart-row-bar-fill" style={{ width }} />
                        </div>
                        <div className="chart-row-value">
                            {valueFormatter(num)}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

function LabelStatsDashboard() {
    // Role checks removed — allow any authenticated user to access this page
    const [topRatedArtists, setTopRatedArtists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedArtist, setSelectedArtist] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    // Role-based access removed: do not redirect based on role

    // Helper: compute ratings for a canonical artist by fetching its tracks
    // and aggregating per-track rating aggregates. Moved to component scope
    // so it can be reused by multiple effects and event handlers to ensure
    // consistent aggregation logic across the app.
    const computeRatingsForArtist = async (art) => {
        const aid = art.artist_id || art.id || art.uuid || art.artistId;
        if (!aid) return { artist: art, artist_id: String(aid || ''), ratings_count: 0, ratings_average: null };

        // First, try the server-side aggregate endpoint for efficiency and
        // consistency. If it fails, fall back to the existing per-track aggregation.
        try {
            const aggResp = await fetch(`${API_STATS_BASE}/stats/artists/${encodeURIComponent(aid)}/aggregate/`, { headers: ROLE_HEADER });
            if (aggResp.ok) {
                const agg = await aggResp.json();
                // Expecting shape: { artist_id, ratings_count, ratings_average }
                const cnt = typeof agg.ratings_count !== 'undefined' ? Number(agg.ratings_count) : (typeof agg.count !== 'undefined' ? Number(agg.count) : 0);
                const avg = (typeof agg.ratings_average !== 'undefined' && agg.ratings_average !== null) ? Number(agg.ratings_average) : (typeof agg.average !== 'undefined' && agg.average !== null ? Number(agg.average) : null);
                return { artist: art, artist_id: String(aid), ratings_count: cnt || 0, ratings_average: avg };
            }
        } catch (err) {
            // swallow and fallback to per-track strategy
        }

        // Fallback: perform per-track aggregation (existing behavior)
        try {
            const rt = await fetch(`${API_CONTENT_BASE}/artists/${aid}/tracks`);
            if (!rt.ok) return { artist: art, artist_id: String(aid), ratings_count: 0, ratings_average: null };
            const tb = await rt.json();
            const items = Array.isArray(tb) ? tb : (tb.items || tb.results || []);

            // collect track ids
            const tids = items.map(tr => tr.id || tr.track_id || tr.uuid || tr.song_id).filter(Boolean);
            if (!tids.length) return { artist: art, artist_id: String(aid), ratings_count: 0, ratings_average: null };

            // Fetch per-track aggregated metrics in parallel (faster)
                const validTids = tids.filter(tid => tid && String(tid) !== 'undefined' && String(tid) !== 'null');
                const fetches = validTids.map(tid => fetch(`${API_STATS_BASE}/stats/songs/${encodeURIComponent(tid)}/songAggregate/`).then(r => r.ok ? r.json() : null).catch(() => null));
            const results = await Promise.allSettled(fetches);

            let totalCount = 0;
            let totalStars = 0; // sum of all stars across all ratings

            for (const res of results) {
                if (res.status !== 'fulfilled' || !res.value) continue;
                const rb = res.value;

                // Prefer explicit aggregated shape
                const cnt = (typeof rb.ratings_count === 'number') ? rb.ratings_count : ((typeof rb.count === 'number') ? rb.count : null);
                const avg = (typeof rb.ratings_average === 'number') ? rb.ratings_average : ((typeof rb.average === 'number') ? rb.average : null);
                if (cnt != null) {
                    totalCount += Number(cnt || 0);
                    if (avg != null) totalStars += Number(avg) * Number(cnt || 0);
                    continue;
                }

                // Fallback: if payload contains a list of ratings, expand
                let arr = [];
                if (Array.isArray(rb)) arr = rb;
                else if (Array.isArray(rb.results)) arr = rb.results;
                else if (Array.isArray(rb.items)) arr = rb.items;
                if (!arr.length) continue;
                for (const it of arr) {
                    const stars = Number(it.stars ?? it.rating ?? it.value ?? it.score ?? 0) || 0;
                    totalCount += 1;
                    totalStars += stars;
                }
            }

            const artistAvg = totalCount > 0 ? (totalStars / totalCount) : null;
            return { artist: art, artist_id: String(aid), ratings_count: totalCount, ratings_average: artistAvg };
        } catch (e) {
            return { artist: art, artist_id: String(aid), ratings_count: 0, ratings_average: null };
        }
    };

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                setError(null);

                // Prefer fetching artist-level ratings (enriched) directly from stats service.
                // This is the canonical source for "Top artistas por valoración" and
                // already includes counts and averages. We pass the role header so
                // the backend returns enriched artist metadata when available.
                try {
                    const rEnriched = await fetch(`${API_STATS_BASE}/stats/artists/aggregate?limit=1000&sort=average&enrich=1`, { headers: ROLE_HEADER });
                    if (rEnriched.ok) {
                        const body = await rEnriched.json();
                        const items = body.items || [];
                        if (items && items.length) {
                            const hasArtistIds = items.some(it => it.artist_id || (it.artist && (it.artist.id || it.artist.artist_id)));
                            if (hasArtistIds) {
                                const mapped = items.map(it => ({
                                    artist: it.artist || (it.artist_id ? { id: it.artist_id, name: it.artist_name || it.name } : undefined),
                                    // normalize artist_id to string for keys but keep artist.id in nested artist if present
                                    artist_id: String(it.artist_id || it.id || (it.artist && (it.artist.id || it.artist.artist_id)) || ''),
                                    ratings_count: Number(it.ratings_count || it.count || 0) || 0,
                                    // coerce average to Number when present, otherwise null
                                    ratings_average: (typeof it.ratings_average !== 'undefined' && it.ratings_average !== null) ? Number(it.ratings_average) : ((typeof it.average !== 'undefined' && it.average !== null) ? Number(it.average) : null),
                                }));
                                // Enrich mapped items with missing artist.name by querying contenidos
                                const needName = mapped.filter(m => !(m.artist && m.artist.name) && m.artist_id).map(m => m.artist_id);
                                if (needName.length) {
                                    await Promise.all(needName.map(async (aid) => {
                                        try {
                                            const r = await fetch(`${API_CONTENT_BASE}/artists/${encodeURIComponent(aid)}`);
                                            if (!r.ok) return;
                                            const a = await r.json();
                                            const found = mapped.find(x => String(x.artist_id) === String(a.id || a.artist_id || aid));
                                            if (found) found.artist = { id: String(a.id || a.artist_id || aid), name: a.name || a.title || String(a.id || a.artist_id || aid), ...a };
                                        } catch (e) {
                                            // ignore individual failures
                                        }
                                    }));
                                }
                                // Recompute metrics per-artist by summing per-track aggregates so
                                // the list numbers match the per-track charts shown elsewhere.
                                try {
                                    // If the server already provided per-artist aggregated metrics,
                                    // use them as the source of truth and avoid expensive
                                    // per-track recomputation which can produce transient
                                    // inconsistencies in the UI.
                                    const serverProvidedMetrics = mapped.every(it => (typeof it.ratings_count !== 'undefined') || (typeof it.ratings_average !== 'undefined'));
                                    if (serverProvidedMetrics) {
                                        setTopRatedArtists(mapped.map(it => ({
                                            artist: it.artist,
                                            artist_id: String(it.artist_id || (it.artist && (it.artist.id || it.artist.artist_id)) || ''),
                                            ratings_count: Number(it.ratings_count || 0),
                                            ratings_average: (typeof it.ratings_average !== 'undefined' && it.ratings_average !== null) ? Number(it.ratings_average) : (typeof it.average !== 'undefined' && it.average !== null ? Number(it.average) : null),
                                        })));
                                    } else {
                                        const recomputed = await Promise.all(mapped.map(async (it) => {
                                            // computeRatingsForArtist is defined below in this scope
                                            const res = await computeRatingsForArtist(it.artist || { artist_id: it.artist_id, id: it.artist_id });
                                            return {
                                                artist: res.artist || it.artist,
                                                artist_id: String(res.artist_id || it.artist_id || it.artist?.id || ''),
                                                ratings_count: Number(res.ratings_count || 0),
                                                ratings_average: (res.ratings_average === null || typeof res.ratings_average === 'undefined') ? null : Number(res.ratings_average),
                                            };
                                        }));
                                        setTopRatedArtists(recomputed);
                                    }
                                } catch (e) {
                                    // if recompute fails, fallback to server-provided metrics
                                    setTopRatedArtists(mapped);
                                }
                                setLoading(false);
                                return;
                            }
                        }
                    }
                } catch (e) {
                    // ignore and fallback to previous strategy
                }

                

                // Fallback: fetch canonical artists from contenidos and merge with ratings
                const rArtists = await fetch(`${API_CONTENT_BASE}/artists/`);
                if (!rArtists.ok) throw new Error(`Error fetching artists ${rArtists.status}`);
                const artistsResp = await rArtists.json();
                let artistsArr = [];
                if (Array.isArray(artistsResp)) artistsArr = artistsResp;
                else if (Array.isArray(artistsResp.items)) artistsArr = artistsResp.items;
                else if (Array.isArray(artistsResp.results)) artistsArr = artistsResp.results;

                const canonical = artistsArr.map(a => {
                    const id = a.artist_id || a.id || a.uuid || a.artistId;
                    return { id: String(id), name: a.name || a.title || id, meta: a };
                });

                // Fetch ratings aggregation from stats service (all artists with ratings)
                // We'll request a large limit so we can merge ratings for the canonical list.
                const rRatings = await fetch(`${API_STATS_BASE}/stats/artists/aggregate?limit=1000&sort=average`, { headers: ROLE_HEADER });
                let ratingsMap = {};
                if (rRatings.ok) {
                    const rr = await rRatings.json();
                    const rated = rr.items || [];
                    for (const it of rated) {
                        const aid = String(it.artist_id || it.id || it.artistId || '');
                        ratingsMap[aid] = { ratings_count: it.ratings_count || it.count || 0, ratings_average: it.ratings_average || it.average || null };
                    }
                }

                // Merge canonical artists with ratings (if any). If the ratingsMap
                // doesn't include artist ids (empty key), fallback to a per-artist
                // computation that fetches tracks and per-track aggregates.
                const merged = [];
                // If ratingsMap contains only an entry with empty key and no real ids,
                // we will compute per-artist metrics by querying tracks.
                const onlyEmptyKey = Object.keys(ratingsMap).length === 1 && (ratingsMap[''] !== undefined);
                if (!onlyEmptyKey) {
                    for (const a of canonical) {
                        merged.push({
                            artist: { id: a.id, name: a.name, ...a.meta },
                            artist_id: a.id,
                            ratings_count: ratingsMap[a.id]?.ratings_count || 0,
                            ratings_average: ratingsMap[a.id]?.ratings_average ?? null,
                        });
                    }
                } else {
                    // Compute per-artist from tracks/ratings (heavier but reliable)
                    for (const a of canonical) {
                        // computeRatingsForArtist defined above
                        // eslint-disable-next-line no-await-in-loop
                        const res = await computeRatingsForArtist(a);
                        merged.push({
                            artist: { id: res.artist_id, name: a.name, ...a.meta },
                            artist_id: res.artist_id,
                            ratings_count: res.ratings_count || 0,
                            ratings_average: res.ratings_average ?? null,
                        });
                    }
                }

                // sort by ratings_average desc then ratings_count
                merged.sort((x, y) => {
                    const ax = x.ratings_average ?? 0;
                    const ay = y.ratings_average ?? 0;
                    if (ay === ax) return (y.ratings_count || 0) - (x.ratings_count || 0);
                    return ay - ax;
                });

                setTopRatedArtists(merged);
            } catch (err) {
                console.error(err);
                setError(err?.message || "Error cargando datos");
                setTopRatedArtists([]);
            } finally {
                setLoading(false);
            }
        };
        load();
        // include reloadKey so the same load logic runs when reload is requested
    }, [reloadKey]);

    // Listen for global rating changes so we can refresh the top artists automatically
    useEffect(() => {
        const handler = () => setReloadKey(k => k + 1);
        window.addEventListener('ratings:changed', handler);
        return () => window.removeEventListener('ratings:changed', handler);
    }, []);

    // When a user clicks an artist row, open detail panel; always try to fetch
    // canonical artist metadata from the contenidos service so downstream
    // components (tracks view) receive a consistent `id` field. If the fetch
    // fails, fall back to the provided `artist` object.
    const handleSelectArtist = async (item) => {
        setDetailError(null);
        const aid = item?.artist_id || (item?.artist && (item.artist.id || item.artist.artist_id));
        if (!aid) {
            // nothing to do
            return;
        }
        setDetailLoading(true);
        try {
            const r = await fetch(`${API_CONTENT_BASE}/artists/${aid}`);
            if (r.ok) {
                const a = await r.json();
                const key = a.id || a.artist_id || aid;
                const normalized = { id: String(key), name: a.name || a.title || a.artist_name || key, ...a };
                setSelectedArtist(normalized);
            } else {
                // If the contenidos service returns non-OK, fallback to whatever
                // the stats endpoint provided (if any)
                if (item && item.artist) {
                    const art = item.artist;
                    const key = art.id || art.artist_id || aid;
                    setSelectedArtist({ id: String(key), name: art.name || art.title || key, ...art });
                } else {
                    setSelectedArtist({ id: String(aid) });
                }
            }
        } catch (err) {
            console.error('Error loading artist detail:', err);
            setDetailError('No se pudo cargar la información del artista');
            if (item && item.artist) {
                const art = item.artist;
                const key = art.id || art.artist_id || aid;
                setSelectedArtist({ id: String(key), name: art.name || art.title || key, ...art });
            } else {
                setSelectedArtist({ id: String(aid) });
            }
        } finally {
            setDetailLoading(false);
        }
    };

    const handleCloseDetail = () => {
        setSelectedArtist(null);
        setDetailError(null);
    };


    return (
        <div className="label-stats-root" style={{ display: 'flex', justifyContent: 'center' }}>
            {/* Background big card that should contain both info cards */}
            <div style={{
                background: '#081227',
                borderRadius: 12,
                padding: 32,
                minWidth: 1280,
                minHeight: 560,
                boxShadow: '0 12px 30px rgba(2,6,23,0.6)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
            }}>
                <header className="label-stats-header" style={{ width: '100%', textAlign: 'center' }}>
                    <h1>Estadísticas de ratings por artista</h1>
                    <p className="label-stats-subtitle">Panel que muestra el ranking de artistas por valoración media.</p>
                </header>

                <section className="label-stats-charts-grid" style={{ display: 'flex', justifyContent: 'center', gap: 24, alignItems: 'flex-start', margin: '24px 0', width: '100%' }}>
                <article className="chart-card" style={{ minWidth: 540, minHeight: 420 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h2 style={{ margin: 0 }}>Top artistas por valoración</h2>
                        <div>
                            <button onClick={() => { setReloadKey(k => k + 1); }} style={{ background: '#0ea5a0', color: '#062023', border: 'none', padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }} disabled={loading}>Refrescar</button>
                        </div>
                    </div>
                    <p className="chart-description">Lista de artistas ordenada por valoración media (rating).</p>

                    <div className="card-scroll">
                    {loading ? (
                        <p className="chart-empty">Cargando...</p>
                    ) : error ? (
                        <p className="chart-empty">{error}</p>
                    ) : topRatedArtists.length === 0 ? (
                        <p className="chart-empty">No hay valoraciones disponibles.</p>
                    ) : (
                        <ul className="chart-list">
                            {topRatedArtists.map((a, idx) => (
                                <li key={a.artist_id} className="chart-row" onClick={() => handleSelectArtist(a)} style={{ cursor: 'pointer' }} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') handleSelectArtist(a); }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                        <span className="chart-row-rank">#{idx + 1}</span>
                                        <div className="chart-row-labels">
                                            <span className="chart-row-main">
                                                {a.artist && a.artist.name ? (
                                                    <strong>{a.artist.name}</strong>
                                                ) : (
                                                    <strong>{a.artist_id}</strong>
                                                )}
                                            </span>
                                            <span className="chart-row-sub">{formatNumber(a.ratings_count)} valoraciones</span>
                                        </div>
                                    </div>
                                    <div className="chart-row-value">{a.ratings_average ? Number(a.ratings_average).toFixed(2) + ' ★' : '—'}</div>
                                </li>
                            ))}
                        </ul>
                    )}
                    </div>
                </article>
                <article className="chart-card artist-detail-card" style={{ minWidth: 620, minHeight: 420 }}>
                    <h2 style={{ margin: 0 }}>{selectedArtist ? (selectedArtist.name || selectedArtist.id) : 'Recuadro de artista'}</h2>
                    {selectedArtist ? (
                        <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.25rem' }}>{`id: ${selectedArtist.id}`}</div>
                    ) : (
                        <p className="chart-description" style={{ marginTop: '0.25rem' }}>Haz click en un artista del Top para ver su información aquí.</p>
                    )}

                    {selectedArtist ? (
                        <div className="card-scroll">
                        <div className="artist-detail-body" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginTop: '0.8rem' }}>
                            <div className="artist-detail-meta" style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                    <div />
                                    <div>
                                        {/* Replace close button with artist image positioned top-right */}
                                        <img src={selectedArtist.image_url || DEFAULT_AVATAR} alt={selectedArtist.name || selectedArtist.id} style={{ width: 96, height: 96, borderRadius: 8, objectFit: 'cover' }} />
                                    </div>
                                </div>

                                {detailError && <p className="chart-description" style={{ color: '#f87171' }}>{detailError}</p>}

                                {selectedArtist.bio && <p style={{ marginTop: '0.5rem' }}>{selectedArtist.bio}</p>}

                                <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.5rem' }}>
                                    {selectedArtist.label && <li><strong>Sello:</strong> {selectedArtist.label.name || selectedArtist.label.label_id}</li>}
                                    {selectedArtist.country && <li><strong>País:</strong> {selectedArtist.country.name || selectedArtist.country}</li>}
                                    {selectedArtist.albums_count !== undefined && <li><strong>Álbumes:</strong> {selectedArtist.albums_count}</li>}
                                    {selectedArtist.tracks_count !== undefined && <li><strong>Pistas:</strong> {selectedArtist.tracks_count}</li>}
                                    {selectedArtist.created_at && <li><strong>Creado:</strong> {formatDate(selectedArtist.created_at)}</li>}
                                </ul>

                                {selectedArtist.socials && Object.keys(selectedArtist.socials).length > 0 && (
                                    <div style={{ marginTop: '0.5rem' }}>
                                        <strong>Redes:</strong>
                                        <ul style={{ listStyle: 'none', padding: 0, margin: '0.25rem 0 0 0' }}>
                                            {Object.entries(selectedArtist.socials).map(([k, v]) => (
                                                <li key={k}><a href={v} target="_blank" rel="noreferrer">{k}</a></li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <div style={{flex: '1 1 520px', minWidth: 520}}>
                                <ArtistCompareCharts selected={selectedArtist} baseline={{ratings_count: (topRatedArtists && topRatedArtists.length ? Math.round(topRatedArtists.reduce((s,i)=>s+(i.ratings_count||0),0)/topRatedArtists.length) : 0), ratings_average: (topRatedArtists && topRatedArtists.length ? (topRatedArtists.reduce((s,i)=>s+Number(i.ratings_average||0),0)/topRatedArtists.length) : 0)}} />
                            </div>
                        </div>
                        </div>
                    ) : null}
                </article>
            </section>
            </div>
        </div>
    );
}

export default LabelStatsDashboard;

