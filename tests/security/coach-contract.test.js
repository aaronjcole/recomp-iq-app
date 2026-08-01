import test from "node:test";
import assert from "node:assert/strict";
import {
  COACH_HISTORY_MAX,
  COACH_HISTORY_TOTAL_MAX,
  COACH_MESSAGE_MAX,
  makeCoachRequest,
  makeReportRequest,
  normalizeCoachReply,
  REPORT_CONTENT_MAX,
  REPORT_REASON_MAX,
  toCoachHistory
} from "../../src/lib/coachContract.js";

test("coach requests are bounded before invoking the backend", () => {
  const history = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 ? "coach" : "user",
    content: "x".repeat(1200)
  }));
  const request = makeCoachRequest("m".repeat(1200), history);
  assert.equal(request.message.length, COACH_MESSAGE_MAX);
  assert.ok(request.history.length <= COACH_HISTORY_MAX);
  assert.ok(request.history.reduce((total, item) => total + item.content.length, 0) <= COACH_HISTORY_TOTAL_MAX);
});

test("structured coach replies normalize the documented function response", () => {
  const reply = normalizeCoachReply({
    messageId: "coach-message-123",
    reply: {
      summary: "Keep today simple.",
      actions: ["Choose one balanced meal.", "Take a short walk."],
      safetyNote: "Seek qualified care for medical concerns."
    }
  });
  assert.deepEqual(reply, {
    messageId: "coach-message-123",
    summary: "Keep today simple.",
    actions: ["Choose one balanced meal.", "Take a short walk."],
    safetyNote: "Seek qualified care for medical concerns."
  });
});

test("AI reports contain bounded AI output and no user context", () => {
  const request = makeReportRequest({
    messageId: "coach-message-123",
    category: "unsafe_health_advice",
    reason: "r".repeat(700),
    reportedContent: "a".repeat(2500)
  });
  assert.equal(request.reason.length, REPORT_REASON_MAX);
  assert.equal(request.reportedContent.length, REPORT_CONTENT_MAX);
  assert.deepEqual(Object.keys(request), ["messageId", "category", "reason", "reportedContent"]);
  assert.equal(toCoachHistory([{ role: "system", content: "private" }]).length, 0);
});
