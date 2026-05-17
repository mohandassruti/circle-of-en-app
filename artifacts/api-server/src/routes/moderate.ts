import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/moderate", async (req, res) => {
  const { content } = req.body as { content?: string };

  if (!content || typeof content !== "string") {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const apiKey = process.env.VITE_ANTHROPIC_KEY;
  if (!apiKey) {
    req.log.warn("VITE_ANTHROPIC_KEY not set — approving by default");
    res.json({ approved: true });
    return;
  }

  const prompt = `You are a moderation assistant for "Circle of En" — a platform where people leave short encouraging messages for strangers going through difficult moments at work.

Review the following message and decide whether to approve or reject it.

REJECT if the message:
- Contains cruelty, sarcasm, or cynicism directed at the reader
- Contains profanity, slurs, or offensive language
- Is negative, demeaning, dismissive, or belittling toward the reader or their situation
- Contains harmful, threatening, or inappropriate content

APPROVE if the message:
- Is positive, encouraging, warm, or uplifting in any form
- Offers advice, perspective, or a pep talk with good intent
- Comes from a place of empathy or shared experience
- Would comfort, motivate, or encourage someone going through a hard time
- When in doubt, approve — err on the side of letting positivity through

Message:
"${content}"

Reply with JSON only — no other text:
{"approved":true} or {"approved":false}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 16,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      req.log.error({ status: response.status, body }, "Anthropic API error");
      res.json({ approved: true });
      return;
    }

    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    const raw = data.content?.[0]?.text ?? "{}";
    // Strip markdown code fences if Claude wraps the JSON (e.g. ```json\n...\n```)
    const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(text) as { approved?: boolean };
    req.log.info({ approved: parsed.approved }, "moderation result");
    res.json({ approved: parsed.approved !== false });
  } catch (err) {
    req.log.error({ err }, "moderation unexpected error");
    res.json({ approved: true });
  }
});

export default router;
