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

-- ========== 4 件目以降を削除（画像含む） ==========
create or replace function public.trim_posts_keep_three()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  rec record;
begin
  for rec in
    select id, image_path
    from public.posts
    order by created_at desc
    offset 3
  loop
    if rec.image_path is not null and rec.image_path <> '' then
      delete from storage.objects
      where bucket_id = 'board-images' and name = rec.image_path;
    end if;
    delete from public.posts where id = rec.id;
  end loop;
  return new;
end;
$$;

drop trigger if exists posts_after_insert_trim on public.posts;
create trigger posts_after_insert_trim
  after insert on public.posts
  for each row
  execute function public.trim_posts_keep_three();

-- ========== 管理画面「表示をクリア」 ==========
create or replace function public.clear_all_posts()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  rec record;
begin
  for rec in select image_path from public.posts
  loop
    if rec.image_path is not null and rec.image_path <> '' then
      delete from storage.objects
      where bucket_id = 'board-images' and name = rec.image_path;
    end if;
  end loop;
  delete from public.posts;
end;
$$;

grant execute on function public.clear_all_posts() to anon, authenticated;
