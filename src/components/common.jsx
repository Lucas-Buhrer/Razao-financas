import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Pencil, Trash2, X } from "lucide-react";
import { COLOR_PALETTE, MONTHS } from "../lib/constants";
import { formatCurrency } from "../lib/format";

function SummaryCard({ label, value, icon: Icon, tone }) {
  const toneColor = tone === "emerald" ? "var(--emerald)" : "var(--brick)";
  const toneSoft = tone === "emerald" ? "var(--emerald-soft)" : "var(--brick-soft)";
  return (
    <div className="rz-card p-4 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-xs mb-1 truncate" style={{ color: "var(--ink-soft)" }}>{label}</div>
        <div className="rz-mono text-lg font-semibold whitespace-nowrap" style={{ color: toneColor }}>{formatCurrency(value)}</div>
      </div>
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: toneSoft }}>
        <Icon size={15} style={{ color: toneColor }} />
      </div>
    </div>
  );
}

function PeriodNavigator({ periodMode, refDate, shiftMonth, setPeriodMode, hideToggle, onHoje }) {
  const agora = new Date();
  const ehMesAtual = refDate.getFullYear() === agora.getFullYear() && refDate.getMonth() === agora.getMonth();
  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <div className="rz-card flex items-center gap-1 px-1 py-1">
        <button onClick={() => shiftMonth(-1)} disabled={periodMode === "todos"} className="rz-focus p-1.5 rounded-md disabled:opacity-30" style={{ color: "var(--ink-soft)" }} aria-label="Mês anterior" title="Mês anterior">
          <ChevronLeft size={16} />
        </button>
        <div className="rz-mono text-sm px-2 min-w-[150px] text-center">
          {periodMode === "todos" ? "Todos os períodos" : `${MONTHS[refDate.getMonth()]} / ${refDate.getFullYear()}`}
        </div>
        <button onClick={() => shiftMonth(1)} disabled={periodMode === "todos"} className="rz-focus p-1.5 rounded-md disabled:opacity-30" style={{ color: "var(--ink-soft)" }} aria-label="Próximo mês" title="Próximo mês">
          <ChevronRight size={16} />
        </button>
      </div>
      {onHoje && periodMode === "mes" && !ehMesAtual && (
        <button onClick={onHoje} className="rz-btn-ghost rz-focus text-xs !py-2" title="Voltar para o mês atual">
          Hoje
        </button>
      )}
      {!hideToggle && (
        <button
          onClick={() => setPeriodMode((m) => (m === "mes" ? "todos" : "mes"))}
          className="rz-btn-ghost rz-focus text-xs !py-2"
        >
          {periodMode === "mes" ? "Ver todos os períodos" : "Ver por mês"}
        </button>
      )}
    </div>
  );
}

function CategoryRow({ cat, isFirst, isCustom, onDelete, onUpdate, isBank, onMove, primeira, ultima }) {
  const [editing, setEditing] = useState(false);
  const [tempLabel, setTempLabel] = useState(cat.label);
  const [tempColor, setTempColor] = useState(cat.color);
  const [tempInitial, setTempInitial] = useState(String(cat.initialBalance ?? ""));
  const [tempKind, setTempKind] = useState(cat.kind || "conta");
  const [tempClosing, setTempClosing] = useState(cat.closingDay ? String(cat.closingDay) : "");
  const [tempDue, setTempDue] = useState(cat.dueDay ? String(cat.dueDay) : "");

  const startEdit = () => {
    setTempLabel(cat.label); setTempColor(cat.color);
    setTempInitial(String(cat.initialBalance ?? ""));
    setTempKind(cat.kind || "conta");
    setTempClosing(cat.closingDay ? String(cat.closingDay) : "");
    setTempDue(cat.dueDay ? String(cat.dueDay) : "");
    setEditing(true);
  };
  const save = () => {
    if (!tempLabel.trim()) return;
    const extra = isBank ? {
      initialBalance: parseFloat(String(tempInitial).replace(",", ".")) || 0,
      kind: tempKind,
      closingDay: tempKind === "cartao" ? (parseInt(tempClosing, 10) || null) : null,
      dueDay: tempKind === "cartao" ? (parseInt(tempDue, 10) || null) : null,
    } : {};
    onUpdate(cat, tempLabel, tempColor, extra);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="px-3 py-2.5" style={{ borderTop: isFirst ? "none" : "1px solid var(--line)" }}>
        <div className="flex items-center gap-2 mb-2">
          <input
            className="rz-input rz-focus text-sm flex-1"
            value={tempLabel}
            onChange={(e) => setTempLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
          />
          <button onClick={save} className="rz-focus p-1.5 rounded-md" style={{ color: "var(--emerald)" }} aria-label="Salvar" title="Salvar alterações"><Check size={16} /></button>
          <button onClick={() => setEditing(false)} className="rz-focus p-1.5 rounded-md" style={{ color: "var(--ink-soft)" }} aria-label="Cancelar" title="Cancelar edição"><X size={16} /></button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              onClick={() => setTempColor(color)}
              className="rz-focus w-5 h-5 rounded-full"
              style={{ background: color, boxShadow: tempColor === color ? "0 0 0 2px var(--surface), 0 0 0 3px var(--ink)" : "none" }}
              aria-label={`Cor ${color}`} title="Usar esta cor"
            />
          ))}
        </div>
        {isBank && (
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            <button type="button" onClick={() => setTempKind(tempKind === "cartao" ? "conta" : "cartao")} className="rz-focus flex items-center gap-2 text-sm">
              <span style={{
                width: 15, height: 15, borderRadius: 4, border: "1.5px solid var(--line)",
                background: tempKind === "cartao" ? "var(--ink)" : "var(--surface)",
                display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                {tempKind === "cartao" && <Check size={11} color="var(--paper)" />}
              </span>
              Cartão de crédito
            </button>
            {tempKind === "cartao" && (
              <>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs" style={{ color: "var(--ink-soft)" }}>Fecha</label>
                  <input type="number" min="1" max="31" className="rz-input rz-focus rz-mono text-sm" style={{ width: 62 }} value={tempClosing} onChange={(e) => setTempClosing(e.target.value)} />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs" style={{ color: "var(--ink-soft)" }}>Vence</label>
                  <input type="number" min="1" max="31" className="rz-input rz-focus rz-mono text-sm" style={{ width: 62 }} value={tempDue} onChange={(e) => setTempDue(e.target.value)} />
                </div>
              </>
            )}
          </div>
        )}
        {isBank && tempKind !== "cartao" && (
          <div className="flex items-center gap-2 mt-3">
            <label className="text-xs" style={{ color: "var(--ink-soft)" }}>Saldo inicial</label>
            <input
              className="rz-input rz-focus rz-mono text-sm"
              style={{ width: 120 }}
              inputMode="decimal"
              placeholder="0,00"
              value={tempInitial}
              onChange={(e) => setTempInitial(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderTop: isFirst ? "none" : "1px solid var(--line)" }}>
      <span className="rz-dot" style={{ background: cat.color }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{cat.label}</div>
        {isBank && cat.kind === "cartao" ? (
          <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
            Cartão{cat.closingDay ? ` · fecha dia ${cat.closingDay}` : ""}{cat.dueDay ? ` · vence dia ${cat.dueDay}` : ""}
          </div>
        ) : isBank && cat.initialBalance ? (
          <div className="text-xs" style={{ color: "var(--ink-soft)" }}>Saldo inicial: {formatCurrency(cat.initialBalance)}</div>
        ) : null}
      </div>
      {!isCustom && <span className="rz-mono text-[9px] opacity-50">PADRÃO</span>}
      {onMove && (
        <>
          <button onClick={() => onMove(-1)} disabled={primeira} className="rz-focus p-1 rounded-md disabled:opacity-25" aria-label="Mover para cima" title="Mover para cima" style={{ color: "var(--ink-soft)" }}>
            <ChevronLeft size={12} style={{ transform: "rotate(90deg)" }} />
          </button>
          <button onClick={() => onMove(1)} disabled={ultima} className="rz-focus p-1 rounded-md disabled:opacity-25" aria-label="Mover para baixo" title="Mover para baixo" style={{ color: "var(--ink-soft)" }}>
            <ChevronRight size={12} style={{ transform: "rotate(90deg)" }} />
          </button>
        </>
      )}
      {onUpdate && (
        <button onClick={startEdit} className="rz-focus p-1 rounded-md" aria-label="Editar" title="Editar nome e cor" style={{ color: "var(--ink-soft)" }}>
          <Pencil size={13} />
        </button>
      )}
      <button onClick={() => onDelete(cat)} className="rz-focus p-1 rounded-md" aria-label="Excluir" title="Excluir" style={{ color: "var(--ink-soft)" }}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function PlaceholderTab({ item }) {
  if (!item) return null;
  const Icon = item.icon;
  return (
    <div className="rz-card p-10 text-center max-w-md mx-auto mt-10">
      <Icon size={26} className="mx-auto mb-3" style={{ color: "var(--line)" }} />
      <h2 className="rz-display text-xl mb-2">{item.label}</h2>
      <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>{item.note}</p>
      <span className="rz-stamp rz-stamp-pendente">Em breve</span>
    </div>
  );
}

function RetroLinha({ rotulo, valor, cor }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 flex-wrap" style={{ borderTop: "1px solid var(--line)" }}>
      <span className="text-sm" style={{ color: "var(--ink-soft)" }}>{rotulo}</span>
      <span className="text-sm font-medium text-right" style={cor ? { color: cor } : undefined}>{valor}</span>
    </div>
  );
}

export { CategoryRow };
export { PeriodNavigator };
export { PlaceholderTab };
export { RetroLinha };
export { SummaryCard };
