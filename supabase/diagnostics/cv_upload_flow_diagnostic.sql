-- CV upload flow diagnostic
-- Run this in the Supabase SQL editor. It does not mutate data.

-- 1) Latest primary/master CV row per user, with a text hash so you can compare
-- whether two accounts really point at identical parsed CV content.
with ranked_docs as (
  select
    d.*,
    row_number() over (
      partition by d.user_id, d.type
      order by d.updated_at desc nulls last, d.created_at desc nulls last
    ) as rn
  from public.documents d
  where d.type in ('primary_cv', 'master_cv')
)
select
  u.email,
  rd.user_id,
  rd.type,
  rd.file_name,
  rd.storage_path,
  length(coalesce(rd.raw_text, '')) as raw_text_chars,
  md5(coalesce(rd.raw_text, '')) as raw_text_md5,
  rd.created_at,
  rd.updated_at
from ranked_docs rd
left join auth.users u on u.id = rd.user_id
where rd.rn = 1
order by u.email nulls last, rd.type;

-- 2) Duplicate document rows. Ideally this returns zero rows.
-- If duplicates exist, the app currently chooses the newest row by created_at.
select
  u.email,
  d.user_id,
  d.type,
  count(*) as row_count,
  array_agg(d.file_name order by d.updated_at desc nulls last, d.created_at desc nulls last) as file_names,
  array_agg(d.id order by d.updated_at desc nulls last, d.created_at desc nulls last) as document_ids
from public.documents d
left join auth.users u on u.id = d.user_id
where d.type in ('primary_cv', 'master_cv')
group by u.email, d.user_id, d.type
having count(*) > 1
order by row_count desc, u.email nulls last, d.type;

-- 3) Storage-path ownership check. Ideally this returns zero rows.
-- A row here means documents.storage_path is not under {user_id}/{type}/...
select
  u.email,
  d.user_id,
  d.type,
  d.file_name,
  d.storage_path,
  case
    when d.storage_path is null then 'missing_storage_path'
    when split_part(d.storage_path, '/', 1) <> d.user_id::text then 'path_user_mismatch'
    when split_part(d.storage_path, '/', 2) <> d.type then 'path_type_mismatch'
    else 'ok'
  end as issue
from public.documents d
left join auth.users u on u.id = d.user_id
where d.type in ('primary_cv', 'master_cv')
  and (
    d.storage_path is null
    or split_part(d.storage_path, '/', 1) <> d.user_id::text
    or split_part(d.storage_path, '/', 2) <> d.type
  )
order by u.email nulls last, d.type;

-- 4) RLS and policy check for the documents table.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'documents';

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'documents'
order by policyname;

-- 5) Constraint/index check. Ideally there is a unique constraint or unique index
-- on (user_id, type), so each account has one primary CV and one master CV.
select
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.documents'::regclass
order by conname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'documents'
order by indexname;

-- 6) CV storage objects grouped by folder. This helps confirm files are separated
-- by account id and document type.
select
  bucket_id,
  split_part(name, '/', 1) as path_user_id,
  split_part(name, '/', 2) as path_document_type,
  count(*) as object_count,
  max(updated_at) as newest_object_at
from storage.objects
where bucket_id in ('cv-files', 'profile-photos')
group by bucket_id, split_part(name, '/', 1), split_part(name, '/', 2)
order by bucket_id, newest_object_at desc nulls last;
