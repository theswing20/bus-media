import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { api } from "../api/client";

type Media = { id: string; kind: string; filename: string; path: string; bytes: number; durationSec: number; createdAt: string };

export default function MediaPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["media"], queryFn: () => api<Media[]>("/media") });
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api("/media", { method: "POST", body: fd });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }),
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/media/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }) });

  return (
    <>
      <h2>Ролики</h2>
      <div className="card row">
        <input type="file" ref={fileRef} accept="video/mp4,video/webm,image/*,audio/*" />
        <button className="primary" disabled={upload.isPending} onClick={() => fileRef.current?.files?.[0] && upload.mutate(fileRef.current.files[0])}>
          {upload.isPending ? "Загрузка…" : "Загрузить"}
        </button>
        <span style={{ color: "#666" }}>Рекомендуется H.264 MP4 1920×1080, звук AAC — бортовой компьютер играет его аппаратно</span>
      </div>
      <table>
        <thead><tr><th>Файл</th><th>Тип</th><th>Размер</th><th>Длит., с</th><th>Загружен</th><th /></tr></thead>
        <tbody>
          {data.map((m) => (
            <tr key={m.id}>
              <td><a href={`/files/${m.path}`} target="_blank">{m.filename}</a></td>
              <td>{m.kind}</td><td>{(m.bytes / 1e6).toFixed(1)} МБ</td><td>{m.durationSec || "—"}</td>
              <td>{new Date(m.createdAt).toLocaleString("ru")}</td>
              <td><button className="danger" onClick={() => confirm("Удалить?") && remove.mutate(m.id)}>Удалить</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
