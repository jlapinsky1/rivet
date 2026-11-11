import { useEffect, useRef } from 'react';
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

  // Scroll to bottom as new content arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinkingLabel]);

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
  // Only show chips on the latest assistant message (last one in array)
  const lastMsgIndex = messages.length - 1;

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

        {/* Messages */}
        <div className="ask-rivet-messages">
          {isEmpty ? (
            <div className="ask-rivet-empty">
              <p className="ask-rivet-intro">
                Ask me what to work on, send estimates, or follow up with customers.
              </p>
              <div className="ask-rivet-chips">
                {INITIAL_CHIPS.map(chip => (
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
            </div>
          ) : (
            messages.map((msg, i) => {
              const isLast = i === lastMsgIndex;
              const showChips = isLast && msg.role === 'assistant' && msg.chips && msg.chips.length > 0 && !isStreaming;
              return (
                <div key={i} className={`ask-rivet-message ${msg.role}`}>
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
                  {showChips && (
                    <div className="ask-rivet-chips">
                      {msg.chips!.map(chip => (
                        <button
                          key={chip}
                          className="ask-rivet-chip"
                          onClick={() => onSend(chip)}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

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

/** Render message text with line breaks, stripping any chips block. */
function MessageText({ text }: { text: string }) {
  // Strip complete <chips>...</chips> blocks and any trailing incomplete one
  const display = text
    .replace(/<chips>[\s\S]*?<\/chips>/g, '')
    .replace(/<chips>[\s\S]*$/, '')
    .trim();

  if (!display) return null;
  return (
    <>
      {display.split('\n').map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line}
        </span>
      ))}
    </>
  );
}
