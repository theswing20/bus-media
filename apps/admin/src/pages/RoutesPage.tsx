import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import { api } from "../api/client";

type RouteRow = { id: string; number: string; nameKk: string; nameRu: string; _count: { stops: number; devices: number } };

export default function RoutesPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["routes"], queryFn: () => api<RouteRow[]>("/routes") });
  const [form, setForm] = useState({ number: "", nameKk: "", nameRu: "" });
  const create = useMutation({
    mutationFn: () => api("/routes", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["routes"] }); setForm({ number: "", nameKk: "", nameRu: "" }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/routes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["routes"] }),
  });

  return (
    <>
      <h2>Маршруты</h2>
      <div className="card row">
        <input placeholder="№ (44)" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
        <input placeholder="Атауы (kk)" value={form.nameKk} onChange={(e) => setForm({ ...form, nameKk: e.target.value })} />
        <input placeholder="Название (ru)" value={form.nameRu} onChange={(e) => setForm({ ...form, nameRu: e.target.value })} />
        <button className="primary" onClick={() => create.mutate()} disabled={!form.number}>Добавить</button>
      </div>
      <table>
        <thead><tr><th>№</th><th>Название</th><th>Остановок</th><th>Автобусов</th><th /></tr></thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id}>
              <td><Link to={`/routes/${r.id}`}>{r.number}</Link></td>
              <td>{r.nameRu} / {r.nameKk}</td>
              <td>{r._count.stops}</td><td>{r._count.devices}</td>
              <td><button className="danger" onClick={() => confirm("Удалить маршрут?") && remove.mutate(r.id)}>Удалить</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
