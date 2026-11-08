import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";

type Device = { id: string; busNumber: string; routeId: string | null; route?: { number: string } | null; lastSeenAt: string | null; online: boolean; manifestVersion: string | null; appVersion: string | null; lastLat?: number; lastLng?: number; occupancy: number | null; occupancyAt: string | null };
type Route = { id: string; number: string };

export default function DevicesPage() {
  const qc = useQueryClient();
  const { data: devices = [] } = useQuery({ queryKey: ["devices"], queryFn: () => api<Device[]>("/reports/devices"), refetchInterval: 15000 });
  const { data: routes = [] } = useQuery({ queryKey: ["routes"], queryFn: () => api<Route[]>("/routes") });
  const [busNumber, setBusNumber] = useState("");
  const [newToken, setNewToken] = useState<{ busNumber: string; token: string } | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["devices"] });
  const create = useMutation({
    mutationFn: () => api<{ busNumber: string; token: string }>("/devices", { method: "POST", body: JSON.stringify({ busNumber }) }),
    onSuccess: (d) => { setNewToken(d); setBusNumber(""); invalidate(); },
  });
  const assign = useMutation({ mutationFn: (p: { id: string; routeId: string | null }) => api(`/devices/${p.id}`, { method: "PUT", body: JSON.stringify({ routeId: p.routeId }) }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => api(`/devices/${id}`, { method: "DELETE" }), onSuccess: invalidate });

  return (
    <>
      <h2>Автобусы (бортовые компьютеры)</h2>
      <div className="card row">
        <input placeholder="Гаражный № (A700)" value={busNumber} onChange={(e) => setBusNumber(e.target.value)} />
        <button className="primary" disabled={!busNumber} onClick={() => create.mutate()}>Зарегистрировать</button>
      </div>
      {newToken && (
        <div className="card" style={{ background: "#fffbeb" }}>
          Токен для борта <b>{newToken.busNumber}</b> (показывается один раз — вставить в <code>PLAYER_DEVICE_TOKEN</code> на компьютере автобуса):
          <pre>{newToken.token}</pre>
          <button onClick={() => setNewToken(null)}>Скрыл</button>
        </div>
      )}
      <table>
        <thead><tr><th>Борт</th><th>Маршрут</th><th>Связь</th><th>В салоне</th><th>Последний выход на связь</th><th>Манифест</th><th>Версия</th><th /></tr></thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.id}>
              <td><b>{d.busNumber}</b></td>
              <td>
                <select value={d.routeId ?? ""} onChange={(e) => assign.mutate({ id: d.id, routeId: e.target.value || null })}>
                  <option value="">— не назначен —</option>
                  {routes.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}
                </select>
              </td>
              <td><span className={`badge ${d.online ? "on" : "off"}`}>{d.online ? "онлайн" : "офлайн"}</span></td>
              <td title={d.occupancyAt ? `по данным на ${new Date(d.occupancyAt).toLocaleTimeString("ru")}` : "нет датчиков пассажиров"}>{d.occupancy ?? "—"}</td>
              <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString("ru") : "никогда"}{d.lastLat ? ` · ${d.lastLat.toFixed(4)}, ${d.lastLng?.toFixed(4)}` : ""}</td>
              <td><code>{d.manifestVersion ?? "—"}</code></td>
              <td>{d.appVersion ?? "—"}</td>
              <td><button className="danger" onClick={() => confirm("Удалить?") && remove.mutate(d.id)}>Удалить</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
