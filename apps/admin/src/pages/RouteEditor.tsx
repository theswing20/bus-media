import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Route, Stop } from "@bus/shared";
import { api } from "../api/client";

// Leaflet в Vite теряет иконки — задаём явно
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function ClickToAdd({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/**
 * Редактор остановок: клик по карте добавляет остановку в выбранное направление.
 * Озвучка генерируется на сервере при сохранении (если настроен Azure TTS).
 */
export default function RouteEditor() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: route } = useQuery({ queryKey: ["route", id], queryFn: () => api<Route>(`/routes/${id}`) });
  const [direction, setDirection] = useState<0 | 1>(0);
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(null);
  const [names, setNames] = useState({ nameKk: "", nameRu: "" });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["route", id] });
  const addStop = useMutation({
    mutationFn: () => {
      const seq = (route?.stops.filter((s) => s.direction === direction).length ?? 0);
      return api(`/routes/${id}/stops`, { method: "POST", body: JSON.stringify({ ...pending, ...names, direction, seq, radiusM: 60 }) });
    },
    onSuccess: () => { invalidate(); setPending(null); setNames({ nameKk: "", nameRu: "" }); },
  });
  const removeStop = useMutation({ mutationFn: (sid: string) => api(`/stops/${sid}`, { method: "DELETE" }), onSuccess: invalidate });
  const regen = useMutation({ mutationFn: (sid: string) => api(`/stops/${sid}/regenerate-audio`, { method: "POST" }), onSuccess: invalidate });

  if (!route) return <p>Загрузка…</p>;
  const stops = route.stops.filter((s) => s.direction === direction).sort((a, b) => a.seq - b.seq);
  const center: [number, number] = stops[0] ? [stops[0].lat, stops[0].lng] : [51.1694, 71.4491];

  return (
    <>
      <h2>Маршрут {route.number} — {route.nameRu}</h2>
      <div className="row">
        <label>Направление:</label>
        <select value={direction} onChange={(e) => setDirection(Number(e.target.value) as 0 | 1)}>
          <option value={0}>Туда (A → B)</option>
          <option value={1}>Обратно (B → A)</option>
        </select>
        <span style={{ color: "#666" }}>Кликните по карте, чтобы добавить остановку в конец направления</span>
      </div>

      <div className="map">
        <MapContainer center={center} zoom={13} style={{ height: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          <ClickToAdd onClick={(lat, lng) => setPending({ lat, lng })} />
          {stops.map((s) => (
            <Marker key={s.id} position={[s.lat, s.lng]}><Popup>{s.seq + 1}. {s.nameRu}<br />{s.nameKk}</Popup></Marker>
          ))}
          {stops.length > 1 && <Polyline positions={stops.map((s) => [s.lat, s.lng])} />}
          {pending && <Marker position={[pending.lat, pending.lng]} opacity={0.5} />}
        </MapContainer>
      </div>

      {pending && (
        <div className="card row">
          <strong>Новая остановка #{stops.length + 1}</strong>
          <input placeholder="Атауы (kk)" value={names.nameKk} onChange={(e) => setNames({ ...names, nameKk: e.target.value })} />
          <input placeholder="Название (ru)" value={names.nameRu} onChange={(e) => setNames({ ...names, nameRu: e.target.value })} />
          <button className="primary" disabled={!names.nameKk || !names.nameRu} onClick={() => addStop.mutate()}>Сохранить</button>
          <button onClick={() => setPending(null)}>Отмена</button>
        </div>
      )}

      <table>
        <thead><tr><th>#</th><th>kk</th><th>ru</th><th>Координаты</th><th>Озвучка</th><th /></tr></thead>
        <tbody>
          {stops.map((s: Stop) => (
            <tr key={s.id}>
              <td>{s.seq + 1}</td><td>{s.nameKk}</td><td>{s.nameRu}</td>
              <td>{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</td>
              <td>
                {s.audio?.next_kk ? <audio controls src={s.audio.next_kk} style={{ height: 28 }} /> : <span className="badge off">нет</span>}
              </td>
              <td className="row">
                <button onClick={() => regen.mutate(s.id)}>TTS</button>
                <button className="danger" onClick={() => removeStop.mutate(s.id)}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
