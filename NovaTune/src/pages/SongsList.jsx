// src/pages/SongsList.jsx
import { useEffect, useState } from "react";
import axios from "axios";

import PlayCountBadge from "../components/stats/PlayCountBadge";
import AlbumSalesBadge from "../components/stats/AlbumSalesBadge";
import { fetchAlbumSales } from "../api/statsApi";

const CONTENT_BASE = import.meta.env.VITE_CONTENT_API_BASE || "/api/content";

export default function SongsList() {
    // Role checks removed — allow any authenticated user to access this page
    const [artistId, setArtistId] = useState(""); // sin UUID por defecto
    const [status, setStatus] = useState("idle"); // idle | loading | success | error | empty
    const [songs, setSongs] = useState([]);
    const [errorMsg, setErrorMsg] = useState("");

    // Sugerencias de artistas (UUID + nombre)
    const [artistOptions, setArtistOptions] = useState([]);
    const [artistOptionsLoaded, setArtistOptionsLoaded] = useState(false);
    const [artistOptionsError, setArtistOptionsError] = useState("");
    const [isFetchingArtists, setIsFetchingArtists] = useState(false);

    // Resumen de ventas por álbum
    const [albumSummaries, setAlbumSummaries] = useState([]);
    const [albumOptions, setAlbumOptions] = useState([]); // para el <select> de álbum
    const [summaryStatus, setSummaryStatus] = useState("idle"); // idle | loading | success | error
    const [summaryError, setSummaryError] = useState("");

    // Filtros de ventas
    const [selectedAlbumId, setSelectedAlbumId] = useState("all"); // "all" o albumId concreto
    const [onlyWithSales, setOnlyWithSales] = useState(false);
    const [sortBy, setSortBy] = useState("units_desc"); // units_desc | units_asc | title_asc
    // trigger to force re-fetching summaries when toggles change

    const loadSongs = async (id) => {
        const trimmed = id.trim();
        if (!trimmed) {
            setStatus("idle");
            setSongs([]);
            setErrorMsg("");

            setAlbumSummaries([]);
            setAlbumOptions([]);
            setSummaryStatus("idle");
            setSummaryError("");
            return;
        }

        setStatus("loading");
        setErrorMsg("");

        setAlbumSummaries([]);
        setAlbumOptions([]);
        setSummaryStatus("idle");
        setSummaryError("");

        try {
            const url = `${CONTENT_BASE}/artists/${encodeURIComponent(
                trimmed
            )}/tracks/`;
            const { data } = await axios.get(url, { timeout: 5000 });

            const items = Array.isArray(data?.items) ? data.items : [];
            if (items.length === 0) {
                setSongs([]);
                setStatus("empty");
                return;
            }

            setSongs(items);
            setStatus("success");
        } catch (err) {
            let msg = "No se han podido cargar las canciones del artista.";
            if (err.response) {
                msg = `El microservicio de contenidos respondió con código ${err.response.status} al cargar las canciones.`;
            } else if (err.request) {
                msg =
                    "No se puede conectar con el microservicio de contenidos (comprueba que el backend de contenidos está levantado).";
            }
            setErrorMsg(msg);
            setStatus("error");
        }
    };

    // Carga perezosa de la lista de artistas cuando se enfoca el input
    const fetchArtistOptions = async () => {
        if (artistOptionsLoaded || isFetchingArtists) return;

        setIsFetchingArtists(true);
        setArtistOptionsError("");

        try {
            const url = `${CONTENT_BASE}/artists/`;
            const { data } = await axios.get(url, { timeout: 5000 });

            let items = [];

            // Soportar varias formas de respuesta: {items:[]}, {results:[]} o []
            if (Array.isArray(data?.items)) {
                items = data.items;
            } else if (Array.isArray(data?.results)) {
                items = data.results;
            } else if (Array.isArray(data)) {
                items = data;
            }

            const mapped = items.map((a) => ({
                id: a.artist_id ?? a.id,
                name: a.name ?? "Artista sin nombre",
            }));

            setArtistOptions(mapped);
            setArtistOptionsLoaded(true);
        } catch (err) {
            console.error("Error cargando lista de artistas", err);
            setArtistOptionsError(
                "No se pudo cargar la lista de artistas desde el microservicio de contenidos."
            );
        } finally {
            setIsFetchingArtists(false);
        }
    };

    // Role-based access removed: do not redirect based on role

    const handleArtistInputFocus = () => {
        fetchArtistOptions();
    };

    const handleReloadClick = () => {
        // al cambiar de artista, reseteamos sólo el álbum seleccionado;
        // el resto de filtros se mantienen (orden, reembolsos, etc.)
        setSelectedAlbumId("all");
        loadSongs(artistId);
    };

    // Cuando tenemos canciones cargadas o cambian los filtros,
    // calculamos ventas totales por álbum usando el microservicio de estadísticas.
    useEffect(() => {
        if (status !== "success") {
            // si no hay canciones, limpiamos resumen
            setAlbumSummaries([]);
            setAlbumOptions([]);
            setSummaryStatus(
                status === "empty" || status === "idle" ? "idle" : "error"
            );
            if (status !== "error") setSummaryError("");
            return;
        }

        if (!songs || songs.length === 0) {
            setAlbumSummaries([]);
            setAlbumOptions([]);
            setSummaryStatus("idle");
            setSummaryError("");
            return;
        }

        // Sacar álbumes únicos a partir de las canciones
        const albumsMap = new Map();
        for (const song of songs) {
            const albumId =
                song.album_id ??
                song.album?.id ??
                song.album?.uuid ??
                song.album?.title ??
                null;

            if (!albumId) continue;

            const albumTitle =
                song.album?.title ??
                (typeof albumId === "string" ? albumId : String(albumId));

            if (!albumsMap.has(albumId)) {
                albumsMap.set(albumId, {
                    albumId,
                    albumTitle,
                });
            }
        }

        const albums = Array.from(albumsMap.values());
        setAlbumOptions(albums);

        if (albums.length === 0) {
            setAlbumSummaries([]);
            setSummaryStatus("idle");
            setSummaryError("");
            return;
        }

        // Si el álbum seleccionado ya no existe (cambio de artista),
        // reseteamos a "todos".
        if (
            selectedAlbumId !== "all" &&
            !albums.some(
                (a) => String(a.albumId) === String(selectedAlbumId)
            )
        ) {
            setSelectedAlbumId("all");
        }

        let filteredAlbums = albums;
        if (selectedAlbumId !== "all") {
            filteredAlbums = albums.filter(
                (a) => String(a.albumId) === String(selectedAlbumId)
            );
        }

        let cancelled = false;

        const fetchSummaries = async () => {
            setSummaryStatus("loading");
            setSummaryError("");

            try {
                const results = await Promise.all(
                        filteredAlbums.map(async (album) => {
                        // fetch a single sales summary (refunds removed)
                        const res = await fetchAlbumSales(album.albumId, { revenue: false });

                        if (!res || !res.ok) {
                            return {
                                ...album,
                                units: 0,
                                orders: 0,
                                error: (res?.error) || "Error al obtener ventas del álbum desde el microservicio de estadísticas.",
                            };
                        }

                        return {
                            ...album,
                            units: res?.units ?? 0,
                            orders: res?.orders ?? 0,
                        };
                    })
                );

                if (!cancelled) {
                    // store raw summaries (single variant)
                    setAlbumSummaries(results);
                    setSummaryStatus("success");
                }
            } catch (err) {
                console.error("Error obteniendo ventas por álbum", err);
                if (!cancelled) {
                    setAlbumSummaries([]);
                    setSummaryStatus("error");
                    setSummaryError(
                        "No se pudieron cargar las ventas totales por álbum desde el microservicio de estadísticas."
                    );
                }
            }
        };

        fetchSummaries();

        return () => {
            cancelled = true;
        };
    }, [
        status,
        songs,
        selectedAlbumId,
    ]);

    return (
        <div
            style={{
                maxWidth: 1100,
                margin: "32px auto",
                padding: "0 16px",
                color: "white",
            }}
        >
            <h1 style={{ marginBottom: 16 }}>Canciones del artista</h1>

            {/* Fila superior: selección de artista */}
            <div
                style={{
                    display: "flex",
                    gap: 8,
                    marginBottom: 16,
                    alignItems: "center",
                }}
            >
                {/* Dropdown selector with all artists */}
                <select
                    value={artistId}
                    onChange={(e) => {
                        const v = e.target.value;
                        setArtistId(v);
                        // load immediately when selecting an artist
                        loadSongs(v);
                    }}
                    onFocus={handleArtistInputFocus}
                    style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        color: "black",
                        background: "#fff",
                    }}
                >
                    <option value="">-- Selecciona un artista --</option>
                    {artistOptions.map((artist) => (
                        <option key={artist.id} value={artist.id}>
                            {artist.name} ({artist.id})
                        </option>
                    ))}
                </select>

                <button
                    onClick={() => loadSongs(artistId)}
                    style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        background: "#fff",
                        cursor: "pointer",
                        color: "black",
                    }}
                >
                    Recargar
                </button>
            </div>

            {artistOptionsError && (
                <div
                    style={{
                        background: "#fff7e6",
                        border: "1px solid #ffd591",
                        color: "#ad6800",
                        padding: 8,
                        borderRadius: 8,
                        marginBottom: 8,
                        fontSize: 12,
                    }}
                >
                    {artistOptionsError}
                </div>
            )}

            {status === "loading" && (
                <p>Cargando canciones del artista…</p>
            )}

            {status === "error" && (
                <div
                    style={{
                        background: "#fff7e6",
                        border: "1px solid #ffd591",
                        color: "#ad6800",
                        padding: 12,
                        borderRadius: 8,
                        marginBottom: 12,
                    }}
                >
                    {errorMsg}
                </div>
            )}

            {status === "empty" && (
                <div
                    style={{
                        background: "#eef6ff",
                        border: "1px solid #cfe3ff",
                        color: "#0b63b6",
                        padding: 12,
                        borderRadius: 8,
                        marginBottom: 12,
                    }}
                >
                    Este artista no tiene canciones todavía.
                </div>
            )}

            {status === "success" && (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 2fr) minmax(0, 3fr)",
                        gap: 16,
                        alignItems: "flex-start",
                    }}
                >
                    {/* Columna izquierda: lista de canciones */}
                    <div>
                        <h2 style={{ marginBottom: 8, fontSize: 20 }}>
                            Canciones y reproducciones
                        </h2>
                        <ul
                            style={{
                                listStyle: "none",
                                padding: 0,
                                margin: 0,
                                display: "grid",
                                gap: 12,
                            }}
                        >
                            {songs.map((song) => {
                                const title =
                                    song.title ?? song.name ?? "Sin título";
                                // Para reproducciones debemos usar el ID numérico canónico.
                                // Preferimos `song.id` / `song.song_id` / `song.track_id` when son numéricos.
                                const possibleId = song.id ?? song.song_id ?? song.track_id ?? null;
                                const songId = (possibleId && /^\d+$/.test(String(possibleId))) ? String(possibleId) : null;

                                // Intentamos sacar un albumId razonable
                                const albumId =
                                    song.album_id ??
                                    song.album?.id ??
                                    song.album?.uuid ??
                                    song.album?.title ??
                                    null;

                                const albumTitle =
                                    song.album?.title ??
                                    (albumId
                                        ? String(albumId)
                                        : "Álbum desconocido");

                                return (
                                    <li
                                        key={song.id ?? title}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            gap: 12,
                                            padding: 12,
                                            border: "1px solid #eee",
                                            borderRadius: 10,
                                            background: "#fff",
                                        }}
                                    >
                                        {/* Izquierda: canción + ventas del álbum */}
                                        <div
                                            style={{
                                                flex: 1,
                                                minWidth: 0,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    fontWeight: 600,
                                                    color: "#000",
                                                }}
                                            >
                                                {title}
                                            </div>

                                            {albumId && (
                                                <div style={{ marginTop: 4 }}>
                                                    <div
                                                        style={{
                                                            fontSize: 12,
                                                            color: "#444",
                                                            marginBottom: 2,
                                                        }}
                                                    >
                                                        Álbum: {albumTitle}
                                                    </div>
                                                    <AlbumSalesBadge
                                                        albumId={albumId}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Derecha: reproducciones */}
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 4,
                                            }}
                                        >
                                            <PlayCountBadge songId={songId} />
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    {/* Columna derecha: panel de ventas por álbum */}
                    <div>
                        <h2 style={{ marginBottom: 8, fontSize: 20 }}>
                            Ventas de álbumes
                        </h2>

                        {/* Filtros de ventas */}
                        <div
                            style={{
                                padding: 12,
                                borderRadius: 10,
                                background: "#222",
                                border: "1px solid #444",
                                marginBottom: 12,
                            }}
                        >
                            <h3
                                style={{
                                    margin: "0 0 8px 0",
                                    fontSize: 16,
                                }}
                            >
                                Filtros de ventas
                            </h3>
                            <div
                                style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 8,
                                    alignItems: "center",
                                }}
                            >
                                {/* Filtro por álbum */}
                                <select
                                    value={selectedAlbumId}
                                    onChange={(e) =>
                                        setSelectedAlbumId(e.target.value)
                                    }
                                    style={{
                                        flex: "1 1 180px",
                                        padding: "6px 8px",
                                        borderRadius: 8,
                                        border: "1px solid #ccc",
                                        color: "#000",
                                    }}
                                >
                                    <option value="all">
                                        Todos los álbumes
                                    </option>
                                    {albumOptions.map((album) => (
                                        <option
                                            key={album.albumId}
                                            value={album.albumId}
                                        >
                                            {album.albumTitle}
                                        </option>
                                    ))}
                                </select>

                                {/* refunds UI removed */}

                                {/* Ordenación */}
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                        flex: "1 1 180px",
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 12,
                                        }}
                                    >
                                        Ordenar por:
                                    </span>
                                    <select
                                        value={sortBy}
                                        onChange={(e) =>
                                            setSortBy(e.target.value)
                                        }
                                        style={{
                                            flex: 1,
                                            padding: "6px 8px",
                                            borderRadius: 8,
                                            border: "1px solid #ccc",
                                            color: "#000",
                                        }}
                                    >
                                        <option value="units_desc">
                                            Unidades (descendente)
                                        </option>
                                        <option value="units_asc">
                                            Unidades (ascendente)
                                        </option>
                                        <option value="title_asc">
                                            Álbum (A-Z)
                                        </option>
                                    </select>
                                </div>

                                {/* Sólo álbumes con ventas */}
                                <label
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                        fontSize: 13,
                                        flex: "0 0 auto",
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={onlyWithSales}
                                        onChange={(e) =>
                                            setOnlyWithSales(e.target.checked)
                                        }
                                    />
                                    Sólo álbumes con ventas
                                </label>
                            </div>

                            <p
                                style={{
                                    marginTop: 6,
                                    fontSize: 11,
                                    color: "#bbb",
                                }}
                            >
                                Los filtros se aplican automáticamente al
                                resumen de ventas de abajo.
                            </p>
                        </div>

                        {/* Resumen de ventas totales por álbum */}
                        <section>
                            <h3
                                style={{
                                    marginBottom: 8,
                                    fontSize: 16,
                                }}
                            >
                                Ventas totales por álbum
                            </h3>

                            {summaryStatus === "loading" && (
                                <p>
                                    Consultando ventas de álbumes en el
                                    microservicio de estadísticas…
                                </p>
                            )}

                            {summaryStatus === "error" && (
                                <div
                                    style={{
                                        background: "#fff7e6",
                                        border: "1px solid #ffd591",
                                        color: "#ad6800",
                                        padding: 12,
                                        borderRadius: 8,
                                        marginTop: 8,
                                    }}
                                >
                                    {summaryError}
                                </div>
                            )}

                            {summaryStatus === "success" &&
                                albumSummaries.length === 0 && (
                                    <p style={{ fontSize: 14 }}>
                                        No se han encontrado ventas para los
                                        filtros seleccionados.
                                    </p>
                                )}

                            {summaryStatus === "success" &&
                                albumSummaries.length > 0 && (
                                    (() => {
                                        // derive the displayed list according to the current UI toggles
                                        const displayed = albumSummaries
                                                                    .map((a) => ({
                                                                        ...a,
                                                                        displayUnits: a.units ?? 0,
                                                                        displayOrders: a.orders ?? 0,
                                                                    }))
                                            .filter((a) => {
                                                if (!onlyWithSales) return true;
                                                return (a.displayUnits ?? 0) > 0 || (a.displayOrders ?? 0) > 0;
                                            });

                                        // sorting
                                        displayed.sort((x, y) => {
                                            const ua = x.displayUnits ?? 0;
                                            const ub = y.displayUnits ?? 0;
                                            const ta = x.albumTitle?.toLowerCase() ?? "";
                                            const tb = y.albumTitle?.toLowerCase() ?? "";
                                            switch (sortBy) {
                                                case "units_asc":
                                                    return ua - ub;
                                                case "title_asc":
                                                    if (ta < tb) return -1;
                                                    if (ta > tb) return 1;
                                                    return 0;
                                                case "units_desc":
                                                default:
                                                    return ub - ua;
                                            }
                                        });

                                        return (
                                            <table
                                        style={{
                                            width: "100%",
                                            borderCollapse: "collapse",
                                            marginTop: 8,
                                            background: "#fff",
                                            color: "#000",
                                            borderRadius: 10,
                                            overflow: "hidden",
                                        }}
                                    >
                                        <thead>
                                        <tr
                                            style={{
                                                background: "#f5f5f5",
                                                textAlign: "left",
                                            }}
                                        >
                                            <th
                                                style={{
                                                    padding: "8px 12px",
                                                    borderBottom:
                                                        "1px solid #eee",
                                                }}
                                            >
                                                Álbum
                                            </th>
                                            <th
                                                style={{
                                                    padding: "8px 12px",
                                                    borderBottom:
                                                        "1px solid #eee",
                                                    width: 160,
                                                }}
                                            >
                                                Ventas (unidades)
                                            </th>
                                            <th
                                                style={{
                                                    padding: "8px 12px",
                                                    borderBottom:
                                                        "1px solid #eee",
                                                    width: 140,
                                                }}
                                            >
                                                Pedidos
                                            </th>
                                        </tr>
                                        </thead>
                                                <tbody>
                                                {displayed.map((album) => (
                                                    <tr key={album.albumId}>
                                                        <td
                                                            style={{
                                                                padding:
                                                                    "8px 12px",
                                                                borderBottom:
                                                                    "1px solid #f0f0f0",
                                                            }}
                                                        >
                                                            {album.albumTitle}
                                                        </td>
                                                        <td
                                                            style={{
                                                                padding:
                                                                    "8px 12px",
                                                                borderBottom:
                                                                    "1px solid #f0f0f0",
                                                            }}
                                                        >
                                                            {album.displayUnits}
                                                        </td>
                                                        <td
                                                            style={{
                                                                padding:
                                                                    "8px 12px",
                                                                borderBottom:
                                                                    "1px solid #f0f0f0",
                                                            }}
                                                        >
                                                            {album.displayOrders}
                                                        </td>
                                                    </tr>
                                                ))}
                                                </tbody>
                                            </table>
                                        );
                                    })()
                                )}
                        </section>
                    </div>
                </div>
            )}
        </div>
    );
}
