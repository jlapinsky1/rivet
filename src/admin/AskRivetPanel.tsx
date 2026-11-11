import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { ChatMessage } from './useAskRivet';

const INITIAL_CHIPS = [
  'What should I work on this week?',
  'Any estimates I need to send?',
  'Are there jobs waiting on customer info?',
  'Show me what\'s approved and ready to schedule',
];

type Props = {
  isOpen: boolean;
  messages: ChatMessage[];
  isStreaming: boolean;
  thinkingLabel: string | null;
  onSend: (text: string) => void;
  onClose: () => void;
  onNewConversation: () => void;
};

export function AskRivetPanel({
  isOpen,
  messages,
  isStreaming,
  thinkingLabel,
  onSend,
  onClose,
  onNewConversation,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUserMsgRef = useRef<HTMLDivElement | null>(null);
  const prevIsStreamingRef = useRef(false);

  // Scroll: during streaming → follow bottom; when done → jump to start of exchange
  useEffect(() => {
    const wasStreaming = prevIsStreamingRef.current;
    prevIsStreamingRef.current = isStreaming;

    if (isStreaming) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (wasStreaming) {
      // Stream just finished — jump back to show the user's message at the top
      lastUserMsgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [messages, isStreaming, thinkingLabel]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitInput();
    }
  }

  function submitInput() {
    const val = inputRef.current?.value.trim();
    if (!val || isStreaming) return;
    if (inputRef.current) inputRef.current.value = '';
    onSend(val);
  }

  const isEmpty = messages.length === 0;
  const lastMsgIndex = messages.length - 1;

  // Chips shown in the fixed tray below the messages area
  const trayChips = (() => {
    if (isEmpty) return INITIAL_CHIPS;
    if (isStreaming) return [];
    const last = messages[lastMsgIndex];
    if (last?.role === 'assistant' && last.chips?.length) return last.chips;
    return [];
  })();

  return (
    <>
      {/* Slide-in panel */}
      <div className={`ask-rivet-panel ${isOpen ? 'open' : ''}`} role="dialog" aria-label="Ask Rivet">
        {/* Header */}
        <div className="ask-rivet-header">
          <div className="ask-rivet-title-row">
            <span className="ask-rivet-star">✦</span>
            <span className="ask-rivet-title">Ask Rivet</span>
            <div className="ask-rivet-header-actions">
              {messages.length > 0 && (
                <button className="ask-rivet-new-btn" onClick={onNewConversation} disabled={isStreaming}>
                  New conversation
                </button>
              )}
              <button className="ask-rivet-close" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>
          </div>
          <p className="ask-rivet-subtitle">Your contractor assistant</p>
        </div>

        {/* Messages — scrollable area, no chips here */}
        <div className="ask-rivet-messages">
          {isEmpty ? (
            <div className="ask-rivet-empty">
              <p className="ask-rivet-intro">
                Ask me what to work on, send estimates, or follow up with customers.
              </p>
            </div>
          ) : (
            messages.map((msg, i) => {
              const isLast = i === lastMsgIndex;
              // Attach ref to the most recent user message so we can scroll to it
              const isLastUser = msg.role === 'user' &&
                messages.slice(i + 1).every(m => m.role !== 'user');
              return (
                <div
                  key={i}
                  ref={isLastUser ? lastUserMsgRef : null}
                  className={`ask-rivet-message ${msg.role}`}
                >
                  <div className="ask-rivet-bubble">
                    {msg.role === 'assistant' && isLast && isStreaming && thinkingLabel ? (
                      <>
                        {msg.content ? (
                          <MessageText text={msg.content} />
                        ) : (
                          <span className="ask-rivet-thinking">{thinkingLabel}</span>
                        )}
                      </>
                    ) : (
                      <MessageText text={msg.content} />
                    )}
                    {msg.role === 'assistant' && isLast && isStreaming && !thinkingLabel && (
                      <span className="ask-rivet-cursor" aria-hidden="true" />
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chip tray — fixed between messages and input, always visible */}
        {trayChips.length > 0 && (
          <div className="ask-rivet-chips-tray">
            {trayChips.map(chip => (
              <button
                key={chip}
                className="ask-rivet-chip"
                onClick={() => onSend(chip)}
                disabled={isStreaming}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="ask-rivet-input-row">
          <textarea
            ref={inputRef}
            className="ask-rivet-input"
            placeholder="Ask Rivet..."
            rows={1}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
          />
          <button
            className="ask-rivet-send"
            onClick={submitInput}
            disabled={isStreaming}
          >
            Send
          </button>
        </div>
        <p className="ask-rivet-footer">This chat is the Contractor Advisor.</p>
      </div>
    </>
  );
}

/**
 * Render assistant message text with markdown-lite formatting:
 * - **bold** → <strong>
 * - ---**Section header** → styled section label
 * - "N. **Title** | Customer | $Price | Status" → job tile card
 * - blank lines → vertical spacing
 * - strips <chips> blocks
 */
function MessageText({ text }: { text: string }) {
  const display = text
    .replace(/<chips>[\s\S]*?<\/chips>/g, '')
    .replace(/<chips>[\s\S]*$/, '')
    .trim();

  if (!display) return null;

  const lines = display.split('\n');
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      nodes.push(<div key={i} className="ar-gap" />);
      continue;
    }

    // Section header: "---**text**" or "---text"
    if (trimmed.startsWith('---')) {
      const headerText = trimmed.replace(/^-+\s*/, '');
      nodes.push(
        <div key={i} className="ar-section-header">
          {renderInline(headerText)}
        </div>,
      );
      continue;
    }

    // Numbered list item: "1. **Title** | Customer | $Price | Status"
    const listMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (listMatch) {
      const content = listMatch[2];
      const parts = content.split(' | ');
      const title = parts[0].replace(/\*\*/g, '').trim();
      const meta = parts.slice(1).join(' · ');
      nodes.push(
        <div key={i} className="ar-job-tile">
          <div className="ar-job-tile-title">{title}</div>
          {meta && <div className="ar-job-tile-meta">{meta}</div>}
        </div>,
      );
      continue;
    }

    // Regular text line with inline bold
    nodes.push(
      <div key={i} className="ar-text-line">{renderInline(trimmed)}</div>,
    );
  }

  return <div className="ar-msg">{nodes}</div>;
}

/** Split a string on **bold** markers and return mixed text/strong nodes. */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>,
      )}
    </>
  );
}
