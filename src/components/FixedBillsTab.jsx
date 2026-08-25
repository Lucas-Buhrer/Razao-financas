import { useMemo } from "react";
import { AlertCircle, Check, PauseCircle, Pencil, PlayCircle, Plus, Repeat, Trash2, X } from "lucide-react";
import { FIXED_STATUS_CLASS, FIXED_STATUS_LABEL, MONTHS } from "../lib/constants";
import { formatCurrency } from "../lib/format";
import { enrichFixedBills } from "../lib/finance";
import { PeriodNavigator, SummaryCard } from "./common";

function FixedBillsTab({
  fixedBills, transactions, refDate, shiftMonth, categoriesByType, banksList, findCategory, findBank,
  onLaunch, onLaunchAll, onUndoLaunch, onToggleActive,
  fixedForm, setFixedForm, showFixedForm, setShowFixedForm, editingFixedId, fixedFormError,
  onOpenNew, onOpenEdit, onSubmit, onDelete, onCancelForm, onTypeChange,
}) {
  const enriched = useMemo(() => enrichFixedBills(fixedBills, transactions, refDate), [fixedBills, transactions, refDate]);

  const activeBills = [...enriched].filter((b) => b.active).sort((a, b) => a.day - b.day);
  const inactiveBills = enriched.filter((b) => !b.active);

  const totalMensal = activeBills.filter((b) => b.type === "despesa").reduce((s, b) => s + b.amount, 0);
  const launchedCount = activeBills.filter((b) => b.status === "lancada").length;

  const STATUS_LABEL = FIXED_STATUS_LABEL;
  const STATUS_CLASS = FIXED_STATUS_CLASS;

  return (
    <div>
      <header className="mb-6">
        <h1 className="rz-display text-2xl md:text-3xl">Contas Fixas</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
          Cadastre suas contas recorrentes e lance com um clique quando forem pagas.
        </p>
      </header>

      <PeriodNavigator periodMode="mes" refDate={refDate} shiftMonth={shiftMonth} setPeriodMode={() => {}} hideToggle />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <SummaryCard label="Total mensal (fixas ativas)" value={totalMensal} icon={Repeat} tone="brick" />
        <div className="rz-card p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs mb-1" style={{ color: "var(--ink-soft)" }}>Status deste mês</div>
            <div className="rz-mono text-sm">
              <span style={{ color: "var(--emerald)" }}>{launchedCount} lançada{launchedCount !== 1 ? "s" : ""}</span>
              <span style={{ color: "var(--ink-soft)" }}> · </span>
              <span style={{ color: "var(--ink-soft)" }}>{activeBills.length - launchedCount} pendente{activeBills.length - launchedCount !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <button onClick={onOpenNew} className="rz-btn-primary rz-focus flex items-center gap-2 text-sm whitespace-nowrap">
            <Plus size={16} /> Nova conta fixa
          </button>
        </div>
      </div>

      {activeBills.length - launchedCount > 0 && (
        <div className="rz-card p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {activeBills.length - launchedCount} conta{activeBills.length - launchedCount !== 1 ? "s" : ""} fixa{activeBills.length - launchedCount !== 1 ? "s" : ""} ainda não lançada{activeBills.length - launchedCount !== 1 ? "s" : ""} neste mês.
          </p>
          <button onClick={onLaunchAll} className="rz-btn-primary rz-focus text-sm whitespace-nowrap">
            Lançar todas de uma vez
          </button>
        </div>
      )}

      {activeBills.length === 0 && inactiveBills.length === 0 ? (
        <div className="rz-card p-10 text-center">
          <Repeat size={26} className="mx-auto mb-3" style={{ color: "var(--line)" }} />
          <div className="rz-display text-lg mb-1">Nenhuma conta fixa cadastrada</div>
          <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
            Aluguel, internet, assinaturas… cadastre uma vez e acompanhe todo mês.
          </p>
          <button onClick={onOpenNew} className="rz-btn-primary rz-focus text-sm inline-flex items-center gap-2">
            <Plus size={16} /> Cadastrar conta fixa
          </button>
        </div>
      ) : (
        <>
          <div className="rz-card overflow-hidden mb-4">
            {activeBills.map((b, i) => {
              const cat = findCategory(b.type, b.category);
              const bank = b.account ? findBank(b.account) : null;
              const amountEl = (
                <span className="rz-mono text-sm font-semibold" style={{ color: b.type === "receita" ? "var(--emerald)" : "var(--brick)" }}>
                  {formatCurrency(b.amount)}
                </span>
              );
              const statusEl = (
                <span className={`rz-stamp shrink-0 ${STATUS_CLASS[b.status]}`}>
                  {b.status === "atrasada" && <AlertCircle size={11} />} {STATUS_LABEL[b.status]}
                </span>
              );
              const actionBtns = (
                <div className="flex items-center gap-1.5 shrink-0">
                  {b.status === "lancada" ? (
                    <button onClick={() => onUndoLaunch(b)} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3">Desfazer</button>
                  ) : (
                    <button onClick={() => onLaunch(b)} className="rz-btn-primary rz-focus text-xs !py-1.5 !px-3">Lançar</button>
                  )}
                  <button onClick={() => onToggleActive(b)} className="rz-focus p-1.5 rounded-md" aria-label="Pausar" title="Pausar esta conta fixa" style={{ color: "var(--ink-soft)" }}>
                    <PauseCircle size={15} />
                  </button>
                  <button onClick={() => onOpenEdit(b)} className="rz-focus p-1.5 rounded-md" aria-label="Editar" title="Editar conta fixa" style={{ color: "var(--ink-soft)" }}>
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => onDelete(b)} className="rz-focus p-1.5 rounded-md" aria-label="Excluir" title="Excluir conta fixa" style={{ color: "var(--ink-soft)" }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              );

              return (
                <div key={b.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                  {/* Mobile layout */}
                  <div className="flex flex-col gap-2 px-4 py-3 sm:hidden">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="rz-dot" style={{ background: cat.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{b.description}</div>
                        <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                          {cat.label}{bank ? ` · ${bank.label}` : ""} · Vence dia {b.dueDay}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      {statusEl}
                      {amountEl}
                    </div>
                    <div className="flex items-center justify-end flex-wrap gap-1.5">{actionBtns}</div>
                  </div>

                  {/* Desktop layout */}
                  <div className="hidden sm:flex sm:items-center gap-4 px-4 py-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="rz-dot" style={{ background: cat.color }} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{b.description}</div>
                        <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                          {cat.label}{bank ? ` · ${bank.label}` : ""} · Vence dia {b.dueDay}
                        </div>
                      </div>
                    </div>
                    <div className="w-28 shrink-0">{amountEl}</div>
                    {statusEl}
                    <div className="justify-end">{actionBtns}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {inactiveBills.length > 0 && (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Pausadas</h3>
              <div className="rz-card overflow-hidden opacity-60">
                {inactiveBills.map((b, i) => {
                  const cat = findCategory(b.type, b.category);
                  return (
                    <div key={b.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                      <span className="rz-dot" style={{ background: cat.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{b.description}</div>
                        <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{cat.label} · Vence dia {b.dueDay}</div>
                      </div>
                      <div className="rz-mono text-sm w-24 text-right shrink-0" style={{ color: "var(--ink-soft)" }}>{formatCurrency(b.amount)}</div>
                      <button onClick={() => onToggleActive(b)} className="rz-focus p-1.5 rounded-md" aria-label="Reativar" title="Reativar esta conta fixa" style={{ color: "var(--emerald)" }}>
                        <PlayCircle size={15} />
                      </button>
                      <button onClick={() => onDelete(b)} className="rz-focus p-1.5 rounded-md" aria-label="Excluir" title="Excluir conta fixa" style={{ color: "var(--ink-soft)" }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Form modal */}
      {showFixedForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: "rgba(30,43,35,0.45)" }}>
          <div className="rz-card w-full sm:max-w-md p-5 sm:p-6" style={{ borderRadius: "14px 14px 0 0" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="rz-display text-xl">{editingFixedId ? "Editar conta fixa" : "Nova conta fixa"}</h2>
              <button onClick={onCancelForm} className="rz-focus" style={{ color: "var(--ink-soft)" }} aria-label="Fechar" title="Fechar sem salvar">
                <X size={20} />
              </button>
            </div>

            <div className="rz-toggle mb-4">
              <button onClick={() => onTypeChange("receita")} className={fixedForm.type === "receita" ? "receita-on" : "off"}>Receita</button>
              <button onClick={() => onTypeChange("despesa")} className={fixedForm.type === "despesa" ? "despesa-on" : "off"}>Despesa</button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Descrição</label>
                <input className="rz-input rz-focus" placeholder="Ex: Aluguel, Internet, Netflix…" value={fixedForm.description} onChange={(e) => setFixedForm({ ...fixedForm, description: e.target.value })} />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Valor a partir deste mês (R$)</label>
                  <input className="rz-input rz-focus rz-mono" inputMode="decimal" placeholder="0,00" value={fixedForm.amount} onChange={(e) => setFixedForm({ ...fixedForm, amount: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Dia do vencimento</label>
                  <input type="number" min="1" max="31" className="rz-input rz-focus rz-mono" value={fixedForm.dueDay} onChange={(e) => setFixedForm({ ...fixedForm, dueDay: e.target.value })} />
                </div>
              </div>
              {editingFixedId && (
                <p className="text-xs -mt-2" style={{ color: "var(--ink-soft)" }}>
                  Mudar o valor só afeta {MONTHS[refDate.getMonth()]}/{refDate.getFullYear()} em diante — os meses anteriores mantêm o valor antigo.
                </p>
              )}

              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Categoria</label>
                <select className="rz-input rz-focus" value={fixedForm.category} onChange={(e) => setFixedForm({ ...fixedForm, category: e.target.value })}>
                  <option value="" disabled>Selecione</option>
                  {categoriesByType[fixedForm.type].map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Banco / Conta (opcional)</label>
                <select className="rz-input rz-focus" value={fixedForm.account} onChange={(e) => setFixedForm({ ...fixedForm, account: e.target.value })}>
                  <option value="">Nenhum selecionado</option>
                  {banksList.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>

              {fixedFormError && <div className="text-xs" style={{ color: "var(--brick)" }}>{fixedFormError}</div>}

              <div className="flex gap-2 mt-2">
                <button onClick={onCancelForm} className="rz-btn-ghost rz-focus flex-1 text-sm">Cancelar</button>
                <button onClick={onSubmit} className="rz-btn-primary rz-focus flex-1 text-sm flex items-center justify-center gap-2">
                  <Check size={16} /> {editingFixedId ? "Salvar alterações" : "Adicionar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { FixedBillsTab };
