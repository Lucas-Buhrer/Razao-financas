import { supabase } from "./supabaseClient";

// Este arquivo replica a mesma API do "window.storage" usada nos artifacts do
// Claude (get/set/delete/list), mas agora gravando de verdade no Supabase.
// Os dados são organizados por "família" (household) em vez de por usuário
// individual, para permitir o compartilhamento entre membros da família.

let cachedHouseholdId = null;
let cachedForUserId = null;

export async function getHouseholdId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado.");
  if (cachedHouseholdId && cachedForUserId === user.id) return cachedHouseholdId;

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .single();
  if (error || !data) throw new Error("Não foi possível identificar sua família.");

  cachedHouseholdId = data.household_id;
  cachedForUserId = user.id;
  return cachedHouseholdId;
}

// Chame isso depois de entrar numa nova família (join_household) para que as
// próximas leituras/escritas já usem o household_id atualizado.
export function resetStorageCache() {
  cachedHouseholdId = null;
  cachedForUserId = null;
}

// Algumas preferências são de quem está usando, não da família inteira (o tema,
// por exemplo). Elas continuam na mesma tabela, mas com o id do usuário no fim
// da chave: "tema_cores@<uuid>". Assim cada membro tem a sua.
async function resolverChave(key, perUser) {
  if (!perUser) return key;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado.");
  return `${key}@${user.id}`;
}

// Levantado quando a linha mudou no banco depois que a lemos — ou seja, outra
// pessoa (ou outra aba sua) gravou no meio do caminho. Carrega o conteúdo atual
// junto, para quem chamou poder mesclar em vez de só perder a escrita.
export class ConflitoDeVersao extends Error {
  constructor(chave, valorRemoto, versaoRemota) {
    super(`A chave "${chave}" mudou no servidor desde a última leitura.`);
    this.name = "ConflitoDeVersao";
    this.chave = chave;
    this.valorRemoto = valorRemoto;
    this.versaoRemota = versaoRemota;
  }
}

// O terceiro argumento já foi `false` em muitas chamadas antigas (queriam dizer
// "não é por usuário"). Aceitar só objeto quebraria essas — daí o guarda.
const normalizarOpcoes = (o) => (o && typeof o === "object" ? o : {});

export const storage = {
  async get(key, opcoes) {
    const { perUser = false } = normalizarOpcoes(opcoes);
    const householdId = await getHouseholdId();
    const chave = await resolverChave(key, perUser);
    const { data, error } = await supabase
      .from("user_data")
      .select("key, value, updated_at")
      .eq("household_id", householdId)
      .eq("key", chave)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    // `version` é o updated_at que o SERVIDOR devolveu, e é sempre ele que deve
    // voltar no baseVersion — o Postgres reescreve o formato do timestamp, então
    // a string que mandamos não é a mesma que ele guarda.
    return { key: data.key, value: data.value, version: data.updated_at };
  },

  // Com `baseVersion`, a gravação só acontece se a linha ainda estiver na versão
  // que você leu. Se outra pessoa gravou nesse meio-tempo, levanta
  // ConflitoDeVersao com o conteúdo dela em vez de escrever por cima.
  //
  // Sem `baseVersion` o comportamento é o antigo (upsert cego). Isso é seguro só
  // quando não há nada para perder: a linha ainda não existe.
  async set(key, value, opcoes) {
    const { perUser = false, baseVersion = null } = normalizarOpcoes(opcoes);
    const householdId = await getHouseholdId();
    const { data: { user } } = await supabase.auth.getUser();
    const chave = await resolverChave(key, perUser);
    const agora = new Date().toISOString();

    if (baseVersion) {
      const { data, error } = await supabase
        .from("user_data")
        .update({ value, user_id: user.id, updated_at: agora })
        .eq("household_id", householdId)
        .eq("key", chave)
        .eq("updated_at", baseVersion)
        .select("updated_at");
      if (error) throw error;
      if (data && data.length === 1) return { key: chave, value, version: data[0].updated_at };

      // Nenhuma linha bateu: ou alguém gravou antes de nós, ou a linha sumiu.
      // São coisas diferentes e só a primeira é conflito.
      const atual = await storage.get(key, { perUser });
      if (atual) throw new ConflitoDeVersao(chave, atual.value, atual.version);
    }

    const { data, error } = await supabase
      .from("user_data")
      .upsert(
        { household_id: householdId, user_id: user.id, key: chave, value, updated_at: agora },
        { onConflict: "household_id,key" }
      )
      .select("updated_at")
      .single();
    if (error) throw error;
    return { key: chave, value, version: data.updated_at };
  },

  async delete(key, opcoes) {
    const { perUser = false } = normalizarOpcoes(opcoes);
    const householdId = await getHouseholdId();
    const chave = await resolverChave(key, perUser);
    const { error } = await supabase
      .from("user_data")
      .delete()
      .eq("household_id", householdId)
      .eq("key", chave);
    if (error) throw error;
    return { key: chave, deleted: true };
  },

  async list(prefix = "") {
    const householdId = await getHouseholdId();
    let query = supabase.from("user_data").select("key").eq("household_id", householdId);
    if (prefix) query = query.like("key", `${prefix}%`);
    const { data, error } = await query;
    if (error) throw error;
    return { keys: (data || []).map((r) => r.key), prefix };
  },
};
