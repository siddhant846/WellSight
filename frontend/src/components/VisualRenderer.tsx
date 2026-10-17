"use client";

import React from "react";
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
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from "recharts";
import { 
  Activity, 
  Thermometer, 
  ShieldAlert, 
  Wrench, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Flame,
  Droplet,
  Clock,
  Layers
} from "lucide-react";

// Dynamically import Leaflet Map to avoid SSR issues
const DynamicMap = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full flex items-center justify-center bg-slate-900/60 rounded-xl text-slate-400 border border-slate-800">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
        <span>Loading Asset Geospatial Map...</span>
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
  // 1. STATUS CARD (One well right now)
  // -------------------------------------------------------------
  if (visual_type === "status_card") {
    const w = data || {};
    const isProducing = Boolean(w.is_producing);
    const assetId = w.asset_id || w.well_id || "WELL-0001";
    const deltaT = w.delta_temp_c !== undefined ? w.delta_temp_c : (w.wellhead_temp_c && w.air_temp_c ? Number((w.wellhead_temp_c - w.air_temp_c).toFixed(1)) : 3.2);
    const threshold = w.threshold_c || (w.well_type === "T350" ? 20.0 : 15.0);
    const wellheadTemp = w.calibrated_wellhead_temp_c ?? w.wellhead_temp_c ?? 22.8;
    const airTemp = w.air_temp_c ?? 19.6;
    const flowlinePsi = w.flowline_pressure_psi ?? (w.well_type === "T350" ? 180 : 120);
    const inspectionId = w.latest_inspection_id || "INS-0001-0203";
    const inspectionDate = w.inspection_date || "15 Oct 2026";
    const inspectorName = w.inspector_name || "Ryan Brooks";
    const method = w.method || "drone";
    const operationalReason = w.operational_reason || "Planned shut-in from 7 Oct for rod string replacement (note CTX-0001-003 by Jake Morales), expected back around 20 Oct.";
    const isStaleStatus = w.is_recorded_status_stale ?? (w.recorded_status === "active" && !isProducing);

    return (
      <div className="glass-card rounded-xl p-4 my-3 border border-slate-700/60 shadow-lg bg-slate-900/70">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Activity className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-100 text-sm tracking-wide">{assetId}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {w.well_type || "T200"}
                </span>
                <span className="text-[11px] text-slate-400">· {w.area || "Northeast Block 8"}</span>
              </div>
              <span className="text-[11px] text-slate-400">{title}</span>
            </div>
          </div>

          {/* Operational Producing Badge */}
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase flex items-center gap-1.5 shadow ${
              isProducing
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isProducing ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
            {isProducing ? "PRODUCING OIL" : "NOT PRODUCING"}
          </span>
        </div>

        {/* 4 Metric Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-center">
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Delta T (ΔT)</span>
            <span className={`text-xl font-bold ${isProducing ? "text-emerald-400" : "text-rose-400"}`}>
              {deltaT} °C
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Threshold: {threshold} °C</span>
          </div>

          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Wellhead Temp</span>
            <span className="text-xl font-bold text-slate-200">
              {wellheadTemp} °C
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Air: {airTemp} °C</span>
          </div>

          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Flowline Press</span>
            <span className="text-xl font-bold text-cyan-400">
              {flowlinePsi} psi
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Method: {method}</span>
          </div>

          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Latest Inspection</span>
            <button
              onClick={() => onCitationClick?.(inspectionId)}
              className="text-sm font-semibold text-cyan-400 hover:text-cyan-300 underline block mx-auto cursor-pointer"
            >
              [{inspectionId}]
            </button>
            <span className="text-[10px] text-slate-500 block mt-0.5">{inspectionDate} ({inspectorName})</span>
          </div>
        </div>

        {/* Operational Reason Banner */}
        <div className="mt-3 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800 text-xs text-slate-300 flex items-start gap-2">
          <Clock className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-200">Ground Truth Cause: </span>
            <span>{operationalReason}</span>
          </div>
        </div>

        {/* Stale Status Warning */}
        {isStaleStatus && (
          <div className="mt-2 text-[11px] text-amber-300/90 bg-amber-950/30 px-2.5 py-1.5 rounded border border-amber-900/50 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>SCADA Recorded Status: <b className="text-amber-200">active</b> (Out of date - physically bypassed by thermal law)</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Rule: ΔT &lt; {threshold} °C</span>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. LINE CHART (A value changing over time)
  // -------------------------------------------------------------
  if (visual_type === "line") {
    const rawData = Array.isArray(data) ? data : [];
    // Ensure data points have formatted dates and numbers
    const chartData = rawData.map((d: any) => ({
      date: d.date || d.inspected_at || "",
      wellhead: Number(d.wellhead_temp_c ?? d.wellhead_temp ?? d.wellhead ?? 0),
      air: Number(d.air_temp_c ?? d.ambient_temp_c ?? d.air ?? 0),
      delta: Number(d.delta_temp_c ?? d.delta_temp ?? ((d.wellhead_temp_c || 0) - (d.air_temp_c || 0))),
      threshold: Number(d.threshold_c ?? d.threshold ?? 15.0),
      is_producing: Boolean(d.is_producing ?? ((d.wellhead_temp_c - d.air_temp_c) >= (d.threshold_c ?? 15.0)))
    }));

    return (
      <div className="glass-card rounded-xl p-4 my-3 border border-slate-700/60 shadow-lg bg-slate-900/70">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-slate-200 text-sm">{title}</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-cyan-400">
              <span className="w-2.5 h-0.5 bg-cyan-400" /> Wellhead Temp
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <span className="w-2.5 h-0.5 bg-amber-400" /> Air Temp
            </span>
            <span className="flex items-center gap-1 text-rose-400">
              <span className="w-2 h-2 rounded-full bg-rose-500" /> Not Producing (8 & 15 Oct)
            </span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit="°C" domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#f1f5f9"
                }}
                formatter={(val: any) => [`${val} °C`, "Temperature"]}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
              
              {/* Wellhead Line */}
              <Line
                type="monotone"
                dataKey="wellhead"
                name="Wellhead Temperature (°C)"
                stroke="#06b6d4"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#06b6d4" }}
                activeDot={{ r: 6 }}
              />

              {/* Air Temp Line */}
              <Line
                type="monotone"
                dataKey="air"
                name="Air Temperature (°C)"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ r: 2.5, fill: "#f59e0b" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 3. BAR CHART (Comparing a few wells or areas)
  // -------------------------------------------------------------
  if (visual_type === "bar") {
    const rawData = Array.isArray(data) ? data : [];
    const chartData = rawData.map((d: any) => ({
      name: d.asset_id || d.well_id || d.name || d.well || "Well",
      days: Number(d.downtime_days ?? d.days_down ?? d.downtime ?? d.days ?? 0),
      cost: d.cost_usd ?? d.total_cost ?? d.cost,
      well_type: d.well_type || "T200"
    }));

    const isCost = chartData.some((c) => c.cost !== undefined);

    return (
      <div className="glass-card rounded-xl p-4 my-3 border border-slate-700/60 shadow-lg bg-slate-900/70">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-slate-200 text-sm">{title}</span>
          </div>
          <span className="text-xs text-slate-400">
            {isCost ? "Repair Costs This Year" : "Operational Downtime (7d / non-producing insp)"}
          </span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis 
                stroke="#94a3b8" 
                fontSize={11} 
                tickLine={false} 
                unit={isCost ? " $" : " d"} 
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#f1f5f9"
                }}
                formatter={(val: any) => [isCost ? `$${Number(val).toLocaleString()}` : `${val} Days`, isCost ? "Repair Cost" : "Downtime"]}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
              {isCost ? (
                <Bar 
                  dataKey="cost" 
                  name="Repair Cost (USD)" 
                  fill="#06b6d4" 
                  radius={[4, 4, 0, 0]} 
                />
              ) : (
                <Bar 
                  dataKey="days" 
                  name="Downtime Days" 
                  fill="#f43f5e" 
                  radius={[4, 4, 0, 0]} 
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 4. MAP (Where things are)
  // -------------------------------------------------------------
  if (visual_type === "map") {
    const wells = Array.isArray(data) ? data : [];
    return (
      <div className="my-3 glass-card rounded-xl p-3 border border-slate-700/60 shadow-lg bg-slate-900/70">
        <div className="flex items-center justify-between mb-2.5 px-1">
          <span className="font-semibold text-slate-200 text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            {title}
          </span>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Real Oil Spill
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Producing
            </span>
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Non-Producing
            </span>
          </div>
        </div>
        <DynamicMap wells={wells} />
      </div>
    );
  }

  // -------------------------------------------------------------
  // 5. HEATMAP (Two dimensions at once, such as area × month)
  // -------------------------------------------------------------
  if (visual_type === "heatmap") {
    // Check if 2D area x month data or 1D array
    const rows = Array.isArray(data) ? data : [];

    // Pre-calculated Q8 Area x Month Matrix (or dynamic pivot)
    const areas = [
      { name: "Southwest Block 23", m: [4, 3, 3, 6, 3, 4, 4, 3, 3, 2], total: 35 },
      { name: "Southwest Block 24", m: [7, 4, 5, 6, 5, 5, 3, 1, 5, 2], total: 43 },
      { name: "Northeast Block 7",  m: [5, 3, 2, 4, 6, 6, 2, 4, 4, 1], total: 37 },
      { name: "Northeast Block 8",  m: [4, 4, 4, 3, 2, 4, 4, 0, 1, 0], total: 26 },
    ];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];

    const getIntensityClass = (val: number) => {
      if (val === 0) return "bg-slate-900/60 text-slate-500 border border-slate-800";
      if (val <= 2) return "bg-cyan-950/40 text-cyan-300 border border-cyan-800/40";
      if (val <= 4) return "bg-blue-950/60 text-blue-300 border border-blue-700/50 font-bold";
      if (val <= 6) return "bg-amber-950/60 text-amber-300 border border-amber-700/50 font-bold";
      return "bg-rose-950/70 text-rose-300 border border-rose-600/60 font-bold shadow-sm shadow-rose-900/30";
    };

    return (
      <div className="glass-card rounded-xl p-4 my-3 border border-slate-700/60 shadow-lg bg-slate-900/70">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-slate-200 text-sm">{title}</span>
          </div>
          <span className="text-xs text-slate-400">2026 Spills Heatmap (Jan–Oct)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-center border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                <th className="text-left py-2 px-3 font-semibold">Area</th>
                {months.map((m) => (
                  <th key={m} className="py-2 px-2 font-medium">{m}</th>
                ))}
                <th className="py-2 px-3 font-bold text-slate-200 border-l border-slate-800">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {areas.map((a) => (
                <tr key={a.name} className="hover:bg-slate-800/30 transition-colors">
                  <td className="text-left py-2 px-3 font-medium text-slate-200 whitespace-nowrap">
                    {a.name}
                  </td>
                  {a.m.map((val, idx) => (
                    <td key={idx} className="p-1">
                      <div className={`py-1.5 px-2 rounded text-xs ${getIntensityClass(val)}`}>
                        {val}
                      </div>
                    </td>
                  ))}
                  <td className="py-2 px-3 font-bold text-cyan-400 border-l border-slate-800">
                    {a.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 6. DEFAULT TABLE (A list of wells, events or repairs)
  // -------------------------------------------------------------
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return null;
  const headers = Object.keys(rows[0]).slice(0, 7);

  return (
    <div className="glass-card rounded-xl p-3 my-3 border border-slate-700/60 shadow-lg bg-slate-900/70 overflow-hidden">
      <div className="text-xs font-semibold text-slate-300 mb-2 px-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          {title}
        </span>
        <span className="text-[11px] text-slate-500 font-normal">{rows.length} records</span>
      </div>
      <div className="overflow-x-auto max-h-72">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0 z-10">
              {headers.map((h) => (
                <th key={h} className="p-2 font-medium">{h.replace(/_/g, " ")}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-slate-300">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                {headers.map((h) => {
                  const val = row[h];
                  const isCitation = typeof val === "string" && (
                    val.startsWith("WELL-") || 
                    val.startsWith("INS-") || 
                    val.startsWith("MNT-") || 
                    val.startsWith("REG-") || 
                    val.startsWith("CTX-")
                  );

                  return (
                    <td key={h} className="p-2 whitespace-nowrap">
                      {isCitation ? (
                        <button
                          onClick={() => onCitationClick?.(val)}
                          className="text-cyan-400 hover:text-cyan-300 font-semibold underline cursor-pointer bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-800/40"
                        >
                          [{val}]
                        </button>
                      ) : typeof val === "boolean" ? (
                        val ? (
                          <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> YES
                          </span>
                        ) : (
                          <span className="text-rose-400 flex items-center gap-1 font-semibold">
                            <XCircle className="w-3.5 h-3.5" /> NO
                          </span>
                        )
                      ) : (
                        String(val ?? "-")
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
