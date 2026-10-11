-- 石の見えない当たり外れは、投げた瞬間にサーバーが決める（/api/stone-luck）。
-- 同じプレイの同じ投擲（何投目）で何度も問い合わせて当たりの石を探せないよう、答えた投擲を記録する
create table if not exists public.throw_reveals (
  session_id uuid not null,
  throw_index integer not null check (throw_index >= 0),
  created_at timestamptz not null default now(),
  primary key (session_id, throw_index)
);

-- ブラウザ（anon キー）からは読み書きできない（ポリシーなし）。書き込みはサーバーの service_role だけ
alter table public.throw_reveals enable row level security;
