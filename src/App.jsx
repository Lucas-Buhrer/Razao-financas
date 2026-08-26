import { useState, useEffect, useMemo, useRef } from "react";
import { BookOpen, Receipt, Plus, Trash2, Pencil, X, Check, Search, TrendingUp, TrendingDown, Scale, Undo2, Menu, LogOut, FileUp, FileDown, Copy, Paperclip, Loader2, Layers, Repeat } from "lucide-react";
import { storage } from "./storage";
import { supabase } from "./supabaseClient";
import { uploadReceipt, getReceiptUrl, deleteReceipt } from "./receipts";
import { CATEGORIES, DEFAULT_BANKS, NAV_ITEMS, COLOR_PALETTE, DEFAULT_SAVINGS_SEED, DEFAULT_THEME, emptyForm, emptyFixedForm, emptyDebtForm } from "./lib/constants";
import { uid, todayISO, formatCurrency, formatDateBR, colorForEmail, isDarkTheme } from "./lib/format";
import { downloadCsv, chaveDuplicata, buildCategoryMemory, addMonthsToDateISO } from "./lib/csv";
import { periodKeyOf, getAmountForPeriod, enrichFixedBills } from "./lib/finance";
import { SummaryCard, PeriodNavigator, PlaceholderTab } from "./components/common";
import { VisaoGeralTab } from "./components/VisaoGeralTab";
import { FixedBillsTab } from "./components/FixedBillsTab";
import { CaixinhasTab } from "./components/CaixinhasTab";
import { CarteiraTab } from "./components/CarteiraTab";
import { OrcamentoTab } from "./components/OrcamentoTab";
import { DividasTab } from "./components/DividasTab";
import { ReportsTab } from "./components/ReportsTab";
import { ConfiguracoesTab } from "./components/ConfiguracoesTab";
import { CsvImportModal } from "./components/CsvImportModal";

/* ---------------------------------------------------------
   RAZÃO — Controle Financeiro Pessoal
   Estado principal, handlers e roteamento entre as abas.
--------------------------------------------------------- */





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
  const [categoryOrder, setCategoryOrder] = useState({ receita: [], despesa: [] });

  const [customBanks, setCustomBanks] = useState([]);
  const [banksLoaded, setBanksLoaded] = useState(false);
  const [bankForm, setBankForm] = useState({ label: "", color: COLOR_PALETTE[0], initialBalance: "", kind: "conta", closingDay: "", dueDay: "" });
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

  const [debts, setDebts] = useState([]);
  const [debtsLoaded, setDebtsLoaded] = useState(false);
  const [debtForm, setDebtForm] = useState(emptyDebtForm);
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [editingDebtId, setEditingDebtId] = useState(null);
  const [debtError, setDebtError] = useState("");

  const [backupMessage, setBackupMessage] = useState(null);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickForm, setQuickForm] = useState({ amount: "", description: "", category: "", type: "despesa" });
  const [quickError, setQuickError] = useState("");

  const [budgets, setBudgets] = useState([]);
  const [budgetsLoaded, setBudgetsLoaded] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ kind: "categoria", categoryId: "", accountId: "", limit: "" });
  const [budgetError, setBudgetError] = useState("");


  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [aplicarNasParcelas, setAplicarNasParcelas] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [formError, setFormError] = useState("");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [accountFilter, setAccountFilter] = useState("todas");
  const [sortBy, setSortBy] = useState("data-desc");
  const [filtrosCarregados, setFiltrosCarregados] = useState(false);
  const [selecionados, setSelecionados] = useState([]);
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

  // ---------- Load/save ordem das categorias ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("ordem_categorias", false);
        if (res && res.value) setCategoryOrder(JSON.parse(res.value));
      } catch (e) { /* ainda não existe */ }
    })();
  }, []);

  useEffect(() => {
    if (!categoriesLoaded) return;
    (async () => {
      try {
        await storage.set("ordem_categorias", JSON.stringify(categoryOrder), false);
      } catch (e) {
        setLoadError(true);
      }
    })();
  }, [categoryOrder, categoriesLoaded]);

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

  // ---------- Load caixinhas (migra metas antigas para dentro da poupança) ----------
  useEffect(() => {
    (async () => {
      const normaliza = (c, i) => ({
        targetAmount: null, deadline: "", monthlyPlan: null, archived: false, order: i,
        ...c,
        currentAmount: c.currentAmount || 0,
        history: c.history || [],
      });

      try {
        let caixinhas = [];
        try {
          const res = await storage.get("poupanca", false);
          if (res && res.value) caixinhas = JSON.parse(res.value);
        } catch (e) { /* ainda não existe */ }

        let jaMigrou = false;
        try {
          const flag = await storage.get("metas_migradas", false);
          jaMigrou = !!(flag && flag.value);
        } catch (e) { /* ainda não migrou */ }

        if (!jaMigrou) {
          let metas = [];
          try {
            const m = await storage.get("metas", false);
            if (m && m.value) metas = JSON.parse(m.value);
          } catch (e) { /* não havia metas */ }

          metas.forEach((g) => {
            const vinculada = g.linkedSavingsId ? caixinhas.find((c) => c.id === g.linkedSavingsId) : null;
            if (vinculada) {
              // Meta que já apontava para uma poupança: funde as duas
              vinculada.targetAmount = g.targetAmount;
              vinculada.deadline = g.deadline || "";
            } else {
              caixinhas.push({
                id: g.id, label: g.title, color: g.color,
                currentAmount: g.currentAmount || 0, history: g.history || [],
                targetAmount: g.targetAmount, deadline: g.deadline || "",
                monthlyPlan: null, archived: false,
              });
            }
          });
          try { await storage.set("metas_migradas", "true", false); } catch (e) { /* segue mesmo assim */ }
        }

        if (caixinhas.length === 0) {
          caixinhas = DEFAULT_SAVINGS_SEED.map((s) => ({ id: uid(), ...s, currentAmount: 0, history: [] }));
        }
        setSavingsAccounts(caixinhas.map(normaliza));
      } catch (e) {
        setSavingsAccounts(DEFAULT_SAVINGS_SEED.map((s, i) => normaliza({ id: uid(), ...s }, i)));
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

  // ---------- Load/save dívidas ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("dividas", false);
        setDebts(res && res.value ? JSON.parse(res.value) : []);
      } catch (e) {
        setDebts([]);
      } finally {
        setDebtsLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!debtsLoaded) return;
    (async () => {
      try {
        await storage.set("dividas", JSON.stringify(debts), false);
      } catch (e) {
        setLoadError(true);
      }
    })();
  }, [debts, debtsLoaded]);

  // ---------- Lembra os filtros da aba Lançamentos ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("filtros_lancamentos", false);
        if (res && res.value) {
          const f = JSON.parse(res.value);
          if (f.typeFilter) setTypeFilter(f.typeFilter);
          if (f.categoryFilter) setCategoryFilter(f.categoryFilter);
          if (f.accountFilter) setAccountFilter(f.accountFilter);
          if (f.sortBy) setSortBy(f.sortBy);
        }
      } catch (e) { /* ainda não existe */ }
      finally { setFiltrosCarregados(true); }
    })();
  }, []);

  useEffect(() => {
    if (!filtrosCarregados) return;
    (async () => {
      try {
        await storage.set("filtros_lancamentos", JSON.stringify({ typeFilter, categoryFilter, accountFilter, sortBy }), false);
      } catch (e) { /* falha silenciosa: filtro não é dado crítico */ }
    })();
  }, [typeFilter, categoryFilter, accountFilter, sortBy, filtrosCarregados]);

  // ---------- Toast auto-dismiss ----------
  useEffect(() => {
    if (!toast) return;
    toastTimer.current = setTimeout(() => setToast(null), toast.snapshot ? 9000 : 5000);
    return () => clearTimeout(toastTimer.current);
  }, [toast]);

  // ---------- Derived data ----------
  const categoriesByType = useMemo(() => {
    // Aplica a ordem escolhida pelo usuário; categorias novas (ainda sem
    // posição definida) vão para o fim da lista.
    const aplicarOrdem = (lista, ordem) => {
      if (!ordem || ordem.length === 0) return lista;
      const pos = {};
      ordem.forEach((id, i) => { pos[id] = i; });
      return [...lista].sort((a, b) => (pos[a.id] ?? 9999) - (pos[b.id] ?? 9999));
    };
    return {
      receita: aplicarOrdem([...CATEGORIES.receita.filter((c) => !hiddenDefaultCategories.includes(c.id)), ...customCategories.filter((c) => c.type === "receita")], categoryOrder.receita),
      despesa: aplicarOrdem([...CATEGORIES.despesa.filter((c) => !hiddenDefaultCategories.includes(c.id)), ...customCategories.filter((c) => c.type === "despesa")], categoryOrder.despesa),
    };
  }, [customCategories, hiddenDefaultCategories, categoryOrder]);

  const findCategory = (type, id) => {
    const allTypeCats = [...(CATEGORIES[type] || []), ...customCategories.filter((c) => c.type === type)];
    return allTypeCats.find((c) => c.id === id) || { label: id, color: "#9A8A7A" };
  };

  const banksList = useMemo(() => [...DEFAULT_BANKS.filter((b) => !hiddenDefaultBanks.includes(b.id)), ...customBanks], [customBanks, hiddenDefaultBanks]);
  const findBank = (id) => [...DEFAULT_BANKS, ...customBanks].find((b) => b.id === id);

  const saldosIniciais = useMemo(() => banksList.filter((b) => b.kind !== "cartao").reduce((s, b) => s + (b.initialBalance || 0), 0), [banksList]);

  const cardIds = useMemo(() => new Set(banksList.filter((b) => b.kind === "cartao").map((b) => b.id)), [banksList]);

  const categoryMemory = useMemo(() => buildCategoryMemory(transactions), [transactions]);

  const chavesExistentes = useMemo(() => new Set(transactions.map(chaveDuplicata)), [transactions]);

  const periodFiltered = useMemo(() => {
    if (periodMode === "todos") return transactions;
    const y = refDate.getFullYear(), m = refDate.getMonth();
    return transactions.filter((t) => {
      const d = new Date(t.date + "T00:00:00");
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }, [transactions, periodMode, refDate]);

  const visibleTransactions = useMemo(() => {
    // A busca aceita texto (descrição) ou número (valor).
    const termo = search.trim().toLowerCase();
    const comoNumero = parseFloat(termo.replace(".", "").replace(",", "."));
    const buscaNumerica = termo !== "" && !isNaN(comoNumero);

    const casaBusca = (t) => {
      if (termo === "") return true;
      if (t.description.toLowerCase().includes(termo)) return true;
      if (buscaNumerica) {
        const v = Number(t.amount);
        return Math.abs(v - comoNumero) < 0.005 || String(v.toFixed(2)).includes(termo.replace(",", "."));
      }
      return false;
    };

    const lista = periodFiltered
      .filter((t) => (typeFilter === "todos" ? true : t.type === typeFilter))
      .filter((t) => (typeFilter === "transferencia" || categoryFilter === "todas" ? true : t.category === categoryFilter))
      .filter((t) => (accountFilter === "todas" ? true : (accountFilter === "sem" ? !t.account : t.account === accountFilter)))
      .filter(casaBusca);

    const ordenadores = {
      "data-desc": (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0),
      "data-asc": (a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0),
      "valor-desc": (a, b) => b.amount - a.amount,
      "valor-asc": (a, b) => a.amount - b.amount,
    };
    return [...lista].sort(ordenadores[sortBy] || ordenadores["data-desc"]);
  }, [periodFiltered, typeFilter, categoryFilter, accountFilter, search, sortBy]);

  // Os cards refletem exatamente o que está sendo exibido na lista
  const totals = useMemo(() => {
    const receitas = visibleTransactions.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
    const despesas = visibleTransactions.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
    const transferido = visibleTransactions.filter((t) => t.type === "transferencia").reduce((s, t) => s + Number(t.amount), 0);
    return { receitas, despesas, transferido, saldo: receitas - despesas };
  }, [visibleTransactions]);

  const totalsPeriodo = useMemo(() => {
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
    setAplicarNasParcelas(false);
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

  const checkBudgetAlert = (categoryId, type, date, addedAmount, accountId) => {
    if (type !== "despesa") return;
    const d = new Date(date + "T00:00:00");
    const noMesmoMes = (t) => {
      const td = new Date(t.date + "T00:00:00");
      return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
    };

    const avisar = (nome, total, limite) => {
      if (total > limite) {
        setToast({ message: `Orçamento de "${nome}" estourado: ${formatCurrency(total)} de ${formatCurrency(limite)}.`, tone: "warning" });
      }
    };

    const bCat = budgets.find((b) => b.kind !== "conta" && b.categoryId === categoryId);
    if (bCat) {
      const total = transactions
        .filter((t) => t.type === "despesa" && t.category === categoryId).filter(noMesmoMes)
        .reduce((s, t) => s + Number(t.amount), 0) + addedAmount;
      avisar(findCategory("despesa", categoryId).label, total, bCat.limit);
    }

    const bConta = accountId && budgets.find((b) => b.kind === "conta" && b.accountId === accountId);
    if (bConta) {
      const total = transactions
        .filter((t) => t.type === "despesa" && t.account === accountId).filter(noMesmoMes)
        .reduce((s, t) => s + Number(t.amount), 0) + addedAmount;
      avisar(findBank(accountId)?.label || "conta", total, bConta.limit);
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
      checkBudgetAlert(form.category, form.type, newTxs[0].date, newTxs[0].amount, form.account);
      setShowForm(false);
      resetForm();
      return;
    }

    if (editingId) {
      const original = transactions.find((t) => t.id === editingId);
      const grupo = aplicarNasParcelas && original?.installmentGroupId ? original.installmentGroupId : null;
      setTransactions((prev) => prev.map((t) => {
        if (t.id === editingId) return { ...t, ...form, amount: amountNum };
        // Nas outras parcelas, muda só categoria e conta — descrição, valor e
        // data são específicos de cada uma.
        if (grupo && t.installmentGroupId === grupo) {
          return { ...t, category: form.category, account: form.account };
        }
        return t;
      }));
    } else {
      setTransactions((prev) => [...prev, { id: pendingId || uid(), ...form, amount: amountNum, createdBy: currentUserEmail }]);
      checkBudgetAlert(form.category, form.type, form.date, amountNum, form.account);
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
    const avisar = avisarComDesfazer(`${novos.length} conta${novos.length !== 1 ? "s" : ""} fixa${novos.length !== 1 ? "s" : ""} lançada${novos.length !== 1 ? "s" : ""}.`);
    setTransactions((prev) => [...prev, ...novos]);
    avisar();
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
    const avisar = avisarComDesfazer(`${pendentes.length} lançamento${pendentes.length !== 1 ? "s" : ""} marcado${pendentes.length !== 1 ? "s" : ""} como pago.`);
    setTransactions((prev) => prev.map((t) => (ids.has(t.id) ? { ...t, status: "pago" } : t)));
    avisar();
  };

  const handleQuickAdd = () => {
    const valor = parseFloat(String(quickForm.amount).replace(",", "."));
    if (!valor || valor <= 0) { setQuickError("Informe um valor."); return; }
    if (!quickForm.category) { setQuickError("Escolha uma categoria."); return; }
    setTransactions((prev) => [...prev, {
      id: uid(),
      description: quickForm.description.trim() || findCategory(quickForm.type, quickForm.category).label,
      amount: valor, date: todayISO(), type: quickForm.type, category: quickForm.category,
      account: "", status: "pago", createdBy: currentUserEmail,
    }]);
    checkBudgetAlert(quickForm.category, quickForm.type, todayISO(), valor, "");
    setQuickForm({ amount: "", description: "", category: "", type: quickForm.type });
    setQuickError("");
    setShowQuickAdd(false);
    setToast({ message: "Lançamento registrado." });
  };

  const resetDebtForm = () => { setDebtForm(emptyDebtForm); setEditingDebtId(null); setDebtError(""); };
  const openNewDebtForm = () => { resetDebtForm(); setShowDebtForm(true); };
  const openEditDebtForm = (d) => {
    setDebtForm({ person: d.person, amount: String(d.amount), direction: d.direction, date: d.date, dueDate: d.dueDate || "", notes: d.notes || "", interestRate: d.interestRate ? String(d.interestRate) : "" });
    setEditingDebtId(d.id);
    setShowDebtForm(true);
  };

  const handleSubmitDebt = () => {
    const valor = parseFloat(String(debtForm.amount).replace(",", "."));
    if (!debtForm.person.trim()) { setDebtError("Informe a pessoa ou instituição."); return; }
    if (!valor || valor <= 0) { setDebtError("Informe um valor maior que zero."); return; }
    const juros = parseFloat(String(debtForm.interestRate).replace(",", ".")) || 0;
    if (editingDebtId) {
      setDebts((prev) => prev.map((d) => (d.id === editingDebtId ? { ...d, ...debtForm, person: debtForm.person.trim(), amount: valor, interestRate: juros } : d)));
    } else {
      setDebts((prev) => [...prev, { id: uid(), ...debtForm, person: debtForm.person.trim(), amount: valor, interestRate: juros, paid: 0, settled: false, createdBy: currentUserEmail }]);
    }
    setShowDebtForm(false);
    resetDebtForm();
  };

  const handleDeleteDebt = (d) => setDebts((prev) => prev.filter((x) => x.id !== d.id));

  const handleDebtPayment = (debtId, valor, gerarLancamento, categoria, conta) => {
    const divida = debts.find((d) => d.id === debtId);
    setDebts((prev) => prev.map((d) => {
      if (d.id !== debtId) return d;
      const novoPago = Math.max(0, Math.min(d.amount, (d.paid || 0) + valor));
      return { ...d, paid: novoPago, settled: novoPago >= d.amount };
    }));

    // Quem emprestou recebe de volta (receita); quem devia, paga (despesa).
    if (gerarLancamento && divida && categoria) {
      const ehRecebimento = divida.direction === "emprestei";
      setTransactions((prev) => [...prev, {
        id: uid(),
        description: ehRecebimento ? `Recebido de ${divida.person}` : `Pago a ${divida.person}`,
        amount: valor, date: todayISO(),
        type: ehRecebimento ? "receita" : "despesa",
        category: categoria, account: conta || "", status: "pago",
        debtId, createdBy: currentUserEmail,
      }]);
      setToast({ message: "Acerto registrado e lançado na sua conta." });
    }
  };

  const handleToggleSettled = (d) => {
    setDebts((prev) => prev.map((x) => (x.id === d.id ? { ...x, settled: !x.settled, paid: !x.settled ? x.amount : x.paid } : x)));
  };

  const handleDeleteInstallmentGroup = (t) => {
    if (!t.installmentGroupId) return;
    const doGrupo = transactions.filter((x) => x.installmentGroupId === t.installmentGroupId);
    if (!window.confirm(`Excluir todas as ${doGrupo.length} parcelas de "${t.description.replace(/ \(\d+\/\d+\)$/, "")}"?`)) return;
    const avisar = avisarComDesfazer(`${doGrupo.length} parcelas excluídas.`);
    setTransactions((prev) => prev.filter((x) => x.installmentGroupId !== t.installmentGroupId));
    avisar();
  };

  const handleBulkDelete = () => {
    if (selecionados.length === 0) return;
    if (!window.confirm(`Excluir ${selecionados.length} lançamento${selecionados.length !== 1 ? "s" : ""}?`)) return;
    const ids = new Set(selecionados);
    const avisar = avisarComDesfazer(`${ids.size} lançamento${ids.size !== 1 ? "s" : ""} excluído${ids.size !== 1 ? "s" : ""}.`);
    setTransactions((prev) => prev.filter((t) => !ids.has(t.id)));
    setSelecionados([]);
    avisar();
  };

  const handleBulkCategory = (categoriaId) => {
    if (selecionados.length === 0 || !categoriaId) return;
    const ids = new Set(selecionados);
    const avisar = avisarComDesfazer(`Categoria aplicada a ${ids.size} lançamento${ids.size !== 1 ? "s" : ""}.`);
    setTransactions((prev) => prev.map((t) => (ids.has(t.id) && t.type !== "transferencia" ? { ...t, category: categoriaId } : t)));
    setSelecionados([]);
    avisar();
  };

  const handleBulkAccount = (contaId) => {
    if (selecionados.length === 0) return;
    const ids = new Set(selecionados);
    const avisar = avisarComDesfazer(`Conta aplicada a ${ids.size} lançamento${ids.size !== 1 ? "s" : ""}.`);
    setTransactions((prev) => prev.map((t) => (ids.has(t.id) ? { ...t, account: contaId } : t)));
    setSelecionados([]);
    avisar();
  };

  const handleBulkPaid = (novoStatus) => {
    if (selecionados.length === 0) return;
    const ids = new Set(selecionados);
    const avisar = avisarComDesfazer(`${ids.size} lançamento${ids.size !== 1 ? "s" : ""} marcado${ids.size !== 1 ? "s" : ""} como ${novoStatus}.`);
    setTransactions((prev) => prev.map((t) => (ids.has(t.id) ? { ...t, status: novoStatus } : t)));
    setSelecionados([]);
    avisar();
  };

  const toggleSelecionado = (id) => {
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const filtrosAtivos = typeFilter !== "todos" || categoryFilter !== "todas" || accountFilter !== "todas" || search.trim() !== "";

  const limparFiltros = () => {
    setTypeFilter("todos"); setCategoryFilter("todas"); setAccountFilter("todas"); setSearch("");
  };

  const handleTogglePaid = (t) => {
    setTransactions((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: x.status === "pago" ? "pendente" : "pago" } : x)));
  };

  const handleDelete = (t) => {
    setTransactions((prev) => prev.filter((x) => x.id !== t.id));
    setToast({ message: `Lançamento "${t.description}" excluído.`, item: t });
  };

  const handleUndo = () => {
    // Ações em massa guardam a lista inteira anterior; a individual guarda só o item.
    if (toast?.snapshot) setTransactions(toast.snapshot);
    else if (toast?.item) setTransactions((prev) => [...prev, toast.item]);
    setToast(null);
  };

  // Atalho para ações que mexem em vários lançamentos de uma vez.
  const avisarComDesfazer = (message) => {
    const anterior = transactions;
    return () => setToast({ message, snapshot: anterior });
  };

  const irParaHoje = () => setRefDate(new Date());

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

  const handleSortCategories = (tipo) => {
    const ordenadas = [...categoriesByType[tipo]]
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
      .map((c) => c.id);
    setCategoryOrder((prev) => ({ ...prev, [tipo]: ordenadas }));
  };

  const handleMoveCategory = (tipo, id, direcao) => {
    const atual = categoriesByType[tipo].map((c) => c.id);
    const idx = atual.indexOf(id);
    const alvo = idx + direcao;
    if (idx < 0 || alvo < 0 || alvo >= atual.length) return;
    [atual[idx], atual[alvo]] = [atual[alvo], atual[idx]];
    setCategoryOrder((prev) => ({ ...prev, [tipo]: atual }));
  };

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
    const ehCartao = bankForm.kind === "cartao";
    setCustomBanks((prev) => [...prev, {
      id: `banco_${uid()}`, label, color: bankForm.color,
      initialBalance: ehCartao ? 0 : inicial,
      kind: bankForm.kind,
      closingDay: ehCartao ? (parseInt(bankForm.closingDay, 10) || null) : null,
      dueDay: ehCartao ? (parseInt(bankForm.dueDay, 10) || null) : null,
    }]);
    setBankForm({ label: "", color: COLOR_PALETTE[0], initialBalance: "", kind: "conta", closingDay: "", dueDay: "" });
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

  const handleAdjustSavingsBalance = (boxId, novoSaldo) => {
    const box = savingsAccounts.find((s) => s.id === boxId);
    if (!box) return;
    const delta = Math.round((novoSaldo - box.currentAmount) * 100) / 100;
    if (delta === 0) return;
    setSavingsAccounts((prev) => prev.map((s) => (s.id === boxId ? {
      ...s,
      currentAmount: Math.max(0, novoSaldo),
      history: [...(s.history || []), {
        id: uid(), date: todayISO(), amount: delta,
        note: delta > 0 ? "rendimento / ajuste" : "ajuste de saldo",
        ajuste: true,
      }],
    } : s)));
  };

  const handleUpdateSavingsBox = (id, patch) => {
    setSavingsAccounts((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const handleArchiveSavings = (id) => {
    setSavingsAccounts((prev) => prev.map((s) => (s.id === id ? { ...s, archived: !s.archived } : s)));
  };

  const handleMoveSavings = (id, direcao) => {
    setSavingsAccounts((prev) => {
      const ativas = prev.filter((s) => !s.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const idx = ativas.findIndex((s) => s.id === id);
      const alvo = idx + direcao;
      if (idx < 0 || alvo < 0 || alvo >= ativas.length) return prev;
      [ativas[idx], ativas[alvo]] = [ativas[alvo], ativas[idx]];
      const novaOrdem = {};
      ativas.forEach((s, i) => { novaOrdem[s.id] = i; });
      return prev.map((s) => (novaOrdem[s.id] !== undefined ? { ...s, order: novaOrdem[s.id] } : s));
    });
  };

  const handleTransferSavings = (origemId, destinoId, valor) => {
    if (!origemId || !destinoId || origemId === destinoId || !valor || valor <= 0) return;
    const hoje = todayISO();
    const origem = savingsAccounts.find((s) => s.id === origemId);
    const destino = savingsAccounts.find((s) => s.id === destinoId);
    if (!origem || !destino) return;
    const real = Math.min(valor, origem.currentAmount);
    if (real <= 0) return;
    setSavingsAccounts((prev) => prev.map((s) => {
      if (s.id === origemId) {
        return { ...s, currentAmount: s.currentAmount - real,
          history: [...(s.history || []), { id: uid(), date: hoje, amount: -real, note: `para ${destino.label}` }] };
      }
      if (s.id === destinoId) {
        return { ...s, currentAmount: s.currentAmount + real,
          history: [...(s.history || []), { id: uid(), date: hoje, amount: real, note: `de ${origem.label}` }] };
      }
      return s;
    }));
    setToast({ message: `${formatCurrency(real)} movido de "${origem.label}" para "${destino.label}".` });
  };

  const handleAddSavingsAccount = () => {
    const label = savingsForm.label.trim();
    if (!label) { setSavingsError("Dê um nome para a categoria."); return; }
    if (savingsAccounts.some((s) => s.label.toLowerCase() === label.toLowerCase())) { setSavingsError("Já existe uma categoria de poupança com esse nome."); return; }
    setSavingsAccounts((prev) => [...prev, { id: uid(), label, color: savingsForm.color, currentAmount: 0, history: [], targetAmount: null, deadline: "", monthlyPlan: null, archived: false, order: prev.length }]);
    setSavingsForm({ label: "", color: COLOR_PALETTE[0] });
    setSavingsError("");
  };

  const handleDeleteSavingsAccount = (account) => {
    setSavingsAccounts((prev) => prev.filter((s) => s.id !== account.id));
  };

  const handleContributeSavings = (boxId, delta, contaId) => {
    const box = savingsAccounts.find((s) => s.id === boxId);
    const hoje = todayISO();
    const txId = contaId ? uid() : null;
    const conta = contaId ? findBank(contaId) : null;

    setSavingsAccounts((prev) => prev.map((s) => (s.id === boxId ? {
      ...s,
      currentAmount: Math.max(0, s.currentAmount + delta),
      history: [...(s.history || []), {
        id: uid(), date: hoje, amount: delta, txId,
        note: conta ? (delta > 0 ? `de ${conta.label}` : `para ${conta.label}`) : undefined,
      }],
    } : s)));

    // Se veio de (ou voltou para) uma conta, o dinheiro precisa sair/entrar de verdade
    if (contaId && box) {
      const guardando = delta > 0;
      setTransactions((prev) => [...prev, {
        id: txId,
        description: guardando ? `Guardado em ${box.label}` : `Resgatado de ${box.label}`,
        amount: Math.abs(delta), date: hoje, type: "transferencia", category: "",
        account: guardando ? contaId : "",
        toAccount: guardando ? "" : contaId,
        toBox: guardando ? boxId : "",
        fromBox: guardando ? "" : boxId,
        status: "pago", createdBy: currentUserEmail,
      }]);
    }
  };

  const handleDeleteSavingsHistoryEntry = (accountId, entryId) => {
    const box = savingsAccounts.find((s) => s.id === accountId);
    const alvo = box && (box.history || []).find((h) => h.id === entryId);
    if (alvo && alvo.txId) {
      setTransactions((prev) => prev.filter((t) => t.id !== alvo.txId));
    }
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
        ordem_categorias: categoryOrder,
        bancos_personalizados: customBanks,
        bancos_padrao_ocultos: hiddenDefaultBanks,
        contas_fixas: fixedBills,
        orcamentos: budgets,
        poupanca: savingsAccounts,
        dividas: debts,
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
        if (d.ordem_categorias) setCategoryOrder(d.ordem_categorias);
        if (d.bancos_personalizados) setCustomBanks(d.bancos_personalizados);
        if (d.bancos_padrao_ocultos) setHiddenDefaultBanks(d.bancos_padrao_ocultos);
        if (d.contas_fixas) setFixedBills(d.contas_fixas);
        if (d.orcamentos) setBudgets(d.orcamentos);
        if (d.poupanca) setSavingsAccounts(d.poupanca);
        if (d.dividas) setDebts(d.dividas);
        if (d.tema_cores) setTheme(d.tema_cores);
        setBackupMessage({ type: "success", text: "Backup importado com sucesso!" });
      } catch (err) {
        setBackupMessage({ type: "error", text: "Arquivo inválido. Verifique se é um backup do Razão (.json)." });
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmCsvImport = (rows, account, status) => {
    const newTxs = rows.map((r) => ({
      id: uid(), description: r.description, amount: r.amount, date: r.date, type: r.type,
      category: r.category,
      account, status: status || "pago", createdBy: currentUserEmail,
    }));
    const avisar = avisarComDesfazer(`${newTxs.length} lançamento${newTxs.length !== 1 ? "s" : ""} importado${newTxs.length !== 1 ? "s" : ""} com sucesso.`);
    setTransactions((prev) => [...prev, ...newTxs]);
    setShowCsvImport(false);
    avisar();
  };

  const handleAddBudget = () => {
    const ehConta = budgetForm.kind === "conta";
    const alvo = ehConta ? budgetForm.accountId : budgetForm.categoryId;
    if (!alvo) { setBudgetError(ehConta ? "Selecione uma conta ou cartão." : "Selecione uma categoria."); return; }
    const limitNum = parseFloat(String(budgetForm.limit).replace(",", "."));
    if (!limitNum || limitNum <= 0) { setBudgetError("Informe um limite maior que zero."); return; }
    const jaExiste = budgets.some((b) => (ehConta ? b.kind === "conta" && b.accountId === alvo : b.kind !== "conta" && b.categoryId === alvo));
    if (jaExiste) { setBudgetError(ehConta ? "Essa conta já tem um orçamento definido." : "Essa categoria já tem um orçamento definido."); return; }
    setBudgets((prev) => [...prev, ehConta
      ? { id: uid(), kind: "conta", accountId: alvo, limit: limitNum }
      : { id: uid(), kind: "categoria", categoryId: alvo, limit: limitNum }]);
    setBudgetForm({ kind: budgetForm.kind, categoryId: "", accountId: "", limit: "" });
    setBudgetError("");
  };

  const handleUpdateBudgetLimit = (budgetId, newLimit) => {
    setBudgets((prev) => prev.map((b) => (b.id === budgetId ? { ...b, limit: newLimit } : b)));
  };

  const handleToggleRollover = (budgetId) => {
    setBudgets((prev) => prev.map((b) => (b.id === budgetId ? { ...b, rollover: !b.rollover } : b)));
  };

  const handleDeleteBudget = (budget) => {
    setBudgets((prev) => prev.filter((b) => b.id !== budget.id));
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
          <button className="md:hidden rz-focus" onClick={() => setMobileNavOpen((v) => !v)} aria-label="Abrir menu" title="Abrir menu">
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
            totals={totalsPeriodo}
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
            cardIds={cardIds}
            irParaHoje={irParaHoje}
          />
        ) : activeTab === "dividas" ? (
          <DividasTab
            debts={debts}
            debtForm={debtForm}
            setDebtForm={setDebtForm}
            showDebtForm={showDebtForm}
            editingDebtId={editingDebtId}
            debtError={debtError}
            onOpenNew={openNewDebtForm}
            onOpenEdit={openEditDebtForm}
            onSubmit={handleSubmitDebt}
            onDelete={handleDeleteDebt}
            onCancelForm={() => { setShowDebtForm(false); resetDebtForm(); }}
            onPayment={handleDebtPayment}
            onToggleSettled={handleToggleSettled}
            categoriesByType={categoriesByType}
            banksList={banksList}
          />
        ) : activeTab === "carteira" ? (
          <CarteiraTab
            transactions={transactions}
            banksList={banksList}
            setActiveTab={setActiveTab}
            refDate={refDate}
            shiftMonth={shiftMonth}
            findCategory={findCategory}
          />
        ) : activeTab === "poupanca" ? (
          <CaixinhasTab
            boxes={savingsAccounts}
            savingsForm={savingsForm}
            setSavingsForm={setSavingsForm}
            savingsError={savingsError}
            onAdd={handleAddSavingsAccount}
            onDelete={handleDeleteSavingsAccount}
            onContribute={handleContributeSavings}
            onDeleteHistoryEntry={handleDeleteSavingsHistoryEntry}
            onUpdate={handleUpdateSavingsBox}
            onArchive={handleArchiveSavings}
            onMove={handleMoveSavings}
            onTransfer={handleTransferSavings}
            onAdjust={handleAdjustSavingsBalance}
            banksList={banksList}
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
            onSortCategories={handleSortCategories}
            onMoveCategory={handleMoveCategory}
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
          <ReportsTab
            transactions={transactions}
            findCategory={findCategory}
            fixedBills={fixedBills}
            savingsAccounts={savingsAccounts}
            saldosIniciais={saldosIniciais}
            cardIds={cardIds}
            budgets={budgets}
            categoriesByType={categoriesByType}
            banksList={banksList}
            findBank={findBank}
            cardIds={cardIds}
          />
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
            onToggleRollover={handleToggleRollover}
            transactions={transactions}
            banksList={banksList}
            findBank={findBank}
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

            <PeriodNavigator periodMode={periodMode} refDate={refDate} shiftMonth={shiftMonth} setPeriodMode={setPeriodMode} onHoje={irParaHoje} />

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {typeFilter === "transferencia" ? (
                <>
                  <SummaryCard label="Total movimentado" value={totals.transferido} icon={Repeat} tone="emerald" />
                  <div className="rz-card p-4 flex items-center justify-between gap-2 sm:col-span-2">
                    <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                      Transferências movem dinheiro entre seus próprios lugares — não entram como receita nem despesa.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <SummaryCard label="Receitas" value={totals.receitas} icon={TrendingUp} tone="emerald" />
                  <SummaryCard label="Despesas" value={totals.despesas} icon={TrendingDown} tone="brick" />
                  <SummaryCard label="Saldo do período" value={totals.saldo} icon={Scale} tone={totals.saldo >= 0 ? "emerald" : "brick"} />
                </>
              )}
            </div>

            {/* Busca e filtros */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-2">
              <div className="rz-card flex items-center gap-2 px-3 py-2 flex-1 sm:min-w-[220px]">
                <Search size={15} style={{ color: "var(--ink-soft)" }} />
                <input
                  className="flex-1 outline-none text-sm min-w-0"
                  style={{ background: "transparent", color: "var(--ink)" }}
                  placeholder="Buscar por descrição ou valor…"
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
              <select
                className="rz-input text-sm sm:w-auto disabled:opacity-40"
                value={categoryFilter}
                disabled={typeFilter === "transferencia"}
                title={typeFilter === "transferencia" ? "Transferências não têm categoria" : undefined}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="todas">{typeFilter === "transferencia" ? "Sem categoria" : "Todas as categorias"}</option>
                {typeFilter !== "transferencia" && (typeFilter === "todos"
                  ? [...categoriesByType.receita, ...categoriesByType.despesa]
                  : categoriesByType[typeFilter]).map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <select className="rz-input text-sm sm:w-auto" value={sortBy} onChange={(e) => setSortBy(e.target.value)} title="Ordenar a lista">
                <option value="data-desc">Mais recentes primeiro</option>
                <option value="data-asc">Mais antigos primeiro</option>
                <option value="valor-desc">Maior valor primeiro</option>
                <option value="valor-asc">Menor valor primeiro</option>
              </select>
              <select className="rz-input text-sm sm:w-auto" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                <option value="todas">Todas as contas</option>
                <option value="sem">Sem conta definida</option>
                {banksList.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                {visibleTransactions.length} lançamento{visibleTransactions.length !== 1 ? "s" : ""}
                {visibleTransactions.length !== periodFiltered.length && ` de ${periodFiltered.length} no período`}
              </span>
              {filtrosAtivos && (
                <button onClick={limparFiltros} className="rz-focus text-xs flex items-center gap-1" style={{ color: "var(--emerald)" }} title="Voltar a mostrar tudo">
                  <X size={12} /> Limpar filtros
                </button>
              )}
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

            {selecionados.length > 0 && (
              <div className="rz-card p-3 mb-4 flex items-center gap-2 flex-wrap" style={{ borderColor: "var(--emerald)" }}>
                <span className="text-sm font-medium">{selecionados.length} selecionado{selecionados.length !== 1 ? "s" : ""}</span>
                <select className="rz-input rz-focus text-xs" style={{ width: "auto" }} value="" onChange={(e) => { if (e.target.value) handleBulkCategory(e.target.value); }}>
                  <option value="">Mudar categoria…</option>
                  {[...categoriesByType.receita, ...categoriesByType.despesa].map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <select className="rz-input rz-focus text-xs" style={{ width: "auto" }} value="" onChange={(e) => { if (e.target.value) handleBulkAccount(e.target.value === "__nenhuma__" ? "" : e.target.value); }}>
                  <option value="">Mudar conta…</option>
                  <option value="__nenhuma__">Nenhuma (limpar)</option>
                  {banksList.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
                <button onClick={() => handleBulkPaid("pago")} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3">Marcar pago</button>
                <button onClick={() => handleBulkPaid("pendente")} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3">Marcar pendente</button>
                <button onClick={handleBulkDelete} className="rz-btn-ghost rz-focus text-xs !py-1.5 !px-3" style={{ color: "var(--brick)", borderColor: "var(--brick)" }}>Excluir</button>
                <button onClick={() => setSelecionados([])} className="rz-focus text-xs ml-auto" style={{ color: "var(--ink-soft)" }}>Limpar seleção</button>
              </div>
            )}

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
                categoryMemory={categoryMemory}
                chavesExistentes={chavesExistentes}
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
                {transactions.length === 0 ? (
                  <button onClick={openNewForm} className="rz-btn-primary rz-focus text-sm inline-flex items-center gap-2">
                    <Plus size={16} /> Adicionar lançamento
                  </button>
                ) : filtrosAtivos ? (
                  <button onClick={limparFiltros} className="rz-btn-primary rz-focus text-sm inline-flex items-center gap-2">
                    <X size={16} /> Limpar filtros
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="rz-card overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2" style={{ background: "var(--paper-alt)" }}>
                  <button
                    onClick={() => setSelecionados(selecionados.length === visibleTransactions.length ? [] : visibleTransactions.map((t) => t.id))}
                    className="rz-focus flex items-center gap-2 text-xs"
                    style={{ color: "var(--ink-soft)" }}
                    title="Selecionar todos os lançamentos visíveis"
                  >
                    <span style={{
                      width: 14, height: 14, borderRadius: 3, border: "1.5px solid var(--line)",
                      background: selecionados.length === visibleTransactions.length && visibleTransactions.length > 0 ? "var(--ink)" : "var(--surface)",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      {selecionados.length === visibleTransactions.length && visibleTransactions.length > 0 && <Check size={10} color="var(--paper)" />}
                    </span>
                    Selecionar todos
                  </button>
                </div>
                {visibleTransactions.map((t, i) => {
                  const ehTransf = t.type === "transferencia";
                  const cat = ehTransf ? { label: "Transferência", color: "var(--ink-soft)" } : findCategory(t.type, t.category);
                  const bank = t.account ? findBank(t.account) : null;
                  // Transferência pode envolver contas (account/toAccount) ou
                  // caixinhas (fromBox/toBox) — resolve o nome nos dois casos.
                  const nomeLugar = (contaId, boxId) => {
                    if (contaId) return findBank(contaId)?.label || "conta";
                    if (boxId) return savingsAccounts.find((b) => b.id === boxId)?.label || "caixinha";
                    return "?";
                  };
                  const subtitulo = ehTransf
                    ? `${nomeLugar(t.account, t.fromBox)} → ${nomeLugar(t.toAccount, t.toBox)}`
                    : `${cat.label}${bank ? ` · ${bank.label}` : ""}`;
                  const corValor = ehTransf ? "var(--ink-soft)" : (t.type === "receita" ? "var(--emerald)" : "var(--brick)");
                  const selecionado = selecionados.includes(t.id);
                  const ehFuturo = t.date > todayISO();
                  const futuroTag = ehFuturo ? (
                    <span className="rz-mono text-[9px] px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--gold-soft)", color: "var(--gold)" }} title="Data ainda não chegou">
                      FUTURO
                    </span>
                  ) : null;
                  const checkbox = (
                    <button
                      onClick={() => toggleSelecionado(t.id)}
                      className="rz-focus shrink-0"
                      aria-label="Selecionar lançamento" title="Selecionar"
                      style={{
                        width: 15, height: 15, borderRadius: 3, border: "1.5px solid var(--line)",
                        background: selecionado ? "var(--ink)" : "var(--surface)",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {selecionado && <Check size={11} color="var(--paper)" />}
                    </button>
                  );
                  const parcelaTag = t.installmentTotal ? (
                    <span className="rz-mono text-[9px] px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--paper-alt)", color: "var(--ink-soft)" }}>
                      {t.installmentIndex}/{t.installmentTotal}
                    </span>
                  ) : null;
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
                      <button onClick={() => handleDuplicate(t)} className="rz-focus p-1.5 rounded-md" aria-label="Duplicar" title="Duplicar lançamento" style={{ color: "var(--ink-soft)" }}>
                        <Copy size={15} />
                      </button>
                      <button onClick={() => openEditForm(t)} className="rz-focus p-1.5 rounded-md" aria-label="Editar" title="Editar lançamento" style={{ color: "var(--ink-soft)" }}>
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(t)} className="rz-focus p-1.5 rounded-md" aria-label="Excluir" title={t.installmentTotal ? "Excluir só esta parcela" : "Excluir"} style={{ color: "var(--ink-soft)" }}>
                        <Trash2 size={15} />
                      </button>
                      <div className="w-7 shrink-0 flex justify-center">
                        {t.installmentGroupId && (
                          <button onClick={() => handleDeleteInstallmentGroup(t)} className="rz-focus p-1.5 rounded-md" aria-label="Excluir todas as parcelas" title={`Excluir todas as ${t.installmentTotal} parcelas`} style={{ color: "var(--brick)" }}>
                            <Layers size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  );

                  const anterior = i > 0 ? visibleTransactions[i - 1] : null;
                  const mostrarSeparador = sortBy.startsWith("data") && (!anterior || anterior.date !== t.date);

                  return (
                    <div key={t.id} style={{ borderTop: i === 0 || mostrarSeparador ? "none" : "1px solid var(--line)" }}>
                      {mostrarSeparador && (
                        <div className="px-4 py-1.5 flex items-center justify-between gap-2" style={{ background: "var(--paper-alt)", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                          <span className="rz-mono text-[11px]" style={{ color: "var(--ink-soft)" }}>
                            {formatDateBR(t.date)}
                            {t.date === todayISO() && <span style={{ color: "var(--emerald)" }}> · hoje</span>}
                          </span>
                          <span className="rz-mono text-[11px]" style={{ color: "var(--ink-soft)" }}>
                            {(() => {
                              const doDia = visibleTransactions.filter((x) => x.date === t.date && x.type !== "transferencia");
                              const liquido = doDia.reduce((s, x) => s + (x.type === "receita" ? x.amount : -x.amount), 0);
                              return liquido === 0 ? "" : formatCurrency(liquido);
                            })()}
                          </span>
                        </div>
                      )}
                      {/* Mobile layout */}
                      <div className="flex flex-col gap-2 px-4 py-3 sm:hidden">
                        <div className="flex items-center gap-2 min-w-0">
                          {checkbox}
                          <span className="rz-dot" style={{ background: cat.color }} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm font-medium truncate">{t.installmentTotal ? t.description.replace(/ \(\d+\/\d+\)$/, "") : t.description}</span>
                              {parcelaTag}
                              {futuroTag}
                            </div>
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
                        {checkbox}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="rz-dot" style={{ background: cat.color }} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm font-medium truncate">{t.installmentTotal ? t.description.replace(/ \(\d+\/\d+\)$/, "") : t.description}</span>
                              {parcelaTag}
                              {futuroTag}
                            </div>
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
              <button onClick={() => { setShowForm(false); resetForm(); }} className="rz-focus" style={{ color: "var(--ink-soft)" }} aria-label="Fechar" title="Fechar sem salvar">
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
                    <button type="button" onClick={handleRemoveAttachment} className="rz-focus p-1.5 rounded-md shrink-0" aria-label="Remover anexo" title="Remover este anexo" style={{ color: "var(--brick)" }}>
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

              {editingId && (() => {
                const orig = transactions.find((t) => t.id === editingId);
                if (!orig?.installmentGroupId) return null;
                return (
                  <div>
                    <button
                      type="button"
                      onClick={() => setAplicarNasParcelas((v) => !v)}
                      className="rz-focus flex items-center gap-2 text-sm"
                    >
                      <span style={{
                        width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--line)",
                        background: aplicarNasParcelas ? "var(--ink)" : "var(--surface)",
                        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        {aplicarNasParcelas && <Check size={12} color="var(--paper)" />}
                      </span>
                      Aplicar às {orig.installmentTotal} parcelas
                    </button>
                    <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
                      Muda categoria e conta em todas. Descrição, valor e data continuam individuais.
                    </p>
                  </div>
                );
              })()}

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

      {/* ---------------- Lançamento rápido (celular) ---------------- */}
      {!showForm && !showQuickAdd && (
        <button
          onClick={() => { setQuickError(""); setShowQuickAdd(true); }}
          className="rz-focus md:hidden fixed z-40 rounded-full shadow-lg flex items-center justify-center"
          style={{ bottom: 20, right: 20, width: 56, height: 56, background: "var(--ink)", color: "var(--paper)" }}
          aria-label="Lançamento rápido" title="Lançamento rápido"
        >
          <Plus size={26} />
        </button>
      )}

      {showQuickAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: "rgba(30,43,35,0.45)" }}>
          <div className="rz-card w-full sm:max-w-sm p-5" style={{ borderRadius: "14px 14px 0 0" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="rz-display text-xl">Lançamento rápido</h2>
              <button onClick={() => setShowQuickAdd(false)} className="rz-focus" style={{ color: "var(--ink-soft)" }} aria-label="Fechar" title="Fechar sem salvar">
                <X size={20} />
              </button>
            </div>

            <div className="rz-toggle mb-4">
              <button onClick={() => setQuickForm({ ...quickForm, type: "receita", category: "" })} className={quickForm.type === "receita" ? "receita-on" : "off"}>Receita</button>
              <button onClick={() => setQuickForm({ ...quickForm, type: "despesa", category: "" })} className={quickForm.type === "despesa" ? "despesa-on" : "off"}>Despesa</button>
            </div>

            <input
              className="rz-input rz-focus rz-mono mb-3"
              style={{ fontSize: "1.5rem", textAlign: "center", padding: "12px" }}
              inputMode="decimal"
              placeholder="0,00"
              autoFocus
              value={quickForm.amount}
              onChange={(e) => setQuickForm({ ...quickForm, amount: e.target.value })}
            />

            <div className="flex flex-wrap gap-2 mb-3">
              {categoriesByType[quickForm.type].slice(0, 8).map((c) => {
                const ativo = quickForm.category === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setQuickForm({ ...quickForm, category: c.id })}
                    className="rz-focus text-xs px-3 py-2 rounded-full flex items-center gap-1.5"
                    style={ativo
                      ? { background: c.color, color: "#fff" }
                      : { background: "var(--surface)", color: "var(--ink-soft)", border: "1px solid var(--line)" }}
                  >
                    <span className="rz-dot" style={{ background: ativo ? "#fff" : c.color }} />
                    {c.label}
                  </button>
                );
              })}
            </div>

            <input
              className="rz-input rz-focus mb-3 text-sm"
              placeholder="Descrição (opcional)"
              value={quickForm.description}
              onChange={(e) => setQuickForm({ ...quickForm, description: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleQuickAdd()}
            />

            {quickError && <div className="text-xs mb-3" style={{ color: "var(--brick)" }}>{quickError}</div>}

            <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
              Salva com a data de hoje, como pago. Dá pra ajustar depois em Lançamentos.
            </p>

            <button onClick={handleQuickAdd} className="rz-btn-primary rz-focus w-full text-sm flex items-center justify-center gap-2">
              <Check size={16} /> Registrar
            </button>
          </div>
        </div>
      )}


      {/* ---------------- Toast ---------------- */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg max-w-[90vw]" style={{ background: toast.tone === "warning" ? "var(--brick)" : "var(--ink)", color: "var(--paper)" }}>
            <span className="text-sm">{toast.message}</span>
            {(toast.item || toast.snapshot) && (
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
