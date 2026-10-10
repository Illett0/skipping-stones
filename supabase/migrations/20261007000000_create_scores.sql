-- 石切りゲームのスコア
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(player_name) between 1 and 20),
  stage_id text not null check (stage_id in ('mountain-stream', 'great-river', 'misty-gorge')),
  bounces integer not null check (bounces between 0 and 200),
  distance real not null check (distance >= 0 and distance < 1000),
  weather text not null check (weather in ('sunny', 'cloudy', 'rainy')),
  created_at timestamptz not null default now()
);

create index if not exists scores_stage_rank_idx on public.scores (stage_id, bounces desc, distance desc);

alter table public.scores enable row level security;

-- 誰でもランキングを閲覧できる
create policy "scores are viewable by everyone"
  on public.scores for select
  to anon, authenticated
  using (true);

-- 誰でも記録を追加できる（更新・削除は不可）
create policy "anyone can insert a score"
  on public.scores for insert
  to anon, authenticated
  with check (true);
