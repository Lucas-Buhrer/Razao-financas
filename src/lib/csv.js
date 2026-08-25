// Leitura e escrita de CSV, e o "aprendizado" de categorias por descrição.
import Papa from "papaparse";
import { dateToISO } from "./format";

export function downloadCsv(rows, filename) {
  const csv = Papa.unparse(rows, { delimiter: ";" });
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function detectColumn(headers, candidates) {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const cand of candidates) {
    const idx = lower.indexOf(cand);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

export function parseBRNumber(str) {
  if (typeof str === "number") return str;
  if (!str) return NaN;
  let s = String(str).trim().replace(/[^\d,.\-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  return parseFloat(s);
}

export function parseCsvDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export function parseImportedCsv(rawRows) {
  if (!rawRows.length) return { rows: [], error: "O arquivo está vazio." };
  const headers = Object.keys(rawRows[0]);
  const dateCol = detectColumn(headers, ["data", "date", "dt"]);
  const descCol = detectColumn(headers, ["descricao", "descrição", "description", "histórico", "historico", "memo"]);
  const amountCol = detectColumn(headers, ["valor", "amount", "value"]);
  if (!dateCol || !descCol || !amountCol) {
    return { rows: [], error: 'Não conseguimos identificar as colunas de data, descrição e valor. Verifique se o CSV tem cabeçalhos como "Data", "Descrição" e "Valor".' };
  }
  const rows = rawRows
    .map((r) => {
      const date = parseCsvDate(r[dateCol]);
      const amountRaw = parseBRNumber(r[amountCol]);
      const description = (r[descCol] || "").trim();
      return {
        date, description,
        amount: Math.abs(amountRaw),
        type: amountRaw < 0 ? "despesa" : "receita",
        valid: !!date && !!description && !isNaN(amountRaw) && amountRaw !== 0,
      };
    })
    .filter((r) => r.description || r.date);
  return { rows, error: null };
}

// Reduz a descrição a algumas palavras significativas, para reconhecer
// lançamentos parecidos ("Vivo 08/2026" e "Vivo 09/2026" viram a mesma chave).
export function normalizeDesc(d) {
  return String(d || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4)
    .join(" ");
}

// Monta um "aprendizado" a partir do que o usuário já categorizou antes:
// para cada padrão de descrição, qual categoria ele mais usou.
// Identifica um lançamento por data + valor + início da descrição,
// para reconhecer se um extrato já foi importado antes.
export function chaveDuplicata(t) {
  const desc = String(t.description || "").toLowerCase().trim().slice(0, 25);
  return `${t.date}|${Number(t.amount).toFixed(2)}|${desc}`;
}

export function buildCategoryMemory(transactions) {
  const contagem = {};
  transactions
    .filter((t) => t.category && t.type !== "transferencia")
    .forEach((t) => {
      const chave = normalizeDesc(t.description);
      if (!chave) return;
      if (!contagem[chave]) contagem[chave] = {};
      const k = `${t.type}|${t.category}`;
      contagem[chave][k] = (contagem[chave][k] || 0) + 1;
    });
  const memoria = {};
  Object.entries(contagem).forEach(([chave, cats]) => {
    const [melhor] = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    const [tipo, catId] = melhor.split("|");
    memoria[chave] = { tipo, catId };
  });
  return memoria;
}

export function addMonthsToDateISO(dateISO, months) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const daysInTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, daysInTarget));
  return dateToISO(target);
}
