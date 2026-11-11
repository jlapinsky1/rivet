import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../lib/AuthProvider';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  chips?: string[];
};

const CONV_KEY = 'rivet_conv_id';
const AGENTS_URL = import.meta.env.VITE_AGENTS_URL ?? 'https://rivet-agents.onrender.com';

// Map server tool labels to friendly thinking strings
const TOOL_THINKING: Record<string, string> = {
  'Checking your pipeline': 'Checking your pipeline...',
  'Looking up job details': 'Looking up job details...',
  'Analyzing scope': 'Analyzing scope...',
  'Pricing materials': 'Pricing materials — this takes about 30 seconds...',
  'Re-running estimate': 'Re-running estimate...',
  'Sending estimate': 'Sending estimate...',
  'Emailing customer': 'Emailing customer...',
  'Accepting job': 'Accepting job...',
  'Declining job': 'Declining job...',
  'Updating price': 'Updating price...',
  'Saving note': 'Saving note...',
  'Searching for prices': 'Searching for prices...',
};

export function useAskRivet() {
  const { business } = useAuth();
  const businessId = business?.businessId ?? 'default';

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(
    () => localStorage.getItem(CONV_KEY),
  );

  // Abort controller so we can cancel an in-flight stream
  const abortRef = useRef<AbortController | null>(null);

  // Load conversation history from server on first mount if we have a saved id
  useEffect(() => {
    if (!conversationId || !businessId || businessId === 'default') return;
    fetch(`${AGENTS_URL}/conversation/${conversationId}?businessId=${encodeURIComponent(businessId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.messages?.length) {
          setMessages(data.messages as ChatMessage[]);
        }
      })
      .catch(() => {/* start fresh on error */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const newConversation = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    localStorage.removeItem(CONV_KEY);
    setIsStreaming(false);
    setThinkingLabel(null);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      // Append user message, then placeholder for assistant reply
      const userMsg: ChatMessage = { role: 'user', content: text };
      const assistantPlaceholder: ChatMessage = { role: 'assistant', content: '' };

      setMessages(prev => [...prev, userMsg, assistantPlaceholder]);
      setIsStreaming(true);
      setThinkingLabel(null);

      // Build the messages array to send (all previous + new user message)
      // We exclude the placeholder we just added
      const outgoing = [...messages, userMsg];

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`${AGENTS_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: outgoing,
            businessId,
            ...(conversationId ? { conversationId } : {}),
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Chat request failed: ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const eventBlock of events) {
            const lines = eventBlock.split('\n');
            let eventType = '';
            let data = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                data = line.slice(6);
              }
            }

            if (!eventType) continue;

            if (eventType === 'text') {
              setThinkingLabel(null);
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + data,
                  };
                }
                return updated;
              });
            } else if (eventType === 'tool') {
              setThinkingLabel(TOOL_THINKING[data] ?? `${data}...`);
            } else if (eventType === 'chips') {
              try {
                const chips: string[] = JSON.parse(data);
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === 'assistant') {
                    updated[updated.length - 1] = { ...last, chips };
                  }
                  return updated;
                });
              } catch {
                // Malformed chips JSON — ignore
              }
            } else if (eventType === 'id') {
              const convId = data.trim();
              setConversationId(convId);
              localStorage.setItem(CONV_KEY, convId);
            } else if (eventType === 'done') {
              // Finalize: strip the <chips> block from the visible content
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  const clean = stripChipsBlock(last.content);
                  updated[updated.length - 1] = { ...last, content: clean };
                }
                return updated;
              });
              setThinkingLabel(null);
            }
          }
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') {
          // User triggered newConversation — no error needed
        } else {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant' && last.content === '') {
              updated[updated.length - 1] = {
                ...last,
                content: 'Something went wrong. Try again.',
              };
            }
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
        setThinkingLabel(null);
      }
    },
    [messages, businessId, conversationId, isStreaming],
  );

  return {
    isOpen,
    open,
    close,
    messages,
    isStreaming,
    thinkingLabel,
    sendMessage,
    newConversation,
  };
}

/** Strip <chips>[...]</chips> and any incomplete leading <chips> from display text. */
function stripChipsBlock(text: string): string {
  // Remove complete chips blocks
  let clean = text.replace(/<chips>[\s\S]*?<\/chips>/g, '');
  // Remove incomplete chips block at end (no closing tag yet)
  clean = clean.replace(/<chips>[\s\S]*$/, '');
  return clean.trim();
}
