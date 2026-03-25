import { domainRejection } from "./domainGuard.js";
import {
  appendMessage,
  createSession,
  ensureSession,
  getConversationHistory,
} from "./conversationService.js";
import { semanticSearch } from "./semanticSearchService.js";
import { planQuery, repairQueryPlan, replanForEmptyResults } from "./queryPlanner.js";
import { executePlan } from "./queryExecutionService.js";
import { synthesizeAnswer, streamSynthesizedAnswer } from "./answerService.js";
import { detectCoreQuestion, fallbackPlanQuery } from "./fallbackQueryPlanner.js";

function chooseCoreFallback(question) {
  return fallbackPlanQuery(question);
}

function isExecutablePlan(plan) {
  if (!plan || typeof plan !== "object") {
    return false;
  }
  if (plan.intent === "out_of_domain" || plan.intent === "small_talk" || plan.intent === "clarification") {
    return true;
  }
  if (plan.target === "graph") {
    return Boolean(plan.query?.cypher?.start);
  }
  if (plan.target === "sql") {
    return Boolean(plan.query?.sql?.from?.table && plan.query?.sql?.from?.alias);
  }
  return false;
}

async function executeWithRepair({
  question,
  history,
  semanticMatches,
  initialPlan,
  fallbackPlan,
}) {
  let plan = initialPlan;
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (!isExecutablePlan(plan)) {
        throw new Error("Generated plan is not executable");
      }
      let execution = await executePlan(plan, semanticMatches);
      if ((execution.rows?.length || 0) === 0 && attempt < 2) {
        plan = await replanForEmptyResults({
          question,
          history,
          semanticMatches,
          previousPlan: plan,
        });
        continue;
      }
      return { plan, execution };
    } catch (error) {
      lastError = error;
      try {
        plan = await repairQueryPlan({
          question,
          history,
          semanticMatches,
          invalidPlan: plan,
          validationError: error.message,
        });
      } catch (repairError) {
        if (fallbackPlan) {
          plan = fallbackPlan;
          continue;
        }
        throw repairError;
      }
      if (!isExecutablePlan(plan) && fallbackPlan) {
        plan = fallbackPlan;
        continue;
      }
      if (plan.intent === "out_of_domain") {
        break;
      }
    }
  }

  if (plan.intent === "out_of_domain") {
    return { plan, execution: null };
  }

  if (lastError?.message === "Generated plan is not executable") {
    throw new Error(
      "I couldn't build a valid query plan for that question. Please include the specific document, entity, or metric you want to analyze.",
    );
  }

  throw lastError;
}

export async function answerQuestion({ question, sessionId }) {
  const resolvedSessionId = sessionId ? ensureSession(sessionId) : createSession();
  appendMessage(resolvedSessionId, "user", question);

  const coreQuestion = detectCoreQuestion(question);
  if (coreQuestion?.kind === "clarification") {
    appendMessage(resolvedSessionId, "assistant", coreQuestion.message, {
      clarification: true,
    });
    return {
      ok: true,
      sessionId: resolvedSessionId,
      intent: "clarification",
      answer: coreQuestion.message,
      rows: [],
      referencedNodeIds: [],
    };
  }

  const history = getConversationHistory(resolvedSessionId);
  const semanticMatches = semanticSearch(question, 8);
  const coreFallback = coreQuestion?.kind === "plan" ? coreQuestion.plan : chooseCoreFallback(question);
  let initialPlan;
  try {
    initialPlan = await planQuery({ question, history, semanticMatches });
  } catch (error) {
    initialPlan = coreFallback;
    if (!initialPlan) {
      throw error;
    }
  }
  if (initialPlan?.intent === "out_of_domain" && coreFallback) {
    initialPlan = coreFallback;
  }
  let plan = initialPlan;
  if (plan.intent === "out_of_domain") {
    const answer = domainRejection();
    appendMessage(resolvedSessionId, "assistant", answer, { rejected: true, plan });
    return {
      ok: false,
      sessionId: resolvedSessionId,
      intent: "out_of_domain",
      answer,
      rows: [],
      referencedNodeIds: [],
      plan,
    };
  }
  if (plan.intent === "small_talk" || plan.intent === "clarification") {
    const answer = await synthesizeAnswer({
      question,
      plan,
      execution: { rows: [], queryText: "", params: {}, referencedNodeIds: [] },
      history,
    });
    appendMessage(resolvedSessionId, "assistant", answer, { plan });
    return {
      ok: true,
      sessionId: resolvedSessionId,
      intent: plan.intent,
      answer,
      rows: [],
      referencedNodeIds: [],
      plan,
    };
  }
  const repaired = await executeWithRepair({
    question,
    history,
    semanticMatches,
    initialPlan,
    fallbackPlan: coreFallback,
  });
  plan = repaired.plan;
  if (plan.intent === "out_of_domain" || !repaired.execution) {
    const answer = domainRejection();
    appendMessage(resolvedSessionId, "assistant", answer, { rejected: true, plan });
    return {
      ok: false,
      sessionId: resolvedSessionId,
      intent: "out_of_domain",
      answer,
      rows: [],
      referencedNodeIds: [],
      plan,
    };
  }
  const execution = repaired.execution;
  const answer = await synthesizeAnswer({
    question,
    plan,
    execution,
    history,
  });

  appendMessage(resolvedSessionId, "assistant", answer, {
    plan,
    queryText: execution.queryText,
    target: execution.target,
    referencedNodeIds: execution.referencedNodeIds,
  });

  return {
    ok: true,
    sessionId: resolvedSessionId,
    intent: plan.intent,
    plan,
    target: execution.target,
    queryText: execution.queryText,
    answer,
    rows: execution.rows,
    referencedNodeIds: execution.referencedNodeIds,
    semanticMatches: semanticMatches.map((match) => ({
      sourceType: match.sourceType,
      sourceId: match.sourceId,
      label: match.label,
      score: match.score,
    })),
  };
}

export async function streamAnswerQuestion({
  question,
  sessionId,
  onToken,
  onReady,
  onComplete,
}) {
  const resolvedSessionId = sessionId ? ensureSession(sessionId) : createSession();
  appendMessage(resolvedSessionId, "user", question);

  const coreQuestion = detectCoreQuestion(question);
  if (coreQuestion?.kind === "clarification") {
    appendMessage(resolvedSessionId, "assistant", coreQuestion.message, {
      clarification: true,
    });
    onReady({
      ok: true,
      sessionId: resolvedSessionId,
      intent: "clarification",
      referencedNodeIds: [],
      rows: [],
    });
    onToken(coreQuestion.message);
    onComplete(coreQuestion.message);
    return;
  }

  const history = getConversationHistory(resolvedSessionId);
  const semanticMatches = semanticSearch(question, 8);
  const coreFallback = coreQuestion?.kind === "plan" ? coreQuestion.plan : chooseCoreFallback(question);
  let initialPlan;
  try {
    initialPlan = await planQuery({ question, history, semanticMatches });
  } catch (error) {
    initialPlan = coreFallback;
    if (!initialPlan) {
      throw error;
    }
  }
  if (initialPlan?.intent === "out_of_domain" && coreFallback) {
    initialPlan = coreFallback;
  }
  let plan = initialPlan;
  if (plan.intent === "out_of_domain") {
    const answer = domainRejection();
    appendMessage(resolvedSessionId, "assistant", answer, { rejected: true, plan });
    onReady({
      ok: false,
      sessionId: resolvedSessionId,
      intent: "out_of_domain",
      referencedNodeIds: [],
      rows: [],
      plan,
    });
    onToken(answer);
    onComplete(answer);
    return;
  }
  if (plan.intent === "small_talk" || plan.intent === "clarification") {
    const answer = await synthesizeAnswer({
      question,
      plan,
      execution: { rows: [], queryText: "", params: {}, referencedNodeIds: [] },
      history,
    });
    appendMessage(resolvedSessionId, "assistant", answer, { plan });
    onReady({
      ok: true,
      sessionId: resolvedSessionId,
      intent: plan.intent,
      referencedNodeIds: [],
      rows: [],
      plan,
    });
    onToken(answer);
    onComplete(answer);
    return;
  }
  const repaired = await executeWithRepair({
    question,
    history,
    semanticMatches,
    initialPlan,
    fallbackPlan: coreFallback,
  });
  plan = repaired.plan;
  if (plan.intent === "out_of_domain" || !repaired.execution) {
    const answer = domainRejection();
    appendMessage(resolvedSessionId, "assistant", answer, { rejected: true, plan });
    onReady({
      ok: false,
      sessionId: resolvedSessionId,
      intent: "out_of_domain",
      referencedNodeIds: [],
      rows: [],
      plan,
    });
    onToken(answer);
    onComplete(answer);
    return;
  }
  const execution = repaired.execution;

  onReady({
    ok: true,
    sessionId: resolvedSessionId,
    intent: plan.intent,
    target: execution.target,
    queryText: execution.queryText,
    rows: execution.rows,
    referencedNodeIds: execution.referencedNodeIds,
  });

  let answer = "";
  await streamSynthesizedAnswer({
    question,
    plan,
    execution,
    history,
    onToken(token) {
      answer += token;
      onToken(token);
    },
  });

  appendMessage(resolvedSessionId, "assistant", answer, {
    plan,
    queryText: execution.queryText,
    target: execution.target,
    referencedNodeIds: execution.referencedNodeIds,
  });

  onComplete(answer);
}
