// src/pages/SongRow.jsx
import PlaysBadge from "../plays/PlaysBadge"; // misma ruta que ya tenías
import AlbumSalesBadge from "../stats/AlbumSalesBadge.jsx"; // NUEVO

export default function SongRow({ song }) {
    const songId = song.id ?? song.song_id ?? song._id;

    // Intentamos sacar el ID del álbum de distintas formas
    const albumId =
        song.album?.album_id ??
        song.album?.id ??
        song.album_id ??
        null;

    const albumName =
        song.album?.title ??
        song.album?.name ??
        song.album_title ??
        "";

    return (
        <div className="song-row">
            <div className="left">
                {/* Muestra título y álbum en negro (fuente legible) */}
                <div style={{ display: "flex", flexDirection: "column" }}>
          <span
              style={{
                  fontWeight: 600,
                  color: "#000",
              }}
          >
            {song.title ?? song.name ?? "Canción sin título"}
          </span>
                    {albumName && (
                        <span
                            style={{
                                fontSize: 12,
                                color: "#000",
                                opacity: 0.7,
                            }}
                        >
              Álbum: {albumName}
            </span>
                    )}
                </div>
            </div>

            <div className="right">
                {/* Apilamos reproducciones + ventas de álbum */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 6,
                    }}
                >
                    {/* Badge de reproducciones que ya tenías */}
                    <PlaysBadge songId={songId} onlyValid={true} />

                    {/* NUEVO badge: ventas del álbum */}
                    <AlbumSalesBadge albumId={albumId} />
                </div>
            </div>
        </div>
    );
}
