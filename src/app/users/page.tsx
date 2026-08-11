import { redirect } from "next/navigation";
import { me, allUsers } from "@/lib/user";

/** Admin-only overview: who has signed up and which shops they hold. */
export default async function UsersPage() {
  const u = await me();
  if (!u) redirect("/sign-in");
  // Not "hide the link": the page itself refuses. A route that is only protected by not being linked
  // is not protected.
  if (!u.isAdmin) redirect("/");

  const users = await allUsers();
  return (
    <main className="mx-auto max-w-[900px] px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Kullanıcılar</h1>
      <p className="mb-6 text-sm text-muted">
        {users.length} hesap. Her kullanıcı yalnızca kendi mağazalarını görür ve yönetir; admin
        hepsini görür. Agent&apos;ın SQL&apos;i veritabanı seviyesinde aktif mağazaya kilitli.
      </p>
      <div className="overflow-x-auto rounded-xl border border-espresso/15">
        <table className="w-full text-sm">
          <thead className="bg-espresso/5 text-left">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">E-posta</th>
              <th className="px-3 py-2">İsim</th>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2">Mağazalar</th>
              <th className="px-3 py-2">Kayıt</th>
            </tr>
          </thead>
          <tbody>
            {users.map((r: any) => (
              <tr key={r.id} className="border-t border-espresso/10">
                <td className="px-3 py-2 tabular-nums text-muted">{r.id}</td>
                <td className="px-3 py-2">{r.email ?? "—"}</td>
                <td className="px-3 py-2">{r.name ?? "—"}</td>
                <td className="px-3 py-2">{r.is_admin ? "admin" : "kullanıcı"}</td>
                <td className="px-3 py-2">
                  {(r.shops ?? []).length
                    ? (r.shops as any[]).map((s) => s.name).join(", ")
                    : <span className="text-muted">mağaza yok</span>}
                </td>
                <td className="px-3 py-2 text-muted">
                  {new Date(r.created_at).toLocaleDateString("tr-TR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
