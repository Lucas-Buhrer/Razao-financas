-- =====================================================================
-- 07 — Convite forte, sessão obrigatória e freio de tentativas
--
-- Rode DEPOIS do 06-seguranca.sql. Pode rodar mais de uma vez.
--
-- Escrito em cima do que o banco REALMENTE tem (diagnóstico de 29/08),
-- não do que os arquivos 01..05 dizem — eles divergem em vários pontos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Fechar TODAS as funções para quem não está logado
-- ---------------------------------------------------------------------
-- O 06 fechou uma lista fixa. Aqui é varredura: pega qualquer função que
-- tenha aparecido depois, inclusive a `handle_new_user_household`, que é
-- de gatilho e não deveria ser chamável por ninguém pela API.
--
-- O `not exists (... pg_depend ...)` pula funções que pertencem a alguma
-- extensão. Sem isso a varredura mexeria também nas funções de pgcrypto,
-- uuid-ossp e afins que porventura estejam no schema public — e tirar
-- permissão delas quebra coisa que não tem nada a ver com convite.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as assinatura,
           p.prorettype = 'trigger'::regtype as eh_gatilho
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke all on function %s from public, anon', r.assinatura);
    if r.eh_gatilho then
      execute format('revoke all on function %s from authenticated', r.assinatura);
    else
      execute format('grant execute on function %s to authenticated', r.assinatura);
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 2) Código de convite forte
-- ---------------------------------------------------------------------
-- Antes: upper(substr(md5(random()::text), 1, 8)) — 8 caracteres hex, 32
-- bits, e `random()` não é um gerador criptográfico (é previsível se
-- alguém conhecer o estado da sessão).
--
-- Agora: 10 caracteres de um alfabeto de 32 = 50 bits. A aleatoriedade
-- vem de gen_random_uuid(), que é nativa do Postgres 13+ e usa fonte
-- criptográfica — de propósito, para não depender de a extensão pgcrypto
-- estar instalada nem de em qual schema ela mora. O alfabeto não tem
-- 0/O nem 1/I/L, para ninguém errar ao ditar o código por telefone. 256
-- dividido por 32 dá exatamente 8, então o resto não enviesa letra
-- nenhuma.
--
-- E o mais importante: `expires_at` passa a ser preenchido. A função
-- antiga não preenchia — o convite dependia inteiramente de existir um
-- DEFAULT na coluna.

create or replace function public.create_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  minha_familia uuid;
  -- 32 caracteres: dígitos 2-9 e as letras, menos I e O (que se confundem
  -- com 1 e 0 — e 1 e 0 já ficaram de fora justamente por isso).
  alfabeto constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  -- Num UUID v4, o byte 6 carrega o número da versão e o 8 carrega os bits
  -- de variante — eles não são totalmente aleatórios. Pulando os dois,
  -- sobram 14 bytes limpos e os 10 que usamos valem 5 bits cada de verdade.
  posicoes constant int[] := array[0,1,2,3,4,5,7,9,10,11];
  novo_codigo text := '';
  bytes bytea;
  ativos int;
  i int;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.';
  end if;

  select household_id into minha_familia
  from public.household_members
  where user_id = auth.uid();

  if minha_familia is null then
    raise exception 'Usuário sem família associada.';
  end if;

  -- Convite parado é convite vazando. No máximo 3 válidos por vez.
  select count(*) into ativos
  from public.household_invites
  where household_id = minha_familia
    and used_by is null
    and expires_at > now();

  if ativos >= 3 then
    raise exception 'Já existem 3 convites válidos. Revogue um antes de criar outro.';
  end if;

  -- 16 bytes criptográficos; usamos 10 deles.
  bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  for i in 1..10 loop
    novo_codigo := novo_codigo
      || substr(alfabeto, (get_byte(bytes, posicoes[i]) % 32) + 1, 1);
  end loop;

  insert into public.household_invites (household_id, code, created_by, expires_at)
  values (minha_familia, novo_codigo, auth.uid(), now() + interval '24 hours');

  return novo_codigo;
end;
$$;

revoke all on function public.create_invite_code() from public, anon;
grant execute on function public.create_invite_code() to authenticated;


-- ---------------------------------------------------------------------
-- 3) Entrar numa família
-- ---------------------------------------------------------------------
-- Duas mudanças sobre a versão que está no ar:
--
-- (a) EXIGE SESSÃO. A versão antiga rodava com auth.uid() nulo. Não
--     roubava dado (os updates não pegavam linha nenhuma), mas a
--     diferença entre "Código inválido" e sucesso dizia a um estranho
--     sem conta se um código existe. Isso é um oráculo de força bruta.
--
-- (b) NÃO ARRASTA DADO DOS OUTROS. A versão antiga fazia
--       update user_data set household_id = destino
--        where household_id = minha_antiga
--     — ou seja, quem estava numa família COM MAIS GENTE e usava um
--     código de fora levava junto o controle financeiro de todo mundo
--     para a família de destino. Um clique, e os dados da casa inteira
--     mudavam de dono. Agora os dados só migram se a família de origem
--     for só sua; havendo mais alguém lá, eles ficam onde estão. É a
--     mesma regra que o leave_household já usa.
--
-- SOBRE O FREIO DE TENTATIVAS QUE O 06 PREPAROU: saiu, e o bloco 6
-- abaixo remove a tabela. Escrevi, testei num Postgres de verdade e ele
-- NÃO FUNCIONAVA — o `insert` na tabela de tentativas e o `raise` da
-- mensagem de erro moram na mesma transação, então o erro desfazia o
-- registro da tentativa. O contador ficava eternamente em zero e nunca
-- travava ninguém. É a armadilha clássica: uma proteção que parece estar
-- lá, não está, e dá confiança falsa.
--
-- Fazer funcionar exigiria a função devolver um status em vez de dar
-- erro, mudando também o ConfiguracoesTab.jsx. Não vale: com código de
-- 50 bits, validade de 24 h, uso único, no máximo 3 ativos, sessão
-- obrigatória e cadastro fechado, adivinhar um convite deixou de ser um
-- caminho. Quem tentasse 100 chutes por segundo levaria uns 350 mil anos
-- — e, com o cadastro fechado, precisaria antes já ser alguém que você
-- convidou.

create or replace function public.join_household(invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  eu uuid := auth.uid();
  destino uuid;
  minha_antiga uuid;
  meu_email text;
  membros_na_antiga int;
  codigo text := upper(trim(invite_code));
begin
  if eu is null then
    raise exception 'Sessão inválida.';
  end if;

  select household_id into destino
  from public.household_invites
  where code = codigo
    and used_by is null
    and expires_at > now();

  if destino is null then
    raise exception 'Código inválido ou expirado.';
  end if;

  select household_id into minha_antiga
  from public.household_members
  where user_id = eu;

  if minha_antiga = destino then
    raise exception 'Você já faz parte desta família.';
  end if;

  select count(*) into membros_na_antiga
  from public.household_members
  where household_id = minha_antiga;

  select u.email into meu_email from auth.users u where u.id = eu;

  if minha_antiga is not null and membros_na_antiga = 1 then
    update public.user_data
       set household_id = destino
     where household_id = minha_antiga;
  end if;

  update public.household_members
     set household_id = destino,
         email = meu_email,
         role = 'member',
         joined_at = now()
   where user_id = eu;

  update public.household_invites
     set used_by = eu, used_at = now()
   where code = codigo and used_by is null;
end;
$$;

revoke all on function public.join_household(text) from public, anon;
grant execute on function public.join_household(text) to authenticated;


-- ---------------------------------------------------------------------
-- 4) list_household_members devolvendo quem é o dono
-- ---------------------------------------------------------------------
-- Duas correções:
--
-- (a) O 05-familia-extras.sql seleciona `hm.created_at`. A coluna real
--     chama-se `joined_at` — a função quebra. O App.jsx engole o erro
--     num try/catch e cai no modo "só contagem", então isso vinha
--     falhando em silêncio: os avatares mostram a inicial do e-mail em
--     vez do apelido da pessoa.
--
-- (b) O ConfiguracoesTab.jsx já procura `m.is_owner` para decidir se
--     mostra o botão de remover, e a função nunca devolveu esse campo.
--     Resultado: nem o dono via o botão, mesmo o banco permitindo. Agora
--     devolve, comparando com households.owner_id.
--
-- Mudar o formato de retorno exige derrubar a função antes.

drop function if exists public.list_household_members();

create function public.list_household_members()
returns table (
  user_id uuid,
  email text,
  display_name text,
  joined_at timestamptz,
  is_owner boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    hm.user_id,
    u.email::text,
    nullif(trim(coalesce(u.raw_user_meta_data ->> 'display_name', '')), '') as display_name,
    hm.joined_at,
    (h.owner_id = hm.user_id) as is_owner
  from public.household_members hm
  join auth.users u on u.id = hm.user_id
  join public.households h on h.id = hm.household_id
  where hm.household_id = public.get_my_household_id()
  order by hm.joined_at asc;
$$;

revoke all on function public.list_household_members() from public, anon;
grant execute on function public.list_household_members() to authenticated;


-- ---------------------------------------------------------------------
-- 5) Políticas de RLS só para quem está logado
-- ---------------------------------------------------------------------
-- Hoje todas as sete políticas são `to public`, o que inclui o papel
-- `anon`. Na prática ninguém passa, porque get_my_household_id() devolve
-- null para quem não tem sessão e `household_id = null` nunca é
-- verdadeiro. Mas é uma trava só — se um dia aquela função mudar, anon
-- entra junto. Restringir ao papel `authenticated` é a segunda trava.
--
-- As de storage.objects podem recusar por falta de permissão sobre a
-- tabela, dependendo do papel do editor. Se recusarem, dá para fazer o
-- mesmo pelo painel: Storage → Policies → editar o campo "Target roles".

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where (schemaname = 'public'
             and tablename in ('user_data', 'households', 'household_members', 'household_invites'))
       or (schemaname = 'storage' and tablename = 'objects'
             and policyname like 'household_members_%receipts')
  loop
    begin
      execute format('alter policy %I on %I.%I to authenticated',
                     p.policyname, p.schemaname, p.tablename);
      raise notice 'OK: %.% / %', p.schemaname, p.tablename, p.policyname;
    exception when insufficient_privilege then
      raise notice 'SEM PERMISSAO (ajuste pelo painel): %.% / %',
                   p.schemaname, p.tablename, p.policyname;
    end;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 6) Remover o freio de tentativas que não funcionava
-- ---------------------------------------------------------------------
-- Ver a explicação no bloco 3. Se você ainda não rodou o 06, estas duas
-- linhas simplesmente não encontram nada e seguem em frente.

drop function if exists public.limpar_join_attempts();
drop table if exists public.join_attempts;


-- ---------------------------------------------------------------------
-- 7) Conferência
-- ---------------------------------------------------------------------
-- Espera-se: nenhuma função com anon = true, e nenhuma política com
-- {public} em papeis.

select 'funcoes' as bloco, p.proname as item,
       has_function_privilege('anon', p.oid, 'execute')::text as anon_pode
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'policies', schemaname || '.' || tablename || ' / ' || policyname,
       array_to_string(roles, ',')
from pg_policies
where schemaname in ('public', 'storage')
order by 1, 3 desc, 2;
