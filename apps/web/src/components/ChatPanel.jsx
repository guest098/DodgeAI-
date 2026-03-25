import { useEffect, useRef, useState } from "react";

export function ChatPanel({ logoUrl, messages, onAsk, isAsking = false }) {
  const [value, setValue] = useState("");
  const listRef = useRef(null);
  const canSend = value.trim().length > 0 && !isAsking;

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSubmit(event) {
    event.preventDefault();
    const question = value.trim();
    if (!question) {
      return;
    }
    setValue("");
    await onAsk(question);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!canSend) {
        return;
      }
      handleSubmit(event);
    }
  }

  return (
    <div className="chat-shell">
      <div className="chat-header">
        <h2>Chat with Graph</h2>
        <p>Order to Cash</p>
      </div>
      <div className="message-list" ref={listRef}>
        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={`message-bubble ${message.role}`}>
            {message.role === "assistant" ? (
              <div className="assistant-header">
                <div className="assistant-avatar">
                  <img src={logoUrl} alt="" aria-hidden="true" className="assistant-logo" />
                </div>
                <div className="assistant-meta">
                  <div className="assistant-name">Dodge AI</div>
                  <div className="assistant-subtitle">Graph Agent</div>
                </div>
              </div>
            ) : (
              <div className="user-heading">
                <div className="message-role">You</div>
                <div className="user-avatar" />
              </div>
            )}
            <div className={`message-copy ${message.meta?.streaming ? "is-waiting" : ""}`}>
              {message.content || (message.meta?.streaming ? "Dodge AI is analyzing your request..." : "")}
            </div>
          </article>
        ))}
      </div>
      <div className="chat-footer">
        <div className="selected-panel">
          <div className="selected-hint">
            Dodge AI is awaiting instructions
          </div>
        </div>
        <form onSubmit={handleSubmit} className="composer">
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Analyze anything"
          />
          <button type="submit" disabled={!canSend} className={canSend ? "is-active" : ""}>
            {isAsking ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
