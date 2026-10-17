"use client";

import React, { useEffect, useState } from "react";
import { X, ExternalLink, ShieldCheck, FileText, Database, Wrench, AlertTriangle } from "lucide-react";

interface CitationDrawerProps {
  citationId: string | null;
  onClose: () => void;
}

export default function CitationDrawer({ citationId, onClose }: CitationDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!citationId) {
      setData(null);
      return;
    }

    setLoading(true);
    const cleanId = citationId.replace(/[\[\]]/g, "").split(" ")[0].trim();

    fetch(`http://127.0.0.1:8000/api/citations/${encodeURIComponent(cleanId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Citation not found");
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        setData(null);
        setLoading(false);
      });
  }, [citationId]);

  if (!citationId) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-slate-950/95 border-l border-slate-700/80 shadow-2xl z-50 flex flex-col backdrop-blur-xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="font-semibold text-slate-100 text-sm">Citation Grounding Inspector</h3>
            <span className="text-xs text-cyan-400 font-mono font-bold tracking-wider">{citationId}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs font-sans">
        {loading ? (
          <div className="py-20 text-center text-slate-400 space-y-2">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Retrieving verified record from DuckDB warehouse...</p>
          </div>
        ) : !data ? (
          <div className="p-4 bg-slate-900 rounded-lg text-slate-400">
            No record details available for citation <b>{citationId}</b>.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[11px] text-emerald-400 bg-emerald-950/30 px-3 py-2 rounded-lg border border-emerald-800/40">
              <span className="flex items-center gap-1.5 font-semibold">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Grounded Database Evidence
              </span>
              <span className="text-slate-400">Read-Only View</span>
            </div>

            {/* Content Based on Citation Type */}
            {data.type === "well" && data.payload?.well && (
              <div className="space-y-3">
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-1.5">
                  <div className="text-slate-400 uppercase text-[10px] tracking-wider">Well Name</div>
                  <div className="text-base font-bold text-slate-100">{data.payload.well.well_name}</div>
                  <div className="text-slate-400">Type: <b className="text-slate-200">{data.payload.well.well_type}</b></div>
                  <div className="text-slate-400">Area: <b className="text-slate-200">{data.payload.well.area}</b></div>
                  <div className="text-slate-400">Coordinates: {data.payload.well.latitude}, {data.payload.well.longitude}</div>
                </div>

                {data.payload.status && (
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-1.5">
                    <div className="text-slate-400 uppercase text-[10px] tracking-wider">Current Thermal Assessment</div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300">Producing State:</span>
                      <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                        data.payload.status.is_producing ? "bg-emerald-900/60 text-emerald-400" : "bg-rose-900/60 text-rose-400"
                      }`}>
                        {data.payload.status.is_producing ? "PRODUCING" : "NOT PRODUCING"}
                      </span>
                    </div>
                    <div className="text-slate-400">Delta T: <b>{data.payload.status.delta_temp_c}°C</b> (Threshold: {data.payload.status.threshold_c}°C)</div>
                    <div className="text-slate-400">SCADA Status (Ignored): <span className="line-through">{data.payload.status.stale_recorded_status_ignored}</span></div>
                  </div>
                )}
              </div>
            )}

            {data.type === "inspection" && data.payload && (
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2">
                <div className="text-slate-400 uppercase text-[10px] tracking-wider">Inspection Details</div>
                <div className="grid grid-cols-2 gap-2 text-slate-300">
                  <div>Date: <b>{String(data.payload.inspected_at || data.payload.inspection_date || "").slice(0, 10)}</b></div>
                  <div>Inspector: <b>{data.payload.inspector_name || data.payload.technician || "Staff"}</b></div>
                  <div>Method: <b className="capitalize">{data.payload.method || "drone"}</b></div>
                  <div>Wellhead: <b>{data.payload.wellhead_temp_c ?? data.payload.calibrated_wellhead_temp_c ?? "N/A"}°C</b></div>
                  <div>Ambient Air: <b>{data.payload.ambient_temp_c ?? data.payload.air_temp_c ?? "N/A"}°C</b></div>
                  <div>Delta T: <b className="text-cyan-400">{data.payload.delta_temp_c}°C</b></div>
                  <div>Threshold: <b>{data.payload.temp_threshold}°C</b></div>
                  <div>Producing: <b className={data.payload.is_producing ? "text-emerald-400" : "text-rose-400"}>{data.payload.is_producing ? "YES" : "NO"}</b></div>
                </div>
                {data.payload.notes && (
                  <div className="mt-2 text-slate-400 bg-slate-950 p-2 rounded border border-slate-800">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Inspector Notes:</div>
                    <i>"{data.payload.notes}"</i>
                  </div>
                )}
              </div>
            )}

            {data.type === "spill" && data.payload && (
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2">
                <div className="text-slate-400 uppercase text-[10px] tracking-wider">Spill Record & Regulatory Status</div>
                <div className="space-y-1.5 text-slate-300">
                  <div>Incident Timestamp: <b>{String(data.payload.event_timestamp).slice(0, 19)}</b></div>
                  <div>Spill Type: <b>{data.payload.spill_type}</b></div>
                  <div>Effective Volume: <b className="text-amber-400">{data.payload.effective_volume_bbl} bbl</b> (Initial: {data.payload.uncorrected_volume_bbl} bbl)</div>
                  <div>Hours to Report: <b>{data.payload.hours_to_report ?? "N/A"} hours</b></div>
                  <div>Compliance Status: <b className="text-cyan-400">{data.payload.compliance_status}</b></div>
                  <div>Fine Amount: <b className="text-rose-400">${data.payload.calculated_fine_usd}</b></div>
                  {data.payload.is_corrected && (
                    <div className="mt-2 p-2 bg-amber-950/20 border border-amber-900/40 rounded text-amber-200">
                      <div>Correction Author: <b>{data.payload.corrected_by}</b></div>
                      <div>Reason: <i>{data.payload.correction_reason}</i></div>
                    </div>
                  )}
                  <div className="text-slate-400 mt-2">Description: {data.payload.description}</div>
                </div>
              </div>
            )}

            {data.type === "repair" && data.payload && (
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2">
                <div className="text-slate-400 uppercase text-[10px] tracking-wider">Workover & Repair Event</div>
                <div className="space-y-1.5 text-slate-300">
                  <div>Repair Type: <b className="text-slate-100">{data.payload.repair_type}</b></div>
                  <div>Well ID: <b>{data.payload.well_id || data.payload.asset_id}</b></div>
                  <div>Start Date: <b>{String(data.payload.started_at || data.payload.start_date || "").slice(0, 10)}</b></div>
                  <div>End Date: <b>{String(data.payload.completed_at || data.payload.end_date || "Ongoing").slice(0, 10)}</b></div>
                  <div>Cost: <b className="text-cyan-400">${Number(data.payload.cost_usd || 0).toLocaleString()} USD</b></div>
                  <div>Contractor: <b className="text-slate-200">{data.payload.contractor || "In-house"}</b></div>
                  {(data.payload.report_md || data.payload.free_text_report) && (
                    <div className="mt-2 text-slate-400 bg-slate-950 p-2 rounded border border-slate-800">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Field Narrative Report:</div>
                      <i className="whitespace-pre-wrap">{data.payload.report_md || data.payload.free_text_report}</i>
                    </div>
                  )}
                </div>
              </div>
            )}

            {data.type === "context" && data.payload && (
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2">
                <div className="text-slate-400 uppercase text-[10px] tracking-wider">Operational Context Note</div>
                <div className="space-y-1.5 text-slate-300">
                  <div>Note ID: <b className="text-cyan-400">{data.payload.note_id}</b></div>
                  <div>Well ID: <b>{data.payload.well_id || data.payload.asset_id}</b></div>
                  <div>Date: <b>{String(data.payload.created_at || data.payload.timestamp || "").slice(0, 10)}</b></div>
                  <div>Author: <b>{data.payload.author_user_id || data.payload.author || "Operator"}</b></div>
                  <div className="mt-2 text-slate-300 bg-slate-950 p-2.5 rounded border border-slate-800 text-[11px] leading-relaxed">
                    <i>"{data.payload.text || data.payload.note || data.payload.note_text}"</i>
                  </div>
                </div>
              </div>
            )}

            {data.type === "regulatory" && data.payload && (
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2">
                <div className="text-slate-400 uppercase text-[10px] tracking-wider">Regulatory Event Log</div>
                <div className="space-y-1.5 text-slate-300">
                  <div>Event ID: <b className="text-rose-400">{data.payload.event_id}</b></div>
                  <div>Well ID: <b>{data.payload.well_id}</b></div>
                  <div>Event Type: <b className="text-slate-100">{data.payload.event_type}</b></div>
                  <div>Date: <b>{String(data.payload.event_date).slice(0, 10)}</b></div>
                  <div>Fine Amount: <b className="text-rose-400">${Number(data.payload.fine_usd || 0).toLocaleString()} USD</b></div>
                  <div>Status: <b className="text-cyan-400">{data.payload.compliance_status || data.payload.status}</b></div>
                  {data.payload.description && (
                    <div className="mt-2 text-slate-300 bg-slate-950 p-2.5 rounded border border-slate-800 text-[11px]">
                      {data.payload.description}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Raw JSON viewer */}
            <details className="mt-4 text-[10px] text-slate-500 bg-slate-900/60 p-2 rounded border border-slate-800">
              <summary className="cursor-pointer hover:text-slate-400 font-mono">Raw Verified Record Payload</summary>
              <pre className="mt-2 overflow-x-auto text-slate-400 max-h-48">
                {JSON.stringify(data.payload, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
