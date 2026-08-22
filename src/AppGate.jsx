import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./components/Auth";
import ResetPassword from "./components/ResetPassword";
import App from "./App";

export default function AppGate() {
  const [session, setSession] = useState(undefined); // undefined = carregando, null = sem sessão
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="rz-app min-h-screen flex items-center justify-center" style={{ "--paper": "#eef1e7", "--ink": "#1e2b23" }}>
        <span className="rz-mono text-sm" style={{ color: "var(--ink-soft)" }}>Carregando…</span>
      </div>
    );
  }

  if (recoveryMode) {
    return <ResetPassword onDone={() => setRecoveryMode(false)} />;
  }

  return session ? <App /> : <Auth />;
}
