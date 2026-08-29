-- =====================================================================
-- 08 — Limites do bucket de comprovantes
--
-- Mesma coisa que fazer pelo painel (Storage → comprovantes → Edit
-- bucket), só que versionada junto com o resto.
--
-- POR QUE
-- -------
-- O bucket estava com `file_size_limit` e `allowed_mime_types` nulos:
-- aceitava qualquer arquivo, de qualquer tamanho. O
-- accept="image/*,application/pdf" que existe no App.jsx é só uma dica
-- para a janela de escolher arquivo do navegador — quem chamasse a API
-- de storage direto subia o que quisesse, inclusive um HTML, que abriria
-- pela URL assinada rodando script no domínio do Supabase.
--
-- 10 MB é folgado para foto de cupom: uma foto de celular em boa
-- qualidade dá 3 a 5 MB.
-- =====================================================================

update storage.buckets
   set file_size_limit = 10485760,          -- 10 MB
       allowed_mime_types = array[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/heic',
         'image/heif',
         'application/pdf'
       ]
 where id = 'comprovantes';

-- O `image/heif` entra junto com o `image/heic` de propósito: iPhone manda
-- ora um, ora outro, dependendo da versão do iOS e do navegador.


-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
-- Esperado: public = false, limite de 10485760, lista de tipos preenchida.

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'comprovantes';


-- ---------------------------------------------------------------------
-- Se der "permission denied for table buckets"
-- ---------------------------------------------------------------------
-- Dependendo do papel com que o SQL Editor roda, `storage.buckets` pode
-- estar fora de alcance. Nesse caso é pelo painel mesmo:
--
--   Storage → comprovantes → (⋮) → Edit bucket
--     Restrict file upload size  →  10 MB
--     Allowed MIME types         →  image/jpeg, image/png, image/webp,
--                                   image/heic, image/heif, application/pdf
--
-- O resultado é idêntico; esta tabela é exatamente o que aquela tela
-- escreve.
