import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { supabaseConfigured } from "./lib/supabase";
import Agenda from "./pages/Agenda";
import Channels from "./pages/Channels";
import Clients from "./pages/Clients";
import Goals from "./pages/Goals";
import Issues from "./pages/Issues";
import Journey from "./pages/Journey";
import Login from "./pages/Login";
import Opportunities from "./pages/Opportunities";
import Overview from "./pages/Overview";
import ProposalEditor from "./pages/ProposalEditor";
import Proposals from "./pages/Proposals";
import RiskZero from "./pages/RiskZero";
import Settings from "./pages/Settings";
import Stock from "./pages/Stock";

export default function App() {
  const { session, member, loading, isAdmin } = useAuth();

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg p-8 text-sm">
        <h1 className="mb-2 text-xl font-semibold">Configuração pendente</h1>
        <p>
          Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja <code>.env.example</code>).
        </p>
      </div>
    );
  }
  if (loading) return <Spinner />;
  if (!session) return <Login />;
  if (!member) {
    return (
      <div className="mx-auto max-w-lg p-8 text-sm">
        <h1 className="mb-2 text-xl font-semibold">Acesso não liberado</h1>
        <p>Sua conta ainda não está ativa na equipe. Peça a um administrador para liberar o acesso.</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="oportunidades" element={<Opportunities />} />
        <Route path="clientes" element={<Clients />} />
        <Route path="canais" element={<Channels />} />
        <Route path="jornada" element={<Journey />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="propostas" element={<Proposals />} />
        <Route path="propostas/:id" element={<ProposalEditor />} />
        <Route path="risco-zero" element={<RiskZero />} />
        <Route path="estoque" element={<Stock />} />
        <Route path="metas" element={<Goals />} />
        <Route path="pendencias" element={<Issues />} />
        <Route path="configuracoes" element={isAdmin ? <Settings /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
