/**
 * Who is signed in, and which shops they may touch.
 *
 * Identity comes from Clerk; authorisation does not. Before this file the active shop was whatever the
 * browser put in a `shop_id` cookie and twenty-five call sites trusted it, so a second person signing
 * in could manage the first person's shop by editing one cookie value. Clerk on its own would not have
 * changed that — a login proves who you are, not what you may open.
 *
 * Rules:
 *   - a normal user sees exactly the shops they hold a membership row for;
 *   - an admin (users.is_admin) sees every shop, because the operator runs several;
 *   - the active shop is validated on every read: an id the user has no claim to is refused and
 *     replaced by their first shop, never silently honoured.
 */
import { cookies } from "next/headers";
import { auth, currentUser } from "@clerk/nextjs/server";
import { q, one } from "./db";

export type AppUser = { id: number; extId: string; email: string | null; isAdmin: boolean };
export type ShopRef = { id: number; slug: string; name: string };

export function clerkConfigured(): boolean {
  return !!process.env.CLERK_SECRET_KEY && clerkClientConfigured();
}

/**
 * Is the BROWSER side of Clerk configured? Only the publishable key matters for that, and it is the
 * right test for rendering ClerkProvider.
 *
 * Gating the provider on the server secret broke the production image: the Docker build received the
 * publishable key but not the secret, so `clerkConfigured()` was false during the build, the tree was
 * rendered without a provider, and prerendering /sign-out — a client page that calls useClerk() —
 * threw "useClerk can only be used within ClerkProvider". The build failed, the platform kept serving
 * the previous image, and every probe of the new routes returned 404.
 */
export function clerkClientConfigured(): boolean {
  return !!(process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

/** The signed-in user as a row in OUR database, created on first sign-in. */
export async function me(): Promise<AppUser | null> {
  if (!clerkConfigured()) return null;
  const { userId } = await auth();
  if (!userId) return null;

  const found = await one<any>(
    `SELECT id, ext_id, email, is_admin FROM users WHERE ext_id = $1`, [userId]);
  if (found) {
    return { id: found.id, extId: found.ext_id, email: found.email, isAdmin: found.is_admin };
  }

  // First sign-in: mint the row. OWNER_EMAILS exists so the operator's own account inherits the shops
  // that already exist — a fresh Clerk identity has no membership, and without this the catalogue built
  // before Clerk would belong to nobody. It is an allowlist rather than "first user wins" so that
  // whoever finds the URL first does not inherit the shop.
  const cu = await currentUser();
  const email = cu?.emailAddresses?.[0]?.emailAddress ?? null;
  const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || null;
  const owners = (process.env.OWNER_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const isOwner = !!email && owners.includes(email.toLowerCase());

  // Adopt an existing row with the same address before creating a new one. A Clerk user id belongs to a
  // single Clerk instance, so the development and production instances issue different ids for the same
  // person — moving between them (or switching provider) would otherwise mint a second account and the
  // operator would lose their shops and their admin flag to a duplicate row.
  if (email) {
    const byEmail = await one<any>(
      `SELECT id, ext_id, email, is_admin FROM users
        WHERE lower(email) = lower($1) AND (ext_id IS NULL OR ext_id <> $2) LIMIT 1`,
      [email, userId]);
    if (byEmail) {
      const adopted = await q<any>(
        `UPDATE users SET ext_id = $1, name = COALESCE($2, name),
                          is_admin = is_admin OR $3
          WHERE id = $4 RETURNING id, ext_id, email, is_admin`,
        [userId, name, isOwner, byEmail.id]);
      const a = adopted[0];
      if (isOwner) {
        await q(`INSERT INTO memberships (user_id, shop_id, role)
                 SELECT $1, id, 'owner' FROM shops ON CONFLICT DO NOTHING`, [a.id]);
      }
      return { id: a.id, extId: a.ext_id, email: a.email, isAdmin: a.is_admin };
    }
  }

  const rows = await q<any>(
    `INSERT INTO users (ext_id, email, name, is_admin) VALUES ($1,$2,$3,$4)
     ON CONFLICT (ext_id) DO UPDATE SET email = COALESCE(EXCLUDED.email, users.email)
     RETURNING id, ext_id, email, is_admin`,
    [userId, email, name, isOwner]);
  const u = rows[0];
  if (isOwner) {
    await q(`INSERT INTO memberships (user_id, shop_id, role)
             SELECT $1, id, 'owner' FROM shops ON CONFLICT DO NOTHING`, [u.id]);
  }
  return { id: u.id, extId: u.ext_id, email: u.email, isAdmin: u.is_admin };
}

/** Shops this user may open. Admins get all of them; everyone else gets their memberships. */
export async function myShops(user?: AppUser | null): Promise<ShopRef[]> {
  const u = user ?? (await me());
  if (!u) return [];
  if (u.isAdmin) {
    return q<ShopRef>(`SELECT id, slug, name FROM shops ORDER BY id`);
  }
  return q<ShopRef>(
    `SELECT s.id, s.slug, s.name FROM shops s
       JOIN memberships m ON m.shop_id = s.id AND m.user_id = $1
      ORDER BY s.id`, [u.id]);
}

/**
 * The shop the request is allowed to act on.
 *
 * The cookie is a *preference*, never a permission: it is checked against the user's own list and
 * discarded if it is not there. Returns null when the user has no shop at all, which the caller must
 * treat as "send them to onboarding" rather than as shop 1.
 */
export async function activeShopId(user?: AppUser | null): Promise<number | null> {
  const u = user ?? (await me());
  if (!u) return null;
  const shops = await myShops(u);
  if (!shops.length) return null;
  const c = await cookies();
  const wanted = Number(c.get("shop_id")?.value);
  return shops.some((s) => s.id === wanted) ? wanted : shops[0].id;
}

/** True when the user may open this shop — the check every write path should make. */
export async function canUseShop(shopId: number, user?: AppUser | null): Promise<boolean> {
  const u = user ?? (await me());
  if (!u) return false;
  if (u.isAdmin) return true;
  const row = await one<any>(
    `SELECT 1 AS ok FROM memberships WHERE user_id=$1 AND shop_id=$2`, [u.id, shopId]);
  return !!row;
}

/** Admin-only: every user with the shops they hold. For the operator's own overview. */
export async function allUsers(): Promise<any[]> {
  const u = await me();
  if (!u?.isAdmin) return [];
  return q<any>(
    `SELECT u.id, u.email, u.name, u.is_admin, u.created_at,
            COALESCE(json_agg(json_build_object('id', s.id, 'name', s.name))
                     FILTER (WHERE s.id IS NOT NULL), '[]') AS shops
       FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id
       LEFT JOIN shops s ON s.id = m.shop_id
      GROUP BY u.id ORDER BY u.id`);
}
