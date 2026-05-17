export type ModerationResult =
  | { approved: true }
  | { approved: false };

export async function moderateEn(content: string): Promise<ModerationResult> {
  try {
    const res = await fetch("/api/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      console.error("[moderation] server error:", res.status);
      return { approved: true };
    }

    const data = (await res.json()) as { approved?: boolean };
    console.log("[moderation] result:", data);
    return data.approved === false ? { approved: false } : { approved: true };
  } catch (e) {
    console.error("[moderation] unexpected error:", e);
    return { approved: true };
  }
}
