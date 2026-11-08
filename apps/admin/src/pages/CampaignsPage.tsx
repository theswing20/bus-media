import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";

type Campaign = {
  id: string; name: string; advertiser?: string; startsAt: string; endsAt: string; active: boolean;
  routes: { route: { id: string; number: string } }[];
  media: { weight: number; media: { id: string; filename: string } }[];
};
type Route = { id: string; number: string };
type Media = { id: string; filename: string };

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

export default function CampaignsPage() {
  const qc = useQueryClient();
  const { data: campaigns = [] } = useQuery({ queryKey: ["campaigns"], queryFn: () => api<Campaign[]>("/campaigns") });
  const { data: routes = [] } = useQuery({ queryKey: ["routes"], queryFn: () => api<Route[]>("/routes") });
  const { data: media = [] } = useQuery({ queryKey: ["media"], queryFn: () => api<Media[]>("/media") });

  const [form, setForm] = useState({ name: "", advertiser: "", startsAt: today(), endsAt: plusDays(30), routeIds: [] as string[], mediaIds: [] as string[] });
  const create = useMutation({
    mutationFn: () => api("/campaigns", { method: "POST", body: JSON.stringify({ ...form, media: form.mediaIds.map((mediaId) => ({ mediaId, weight: 1 })) }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["campaigns"] }); setForm({ ...form, name: "", mediaIds: [], routeIds: [] }); },
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/campaigns/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }) });

  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  return (
    <>
      <h2>Рекламные кампании</h2>
      <div className="card">
        <div className="row">
          <input placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Рекламодатель" value={form.advertiser} onChange={(e) => setForm({ ...form, advertiser: e.target.value })} />
          <input type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          <input type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
        </div>
        <div className="row">
          <strong>Маршруты</strong> <small>(ничего не выбрано = все)</small>
          {routes.map((r) => (
            <label key={r.id}><input type="checkbox" checked={form.routeIds.includes(r.id)} onChange={() => setForm({ ...form, routeIds: toggle(form.routeIds, r.id) })} /> {r.number}</label>
          ))}
        </div>
        <div className="row">
          <strong>Ролики</strong>
          {media.map((m) => (
            <label key={m.id}><input type="checkbox" checked={form.mediaIds.includes(m.id)} onChange={() => setForm({ ...form, mediaIds: toggle(form.mediaIds, m.id) })} /> {m.filename}</label>
          ))}
        </div>
        <button className="primary" disabled={!form.name || form.mediaIds.length === 0} onClick={() => create.mutate()}>Создать кампанию</button>
      </div>
      <table>
        <thead><tr><th>Кампания</th><th>Период</th><th>Маршруты</th><th>Ролики</th><th>Статус</th><th /></tr></thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id}>
              <td>{c.name}<br /><small>{c.advertiser}</small></td>
              <td>{c.startsAt.slice(0, 10)} — {c.endsAt.slice(0, 10)}</td>
              <td>{c.routes.length ? c.routes.map((r) => r.route.number).join(", ") : "все"}</td>
              <td>{c.media.map((m) => m.media.filename).join(", ")}</td>
              <td><span className={`badge ${c.active ? "on" : "off"}`}>{c.active ? "активна" : "выкл"}</span></td>
              <td><button className="danger" onClick={() => confirm("Удалить?") && remove.mutate(c.id)}>Удалить</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
