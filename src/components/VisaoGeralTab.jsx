import { useMemo } from "react";
import { AlertCircle, Home, Landmark, PiggyBank, Plus, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FIXED_STATUS_CLASS, FIXED_STATUS_LABEL, MONTHS } from "../lib/constants";
import { formatCompact, formatCurrency } from "../lib/format";
import { efeitoNoSaldoGeral, enrichFixedBills } from "../lib/finance";
import { PeriodNavigator, SummaryCard } from "./common";

function VisaoGeralTab({ transactions, periodFiltered, totals, refDate, periodMode, shiftMonth, setPeriodMode, findCategory, setActiveTab, fixedBills, findBank, onLaunchFixedBill, savingsAccounts, saldosIniciais, cardIds, irParaHoje }) {
  const saldoTotal = useMemo(
    () => saldosIniciais + transactions.filter((t) => t.status === "pago")
      .reduce((s, t) => s + efeitoNoSaldoGeral(t, cardIds), 0),
    [transactions, saldosIniciais, cardIds]
  );

  const savingsTotal = useMemo(() => savingsAccounts.reduce((s, a) => s + a.currentAmount, 0), [savingsAccounts]);

  // Saldo projetado de verdade: o que já está em conta + tudo que ainda está
  // pendente (lançamentos + contas fixas não lançadas) até o fim do período.
  const saldoProjetado = useMemo(() => {
    const endOfPeriod = periodMode === "todos"
      ? new Date(8640000000000000)
      : new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59);
    const pendentes = transactions
      .filter((t) => t.status === "pendente" && new Date(t.date + "T00:00:00") <= endOfPeriod)
      .reduce((s, t) => s + efeitoNoSaldoGeral(t, cardIds), 0);
    const fixasNaoLancadas = periodMode === "todos" ? 0 : enrichFixedBills(fixedBills, transactions, refDate)
      .filter((b) => b.active && b.status !== "lancada")
      .reduce((s, b) => s + (b.type === "receita" ? b.amount : -b.amount), 0);
    return saldoTotal + pendentes + fixasNaoLancadas;
  }, [transactions, fixedBills, refDate, periodMode, saldoTotal, cardIds]);

  const pendingFixedBills = useMemo(() => {
    return enrichFixedBills(fixedBills, transactions, refDate)
      .filter((b) => b.active && b.type === "despesa" && b.status !== "lancada")
      .sort((a, b) => a.day - b.day);
  }, [fixedBills, transactions, refDate]);

  const pendingFixedTotal = pendingFixedBills.reduce((s, b) => s + b.amount, 0);

  const trendData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(new Date(refDate.getFullYear(), refDate.getMonth() - i, 1));
    return months.map((d) => {
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const saldo = saldosIniciais + transactions
        .filter((t) => t.status === "pago" && new Date(t.date + "T00:00:00") <= endOfMonth)
        .reduce((s, t) => s + efeitoNoSaldoGeral(t, cardIds), 0);
      return { mes: `${MONTHS[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`, saldo };
    });
  }, [transactions, refDate]);

  const expensesByCategory = useMemo(() => {
    const map = {};
    periodFiltered.filter((t) => t.type === "despesa").forEach((t) => { map[t.category] = (map[t.category] || 0) + Number(t.amount); });
    return Object.entries(map)
      .map(([catId, value]) => { const cat = findCategory("despesa", catId); return { name: cat.label, value, color: cat.color }; })
      .sort((a, b) => b.value - a.value);
  }, [periodFiltered, findCategory]);

  const topExpenses = useMemo(
    () => [...periodFiltered].filter((t) => t.type === "despesa").sort((a, b) => b.amount - a.amount).slice(0, 5),
    [periodFiltered]
  );

  const hasAnyData = transactions.length > 0;

  const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, fontFamily: "IBM Plex Mono, monospace" };

  return (
    <>
      <header className="mb-6">
        <h1 className="rz-display text-2xl md:text-3xl">Visão Geral</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Seu razão resumido em um só lugar.</p>
      </header>

      {!hasAnyData ? (
        <div className="rz-card p-10 text-center max-w-md">
          <Home size={26} className="mx-auto mb-3" style={{ color: "var(--line)" }} />
          <div className="rz-display text-lg mb-1">Ainda não há nada para mostrar</div>
          <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
            Assim que você registrar seus primeiros lançamentos, os gráficos e o resumo aparecem aqui.
          </p>
          <button onClick={() => setActiveTab("lancamentos")} className="rz-btn-primary rz-focus text-sm inline-flex items-center gap-2">
            <Plus size={16} /> Ir para Lançamentos
          </button>
        </div>
      ) : (
        <>
          <PeriodNavigator periodMode={periodMode} refDate={refDate} shiftMonth={shiftMonth} setPeriodMode={setPeriodMode} onHoje={irParaHoje} />

          {/* Situação atual */}
          <div className="mb-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Situação atual</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <SummaryCard label="Saldo em contas" value={saldoTotal} icon={Scale} tone={saldoTotal >= 0 ? "emerald" : "brick"} />
              <SummaryCard label="Guardado em poupança" value={savingsTotal} icon={Landmark} tone="emerald" />
              <SummaryCard label="Total disponível" value={saldoTotal + savingsTotal} icon={PiggyBank} tone={saldoTotal + savingsTotal >= 0 ? "emerald" : "brick"} />
            </div>
          </div>

          {/* Movimentação do período */}
          <div className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>
              {periodMode === "todos" ? "Todos os períodos" : `${MONTHS[refDate.getMonth()]} / ${refDate.getFullYear()}`}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <SummaryCard label="Receitas" value={totals.receitas} icon={TrendingUp} tone="emerald" />
              <SummaryCard label="Despesas" value={totals.despesas} icon={TrendingDown} tone="brick" />
              <SummaryCard label="Resultado do período" value={totals.saldo} icon={Scale} tone={totals.saldo >= 0 ? "emerald" : "brick"} />
              <SummaryCard label="Saldo projetado ao fim" value={saldoProjetado} icon={Scale} tone={saldoProjetado >= 0 ? "emerald" : "brick"} />
            </div>
          </div>

          {/* Balance trend */}
          <div className="rz-card p-4 sm:p-5 mb-4">
            <h2 className="text-sm font-semibold mb-4">Evolução do saldo — últimos 6 meses</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink-soft)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} width={48} />
                <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={tooltipStyle} labelStyle={{ color: "var(--ink)", fontWeight: 600 }} />
                <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#1B5E4F" strokeWidth={2.5} dot={{ r: 3, fill: "#1B5E4F" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Savings breakdown */}
          {savingsAccounts.length > 0 && (
            <div className="rz-card p-4 sm:p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Poupança por categoria</h2>
                <span className="rz-mono text-xs" style={{ color: "var(--emerald)" }}>Total: {formatCurrency(savingsTotal)}</span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {savingsAccounts.map((a) => (
                  <div key={a.id} className="flex items-center gap-1.5 text-xs">
                    <span className="rz-dot" style={{ background: a.color }} />
                    <span style={{ color: "var(--ink-soft)" }}>{a.label}</span>
                    <span className="rz-mono font-semibold">{formatCurrency(a.currentAmount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending fixed bills */}
          {pendingFixedBills.length > 0 && (
            <div className="rz-card p-4 sm:p-5 mb-4">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h2 className="text-sm font-semibold">Contas fixas ainda não pagas</h2>
                <span className="rz-mono text-xs" style={{ color: "var(--brick)" }}>
                  Total: {formatCurrency(pendingFixedTotal)}
                </span>
              </div>
              <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
                Já registradas, mas ainda pendentes de pagamento neste período — fique de olho nos vencimentos.
              </p>
              <div className="flex flex-col">
                {pendingFixedBills.map((b, i) => {
                  const cat = findCategory("despesa", b.category);
                  return (
                    <div key={b.id} className="flex items-center gap-3 py-2" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                      <span className="rz-dot" style={{ background: cat.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{b.description}</div>
                        <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{cat.label} · Vence dia {b.dueDay}</div>
                      </div>
                      <span className={`rz-stamp shrink-0 ${FIXED_STATUS_CLASS[b.status]}`}>
                        {b.status === "atrasada" && <AlertCircle size={11} />} {FIXED_STATUS_LABEL[b.status]}
                      </span>
                      <div className="rz-mono text-sm font-semibold w-24 text-right shrink-0" style={{ color: "var(--brick)" }}>{formatCurrency(b.amount)}</div>
                      <button onClick={() => onLaunchFixedBill(b)} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3 shrink-0">Lançar</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {/* Expenses by category */}
            <div className="rz-card p-4 sm:p-5">
              <h2 className="text-sm font-semibold mb-2">Despesas por categoria</h2>
              {expensesByCategory.length === 0 ? (
                <p className="text-sm py-10 text-center" style={{ color: "var(--ink-soft)" }}>Nenhuma despesa neste período.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={expensesByCategory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                        {expensesByCategory.map((entry, i) => <Cell key={i} fill={entry.color} stroke="var(--surface)" strokeWidth={2} />)}
                      </Pie>
                      <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
                    {expensesByCategory.map((c) => (
                      <div key={c.name} className="flex items-center gap-1.5 text-xs">
                        <span className="rz-dot" style={{ background: c.color }} />
                        <span style={{ color: "var(--ink-soft)" }}>{c.name}</span>
                        <span className="rz-mono font-semibold">{formatCurrency(c.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Top 5 expenses */}
            <div className="rz-card p-4 sm:p-5">
              <h2 className="text-sm font-semibold mb-2">Maiores gastos do período</h2>
              {topExpenses.length === 0 ? (
                <p className="text-sm py-10 text-center" style={{ color: "var(--ink-soft)" }}>Nenhuma despesa neste período.</p>
              ) : (
                <div className="flex flex-col">
                  {topExpenses.map((t, i) => {
                    const cat = findCategory("despesa", t.category);
                    return (
                      <div key={t.id} className="flex items-center gap-3 py-2" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                        <span className="rz-mono text-xs w-4" style={{ color: "var(--ink-soft)" }}>{i + 1}</span>
                        <span className="rz-dot" style={{ background: cat.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{t.description}</div>
                          <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{cat.label}</div>
                        </div>
                        <div className="rz-mono text-sm font-semibold shrink-0" style={{ color: "var(--brick)" }}>{formatCurrency(t.amount)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

export { VisaoGeralTab };
