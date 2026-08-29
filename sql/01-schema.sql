-- =====================================================================
-- 01 — Schema completo do Razão
--
-- Este arquivo sozinho reconstrói o banco inteiro num projeto Supabase
-- novo e vazio. Ele SUBSTITUI os antigos 01-base, 02-familia,
-- 03-familia-fix e 04-comprovantes, que nunca existiram no repositório —
-- o banco vinha sendo o único lugar onde essas definições moravam.
--
-- Reflete o estado real em 29/08/2026, já com tudo que os arquivos 06 a
-- 10 corrigiram. Num projeto novo, rodar só este arquivo basta; os 06 a
-- 10 são migrações para o banco que já existe.
--
-- ORDEM NUM PROJETO NOVO:  01-schema.sql  →  08-storage.sql
--
-- Sobre a seção 6 (comprovantes): criar bucket por SQL pode esbarrar em
-- permissão dependendo do papel do editor. O arquivo avisa e diz o
-- caminho pelo painel.
-- =====================================================================


-- =====================================================================
-- 1. TABELAS
-- =====================================================================

-- Uma família. Toda conta nova ganha a sua pelo gatilho da seção 4.
create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null default 'Minha família',
  owner_id   uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Quem está em qual família. `user_id` é UNIQUE: uma pessoa pertence a
-- uma família por vez, e é isso que faz o `get_my_household_id` poder
-- devolver um valor só.
create table if not exists public.household_members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid        not null references public.households(id) on delete cascade,
  user_id      uuid        not null unique references auth.users(id) on delete cascade,
  email        text,
  role         text        not null default 'member',
  joined_at    timestamptz not null default now()
);

-- Convites. O código é único no projeto inteiro.
--
-- created_by e used_by são ON DELETE CASCADE de propósito (ver 10):
-- convite de quem saiu não pode continuar abrindo a porta, e SET NULL em
-- `used_by` ressuscitaria um convite já gasto, porque o join_household
-- considera válido tudo que tem `used_by is null`.
create table if not exists public.household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid        not null references public.households(id) on delete cascade,
  code         text        not null unique,
  created_by   uuid        not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  used_by      uuid        references auth.users(id) on delete cascade,
  used_at      timestamptz
);

-- Os dados do app: uma linha por bloco (lancamentos, contas_fixas,
-- orcamentos...), com o JSON inteiro no `value`. O dono é a FAMÍLIA.
--
-- `user_id` só registra quem gravou por último — por isso ON DELETE SET
-- NULL e não CASCADE. Com CASCADE, excluir a conta de quem mais usava o
-- app apagava os lançamentos da casa inteira, mesmo com os outros
-- membros ainda lá. Ver 10-integridade.sql.
create table if not exists public.user_data (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        references auth.users(id) on delete set null,
  key          text        not null,
  value        text        not null,
  updated_at   timestamptz not null default now(),
  household_id uuid        not null references public.households(id),
  unique (household_id, key)
);

create index if not exists user_data_user_id_idx on public.user_data (user_id);


-- =====================================================================
-- 2. get_my_household_id — a base de todo o RLS
-- =====================================================================
-- SECURITY DEFINER não é enfeite: as políticas precisam saber a família
-- de quem está pedindo, e essa informação está em `household_members`,
-- que também tem RLS. Uma política que consultasse a tabela diretamente
-- entraria em recursão infinita — foi o que já apagou os dados do app uma
-- vez. Ver ARMADILHAS.md.

create or replace function public.get_my_household_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id from public.household_members where user_id = auth.uid() limit 1;
$$;


-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================
-- Todas as políticas são `to authenticated`. Sem sessão,
-- get_my_household_id() devolve null e `household_id = null` nunca é
-- verdadeiro — mas depender só disso é uma trava só. Ver 07 bloco 5.

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.user_data         enable row level security;

drop policy if exists members_view_own_household on public.households;
create policy members_view_own_household
  on public.households for select to authenticated
  using (id = public.get_my_household_id());

drop policy if exists members_view_own_membership_list on public.household_members;
create policy members_view_own_membership_list
  on public.household_members for select to authenticated
  using (household_id = public.get_my_household_id());

-- Só o próprio criador enxerga o código cru na tabela. A lista da tela
-- vem da list_invite_codes, que é SECURITY DEFINER e mostra os da família.
drop policy if exists creator_view_own_invites on public.household_invites;
create policy creator_view_own_invites
  on public.household_invites for select to authenticated
  using (created_by = auth.uid());

-- Escrita em households, household_members e household_invites acontece
-- só pelas funções SECURITY DEFINER. Sem política de INSERT/UPDATE/DELETE,
-- o RLS recusa qualquer escrita direta pela API — que é o desejado.

drop policy if exists household_members_manage_data on public.user_data;
create policy household_members_manage_data
  on public.user_data for all to authenticated
  using      (household_id = public.get_my_household_id())
  with check (household_id = public.get_my_household_id());

-- O PostgREST ainda precisa do privilégio de tabela; o RLS é que filtra.
-- `anon` fica de fora: sem sessão não há o que ver.
grant select, insert, update, delete on public.user_data         to authenticated;
grant select                         on public.households        to authenticated;
grant select                         on public.household_members to authenticated;
grant select                         on public.household_invites to authenticated;


-- =====================================================================
-- 4. Conta nova ganha família
-- =====================================================================
-- Sem este gatilho, um projeto recriado do zero deixaria todo mundo sem
-- household — e o app pararia de gravar, porque o getHouseholdId() do
-- storage.js lança "Não foi possível identificar sua família".

create or replace function public.handle_new_user_household()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nova_familia uuid;
begin
  insert into public.households (name, owner_id)
  values (coalesce(new.email, 'Minha família'), new.id)
  returning id into nova_familia;

  insert into public.household_members (household_id, user_id, email, role)
  values (nova_familia, new.id, new.email, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_household on auth.users;
create trigger on_auth_user_created_household
  after insert on auth.users
  for each row execute function public.handle_new_user_household();


-- =====================================================================
-- 5. FUNÇÕES DA APLICAÇÃO
-- =====================================================================

-- ---------------------------------------------------------------------
-- 5.1 Gerar convite
-- ---------------------------------------------------------------------
-- 10 caracteres de um alfabeto de 32 = 50 bits, de gen_random_uuid()
-- (fonte criptográfica, nativa do Postgres 13+). Pula os bytes 6 e 8 do
-- UUID, que carregam bits fixos de versão e variante. Alfabeto sem 0/O e
-- 1/I/L, para o código poder ser ditado por telefone.

create or replace function public.create_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  minha_familia uuid;
  alfabeto constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
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
  from public.household_members where user_id = auth.uid();

  if minha_familia is null then
    raise exception 'Usuário sem família associada.';
  end if;

  select count(*) into ativos
  from public.household_invites
  where household_id = minha_familia and used_by is null and expires_at > now();

  if ativos >= 3 then
    raise exception 'Já existem 3 convites válidos. Revogue um antes de criar outro.';
  end if;

  bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  for i in 1..10 loop
    novo_codigo := novo_codigo || substr(alfabeto, (get_byte(bytes, posicoes[i]) % 32) + 1, 1);
  end loop;

  insert into public.household_invites (household_id, code, created_by, expires_at)
  values (minha_familia, novo_codigo, auth.uid(), now() + interval '24 hours');

  return novo_codigo;
end;
$$;


-- ---------------------------------------------------------------------
-- 5.2 Entrar numa família
-- ---------------------------------------------------------------------
-- Mescla de verdade, chave por chave:
--   só do seu lado         → a linha muda de família
--   os dois são lista JSON → junta as duas, sem repetir item de mesmo id
--   qualquer outro caso    → fica o valor da família de destino
--
-- E só traz dado se a família de origem for sua sozinho. Havendo mais
-- gente lá, os dados ficam: não são seus para levar.

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
  reg record;
  valor_deles text;
  json_meu jsonb;
  json_deles jsonb;
  json_novo jsonb;
begin
  if eu is null then
    raise exception 'Sessão inválida.';
  end if;

  select household_id into destino
  from public.household_invites
  where code = codigo and used_by is null and expires_at > now();

  if destino is null then
    raise exception 'Código inválido ou expirado.';
  end if;

  select household_id into minha_antiga
  from public.household_members where user_id = eu;

  if minha_antiga = destino then
    raise exception 'Você já faz parte desta família.';
  end if;

  select count(*) into membros_na_antiga
  from public.household_members where household_id = minha_antiga;

  select u.email into meu_email from auth.users u where u.id = eu;

  if minha_antiga is not null and membros_na_antiga = 1 then
    for reg in select key, value from public.user_data where household_id = minha_antiga
    loop
      select ud.value into valor_deles
      from public.user_data ud
      where ud.household_id = destino and ud.key = reg.key;

      if not found then
        update public.user_data set household_id = destino
         where household_id = minha_antiga and key = reg.key;
      else
        begin
          json_meu := reg.value::jsonb;
          json_deles := valor_deles::jsonb;
        exception when others then
          json_meu := null; json_deles := null;
        end;

        if jsonb_typeof(json_meu) = 'array' and jsonb_typeof(json_deles) = 'array' then
          with juntos as (
            select 1 as fonte, ord, e from jsonb_array_elements(json_deles) with ordinality as t(e, ord)
            union all
            select 2 as fonte, ord, e from jsonb_array_elements(json_meu) with ordinality as t(e, ord)
          ),
          unicos as (
            select distinct on (coalesce(e ->> 'id', e::text)) fonte, ord, e
            from juntos order by coalesce(e ->> 'id', e::text), fonte, ord
          )
          select coalesce(jsonb_agg(e order by fonte, ord), '[]'::jsonb) into json_novo from unicos;

          update public.user_data
             set value = json_novo::text, updated_at = now()
           where household_id = destino and key = reg.key;
        end if;

        delete from public.user_data where household_id = minha_antiga and key = reg.key;
      end if;
    end loop;

    delete from public.user_data where household_id = minha_antiga;
  end if;

  -- Mudar de família ANTES de apagar a antiga: o CASCADE de
  -- household_members me deixaria sem família nenhuma na ordem inversa.
  update public.household_members
     set household_id = destino, email = meu_email, role = 'member', joined_at = now()
   where user_id = eu;

  update public.household_invites
     set used_by = eu, used_at = now()
   where code = codigo and used_by is null;

  if minha_antiga is not null
     and not exists (select 1 from public.household_members where household_id = minha_antiga)
     and not exists (select 1 from public.user_data where household_id = minha_antiga) then
    delete from public.households where id = minha_antiga;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 5.3 Listar membros
-- ---------------------------------------------------------------------
-- `joined_at` (e não `created_at`, que não existe) e `is_owner`, que o
-- ConfiguracoesTab.jsx já esperava para decidir se mostra o botão de
-- remover membro.

drop function if exists public.list_household_members();
create function public.list_household_members()
returns table (
  user_id uuid, email text, display_name text, joined_at timestamptz, is_owner boolean
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


-- ---------------------------------------------------------------------
-- 5.4 Convites: listar e revogar
-- ---------------------------------------------------------------------

create or replace function public.list_invite_codes()
returns table (code text, created_at timestamptz, expires_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select i.code::text, i.created_at, i.expires_at
  from public.household_invites i
  where i.household_id = public.get_my_household_id()
    and i.used_at is null
    and i.expires_at > now()
  order by i.created_at desc;
$$;

create or replace function public.revoke_invite_code(invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  afetados int;
begin
  update public.household_invites
     set expires_at = now() - interval '1 second'
   where code = upper(trim(invite_code))
     and household_id = public.get_my_household_id()
     and used_at is null;

  get diagnostics afetados = row_count;
  if afetados = 0 then
    raise exception 'Código não encontrado nesta família ou já utilizado.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 5.5 Sair da família
-- ---------------------------------------------------------------------
-- Os dados FICAM com a família de origem, de propósito: são de todos, não
-- só de quem sai. A tela avisa e oferece backup antes.

create or replace function public.leave_household()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  atual uuid; novo uuid; restantes int; sou_dono boolean; proximo_dono uuid;
begin
  atual := public.get_my_household_id();
  if atual is null then
    raise exception 'Você não pertence a nenhuma família.';
  end if;

  select count(*) into restantes from public.household_members where household_id = atual;
  if restantes <= 1 then
    raise exception 'Você é a única pessoa desta família — não há de quem se separar.';
  end if;

  select (owner_id = auth.uid()) into sou_dono from public.households where id = atual;

  insert into public.households (name, owner_id)
  values ('Minha família', auth.uid())
  returning id into novo;

  update public.household_members
     set household_id = novo, role = 'owner', joined_at = now()
   where user_id = auth.uid();

  -- Quem sai não leva a posse junto: passa para quem está há mais tempo.
  if sou_dono then
    select user_id into proximo_dono from public.household_members
     where household_id = atual order by joined_at asc limit 1;
    update public.households set owner_id = proximo_dono where id = atual;
    update public.household_members set role = 'owner'
     where household_id = atual and user_id = proximo_dono;
  end if;

  return novo;
end;
$$;


-- ---------------------------------------------------------------------
-- 5.6 Remover outra pessoa — só o dono
-- ---------------------------------------------------------------------

create or replace function public.remove_household_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  atual uuid; novo uuid; dono uuid;
begin
  atual := public.get_my_household_id();

  if target_user_id = auth.uid() then
    raise exception 'Para sair você mesmo, use a opção "Sair da família".';
  end if;

  select owner_id into dono from public.households where id = atual;
  if dono is distinct from auth.uid() then
    raise exception 'Só quem criou a família pode remover outra pessoa.';
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = atual and user_id = target_user_id
  ) then
    raise exception 'Essa pessoa não está na sua família.';
  end if;

  -- Ninguém fica sem lugar: quem sai ganha um espaço próprio e vazio.
  insert into public.households (name, owner_id)
  values ('Minha família', target_user_id)
  returning id into novo;

  update public.household_members
     set household_id = novo, role = 'owner', joined_at = now()
   where user_id = target_user_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 5.7 Excluir a própria conta (LGPD)
-- ---------------------------------------------------------------------
-- Sendo a última pessoa, os dados vão junto. Havendo mais gente, ficam —
-- e continuam ficando de verdade agora que `user_data.user_id` é
-- ON DELETE SET NULL. Com o CASCADE de antes, o banco apagava as linhas
-- desta pessoa por conta própria, à revelia desta função.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  atual uuid; restantes int; me uuid; sou_dono boolean; proximo_dono uuid;
begin
  me := auth.uid();
  if me is null then
    raise exception 'Sessão inválida.';
  end if;

  atual := public.get_my_household_id();

  select count(*) into restantes from public.household_members where household_id = atual;
  select (owner_id = me) into sou_dono from public.households where id = atual;

  delete from public.household_members where user_id = me;

  if restantes <= 1 then
    delete from public.user_data       where household_id = atual;
    delete from public.household_invites where household_id = atual;
    delete from public.households      where id = atual;
  elsif sou_dono then
    select user_id into proximo_dono from public.household_members
     where household_id = atual order by joined_at asc limit 1;
    update public.households set owner_id = proximo_dono where id = atual;
    update public.household_members set role = 'owner'
     where household_id = atual and user_id = proximo_dono;
  end if;

  delete from auth.users where id = me;
end;
$$;


-- =====================================================================
-- 6. COMPROVANTES
-- =====================================================================
-- Bucket privado; o acesso é sempre por URL assinada de 1 hora, gerada
-- pelo receipts.js. O caminho de cada arquivo começa com o id da família,
-- e é isso que as políticas comparam — é o que impede alguém logado de
-- baixar comprovante de outra casa.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists household_members_read_receipts on storage.objects;
create policy household_members_read_receipts
  on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes'
         and (storage.foldername(name))[1] = (public.get_my_household_id())::text);

drop policy if exists household_members_upload_receipts on storage.objects;
create policy household_members_upload_receipts
  on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes'
              and (storage.foldername(name))[1] = (public.get_my_household_id())::text);

drop policy if exists household_members_delete_receipts on storage.objects;
create policy household_members_delete_receipts
  on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes'
         and (storage.foldername(name))[1] = (public.get_my_household_id())::text);

-- Não há política de UPDATE, e é intencional: comprovante não se
-- sobrescreve, se apaga e sobe outro. O receipts.js usa upsert:false.


-- =====================================================================
-- 7. PERMISSÕES DE EXECUÇÃO
-- =====================================================================
-- Toda função nasce com EXECUTE liberado para PUBLIC — o que inclui o
-- papel `anon`, de quem não fez login. Um `grant to authenticated` só
-- ACRESCENTA permissão; sem o revoke, a porta de trás continua aberta.
-- Foi assim que o join_household passou meses respondendo a estranhos,
-- servindo de oráculo para adivinhar código de convite.

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
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon', r.assinatura);
    if r.eh_gatilho then
      execute format('revoke all on function %s from authenticated', r.assinatura);
    else
      execute format('grant execute on function %s to authenticated', r.assinatura);
    end if;
  end loop;
end $$;


-- =====================================================================
-- 8. CONFERÊNCIA
-- =====================================================================
-- Esperado: nenhuma função com anon = true, nenhuma tabela sem RLS.

select p.proname as funcao,
       has_function_privilege('anon', p.oid, 'execute') as anon_pode_executar
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
order by 2 desc, 1;

select c.relname as tabela_sem_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
