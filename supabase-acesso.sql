-- Controle de tempo de acesso do cliente (licenças, bônus, bloqueio automático)
-- acesso_ate: data/hora até quando o acesso vale. NULL = ilimitado.
alter table public.clientes add column if not exists acesso_ate timestamptz;
