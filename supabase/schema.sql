-- Tadashi Board v2: Supabase セットアップ（SQL Editor で実行）
-- 最新 3 件のみ保持し、古い行と Storage 画像を自動削除

-- ========== テーブル ==========
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  message text not null default '',
  image_path text,
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

drop policy if exists "posts_select_all" on public.posts;
create policy "posts_select_all"
  on public.posts for select
  to anon, authenticated
  using (true);

drop policy if exists "posts_insert_anon" on public.posts;
create policy "posts_insert_anon"
  on public.posts for insert
  to anon, authenticated
  with check (char_length(message) <= 2000);

drop policy if exists "posts_delete_anon" on public.posts;
create policy "posts_delete_anon"
  on public.posts for delete
  to anon, authenticated
  using (true);

-- ========== Storage バケット（公開読取） ==========
insert into storage.buckets (id, name, public)
values ('board-images', 'board-images', true)
on conflict (id) do update set public = true;

drop policy if exists "board_images_select" on storage.objects;
create policy "board_images_select"
  on storage.objects for select
  to public
  using (bucket_id = 'board-images');

drop policy if exists "board_images_insert" on storage.objects;
create policy "board_images_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'board-images');

drop policy if exists "board_images_delete" on storage.objects;
create policy "board_images_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'board-images');

-- ========== 4 件目以降を削除（DB行のみ。Storage 削除は JS 側が担当） ==========
-- NOTE: storage.objects を SQL から直接 DELETE するとエラーになるため、
--       JS 側（Storage API 経由）でオブジェクトを削除してからこちらが呼ばれる設計。
create or replace function public.trim_posts_keep_three()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- DB 行だけ削除（Storage ファイルは JS 側が削除済み）
  delete from public.posts
  where id in (
    select id from public.posts
    order by created_at desc
    offset 3
  );
  return new;
end;
$$;

drop trigger if exists posts_after_insert_trim on public.posts;
create trigger posts_after_insert_trim
  after insert on public.posts
  for each row
  execute function public.trim_posts_keep_three();

-- ========== 管理画面「表示をクリア」（DB行削除のみ。Storage 削除は JS 側） ==========
create or replace function public.clear_all_posts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- DB 行だけ削除（Storage ファイルは JS 側が Storage API で削除済み）
  delete from public.posts;
end;
$$;

grant execute on function public.clear_all_posts() to anon, authenticated;

