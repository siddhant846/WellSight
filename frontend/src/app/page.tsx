"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Sparkles,
  Layers,
  Database,
  User,
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
  Info
} from "lucide-react";
import VisualRenderer, { VisualSpec } from "@/components/VisualRenderer";
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
    user_id: "U-201",
    name: "Michael Turner",
    role: "Production Supervisor",
    department: "Northeast Production",
    default_area: "Northeast Block 8"
  },
  {
    user_id: "U-202",
    name: "Jessica Reed",
    role: "Field Inspector",
    department: "Northeast Production",
    default_area: "Northeast Block 7"
  },
  {
    user_id: "U-204",
    name: "Tyler Hughes",
    role: "Field Operator",
    department: "Northeast Production",
    default_area: "Northeast Block 8"
  },
  {
    user_id: "U-102",
    name: "Jake Morales",
    role: "Field Operator",
    department: "Southwest Production",
    default_area: "Southwest Block 23"
  },
  {
    user_id: "U-101",
    name: "Emily Carter",
    role: "Production Supervisor",
    department: "Southwest Production",
    default_area: "Southwest Block 23"
  },
  {
    user_id: "U-401",
    name: "Laura Simmons",
    role: "HSE Officer",
    department: "Health, Safety & Environment",
    default_area: "All Areas"
  }
];

const CATEGORIZED_PROMPTS = [
  {
    category: "Surveillance & Status (A1)",
    icon: Droplets,
    prompts: [
      { label: "Q1. WELL-0001 producing status card", query: "Is WELL-0001 producing oil right now? When was it last inspected, and by whom? Show me its status card." },
      { label: "Q2. Northeast Block 8 down wells", query: "Which wells in Northeast Block 8 are not producing oil right now, and why? Show them in a table." },
      { label: "Q3. WELL-0001 13-week line chart", query: "Show a line chart of WELL-0001's wellhead temperature against air temperature for the last 13 weeks, and mark when it was not producing oil." }
    ]
  },
  {
    category: "Downtime & Maintenance (A1)",
    icon: TrendingDown,
    prompts: [
      { label: "Q5. WELL-0001 downtime in 2025", query: "How many days was WELL-0001 down in 2025?" },
      { label: "Q6. Top downtime in NE Block 7", query: "Which 3 wells in Northeast Block 7 had the most downtime in the last 4 months? Show a bar chart." },
      { label: "Q14. Pump jack RCA candidates", query: "Which wells in Northeast Block 7 need a root-cause analysis on their pump jack?" }
    ]
  },
  {
    category: "Spills & Compliance (A1)",
    icon: AlertTriangle,
    prompts: [
      { label: "Q4. WELL-0001 4-year spills table", query: "How many oil spills has WELL-0001 had in the last 4 years, and how much oil in total? List them in a table." },
      { label: "Q7. NE Block 8 spills map", query: "Show on a map every well in Northeast Block 8 with a real spill in the last 90 days." },
      { label: "Q8. 2026 spills area heatmap", query: "Show a heatmap of 2026 spills by geographic area and month." },
      { label: "Q9. WELL-0001 rules broken", query: "Which rules has WELL-0001 broken in the last 12 months, and what is still open?" },
      { label: "Q10. SW Block 24 containment breaches", query: "In Southwest Block 24, which spills in the last 90 days were not contained within the SOP time limit?" }
    ]
  },
  {
    category: "Memory & Conflicts (A2 & B)",
    icon: Wrench,
    prompts: [
      { label: "Q11/Q16. Yesterday's wells repair cost", query: "For the three wells we discussed yesterday, what have repairs cost this year?" },
      { label: "Q12. Correct WELL-0164 temp (41.0°C)", query: "The 15 Oct reading for WELL-0164 is wrong. The handheld thermal gun used in that inspection was faulty; the field crew re-measured the wellhead at 41.0 °C." },
      { label: "Q13. Correct WELL-0151 spill (5.4 bbl)", query: "The AI estimated the 24 Sep spill at WELL-0151 as 4.5 bbl. The field crew measured 5.4 bbl." },
      { label: "Q14. Rule: T350 RCA after 2 repairs", query: "Note for all T350 wells: our team now wants a pump jack root-cause analysis after 2 repairs, not 3." },
      { label: "Q16. Planned downtime on WELL-0007?", query: "Is any downtime planned for WELL-0007?" },
      { label: "Q17. WELL-0175 running fine dispute", query: "WELL-0175 is running fine." },
      { label: "Q18. WELL-0101 spill real oil?", query: "Was the 20 Aug spill at WELL-0101 real oil?" }
    ]
  }
];

export default function Home() {
  const [users, setUsers] = useState<UserProfile[]>(DEFAULT_USERS);
  const [activeUser, setActiveUser] = useState<UserProfile>(DEFAULT_USERS[0]);
  const [userMemories, setUserMemories] = useState<any[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<string | null>(null);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [isReingesting, setIsReingesting] = useState(false);
  const [backendHealth, setBackendHealth] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load user profiles, health, & memories
  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/health")
      .then((res) => res.json())
      .then((data) => setBackendHealth(data))
      .catch(() => {});

    fetch("http://127.0.0.1:8000/api/users")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setUsers(data);
          setActiveUser(data[0]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeUser) return;
    fetch(`http://127.0.0.1:8000/api/users/${activeUser.user_id}/memory`)
      .then((res) => res.json())
      .then((data) => setUserMemories(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [activeUser]);

  // Initial welcome message tailored to active user
  useEffect(() => {
    setMessages([
      {
        id: "msg-welcome",
        sender: "copilot",
        text: `Welcome back, **${activeUser.name}**! I am your **WellSight** assistant.\n\nAll well performance, downtime, and compliance evaluations are grounded in **47,172 verified operational records** and executed strictly via deterministic code rules:\n- **Thermal Surveillance**: Producing status is calculated strictly from $\Delta T = T_{\\text{wellhead}} - T_{\\text{air}} \\ge \\text{Threshold}$. Stale SCADA database statuses are bypassed.\n- **Downtime Accounting**: Exactly $7 \\text{ days} \\times \\text{count of non-producing inspections}$. Repair duration never alters or subtracts from downtime.\n- **Environmental Spills**: $\\ge 5.0\\text{ bbl}$ must be reported within 24 hours. Approved corrections override original estimates.\n\nPick a quick question below or ask in plain English:`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        citations: ["[DOC-MAN-BP-001 § 2.4]", "[SOP-OPS-DOWNTIME-202 § 2.1]", "[SOP-ENV-SPILL-101 § 2.1]"]
      }
    ]);
  }, [activeUser.user_id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || loading) return;

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
      {/* Top Navbar */}
      <header className="h-16 px-4 sm:px-6 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-400 p-0.5 flex items-center justify-center shadow-lg shadow-cyan-950/50">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Droplets className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm tracking-wide text-slate-100 uppercase">WellSight</h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                47k Rows Indexed
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">Deterministic Well Surveillance & Regulatory Audit Engine</p>
          </div>
        </div>

        {/* Action Controls & User Picker */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowCorrectionModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-cyan-400 transition-colors shadow-sm"
            title="Manage Scoped Overlays"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Corrections</span>
          </button>

          <button
            onClick={handleReingest}
            disabled={isReingesting}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 transition-colors shadow-sm disabled:opacity-50"
            title="Re-runs DuckDB ingest from mapping.yaml"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isReingesting ? "animate-spin" : ""}`} />
            <span>Re-Ingest</span>
          </button>

          <button
            onClick={handleClearChat}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors"
            title="Clear Chat History"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* User Profile Selector */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <button
              onClick={() => setShowMemoryModal(true)}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-400 transition-colors relative"
              title="Private User Memory"
            >
              <Brain className="w-4 h-4 text-cyan-400" />
              {userMemories.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-cyan-400 rounded-full border-2 border-slate-950" />
              )}
            </button>

            <div className="flex items-center gap-2 bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-slate-800">
              <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs font-bold border border-cyan-500/30">
                {activeUser.name.charAt(0)}
              </div>
              <div className="text-left">
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

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Chat Thread */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Categorized Quick Question Chips */}
          <div className="px-4 sm:px-6 py-2 bg-slate-950/60 border-b border-slate-800/60 overflow-x-auto flex items-center gap-3 shrink-0 no-scrollbar">
            <span className="text-[10px] text-slate-400 uppercase font-bold shrink-0 tracking-wider flex items-center gap-1">
              <Zap className="w-3 h-3 text-cyan-400" /> Quick Questions:
            </span>
            {CATEGORIZED_PROMPTS.map((cat, ci) => (
              <div key={ci} className="flex items-center gap-1.5 shrink-0">
                {cat.prompts.map((p, pi) => (
                  <button
                    key={pi}
                    onClick={() => handleSendMessage(p.query)}
                    className="whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/40 transition-all flex items-center gap-1"
                  >
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-5 space-y-5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-4xl ${
                  msg.sender === "user" ? "ml-auto justify-end" : "mr-auto"
                }`}
              >
                {msg.sender === "copilot" && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-500 p-0.5 shrink-0 shadow-md">
                    <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                    </div>
                  </div>
                )}

                <div
                  className={`flex flex-col space-y-2 rounded-2xl p-4 text-sm max-w-2xl shadow-lg ${
                    msg.sender === "user"
                      ? "bg-cyan-600 text-white rounded-tr-none"
                      : "bg-slate-900/90 border border-slate-800 text-slate-200 rounded-tl-none backdrop-blur-md"
                  }`}
                >
                  {/* Sender Header */}
                  <div className="flex items-center justify-between text-xs text-slate-400 pb-1 border-b border-slate-700/40">
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
                    <div className="bg-amber-950/40 border border-amber-500/50 rounded-xl p-3 my-2 text-xs space-y-2 text-amber-200 animate-in fade-in shadow-inner">
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
                    <div className="space-y-3 pt-2">
                      {msg.visualSpecs.map((spec, sIdx) => (
                        <VisualRenderer
                          key={sIdx}
                          spec={spec}
                          onCitationClick={(id) => setSelectedCitation(id)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Clickable Grounded Citations Footer */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/60 mt-2">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1 flex items-center gap-1">
                        <Database className="w-3 h-3 text-cyan-400" /> Verified Record Citations (Click to inspect):
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.citations.map((c, ci) => (
                          <button
                            key={ci}
                            onClick={() => setSelectedCitation(c)}
                            className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-950/90 hover:bg-cyan-950/80 text-cyan-300 border border-slate-700/60 hover:border-cyan-400 transition-all flex items-center gap-1 shadow-sm"
                          >
                            <span>{c}</span>
                            <ChevronRight className="w-3 h-3 opacity-60" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {msg.sender === "user" && (
                  <div className="w-8 h-8 rounded-xl bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 shrink-0 flex items-center justify-center text-xs font-bold">
                    {activeUser.name.charAt(0)}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 mr-auto max-w-xl animate-pulse">
                <div className="w-8 h-8 rounded-xl bg-cyan-600/20 p-0.5 shrink-0 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-cyan-400 animate-spin" />
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-none p-4 text-xs text-slate-400 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.2s]" />
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.4s]" />
                  <span>Evaluating thermal differentials and querying 41k records in DuckDB warehouse...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-4 bg-slate-950/90 border-t border-slate-800/80 backdrop-blur-md">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="max-w-4xl mx-auto flex items-center gap-2 bg-slate-900/90 rounded-2xl border border-slate-700/80 p-1.5 focus-within:border-cyan-400 transition-all shadow-2xl"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask anything about well status, downtime, repairs, or spills... (Logged in as ${activeUser.name})`}
                className="flex-1 bg-transparent px-4 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="p-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition-all disabled:opacity-40 disabled:hover:bg-cyan-600 shadow flex items-center gap-1"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Citation Slide-out Inspector Drawer */}
        <CitationDrawer
          citationId={selectedCitation}
          onClose={() => setSelectedCitation(null)}
        />

        {/* Scoped Correction Overlay Modal */}
        <CorrectionModal
          isOpen={showCorrectionModal}
          onClose={() => setShowCorrectionModal(false)}
          currentUser={activeUser.name}
          onCorrectionAdded={() => {
            handleSendMessage("Show active corrections and explain their operational impact.");
          }}
        />

        {/* User Private Memory Modal */}
        {showMemoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-bold text-slate-100 text-sm">Private Memory ({activeUser.name})</h3>
                </div>
                <button
                  onClick={() => setShowMemoryModal(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  ✕
                </button>
              </div>

              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-cyan-400" />
                <span>Private user memories are isolated per user_id (<b>{activeUser.user_id}</b>).</span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {userMemories.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs">No private memories stored yet for this user.</div>
                ) : (
                  userMemories.map((m) => (
                    <div key={m.memory_id} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                      <div className="text-cyan-400 font-mono font-semibold">{m.memory_key}</div>
                      <div className="text-slate-200 mt-0.5">{m.memory_value}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
