-- Ejecuta esto completo en Supabase: panel izquierdo > SQL Editor > New query > pegar > Run

create extension if not exists "pgcrypto";

create table clients (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text,
  telefono text,
  email text,
  frecuencia text default 'Semanal',
  dia_servicio int default 0,
  tarifa numeric default 0,
  notas text,
  created_at timestamptz default now()
);

create table visits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  fecha date not null,
  cloro numeric,
  ph numeric,
  alcalinidad numeric,
  cepillado boolean default false,
  aspirado boolean default false,
  skimmer boolean default false,
  notas text,
  completada boolean default false,
  foto_url text,
  foto_hora timestamptz,
  estado_pago text default 'pendiente',
  monto numeric,
  tecnico text,
  created_at timestamptz default now(),
  unique (client_id, fecha)
);

create table technicians (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null
);

-- Bucket para las fotos de las piscinas (público de lectura, para poder mostrarlas y compartirlas)
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

-- Seguridad: esta app no tiene login de verdad todavía, así que dejamos
-- acceso abierto con la llave pública (anon) para que la app funcione.
-- Esto significa que cualquiera con tu URL y llave anon podría leer/escribir datos.
-- Es aceptable para uso interno de un equipo pequeño; si más adelante
-- quieres restringirlo con cuentas reales, dímelo y lo ajustamos.

alter table clients enable row level security;
alter table visits enable row level security;
alter table technicians enable row level security;

create policy "acceso_publico_clients" on clients for all using (true) with check (true);
create policy "acceso_publico_visits" on visits for all using (true) with check (true);
create policy "acceso_publico_technicians" on technicians for all using (true) with check (true);

create policy "lectura_publica_fotos" on storage.objects for select using (bucket_id = 'fotos');
create policy "escritura_publica_fotos" on storage.objects for insert with check (bucket_id = 'fotos');
create policy "actualizacion_publica_fotos" on storage.objects for update using (bucket_id = 'fotos');
