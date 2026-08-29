-- =====================================================================
-- 99 — Check-up de segurança (só leitura)
--
-- Rode isto DEPOIS de qualquer mudança no banco, e de vez em quando sem
-- motivo. Uma consulta só.
--
-- RESULTADO VAZIO = tudo certo. Qualquer linha que aparecer é um
-- problema, com a explicação do que fazer ao lado.
--
-- Existe porque metade dos achados da auditoria de 29/08 eram regressões
-- silenciosas: nada quebrava, nada dava erro, e a proteção simplesmente
-- não estava lá. Um `create function` novo nasce aberto para `anon`; uma
-- tabela nova nasce sem RLS. Nenhum dos dois avisa.
-- =====================================================================

with problemas as (

  -- 1. Tabela sem RLS é tabela que qualquer pessoa logada lê inteira,
  --    de qualquer família.
  select 1 as ordem,
         'TABELA SEM RLS' as problema,
         c.relname as objeto,
         'alter table public.' || c.relname || ' enable row level security;' as correcao
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity

  union all

  -- 2. Função executável por quem não fez login. Toda função nova nasce
  --    assim: o EXECUTE para PUBLIC vem de fábrica.
  select 2,
         'FUNCAO ABERTA PARA ANON',
         p.proname,
         'revoke all on function public.' || p.proname
           || '(' || pg_get_function_identity_arguments(p.oid) || ') from public, anon;'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and has_function_privilege('anon', p.oid, 'execute')

  union all

  -- 3. SECURITY DEFINER sem search_path fixo. A função roda com os
  --    poderes de quem a criou; sem search_path travado, quem chama pode
  --    apontar o nome de uma tabela para outra coisa e sequestrar o que
  --    ela faz.
  select 3,
         'SECURITY DEFINER SEM search_path',
         p.proname,
         'recrie a função com:  set search_path = public'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and (p.proconfig is null or not exists (
          select 1 from unnest(p.proconfig) cfg where cfg like 'search\_path=%'))

  union all

  -- 4. Política valendo para o papel `public`, que inclui `anon`. Hoje
  --    ninguém passa porque get_my_household_id() devolve null sem
  --    sessão — mas isso é uma trava só.
  select 4,
         'POLICY VALENDO PARA ANON',
         schemaname || '.' || tablename || ' / ' || policyname,
         'alter policy "' || policyname || '" on ' || schemaname || '.' || tablename || ' to authenticated;'
  from pg_policies
  where schemaname in ('public', 'storage')
    and ('public' = any(roles) or 'anon' = any(roles))

  union all

  -- 5. Bucket público serve arquivo a quem tiver o link, sem login.
  --    Comprovante não pode ser público.
  select 5,
         'BUCKET PUBLICO',
         id,
         'update storage.buckets set public = false where id = ''' || id || ''';'
  from storage.buckets
  where public

  union all

  -- 6. Bucket sem teto de tamanho ou sem lista de tipos aceita HTML,
  --    executável, arquivo de 2 GB.
  select 6,
         'BUCKET SEM LIMITE DE TAMANHO OU TIPO',
         id,
         'ver sql/08-storage.sql'
  from storage.buckets
  where file_size_limit is null or allowed_mime_types is null

  union all

  -- 7. Dado apontando para família que não existe mais. Não é brecha de
  --    segurança, é sintoma de que algum passo deixou lixo para trás.
  select 7,
         'DADO ORFAO',
         'user_data: ' || count(*)::text || ' linha(s) sem família',
         'investigar antes de apagar'
  from public.user_data d
  where not exists (select 1 from public.households h where h.id = d.household_id)
  having count(*) > 0

  union all

  -- 8. Convite que já devia ter morrido. O join_household ignora
  --    expirados, então não abre porta — mas acumular é sinal de que a
  --    limpeza nunca acontece.
  select 8,
         'CONVITE VENCIDO AINDA NA TABELA',
         count(*)::text || ' convite(s) vencido(s) e nunca usado(s)',
         'delete from public.household_invites where used_by is null and expires_at < now() - interval ''30 days'';'
  from public.household_invites
  where used_by is null and expires_at < now()
  having count(*) > 0
)

select problema, objeto, correcao
from problemas
order by ordem, objeto;

-- Se voltar vazio: o banco está como a auditoria o deixou.
