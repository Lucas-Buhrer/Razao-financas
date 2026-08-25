// Regras financeiras: saldo, faturas, contas fixas e projeção de caixa.
export function periodKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Valores de contas fixas podem mudar ao longo do tempo (ex: aluguel reajustado).
// amountHistory guarda { period: "YYYY-MM", amount } e usamos o valor vigente
// no período consultado, sem alterar meses já passados.
export function getAmountForPeriod(bill, refDate) {
  const period = periodKeyOf(refDate);
  const history = bill.amountHistory && bill.amountHistory.length > 0
    ? bill.amountHistory
    : [{ period: "0000-01", amount: bill.amount || 0 }];
  const sorted = [...history].sort((a, b) => a.period.localeCompare(b.period));
  let applicable = sorted[0];
  for (const entry of sorted) {
    if (entry.period <= period) applicable = entry;
    else break;
  }
  return applicable.amount;
}

// Efeito de um lançamento sobre o total que você tem em contas.
// Transferência entre contas se anula; para caixinha, o dinheiro sai das contas.
// Período coberto pela fatura de um cartão num determinado mês.
// Com dia de fechamento, o ciclo vai do dia seguinte ao fechamento anterior
// até o fechamento deste mês. Sem ele, usa o mês do calendário.
export function cicloDaFatura(cartao, refDate) {
  const y = refDate.getFullYear(), m = refDate.getMonth();
  if (!cartao.closingDay) {
    return { inicio: new Date(y, m, 1), fim: new Date(y, m + 1, 0, 23, 59, 59) };
  }
  const diasAnterior = new Date(y, m, 0).getDate();
  const diasAtual = new Date(y, m + 1, 0).getDate();
  const fechAnterior = new Date(y, m - 1, Math.min(cartao.closingDay, diasAnterior));
  return {
    inicio: new Date(fechAnterior.getFullYear(), fechAnterior.getMonth(), fechAnterior.getDate() + 1),
    fim: new Date(y, m, Math.min(cartao.closingDay, diasAtual), 23, 59, 59),
  };
}

export function calcularFatura(cartao, transactions, refDate) {
  const { inicio, fim } = cicloDaFatura(cartao, refDate);
  const itens = transactions
    .filter((t) => {
      if (t.account !== cartao.id || t.type !== "despesa") return false;
      const d = new Date(t.date + "T00:00:00");
      return d >= inicio && d <= fim;
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = itens.reduce((s, t) => s + t.amount, 0);
  const pagamentos = transactions
    .filter((t) => t.type === "transferencia" && t.toAccount === cartao.id)
    .filter((t) => { const d = new Date(t.date + "T00:00:00"); return d >= inicio && d <= fim; })
    .reduce((s, t) => s + t.amount, 0);
  let vencimento = null;
  if (cartao.dueDay) {
    const base = cartao.closingDay && cartao.dueDay < cartao.closingDay
      ? new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1)
      : new Date(refDate.getFullYear(), refDate.getMonth(), 1);
    const dias = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    vencimento = new Date(base.getFullYear(), base.getMonth(), Math.min(cartao.dueDay, dias));
  }
  return { itens, total, pagamentos, aberto: total - pagamentos, inicio, fim, vencimento };
}

export function efeitoNoSaldoGeral(t, cardIds) {
  const ehCartao = (id) => !!(id && cardIds && cardIds.has(id));

  if (t.type === "transferencia") {
    if (t.toBox) return -t.amount;              // guardou numa caixinha
    if (t.fromBox) return t.amount;             // resgatou de uma caixinha
    if (ehCartao(t.toAccount)) return -t.amount; // pagou a fatura: sai da conta
    if (ehCartao(t.account)) return t.amount;    // estorno do cartão para a conta
    return 0;                                    // entre contas comuns: se anula
  }

  // Compra no cartão não tira dinheiro da conta — isso só acontece na fatura.
  if (ehCartao(t.account)) return 0;

  return t.type === "receita" ? t.amount : -t.amount;
}

export function buildCashFlowProjection(transactions, fixedBills, horizonDays, saldosIniciais = 0, cardIds) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const baseline = saldosIniciais + transactions.filter((t) => t.status === "pago").reduce((s, t) => s + efeitoNoSaldoGeral(t, cardIds), 0);

  const events = [];

  transactions.forEach((t) => {
    if (t.status !== "pendente") return;
    if (t.type === "transferencia" && !t.toBox && !t.fromBox) return;
    const d = new Date(t.date + "T00:00:00");
    const diffDays = Math.round((d - today) / 86400000);
    if (diffDays >= 0 && diffDays <= horizonDays) {
      events.push({ date: d, amount: efeitoNoSaldoGeral(t, cardIds) });
    }
  });

  const monthsToScan = Math.ceil(horizonDays / 28) + 1;
  for (let i = 0; i < monthsToScan; i++) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const period = periodKeyOf(monthDate);
    fixedBills.filter((b) => b.active).forEach((bill) => {
      const already = transactions.some((t) => t.recurringId === bill.id && t.recurringPeriod === period);
      if (already) return;
      const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
      const day = Math.min(bill.dueDay, daysInMonth);
      const dueDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
      const diffDays = Math.round((dueDate - today) / 86400000);
      if (diffDays <= horizonDays) {
        const amount = getAmountForPeriod(bill, monthDate);
        events.push({ date: dueDate, amount: bill.type === "receita" ? amount : -amount });
      }
    });
  }

  const dailyBalances = [];
  let running = baseline;
  for (let d = 0; d <= horizonDays; d++) {
    const pointDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + d);
    events.forEach((e) => { if (e.date.getTime() === pointDate.getTime()) running += e.amount; });
    dailyBalances.push({ date: pointDate, saldo: running });
  }

  const totalIn = events.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const totalOut = events.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);

  const step = Math.max(1, Math.floor((horizonDays + 1) / 20));
  const chartData = dailyBalances
    .filter((_, i) => i % step === 0 || i === dailyBalances.length - 1)
    .map((p) => ({ dia: `${String(p.date.getDate()).padStart(2, "0")}/${String(p.date.getMonth() + 1).padStart(2, "0")}`, saldo: p.saldo }));

  return { baseline, final: dailyBalances[dailyBalances.length - 1].saldo, totalIn, totalOut, chartData };
}

export function enrichFixedBills(fixedBills, transactions, refDate) {
  const periodKey = periodKeyOf(refDate);
  const daysInMonth = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return fixedBills.map((bill) => {
    const day = Math.min(bill.dueDay, daysInMonth);
    const dueDate = new Date(refDate.getFullYear(), refDate.getMonth(), day);
    const launchedTx = transactions.find((t) => t.recurringId === bill.id && t.recurringPeriod === periodKey);
    let status = "a_vencer";
    if (launchedTx) status = "lancada";
    else if (dueDate < today) status = "atrasada";
    else if ((dueDate - today) / 86400000 <= 5) status = "vencendo";
    return { ...bill, amount: getAmountForPeriod(bill, refDate), day, launchedTx, status };
  });
}
