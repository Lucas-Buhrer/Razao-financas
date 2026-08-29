-- =====================================================================
-- 10 — Integridade: excluir uma conta não pode apagar o dado da família
--
-- Rode depois do 09. Pode rodar mais de uma vez.
--
-- O QUE ACONTECE HOJE
-- -------------------
-- Ana e Bru dividem uma família. A Ana é quem mais usa o app, então é o
-- id dela que está em `user_data.user_id` na maioria das linhas — esse
-- campo guarda quem gravou por último. A Ana clica em "excluir minha
-- conta".
--
-- O `delete_my_account` foi escrito com todo o cuidado: quando sobra
-- gente na família, ele NÃO apaga `user_data`, só transfere a posse e
-- remove a pessoa. Mas a última linha da função é
--
--     delete from auth.users where id = me;
--
-- e a chave estrangeira diz:
--
--     user_data.user_id references auth.users(id) ON DELETE CASCADE
--
-- O banco apaga as linhas por conta própria, sem a função pedir. Testado:
-- de três chaves, sobrou uma — a única que o Bru tinha gravado por
-- último. Os lançamentos e as contas fixas da casa foram embora, em
-- silêncio, com o Bru ainda logado e sem entender nada.
--
-- O `user_id` em `user_data` é resquício do modelo antigo, de antes das
-- famílias: hoje quem manda é o `household_id`, e o RLS nem olha para o
-- `user_id`. Ele só registra quem salvou por último — não é dono de nada,
-- e não deveria levar dado nenhum junto ao ser removido.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Dado da família deixa de morrer junto com a conta de quem o gravou
-- ---------------------------------------------------------------------

alter table public.user_data alter column user_id drop not null;

alter table public.user_data drop constraint if exists user_data_user_id_fkey;

alter table public.user_data
  add constraint user_data_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- O storage.js regrava o user_id a cada salvamento, então a linha volta a
-- ter dono assim que alguém mexer nela. Nada no app lê esse campo.


-- ---------------------------------------------------------------------
-- 2) Convites de quem saiu param de valer
-- ---------------------------------------------------------------------
-- Dois problemas de uma vez. Primeiro: `created_by` é NOT NULL e a chave
-- estrangeira não tinha ON DELETE, então bastava a pessoa ter gerado um
-- convite algum dia para o `delete_my_account` dela falhar com erro de
-- chave estrangeira — a função quebrava no meio.
--
-- Segundo, e mais importante: um convite gerado por alguém que já saiu
-- continuaria abrindo a porta da família. Com CASCADE, sair leva os
-- convites junto.
--
-- Em `used_by`, CASCADE (e não SET NULL) é proposital: o `join_household`
-- considera válido todo convite com `used_by is null`. Zerar esse campo
-- ressuscitaria um convite já gasto.

alter table public.household_invites drop constraint if exists household_invites_created_by_fkey;
alter table public.household_invites
  add constraint household_invites_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete cascade;

alter table public.household_invites drop constraint if exists household_invites_used_by_fkey;
alter table public.household_invites
  add constraint household_invites_used_by_fkey
  foreign key (used_by) references auth.users(id) on delete cascade;


-- ---------------------------------------------------------------------
-- 3) Famílias abandonadas
-- ---------------------------------------------------------------------
-- Toda conta nova ganha uma família própria (gatilho
-- `on_auth_user_created_household`). Quem depois entra na família de
-- outra pessoa deixa a sua para trás: sem membros, sem dados, e ainda com
-- `owner_id` apontando para quem foi embora.
--
-- O dump mostrou 7 famílias para 6 membros — a conta já não fecha. Elas
-- não fazem mal por si, mas fazem a posse ficar confusa e atrapalham
-- qualquer diagnóstico futuro.
--
-- A limpeza só toca no que está comprovadamente vazio: sem nenhum membro
-- E sem nenhuma linha de dado.

delete from public.households h
 where not exists (select 1 from public.household_members m where m.household_id = h.id)
   and not exists (select 1 from public.user_data     d where d.household_id = h.id);


-- ---------------------------------------------------------------------
-- 4) join_household passa a limpar a família que ficou para trás
-- ---------------------------------------------------------------------
-- Mesma função do 09, com duas diferenças no fim:
--
--   - a mudança de família do membro acontece ANTES de apagar a família
--     antiga. Ao contrário, a exclusão da família levaria junto a linha
--     de `household_members` por CASCADE — a pessoa ficaria sem família
--     nenhuma e sem conseguir entrar no app.
--   - a família antiga, agora vazia, é removida. Os convites dela caem
--     junto por CASCADE, o que é bom: convite velho não fica solto.

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

  -- Os dados só vêm junto se a família de origem for só sua. Havendo mais
  -- alguém lá, eles ficam onde estão: não são seus para levar.
  if minha_antiga is not null and membros_na_antiga = 1 then

    for reg in
      select key, value from public.user_data where household_id = minha_antiga
    loop
      select ud.value into valor_deles
      from public.user_data ud
      where ud.household_id = destino and ud.key = reg.key;

      if not found then
        update public.user_data
           set household_id = destino
         where household_id = minha_antiga and key = reg.key;

      else
        begin
          json_meu   := reg.value::jsonb;
          json_deles := valor_deles::jsonb;
        exception when others then
          json_meu := null;
          json_deles := null;
        end;

        if jsonb_typeof(json_meu) = 'array' and jsonb_typeof(json_deles) = 'array' then
          with juntos as (
            select 1 as fonte, ord, e
            from jsonb_array_elements(json_deles) with ordinality as t(e, ord)
            union all
            select 2 as fonte, ord, e
            from jsonb_array_elements(json_meu) with ordinality as t(e, ord)
          ),
          unicos as (
            select distinct on (coalesce(e ->> 'id', e::text)) fonte, ord, e
            from juntos
            order by coalesce(e ->> 'id', e::text), fonte, ord
          )
          select coalesce(jsonb_agg(e order by fonte, ord), '[]'::jsonb)
            into json_novo
          from unicos;

          update public.user_data
             set value = json_novo::text,
                 updated_at = now()
           where household_id = destino and key = reg.key;
        end if;

        delete from public.user_data
         where household_id = minha_antiga and key = reg.key;
      end if;
    end loop;

    delete from public.user_data where household_id = minha_antiga;
  end if;

  -- Primeiro mudo de família...
  update public.household_members
     set household_id = destino,
         email = meu_email,
         role = 'member',
         joined_at = now()
   where user_id = eu;

  update public.household_invites
     set used_by = eu, used_at = now()
   where code = codigo and used_by is null;

  -- ...e só então apago a antiga, se ela ficou realmente vazia. Na ordem
  -- inversa, o CASCADE de household_members me tiraria de toda família.
  if minha_antiga is not null
     and not exists (select 1 from public.household_members where household_id = minha_antiga)
     and not exists (select 1 from public.user_data where household_id = minha_antiga) then
    delete from public.households where id = minha_antiga;
  end if;
end;
$$;

revoke all on function public.join_household(text) from public, anon;
grant execute on function public.join_household(text) to authenticated;


-- ---------------------------------------------------------------------
-- 5) Conferência
-- ---------------------------------------------------------------------
-- Esperado: user_id com "SET NULL", created_by e used_by com "CASCADE",
-- e o mesmo número de famílias e de membros.

select con.conname as chave,
       case con.confdeltype
         when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
         when 'c' then 'CASCADE'   when 'n' then 'SET NULL'
         when 'd' then 'SET DEFAULT' end as ao_excluir_o_usuario
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public' and con.contype = 'f'
  and con.conname in ('user_data_user_id_fkey',
                      'household_invites_created_by_fkey',
                      'household_invites_used_by_fkey')
order by 1;

select (select count(*) from public.households)        as familias,
       (select count(*) from public.household_members) as membros,
       (select count(*) from public.user_data)         as chaves_de_dados;
