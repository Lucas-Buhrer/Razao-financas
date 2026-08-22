import { useState } from "react";
import { BookOpen, Check } from "lucide-react";
import { supabase } from "../supabaseClient";

export default function Auth() {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signupDone, setSignupDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) { setError("Preencha e-mail e senha."); return; }
    if (password.length < 6) { setError("A senha precisa ter pelo menos 6 caracteres."); return; }

    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        setSignupDone(true);
      }
    } catch (err) {
      setError(translateError(err.message));
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
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
          {mode === "login" ? "Entre para acessar seu controle financeiro." : "Crie sua conta para começar."}
        </p>

        {signupDone ? (
          <div className="text-sm p-4 rounded-lg" style={{ background: "var(--emerald-soft)", color: "var(--emerald)" }}>
            <div className="flex items-center gap-2 font-semibold mb-1"><Check size={16} /> Conta criada!</div>
            Confira seu e-mail para confirmar o cadastro antes de entrar.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>E-mail</label>
              <input type="email" autoComplete="email" className="rz-input rz-focus" placeholder="voce@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Senha</label>
              <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} className="rz-input rz-focus" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {error && <div className="text-xs" style={{ color: "var(--brick)" }}>{error}</div>}

            <button type="submit" disabled={loading} className="rz-btn-primary rz-focus text-sm mt-1 disabled:opacity-60">
              {loading ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
            </button>
          </form>
        )}

        {!signupDone && (
          <button
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
            className="rz-focus text-xs mt-5 block mx-auto"
            style={{ color: "var(--ink-soft)" }}
          >
            {mode === "login" ? "Não tem conta? Criar uma agora" : "Já tem conta? Entrar"}
          </button>
        )}
      </div>
    </div>
  );
}

function translateError(msg) {
  if (!msg) return "Algo deu errado. Tente novamente.";
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("User already registered")) return "Já existe uma conta com esse e-mail.";
  if (msg.includes("Password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (msg.includes("Email not confirmed")) return "Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).";
  return msg;
}
