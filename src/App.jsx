import { useState, useEffect, useMemo, useRef } from "react";
import Papa from "papaparse";
import {
  BookOpen, Home, Receipt, Repeat, Target, BarChart3, Landmark, Wallet,
  Plus, Trash2, Pencil, X, Check, Search, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Scale, Undo2, Menu, AlertCircle, PauseCircle, PlayCircle,
  PiggyBank, Minus, PartyPopper, History, Settings, RotateCcw, LogOut, FileUp, FileDown, Users, Copy, Paperclip, Loader2,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";
import { storage, resetStorageCache } from "./storage";
import { supabase } from "./supabaseClient";
import { uploadReceipt, getReceiptUrl, deleteReceipt } from "./receipts";

/* ---------------------------------------------------------
   RAZÃO — Controle Financeiro Pessoal
   Etapa 1: Estrutura base + Navegação + Lançamentos + Persistência
--------------------------------------------------------- */

const CATEGORIES = {
  receita: [
    { id: "salario", label: "Salário", color: "#1B5E4F" },
    { id: "freelance", label: "Freelance", color: "#2E7D63" },
    { id: "investimentos", label: "Investimentos", color: "#3E8E75" },
    { id: "outros_receita", label: "Outros", color: "#6FA88F" },
  ],
  despesa: [
    { id: "moradia", label: "Moradia", color: "#A83B2E" },
    { id: "alimentacao", label: "Alimentação", color: "#B8562A" },
    { id: "transporte", label: "Transporte", color: "#C17A3A" },
    { id: "saude", label: "Saúde", color: "#9C4A56" },
    { id: "lazer", label: "Lazer", color: "#B8873A" },
    { id: "educacao", label: "Educação", color: "#7A6A9E" },
    { id: "assinaturas", label: "Assinaturas", color: "#8A5A7A" },
    { id: "outros_despesa", label: "Outros", color: "#9A8A7A" },
  ],
};

const DEFAULT_BANKS = [
  { id: "carteira", label: "Carteira", color: "#6B5B3E", initialBalance: 0 },
  { id: "conta_corrente", label: "Conta Corrente", color: "#4A6FA5", initialBalance: 0 },
  { id: "poupanca", label: "Poupança", color: "#3A7A8C", initialBalance: 0 },
  { id: "cartao_credito", label: "Cartão de Crédito", color: "#7A6A9E", initialBalance: 0 },
];

const NAV_ITEMS = [
  { id: "visao-geral", label: "Visão Geral", icon: Home, ready: true },
  { id: "lancamentos", label: "Lançamentos", icon: Receipt, ready: true },
  { id: "fixas", label: "Contas Fixas", icon: Repeat, ready: true },
  { id: "poupanca", label: "Poupança", icon: Landmark, ready: true },
  { id: "carteira", label: "Contas", icon: Wallet, ready: true },
  { id: "orcamento", label: "Orçamento", icon: Target, ready: true },
  { id: "metas", label: "Metas", icon: PiggyBank, ready: true },
  { id: "relatorios", label: "Relatórios", icon: BarChart3, ready: true },
  { id: "config", label: "Configurações", icon: Settings, ready: true },
];

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const COLOR_PALETTE = [
  "#1B5E4F", "#2E7D63", "#3E8E75", "#6FA88F", "#4A6FA5", "#3A7A8C",
  "#A83B2E", "#B8562A", "#C17A3A", "#9C4A56", "#B8873A", "#7A6A9E", "#8A5A7A", "#6B5B3E",
];

const DEFAULT_SAVINGS_SEED = [
  { label: "Reserva de Emergência", color: "#1B5E4F" },
  { label: "Investimentos", color: "#4A6FA5" },
  { label: "Viagem", color: "#B8873A" },
  { label: "Aposentadoria", color: "#7A6A9E" },
];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const todayISO = () => new Date().toISOString().slice(0, 10);
const formatCurrency = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
const formatDateBR = (iso) => { const [y,m,d] = iso.split("-"); return `${d}/${m}/${y}`; };

const emptyForm = { description: "", amount: "", date: todayISO(), type: "despesa", category: "", account: "", toAccount: "", status: "pago", installments: false, installmentCount: "2", attachmentPath: null, attachmentName: "" };

function dateToISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function colorForEmail(email) {
  if (!email) return "#9A8A7A";
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

function downloadCsv(rows, filename) {
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

function detectColumn(headers, candidates) {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const cand of candidates) {
    const idx = lower.indexOf(cand);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function parseBRNumber(str) {
  if (typeof str === "number") return str;
  if (!str) return NaN;
  let s = String(str).trim().replace(/[^\d,.\-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  return parseFloat(s);
}

function parseCsvDate(str) {
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

function parseImportedCsv(rawRows) {
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

function addMonthsToDateISO(dateISO, months) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const daysInTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, daysInTarget));
  return dateToISO(target);
}
const emptyFixedForm = { description: "", amount: "", type: "despesa", category: "", account: "", dueDay: "5" };
const emptyGoalForm = { title: "", targetAmount: "", deadline: "", color: COLOR_PALETTE[0] };

const DEFAULT_THEME = { paper: "#eef1e7", ink: "#1e2b23", emerald: "#1b5e4f", brick: "#a83b2e", gold: "#b8873a" };
const THEME_PRESETS = [
  { name: "Razão Clássico", colors: DEFAULT_THEME },
  { name: "Noturno Azul", colors: { paper: "#e8edf2", ink: "#16202b", emerald: "#2a5c8a", brick: "#a8453a", gold: "#b6893e" } },
  { name: "Vinho", colors: { paper: "#f3eae5", ink: "#2b1a18", emerald: "#5f6b35", brick: "#7a2e3a", gold: "#b8873a" } },
  { name: "Ardósia", colors: { paper: "#eceef0", ink: "#20262b", emerald: "#3a7a6e", brick: "#a14a3c", gold: "#a68a4a" } },
  { name: "Escuro", colors: { paper: "#161b19", ink: "#e6ece7", emerald: "#4fae8f", brick: "#d97764", gold: "#d4a95c" } },
  { name: "Escuro Azul", colors: { paper: "#141a21", ink: "#e4ebf2", emerald: "#5b9bd1", brick: "#d9776a", gold: "#d3aa60" } },
];

// Detecta se o tema atual é escuro comparando a luminância do fundo.
function isDarkTheme(paper) {
  if (!paper) return false;
  const hex = paper.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 0.45;
}

const FIXED_STATUS_LABEL = { lancada: "Lançada", vencendo: "Vence em breve", atrasada: "Atrasada", a_vencer: "A vencer" };
const FIXED_STATUS_CLASS = { lancada: "rz-stamp-pago", vencendo: "rz-stamp-pendente", atrasada: "rz-stamp-atrasada", a_vencer: "rz-stamp-neutro" };

function periodKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Valores de contas fixas podem mudar ao longo do tempo (ex: aluguel reajustado).
// amountHistory guarda { period: "YYYY-MM", amount } e usamos o valor vigente
// no período consultado, sem alterar meses já passados.
function getAmountForPeriod(bill, refDate) {
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

function buildCashFlowProjection(transactions, fixedBills, horizonDays, saldosIniciais = 0) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const baseline = saldosIniciais + transactions.filter((t) => t.status === "pago" && t.type !== "transferencia").reduce((s, t) => s + (t.type === "receita" ? t.amount : -t.amount), 0);

  const events = [];

  transactions.forEach((t) => {
    if (t.status !== "pendente" || t.type === "transferencia") return;
    const d = new Date(t.date + "T00:00:00");
    const diffDays = Math.round((d - today) / 86400000);
    if (diffDays >= 0 && diffDays <= horizonDays) {
      events.push({ date: d, amount: t.type === "receita" ? t.amount : -t.amount });
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

function enrichFixedBills(fixedBills, transactions, refDate) {
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

export default function App() {
  const [activeTab, setActiveTab] = useState("lancamentos");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [householdMemberCount, setHouseholdMemberCount] = useState(1);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserEmail(data?.user?.email || ""));
    supabase.from("household_members").select("id", { count: "exact", head: true }).then(({ count }) => {
      if (count) setHouseholdMemberCount(count);
    });
  }, []);

  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [themeLoaded, setThemeLoaded] = useState(false);

  const [transactions, setTransactions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [customCategories, setCustomCategories] = useState([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ label: "", type: "despesa", color: COLOR_PALETTE[0] });
  const [categoryError, setCategoryError] = useState("");
  const [hiddenDefaultCategories, setHiddenDefaultCategories] = useState([]);

  const [customBanks, setCustomBanks] = useState([]);
  const [banksLoaded, setBanksLoaded] = useState(false);
  const [bankForm, setBankForm] = useState({ label: "", color: COLOR_PALETTE[0], initialBalance: "" });
  const [bankError, setBankError] = useState("");
  const [hiddenDefaultBanks, setHiddenDefaultBanks] = useState([]);

  const [fixedBills, setFixedBills] = useState([]);
  const [fixedBillsLoaded, setFixedBillsLoaded] = useState(false);
  const [fixedForm, setFixedForm] = useState(emptyFixedForm);
  const [showFixedForm, setShowFixedForm] = useState(false);
  const [editingFixedId, setEditingFixedId] = useState(null);
  const [fixedFormError, setFixedFormError] = useState("");

  const [savingsAccounts, setSavingsAccounts] = useState([]);
  const [savingsLoaded, setSavingsLoaded] = useState(false);
  const [savingsForm, setSavingsForm] = useState({ label: "", color: COLOR_PALETTE[0] });
  const [savingsError, setSavingsError] = useState("");

  const [backupMessage, setBackupMessage] = useState(null);
  const [showCsvImport, setShowCsvImport] = useState(false);

  const [budgets, setBudgets] = useState([]);
  const [budgetsLoaded, setBudgetsLoaded] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ categoryId: "", limit: "" });
  const [budgetError, setBudgetError] = useState("");

  const [goals, setGoals] = useState([]);
  const [goalsLoaded, setGoalsLoaded] = useState(false);
  const [goalForm, setGoalForm] = useState(emptyGoalForm);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [goalError, setGoalError] = useState("");

  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [formError, setFormError] = useState("");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [accountFilter, setAccountFilter] = useState("todas");
  const [periodMode, setPeriodMode] = useState("mes");
  const [refDate, setRefDate] = useState(new Date());

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // ---------- Load theme ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("tema_cores", false);
        setTheme(res && res.value ? { ...DEFAULT_THEME, ...JSON.parse(res.value) } : DEFAULT_THEME);
      } catch (e) {
        setTheme(DEFAULT_THEME);
      } finally {
        setThemeLoaded(true);
      }
    })();
  }, []);

  // ---------- Save theme ----------
  useEffect(() => {
    if (!themeLoaded) return;
    (async () => {
      try {
        await storage.set("tema_cores", JSON.stringify(theme), false);
      } catch (e) {
        setLoadError(true);
      }
    })();
  }, [theme, themeLoaded]);

  // ---------- Load from persistent storage ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("lancamentos", false);
        setTransactions(res && res.value ? JSON.parse(res.value) : []);
      } catch (e) {
        setTransactions([]);
        setLoadError(false); // key simply doesn't exist yet — not a real error
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // ---------- Save on every change ----------
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        const result = await storage.set("lancamentos", JSON.stringify(transactions), false);
        if (!result) setLoadError(true);
      } catch (e) {
        setLoadError(true);
      }
    })();
  }, [transactions, loaded]);

  // ---------- Load custom categories ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("categorias_personalizadas", false);
        setCustomCategories(res && res.value ? JSON.parse(res.value) : []);
      } catch (e) {
        setCustomCategories([]);
      } finally {
        setCategoriesLoaded(true);
      }
    })();
  }, []);

  // ---------- Save custom categories ----------
  useEffect(() => {
    if (!categoriesLoaded) return;
    (async () => {
      try {
        await storage.set("categorias_personalizadas", JSON.stringify(customCategories), false);
      } catch (e) {
        setLoadError(true);
      }
    })();
  }, [customCategories, categoriesLoaded]);

  // ---------- Load/save hidden default categories ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("categorias_padrao_ocultas", false);
        setHiddenDefaultCategories(res && res.value ? JSON.parse(res.value) : []);
      } catch (e) {
        setHiddenDefaultCategories([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!categoriesLoaded) return;
    (async () => {
      try {
        await storage.set("categorias_padrao_ocultas", JSON.stringify(hiddenDefaultCategories), false);
      } catch (e) {
        setLoadError(true);
      }
    })();
  }, [hiddenDefaultCategories, categoriesLoaded]);

  // ---------- Load custom banks ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("bancos_personalizados", false);
        setCustomBanks(res && res.value ? JSON.parse(res.value) : []);
      } catch (e) {
        setCustomBanks([]);
      } finally {
        setBanksLoaded(true);
      }
    })();
  }, []);

  // ---------- Save custom banks ----------
  useEffect(() => {
    if (!banksLoaded) return;
    (async () => {
      try {
        await storage.set("bancos_personalizados", JSON.stringify(customBanks), false);
      } catch (e) {
        setLoadError(true);
      }
    })();
  }, [customBanks, banksLoaded]);

  // ---------- Load/save hidden default banks ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("bancos_padrao_ocultos", false);
        setHiddenDefaultBanks(res && res.value ? JSON.parse(res.value) : []);
      } catch (e) {
        setHiddenDefaultBanks([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!banksLoaded) return;
    (async () => {
      try {
        await storage.set("bancos_padrao_ocultos", JSON.stringify(hiddenDefaultBanks), false);
      } catch (e) {
        setLoadError(true);
      }
    })();
  }, [hiddenDefaultBanks, banksLoaded]);

  // ---------- Load fixed bills ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("contas_fixas", false);
        setFixedBills(res && res.value ? JSON.parse(res.value) : []);
      } catch (e) {
        setFixedBills([]);
      } finally {
        setFixedBillsLoaded(true);
      }
    })();
  }, []);

  // ---------- Save fixed bills ----------
  useEffect(() => {
    if (!fixedBillsLoaded) return;
    (async () => {
      try {
        await storage.set("contas_fixas", JSON.stringify(fixedBills), false);
      } catch (e) {
        setLoadError(true);
      }
    })();
  }, [fixedBills, fixedBillsLoaded]);

  // ---------- Load savings accounts (semeia categorias padrão na primeira vez) ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("poupanca", false);
        if (res && res.value) {
          setSavingsAccounts(JSON.parse(res.value));
        } else {
          setSavingsAccounts(DEFAULT_SAVINGS_SEED.map((s) => ({ id: uid(), ...s, currentAmount: 0, history: [] })));
        }
      } catch (e) {
        setSavingsAccounts(DEFAULT_SAVINGS_SEED.map((s) => ({ id: uid(), ...s, currentAmount: 0, history: [] })));
      } finally {
        setSavingsLoaded(true);
      }
    })();
  }, []);

  // ---------- Save savings accounts ----------
  useEffect(() => {
    if (!savingsLoaded) return;
    (async () => {
      try {
        await storage.set("poupanca", JSON.stringify(savingsAccounts), false);
      } catch (e) {
        setLoadError(true);
      }
    })();
  }, [savingsAccounts, savingsLoaded]);

  // ---------- Load budgets ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("orcamentos", false);
        setBudgets(res && res.value ? JSON.parse(res.value) : []);
      } catch (e) {
        setBudgets([]);
      } finally {
        setBudgetsLoaded(true);
      }
    })();
  }, []);

  // ---------- Save budgets ----------
  useEffect(() => {
    if (!budgetsLoaded) return;
    (async () => {
      try {
        await storage.set("orcamentos", JSON.stringify(budgets), false);
      } catch (e) {
        setLoadError(true);
      }
    })();
  }, [budgets, budgetsLoaded]);

  // ---------- Load goals ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("metas", false);
        setGoals(res && res.value ? JSON.parse(res.value) : []);
      } catch (e) {
        setGoals([]);
      } finally {
        setGoalsLoaded(true);
      }
    })();
  }, []);

  // ---------- Save goals ----------
  useEffect(() => {
    if (!goalsLoaded) return;
    (async () => {
      try {
        await storage.set("metas", JSON.stringify(goals), false);
      } catch (e) {
        setLoadError(true);
      }
    })();
  }, [goals, goalsLoaded]);

  // ---------- Toast auto-dismiss ----------
  useEffect(() => {
    if (!toast) return;
    toastTimer.current = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(toastTimer.current);
  }, [toast]);

  // ---------- Derived data ----------
  const categoriesByType = useMemo(() => ({
    receita: [...CATEGORIES.receita.filter((c) => !hiddenDefaultCategories.includes(c.id)), ...customCategories.filter((c) => c.type === "receita")],
    despesa: [...CATEGORIES.despesa.filter((c) => !hiddenDefaultCategories.includes(c.id)), ...customCategories.filter((c) => c.type === "despesa")],
  }), [customCategories, hiddenDefaultCategories]);

  const findCategory = (type, id) => {
    const allTypeCats = [...(CATEGORIES[type] || []), ...customCategories.filter((c) => c.type === type)];
    return allTypeCats.find((c) => c.id === id) || { label: id, color: "#9A8A7A" };
  };

  const banksList = useMemo(() => [...DEFAULT_BANKS.filter((b) => !hiddenDefaultBanks.includes(b.id)), ...customBanks], [customBanks, hiddenDefaultBanks]);
  const findBank = (id) => [...DEFAULT_BANKS, ...customBanks].find((b) => b.id === id);

  const saldosIniciais = useMemo(() => banksList.reduce((s, b) => s + (b.initialBalance || 0), 0), [banksList]);

  const periodFiltered = useMemo(() => {
    if (periodMode === "todos") return transactions;
    const y = refDate.getFullYear(), m = refDate.getMonth();
    return transactions.filter((t) => {
      const d = new Date(t.date + "T00:00:00");
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }, [transactions, periodMode, refDate]);

  const visibleTransactions = useMemo(() => {
    return periodFiltered
      .filter((t) => (typeFilter === "todos" ? true : t.type === typeFilter))
      .filter((t) => (categoryFilter === "todas" ? true : t.category === categoryFilter))
      .filter((t) => (accountFilter === "todas" ? true : (accountFilter === "sem" ? !t.account : t.account === accountFilter)))
      .filter((t) => t.description.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [periodFiltered, typeFilter, categoryFilter, accountFilter, search]);

  const totals = useMemo(() => {
    const receitas = periodFiltered.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
    const despesas = periodFiltered.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
    return { receitas, despesas, saldo: receitas - despesas };
  }, [periodFiltered]);

  // ---------- Handlers ----------
  const resetForm = () => { setForm(emptyForm); setEditingId(null); setFormError(""); };

  const openNewForm = () => { resetForm(); setPendingId(uid()); setShowForm(true); };

  const openEditForm = (t) => {
    setForm({
      description: t.description, amount: String(t.amount), date: t.date, type: t.type,
      category: t.category, account: t.account || "", toAccount: t.toAccount || "", status: t.status,
      installments: false, installmentCount: "2",
      attachmentPath: t.attachmentPath || null, attachmentName: t.attachmentName || "",
    });
    setEditingId(t.id);
    setShowForm(true);
  };

  const handleTypeChange = (type) => {
    setForm((f) => ({
      ...f, type,
      category: type === "transferencia" ? "" : "",
      installments: type === "despesa" ? f.installments : false,
      toAccount: type === "transferencia" ? f.toAccount : "",
    }));
  };

  const handleAttachmentSelected = async (file) => {
    if (!file) return;
    setUploadingAttachment(true);
    setFormError("");
    try {
      const path = await uploadReceipt(file, editingId || pendingId);
      setForm((f) => ({ ...f, attachmentPath: path, attachmentName: file.name }));
    } catch (err) {
      setFormError("Não foi possível enviar o arquivo. Tente novamente.");
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = async () => {
    if (form.attachmentPath) {
      try { await deleteReceipt(form.attachmentPath); } catch (err) { /* ignora falha ao limpar */ }
    }
    setForm((f) => ({ ...f, attachmentPath: null, attachmentName: "" }));
  };

  const handleOpenAttachment = async (path) => {
    try {
      const url = await getReceiptUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setToast({ message: "Não foi possível abrir o comprovante.", tone: "warning" });
    }
  };

  const checkBudgetAlert = (categoryId, type, date, addedAmount) => {
    if (type !== "despesa") return;
    const budget = budgets.find((b) => b.categoryId === categoryId);
    if (!budget) return;
    const d = new Date(date + "T00:00:00");
    const monthTotal = transactions
      .filter((t) => t.type === "despesa" && t.category === categoryId)
      .filter((t) => { const td = new Date(t.date + "T00:00:00"); return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth(); })
      .reduce((s, t) => s + Number(t.amount), 0) + addedAmount;
    if (monthTotal > budget.limit) {
      const cat = findCategory("despesa", categoryId);
      setToast({ message: `Orçamento de "${cat.label}" estourado: ${formatCurrency(monthTotal)} de ${formatCurrency(budget.limit)}.`, tone: "warning" });
    }
  };

  const handleSubmit = () => {
    const amountNum = parseFloat(String(form.amount).replace(",", "."));
    if (!form.description.trim()) { setFormError("Dê uma descrição para o lançamento."); return; }
    if (!amountNum || amountNum <= 0) { setFormError("Informe um valor maior que zero."); return; }
    if (!form.date) { setFormError("Selecione uma data."); return; }

    if (form.type === "transferencia") {
      if (!form.account) { setFormError("Selecione a conta de origem."); return; }
      if (!form.toAccount) { setFormError("Selecione a conta de destino."); return; }
      if (form.account === form.toAccount) { setFormError("Origem e destino precisam ser contas diferentes."); return; }
      const dados = { ...form, amount: amountNum, category: "", installments: false };
      if (editingId) {
        setTransactions((prev) => prev.map((t) => (t.id === editingId ? { ...t, ...dados } : t)));
      } else {
        setTransactions((prev) => [...prev, { id: pendingId || uid(), ...dados, createdBy: currentUserEmail }]);
      }
      setShowForm(false);
      resetForm();
      return;
    }

    if (!form.category) { setFormError("Selecione uma categoria."); return; }

    if (!editingId && form.type === "despesa" && form.installments) {
      const count = parseInt(form.installmentCount, 10);
      if (!count || count < 2) { setFormError("Informe pelo menos 2 parcelas."); return; }
      const perInstallment = Math.round((amountNum / count) * 100) / 100;
      const lastAmount = Math.round((amountNum - perInstallment * (count - 1)) * 100) / 100;
      const groupId = uid();
      const newTxs = [];
      for (let i = 0; i < count; i++) {
        newTxs.push({
          id: i === 0 ? (pendingId || uid()) : uid(),
          description: `${form.description} (${i + 1}/${count})`,
          amount: i === count - 1 ? lastAmount : perInstallment,
          date: addMonthsToDateISO(form.date, i),
          type: form.type, category: form.category, account: form.account,
          status: i === 0 ? form.status : "pendente",
          installmentGroupId: groupId, installmentIndex: i + 1, installmentTotal: count,
          createdBy: currentUserEmail,
          attachmentPath: i === 0 ? form.attachmentPath : null,
          attachmentName: i === 0 ? form.attachmentName : "",
        });
      }
      setTransactions((prev) => [...prev, ...newTxs]);
      checkBudgetAlert(form.category, form.type, newTxs[0].date, newTxs[0].amount);
      setShowForm(false);
      resetForm();
      return;
    }

    if (editingId) {
      setTransactions((prev) => prev.map((t) => (t.id === editingId ? { ...t, ...form, amount: amountNum } : t)));
    } else {
      setTransactions((prev) => [...prev, { id: pendingId || uid(), ...form, amount: amountNum, createdBy: currentUserEmail }]);
      checkBudgetAlert(form.category, form.type, form.date, amountNum);
    }
    setShowForm(false);
    resetForm();
  };

  const handleLaunchAllPendingBills = () => {
    const pendentes = enrichFixedBills(fixedBills, transactions, refDate).filter((b) => b.active && b.status !== "lancada");
    if (pendentes.length === 0) return;
    const daysInMonth = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
    const period = periodKeyOf(refDate);
    const novos = pendentes.map((bill) => {
      const day = Math.min(bill.dueDay, daysInMonth);
      return {
        id: uid(), description: bill.description, amount: bill.amount,
        date: `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        type: bill.type, category: bill.category, account: bill.account, status: "pago",
        recurringId: bill.id, recurringPeriod: period, createdBy: currentUserEmail,
      };
    });
    setTransactions((prev) => [...prev, ...novos]);
    setToast({ message: `${novos.length} conta${novos.length !== 1 ? "s" : ""} fixa${novos.length !== 1 ? "s" : ""} lançada${novos.length !== 1 ? "s" : ""}.` });
  };

  const handleDuplicate = (t) => {
    const copia = {
      ...t,
      id: uid(),
      description: `${t.description} (cópia)`,
      date: todayISO(),
      status: "pendente",
      createdBy: currentUserEmail,
      attachmentPath: null,
      attachmentName: "",
      recurringId: undefined,
      recurringPeriod: undefined,
    };
    setTransactions((prev) => [...prev, copia]);
    setToast({ message: `"${t.description}" duplicado.` });
  };

  const handleExportTransactions = (list, filename) => {
    if (!list || list.length === 0) { setToast({ message: "Nada para exportar neste filtro.", tone: "warning" }); return; }
    const rows = list.map((t) => ({
      Data: formatDateBR(t.date),
      Descrição: t.description,
      Tipo: t.type === "receita" ? "Receita" : t.type === "transferencia" ? "Transferência" : "Despesa",
      Categoria: t.type === "transferencia" ? "" : findCategory(t.type, t.category).label,
      Conta: t.account ? (findBank(t.account)?.label || "") : "",
      "Conta destino": t.toAccount ? (findBank(t.toAccount)?.label || "") : "",
      Status: t.status === "pago" ? "Pago" : "Pendente",
      Valor: String(t.amount).replace(".", ","),
    }));
    downloadCsv(rows, filename);
  };

  const handleMarkVisibleAsPaid = () => {
    const pendentes = visibleTransactions.filter((t) => t.status === "pendente");
    if (pendentes.length === 0) return;
    if (!window.confirm(`Marcar ${pendentes.length} lançamento${pendentes.length !== 1 ? "s" : ""} como pago?`)) return;
    const ids = new Set(pendentes.map((t) => t.id));
    setTransactions((prev) => prev.map((t) => (ids.has(t.id) ? { ...t, status: "pago" } : t)));
    setToast({ message: `${pendentes.length} lançamento${pendentes.length !== 1 ? "s" : ""} marcado${pendentes.length !== 1 ? "s" : ""} como pago.` });
  };

  const handleTogglePaid = (t) => {
    setTransactions((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: x.status === "pago" ? "pendente" : "pago" } : x)));
  };

  const handleDelete = (t) => {
    setTransactions((prev) => prev.filter((x) => x.id !== t.id));
    setToast({ message: `Lançamento "${t.description}" excluído.`, item: t });
  };

  const handleUndo = () => {
    if (toast?.item) setTransactions((prev) => [...prev, toast.item]);
    setToast(null);
  };

  const shiftMonth = (delta) => {
    setRefDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  };

  const resetAllData = () => {
    if (window.confirm("Isso vai apagar todos os lançamentos salvos. Deseja continuar?")) {
      setTransactions([]);
    }
  };

  const handleAddCategory = () => {
    const label = categoryForm.label.trim();
    if (!label) { setCategoryError("Dê um nome para a categoria."); return; }
    const allLabels = [...categoriesByType.receita, ...categoriesByType.despesa].map((c) => c.label.toLowerCase());
    if (allLabels.includes(label.toLowerCase())) { setCategoryError("Já existe uma categoria com esse nome."); return; }
    setCustomCategories((prev) => [...prev, { id: `custom_${uid()}`, label, type: categoryForm.type, color: categoryForm.color }]);
    setCategoryForm({ label: "", type: categoryForm.type, color: COLOR_PALETTE[0] });
    setCategoryError("");
  };

  const handleDeleteCategory = (cat) => {
    const isCustom = customCategories.some((c) => c.id === cat.id);
    if (isCustom) {
      setCustomCategories((prev) => prev.filter((c) => c.id !== cat.id));
    } else {
      setHiddenDefaultCategories((prev) => [...prev, cat.id]);
    }
  };

  const handleRestoreDefaultCategories = () => setHiddenDefaultCategories([]);

  const handleUpdateCategory = (cat, newLabel, newColor) => {
    const label = newLabel.trim();
    if (!label) return;
    const isCustom = customCategories.some((c) => c.id === cat.id);
    if (isCustom) {
      setCustomCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, label, color: newColor } : c)));
    } else {
      // Categoria padrão: guarda uma versão personalizada com o MESMO id,
      // assim os lançamentos que já a usam continuam apontando corretamente.
      setCustomCategories((prev) => [...prev, { id: cat.id, label, color: newColor, type: cat.type || (CATEGORIES.receita.some((x) => x.id === cat.id) ? "receita" : "despesa") }]);
      setHiddenDefaultCategories((prev) => [...prev, cat.id]);
    }
  };

  const handleUpdateBank = (bank, newLabel, newColor, extra = {}) => {
    const label = newLabel.trim();
    if (!label) return;
    const isCustom = customBanks.some((b) => b.id === bank.id);
    const patch = { label, color: newColor, ...extra };
    if (isCustom) {
      setCustomBanks((prev) => prev.map((b) => (b.id === bank.id ? { ...b, ...patch } : b)));
    } else {
      setCustomBanks((prev) => [...prev, { ...bank, ...patch }]);
      setHiddenDefaultBanks((prev) => [...prev, bank.id]);
    }
  };

  const handleAddBank = () => {
    const label = bankForm.label.trim();
    if (!label) { setBankError("Dê um nome para o banco ou conta."); return; }
    if (banksList.some((b) => b.label.toLowerCase() === label.toLowerCase())) { setBankError("Já existe um banco com esse nome."); return; }
    const inicial = parseFloat(String(bankForm.initialBalance).replace(",", ".")) || 0;
    setCustomBanks((prev) => [...prev, { id: `banco_${uid()}`, label, color: bankForm.color, initialBalance: inicial }]);
    setBankForm({ label: "", color: COLOR_PALETTE[0], initialBalance: "" });
    setBankError("");
  };

  const handleDeleteBank = (bank) => {
    const isCustom = customBanks.some((b) => b.id === bank.id);
    if (isCustom) {
      setCustomBanks((prev) => prev.filter((b) => b.id !== bank.id));
    } else {
      setHiddenDefaultBanks((prev) => [...prev, bank.id]);
    }
  };

  const handleRestoreDefaultBanks = () => setHiddenDefaultBanks([]);

  const resetFixedForm = () => { setFixedForm(emptyFixedForm); setEditingFixedId(null); setFixedFormError(""); };
  const openNewFixedForm = () => { resetFixedForm(); setShowFixedForm(true); };
  const openEditFixedForm = (bill) => {
    setFixedForm({ description: bill.description, amount: String(getAmountForPeriod(bill, refDate)), type: bill.type, category: bill.category, account: bill.account || "", dueDay: String(bill.dueDay) });
    setEditingFixedId(bill.id);
    setShowFixedForm(true);
  };
  const handleFixedTypeChange = (type) => setFixedForm((f) => ({ ...f, type, category: "" }));

  const handleSubmitFixed = () => {
    const amountNum = parseFloat(String(fixedForm.amount).replace(",", "."));
    const dayNum = parseInt(fixedForm.dueDay, 10);
    if (!fixedForm.description.trim()) { setFixedFormError("Dê uma descrição para a conta fixa."); return; }
    if (!amountNum || amountNum <= 0) { setFixedFormError("Informe um valor maior que zero."); return; }
    if (!fixedForm.category) { setFixedFormError("Selecione uma categoria."); return; }
    if (!dayNum || dayNum < 1 || dayNum > 31) { setFixedFormError("Informe um dia de vencimento entre 1 e 31."); return; }

    const period = periodKeyOf(refDate);

    if (editingFixedId) {
      setFixedBills((prev) => prev.map((b) => {
        if (b.id !== editingFixedId) return b;
        const currentEffective = getAmountForPeriod(b, refDate);
        const baseHistory = b.amountHistory && b.amountHistory.length > 0 ? b.amountHistory : [{ period: "0000-01", amount: b.amount || 0 }];
        const amountHistory = amountNum === currentEffective
          ? baseHistory
          : [...baseHistory.filter((h) => h.period !== period), { period, amount: amountNum }];
        return {
          ...b,
          description: fixedForm.description,
          type: fixedForm.type,
          category: fixedForm.category,
          account: fixedForm.account,
          dueDay: dayNum,
          amountHistory,
        };
      }));
    } else {
      setFixedBills((prev) => [...prev, {
        id: uid(), description: fixedForm.description, type: fixedForm.type, category: fixedForm.category,
        account: fixedForm.account, dueDay: dayNum, active: true, amountHistory: [{ period, amount: amountNum }],
      }]);
    }
    setShowFixedForm(false);
    resetFixedForm();
  };

  const handleDeleteFixed = (bill) => {
    setFixedBills((prev) => prev.filter((b) => b.id !== bill.id));
  };

  const handleToggleActiveFixed = (bill) => {
    setFixedBills((prev) => prev.map((b) => (b.id === bill.id ? { ...b, active: !b.active } : b)));
  };

  const handleLaunchFixedBill = (bill) => {
    const daysInMonth = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
    const day = Math.min(bill.dueDay, daysInMonth);
    const dateISO = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const newTx = {
      id: uid(), description: bill.description, amount: bill.amount, date: dateISO,
      type: bill.type, category: bill.category, account: bill.account, status: "pago",
      recurringId: bill.id, recurringPeriod: periodKeyOf(refDate), createdBy: currentUserEmail,
    };
    setTransactions((prev) => [...prev, newTx]);
  };

  const handleUndoLaunchFixedBill = (bill) => {
    const period = periodKeyOf(refDate);
    setTransactions((prev) => prev.filter((t) => !(t.recurringId === bill.id && t.recurringPeriod === period)));
  };

  const handleAddSavingsAccount = () => {
    const label = savingsForm.label.trim();
    if (!label) { setSavingsError("Dê um nome para a categoria."); return; }
    if (savingsAccounts.some((s) => s.label.toLowerCase() === label.toLowerCase())) { setSavingsError("Já existe uma categoria de poupança com esse nome."); return; }
    setSavingsAccounts((prev) => [...prev, { id: uid(), label, color: savingsForm.color, currentAmount: 0, history: [] }]);
    setSavingsForm({ label: "", color: COLOR_PALETTE[0] });
    setSavingsError("");
  };

  const handleDeleteSavingsAccount = (account) => {
    setSavingsAccounts((prev) => prev.filter((s) => s.id !== account.id));
  };

  const handleContributeSavings = (accountId, delta) => {
    setSavingsAccounts((prev) => prev.map((s) => (s.id === accountId ? {
      ...s,
      currentAmount: Math.max(0, s.currentAmount + delta),
      history: [...(s.history || []), { id: uid(), date: todayISO(), amount: delta }],
    } : s)));
  };

  const handleDeleteSavingsHistoryEntry = (accountId, entryId) => {
    setSavingsAccounts((prev) => prev.map((s) => {
      if (s.id !== accountId) return s;
      const entry = (s.history || []).find((h) => h.id === entryId);
      if (!entry) return s;
      return {
        ...s,
        currentAmount: Math.max(0, s.currentAmount - entry.amount),
        history: s.history.filter((h) => h.id !== entryId),
      };
    }));
  };

  const handleExportBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      data: {
        lancamentos: transactions,
        categorias_personalizadas: customCategories,
        categorias_padrao_ocultas: hiddenDefaultCategories,
        bancos_personalizados: customBanks,
        bancos_padrao_ocultos: hiddenDefaultBanks,
        contas_fixas: fixedBills,
        orcamentos: budgets,
        metas: goals,
        poupanca: savingsAccounts,
        tema_cores: theme,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `razao-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (file) => {
    if (!window.confirm("Isso vai substituir TODOS os seus dados atuais pelos do backup. Deseja continuar?")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        const d = parsed.data || parsed;
        if (d.lancamentos) setTransactions(d.lancamentos);
        if (d.categorias_personalizadas) setCustomCategories(d.categorias_personalizadas);
        if (d.categorias_padrao_ocultas) setHiddenDefaultCategories(d.categorias_padrao_ocultas);
        if (d.bancos_personalizados) setCustomBanks(d.bancos_personalizados);
        if (d.bancos_padrao_ocultos) setHiddenDefaultBanks(d.bancos_padrao_ocultos);
        if (d.contas_fixas) setFixedBills(d.contas_fixas);
        if (d.orcamentos) setBudgets(d.orcamentos);
        if (d.metas) setGoals(d.metas);
        if (d.poupanca) setSavingsAccounts(d.poupanca);
        if (d.tema_cores) setTheme(d.tema_cores);
        setBackupMessage({ type: "success", text: "Backup importado com sucesso!" });
      } catch (err) {
        setBackupMessage({ type: "error", text: "Arquivo inválido. Verifique se é um backup do Razão (.json)." });
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmCsvImport = (rows, despesaCategory, receitaCategory, account, status) => {
    const newTxs = rows.map((r) => ({
      id: uid(), description: r.description, amount: r.amount, date: r.date, type: r.type,
      category: r.type === "despesa" ? despesaCategory : receitaCategory,
      account, status: status || "pago", createdBy: currentUserEmail,
    }));
    setTransactions((prev) => [...prev, ...newTxs]);
    setShowCsvImport(false);
    setToast({ message: `${newTxs.length} lançamento${newTxs.length !== 1 ? "s" : ""} importado${newTxs.length !== 1 ? "s" : ""} com sucesso.` });
  };

  const handleAddBudget = () => {
    if (!budgetForm.categoryId) { setBudgetError("Selecione uma categoria."); return; }
    const limitNum = parseFloat(String(budgetForm.limit).replace(",", "."));
    if (!limitNum || limitNum <= 0) { setBudgetError("Informe um limite maior que zero."); return; }
    if (budgets.some((b) => b.categoryId === budgetForm.categoryId)) { setBudgetError("Essa categoria já tem um orçamento definido."); return; }
    setBudgets((prev) => [...prev, { id: uid(), categoryId: budgetForm.categoryId, limit: limitNum }]);
    setBudgetForm({ categoryId: "", limit: "" });
    setBudgetError("");
  };

  const handleUpdateBudgetLimit = (budgetId, newLimit) => {
    setBudgets((prev) => prev.map((b) => (b.id === budgetId ? { ...b, limit: newLimit } : b)));
  };

  const handleDeleteBudget = (budget) => {
    setBudgets((prev) => prev.filter((b) => b.id !== budget.id));
  };

  const resetGoalForm = () => { setGoalForm(emptyGoalForm); setEditingGoalId(null); setGoalError(""); };
  const openNewGoalForm = () => { resetGoalForm(); setShowGoalForm(true); };
  const openEditGoalForm = (goal) => {
    setGoalForm({ title: goal.title, targetAmount: String(goal.targetAmount), deadline: goal.deadline || "", color: goal.color });
    setEditingGoalId(goal.id);
    setShowGoalForm(true);
  };

  const handleSubmitGoal = () => {
    const targetNum = parseFloat(String(goalForm.targetAmount).replace(",", "."));
    if (!goalForm.title.trim()) { setGoalError("Dê um nome para a meta."); return; }
    if (!targetNum || targetNum <= 0) { setGoalError("Informe um valor alvo maior que zero."); return; }

    if (editingGoalId) {
      setGoals((prev) => prev.map((g) => (g.id === editingGoalId ? { ...g, title: goalForm.title.trim(), targetAmount: targetNum, deadline: goalForm.deadline, color: goalForm.color } : g)));
    } else {
      setGoals((prev) => [...prev, { id: uid(), title: goalForm.title.trim(), targetAmount: targetNum, currentAmount: 0, deadline: goalForm.deadline, color: goalForm.color, history: [] }]);
    }
    setShowGoalForm(false);
    resetGoalForm();
  };

  const handleDeleteGoal = (goal) => {
    setGoals((prev) => prev.filter((g) => g.id !== goal.id));
  };

  const handleContributeGoal = (goalId, delta) => {
    setGoals((prev) => prev.map((g) => (g.id === goalId ? {
      ...g,
      currentAmount: Math.max(0, g.currentAmount + delta),
      history: [...(g.history || []), { id: uid(), date: todayISO(), amount: delta }],
    } : g)));
  };

  const handleDeleteGoalHistoryEntry = (goalId, entryId) => {
    setGoals((prev) => prev.map((g) => {
      if (g.id !== goalId) return g;
      const entry = (g.history || []).find((h) => h.id === entryId);
      if (!entry) return g;
      return {
        ...g,
        currentAmount: Math.max(0, g.currentAmount - entry.amount),
        history: g.history.filter((h) => h.id !== entryId),
      };
    }));
  };

  return (
    <div
      className="rz-app min-h-screen flex flex-col md:flex-row"
      data-dark={isDarkTheme(theme.paper) ? "true" : "false"}
      style={{ "--paper": theme.paper, "--ink": theme.ink, "--emerald": theme.emerald, "--brick": theme.brick, "--gold": theme.gold }}
    >

      {/* ---------------- Sidebar ---------------- */}
      <aside className="rz-sidebar md:w-60 md:h-screen md:sticky md:top-0 flex flex-col shrink-0 md:overflow-y-auto">
        <div className="flex items-center justify-between p-4 md:p-5">
          <div className="flex items-center gap-2">
            <BookOpen size={22} color="#EEF1E7" strokeWidth={1.75} />
            <div>
              <div className="rz-display text-lg leading-tight" style={{ color: "#EEF1E7" }}>Razão</div>
              <div className="text-[11px] leading-tight" style={{ color: "#8FA090" }}>controle financeiro</div>
            </div>
          </div>
          <button className="md:hidden rz-focus" onClick={() => setMobileNavOpen((v) => !v)} aria-label="Abrir menu">
            <Menu size={22} color="#EEF1E7" />
          </button>
        </div>

        <nav className={`${mobileNavOpen ? "flex" : "hidden"} md:flex flex-col gap-1 px-3 pb-4 md:pb-0 overflow-y-auto`}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setMobileNavOpen(false); }}
                className={`rz-nav-item rz-focus ${isActive ? "active" : ""} flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left`}
              >
                <Icon size={17} strokeWidth={1.75} />
                <span className="flex-1">{item.label}</span>
                {!item.ready && <span className="rz-mono text-[9px] opacity-60">EM BREVE</span>}
              </button>
            );
          })}
        </nav>

        <div className={`${mobileNavOpen ? "flex" : "hidden"} md:flex flex-col gap-1 p-3 mt-auto`} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button
            onClick={() => supabase.auth.signOut()}
            className="rz-nav-item rz-focus flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left"
          >
            <LogOut size={17} strokeWidth={1.75} />
            <span className="flex-1">Sair da conta</span>
          </button>
        </div>
      </aside>

      {/* ---------------- Main ---------------- */}
      <main className="flex-1 p-5 md:p-10 max-w-6xl w-full mx-auto">
        {!loaded ? (
          <div className="flex items-center gap-3 mt-20 justify-center" style={{ color: "var(--ink-soft)" }}>
            <div className="rz-mono text-sm">Carregando seus dados…</div>
          </div>
        ) : activeTab === "visao-geral" ? (
          <VisaoGeralTab
            transactions={transactions}
            periodFiltered={periodFiltered}
            totals={totals}
            refDate={refDate}
            periodMode={periodMode}
            shiftMonth={shiftMonth}
            setPeriodMode={setPeriodMode}
            findCategory={findCategory}
            setActiveTab={setActiveTab}
            fixedBills={fixedBills}
            findBank={findBank}
            onLaunchFixedBill={handleLaunchFixedBill}
            savingsAccounts={savingsAccounts}
            saldosIniciais={saldosIniciais}
          />
        ) : activeTab === "carteira" ? (
          <CarteiraTab
            transactions={transactions}
            banksList={banksList}
            setActiveTab={setActiveTab}
          />
        ) : activeTab === "poupanca" ? (
          <PoupancaTab
            savingsAccounts={savingsAccounts}
            savingsForm={savingsForm}
            setSavingsForm={setSavingsForm}
            savingsError={savingsError}
            onAdd={handleAddSavingsAccount}
            onDelete={handleDeleteSavingsAccount}
            onContribute={handleContributeSavings}
            onDeleteHistoryEntry={handleDeleteSavingsHistoryEntry}
          />
        ) : activeTab === "config" ? (
          <ConfiguracoesTab
            theme={theme}
            setTheme={setTheme}
            categoriesByType={categoriesByType}
            customCategories={customCategories}
            categoryForm={categoryForm}
            setCategoryForm={setCategoryForm}
            categoryError={categoryError}
            onAddCategory={handleAddCategory}
            onDeleteCategory={handleDeleteCategory}
            onUpdateCategory={handleUpdateCategory}
            hiddenCategoriesCount={hiddenDefaultCategories.length}
            onRestoreCategories={handleRestoreDefaultCategories}
            banksList={banksList}
            customBanks={customBanks}
            bankForm={bankForm}
            setBankForm={setBankForm}
            bankError={bankError}
            onAddBank={handleAddBank}
            onDeleteBank={handleDeleteBank}
            onUpdateBank={handleUpdateBank}
            hiddenBanksCount={hiddenDefaultBanks.length}
            onRestoreBanks={handleRestoreDefaultBanks}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            backupMessage={backupMessage}
            onResetData={resetAllData}
          />
        ) : activeTab === "relatorios" ? (
          <ReportsTab transactions={transactions} findCategory={findCategory} fixedBills={fixedBills} savingsAccounts={savingsAccounts} saldosIniciais={saldosIniciais} />
        ) : activeTab === "orcamento" ? (
          <OrcamentoTab
            budgets={budgets}
            periodFiltered={periodFiltered}
            refDate={refDate}
            shiftMonth={shiftMonth}
            categoriesByType={categoriesByType}
            findCategory={findCategory}
            budgetForm={budgetForm}
            setBudgetForm={setBudgetForm}
            budgetError={budgetError}
            onAdd={handleAddBudget}
            onUpdateLimit={handleUpdateBudgetLimit}
            onDelete={handleDeleteBudget}
          />
        ) : activeTab === "metas" ? (
          <MetasTab
            goals={goals}
            goalForm={goalForm}
            setGoalForm={setGoalForm}
            showGoalForm={showGoalForm}
            setShowGoalForm={setShowGoalForm}
            editingGoalId={editingGoalId}
            goalError={goalError}
            onOpenNew={openNewGoalForm}
            onOpenEdit={openEditGoalForm}
            onSubmit={handleSubmitGoal}
            onDelete={handleDeleteGoal}
            onCancelForm={() => { setShowGoalForm(false); resetGoalForm(); }}
            onContribute={handleContributeGoal}
            onDeleteHistoryEntry={handleDeleteGoalHistoryEntry}
          />
        ) : activeTab === "fixas" ? (
          <FixedBillsTab
            fixedBills={fixedBills}
            transactions={transactions}
            refDate={refDate}
            shiftMonth={shiftMonth}
            categoriesByType={categoriesByType}
            banksList={banksList}
            findCategory={findCategory}
            findBank={findBank}
            onLaunch={handleLaunchFixedBill}
            onLaunchAll={handleLaunchAllPendingBills}
            onUndoLaunch={handleUndoLaunchFixedBill}
            onToggleActive={handleToggleActiveFixed}
            fixedForm={fixedForm}
            setFixedForm={setFixedForm}
            showFixedForm={showFixedForm}
            setShowFixedForm={setShowFixedForm}
            editingFixedId={editingFixedId}
            fixedFormError={fixedFormError}
            onOpenNew={openNewFixedForm}
            onOpenEdit={openEditFixedForm}
            onSubmit={handleSubmitFixed}
            onDelete={handleDeleteFixed}
            onCancelForm={() => { setShowFixedForm(false); resetFixedForm(); }}
            onTypeChange={handleFixedTypeChange}
          />
        ) : activeTab !== "lancamentos" ? (
          <PlaceholderTab item={NAV_ITEMS.find((n) => n.id === activeTab)} />
        ) : (
          <>
            <header className="mb-6">
              <h1 className="rz-display text-2xl md:text-3xl">Lançamentos</h1>
              <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
                Registre cada entrada e saída para manter seu razão em dia.
              </p>
            </header>

            {loadError && (
              <div className="rz-card p-3 mb-4 text-sm" style={{ borderColor: "var(--brick)", color: "var(--brick)" }}>
                Não foi possível salvar suas alterações agora. Elas podem se perder ao fechar a aba — tente novamente em instantes.
              </div>
            )}

            <PeriodNavigator periodMode={periodMode} refDate={refDate} shiftMonth={shiftMonth} setPeriodMode={setPeriodMode} />

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <SummaryCard label="Receitas" value={totals.receitas} icon={TrendingUp} tone="emerald" />
              <SummaryCard label="Despesas" value={totals.despesas} icon={TrendingDown} tone="brick" />
              <SummaryCard label="Saldo do período" value={totals.saldo} icon={Scale} tone={totals.saldo >= 0 ? "emerald" : "brick"} />
            </div>

            {/* Busca e filtros */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-2">
              <div className="rz-card flex items-center gap-2 px-3 py-2 flex-1 sm:min-w-[220px]">
                <Search size={15} style={{ color: "var(--ink-soft)" }} />
                <input
                  className="flex-1 outline-none text-sm min-w-0"
                  style={{ background: "transparent", color: "var(--ink)" }}
                  placeholder="Buscar por descrição…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select className="rz-input text-sm sm:w-auto" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setCategoryFilter("todas"); }}>
                <option value="todos">Todos os tipos</option>
                <option value="receita">Receitas</option>
                <option value="despesa">Despesas</option>
                <option value="transferencia">Transferências</option>
              </select>
              <select className="rz-input text-sm sm:w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="todas">Todas as categorias</option>
                {(typeFilter === "todos" || typeFilter === "transferencia"
                  ? [...categoriesByType.receita, ...categoriesByType.despesa]
                  : categoriesByType[typeFilter]).map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <select className="rz-input text-sm sm:w-auto" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                <option value="todas">Todas as contas</option>
                <option value="sem">Sem conta definida</option>
                {banksList.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </div>

            {/* Ações */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => handleExportTransactions(visibleTransactions, `razao-lancamentos-${todayISO()}.csv`)}
                className="rz-btn-ghost rz-focus flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                title="Exportar os lançamentos visíveis para CSV"
              >
                <FileDown size={16} /> Exportar
              </button>
              <button onClick={() => setShowCsvImport(true)} className="rz-btn-ghost rz-focus flex items-center justify-center gap-2 text-sm whitespace-nowrap">
                <FileUp size={16} /> Importar CSV
              </button>
              <button onClick={openNewForm} className="rz-btn-primary rz-focus flex items-center justify-center gap-2 text-sm whitespace-nowrap sm:ml-auto">
                <Plus size={16} /> Novo lançamento
              </button>
            </div>

            {visibleTransactions.filter((t) => t.status === "pendente").length > 0 && (
              <div className="rz-card p-3 mb-4 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  {visibleTransactions.filter((t) => t.status === "pendente").length} lançamento{visibleTransactions.filter((t) => t.status === "pendente").length !== 1 ? "s" : ""} pendente{visibleTransactions.filter((t) => t.status === "pendente").length !== 1 ? "s" : ""} neste filtro — pendentes não entram no saldo das contas.
                </p>
                <button onClick={handleMarkVisibleAsPaid} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3 whitespace-nowrap">
                  Marcar todos como pagos
                </button>
              </div>
            )}

            {showCsvImport && (
              <CsvImportModal
                categoriesByType={categoriesByType}
                banksList={banksList}
                onConfirm={handleConfirmCsvImport}
                onCancel={() => setShowCsvImport(false)}
              />
            )}

            {/* Transaction list */}
            {visibleTransactions.length === 0 ? (
              <div className="rz-card p-10 text-center">
                <Receipt size={28} className="mx-auto mb-3" style={{ color: "var(--line)" }} />
                <div className="rz-display text-lg mb-1">Nenhum lançamento por aqui</div>
                <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
                  {transactions.length === 0 ? "Comece registrando sua primeira receita ou despesa." : "Nada bate com os filtros atuais — tente ajustá-los."}
                </p>
                {transactions.length === 0 && (
                  <button onClick={openNewForm} className="rz-btn-primary rz-focus text-sm inline-flex items-center gap-2">
                    <Plus size={16} /> Adicionar lançamento
                  </button>
                )}
              </div>
            ) : (
              <div className="rz-card overflow-hidden">
                {visibleTransactions.map((t, i) => {
                  const ehTransf = t.type === "transferencia";
                  const cat = ehTransf ? { label: "Transferência", color: "var(--ink-soft)" } : findCategory(t.type, t.category);
                  const bank = t.account ? findBank(t.account) : null;
                  const bankTo = t.toAccount ? findBank(t.toAccount) : null;
                  const subtitulo = ehTransf
                    ? `${bank ? bank.label : "?"} → ${bankTo ? bankTo.label : "?"}`
                    : `${cat.label}${bank ? ` · ${bank.label}` : ""}`;
                  const corValor = ehTransf ? "var(--ink-soft)" : (t.type === "receita" ? "var(--emerald)" : "var(--brick)");
                  const sinalValor = ehTransf ? "" : (t.type === "receita" ? "+ " : "− ");
                  const statusBtn = (
                    <button
                      onClick={() => handleTogglePaid(t)}
                      className={`rz-stamp rz-focus ${t.status === "pago" ? "rz-stamp-pago" : "rz-stamp-pendente"}`}
                      style={{ cursor: "pointer" }}
                      title={t.status === "pago" ? "Clique para marcar como pendente" : "Clique para marcar como pago"}
                    >
                      {ehTransf
                        ? (t.status === "pago" ? "Concluída" : "Agendada")
                        : (t.status === "pago" ? "Pago" : "Pendente")}
                    </button>
                  );
                  const attachmentBtn = t.attachmentPath && (
                    <button
                      onClick={() => handleOpenAttachment(t.attachmentPath)}
                      className="rz-focus p-1 rounded-md"
                      aria-label="Ver comprovante"
                      title={t.attachmentName || "Ver comprovante"}
                      style={{ color: "var(--ink-soft)" }}
                    >
                      <Paperclip size={14} />
                    </button>
                  );
                  const avatarBadge = householdMemberCount > 1 && (
                    <span
                      title={t.createdBy || "Desconhecido"}
                      className="rz-mono text-[9px] font-semibold w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: colorForEmail(t.createdBy), color: "#fff" }}
                    >
                      {t.createdBy ? t.createdBy[0].toUpperCase() : "?"}
                    </span>
                  );
                  const editDeleteBtns = (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleDuplicate(t)} className="rz-focus p-1.5 rounded-md hover:bg-[var(--paper-alt)]" aria-label="Duplicar" title="Duplicar lançamento" style={{ color: "var(--ink-soft)" }}>
                        <Copy size={15} />
                      </button>
                      <button onClick={() => openEditForm(t)} className="rz-focus p-1.5 rounded-md hover:bg-[var(--paper-alt)]" aria-label="Editar" style={{ color: "var(--ink-soft)" }}>
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(t)} className="rz-focus p-1.5 rounded-md hover:bg-[var(--paper-alt)]" aria-label="Excluir" style={{ color: "var(--ink-soft)" }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );

                  return (
                    <div key={t.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                      {/* Mobile layout */}
                      <div className="flex flex-col gap-2 px-4 py-3 sm:hidden">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="rz-dot" style={{ background: cat.color }} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{t.description}</div>
                            <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{subtitulo}</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="rz-mono text-xs shrink-0" style={{ color: "var(--ink-soft)" }}>{formatDateBR(t.date)}</span>
                            {statusBtn}
                          </div>
                          <span className="rz-mono text-sm font-semibold shrink-0" style={{ color: corValor }}>
                            {sinalValor}{formatCurrency(t.amount)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {attachmentBtn}
                            {avatarBadge}
                          </div>
                          {editDeleteBtns}
                        </div>
                      </div>

                      {/* Desktop layout */}
                      <div className="hidden sm:flex sm:items-center gap-4 px-4 py-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="rz-dot" style={{ background: cat.color }} />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{t.description}</div>
                            <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{subtitulo}</div>
                          </div>
                        </div>
                        <div className="rz-mono text-xs w-20 shrink-0" style={{ color: "var(--ink-soft)" }}>{formatDateBR(t.date)}</div>
                        <div className="w-24 shrink-0 flex justify-start">{statusBtn}</div>
                        <div className="rz-mono text-sm font-semibold w-28 text-right shrink-0" style={{ color: corValor }}>
                          {sinalValor}{formatCurrency(t.amount)}
                        </div>
                        <div className="w-6 shrink-0 flex justify-center">{attachmentBtn}</div>
                        {avatarBadge}
                        <div className="justify-end">{editDeleteBtns}</div>
                      </div>
                    </div>
                  );
                })}

              </div>
            )}
          </>
        )}
      </main>

      {/* ---------------- Form modal ---------------- */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: "rgba(30,43,35,0.45)" }}>
          <div className="rz-card w-full sm:max-w-md p-5 sm:p-6" style={{ borderRadius: "14px 14px 0 0" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="rz-display text-xl">{editingId ? "Editar lançamento" : "Novo lançamento"}</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="rz-focus" style={{ color: "var(--ink-soft)" }} aria-label="Fechar">
                <X size={20} />
              </button>
            </div>

            <div className="rz-toggle mb-4">
              <button onClick={() => handleTypeChange("receita")} className={form.type === "receita" ? "receita-on" : "off"}>Receita</button>
              <button onClick={() => handleTypeChange("despesa")} className={form.type === "despesa" ? "despesa-on" : "off"}>Despesa</button>
              <button onClick={() => handleTypeChange("transferencia")} className={form.type === "transferencia" ? "transferencia-on" : "off"}>Transferência</button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Descrição</label>
                <input className="rz-input rz-focus" placeholder="Ex: Supermercado, Salário…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>{form.installments ? "Valor total da compra (R$)" : "Valor (R$)"}</label>
                  <input className="rz-input rz-focus rz-mono" inputMode="decimal" placeholder="0,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Data</label>
                  <input type="date" className="rz-input rz-focus rz-mono" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>

              {!editingId && form.type === "despesa" && (
                <div>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, installments: !form.installments })}
                    className="rz-focus flex items-center gap-2 text-sm"
                  >
                    <span style={{
                      width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--line)",
                      background: form.installments ? "var(--ink)" : "var(--surface)",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      {form.installments && <Check size={12} color="var(--paper)" />}
                    </span>
                    Parcelar essa compra
                  </button>

                  {form.installments && (
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex-1">
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Número de parcelas</label>
                        <input type="number" min="2" max="60" className="rz-input rz-focus rz-mono" value={form.installmentCount} onChange={(e) => setForm({ ...form, installmentCount: e.target.value })} />
                      </div>
                      {(() => {
                        const total = parseFloat(String(form.amount).replace(",", "."));
                        const count = parseInt(form.installmentCount, 10);
                        if (!total || !count || count < 2) return null;
                        const per = Math.round((total / count) * 100) / 100;
                        return (
                          <div className="text-xs rz-mono flex-1" style={{ color: "var(--ink-soft)" }}>
                            {count}x de {formatCurrency(per)}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {form.type !== "transferencia" && (
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Categoria</label>
                  <select className="rz-input rz-focus" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    <option value="" disabled>Selecione</option>
                    {categoriesByType[form.type].map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              )}

              {form.type === "transferencia" ? (
                <>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>De (origem)</label>
                      <select className="rz-input rz-focus" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })}>
                        <option value="" disabled>Selecione</option>
                        {banksList.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Para (destino)</label>
                      <select className="rz-input rz-focus" value={form.toAccount} onChange={(e) => setForm({ ...form, toAccount: e.target.value })}>
                        <option value="" disabled>Selecione</option>
                        {banksList.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Status</label>
                    <select className="rz-input rz-focus" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="pago">Concluída</option>
                      <option value="pendente">Agendada</option>
                    </select>
                  </div>
                  <p className="text-xs -mt-1" style={{ color: "var(--ink-soft)" }}>
                    Transferências só movem dinheiro entre suas contas — não contam como receita nem despesa nos relatórios.
                  </p>
                </>
              ) : (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Banco / Conta (opcional)</label>
                    <select className="rz-input rz-focus" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })}>
                      <option value="">Nenhum selecionado</option>
                      {banksList.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Status</label>
                    <select className="rz-input rz-focus" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="pago">Pago</option>
                      <option value="pendente">Pendente</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Comprovante / nota fiscal (opcional)</label>
                {form.attachmentPath ? (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => handleOpenAttachment(form.attachmentPath)} className="rz-btn-ghost rz-focus text-xs !py-2 flex items-center gap-1.5 flex-1 min-w-0 justify-start">
                      <Paperclip size={13} className="shrink-0" /> <span className="truncate">{form.attachmentName || "Ver arquivo"}</span>
                    </button>
                    <button type="button" onClick={handleRemoveAttachment} className="rz-focus p-1.5 rounded-md shrink-0" aria-label="Remover anexo" style={{ color: "var(--brick)" }}>
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <label className="rz-btn-ghost rz-focus text-xs !py-2 inline-flex items-center gap-1.5 cursor-pointer" style={{ opacity: uploadingAttachment ? 0.6 : 1 }}>
                    {uploadingAttachment ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
                    {uploadingAttachment ? "Enviando…" : "Anexar foto ou PDF"}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      disabled={uploadingAttachment}
                      onChange={(e) => { if (e.target.files[0]) handleAttachmentSelected(e.target.files[0]); e.target.value = ""; }}
                    />
                  </label>
                )}
              </div>

              {formError && <div className="text-xs" style={{ color: "var(--brick)" }}>{formError}</div>}

              <div className="flex gap-2 mt-2">
                <button onClick={() => { setShowForm(false); resetForm(); setPendingId(null); }} className="rz-btn-ghost rz-focus flex-1 text-sm">Cancelar</button>
                <button onClick={handleSubmit} className="rz-btn-primary rz-focus flex-1 text-sm flex items-center justify-center gap-2">
                  <Check size={16} /> {editingId ? "Salvar alterações" : "Adicionar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Toast ---------------- */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg max-w-[90vw]" style={{ background: toast.tone === "warning" ? "var(--brick)" : "var(--ink)", color: "var(--paper)" }}>
            <span className="text-sm">{toast.message}</span>
            {toast.item && (
              <button onClick={handleUndo} className="rz-focus flex items-center gap-1 text-sm font-semibold shrink-0" style={{ color: "#8FE0C4" }}>
                <Undo2 size={14} /> Desfazer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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

function PeriodNavigator({ periodMode, refDate, shiftMonth, setPeriodMode, hideToggle }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <div className="rz-card flex items-center gap-1 px-1 py-1">
        <button onClick={() => shiftMonth(-1)} disabled={periodMode === "todos"} className="rz-focus p-1.5 rounded-md disabled:opacity-30" style={{ color: "var(--ink-soft)" }} aria-label="Mês anterior">
          <ChevronLeft size={16} />
        </button>
        <div className="rz-mono text-sm px-2 min-w-[150px] text-center">
          {periodMode === "todos" ? "Todos os períodos" : `${MONTHS[refDate.getMonth()]} / ${refDate.getFullYear()}`}
        </div>
        <button onClick={() => shiftMonth(1)} disabled={periodMode === "todos"} className="rz-focus p-1.5 rounded-md disabled:opacity-30" style={{ color: "var(--ink-soft)" }} aria-label="Próximo mês">
          <ChevronRight size={16} />
        </button>
      </div>
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

function formatCompact(v) {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${v < 0 ? "-" : ""}${(abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return v.toFixed(0);
}

function ConfiguracoesTab({
  theme, setTheme,
  categoriesByType, customCategories, categoryForm, setCategoryForm, categoryError,
  onAddCategory, onDeleteCategory, onUpdateCategory, hiddenCategoriesCount, onRestoreCategories,
  banksList, customBanks, bankForm, setBankForm, bankError,
  onAddBank, onDeleteBank, onUpdateBank, hiddenBanksCount, onRestoreBanks,
  onExportBackup, onImportBackup, backupMessage, onResetData,
}) {
  const [subTab, setSubTab] = useState("tema");
  const SUB_TABS = [
    { id: "tema", label: "Tema" },
    { id: "categorias", label: "Categorias" },
    { id: "contas", label: "Contas e Bancos" },
    { id: "backup", label: "Backup" },
    { id: "familia", label: "Família" },
    { id: "conta-usuario", label: "Conta" },
  ];

  return (
    <div>
      <header className="mb-6">
        <h1 className="rz-display text-2xl md:text-3xl">Configurações</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Personalize cores, categorias e contas do sistema.</p>
      </header>

      <div className="flex gap-2 mb-6 flex-wrap">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className="rz-focus text-sm font-medium px-4 py-2 rounded-lg"
            style={subTab === t.id
              ? { background: "var(--ink)", color: "var(--paper)" }
              : { background: "var(--surface)", color: "var(--ink-soft)", border: "1px solid var(--line)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "tema" && <TemaSection theme={theme} setTheme={setTheme} />}

      {subTab === "categorias" && (
        <CategoriasTab
          categoriesByType={categoriesByType}
          customCategories={customCategories}
          categoryForm={categoryForm}
          setCategoryForm={setCategoryForm}
          categoryError={categoryError}
          onAdd={onAddCategory}
          onDelete={onDeleteCategory}
          onUpdate={onUpdateCategory}
          hiddenCount={hiddenCategoriesCount}
          onRestore={onRestoreCategories}
        />
      )}

      {subTab === "contas" && (
        <BancosTab
          banksList={banksList}
          customBanks={customBanks}
          bankForm={bankForm}
          setBankForm={setBankForm}
          bankError={bankError}
          onAdd={onAddBank}
          onDelete={onDeleteBank}
          onUpdate={onUpdateBank}
          hiddenCount={hiddenBanksCount}
          onRestore={onRestoreBanks}
        />
      )}

      {subTab === "backup" && (
        <BackupSection onExport={onExportBackup} onImport={onImportBackup} message={backupMessage} />
      )}

      {subTab === "familia" && <HouseholdSection />}

      {subTab === "conta-usuario" && <ContaSection onResetData={onResetData} />}
    </div>
  );
}

function BackupSection({ onExport, onImport, message }) {
  const fileInputRef = useRef(null);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="rz-card p-5">
        <h2 className="text-sm font-semibold mb-1">Baixar backup</h2>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          Baixa um arquivo com todos os seus dados: lançamentos, categorias, contas fixas, orçamento, metas e poupança.
        </p>
        <button onClick={onExport} className="rz-btn-primary rz-focus text-sm inline-flex items-center gap-2">
          Baixar backup (.json)
        </button>
      </div>

      <div className="rz-card p-5">
        <h2 className="text-sm font-semibold mb-1">Restaurar backup</h2>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          Selecione um arquivo de backup exportado anteriormente. <strong>Isso substitui todos os dados atuais.</strong>
        </p>
        <input
          type="file"
          accept=".json,application/json"
          ref={fileInputRef}
          className="hidden"
          onChange={(e) => { if (e.target.files[0]) onImport(e.target.files[0]); e.target.value = ""; }}
        />
        <button onClick={() => fileInputRef.current?.click()} className="rz-btn-ghost rz-focus text-sm">
          Selecionar arquivo de backup
        </button>
        {message && (
          <div className="text-xs mt-3" style={{ color: message.type === "success" ? "var(--emerald)" : "var(--brick)" }}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}

function HouseholdSection() {
  const [code, setCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerateCode = async () => {
    setLoading(true); setError(""); setSuccess(""); setCopied(false);
    try {
      const { data, error } = await supabase.rpc("create_invite_code");
      if (error) throw error;
      setCode(data);
    } catch (err) {
      setError(err.message || "Não foi possível gerar o código.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) { setError("Informe o código de convite."); return; }
    if (!window.confirm("Isso vai unir os dados que você já tem aos dados da família do código informado. Essa ação não pode ser desfeita. Deseja continuar?")) return;
    setLoading(true); setError(""); setSuccess("");
    try {
      const { error } = await supabase.rpc("join_household", { invite_code: joinCode.trim() });
      if (error) throw error;
      resetStorageCache();
      setSuccess("Você entrou na família! Recarregando a página…");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(err.message || "Código inválido ou expirado.");
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="grid lg:grid-cols-2 gap-6 mb-4">
        <div className="rz-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Users size={16} style={{ color: "var(--ink-soft)" }} />
            <h2 className="text-sm font-semibold">Convidar alguém da família</h2>
          </div>
          <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
            Gere um código e compartilhe com quem você quer que veja e edite os mesmos dados financeiros que você.
          </p>
          <button onClick={handleGenerateCode} disabled={loading} className="rz-btn-primary rz-focus text-sm disabled:opacity-60">
            {loading && !code ? "Gerando…" : "Gerar código de convite"}
          </button>
          {code && (
            <div className="flex items-center gap-2 mt-4">
              <span className="rz-mono text-lg font-semibold px-4 py-2 rounded-lg" style={{ background: "var(--paper-alt)", letterSpacing: "0.1em" }}>{code}</span>
              <button onClick={handleCopy} className="rz-btn-ghost rz-focus text-xs !py-2 flex items-center gap-1.5">
                <Copy size={13} /> {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          )}
          {code && <p className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>Válido por 7 dias, uso único.</p>}
        </div>

        <div className="rz-card p-5" style={{ alignSelf: "start" }}>
          <h2 className="text-sm font-semibold mb-1">Entrar em uma família existente</h2>
          <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
            Recebeu um código de alguém? Cole abaixo. <strong>Atenção:</strong> os dados que você já tem serão somados aos da família de destino.
          </p>
          <div className="flex gap-2">
            <input className="rz-input rz-focus rz-mono" placeholder="CÓDIGO" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} />
            <button onClick={handleJoin} disabled={loading} className="rz-btn-primary rz-focus text-sm whitespace-nowrap disabled:opacity-60">
              Entrar
            </button>
          </div>
        </div>
      </div>

      {error && <div className="text-xs" style={{ color: "var(--brick)" }}>{error}</div>}
      {success && <div className="text-xs" style={{ color: "var(--emerald)" }}>{success}</div>}
    </div>
  );
}

function ContaSection({ onResetData }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email || ""));
  }, []);

  const handleChangePassword = async () => {
    setError(""); setSuccess(false);
    if (password.length < 6) { setError("A nova senha precisa ter pelo menos 6 caracteres."); return; }
    if (password !== confirm) { setError("As senhas não coincidem."); return; }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setPassword(""); setConfirm("");
    } catch (err) {
      setError(err.message || "Não foi possível alterar a senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="rz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-1">Sua conta</h2>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>{email}</p>
        <button onClick={() => supabase.auth.signOut()} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3">
          Sair da conta
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rz-card p-5">
          <h2 className="text-sm font-semibold mb-4">Alterar senha</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Nova senha</label>
              <input type="password" autoComplete="new-password" className="rz-input rz-focus" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Confirmar nova senha</label>
              <input type="password" autoComplete="new-password" className="rz-input rz-focus" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <div className="text-xs" style={{ color: "var(--brick)" }}>{error}</div>}
            {success && <div className="text-xs" style={{ color: "var(--emerald)" }}>Senha alterada com sucesso.</div>}
            <button onClick={handleChangePassword} disabled={loading} className="rz-btn-primary rz-focus text-sm mt-1 disabled:opacity-60">
              {loading ? "Salvando…" : "Salvar nova senha"}
            </button>
          </div>
        </div>

        <div className="rz-card p-5" style={{ borderColor: "var(--brick)" }}>
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--brick)" }}>Zona de risco</h2>
          <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
            Apaga todos os lançamentos salvos. Essa ação não pode ser desfeita.
          </p>
          <button
            onClick={onResetData}
            className="rz-btn-ghost rz-focus text-sm"
            style={{ color: "var(--brick)", borderColor: "var(--brick)" }}
          >
            Limpar todos os dados
          </button>
        </div>
      </div>
    </div>
  );
}

function TemaSection({ theme, setTheme }) {
  const updateColor = (key, value) => setTheme((t) => ({ ...t, [key]: value }));
  const applyPreset = (colors) => setTheme(colors);
  const resetDefault = () => setTheme(DEFAULT_THEME);

  const fields = [
    { key: "paper", label: "Fundo", hint: "Cor de fundo geral do sistema" },
    { key: "ink", label: "Texto / Tinta", hint: "Cor do texto e da barra lateral" },
    { key: "emerald", label: "Receitas", hint: "Usada em receitas, saldo positivo e destaques" },
    { key: "brick", label: "Despesas", hint: "Usada em despesas e alertas" },
    { key: "gold", label: "Pendências", hint: "Usada em pendências, vencimentos e metas" },
  ];

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="rz-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Cores do sistema</h2>
          <button onClick={resetDefault} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3 flex items-center gap-1.5">
            <RotateCcw size={13} /> Restaurar padrão
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {fields.map((f, i) => (
            <div key={f.key} className="flex items-center justify-between gap-3 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
              <div className="min-w-0">
                <div className="text-sm font-medium">{f.label}</div>
                <div className="text-xs truncate" style={{ color: "var(--ink-soft)" }}>{f.hint}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="rz-mono text-xs" style={{ color: "var(--ink-soft)" }}>{theme[f.key]}</span>
                <input
                  type="color"
                  value={theme[f.key]}
                  onChange={(e) => updateColor(f.key, e.target.value)}
                  className="rz-focus"
                  style={{ width: 40, height: 32, border: "1px solid var(--line)", borderRadius: 6, padding: 2, background: "var(--surface)", cursor: "pointer" }}
                  aria-label={`Cor: ${f.label}`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rz-card p-5" style={{ alignSelf: "start" }}>
        <h2 className="text-sm font-semibold mb-4">Temas prontos</h2>
        <div className="flex flex-wrap gap-3">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset.colors)}
              className="rz-focus flex flex-col items-center gap-1.5 p-2 rounded-lg"
              style={{ border: "1px solid var(--line)" }}
            >
              <div className="flex" style={{ borderRadius: 6, overflow: "hidden" }}>
                {[preset.colors.paper, preset.colors.ink, preset.colors.emerald, preset.colors.brick, preset.colors.gold].map((c, i) => (
                  <span key={i} style={{ width: 16, height: 26, background: c, display: "block" }} />
                ))}
              </div>
              <span className="text-xs">{preset.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportsTab({ transactions, findCategory, fixedBills, savingsAccounts, saldosIniciais }) {
  const [monthsCount, setMonthsCount] = useState(6);
  const [horizonDays, setHorizonDays] = useState(90);
  const today = new Date();
  const [customStart, setCustomStart] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(() => todayISO());

  const projection = useMemo(() => buildCashFlowProjection(transactions, fixedBills, horizonDays, saldosIniciais), [transactions, fixedBills, horizonDays, saldosIniciais]);

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

  const monthlyData = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = monthsCount - 1; i >= 0; i--) months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    return months.map((d) => {
      const y = d.getFullYear(), m = d.getMonth();
      const inMonth = transactions.filter((t) => { const td = new Date(t.date + "T00:00:00"); return td.getFullYear() === y && td.getMonth() === m; });
      const receitas = inMonth.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
      const despesas = inMonth.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
      return { mes: `${MONTHS[m].slice(0, 3)}/${String(y).slice(2)}`, receitas, despesas, saldo: receitas - despesas };
    });
  }, [transactions, monthsCount]);

  const customRangeData = useMemo(() => {
    if (!customStart || !customEnd) return null;
    const inRange = transactions.filter((t) => t.date >= customStart && t.date <= customEnd);
    const receitas = inRange.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
    const despesas = inRange.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
    const byCategory = {};
    inRange.filter((t) => t.type === "despesa").forEach((t) => { byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount); });
    const topCategories = Object.entries(byCategory)
      .map(([catId, value]) => { const cat = findCategory("despesa", catId); return { name: cat.label, color: cat.color, value }; })
      .sort((a, b) => b.value - a.value).slice(0, 5);
    return { receitas, despesas, saldo: receitas - despesas, count: inRange.length, topCategories };
  }, [transactions, customStart, customEnd, findCategory]);

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

function OrcamentoTab({ budgets, periodFiltered, refDate, shiftMonth, categoriesByType, findCategory, budgetForm, setBudgetForm, budgetError, onAdd, onUpdateLimit, onDelete }) {
  const spentByCategory = useMemo(() => {
    const map = {};
    periodFiltered.filter((t) => t.type === "despesa").forEach((t) => { map[t.category] = (map[t.category] || 0) + Number(t.amount); });
    return map;
  }, [periodFiltered]);

  const availableCategories = categoriesByType.despesa.filter((c) => !budgets.some((b) => b.categoryId === c.id));

  const totalLimit = budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + (spentByCategory[b.categoryId] || 0), 0);

  return (
    <div>
      <header className="mb-6">
        <h1 className="rz-display text-2xl md:text-3xl">Orçamento</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Defina um limite mensal por categoria e acompanhe o quanto já gastou.</p>
      </header>

      <PeriodNavigator periodMode="mes" refDate={refDate} shiftMonth={shiftMonth} setPeriodMode={() => {}} hideToggle />

      {budgets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <SummaryCard label="Total orçado" value={totalLimit} icon={Target} tone="emerald" />
          <SummaryCard label="Total gasto (categorias orçadas)" value={totalSpent} icon={TrendingDown} tone={totalSpent > totalLimit ? "brick" : "emerald"} />
        </div>
      )}

      {availableCategories.length > 0 ? (
        <div className="rz-card p-5 mb-6">
          <h2 className="text-sm font-semibold mb-3">Novo orçamento</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <select className="rz-input rz-focus" style={{ flex: "2 1 220px" }} value={budgetForm.categoryId} onChange={(e) => setBudgetForm({ ...budgetForm, categoryId: e.target.value })}>
              <option value="">Selecione a categoria</option>
              {availableCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <input className="rz-input rz-focus rz-mono sm:w-40" inputMode="decimal" placeholder="Limite (R$)" value={budgetForm.limit} onChange={(e) => setBudgetForm({ ...budgetForm, limit: e.target.value })} onKeyDown={(e) => e.key === "Enter" && onAdd()} />
            <button onClick={onAdd} className="rz-btn-primary rz-focus flex items-center justify-center gap-2 text-sm whitespace-nowrap">
              <Plus size={16} /> Adicionar
            </button>
          </div>
          {budgetError && <div className="text-xs mt-2" style={{ color: "var(--brick)" }}>{budgetError}</div>}
        </div>
      ) : budgets.length > 0 ? (
        <p className="text-xs mb-6" style={{ color: "var(--ink-soft)" }}>Todas as categorias de despesa já têm um orçamento definido.</p>
      ) : null}

      {budgets.length === 0 ? (
        <div className="rz-card p-10 text-center">
          <Target size={26} className="mx-auto mb-3" style={{ color: "var(--line)" }} />
          <div className="rz-display text-lg mb-1">Nenhum orçamento definido</div>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Escolha uma categoria acima e defina um limite mensal de gastos.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {budgets.map((b) => (
            <BudgetRow key={b.id} budget={b} spent={spentByCategory[b.categoryId] || 0} category={findCategory("despesa", b.categoryId)} onUpdateLimit={onUpdateLimit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetRow({ budget, spent, category, onUpdateLimit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [tempLimit, setTempLimit] = useState(String(budget.limit));
  const pct = budget.limit > 0 ? (spent / budget.limit) * 100 : 0;
  const tone = pct < 70 ? { color: "var(--emerald)" } : pct <= 100 ? { color: "var(--gold)" } : { color: "var(--brick)" };

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
        </div>
        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => { setTempLimit(String(budget.limit)); setEditing(true); }} className="rz-focus p-1 rounded-md" aria-label="Editar limite" style={{ color: "var(--ink-soft)" }}>
              <Pencil size={13} />
            </button>
            <button onClick={() => onDelete(budget)} className="rz-focus p-1 rounded-md" aria-label="Excluir orçamento" style={{ color: "var(--ink-soft)" }}>
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-2 mb-2">
          <input className="rz-input rz-focus rz-mono text-sm flex-1" value={tempLimit} onChange={(e) => setTempLimit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit()} autoFocus />
          <button onClick={saveEdit} className="rz-focus p-1.5 rounded-md" style={{ color: "var(--emerald)" }} aria-label="Salvar"><Check size={16} /></button>
          <button onClick={() => setEditing(false)} className="rz-focus p-1.5 rounded-md" style={{ color: "var(--ink-soft)" }} aria-label="Cancelar"><X size={16} /></button>
        </div>
      ) : (
        <div className="flex items-baseline justify-between mb-2">
          <span className="rz-mono text-sm font-semibold" style={{ color: tone.color }}>{formatCurrency(spent)}</span>
          <span className="rz-mono text-xs" style={{ color: "var(--ink-soft)" }}>de {formatCurrency(budget.limit)}</span>
        </div>
      )}

      <div className="rz-progress-track">
        <div className="rz-progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: tone.color }} />
      </div>
      <div className="text-right mt-1">
        <span className="rz-mono text-[11px]" style={{ color: tone.color }}>{pct.toFixed(0)}%{pct > 100 ? " · acima do limite" : ""}</span>
      </div>
    </div>
  );
}

function MetasTab({ goals, goalForm, setGoalForm, showGoalForm, editingGoalId, goalError, onOpenNew, onOpenEdit, onSubmit, onDelete, onCancelForm, onContribute, onDeleteHistoryEntry }) {
  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="rz-display text-2xl md:text-3xl">Metas</h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Junte dinheiro para os seus objetivos, um valor de cada vez.</p>
        </div>
        <button onClick={onOpenNew} className="rz-btn-primary rz-focus flex items-center gap-2 text-sm whitespace-nowrap">
          <Plus size={16} /> Nova meta
        </button>
      </header>

      {goals.length === 0 ? (
        <div className="rz-card p-10 text-center">
          <PiggyBank size={26} className="mx-auto mb-3" style={{ color: "var(--line)" }} />
          <div className="rz-display text-lg mb-1">Nenhuma meta cadastrada</div>
          <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>Uma viagem, uma reserva de emergência, o que você quiser juntar.</p>
          <button onClick={onOpenNew} className="rz-btn-primary rz-focus text-sm inline-flex items-center gap-2">
            <Plus size={16} /> Criar meta
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {goals.map((g) => <GoalCard key={g.id} goal={g} onEdit={onOpenEdit} onDelete={onDelete} onContribute={onContribute} onDeleteHistoryEntry={onDeleteHistoryEntry} />)}
        </div>
      )}

      {showGoalForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: "rgba(30,43,35,0.45)" }}>
          <div className="rz-card w-full sm:max-w-md p-5 sm:p-6" style={{ borderRadius: "14px 14px 0 0" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="rz-display text-xl">{editingGoalId ? "Editar meta" : "Nova meta"}</h2>
              <button onClick={onCancelForm} className="rz-focus" style={{ color: "var(--ink-soft)" }} aria-label="Fechar"><X size={20} /></button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Nome da meta</label>
                <input className="rz-input rz-focus" placeholder="Ex: Viagem, Reserva de emergência…" value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Valor alvo (R$)</label>
                  <input className="rz-input rz-focus rz-mono" inputMode="decimal" placeholder="0,00" value={goalForm.targetAmount} onChange={(e) => setGoalForm({ ...goalForm, targetAmount: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Data alvo (opcional)</label>
                  <input type="date" className="rz-input rz-focus rz-mono" value={goalForm.deadline} onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {COLOR_PALETTE.map((color) => (
                  <button key={color} onClick={() => setGoalForm({ ...goalForm, color })} className="rz-focus w-6 h-6 rounded-full" style={{ background: color, boxShadow: goalForm.color === color ? "0 0 0 2px var(--surface), 0 0 0 4px var(--ink)" : "none" }} aria-label={`Cor ${color}`} />
                ))}
              </div>
              {goalError && <div className="text-xs" style={{ color: "var(--brick)" }}>{goalError}</div>}
              <div className="flex gap-2 mt-2">
                <button onClick={onCancelForm} className="rz-btn-ghost rz-focus flex-1 text-sm">Cancelar</button>
                <button onClick={onSubmit} className="rz-btn-primary rz-focus flex-1 text-sm flex items-center justify-center gap-2"><Check size={16} /> {editingGoalId ? "Salvar alterações" : "Criar meta"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal, onEdit, onDelete, onContribute, onDeleteHistoryEntry }) {
  const [amount, setAmount] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const history = goal.history || [];
  const pct = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
  const done = goal.currentAmount >= goal.targetAmount;
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);

  let monthlySuggestion = null;
  let deadlinePassed = false;
  if (goal.deadline && !done) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const deadline = new Date(goal.deadline + "T00:00:00");
    const diffDays = Math.ceil((deadline - now) / 86400000);
    if (diffDays <= 0) {
      deadlinePassed = true;
    } else {
      const monthsLeft = Math.max(1, Math.round(diffDays / 30.44));
      monthlySuggestion = remaining / monthsLeft;
    }
  }

  const submitDelta = (sign) => {
    const num = parseFloat(String(amount).replace(",", "."));
    if (!num || num <= 0) return;
    onContribute(goal.id, num * sign);
    setAmount("");
  };

  return (
    <div className="rz-card p-4 sm:p-5">
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rz-dot" style={{ background: goal.color }} />
          <span className="text-sm font-medium truncate">{goal.title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit(goal)} className="rz-focus p-1 rounded-md" aria-label="Editar meta" style={{ color: "var(--ink-soft)" }}><Pencil size={13} /></button>
          <button onClick={() => onDelete(goal)} className="rz-focus p-1 rounded-md" aria-label="Excluir meta" style={{ color: "var(--ink-soft)" }}><Trash2 size={13} /></button>
        </div>
      </div>

      <div className="flex items-baseline justify-between mb-2">
        <span className="rz-mono text-lg font-semibold" style={{ color: done ? "var(--emerald)" : "var(--ink)" }}>{formatCurrency(goal.currentAmount)}</span>
        <span className="rz-mono text-xs" style={{ color: "var(--ink-soft)" }}>de {formatCurrency(goal.targetAmount)}</span>
      </div>

      <div className="rz-progress-track mb-1">
        <div className="rz-progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: done ? "var(--emerald)" : goal.color }} />
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="rz-mono text-[11px]" style={{ color: "var(--ink-soft)" }}>{pct.toFixed(0)}%</span>
        {goal.deadline && <span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>até {formatDateBR(goal.deadline)}</span>}
      </div>

      {!done && goal.deadline && (
        <div className="rounded-lg px-3 py-2 mb-3 text-xs" style={{ background: "var(--paper-alt)", color: deadlinePassed ? "var(--brick)" : "var(--ink-soft)" }}>
          {deadlinePassed ? (
            "Prazo da meta já passou — ajuste a data ou dê um empurrão no valor."
          ) : (
            <>Economize <span className="rz-mono font-semibold" style={{ color: "var(--ink)" }}>{formatCurrency(monthlySuggestion)}</span>/mês para chegar lá até {formatDateBR(goal.deadline)}</>
          )}
        </div>
      )}

      {done ? (
        <span className="rz-stamp rz-stamp-pago inline-flex items-center gap-1"><PartyPopper size={11} /> Meta concluída</span>
      ) : (
        <div className="flex items-center gap-2">
          <input className="rz-input rz-focus rz-mono text-sm flex-1" inputMode="decimal" placeholder="Valor" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitDelta(1)} />
          <button onClick={() => submitDelta(1)} className="rz-focus p-1.5 rounded-md" style={{ color: "var(--emerald)" }} aria-label="Adicionar valor"><Plus size={16} /></button>
          <button onClick={() => submitDelta(-1)} className="rz-focus p-1.5 rounded-md" style={{ color: "var(--brick)" }} aria-label="Retirar valor"><Minus size={16} /></button>
        </div>
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
                  <span className="rz-mono text-[11px] flex-1" style={{ color: "var(--ink-soft)" }}>{formatDateBR(h.date)}</span>
                  <span className="rz-mono text-xs font-semibold" style={{ color: h.amount >= 0 ? "var(--emerald)" : "var(--brick)" }}>
                    {h.amount >= 0 ? "+ " : "− "}{formatCurrency(Math.abs(h.amount))}
                  </span>
                  <button onClick={() => onDeleteHistoryEntry(goal.id, h.id)} className="rz-focus p-1 rounded-md" aria-label="Excluir movimentação" style={{ color: "var(--ink-soft)" }}>
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

function FixedBillsTab({
  fixedBills, transactions, refDate, shiftMonth, categoriesByType, banksList, findCategory, findBank,
  onLaunch, onLaunchAll, onUndoLaunch, onToggleActive,
  fixedForm, setFixedForm, showFixedForm, setShowFixedForm, editingFixedId, fixedFormError,
  onOpenNew, onOpenEdit, onSubmit, onDelete, onCancelForm, onTypeChange,
}) {
  const enriched = useMemo(() => enrichFixedBills(fixedBills, transactions, refDate), [fixedBills, transactions, refDate]);

  const activeBills = [...enriched].filter((b) => b.active).sort((a, b) => a.day - b.day);
  const inactiveBills = enriched.filter((b) => !b.active);

  const totalMensal = activeBills.filter((b) => b.type === "despesa").reduce((s, b) => s + b.amount, 0);
  const launchedCount = activeBills.filter((b) => b.status === "lancada").length;

  const STATUS_LABEL = FIXED_STATUS_LABEL;
  const STATUS_CLASS = FIXED_STATUS_CLASS;

  return (
    <div>
      <header className="mb-6">
        <h1 className="rz-display text-2xl md:text-3xl">Contas Fixas</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
          Cadastre suas contas recorrentes e lance com um clique quando forem pagas.
        </p>
      </header>

      <PeriodNavigator periodMode="mes" refDate={refDate} shiftMonth={shiftMonth} setPeriodMode={() => {}} hideToggle />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <SummaryCard label="Total mensal (fixas ativas)" value={totalMensal} icon={Repeat} tone="brick" />
        <div className="rz-card p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs mb-1" style={{ color: "var(--ink-soft)" }}>Status deste mês</div>
            <div className="rz-mono text-sm">
              <span style={{ color: "var(--emerald)" }}>{launchedCount} lançada{launchedCount !== 1 ? "s" : ""}</span>
              <span style={{ color: "var(--ink-soft)" }}> · </span>
              <span style={{ color: "var(--ink-soft)" }}>{activeBills.length - launchedCount} pendente{activeBills.length - launchedCount !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <button onClick={onOpenNew} className="rz-btn-primary rz-focus flex items-center gap-2 text-sm whitespace-nowrap">
            <Plus size={16} /> Nova conta fixa
          </button>
        </div>
      </div>

      {activeBills.length - launchedCount > 0 && (
        <div className="rz-card p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {activeBills.length - launchedCount} conta{activeBills.length - launchedCount !== 1 ? "s" : ""} fixa{activeBills.length - launchedCount !== 1 ? "s" : ""} ainda não lançada{activeBills.length - launchedCount !== 1 ? "s" : ""} neste mês.
          </p>
          <button onClick={onLaunchAll} className="rz-btn-primary rz-focus text-sm whitespace-nowrap">
            Lançar todas de uma vez
          </button>
        </div>
      )}

      {activeBills.length === 0 && inactiveBills.length === 0 ? (
        <div className="rz-card p-10 text-center">
          <Repeat size={26} className="mx-auto mb-3" style={{ color: "var(--line)" }} />
          <div className="rz-display text-lg mb-1">Nenhuma conta fixa cadastrada</div>
          <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
            Aluguel, internet, assinaturas… cadastre uma vez e acompanhe todo mês.
          </p>
          <button onClick={onOpenNew} className="rz-btn-primary rz-focus text-sm inline-flex items-center gap-2">
            <Plus size={16} /> Cadastrar conta fixa
          </button>
        </div>
      ) : (
        <>
          <div className="rz-card overflow-hidden mb-4">
            {activeBills.map((b, i) => {
              const cat = findCategory(b.type, b.category);
              const bank = b.account ? findBank(b.account) : null;
              const amountEl = (
                <span className="rz-mono text-sm font-semibold" style={{ color: b.type === "receita" ? "var(--emerald)" : "var(--brick)" }}>
                  {formatCurrency(b.amount)}
                </span>
              );
              const statusEl = (
                <span className={`rz-stamp shrink-0 ${STATUS_CLASS[b.status]}`}>
                  {b.status === "atrasada" && <AlertCircle size={11} />} {STATUS_LABEL[b.status]}
                </span>
              );
              const actionBtns = (
                <div className="flex items-center gap-1.5 shrink-0">
                  {b.status === "lancada" ? (
                    <button onClick={() => onUndoLaunch(b)} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3">Desfazer</button>
                  ) : (
                    <button onClick={() => onLaunch(b)} className="rz-btn-primary rz-focus text-xs !py-1.5 !px-3">Lançar</button>
                  )}
                  <button onClick={() => onToggleActive(b)} className="rz-focus p-1.5 rounded-md" aria-label="Pausar" style={{ color: "var(--ink-soft)" }}>
                    <PauseCircle size={15} />
                  </button>
                  <button onClick={() => onOpenEdit(b)} className="rz-focus p-1.5 rounded-md" aria-label="Editar" style={{ color: "var(--ink-soft)" }}>
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => onDelete(b)} className="rz-focus p-1.5 rounded-md" aria-label="Excluir" style={{ color: "var(--ink-soft)" }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              );

              return (
                <div key={b.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                  {/* Mobile layout */}
                  <div className="flex flex-col gap-2 px-4 py-3 sm:hidden">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="rz-dot" style={{ background: cat.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{b.description}</div>
                        <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                          {cat.label}{bank ? ` · ${bank.label}` : ""} · Vence dia {b.dueDay}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      {statusEl}
                      {amountEl}
                    </div>
                    <div className="flex items-center justify-end flex-wrap gap-1.5">{actionBtns}</div>
                  </div>

                  {/* Desktop layout */}
                  <div className="hidden sm:flex sm:items-center gap-4 px-4 py-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="rz-dot" style={{ background: cat.color }} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{b.description}</div>
                        <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                          {cat.label}{bank ? ` · ${bank.label}` : ""} · Vence dia {b.dueDay}
                        </div>
                      </div>
                    </div>
                    <div className="w-28 shrink-0">{amountEl}</div>
                    {statusEl}
                    <div className="justify-end">{actionBtns}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {inactiveBills.length > 0 && (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Pausadas</h3>
              <div className="rz-card overflow-hidden opacity-60">
                {inactiveBills.map((b, i) => {
                  const cat = findCategory(b.type, b.category);
                  return (
                    <div key={b.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                      <span className="rz-dot" style={{ background: cat.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{b.description}</div>
                        <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{cat.label} · Vence dia {b.dueDay}</div>
                      </div>
                      <div className="rz-mono text-sm w-24 text-right shrink-0" style={{ color: "var(--ink-soft)" }}>{formatCurrency(b.amount)}</div>
                      <button onClick={() => onToggleActive(b)} className="rz-focus p-1.5 rounded-md" aria-label="Reativar" style={{ color: "var(--emerald)" }}>
                        <PlayCircle size={15} />
                      </button>
                      <button onClick={() => onDelete(b)} className="rz-focus p-1.5 rounded-md" aria-label="Excluir" style={{ color: "var(--ink-soft)" }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Form modal */}
      {showFixedForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: "rgba(30,43,35,0.45)" }}>
          <div className="rz-card w-full sm:max-w-md p-5 sm:p-6" style={{ borderRadius: "14px 14px 0 0" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="rz-display text-xl">{editingFixedId ? "Editar conta fixa" : "Nova conta fixa"}</h2>
              <button onClick={onCancelForm} className="rz-focus" style={{ color: "var(--ink-soft)" }} aria-label="Fechar">
                <X size={20} />
              </button>
            </div>

            <div className="rz-toggle mb-4">
              <button onClick={() => onTypeChange("receita")} className={fixedForm.type === "receita" ? "receita-on" : "off"}>Receita</button>
              <button onClick={() => onTypeChange("despesa")} className={fixedForm.type === "despesa" ? "despesa-on" : "off"}>Despesa</button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Descrição</label>
                <input className="rz-input rz-focus" placeholder="Ex: Aluguel, Internet, Netflix…" value={fixedForm.description} onChange={(e) => setFixedForm({ ...fixedForm, description: e.target.value })} />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Valor a partir deste mês (R$)</label>
                  <input className="rz-input rz-focus rz-mono" inputMode="decimal" placeholder="0,00" value={fixedForm.amount} onChange={(e) => setFixedForm({ ...fixedForm, amount: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Dia do vencimento</label>
                  <input type="number" min="1" max="31" className="rz-input rz-focus rz-mono" value={fixedForm.dueDay} onChange={(e) => setFixedForm({ ...fixedForm, dueDay: e.target.value })} />
                </div>
              </div>
              {editingFixedId && (
                <p className="text-xs -mt-2" style={{ color: "var(--ink-soft)" }}>
                  Mudar o valor só afeta {MONTHS[refDate.getMonth()]}/{refDate.getFullYear()} em diante — os meses anteriores mantêm o valor antigo.
                </p>
              )}

              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Categoria</label>
                <select className="rz-input rz-focus" value={fixedForm.category} onChange={(e) => setFixedForm({ ...fixedForm, category: e.target.value })}>
                  <option value="" disabled>Selecione</option>
                  {categoriesByType[fixedForm.type].map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Banco / Conta (opcional)</label>
                <select className="rz-input rz-focus" value={fixedForm.account} onChange={(e) => setFixedForm({ ...fixedForm, account: e.target.value })}>
                  <option value="">Nenhum selecionado</option>
                  {banksList.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>

              {fixedFormError && <div className="text-xs" style={{ color: "var(--brick)" }}>{fixedFormError}</div>}

              <div className="flex gap-2 mt-2">
                <button onClick={onCancelForm} className="rz-btn-ghost rz-focus flex-1 text-sm">Cancelar</button>
                <button onClick={onSubmit} className="rz-btn-primary rz-focus flex-1 text-sm flex items-center justify-center gap-2">
                  <Check size={16} /> {editingFixedId ? "Salvar alterações" : "Adicionar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CsvImportModal({ categoriesByType, banksList, onConfirm, onCancel }) {
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
        setRows(parsedRows);
      },
      error: () => setError("Não foi possível ler o arquivo."),
    });
  };

  const validRows = rows.filter((r) => r.valid);
  const invalidCount = rows.length - validRows.length;
  const hasDespesas = validRows.some((r) => r.type === "despesa");
  const hasReceitas = validRows.some((r) => r.type === "receita");

  const handleConfirm = () => {
    if (hasDespesas && !despesaCategory) { setError("Selecione uma categoria para as despesas importadas."); return; }
    if (hasReceitas && !receitaCategory) { setError("Selecione uma categoria para as receitas importadas."); return; }
    onConfirm(validRows, despesaCategory, receitaCategory, account, status);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: "rgba(30,43,35,0.45)" }}>
      <div className="rz-card w-full sm:max-w-lg p-5 sm:p-6" style={{ borderRadius: "14px 14px 0 0", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="rz-display text-xl">Importar extrato (CSV)</h2>
          <button onClick={onCancel} className="rz-focus" style={{ color: "var(--ink-soft)" }} aria-label="Fechar"><X size={20} /></button>
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
            <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
              {fileName} — {validRows.length} lançamento{validRows.length !== 1 ? "s" : ""} prontos para importar
              {invalidCount > 0 ? `, ${invalidCount} ignorado${invalidCount !== 1 ? "s" : ""} (dados incompletos)` : ""}.
            </p>

            <div className="flex flex-col gap-3 mb-4">
              {hasDespesas && (
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Categoria para despesas</label>
                  <select className="rz-input rz-focus" value={despesaCategory} onChange={(e) => setDespesaCategory(e.target.value)}>
                    <option value="" disabled>Selecione</option>
                    {categoriesByType.despesa.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              )}
              {hasReceitas && (
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Categoria para receitas</label>
                  <select className="rz-input rz-focus" value={receitaCategory} onChange={(e) => setReceitaCategory(e.target.value)}>
                    <option value="" disabled>Selecione</option>
                    {categoriesByType.receita.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Banco / Conta (opcional, aplicado a todos)</label>
                <select className="rz-input rz-focus" value={account} onChange={(e) => setAccount(e.target.value)}>
                  <option value="">Nenhum selecionado</option>
                  {banksList.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--ink-soft)" }}>Status</label>
                <select className="rz-input rz-focus" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="pago">Já pago (extrato do banco)</option>
                  <option value="pendente">Pendente (ainda vai acontecer)</option>
                </select>
                <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
                  Só lançamentos pagos entram no saldo das contas.
                </p>
              </div>
            </div>

            <div className="rz-card overflow-hidden mb-4" style={{ maxHeight: 220, overflowY: "auto" }}>
              {validRows.slice(0, 50).map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                  <span className="rz-mono w-20 shrink-0" style={{ color: "var(--ink-soft)" }}>{formatDateBR(r.date)}</span>
                  <span className="flex-1 truncate">{r.description}</span>
                  <span className="rz-mono font-semibold shrink-0" style={{ color: r.type === "receita" ? "var(--emerald)" : "var(--brick)" }}>
                    {r.type === "receita" ? "+ " : "− "}{formatCurrency(r.amount)}
                  </span>
                </div>
              ))}
              {validRows.length > 50 && (
                <div className="px-3 py-2 text-xs text-center" style={{ color: "var(--ink-soft)", borderTop: "1px solid var(--line)" }}>
                  + {validRows.length - 50} lançamentos não exibidos na prévia
                </div>
              )}
            </div>

            {error && <div className="text-xs mb-3" style={{ color: "var(--brick)" }}>{error}</div>}

            <div className="flex gap-2">
              <button onClick={onCancel} className="rz-btn-ghost rz-focus flex-1 text-sm">Cancelar</button>
              <button onClick={handleConfirm} className="rz-btn-primary rz-focus flex-1 text-sm flex items-center justify-center gap-2">
                <Check size={16} /> Importar {validRows.length} lançamento{validRows.length !== 1 ? "s" : ""}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CarteiraTab({ transactions, banksList, setActiveTab }) {
  // Efeito de um lançamento sobre uma conta específica:
  // receita entra, despesa sai, transferência sai da origem e entra no destino.
  const efeitoNaConta = (t, contaId) => {
    if (t.type === "transferencia") {
      if (t.account === contaId) return -t.amount;
      if (t.toAccount === contaId) return t.amount;
      return 0;
    }
    if (t.account !== contaId) return 0;
    return t.type === "receita" ? t.amount : -t.amount;
  };

  const saldoPorConta = useMemo(() => {
    return banksList.map((c) => {
      const daConta = transactions.filter((t) => t.account === c.id || t.toAccount === c.id);
      const saldo = (c.initialBalance || 0) + daConta.filter((t) => t.status === "pago")
        .reduce((s, t) => s + efeitoNaConta(t, c.id), 0);
      const pendente = daConta.filter((t) => t.status === "pendente")
        .reduce((s, t) => s + efeitoNaConta(t, c.id), 0);
      return { ...c, saldo, pendente, movimentos: daConta.length };
    });
  }, [banksList, transactions]);

  const semConta = useMemo(() => {
    const sem = transactions.filter((t) => !t.account && t.type !== "transferencia");
    return {
      saldo: sem.filter((t) => t.status === "pago").reduce((s, t) => s + (t.type === "receita" ? t.amount : -t.amount), 0),
      pendente: sem.filter((t) => t.status === "pendente").reduce((s, t) => s + (t.type === "receita" ? t.amount : -t.amount), 0),
      movimentos: sem.length,
    };
  }, [transactions]);

  const totalSaldo = saldoPorConta.reduce((s, c) => s + c.saldo, 0) + semConta.saldo;
  const totalPendente = saldoPorConta.reduce((s, c) => s + c.pendente, 0) + semConta.pendente;

  const linhas = [
    ...saldoPorConta.filter((c) => c.movimentos > 0),
    ...(semConta.movimentos > 0 ? [{ id: "__sem__", label: "Sem conta definida", color: "var(--line)", ...semConta }] : []),
  ];

  return (
    <div>
      <header className="mb-6">
        <h1 className="rz-display text-2xl md:text-3xl">Contas</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Quanto tem em cada conta, considerando todo o histórico.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <SummaryCard label="Total em contas" value={totalSaldo} icon={Wallet} tone={totalSaldo >= 0 ? "emerald" : "brick"} />
        <SummaryCard label="Previsto (com pendentes)" value={totalSaldo + totalPendente} icon={Scale} tone={totalSaldo + totalPendente >= 0 ? "emerald" : "brick"} />
      </div>

      {linhas.length === 0 ? (
        <div className="rz-card p-10 text-center">
          <Wallet size={26} className="mx-auto mb-3" style={{ color: "var(--line)" }} />
          <div className="rz-display text-lg mb-1">Nenhuma movimentação por conta</div>
          <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
            Preencha o campo "Banco / Conta" nos seus lançamentos para acompanhar o saldo de cada uma.
          </p>
          <button onClick={() => setActiveTab("lancamentos")} className="rz-btn-primary rz-focus text-sm">
            Ir para Lançamentos
          </button>
        </div>
      ) : (
        <div className="rz-card overflow-hidden">
          {linhas.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
              <span className="rz-dot" style={{ background: c.color }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={c.id === "__sem__" ? { color: "var(--ink-soft)" } : undefined}>{c.label}</div>
                <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {c.movimentos} lançamento{c.movimentos !== 1 ? "s" : ""}
                  {c.pendente !== 0 && (
                    <span style={{ color: "var(--gold)" }}> · {formatCurrency(c.pendente)} pendente</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="rz-mono text-sm font-semibold whitespace-nowrap" style={{ color: c.saldo >= 0 ? "var(--emerald)" : "var(--brick)" }}>
                  {formatCurrency(c.saldo)}
                </div>
                {c.pendente !== 0 && (
                  <div className="rz-mono text-[11px] whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>
                    previsto {formatCurrency(c.saldo + c.pendente)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs mt-4" style={{ color: "var(--ink-soft)" }}>
        O saldo considera apenas lançamentos marcados como pagos. Os pendentes aparecem como "previsto".
      </p>
    </div>
  );
}


function PoupancaTab({ savingsAccounts, savingsForm, setSavingsForm, savingsError, onAdd, onDelete, onContribute, onDeleteHistoryEntry }) {
  const total = savingsAccounts.reduce((s, a) => s + a.currentAmount, 0);

  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="rz-display text-2xl md:text-3xl">Poupança</h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Quanto você já tem guardado, por categoria.</p>
        </div>
      </header>

      <div className="mb-6">
        <SummaryCard label="Total guardado" value={total} icon={Landmark} tone="emerald" />
      </div>

      <div className="rz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3">Nova categoria de poupança</h2>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <input
            className="rz-input rz-focus flex-1"
            placeholder="Ex: Reserva de Emergência, Casa Nova…"
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
              aria-label={`Cor ${color}`}
            />
          ))}
        </div>
        {savingsError && <div className="text-xs mt-2" style={{ color: "var(--brick)" }}>{savingsError}</div>}
      </div>

      {savingsAccounts.length === 0 ? (
        <div className="rz-card p-10 text-center">
          <Landmark size={26} className="mx-auto mb-3" style={{ color: "var(--line)" }} />
          <div className="rz-display text-lg mb-1">Nenhuma categoria de poupança</div>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Crie uma categoria acima pra começar a guardar dinheiro.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {savingsAccounts.map((a) => (
            <SavingsCard key={a.id} account={a} onDelete={onDelete} onContribute={onContribute} onDeleteHistoryEntry={onDeleteHistoryEntry} />
          ))}
        </div>
      )}
    </div>
  );
}

function SavingsCard({ account, onDelete, onContribute, onDeleteHistoryEntry }) {
  const [amount, setAmount] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const history = account.history || [];

  const submitDelta = (sign) => {
    const num = parseFloat(String(amount).replace(",", "."));
    if (!num || num <= 0) return;
    onContribute(account.id, num * sign);
    setAmount("");
  };

  return (
    <div className="rz-card p-4 sm:p-5">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rz-dot" style={{ background: account.color }} />
          <span className="text-sm font-medium truncate">{account.label}</span>
        </div>
        <button onClick={() => onDelete(account)} className="rz-focus p-1 rounded-md shrink-0" aria-label="Excluir categoria" style={{ color: "var(--ink-soft)" }}>
          <Trash2 size={13} />
        </button>
      </div>

      <div className="rz-mono text-2xl font-semibold mb-4" style={{ color: "var(--emerald)" }}>{formatCurrency(account.currentAmount)}</div>

      <div className="flex items-center gap-2">
        <input className="rz-input rz-focus rz-mono text-sm flex-1" inputMode="decimal" placeholder="Valor" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitDelta(1)} />
        <button onClick={() => submitDelta(1)} className="rz-focus p-1.5 rounded-md" style={{ color: "var(--emerald)" }} aria-label="Adicionar valor"><Plus size={16} /></button>
        <button onClick={() => submitDelta(-1)} className="rz-focus p-1.5 rounded-md" style={{ color: "var(--brick)" }} aria-label="Retirar valor"><Minus size={16} /></button>
      </div>

      {history.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
          <button onClick={() => setShowHistory((v) => !v)} className="rz-focus text-xs font-medium flex items-center gap-1" style={{ color: "var(--ink-soft)" }}>
            <History size={13} /> {showHistory ? "Ocultar" : "Ver"} histórico ({history.length})
          </button>
          {showHistory && (
            <div className="flex flex-col mt-2 max-h-40 overflow-y-auto">
              {[...history].reverse().map((h) => (
                <div key={h.id} className="flex items-center gap-2 py-1.5" style={{ borderTop: "1px solid var(--line)" }}>
                  <span className="rz-mono text-[11px] flex-1" style={{ color: "var(--ink-soft)" }}>{formatDateBR(h.date)}</span>
                  <span className="rz-mono text-xs font-semibold" style={{ color: h.amount >= 0 ? "var(--emerald)" : "var(--brick)" }}>
                    {h.amount >= 0 ? "+ " : "− "}{formatCurrency(Math.abs(h.amount))}
                  </span>
                  <button onClick={() => onDeleteHistoryEntry(account.id, h.id)} className="rz-focus p-1 rounded-md" aria-label="Excluir movimentação" style={{ color: "var(--ink-soft)" }}>
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

function VisaoGeralTab({ transactions, periodFiltered, totals, refDate, periodMode, shiftMonth, setPeriodMode, findCategory, setActiveTab, fixedBills, findBank, onLaunchFixedBill, savingsAccounts, saldosIniciais }) {
  const saldoTotal = useMemo(
    () => saldosIniciais + transactions.filter((t) => t.status === "pago" && t.type !== "transferencia")
      .reduce((s, t) => s + (t.type === "receita" ? t.amount : -t.amount), 0),
    [transactions, saldosIniciais]
  );

  const savingsTotal = useMemo(() => savingsAccounts.reduce((s, a) => s + a.currentAmount, 0), [savingsAccounts]);

  // Saldo projetado de verdade: o que já está em conta + tudo que ainda está
  // pendente (lançamentos + contas fixas não lançadas) até o fim do período.
  const saldoProjetado = useMemo(() => {
    const endOfPeriod = periodMode === "todos"
      ? new Date(8640000000000000)
      : new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59);
    const pendentes = transactions
      .filter((t) => t.status === "pendente" && t.type !== "transferencia" && new Date(t.date + "T00:00:00") <= endOfPeriod)
      .reduce((s, t) => s + (t.type === "receita" ? t.amount : -t.amount), 0);
    const fixasNaoLancadas = periodMode === "todos" ? 0 : enrichFixedBills(fixedBills, transactions, refDate)
      .filter((b) => b.active && b.status !== "lancada")
      .reduce((s, b) => s + (b.type === "receita" ? b.amount : -b.amount), 0);
    return saldoTotal + pendentes + fixasNaoLancadas;
  }, [transactions, fixedBills, refDate, periodMode, saldoTotal]);

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
        .filter((t) => t.status === "pago" && t.type !== "transferencia" && new Date(t.date + "T00:00:00") <= endOfMonth)
        .reduce((s, t) => s + (t.type === "receita" ? t.amount : -t.amount), 0);
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
          <PeriodNavigator periodMode={periodMode} refDate={refDate} shiftMonth={shiftMonth} setPeriodMode={setPeriodMode} />

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

function BancosTab({ banksList, customBanks, bankForm, setBankForm, bankError, onAdd, onDelete, onUpdate, hiddenCount, onRestore }) {
  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="rz-display text-2xl md:text-3xl">Contas e Bancos</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
          Cadastre suas contas e carteiras para escolher rapidinho em cada lançamento. Os saldos aparecem na aba "Contas" do menu.
        </p>
      </header>

      <div className="rz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3">Novo banco ou conta</h2>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <input
            className="rz-input rz-focus flex-1"
            placeholder="Nome (ex: Nubank, Inter, Caixinha…)"
            value={bankForm.label}
            onChange={(e) => setBankForm({ ...bankForm, label: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
          />
          <input
            className="rz-input rz-focus rz-mono sm:w-40"
            inputMode="decimal"
            placeholder="Saldo inicial"
            value={bankForm.initialBalance}
            onChange={(e) => setBankForm({ ...bankForm, initialBalance: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
          />
          <button onClick={onAdd} className="rz-btn-primary rz-focus flex items-center justify-center gap-2 text-sm whitespace-nowrap">
            <Plus size={16} /> Adicionar
          </button>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
          O saldo inicial é quanto a conta já tinha antes de você começar a usar o Razão. Ele entra no saldo, mas não conta como receita.
        </p>

        <div className="flex flex-wrap gap-2 mb-1">
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              onClick={() => setBankForm({ ...bankForm, color })}
              className="rz-focus w-6 h-6 rounded-full"
              style={{
                background: color,
                boxShadow: bankForm.color === color ? "0 0 0 2px var(--surface), 0 0 0 4px var(--ink)" : "none",
              }}
              aria-label={`Cor ${color}`}
            />
          ))}
        </div>
        {bankError && <div className="text-xs mt-2" style={{ color: "var(--brick)" }}>{bankError}</div>}
      </div>

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>Seus bancos e carteiras</h3>
        {hiddenCount > 0 && (
          <button onClick={onRestore} className="rz-focus text-xs font-medium" style={{ color: "var(--emerald)" }}>
            Restaurar {hiddenCount} padrão{hiddenCount > 1 ? "ões" : ""} removido{hiddenCount > 1 ? "s" : ""}
          </button>
        )}
      </div>
      <div className="rz-card overflow-hidden">
        {banksList.map((b, i) => (
          <CategoryRow key={b.id} cat={b} isFirst={i === 0} isCustom={customBanks.some((x) => x.id === b.id)} onDelete={onDelete} onUpdate={onUpdate} isBank />
        ))}
      </div>
      <p className="text-xs mt-4" style={{ color: "var(--ink-soft)" }}>
        Excluir um banco não apaga lançamentos que já usam ele — eles continuam aparecendo normalmente.
      </p>
    </div>
  );
}

function CategoriasTab({ categoriesByType, customCategories, categoryForm, setCategoryForm, categoryError, onAdd, onDelete, onUpdate, hiddenCount, onRestore }) {
  return (
    <div className="max-w-4xl">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="rz-display text-2xl md:text-3xl">Categorias</h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
            Além das categorias padrão, crie as suas para deixar os lançamentos do seu jeito.
          </p>
        </div>
        {hiddenCount > 0 && (
          <button onClick={onRestore} className="rz-focus text-xs font-medium" style={{ color: "var(--emerald)" }}>
            Restaurar {hiddenCount} padrão{hiddenCount > 1 ? "ões" : ""} removido{hiddenCount > 1 ? "s" : ""}
          </button>
        )}
      </header>

      {/* New category form */}
      <div className="rz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3">Nova categoria</h2>

        <div className="rz-toggle mb-3">
          <button onClick={() => setCategoryForm({ ...categoryForm, type: "receita" })} className={categoryForm.type === "receita" ? "receita-on" : "off"}>Receita</button>
          <button onClick={() => setCategoryForm({ ...categoryForm, type: "despesa" })} className={categoryForm.type === "despesa" ? "despesa-on" : "off"}>Despesa</button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <input
            className="rz-input rz-focus flex-1"
            placeholder="Nome da categoria (ex: Pet, Viagens…)"
            value={categoryForm.label}
            onChange={(e) => setCategoryForm({ ...categoryForm, label: e.target.value })}
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
              onClick={() => setCategoryForm({ ...categoryForm, color })}
              className="rz-focus w-6 h-6 rounded-full"
              style={{
                background: color,
                boxShadow: categoryForm.color === color ? "0 0 0 2px var(--surface), 0 0 0 4px var(--ink)" : "none",
              }}
              aria-label={`Cor ${color}`}
            />
          ))}
        </div>

        {categoryError && <div className="text-xs mt-2" style={{ color: "var(--brick)" }}>{categoryError}</div>}
      </div>

      {/* Category lists */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Receitas</h3>
          <div className="rz-card overflow-hidden">
            {categoriesByType.receita.map((c, i) => (
              <CategoryRow key={c.id} cat={c} isFirst={i === 0} isCustom={customCategories.some((x) => x.id === c.id)} onDelete={onDelete} onUpdate={onUpdate} />
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Despesas</h3>
          <div className="rz-card overflow-hidden">
            {categoriesByType.despesa.map((c, i) => (
              <CategoryRow key={c.id} cat={c} isFirst={i === 0} isCustom={customCategories.some((x) => x.id === c.id)} onDelete={onDelete} onUpdate={onUpdate} />
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs mt-4" style={{ color: "var(--ink-soft)" }}>
        Excluir uma categoria não apaga lançamentos que já usam ela — eles continuam aparecendo normalmente.
      </p>
    </div>
  );
}

function CategoryRow({ cat, isFirst, isCustom, onDelete, onUpdate, isBank }) {
  const [editing, setEditing] = useState(false);
  const [tempLabel, setTempLabel] = useState(cat.label);
  const [tempColor, setTempColor] = useState(cat.color);
  const [tempInitial, setTempInitial] = useState(String(cat.initialBalance ?? ""));

  const startEdit = () => {
    setTempLabel(cat.label); setTempColor(cat.color);
    setTempInitial(String(cat.initialBalance ?? ""));
    setEditing(true);
  };
  const save = () => {
    if (!tempLabel.trim()) return;
    const extra = isBank ? { initialBalance: parseFloat(String(tempInitial).replace(",", ".")) || 0 } : {};
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
          <button onClick={save} className="rz-focus p-1.5 rounded-md" style={{ color: "var(--emerald)" }} aria-label="Salvar"><Check size={16} /></button>
          <button onClick={() => setEditing(false)} className="rz-focus p-1.5 rounded-md" style={{ color: "var(--ink-soft)" }} aria-label="Cancelar"><X size={16} /></button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              onClick={() => setTempColor(color)}
              className="rz-focus w-5 h-5 rounded-full"
              style={{ background: color, boxShadow: tempColor === color ? "0 0 0 2px var(--surface), 0 0 0 3px var(--ink)" : "none" }}
              aria-label={`Cor ${color}`}
            />
          ))}
        </div>
        {isBank && (
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
        {isBank && cat.initialBalance ? (
          <div className="text-xs" style={{ color: "var(--ink-soft)" }}>Saldo inicial: {formatCurrency(cat.initialBalance)}</div>
        ) : null}
      </div>
      {!isCustom && <span className="rz-mono text-[9px] opacity-50">PADRÃO</span>}
      {onUpdate && (
        <button onClick={startEdit} className="rz-focus p-1 rounded-md" aria-label="Editar" style={{ color: "var(--ink-soft)" }}>
          <Pencil size={13} />
        </button>
      )}
      <button onClick={() => onDelete(cat)} className="rz-focus p-1 rounded-md" aria-label="Excluir" style={{ color: "var(--ink-soft)" }}>
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
