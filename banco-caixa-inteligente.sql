-- ============================================================
--  Organize-C Finance — banco de dados COMPLETO (Supabase / PostgreSQL)
--  Cole no SQL Editor do Supabase e rode UMA VEZ.
--  Este arquivo é auto-suficiente: inclui todas as tabelas,
--  colunas extras e políticas necessárias para o sistema inteiro.
-- ============================================================

-- ----------- 1. CLIENTES (cada conta = um "tenant") -----------
create table if not exists clientes (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text not null,
  telefone      text unique not null,
  tipo          text not null default 'pessoa'
                check (tipo in ('pessoa', 'empreendedor')),
  saldo_inicial numeric(12,2) not null default 0,
  reserva_meses int not null default 1,
  email         text,
  plano         text,
  status        text default 'ativo',
  planilha_url  text,
  criado_em     timestamptz not null default now()
);

-- ----------- 2. CATEGORIAS (personalizáveis por cliente) -----------
create table if not exists categorias (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome       text not null,
  tipo       text not null check (tipo in ('entrada', 'saida')),
  criado_em  timestamptz not null default now(),
  unique (cliente_id, nome, tipo)
);

-- ----------- 3. DESPESAS FIXAS (base da projeção) -----------
create table if not exists despesas_fixas (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome       text not null,
  valor      numeric(12,2) not null,
  ativa      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- ----------- 4. LANCAMENTOS (entradas e saídas) -----------
create table if not exists lancamentos (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references clientes(id) on delete cascade,
  tipo          text not null check (tipo in ('entrada', 'saida')),
  valor         numeric(12,2) not null check (valor > 0),
  categoria     text not null,
  descricao     text,
  data          date not null,
  fixa          boolean not null default false,
  grupo_parcela uuid,
  parcela_atual int,
  parcela_total int,
  origem        text not null default 'whatsapp'
                check (origem in ('whatsapp', 'manual')),
  criado_em     timestamptz not null default now()
);

create index if not exists idx_lancamentos_cliente_data on lancamentos (cliente_id, data);

-- ----------- 5. GOOGLE CREDENTIALS (tokens por cliente) -----------
-- Sem RLS "para usuário" = apenas service_role acessa. O refresh_token
-- nunca é exposto ao front; só o backend (drive-backend.js) lê/grava.
create table if not exists google_creds (
  cliente_id    uuid primary key references clientes(id) on delete cascade,
  refresh_token text,
  planilha_id   text
);
alter table google_creds enable row level security;
-- Sem policy = nenhum usuário autenticado acessa diretamente. Só service_role.

-- ----------- 6. ADMINS -----------
create table if not exists admins (
  email text primary key
);
alter table admins enable row level security;
create policy "cada admin vê o próprio registro"
  on admins for select
  using (email = auth.jwt()->>'email');

-- ----------- 7. ROW-LEVEL SECURITY -----------
alter table clientes       enable row level security;
alter table categorias     enable row level security;
alter table despesas_fixas enable row level security;
alter table lancamentos    enable row level security;

-- Cliente vê apenas os próprios dados
create policy "cliente vê o próprio cadastro"
  on clientes for all using (id = auth.uid());

-- Admin também vê todos os clientes (para o painel admin)
create policy "admin lê todos os clientes"
  on clientes for select
  using (exists (select 1 from admins a where a.email = auth.jwt()->>'email'));

create policy "cliente vê as próprias categorias"
  on categorias for all using (cliente_id = auth.uid());

create policy "cliente vê as próprias despesas fixas"
  on despesas_fixas for all using (cliente_id = auth.uid());

create policy "cliente vê os próprios lançamentos"
  on lancamentos for all using (cliente_id = auth.uid());

-- ----------- 8. INSERIR SEU ADMIN -----------
-- Troque pelo e-mail que você usa para acessar o painel admin:
-- insert into admins (email) values ('SEU-EMAIL-ADMIN@dominio.com');
