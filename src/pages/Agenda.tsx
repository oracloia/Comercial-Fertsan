import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Badge, Button, Card, Empty, Field, Input, Modal, MultiPick, PageHeader, Select, Spinner, Table, Textarea, cx, useToast } from "../components/ui";
import { displayName } from "../lib/calc";
import { setOwners, useActivities, useClients, useMembers, useOpportunities, useSave } from "../lib/data";
import { dateTimeBR, errorMessage, todayISO } from "../lib/format";
import { check, supabase } from "../lib/supabase";
import { ACTIVITY_KINDS, ACTIVITY_STATUS_LABEL, effectiveActivityStatus, type Activity } from "../lib/types";

const TONE = { agendado: "info", vencida: "danger", realizado: "ok", reagendado: "warn", cancelado: "neutral" } as const;

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function Agenda() {
  const acts = useActivities();
  const members = useMembers();
  const [view, setView] = useState<"lista" | "semana" | "mes">("lista");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cursor, setCursor] = useState(() => new Date());
  const [editing, setEditing] = useState<Activity | null>(null);
  const [creating, setCreating] = useState(false);
  const [rescheduling, setRescheduling] = useState<Activity | null>(null);
  const toast = useToast();
  const memberName = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m.name])), [members.data]);

  const rows = useMemo(
    () =>
      (acts.data ?? []).filter((a) => {
        if (owner && !(a.activity_owners ?? []).some((w) => w.member_id === owner)) return false;
        if (status && effectiveActivityStatus(a) !== status) return false;
        const day = a.starts_at.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      }),
    [acts.data, owner, status, from, to],
  );

  const setStatusMut = useSave(async (v: { id: string; status: "realizado" | "cancelado" }) => {
    check(await supabase.from("activities").update({ status: v.status }).eq("id", v.id));
  }, [["activities"]]);

  async function quick(a: Activity, s: "realizado" | "cancelado") {
    try {
      await setStatusMut.mutateAsync({ id: a.id, status: s });
      toast(s === "realizado" ? "Atividade concluída." : "Atividade cancelada.");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  const days = useMemo(() => {
    const start = new Date(cursor);
    start.setHours(0, 0, 0, 0);
    if (view === "semana") {
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    const first = new Date(start.getFullYear(), start.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i - offset + 1));
  }, [cursor, view]);

  const byDay = useMemo(() => {
    const m = new Map<string, Activity[]>();
    for (const a of rows) {
      const d = new Date(a.starts_at);
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return m;
  }, [rows]);

  function shift(n: number) {
    const d = new Date(cursor);
    if (view === "semana") d.setDate(d.getDate() + 7 * n);
    else d.setMonth(d.getMonth() + n);
    setCursor(d);
  }

  const actions = (a: Activity) => {
    const s = effectiveActivityStatus(a);
    const pending = s === "agendado" || s === "vencida";
    return (
      <div className="flex flex-wrap justify-end gap-2 text-xs">
        {pending && (
          <>
            <button className="text-brand-700 hover:underline" onClick={() => void quick(a, "realizado")}>
              Concluir
            </button>
            <button className="text-brand-700 hover:underline" onClick={() => setRescheduling(a)}>
              Reagendar
            </button>
            <button className="text-ink/50 hover:underline" onClick={() => void quick(a, "cancelado")}>
              Cancelar
            </button>
          </>
        )}
        <button className="text-brand-700 hover:underline" onClick={() => setEditing(a)}>
          Editar
        </button>
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle="Reagendar exige a nova data. Atividades agendadas com data passada aparecem como vencidas."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> Nova atividade
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {(["lista", "semana", "mes"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={cx("rounded-md px-3 py-1.5", view === v && "bg-brand-50 font-medium text-brand-800")}>
              {v === "lista" ? "Lista" : v === "semana" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
        <Select className="w-48" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Responsável">
          <option value="">Todos os responsáveis</option>
          {(members.data ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Todos os status</option>
          {Object.entries(ACTIVITY_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        {view === "lista" && (
          <>
            <Input className="w-40" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" />
            <Input className="w-40" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" />
          </>
        )}
        {view !== "lista" && (
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => shift(-1)} aria-label="Anterior">
              <ChevronLeft size={16} />
            </Button>
            <span className="min-w-36 text-center text-sm font-medium capitalize">
              {view === "mes"
                ? cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
                : `${days[0]!.toLocaleDateString("pt-BR")} – ${days[6]!.toLocaleDateString("pt-BR")}`}
            </span>
            <Button size="sm" variant="secondary" onClick={() => shift(1)} aria-label="Próximo">
              <ChevronRight size={16} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCursor(new Date())}>
              Hoje
            </Button>
          </div>
        )}
      </div>

      {acts.isLoading ? (
        <Spinner />
      ) : view === "lista" ? (
        rows.length === 0 ? (
          <Empty>Nenhuma atividade.</Empty>
        ) : (
          <Table head={["Data / hora", "Cliente", "Atividade", "Responsáveis", "Local", "Status", ""]}>
            {rows.map((a) => {
              const s = effectiveActivityStatus(a);
              return (
                <tr key={a.id}>
                  <td className="whitespace-nowrap px-4 py-3">{dateTimeBR(a.starts_at, a.all_day)}</td>
                  <td className="px-4 py-3 font-medium">{displayName(a.clients?.name ?? "—")}</td>
                  <td className="px-4 py-3 text-ink/70">{a.kind}</td>
                  <td className="px-4 py-3 text-ink/70">{(a.activity_owners ?? []).map((w) => memberName.get(w.member_id)).join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-ink/70">{a.location ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={TONE[s]}>{ACTIVITY_STATUS_LABEL[s]}</Badge>
                  </td>
                  <td className="px-4 py-3">{actions(a)}</td>
                </tr>
              );
            })}
          </Table>
        )
      ) : (
        <Card className="p-0">
          <div className="grid grid-cols-7 border-b border-slate-100 text-center text-xs font-semibold text-ink/50">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const list = byDay.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) ?? [];
              const other = view === "mes" && d.getMonth() !== cursor.getMonth();
              const isToday = d.toDateString() === new Date().toDateString();
              return (
                <div key={d.toISOString()} className={cx("min-h-28 border-b border-r border-slate-100 p-1.5", other && "bg-slate-50/60")}>
                  <p className={cx("mb-1 text-xs", isToday ? "font-bold text-brand-700" : "text-ink/50")}>{d.getDate()}</p>
                  <div className="space-y-1">
                    {list.map((a) => {
                      const s = effectiveActivityStatus(a);
                      return (
                        <button
                          key={a.id}
                          onClick={() => setEditing(a)}
                          className={cx(
                            "block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px]",
                            s === "vencida" ? "bg-red-50 text-red-700" : s === "realizado" ? "bg-emerald-50 text-emerald-800" : s === "agendado" ? "bg-brand-50 text-brand-800" : "bg-slate-100 text-ink/50 line-through",
                          )}
                          title={`${a.kind} — ${a.clients?.name ?? ""}`}
                        >
                          {!a.all_day && new Date(a.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{" "}
                          {displayName(a.clients?.name ?? a.title)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <ActivityDialog open={creating || !!editing} activity={editing} onClose={() => (setCreating(false), setEditing(null))} />
      <RescheduleDialog activity={rescheduling} onClose={() => setRescheduling(null)} />
    </>
  );
}

function ActivityDialog({ open, activity, onClose }: { open: boolean; activity: Activity | null; onClose: () => void }) {
  const clients = useClients();
  const opps = useOpportunities();
  const members = useMembers();
  const { member } = useAuth();
  const toast = useToast();
  const [clientId, setClientId] = useState("");
  const [oppId, setOppId] = useState("");
  const [kind, setKind] = useState(ACTIVITY_KINDS[0]!);
  const [start, setStart] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [owners, setOwnersState] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setClientId(activity?.client_id ?? "");
    setOppId(activity?.opportunity_id ?? "");
    setKind(activity?.kind ?? ACTIVITY_KINDS[0]!);
    setStart(activity ? toLocalInput(activity.starts_at) : `${todayISO()}T08:30`);
    setAllDay(activity?.all_day ?? false);
    setLocation(activity?.location ?? "");
    setNotes(activity?.notes ?? "");
    setOwnersState(activity ? (activity.activity_owners ?? []).map((w) => w.member_id) : member ? [member.id] : []);
  }, [open, activity, member]);

  const save = useSave(async () => {
    if (owners.length === 0) throw new Error("Escolha ao menos um responsável.");
    const row = {
      client_id: clientId || null,
      opportunity_id: oppId || null,
      title: kind,
      kind,
      starts_at: new Date(allDay ? `${start.slice(0, 10)}T12:00` : start).toISOString(),
      all_day: allDay,
      location: location || null,
      notes: notes || null,
    };
    let id = activity?.id;
    if (id) check(await supabase.from("activities").update(row).eq("id", id));
    else id = (check(await supabase.from("activities").insert(row).select("id").single()) as { id: string }).id;
    await setOwners("activity_owners", "activity_id", id, owners);
  }, [["activities"]]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync(undefined);
      toast("Atividade salva.");
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  const clientOpps = (opps.data ?? []).filter((o) => o.client_id === clientId);

  return (
    <Modal open={open} onClose={onClose} title={activity ? "Editar atividade" : "Nova atividade"}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Cliente" className="sm:col-span-2">
          <Select value={clientId} onChange={(e) => (setClientId(e.target.value), setOppId(""))}>
            <option value="">— sem cliente —</option>
            {(clients.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {displayName(c.name)}
              </option>
            ))}
          </Select>
        </Field>
        {clientOpps.length > 0 && (
          <Field label="Oportunidade" className="sm:col-span-2">
            <Select value={oppId} onChange={(e) => setOppId(e.target.value)}>
              <option value="">—</option>
              {clientOpps.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.products?.name} · {o.stage}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Atividade">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {ACTIVITY_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
        <Field label={allDay ? "Data" : "Data e hora"}>
          <Input type={allDay ? "date" : "datetime-local"} value={allDay ? start.slice(0, 10) : start} onChange={(e) => setStart(allDay ? `${e.target.value}T08:30` : e.target.value)} required />
          <label className="mt-1 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Dia inteiro
          </label>
        </Field>
        <Field label="Local" className="sm:col-span-2">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Cidade-UF ou fazenda" />
        </Field>
        <Field label="Responsáveis" className="sm:col-span-2">
          <MultiPick options={(members.data ?? []).filter((m) => m.active)} value={owners} onChange={setOwnersState} />
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

function RescheduleDialog({ activity, onClose }: { activity: Activity | null; onClose: () => void }) {
  const toast = useToast();
  const [when, setWhen] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    setWhen("");
    setReason("");
  }, [activity]);
  const save = useSave(async () => {
    if (!activity) return;
    if (!when) throw new Error("Informe a nova data.");
    check(await supabase.rpc("reschedule_activity", { p_id: activity.id, p_new_start: new Date(when).toISOString(), p_reason: reason || null }));
  }, [["activities"]]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync(undefined);
      toast("Atividade reagendada.");
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }
  return (
    <Modal open={!!activity} onClose={onClose} title="Reagendar atividade">
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-sm text-ink/60">
          {activity?.kind} — {displayName(activity?.clients?.name ?? "")}, hoje em {activity ? dateTimeBR(activity.starts_at, activity.all_day) : ""}
        </p>
        <Field label="Nova data e hora">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
        </Field>
        <Field label="Motivo (opcional)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending}>Reagendar</Button>
        </div>
      </form>
    </Modal>
  );
}
