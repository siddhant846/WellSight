"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList
} from "recharts";
import {
  Table2,
  TrendingUp,
  BarChart2,
  MapPin,
  Grid,
  CreditCard,
  Search,
  ChevronDown,
  Droplet,
  Calendar,
  Wrench,
  Waves,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from "lucide-react";

// Dynamically import Leaflet Map to avoid SSR issues
const DynamicMap = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full flex items-center justify-center bg-[#071322] rounded-xl text-slate-400">
      <div className="flex items-center gap-2 text-xs">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
        <span>Loading Satellite Well Map...</span>
      </div>
    </div>
  )
});

export interface VisualSpec {
  visual_type: "status_card" | "table" | "line" | "bar" | "map" | "heatmap" | string;
  title: string;
  data: any;
  options?: Record<string, any>;
}

interface VisualRendererProps {
  spec: VisualSpec;
  onCitationClick?: (citationId: string) => void;
}

export default function VisualRenderer({ spec, onCitationClick }: VisualRendererProps) {
  const { visual_type, title, data } = spec;

  // -------------------------------------------------------------
  // 1. TABLE ("Wells Overview" / "List of wells, events or repairs")
  // -------------------------------------------------------------
  if (visual_type === "table") {
    return <OverviewTableCard title={title} data={data} onCitationClick={onCitationClick} />;
  }

  // -------------------------------------------------------------
  // 2. LINE CHART ("Groundwater Level Over Time" / "Value changing over time")
  // -------------------------------------------------------------
  if (visual_type === "line") {
    return <LineChartCard title={title} data={data} />;
  }

  // -------------------------------------------------------------
  // 3. BAR CHART ("Water Level Comparison Across Wells" / "Comparing a few wells or areas")
  // -------------------------------------------------------------
  if (visual_type === "bar") {
    return <BarChartCard title={title} data={data} />;
  }

  // -------------------------------------------------------------
  // 4. MAP ("Well Locations" / "Where things are located")
  // -------------------------------------------------------------
  if (visual_type === "map") {
    return <MapCard title={title} data={data} />;
  }

  // -------------------------------------------------------------
  // 5. HEATMAP ("Monthly Water Shortage (%)" / "Two dimensions at once (area × month)")
  // -------------------------------------------------------------
  if (visual_type === "heatmap") {
    return <HeatmapCard title={title} data={data} />;
  }

  // -------------------------------------------------------------
  // 6. CARD ("Well 1 Status" / "Single well status at a glance")
  // -------------------------------------------------------------
  if (visual_type === "status_card") {
    return <StatusCard title={title} data={data} onCitationClick={onCitationClick} />;
  }

  return null;
}

// =========================================================================
// CARD 1: OVERVIEW TABLE CARD
// =========================================================================
export function OverviewTableCard({
  title = "Wells Overview",
  data,
  onCitationClick
}: {
  title?: string;
  data?: any;
  onCitationClick?: (cid: string) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");

  const defaultRows = [
    { id: "W-001", name: "Well 1", location: "Pune", status: "Active", lastEvent: "2025-10-10" },
    { id: "W-002", name: "Well 2", location: "Mumbai", status: "Needs Repair", lastEvent: "2025-10-08" },
    { id: "W-003", name: "Well 3", location: "Nashik", status: "Active", lastEvent: "2025-10-12" },
    { id: "W-004", name: "Well 4", location: "Aurangabad", status: "Offline", lastEvent: "2025-09-28" },
    { id: "W-005", name: "Well 5", location: "Pune", status: "Active", lastEvent: "2025-10-11" }
  ];

  let rows = defaultRows;
  if (Array.isArray(data) && data.length > 0) {
    rows = data.map((d: any, idx: number) => ({
      id: d.id || d.well_id || d.asset_id || d.well || `W-${String(idx + 1).padStart(3, "0")}`,
      name: d.name || d.well_name || d.asset_id || d.well || `Well ${idx + 1}`,
      location: d.location || d.area || "Northeast Block 8",
      status: d.status || (d.is_producing === false ? "Offline" : (d.recorded_status === "down" ? "Needs Repair" : "Active")),
      lastEvent: d.lastEvent || d.date || d.inspected_at || "2026-10-15"
    }));
  }

  const filtered = rows.filter(
    (r) =>
      r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-[#0b1726] border border-[#14293f] rounded-2xl p-4 shadow-xl flex flex-col justify-between h-full">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/60 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <Table2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">{title || "Wells Overview"}</h3>
              <p className="text-[11px] text-slate-400">List of wells, events or repairs</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-300 bg-[#071322] px-2.5 py-1 rounded-lg border border-[#1b3552]">
              Total Wells: {rows.length}
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search wells..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#071322] border border-[#1b3552] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="text-slate-400 border-b border-[#14293f] text-[11px]">
                <th className="py-2 px-2 font-medium">ID</th>
                <th className="py-2 px-2 font-medium">Name</th>
                <th className="py-2 px-2 font-medium">Location</th>
                <th className="py-2 px-2 font-medium">Status</th>
                <th className="py-2 px-2 font-medium">Last Event</th>
                <th className="py-2 px-2 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#14293f]/60 text-slate-300">
              {filtered.map((r, i) => (
                <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2 px-2 font-medium text-slate-200 whitespace-nowrap">{r.id}</td>
                  <td className="py-2 px-2 text-slate-300 whitespace-nowrap">{r.name}</td>
                  <td className="py-2 px-2 text-slate-400 whitespace-nowrap">{r.location}</td>
                  <td className="py-2 px-2 whitespace-nowrap">
                    {r.status === "Active" || r.status === "producing" ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                        Active
                      </span>
                    ) : r.status === "Needs Repair" ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                        Needs Repair
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/40">
                        Offline
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-slate-400 whitespace-nowrap">{r.lastEvent}</td>
                  <td className="py-2 px-2 text-center whitespace-nowrap">
                    <button
                      onClick={() => onCitationClick?.(r.id)}
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/20 transition-all cursor-pointer"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// CARD 2: LINE CHART CARD
// =========================================================================
export function LineChartCard({
  title = "Groundwater Level Over Time",
  data
}: {
  title?: string;
  data?: any;
}) {
  const defaultData = [
    { month: "Apr", well1: 9.8, well2: 6.8, well3: 4.8 },
    { month: "May", well1: 12.0, well2: 8.0, well3: 6.2 },
    { month: "Jun", well1: 11.5, well2: 8.2, well3: 6.5 },
    { month: "Jul", well1: 12.2, well2: 8.0, well3: 5.8 },
    { month: "Aug", well1: 13.1, well2: 8.8, well3: 5.2 },
    { month: "Sep", well1: 12.5, well2: 7.9, well3: 6.3 }
  ];

  let chartData = defaultData;
  if (Array.isArray(data) && data.length > 0) {
    chartData = data.map((d: any, idx: number) => ({
      month: d.month || d.date || `W${idx + 1}`,
      well1: Number(d.well1 ?? d.wellhead_temp_c ?? d.wellhead ?? d.val1 ?? 12),
      well2: Number(d.well2 ?? d.air_temp_c ?? d.air ?? d.val2 ?? 8),
      well3: Number(d.well3 ?? d.delta_temp_c ?? d.delta ?? d.val3 ?? 5)
    }));
  }

  return (
    <div className="bg-[#0b1726] border border-[#14293f] rounded-2xl p-4 shadow-xl flex flex-col justify-between h-full">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/60 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">{title || "Groundwater Level Over Time"}</h3>
              <p className="text-[11px] text-slate-400">Value changing over time</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 text-[11px] bg-[#071322] px-2 py-1 rounded-lg border border-[#1b3552] text-slate-300">
              <span>Well 1</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </div>
            <div className="flex items-center gap-1 text-[11px] bg-[#071322] px-2 py-1 rounded-lg border border-[#1b3552] text-slate-300">
              <span>Last 6 Months</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-56 w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#14293f" vertical={false} />
              <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} domain={[0, 20]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#071322",
                  borderColor: "#1b3552",
                  borderRadius: "8px",
                  fontSize: "11px",
                  color: "#f1f5f9"
                }}
              />
              <Line
                type="monotone"
                dataKey="well1"
                name="Well 1"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: "#2563eb" }}
              />
              <Line
                type="monotone"
                dataKey="well2"
                name="Well 2"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: "#10b981" }}
              />
              <Line
                type="monotone"
                dataKey="well3"
                name="Well 3"
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: "#f59e0b" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-5 mt-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2563eb]" />
            <span>Well 1</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]" />
            <span>Well 2</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />
            <span>Well 3</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// CARD 3: BAR CHART CARD
// =========================================================================
export function BarChartCard({
  title = "Water Level Comparison Across Wells",
  data
}: {
  title?: string;
  data?: any;
}) {
  const defaultBars = [
    { name: "Well 1", val: 12.5, color: "#3b82f6" },
    { name: "Well 2", val: 8.3,  color: "#10b981" },
    { name: "Well 3", val: 15.2, color: "#f59e0b" },
    { name: "Well 4", val: 10.7, color: "#8b5cf6" },
    { name: "Well 5", val: 13.6, color: "#06b6d4" }
  ];

  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899"];

  let chartBars = defaultBars;
  if (Array.isArray(data) && data.length > 0) {
    chartBars = data.slice(0, 6).map((d: any, idx: number) => ({
      name: d.name || d.asset_id || d.well_id || d.well || `Well ${idx + 1}`,
      val: Number(d.val ?? d.downtime_days ?? d.days_down ?? d.downtime ?? d.cost_usd ?? 10),
      color: colors[idx % colors.length]
    }));
  }

  return (
    <div className="bg-[#0b1726] border border-[#14293f] rounded-2xl p-4 shadow-xl flex flex-col justify-between h-full">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/60 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <BarChart2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">{title || "Water Level Comparison Across Wells"}</h3>
              <p className="text-[11px] text-slate-400">Comparing a few wells or areas</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[11px] bg-[#071322] px-2.5 py-1 rounded-lg border border-[#1b3552] text-slate-300">
            <span>Current</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </div>
        </div>

        {/* Chart */}
        <div className="h-60 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartBars} margin={{ top: 18, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#14293f" vertical={false} />
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} domain={[0, 20]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#071322",
                  borderColor: "#1b3552",
                  borderRadius: "8px",
                  fontSize: "11px",
                  color: "#f1f5f9"
                }}
              />
              <Bar dataKey="val" radius={[6, 6, 0, 0]}>
                <LabelList dataKey="val" position="top" fill="#f1f5f9" fontSize={11} fontWeight={600} />
                {chartBars.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// CARD 4: MAP CARD
// =========================================================================
export function MapCard({
  title = "Well Locations",
  data
}: {
  title?: string;
  data?: any;
}) {
  const defaultWells = [
    { well_id: "W-001", name: "Well 1", lat: 18.5204, lon: 73.8567, status: "Active" },
    { well_id: "W-002", name: "Well 2", lat: 19.0760, lon: 72.8777, status: "Needs Repair" },
    { well_id: "W-003", name: "Well 3", lat: 19.9975, lon: 73.7898, status: "Active" },
    { well_id: "W-004", name: "Well 4", lat: 19.8762, lon: 75.3433, status: "Offline" },
    { well_id: "W-005", name: "Well 5", lat: 18.5314, lon: 73.8446, status: "Active" }
  ];

  const wells = Array.isArray(data) && data.length > 0 ? data : defaultWells;

  return (
    <div className="bg-[#0b1726] border border-[#14293f] rounded-2xl p-4 shadow-xl flex flex-col justify-between h-full relative">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/60 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">{title || "Well Locations"}</h3>
              <p className="text-[11px] text-slate-400">Where things are located</p>
            </div>
          </div>
        </div>

        {/* Map Container */}
        <div className="h-64 w-full rounded-xl overflow-hidden border border-[#14293f] relative">
          <DynamicMap wells={wells} />

          {/* Floating Legend */}
          <div className="absolute bottom-2.5 left-2.5 z-[1000] bg-[#071322]/90 backdrop-blur-md border border-[#1b3552] rounded-xl px-3 py-2 text-[11px] text-slate-300 space-y-1 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span>Active</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span>Needs Repair</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>Offline</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// CARD 5: HEATMAP CARD
// =========================================================================
export function HeatmapCard({
  title = "Monthly Water Shortage (%)",
  data
}: {
  title?: string;
  data?: any;
}) {
  const defaultHeatmap = [
    { area: "Pune",       m: [12, 15, 18, 20, 22, 19] },
    { area: "Mumbai",     m: [8,  10, 12, 14, 16, 15] },
    { area: "Nashik",     m: [5,  8,  10, 12, 14, 13] },
    { area: "Aurangabad", m: [20, 25, 28, 32, 30, 27] },
    { area: "Nagpur",     m: [15, 18, 22, 24, 26, 23] }
  ];

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

  const getColor = (v: number) => {
    if (v <= 10) return "#38bdf8"; // Light Blue / Cyan
    if (v <= 16) return "#4ade80"; // Light Green
    if (v <= 22) return "#fbbf24"; // Yellow
    if (v <= 28) return "#f97316"; // Orange
    return "#ef4444";             // Red
  };

  return (
    <div className="bg-[#0b1726] border border-[#14293f] rounded-2xl p-4 shadow-xl flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/60 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <Grid className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">{title || "Monthly Water Shortage (%)"}</h3>
              <p className="text-[11px] text-slate-400">Two dimensions at once (area × month)</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[11px] bg-[#071322] px-2.5 py-1 rounded-lg border border-[#1b3552] text-slate-300">
            <span>Water Shortage</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </div>
        </div>

        {/* Heatmap Grid with Continuous Colorbar */}
        <div className="flex items-center gap-3 pt-2">
          {/* Main Heatmap Table */}
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-center border-collapse">
              <tbody>
                {defaultHeatmap.map((row, rIdx) => (
                  <tr key={rIdx}>
                    <td className="text-left text-xs font-medium text-slate-300 py-1.5 pr-2 whitespace-nowrap">
                      {row.area}
                    </td>
                    {row.m.map((val, cIdx) => (
                      <td key={cIdx} className="p-1">
                        <div
                          style={{ backgroundColor: getColor(val) }}
                          className="w-10 h-7 rounded text-[11px] font-bold text-slate-950 flex items-center justify-center shadow-sm"
                        >
                          {val}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="py-2"></td>
                  {months.map((m) => (
                    <td key={m} className="text-[11px] text-slate-400 py-2">
                      {m}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Continuous Gradient Scale Bar */}
          <div className="flex items-center gap-1.5 shrink-0 pl-1">
            <div className="h-44 w-3 rounded-full bg-gradient-to-t from-[#38bdf8] via-[#4ade80] via-[#fbbf24] via-[#f97316] to-[#ef4444] shadow-inner" />
            <div className="flex flex-col justify-between h-44 text-[10px] text-slate-400 font-mono py-0.5">
              <span>40</span>
              <span>30</span>
              <span>20</span>
              <span>10</span>
              <span>0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// CARD 6: SINGLE WELL STATUS CARD
// =========================================================================
export function StatusCard({
  title = "Well 1 Status",
  data,
  onCitationClick
}: {
  title?: string;
  data?: any;
  onCitationClick?: (cid: string) => void;
}) {
  const w = data || {};
  const wellId = w.id || w.asset_id || w.well_id || "W-001";
  const wellName = w.name || w.well_name || "Well 1";
  const location = w.location || w.area || "Pune";
  const levelOrDelta = w.current_level || (w.delta_temp_c ? `${w.delta_temp_c} °C` : "12.5 m");
  const lastChecked = w.last_checked || w.inspection_date || "2025-10-10";
  const nextMaintenance = w.next_maintenance || w.operational_reason || "2026-01-10";
  const percentage = w.health_pct || 75;
  const isGood = percentage >= 50;

  // Donut SVG arc math
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="bg-[#0b1726] border border-[#14293f] rounded-2xl p-4 shadow-xl flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/60 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">{title || `${wellName} Status`}</h3>
              <p className="text-[11px] text-slate-400">Single well status at a glance</p>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="bg-[#071322] border border-[#14293f] rounded-xl p-3.5 flex items-center justify-between">
          {/* Left Details */}
          <div className="space-y-3 flex-1 pr-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
                  <Droplet className="w-5 h-5 fill-emerald-400 text-emerald-400" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-base leading-tight">{wellName}</h4>
                  <span className="text-[11px] text-slate-400 font-medium">ID: {wellId}</span>
                </div>
              </div>
              <span className="px-3 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                Active
              </span>
            </div>

            <div className="space-y-1.5 pt-1 text-xs">
              <div className="flex items-start gap-2 text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-400 text-[11px] block">Location</span>
                  <span className="font-semibold text-slate-200">{location}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 text-slate-300">
                <Waves className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-400 text-[11px] block">Current Water Level</span>
                  <span className="font-semibold text-slate-200">{levelOrDelta}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 text-slate-300">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-400 text-[11px] block">Last Checked</span>
                  <span className="font-semibold text-slate-200">{lastChecked}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 text-slate-300">
                <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-400 text-[11px] block">Next Maintenance</span>
                  <span className="font-semibold text-slate-200">{nextMaintenance}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Radial Gauge */}
          <div className="border-l border-[#14293f] pl-4 flex flex-col items-center justify-center shrink-0">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                <circle
                  cx="40"
                  cy="40"
                  r={radius}
                  fill="transparent"
                  stroke="#14293f"
                  strokeWidth="8"
                />
                <circle
                  cx="40"
                  cy="40"
                  r={radius}
                  fill="transparent"
                  stroke={isGood ? "#10b981" : "#ef4444"}
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-lg font-bold text-white block leading-none">{percentage}%</span>
              </div>
            </div>
            <div className="text-center mt-1">
              <span className="text-[10px] text-slate-400 block">Health Status</span>
              <span className={`text-xs font-bold ${isGood ? "text-emerald-400" : "text-rose-400"}`}>
                {isGood ? "Good" : "Attention"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
