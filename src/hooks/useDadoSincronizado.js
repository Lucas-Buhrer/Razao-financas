import { useCallback, useEffect, useRef, useState } from "react";
import { storage, ConflitoDeVersao } from "../storage";

/* ---------------------------------------------------------------------------
   Um bloco de dados do app (lancamentos, contas_fixas, poupanca...) preso a uma
   chave do Supabase, com carregamento, gravacao e resolucao de conflito.

   Substitui os pares de useEffect "carrega no inicio / salva a cada mudanca"
   que existiam um para cada chave. Alem de encurtar, muda tres coisas:

   1. GRAVACAO VERSIONADA. A escrita so passa se a linha ainda estiver como
      estava quando a lemos. Antes, quem gravasse por ultimo apagava o trabalho
      do outro em silencio — o caso classico e a aba aberta desde de manha que,
      num clique a tarde, devolve o array das 8h por cima do dia inteiro.

   2. CONFLITO SE RESOLVE, NAO SO SE DETECTA. Batendo o que esta na tela contra
      a base sincronizada e contra o que veio do servidor, da para saber quem
      mexeu em que e ficar com os dois lados (ver lib/merge.js).

   3. FALHA DE LEITURA NAO VIRA LISTA VAZIA. Antes, um erro de rede no
      carregamento caia num catch que fazia setTransactions([]) e marcava como
      carregado — e a primeira alteracao seguinte gravava esse vazio por cima
      dos dados de verdade. Aqui, sem leitura boa nao existe gravacao: o hook
      fica em estado de erro e quem chama mostra o aviso.

   Devolve [valor, setValor, { carregado, erro, pendente, revalidar }].
--------------------------------------------------------------------------- */

// Uma escuta so de beforeunload para todos os hooks, avisando se alguma coisa
// ainda nao chegou ao servidor. O debounce e curto, mas fechar a aba no meio da
// janela existe — e perder em silencio e o que estamos tentando acabar.
const comPendencia = new Set();
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (comPendencia.size === 0) return;
    e.preventDefault();
    e.returnValue = "";
  });
}

const mesmoConteudo = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function useDadoSincronizado(chave, valorInicial, opcoes = {}) {
  const {
    perUser = false,
    mesclar = null,        // (base, local, remoto) => lista; sem isso, o local manda
    debounceMs = 400,
    revalidarAoFocar = true,
    aoMesclar = null,      // avisa a tela que dados de outra pessoa entraram
  } = opcoes;

  const [valor, setValor] = useState(valorInicial);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState(null);
  const [pendente, setPendente] = useState(false);

  // `versao` e o updated_at que o servidor devolveu; `base` e o conteudo
  // correspondente. Juntos, respondem "o que o banco tinha da ultima vez que eu
  // e ele concordamos" — que e o terceiro lado do merge.
  const versao = useRef(null);
  const base = useRef(valorInicial);
  const valorRef = useRef(valorInicial);
  const carregadoRef = useRef(false);
  const gravando = useRef(false);
  const regravar = useRef(false);
  const ultimaLeitura = useRef(0);
  const tentativas = useRef(0);
  const retentativa = useRef(null);

  // Guardados em ref para nao entrarem nas dependencias dos efeitos: um `[]`
  // literal ou uma arrow inline mudam de identidade a cada render e fariam o
  // efeito de carregar rodar para sempre.
  const iniRef = useRef(valorInicial);
  const mesclarRef = useRef(mesclar);
  const aoMesclarRef = useRef(aoMesclar);
  mesclarRef.current = mesclar;
  aoMesclarRef.current = aoMesclar;

  useEffect(() => { valorRef.current = valor; }, [valor]);
  useEffect(() => { carregadoRef.current = carregado; }, [carregado]);

  // ---------- carregar ----------
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await storage.get(chave, { perUser });
        if (!vivo) return;
        const lido = res && res.value ? JSON.parse(res.value) : iniRef.current;
        versao.current = res ? res.version : null;
        base.current = lido;
        ultimaLeitura.current = Date.now();
        setValor(lido);
        setErro(null);
        setCarregado(true);
      } catch (e) {
        if (!vivo) return;
        // De proposito: NAO marca como carregado. Sem saber o que esta la,
        // qualquer gravacao nossa e destrutiva.
        setErro(e);
      }
    })();
    return () => { vivo = false; };
  }, [chave, perUser]);

  // ---------- gravar ----------
  const gravar = useCallback(async () => {
    const atual = valorRef.current;
    try {
      const res = await storage.set(chave, JSON.stringify(atual), {
        perUser,
        baseVersion: versao.current,
      });
      versao.current = res.version;
      base.current = atual;
      setErro(null);
      return true;
    } catch (e) {
      if (e instanceof ConflitoDeVersao) {
        // Outra pessoa gravou primeiro. Fica com os dois lados e tenta de novo a
        // partir da versao dela — o efeito de gravar dispara sozinho, porque o
        // conteudo mesclado e diferente da nova base.
        const remoto = e.valorRemoto ? JSON.parse(e.valorRemoto) : iniRef.current;
        const baseAnterior = base.current;
        base.current = remoto;
        versao.current = e.versaoRemota;
        setValor((agora) => (mesclarRef.current ? mesclarRef.current(baseAnterior, agora, remoto) : agora));
        if (aoMesclarRef.current) aoMesclarRef.current(chave);
        return true;   // conflito nao e falha: ja foi resolvido e sera regravado
      }
      setErro(e);
      return false;
    }
  }, [chave, perUser]);

  // Uma gravacao por vez na mesma chave. Duas em paralelo partiriam da mesma
  // versao e a segunda cairia em conflito contra a primeira — a nossa propria.
  const enfileirarGravacao = useCallback(async () => {
    if (gravando.current) { regravar.current = true; return; }
    gravando.current = true;
    let deuCerto = false;
    try {
      deuCerto = await gravar();
    } finally {
      gravando.current = false;
      if (regravar.current) {
        regravar.current = false;
        enfileirarGravacao();
      } else if (!deuCerto) {
        // Falha de rede costuma passar sozinha. Sem retentativa, a alteracao
        // ficaria parada ate o usuario mexer em outra coisa — e o unico sinal
        // seria a tarja. Espera crescente ate 32s, e para assim que der certo.
        tentativas.current = Math.min(tentativas.current + 1, 4);
        clearTimeout(retentativa.current);
        retentativa.current = setTimeout(enfileirarGravacao, 4000 * 2 ** (tentativas.current - 1));
      } else {
        tentativas.current = 0;
        if (mesmoConteudo(valorRef.current, base.current)) {
          comPendencia.delete(chave);
          setPendente(false);
        }
      }
    }
  }, [gravar, chave]);

  useEffect(() => {
    if (!carregado) return;
    // Logo depois de carregar, `valor` acabou de virar a base — sem esta saida,
    // todo mundo gravaria de volta o que acabou de ler, a cada abertura do app.
    // Passar por aqui tambem quita a pendencia: um merge que da no mesmo que o
    // remoto nao gera gravacao nenhuma, e sem isto o beforeunload continuaria
    // avisando de uma alteracao que ja esta no servidor.
    if (mesmoConteudo(valor, base.current)) {
      if (comPendencia.has(chave)) { comPendencia.delete(chave); setPendente(false); }
      return;
    }
    comPendencia.add(chave);
    setPendente(true);
    const t = setTimeout(enfileirarGravacao, debounceMs);
    return () => clearTimeout(t);
  }, [valor, carregado, chave, debounceMs, enfileirarGravacao]);

  // ---------- revalidar ----------
  // Voltar para a aba e o momento em que a copia na tela costuma estar mais
  // velha. Traz o que mudou e mescla, sem esperar a proxima gravacao.
  const revalidar = useCallback(async (op) => {
    const forcar = !!(op && op.forcar);
    if (!carregadoRef.current || gravando.current) return;
    if (!forcar && Date.now() - ultimaLeitura.current < 10000) return;
    try {
      const res = await storage.get(chave, { perUser });
      ultimaLeitura.current = Date.now();
      if (!res || res.version === versao.current) return;
      const remoto = res.value ? JSON.parse(res.value) : iniRef.current;
      const baseAnterior = base.current;
      base.current = remoto;
      versao.current = res.version;
      setValor((agora) => (mesclarRef.current ? mesclarRef.current(baseAnterior, agora, remoto) : remoto));
      if (aoMesclarRef.current) aoMesclarRef.current(chave);
    } catch (e) {
      // Revalidar e oportunista: falhou, tenta no proximo foco.
    }
  }, [chave, perUser]);

  useEffect(() => {
    if (!revalidarAoFocar) return;
    const aoVoltar = () => { if (document.visibilityState === "visible") revalidar(); };
    window.addEventListener("focus", aoVoltar);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.removeEventListener("focus", aoVoltar);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [revalidar, revalidarAoFocar]);

  useEffect(() => () => {
    comPendencia.delete(chave);
    clearTimeout(retentativa.current);
  }, [chave]);

  return [valor, setValor, { carregado, erro, pendente, revalidar }];
}
