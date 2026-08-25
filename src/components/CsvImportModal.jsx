import { useState } from "react";
import Papa from "papaparse";
import { Check, X } from "lucide-react";
import { formatCurrency, formatDateBR } from "../lib/format";
import { chaveDuplicata, normalizeDesc, parseImportedCsv } from "../lib/csv";

function CsvImportModal({ categoriesByType, banksList, onConfirm, onCancel, categoryMemory, chavesExistentes }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [despesaCategory, setDespesaCategory] = useState("");
  const [receitaCategory, setReceitaCategory] = useState("");
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState("pago");

  const handleFile = (file) => {
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const { rows: parsedRows, error: parseErr } = parseImportedCsv(results.data);
        if (parseErr) { setError(parseErr); setRows([]); return; }
        setError("");
        // Aplica o aprendizado: sugere categoria com base no que já foi usado antes
        setRows(parsedRows.map((r) => {
          const lembrete = categoryMemory[normalizeDesc(r.description)];
          const sugerida = lembrete && lembrete.tipo === r.type ? lembrete.catId : "";
          const duplicado = r.valid && chavesExistentes && chavesExistentes.has(chaveDuplicata(r));
          return { ...r, category: sugerida, sugerida: !!sugerida, duplicado, ignorar: duplicado };
        }));
      },
      error: () => setError("Não foi possível ler o arquivo."),
    });
  };

  const setRowCategory = (idx, catId) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, category: catId, sugerida: false } : r)));
  };

  const aplicarPadraoNosVazios = () => {
    setRows((prev) => prev.map((r) => {
      if (r.category) return r;
      const padrao = r.type === "despesa" ? despesaCategory : receitaCategory;
      return padrao ? { ...r, category: padrao } : r;
    }));
  };

  const validRows = rows.filter((r) => r.valid);
  const paraImportar = validRows.filter((r) => !r.ignorar);
  const duplicados = validRows.filter((r) => r.duplicado).length;
  const invalidCount = rows.length - validRows.length;
  const semCategoria = paraImportar.filter((r) => !r.category).length;
  const reconhecidos = validRows.filter((r) => r.sugerida).length;
  const hasDespesas = paraImportar.some((r) => r.type === "despesa");
  const hasReceitas = paraImportar.some((r) => r.type === "receita");

  const toggleIgnorar = (idx) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ignorar: !r.ignorar } : r)));

  const handleConfirm = () => {
    if (paraImportar.length === 0) { setError("Nenhuma linha marcada para importar."); return; }
    if (semCategoria > 0) {
      setError(`${semCategoria} lançamento${semCategoria !== 1 ? "s" : ""} sem categoria. Defina uma categoria padrão e clique em "Aplicar aos vazios", ou escolha uma a uma.`);
      return;
    }
    onConfirm(paraImportar, account, status);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: "rgba(30,43,35,0.45)" }}>
      <div className="rz-card w-full sm:max-w-2xl p-5 sm:p-6" style={{ borderRadius: "14px 14px 0 0", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="rz-display text-xl">Importar extrato (CSV)</h2>
          <button onClick={onCancel} className="rz-focus" style={{ color: "var(--ink-soft)" }} aria-label="Fechar" title="Fechar sem salvar"><X size={20} /></button>
        </div>

        {rows.length === 0 ? (
          <>
            <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
              Selecione um arquivo CSV com colunas de data, descrição e valor — o extrato do seu banco geralmente já vem assim. Valores negativos viram despesa, positivos viram receita.
            </p>
            <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} className="text-sm" />
            {error && <div className="text-xs mt-3" style={{ color: "var(--brick)" }}>{error}</div>}
          </>
        ) : (
          <>
            <p className="text-xs mb-1" style={{ color: "var(--ink-soft)" }}>
              {fileName} — {paraImportar.length} lançamento{paraImportar.length !== 1 ? "s" : ""} prontos
              {invalidCount > 0 ? `, ${invalidCount} ignorado${invalidCount !== 1 ? "s" : ""} (dados incompletos)` : ""}.
            </p>
            {reconhecidos > 0 && (
              <p className="text-xs mb-1" style={{ color: "var(--emerald)" }}>
                {reconhecidos} categorizado{reconhecidos !== 1 ? "s" : ""} automaticamente com base no seu histórico.
              </p>
            )}
            {duplicados > 0 && (
              <div className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: "var(--gold-soft)", color: "var(--gold)" }}>
                <strong>{duplicados} lançamento{duplicados !== 1 ? "s" : ""} já existe{duplicados !== 1 ? "m" : ""}</strong> no sistema (mesma data, valor e descrição).
                Eles vêm desmarcados para não duplicar — se quiser importar mesmo assim, marque a caixinha na linha.
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mb-2">
              {hasDespesas && (
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Categoria padrão (despesas)</label>
                  <select className="rz-input rz-focus text-sm" value={despesaCategory} onChange={(e) => setDespesaCategory(e.target.value)}>
                    <option value="">Selecione</option>
                    {categoriesByType.despesa.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              )}
              {hasReceitas && (
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Categoria padrão (receitas)</label>
                  <select className="rz-input rz-focus text-sm" value={receitaCategory} onChange={(e) => setReceitaCategory(e.target.value)}>
                    <option value="">Selecione</option>
                    {categoriesByType.receita.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              )}
            </div>
            <button onClick={aplicarPadraoNosVazios} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3 mb-4">
              Aplicar aos {semCategoria} sem categoria
            </button>

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex-1">
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Banco / Conta (todos)</label>
                <select className="rz-input rz-focus text-sm" value={account} onChange={(e) => setAccount(e.target.value)}>
                  <option value="">Nenhum selecionado</option>
                  {banksList.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Status</label>
                <select className="rz-input rz-focus text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="pago">Já pago (extrato do banco)</option>
                  <option value="pendente">Pendente (ainda vai acontecer)</option>
                </select>
              </div>
            </div>

            <p className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>
              Confira e ajuste a categoria de cada linha, se precisar:
            </p>
            <div className="rz-card overflow-hidden mb-4" style={{ maxHeight: 280, overflowY: "auto" }}>
              {validRows.map((r, i) => {
                const idxReal = rows.indexOf(r);
                return (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)", opacity: r.ignorar ? 0.45 : 1 }}>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <button
                        onClick={() => toggleIgnorar(idxReal)}
                        className="rz-focus shrink-0"
                        title={r.ignorar ? "Marcar para importar" : "Não importar esta linha"}
                        style={{
                          width: 14, height: 14, borderRadius: 3, border: "1.5px solid var(--line)",
                          background: r.ignorar ? "var(--surface)" : "var(--ink)",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {!r.ignorar && <Check size={10} color="var(--paper)" />}
                      </button>
                      {r.duplicado && (
                        <span className="rz-mono text-[9px] px-1 py-0.5 rounded shrink-0" style={{ background: "var(--gold-soft)", color: "var(--gold)" }}>JÁ EXISTE</span>
                      )}
                      <span className="rz-mono text-[11px] shrink-0" style={{ color: "var(--ink-soft)" }}>{formatDateBR(r.date)}</span>
                      <span className="text-xs flex-1 truncate">{r.description}</span>
                      <span className="rz-mono text-xs font-semibold whitespace-nowrap shrink-0" style={{ color: r.type === "receita" ? "var(--emerald)" : "var(--brick)" }}>
                        {r.type === "receita" ? "+ " : "− "}{formatCurrency(r.amount)}
                      </span>
                    </div>
                    <select
                      className="rz-input rz-focus text-xs sm:w-44 shrink-0"
                      style={!r.category ? { borderColor: "var(--gold)" } : r.sugerida ? { borderColor: "var(--emerald)" } : undefined}
                      value={r.category}
                      onChange={(e) => setRowCategory(idxReal, e.target.value)}
                    >
                      <option value="">Sem categoria</option>
                      {categoriesByType[r.type].map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>

            {error && <div className="text-xs mb-3" style={{ color: "var(--brick)" }}>{error}</div>}

            <div className="flex gap-2">
              <button onClick={onCancel} className="rz-btn-ghost rz-focus flex-1 text-sm">Cancelar</button>
              <button onClick={handleConfirm} className="rz-btn-primary rz-focus flex-1 text-sm flex items-center justify-center gap-2">
                <Check size={16} /> Importar {paraImportar.length} lançamento{paraImportar.length !== 1 ? "s" : ""}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { CsvImportModal };
