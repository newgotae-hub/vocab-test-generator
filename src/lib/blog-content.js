export const SITE_URL = 'https://voca.plus';
export const SITE_NAME = '평가원기출VOCA';
export const BLOG_INDEX_URL = `${SITE_URL}/blog/`;
export const DEFAULT_SOCIAL_IMAGE_URL = `${SITE_URL}/assets/images/thumbnail-20260224-1.jpg`;
export const DEFAULT_SOCIAL_IMAGE_ALT = '평가원기출VOCA 대표 이미지';

export const BLOG_SELECT_FIELDS = [
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

export const BLOG_IMAGE_BLOCK_PATTERN = /^!\[(.*?)\]\((.+?)\)$/;

export const BLOG_LEGACY_SLUG_ALIASES = Object.freeze({
    'priority-before-volume': 'coverage-before-difficulty',
    'density-of-50': 'spacing-beats-cramming',
    'live-public-features': 'form-meaning-use',
});

const FALLBACK_BLOG_POSTS = [
    {
        id: 'fallback-coverage-before-difficulty',
        slug: 'coverage-before-difficulty',
        category: '학습 전략',
        title: '단어를 많이 외웠는데도 독해가 막히는 이유: 98% 이해 가능한 범위부터 만들기',
        summary: '독해는 어려운 단어 몇 개보다 모르는 단어 비율에 더 크게 좌우됩니다. 수능 단어 공부를 95%에서 98% 이해 가능 범위로 끌어올리는 설계법을 정리합니다.',
        content: [
            '수능 단어 공부가 길어질수록 학생들은 더 어려운 단어를 찾습니다. 그런데 실제 독해 체감은 희귀 단어를 몇 개 아느냐보다 지문에서 모르는 단어가 몇 퍼센트인가에 더 크게 좌우됩니다. Paul Nation(2006)은 도움 없이 읽으려면 대체로 98% 수준의 어휘 커버리지가 필요하다고 봤고, Schmitt, Jiang, Grabe(2011)도 학술 텍스트에서는 98%가 더 현실적인 목표라고 정리했습니다.',
            '이 숫자를 시험 공부로 번역하면 분명해집니다. 하루에 새로운 어려운 단어 40개를 추가하는 것보다, 자주 나오는 기본 어휘와 결합 표현을 먼저 안정화해 모르는 단어가 드문 지문을 만드는 편이 점수에 더 직접적입니다. 독해는 한 문장마다 막히지 않을 때 속도, 추론, 오답 제거가 같이 살아나기 때문입니다.',
            '그래서 단어장은 난도순보다 우선순위순으로 다시 정리할 필요가 있습니다. 첫 번째 층은 빈도와 출제 재등장 가능성이 높은 핵심 어휘, 두 번째 층은 그 핵심 어휘와 같이 움직이는 파생어와 결합 표현, 세 번째 층은 시간 여유가 있을 때 확장할 저빈도 어휘입니다. 이 순서가 바뀌면 공부량은 많은데도 체감 실력이 느리게 오릅니다.',
            '실전에서는 다 아는 지문과 모르는 단어 투성이 지문 사이를 오가게 하지 말고, 한 주 단위로 범위를 고정하는 편이 좋습니다. 예를 들어 이번 주에는 한 챕터의 핵심 표제어와 파생어만 정하고, 그 범위로 시험지와 온라인 테스트를 반복해 같은 단어가 여러 문항 맥락에서 다시 나오게 해야 합니다. 범위가 고정돼야 기억도 누적됩니다.',
            '독해용 단어 공부의 목표는 단어장 완독이 아니라, 지문을 읽을 때 모르는 단어가 추론 가능한 소수로 줄어드는 상태를 만드는 것입니다. 95%에서 98%로 가는 마지막 몇 퍼센트가 체감 난도를 크게 바꿉니다. 바로 그 구간을 빠르게 메우는 방식이 수능형 어휘 공부의 핵심입니다.',
            '평가원기출VOCA가 범위 선택과 반복 테스트를 먼저 두는 이유도 여기 있습니다. 사용자가 막연하게 어려운 단어를 더 보는 방향으로 새지 않게 하고, 실제 이해율을 올리는 핵심 범위를 먼저 잠그도록 돕기 위해서입니다.',
        ].join('\n\n'),
        authorName: '평가원기출VOCA',
        coverImageUrl: '',
        coverImageAlt: '',
        publishedAt: '2026-02-24T00:00:00+09:00',
        createdAt: '2026-02-24T00:00:00+09:00',
        updatedAt: '2026-02-24T00:00:00+09:00',
    },
    {
        id: 'fallback-spacing-beats-cramming',
        slug: 'spacing-beats-cramming',
        category: '기억과 복습',
        title: '벼락암기가 오래 안 가는 이유: 단어 복습은 횟수보다 간격으로 설계해야 합니다',
        summary: '같은 30분이라도 몰아서 보는 복습보다 간격을 둔 인출 연습이 훨씬 오래 남습니다. 단어 복습을 시험일까지 역산해 짜는 방법을 설명합니다.',
        content: [
            '단어를 외운 직후에는 다 안다고 느끼는데 일주일 뒤에 거의 남지 않는 이유는, 봤다는 감각과 꺼낼 수 있다는 기억이 다르기 때문입니다. Karpicke와 Roediger(2008)는 외국어 어휘 실험에서 한 번 맞힌 뒤 계속 다시 읽게 하는 것보다, 다시 떠올리게 만드는 테스트가 지연 회상에 더 큰 효과를 낸다고 보였습니다.',
            '여기에 spacing effect가 붙습니다. Cepeda 등(2006, 2008)은 복습 간격이 길수록 무조건 좋은 것이 아니라, 최종적으로 얼마 동안 기억해야 하느냐에 따라 최적 간격이 달라진다고 정리했습니다. 짧은 시험을 앞뒀다면 짧은 간격 복습이, 한 달 이상 가져가야 한다면 더 벌어진 간격 복습이 유리합니다.',
            '즉 수능 단어 복습은 오늘 5회 보기가 아니라 시험일까지 몇 번, 언제 다시 꺼낼지를 먼저 정해야 합니다. 내신 전 2주면 Day 0, 1, 3, 7, 12 식으로 짧게 가져가고, 모의고사나 수능 대비처럼 더 길게 가려면 Day 0, 2, 6, 14, 30 식으로 간격을 벌리는 편이 효율적입니다. 중요한 것은 매 회차마다 다시 읽는 시간이 아니라, 답을 먼저 떠올리는 시간이 있어야 한다는 점입니다.',
            '최근 Belardi 등(2021)의 웹 어휘 학습 연구도 이 원리를 실전형으로 보여줍니다. spacing, corrective feedback, testing을 함께 설계했을 때 비최적 조건보다 학습량이 29% 높아졌습니다. 결국 좋은 단어 시스템은 예쁜 카드보다, 언제 틀리게 만들고 언제 바로잡아 줄지를 더 정교하게 설계합니다.',
            '학생 개인 공부로 바꾸면 원칙은 단순합니다. 첫째, 새 단어를 본 날에는 의미를 익힌 뒤 바로 가벼운 퀴즈를 봅니다. 둘째, 다음 복습부터는 뜻 가리기, 예문 빈칸, 파생어 묻기처럼 인출이 들어가야 합니다. 셋째, 틀린 단어만 따로 모아 더 짧은 간격으로 재배치합니다. 넷째, 마지막에는 섞인 누적 테스트로 범위를 무작위화해야 실전 전환이 됩니다.',
            '벼락암기가 매번 매력적인 이유는 공부한 직후의 자신감을 크게 주기 때문입니다. 하지만 시험장에서 필요한 것은 익숙함이 아니라 재생 능력입니다. 복습표를 짤 때 몇 번 읽을까보다 언제 다시 꺼내서 맞혀 보게 할까를 먼저 적어두면, 같은 시간으로도 기억의 수명이 훨씬 길어집니다.',
        ].join('\n\n'),
        authorName: '평가원기출VOCA',
        coverImageUrl: '',
        coverImageAlt: '',
        publishedAt: '2026-02-27T00:00:00+09:00',
        createdAt: '2026-02-27T00:00:00+09:00',
        updatedAt: '2026-02-27T00:00:00+09:00',
    },
    {
        id: 'fallback-form-meaning-use',
        slug: 'form-meaning-use',
        category: '어휘 설계',
        title: '뜻만 아는 단어는 시험장에서 흔들립니다: form-meaning-use로 외워야 하는 이유',
        summary: '단어의 한국어 뜻 한 줄만 외우면 문장 안에서 다시 무너집니다. 표제어, 쓰임, 결합을 함께 묶어 기억하는 방식이 왜 필요한지 정리합니다.',
        content: [
            '많은 학생이 단어를 영어 단어 = 한국어 뜻 한 줄로 저장합니다. 그런데 실제 문항은 그 단어의 품사, 함께 붙는 전치사, 자연스러운 결합, 문맥 속 뉘앙스까지 묻습니다. 뜻만 아는 상태는 입구를 통과한 것일 뿐, 실전에 필요한 어휘 지식이 완성된 것은 아닙니다.',
            'Stuart Webb의 연구는 이 점을 꽤 선명하게 보여줍니다. Webb(2005)는 단어 지식을 의미와 형태만이 아니라 철자, 문법 기능, 연상, 사용 방식 등 여러 측면으로 나눠 봐야 한다고 제시했고, Webb(2007)은 단어를 한 번 문맥 속 문장에서 본 것만으로는 별도 단어쌍 학습보다 뚜렷한 우위를 만들지 못한다고 보고했습니다. 문맥은 중요하지만, 한두 번 스쳐 보는 것만으로 깊은 어휘 지식이 저절로 생기지는 않는다는 뜻입니다.',
            '같은 연구 흐름에서 Webb(2007)은 반복 노출 횟수가 늘수록 적어도 일부 어휘 지식은 계속 좋아졌지만, 10번 정도의 만남만으로 완전한 단어 지식이 끝나는 것은 아니라고 말합니다. 학생 입장에서는 단어를 여러 번 본 사실보다, 매번 무엇을 확인했는지가 더 중요합니다.',
            '그래서 단어 하나를 외울 때는 최소한 세 층으로 기록하는 편이 좋습니다. 첫째는 headword와 가장 핵심적인 뜻, 둘째는 자주 붙는 결합과 예문 틀, 셋째는 헷갈리는 파생어, 유의어, 반의어입니다. 예를 들어 reduce를 외울 때 줄이다만 적어두면 약하지만, reduce A to B, reduce costs, reduction, be reduced to까지 묶으면 문장 안에서 훨씬 단단해집니다.',
            '복습 방식도 이에 맞춰 달라져야 합니다. 1회차는 뜻 회상, 2회차는 예문 빈칸, 3회차는 품사나 파생어 변형, 4회차는 헷갈리는 단어와 대조하는 식으로 같은 표제어를 여러 각도에서 다시 꺼내야 합니다. 한 단어를 여러 문항으로 찢어 보는 이유가 여기에 있습니다.',
            '결국 오래 남는 어휘 공부는 단어장을 더 두껍게 만드는 작업이 아니라, 한 단어를 더 입체적으로 저장하는 작업입니다. 뜻 한 줄 암기에서 멈추지 않고 form, meaning, use를 같이 묶으면 독해와 빈칸, 어법, 서술형까지 훨씬 안정적으로 연결됩니다.',
        ].join('\n\n'),
        authorName: '평가원기출VOCA',
        coverImageUrl: '',
        coverImageAlt: '',
        publishedAt: '2026-03-02T00:00:00+09:00',
        createdAt: '2026-03-02T00:00:00+09:00',
        updatedAt: '2026-03-02T00:00:00+09:00',
    },
];

const FALLBACK_POSTS_BY_SLUG = new Map(FALLBACK_BLOG_POSTS.map((post) => [post.slug, post]));

export const normalizeSpacingText = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/\uFEFF/g, '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

export const resolveCanonicalBlogSlug = (value) => {
    const normalized = normalizeSpacingText(value).toLowerCase();
    return BLOG_LEGACY_SLUG_ALIASES[normalized] || normalized;
};

export const mapBlogPost = (row) => ({
    id: normalizeSpacingText(row?.id),
    slug: resolveCanonicalBlogSlug(row?.slug),
    category: normalizeSpacingText(row?.category) || '블로그',
    title: normalizeSpacingText(row?.title),
    summary: normalizeSpacingText(row?.summary),
    content: String(row?.content || '').trim(),
    authorName: normalizeSpacingText(row?.author_name || row?.authorName) || SITE_NAME,
    coverImageUrl: normalizeSpacingText(row?.cover_image_url || row?.coverImageUrl),
    coverImageAlt: normalizeSpacingText(row?.cover_image_alt || row?.coverImageAlt),
    publishedAt: normalizeSpacingText(row?.published_at || row?.publishedAt),
    createdAt: normalizeSpacingText(row?.created_at || row?.createdAt),
    updatedAt: normalizeSpacingText(row?.updated_at || row?.updatedAt),
});

const upgradeLegacySeededPost = (post) => {
    const legacySlug = normalizeSpacingText(post?.slug).toLowerCase();
    const canonicalSlug = BLOG_LEGACY_SLUG_ALIASES[legacySlug];
    if (!canonicalSlug) return mapBlogPost(post);

    const fallback = FALLBACK_POSTS_BY_SLUG.get(canonicalSlug);
    if (!fallback) return mapBlogPost(post);

    return mapBlogPost({
        ...fallback,
        id: normalizeSpacingText(post?.id) || fallback.id,
        createdAt: normalizeSpacingText(post?.created_at || post?.createdAt) || fallback.createdAt,
        updatedAt: normalizeSpacingText(post?.updated_at || post?.updatedAt) || fallback.updatedAt,
        publishedAt: normalizeSpacingText(post?.published_at || post?.publishedAt) || fallback.publishedAt,
    });
};

export const sortBlogPosts = (posts) => {
    return [...posts].sort((left, right) => {
        const leftTime = new Date(left?.publishedAt || left?.createdAt || 0).getTime();
        const rightTime = new Date(right?.publishedAt || right?.createdAt || 0).getTime();
        return rightTime - leftTime;
    });
};

export const normalizeBlogPosts = (posts) => {
    const bySlug = new Map();

    sortBlogPosts(posts.map(upgradeLegacySeededPost)).forEach((post) => {
        if (!post.slug || bySlug.has(post.slug)) return;
        bySlug.set(post.slug, post);
    });

    return Array.from(bySlug.values());
};

export const getFallbackBlogPosts = () => normalizeBlogPosts(FALLBACK_BLOG_POSTS);

export const getFallbackBlogPostBySlug = (slug) => {
    const canonicalSlug = resolveCanonicalBlogSlug(slug);
    const post = FALLBACK_POSTS_BY_SLUG.get(canonicalSlug);
    return post ? mapBlogPost(post) : null;
};

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

export const getBlogPostUrl = (slug) => `/blog/${encodeURIComponent(resolveCanonicalBlogSlug(slug))}/`;

export const getAbsoluteBlogPostUrl = (slug) => `${SITE_URL}${getBlogPostUrl(slug)}`;

export const estimateBlogReadingMinutes = (content) => {
    const plainText = String(content || '')
        .replace(/!\[(.*?)\]\((.+?)\)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!plainText) return 1;
    return Math.max(1, Math.ceil(plainText.length / 260));
};

export const parseBlogContentBlocks = (content) => {
    return String(content || '')
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => {
            const imageMatch = block.match(BLOG_IMAGE_BLOCK_PATTERN);
            if (imageMatch) {
                const [, alt, src] = imageMatch;
                return {
                    type: 'image',
                    alt: normalizeSpacingText(alt || '본문 이미지'),
                    src: normalizeSpacingText(src),
                };
            }

            return {
                type: 'paragraph',
                text: block,
            };
        });
};

export const getBlogPostCoverImage = (post) => ({
    url: normalizeSpacingText(post?.coverImageUrl) || DEFAULT_SOCIAL_IMAGE_URL,
    alt: normalizeSpacingText(post?.coverImageAlt) || normalizeSpacingText(post?.title) || DEFAULT_SOCIAL_IMAGE_ALT,
});
