insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'blog-images',
    'blog-images',
    true,
    10485760,
    array[
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/svg+xml'
    ]::text[]
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "blog images are publicly readable" on storage.objects;
create policy "blog images are publicly readable"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'blog-images');

drop policy if exists "blog images are insertable by blog admin only" on storage.objects;
create policy "blog images are insertable by blog admin only"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'blog-images'
    and public.is_blog_admin()
);

drop policy if exists "blog images are updatable by blog admin only" on storage.objects;
create policy "blog images are updatable by blog admin only"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'blog-images'
    and public.is_blog_admin()
)
with check (
    bucket_id = 'blog-images'
    and public.is_blog_admin()
);

drop policy if exists "blog images are deletable by blog admin only" on storage.objects;
create policy "blog images are deletable by blog admin only"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'blog-images'
    and public.is_blog_admin()
);
