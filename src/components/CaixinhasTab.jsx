import { useEffect, useState } from "react";
import { Archive, Check, ChevronLeft, ChevronRight, History, Landmark, Minus, PartyPopper, Pencil, PiggyBank, Plus, Repeat, RotateCcw, Target, Trash2, X } from "lucide-react";
import { COLOR_PALETTE, MONTHS } from "../lib/constants";
import { formatCurrency, formatDateBR } from "../lib/format";
import { SummaryCard } from "./common";

function CaixinhasTab({ boxes, savingsForm, setSavingsForm, savingsError, onAdd, onDelete, onContribute, onDeleteHistoryEntry, onUpdate, onArchive, onMove, onTransfer, onAdjust, banksList }) {
  const [showTransfer, setShowTransfer] = useState(false);
  const [transfer, setTransfer] = useState({ origem: "", destino: "", valor: "" });
  const [transferError, setTransferError] = useState("");

  const ativas = boxes.filter((b) => !b.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const arquivadas = boxes.filter((b) => b.archived);

  const total = ativas.reduce((s, b) => s + b.currentAmount, 0);
  const comAlvo = ativas.filter((b) => b.targetAmount > 0);
  const totalPlanejado = ativas.reduce((s, b) => s + (b.monthlyPlan || 0), 0);

  const confirmarTransferencia = () => {
    const v = parseFloat(String(transfer.valor).replace(",", "."));
    if (!transfer.origem || !transfer.destino) { setTransferError("Escolha origem e destino."); return; }
    if (transfer.origem === transfer.destino) { setTransferError("Origem e destino precisam ser diferentes."); return; }
    if (!v || v <= 0) { setTransferError("Informe um valor."); return; }
    onTransfer(transfer.origem, transfer.destino, v);
    setTransfer({ origem: "", destino: "", valor: "" });
    setTransferError("");
    setShowTransfer(false);
  };

  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="rz-display text-2xl md:text-3xl">Caixinhas</h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
            Seu dinheiro guardado, separado por objetivo. Defina um alvo quando quiser acompanhar o progresso.
          </p>
        </div>
        {ativas.length > 1 && (
          <button onClick={() => { setTransferError(""); setShowTransfer(true); }} className="rz-btn-ghost rz-focus text-sm flex items-center gap-2 whitespace-nowrap">
            <Repeat size={15} /> Mover entre caixinhas
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <SummaryCard label="Total guardado" value={total} icon={PiggyBank} tone="emerald" />
        <SummaryCard label="Aporte mensal planejado" value={totalPlanejado} icon={Target} tone="emerald" />
        <div className="rz-card p-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs mb-1" style={{ color: "var(--ink-soft)" }}>Caixinhas com alvo</div>
            <div className="rz-mono text-lg font-semibold">{comAlvo.length} de {ativas.length}</div>
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--emerald-soft)" }}>
            <Landmark size={15} style={{ color: "var(--emerald)" }} />
          </div>
        </div>
      </div>

      <div className="rz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3">Nova caixinha</h2>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <input
            className="rz-input rz-focus flex-1"
            placeholder="Ex: Reserva de Emergência, Viagem, Casa Nova…"
            value={savingsForm.label}
            onChange={(e) => setSavingsForm({ ...savingsForm, label: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
          />
          <button onClick={onAdd} className="rz-btn-primary rz-focus flex items-center justify-center gap-2 text-sm whitespace-nowrap">
            <Plus size={16} /> Adicionar
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-1">
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              onClick={() => setSavingsForm({ ...savingsForm, color })}
              className="rz-focus w-6 h-6 rounded-full"
              style={{ background: color, boxShadow: savingsForm.color === color ? "0 0 0 2px var(--surface), 0 0 0 4px var(--ink)" : "none" }}
              aria-label={`Cor ${color}`} title="Usar esta cor"
            />
          ))}
        </div>
        {savingsError && <div className="text-xs mt-2" style={{ color: "var(--brick)" }}>{savingsError}</div>}
      </div>

      {ativas.length === 0 ? (
        <div className="rz-card p-10 text-center">
          <PiggyBank size={26} className="mx-auto mb-3" style={{ color: "var(--line)" }} />
          <div className="rz-display text-lg mb-1">Nenhuma caixinha</div>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Crie uma acima para começar a separar seu dinheiro por objetivo.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {ativas.map((b, i) => (
            <CaixinhaCard
              key={b.id}
              box={b}
              primeira={i === 0}
              ultima={i === ativas.length - 1}
              onDelete={onDelete}
              onContribute={onContribute}
              onDeleteHistoryEntry={onDeleteHistoryEntry}
              onUpdate={onUpdate}
              onArchive={onArchive}
              onMove={onMove}
              onAdjust={onAdjust}
              banksList={banksList}
            />
          ))}
        </div>
      )}

      {arquivadas.length > 0 && (
        <>
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Arquivadas</h3>
          <div className="rz-card overflow-hidden opacity-70">
            {arquivadas.map((b, i) => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                <span className="rz-dot" style={{ background: b.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{b.label}</div>
                  {b.targetAmount > 0 && (
                    <div className="text-xs" style={{ color: "var(--ink-soft)" }}>Alvo era {formatCurrency(b.targetAmount)}</div>
                  )}
                </div>
                <span className="rz-mono text-sm whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>{formatCurrency(b.currentAmount)}</span>
                <button onClick={() => onArchive(b.id)} className="rz-focus p-1.5 rounded-md" aria-label="Reativar" title="Reativar esta caixinha" style={{ color: "var(--emerald)" }}>
                  <RotateCcw size={14} />
                </button>
                <button onClick={() => onDelete(b)} className="rz-focus p-1.5 rounded-md" aria-label="Excluir" title="Excluir caixinha" style={{ color: "var(--ink-soft)" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: "rgba(30,43,35,0.45)" }}>
          <div className="rz-card w-full sm:max-w-md p-5 sm:p-6" style={{ borderRadius: "14px 14px 0 0" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="rz-display text-xl">Mover entre caixinhas</h2>
              <button onClick={() => setShowTransfer(false)} className="rz-focus" style={{ color: "var(--ink-soft)" }} aria-label="Fechar" title="Fechar sem salvar"><X size={20} /></button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>De</label>
                <select className="rz-input rz-focus" value={transfer.origem} onChange={(e) => setTransfer({ ...transfer, origem: e.target.value })}>
                  <option value="">Selecione</option>
                  {ativas.filter((b) => b.currentAmount > 0).map((b) => (
                    <option key={b.id} value={b.id}>{b.label} — {formatCurrency(b.currentAmount)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Para</label>
                <select className="rz-input rz-focus" value={transfer.destino} onChange={(e) => setTransfer({ ...transfer, destino: e.target.value })}>
                  <option value="">Selecione</option>
                  {ativas.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Valor (R$)</label>
                <input className="rz-input rz-focus rz-mono" inputMode="decimal" placeholder="0,00" value={transfer.valor} onChange={(e) => setTransfer({ ...transfer, valor: e.target.value })} onKeyDown={(e) => e.key === "Enter" && confirmarTransferencia()} />
              </div>
              {transferError && <div className="text-xs" style={{ color: "var(--brick)" }}>{transferError}</div>}
              <div className="flex gap-2 mt-1">
                <button onClick={() => setShowTransfer(false)} className="rz-btn-ghost rz-focus flex-1 text-sm">Cancelar</button>
                <button onClick={confirmarTransferencia} className="rz-btn-primary rz-focus flex-1 text-sm flex items-center justify-center gap-2">
                  <Check size={16} /> Mover
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CaixinhaCard({ box, primeira, ultima, onDelete, onContribute, onDeleteHistoryEntry, onUpdate, onArchive, onMove, onAdjust, banksList }) {
  const [amount, setAmount] = useState("");
  const [editandoSaldo, setEditandoSaldo] = useState(false);
  const [tempSaldo, setTempSaldo] = useState("");
  const [contaOrigem, setContaOrigem] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showSim, setShowSim] = useState(false);
  const [editandoAlvo, setEditandoAlvo] = useState(false);
  const [tempAlvo, setTempAlvo] = useState(box.targetAmount ? String(box.targetAmount) : "");
  const [tempPrazo, setTempPrazo] = useState(box.deadline || "");
  const [tempPlano, setTempPlano] = useState(box.monthlyPlan ? String(box.monthlyPlan) : "");

  const history = box.history || [];
  const temAlvo = box.targetAmount > 0;
  const atual = box.currentAmount;
  const pct = temAlvo ? (atual / box.targetAmount) * 100 : 0;
  const done = temAlvo && atual >= box.targetAmount;
  const remaining = temAlvo ? Math.max(0, box.targetAmount - atual) : 0;

  let sugestaoMensal = null;
  let prazoVencido = false;
  let mesesRestantes = null;
  if (temAlvo && box.deadline && !done) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const prazo = new Date(box.deadline + "T00:00:00");
    const dias = Math.ceil((prazo - now) / 86400000);
    if (dias <= 0) prazoVencido = true;
    else { mesesRestantes = Math.max(1, Math.round(dias / 30.44)); sugestaoMensal = remaining / mesesRestantes; }
  }

  const [aporteSim, setAporteSim] = useState(0);
  useEffect(() => {
    const base = box.monthlyPlan || sugestaoMensal;
    if (base && aporteSim === 0) setAporteSim(Math.round(base));
  }, [sugestaoMensal, box.monthlyPlan]);

  const aporteBase = box.monthlyPlan || sugestaoMensal || (remaining > 0 ? remaining / 12 : 100);
  const simMax = Math.max(50, Math.ceil((aporteBase * 3) / 50) * 50);
  const mesesSim = aporteSim > 0 && remaining > 0 ? Math.ceil(remaining / aporteSim) : null;
  const dataSim = mesesSim ? new Date(new Date().getFullYear(), new Date().getMonth() + mesesSim, 1) : null;

  const submitDelta = (sign) => {
    const num = parseFloat(String(amount).replace(",", "."));
    if (!num || num <= 0) return;
    onContribute(box.id, num * sign, contaOrigem);
    setAmount("");
  };

  const salvarAlvo = () => {
    onUpdate(box.id, {
      targetAmount: parseFloat(String(tempAlvo).replace(",", ".")) || null,
      deadline: tempPrazo,
      monthlyPlan: parseFloat(String(tempPlano).replace(",", ".")) || null,
    });
    setEditandoAlvo(false);
  };

  return (
    <div className="rz-card p-4 sm:p-5">
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rz-dot" style={{ background: box.color }} />
          <span className="text-sm font-medium truncate">{box.label}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => onMove(box.id, -1)} disabled={primeira} className="rz-focus p-1 rounded-md disabled:opacity-25" aria-label="Mover para cima" title="Mover para cima" style={{ color: "var(--ink-soft)" }}><ChevronLeft size={13} style={{ transform: "rotate(90deg)" }} /></button>
          <button onClick={() => onMove(box.id, 1)} disabled={ultima} className="rz-focus p-1 rounded-md disabled:opacity-25" aria-label="Mover para baixo" title="Mover para baixo" style={{ color: "var(--ink-soft)" }}><ChevronRight size={13} style={{ transform: "rotate(90deg)" }} /></button>
          <button onClick={() => { setTempAlvo(box.targetAmount ? String(box.targetAmount) : ""); setTempPrazo(box.deadline || ""); setTempPlano(box.monthlyPlan ? String(box.monthlyPlan) : ""); setEditandoAlvo(true); }} className="rz-focus p-1 rounded-md" aria-label="Definir alvo e prazo" title="Definir alvo, prazo e aporte mensal" style={{ color: "var(--ink-soft)" }}><Pencil size={13} /></button>
          <button onClick={() => onArchive(box.id)} className="rz-focus p-1 rounded-md" aria-label="Arquivar" title="Arquivar (guarda o histórico, some da lista)" style={{ color: "var(--ink-soft)" }}><Archive size={13} /></button>
          <button onClick={() => onDelete(box)} className="rz-focus p-1 rounded-md" aria-label="Excluir" title="Excluir caixinha" style={{ color: "var(--ink-soft)" }}><Trash2 size={13} /></button>
        </div>
      </div>

      {editandoAlvo ? (
        <div className="flex flex-col gap-2 mb-3 p-3 rounded-lg" style={{ background: "var(--paper-alt)" }}>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs block mb-1" style={{ color: "var(--ink-soft)" }}>Alvo (R$)</label>
              <input className="rz-input rz-focus rz-mono text-sm" inputMode="decimal" placeholder="sem alvo" value={tempAlvo} onChange={(e) => setTempAlvo(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="text-xs block mb-1" style={{ color: "var(--ink-soft)" }}>Prazo</label>
              <input type="date" className="rz-input rz-focus rz-mono text-sm" value={tempPrazo} onChange={(e) => setTempPrazo(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--ink-soft)" }}>Aporte mensal planejado (R$)</label>
            <input className="rz-input rz-focus rz-mono text-sm" inputMode="decimal" placeholder="quanto pretendo guardar por mês" value={tempPlano} onChange={(e) => setTempPlano(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditandoAlvo(false)} className="rz-btn-ghost rz-focus flex-1 text-xs !py-1.5">Cancelar</button>
            <button onClick={salvarAlvo} className="rz-btn-primary rz-focus flex-1 text-xs !py-1.5">Salvar</button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-[11px] uppercase tracking-wide mb-0.5" style={{ color: "var(--ink-soft)" }}>Guardado</div>
          {editandoSaldo ? (
            <div className="mb-2">
              <div className="flex items-center gap-2">
                <input
                  className="rz-input rz-focus rz-mono text-sm flex-1"
                  inputMode="decimal"
                  value={tempSaldo}
                  onChange={(e) => setTempSaldo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { const v = parseFloat(String(tempSaldo).replace(",", ".")); if (!isNaN(v) && v >= 0) { onAdjust(box.id, v); setEditandoSaldo(false); } }
                    if (e.key === "Escape") setEditandoSaldo(false);
                  }}
                  autoFocus
                />
                <button
                  onClick={() => { const v = parseFloat(String(tempSaldo).replace(",", ".")); if (!isNaN(v) && v >= 0) { onAdjust(box.id, v); setEditandoSaldo(false); } }}
                  className="rz-focus p-1.5 rounded-md" style={{ color: "var(--emerald)" }} aria-label="Salvar saldo" title="Salvar novo saldo"
                ><Check size={16} /></button>
                <button onClick={() => setEditandoSaldo(false)} className="rz-focus p-1.5 rounded-md" style={{ color: "var(--ink-soft)" }} aria-label="Cancelar" title="Cancelar edição"><X size={16} /></button>
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
                A diferença fica registrada no histórico como ajuste.
              </p>
            </div>
          ) : (
            <div className="flex items-baseline justify-between mb-2 gap-2">
              <button
                onClick={() => { setTempSaldo(String(atual)); setEditandoSaldo(true); }}
                className="rz-focus rz-mono text-xl font-semibold text-left"
                style={{ color: done ? "var(--emerald)" : "var(--ink)", borderBottom: "1px dashed var(--line)" }}
                title="Clique para corrigir o saldo (ex: rendimento do banco)"
              >
                {formatCurrency(atual)}
              </button>
              {temAlvo && <span className="rz-mono text-xs whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>de {formatCurrency(box.targetAmount)}</span>}
            </div>
          )}

          {temAlvo && (
            <>
              <div className="rz-progress-track mb-1">
                <div className="rz-progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: done ? "var(--emerald)" : box.color }} />
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="rz-mono text-[11px]" style={{ color: "var(--ink-soft)" }}>{pct.toFixed(0)}%</span>
                {box.deadline && <span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>até {formatDateBR(box.deadline)}</span>}
              </div>
            </>
          )}

          {box.monthlyPlan > 0 && (
            <div className="text-xs mb-2 inline-flex items-center gap-1.5 px-2 py-1 rounded" style={{ background: "var(--paper-alt)", color: "var(--ink-soft)" }}>
              <Target size={11} /> Guardando {formatCurrency(box.monthlyPlan)}/mês
            </div>
          )}

          {!temAlvo && (
            <button
              onClick={() => { setTempAlvo(""); setTempPrazo(""); setTempPlano(box.monthlyPlan ? String(box.monthlyPlan) : ""); setEditandoAlvo(true); }}
              className="rz-focus text-xs mb-3 flex items-center gap-1.5"
              style={{ color: "var(--ink-soft)" }}
            >
              <Target size={12} /> Definir um alvo para acompanhar o progresso
            </button>
          )}

          {temAlvo && !done && box.deadline && (
            <div className="rounded-lg px-3 py-2 mb-3 text-xs" style={{ background: "var(--paper-alt)", color: prazoVencido ? "var(--brick)" : "var(--ink-soft)" }}>
              {prazoVencido
                ? "Prazo já passou — ajuste a data ou dê um empurrão no valor."
                : <>Guarde <span className="rz-mono font-semibold" style={{ color: "var(--ink)" }}>{formatCurrency(sugestaoMensal)}</span>/mês para chegar até {formatDateBR(box.deadline)}</>}
            </div>
          )}

          {done ? (
            <span className="rz-stamp rz-stamp-pago inline-flex items-center gap-1"><PartyPopper size={11} /> Alvo alcançado</span>
          ) : (
            <>
              <div className="text-[11px] uppercase tracking-wide mb-1 mt-1" style={{ color: "var(--ink-soft)" }}>Movimentar</div>
              <div className="flex items-center gap-2">
                <input className="rz-input rz-focus rz-mono text-sm flex-1" inputMode="decimal" placeholder="Quanto?" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitDelta(1)} />
                <button onClick={() => submitDelta(1)} className="rz-focus p-1.5 rounded-md" style={{ color: "var(--emerald)" }} aria-label="Guardar" title="Guardar este valor"><Plus size={16} /></button>
                <button onClick={() => submitDelta(-1)} className="rz-focus p-1.5 rounded-md" style={{ color: "var(--brick)" }} aria-label="Retirar" title="Retirar este valor"><Minus size={16} /></button>
              </div>

              <div className="text-[11px] uppercase tracking-wide mb-1 mt-3" style={{ color: "var(--ink-soft)" }}>De onde vem / para onde vai</div>
              <select
                className="rz-input rz-focus text-xs"
                value={contaOrigem}
                onChange={(e) => setContaOrigem(e.target.value)}
              >
                <option value="">Dinheiro de fora das contas (não mexe no saldo)</option>
                {(banksList || []).map((b) => (
                  <option key={b.id} value={b.id}>Sai / volta para: {b.label}</option>
                ))}
              </select>
              {contaOrigem && (
                <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
                  Vai gerar uma transferência, baixando o saldo dessa conta.
                </p>
              )}

              {temAlvo && (
                <>
                  <button onClick={() => setShowSim((v) => !v)} className="rz-focus text-xs font-medium mt-3 flex items-center gap-1" style={{ color: "var(--ink-soft)" }}>
                    <Target size={13} /> {showSim ? "Ocultar" : "Simular"} ritmo
                  </button>
                  {showSim && (
                    <div className="mt-2 p-3 rounded-lg" style={{ background: "var(--paper-alt)" }}>
                      <div className="flex items-baseline justify-between mb-2">
                        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>Guardando por mês</span>
                        <span className="rz-mono text-sm font-semibold">{formatCurrency(aporteSim)}</span>
                      </div>
                      <input type="range" min="0" max={simMax} step="10" value={aporteSim} onChange={(e) => setAporteSim(Number(e.target.value))} className="w-full rz-focus" style={{ accentColor: box.color }} />
                      <p className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>
                        {aporteSim <= 0 ? "Escolha um valor para simular." : (
                          <>
                            Faltam {formatCurrency(remaining)} — nesse ritmo você chega em{" "}
                            <strong style={{ color: "var(--ink)" }}>{mesesSim} {mesesSim === 1 ? "mês" : "meses"}</strong>
                            {dataSim && `, por volta de ${MONTHS[dataSim.getMonth()].slice(0, 3)}/${dataSim.getFullYear()}`}.
                            {box.deadline && !prazoVencido && mesesRestantes && (
                              mesesSim <= mesesRestantes
                                ? <span style={{ color: "var(--emerald)" }}> Dentro do prazo. ✓</span>
                                : <span style={{ color: "var(--brick)" }}> {mesesSim - mesesRestantes} {mesesSim - mesesRestantes === 1 ? "mês" : "meses"} além do prazo.</span>
                            )}
                          </>
                        )}
                      </p>
                      {box.monthlyPlan > 0 && aporteSim !== box.monthlyPlan && (
                        <button onClick={() => onUpdate(box.id, { monthlyPlan: aporteSim })} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3 mt-2">
                          Usar {formatCurrency(aporteSim)} como meu plano mensal
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {history.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
          <button onClick={() => setShowHistory((v) => !v)} className="rz-focus text-xs font-medium flex items-center gap-1" style={{ color: "var(--ink-soft)" }}>
            <History size={13} /> {showHistory ? "Ocultar" : "Ver"} histórico ({history.length})
          </button>
          {showHistory && (
            <div className="flex flex-col mt-2 max-h-40 overflow-y-auto">
              {[...history].reverse().map((h) => (
                <div key={h.id} className="flex items-center gap-2 py-1.5" style={{ borderTop: "1px solid var(--line)" }}>
                  <span className="rz-mono text-[11px] shrink-0" style={{ color: "var(--ink-soft)" }}>{formatDateBR(h.date)}</span>
                  {h.note && <span className="text-[11px] flex-1 truncate" style={{ color: "var(--ink-soft)" }}>{h.note}</span>}
                  {!h.note && <span className="flex-1" />}
                  <span className="rz-mono text-xs font-semibold" style={{ color: h.amount >= 0 ? "var(--emerald)" : "var(--brick)" }}>
                    {h.amount >= 0 ? "+ " : "− "}{formatCurrency(Math.abs(h.amount))}
                  </span>
                  <button onClick={() => onDeleteHistoryEntry(box.id, h.id)} className="rz-focus p-1 rounded-md" aria-label="Excluir movimentação" title="Excluir esta movimentação" style={{ color: "var(--ink-soft)" }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { CaixinhaCard };
export { CaixinhasTab };
