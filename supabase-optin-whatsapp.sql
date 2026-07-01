-- Consentimento (opt-in) para receber mensagens no WhatsApp — exigido pela política da Meta.
-- Guarda a prova: se autorizou, quando, e o texto exato que foi aceito.
alter table public.clientes add column if not exists whatsapp_optin boolean not null default false;
alter table public.clientes add column if not exists optin_em timestamptz;
alter table public.clientes add column if not exists optin_texto text;

-- (o painel usa a anon key; a policy de update da própria linha já deve existir.
--  Se não existir, descomente a linha abaixo:)
-- create policy "cliente_atualiza_proprio" on public.clientes for update using (id = auth.uid());
