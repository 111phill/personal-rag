'use client';

import { ArrowRight, BookOpen, LoaderCircle, MessageCircle, Plus, Send, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AgentConversation, AgentMessage } from '@/db/agent-store';
import type { SourceReference } from '@/lib/agent-context';

type AgentState = { configured: boolean; configurationError: string; suggestions: string[] };

async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({ error: '服务暂不可用，请稍后重试' })) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || '请求失败，请重试');
  return data;
}

export function AssistantPanel({ open, onClose, onOpenSource }: {
  open: boolean;
  onClose: () => void;
  onOpenSource: (source: SourceReference) => Promise<void>;
}) {
  const [state, setState] = useState<AgentState | null>(null);
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshConversations = useCallback(async () => {
    const data = await responseJson<{ conversations: AgentConversation[] }>(await fetch('/api/agent/conversations', { cache: 'no-store' }));
    setConversations(data.conversations);
    return data.conversations;
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/agent', { cache: 'no-store' }).then(responseJson<AgentState>),
      fetch('/api/agent/conversations', { cache: 'no-store' }).then(responseJson<{ conversations: AgentConversation[] }>),
    ]).then(([agent, data]) => {
      if (cancelled) return;
      setState(agent);
      setConversations(data.conversations);
      setActiveId((current) => current ?? data.conversations[0]?.id ?? null);
      setError('');
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : '助手读取失败');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    fetch(`/api/agent/messages?conversationId=${encodeURIComponent(activeId)}`, { cache: 'no-store' })
      .then(responseJson<{ messages: AgentMessage[] }>)
      .then((data) => { if (!cancelled) { setMessages(data.messages); setError(''); } })
      .catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : '对话读取失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages, busy]);
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    panel.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (inputRef.current?.disabled) closeRef.current?.focus();
    else inputRef.current?.focus();
    return () => { document.body.style.overflow = previous; panel.close(); };
  }, [open]);

  async function newConversation() {
    if (busy) return;
    try {
      const data = await responseJson<{ conversation: AgentConversation }>(await fetch('/api/agent/conversations', { method: 'POST' }));
      setConversations((current) => [data.conversation, ...current]);
      setLoading(true);
      setActiveId(data.conversation.id);
      setMessages([]);
      setError('');
      inputRef.current?.focus();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '新建对话失败'); }
  }

  async function send(question = draft) {
    const content = question.trim();
    if (!content || busy || !state?.configured) return;
    if (content.length > 3000) { setError('问题不能超过 3000 字'); return; }
    setBusy(true);
    setError('');
    let newConversationId: string | null = null;
    try {
      let conversationId = activeId;
      if (!conversationId) {
        const data = await responseJson<{ conversation: AgentConversation }>(await fetch('/api/agent/conversations', { method: 'POST' }));
        conversationId = data.conversation.id;
        newConversationId = conversationId;
        setConversations((current) => [data.conversation, ...current]);
      }
      const data = await responseJson<{ messages: AgentMessage[] }>(await fetch('/api/agent/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, content }),
      }));
      setActiveId(conversationId);
      setMessages((current) => [...current, ...data.messages]);
      setDraft('');
      void refreshConversations().catch(() => {});
      inputRef.current?.focus();
    } catch (cause) {
      if (newConversationId) setActiveId(newConversationId);
      setError(cause instanceof Error ? cause.message : '回答失败，请重试');
      setDraft(content);
    } finally { setBusy(false); }
  }

  return <>
    <dialog ref={panelRef} className={`companion-panel agent-panel ${open ? 'is-open' : ''}`} aria-label="记录对话 Agent" closedby="any"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={() => { if (open) onClose(); }}>
      <div className="agent-panel-head">
        <div className="agent-identity"><span className="assistant-symbol"><Sparkles size={19} aria-hidden="true" /></span><div><strong>与你共想</strong><small>基于你的记录继续对话</small></div></div>
        <div className="agent-head-actions">
          <Button variant="ghost" size="icon" aria-label="开启新对话" title="开启新对话" onClick={() => void newConversation()} disabled={busy || !state?.configured}><Plus size={18} /></Button>
          <Button ref={closeRef} variant="ghost" size="icon" className="agent-close" aria-label="关闭助手" onClick={onClose}><X size={18} /></Button>
        </div>
      </div>
      <div className="agent-history-row"><MessageCircle size={14} aria-hidden="true" /><select aria-label="选择历史对话" value={activeId ?? ''} onChange={(event) => { setMessages([]); setLoading(Boolean(event.target.value)); setActiveId(event.target.value || null); }} disabled={busy}><option value="">新的对话</option>{conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}</select></div>
      <div className="agent-transcript" aria-live="polite" aria-busy={busy || loading}>
        {loading && <p className="agent-state"><LoaderCircle className="saving-spinner" size={16} /> 正在读取对话…</p>}
        {!loading && messages.length === 0 && <div className="agent-welcome"><Sparkles size={24} aria-hidden="true" /><h2>从你的记录出发</h2><p>可以聊近期目标、工作与学习，也可以问我从过去的想法里看到了什么。</p></div>}
        {!loading && messages.length === 0 && state && state.suggestions.length > 0 && <div className="agent-suggestions"><span>从这里开始</span>{state.suggestions.map((suggestion) => <button key={suggestion} disabled={!state.configured || busy} onClick={() => void send(suggestion)}>{suggestion}<ArrowRight size={13} aria-hidden="true" /></button>)}</div>}
        {messages.map((message) => <div className={`agent-message agent-message-${message.role}`} key={message.id}><span className="agent-message-role">{message.role === 'assistant' ? '与你共想' : '我'}</span><p>{message.content}</p>{message.sources.length > 0 && <div className="agent-sources"><span>依据的记录</span>{message.sources.map((source) => <button key={source.id} onClick={() => void onOpenSource(source)} title={`打开 ${source.title}`}><BookOpen size={12} aria-hidden="true" />【{source.number}】{source.title}</button>)}</div>}</div>)}
        {busy && <p className="agent-state"><LoaderCircle className="saving-spinner" size={16} /> 正在梳理相关记录…</p>}
        <div ref={bottomRef} />
      </div>
      <div className="agent-composer">
        {state && !state.configured && <p className="agent-config-note">{state.configurationError || '模型服务尚未配置。请在服务端设置 AGENT_API_BASE_URL、AGENT_MODEL 和 AGENT_API_KEY。'}</p>}
        {error && <p className="agent-error" role="alert">{error}</p>}
        <label htmlFor="agent-question">问问你的记录</label>
        <textarea ref={inputRef} id="agent-question" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} placeholder="最近我在努力推进什么？" rows={3} maxLength={3000} disabled={busy || !state?.configured} />
        <div className="agent-composer-bottom"><span>相关记录会发送至配置的模型服务 · Shift + Enter 换行</span><Button size="icon" aria-label="发送问题" disabled={!draft.trim() || busy || !state?.configured} onClick={() => void send()}>{busy ? <LoaderCircle className="saving-spinner" size={16} /> : <Send size={16} />}</Button></div>
      </div>
    </dialog>
  </>;
}
