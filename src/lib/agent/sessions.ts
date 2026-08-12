/** Chat sessions for the web agent: many threads per shop, each with its own history.
 *
 * There used to be exactly one thread per shop, enforced by a unique index. That made "start a new
 * conversation" and "destroy the old one" the same action, so a design discussion and an order
 * investigation could not coexist and neither could be revisited.
 */
import { q, one } from "../db";

export type Session = {
  id: number; title: string | null; updated_at: string; created_at: string; messages_n: number;
};

export async function listSessions(shopId: number): Promise<Session[]> {
  return q<Session>(
    `SELECT id, title, updated_at, created_at,
            jsonb_array_length(messages) AS messages_n
       FROM agent_chats WHERE shop_id = $1
      ORDER BY updated_at DESC`, [shopId]);
}

/** Create a session. The id is allocated with max+1 because this table's key was never a sequence. */
export async function createSession(shopId: number, title?: string): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO agent_chats (id, shop_id, title, messages)
     SELECT COALESCE(max(id), 0) + 1, $1, $2, '[]'::jsonb FROM agent_chats
     RETURNING id`, [shopId, title ?? null]);
  return row!.id;
}

/**
 * The session a request should use.
 *
 * A caller may name one, but never another shop's: the id arrives from the browser, so it is checked
 * against the shop rather than trusted. An unknown or foreign id falls back to the newest session of this
 * shop, and a shop with none gets one created — the chat screen must never be unusable because a stale id
 * is in the URL.
 */
export async function resolveSession(shopId: number, wanted?: number | null): Promise<number> {
  if (wanted) {
    const own = await one<{ id: number }>(
      `SELECT id FROM agent_chats WHERE id = $1 AND shop_id = $2`, [wanted, shopId]);
    if (own) return own.id;
  }
  const newest = await one<{ id: number }>(
    `SELECT id FROM agent_chats WHERE shop_id = $1 ORDER BY updated_at DESC LIMIT 1`, [shopId]);
  return newest?.id ?? (await createSession(shopId));
}

/** Name a session from its first message so the list is readable without opening each one. */
export async function titleFromFirstMessage(chatId: number, text: string): Promise<void> {
  const clean = text.replace(/^\[Aktif mağaza:[^\]]*\]\n?/, "").replace(/\s+/g, " ").trim();
  if (!clean) return;
  await q(`UPDATE agent_chats SET title = $2 WHERE id = $1 AND (title IS NULL OR title = '')`,
          [chatId, clean.slice(0, 60)]);
}

export async function deleteSession(shopId: number, chatId: number): Promise<void> {
  await q(`DELETE FROM agent_chats WHERE id = $1 AND shop_id = $2`, [chatId, shopId]);
}
