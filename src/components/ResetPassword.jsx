import { useState } from "react";
import { BookOpen, Check } from "lucide-react";
import { supabase } from "../supabaseClient";

export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("A senha precisa ter pelo menos 6 caracteres."); return; }
    if (password !== confirm) { setError("As senhas não coincidem."); return; }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
    } catch (err) {
      setError(err.message || "Não foi possível alterar a senha. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rz-app min-h-screen flex items-center justify-center p-5" style={{ "--paper": "#eef1e7", "--ink": "#1e2b23", "--emerald": "#1b5e4f", "--brick": "#a83b2e", "--gold": "#b8873a" }}>
      <div className="rz-card w-full max-w-sm p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen size={22} color="var(--ink)" strokeWidth={1.75} />
          <span className="rz-display text-xl">Razão</span>
        </div>
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>Defina sua nova senha.</p>

        {done ? (
          <div>
            <div className="text-sm p-4 rounded-lg mb-4" style={{ background: "var(--emerald-soft)", color: "var(--emerald)" }}>
              <div className="flex items-center gap-2 font-semibold mb-1"><Check size={16} /> Senha alterada!</div>
              Sua senha foi atualizada com sucesso.
            </div>
            <button onClick={onDone} className="rz-btn-primary rz-focus text-sm w-full">Continuar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Nova senha</label>
              <input type="password" autoComplete="new-password" className="rz-input rz-focus" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Confirmar nova senha</label>
              <input type="password" autoComplete="new-password" className="rz-input rz-focus" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <div className="text-xs" style={{ color: "var(--brick)" }}>{error}</div>}
            <button type="submit" disabled={loading} className="rz-btn-primary rz-focus text-sm mt-1 disabled:opacity-60">
              {loading ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
