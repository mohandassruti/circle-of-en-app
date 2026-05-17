import { createClient } from "@supabase/supabase-js";

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Normalize URL: trim whitespace, remove trailing slash, and strip any /rest/v1 suffix
// (the Supabase JS client appends /rest/v1 itself — including it in the URL doubles it)
const supabaseUrl = rawUrl?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const supabaseAnonKey = rawKey?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("[supabase] Missing credentials — check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY secrets");
}

export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder"
);

export type UserSession = {
  uuid: string;
  given_count: number;
  received_count: number;
  created_at: string;
  last_active_at?: string;
  referrer?: string | null;
  utm_source?: string | null;
};

export type Message = {
  id: string;
  content: string;
  tag: string | null;
  giver_uuid: string;
  moderation_status: string;
  received_by_uuid: string | null;
  received_at: string | null;
  created_at: string;
};

export function isConfigured(): boolean {
  return !!supabaseUrl && supabaseUrl !== "https://placeholder.supabase.co";
}

export async function upsertSession(uuid: string): Promise<UserSession | null> {
  if (!isConfigured()) return null;

  // Insert row if it doesn't exist yet; if it does, just select it
  const { error: insertErr } = await supabase
    .from("user_sessions")
    .insert({ uuid })
    .select()
    .single();

  // Code 23505 = unique violation (row already exists) — that's fine
  if (insertErr && insertErr.code !== "23505") {
    console.error("[supabase] upsertSession insert error:", insertErr.code, insertErr.message);
  }

  const { data, error: selErr } = await supabase
    .from("user_sessions")
    .select("*")
    .eq("uuid", uuid)
    .single();

  if (selErr) {
    console.error("[supabase] upsertSession select error:", selErr.code, selErr.message);
    return null;
  }
  console.log("[supabase] upsertSession ok:", data);
  return data as UserSession;
}

export async function submitMessage(
  content: string,
  tag: string | null,
  giverUuid: string,
  moderationStatus = "approved"
): Promise<boolean> {
  if (!isConfigured()) {
    console.error("[supabase] submitMessage skipped — not configured");
    return false;
  }
  console.log("[supabase] submitMessage — tag:", tag, "giver:", giverUuid);
  const { error } = await supabase.from("messages").insert({
    id: crypto.randomUUID(),
    content,
    tag,
    giver_uuid: giverUuid,
    moderation_status: moderationStatus,
  });
  if (error) {
    console.error("[supabase] submitMessage insert error:", error.code, error.message, error.details);
    return false;
  }
  console.log("[supabase] submitMessage insert ok");

  const { data: session, error: selErr } = await supabase
    .from("user_sessions")
    .select("given_count")
    .eq("uuid", giverUuid)
    .single();
  if (selErr) console.error("[supabase] submitMessage select session error:", selErr.message);

  const { error: updErr } = await supabase
    .from("user_sessions")
    .update({ given_count: (session?.given_count ?? 0) + 1 })
    .eq("uuid", giverUuid);
  if (updErr) console.error("[supabase] submitMessage update count error:", updErr.message);

  return true;
}

export async function fetchMessageCount(): Promise<number> {
  if (!isConfigured()) return 0;
  const { count, error } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("moderation_status", "approved");
  if (error) console.error("[supabase] fetchMessageCount error:", error.message);
  return count ?? 0;
}

export async function checkDailyLimit(uuid: string): Promise<boolean> {
  if (!isConfigured()) return false;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("received_by_uuid", uuid)
    .gte("received_at", todayStart.toISOString());
  if (error) console.error("[supabase] checkDailyLimit error:", error.message);
  console.log("[supabase] daily received today:", count);
  return (count ?? 0) >= 3;
}

const FALLBACK_TAGS = [
  "just laid off",
  "interview rejection",
  "endless job hunting",
  "big presentation",
  "burnt out",
  "quietly proud",
  "stretched thin",
  "nailed it",
];

export async function fetchTags(): Promise<string[]> {
  if (!isConfigured()) return FALLBACK_TAGS;
  const { data, error } = await supabase
    .from("tags")
    .select("label")
    .eq("active", true)
    .order("display_order", { ascending: true });
  if (error) {
    console.error("[supabase] fetchTags error:", error.message);
    return FALLBACK_TAGS;
  }
  if (!data || data.length === 0) return FALLBACK_TAGS;
  return data.map((r: { label: string }) => r.label);
}

export async function hasAvailableEn(giverUuid: string): Promise<boolean> {
  if (!isConfigured()) return false;
  const { count, error } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("moderation_status", "approved")
    .is("received_by_uuid", null)
    .neq("giver_uuid", giverUuid);
  if (error) console.error("[supabase] hasAvailableEn error:", error.message);
  return (count ?? 0) > 0;
}

export async function fetchEn(
  receiverUuid: string,
  tag: string | null
): Promise<Message | null> {
  if (!isConfigured()) {
    console.error("[supabase] fetchEn skipped — not configured");
    return null;
  }

  const attempt = async (useTag: boolean) => {
    let q = supabase
      .from("messages")
      .select("*")
      .eq("moderation_status", "approved")
      .is("received_by_uuid", null)
      .neq("giver_uuid", receiverUuid)
      .limit(1);
    if (useTag && tag) q = q.eq("tag", tag);
    const { data, error } = await q;
    if (error) console.error("[supabase] fetchEn attempt error:", error.message);
    console.log("[supabase] fetchEn attempt useTag=" + useTag + " found:", data?.length ?? 0);
    return data?.[0] ?? null;
  };

  let message = tag ? await attempt(true) : null;
  if (!message) message = await attempt(false);
  if (!message) {
    console.log("[supabase] fetchEn — no unclaimed En available");
    return null;
  }

  const { error } = await supabase
    .from("messages")
    .update({
      received_by_uuid: receiverUuid,
      received_at: new Date().toISOString(),
    })
    .eq("id", message.id)
    .is("received_by_uuid", null);

  if (error) {
    console.error("[supabase] fetchEn claim error:", error.code, error.message);
    return null;
  }
  console.log("[supabase] fetchEn claimed message id:", message.id);

  const { data: session, error: selErr } = await supabase
    .from("user_sessions")
    .select("received_count")
    .eq("uuid", receiverUuid)
    .single();
  if (selErr) console.error("[supabase] fetchEn select session error:", selErr.message);

  const { error: updErr } = await supabase
    .from("user_sessions")
    .update({ received_count: (session?.received_count ?? 0) + 1 })
    .eq("uuid", receiverUuid);
  if (updErr) console.error("[supabase] fetchEn update count error:", updErr.message);

  return message as Message;
}
