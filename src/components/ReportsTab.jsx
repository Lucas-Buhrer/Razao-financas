import { useEffect, useMemo, useState } from "react";
import { Receipt, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MONTHS } from "../lib/constants";
import { formatCompact, formatCurrency, formatDateBR, todayISO } from "../lib/format";
import { buildCashFlowProjection, getAmountForPeriod, custoMensalEquivalente, periodKeyOf, contaNosIndicadores } from "../lib/finance";
import { RetroLinha, SummaryCard } from "./common";

function ReportsTab({ transactions, findCategory, fixedBills, savingsAccounts, saldosIniciais, budgets, categoriesByType, banksList, findBank, cardIds, categoriasForaIndicadores = [] }) {
  const [monthsCount, setMonthsCount] = useState(6);
  const [horizonDays, setHorizonDays] = useState(90);
  const [selectedCats, setSelectedCats] = useState([]);
  const today = new Date();
  const [customStart, setCustomStart] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(() => todayISO());

  const projection = useMemo(() => buildCashFlowProjection(transactions, fixedBills, horizonDays, saldosIniciais, cardIds), [transactions, fixedBills, horizonDays, saldosIniciais, cardIds]);

  const savingsTotal = useMemo(() => savingsAccounts.reduce((s, a) => s + a.currentAmount, 0), [savingsAccounts]);

  const savingsBreakdown = useMemo(
    () => savingsAccounts.filter((a) => a.currentAmount > 0).map((a) => ({ name: a.label, value: a.currentAmount, color: a.color })).sort((a, b) => b.value - a.value),
    [savingsAccounts]
  );

  const savingsEvolution = useMemo(() => {
    const events = [];
    savingsAccounts.forEach((a) => (a.history || []).forEach((h) => events.push({ date: h.date, amount: h.amount })));
    events.sort((a, b) => (a.date < b.date ? -1 : 1));
    let running = 0;
    const points = events.map((e) => { running += e.amount; return { data: formatDateBR(e.date).slice(0, 5), saldo: running }; });
    // agrupa por data para não repetir pontos do mesmo dia
    const byDate = {};
    points.forEach((p) => { byDate[p.data] = p.saldo; });
    return Object.entries(byDate).map(([data, saldo]) => ({ data, saldo }));
  }, [savingsAccounts]);

  // Nem todo lançamento é ganho ou gasto de verdade. Ficam de fora dos números
  // deste relatório:
  //
  //   • acertos de dívida (levam `debtId`). Emprestar R$ 100 e receber de volta
  //     não é receita — e o app sequer registra a saída do empréstimo, só a
  //     volta. Contar essa volta inventaria uma receita que nunca existiu, e a
  //     taxa de poupança subiria sem você ter poupado nada.
  //
  //   • categorias que você marcou como fora dos indicadores, em
  //     Configurações → Categorias. Reembolso, venda de um móvel usado: dinheiro
  //     que entra sem ser ganho.
  //
  // Eles continuam inteiros na aba Lançamentos e nos saldos das contas — o que
  // saiu da conta saiu de verdade. O que muda é só o que estes indicadores
  // consideram ganho e gasto.
  const contadas = useMemo(
    () => transactions.filter((t) => contaNosIndicadores(t, categoriasForaIndicadores)),
    [transactions, categoriasForaIndicadores]
  );

  // Quantos ficaram de fora dentro da janela que está sendo exibida — contar
  // sobre a base inteira daria um número grande e sem relação com o que está
  // na tela.
  const excluidas = useMemo(() => {
    const now = new Date();
    const inicio = new Date(now.getFullYear(), now.getMonth() - (monthsCount - 1), 1);
    const fim = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return transactions.filter((t) => {
      if (t.type === "transferencia") return false;
      if (contaNosIndicadores(t, categoriasForaIndicadores)) return false;
      const d = new Date(t.date + "T00:00:00");
      return d >= inicio && d <= fim;
    }).length;
  }, [transactions, categoriasForaIndicadores, monthsCount]);

  const monthlyData = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = monthsCount - 1; i >= 0; i--) months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    return months.map((d) => {
      const y = d.getFullYear(), m = d.getMonth();
      const inMonth = contadas.filter((t) => { const td = new Date(t.date + "T00:00:00"); return td.getFullYear() === y && td.getMonth() === m; });
      const receitas = inMonth.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
      const despesas = inMonth.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
      const porCategoria = {};
      const porConta = {};
      inMonth.filter((t) => t.type === "despesa").forEach((t) => {
        porCategoria[t.category] = (porCategoria[t.category] || 0) + Number(t.amount);
        if (t.account) porConta[t.account] = (porConta[t.account] || 0) + Number(t.amount);
      });
      return { mes: `${MONTHS[m].slice(0, 3)}/${String(y).slice(2)}`, receitas, despesas, saldo: receitas - despesas, porCategoria, porConta };
    });
  }, [contadas, monthsCount]);

  // ---- Indicadores ----
  const indicadores = useMemo(() => {
    const comReceita = monthlyData.filter((m) => m.receitas > 0);
    const receitaMedia = comReceita.length
      ? comReceita.reduce((s, m) => s + m.receitas, 0) / comReceita.length : 0;
    const despesaMedia = monthlyData.length
      ? monthlyData.reduce((s, m) => s + m.despesas, 0) / monthlyData.length : 0;

    // Taxa de poupança: soma tudo primeiro e divide uma vez só. Tirar a média
    // das porcentagens mensais distorceria o resultado, porque um mês com
    // receita muito baixa geraria uma porcentagem absurda.
    const totalReceitas = monthlyData.reduce((s, m) => s + m.receitas, 0);
    const totalDespesas = monthlyData.reduce((s, m) => s + m.despesas, 0);
    const taxaPoupanca = totalReceitas > 0
      ? ((totalReceitas - totalDespesas) / totalReceitas) * 100
      : null;

    // Comprometimento: contas fixas ativas sobre a receita média. Contas anuais
    // e semestrais entram pelo custo mensal equivalente, não pelo valor cheio.
    const totalFixas = fixedBills
      .filter((b) => b.active && b.type === "despesa")
      .filter((b) => !b.endPeriod || b.endPeriod >= periodKeyOf(new Date()))
      .reduce((s, b) => s + custoMensalEquivalente(b, getAmountForPeriod(b, new Date())), 0);
    const comprometimento = receitaMedia > 0 ? (totalFixas / receitaMedia) * 100 : null;

    return { receitaMedia, despesaMedia, taxaPoupanca, totalReceitas, totalDespesas, totalFixas, comprometimento };
  }, [monthlyData, fixedBills]);

  // ---- Média mensal por categoria ----
  const mediaPorCategoria = useMemo(() => {
    const totais = {};
    monthlyData.forEach((m) => {
      Object.entries(m.porCategoria).forEach(([catId, v]) => {
        totais[catId] = (totais[catId] || 0) + v;
      });
    });
    return Object.entries(totais)
      .map(([catId, total]) => {
        const cat = findCategory("despesa", catId);
        return { id: catId, name: cat.label, color: cat.color, total, media: total / (monthlyData.length || 1) };
      })
      .sort((a, b) => b.media - a.media);
  }, [monthlyData, findCategory]);

  // ---- Evolução por categoria (gráfico) ----
  const evolucaoCategorias = useMemo(() => {
    return monthlyData.map((m) => {
      const linha = { mes: m.mes };
      selectedCats.forEach((catId) => {
        linha[catId] = m.porCategoria[catId] || 0;
      });
      return linha;
    });
  }, [monthlyData, selectedCats]);

  // ---- Histórico de orçamento ----
  const historicoOrcamento = useMemo(() => {
    return budgets.map((b) => {
      const ehConta = b.kind === "conta";
      const alvo = ehConta
        ? (findBank(b.accountId) || { label: "conta", color: "#9A8A7A" })
        : findCategory("despesa", b.categoryId);
      const meses = monthlyData.map((m) => {
        const gasto = ehConta ? (m.porConta[b.accountId] || 0) : (m.porCategoria[b.categoryId] || 0);
        return { mes: m.mes, gasto, estourou: gasto > b.limit };
      });
      const estouros = meses.filter((m) => m.estourou).length;
      const mediaGasto = meses.reduce((s, m) => s + m.gasto, 0) / (meses.length || 1);
      return { ...b, name: alvo.label, color: alvo.color, ehConta, meses, estouros, mediaGasto };
    });
  }, [budgets, monthlyData, findCategory, findBank]);

  useEffect(() => {
    if (selectedCats.length === 0 && mediaPorCategoria.length > 0) {
      setSelectedCats(mediaPorCategoria.slice(0, 3).map((c) => c.id));
    }
  }, [mediaPorCategoria]);

  const toggleCat = (id) => {
    setSelectedCats((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // ---- Saídas por conta ----
  // Este é o único quadro do relatório que usa `transactions` cru, e não a
  // lista filtrada: a pergunta que ele responde é "quanto saiu de cada conta",
  // não "quanto eu gastei". Quitar uma dívida de R$ 500 pelo Nubank não é
  // consumo — mas os R$ 500 saíram do Nubank, e quem abre este quadro
  // normalmente está conferindo contra o extrato do banco.
  const porFormaPagamento = useMemo(() => {
    const agora = new Date();
    const inicio = new Date(agora.getFullYear(), agora.getMonth() - (monthsCount - 1), 1);
    // Fecha no último dia do mês atual: lançamentos futuros não entram
    const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59);
    const doPeriodo = transactions.filter((t) => {
      if (t.type !== "despesa") return false;
      const d = new Date(t.date + "T00:00:00");
      return d >= inicio && d <= fim;
    });
    const map = {};
    doPeriodo.forEach((t) => {
      const chave = t.account || "__sem__";
      if (!map[chave]) map[chave] = { total: 0, categorias: {} };
      map[chave].total += t.amount;
      map[chave].categorias[t.category] = (map[chave].categorias[t.category] || 0) + t.amount;
    });
    const totalGeral = Object.values(map).reduce((s, v) => s + v.total, 0);
    return Object.entries(map).map(([id, v]) => {
      const banco = id === "__sem__" ? { label: "Sem conta definida", color: "var(--line)" } : (findBank(id) || { label: id, color: "#9A8A7A" });
      return {
        id, label: banco.label, color: banco.color, ehCartao: banco.kind === "cartao",
        total: v.total,
        pct: totalGeral > 0 ? (v.total / totalGeral) * 100 : 0,
        categorias: Object.entries(v.categorias)
          .map(([cid, cv]) => ({ ...findCategory("despesa", cid), total: cv }))
          .sort((a, b) => b.total - a.total),
      };
    }).sort((a, b) => b.total - a.total);
  }, [transactions, monthsCount, findBank, findCategory]);

  // ---- Retrospectiva anual ----
  const [anoRetro, setAnoRetro] = useState(new Date().getFullYear());

  const anosDisponiveis = useMemo(() => {
    const anos = new Set(transactions.map((t) => Number(t.date.slice(0, 4))));
    return [...anos].sort((a, b) => b - a);
  }, [transactions]);

  const retrospectiva = useMemo(() => {
    const doAno = contadas.filter((t) => t.date.startsWith(String(anoRetro)) && t.type !== "transferencia");
    if (doAno.length === 0) return null;

    const receitas = doAno.filter((t) => t.type === "receita").reduce((s, t) => s + t.amount, 0);
    const despesas = doAno.filter((t) => t.type === "despesa").reduce((s, t) => s + t.amount, 0);

    const porMes = Array.from({ length: 12 }, (_, m) => {
      const doMes = doAno.filter((t) => Number(t.date.slice(5, 7)) === m + 1);
      const r = doMes.filter((t) => t.type === "receita").reduce((s, t) => s + t.amount, 0);
      const d = doMes.filter((t) => t.type === "despesa").reduce((s, t) => s + t.amount, 0);
      return { mes: MONTHS[m].slice(0, 3), receitas: r, despesas: d, saldo: r - d, temDados: doMes.length > 0 };
    });

    const mesesComDados = porMes.filter((m) => m.temDados);
    const noVermelho = mesesComDados.filter((m) => m.saldo < 0).length;
    const melhorMes = [...mesesComDados].sort((a, b) => b.saldo - a.saldo)[0];
    const piorMes = [...mesesComDados].sort((a, b) => a.saldo - b.saldo)[0];

    const porCat = {};
    doAno.filter((t) => t.type === "despesa").forEach((t) => {
      porCat[t.category] = (porCat[t.category] || 0) + t.amount;
    });
    const categorias = Object.entries(porCat)
      .map(([id, v]) => ({ ...findCategory("despesa", id), total: v }))
      .sort((a, b) => b.total - a.total);

    const maiorGasto = [...doAno].filter((t) => t.type === "despesa").sort((a, b) => b.amount - a.amount)[0];

    return {
      receitas, despesas, saldo: receitas - despesas, porMes, mesesComDados: mesesComDados.length,
      noVermelho, melhorMes, piorMes, categorias, maiorGasto, totalLancamentos: doAno.length,
    };
  }, [contadas, anoRetro, findCategory]);

  const customRangeData = useMemo(() => {
    if (!customStart || !customEnd) return null;
    const inRange = contadas.filter((t) => t.date >= customStart && t.date <= customEnd);
    const receitas = inRange.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
    const despesas = inRange.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
    const byCategory = {};
    inRange.filter((t) => t.type === "despesa").forEach((t) => { byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount); });
    const topCategories = Object.entries(byCategory)
      .map(([catId, value]) => { const cat = findCategory("despesa", catId); return { name: cat.label, color: cat.color, value }; })
      .sort((a, b) => b.value - a.value).slice(0, 5);
    return { receitas, despesas, saldo: receitas - despesas, count: inRange.length, topCategories };
  }, [contadas, customStart, customEnd, findCategory]);

  const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, fontFamily: "IBM Plex Mono, monospace" };

  return (
    <div>
      <header className="mb-6">
        <h1 className="rz-display text-2xl md:text-3xl">Relatórios</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Compare seus meses e veja o resumo de qualquer período.</p>
      </header>

      {/* Monthly comparison */}
      <div className="rz-card p-4 sm:p-5 mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-sm font-semibold">Comparativo mês a mês</h2>
          <div className="rz-toggle" style={{ width: 140 }}>
            <button onClick={() => setMonthsCount(6)} className={monthsCount === 6 ? "despesa-on" : "off"} style={monthsCount === 6 ? { background: "var(--ink)" } : {}}>6 meses</button>
            <button onClick={() => setMonthsCount(12)} className={monthsCount === 12 ? "despesa-on" : "off"} style={monthsCount === 12 ? { background: "var(--ink)" } : {}}>12 meses</button>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink-soft)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
            <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} width={48} />
            <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={tooltipStyle} labelStyle={{ color: "var(--ink)", fontWeight: 600 }} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Inter, sans-serif" }} />
            <Bar dataKey="receitas" name="Receitas" fill="#1B5E4F" radius={[3, 3, 0, 0]} />
            <Bar dataKey="despesas" name="Despesas" fill="#A83B2E" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th className="text-left py-2 font-medium" style={{ color: "var(--ink-soft)" }}>Mês</th>
                <th className="text-right py-2 font-medium" style={{ color: "var(--ink-soft)" }}>Receitas</th>
                <th className="text-right py-2 font-medium" style={{ color: "var(--ink-soft)" }}>Despesas</th>
                <th className="text-right py-2 font-medium" style={{ color: "var(--ink-soft)" }}>Saldo</th>
                <th className="text-right py-2 font-medium" style={{ color: "var(--ink-soft)" }}>Variação</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((row, i) => {
                const prev = i > 0 ? monthlyData[i - 1] : null;
                let variation = null;
                if (prev && prev.saldo !== 0) variation = ((row.saldo - prev.saldo) / Math.abs(prev.saldo)) * 100;
                return (
                  <tr key={row.mes} style={{ borderBottom: i === monthlyData.length - 1 ? "none" : "1px solid var(--line)" }}>
                    <td className="py-2 rz-mono">{row.mes}</td>
                    <td className="py-2 rz-mono text-right" style={{ color: "var(--emerald)" }}>{formatCurrency(row.receitas)}</td>
                    <td className="py-2 rz-mono text-right" style={{ color: "var(--brick)" }}>{formatCurrency(row.despesas)}</td>
                    <td className="py-2 rz-mono text-right font-semibold" style={{ color: row.saldo >= 0 ? "var(--emerald)" : "var(--brick)" }}>{formatCurrency(row.saldo)}</td>
                    <td className="py-2 text-right">
                      {variation === null ? (
                        <span className="rz-mono text-xs" style={{ color: "var(--ink-soft)" }}>—</span>
                      ) : (
                        <span className="rz-mono text-xs inline-flex items-center gap-1 justify-end" style={{ color: variation >= 0 ? "var(--emerald)" : "var(--brick)" }}>
                          {variation >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {Math.abs(variation).toFixed(0)}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="rz-card p-4">
          <div className="text-xs mb-1" style={{ color: "var(--ink-soft)" }}>Taxa de poupança</div>
          <div className="rz-mono text-xl font-semibold" style={{ color: indicadores.taxaPoupanca >= 0 ? "var(--emerald)" : "var(--brick)" }}>
            {indicadores.taxaPoupanca === null ? "—" : `${indicadores.taxaPoupanca.toFixed(0)}%`}
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
            {indicadores.taxaPoupanca === null
              ? "Sem receitas no período"
              : `Sobrou ${formatCurrency(indicadores.totalReceitas - indicadores.totalDespesas)} de ${formatCurrency(indicadores.totalReceitas)}`}
          </p>
        </div>

        <div className="rz-card p-4">
          <div className="text-xs mb-1" style={{ color: "var(--ink-soft)" }}>Comprometido com fixas</div>
          <div className="rz-mono text-xl font-semibold" style={{ color: indicadores.comprometimento > 70 ? "var(--brick)" : indicadores.comprometimento > 50 ? "var(--gold)" : "var(--emerald)" }}>
            {indicadores.comprometimento === null ? "—" : `${indicadores.comprometimento.toFixed(0)}%`}
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
            {formatCurrency(indicadores.totalFixas)} de contas fixas por mês
          </p>
        </div>

        <div className="rz-card p-4">
          <div className="text-xs mb-1" style={{ color: "var(--ink-soft)" }}>Médias mensais</div>
          <div className="rz-mono text-sm">
            <span style={{ color: "var(--emerald)" }}>+{formatCurrency(indicadores.receitaMedia)}</span>
          </div>
          <div className="rz-mono text-sm">
            <span style={{ color: "var(--brick)" }}>−{formatCurrency(indicadores.despesaMedia)}</span>
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
            Nos últimos {monthsCount} meses
          </p>
        </div>
      </div>

      {/* Número que não fecha com a lista de Lançamentos gera desconfiança.
          Melhor dizer o que ficou de fora do que deixar o usuário conferindo
          na mão e achando que o app errou. */}
      {excluidas > 0 && (
        <p className="text-xs mb-6 -mt-2" style={{ color: "var(--ink-soft)" }}>
          {excluidas} lançamento{excluidas > 1 ? "s" : ""} de fora destes números:
          acertos de dívida e categorias que você desmarcou em Configurações →
          Categorias. Eles continuam na aba Lançamentos e no saldo das contas.
        </p>
      )}

      {/* Evolução por categoria */}
      {mediaPorCategoria.length > 0 && (
        <div className="rz-card p-4 sm:p-5 mb-6">
          <h2 className="text-sm font-semibold mb-1">Evolução por categoria</h2>
          <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
            Escolha as categorias para comparar a tendência de gasto ao longo dos meses.
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            {mediaPorCategoria.slice(0, 12).map((c) => {
              const ativo = selectedCats.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCat(c.id)}
                  className="rz-focus text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5"
                  style={ativo
                    ? { background: c.color, color: "#fff" }
                    : { background: "var(--surface)", color: "var(--ink-soft)", border: "1px solid var(--line)" }}
                >
                  <span className="rz-dot" style={{ background: ativo ? "#fff" : c.color }} />
                  {c.name}
                </button>
              );
            })}
          </div>

          {selectedCats.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: "var(--ink-soft)" }}>
              Selecione ao menos uma categoria acima.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={evolucaoCategorias} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink-soft)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} width={48} />
                <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={tooltipStyle} labelStyle={{ color: "var(--ink)", fontWeight: 600 }} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Inter, sans-serif" }} />
                {selectedCats.map((catId) => {
                  const c = mediaPorCategoria.find((x) => x.id === catId);
                  if (!c) return null;
                  return <Line key={catId} type="monotone" dataKey={catId} name={c.name} stroke={c.color} strokeWidth={2.5} dot={{ r: 3, fill: c.color }} activeDot={{ r: 5 }} />;
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Média mensal por categoria */}
      {mediaPorCategoria.length > 0 && (
        <div className="rz-card p-4 sm:p-5 mb-6">
          <h2 className="text-sm font-semibold mb-1">Média mensal por categoria</h2>
          <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
            Use como referência ao definir seus orçamentos.
          </p>
          <div className="flex flex-col">
            {mediaPorCategoria.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 py-2" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                <span className="rz-dot" style={{ background: c.color }} />
                <span className="text-sm flex-1 truncate">{c.name}</span>
                <div className="text-right shrink-0">
                  <div className="rz-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(c.media)}<span className="text-xs font-normal" style={{ color: "var(--ink-soft)" }}>/mês</span></div>
                  <div className="rz-mono text-[11px] whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>{formatCurrency(c.total)} no total</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico de orçamento */}
      {historicoOrcamento.length > 0 && (
        <div className="rz-card p-4 sm:p-5 mb-6">
          <h2 className="text-sm font-semibold mb-1">Histórico de orçamento</h2>
          <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
            Cada quadrinho é um mês. Vermelho significa que passou do limite.
          </p>
          <div className="flex flex-col gap-4">
            {historicoOrcamento.map((b) => (
              <div key={b.id}>
                <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="rz-dot" style={{ background: b.color }} />
                    <span className="text-sm truncate">{b.name}</span>
                    {b.ehConta && (
                      <span className="rz-mono text-[9px] px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--paper-alt)", color: "var(--ink-soft)" }}>CONTA</span>
                    )}
                  </div>
                  <span className="rz-mono text-xs whitespace-nowrap" style={{ color: b.estouros > 0 ? "var(--brick)" : "var(--emerald)" }}>
                    {b.estouros === 0 ? "sempre dentro do limite" : `estourou ${b.estouros}x de ${b.meses.length}`}
                  </span>
                </div>
                <div className="flex gap-1 mb-1">
                  {b.meses.map((m) => (
                    <div
                      key={m.mes}
                      title={`${m.mes}: ${formatCurrency(m.gasto)} de ${formatCurrency(b.limit)}`}
                      className="flex-1 rounded"
                      style={{ height: 20, background: m.gasto === 0 ? "var(--paper-alt)" : m.estourou ? "var(--brick)" : "var(--emerald)", opacity: m.gasto === 0 ? 1 : 0.85 }}
                    />
                  ))}
                </div>
                <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  Limite {formatCurrency(b.limit)} · média gasta {formatCurrency(b.mediaGasto)}
                  {b.mediaGasto > b.limit && <span style={{ color: "var(--brick)" }}> · seu limite parece baixo demais</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Projected cash flow */}
      <div className="rz-card p-4 sm:p-5 mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold">Fluxo de caixa projetado</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>Saldo atual + lançamentos pendentes + contas fixas ainda não lançadas.</p>
          </div>
          <div className="rz-toggle" style={{ width: 190 }}>
            {[30, 60, 90].map((n) => (
              <button key={n} onClick={() => setHorizonDays(n)} className={horizonDays === n ? "despesa-on" : "off"} style={horizonDays === n ? { background: "var(--ink)" } : {}}>
                {n}d
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <SummaryCard label="Saldo atual" value={projection.baseline} icon={Scale} tone={projection.baseline >= 0 ? "emerald" : "brick"} />
          <SummaryCard label={`Projetado em ${horizonDays}d`} value={projection.final} icon={Scale} tone={projection.final >= 0 ? "emerald" : "brick"} />
          <SummaryCard label="Entradas previstas" value={projection.totalIn} icon={TrendingUp} tone="emerald" />
          <SummaryCard label="Saídas previstas" value={projection.totalOut} icon={TrendingDown} tone="brick" />
        </div>

        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={projection.chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="dia" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink-soft)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
            <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} width={48} />
            <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, fontFamily: "IBM Plex Mono, monospace" }} labelStyle={{ color: "var(--ink)", fontWeight: 600 }} />
            <Line type="monotone" dataKey="saldo" name="Saldo projetado" stroke="var(--gold)" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 2, fill: "var(--gold)" }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Savings */}
      {savingsAccounts.length > 0 && (
        <div className="rz-card p-4 sm:p-5 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-semibold">Poupança</h2>
            <span className="rz-mono text-xs" style={{ color: "var(--emerald)" }}>Total guardado: {formatCurrency(savingsTotal)}</span>
          </div>

          {savingsBreakdown.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: "var(--ink-soft)" }}>Nenhum valor guardado ainda.</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={savingsBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {savingsBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} stroke="var(--surface)" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, fontFamily: "IBM Plex Mono, monospace" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
                  {savingsBreakdown.map((c) => (
                    <div key={c.name} className="flex items-center gap-1.5 text-xs">
                      <span className="rz-dot" style={{ background: c.color }} />
                      <span style={{ color: "var(--ink-soft)" }}>{c.name}</span>
                      <span className="rz-mono font-semibold">{formatCurrency(c.value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {savingsEvolution.length > 1 && (
                <div>
                  <p className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>Evolução acumulada</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={savingsEvolution} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="data" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink-soft)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                      <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, fontFamily: "IBM Plex Mono, monospace" }} labelStyle={{ color: "var(--ink)", fontWeight: 600 }} />
                      <Line type="monotone" dataKey="saldo" name="Poupança acumulada" stroke="var(--emerald)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--emerald)" }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Saídas por conta */}
      {porFormaPagamento.length > 0 && (
        <div className="rz-card p-4 sm:p-5 mb-6">
          <h2 className="text-sm font-semibold mb-1">Saídas por conta</h2>
          <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
            Tudo que saiu de cada conta nos últimos {monthsCount} meses, e em que foi parar.
            Diferente dos indicadores acima, aqui entram também os acertos de dívida e as
            categorias que você tirou dos indicadores — o dinheiro saiu da conta, então aparece.
            É este quadro que bate com o extrato do banco.
          </p>
          <div className="flex flex-col gap-4">
            {porFormaPagamento.map((f) => (
              <div key={f.id}>
                <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="rz-dot" style={{ background: f.color }} />
                    <span className="text-sm truncate">{f.label}</span>
                    {f.ehCartao && (
                      <span className="rz-mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--paper-alt)", color: "var(--ink-soft)" }}>CARTÃO</span>
                    )}
                  </div>
                  <span className="rz-mono text-sm font-semibold whitespace-nowrap" style={{ color: "var(--brick)" }}>
                    {formatCurrency(f.total)} <span className="text-xs font-normal" style={{ color: "var(--ink-soft)" }}>({f.pct.toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="rz-progress-track mb-2">
                  <div className="rz-progress-fill" style={{ width: `${f.pct}%`, background: f.color }} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pl-4">
                  {f.categorias.slice(0, 6).map((c) => (
                    <div key={c.label} className="flex items-center gap-1.5 text-xs">
                      <span className="rz-dot" style={{ background: c.color, width: 6, height: 6 }} />
                      <span style={{ color: "var(--ink-soft)" }}>{c.label}</span>
                      <span className="rz-mono">{formatCurrency(c.total)}</span>
                    </div>
                  ))}
                  {f.categorias.length > 6 && (
                    <span className="text-xs" style={{ color: "var(--ink-soft)" }}>+{f.categorias.length - 6} categorias</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Retrospectiva anual */}
      {anosDisponiveis.length > 0 && (
        <div className="rz-card p-4 sm:p-5 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold">Retrospectiva anual</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>Seu ano em números.</p>
            </div>
            <select className="rz-input rz-focus text-sm" style={{ width: "auto" }} value={anoRetro} onChange={(e) => setAnoRetro(Number(e.target.value))}>
              {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {!retrospectiva ? (
            <p className="text-sm py-8 text-center" style={{ color: "var(--ink-soft)" }}>Nenhum lançamento em {anoRetro}.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <SummaryCard label={`Entrou em ${anoRetro}`} value={retrospectiva.receitas} icon={TrendingUp} tone="emerald" />
                <SummaryCard label={`Saiu em ${anoRetro}`} value={retrospectiva.despesas} icon={TrendingDown} tone="brick" />
                <SummaryCard label="Resultado do ano" value={retrospectiva.saldo} icon={Scale} tone={retrospectiva.saldo >= 0 ? "emerald" : "brick"} />
              </div>

              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={retrospectiva.porMes} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink-soft)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                  <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={tooltipStyle} labelStyle={{ color: "var(--ink)", fontWeight: 600 }} />
                  <Bar dataKey="saldo" name="Resultado" radius={[3, 3, 0, 0]}>
                    {retrospectiva.porMes.map((m, i) => (
                      <Cell key={i} fill={m.saldo >= 0 ? "var(--emerald)" : "var(--brick)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="flex flex-col gap-2 mt-5">
                <RetroLinha rotulo="Lançamentos registrados" valor={`${retrospectiva.totalLancamentos} em ${retrospectiva.mesesComDados} ${retrospectiva.mesesComDados === 1 ? "mês" : "meses"}`} />
                {retrospectiva.melhorMes && (
                  <RetroLinha rotulo="Melhor mês" valor={`${retrospectiva.melhorMes.mes} · ${formatCurrency(retrospectiva.melhorMes.saldo)}`} cor="var(--emerald)" />
                )}
                {retrospectiva.piorMes && retrospectiva.piorMes.mes !== retrospectiva.melhorMes?.mes && (
                  <RetroLinha rotulo="Mês mais apertado" valor={`${retrospectiva.piorMes.mes} · ${formatCurrency(retrospectiva.piorMes.saldo)}`} cor={retrospectiva.piorMes.saldo < 0 ? "var(--brick)" : undefined} />
                )}
                <RetroLinha
                  rotulo="Meses no vermelho"
                  valor={retrospectiva.noVermelho === 0 ? "nenhum 🎉" : `${retrospectiva.noVermelho} de ${retrospectiva.mesesComDados}`}
                  cor={retrospectiva.noVermelho === 0 ? "var(--emerald)" : "var(--brick)"}
                />
                {retrospectiva.categorias[0] && (
                  <RetroLinha rotulo="Categoria que mais pesou" valor={`${retrospectiva.categorias[0].label} · ${formatCurrency(retrospectiva.categorias[0].total)}`} />
                )}
                {retrospectiva.maiorGasto && (
                  <RetroLinha rotulo="Maior gasto único" valor={`${retrospectiva.maiorGasto.description} · ${formatCurrency(retrospectiva.maiorGasto.amount)}`} />
                )}
              </div>
            </>
          )}
        </div>
      )}


      {/* Custom period report */}
      <div className="rz-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold mb-3">Relatório por período personalizado</h2>
        <div className="flex flex-wrap items-end gap-3 mb-5">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>De</label>
            <input type="date" className="rz-input rz-focus rz-mono" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Até</label>
            <input type="date" className="rz-input rz-focus rz-mono" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
        </div>

        {customRangeData && customRangeData.count === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: "var(--ink-soft)" }}>Nenhum lançamento neste período.</p>
        ) : customRangeData && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <SummaryCard label="Receitas" value={customRangeData.receitas} icon={TrendingUp} tone="emerald" />
              <SummaryCard label="Despesas" value={customRangeData.despesas} icon={TrendingDown} tone="brick" />
              <SummaryCard label="Saldo" value={customRangeData.saldo} icon={Scale} tone={customRangeData.saldo >= 0 ? "emerald" : "brick"} />
              <div className="rz-card p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs mb-1" style={{ color: "var(--ink-soft)" }}>Lançamentos</div>
                  <div className="rz-mono text-xl font-semibold">{customRangeData.count}</div>
                </div>
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--paper-alt)" }}>
                  <Receipt size={17} style={{ color: "var(--ink-soft)" }} />
                </div>
              </div>
            </div>

            {customRangeData.topCategories.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Maiores categorias de despesa</h3>
                <div className="flex flex-col">
                  {customRangeData.topCategories.map((c, i) => (
                    <div key={c.name} className="flex items-center gap-3 py-2" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                      <span className="rz-dot" style={{ background: c.color }} />
                      <span className="text-sm flex-1">{c.name}</span>
                      <span className="rz-mono text-sm font-semibold" style={{ color: "var(--brick)" }}>{formatCurrency(c.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export { ReportsTab };
