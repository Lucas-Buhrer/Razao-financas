import { useMemo, useState } from "react";
import { AlertCircle, Check, Copy, History, PauseCircle, Pencil, PlayCircle, Plus, Repeat, Trash2, TrendingUp, X } from "lucide-react";
import { FIXED_STATUS_CLASS, FIXED_STATUS_LABEL, MONTHS } from "../lib/constants";
import { formatCurrency, formatDateBR, dateToISO } from "../lib/format";
import { enrichFixedBills, FREQUENCIAS, custoMensalEquivalente, getAmountForPeriod } from "../lib/finance";
import { PeriodNavigator, SummaryCard } from "./common";

function FixedBillsTab({
  fixedBills, transactions, refDate, shiftMonth, categoriesByType, banksList, findCategory, findBank,
  onLaunch, onLaunchAll, onUndoLaunch, onToggleActive, onDuplicate,
  fixedForm, setFixedForm, showFixedForm, setShowFixedForm, editingFixedId, fixedFormError,
  onOpenNew, onOpenEdit, onSubmit, onDelete, onCancelForm, onTypeChange,
}) {
  const [lancando, setLancando] = useState(null);   // conta que está no modal de lançamento
  const [valorLanc, setValorLanc] = useState("");
  const [statusLanc, setStatusLanc] = useState("pago");
  const [historicoDe, setHistoricoDe] = useState(null);

  const enriched = useMemo(() => enrichFixedBills(fixedBills, transactions, refDate), [fixedBills, transactions, refDate]);

  // Só as que são cobradas neste mês (periodicidade e término já considerados)
  const doMes = enriched.filter((b) => b.active && b.aplicaNesteMes);
  const outrosMeses = enriched.filter((b) => b.active && !b.aplicaNesteMes);
  const inactiveBills = enriched.filter((b) => !b.active);

  const despesasDoMes = [...doMes].filter((b) => b.type === "despesa").sort((a, b) => a.day - b.day);
  const receitasDoMes = [...doMes].filter((b) => b.type === "receita").sort((a, b) => a.day - b.day);

  const totalDespesas = despesasDoMes.reduce((s, b) => s + b.amount, 0);
  const totalReceitas = receitasDoMes.reduce((s, b) => s + b.amount, 0);
  const launchedCount = doMes.filter((b) => b.status === "lancada").length;
  const pendentes = doMes.filter((b) => b.status !== "lancada");
  const valorPendente = pendentes.filter((b) => b.type === "despesa").reduce((s, b) => s + b.amount, 0);

  // Custo anual considera periodicidade: anual conta 1x, mensal 12x
  const custoAnual = enriched
    .filter((b) => b.active && b.type === "despesa")
    .reduce((s, b) => s + custoMensalEquivalente(b, getAmountForPeriod(b, refDate)) * 12, 0);

  // Quanto sai de cada conta neste mês
  const porConta = useMemo(() => {
    const map = {};
    despesasDoMes.forEach((b) => {
      const chave = b.account || "__sem__";
      map[chave] = (map[chave] || 0) + b.amount;
    });
    return Object.entries(map)
      .map(([id, total]) => ({
        id,
        label: id === "__sem__" ? "Sem conta definida" : (findBank(id)?.label || "conta"),
        color: id === "__sem__" ? "var(--line)" : (findBank(id)?.color || "#9A8A7A"),
        total,
      }))
      .sort((a, b) => b.total - a.total);
  }, [despesasDoMes, findBank]);

  // Histórico de valores lançados, para detectar reajustes
  const historicoDaConta = (bill) => transactions
    .filter((t) => t.recurringId === bill.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 12);

  const reajusteDe = (bill) => {
    const hist = historicoDaConta(bill);
    if (hist.length < 2) return null;
    const atual = bill.amount;
    const anterior = hist[0].amount;
    if (!anterior || anterior === atual) return null;
    const pct = ((atual - anterior) / anterior) * 100;
    return Math.abs(pct) < 1 ? null : pct;
  };

  const abrirLancamento = (b) => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    setLancando(b);
    setValorLanc(String(b.amount));
    setStatusLanc(b.dueDate > hoje ? "pendente" : "pago");
  };

  const confirmarLancamento = () => {
    const v = parseFloat(String(valorLanc).replace(",", "."));
    if (!v || v <= 0) return;
    onLaunch(lancando, v, statusLanc);
    setLancando(null);
  };

  const STATUS_LABEL = FIXED_STATUS_LABEL;
  const STATUS_CLASS = FIXED_STATUS_CLASS;

  // Linha de uma conta fixa, reutilizada nas listas de despesa e receita
  const Linha = ({ b, i }) => {
    const cat = findCategory(b.type, b.category);
    const bank = b.account ? findBank(b.account) : null;
    const freq = FREQUENCIAS[b.frequency] || FREQUENCIAS.mensal;
    const reajuste = reajusteDe(b);

    const amountEl = (
      <span className="rz-mono text-sm font-semibold" style={{ color: b.type === "receita" ? "var(--emerald)" : "var(--brick)" }}>
        {formatCurrency(b.amount)}
      </span>
    );
    const statusEl = (
      <span className={"rz-stamp shrink-0 " + STATUS_CLASS[b.status]}>
        {b.status === "atrasada" && <AlertCircle size={11} />} {STATUS_LABEL[b.status]}
      </span>
    );
    const actionBtns = (
      <div className="flex items-center gap-1 shrink-0">
        {b.status === "lancada" ? (
          <button onClick={() => onUndoLaunch(b)} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3">Desfazer</button>
        ) : (
          <button onClick={() => abrirLancamento(b)} className="rz-btn-primary rz-focus text-xs !py-1.5 !px-3">Lançar</button>
        )}
        <button onClick={() => setHistoricoDe(b)} className="rz-focus p-1.5 rounded-md" aria-label="Histórico" title="Ver histórico de valores" style={{ color: "var(--ink-soft)" }}>
          <History size={15} />
        </button>
        <button onClick={() => onDuplicate(b)} className="rz-focus p-1.5 rounded-md" aria-label="Duplicar" title="Duplicar esta conta fixa" style={{ color: "var(--ink-soft)" }}>
          <Copy size={15} />
        </button>
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
    const subtitulo = (
      <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
        {cat.label}{bank ? " · " + bank.label : ""} · Vence dia {b.dueDay}
        {freq.meses !== 1 && " · " + freq.label}
        {b.endPeriod && " · até " + b.endPeriod}
      </div>
    );
    const autoEl = b.autoLaunch ? (
      <span className="rz-mono text-[9px] px-1.5 py-0.5 rounded shrink-0" title="Lançada automaticamente quando a data chega"
        style={{ background: "var(--emerald-soft)", color: "var(--emerald)" }}>
        AUTO
      </span>
    ) : null;
    const reajusteEl = reajuste !== null ? (
      <span className="rz-mono text-[10px] px-1.5 py-0.5 rounded shrink-0" title={"Valor mudou em relação ao último lançamento"}
        style={{ background: "var(--gold-soft)", color: "var(--gold)" }}>
        {reajuste > 0 ? "+" : ""}{reajuste.toFixed(0)}%
      </span>
    ) : null;

    return (
      <div key={b.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
        <div className="flex flex-col gap-2 px-4 py-3 sm:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <span className="rz-dot" style={{ background: cat.color }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-medium truncate">{b.description}</span>
                {autoEl}
                {reajusteEl}
              </div>
              {subtitulo}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {statusEl}
            {amountEl}
          </div>
          <div className="flex items-center justify-end flex-wrap gap-1">{actionBtns}</div>
        </div>

        <div className="hidden sm:flex sm:items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="rz-dot" style={{ background: cat.color }} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-medium truncate">{b.description}</span>
                {autoEl}
                {reajusteEl}
              </div>
              {subtitulo}
            </div>
          </div>
          <div className="w-28 shrink-0 whitespace-nowrap">{amountEl}</div>
          {statusEl}
          <div className="justify-end">{actionBtns}</div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="rz-display text-2xl md:text-3xl">Contas Fixas</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
          Cadastre suas contas recorrentes e lance com um clique quando forem pagas.
        </p>
      </header>

      <PeriodNavigator periodMode="mes" refDate={refDate} shiftMonth={shiftMonth} setPeriodMode={() => {}} hideToggle />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6 items-stretch">
        <SummaryCard label="Despesas fixas do mês" value={totalDespesas} icon={Repeat} tone="brick"
          rodape={<span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>{despesasDoMes.length} conta{despesasDoMes.length !== 1 ? "s" : ""}</span>} />
        {totalReceitas > 0 ? (
          <SummaryCard label="Receitas fixas do mês" value={totalReceitas} icon={TrendingUp} tone="emerald"
            rodape={<span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>{receitasDoMes.length} recorrência{receitasDoMes.length !== 1 ? "s" : ""}</span>} />
        ) : (
          <SummaryCard label="Custo anual estimado" value={custoAnual} icon={Repeat} tone="brick"
            rodape={<span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>somando as periodicidades</span>} />
        )}
        <SummaryCard label="Ainda a lançar" value={valorPendente} icon={AlertCircle} tone={valorPendente > 0 ? "brick" : "emerald"}
          rodape={<span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>{launchedCount} lançada{launchedCount !== 1 ? "s" : ""} · {pendentes.length} pendente{pendentes.length !== 1 ? "s" : ""}</span>} />
        <div className="rz-card p-4 h-full flex items-center justify-center">
          <button onClick={onOpenNew} className="rz-btn-primary rz-focus flex items-center gap-2 text-sm whitespace-nowrap">
            <Plus size={16} /> Nova conta fixa
          </button>
        </div>
      </div>

      {totalReceitas > 0 && (
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          Custo anual estimado das despesas fixas: <span className="rz-mono font-semibold">{formatCurrency(custoAnual)}</span>
        </p>
      )}

      {pendentes.length > 0 && (
        <div className="rz-card p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {pendentes.length} conta{pendentes.length !== 1 ? "s" : ""} ainda não lançada{pendentes.length !== 1 ? "s" : ""} neste mês
            {valorPendente > 0 && <> — <span className="rz-mono font-semibold" style={{ color: "var(--brick)" }}>{formatCurrency(valorPendente)}</span></>}.
          </p>
          <button onClick={onLaunchAll} className="rz-btn-primary rz-focus text-sm whitespace-nowrap">
            Lançar todas de uma vez
          </button>
        </div>
      )}

      {enriched.length === 0 ? (
        <div className="rz-card p-10 text-center">
          <Repeat size={26} className="mx-auto mb-3" style={{ color: "var(--line)" }} />
          <div className="rz-display text-lg mb-1">Nenhuma conta fixa cadastrada</div>
          <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
            Aluguel, internet, assinaturas, IPVA… cadastre uma vez e acompanhe todo mês.
          </p>
          <button onClick={onOpenNew} className="rz-btn-primary rz-focus text-sm inline-flex items-center gap-2">
            <Plus size={16} /> Cadastrar conta fixa
          </button>
        </div>
      ) : (
        <>
          {despesasDoMes.length > 0 && (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Despesas</h3>
              <div className="rz-card overflow-hidden mb-5">
                {despesasDoMes.map((b, i) => <Linha key={b.id} b={b} i={i} />)}
              </div>
            </>
          )}

          {receitasDoMes.length > 0 && (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Receitas</h3>
              <div className="rz-card overflow-hidden mb-5">
                {receitasDoMes.map((b, i) => <Linha key={b.id} b={b} i={i} />)}
              </div>
            </>
          )}

          {porConta.length > 1 && (
            <div className="rz-card p-4 sm:p-5 mb-5">
              <h3 className="text-sm font-semibold mb-1">De onde sai o dinheiro</h3>
              <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
                Quanto precisa estar em cada conta para cobrir as fixas deste mês.
              </p>
              <div className="flex flex-col gap-2">
                {porConta.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <span className="rz-dot" style={{ background: c.color }} />
                    <span className="text-xs flex-1 truncate">{c.label}</span>
                    <div className="rz-progress-track shrink-0" style={{ width: 80 }}>
                      <div className="rz-progress-fill" style={{ width: (totalDespesas > 0 ? (c.total / totalDespesas) * 100 : 0) + "%", background: c.color }} />
                    </div>
                    <span className="rz-mono text-xs font-semibold w-24 text-right whitespace-nowrap">{formatCurrency(c.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {outrosMeses.length > 0 && (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Não cobradas neste mês</h3>
              <div className="rz-card overflow-hidden mb-5 opacity-70">
                {outrosMeses.map((b, i) => {
                  const cat = findCategory(b.type, b.category);
                  const freq = FREQUENCIAS[b.frequency] || FREQUENCIAS.mensal;
                  const encerrada = b.endPeriod && b.endPeriod < (refDate.getFullYear() + "-" + String(refDate.getMonth() + 1).padStart(2, "0"));
                  return (
                    <div key={b.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                      <span className="rz-dot" style={{ background: cat.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{b.description}</div>
                        <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                          {encerrada ? "Encerrada em " + b.endPeriod : freq.label + " · não cai neste mês"}
                        </div>
                      </div>
                      <div className="rz-mono text-sm w-28 text-right shrink-0 whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>{formatCurrency(b.amount)}</div>
                      <button onClick={() => onOpenEdit(b)} className="rz-focus p-1.5 rounded-md" aria-label="Editar" title="Editar conta fixa" style={{ color: "var(--ink-soft)" }}>
                        <Pencil size={15} />
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
                      <div className="rz-mono text-sm w-28 text-right shrink-0 whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>{formatCurrency(b.amount)}</div>
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

      {/* Modal de lançamento com valor ajustável */}
      {lancando && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: "rgba(30,43,35,0.45)" }}>
          <div className="rz-card w-full sm:max-w-sm p-5" style={{ borderRadius: "14px 14px 0 0" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="rz-display text-xl">Lançar {lancando.description}</h2>
              <button onClick={() => setLancando(null)} className="rz-focus" style={{ color: "var(--ink-soft)" }} aria-label="Fechar" title="Cancelar">
                <X size={20} />
              </button>
            </div>

            <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Valor deste mês (R$)</label>
            <input
              className="rz-input rz-focus rz-mono mb-1"
              style={{ fontSize: "1.25rem", textAlign: "center", padding: "10px" }}
              inputMode="decimal" autoFocus
              value={valorLanc}
              onChange={(e) => setValorLanc(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmarLancamento()}
            />
            <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
              Cadastrado: {formatCurrency(lancando.amount)}. Ajustar aqui vale só para este mês.
            </p>

            <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Status</label>
            <select className="rz-input rz-focus mb-1" value={statusLanc} onChange={(e) => setStatusLanc(e.target.value)}>
              <option value="pago">Já paguei</option>
              <option value="pendente">Ainda vou pagar</option>
            </select>
            <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
              Vence dia {lancando.dueDay}. Só o que está pago sai do saldo das contas.
            </p>

            <div className="flex gap-2">
              <button onClick={() => setLancando(null)} className="rz-btn-ghost rz-focus flex-1 text-sm">Cancelar</button>
              <button onClick={confirmarLancamento} className="rz-btn-primary rz-focus flex-1 text-sm flex items-center justify-center gap-2">
                <Check size={16} /> Lançar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Histórico de valores */}
      {historicoDe && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: "rgba(30,43,35,0.45)" }}>
          <div className="rz-card w-full sm:max-w-md p-5" style={{ borderRadius: "14px 14px 0 0", maxHeight: "80vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="rz-display text-xl">{historicoDe.description}</h2>
              <button onClick={() => setHistoricoDe(null)} className="rz-focus" style={{ color: "var(--ink-soft)" }} aria-label="Fechar" title="Fechar">
                <X size={20} />
              </button>
            </div>
            <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>Últimos lançamentos desta conta fixa.</p>

            {(() => {
              const hist = historicoDaConta(historicoDe);
              if (hist.length === 0) {
                return <p className="text-sm py-6 text-center" style={{ color: "var(--ink-soft)" }}>Nenhum lançamento ainda.</p>;
              }
              const valores = hist.map((h) => h.amount);
              const media = valores.reduce((s, v) => s + v, 0) / valores.length;
              const maior = Math.max(...valores);
              const menor = Math.min(...valores);
              return (
                <>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-xs">
                    <span style={{ color: "var(--ink-soft)" }}>Média: <span className="rz-mono font-semibold" style={{ color: "var(--ink)" }}>{formatCurrency(media)}</span></span>
                    <span style={{ color: "var(--ink-soft)" }}>Menor: <span className="rz-mono font-semibold" style={{ color: "var(--emerald)" }}>{formatCurrency(menor)}</span></span>
                    <span style={{ color: "var(--ink-soft)" }}>Maior: <span className="rz-mono font-semibold" style={{ color: "var(--brick)" }}>{formatCurrency(maior)}</span></span>
                  </div>
                  <div className="flex flex-col">
                    {hist.map((h, idx) => {
                      const anterior = hist[idx + 1];
                      const varia = anterior && anterior.amount ? ((h.amount - anterior.amount) / anterior.amount) * 100 : null;
                      const pctBarra = maior > 0 ? (h.amount / maior) * 100 : 0;
                      return (
                        <div key={h.id} className="flex items-center gap-2 py-2" style={{ borderTop: idx === 0 ? "none" : "1px solid var(--line)" }}>
                          <span className="rz-mono text-xs w-20 shrink-0" style={{ color: "var(--ink-soft)" }}>{formatDateBR(h.date)}</span>
                          <div className="rz-progress-track flex-1">
                            <div className="rz-progress-fill" style={{ width: pctBarra + "%", background: "var(--ink-soft)" }} />
                          </div>
                          {varia !== null && Math.abs(varia) >= 1 && (
                            <span className="rz-mono text-[10px] w-12 text-right shrink-0" style={{ color: varia > 0 ? "var(--brick)" : "var(--emerald)" }}>
                              {varia > 0 ? "+" : ""}{varia.toFixed(0)}%
                            </span>
                          )}
                          <span className="rz-mono text-sm font-semibold w-28 text-right shrink-0 whitespace-nowrap">{formatCurrency(h.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Formulário */}
      {showFixedForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: "rgba(30,43,35,0.45)" }}>
          <div className="rz-card w-full sm:max-w-md p-5 sm:p-6" style={{ borderRadius: "14px 14px 0 0", maxHeight: "90vh", overflowY: "auto" }}>
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
                <input className="rz-input rz-focus" placeholder="Ex: Aluguel, Internet, IPVA…" value={fixedForm.description} onChange={(e) => setFixedForm({ ...fixedForm, description: e.target.value })} />
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

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Com que frequência</label>
                  <select className="rz-input rz-focus" value={fixedForm.frequency || "mensal"} onChange={(e) => setFixedForm({ ...fixedForm, frequency: e.target.value })}>
                    {Object.entries(FREQUENCIAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Termina em (opcional)</label>
                  <input type="month" className="rz-input rz-focus rz-mono" value={fixedForm.endPeriod || ""} onChange={(e) => setFixedForm({ ...fixedForm, endPeriod: e.target.value })} />
                </div>
              </div>
              <p className="text-xs -mt-2" style={{ color: "var(--ink-soft)" }}>
                {(fixedForm.frequency || "mensal") !== "mensal"
                  ? "A cobrança vai se repetir a cada " + FREQUENCIAS[fixedForm.frequency].meses + " meses, a partir deste."
                  : "Use \"termina em\" para financiamentos e planos com prazo — a conta some sozinha depois."}
              </p>

              <div>
                <button
                  type="button"
                  onClick={() => setFixedForm({ ...fixedForm, autoLaunch: !fixedForm.autoLaunch })}
                  className="rz-focus flex items-center gap-2 text-sm"
                >
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--line)",
                    background: fixedForm.autoLaunch ? "var(--ink)" : "var(--surface)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {fixedForm.autoLaunch && <Check size={12} color="var(--paper)" />}
                  </span>
                  Está em débito automático
                </button>
                <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
                  O sistema lança sozinho quando a data chegar, sem você precisar clicar. Use só para o que sai da conta automaticamente.
                </p>
              </div>

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
