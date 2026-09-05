import { useMemo, useState } from "react";
import { Check, HandCoins, Pencil, Plus, RotateCcw, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import { formatCurrency, formatDateBR, parseMoedaBR } from "../lib/format";
import { SummaryCard } from "./common";

function DividasTab({ debts, debtForm, setDebtForm, showDebtForm, editingDebtId, debtError, onOpenNew, onOpenEdit, onSubmit, onDelete, onCancelForm, onPayment, onToggleSettled, categoriesByType, banksList }) {
  const abertas = debts.filter((d) => !d.settled);
  const quitadas = debts.filter((d) => d.settled);

  const aReceber = abertas.filter((d) => d.direction === "emprestei").reduce((s, d) => s + (d.amount - (d.paid || 0)), 0);
  const aPagar = abertas.filter((d) => d.direction === "devo").reduce((s, d) => s + (d.amount - (d.paid || 0)), 0);
  const minhasDividas = abertas.filter((d) => d.direction === "devo");

  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="rz-display text-2xl md:text-3xl">Dívidas</h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Dinheiro que você emprestou ou pegou emprestado.</p>
        </div>
        <button onClick={onOpenNew} className="rz-btn-primary rz-focus flex items-center gap-2 text-sm whitespace-nowrap">
          <Plus size={16} /> Nova dívida
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <SummaryCard label="Tenho a receber" value={aReceber} icon={TrendingUp} tone="emerald" />
        <SummaryCard label="Tenho a pagar" value={aPagar} icon={TrendingDown} tone="brick" />
      </div>

      {minhasDividas.length > 1 && (
        <EstrategiaQuitacao dividas={minhasDividas} />
      )}

      {debts.length === 0 ? (
        <div className="rz-card p-10 text-center">
          <HandCoins size={26} className="mx-auto mb-3" style={{ color: "var(--line)" }} />
          <div className="rz-display text-lg mb-1">Nenhuma dívida registrada</div>
          <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>Registre o que você emprestou ou o que deve, para não perder de vista.</p>
          <button onClick={onOpenNew} className="rz-btn-primary rz-focus text-sm inline-flex items-center gap-2">
            <Plus size={16} /> Registrar dívida
          </button>
        </div>
      ) : (
        <>
          {abertas.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              {abertas.map((d) => <DebtCard key={d.id} debt={d} onEdit={onOpenEdit} onDelete={onDelete} onPayment={onPayment} onToggleSettled={onToggleSettled} categoriesByType={categoriesByType} banksList={banksList} />)}
            </div>
          )}

          {quitadas.length > 0 && (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Quitadas</h3>
              <div className="rz-card overflow-hidden opacity-70">
                {quitadas.map((d, i) => (
                  <div key={d.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                    <span className="rz-dot" style={{ background: d.direction === "emprestei" ? "var(--emerald)" : "var(--brick)" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{d.person}</div>
                      <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                        {d.direction === "emprestei" ? "Emprestei" : "Devia"} · {formatDateBR(d.date)}
                      </div>
                    </div>
                    <span className="rz-mono text-sm whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>{formatCurrency(d.amount)}</span>
                    <button onClick={() => onToggleSettled(d)} className="rz-focus p-1.5 rounded-md" aria-label="Reabrir" title="Reabrir esta dívida" style={{ color: "var(--ink-soft)" }}>
                      <RotateCcw size={14} />
                    </button>
                    <button onClick={() => onDelete(d)} className="rz-focus p-1.5 rounded-md" aria-label="Excluir" title="Excluir dívida" style={{ color: "var(--ink-soft)" }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {showDebtForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: "rgba(30,43,35,0.45)" }}>
          <div className="rz-card w-full sm:max-w-md p-5 sm:p-6" style={{ borderRadius: "14px 14px 0 0", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="rz-display text-xl">{editingDebtId ? "Editar dívida" : "Nova dívida"}</h2>
              <button onClick={onCancelForm} className="rz-focus" style={{ color: "var(--ink-soft)" }} aria-label="Fechar" title="Fechar sem salvar"><X size={20} /></button>
            </div>

            <div className="rz-toggle mb-4">
              <button onClick={() => setDebtForm({ ...debtForm, direction: "emprestei" })} className={debtForm.direction === "emprestei" ? "receita-on" : "off"}>Emprestei</button>
              <button onClick={() => setDebtForm({ ...debtForm, direction: "devo" })} className={debtForm.direction === "devo" ? "despesa-on" : "off"}>Devo</button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>
                  {debtForm.direction === "emprestei" ? "Para quem emprestei" : "Para quem devo"}
                </label>
                <input className="rz-input rz-focus" placeholder="Nome da pessoa ou instituição" value={debtForm.person} onChange={(e) => setDebtForm({ ...debtForm, person: e.target.value })} />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Valor (R$)</label>
                  <input className="rz-input rz-focus rz-mono" inputMode="decimal" placeholder="0,00" value={debtForm.amount} onChange={(e) => setDebtForm({ ...debtForm, amount: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Data</label>
                  <input type="date" className="rz-input rz-focus rz-mono" value={debtForm.date} onChange={(e) => setDebtForm({ ...debtForm, date: e.target.value })} />
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Previsão de acerto (opcional)</label>
                  <input type="date" className="rz-input rz-focus rz-mono" value={debtForm.dueDate} onChange={(e) => setDebtForm({ ...debtForm, dueDate: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Juros ao mês (%)</label>
                  <input className="rz-input rz-focus rz-mono" inputMode="decimal" placeholder="0" value={debtForm.interestRate} onChange={(e) => setDebtForm({ ...debtForm, interestRate: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Observações (opcional)</label>
                <input className="rz-input rz-focus" placeholder="Ex: combinamos parcelar em 3x" value={debtForm.notes} onChange={(e) => setDebtForm({ ...debtForm, notes: e.target.value })} />
              </div>

              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                Dívidas não entram como receita nem despesa — elas só registram o que ainda vai ser acertado.
              </p>

              {debtError && <div className="text-xs" style={{ color: "var(--brick)" }}>{debtError}</div>}

              <div className="flex gap-2 mt-1">
                <button onClick={onCancelForm} className="rz-btn-ghost rz-focus flex-1 text-sm">Cancelar</button>
                <button onClick={onSubmit} className="rz-btn-primary rz-focus flex-1 text-sm flex items-center justify-center gap-2">
                  <Check size={16} /> {editingDebtId ? "Salvar" : "Registrar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function categoriasByTypeSafe(categoriesByType, tipo) {
  if (!categoriesByType || !categoriesByType[tipo]) return [];
  return categoriesByType[tipo];
}

function EstrategiaQuitacao({ dividas }) {
  const [extra, setExtra] = useState("300");
  const [metodo, setMetodo] = useState("avalanche");

  const totalDevido = dividas.reduce((s, d) => s + (d.amount - (d.paid || 0)), 0);
  const valorExtra = parseMoedaBR(extra);

  // Bola de neve: menor saldo primeiro (ganho psicológico).
  // Avalanche: maior juros primeiro (economiza mais dinheiro).
  const ordenadas = [...dividas].sort((a, b) => {
    const saldoA = a.amount - (a.paid || 0);
    const saldoB = b.amount - (b.paid || 0);
    if (metodo === "bola") return saldoA - saldoB;
    const jurosA = a.interestRate || 0;
    const jurosB = b.interestRate || 0;
    if (jurosB !== jurosA) return jurosB - jurosA;
    return saldoA - saldoB;
  });

  // Simula mês a mês: paga o mínimo (juros) de todas e joga o extra na primeira da fila
  const simulacao = useMemo(() => {
    if (valorExtra <= 0) return null;
    let saldos = ordenadas.map((d) => ({ id: d.id, person: d.person, saldo: d.amount - (d.paid || 0), juros: (d.interestRate || 0) / 100 }));
    let meses = 0;
    let jurosPagos = 0;
    const quitacoes = [];
    while (saldos.some((s) => s.saldo > 0.01) && meses < 600) {
      meses++;
      saldos.forEach((s) => {
        if (s.saldo > 0) { const j = s.saldo * s.juros; s.saldo += j; jurosPagos += j; }
      });
      let disponivel = valorExtra;
      for (const s of saldos) {
        if (disponivel <= 0) break;
        if (s.saldo <= 0) continue;
        const pagar = Math.min(disponivel, s.saldo);
        s.saldo -= pagar;
        disponivel -= pagar;
        if (s.saldo <= 0.01 && !quitacoes.find((q) => q.id === s.id)) {
          quitacoes.push({ id: s.id, person: s.person, mes: meses });
        }
      }
    }
    return { meses, jurosPagos, quitacoes, naoQuita: meses >= 600 };
  }, [ordenadas, valorExtra]);

  return (
    <div className="rz-card p-4 sm:p-5 mb-6">
      <h2 className="text-sm font-semibold mb-1">Plano de quitação</h2>
      <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
        Você deve {formatCurrency(totalDevido)} no total. Veja em que ordem pagar e quanto tempo levaria.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Quanto consigo pagar por mês</label>
          <input className="rz-input rz-focus rz-mono" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Estratégia</label>
          <select className="rz-input rz-focus" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            <option value="avalanche">Avalanche — maior juros primeiro</option>
            <option value="bola">Bola de neve — menor dívida primeiro</option>
          </select>
        </div>
      </div>

      <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: "var(--paper-alt)", color: "var(--ink-soft)" }}>
        {metodo === "avalanche"
          ? "Avalanche paga menos juros no total — é a escolha matematicamente melhor."
          : "Bola de neve quita dívidas pequenas rápido, o que ajuda a manter a motivação, mesmo custando um pouco mais de juros."}
      </p>

      <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Ordem sugerida</h3>
      <div className="flex flex-col mb-4">
        {ordenadas.map((d, i) => {
          const saldo = d.amount - (d.paid || 0);
          const quitacao = simulacao?.quitacoes.find((q) => q.id === d.id);
          return (
            <div key={d.id} className="flex items-center gap-3 py-2" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
              <span className="rz-mono text-xs w-5 shrink-0" style={{ color: "var(--ink-soft)" }}>{i + 1}º</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{d.person}</div>
                <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {d.interestRate ? `${d.interestRate}% ao mês` : "sem juros"}
                  {quitacao && ` · quita no mês ${quitacao.mes}`}
                </div>
              </div>
              <span className="rz-mono text-sm font-semibold whitespace-nowrap" style={{ color: "var(--brick)" }}>{formatCurrency(saldo)}</span>
            </div>
          );
        })}
      </div>

      {simulacao && (
        simulacao.naoQuita ? (
          <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--brick-soft)", color: "var(--brick)" }}>
            Com {formatCurrency(valorExtra)}/mês, os juros crescem mais rápido que os pagamentos — a dívida nunca é quitada. Tente um valor maior.
          </div>
        ) : (
          <div className="text-sm px-3 py-3 rounded-lg" style={{ background: "var(--emerald-soft)", color: "var(--emerald)" }}>
            Pagando {formatCurrency(valorExtra)} por mês, você quita tudo em{" "}
            <strong>{simulacao.meses} {simulacao.meses === 1 ? "mês" : "meses"}</strong>
            {simulacao.jurosPagos > 0.5 && <> e terá pago {formatCurrency(simulacao.jurosPagos)} em juros</>}.
          </div>
        )
      )}
    </div>
  );
}

function DebtCard({ debt, onEdit, onDelete, onPayment, onToggleSettled, categoriesByType, banksList }) {
  const [valor, setValor] = useState("");
  const [gerarLancamento, setGerarLancamento] = useState(true);
  const [categoria, setCategoria] = useState("");
  const [conta, setConta] = useState("");
  const emprestei = debt.direction === "emprestei";
  const pago = debt.paid || 0;
  const restante = debt.amount - pago;
  const pct = debt.amount > 0 ? (pago / debt.amount) * 100 : 0;
  const cor = emprestei ? "var(--emerald)" : "var(--brick)";

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const atrasada = debt.dueDate && new Date(debt.dueDate + "T00:00:00") < hoje;

  const tipoLanc = emprestei ? "receita" : "despesa";
  const categoriasDisponiveis = (categoriasByTypeSafe(categoriesByType, tipoLanc));

  const registrar = () => {
    const v = parseMoedaBR(valor);
    if (!v || v <= 0) return;
    if (gerarLancamento && !categoria) return;
    onPayment(debt.id, v, gerarLancamento, categoria, conta);
    setValor("");
  };

  return (
    <div className="rz-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rz-dot" style={{ background: cor }} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{debt.person}</div>
            <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {emprestei ? "Tenho a receber" : "Tenho a pagar"} · {formatDateBR(debt.date)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit(debt)} className="rz-focus p-1 rounded-md" aria-label="Editar" title="Editar dívida" style={{ color: "var(--ink-soft)" }}><Pencil size={13} /></button>
          <button onClick={() => onDelete(debt)} className="rz-focus p-1 rounded-md" aria-label="Excluir" title="Excluir dívida" style={{ color: "var(--ink-soft)" }}><Trash2 size={13} /></button>
        </div>
      </div>

      <div className="flex items-baseline justify-between mb-2">
        <span className="rz-mono text-lg font-semibold" style={{ color: cor }}>{formatCurrency(restante)}</span>
        {pago > 0 && <span className="rz-mono text-xs" style={{ color: "var(--ink-soft)" }}>de {formatCurrency(debt.amount)}</span>}
      </div>

      {pago > 0 && (
        <>
          <div className="rz-progress-track mb-1">
            <div className="rz-progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: cor }} />
          </div>
          <div className="rz-mono text-[11px] mb-2" style={{ color: "var(--ink-soft)" }}>{formatCurrency(pago)} já acertado</div>
        </>
      )}

      {debt.dueDate && (
        <div className="text-xs mb-2" style={{ color: atrasada ? "var(--brick)" : "var(--ink-soft)" }}>
          {atrasada ? "Venceu em " : "Previsto para "}{formatDateBR(debt.dueDate)}
        </div>
      )}

      {debt.interestRate > 0 && (
        <div className="text-xs mb-2" style={{ color: "var(--gold)" }}>
          {debt.interestRate}% ao mês · cresce {formatCurrency(restante * (debt.interestRate / 100))} se não pagar
        </div>
      )}

      {debt.notes && <div className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>{debt.notes}</div>}

      <div className="flex items-center gap-2">
        <input
          className="rz-input rz-focus rz-mono text-sm flex-1"
          inputMode="decimal"
          placeholder={emprestei ? "Recebi..." : "Paguei..."}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && registrar()}
        />
        <button onClick={registrar} className="rz-focus p-1.5 rounded-md" style={{ color: cor }} aria-label="Registrar acerto" title="Registrar este acerto"><Plus size={16} /></button>
        <button onClick={() => onToggleSettled(debt)} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3 whitespace-nowrap">Quitar</button>
      </div>

      <button
        type="button"
        onClick={() => setGerarLancamento((v) => !v)}
        className="rz-focus flex items-center gap-2 text-xs mt-2"
        style={{ color: "var(--ink-soft)" }}
      >
        <span style={{
          width: 14, height: 14, borderRadius: 4, border: "1.5px solid var(--line)",
          background: gerarLancamento ? "var(--ink)" : "var(--surface)",
          display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          {gerarLancamento && <Check size={10} color="var(--paper)" />}
        </span>
        Registrar também como {emprestei ? "receita" : "despesa"} na minha conta
      </button>

      {gerarLancamento && (
        <div className="flex gap-2 mt-2">
          <select className="rz-input rz-focus text-xs flex-1" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Categoria…</option>
            {categoriasDisponiveis.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select className="rz-input rz-focus text-xs flex-1" value={conta} onChange={(e) => setConta(e.target.value)}>
            <option value="">Sem conta</option>
            {(banksList || []).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

export { DebtCard };
export { DividasTab };
export { EstrategiaQuitacao };
export { categoriasByTypeSafe };
