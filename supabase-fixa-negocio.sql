-- Permite atribuir cada despesa fixa a um NEGÓCIO específico
-- (empreendedor com vários negócios: Loja, Clínica, Organize-C...).
-- Fica ao lado do tipo pj/pf. Quando pf (pessoal), negocio fica vazio.
alter table public.despesas_fixas add column if not exists negocio text;
