import { useMemo, useState } from "react";
import { CreditCard, Scale, Wallet } from "lucide-react";
import { dateToISO, formatCurrency, formatDateBR } from "../lib/format";
import { calcularFatura } from "../lib/finance";
import { PeriodNavigator, SummaryCard } from "./common";

function CarteiraTab({ transactions, banksList, setActiveTab, refDate, shiftMonth, findCategory }) {
  const contas = banksList.filter((b) => b.kind !== "cartao");
  const cartoes = banksList.filter((b) => b.kind === "cartao");

  const efeitoNaConta = (t, contaId) => {
    if (t.type === "transferencia") {
      if (t.account === contaId) return -t.amount;
      if (t.toAccount === contaId) return t.amount;
      return 0;
    }
    if (t.account !== contaId) return 0;
    return t.type === "receita" ? t.amount : -t.amount;
  };

  const saldoPorConta = useMemo(() => contas.map((c) => {
    const daConta = transactions.filter((t) => t.account === c.id || t.toAccount === c.id);
    const saldo = (c.initialBalance || 0) + daConta.filter((t) => t.status === "pago").reduce((s, t) => s + efeitoNaConta(t, c.id), 0);
    const pendente = daConta.filter((t) => t.status === "pendente").reduce((s, t) => s + efeitoNaConta(t, c.id), 0);
    return { ...c, saldo, pendente, movimentos: daConta.length };
  }), [contas, transactions]);

  const semConta = useMemo(() => {
    const sem = transactions.filter((t) => !t.account && t.type !== "transferencia");
    return {
      saldo: sem.filter((t) => t.status === "pago").reduce((s, t) => s + (t.type === "receita" ? t.amount : -t.amount), 0),
      pendente: sem.filter((t) => t.status === "pendente").reduce((s, t) => s + (t.type === "receita" ? t.amount : -t.amount), 0),
      movimentos: sem.length,
    };
  }, [transactions]);

  const faturas = useMemo(() => cartoes.map((c) => ({ ...c, ...calcularFatura(c, transactions, refDate) })), [cartoes, transactions, refDate]);

  const totalSaldo = saldoPorConta.reduce((s, c) => s + c.saldo, 0) + semConta.saldo;
  const totalPendente = saldoPorConta.reduce((s, c) => s + c.pendente, 0) + semConta.pendente;
  const totalFaturas = faturas.reduce((s, f) => s + f.aberto, 0);

  const linhas = [
    ...saldoPorConta.filter((c) => c.movimentos > 0 || c.initialBalance),
    ...(semConta.movimentos > 0 ? [{ id: "__sem__", label: "Sem conta definida", color: "var(--line)", ...semConta }] : []),
  ];

  return (
    <div>
      <header className="mb-6">
        <h1 className="rz-display text-2xl md:text-3xl">Contas e Cartões</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Quanto tem em cada conta e quanto está em aberto nos cartões.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <SummaryCard label="Total em contas" value={totalSaldo} icon={Wallet} tone={totalSaldo >= 0 ? "emerald" : "brick"} />
        <SummaryCard label="Faturas em aberto" value={totalFaturas} icon={CreditCard} tone="brick" />
        <SummaryCard label="Sobra depois das faturas" value={totalSaldo - totalFaturas} icon={Scale} tone={totalSaldo - totalFaturas >= 0 ? "emerald" : "brick"} />
      </div>

      <h2 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Saldo por conta</h2>
      {linhas.length === 0 ? (
        <div className="rz-card p-8 text-center mb-6">
          <Wallet size={24} className="mx-auto mb-2" style={{ color: "var(--line)" }} />
          <p className="text-sm mb-3" style={{ color: "var(--ink-soft)" }}>
            Preencha o campo "Banco / Conta" nos seus lançamentos para acompanhar o saldo de cada uma.
          </p>
          <button onClick={() => setActiveTab("lancamentos")} className="rz-btn-primary rz-focus text-sm">Ir para Lançamentos</button>
        </div>
      ) : (
        <div className="rz-card overflow-hidden mb-6">
          {linhas.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
              <span className="rz-dot" style={{ background: c.color }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={c.id === "__sem__" ? { color: "var(--ink-soft)" } : undefined}>{c.label}</div>
                <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {c.movimentos} lançamento{c.movimentos !== 1 ? "s" : ""}
                  {c.pendente !== 0 && <span style={{ color: "var(--gold)" }}> · {formatCurrency(c.pendente)} pendente</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="rz-mono text-sm font-semibold whitespace-nowrap" style={{ color: c.saldo >= 0 ? "var(--emerald)" : "var(--brick)" }}>{formatCurrency(c.saldo)}</div>
                {c.pendente !== 0 && (
                  <div className="rz-mono text-[11px] whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>previsto {formatCurrency(c.saldo + c.pendente)}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Faturas dos cartões</h2>
      <PeriodNavigator periodMode="mes" refDate={refDate} shiftMonth={shiftMonth} setPeriodMode={() => {}} hideToggle />

      {faturas.length === 0 ? (
        <div className="rz-card p-8 text-center">
          <CreditCard size={24} className="mx-auto mb-2" style={{ color: "var(--line)" }} />
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Nenhum cartão cadastrado. Em Configurações → Contas e Bancos, marque a opção "É um cartão de crédito" ao cadastrar.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {faturas.map((f) => <FaturaCard key={f.id} fatura={f} findCategory={findCategory} />)}
        </div>
      )}

      <p className="text-xs mt-4" style={{ color: "var(--ink-soft)" }}>
        A fatura soma as despesas lançadas no cartão dentro do período de fechamento. Ao pagá-la, registre uma transferência da sua conta para o cartão.
      </p>
    </div>
  );
}

function FaturaCard({ fatura, findCategory }) {
  const [open, setOpen] = useState(false);

  const porCategoria = useMemo(() => {
    const map = {};
    fatura.itens.forEach((t) => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return Object.entries(map)
      .map(([id, v]) => ({ ...findCategory("despesa", id), total: v }))
      .sort((a, b) => b.total - a.total);
  }, [fatura.itens, findCategory]);

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const vencida = fatura.vencimento && fatura.vencimento < hoje && fatura.aberto > 0;

  return (
    <div className="rz-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rz-dot" style={{ background: fatura.color }} />
          <span className="text-sm font-medium truncate">{fatura.label}</span>
        </div>
        <div className="text-right">
          <div className="rz-mono text-lg font-semibold whitespace-nowrap" style={{ color: fatura.aberto > 0 ? "var(--brick)" : "var(--emerald)" }}>
            {formatCurrency(fatura.aberto)}
          </div>
          <div className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {fatura.aberto > 0 ? "em aberto" : "fatura paga"}
          </div>
        </div>
      </div>

      <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
        {fatura.itens.length} compra{fatura.itens.length !== 1 ? "s" : ""}
        {fatura.closingDay
          ? ` · ciclo ${formatDateBR(dateToISO(fatura.inicio))} a ${formatDateBR(dateToISO(fatura.fim))}`
          : " neste mês"}
        {fatura.pagamentos > 0 && ` · ${formatCurrency(fatura.pagamentos)} já pago`}
      </p>

      {fatura.vencimento && (
        <p className="text-xs mt-1" style={{ color: vencida ? "var(--brick)" : "var(--ink-soft)" }}>
          {vencida ? "Venceu em " : "Vence em "}{formatDateBR(dateToISO(fatura.vencimento))}
        </p>
      )}

      {fatura.creditLimit > 0 && (() => {
        // O que já comprometeu o limite é a fatura aberta do ciclo atual.
        const usado = Math.max(0, fatura.aberto);
        const disponivel = Math.max(0, fatura.creditLimit - usado);
        const pct = Math.min(100, (usado / fatura.creditLimit) * 100);
        const apertado = pct >= 80;
        return (
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                Limite disponível: <span className="rz-mono">{formatCurrency(disponivel)}</span> de {formatCurrency(fatura.creditLimit)}
              </span>
              <span className="rz-mono text-[11px]" style={{ color: apertado ? "var(--brick)" : "var(--ink-soft)" }}>
                {pct.toFixed(0)}% usado
              </span>
            </div>
            <div className="rz-progress-track">
              <div className="rz-progress-fill" style={{ width: `${pct}%`, background: apertado ? "var(--brick)" : "var(--emerald)" }} />
            </div>
          </div>
        );
      })()}

      {!fatura.closingDay && (
        <p className="text-xs mt-2 px-3 py-2 rounded-lg" style={{ background: "var(--paper-alt)", color: "var(--ink-soft)" }}>
          Sem dia de fechamento definido — a fatura está usando o mês do calendário. Ajuste em Configurações → Contas e Bancos.
        </p>
      )}

      {porCategoria.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
          <div className="text-[11px] uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Onde você gastou</div>
          <div className="flex flex-col gap-1.5">
            {porCategoria.map((c) => {
              const pct = fatura.total > 0 ? (c.total / fatura.total) * 100 : 0;
              return (
                <div key={c.label} className="flex items-center gap-2">
                  <span className="rz-dot" style={{ background: c.color }} />
                  <span className="text-xs flex-1 truncate">{c.label}</span>
                  <div className="rz-progress-track shrink-0" style={{ width: 70 }}>
                    <div className="rz-progress-fill" style={{ width: `${pct}%`, background: c.color }} />
                  </div>
                  <span className="rz-mono text-xs font-semibold w-20 text-right whitespace-nowrap">{formatCurrency(c.total)}</span>
                </div>
              );
            })}
          </div>

          <button onClick={() => setOpen((v) => !v)} className="rz-focus text-xs font-medium mt-3" style={{ color: "var(--ink-soft)" }}>
            {open ? "Ocultar" : "Ver"} compras da fatura
          </button>
          {open && (
            <div className="flex flex-col mt-2 max-h-64 overflow-y-auto">
              {fatura.itens.map((t) => {
                const cat = findCategory("despesa", t.category);
                return (
                  <div key={t.id} className="flex items-center gap-2 py-2" style={{ borderTop: "1px solid var(--line)" }}>
                    <span className="rz-dot" style={{ background: cat.color }} />
                    <span className="rz-mono text-[11px] shrink-0" style={{ color: "var(--ink-soft)" }}>{formatDateBR(t.date)}</span>
                    <span className="text-xs flex-1 truncate">{t.description}</span>
                    <span className="rz-mono text-xs font-semibold whitespace-nowrap" style={{ color: "var(--brick)" }}>{formatCurrency(t.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { CarteiraTab };
export { FaturaCard };
