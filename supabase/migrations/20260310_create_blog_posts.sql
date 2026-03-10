create extension if not exists pgcrypto;

create or replace function public.is_blog_admin()
returns boolean
language sql
stable
as $$
    select coalesce(
        lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'admin'
        or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'blog_role', '')) = 'admin'
        or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'is_admin', '')) in ('1', 'true', 'yes')
        or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'blog_admin', '')) in ('1', 'true', 'yes')
        or exists (
            select 1
            from jsonb_array_elements_text(coalesce(auth.jwt() -> 'app_metadata' -> 'roles', '[]'::jsonb)) as roles(role)
            where lower(roles.role) = 'admin'
        ),
        false
    );
$$;

create or replace function public.touch_blog_posts_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

create table if not exists public.blog_posts (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    category text not null default '블로그',
    title text not null,
    summary text not null,
    content text not null,
    author_name text not null default '평가원기출VOCA',
    cover_image_url text,
    cover_image_alt text,
    published_at timestamptz not null default timezone('utc', now()),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint blog_posts_slug_format check (slug ~ '^[a-z0-9가-힣-]+$'),
    constraint blog_posts_title_length check (char_length(title) between 1 and 120),
    constraint blog_posts_summary_length check (char_length(summary) between 1 and 240),
    constraint blog_posts_content_length check (char_length(content) between 1 and 20000)
);

create index if not exists blog_posts_published_at_idx
    on public.blog_posts (published_at desc);

drop trigger if exists touch_blog_posts_updated_at on public.blog_posts;
create trigger touch_blog_posts_updated_at
before update on public.blog_posts
for each row
execute function public.touch_blog_posts_updated_at();

alter table public.blog_posts enable row level security;

grant select on public.blog_posts to anon, authenticated;
grant insert, update, delete on public.blog_posts to authenticated;

drop policy if exists "blog posts are readable by everyone" on public.blog_posts;
create policy "blog posts are readable by everyone"
on public.blog_posts
for select
to anon, authenticated
using (true);

drop policy if exists "blog posts are writable by admin only" on public.blog_posts;
create policy "blog posts are writable by admin only"
on public.blog_posts
for all
to authenticated
using (public.is_blog_admin())
with check (public.is_blog_admin());

insert into public.blog_posts (
    slug,
    category,
    title,
    summary,
    content,
    author_name,
    published_at
)
values
    (
        'priority-before-volume',
        '학습 전략',
        '수능 영어 단어는 "많이"보다 "먼저"가 중요합니다',
        '난도보다 우선순위를 먼저 세우는 학습법이 실제 점수에 더 가깝습니다.',
        '단어 암기에서 가장 흔한 실패는 난도가 높은 단어를 앞쪽에 배치하는 것입니다. 평가원기출VOCA는 최근 20년 기출을 기준으로 먼저 익혀야 할 단어와 뒤로 미뤄도 되는 단어를 분리해 학습 우선순위를 만듭니다.

실제 학습에서는 하루 분량을 작게 나누고, 같은 범위를 시험지와 온라인 테스트로 반복하는 것이 효율적입니다. 눈으로 읽고 끝내는 방식보다 문제 풀이와 즉시 채점을 함께 돌리는 편이 기억 유지율이 높습니다.

이 블로그에서는 단순 홍보 글보다 학습 순서, 범위 설정법, 오답 복습법처럼 실제 사용자가 바로 적용할 수 있는 정보를 중심으로 정리합니다.',
        '평가원기출VOCA',
        '2026-02-24T00:00:00+09:00'
    ),
    (
        'density-of-50',
        '데이터 인사이트',
        '범위 선택이 중요한 이유: 같은 50문항이어도 밀도가 다릅니다',
        '같은 시간으로 더 높은 출제 확률을 덮으려면 어떤 50개를 먼저 보느냐가 중요합니다.',
        '기출 기반 단어 학습은 단순히 50개를 외우는 것이 아니라, 어떤 단어 50개를 먼저 보느냐의 문제입니다. 출제 빈도가 높은 묶음을 먼저 확인하면 같은 시간으로도 실제 시험에서 만날 확률이 높은 단어를 더 많이 커버할 수 있습니다.

그래서 서비스 안에서는 교재, DAY, 챕터, 파생어 포함 여부를 먼저 선택하게 설계했습니다. 범위를 명확히 정한 뒤 시험지를 만들거나 온라인 테스트를 시작해야 복습 단위가 흔들리지 않습니다.

앞으로 이 공간에는 교재별 학습 포인트, DAY 조합 추천, 자주 틀리는 유형 같은 운영 데이터도 순차적으로 정리할 예정입니다.',
        '평가원기출VOCA',
        '2026-02-27T00:00:00+09:00'
    ),
    (
        'live-public-features',
        '서비스 업데이트',
        '현재 운영 중인 기능과 비공개 기능을 분리했습니다',
        '사용자가 바로 쓸 수 있는 기능만 남기고, 실제 운영 범위를 더 선명하게 정리했습니다.',
        '이번 개편에서 실제로 이용 가능한 기능만 대시보드와 메뉴에 남기고, 비공개 기능은 별도 안내 페이지로 분리했습니다. 로그인, 인증, 리다이렉트, 준비 중 화면처럼 콘텐츠가 없는 단계에는 광고가 노출되지 않도록 구조도 함께 정리했습니다.

현재 안정적으로 제공하는 기능은 시험지 만들기, 온라인 테스트, 마이페이지입니다. 사용자가 즉시 학습을 시작하고 결과를 복습할 수 있는 영역만 우선 운영합니다.

서비스 변경 사항은 앞으로도 이 페이지에서 날짜와 함께 기록해 공개하겠습니다.',
        '평가원기출VOCA',
        '2026-03-02T00:00:00+09:00'
    )
on conflict (slug) do update
set
    category = excluded.category,
    title = excluded.title,
    summary = excluded.summary,
    content = excluded.content,
    author_name = excluded.author_name,
    published_at = excluded.published_at;
