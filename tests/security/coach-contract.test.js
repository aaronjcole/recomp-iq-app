import test from "node:test";
import assert from "node:assert/strict";
import {
  clipAtWord,
  COACH_HISTORY_CONTENT_MAX,
  COACH_HISTORY_MAX,
  COACH_REPLY_SUMMARY_MAX,
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
    actionable: true,
    reply: {
      summary: "Keep today simple.",
      actions: ["Choose one balanced meal.", "Take a short walk."],
      safetyNote: "Seek qualified care for medical concerns."
    }
  });
  assert.deepEqual(reply, {
    messageId: "coach-message-123",
    actionable: true,
    summary: "Keep today simple.",
    actions: ["Choose one balanced meal.", "Take a short walk."],
    safetyNote: "Seek qualified care for medical concerns."
  });
});

test("coach action eligibility defaults closed and only accepts an explicit backend grant", () => {
  assert.equal(normalizeCoachReply({ reply: { summary: "Keep going.", actions: [] } }).actionable, false);
  assert.equal(
    normalizeCoachReply({ actionable: false, reply: { summary: "Pause here.", actions: [] } }).actionable,
    false
  );
  assert.equal(
    normalizeCoachReply({ actionable: true, reply: { summary: "Continue.", actions: [] } }).actionable,
    true
  );
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

test("coach summaries display up to the server limit and clip on a word boundary", () => {
  const words = (length) => {
    let text = "";
    let index = 0;
    while (text.length < length) text += `${text ? " " : ""}word${index++}`;
    return text.slice(0, length);
  };

  // 1201-1800 characters used to be cut to the 1200-character history limit.
  const long = words(1700);
  assert.equal(normalizeCoachReply({ reply: { summary: long, actions: [] } }).summary, long);
  const atLimit = words(COACH_REPLY_SUMMARY_MAX);
  assert.equal(normalizeCoachReply({ reply: atLimit }).summary, atLimit);

  const tooLong = normalizeCoachReply({ reply: words(2400) }).summary;
  assert.ok(tooLong.length <= COACH_REPLY_SUMMARY_MAX);
  assert.ok(tooLong.endsWith("…"));
  assert.match(tooLong, /word\d+…$/);
  assert.ok(words(2400).startsWith(tooLong.slice(0, -1)));

  // History payloads still respect the 1200-character item limit, cut between words.
  const [item] = toCoachHistory([{ role: "coach", content: long }]);
  assert.ok(item.content.length <= COACH_HISTORY_CONTENT_MAX);
  assert.ok(item.content.endsWith("…"));
  const kept = item.content.slice(0, -1);
  assert.ok(long.startsWith(kept));
  assert.equal(long[kept.length], " ", "clipped at a word boundary");
});

test("the client summary limit matches the server's reply summary limit", async () => {
  const { normalizeCoachReplyResult } = await import("../../base44/shared/coachDomain.js");
  const server = normalizeCoachReplyResult({ summary: "s".repeat(5000), actions: [] });
  assert.equal(server.reply.summary.length, COACH_REPLY_SUMMARY_MAX);
});

test("clipAtWord leaves fitting text alone and hard-cuts a single overlong word", () => {
  assert.equal(clipAtWord("  short text  ", 20), "short text");
  assert.equal(clipAtWord("hello world", 11), "hello world");
  assert.equal(clipAtWord("hello world again", 12), "hello world…");
  assert.equal(clipAtWord("hello world again", 11), "hello…");
  assert.equal(clipAtWord("abcdefghijklmnop", 10), "abcdefghi…");
  assert.equal(clipAtWord(null, 10), "");
});

test("the unsafe-reply filter catches pain phrasing with and without an intensity word", async () => {
  const { isUnsafeCoachReply } = await import("../../base44/shared/coachDomain.js");
  for (const phrase of ["train through pain", "train through sharp pain", "train through severe pain"]) {
    assert.equal(isUnsafeCoachReply({ summary: `You should ${phrase} today.` }), true, phrase);
  }
  assert.equal(isUnsafeCoachReply({ summary: "Stop if you feel sharp pain and rest." }), false);
});
