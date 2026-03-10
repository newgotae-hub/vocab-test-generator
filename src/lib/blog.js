import { supabase } from '/src/lib/supabaseClient.js';

const BLOG_SELECT_FIELDS = [
    'id',
    'slug',
    'category',
    'title',
    'summary',
    'content',
    'author_name',
    'cover_image_url',
    'cover_image_alt',
    'published_at',
    'created_at',
    'updated_at',
].join(', ');

const FALLBACK_BLOG_POSTS = [
    {
        id: 'fallback-priority-before-volume',
        slug: 'priority-before-volume',
        category: '학습 전략',
        title: '수능 영어 단어는 "많이"보다 "먼저"가 중요합니다',
        summary: '난도보다 우선순위를 먼저 세우는 학습법이 실제 점수에 더 가깝습니다.',
        content: [
            '단어 암기에서 가장 흔한 실패는 난도가 높은 단어를 앞쪽에 배치하는 것입니다. 평가원기출VOCA는 최근 20년 기출을 기준으로 먼저 익혀야 할 단어와 뒤로 미뤄도 되는 단어를 분리해 학습 우선순위를 만듭니다.',
            '실제 학습에서는 하루 분량을 작게 나누고, 같은 범위를 시험지와 온라인 테스트로 반복하는 것이 효율적입니다. 눈으로 읽고 끝내는 방식보다 문제 풀이와 즉시 채점을 함께 돌리는 편이 기억 유지율이 높습니다.',
            '이 블로그에서는 단순 홍보 글보다 학습 순서, 범위 설정법, 오답 복습법처럼 실제 사용자가 바로 적용할 수 있는 정보를 중심으로 정리합니다.',
        ].join('\n\n'),
        authorName: '평가원기출VOCA',
        coverImageUrl: '',
        coverImageAlt: '',
        publishedAt: '2026-02-24T00:00:00+09:00',
        createdAt: '2026-02-24T00:00:00+09:00',
        updatedAt: '2026-02-24T00:00:00+09:00',
    },
    {
        id: 'fallback-density-of-50',
        slug: 'density-of-50',
        category: '데이터 인사이트',
        title: '범위 선택이 중요한 이유: 같은 50문항이어도 밀도가 다릅니다',
        summary: '같은 시간으로 더 높은 출제 확률을 덮으려면 어떤 50개를 먼저 보느냐가 중요합니다.',
        content: [
            '기출 기반 단어 학습은 단순히 50개를 외우는 것이 아니라, 어떤 단어 50개를 먼저 보느냐의 문제입니다. 출제 빈도가 높은 묶음을 먼저 확인하면 같은 시간으로도 실제 시험에서 만날 확률이 높은 단어를 더 많이 커버할 수 있습니다.',
            '그래서 서비스 안에서는 교재, DAY, 챕터, 파생어 포함 여부를 먼저 선택하게 설계했습니다. 범위를 명확히 정한 뒤 시험지를 만들거나 온라인 테스트를 시작해야 복습 단위가 흔들리지 않습니다.',
            '앞으로 이 공간에는 교재별 학습 포인트, DAY 조합 추천, 자주 틀리는 유형 같은 운영 데이터도 순차적으로 정리할 예정입니다.',
        ].join('\n\n'),
        authorName: '평가원기출VOCA',
        coverImageUrl: '',
        coverImageAlt: '',
        publishedAt: '2026-02-27T00:00:00+09:00',
        createdAt: '2026-02-27T00:00:00+09:00',
        updatedAt: '2026-02-27T00:00:00+09:00',
    },
    {
        id: 'fallback-live-public-features',
        slug: 'live-public-features',
        category: '서비스 업데이트',
        title: '현재 운영 중인 기능과 비공개 기능을 분리했습니다',
        summary: '사용자가 바로 쓸 수 있는 기능만 남기고, 실제 운영 범위를 더 선명하게 정리했습니다.',
        content: [
            '이번 개편에서 실제로 이용 가능한 기능만 대시보드와 메뉴에 남기고, 비공개 기능은 별도 안내 페이지로 분리했습니다. 로그인, 인증, 리다이렉트, 준비 중 화면처럼 콘텐츠가 없는 단계에는 광고가 노출되지 않도록 구조도 함께 정리했습니다.',
            '현재 안정적으로 제공하는 기능은 시험지 만들기, 온라인 테스트, 마이페이지입니다. 사용자가 즉시 학습을 시작하고 결과를 복습할 수 있는 영역만 우선 운영합니다.',
            '서비스 변경 사항은 앞으로도 이 페이지에서 날짜와 함께 기록해 공개하겠습니다.',
        ].join('\n\n'),
        authorName: '평가원기출VOCA',
        coverImageUrl: '',
        coverImageAlt: '',
        publishedAt: '2026-03-02T00:00:00+09:00',
        createdAt: '2026-03-02T00:00:00+09:00',
        updatedAt: '2026-03-02T00:00:00+09:00',
    },
];

const normalizeSpacingText = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/\uFEFF/g, '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const parseBooleanLike = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const normalized = normalizeSpacingText(value).toLowerCase();
    if (!normalized) return false;
    return ['1', 'true', 'yes', 'y', 'admin', 'enabled', 'on'].includes(normalized);
};

const sortPosts = (posts) => {
    return [...posts].sort((left, right) => {
        const leftTime = new Date(left.publishedAt || left.createdAt || 0).getTime();
        const rightTime = new Date(right.publishedAt || right.createdAt || 0).getTime();
        return rightTime - leftTime;
    });
};

const mapBlogPost = (row) => ({
    id: normalizeSpacingText(row?.id),
    slug: normalizeSpacingText(row?.slug),
    category: normalizeSpacingText(row?.category) || '블로그',
    title: normalizeSpacingText(row?.title),
    summary: normalizeSpacingText(row?.summary),
    content: String(row?.content || '').trim(),
    authorName: normalizeSpacingText(row?.author_name || row?.authorName) || '평가원기출VOCA',
    coverImageUrl: normalizeSpacingText(row?.cover_image_url || row?.coverImageUrl),
    coverImageAlt: normalizeSpacingText(row?.cover_image_alt || row?.coverImageAlt),
    publishedAt: normalizeSpacingText(row?.published_at || row?.publishedAt),
    createdAt: normalizeSpacingText(row?.created_at || row?.createdAt),
    updatedAt: normalizeSpacingText(row?.updated_at || row?.updatedAt),
});

export const getFallbackBlogPosts = () => sortPosts(FALLBACK_BLOG_POSTS).map(mapBlogPost);

export const slugifyBlogText = (value) => {
    const normalized = normalizeSpacingText(value)
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return normalized || `post-${Date.now()}`;
};

export const formatBlogDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    }).format(date);
};

export const getBlogPostUrl = (slug) => `/blog/?slug=${encodeURIComponent(slug)}`;

export const isBlogAdminUser = (user) => {
    if (!user || typeof user !== 'object') return false;

    const appMetadata = user.app_metadata || {};
    const roles = Array.isArray(appMetadata.roles) ? appMetadata.roles : [];

    if (roles.some((role) => normalizeSpacingText(role).toLowerCase() === 'admin')) {
        return true;
    }

    const roleFields = [
        appMetadata.role,
        appMetadata.blog_role,
    ];
    if (roleFields.some((role) => normalizeSpacingText(role).toLowerCase() === 'admin')) {
        return true;
    }

    const adminFlags = [
        appMetadata.is_admin,
        appMetadata.blog_admin,
        appMetadata.is_blog_admin,
    ];
    return adminFlags.some(parseBooleanLike);
};

export const listBlogPosts = async () => {
    try {
        const { data, error } = await supabase
            .from('blog_posts')
            .select(BLOG_SELECT_FIELDS)
            .order('published_at', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (!Array.isArray(data) || !data.length) {
            return getFallbackBlogPosts();
        }
        return data.map(mapBlogPost);
    } catch (error) {
        console.warn('[blog] falling back to bundled posts', error);
        return getFallbackBlogPosts();
    }
};

export const createBlogPost = async (input) => {
    const title = normalizeSpacingText(input?.title);
    const summary = normalizeSpacingText(input?.summary);
    const category = normalizeSpacingText(input?.category) || '블로그';
    const content = String(input?.content || '').trim();
    const slug = slugifyBlogText(input?.slug || title);
    const authorName = normalizeSpacingText(input?.authorName) || '평가원기출VOCA';
    const coverImageUrl = normalizeSpacingText(input?.coverImageUrl);
    const coverImageAlt = normalizeSpacingText(input?.coverImageAlt);

    if (!title || !summary || !content) {
        throw new Error('카테고리 외 필수 항목을 모두 입력해 주세요.');
    }

    const payload = {
        slug,
        category,
        title,
        summary,
        content,
        author_name: authorName,
        cover_image_url: coverImageUrl || null,
        cover_image_alt: coverImageAlt || null,
    };

    const { data, error } = await supabase
        .from('blog_posts')
        .insert(payload)
        .select(BLOG_SELECT_FIELDS)
        .single();

    if (error) {
        if (error.code === '23505') {
            throw new Error('같은 slug가 이미 있습니다. slug를 바꿔서 다시 저장해 주세요.');
        }
        if (error.code === '42501') {
            throw new Error('관리자 권한이 있는 계정만 글을 작성할 수 있습니다.');
        }
        if (error.code === '42P01') {
            throw new Error('blog_posts 테이블이 아직 배포되지 않았습니다. Supabase migration을 먼저 적용해 주세요.');
        }
        throw new Error(normalizeSpacingText(error.message) || '글 저장에 실패했습니다.');
    }

    return mapBlogPost(data);
};
