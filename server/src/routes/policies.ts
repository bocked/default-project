import { Router } from "express";
import { parseZod, policyTypeSchema } from "../schemas.js";
import { publicPolicy, openDraft } from "../lib/policies.js";

export const policiesRouter = Router();

// GET /api/policies?type=TERMS|PRIVACY|COOKIES - latest approved legal
// document content (falls back to the baseline template when nothing has been
// published yet, so pages/modals are never blank).
policiesRouter.get("/", async (req, res) => {
  const type = parseZod(policyTypeSchema, req.query.type);
  if (!type) {
    res.status(400).json({ error: "type so'rasi kerak: TERMS | PRIVACY | COOKIES" });
    return;
  }
  try {
    const [policy, draft] = await Promise.all([publicPolicy(type), openDraft(type)]);
    res.json({
      policy: {
        type: policy.type,
        version: policy.version,
        content: policy.content,
        changeSummary: policy.changeSummary,
        publishedAt: policy.publishedAt,
      },
      // The open draft (if any) tells the consent gate nothing; it is only a
      // convenience for the admin console preview.
      draft: draft ? { id: draft.id, version: draft.version, changeSummary: draft.changeSummary } : null,
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});