"use client";

import React, { useState, useEffect } from "react";
import { X, Plus, Layers, CheckCircle2, AlertCircle } from "lucide-react";

interface CorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: string;
  onCorrectionAdded?: () => void;
}

export default function CorrectionModal({
  isOpen,
  onClose,
  currentUser,
  onCorrectionAdded
}: CorrectionModalProps) {
  const [corrections, setCorrections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  // Form state
  const [scope, setScope] = useState("well");
  const [target, setTarget] = useState("W-102");
  const [field, setField] = useState("temp_offset");
  const [originalValue, setOriginalValue] = useState("0.0");
  const [newValue, setNewValue] = useState("-5.0");
  const [reason, setReason] = useState("Calibrated thermal gun confirmed RTD sensor reads +5C too high");

  const fetchCorrections = () => {
    setLoading(true);
    fetch("http://127.0.0.1:8000/api/corrections")
      .then((res) => res.json())
      .then((json) => {
        setCorrections(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      fetchCorrections();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          target,
          field,
          original_value: originalValue,
          new_value: newValue,
          author: currentUser,
          reason
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to create correction");
      }

      setMsg({ text: "Correction successfully appended! Views and calculations updated." });
      fetchCorrections();
      onCorrectionAdded?.();
    } catch (err: any) {
      setMsg({ text: err.message, error: true });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-base font-bold text-slate-100">Append-Only Correction Overlays</h2>
              <span className="text-xs text-slate-400">Scoped Precedence: Well &gt; Type &gt; All</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
          {msg && (
            <div
              className={`p-3 rounded-lg border flex items-center gap-2 ${
                msg.error
                  ? "bg-rose-950/30 border-rose-800/40 text-rose-300"
                  : "bg-emerald-950/30 border-emerald-800/40 text-emerald-300"
              }`}
            >
              {msg.error ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{msg.text}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-3">
            <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-cyan-400" /> Append New Operational Correction
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Scope</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 text-xs focus:ring-1 focus:ring-cyan-400"
                >
                  <option value="well">well (Specific Asset)</option>
                  <option value="type">type (Well Type)</option>
                  <option value="all">all (Fleet-wide)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Target (ID or Type)</label>
                <input
                  type="text"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="e.g. W-102, Beam Pump, EVT-SPILL-03"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 text-xs focus:ring-1 focus:ring-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Field</label>
                <input
                  type="text"
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                  placeholder="temp_offset, initial_volume_bbl, temp_threshold"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 text-xs focus:ring-1 focus:ring-cyan-400"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Original Value</label>
                <input
                  type="text"
                  value={originalValue}
                  onChange={(e) => setOriginalValue(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 text-xs focus:ring-1 focus:ring-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">New Value</label>
                <input
                  type="text"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 text-xs focus:ring-1 focus:ring-cyan-400"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Engineering Rationale / Reason</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Reason and validation source..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 text-xs focus:ring-1 focus:ring-cyan-400"
                required
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg text-xs transition-colors shadow flex items-center gap-1.5 disabled:opacity-50"
              >
                {submitting ? "Applying..." : "Apply Scoped Correction"}
              </button>
            </div>
          </form>

          {/* Active List */}
          <div>
            <h4 className="font-semibold text-slate-200 text-xs mb-2">Active Corrections in Database</h4>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {loading ? (
                <div className="text-slate-500 py-4 text-center">Loading corrections...</div>
              ) : corrections.length === 0 ? (
                <div className="text-slate-500 py-4 text-center">No corrections logged yet.</div>
              ) : (
                corrections.map((c) => (
                  <div
                    key={c.correction_id}
                    className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1 text-slate-300"
                  >
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-cyan-400 font-bold">[{c.correction_id}] Scope: {c.scope} ({c.target})</span>
                      <span className="text-slate-500">{String(c.timestamp).slice(0, 16)}</span>
                    </div>
                    <div className="text-xs">
                      Field: <b>{c.field}</b> | <s>{c.original_value}</s> &rarr; <b className="text-emerald-400">{c.new_value}</b>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Author: <b>{c.author}</b> | Reason: <i>{c.reason}</i>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
