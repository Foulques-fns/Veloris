"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  Activity, ArrowLeft, BadgeCheck, Bug, Clapperboard, Cpu, Database, FileAudio, Image as ImageIcon,
  LogOut, MessageSquareText, Save, Search, ShieldCheck, SlidersHorizontal, Trash2, Users, X,
} from "lucide-react";
import { Badge, Modal, Spinner, Toggle, toast } from "./ui";

type Tab = "overview" | "users" | "limits" | "errors";

/* ────────────────────────────────────────────────────────────────────────── */

export default function AdminApp({ admin }: { admin: { name: string; email: string } }) {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <div className="min-h-dvh flex flex-col lg:flex-row relative admin-shell">
      <div className="aurora opacity-70"><div className="a1" /><div className="a2" /></div>

      {/* rail */}
      <aside className="relative z-10 lg:w-60 shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--border)] bg-[var(--bg-elev)] flex lg:flex-col">
        <div className="flex lg:flex-col flex-1 items-center lg:items-stretch lg:gap-1 px-3 py-2 lg:p-4 overflow-x-auto">
          <div className="hidden lg:flex items-center gap-2.5 px-1 pb-5">
            <span className="w-8 h-8 rounded-lg grid place-items-center text-white" style={{ background: "linear-gradient(135deg,#007bff,#ff073a)" }}>
              <ShieldCheck className="w-4.5 h-4.5" />
            </span>
            <div>
              <div className="text-[13px] font-semibold tracking-tight">VELORIS Admin</div>
              <div className="text-[10px] text-muted">secure console</div>
            </div>
          </div>
          <RailItem tab="overview" active={tab} set={setTab} icon={Activity} label="Overview" />
          <RailItem tab="users" active={tab} set={setTab} icon={Users} label="Users" />
          <RailItem tab="limits" active={tab} set={setTab} icon={SlidersHorizontal} label="Limits & models" />
          <RailItem tab="errors" active={tab} set={setTab} icon={Bug} label="API errors" />
          <div className="flex-1" />
          <Link href="/chat" className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-muted hover:bg-[var(--panel)] hover:text-[var(--text)] transition-colors whitespace-nowrap">
            <ArrowLeft className="w-4 h-4" /> <span className="hidden lg:inline">Back to app</span>
          </Link>
        </div>
      </aside>

      {/* content */}
      <main className="relative z-10 flex-1 min-w-0 px-4 lg:px-8 py-6 lg:py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-6 anim-fade-up">
          <div>
            <h1 className="text-lg font-semibold tracking-tight capitalize">{tab === "limits" ? "Limits & models" : tab === "overview" ? "Overview" : tab === "users" ? "Users" : "API errors"}</h1>
            <p className="text-[12px] text-muted">Signed in as {admin.email} · role verified server-side</p>
          </div>
          <Badge tone="accent"><ShieldCheck className="w-3 h-3" /> ADMIN</Badge>
        </div>
        {tab === "overview" && <Overview />}
        {tab === "users" && <UsersTab currentEmail={admin.email} />}
        {tab === "limits" && <LimitsTab />}
        {tab === "errors" && <ErrorsTab />}
      </main>
    </div>
  );
}

function RailItem({ tab, active, set, icon: Icon, label }: { tab: Tab; active: Tab; set: (t: Tab) => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button
      onClick={() => set(tab)}
      className={clsx(
        "flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] transition-colors whitespace-nowrap",
        active === tab ? "bg-[color-mix(in_srgb,#ff073a_16%,transparent)] text-[var(--text)] font-medium" : "text-muted hover:bg-[var(--panel)] hover:text-[var(--text)]",
      )}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

/* ─────────────────────────── overview ─────────────────────────── */

type Stats = {
  totals: { users: number; verified: number; conversations: number; messages: number; files: number; admins: number };
  plans: { plan: string; n: number }[];
  today: { type: string; n: number }[];
  series: { day: string; chat: number; image: number; audio: number; transcribe: number; video: number }[];
  signups: { day: string; n: number }[];
  topModels: { model: string; n: number }[];
  errors24h: number;
};

function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    fetch("/api/admin/stats").then((r) => r.json()).then((d) => d.ok && setStats(d)).catch(() => {});
  }, []);

  if (!stats) return <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{new Array(8).fill(0).map((_, i) => <div key={i} className="skeleton h-28" />)}</div>;

  const cards = [
    { label: "Users", value: stats.totals.users, icon: Users, sub: `${stats.totals.verified} verified` },
    { label: "Conversations", value: stats.totals.conversations, icon: MessageSquareText, sub: `${stats.totals.messages} messages` },
    { label: "Generations today", value: stats.today.reduce((a, t) => a + t.n, 0), icon: Activity, sub: stats.today.map((t) => `${t.type}: ${t.n}`).join(" · ") || "quiet day" },
    { label: "Files stored", value: stats.totals.files, icon: Database, sub: `${stats.totals.admins} admin(s)` },
  ];

  const maxDay = Math.max(1, ...stats.series.map((d) => d.chat + d.image + d.audio + d.transcribe + d.video));

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <div key={c.label} className="panel rounded-2xl p-5 anim-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted">{c.label}</span>
              <c.icon className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div className="text-2xl font-bold tracking-tight mt-1.5">{Number(c.value).toLocaleString()}</div>
            <div className="text-[11px] text-muted mt-1 truncate" title={c.sub}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="panel rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-semibold">Usage — last 14 days</h3>
            <div className="flex gap-2.5 text-[10px] text-muted">
              <Legend color="#007bff" label="chat" /><Legend color="#00a9ff" label="image" /><Legend color="#ff073a" label="audio" /><Legend color="#ffb020" label="more" />
            </div>
          </div>
          <div className="flex items-end gap-1 h-36">
            {stats.series.map((d) => {
              const chat = d.chat, image = d.image, audio = d.audio, other = d.transcribe + d.video;
              const total = chat + image + audio + other;
              return (
                <div key={d.day} className="flex-1 flex flex-col justify-end gap-px group relative" title={`${d.day}\nchat ${chat} · image ${image} · audio ${audio} · other ${other}`}>
                  <div className="w-full rounded-t-[3px]" style={{ height: `${(other / maxDay) * 130}px`, background: "#ffb020", minHeight: other ? 2 : 0 }} />
                  <div className="w-full" style={{ height: `${(audio / maxDay) * 130}px`, background: "#ff073a", minHeight: audio ? 2 : 0 }} />
                  <div className="w-full" style={{ height: `${(image / maxDay) * 130}px`, background: "#00a9ff", minHeight: image ? 2 : 0 }} />
                  <div className="w-full rounded-b-[3px]" style={{ height: `${(chat / maxDay) * 130}px`, background: "#007bff", minHeight: chat ? 2 : 0 }} />
                  {total === 0 && <div className="w-full rounded-[3px] bg-[var(--panel)]" style={{ height: 2 }} />}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9.5px] text-muted mt-1.5">
            <span>{stats.series[0]?.day}</span><span>{stats.series[stats.series.length - 1]?.day}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel rounded-2xl p-5">
            <h3 className="text-[13px] font-semibold mb-3">Top models — 7 days</h3>
            <div className="space-y-2">
              {stats.topModels.length === 0 && <p className="text-[12px] text-muted">No usage yet.</p>}
              {stats.topModels.map((m) => {
                const max = Math.max(...stats.topModels.map((x) => x.n));
                return (
                  <div key={m.model}>
                    <div className="flex justify-between text-[11.5px]"><span className="font-mono truncate">{m.model}</span><span className="text-muted shrink-0 ml-2">{m.n}</span></div>
                    <div className="h-1 rounded-full bg-[var(--panel)] mt-1"><div className="h-full rounded-full bg-[var(--accent-3)]" style={{ width: `${(m.n / max) * 100}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="panel rounded-2xl p-5">
              <h3 className="text-[13px] font-semibold mb-2.5">Plans</h3>
              {stats.plans.map((p) => (
                <div key={p.plan} className="flex justify-between text-[12px] py-1"><span className="capitalize text-muted">{p.plan}</span><span className="font-medium">{p.n}</span></div>
              ))}
            </div>
            <div className="panel rounded-2xl p-5">
              <h3 className="text-[13px] font-semibold mb-2.5">Health</h3>
              <div className="flex items-center gap-2 text-[12px]"><span className={clsx("w-2 h-2 rounded-full", stats.errors24h > 0 ? "bg-[var(--warn)]" : "bg-[var(--ok)]")} /> {stats.errors24h} API errors (24h)</div>
              <div className="text-[12px] text-muted mt-2">New users (14d): {stats.signups.reduce((a, s) => a + s.n, 0)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: color }} />{label}</span>;
}

/* ─────────────────────────── users ─────────────────────────── */

type AdminUser = {
  id: string; email: string; name: string; role: string; plan: string;
  emailVerified: boolean; imageQuotaOverride: number | null; chatQuotaOverride: number | null; audioQuotaOverride: number | null; createdAt: string;
  imagesToday: number; chatTotal: number; conversations: number;
};

function UsersTab({ currentEmail }: { currentEmail: string }) {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [quotaUser, setQuotaUser] = useState<AdminUser | null>(null);

  const load = useCallback(async (query: string) => {
    const res = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}`).then((r) => r.json()).catch(() => null);
    if (res?.ok) setUsers(res.users);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  async function updateUser(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await res.json();
    if (data.ok) {
      setUsers((s) => (s ?? []).map((u) => (u.id === id ? { ...u, ...data.user } : u)));
      toast("User updated.", "ok");
    } else toast(data.error || "Update failed.", "bad");
  }

  async function removeUser(u: AdminUser) {
    if (!window.confirm(`Delete ${u.email}? This removes all their data and cannot be undone.`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      setUsers((s) => (s ?? []).filter((x) => x.id !== u.id));
      toast("User deleted.");
    } else toast(data.error || "Delete failed.", "bad");
  }

  async function forceLogout(u: AdminUser) {
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "PUT" });
    const data = await res.json();
    toast(data.ok ? `Sessions revoked for ${u.email}.` : data.error || "Failed.", data.ok ? "ok" : "bad");
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input !pl-9" placeholder="Search by email or name…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!users ? (
        <div className="skeleton h-72 rounded-2xl" />
      ) : (
        <div className="panel rounded-2xl overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[860px]">
            <thead>
              <tr className="text-left text-muted border-b border-[var(--border)]">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-3 py-3 font-medium">Plan</th>
                <th className="px-3 py-3 font-medium">Role</th>
                <th className="px-3 py-3 font-medium">Images aujourd'hui</th>
                <th className="px-3 py-3 font-medium">Quotas perso</th>
                <th className="px-3 py-3 font-medium">Usage</th>
                <th className="px-3 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.email === currentEmail;
                return (
                  <tr key={u.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--panel)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-lg grid place-items-center text-white text-[12px] font-semibold shrink-0" style={{ background: "linear-gradient(135deg,#007bff,#ff073a)" }}>{u.name.slice(0, 1).toUpperCase()}</span>
                        <div className="min-w-0">
                          <div className="font-medium flex items-center gap-1.5 truncate">
                            {u.name}
                            {u.emailVerified && <BadgeCheck className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />}
                          </div>
                          <div className="text-[11px] text-muted truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        className="input !py-1 !px-2 !text-[12px] !w-24"
                        value={u.plan}
                        onChange={(e) => updateUser(u.id, { plan: e.target.value })}
                      >
                        <option value="free">Free</option>
                        <option value="premium">Premium</option>
                        <option value="ultra">Ultra</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        className={clsx("chip !text-[10px] font-semibold", u.role === "admin" ? "!text-[#ff073a] !border-[color-mix(in_srgb,#ff073a_45%,transparent)]" : "")}
                        onClick={() => !isSelf && updateUser(u.id, { role: u.role === "admin" ? "user" : "admin" })}
                        title={isSelf ? "You cannot change your own role" : "Toggle role"}
                      >
                        {u.role === "admin" ? <ShieldCheck className="w-3 h-3" /> : null} {u.role}
                      </button>
                    </td>
                    <td className="px-3 py-3"><Badge>{u.imagesToday}</Badge></td>
                    <td className="px-3 py-3">
                      <button className="btn !py-1 !px-2.5 !text-[11.5px]" onClick={() => setQuotaUser(u)}>
                        <SlidersHorizontal className="w-3.5 h-3.5" /> Quotas
                        {(u.imageQuotaOverride != null || u.chatQuotaOverride != null || u.audioQuotaOverride != null) && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-muted whitespace-nowrap">{u.chatTotal} msgs · {u.conversations} chats</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="p-1.5 rounded-md text-muted hover:text-[var(--text)] hover:bg-[var(--panel-strong)]" title="Revoke sessions" onClick={() => forceLogout(u)}><LogOut className="w-3.5 h-3.5" /></button>
                        <button className="p-1.5 rounded-md text-muted hover:text-[var(--bad)] hover:bg-[color-mix(in_srgb,var(--bad)_12%,transparent)]" title="Delete user" onClick={() => removeUser(u)}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {users.length === 0 && <p className="text-[13px] text-muted text-center py-10">No users found.</p>}
        </div>
      )}
      <p className="text-[11px] text-muted">Rôles, abonnements et quotas vérifiés côté serveur. Le compte admin de démarrage ne peut pas être rétrogradé ni supprimé.</p>
      {quotaUser && (
        <UserQuotaModal
          user={quotaUser}
          onClose={() => setQuotaUser(null)}
          onSaved={(u) => setUsers((s) => (s ?? []).map((x) => (x.id === quotaUser.id ? { ...x, ...u } : x)))}
        />
      )}
    </div>
  );
}

function UserQuotaModal({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: (u: Partial<AdminUser>) => void }) {
  const [img, setImg] = useState(user.imageQuotaOverride === null ? "" : String(user.imageQuotaOverride));
  const [chat, setChat] = useState(user.chatQuotaOverride === null ? "" : String(user.chatQuotaOverride));
  const [audio, setAudio] = useState(user.audioQuotaOverride === null ? "" : String(user.audioQuotaOverride));
  const [busy, setBusy] = useState(false);

  const norm = (v: string) => (v === "" ? null : Math.max(-1, parseInt(v || "0", 10)));

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageQuotaOverride: norm(img), chatQuotaOverride: norm(chat), audioQuotaOverride: norm(audio) }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.ok) {
      toast("Quotas personnalisés enregistrés.", "ok");
      onSaved(data.user);
      onClose();
    } else toast(data.error || "Échec.", "bad");
  }

  const Row = ({ label, value, set, placeholder }: { label: string; value: string; set: (v: string) => void; placeholder: string }) => (
    <div className="flex items-center justify-between gap-3">
      <div className="text-[13px] text-soft">{label}</div>
      <div className="flex items-center gap-1.5">
        <input
          className="input !py-1.5 !px-2.5 !text-[12.5px] !w-24"
          placeholder={placeholder}
          value={value}
          onChange={(e) => set(e.target.value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "").slice(0, 6))}
        />
        <button type="button" title="Illimité (−1)" className={clsx("w-8 h-8 rounded-lg border text-[15px] transition-colors", value === "-1" ? "border-[var(--accent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]" : "border-[var(--border)] text-muted hover:text-[var(--text)]")} onClick={() => set("-1")}>∞</button>
        <button type="button" title="Revenir au quota du plan" className="btn !py-1.5 !px-2.5 !text-[11.5px]" onClick={() => set("")} disabled={value === ""}>du plan</button>
      </div>
    </div>
  );

  return (
    <Modal open onClose={onClose} title={`Quotas personnalisés — ${user.email}`}>
      <p className="text-[12px] text-muted mb-4 leading-relaxed">
        Remplace les limites du plan <b className="capitalize">{user.plan}</b> pour cet utilisateur uniquement.
        Champ vide = quota du plan · <b>−1</b> = illimité · <b>0</b> = désactivé.
      </p>
      <div className="space-y-3">
        <Row label="Images / jour" value={img} set={setImg} placeholder="plan" />
        <Row label="Messages chat / jour" value={chat} set={setChat} placeholder="plan" />
        <Row label="Générations audio / jour" value={audio} set={setAudio} placeholder="plan" />
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />} Enregistrer</button>
      </div>
    </Modal>
  );
}


/* ─────────────────────────── limits & models ─────────────────────────── */

type SettingsData = {
  quotas: Record<string, { chatPerDay: number; imagesPerDay: number; audioPerDay: number; transcribePerDay: number; videoPerDay: number }>;
  features: Record<string, boolean>;
  disabled: { chat: string[]; image: string[]; audio: string[]; video: string[] };
  models: {
    chat: { id: string; title: string; health: string; vision: boolean }[];
    image: { id: string; title: string; health: string; acceptsImages: boolean }[];
    audio: { id: string; title: string; health: string; kind: string }[];
    video: { id: string; title: string; health: string }[];
  };
  provider: { keyConfigured: boolean; smtpConfigured: boolean };
};

const QUOTA_FIELDS: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "chatPerDay", label: "Chat messages / day", icon: MessageSquareText },
  { key: "imagesPerDay", label: "Images / day", icon: ImageIcon },
  { key: "audioPerDay", label: "Speech / day", icon: FileAudio },
  { key: "transcribePerDay", label: "Transcriptions / day", icon: Mic2Icon },
  { key: "videoPerDay", label: "Videos / day", icon: Clapperboard },
];

function Mic2Icon({ className }: { className?: string }) {
  return <FileAudio className={className} style={{ transform: "scaleX(-1)" }} />;
}

function LimitsTab() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/settings").then((r) => r.json()).catch(() => null);
    if (res?.ok) setData(res);
  }, []);

  useEffect(() => { load(); }, [load]);

  const features: { key: string; label: string; desc: string }[] = [
    { key: "chat", label: "AI chat", desc: "Streaming conversations" },
    { key: "images", label: "Image generation & analysis", desc: "Studio + understand uploads" },
    { key: "audio", label: "Audio", desc: "TTS + transcription" },
    { key: "video", label: "Video", desc: "Locks when no free model exists" },
    { key: "registration", label: "Registration", desc: "Allow new signups" },
  ];

  async function save(section: "quotas" | "features" | "disabledModels") {
    if (!data) return;
    setSaving(true);
    const payload: Record<string, unknown> =
      section === "quotas" ? { quotas: data.quotas } :
      section === "features" ? { features: data.features } :
      { disabledModels: data.disabled };
    const res = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const out = await res.json();
    setSaving(false);
    if (out.ok) {
      toast("Saved.", "ok");
      if (section === "disabledModels") load(); // server cleans invalid ids — resync
    } else toast(out.error || "Save failed.", "bad");
  }

  if (!data) return <div className="skeleton h-96 rounded-2xl" />;

  return (
    <div className="space-y-5">
      {/* provider banners */}
      <div className="grid sm:grid-cols-2 gap-4">
        <StatusCard ok={data.provider.keyConfigured} title="Pollinations API key" desc={data.provider.keyConfigured ? "POLLINATIONS_API_KEY is configured — AI features live." : "Not configured. Set POLLINATIONS_API_KEY in .env and restart."} />
        <StatusCard ok={data.provider.smtpConfigured} title="SMTP email" desc={data.provider.smtpConfigured ? "Verification & reset emails are being sent." : "Not configured. Codes are logged to the server console and shown in dev."} />
      </div>

      {/* quotas */}
      <section className="panel rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-[14px] font-semibold">Daily quotas per plan</h3>
            <p className="text-[11.5px] text-muted mt-0.5">
              <b className="text-soft">−1 = illimité (∞)</b> · 0 = désactivé · N = plafond quotidien · le ∞ bouton met illimité
            </p>
          </div>
          <button className="btn btn-primary !text-[12.5px]" onClick={() => save("quotas")} disabled={saving}>{saving ? <Spinner /> : <Save className="w-3.5 h-3.5" />} Save quotas</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="text-left text-muted text-[11.5px]">
                <th className="pb-3 font-medium"></th>
                {(["free", "premium", "ultra"] as const).map((p) => <th key={p} className="pb-3 font-medium capitalize">{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {QUOTA_FIELDS.map((f) => (
                <tr key={f.key} className="border-t border-[var(--border)]">
                  <td className="py-2.5 pr-4 text-[12.5px] text-soft flex items-center gap-2"><f.icon className="w-3.5 h-3.5 text-muted" /> {f.label}</td>
                  {(["free", "premium", "ultra"] as const).map((p) => (
                    <td key={p} className="py-2.5 pr-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={-1}
                          className="input !py-1.5 !px-2.5 !text-[12.5px] !w-[4.75rem]"
                          value={data.quotas[p][f.key as keyof (typeof data.quotas)["free"]]}
                          onChange={(e) =>
                            setData((d) =>
                              d ? { ...d, quotas: { ...d.quotas, [p]: { ...d.quotas[p], [f.key]: Math.max(-1, Number(e.target.value || 0)) } } } : d,
                            )
                          }
                        />
                        <button
                          type="button"
                          title="Mettre illimité (∞ / −1)"
                          className={clsx(
                            "w-7 h-7 rounded-md border text-[13px] font-semibold transition-colors",
                            data.quotas[p][f.key as keyof (typeof data.quotas)["free"]] === -1
                              ? "border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]"
                              : "border-[var(--border)] text-muted hover:border-[var(--border-strong)] hover:text-[var(--text)]",
                          )}
                          onClick={() =>
                            setData((d) =>
                              d ? { ...d, quotas: { ...d.quotas, [p]: { ...d.quotas[p], [f.key]: -1 } } } : d,
                            )
                          }
                        >
                          ∞
                        </button>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* features */}
      <section className="panel rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[14px] font-semibold">Feature switches</h3>
          <button className="btn btn-primary !text-[12.5px]" onClick={() => save("features")} disabled={saving}>{saving ? <Spinner /> : <Save className="w-3.5 h-3.5" />} Save</button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {features.map((f) => (
            <div key={f.key} className="rounded-2xl border border-[var(--border)] p-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-medium">{f.label}</div>
                <div className="text-[11px] text-muted">{f.desc}</div>
              </div>
              <Toggle on={data.features[f.key] !== false} onChange={(v) => setData((d) => (d ? { ...d, features: { ...d.features, [f.key]: v } } : d))} label={f.label} />
            </div>
          ))}
        </div>
      </section>

      {/* models */}
      <section className="panel rounded-2xl p-6">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-[14px] font-semibold flex items-center gap-2"><Cpu className="w-4 h-4 text-[var(--accent)]" /> Free model registry</h3>
            <p className="text-[11.5px] text-muted mt-0.5">Live from the Pollinations catalog — paid-only models are never listed. Toggle to disable.</p>
          </div>
          <button className="btn btn-primary !text-[12.5px]" onClick={() => save("disabledModels")} disabled={saving}>{saving ? <Spinner /> : <Save className="w-3.5 h-3.5" />} Save</button>
        </div>
        <ModelGroup title="Chat" items={data.models.chat.map((m) => ({ id: m.id, title: m.title, health: m.health, extra: m.vision ? "vision" : "" }))} disabled={data.disabled.chat} onToggle={(id, off) => setData((d) => (d ? { ...d, disabled: { ...d.disabled, chat: off ? [...d.disabled.chat, id] : d.disabled.chat.filter((x) => x !== id) } } : d))} />
        <ModelGroup title="Image" items={data.models.image.map((m) => ({ id: m.id, title: m.title, health: m.health, extra: m.acceptsImages ? "edit/i2i" : "t2i" }))} disabled={data.disabled.image} onToggle={(id, off) => setData((d) => (d ? { ...d, disabled: { ...d.disabled, image: off ? [...d.disabled.image, id] : d.disabled.image.filter((x) => x !== id) } } : d))} />
        <ModelGroup title="Audio" items={data.models.audio.map((m) => ({ id: m.id, title: m.title, health: m.health, extra: m.kind.toUpperCase() }))} disabled={data.disabled.audio} onToggle={(id, off) => setData((d) => (d ? { ...d, disabled: { ...d.disabled, audio: off ? [...d.disabled.audio, id] : d.disabled.audio.filter((x) => x !== id) } } : d))} />
        <ModelGroup title="Video" items={data.models.video.map((m) => ({ id: m.id, title: m.title, health: m.health, extra: "" }))} disabled={data.disabled.video} onToggle={(id, off) => setData((d) => (d ? { ...d, disabled: { ...d.disabled, video: off ? [...d.disabled.video, id] : d.disabled.video.filter((x) => x !== id) } } : d))} empty="No free video models in the live catalog right now." />
      </section>
    </div>
  );
}

function StatusCard({ ok, title, desc }: { ok: boolean; title: string; desc: string }) {
  return (
    <div className="panel rounded-2xl p-4 flex items-start gap-3">
      <span className={clsx("mt-1 w-2.5 h-2.5 rounded-full shrink-0", ok ? "bg-[var(--ok)]" : "bg-[var(--warn)]")} />
      <div>
        <div className="text-[13px] font-medium">{title}</div>
        <div className="text-[11.5px] text-muted mt-0.5">{desc}</div>
      </div>
    </div>
  );
}

function ModelGroup({ title, items, disabled, onToggle, empty }: { title: string; items: { id: string; title: string; health: string; extra: string }[]; disabled: string[]; onToggle: (id: string, off: boolean) => void; empty?: string }) {
  return (
    <div className="border-t border-[var(--border)] first:border-0 mt-2 pt-4 first:mt-0">
      <h4 className="text-[12px] font-semibold text-muted uppercase tracking-wider mb-2.5">{title}</h4>
      {items.length === 0 && <p className="text-[12px] text-muted">{empty ?? "None."}</p>}
      <div className="flex flex-wrap gap-1.5">
        {items.map((m) => {
          const off = disabled.includes(m.id);
          return (
            <button
              key={m.id}
              onClick={() => onToggle(m.id, !off)}
              className={clsx(
                "chip !text-[11px] !py-1.5 !px-2.5 transition-all",
                off ? "opacity-40 line-through" : "hover:border-[var(--border-strong)]",
              )}
              title={off ? "Disabled — click to enable" : "Enabled — click to disable"}
            >
              <span className={clsx("w-1.5 h-1.5 rounded-full", m.health === "healthy" ? "bg-[var(--ok)]" : "bg-[var(--warn)]")} />
              {m.title}
              {m.extra && <span className="text-[9.5px] text-muted">{m.extra}</span>}
              {off && <X className="w-3 h-3" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── errors ─────────────────────────── */

type ErrorRow = { id: string; endpoint: string; message: string; statusCode: number | null; createdAt: string };

function ErrorsTab() {
  const [errors, setErrors] = useState<ErrorRow[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/errors").then((r) => r.json()).catch(() => null);
    if (res?.ok) setErrors(res.errors);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function clearAll() {
    if (!window.confirm("Clear all logged errors?")) return;
    await fetch("/api/admin/errors", { method: "DELETE" });
    load();
    toast("Error log cleared.");
  }

  if (!errors) return <div className="skeleton h-64 rounded-2xl" />;
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-[12.5px] text-muted">{errors.length} most recent entries (provider status codes & messages)</p>
        <button className="btn btn-danger !text-[12.5px]" onClick={clearAll} disabled={errors.length === 0}><Trash2 className="w-3.5 h-3.5" /> Clear all</button>
      </div>
      <div className="panel rounded-2xl overflow-x-auto">
        <table className="w-full text-[12px] min-w-[640px]">
          <thead>
            <tr className="text-left text-muted border-b border-[var(--border)]">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-3 py-3 font-medium">Endpoint</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((e) => (
              <tr key={e.id} className="border-b border-[var(--border)] last:border-0 align-top">
                <td className="px-4 py-2.5 text-muted whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2.5 font-mono whitespace-nowrap">{e.endpoint}</td>
                <td className="px-3 py-2.5">{e.statusCode ? <Badge tone={e.statusCode >= 500 ? "bad" : "warn"}>{e.statusCode}</Badge> : <span className="text-muted">—</span>}</td>
                <td className="px-3 py-2.5 text-soft max-w-md"><span className="line-clamp-3">{e.message}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {errors.length === 0 && <p className="text-[13px] text-muted text-center py-12">No errors logged. Looking healthy.</p>}
      </div>
    </div>
  );
}
