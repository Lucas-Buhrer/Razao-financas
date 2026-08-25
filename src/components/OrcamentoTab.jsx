import { useMemo, useState } from "react";
import { Check, History, Pencil, Plus, Repeat, Target, Trash2, TrendingDown, X } from "lucide-react";
import { formatCurrency } from "../lib/format";
import { PeriodNavigator, SummaryCard } from "./common";

function OrcamentoTab({ budgets, periodFiltered, refDate, shiftMonth, categoriesByType, findCategory, budgetForm, setBudgetForm, budgetError, onAdd, onUpdateLimit, onDelete, onToggleRollover, transactions, banksList, findBank }) {
  const ehConta = (b) => b.kind === "conta";
  const rotuloDe = (b) => (ehConta(b) ? (findBank(b.accountId) || { label: "conta" }) : findCategory("despesa", b.categoryId));
  const gastoDe = (b, lista) => lista
    .filter((t) => t.type === "despesa" && (ehConta(b) ? t.account === b.accountId : t.category === b.categoryId))
    .reduce((s, t) => s + Number(t.amount), 0);

  const gastoPorOrcamento = useMemo(() => {
    const map = {};
    budgets.forEach((b) => { map[b.id] = gastoDe(b, periodFiltered); });
    return map;
  }, [budgets, periodFiltered]);

  // Média histórica de gasto por categoria (últimos 6 meses antes do atual)
  const mediaHistorica = useMemo(() => {
    const map = {};
    const registrar = (chave, valor, mesKey) => {
      if (!map[chave]) map[chave] = { total: 0, meses: new Set() };
      map[chave].total += valor;
      map[chave].meses.add(mesKey);
    };
    for (let i = 1; i <= 6; i++) {
      const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
      const mesKey = `${d.getFullYear()}-${d.getMonth()}`;
      transactions.filter((t) => {
        if (t.type !== "despesa") return false;
        const td = new Date(t.date + "T00:00:00");
        return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
      }).forEach((t) => {
        registrar(`cat:${t.category}`, Number(t.amount), mesKey);
        if (t.account) registrar(`conta:${t.account}`, Number(t.amount), mesKey);
      });
    }
    const out = {};
    Object.entries(map).forEach(([k, v]) => { out[k] = v.total / Math.max(1, v.meses.size); });
    return out;
  }, [transactions, refDate]);

  // Sobra acumulada de meses anteriores, para os orçamentos com crédito ligado
  const creditoAcumulado = useMemo(() => {
    const out = {};
    budgets.filter((b) => b.rollover).forEach((b) => {
      let credito = 0;
      for (let i = 6; i >= 1; i--) {
        const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
        const doMes = transactions.filter((t) => {
          const td = new Date(t.date + "T00:00:00");
          return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
        });
        const gastoMes = gastoDe(b, doMes);
        if (gastoMes === 0) continue;
        credito = Math.max(0, credito + b.limit - gastoMes);
      }
      out[b.id] = credito;
    });
    return out;
  }, [budgets, transactions, refDate]);

  const availableCategories = categoriesByType.despesa.filter((c) => !budgets.some((b) => b.kind !== "conta" && b.categoryId === c.id));
  const availableAccounts = (banksList || []).filter((c) => !budgets.some((b) => b.kind === "conta" && b.accountId === c.id));

  const totalLimit = budgets.reduce((s, b) => s + b.limit + (creditoAcumulado[b.id] || 0), 0);
  const totalSpent = budgets.reduce((s, b) => s + (gastoPorOrcamento[b.id] || 0), 0);

  // Dias do mês, para calcular o ritmo de gasto
  const hoje = new Date();
  const mesAtual = hoje.getFullYear() === refDate.getFullYear() && hoje.getMonth() === refDate.getMonth();
  const diasNoMes = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
  const diaDeHoje = mesAtual ? hoje.getDate() : diasNoMes;

  const chaveSugestao = budgetForm.kind === "conta"
    ? (budgetForm.accountId ? `conta:${budgetForm.accountId}` : null)
    : (budgetForm.categoryId ? `cat:${budgetForm.categoryId}` : null);
  const sugestao = chaveSugestao ? mediaHistorica[chaveSugestao] : null;
  const alvoEscolhido = budgetForm.kind === "conta" ? budgetForm.accountId : budgetForm.categoryId;

  return (
    <div>
      <header className="mb-6">
        <h1 className="rz-display text-2xl md:text-3xl">Orçamento</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Defina um limite mensal por categoria e acompanhe o quanto já gastou.</p>
      </header>

      <PeriodNavigator periodMode="mes" refDate={refDate} shiftMonth={shiftMonth} setPeriodMode={() => {}} hideToggle />

      {budgets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <SummaryCard label="Total disponível para gastar" value={totalLimit} icon={Target} tone="emerald" />
          <SummaryCard label="Total gasto" value={totalSpent} icon={TrendingDown} tone={totalSpent > totalLimit ? "brick" : "emerald"} />
        </div>
      )}

      {availableCategories.length > 0 ? (
        <div className="rz-card p-5 mb-6">
          <h2 className="text-sm font-semibold mb-3">Novo orçamento</h2>
          <div className="rz-toggle mb-3" style={{ maxWidth: 340 }}>
            <button onClick={() => setBudgetForm({ ...budgetForm, kind: "categoria", accountId: "" })} className={budgetForm.kind !== "conta" ? "despesa-on" : "off"} style={budgetForm.kind !== "conta" ? { background: "var(--ink)" } : {}}>Por categoria</button>
            <button onClick={() => setBudgetForm({ ...budgetForm, kind: "conta", categoryId: "" })} className={budgetForm.kind === "conta" ? "despesa-on" : "off"} style={budgetForm.kind === "conta" ? { background: "var(--ink)" } : {}}>Por conta / cartão</button>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            {budgetForm.kind === "conta" ? (
              <select className="rz-input rz-focus" style={{ flex: "2 1 220px" }} value={budgetForm.accountId} onChange={(e) => setBudgetForm({ ...budgetForm, accountId: e.target.value })}>
                <option value="">Selecione a conta ou cartão</option>
                {availableAccounts.map((c) => <option key={c.id} value={c.id}>{c.label}{c.kind === "cartao" ? " (cartão)" : ""}</option>)}
              </select>
            ) : (
              <select className="rz-input rz-focus" style={{ flex: "2 1 220px" }} value={budgetForm.categoryId} onChange={(e) => setBudgetForm({ ...budgetForm, categoryId: e.target.value })}>
                <option value="">Selecione a categoria</option>
                {availableCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            )}
            <input className="rz-input rz-focus rz-mono sm:w-40" inputMode="decimal" placeholder="Limite (R$)" value={budgetForm.limit} onChange={(e) => setBudgetForm({ ...budgetForm, limit: e.target.value })} onKeyDown={(e) => e.key === "Enter" && onAdd()} />
            <button onClick={onAdd} className="rz-btn-primary rz-focus flex items-center justify-center gap-2 text-sm whitespace-nowrap">
              <Plus size={16} /> Adicionar
            </button>
          </div>

          {sugestao ? (
            <button
              onClick={() => setBudgetForm({ ...budgetForm, limit: sugestao.toFixed(2).replace(".", ",") })}
              className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3 mt-3 inline-flex items-center gap-1.5"
            >
              <History size={13} /> Usar média histórica: {formatCurrency(sugestao)}/mês
            </button>
          ) : alvoEscolhido ? (
            <p className="text-xs mt-3" style={{ color: "var(--ink-soft)" }}>Sem histórico suficiente nessa categoria para sugerir um limite.</p>
          ) : null}

          {budgetError && <div className="text-xs mt-2" style={{ color: "var(--brick)" }}>{budgetError}</div>}
        </div>
      ) : budgets.length > 0 ? (
        <p className="text-xs mb-6" style={{ color: "var(--ink-soft)" }}>Tudo já tem orçamento definido.</p>
      ) : null}

      {budgets.length === 0 ? (
        <div className="rz-card p-10 text-center">
          <Target size={26} className="mx-auto mb-3" style={{ color: "var(--line)" }} />
          <div className="rz-display text-lg mb-1">Nenhum orçamento definido</div>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Defina um limite mensal por categoria (ex: Alimentação) ou por conta/cartão (ex: quanto posso gastar no cartão).</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {budgets.map((b) => (
            <BudgetRow
              key={b.id}
              budget={b}
              spent={gastoPorOrcamento[b.id] || 0}
              category={rotuloDe(b)}
              ehConta={ehConta(b)}
              credito={creditoAcumulado[b.id] || 0}
              onUpdateLimit={onUpdateLimit}
              onDelete={onDelete}
              onToggleRollover={onToggleRollover}
              mesAtual={mesAtual}
              diaDeHoje={diaDeHoje}
              diasNoMes={diasNoMes}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetRow({ budget, spent, category, ehConta, credito, onUpdateLimit, onDelete, onToggleRollover, mesAtual, diaDeHoje, diasNoMes }) {
  const [editing, setEditing] = useState(false);
  const [tempLimit, setTempLimit] = useState(String(budget.limit));

  const limiteEfetivo = budget.limit + credito;
  const pct = limiteEfetivo > 0 ? (spent / limiteEfetivo) * 100 : 0;
  const tone = pct < 70 ? { color: "var(--emerald)" } : pct <= 100 ? { color: "var(--gold)" } : { color: "var(--brick)" };

  // Alerta de ritmo: projeta o gasto até o fim do mês mantendo o ritmo atual
  const projecao = mesAtual && diaDeHoje > 2 && spent > 0 ? (spent / diaDeHoje) * diasNoMes : null;
  const vaiEstourar = projecao !== null && projecao > limiteEfetivo && spent <= limiteEfetivo;

  const saveEdit = () => {
    const num = parseFloat(String(tempLimit).replace(",", "."));
    if (num && num > 0) { onUpdateLimit(budget.id, num); setEditing(false); }
  };

  return (
    <div className="rz-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rz-dot" style={{ background: category.color }} />
          <span className="text-sm font-medium truncate">{category.label}</span>
          {ehConta && (
            <span className="rz-mono text-[9px] px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--paper-alt)", color: "var(--ink-soft)" }}>CONTA</span>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onToggleRollover(budget.id)}
              className="rz-focus p-1 rounded-md"
              aria-label="Acumular sobra"
              title={budget.rollover ? "Sobra acumula para o próximo mês (ligado)" : "Sobra acumula para o próximo mês (desligado)"}
              style={{ color: budget.rollover ? "var(--emerald)" : "var(--line)" }}
            >
              <Repeat size={13} />
            </button>
            <button onClick={() => { setTempLimit(String(budget.limit)); setEditing(true); }} className="rz-focus p-1 rounded-md" aria-label="Editar limite" style={{ color: "var(--ink-soft)" }}>
              <Pencil size={13} />
            </button>
            <button onClick={() => onDelete(budget)} className="rz-focus p-1 rounded-md" aria-label="Excluir orçamento" title="Excluir este orçamento" style={{ color: "var(--ink-soft)" }}>
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-2 mb-2">
          <input className="rz-input rz-focus rz-mono text-sm flex-1" value={tempLimit} onChange={(e) => setTempLimit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit()} autoFocus />
          <button onClick={saveEdit} className="rz-focus p-1.5 rounded-md" style={{ color: "var(--emerald)" }} aria-label="Salvar" title="Salvar novo limite"><Check size={16} /></button>
          <button onClick={() => setEditing(false)} className="rz-focus p-1.5 rounded-md" style={{ color: "var(--ink-soft)" }} aria-label="Cancelar" title="Cancelar edição"><X size={16} /></button>
        </div>
      ) : (
        <div className="flex items-baseline justify-between mb-2">
          <span className="rz-mono text-sm font-semibold" style={{ color: tone.color }}>{formatCurrency(spent)}</span>
          <span className="rz-mono text-xs" style={{ color: "var(--ink-soft)" }}>
            de {formatCurrency(limiteEfetivo)}
            {credito > 0 && <span style={{ color: "var(--emerald)" }}> (+{formatCurrency(credito)})</span>}
          </span>
        </div>
      )}

      <div className="rz-progress-track">
        <div className="rz-progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: tone.color }} />
      </div>
      <div className="flex items-center justify-between mt-1 gap-2">
        {credito > 0 ? (
          <span className="rz-mono text-[11px]" style={{ color: "var(--emerald)" }}>sobra acumulada</span>
        ) : <span />}
        <span className="rz-mono text-[11px]" style={{ color: tone.color }}>{pct.toFixed(0)}%{pct > 100 ? " · acima do limite" : ""}</span>
      </div>

      {vaiEstourar && (
        <div className="text-xs mt-2 px-3 py-2 rounded-lg" style={{ background: "var(--gold-soft)", color: "var(--gold)" }}>
          Nesse ritmo, fecha o mês em <strong>{formatCurrency(projecao)}</strong> — {formatCurrency(projecao - limiteEfetivo)} acima do limite.
        </div>
      )}
    </div>
  );
}

export { BudgetRow };
export { OrcamentoTab };
