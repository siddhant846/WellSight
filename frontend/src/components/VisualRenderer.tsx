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
  ResponsiveContainer
} from "recharts";
import { Activity, Thermometer, ShieldAlert, Wrench, CheckCircle2, XCircle } from "lucide-react";

// Dynamically import Leaflet Map to avoid SSR issues
const DynamicMap = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-full flex items-center justify-center bg-slate-900/60 rounded-xl text-slate-400">
      Loading Asset Map...
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

  // 1. STATUS CARD
  if (visual_type === "status_card") {
    const w = data || {};
    const isProducing = Boolean(w.is_producing);

    return (
      <div className="glass-card rounded-xl p-4 my-3 border border-slate-700/60 shadow-md">
        <div className="flex items-center justify-between border-b border-slate-700/50 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            <span className="font-semibold text-slate-100 text-sm tracking-wide">{title}</span>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold tracking-wider uppercase flex items-center gap-1.5 shadow ${
              isProducing
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isProducing ? "bg-emerald-400" : "bg-rose-400"}`} />
            {isProducing ? "PRODUCING" : "NOT PRODUCING"}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Delta T (ΔT)</span>
            <span className={`text-xl font-bold ${isProducing ? "text-emerald-400" : "text-rose-400"}`}>
              {w.delta_temp_c !== undefined ? `${w.delta_temp_c}°C` : "N/A"}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Threshold: {w.threshold_c}°C</span>
          </div>

          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Wellhead Temp</span>
            <span className="text-xl font-bold text-slate-200">
              {w.calibrated_wellhead_temp_c !== undefined ? `${w.calibrated_wellhead_temp_c}°C` : "N/A"}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Air Temp: {w.air_temp_c}°C</span>
          </div>

          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Flowline Press</span>
            <span className="text-xl font-bold text-cyan-400">
              {w.flowline_pressure_psi ? `${w.flowline_pressure_psi} psi` : "N/A"}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Well Type: {w.well_type}</span>
          </div>

          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Latest Inspection</span>
            <button
              onClick={() => onCitationClick?.(w.latest_inspection_id)}
              className="text-sm font-semibold text-cyan-400 hover:text-cyan-300 underline block mx-auto"
            >
              {w.latest_inspection_id || "N/A"}
            </button>
            <span className="text-[10px] text-slate-500 block mt-0.5">{w.inspection_date || "Recent"}</span>
          </div>
        </div>

        {w.stale_recorded_status_ignored && (
          <div className="mt-2.5 text-[11px] text-amber-300/80 bg-amber-950/20 px-2.5 py-1.5 rounded border border-amber-900/40 flex items-center justify-between">
            <span>SCADA Recorded Status: <b>{w.stale_recorded_status_ignored}</b> (Stale - Bypassed by thermal rule)</span>
            <span className="text-[10px] text-slate-400">Rule: ΔT ≥ Threshold</span>
          </div>
        )}
      </div>
    );
  }

  // 2. LINE CHART
  if (visual_type === "line") {
    const chartData = Array.isArray(data) ? data : [];
    return (
      <div className="glass-card rounded-xl p-4 my-3 border border-slate-700/60 shadow-md">
        <div className="flex items-center gap-2 border-b border-slate-700/50 pb-2 mb-3">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200 text-sm">{title}</span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit="°C" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#f1f5f9"
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
              <Line
                type="monotone"
                dataKey="delta_temp"
                name="Thermal Delta (ΔT)"
                stroke="#06b6d4"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#06b6d4" }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="step"
                dataKey="threshold"
                name="Operating Threshold"
                stroke="#f43f5e"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 3. BAR CHART
  if (visual_type === "bar") {
    const chartData = Array.isArray(data) ? data : [];
    return (
      <div className="glass-card rounded-xl p-4 my-3 border border-slate-700/60 shadow-md">
        <div className="flex items-center gap-2 border-b border-slate-700/50 pb-2 mb-3">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200 text-sm">{title}</span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#f1f5f9"
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
              {chartData[0]?.cost_usd !== undefined ? (
                <Bar dataKey="cost_usd" name="Expense ($ USD)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              ) : (
                <>
                  <Bar dataKey="downtime_days" name="Net Downtime (Days)" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="repair_deducted" name="Repair Excluded (Days)" fill="#10b981" radius={[4, 4, 0, 0]} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 4. MAP
  if (visual_type === "map") {
    const wells = Array.isArray(data) ? data : [];
    return (
      <div className="my-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-slate-200 text-sm flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            {title}
          </span>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Producing
            </span>
            <span className="flex items-center gap-1 text-rose-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Non-Producing
            </span>
          </div>
        </div>
        <DynamicMap wells={wells} />
      </div>
    );
  }

  // 5. HEATMAP / INSPECTION MATRIX
  if (visual_type === "heatmap") {
    const matrix = Array.isArray(data) ? data : [];
    return (
      <div className="glass-card rounded-xl p-4 my-3 border border-slate-700/60 shadow-md">
        <div className="flex items-center justify-between border-b border-slate-700/50 pb-2 mb-3">
          <span className="font-semibold text-slate-200 text-sm">{title}</span>
          <span className="text-xs text-slate-400">Weekly Inspection Thermal Matrix</span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[480px] grid grid-cols-12 gap-1 text-center text-xs">
            {matrix.map((item: any, idx: number) => {
              const isProd = item.is_producing ?? true;
              return (
                <div
                  key={idx}
                  title={`${item.well_id || "Well"} (${item.date || "Week"}): ${isProd ? "PRODUCING" : "NOT PRODUCING"}`}
                  className={`p-1.5 rounded transition-all cursor-pointer ${
                    isProd
                      ? "bg-emerald-950/60 border border-emerald-700/40 text-emerald-300 hover:bg-emerald-900/80"
                      : "bg-rose-950/60 border border-rose-700/40 text-rose-300 hover:bg-rose-900/80"
                  }`}
                >
                  <div className="text-[10px] opacity-75">{item.week_label || `W${idx + 1}`}</div>
                  <div className="font-bold text-[11px]">{isProd ? "OK" : "DOWN"}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 6. DEFAULT TABLE
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return null;
  const headers = Object.keys(rows[0]).slice(0, 6);

  return (
    <div className="glass-card rounded-xl p-3 my-3 border border-slate-700/60 shadow-md overflow-hidden">
      <div className="text-xs font-semibold text-slate-300 mb-2 px-1 flex items-center justify-between">
        <span>{title}</span>
        <span className="text-[11px] text-slate-500 font-normal">{rows.length} records</span>
      </div>
      <div className="overflow-x-auto max-h-64">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/60 text-slate-400 uppercase text-[10px] tracking-wider">
              {headers.map((h) => (
                <th key={h} className="p-2 font-medium">{h.replace(/_/g, " ")}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                {headers.map((h) => {
                  const val = row[h];
                  const isId = typeof val === "string" && (val.startsWith("W-") || val.startsWith("INSP-") || val.startsWith("REP-") || val.startsWith("EVT-"));
                  return (
                    <td key={h} className="p-2 whitespace-nowrap">
                      {isId ? (
                        <button
                          onClick={() => onCitationClick?.(val)}
                          className="text-cyan-400 hover:text-cyan-300 font-semibold underline"
                        >
                          {val}
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
