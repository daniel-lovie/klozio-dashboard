"use client";
import { useEffect, useState } from "react";
import { Badge, Skeleton, Stat } from "@/components/ui";

/**
 * The morning glance: what is live, what is queued, what needs a decision, what is late.
 *
 * Each number carries its meaning rather than sitting bare. Net margin is the clearest case — the shop
 * states a 40% floor, so a raw "24.3%" is only a number until it is coloured against that floor.
 */
type Data = {
  live: number; ready: number; awaiting: number; total: number; netMargin: number | null;
  next7: number; overdue: number; unsentOrders: number; untrackedOrders: number;
  views: number; favorites: number; capturedOn: string | null;
};

const NET_FLOOR = 40;

export function Overview() {
  const [d, setD] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/overview")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("yuklenemedi"))))
      .then(setD)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;            // the panels below still work; a broken header should not block them
  if (!d) {
    return (
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[86px]" />)}
      </div>
    );
  }

  const openOrders = d.unsentOrders + d.untrackedOrders;
  const favRate = d.views > 0 ? (d.favorites / d.views) * 100 : null;

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        label="Yayında"
        value={d.live}
        hint={`${d.total} ürünün ${d.total ? Math.round((d.live / d.total) * 100) : 0}%'i`}
      />
      <Stat
        label="Yayına hazır"
        value={d.ready}
        tone={d.awaiting > 0 ? "accent" : "neutral"}
        hint={d.awaiting > 0 ? `${d.awaiting} tasarım onay bekliyor` : `7 günde ${d.next7} planlı`}
      />
      <Stat
        label="Açık sipariş"
        value={openOrders}
        tone={d.unsentOrders > 0 ? "danger" : openOrders > 0 ? "warn" : "ok"}
        hint={d.unsentOrders > 0
          ? `${d.unsentOrders} tanesi üreticiye gönderilmedi`
          : d.untrackedOrders > 0 ? `${d.untrackedOrders} takip numarası bekliyor` : "hepsi yolunda"}
      />
      <Stat
        label="Ortalama net marj"
        value={d.netMargin === null ? "—" : `%${d.netMargin}`}
        tone={d.netMargin === null ? "neutral" : d.netMargin < NET_FLOOR ? "danger" : "ok"}
        hint={d.netMargin === null ? "hesaplanmadı" : `taban %${NET_FLOOR} · alıcının ödediğinden`}
      />

      {/* Two facts that only matter when they are true; a row of zeroes is noise. */}
      {(d.overdue > 0 || favRate !== null) && (
        <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-4">
          {d.overdue > 0 && (
            <Badge tone="warn">{d.overdue} planlı yayın tarihi geçmiş</Badge>
          )}
          {favRate !== null && (
            <Badge tone={favRate < 1 ? "warn" : "neutral"}>
              {d.views.toLocaleString("tr")} görüntülenme · %{favRate.toFixed(1)} favori
              {favRate < 1 && " — kapak/başlık zayıf"}
            </Badge>
          )}
          {d.capturedOn && (
            <span className="text-xs text-ink-faint">
              istatistik {new Date(d.capturedOn).toLocaleDateString("tr")} tarihli
            </span>
          )}
        </div>
      )}
    </div>
  );
}
