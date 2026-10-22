import { useState, type FormEvent } from "react";
import { Button, Field, Input, cx } from "../components/ui";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name }, emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
        });
        if (error) throw error;
        setMsg({ ok: true, text: "Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre." });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + import.meta.env.BASE_URL });
        if (error) throw error;
        setMsg({ ok: true, text: "Enviamos um link para redefinir a senha." });
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setMsg({ ok: false, text: m === "Invalid login credentials" ? "E-mail ou senha incorretos." : m });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-900 p-12 text-white lg:flex">
        <div className="w-fit rounded-xl bg-white px-4 py-3">
          <img src={`${import.meta.env.BASE_URL}fertsan-logo.png`} alt="Fertsan" className="h-12" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-400">Gestão comercial · Safra 2026/2027</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight">
            Resultado primeiro.
            <br />
            <span className="text-brand-400">Risco Zero Fertsan.</span>
          </h1>
          <p className="mt-4 max-w-md text-brand-100/80">
            Oportunidades, clientes, propostas e jornada agronômica em um só lugar, com preços sempre vindos do catálogo oficial.
          </p>
        </div>
        <p className="text-xs text-brand-100/60">FERTSAN · Central comercial</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <img src={`${import.meta.env.BASE_URL}fertsan-logo.png`} alt="Fertsan" className="mx-auto mb-8 h-12 lg:hidden" />
          <div className="rounded-xl border border-brand-100 bg-white p-6 shadow-sm">
            {mode !== "reset" && (
              <div className="mb-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm">
                {(["in", "up"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cx("rounded-md py-1.5", mode === m ? "bg-white font-medium shadow-sm" : "text-ink/60")}
                  >
                    {m === "in" ? "Entrar" : "Criar conta"}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={submit} className="space-y-4">
              {mode === "up" && (
                <Field label="Nome">
                  <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
                </Field>
              )}
              <Field label="E-mail">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </Field>
              {mode !== "reset" && (
                <Field label="Senha" hint={mode === "up" ? "Mínimo de 8 caracteres." : undefined}>
                  <Input
                    type="password"
                    value={password}
                    minLength={mode === "up" ? 8 : undefined}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={mode === "up" ? "new-password" : "current-password"}
                  />
                </Field>
              )}
              {msg && <p className={cx("text-sm", msg.ok ? "text-brand-700" : "text-red-600")}>{msg.text}</p>}
              <Button className="w-full" disabled={busy}>
                {busy ? "Aguarde…" : mode === "in" ? "Entrar" : mode === "up" ? "Criar conta" : "Enviar link"}
              </Button>
            </form>
            <button
              type="button"
              onClick={() => setMode(mode === "reset" ? "in" : "reset")}
              className="mt-4 w-full text-center text-sm text-brand-700 hover:underline"
            >
              {mode === "reset" ? "Voltar ao login" : "Esqueci minha senha"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
