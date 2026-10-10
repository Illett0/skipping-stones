-- ランキングの不正対策：記録はサーバー（Next.js の API ルート）が投擲をやり直して検証したものだけを受け付ける

-- ブラウザ（anon キー）からの直接の書き込みを禁止する。
-- 書き込みはサーバーが service_role キーで行い、service_role は RLS を通らない。
drop policy if exists "anyone can insert a score" on public.scores;

-- どのプレイの、何投目の、どの石の記録か
alter table public.scores add column if not exists session_id uuid;
alter table public.scores add column if not exists throw_index integer check (throw_index >= 0);
alter table public.scores add column if not exists stone_serial integer check (stone_serial >= 0);

-- 同じ投擲・同じ石を何度も記録できないようにする
create unique index if not exists scores_session_throw_uniq on public.scores (session_id, throw_index);
create unique index if not exists scores_session_stone_uniq on public.scores (session_id, stone_serial);

-- 閲覧は今まで通り誰でも可能（"scores are viewable by everyone" ポリシーはそのまま）
