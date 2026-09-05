// Merge de três vias para as listas do app.
//
// POR QUE ISTO EXISTE
// -------------------
// Cada bloco de dados (lancamentos, contas_fixas, poupanca...) é UMA linha no
// Supabase, com o array inteiro serializado no `value`. Enquanto a gravação foi
// "manda o array que está na memória", duas pessoas na mesma família se
// atropelavam em silêncio:
//
//   Você abre o app às 8h. Sua esposa lança 12 gastos pelo celular durante o
//   dia. Às 18h você marca um lançamento como pago — e o app grava o array que
//   está na sua memória desde as 8h. Os 12 lançamentos dela somem, sem erro.
//
// O storage.js agora recusa a escrita quando a linha mudou desde que a lemos.
// Recusar sozinho não basta: alguém tem que decidir o que fica. É aqui.
//
// COMO DECIDE
// -----------
// Três versões da lista: `base` (como estava quando sincronizamos pela última
// vez), `local` (o que está na tela agora) e `remoto` (o que o outro gravou).
// Comparando cada item contra a base dá para saber QUEM mexeu em quê, em vez de
// escolher um lado inteiro no chute.
//
// Quando os dois mexeram no mesmo item, o local vence: quem está com o app
// aberto acabou de agir e vê o resultado; o outro lado já foi embora.
//
// Exclusão perde para edição, de propósito. Se um apagou e o outro editou, o
// item volta. É recuperável (basta apagar de novo, agora vendo a edição);
// o contrário não é.
export function mesclarPorId(base, local, remoto, chave = "id") {
  const mapa = (lista) => {
    const m = new Map();
    (Array.isArray(lista) ? lista : []).forEach((item) => {
      const id = item && item[chave];
      if (id !== undefined && id !== null) m.set(id, item);
    });
    return m;
  };

  const mBase = mapa(base);
  const mLocal = mapa(local);
  const mRemoto = mapa(remoto);

  // Comparação por conteúdo. Ordem de chave diferente faria dois objetos iguais
  // parecerem distintos — o item só seria marcado como "mexido", e mexido
  // empata para o local. Erra para o lado seguro.
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const resultado = [];
  const jaColocado = new Set();

  const decidir = (id) => {
    const b = mBase.get(id);
    const l = mLocal.get(id);
    const r = mRemoto.get(id);
    const naBase = mBase.has(id);

    if (l && r) {
      // Nos dois lados: fica o que mudou; mudando os dois, fica o local.
      if (naBase && igual(l, b)) return r;   // só o remoto mexeu
      return l;
    }
    if (l && !r) {
      if (!naBase) return l;                 // o local acabou de criar
      return igual(l, b) ? null : l;         // remoto excluiu: some, a menos que o local tenha editado
    }
    if (!l && r) {
      if (!naBase) return r;                 // o remoto acabou de criar
      return igual(r, b) ? null : r;         // local excluiu: some, a menos que o remoto tenha editado
    }
    return null;
  };

  // A ordem do remoto primeiro, e depois o que só existe no local. Assim a
  // lista não embaralha para quem estava com ela aberta do outro lado.
  const empurrar = (id) => {
    if (jaColocado.has(id)) return;
    jaColocado.add(id);
    const escolhido = decidir(id);
    if (escolhido) resultado.push(escolhido);
  };

  mRemoto.forEach((_, id) => empurrar(id));
  mLocal.forEach((_, id) => empurrar(id));

  return resultado;
}

// Para as chaves que não são lista de objetos com id — ordem das categorias,
// padrões ocultos, filtros, tema. São preferências: o último a mexer manda, e
// não vale a complexidade de mesclar. O ganho de versionar essas é só não
// escrever por cima sem saber.
export function manterLocal(base, local) {
  return local;
}
