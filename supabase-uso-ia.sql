-- Log de uso de IA por cliente (custo / COGS por assinante)
create table if not exists public.uso_ia (
  id           bigserial primary key,
  cliente_id   uuid references public.clientes(id) on delete cascade,
  telefone     text,
  tipo         text,            -- 'parse' | 'consulta' | 'diagnostico' | 'whisper'
  modelo       text,
  prompt_tokens     integer default 0,
  completion_tokens integer default 0,
  custo_usd    numeric(12,6) default 0,
  criado_em    timestamptz default now()
);

create index if not exists uso_ia_cliente_idx on public.uso_ia (cliente_id, criado_em desc);

alter table public.uso_ia enable row level security;

-- cada cliente vê apenas o próprio uso (painel usa anon key)
drop policy if exists "cliente_le_proprio_uso" on public.uso_ia;
create policy "cliente_le_proprio_uso" on public.uso_ia
  for select using (cliente_id = auth.uid());

-- o Worker grava com a service key (bypassa RLS automaticamente).
