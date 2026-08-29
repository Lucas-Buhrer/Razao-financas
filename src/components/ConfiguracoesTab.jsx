import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Archive, Check, Copy, CreditCard, Download, LogOut, Palette,
  Plus, RotateCcw, Search, Shield, Trash2, Upload, Users, Wallet, X,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { resetStorageCache } from "../storage";
import { COLOR_PALETTE, DEFAULT_THEME, THEME_PRESETS } from "../lib/constants";
import { colorForEmail, contraste, ehHexValido, formatCurrency } from "../lib/format";
import { CategoryRow } from "./common";

// A família depende de funções do arquivo sql/05-familia-extras.sql. Enquanto
// ele não for rodado, a tela mostra um aviso em vez de quebrar.
function rpcIndisponivel(err) {
  const texto = `${err?.message || ""} ${err?.code || ""} ${err?.details || ""}`.toLowerCase();
  return texto.includes("does not exist")
    || texto.includes("could not find")
    || texto.includes("schema cache")
    || texto.includes("42883")
    || texto.includes("pgrst202");
}

function traduzirErroFamilia(err) {
  const m = (err?.message || "").toLowerCase();
  if (m.includes("invalid") || m.includes("not found") || m.includes("no rows")) return "Código não encontrado. Confira se digitou certo.";
  if (m.includes("expired")) return "Esse código já expirou. Peça um novo.";
  if (m.includes("used")) return "Esse código já foi usado.";
  if (m.includes("already") || m.includes("same household")) return "Você já faz parte dessa família.";
  return err?.message || "Não foi possível concluir.";
}

function Aviso({ tom = "atencao", children }) {
  const cor = tom === "erro" ? "var(--brick)" : tom === "ok" ? "var(--emerald)" : "var(--gold)";
  return (
    <div role="alert" className="flex items-start gap-2 text-xs mt-3 px-3 py-2 rounded-lg" style={{ background: "var(--paper-alt)", color: "var(--ink-soft)" }}>
      <AlertTriangle size={13} style={{ color: cor, flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

// Caixinha de confirmação para ações que não têm volta: exige digitar a palavra.
function ConfirmacaoDigitada({ palavra = "APAGAR", rotulo, onConfirm, onCancel, children }) {
  const [texto, setTexto] = useState("");
  const ok = texto.trim().toUpperCase() === palavra;
  return (
    <div className="rz-card p-4 mt-3" style={{ borderColor: "var(--brick)" }}>
      <div className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>{children}</div>
      <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>
        Digite <strong className="rz-mono">{palavra}</strong> para confirmar
      </label>
      <div className="flex gap-2 flex-wrap">
        <input className="rz-input rz-focus rz-mono text-sm" style={{ width: 160 }} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
        <button onClick={() => ok && onConfirm()} disabled={!ok} className="rz-btn-primary rz-focus text-sm disabled:opacity-40" style={ok ? { background: "var(--brick)" } : undefined}>
          {rotulo}
        </button>
        <button onClick={onCancel} className="rz-btn-ghost rz-focus text-sm">Cancelar</button>
      </div>
    </div>
  );
}

// Excluir categoria/conta em uso: oferece levar os registros para outro lugar
// em vez de deixar id solto no relatório.
function ModalExclusao({ item, uso, opcoes, isBank, onConfirm, onCancel }) {
  const [destino, setDestino] = useState("");
  const emUso = uso > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div className="rz-card p-5 w-full max-w-md">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-sm font-semibold">Excluir “{item.label}”?</h2>
          <button onClick={onCancel} className="rz-focus p-1 rounded-md" aria-label="Fechar" title="Fechar" style={{ color: "var(--ink-soft)" }}><X size={16} /></button>
        </div>

        {emUso ? (
          <>
            <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
              {uso} registro{uso !== 1 ? "s" : ""} {isBank ? "usam esta conta" : "usam esta categoria"} (lançamentos, contas fixas e orçamentos).
              Sem escolher um destino, {isBank ? "eles ficam sem conta definida" : "o relatório passa a mostrar o código interno no lugar do nome"}.
            </p>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>
              Mover {isBank ? "os registros para" : "os lançamentos para"}
            </label>
            <select className="rz-input rz-focus mb-3" value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Não mover (só excluir)</option>
              {opcoes.filter((o) => o.id !== item.id).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </>
        ) : (
          <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
            Nada usa {isBank ? "esta conta" : "esta categoria"} hoje, então pode excluir sem efeito colateral.
          </p>
        )}

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => onConfirm(destino || null)} className="rz-btn-primary rz-focus text-sm" style={{ background: "var(--brick)" }}>
            {destino ? "Mover e excluir" : "Excluir"}
          </button>
          <button onClick={onCancel} className="rz-btn-ghost rz-focus text-sm">Cancelar</button>
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--ink-soft)" }}>
          Se quiser só tirar {isBank ? "a conta" : "a categoria"} dos seletores mantendo o histórico intacto, use <strong>Arquivar</strong> em vez de excluir.
        </p>
      </div>
    </div>
  );
}

function ConfiguracoesTab({
  subTab, setSubTab,
  theme, setTheme, seguirSistema, setSeguirSistema,
  categoriesByType, customCategories, categoriasArquivadas, categoryForm, setCategoryForm, categoryError, usoPorCategoria,
  onAddCategory, onDeleteCategory, onArchiveCategory, onUpdateCategory, onSortCategories, onMoveCategory,
  hiddenCategoriesCount, personalizedCategoriesCount, onRestoreCategories, onResetCategoryAppearance,
  banksList, customBanks, bancosArquivados, bankForm, setBankForm, bankError, usoPorConta,
  onAddBank, onDeleteBank, onArchiveBank, onUpdateBank, onSortBanks, onMoveBank,
  hiddenBanksCount, personalizedBanksCount, onRestoreBanks, onResetBankAppearance,
  onExportBackup, onApplyBackup, backupMessage, setBackupMessage, ultimoBackup, resumoDados,
  householdMembers, householdMemberCount, onReloadMembers, currentUserEmail,
  onResetData,
}) {
  const SUB_TABS = [
    { id: "tema", label: "Tema", icon: Palette },
    { id: "categorias", label: "Categorias", icon: Wallet },
    { id: "contas", label: "Contas e Bancos", icon: CreditCard },
    { id: "backup", label: "Backup", icon: Download },
    { id: "familia", label: "Família", icon: Users },
    { id: "conta-usuario", label: "Conta", icon: Shield },
  ];
  const refs = useRef({});

  // Navegação por seta entre as abas, como manda o padrão de tablist.
  const aoTeclar = (e, idx) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const alvo = SUB_TABS[(idx + delta + SUB_TABS.length) % SUB_TABS.length];
    setSubTab(alvo.id);
    refs.current[alvo.id]?.focus();
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="rz-display text-2xl md:text-3xl">Configurações</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
          Aparência, categorias, contas, backup, família e sua conta de acesso.
        </p>
      </header>

      <div role="tablist" aria-label="Seções de configurações" className="flex gap-2 mb-6 flex-wrap">
        {SUB_TABS.map((t, i) => {
          const ativo = subTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              id={`config-tab-${t.id}`}
              role="tab"
              aria-selected={ativo}
              aria-controls={`config-painel-${t.id}`}
              tabIndex={ativo ? 0 : -1}
              ref={(el) => { refs.current[t.id] = el; }}
              onKeyDown={(e) => aoTeclar(e, i)}
              onClick={() => setSubTab(t.id)}
              title={t.label}
              className="rz-focus text-sm font-medium px-3 sm:px-4 py-2 rounded-lg flex items-center gap-1.5"
              style={ativo
                ? { background: "var(--ink)", color: "var(--paper)" }
                : { background: "var(--surface)", color: "var(--ink-soft)", border: "1px solid var(--line)" }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`config-painel-${subTab}`} aria-labelledby={`config-tab-${subTab}`}>
        {subTab === "tema" && (
          <TemaSection theme={theme} setTheme={setTheme} seguirSistema={seguirSistema} setSeguirSistema={setSeguirSistema} />
        )}

        {subTab === "categorias" && (
          <CategoriasTab
            categoriesByType={categoriesByType}
            customCategories={customCategories}
            arquivadas={categoriasArquivadas}
            categoryForm={categoryForm}
            setCategoryForm={setCategoryForm}
            categoryError={categoryError}
            uso={usoPorCategoria}
            onAdd={onAddCategory}
            onDelete={onDeleteCategory}
            onArchive={onArchiveCategory}
            onUpdate={onUpdateCategory}
            onSort={onSortCategories}
            onMove={onMoveCategory}
            removidosCount={hiddenCategoriesCount}
            personalizadosCount={personalizedCategoriesCount}
            onRestore={onRestoreCategories}
            onResetAppearance={onResetCategoryAppearance}
          />
        )}

        {subTab === "contas" && (
          <BancosTab
            banksList={banksList}
            customBanks={customBanks}
            arquivados={bancosArquivados}
            bankForm={bankForm}
            setBankForm={setBankForm}
            bankError={bankError}
            uso={usoPorConta}
            onAdd={onAddBank}
            onDelete={onDeleteBank}
            onArchive={onArchiveBank}
            onUpdate={onUpdateBank}
            onSort={onSortBanks}
            onMove={onMoveBank}
            removidosCount={hiddenBanksCount}
            personalizadosCount={personalizedBanksCount}
            onRestore={onRestoreBanks}
            onResetAppearance={onResetBankAppearance}
          />
        )}

        {subTab === "backup" && (
          <BackupSection
            onExport={onExportBackup}
            onApply={onApplyBackup}
            message={backupMessage}
            setMessage={setBackupMessage}
            ultimoBackup={ultimoBackup}
            resumoDados={resumoDados}
          />
        )}

        {subTab === "familia" && (
          <HouseholdSection
            membros={householdMembers}
            memberCount={householdMemberCount}
            onReload={onReloadMembers}
            currentUserEmail={currentUserEmail}
          />
        )}

        {subTab === "conta-usuario" && (
          <ContaSection onResetData={onResetData} resumoDados={resumoDados} onExportBackup={onExportBackup} onReloadMembers={onReloadMembers} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Tema */

function TemaSection({ theme, setTheme, seguirSistema, setSeguirSistema }) {
  const [hexEditando, setHexEditando] = useState({});

  // Mexer numa cor à mão desliga o "acompanhar o sistema" — senão a próxima
  // troca de claro/escuro apagaria a escolha sem explicação.
  const updateColor = (key, value) => {
    if (seguirSistema) setSeguirSistema(false);
    setTheme((t) => ({ ...t, [key]: value }));
  };
  const applyPreset = (colors) => {
    if (seguirSistema) setSeguirSistema(false);
    setTheme(colors);
  };
  const resetDefault = () => {
    if (seguirSistema) setSeguirSistema(false);
    setTheme(DEFAULT_THEME);
  };

  const fields = [
    { key: "paper", label: "Fundo", hint: "Cor de fundo geral do sistema" },
    { key: "ink", label: "Texto / Tinta", hint: "Cor do texto e da barra lateral" },
    { key: "emerald", label: "Receitas", hint: "Usada em receitas, saldo positivo e destaques" },
    { key: "brick", label: "Despesas", hint: "Usada em despesas e alertas" },
    { key: "gold", label: "Pendências", hint: "Usada em pendências, vencimentos e metas" },
  ];

  // As cinco cores geram todas as variáveis do tema. Se o contraste com o fundo
  // for baixo demais, o texto some — e não dá para achar o botão de desfazer.
  const alertas = useMemo(() => {
    const lista = [];
    const c = (k) => contraste(theme.paper, theme[k]);
    if (c("ink") < 4.5) lista.push("O texto está com pouco contraste sobre o fundo — a leitura fica difícil.");
    ["emerald", "brick", "gold"].forEach((k) => {
      const nome = { emerald: "Receitas", brick: "Despesas", gold: "Pendências" }[k];
      if (c(k) < 3) lista.push(`A cor de ${nome} quase some no fundo escolhido.`);
    });
    if (contraste(theme.emerald, theme.brick) < 1.4) lista.push("Receitas e Despesas ficaram parecidas demais — é fácil confundir entrada com saída.");
    return lista;
  }, [theme]);

  const presetAtivo = THEME_PRESETS.find((p) => fields.every((f) => p.colors[f.key] === theme[f.key]));

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="rz-card p-5">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h2 className="text-sm font-semibold">Cores do sistema</h2>
          <button onClick={resetDefault} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3 flex items-center gap-1.5" title="Voltar ao tema original">
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
                <input
                  className="rz-input rz-focus rz-mono text-xs"
                  style={{ width: 92 }}
                  value={hexEditando[f.key] ?? theme[f.key]}
                  aria-label={`Código hexadecimal: ${f.label}`}
                  title="Digite o código da cor (ex: #1B5E4F)"
                  onChange={(e) => {
                    const v = e.target.value;
                    setHexEditando((h) => ({ ...h, [f.key]: v }));
                    if (ehHexValido(v)) updateColor(f.key, v.startsWith("#") ? v : `#${v}`);
                  }}
                  onBlur={() => setHexEditando((h) => ({ ...h, [f.key]: undefined }))}
                />
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

        {alertas.length > 0 && (
          <Aviso>
            {alertas.map((a, i) => <div key={i}>{a}</div>)}
            <div className="mt-1">Se ficar ilegível, use “Restaurar padrão” logo acima.</div>
          </Aviso>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <div className="rz-card p-5">
          <h2 className="text-sm font-semibold mb-4">Temas prontos</h2>
          <div className="flex flex-wrap gap-3">
            {THEME_PRESETS.map((preset) => {
              const ativo = presetAtivo && presetAtivo.name === preset.name;
              return (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(preset.colors)}
                  className="rz-focus flex flex-col items-center gap-1.5 p-2 rounded-lg"
                  title={`Aplicar o tema ${preset.name}`}
                  style={{ border: ativo ? "1px solid var(--ink)" : "1px solid var(--line)", background: ativo ? "var(--paper-alt)" : "transparent" }}
                >
                  <div className="flex" style={{ borderRadius: 6, overflow: "hidden" }}>
                    {[preset.colors.paper, preset.colors.ink, preset.colors.emerald, preset.colors.brick, preset.colors.gold].map((c, i) => (
                      <span key={i} style={{ width: 16, height: 26, background: c, display: "block" }} />
                    ))}
                  </div>
                  <span className="text-xs flex items-center gap-1">
                    {ativo && <Check size={11} />}{preset.name}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setSeguirSistema(!seguirSistema)}
            className="rz-focus flex items-center gap-2 text-sm mt-4"
          >
            <span style={{
              width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--line)",
              background: seguirSistema ? "var(--ink)" : "var(--surface)",
              display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {seguirSistema && <Check size={12} color="var(--paper)" />}
            </span>
            Acompanhar o claro/escuro do sistema
          </button>
          <p className="text-xs mt-1.5" style={{ color: "var(--ink-soft)" }}>
            Alterna sozinho entre “Razão Clássico” e “Escuro” conforme o aparelho. Escolher uma cor à mão desliga a opção.
          </p>
          <p className="text-xs mt-3" style={{ color: "var(--ink-soft)" }}>
            O tema é só seu: cada pessoa da família enxerga o que escolheu.
          </p>
        </div>

        <div className="rz-card p-5">
          <h2 className="text-sm font-semibold mb-3">Como vai ficar</h2>
          <div className="rounded-lg p-4" style={{ background: "var(--paper-alt)" }}>
            <div className="flex items-center justify-between gap-2 py-2">
              <span className="text-sm">Salário</span>
              <span className="rz-mono text-sm font-semibold" style={{ color: "var(--emerald)" }}>{formatCurrency(4200)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 py-2" style={{ borderTop: "1px solid var(--line)" }}>
              <span className="text-sm">Mercado</span>
              <span className="rz-mono text-sm font-semibold" style={{ color: "var(--brick)" }}>{formatCurrency(-386.9)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 py-2" style={{ borderTop: "1px solid var(--line)" }}>
              <span className="text-sm">Energia <span className="rz-stamp rz-stamp-pendente ml-1">Pendente</span></span>
              <span className="rz-mono text-sm font-semibold" style={{ color: "var(--gold)" }}>{formatCurrency(-172.4)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Categorias */

function CategoriasTab({
  categoriesByType, customCategories, arquivadas, categoryForm, setCategoryForm, categoryError, uso,
  onAdd, onDelete, onArchive, onUpdate, onSort, onMove, removidosCount, personalizadosCount, onRestore, onResetAppearance,
}) {
  const [busca, setBusca] = useState("");
  const [aExcluir, setAExcluir] = useState(null);
  const [verArquivadas, setVerArquivadas] = useState(false);

  const todas = [...categoriesByType.receita, ...categoriesByType.despesa];
  const coresUsadas = new Set(todas.map((c) => c.color));
  const filtrar = (lista) => (busca.trim()
    ? lista.filter((c) => c.label.toLowerCase().includes(busca.trim().toLowerCase()))
    : lista);

  const colunas = [
    { tipo: "receita", titulo: "Receitas", lista: filtrar(categoriesByType.receita), completa: categoriesByType.receita },
    { tipo: "despesa", titulo: "Despesas", lista: filtrar(categoriesByType.despesa), completa: categoriesByType.despesa },
  ];

  return (
    <div>
      <header className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Categorias</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--ink-soft)" }}>
            Além das categorias padrão, crie as suas para deixar os lançamentos do seu jeito.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {removidosCount > 0 && (
            <button onClick={onRestore} className="rz-focus text-xs font-medium" style={{ color: "var(--emerald)" }} title="Trazer de volta as categorias padrão que foram removidas">
              Restaurar {removidosCount} {removidosCount > 1 ? "padrões removidos" : "padrão removido"}
            </button>
          )}
          {personalizadosCount > 0 && (
            <button onClick={onResetAppearance} className="rz-focus text-xs font-medium" style={{ color: "var(--ink-soft)" }} title="Voltar ao nome e à cor originais das categorias padrão">
              Desfazer personalização de {personalizadosCount} padrão
            </button>
          )}
        </div>
      </header>

      {/* Nova categoria */}
      <div className="rz-card p-5 mb-6">
        <h3 className="text-sm font-semibold mb-3">Nova categoria</h3>

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
          {COLOR_PALETTE.map((color) => {
            const jaUsada = coresUsadas.has(color);
            return (
              <button
                key={color}
                onClick={() => setCategoryForm({ ...categoryForm, color })}
                className="rz-focus w-6 h-6 rounded-full"
                style={{
                  background: color,
                  opacity: jaUsada && categoryForm.color !== color ? 0.45 : 1,
                  boxShadow: categoryForm.color === color ? "0 0 0 2px var(--surface), 0 0 0 4px var(--ink)" : "none",
                }}
                aria-label={`Cor ${color}${jaUsada ? " (já usada)" : ""}`}
                title={jaUsada ? "Cor já usada por outra categoria" : "Usar esta cor"}
              />
            );
          })}
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>
          As cores mais apagadas já pertencem a outra categoria — repetir deixa os gráficos ambíguos.
        </p>

        {categoryError && <div role="alert" className="text-xs mt-2" style={{ color: "var(--brick)" }}>{categoryError}</div>}
      </div>

      {todas.length > 8 && (
        <div className="flex items-center gap-2 mb-3 rz-card px-3 py-2" style={{ maxWidth: 320 }}>
          <Search size={14} style={{ color: "var(--ink-soft)" }} />
          <input
            className="rz-focus text-sm flex-1 bg-transparent outline-none"
            placeholder="Buscar categoria"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ color: "var(--ink)" }}
          />
          {busca && (
            <button onClick={() => setBusca("")} className="rz-focus p-0.5 rounded" aria-label="Limpar busca" title="Limpar busca" style={{ color: "var(--ink-soft)" }}>
              <X size={13} />
            </button>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {colunas.map(({ tipo, titulo, lista, completa }) => (
          <div key={tipo}>
            <div className="flex items-center justify-between mb-2 gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>{titulo}</h3>
              <button onClick={() => onSort(tipo)} className="rz-btn-ghost rz-focus text-xs !py-1 !px-2.5" title="Ordenar de A a Z">A → Z</button>
            </div>
            <div className="rz-card overflow-hidden">
              {lista.length === 0 ? (
                <div className="text-xs px-3 py-4 text-center" style={{ color: "var(--ink-soft)" }}>Nenhuma categoria encontrada.</div>
              ) : lista.map((c, i) => (
                <CategoryRow
                  key={c.id} cat={c} isFirst={i === 0}
                  isCustom={customCategories.some((x) => x.id === c.id)}
                  uso={uso[c.id] || 0}
                  onDelete={(cat) => setAExcluir({ cat, tipo })}
                  onArchive={onArchive}
                  onUpdate={onUpdate}
                  onMove={busca ? undefined : (dir) => onMove(tipo, c.id, dir)}
                  primeira={completa.indexOf(c) === 0}
                  ultima={completa.indexOf(c) === completa.length - 1}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {arquivadas.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setVerArquivadas((v) => !v)} className="rz-focus text-xs font-medium flex items-center gap-1.5" style={{ color: "var(--ink-soft)" }}>
            <Archive size={13} /> {verArquivadas ? "Ocultar" : "Ver"} {arquivadas.length} categoria{arquivadas.length > 1 ? "s" : ""} arquivada{arquivadas.length > 1 ? "s" : ""}
          </button>
          {verArquivadas && (
            <div className="rz-card overflow-hidden mt-2">
              {arquivadas.map((c, i) => (
                <CategoryRow
                  key={c.id} cat={c} isFirst={i === 0} isCustom arquivado
                  uso={uso[c.id] || 0}
                  onArchive={onArchive}
                  onDelete={(cat) => setAExcluir({ cat, tipo: cat.type })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs mt-4" style={{ color: "var(--ink-soft)" }}>
        Excluir uma categoria não apaga lançamentos que já usam ela — mas, sem escolher um destino na hora de excluir,
        o relatório passa a mostrar o código interno no lugar do nome. Arquivar evita isso.
      </p>

      {aExcluir && (
        <ModalExclusao
          item={aExcluir.cat}
          uso={uso[aExcluir.cat.id] || 0}
          opcoes={categoriesByType[aExcluir.tipo] || []}
          onCancel={() => setAExcluir(null)}
          onConfirm={(destino) => { onDelete(aExcluir.cat, destino); setAExcluir(null); }}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------- Contas/Bancos */

function BancosTab({
  banksList, customBanks, arquivados, bankForm, setBankForm, bankError, uso,
  onAdd, onDelete, onArchive, onUpdate, onSort, onMove, removidosCount, personalizadosCount, onRestore, onResetAppearance,
}) {
  const [aExcluir, setAExcluir] = useState(null);
  const [verArquivados, setVerArquivados] = useState(false);

  const ativos = banksList.filter((b) => !b.arquivado);
  const contas = ativos.filter((b) => b.kind !== "cartao");
  const cartoes = ativos.filter((b) => b.kind === "cartao");
  const ehCartao = bankForm.kind === "cartao";

  const grupos = [
    { titulo: "Contas e carteiras", lista: contas, vazio: "Nenhuma conta cadastrada." },
    { titulo: "Cartões de crédito", lista: cartoes, vazio: "Nenhum cartão cadastrado." },
  ];

  return (
    <div>
      <header className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Contas e Bancos</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--ink-soft)" }}>
            Cadastre suas contas e carteiras para escolher rapidinho em cada lançamento. Os saldos aparecem na aba “Contas e Cartões”.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {removidosCount > 0 && (
            <button onClick={onRestore} className="rz-focus text-xs font-medium" style={{ color: "var(--emerald)" }} title="Trazer de volta as contas padrão removidas">
              Restaurar {removidosCount} {removidosCount > 1 ? "padrões removidos" : "padrão removido"}
            </button>
          )}
          {personalizadosCount > 0 && (
            <button onClick={onResetAppearance} className="rz-focus text-xs font-medium" style={{ color: "var(--ink-soft)" }} title="Voltar ao nome e à cor originais das contas padrão">
              Desfazer personalização de {personalizadosCount} padrão
            </button>
          )}
        </div>
      </header>

      <div className="rz-card p-5 mb-6">
        <h3 className="text-sm font-semibold mb-3">Novo banco ou conta</h3>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <input
            className="rz-input rz-focus flex-1"
            placeholder="Nome (ex: Nubank, Inter, Caixinha…)"
            value={bankForm.label}
            onChange={(e) => setBankForm({ ...bankForm, label: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
          />
          {!ehCartao && (
            <input
              className="rz-input rz-focus rz-mono sm:w-40"
              inputMode="decimal"
              placeholder="Saldo inicial"
              value={bankForm.initialBalance}
              onChange={(e) => setBankForm({ ...bankForm, initialBalance: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && onAdd()}
            />
          )}
          <button onClick={onAdd} className="rz-btn-primary rz-focus flex items-center justify-center gap-2 text-sm whitespace-nowrap">
            <Plus size={16} /> Adicionar
          </button>
        </div>
        {!ehCartao && (
          <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
            O saldo inicial é quanto a conta já tinha antes de você começar a usar o Razão. Ele entra no saldo, mas não conta como receita.
            Pode digitar com ponto e vírgula: <span className="rz-mono">1.234,56</span>.
          </p>
        )}

        <div className="flex items-center gap-4 mb-3 flex-wrap">
          <button
            type="button"
            onClick={() => setBankForm({ ...bankForm, kind: ehCartao ? "conta" : "cartao" })}
            className="rz-focus flex items-center gap-2 text-sm"
          >
            <span style={{
              width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--line)",
              background: ehCartao ? "var(--ink)" : "var(--surface)",
              display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {ehCartao && <Check size={12} color="var(--paper)" />}
            </span>
            É um cartão de crédito
          </button>
          {ehCartao && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: "var(--ink-soft)" }}>Fecha dia</label>
                <input type="number" min="1" max="31" className="rz-input rz-focus rz-mono" style={{ width: 68 }} placeholder="--" value={bankForm.closingDay} onChange={(e) => setBankForm({ ...bankForm, closingDay: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: "var(--ink-soft)" }}>Vence dia</label>
                <input type="number" min="1" max="31" className="rz-input rz-focus rz-mono" style={{ width: 68 }} placeholder="--" value={bankForm.dueDay} onChange={(e) => setBankForm({ ...bankForm, dueDay: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: "var(--ink-soft)" }}>Limite</label>
                <input className="rz-input rz-focus rz-mono" style={{ width: 120 }} inputMode="decimal" placeholder="0,00" value={bankForm.creditLimit} onChange={(e) => setBankForm({ ...bankForm, creditLimit: e.target.value })} />
              </div>
            </>
          )}
        </div>
        {ehCartao && (
          <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
            <strong>Fechamento</strong> é quando a fatura fecha (compras depois dessa data caem na próxima). <strong>Vencimento</strong> é o dia de pagar.
            O <strong>limite</strong> é opcional e mostra quanto ainda dá para gastar na aba Contas e Cartões.
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
        {bankError && <div role="alert" className="text-xs mt-2" style={{ color: "var(--brick)" }}>{bankError}</div>}
      </div>

      <div className="flex items-center justify-end mb-2">
        <button onClick={onSort} className="rz-btn-ghost rz-focus text-xs !py-1 !px-2.5" title="Ordenar de A a Z">A → Z</button>
      </div>

      <div className="flex flex-col gap-5">
        {grupos.map(({ titulo, lista, vazio }) => (
          <div key={titulo}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>{titulo}</h3>
            <div className="rz-card overflow-hidden">
              {lista.length === 0 ? (
                <div className="text-xs px-3 py-4 text-center" style={{ color: "var(--ink-soft)" }}>{vazio}</div>
              ) : lista.map((b, i) => (
                <CategoryRow
                  key={b.id} cat={b} isFirst={i === 0} isBank
                  isCustom={customBanks.some((x) => x.id === b.id)}
                  uso={uso[b.id] || 0}
                  onDelete={(bank) => setAExcluir(bank)}
                  onArchive={onArchive}
                  onUpdate={onUpdate}
                  onMove={lista.length > 1 ? (dir) => onMove(b.id, dir, lista.map((x) => x.id)) : undefined}
                  primeira={i === 0}
                  ultima={i === lista.length - 1}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {arquivados.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setVerArquivados((v) => !v)} className="rz-focus text-xs font-medium flex items-center gap-1.5" style={{ color: "var(--ink-soft)" }}>
            <Archive size={13} /> {verArquivados ? "Ocultar" : "Ver"} {arquivados.length} conta{arquivados.length > 1 ? "s" : ""} arquivada{arquivados.length > 1 ? "s" : ""}
          </button>
          {verArquivados && (
            <div className="rz-card overflow-hidden mt-2">
              {arquivados.map((b, i) => (
                <CategoryRow
                  key={b.id} cat={b} isFirst={i === 0} isBank isCustom arquivado
                  uso={uso[b.id] || 0}
                  onArchive={onArchive}
                  onDelete={(bank) => setAExcluir(bank)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs mt-4" style={{ color: "var(--ink-soft)" }}>
        Conta arquivada some dos seletores de lançamento, mas continua contando no saldo e no histórico. Excluir sem escolher um destino
        deixa os lançamentos sem conta definida.
      </p>

      {aExcluir && (
        <ModalExclusao
          item={aExcluir}
          uso={uso[aExcluir.id] || 0}
          opcoes={ativos}
          isBank
          onCancel={() => setAExcluir(null)}
          onConfirm={(destino) => { onDelete(aExcluir, destino); setAExcluir(null); }}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Backup */

function BackupSection({ onExport, onApply, message, setMessage, ultimoBackup, resumoDados }) {
  const fileInputRef = useRef(null);
  const [pendente, setPendente] = useState(null);   // backup lido, esperando confirmação
  const [modo, setModo] = useState("substituir");

  const diasDesde = ultimoBackup
    ? Math.floor((Date.now() - new Date(ultimoBackup).getTime()) / 86400000)
    : null;

  const validar = (parsed) => {
    if (!parsed || typeof parsed !== "object") return "Arquivo vazio ou fora do formato.";
    const d = parsed.data || parsed;
    if (typeof d !== "object") return "Não encontrei os dados dentro do arquivo.";
    const arrays = ["lancamentos", "categorias_personalizadas", "bancos_personalizados", "contas_fixas", "orcamentos", "poupanca", "dividas"];
    const presentes = arrays.filter((k) => k in d);
    if (presentes.length === 0) return "Este JSON não parece um backup do Razão.";
    // Um JSON válido com "lancamentos": "abc" entrava direto no estado e derrubava o app.
    const invalida = presentes.find((k) => !Array.isArray(d[k]));
    if (invalida) return `O campo “${invalida}” está corrompido (era para ser uma lista).`;
    return null;
  };

  const lerArquivo = (file) => {
    setMessage(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      let parsed;
      try {
        parsed = JSON.parse(e.target.result);
      } catch (err) {
        setMessage({ type: "error", text: "Arquivo inválido. Verifique se é um backup do Razão (.json)." });
        return;
      }
      const erro = validar(parsed);
      if (erro) { setMessage({ type: "error", text: erro }); return; }
      setPendente(parsed);
    };
    reader.onerror = () => setMessage({ type: "error", text: "Não consegui ler o arquivo." });
    reader.readAsText(file);
  };

  const d = pendente ? (pendente.data || pendente) : null;
  const contagem = (k) => (Array.isArray(d?.[k]) ? d[k].length : 0);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="rz-card p-5">
        <h2 className="text-sm font-semibold mb-1">Baixar backup</h2>
        <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
          Baixa um arquivo com todos os seus dados: lançamentos, categorias, contas, contas fixas, orçamento, caixinhas e dívidas.
        </p>
        <div className="text-xs mb-3 flex flex-col gap-0.5" style={{ color: "var(--ink-soft)" }}>
          <span>{resumoDados.lancamentos} lançamentos · {resumoDados.contas_fixas} contas fixas · {resumoDados.caixinhas} caixinhas · {resumoDados.dividas} dívidas</span>
          {diasDesde === null
            ? <span>Você ainda não baixou nenhum backup por aqui.</span>
            : <span>Último backup: {diasDesde === 0 ? "hoje" : `há ${diasDesde} dia${diasDesde > 1 ? "s" : ""}`}.</span>}
        </div>
        {diasDesde !== null && diasDesde >= 30 && (
          <Aviso>Faz mais de um mês desde o último backup. Vale baixar um novo agora.</Aviso>
        )}
        <button onClick={onExport} className="rz-btn-primary rz-focus text-sm inline-flex items-center gap-2 mt-3">
          <Download size={15} /> Baixar backup (.json)
        </button>
        <p className="text-xs mt-3" style={{ color: "var(--ink-soft)" }}>
          Os comprovantes anexados ficam guardados à parte e não entram neste arquivo — o backup registra só a lista deles.
        </p>
      </div>

      <div className="rz-card p-5">
        <h2 className="text-sm font-semibold mb-1">Restaurar backup</h2>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          Selecione um arquivo exportado anteriormente. Você confere o conteúdo antes de qualquer coisa ser alterada.
        </p>
        <input
          type="file"
          accept=".json,application/json"
          ref={fileInputRef}
          className="hidden"
          onChange={(e) => { if (e.target.files[0]) lerArquivo(e.target.files[0]); e.target.value = ""; }}
        />
        <button onClick={() => fileInputRef.current?.click()} className="rz-btn-ghost rz-focus text-sm inline-flex items-center gap-2">
          <Upload size={15} /> Selecionar arquivo de backup
        </button>

        {pendente && (
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
            <h3 className="text-sm font-semibold mb-2">Conferir antes de aplicar</h3>
            <div className="text-xs flex flex-col gap-0.5 mb-3" style={{ color: "var(--ink-soft)" }}>
              {pendente.exportedAt && <span>Gerado em {new Date(pendente.exportedAt).toLocaleString("pt-BR")}</span>}
              <span>{contagem("lancamentos")} lançamentos · {contagem("contas_fixas")} contas fixas · {contagem("poupanca")} caixinhas · {contagem("dividas")} dívidas</span>
              <span>Hoje você tem {resumoDados.lancamentos} lançamentos.</span>
            </div>

            <div className="flex flex-col gap-2 mb-3">
              {[
                { id: "substituir", titulo: "Substituir tudo", desc: "Descarta os dados atuais e usa só os do arquivo." },
                { id: "mesclar", titulo: "Mesclar", desc: "Mantém o que você tem e acrescenta o que faltar (por id)." },
              ].map((op) => (
                <button
                  key={op.id}
                  onClick={() => setModo(op.id)}
                  className="rz-focus text-left flex items-start gap-2 p-2.5 rounded-lg"
                  style={{ border: modo === op.id ? "1px solid var(--ink)" : "1px solid var(--line)" }}
                >
                  <span style={{
                    width: 15, height: 15, borderRadius: 8, marginTop: 2, flexShrink: 0,
                    border: "1.5px solid var(--line)", background: modo === op.id ? "var(--ink)" : "var(--surface)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {modo === op.id && <Check size={10} color="var(--paper)" />}
                  </span>
                  <span>
                    <span className="text-sm block">{op.titulo}</span>
                    <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{op.desc}</span>
                  </span>
                </button>
              ))}
            </div>

            <Aviso>
              Antes de aplicar, o Razão baixa sozinho uma cópia do estado atual. Se algo sair errado, é só restaurar esse arquivo.
            </Aviso>

            <div className="flex gap-2 mt-3 flex-wrap">
              <button onClick={() => { onApply(pendente, modo); setPendente(null); }} className="rz-btn-primary rz-focus text-sm">
                {modo === "mesclar" ? "Mesclar backup" : "Substituir meus dados"}
              </button>
              <button onClick={() => setPendente(null)} className="rz-btn-ghost rz-focus text-sm">Cancelar</button>
            </div>
          </div>
        )}

        {message && (
          <div role="alert" className="text-xs mt-3" style={{ color: message.type === "success" ? "var(--emerald)" : "var(--brick)" }}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Família */

function HouseholdSection({ membros, memberCount, onReload, currentUserEmail }) {
  const [code, setCode] = useState("");
  const [codigosAtivos, setCodigosAtivos] = useState([]);
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState(false);
  const [semSql, setSemSql] = useState(false);
  const [mostrarEntrar, setMostrarEntrar] = useState(false);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);

  const compartilhando = memberCount > 1;
  // Só o dono remove alguém (a regra vive no SQL; aqui é só para não
  // mostrar um botão que vai falhar).
  const souDono = membros.some((m) => m.email === currentUserEmail && m.is_owner);

  const carregarCodigos = async () => {
    try {
      const { data, error: err } = await supabase.rpc("list_invite_codes");
      if (err) throw err;
      setCodigosAtivos(Array.isArray(data) ? data : []);
    } catch (err) {
      if (rpcIndisponivel(err)) setSemSql(true);
    }
  };

  useEffect(() => { carregarCodigos(); }, []);

  const handleGenerateCode = async () => {
    setLoading(true); setError(""); setSuccess(""); setCopied(false);
    try {
      const { data, error: err } = await supabase.rpc("create_invite_code");
      if (err) throw err;
      setCode(data);
      carregarCodigos();
    } catch (err) {
      setError(traduzirErroFamilia(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (valor) => {
    navigator.clipboard.writeText(valor);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevogar = async (codigo) => {
    setError(""); setSuccess("");
    try {
      const { error: err } = await supabase.rpc("revoke_invite_code", { invite_code: codigo });
      if (err) throw err;
      if (code === codigo) setCode("");
      setSuccess("Código revogado.");
      carregarCodigos();
    } catch (err) {
      setError(rpcIndisponivel(err) ? "Revogar código exige rodar o SQL 05." : traduzirErroFamilia(err));
    }
  };

  const handleJoin = async () => {
    const limpo = joinCode.trim().toUpperCase();
    if (!limpo) { setError("Informe o código de convite."); return; }
    if (limpo.length < 4) { setError("Esse código parece curto demais. Confira com quem enviou."); return; }
    if (!window.confirm("Isso vai unir os dados que você já tem aos dados da família do código informado. Essa ação não pode ser desfeita. Deseja continuar?")) return;
    setLoading(true); setError(""); setSuccess("");
    try {
      const { error: err } = await supabase.rpc("join_household", { invite_code: limpo });
      if (err) throw err;
      resetStorageCache();
      setSuccess("Você entrou na família! Recarregando a página…");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(traduzirErroFamilia(err));
      setLoading(false);
    }
  };

  const handleRemover = async (membro) => {
    if (!window.confirm(`Remover ${membro.display_name || membro.email} da família? Os dados continuam aqui; a pessoa é que perde o acesso.`)) return;
    setError(""); setSuccess("");
    try {
      const { error: err } = await supabase.rpc("remove_household_member", { target_user_id: membro.user_id });
      if (err) throw err;
      setSuccess("Membro removido.");
      onReload();
    } catch (err) {
      setError(rpcIndisponivel(err) ? "Remover membro exige rodar o SQL 05." : traduzirErroFamilia(err));
    }
  };

  const handleSair = async () => {
    setLoading(true); setError(""); setSuccess("");
    try {
      const { error: err } = await supabase.rpc("leave_household");
      if (err) throw err;
      resetStorageCache();
      setSuccess("Você saiu da família. Recarregando…");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(rpcIndisponivel(err) ? "Sair da família exige rodar o SQL 05." : traduzirErroFamilia(err));
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="rz-card p-5 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Users size={16} style={{ color: "var(--ink-soft)" }} />
          <h2 className="text-sm font-semibold">
            {compartilhando ? `Vocês são ${memberCount} nesta família` : "Só você usa estes dados"}
          </h2>
        </div>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          Quem está na família vê e edita <strong>tudo</strong>: lançamentos, contas, cartões, contas fixas, orçamento, caixinhas e dívidas.
          O tema visual é a única coisa individual.
        </p>

        {membros.length > 0 ? (
          <div className="rz-card overflow-hidden">
            {membros.map((m, i) => {
              const sou = m.email === currentUserEmail;
              return (
                <div key={m.user_id || m.email} className="flex items-center gap-3 px-3 py-2.5" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                  <span
                    className="rz-mono text-[10px] font-semibold w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: colorForEmail(m.email), color: "#fff" }}
                  >
                    {(m.display_name || m.email || "?")[0].toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">
                      {m.display_name || m.email}
                      {sou && <span className="text-xs" style={{ color: "var(--ink-soft)" }}> · você</span>}
                      {m.is_owner && <span className="rz-mono text-[9px] ml-1.5 opacity-60">DONO</span>}
                    </div>
                    <div className="text-xs truncate" style={{ color: "var(--ink-soft)" }}>
                      {m.display_name ? `${m.email} · ` : ""}
                      {m.joined_at ? `entrou em ${new Date(m.joined_at).toLocaleDateString("pt-BR")}` : "membro"}
                    </div>
                  </div>
                  {!sou && souDono && (
                    <button onClick={() => handleRemover(m)} className="rz-focus p-1 rounded-md" aria-label="Remover da família" title="Remover da família" style={{ color: "var(--ink-soft)" }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {semSql
              ? "A lista de membros precisa das funções do arquivo sql/05-familia-extras.sql. Rode-o no Supabase para ver quem está na família."
              : "Carregando membros…"}
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-4">
        <div className="rz-card p-5">
          <h2 className="text-sm font-semibold mb-1">Convidar alguém da família</h2>
          <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
            Gere um código e compartilhe com quem você quer que veja e edite os mesmos dados financeiros que você.
          </p>
          <button onClick={handleGenerateCode} disabled={loading} className="rz-btn-primary rz-focus text-sm disabled:opacity-60">
            {loading && !code ? "Gerando…" : "Gerar código de convite"}
          </button>
          {code && (
            <>
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <span className="rz-mono text-lg font-semibold px-4 py-2 rounded-lg" style={{ background: "var(--paper-alt)", letterSpacing: "0.1em" }}>{code}</span>
                <button onClick={() => handleCopy(code)} className="rz-btn-ghost rz-focus text-xs !py-2 flex items-center gap-1.5" title="Copiar código">
                  <Copy size={13} /> {copied ? "Copiado!" : "Copiar"}
                </button>
              </div>
              <p className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>Válido por 24 horas, uso único.</p>
            </>
          )}

          {codigosAtivos.length > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Códigos ainda válidos</h3>
              <div className="flex flex-col gap-1.5">
                {codigosAtivos.map((c) => {
                  const codigo = c.code || c.invite_code || c;
                  const expira = c.expires_at ? new Date(c.expires_at) : null;
                  const dias = expira ? Math.ceil((expira.getTime() - Date.now()) / 86400000) : null;
                  return (
                    <div key={codigo} className="flex items-center gap-2">
                      <span className="rz-mono text-sm">{codigo}</span>
                      {dias !== null && (
                        <span className="text-xs" style={{ color: dias <= 1 ? "var(--gold)" : "var(--ink-soft)" }}>
                          {dias <= 0 ? "expira hoje" : `expira em ${dias} dia${dias > 1 ? "s" : ""}`}
                        </span>
                      )}
                      <button onClick={() => handleRevogar(codigo)} className="rz-focus text-xs ml-auto" style={{ color: "var(--brick)" }} title="Cancelar este código">
                        Revogar
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>
                Mandou o código para a pessoa errada? Revogue aqui que ele deixa de funcionar.
              </p>
            </div>
          )}
        </div>

        <div className="rz-card p-5">
          <h2 className="text-sm font-semibold mb-1">Entrar em uma família existente</h2>
          {compartilhando && !mostrarEntrar ? (
            <>
              <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
                Você já compartilha dados com {memberCount - 1} pessoa{memberCount - 1 > 1 ? "s" : ""}. Entrar em outra família funde tudo de novo,
                e não existe como desfazer.
              </p>
              <button onClick={() => setMostrarEntrar(true)} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3">
                Entrar em outra família mesmo assim
              </button>
            </>
          ) : (
            <>
              <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
                Recebeu um código de alguém? Cole abaixo. <strong>Atenção:</strong> os dados que você já tem serão somados aos da família de destino,
                e isso não tem volta.
              </p>
              <div className="flex gap-2">
                <input
                  className="rz-input rz-focus rz-mono"
                  placeholder="CÓDIGO"
                  maxLength={24}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/\s/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                />
                <button onClick={handleJoin} disabled={loading} className="rz-btn-primary rz-focus text-sm whitespace-nowrap disabled:opacity-60">
                  Entrar
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {compartilhando && (
        <div className="rz-card p-5" style={{ borderColor: "var(--brick)" }}>
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--brick)" }}>Sair da família</h2>
          <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
            Você passa a ter um espaço só seu, começando vazio. <strong>Os dados atuais continuam com a família</strong> — você deixa de vê-los.
            Se quiser levar uma cópia, baixe um backup antes na aba Backup.
          </p>
          {confirmandoSaida ? (
            <ConfirmacaoDigitada
              palavra="SAIR"
              rotulo="Sair da família"
              onCancel={() => setConfirmandoSaida(false)}
              onConfirm={handleSair}
            >
              Depois disso você não terá mais acesso aos lançamentos desta família.
            </ConfirmacaoDigitada>
          ) : (
            <button onClick={() => setConfirmandoSaida(true)} className="rz-btn-ghost rz-focus text-sm" style={{ color: "var(--brick)", borderColor: "var(--brick)" }}>
              Sair da família
            </button>
          )}
        </div>
      )}

      {error && <div role="alert" className="text-xs mt-3" style={{ color: "var(--brick)" }}>{error}</div>}
      {success && <div role="alert" className="text-xs mt-3" style={{ color: "var(--emerald)" }}>{success}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Conta */

const BLOCOS_RESET = [
  { id: "lancamentos", label: "Lançamentos", chave: "lancamentos" },
  { id: "contas_fixas", label: "Contas fixas", chave: "contas_fixas" },
  { id: "caixinhas", label: "Caixinhas", chave: "caixinhas" },
  { id: "dividas", label: "Dívidas", chave: "dividas" },
  { id: "orcamentos", label: "Orçamentos", chave: "orcamentos" },
  { id: "categorias", label: "Categorias personalizadas", chave: "categorias" },
  { id: "contas", label: "Contas e cartões cadastrados", chave: "contas" },
];

function forcaDaSenha(senha) {
  let pontos = 0;
  if (senha.length >= 8) pontos++;
  if (senha.length >= 12) pontos++;
  if (/[a-z]/.test(senha) && /[A-Z]/.test(senha)) pontos++;
  if (/\d/.test(senha)) pontos++;
  if (/[^\w\s]/.test(senha)) pontos++;
  if (pontos <= 2) return { nivel: 1, texto: "Fraca", cor: "var(--brick)" };
  if (pontos === 3) return { nivel: 2, texto: "Razoável", cor: "var(--gold)" };
  return { nivel: 3, texto: "Boa", cor: "var(--emerald)" };
}

function ContaSection({ onResetData, resumoDados, onExportBackup, onReloadMembers }) {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [nomeSalvo, setNomeSalvo] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [perfilMsg, setPerfilMsg] = useState(null);

  const [senhaAtual, setSenhaAtual] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [blocos, setBlocos] = useState({ lancamentos: true });
  const [confirmandoReset, setConfirmandoReset] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [excluirMsg, setExcluirMsg] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data?.user?.email || "");
      const apelido = data?.user?.user_metadata?.display_name || "";
      setNome(apelido);
      setNomeSalvo(apelido);
    });
  }, []);

  const forca = password ? forcaDaSenha(password) : null;

  const handleSalvarPerfil = async () => {
    setPerfilMsg(null);
    try {
      const payload = { data: { display_name: nome.trim() } };
      if (novoEmail.trim() && novoEmail.trim() !== email) payload.email = novoEmail.trim();
      const { error: err } = await supabase.auth.updateUser(payload);
      if (err) throw err;
      setNomeSalvo(nome.trim());
      setPerfilMsg({
        tipo: "ok",
        texto: payload.email
          ? "Apelido salvo. Enviamos um link para o novo e-mail — a troca só vale depois que você confirmar por lá."
          : "Apelido salvo.",
      });
      if (onReloadMembers) onReloadMembers();
    } catch (err) {
      setPerfilMsg({ tipo: "erro", texto: err.message || "Não foi possível salvar." });
    }
  };

  const handleChangePassword = async () => {
    setError(""); setSuccess(false);
    if (!senhaAtual) { setError("Informe sua senha atual."); return; }
    if (password.length < 8) { setError("A nova senha precisa ter pelo menos 8 caracteres."); return; }
    if (password !== confirm) { setError("As senhas não coincidem."); return; }
    if (password === senhaAtual) { setError("A nova senha precisa ser diferente da atual."); return; }

    setLoading(true);
    try {
      // Confere a senha atual antes de trocar: sem isso, quem pegasse a sessão
      // aberta trocava a senha e tomava a conta.
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: senhaAtual });
      if (authErr) { setError("Senha atual incorreta."); setLoading(false); return; }

      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;

      // Derruba as outras sessões, mantendo esta.
      try { await supabase.auth.signOut({ scope: "others" }); } catch (e) { /* opcional */ }

      setSuccess(true);
      setSenhaAtual(""); setPassword(""); setConfirm("");
    } catch (err) {
      setError(err.message || "Não foi possível alterar a senha.");
    } finally {
      setLoading(false);
    }
  };

  const handleExcluirConta = async () => {
    setExcluirMsg("");
    try {
      const { error: err } = await supabase.rpc("delete_my_account");
      if (err) throw err;
      await supabase.auth.signOut();
      window.location.reload();
    } catch (err) {
      setExcluirMsg(rpcIndisponivel(err)
        ? "Excluir a conta exige rodar o arquivo sql/05-familia-extras.sql no Supabase."
        : (err.message || "Não foi possível excluir a conta."));
    }
  };

  const algumBloco = Object.values(blocos).some(Boolean);
  const totalAfetado = BLOCOS_RESET
    .filter((b) => blocos[b.id])
    .reduce((s, b) => s + (resumoDados[b.chave] || 0), 0);

  return (
    <div>
      <div className="rz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3">Sua conta</h2>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Como você aparece para a família</label>
            <input className="rz-input rz-focus" placeholder="Ex: Ana" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>E-mail</label>
            <input className="rz-input rz-focus" type="email" placeholder={email} value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} />
          </div>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
          O apelido aparece nos avatares dos lançamentos, no lugar da primeira letra do e-mail.
          Deixe o campo de e-mail vazio para manter o atual ({email}).
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSalvarPerfil}
            disabled={nome.trim() === nomeSalvo && !novoEmail.trim()}
            className="rz-btn-primary rz-focus text-sm disabled:opacity-40"
          >
            Salvar
          </button>
          <button onClick={() => supabase.auth.signOut()} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3 flex items-center gap-1.5">
            <LogOut size={13} /> Sair da conta
          </button>
        </div>
        {perfilMsg && (
          <div role="alert" className="text-xs mt-3" style={{ color: perfilMsg.tipo === "ok" ? "var(--emerald)" : "var(--brick)" }}>
            {perfilMsg.texto}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rz-card p-5">
          <h2 className="text-sm font-semibold mb-4">Alterar senha</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Senha atual</label>
              <input type="password" autoComplete="current-password" className="rz-input rz-focus" placeholder="••••••••" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Nova senha</label>
              <input type="password" autoComplete="new-password" className="rz-input rz-focus" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
              {forca && (
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="rz-progress-track flex-1">
                    <div className="rz-progress-fill" style={{ width: `${forca.nivel * 33.3}%`, background: forca.cor }} />
                  </div>
                  <span className="text-xs" style={{ color: forca.cor }}>{forca.texto}</span>
                </div>
              )}
              <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>Mínimo de 8 caracteres. Misturar maiúsculas, números e símbolos ajuda.</p>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Confirmar nova senha</label>
              <input type="password" autoComplete="new-password" className="rz-input rz-focus" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <div role="alert" className="text-xs" style={{ color: "var(--brick)" }}>{error}</div>}
            {success && <div role="alert" className="text-xs" style={{ color: "var(--emerald)" }}>Senha alterada. As outras sessões foram desconectadas.</div>}
            <button onClick={handleChangePassword} disabled={loading} className="rz-btn-primary rz-focus text-sm mt-1 disabled:opacity-60">
              {loading ? "Salvando…" : "Salvar nova senha"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rz-card p-5" style={{ borderColor: "var(--brick)" }}>
            <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--brick)" }}>Apagar dados</h2>
            <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
              Escolha o que apagar. Antes o botão dizia “limpar todos os dados” mas só apagava os lançamentos — agora você decide bloco a bloco.
            </p>

            <div className="flex flex-col gap-1.5 mb-3">
              {BLOCOS_RESET.map((b) => {
                const marcado = !!blocos[b.id];
                const qtd = resumoDados[b.chave] || 0;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBlocos((p) => ({ ...p, [b.id]: !marcado }))}
                    className="rz-focus flex items-center gap-2 text-sm text-left"
                  >
                    <span style={{
                      width: 15, height: 15, borderRadius: 4, border: "1.5px solid var(--line)",
                      background: marcado ? "var(--brick)" : "var(--surface)",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      {marcado && <Check size={11} color="#fff" />}
                    </span>
                    <span className="flex-1">{b.label}</span>
                    <span className="rz-mono text-xs" style={{ color: "var(--ink-soft)" }}>{qtd}</span>
                  </button>
                );
              })}
            </div>

            {blocos.lancamentos && (
              <p className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>
                Os comprovantes anexados aos lançamentos apagados também serão removidos do armazenamento.
              </p>
            )}

            <button onClick={onExportBackup} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3 inline-flex items-center gap-1.5 mb-3">
              <Download size={13} /> Baixar backup antes
            </button>

            {confirmandoReset ? (
              <ConfirmacaoDigitada
                palavra="APAGAR"
                rotulo="Apagar agora"
                onCancel={() => setConfirmandoReset(false)}
                onConfirm={() => { onResetData(blocos); setConfirmandoReset(false); }}
              >
                Serão apagados {totalAfetado} registro{totalAfetado !== 1 ? "s" : ""} dos blocos marcados. Não há como desfazer.
              </ConfirmacaoDigitada>
            ) : (
              <button
                onClick={() => setConfirmandoReset(true)}
                disabled={!algumBloco}
                className="rz-btn-ghost rz-focus text-sm disabled:opacity-40"
                style={{ color: "var(--brick)", borderColor: "var(--brick)" }}
              >
                Apagar o que está marcado
              </button>
            )}
          </div>

          <div className="rz-card p-5" style={{ borderColor: "var(--brick)" }}>
            <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--brick)" }}>Excluir minha conta</h2>
            <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
              Remove seu acesso de forma definitiva. Se você for a única pessoa da família, os dados financeiros vão junto.
              Baixe um backup antes se quiser guardar uma cópia.
            </p>
            {confirmandoExclusao ? (
              <ConfirmacaoDigitada
                palavra="EXCLUIR"
                rotulo="Excluir minha conta"
                onCancel={() => setConfirmandoExclusao(false)}
                onConfirm={handleExcluirConta}
              >
                Isso encerra sua conta de acesso ao Razão. Não há como recuperar depois.
              </ConfirmacaoDigitada>
            ) : (
              <button onClick={() => setConfirmandoExclusao(true)} className="rz-btn-ghost rz-focus text-sm" style={{ color: "var(--brick)", borderColor: "var(--brick)" }}>
                Excluir minha conta
              </button>
            )}
            {excluirMsg && <div role="alert" className="text-xs mt-3" style={{ color: "var(--brick)" }}>{excluirMsg}</div>}
          </div>
        </div>
      </div>
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
