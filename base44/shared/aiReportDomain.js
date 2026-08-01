export class AiReportRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "AiReportRequestError";
  }
}

export const AI_REPORT_CATEGORIES = Object.freeze([
  "unsafe_health_advice",
  "harmful_or_offensive",
  "incorrect_or_misleading",
  "other"
]);

const MESSAGE_ID_MAX_LENGTH = 128;
const REASON_MAX_LENGTH = 500;
export const REPORTED_CONTENT_MAX_LENGTH = 2000;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeAiReportRequest(body) {
  if (!isRecord(body)) throw new AiReportRequestError("A JSON request body is required");

  const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
  if (
    messageId.length < 8 ||
    messageId.length > MESSAGE_ID_MAX_LENGTH ||
    !/^[A-Za-z0-9._:-]+$/.test(messageId)
  ) {
    throw new AiReportRequestError("messageId is invalid");
  }

  if (!AI_REPORT_CATEGORIES.includes(body.category)) {
    throw new AiReportRequestError("category is invalid");
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length > REASON_MAX_LENGTH) {
    throw new AiReportRequestError(`reason must be ${REASON_MAX_LENGTH} characters or fewer`);
  }

  const reportedContent =
    typeof body.reportedContent === "string" ? body.reportedContent.trim() : "";
  if (!reportedContent || reportedContent.length > REPORTED_CONTENT_MAX_LENGTH) {
    throw new AiReportRequestError(
      `reportedContent must be between 1 and ${REPORTED_CONTENT_MAX_LENGTH} characters`
    );
  }

  return { messageId, category: body.category, reason, reportedContent };
}
