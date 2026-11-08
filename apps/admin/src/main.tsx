import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RoutesPage from "./pages/RoutesPage";
import RouteEditor from "./pages/RouteEditor";
import MediaPage from "./pages/MediaPage";
import CampaignsPage from "./pages/CampaignsPage";
import DevicesPage from "./pages/DevicesPage";
import ReportsPage from "./pages/ReportsPage";
import "./styles.css";

const qc = new QueryClient();

function Layout() {
  return (
    <div className="layout">
      <nav>
        <h1>Bus Media</h1>
        <NavLink to="/routes">Маршруты и остановки</NavLink>
        <NavLink to="/media">Ролики</NavLink>
        <NavLink to="/campaigns">Кампании</NavLink>
        <NavLink to="/devices">Автобусы</NavLink>
        <NavLink to="/reports">Отчёты</NavLink>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/routes" />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/routes/:id" element={<RouteEditor />} />
          <Route path="/media" element={<MediaPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter><Layout /></BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
