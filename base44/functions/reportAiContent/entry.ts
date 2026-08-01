import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  AiReportRequestError,
  normalizeAiReportRequest
} from "../../shared/aiReportDomain.js";

const MAX_REQUEST_BYTES = 4_096;
const MAX_REPORTS_PER_HOUR = 10;
const REPORT_WINDOW_MS = 60 * 60 * 1000;

function statusOf(error) {
  return error?.status ?? error?.response?.status;
}

function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function safeErrorDetails(error) {
  return {
    status: statusOf(error) ?? null,
    name: typeof error?.name === "string" ? error.name.slice(0, 80) : "Error"
  };
}

export default async function(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "Request is too large" }, { status: 413 });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if ([401, 403].includes(statusOf(error))) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("reportAiContent auth check failed", safeErrorDetails(error));
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "A JSON request body is required" }, { status: 400 });
  }

  let reportRequest;
  try {
    reportRequest = normalizeAiReportRequest(body);
  } catch (error) {
    if (error instanceof AiReportRequestError) {
      return json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  try {
    const query = {
      owner_id: user.id,
      message_id: reportRequest.messageId,
      category: reportRequest.category
    };
    const reports = base44.asServiceRole.entities.AiContentReport;
    const existing = await reports.filter(
      query,
      "-created_date",
      1
    );
    if (existing[0]?.id) {
      return json({ ok: true, reportId: existing[0].id });
    }

    const recent = await reports.filter(
      { owner_id: user.id },
      "-created_date",
      MAX_REPORTS_PER_HOUR
    );
    const cutoff = Date.now() - REPORT_WINDOW_MS;
    const recentCount = recent.filter((report) => {
      const createdAt = Date.parse(report.created_date ?? "");
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    }).length;
    if (recentCount >= MAX_REPORTS_PER_HOUR) {
      return json({ error: "Too many reports. Please try again later." }, { status: 429 });
    }

    const report = await reports.create({
      owner_id: user.id,
      message_id: reportRequest.messageId,
      category: reportRequest.category,
      ...(reportRequest.reason ? { reason: reportRequest.reason } : {}),
      reported_content: reportRequest.reportedContent,
      status: "received"
    });
    return json({ ok: true, reportId: report.id }, { status: 201 });
  } catch (error) {
    // Deliberately exclude the report text, message identifier, and user health context.
    console.error("reportAiContent failed", safeErrorDetails(error));
    return json({ error: "The report could not be submitted" }, { status: 500 });
  }
}
