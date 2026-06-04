"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Bot, User, Loader2, Sparkles } from "lucide-react";
import { API_URL } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

interface ChatApiMessage {
  role: string;
  content: string;
}

// ─── Quick-start suggestion chips ─────────────────────────────────────────────

const SUGGESTIONS = [
  "What is the ICD code for Amebiasis, unspecified?",
  "Which patients have inactive coverage?",
  "Does MRI of the spine require prior auth?",
  "Show me recent PA run outcomes",
];

// ─── Individual message bubble ────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${
          isUser ? "bg-blue-600" : "bg-gray-100 border border-gray-200"
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-white" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-blue-600" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? "bg-blue-600 text-white rounded-tr-sm"
            : msg.error
            ? "bg-red-50 border border-red-200 text-red-700 rounded-tl-sm"
            : "bg-gray-100 text-gray-800 rounded-tl-sm"
        }`}
      >
        {msg.content}
      </div>
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2">
      <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-gray-100 border border-gray-200">
        <Bot className="w-3.5 h-3.5 text-blue-600" />
      </div>
      <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" />
      </div>
    </div>
  );
}

// ─── ChatBot component ────────────────────────────────────────────────────────

export function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
      setHasUnread(false);
    }
  }, [open]);

  const addMessage = (role: "user" | "assistant", content: string, error = false): Message => {
    const msg: Message = { id: nextId.current++, role, content, error };
    setMessages((prev) => [...prev, msg]);
    return msg;
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");
    addMessage("user", trimmed);
    setLoading(true);

    const history: ChatApiMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      addMessage("assistant", data.reply ?? "No response received.");
    } catch (err: unknown) {
      addMessage(
        "assistant",
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
        true
      );
    } finally {
      setLoading(false);
      if (!open) setHasUnread(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleSuggestion = (text: string) => {
    sendMessage(text);
  };

  const clearChat = () => {
    setMessages([]);
    nextId.current = 1;
  };

  return (
    <>
      {/* ── Chat panel ── */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-[360px] h-[500px] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-600 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">PA Assistant</p>
                <p className="text-[10px] text-blue-100">Ask about codes, patients & runs</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="text-[10px] text-blue-100 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
                  title="Clear conversation"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center text-center pt-4 pb-2 gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">How can I help you?</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Ask about ICD-10 codes, patients, procedures, PA rules, or run history.
                  </p>
                </div>
                {/* Suggestion chips */}
                <div className="flex flex-col gap-1.5 w-full mt-1">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSuggestion(s)}
                      className="text-left text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-xl px-3 py-2 transition-colors leading-snug"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}

            {loading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-gray-100 shrink-0">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <input
                ref={inputRef}
                type="text"
                className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
                placeholder="Ask a question…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white transition-colors shrink-0"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-1.5">
              Powered by OpenRouter · answers from your reference data
            </p>
          </div>
        </div>
      )}

      {/* ── Floating toggle button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
          open
            ? "bg-gray-700 hover:bg-gray-800 rotate-0"
            : "bg-blue-600 hover:bg-blue-700 hover:scale-105"
        }`}
        title={open ? "Close assistant" : "Open PA Assistant"}
      >
        {open ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <>
            <MessageCircle className="w-6 h-6 text-white" />
            {hasUnread && (
              <span className="absolute top-1 right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
            )}
          </>
        )}
      </button>
    </>
  );
}
