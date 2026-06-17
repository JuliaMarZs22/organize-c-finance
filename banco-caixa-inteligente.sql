-- ============================================================
--  Caixa Inteligente — banco de dados (Supabase / PostgreSQL)
--  Cole isto no SQL Editor do Supabase e rode uma vez.
--  O isolamento por cliente é garantido pelo Row-Level Security
--  no fim do arquivo: cada cliente só enxerga os próprios dados.
-- ============================================================

-- ----------- 1. CLIENTES (cada conta = um "tenant") -----------
create table clientes (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text not null,
  telefone      text unique not null,          -- chave que o bot usa pra achar o cliente
  tipo          text not null default 'pessoa' -- 'pessoa' ou 'empreendedor'
                check (tipo in ('pessoa', 'empreendedor')),
  saldo_inicial numeric(12,2) not null default 0,
  reserva_meses int not null default 1,        -- meses de custo fixo guardados de reserva
  criado_em     timestamptz not null default now()
);

-- ----------- 2. CATEGORIAS (personalizáveis por cliente) -----------
-- É aqui que entra o "comida da rua como a pessoa definir".
create table categorias (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome       text not null,
  tipo       text not null check (tipo in ('entrada', 'saida')),
  criado_em  timestamptz not null default now(),
  unique (cliente_id, nome, tipo)
);

-- ----------- 3. DESPESAS FIXAS (base da projeção do empreendedor) -----------
create table despesas_fixas (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome       text not null,
  valor      numeric(12,2) not null,
  criado_em  timestamptz not null default now()
);

-- ----------- 4. LANCAMENTOS (o coração: entradas e saídas) -----------
create table lancamentos (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references clientes(id) on delete cascade,
  tipo          text not null check (tipo in ('entrada', 'saida')),
  valor         numeric(12,2) not null check (valor > 0),  -- valor JÁ por parcela
  categoria     text not null,
  descricao     text,
  data          date not null,                 -- mês/ano define em qual mês cai a parcela
  fixa          boolean not null default false,
  -- controle de venda parcelada (ex.: 10 mil em 5x -> 5 linhas de 2 mil):
  grupo_parcela uuid,                           -- mesmo id liga as parcelas da mesma venda
  parcela_atual int,                            -- 1, 2, 3...
  parcela_total int,                            -- total de parcelas
  origem        text not null default 'whatsapp' -- 'whatsapp' ou 'manual'
                check (origem in ('whatsapp', 'manual')),
  criado_em     timestamptz not null default now()
);

create index idx_lancamentos_cliente_data on lancamentos (cliente_id, data);

-- ============================================================
--  ISOLAMENTO POR CLIENTE (Row-Level Security)
--  Com isto ligado, um cliente logado no dashboard NUNCA
--  consegue ler ou gravar a linha de outro — o próprio banco
--  bloqueia, mesmo que houvesse um bug no código.
--  Obs.: o bot do WhatsApp escreve usando a "service_role key",
--  que passa por cima do RLS, mas no código ele SEMPRE grava
--  com o cliente_id correto, resolvido pelo telefone.
-- ============================================================
alter table clientes       enable row level security;
alter table categorias     enable row level security;
alter table despesas_fixas enable row level security;
alter table lancamentos    enable row level security;

create policy "cliente vê o próprio cadastro"
  on clientes for all using (id = auth.uid());

create policy "cliente vê as próprias categorias"
  on categorias for all using (cliente_id = auth.uid());

create policy "cliente vê as próprias despesas fixas"
  on despesas_fixas for all using (cliente_id = auth.uid());

create policy "cliente vê os próprios lançamentos"
  on lancamentos for all using (cliente_id = auth.uid());
