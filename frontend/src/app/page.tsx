"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Sparkles,
  Layers,
  Database,
  RefreshCw,
  AlertTriangle,
  FileText,
  MapPin,
  TrendingDown,
  Wrench,
  Droplets,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Brain,
  Trash2,
  CheckCircle2,
  Zap,
  Info,
  Code2,
  LayoutGrid,
  MessageSquare
} from "lucide-react";
import VisualRenderer, {
  VisualSpec,
  OverviewTableCard,
  LineChartCard,
  BarChartCard,
  MapCard,
  HeatmapCard,
  StatusCard
} from "@/components/VisualRenderer";
import CitationDrawer from "@/components/CitationDrawer";
import CorrectionModal from "@/components/CorrectionModal";

interface ChatMessage {
  id: string;
  sender: "user" | "copilot";
  text: string;
  timestamp: string;
  citations?: string[];
  conflicts?: any[];
  visualSpecs?: VisualSpec[];
  toolsCalled?: string[];
}

interface UserProfile {
  user_id: string;
  name: string;
  role: string;
  department: string;
  default_area: string;
}

const DEFAULT_USERS: UserProfile[] = [
  {
    user_id: "U-101",
    name: "Emily Carter",
    role: "production_supervisor",
    department: "Southwest Production",
    default_area: "Southwest Block 23"
  },
  {
    user_id: "U-201",
    name: "Michael Turner",
    role: "production_supervisor",
    department: "Northeast Production",
    default_area: "Northeast Block 8"
  },
  {
    user_id: "U-202",
    name: "Jessica Reed",
    role: "field_inspector",
    department: "Northeast Production",
    default_area: "Northeast Block 7"
  },
  {
    user_id: "U-204",
    name: "Tyler Hughes",
    role: "field_operator",
    department: "Northeast Production",
    default_area: "Northeast Block 8"
  },
  {
    user_id: "U-102",
    name: "Jake Morales",
    role: "field_operator",
    department: "Southwest Production",
    default_area: "Southwest Block 23"
  },
  {
    user_id: "U-401",
    name: "Laura Simmons",
    role: "hse_officer",
    department: "Health, Safety & Environment",
    default_area: "All Areas"
  }
];

const QUICK_QUESTIONS = [
  {
    label: "Q1. WELL-0001 producing status card",
    query: "Is WELL-0001 producing oil right now? When was it last inspected, and by whom? Show me its status card."
  },
  {
    label: "Q2. Northeast Block 8 down wells",
    query: "Which wells in Northeast Block 8 are not producing oil right now, and why? Show them in a table."
  },
  {
    label: "Q3. WELL-0001 13-week line chart",
    query: "Show a line chart of WELL-0001's wellhead temperature against air temperature for the last 13 weeks, and mark when it was not producing oil."
  },
  {
    label: "Q5. WELL-0001 downtime in 2025",
    query: "How many days was WELL-0001 down in 2025?"
  },
  {
    label: "Q6. Top downtime in NE Block 7",
    query: "Which 3 wells in Northeast Block 7 had the most downtime in the last 4 months? Show a bar chart."
  },
  {
    label: "Q14. Pump jack RCA candidates",
    query: "Which wells in Northeast Block 7 need a root-cause analysis on their pump jack?"
  },
  {
    label: "Q4. WELL-0001 4-year spills",
    query: "How many oil spills has WELL-0001 had in the last 4 years, and how much oil in total? List them in a table."
  }
];

export default function Home() {
  const [users, setUsers] = useState<UserProfile[]>(DEFAULT_USERS);
  const [activeUser, setActiveUser] = useState<UserProfile>(DEFAULT_USERS[0]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<string | null>(null);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [isReingesting, setIsReingesting] = useState(false);
  const [viewMode, setViewMode] = useState<"dashboard" | "chat">("dashboard");
  const [activeCardData, setActiveCardData] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/users")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setUsers(data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || loading) return;

    // Switch to chat view when a query is asked
    setViewMode("chat");

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          user_id: activeUser.user_id
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();

      const copilotMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "copilot",
        text: data.response || "No response received.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        citations: data.citations || [],
        conflicts: data.conflicts || [],
        visualSpecs: data.visual_specs || [],
        toolsCalled: data.tools_called || []
      };

      setMessages((prev) => [...prev, copilotMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-err-${Date.now()}`,
          sender: "copilot",
          text: `⚠️ **Communication Error:** Could not contact backend: ${err.message}. Please verify the FastAPI server is running on port 8000.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleReingest = async () => {
    setIsReingesting(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/reingest", { method: "POST" });
      const data = await res.json();
      alert(`Success: ${data.message}`);
    } catch (e: any) {
      alert(`Re-ingest failed: ${e.message}`);
    } finally {
      setIsReingesting(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden text-slate-100 bg-[#070b14]">
      {/* ------------------------------------------------------------- */}
      {/* TOP NAVBAR (Exact match to reference image) */}
      {/* ------------------------------------------------------------- */}
      <header className="h-16 px-4 sm:px-6 border-b border-[#14293f] bg-[#07101d] flex items-center justify-between shrink-0 z-20">
        {/* Brand Left */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center shadow-lg shadow-cyan-950/60">
            <Droplets className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-extrabold text-sm tracking-wider text-white uppercase font-sans">
                WELLSIGHT
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/40">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                47k Rows Indexed
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Deterministic Well Surveillance & Regulatory Audit Engine
            </p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-[#0b1726] p-0.5 rounded-xl border border-[#1b3552]">
            <button
              onClick={() => setViewMode("dashboard")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "dashboard"
                  ? "bg-cyan-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Dashboard Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Dashboard</span>
            </button>
            <button
              onClick={() => setViewMode("chat")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "chat"
                  ? "bg-cyan-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="AI Copilot Chat"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Copilot AI</span>
              {messages.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-cyan-400 text-slate-950 text-[10px] font-bold flex items-center justify-center">
                  {messages.length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => setShowCorrectionModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#0b1726] hover:bg-[#14293f] border border-[#1b3552] text-slate-300 hover:text-cyan-400 transition-colors shadow-sm"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Corrections</span>
          </button>

          <button
            onClick={handleReingest}
            disabled={isReingesting}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#0b1726] hover:bg-[#14293f] border border-[#1b3552] text-slate-300 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isReingesting ? "animate-spin" : ""}`} />
            <span>Re-Ingest</span>
          </button>

          <button
            onClick={handleClearChat}
            className="p-2 rounded-xl text-slate-400 hover:text-rose-400 bg-[#0b1726] hover:bg-[#14293f] border border-[#1b3552] transition-colors"
            title="Clear Chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => alert("WellSight Deterministic Analytical Engine: Online (DuckDB + Gemini Function Calling)")}
            className="p-2 rounded-xl text-slate-400 hover:text-cyan-400 bg-[#0b1726] hover:bg-[#14293f] border border-[#1b3552] transition-colors"
            title="Engine Specs"
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>

          {/* User Profile Pill */}
          <div className="flex items-center gap-2 pl-2 border-l border-[#14293f]">
            <div className="flex items-center gap-2 bg-[#0b1726] px-3 py-1.5 rounded-xl border border-[#1b3552]">
              <div className="w-6 h-6 rounded-full bg-cyan-600/30 text-cyan-300 flex items-center justify-center text-xs font-bold border border-cyan-500/30">
                {activeUser.name.charAt(0)}
              </div>
              <div className="text-left hidden sm:block">
                <select
                  value={activeUser.user_id}
                  onChange={(e) => {
                    const found = users.find((u) => u.user_id === e.target.value);
                    if (found) setActiveUser(found);
                  }}
                  className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
                >
                  {users.map((u) => (
                    <option key={u.user_id} value={u.user_id} className="bg-slate-900 text-slate-200">
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
                <div className="text-[10px] text-slate-400 leading-none">{activeUser.department}</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* QUICK QUESTIONS STRIP (Exact match to reference image) */}
      {/* ------------------------------------------------------------- */}
      <div className="px-4 sm:px-6 py-2.5 bg-[#050b14] border-b border-[#14293f] overflow-x-auto flex items-center gap-2.5 shrink-0 no-scrollbar z-10">
        <span className="text-[11px] text-cyan-400 uppercase font-extrabold shrink-0 tracking-wider flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400" /> QUICK QUESTIONS:
        </span>
        {QUICK_QUESTIONS.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(q.query)}
            className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium bg-[#0b1726] hover:bg-[#14293f] text-slate-200 hover:text-cyan-300 border border-[#1b3552] hover:border-cyan-500/50 transition-all flex items-center gap-1 shrink-0 cursor-pointer shadow-sm"
          >
            <span>{q.label}</span>
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MAIN CONTENT AREA */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* VIEW 1: 6-CARD DASHBOARD GRID (Exact match to screenshot!) */}
        {viewMode === "dashboard" ? (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#040811]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-[1700px] mx-auto pb-20">
              {/* Row 1 */}
              <div className="h-[360px]">
                <OverviewTableCard
                  onCitationClick={(cid) => setSelectedCitation(cid)}
                />
              </div>

              <div className="h-[360px]">
                <LineChartCard />
              </div>

              <div className="h-[360px]">
                <BarChartCard />
              </div>

              {/* Row 2 */}
              <div className="h-[360px]">
                <MapCard />
              </div>

              <div className="h-[360px]">
                <HeatmapCard />
              </div>

              <div className="h-[360px]">
                <StatusCard
                  onCitationClick={(cid) => setSelectedCitation(cid)}
                />
              </div>
            </div>
          </div>
        ) : (
          /* VIEW 2: AI COPILOT CHAT THREAD WITH INLINE VISUAL CARDS */
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-5 space-y-5 bg-[#040811]">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 max-w-md mx-auto my-auto">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-600 to-emerald-500 p-0.5 mb-4 shadow-xl shadow-cyan-950/50">
                  <div className="w-full h-full bg-[#071322] rounded-[14px] flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-cyan-400" />
                  </div>
                </div>
                <h3 className="font-bold text-white text-base mb-1">WellSight Intelligence Copilot</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Ask any question about wells, downtime, or spills. Answers are generated with exact evidence citations and interactive visual cards.
                </p>
                <div className="space-y-2 w-full text-left">
                  {QUICK_QUESTIONS.slice(0, 3).map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(q.query)}
                      className="w-full p-2.5 rounded-xl bg-[#0b1726] hover:bg-[#14293f] border border-[#1b3552] text-xs text-slate-300 hover:text-cyan-300 transition-all flex items-center justify-between"
                    >
                      <span>{q.label}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-5xl ${
                    msg.sender === "user" ? "ml-auto justify-end" : "mr-auto"
                  }`}
                >
                  {msg.sender === "copilot" && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-500 p-0.5 shrink-0 shadow-md">
                      <div className="w-full h-full bg-[#071322] rounded-[10px] flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                      </div>
                    </div>
                  )}

                  <div
                    className={`flex flex-col space-y-2 rounded-2xl p-4 text-sm max-w-3xl shadow-xl ${
                      msg.sender === "user"
                        ? "bg-cyan-600 text-white rounded-tr-none"
                        : "bg-[#0b1726] border border-[#14293f] text-slate-200 rounded-tl-none backdrop-blur-md"
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between text-xs text-slate-400 pb-1 border-b border-[#14293f]">
                      <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                        {msg.sender === "user" ? activeUser.name : "WellSight"}
                        {msg.sender === "copilot" && (
                          <span className="text-[10px] text-cyan-400 font-mono font-normal">Grounded</span>
                        )}
                      </span>
                      <span className="text-[10px] opacity-75">{msg.timestamp}</span>
                    </div>

                    {/* Conflict Notice Banner */}
                    {msg.conflicts && msg.conflicts.length > 0 && (
                      <div className="bg-amber-950/40 border border-amber-500/50 rounded-xl p-3 my-2 text-xs space-y-2 text-amber-200 shadow-inner">
                        <div className="flex items-center gap-2 font-bold text-amber-400 text-xs uppercase tracking-wide">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <span>Conflicting Evidence & Dispute Detected</span>
                        </div>
                        {msg.conflicts.map((c, ci) => (
                          <div key={ci} className="space-y-1 bg-amber-950/40 p-2 rounded border border-amber-900/50">
                            <div className="font-semibold text-slate-100">{c.topic}</div>
                            <div className="text-slate-300 text-[11px]"><b className="text-amber-400">Perspective A:</b> {c.perspective_a}</div>
                            <div className="text-slate-300 text-[11px]"><b className="text-amber-400">Perspective B:</b> {c.perspective_b}</div>
                            <div className="text-emerald-300 text-[11px] font-semibold mt-1 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Grounded Ground Truth: {c.resolution}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Message Text */}
                    <div className="whitespace-pre-line leading-relaxed font-sans text-xs sm:text-sm">
                      {msg.text}
                    </div>

                    {/* Inline Visual Specs (Cards, Line, Bar, Map, Heatmap, Table) */}
                    {msg.visualSpecs && msg.visualSpecs.length > 0 && (
                      <div className="space-y-4 pt-2">
                        {msg.visualSpecs.map((spec, sIdx) => (
                          <div key={sIdx} className="w-full">
                            <VisualRenderer
                              spec={spec}
                              onCitationClick={(cid) => setSelectedCitation(cid)}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Citations Footer */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="pt-2 border-t border-[#14293f] flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-semibold mr-1">Evidence Citations:</span>
                        {msg.citations.map((c, cIdx) => (
                          <button
                            key={cIdx}
                            onClick={() => setSelectedCitation(c.replace(/[\[\]]/g, ""))}
                            className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#071322] hover:bg-cyan-950 text-cyan-300 hover:text-cyan-200 border border-[#1b3552] hover:border-cyan-500/50 transition-colors cursor-pointer"
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* FIXED FLOATING INPUT BAR */}
        {/* ------------------------------------------------------------- */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-[#07101d]/90 backdrop-blur-md border-t border-[#14293f] z-20">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="max-w-4xl mx-auto flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask WellSight Copilot anything about wells, downtime, or compliance..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-[#0b1726] border border-[#1b3552] rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500 transition-colors shadow-inner"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs sm:text-sm flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-cyan-950"
            >
              <span>{loading ? "Analyzing..." : "Ask"}</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* Citation Slide-Over Drawer */}
      <CitationDrawer
        citationId={selectedCitation}
        onClose={() => setSelectedCitation(null)}
      />

      {/* Scoped Correction Overlays Modal */}
      {showCorrectionModal && (
        <CorrectionModal
          isOpen={showCorrectionModal}
          currentUser={activeUser.user_id}
          onClose={() => setShowCorrectionModal(false)}
        />
      )}
    </div>
  );
}
