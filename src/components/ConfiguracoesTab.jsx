import { useEffect, useRef, useState } from "react";
import { Check, Copy, Plus, RotateCcw, Users } from "lucide-react";
import { supabase } from "../supabaseClient";
import { resetStorageCache } from "../storage";
import { COLOR_PALETTE, DEFAULT_THEME, THEME_PRESETS } from "../lib/constants";
import { CategoryRow } from "./common";

function ConfiguracoesTab({
  theme, setTheme,
  categoriesByType, customCategories, categoryForm, setCategoryForm, categoryError,
  onAddCategory, onDeleteCategory, onUpdateCategory, onSortCategories, onMoveCategory, hiddenCategoriesCount, onRestoreCategories,
  banksList, customBanks, bankForm, setBankForm, bankError,
  onAddBank, onDeleteBank, onUpdateBank, hiddenBanksCount, onRestoreBanks,
  onExportBackup, onImportBackup, backupMessage, onResetData,
}) {
  const [subTab, setSubTab] = useState("tema");
  const SUB_TABS = [
    { id: "tema", label: "Tema" },
    { id: "categorias", label: "Categorias" },
    { id: "contas", label: "Contas e Bancos" },
    { id: "backup", label: "Backup" },
    { id: "familia", label: "Família" },
    { id: "conta-usuario", label: "Conta" },
  ];

  return (
    <div>
      <header className="mb-6">
        <h1 className="rz-display text-2xl md:text-3xl">Configurações</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Personalize cores, categorias e contas do sistema.</p>
      </header>

      <div className="flex gap-2 mb-6 flex-wrap">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className="rz-focus text-sm font-medium px-4 py-2 rounded-lg"
            style={subTab === t.id
              ? { background: "var(--ink)", color: "var(--paper)" }
              : { background: "var(--surface)", color: "var(--ink-soft)", border: "1px solid var(--line)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "tema" && <TemaSection theme={theme} setTheme={setTheme} />}

      {subTab === "categorias" && (
        <CategoriasTab
          categoriesByType={categoriesByType}
          customCategories={customCategories}
          categoryForm={categoryForm}
          setCategoryForm={setCategoryForm}
          categoryError={categoryError}
          onAdd={onAddCategory}
          onDelete={onDeleteCategory}
          onUpdate={onUpdateCategory}
          onSort={onSortCategories}
          onMove={onMoveCategory}
          hiddenCount={hiddenCategoriesCount}
          onRestore={onRestoreCategories}
        />
      )}

      {subTab === "contas" && (
        <BancosTab
          banksList={banksList}
          customBanks={customBanks}
          bankForm={bankForm}
          setBankForm={setBankForm}
          bankError={bankError}
          onAdd={onAddBank}
          onDelete={onDeleteBank}
          onUpdate={onUpdateBank}
          hiddenCount={hiddenBanksCount}
          onRestore={onRestoreBanks}
        />
      )}

      {subTab === "backup" && (
        <BackupSection onExport={onExportBackup} onImport={onImportBackup} message={backupMessage} />
      )}

      {subTab === "familia" && <HouseholdSection />}

      {subTab === "conta-usuario" && <ContaSection onResetData={onResetData} />}
    </div>
  );
}

function BackupSection({ onExport, onImport, message }) {
  const fileInputRef = useRef(null);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="rz-card p-5">
        <h2 className="text-sm font-semibold mb-1">Baixar backup</h2>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          Baixa um arquivo com todos os seus dados: lançamentos, categorias, contas fixas, orçamento, metas e poupança.
        </p>
        <button onClick={onExport} className="rz-btn-primary rz-focus text-sm inline-flex items-center gap-2">
          Baixar backup (.json)
        </button>
      </div>

      <div className="rz-card p-5">
        <h2 className="text-sm font-semibold mb-1">Restaurar backup</h2>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          Selecione um arquivo de backup exportado anteriormente. <strong>Isso substitui todos os dados atuais.</strong>
        </p>
        <input
          type="file"
          accept=".json,application/json"
          ref={fileInputRef}
          className="hidden"
          onChange={(e) => { if (e.target.files[0]) onImport(e.target.files[0]); e.target.value = ""; }}
        />
        <button onClick={() => fileInputRef.current?.click()} className="rz-btn-ghost rz-focus text-sm">
          Selecionar arquivo de backup
        </button>
        {message && (
          <div className="text-xs mt-3" style={{ color: message.type === "success" ? "var(--emerald)" : "var(--brick)" }}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}

function HouseholdSection() {
  const [code, setCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerateCode = async () => {
    setLoading(true); setError(""); setSuccess(""); setCopied(false);
    try {
      const { data, error } = await supabase.rpc("create_invite_code");
      if (error) throw error;
      setCode(data);
    } catch (err) {
      setError(err.message || "Não foi possível gerar o código.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) { setError("Informe o código de convite."); return; }
    if (!window.confirm("Isso vai unir os dados que você já tem aos dados da família do código informado. Essa ação não pode ser desfeita. Deseja continuar?")) return;
    setLoading(true); setError(""); setSuccess("");
    try {
      const { error } = await supabase.rpc("join_household", { invite_code: joinCode.trim() });
      if (error) throw error;
      resetStorageCache();
      setSuccess("Você entrou na família! Recarregando a página…");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(err.message || "Código inválido ou expirado.");
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="grid lg:grid-cols-2 gap-6 mb-4">
        <div className="rz-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Users size={16} style={{ color: "var(--ink-soft)" }} />
            <h2 className="text-sm font-semibold">Convidar alguém da família</h2>
          </div>
          <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
            Gere um código e compartilhe com quem você quer que veja e edite os mesmos dados financeiros que você.
          </p>
          <button onClick={handleGenerateCode} disabled={loading} className="rz-btn-primary rz-focus text-sm disabled:opacity-60">
            {loading && !code ? "Gerando…" : "Gerar código de convite"}
          </button>
          {code && (
            <div className="flex items-center gap-2 mt-4">
              <span className="rz-mono text-lg font-semibold px-4 py-2 rounded-lg" style={{ background: "var(--paper-alt)", letterSpacing: "0.1em" }}>{code}</span>
              <button onClick={handleCopy} className="rz-btn-ghost rz-focus text-xs !py-2 flex items-center gap-1.5">
                <Copy size={13} /> {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          )}
          {code && <p className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>Válido por 7 dias, uso único.</p>}
        </div>

        <div className="rz-card p-5" style={{ alignSelf: "start" }}>
          <h2 className="text-sm font-semibold mb-1">Entrar em uma família existente</h2>
          <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
            Recebeu um código de alguém? Cole abaixo. <strong>Atenção:</strong> os dados que você já tem serão somados aos da família de destino.
          </p>
          <div className="flex gap-2">
            <input className="rz-input rz-focus rz-mono" placeholder="CÓDIGO" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} />
            <button onClick={handleJoin} disabled={loading} className="rz-btn-primary rz-focus text-sm whitespace-nowrap disabled:opacity-60">
              Entrar
            </button>
          </div>
        </div>
      </div>

      {error && <div className="text-xs" style={{ color: "var(--brick)" }}>{error}</div>}
      {success && <div className="text-xs" style={{ color: "var(--emerald)" }}>{success}</div>}
    </div>
  );
}

function ContaSection({ onResetData }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email || ""));
  }, []);

  const handleChangePassword = async () => {
    setError(""); setSuccess(false);
    if (password.length < 6) { setError("A nova senha precisa ter pelo menos 6 caracteres."); return; }
    if (password !== confirm) { setError("As senhas não coincidem."); return; }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setPassword(""); setConfirm("");
    } catch (err) {
      setError(err.message || "Não foi possível alterar a senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="rz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-1">Sua conta</h2>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>{email}</p>
        <button onClick={() => supabase.auth.signOut()} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3">
          Sair da conta
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rz-card p-5">
          <h2 className="text-sm font-semibold mb-4">Alterar senha</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Nova senha</label>
              <input type="password" autoComplete="new-password" className="rz-input rz-focus" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Confirmar nova senha</label>
              <input type="password" autoComplete="new-password" className="rz-input rz-focus" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <div className="text-xs" style={{ color: "var(--brick)" }}>{error}</div>}
            {success && <div className="text-xs" style={{ color: "var(--emerald)" }}>Senha alterada com sucesso.</div>}
            <button onClick={handleChangePassword} disabled={loading} className="rz-btn-primary rz-focus text-sm mt-1 disabled:opacity-60">
              {loading ? "Salvando…" : "Salvar nova senha"}
            </button>
          </div>
        </div>

        <div className="rz-card p-5" style={{ borderColor: "var(--brick)" }}>
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--brick)" }}>Zona de risco</h2>
          <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
            Apaga todos os lançamentos salvos. Essa ação não pode ser desfeita.
          </p>
          <button
            onClick={onResetData}
            className="rz-btn-ghost rz-focus text-sm"
            style={{ color: "var(--brick)", borderColor: "var(--brick)" }}
          >
            Limpar todos os dados
          </button>
        </div>
      </div>
    </div>
  );
}

function TemaSection({ theme, setTheme }) {
  const updateColor = (key, value) => setTheme((t) => ({ ...t, [key]: value }));
  const applyPreset = (colors) => setTheme(colors);
  const resetDefault = () => setTheme(DEFAULT_THEME);

  const fields = [
    { key: "paper", label: "Fundo", hint: "Cor de fundo geral do sistema" },
    { key: "ink", label: "Texto / Tinta", hint: "Cor do texto e da barra lateral" },
    { key: "emerald", label: "Receitas", hint: "Usada em receitas, saldo positivo e destaques" },
    { key: "brick", label: "Despesas", hint: "Usada em despesas e alertas" },
    { key: "gold", label: "Pendências", hint: "Usada em pendências, vencimentos e metas" },
  ];

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="rz-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Cores do sistema</h2>
          <button onClick={resetDefault} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3 flex items-center gap-1.5">
            <RotateCcw size={13} /> Restaurar padrão
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {fields.map((f, i) => (
            <div key={f.key} className="flex items-center justify-between gap-3 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
              <div className="min-w-0">
                <div className="text-sm font-medium">{f.label}</div>
                <div className="text-xs truncate" style={{ color: "var(--ink-soft)" }}>{f.hint}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="rz-mono text-xs" style={{ color: "var(--ink-soft)" }}>{theme[f.key]}</span>
                <input
                  type="color"
                  value={theme[f.key]}
                  onChange={(e) => updateColor(f.key, e.target.value)}
                  className="rz-focus"
                  style={{ width: 40, height: 32, border: "1px solid var(--line)", borderRadius: 6, padding: 2, background: "var(--surface)", cursor: "pointer" }}
                  aria-label={`Cor: ${f.label}`} title="Usar esta cor"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rz-card p-5" style={{ alignSelf: "start" }}>
        <h2 className="text-sm font-semibold mb-4">Temas prontos</h2>
        <div className="flex flex-wrap gap-3">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset.colors)}
              className="rz-focus flex flex-col items-center gap-1.5 p-2 rounded-lg"
              style={{ border: "1px solid var(--line)" }}
            >
              <div className="flex" style={{ borderRadius: 6, overflow: "hidden" }}>
                {[preset.colors.paper, preset.colors.ink, preset.colors.emerald, preset.colors.brick, preset.colors.gold].map((c, i) => (
                  <span key={i} style={{ width: 16, height: 26, background: c, display: "block" }} />
                ))}
              </div>
              <span className="text-xs">{preset.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BancosTab({ banksList, customBanks, bankForm, setBankForm, bankError, onAdd, onDelete, onUpdate, hiddenCount, onRestore }) {
  return (
    <div>
      <header className="mb-6">
        <h1 className="rz-display text-2xl md:text-3xl">Contas e Bancos</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
          Cadastre suas contas e carteiras para escolher rapidinho em cada lançamento. Os saldos aparecem na aba "Contas" do menu.
        </p>
      </header>

      <div className="rz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3">Novo banco ou conta</h2>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <input
            className="rz-input rz-focus flex-1"
            placeholder="Nome (ex: Nubank, Inter, Caixinha…)"
            value={bankForm.label}
            onChange={(e) => setBankForm({ ...bankForm, label: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
          />
          <input
            className="rz-input rz-focus rz-mono sm:w-40"
            inputMode="decimal"
            placeholder="Saldo inicial"
            value={bankForm.initialBalance}
            onChange={(e) => setBankForm({ ...bankForm, initialBalance: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
          />
          <button onClick={onAdd} className="rz-btn-primary rz-focus flex items-center justify-center gap-2 text-sm whitespace-nowrap">
            <Plus size={16} /> Adicionar
          </button>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
          O saldo inicial é quanto a conta já tinha antes de você começar a usar o Razão. Ele entra no saldo, mas não conta como receita.
        </p>

        <div className="flex items-center gap-4 mb-3 flex-wrap">
          <button
            type="button"
            onClick={() => setBankForm({ ...bankForm, kind: bankForm.kind === "cartao" ? "conta" : "cartao" })}
            className="rz-focus flex items-center gap-2 text-sm"
          >
            <span style={{
              width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--line)",
              background: bankForm.kind === "cartao" ? "var(--ink)" : "var(--surface)",
              display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {bankForm.kind === "cartao" && <Check size={12} color="var(--paper)" />}
            </span>
            É um cartão de crédito
          </button>
          {bankForm.kind === "cartao" && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: "var(--ink-soft)" }}>Fecha dia</label>
                <input type="number" min="1" max="31" className="rz-input rz-focus rz-mono" style={{ width: 68 }} placeholder="--" value={bankForm.closingDay} onChange={(e) => setBankForm({ ...bankForm, closingDay: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: "var(--ink-soft)" }}>Vence dia</label>
                <input type="number" min="1" max="31" className="rz-input rz-focus rz-mono" style={{ width: 68 }} placeholder="--" value={bankForm.dueDay} onChange={(e) => setBankForm({ ...bankForm, dueDay: e.target.value })} />
              </div>
            </>
          )}
        </div>
        {bankForm.kind === "cartao" && (
          <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
            <strong>Fechamento</strong> é quando a fatura fecha (compras depois dessa data caem na próxima). <strong>Vencimento</strong> é o dia de pagar.
          </p>
        )}

        <div className="flex flex-wrap gap-2 mb-1">
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              onClick={() => setBankForm({ ...bankForm, color })}
              className="rz-focus w-6 h-6 rounded-full"
              style={{
                background: color,
                boxShadow: bankForm.color === color ? "0 0 0 2px var(--surface), 0 0 0 4px var(--ink)" : "none",
              }}
              aria-label={`Cor ${color}`} title="Usar esta cor"
            />
          ))}
        </div>
        {bankError && <div className="text-xs mt-2" style={{ color: "var(--brick)" }}>{bankError}</div>}
      </div>

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>Seus bancos e carteiras</h3>
        {hiddenCount > 0 && (
          <button onClick={onRestore} className="rz-focus text-xs font-medium" style={{ color: "var(--emerald)" }}>
            Restaurar {hiddenCount} {hiddenCount > 1 ? "padrões removidos" : "padrão removido"}
          </button>
        )}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rz-card overflow-hidden h-fit">
          {banksList.filter((_, i) => i % 2 === 0).map((b, i) => (
            <CategoryRow key={b.id} cat={b} isFirst={i === 0} isCustom={customBanks.some((x) => x.id === b.id)} onDelete={onDelete} onUpdate={onUpdate} isBank />
          ))}
        </div>
        {banksList.length > 1 && (
          <div className="rz-card overflow-hidden h-fit">
            {banksList.filter((_, i) => i % 2 === 1).map((b, i) => (
              <CategoryRow key={b.id} cat={b} isFirst={i === 0} isCustom={customBanks.some((x) => x.id === b.id)} onDelete={onDelete} onUpdate={onUpdate} isBank />
            ))}
          </div>
        )}
      </div>
      <p className="text-xs mt-4" style={{ color: "var(--ink-soft)" }}>
        Excluir um banco não apaga lançamentos que já usam ele — eles continuam aparecendo normalmente.
      </p>
    </div>
  );
}

function CategoriasTab({ categoriesByType, customCategories, categoryForm, setCategoryForm, categoryError, onAdd, onDelete, onUpdate, onSort, onMove, hiddenCount, onRestore }) {
  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="rz-display text-2xl md:text-3xl">Categorias</h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
            Além das categorias padrão, crie as suas para deixar os lançamentos do seu jeito.
          </p>
        </div>
        {hiddenCount > 0 && (
          <button onClick={onRestore} className="rz-focus text-xs font-medium" style={{ color: "var(--emerald)" }}>
            Restaurar {hiddenCount} {hiddenCount > 1 ? "padrões removidos" : "padrão removido"}
          </button>
        )}
      </header>

      {/* New category form */}
      <div className="rz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3">Nova categoria</h2>

        <div className="rz-toggle mb-3">
          <button onClick={() => setCategoryForm({ ...categoryForm, type: "receita" })} className={categoryForm.type === "receita" ? "receita-on" : "off"}>Receita</button>
          <button onClick={() => setCategoryForm({ ...categoryForm, type: "despesa" })} className={categoryForm.type === "despesa" ? "despesa-on" : "off"}>Despesa</button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <input
            className="rz-input rz-focus flex-1"
            placeholder="Nome da categoria (ex: Pet, Viagens…)"
            value={categoryForm.label}
            onChange={(e) => setCategoryForm({ ...categoryForm, label: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
          />
          <button onClick={onAdd} className="rz-btn-primary rz-focus flex items-center justify-center gap-2 text-sm whitespace-nowrap">
            <Plus size={16} /> Adicionar
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-1">
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              onClick={() => setCategoryForm({ ...categoryForm, color })}
              className="rz-focus w-6 h-6 rounded-full"
              style={{
                background: color,
                boxShadow: categoryForm.color === color ? "0 0 0 2px var(--surface), 0 0 0 4px var(--ink)" : "none",
              }}
              aria-label={`Cor ${color}`} title="Usar esta cor"
            />
          ))}
        </div>

        {categoryError && <div className="text-xs mt-2" style={{ color: "var(--brick)" }}>{categoryError}</div>}
      </div>

      {/* Category lists */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-2 gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>Receitas</h3>
            <button onClick={() => onSort("receita")} className="rz-btn-ghost rz-focus text-xs !py-1 !px-2.5" title="Ordenar de A a Z">A → Z</button>
          </div>
          <div className="rz-card overflow-hidden">
            {categoriesByType.receita.map((c, i) => (
              <CategoryRow
                key={c.id} cat={c} isFirst={i === 0}
                isCustom={customCategories.some((x) => x.id === c.id)}
                onDelete={onDelete} onUpdate={onUpdate}
                onMove={(dir) => onMove("receita", c.id, dir)}
                primeira={i === 0} ultima={i === categoriesByType.receita.length - 1}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2 gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>Despesas</h3>
            <button onClick={() => onSort("despesa")} className="rz-btn-ghost rz-focus text-xs !py-1 !px-2.5" title="Ordenar de A a Z">A → Z</button>
          </div>
          <div className="rz-card overflow-hidden">
            {categoriesByType.despesa.map((c, i) => (
              <CategoryRow
                key={c.id} cat={c} isFirst={i === 0}
                isCustom={customCategories.some((x) => x.id === c.id)}
                onDelete={onDelete} onUpdate={onUpdate}
                onMove={(dir) => onMove("despesa", c.id, dir)}
                primeira={i === 0} ultima={i === categoriesByType.despesa.length - 1}
              />
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs mt-4" style={{ color: "var(--ink-soft)" }}>
        Excluir uma categoria não apaga lançamentos que já usam ela — eles continuam aparecendo normalmente.
      </p>
    </div>
  );
}

export { BackupSection };
export { BancosTab };
export { CategoriasTab };
export { ConfiguracoesTab };
export { ContaSection };
export { HouseholdSection };
export { TemaSection };
