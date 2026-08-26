import { useMemo } from "react";
import { AlertCircle, CreditCard, HandCoins, Home, Landmark, PiggyBank, Plus, Scale, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FIXED_STATUS_CLASS, FIXED_STATUS_LABEL, MONTHS } from "../lib/constants";
import { formatCompact, formatCurrency, formatDateBR, dateToISO } from "../lib/format";
import { efeitoNoSaldoGeral, enrichFixedBills, calcularFatura } from "../lib/finance";
import { PeriodNavigator, SummaryCard } from "./common";

function VisaoGeralTab({
  transactions, periodFiltered, totals, refDate, periodMode, shiftMonth, setPeriodMode,
  findCategory, setActiveTab, fixedBills, findBank, onLaunchFixedBill, savingsAccounts,
  saldosIniciais, cardIds, irParaHoje, banksList, budgets, debts,
  setTypeFilter, setCategoryFilter, setAccountFilter,
}) {
  const saldoTotal = useMemo(
    () => saldosIniciais + transactions.filter((t) => t.status === "pago")
      .reduce((s, t) => s + efeitoNoSaldoGeral(t, cardIds), 0),
    [transactions, saldosIniciais, cardIds]
  );

  // Só caixinhas ativas — arquivadas não contam, igual à aba Caixinhas.
  const caixinhasAtivas = useMemo(() => savingsAccounts.filter((a) => !a.archived), [savingsAccounts]);
  const savingsTotal = useMemo(() => caixinhasAtivas.reduce((s, a) => s + a.currentAmount, 0), [caixinhasAtivas]);

  const faturas = useMemo(() => {
    const cartoes = (banksList || []).filter((b) => b.kind === "cartao");
    return cartoes.map((c) => ({ ...c, ...calcularFatura(c, transactions, refDate) })).filter((f) => f.aberto > 0);
  }, [banksList, transactions, refDate]);
  const totalFaturas = faturas.reduce((s, f) => s + f.aberto, 0);

  const dividasResumo = useMemo(() => {
    const abertas = (debts || []).filter((d) => !d.settled);
    const aPagar = abertas.filter((d) => d.direction === "devo").reduce((s, d) => s + (d.amount - (d.paid || 0)), 0);
    const aReceber = abertas.filter((d) => d.direction === "emprestei").reduce((s, d) => s + (d.amount - (d.paid || 0)), 0);
    return { abertas, aPagar, aReceber };
  }, [debts]);

  const patrimonio = saldoTotal + savingsTotal - totalFaturas - dividasResumo.aPagar + dividasResumo.aReceber;

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

  const mesAnterior = useMemo(() => {
    const d = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
    const doMes = transactions.filter((t) => {
      const td = new Date(t.date + "T00:00:00");
      return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
    });
    return {
      receitas: doMes.filter((t) => t.type === "receita").reduce((s, t) => s + t.amount, 0),
      despesas: doMes.filter((t) => t.type === "despesa").reduce((s, t) => s + t.amount, 0),
      temDados: doMes.length > 0,
      rotulo: MONTHS[d.getMonth()].slice(0, 3) + "/" + String(d.getFullYear()).slice(2),
    };
  }, [transactions, refDate]);

  const variacao = (atual, anterior) => {
    if (!mesAnterior.temDados || anterior === 0 || periodMode === "todos") return null;
    return ((atual - anterior) / anterior) * 100;
  };

  const orcamentosResumo = useMemo(() => {
    if (!budgets || budgets.length === 0) return null;
    const gasto = (b) => periodFiltered
      .filter((t) => t.type === "despesa" && (b.kind === "conta" ? t.account === b.accountId : t.category === b.categoryId))
      .reduce((s, t) => s + Number(t.amount), 0);
    const itens = budgets.map((b) => {
      const usado = gasto(b);
      const alvo = b.kind === "conta" ? (findBank(b.accountId) || { label: "conta", color: "#9A8A7A" }) : findCategory("despesa", b.categoryId);
      return { id: b.id, label: alvo.label, color: alvo.color, usado, limit: b.limit, pct: b.limit > 0 ? (usado / b.limit) * 100 : 0 };
    }).sort((a, b) => b.pct - a.pct);
    return { itens, estourados: itens.filter((i) => i.pct > 100).length };
  }, [budgets, periodFiltered, findCategory, findBank]);

  const trendData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(new Date(refDate.getFullYear(), refDate.getMonth() - i, 1));
    return months.map((d) => {
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const saldo = saldosIniciais + transactions
        .filter((t) => t.status === "pago" && new Date(t.date + "T00:00:00") <= endOfMonth)
        .reduce((s, t) => s + efeitoNoSaldoGeral(t, cardIds), 0);
      return { mes: MONTHS[d.getMonth()].slice(0, 3) + "/" + String(d.getFullYear()).slice(2), saldo };
    });
  }, [transactions, refDate, saldosIniciais, cardIds]);

  const expensesByCategory = useMemo(() => {
    const map = {};
    periodFiltered.filter((t) => t.type === "despesa").forEach((t) => { map[t.category] = (map[t.category] || 0) + Number(t.amount); });
    return Object.entries(map)
      .map(([catId, value]) => { const cat = findCategory("despesa", catId); return { id: catId, name: cat.label, value, color: cat.color }; })
      .sort((a, b) => b.value - a.value);
  }, [periodFiltered, findCategory]);

  const topExpenses = useMemo(
    () => [...periodFiltered].filter((t) => t.type === "despesa").sort((a, b) => b.amount - a.amount).slice(0, 5),
    [periodFiltered]
  );

  const proximosVencimentos = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const limite = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 15);
    const itens = [];
    enrichFixedBills(fixedBills, transactions, refDate)
      .filter((b) => b.active && b.type === "despesa" && b.status !== "lancada")
      .forEach((b) => {
        const d = new Date(refDate.getFullYear(), refDate.getMonth(), b.day);
        if (d >= hoje && d <= limite) itens.push({ id: "fx" + b.id, data: d, label: b.description, valor: b.amount, tipo: "Conta fixa" });
      });
    faturas.forEach((f) => {
      if (f.vencimento && f.vencimento >= hoje && f.vencimento <= limite) {
        itens.push({ id: "ft" + f.id, data: f.vencimento, label: "Fatura " + f.label, valor: f.aberto, tipo: "Cartão" });
      }
    });
    dividasResumo.abertas.filter((d) => d.direction === "devo" && d.dueDate).forEach((d) => {
      const dt = new Date(d.dueDate + "T00:00:00");
      if (dt >= hoje && dt <= limite) itens.push({ id: "dv" + d.id, data: dt, label: d.person, valor: d.amount - (d.paid || 0), tipo: "Dívida" });
    });
    return itens.sort((a, b) => a.data - b.data);
  }, [fixedBills, transactions, refDate, faturas, dividasResumo]);

  const alertas = useMemo(() => {
    const lista = [];
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const atrasadas = pendingFixedBills.filter((b) => b.status === "atrasada");
    if (atrasadas.length > 0) {
      lista.push({ id: "fixas", texto: atrasadas.length + " conta" + (atrasadas.length !== 1 ? "s" : "") + " fixa" + (atrasadas.length !== 1 ? "s" : "") + " atrasada" + (atrasadas.length !== 1 ? "s" : ""), aba: "fixas" });
    }
    if (orcamentosResumo && orcamentosResumo.estourados > 0) {
      lista.push({ id: "orc", texto: orcamentosResumo.estourados + " orçamento" + (orcamentosResumo.estourados !== 1 ? "s" : "") + " estourado" + (orcamentosResumo.estourados !== 1 ? "s" : ""), aba: "orcamento" });
    }
    faturas.filter((f) => f.vencimento && f.vencimento < hoje).forEach((f) => {
      lista.push({ id: "ft" + f.id, texto: "Fatura " + f.label + " venceu em " + formatDateBR(dateToISO(f.vencimento)), aba: "carteira" });
    });
    dividasResumo.abertas.filter((d) => d.dueDate && new Date(d.dueDate + "T00:00:00") < hoje).forEach((d) => {
      lista.push({ id: "dv" + d.id, texto: (d.direction === "devo" ? "Dívida com " : "A receber de ") + d.person + " venceu", aba: "dividas" });
    });
    caixinhasAtivas.filter((c) => c.targetAmount > 0 && c.deadline && c.currentAmount < c.targetAmount)
      .filter((c) => new Date(c.deadline + "T00:00:00") < hoje)
      .forEach((c) => lista.push({ id: "cx" + c.id, texto: 'Prazo da caixinha "' + c.label + '" passou', aba: "poupanca" }));
    return lista;
  }, [pendingFixedBills, orcamentosResumo, faturas, dividasResumo, caixinhasAtivas]);

  const hasAnyData = transactions.length > 0;
  const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, fontFamily: "IBM Plex Mono, monospace" };

  const verLancamentos = (opts) => {
    const o = opts || {};
    setTypeFilter(o.tipo || "todos");
    setCategoryFilter(o.categoria || "todas");
    setAccountFilter(o.conta || "todas");
    setActiveTab("lancamentos");
  };

  const Variacao = ({ valor, inverso }) => {
    if (valor === null) return null;
    const subiu = valor >= 0;
    const bom = inverso ? !subiu : subiu;
    return (
      <span className="rz-mono text-[11px] inline-flex items-center gap-0.5" style={{ color: bom ? "var(--emerald)" : "var(--brick)" }}>
        {subiu ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
        {Math.abs(valor).toFixed(0)}% vs {mesAnterior.rotulo}
      </span>
    );
  };

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
          {alertas.length > 0 && (
            <div className="rz-card p-4 mb-5" style={{ borderColor: "var(--brick)" }}>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={15} style={{ color: "var(--brick)" }} />
                <h2 className="text-sm font-semibold" style={{ color: "var(--brick)" }}>Precisa da sua atenção</h2>
              </div>
              <div className="flex flex-col gap-1 items-start">
                {alertas.map((a) => (
                  <button key={a.id} onClick={() => setActiveTab(a.aba)} className="rz-focus text-sm text-left flex items-center gap-2 hover:underline" style={{ color: "var(--ink-soft)" }}>
                    <span className="rz-dot" style={{ background: "var(--brick)" }} /> {a.texto}
                  </button>
                ))}
              </div>
            </div>
          )}

          <PeriodNavigator periodMode={periodMode} refDate={refDate} shiftMonth={shiftMonth} setPeriodMode={setPeriodMode} onHoje={irParaHoje} />

          <div className="mb-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Situação atual</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <button onClick={() => setActiveTab("carteira")} className="rz-focus text-left" title="Ver detalhes por conta">
                <SummaryCard label="Saldo em contas" value={saldoTotal} icon={Wallet} tone={saldoTotal >= 0 ? "emerald" : "brick"} />
              </button>
              <button onClick={() => setActiveTab("poupanca")} className="rz-focus text-left" title="Ver caixinhas">
                <SummaryCard label="Guardado em caixinhas" value={savingsTotal} icon={Landmark} tone="emerald" />
              </button>
              {totalFaturas > 0 ? (
                <button onClick={() => setActiveTab("carteira")} className="rz-focus text-left" title="Ver faturas dos cartões">
                  <SummaryCard label="Faturas em aberto" value={totalFaturas} icon={CreditCard} tone="brick" />
                </button>
              ) : (
                <SummaryCard label="Total disponível" value={saldoTotal + savingsTotal} icon={PiggyBank} tone={saldoTotal + savingsTotal >= 0 ? "emerald" : "brick"} />
              )}
              <SummaryCard label="Patrimônio líquido" value={patrimonio} icon={Scale} tone={patrimonio >= 0 ? "emerald" : "brick"} />
            </div>
            {(totalFaturas > 0 || dividasResumo.aPagar > 0 || dividasResumo.aReceber > 0) && (
              <p className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>
                Patrimônio = contas + caixinhas
                {totalFaturas > 0 && " − faturas (" + formatCurrency(totalFaturas) + ")"}
                {dividasResumo.aPagar > 0 && " − dívidas (" + formatCurrency(dividasResumo.aPagar) + ")"}
                {dividasResumo.aReceber > 0 && " + a receber (" + formatCurrency(dividasResumo.aReceber) + ")"}
              </p>
            )}
          </div>

          <div className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>
              {periodMode === "todos" ? "Todos os períodos" : MONTHS[refDate.getMonth()] + " / " + refDate.getFullYear()}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <button onClick={() => verLancamentos({ tipo: "receita" })} className="rz-focus text-left w-full" title="Ver receitas do período">
                  <SummaryCard label="Receitas" value={totals.receitas} icon={TrendingUp} tone="emerald" />
                </button>
                <div className="mt-1 pl-1"><Variacao valor={variacao(totals.receitas, mesAnterior.receitas)} /></div>
              </div>
              <div>
                <button onClick={() => verLancamentos({ tipo: "despesa" })} className="rz-focus text-left w-full" title="Ver despesas do período">
                  <SummaryCard label="Despesas" value={totals.despesas} icon={TrendingDown} tone="brick" />
                </button>
                <div className="mt-1 pl-1"><Variacao valor={variacao(totals.despesas, mesAnterior.despesas)} inverso /></div>
              </div>
              <SummaryCard label="Resultado do período" value={totals.saldo} icon={Scale} tone={totals.saldo >= 0 ? "emerald" : "brick"} />
              <SummaryCard label="Saldo projetado ao fim" value={saldoProjetado} icon={Scale} tone={saldoProjetado >= 0 ? "emerald" : "brick"} />
            </div>
          </div>

          {proximosVencimentos.length > 0 && (
            <div className="rz-card p-4 sm:p-5 mb-4">
              <h2 className="text-sm font-semibold mb-1">Próximos 15 dias</h2>
              <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
                Total a pagar: <span className="rz-mono font-semibold" style={{ color: "var(--brick)" }}>{formatCurrency(proximosVencimentos.reduce((s, i) => s + i.valor, 0))}</span>
              </p>
              <div className="flex flex-col">
                {proximosVencimentos.map((i, idx) => (
                  <div key={i.id} className="flex items-center gap-3 py-2" style={{ borderTop: idx === 0 ? "none" : "1px solid var(--line)" }}>
                    <span className="rz-mono text-xs shrink-0" style={{ color: "var(--ink-soft)" }}>{formatDateBR(dateToISO(i.data))}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{i.label}</div>
                      <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{i.tipo}</div>
                    </div>
                    <span className="rz-mono text-sm font-semibold shrink-0" style={{ color: "var(--brick)" }}>{formatCurrency(i.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rz-card p-4 sm:p-5 mb-4">
            <h2 className="text-sm font-semibold mb-4">Evolução do saldo — últimos 6 meses</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink-soft)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} width={48} />
                <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={tooltipStyle} labelStyle={{ color: "var(--ink)", fontWeight: 600 }} />
                <Line type="monotone" dataKey="saldo" name="Saldo" stroke="var(--emerald)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--emerald)" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {orcamentosResumo && orcamentosResumo.itens.length > 0 && (
            <div className="rz-card p-4 sm:p-5 mb-4">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Target size={15} style={{ color: "var(--ink-soft)" }} />
                  <h2 className="text-sm font-semibold">Orçamentos do período</h2>
                </div>
                <button onClick={() => setActiveTab("orcamento")} className="rz-focus text-xs" style={{ color: "var(--ink-soft)" }}>Ver todos</button>
              </div>
              <div className="flex flex-col gap-2">
                {orcamentosResumo.itens.slice(0, 5).map((o) => {
                  const cor = o.pct > 100 ? "var(--brick)" : o.pct > 80 ? "var(--gold)" : "var(--emerald)";
                  return (
                    <div key={o.id} className="flex items-center gap-2">
                      <span className="rz-dot" style={{ background: o.color }} />
                      <span className="text-xs flex-1 truncate">{o.label}</span>
                      <div className="rz-progress-track shrink-0" style={{ width: 70 }}>
                        <div className="rz-progress-fill" style={{ width: Math.min(o.pct, 100) + "%", background: cor }} />
                      </div>
                      <span className="rz-mono text-[11px] text-right whitespace-nowrap" style={{ color: cor, minWidth: 118 }}>
                        {formatCurrency(o.usado)} / {formatCurrency(o.limit)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {caixinhasAtivas.length > 0 && (
            <div className="rz-card p-4 sm:p-5 mb-4">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <h2 className="text-sm font-semibold">Caixinhas</h2>
                <span className="rz-mono text-xs" style={{ color: "var(--emerald)" }}>Total: {formatCurrency(savingsTotal)}</span>
              </div>
              <div className="flex flex-col gap-2">
                {caixinhasAtivas.map((a) => {
                  const pct = a.targetAmount > 0 ? (a.currentAmount / a.targetAmount) * 100 : null;
                  return (
                    <div key={a.id} className="flex items-center gap-2">
                      <span className="rz-dot" style={{ background: a.color }} />
                      <span className="text-xs flex-1 truncate">{a.label}</span>
                      {pct !== null && (
                        <>
                          <div className="rz-progress-track shrink-0" style={{ width: 70 }}>
                            <div className="rz-progress-fill" style={{ width: Math.min(pct, 100) + "%", background: a.color }} />
                          </div>
                          <span className="rz-mono text-[11px] w-9 text-right" style={{ color: "var(--ink-soft)" }}>{pct.toFixed(0)}%</span>
                        </>
                      )}
                      <span className="rz-mono text-xs font-semibold w-24 text-right whitespace-nowrap">{formatCurrency(a.currentAmount)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {dividasResumo.abertas.length > 0 && (
            <div className="rz-card p-4 sm:p-5 mb-4">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <HandCoins size={15} style={{ color: "var(--ink-soft)" }} />
                  <h2 className="text-sm font-semibold">Dívidas em aberto</h2>
                </div>
                <button onClick={() => setActiveTab("dividas")} className="rz-focus text-xs" style={{ color: "var(--ink-soft)" }}>Ver todas</button>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {dividasResumo.aPagar > 0 && (
                  <div className="text-xs">
                    <span style={{ color: "var(--ink-soft)" }}>Tenho a pagar: </span>
                    <span className="rz-mono font-semibold" style={{ color: "var(--brick)" }}>{formatCurrency(dividasResumo.aPagar)}</span>
                  </div>
                )}
                {dividasResumo.aReceber > 0 && (
                  <div className="text-xs">
                    <span style={{ color: "var(--ink-soft)" }}>Tenho a receber: </span>
                    <span className="rz-mono font-semibold" style={{ color: "var(--emerald)" }}>{formatCurrency(dividasResumo.aReceber)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {pendingFixedBills.length > 0 && (
            <div className="rz-card p-4 sm:p-5 mb-4">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h2 className="text-sm font-semibold">Contas fixas ainda não pagas</h2>
                <span className="rz-mono text-xs" style={{ color: "var(--brick)" }}>Total: {formatCurrency(pendingFixedTotal)}</span>
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
                      <span className={"rz-stamp shrink-0 " + FIXED_STATUS_CLASS[b.status]}>
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
                      <button key={c.name} onClick={() => verLancamentos({ tipo: "despesa", categoria: c.id })} className="rz-focus flex items-center gap-1.5 text-xs hover:underline" title={"Ver lançamentos de " + c.name}>
                        <span className="rz-dot" style={{ background: c.color }} />
                        <span style={{ color: "var(--ink-soft)" }}>{c.name}</span>
                        <span className="rz-mono font-semibold">{formatCurrency(c.value)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

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
