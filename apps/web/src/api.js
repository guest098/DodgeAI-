export async function fetchSeedGraph() {
  const response = await fetch("/api/graph/seed");
  return response.json();
}

export async function fetchGraphStats() {
  const response = await fetch("/api/graph/stats");
  return response.json();
}

export async function fetchNeighbors(nodeId) {
  const response = await fetch(`/api/graph/neighbors/${encodeURIComponent(nodeId)}`);
  return response.json();
}

export async function traceBillingPath(billingDocument) {
  const response = await fetch(`/api/graph/trace/billing/${encodeURIComponent(billingDocument)}`);
  return response.json();
}

export async function askQuestion(question, sessionId) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question, sessionId }),
  });
  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    return {
      error:
        payload.error ||
        raw ||
        `Request failed with status ${response.status}`,
    };
  }

  return payload;
}

export function askQuestionStream({
  question,
  sessionId,
  onReady,
  onToken,
  onDone,
  onError,
}) {
  const params = new URLSearchParams({ question });
  if (sessionId) {
    params.set("sessionId", sessionId);
  }

  const source = new EventSource(`/api/chat/stream?${params.toString()}`);
  let closedIntentionally = false;

  function closeSource() {
    closedIntentionally = true;
    source.close();
  }

  source.addEventListener("ready", (event) => {
    try {
      onReady?.(JSON.parse(event.data));
    } catch (error) {
      onError?.(error);
    }
  });

  source.addEventListener("token", (event) => {
    try {
      const payload = JSON.parse(event.data);
      onToken?.(payload.token || "");
    } catch (error) {
      onError?.(error);
    }
  });

  source.addEventListener("done", (event) => {
    try {
      const payload = JSON.parse(event.data);
      onDone?.(payload.answer || "");
    } finally {
      closeSource();
    }
  });

  source.addEventListener("server-error", (event) => {
    try {
      const payload = JSON.parse(event.data);
      onError?.(payload.error || "Streaming request failed");
    } finally {
      closeSource();
    }
  });

  source.onerror = () => {
    if (closedIntentionally) {
      return;
    }
    closeSource();
    onError?.("Connection to the assistant was interrupted.");
  };

  return () => closeSource();
}
