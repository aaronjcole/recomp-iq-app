export const COACH_MESSAGE_MAX = 1000;
export const COACH_HISTORY_MAX = 12;
export const COACH_HISTORY_CONTENT_MAX = 1200;
export const COACH_HISTORY_TOTAL_MAX = 9000;
export const REPORT_REASON_MAX = 500;
export const REPORT_MESSAGE_ID_MAX = 128;
export const REPORT_CONTENT_MAX = 2000;

export const REPORT_CATEGORIES = Object.freeze([
  { value: "unsafe_health_advice", label: "Unsafe health advice" },
  { value: "harmful_or_offensive", label: "Harmful or offensive" },
  { value: "incorrect_or_misleading", label: "Incorrect or misleading" },
  { value: "other", label: "Other" }
]);

const categoryValues = new Set(REPORT_CATEGORIES.map((item) => item.value));

export function boundedText(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function messageContent(message) {
  if (message.role === "coach") {
    const actions = Array.isArray(message.actions) ? message.actions.join(" ") : "";
    return [message.content, actions, message.safetyNote].filter(Boolean).join(" ");
  }
  return message.content;
}

export function toCoachHistory(messages) {
  const history = (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === "user" || message?.role === "coach")
    .slice(-COACH_HISTORY_MAX)
    .map((message) => ({
      role: message.role,
      content: boundedText(messageContent(message), COACH_HISTORY_CONTENT_MAX)
    }))
    .filter((message) => message.content);

  while (
    history.length > 0 &&
    history.reduce((total, message) => total + message.content.length, 0) > COACH_HISTORY_TOTAL_MAX
  ) {
    history.shift();
  }
  return history;
}

export function normalizeCoachReply(payload) {
  const data = payload?.data ?? payload ?? {};
  const reply = data.reply ?? data.response ?? data;
  const summary = boundedText(
    typeof reply === "string"
      ? reply
      : reply.summary ?? reply.content ?? reply.message,
    COACH_HISTORY_CONTENT_MAX
  );
  if (!summary) throw new Error("The coach returned an empty response");

  const rawActions = typeof reply === "object" && Array.isArray(reply.actions) ? reply.actions : [];
  const actions = rawActions
    .slice(0, 5)
    .map((action) => boundedText(action, 400))
    .filter(Boolean);

  return {
    messageId: boundedText(data.messageId ?? data.message_id, REPORT_MESSAGE_ID_MAX) || null,
    summary,
    actions,
    safetyNote: boundedText(
      typeof reply === "object" ? reply.safetyNote ?? reply.safety_note : "",
      600
    ) || null
  };
}

export function makeCoachRequest(message, history) {
  const boundedMessage = boundedText(message, COACH_MESSAGE_MAX);
  if (!boundedMessage) throw new Error("Enter a message for your coach");
  return { message: boundedMessage, history: toCoachHistory(history) };
}

export function makeReportRequest({ messageId, category, reason, reportedContent }) {
  const boundedMessageId = boundedText(messageId, REPORT_MESSAGE_ID_MAX);
  if (!boundedMessageId) throw new Error("This response cannot be reported because it has no message ID");
  if (!categoryValues.has(category)) throw new Error("Choose a valid report category");
  const boundedReportedContent = boundedText(reportedContent, REPORT_CONTENT_MAX);
  if (!boundedReportedContent) throw new Error("The reported coach response is empty");
  return {
    messageId: boundedMessageId,
    category,
    reason: boundedText(reason, REPORT_REASON_MAX),
    reportedContent: boundedReportedContent
  };
}
