import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { ImportBackupCard } from "../components/ImportBackupCard";
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Table, useToast } from "../components/ui";
import { useMembers, useProducts, useSave } from "../lib/data";
import { errorMessage, money, number, toNumber } from "../lib/format";
import { check, supabase } from "../lib/supabase";
import type { Member, Product, Role } from "../lib/types";

export default function Settings() {
  const products = useProducts();
  const members = useMembers();
  const { member: me } = useAuth();
  const toast = useToast();
  const [prod, setProd] = useState<Product | "new" | null>(null);
  const [mem, setMem] = useState<Member | "new" | null>(null);

  const updMember = useSave(async (v: { id: string; patch: Partial<Member> }) => {
    check(await supabase.from("team_members").update(v.patch).eq("id", v.id));
  }, [["members"]]);

  async function changeMember(m: Member, patch: Partial<Member>) {
    if (m.id === me?.id && (patch.role && patch.role !== "admin" || patch.active === false)) {
      if (!confirm("Você vai perder o próprio acesso de administrador. Continuar?")) return;
    }
    try {
      await updMember.mutateAsync({ id: m.id, patch });
      toast("Equipe atualizada.");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <>
      <PageHeader title="Configurações" subtitle="Catálogo de produtos (fonte única de preço), equipe e importação de dados." />

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Catálogo de produtos</h2>
        <Button size="sm" onClick={() => setProd("new")}>
          <Plus size={14} /> Produto
        </Button>
      </div>
      <Table head={["Produto", "Cultura", "Preço (R$/L)", "Dose padrão", "Embalagem", "Situação", ""]}>
        {(products.data ?? []).map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3 font-medium">{p.name}</td>
            <td className="px-4 py-3 text-ink/70">{p.culture ?? "—"}</td>
            <td className="px-4 py-3">{p.price_per_l != null ? money(p.price_per_l) : <Badge tone="danger">Preço pendente</Badge>}</td>
            <td className="px-4 py-3">{number(p.default_dose_l_ha)} L/ha</td>
            <td className="px-4 py-3">{number(p.package_l)} L</td>
            <td className="px-4 py-3">
              <Badge tone={p.active ? "ok" : "neutral"}>{p.active ? "Ativo" : "Inativo"}</Badge>
            </td>
            <td className="px-4 py-3 text-right">
              <button className="text-xs text-brand-700 hover:underline" onClick={() => setProd(p)}>
                Editar
              </button>
            </td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-xs text-ink/50">Mudar um preço vale para novas propostas e oportunidades. Itens já salvos guardam o preço do momento.</p>

      <div className="mb-3 mt-10 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Equipe e acessos</h2>
        <Button size="sm" onClick={() => setMem("new")}>
          <Plus size={14} /> Pessoa
        </Button>
      </div>
      <Table head={["Nome", "E-mail", "Login", "Papel", "Acesso"]}>
        {(members.data ?? []).map((m) => (
          <tr key={m.id}>
            <td className="px-4 py-3 font-medium">{m.name}</td>
            <td className="px-4 py-3 text-ink/70">{m.email ?? "—"}</td>
            <td className="px-4 py-3">{m.user_id ? <Badge tone="ok">Conta criada</Badge> : <Badge>Sem login</Badge>}</td>
            <td className="px-4 py-3">
              <Select value={m.role} onChange={(e) => void changeMember(m, { role: e.target.value as Role })} className="w-36">
                <option value="admin">Administrador</option>
                <option value="gestor">Gestor</option>
                <option value="vendedor">Vendedor</option>
              </Select>
            </td>
            <td className="px-4 py-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={m.active} onChange={(e) => void changeMember(m, { active: e.target.checked })} /> Ativo
              </label>
            </td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-xs text-ink/50">
        Para dar acesso, cadastre a pessoa com o e-mail dela; quando ela criar a conta com esse e-mail, o acesso é ligado automaticamente.
      </p>

      <div className="mt-10">
        <ImportBackupCard />
      </div>

      <ProductDialog product={prod} onClose={() => setProd(null)} />
      <MemberDialog open={mem === "new"} onClose={() => setMem(null)} />
    </>
  );
}

function ProductDialog({ product, onClose }: { product: Product | "new" | null; onClose: () => void }) {
  const toast = useToast();
  const p = product && product !== "new" ? product : null;
  const [f, setF] = useState({ name: "", culture: "", price: "", dose: "1", pack: "5", active: true });
  const [lastId, setLastId] = useState<string | null>(null);
  const curId = product === "new" ? "new" : p?.id ?? null;
  if (curId !== lastId) {
    setLastId(curId);
    setF(
      p
        ? { name: p.name, culture: p.culture ?? "", price: p.price_per_l?.toString() ?? "", dose: String(p.default_dose_l_ha), pack: String(p.package_l), active: p.active }
        : { name: "", culture: "", price: "", dose: "1", pack: "5", active: true },
    );
  }

  const save = useSave(async () => {
    const row = {
      name: f.name.trim(),
      culture: f.culture || null,
      price_per_l: toNumber(f.price),
      default_dose_l_ha: toNumber(f.dose) ?? 1,
      package_l: toNumber(f.pack) ?? 5,
      active: f.active,
      updated_at: new Date().toISOString(),
    };
    if (p) check(await supabase.from("products").update(row).eq("id", p.id));
    else check(await supabase.from("products").insert(row));
  }, [["products"], ["opportunities"]]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync(undefined);
      toast("Produto salvo.");
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Modal open={!!product} onClose={onClose} title={p ? `Editar ${p.name}` : "Novo produto"}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        </Field>
        <Field label="Cultura">
          <Input value={f.culture} onChange={(e) => setF({ ...f, culture: e.target.value })} />
        </Field>
        <Field label="Preço (R$/L)" hint="Deixe vazio para marcar como preço pendente.">
          <Input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        </Field>
        <Field label="Dose padrão (L/ha)">
          <Input inputMode="decimal" value={f.dose} onChange={(e) => setF({ ...f, dose: e.target.value })} required />
        </Field>
        <Field label="Embalagem (L)">
          <Input inputMode="decimal" value={f.pack} onChange={(e) => setF({ ...f, pack: e.target.value })} required />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ativo
        </label>
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

function MemberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", email: "", role: "vendedor" as Role });
  const save = useSave(async () => {
    check(await supabase.from("team_members").insert({ name: f.name.trim(), email: f.email.trim().toLowerCase() || null, role: f.role }));
  }, [["members"]]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync(undefined);
      toast("Pessoa cadastrada.");
      setF({ name: "", email: "", role: "vendedor" });
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Cadastrar pessoa da equipe">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Nome">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        </Field>
        <Field label="E-mail" hint="Opcional. Necessário para a pessoa ter login.">
          <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Papel">
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            <option value="vendedor">Vendedor</option>
            <option value="gestor">Gestor</option>
            <option value="admin">Administrador</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending}>Cadastrar</Button>
        </div>
      </form>
    </Modal>
  );
}
