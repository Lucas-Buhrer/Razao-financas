-- =====================================================================
-- 06 — Endurecimento de segurança
--
-- Rode DEPOIS de 01..05. Pode rodar mais de uma vez sem problema.
--
-- POR QUE ISTO EXISTE
-- -------------------
-- Testando a API do projeto SEM nenhum login (só com a chave anônima, que
-- é pública e está dentro do bundle do site), deu para chamar RPCs que
-- deveriam exigir sessão:
--
--   POST /rest/v1/rpc/join_household        -> "Código inválido ou expirado."
--   POST /rest/v1/rpc/list_household_members -> 200 []
--   POST /rest/v1/rpc/list_invite_codes      -> 200 []
--   POST /rest/v1/rpc/get_my_household_id    -> 200 null
--
-- Nenhuma delas devolveu dado de ninguém — o RLS segurou. Mas o
-- `join_household` responder a quem não está logado transforma ele num
-- "oráculo": dá para chutar código atrás de código e a mensagem de erro
-- diz quando um deles existe. Com o cadastro aberto, quem achasse um
-- código válido criaria uma conta e entraria na sua família.
--
-- A CAUSA
-- -------
-- No Postgres, toda função nasce com EXECUTE liberado para PUBLIC. Os
-- `grant execute ... to authenticated` do arquivo 05 ADICIONAM permissão,
-- não tiram a que já existia. Sem um `revoke ... from public`, `anon`
-- continua entrando.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Tirar de quem não está logado o acesso às funções da aplicação
-- ---------------------------------------------------------------------
-- Feito função a função (e não com "all functions in schema") para não
-- derrubar sem querer alguma função que precise ficar aberta.

do $$
declare
  fn text;
  assinatura text;
begin
  foreach fn in array array[
    'get_my_household_id()',
    'list_household_members()',
    'list_invite_codes()',
    'create_invite_code()',
    'revoke_invite_code(text)',
    'join_household(text)',
    'leave_household()',
    'remove_household_member(uuid)',
    'delete_my_account()'
  ]
  loop
    assinatura := 'public.' || fn;
    -- to_regprocedure devolve null se a função não existir neste projeto,
    -- então nomes diferentes do esperado apenas são ignorados.
    if to_regprocedure(assinatura) is not null then
      execute format('revoke all on function %s from public, anon', assinatura);
      execute format('grant execute on function %s to authenticated', assinatura);
      raise notice 'Fechada para anon: %', assinatura;
    else
      raise notice 'NAO ENCONTRADA (confira o nome): %', assinatura;
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 2) Nenhuma função da aplicação deve rodar sem sessão
-- ---------------------------------------------------------------------
-- Cinto e suspensório: mesmo que um dia alguém volte a liberar o EXECUTE,
-- a própria função recusa quem não tem usuário.
--
-- `get_my_household_id` é SECURITY DEFINER e é a base de todas as
-- políticas de RLS — ela precisa continuar existindo exatamente com esse
-- nome e comportamento (ver ARMADILHAS.md: sem ela, as políticas
-- consultam a própria tabela e entram em recursão infinita).

create or replace function public.get_my_household_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select hm.household_id
  from public.household_members hm
  where hm.user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.get_my_household_id() from public, anon;
grant execute on function public.get_my_household_id() to authenticated;


-- ---------------------------------------------------------------------
-- 3) Conferência final — rode isto e confira o resultado
-- ---------------------------------------------------------------------
--
-- NOTA: uma versão anterior deste arquivo criava aqui uma tabela
-- `join_attempts` para limitar tentativas de convite. Ela saiu: testada
-- num Postgres de verdade, não funcionava — o registro da tentativa e a
-- mensagem de erro ficam na mesma transação, então o erro desfazia o
-- registro e o contador nunca saía do zero. O 07-convites.sql apaga a
-- tabela, caso você já tenha rodado a versão antiga.
-- Toda linha aqui deve mostrar `anon_pode_executar = false`.

select
  p.proname                                              as funcao,
  pg_get_function_identity_arguments(p.oid)              as argumentos,
  has_function_privilege('anon',           p.oid, 'execute') as anon_pode_executar,
  has_function_privilege('authenticated',  p.oid, 'execute') as logado_pode_executar,
  p.prosecdef                                            as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by anon_pode_executar desc, p.proname;
