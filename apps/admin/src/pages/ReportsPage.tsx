import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";

type Campaign = { id: string; name: string };
type Route = { id: string; number: string };
type Report = {
  total: number; audience: number; withAudience: number;
  groups: { key: string; total: number; completed: number; audience: number; withAudience: number }[];
};
type PaxReport = {
  boarded: number; alighted: number; maxOccupancy: number;
  groups: { key: string; label: string; boarded: number; alighted: number; maxOccupancy: number }[];
};

/** Отчёт о показах (БТ-36) + пассажиропоток с датчиков дверей. */
export default function ReportsPage() {
  const { data: campaigns = [] } = useQuery({ queryKey: ["campaigns"], queryFn: () => api<Campaign[]>("/campaigns") });
  const { data: routes = [] } = useQuery({ queryKey: ["routes"], queryFn: () => api<Route[]>("/routes") });
  const [campaignId, setCampaignId] = useState("");
  const [groupBy, setGroupBy] = useState<"day" | "route" | "device" | "media">("day");
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const qs = new URLSearchParams({ groupBy, from, to: `${to}T23:59:59`, ...(campaignId ? { campaignId } : {}) });
  const { data } = useQuery({ queryKey: ["report", qs.toString()], queryFn: () => api<Report>(`/reports/impressions?${qs}`), refetchInterval: 30000 });

  const [paxRouteId, setPaxRouteId] = useState("");
  const [paxGroupBy, setPaxGroupBy] = useState<"stop" | "day" | "hour" | "device" | "route">("stop");
  const pqs = new URLSearchParams({ groupBy: paxGroupBy, from, to: `${to}T23:59:59`, ...(paxRouteId ? { routeId: paxRouteId } : {}) });
  const { data: pax } = useQuery({ queryKey: ["pax", pqs.toString()], queryFn: () => api<PaxReport>(`/reports/passengers?${pqs}`), refetchInterval: 30000 });

  const avg = (a: number, n: number) => (n ? (a / n).toFixed(1) : "—");

  return (
    <>
      <h2>Отчёт о показах</h2>
      <div className="card row">
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
          <option value="">Все кампании</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
          <option value="day">По дням</option><option value="route">По маршрутам</option><option value="device">По бортам</option><option value="media">По роликам</option>
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <strong>Показов: {data?.total ?? 0}</strong>
        <strong title="Сумма людей в салоне по всем показам: было на старте ролика + вошло во время него">Контактов: {data?.audience ?? 0}</strong>
      </div>
      <table>
        <thead><tr><th>{groupBy}</th><th>Показов</th><th>Досмотрено</th><th>Контактов</th><th>Зрителей на показ</th></tr></thead>
        <tbody>{data?.groups.map((g) => (
          <tr key={g.key}><td>{g.key}</td><td>{g.total}</td><td>{g.completed}</td><td>{g.withAudience ? g.audience : "—"}</td><td>{avg(g.audience, g.withAudience)}</td></tr>
        ))}</tbody>
      </table>
      {data && data.withAudience < data.total && (
        <p className="muted">Аудитория посчитана по {data.withAudience} из {data.total} показов — по остальным нет данных датчиков пассажиров.</p>
      )}

      <h2 style={{ marginTop: 32 }}>Пассажиропоток</h2>
      <div className="card row">
        <select value={paxRouteId} onChange={(e) => setPaxRouteId(e.target.value)}>
          <option value="">Все маршруты</option>
          {routes.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}
        </select>
        <select value={paxGroupBy} onChange={(e) => setPaxGroupBy(e.target.value as typeof paxGroupBy)}>
          <option value="stop">По остановкам</option><option value="hour">По часам</option><option value="day">По дням</option>
          <option value="device">По бортам</option><option value="route">По маршрутам</option>
        </select>
        <strong>Перевезено (вошло): {pax?.boarded ?? 0}</strong>
        <strong>Вышло: {pax?.alighted ?? 0}</strong>
        <strong>Пик в салоне: {pax?.maxOccupancy ?? 0}</strong>
      </div>
      <table>
        <thead><tr><th>{{ stop: "Остановка", hour: "Час", day: "День", device: "Борт", route: "Маршрут" }[paxGroupBy]}</th><th>Вошло</th><th>Вышло</th><th>Пик в салоне</th></tr></thead>
        <tbody>{pax?.groups.map((g) => (
          <tr key={g.key}><td>{g.label}</td><td>{g.boarded}</td><td>{g.alighted}</td><td>{g.maxOccupancy}</td></tr>
        ))}</tbody>
      </table>
      {pax && pax.groups.length === 0 && <p className="muted">Нет данных с датчиков за период.</p>}
    </>
  );
}
