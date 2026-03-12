import { initAuthNavLinks } from '/src/lib/authNav.js';
import { supabase } from '/src/lib/supabaseClient.js';
import {
    createBlogPost,
    formatBlogDate,
    getBlogPostUrl,
    isBlogAdminUser,
    listBlogPosts,
} from '/src/lib/blog.js';

const state = {
    posts: [],
    selectedSlug: '',
    isAdmin: false,
    isComposerOpen: false,
};

const elements = {
    list: document.getElementById('blog-post-list'),
    status: document.getElementById('blog-page-status'),
    adminShell: document.getElementById('blog-admin-shell'),
};

const escapeHtml = (value) => {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const paragraphsToHtml = (content) => {
    const blocks = String(content || '')
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);

    return blocks.map((paragraph) => `<p class="text-[1.02rem] leading-8 text-slate-700">${escapeHtml(paragraph)}</p>`).join('');
};

const setStatus = (message = '', tone = 'neutral') => {
    if (!elements.status) return;
    elements.status.textContent = message;
    elements.status.className = 'mt-8 text-sm';

    if (!message) {
        elements.status.classList.add('hidden');
        return;
    }

    elements.status.classList.remove('hidden');
    if (tone === 'error') {
        elements.status.classList.add('text-red-600');
        return;
    }
    if (tone === 'success') {
        elements.status.classList.add('text-emerald-600');
        return;
    }
    elements.status.classList.add('text-slate-500');
};

const getPostDateLabel = (post) => {
    return formatBlogDate(post?.publishedAt || post?.createdAt) || '날짜 미정';
};

const estimateReadingMinutes = (content) => {
    const plainText = String(content || '').replace(/\s+/g, ' ').trim();
    if (!plainText) return 1;
    return Math.max(1, Math.ceil(plainText.length / 260));
};

const renderPostList = () => {
    if (!elements.list) return;

    if (!state.posts.length) {
        elements.list.innerHTML = `
            <div class="rounded-[1.5rem] border border-dashed border-slate-300 px-5 py-6 text-sm leading-6 text-slate-500">
                아직 공개된 글이 없습니다.
            </div>
        `;
        return;
    }

    const selectedSlug = state.selectedSlug;
    elements.list.innerHTML = state.posts.map((post, index) => {
        const isActive = post.slug === selectedSlug;
        const publishedLabel = getPostDateLabel(post);
        const readingMinutes = estimateReadingMinutes(post.content);
        const imageMarkup = post.coverImageUrl
            ? `
                <div class="mt-6 overflow-hidden rounded-[1.25rem] border border-slate-200 bg-slate-50">
                    <img src="${escapeHtml(post.coverImageUrl)}" alt="${escapeHtml(post.coverImageAlt || post.title)}" loading="lazy" decoding="async" class="h-full w-full object-cover">
                </div>
            `
            : '';
        const expandedMarkup = isActive
            ? `
                <div class="border-t border-slate-200 bg-white px-5 py-6 md:px-7 md:py-7">
                    <div class="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        <span class="rounded-full border border-slate-900 px-3 py-1.5 text-[11px] tracking-[0.18em] text-slate-900">${escapeHtml(post.category)}</span>
                        <span>${escapeHtml(publishedLabel)}</span>
                        <span>${escapeHtml(`${readingMinutes}분 읽기`)}</span>
                    </div>
                    ${imageMarkup}
                    <div class="mt-6 space-y-6">${paragraphsToHtml(post.content)}</div>
                    <div class="mt-8 flex flex-col gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                        <p class="text-sm text-slate-500">최근 업데이트: ${escapeHtml(publishedLabel)}</p>
                        <a href="${escapeHtml(getBlogPostUrl(post.slug))}" class="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-50">이 글 링크</a>
                    </div>
                </div>
            `
            : '';
        return `
            <article class="overflow-hidden rounded-[1.5rem] border ${
                isActive ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
            }">
                <button
                    type="button"
                    data-blog-slug="${escapeHtml(post.slug)}"
                    aria-expanded="${isActive ? 'true' : 'false'}"
                    class="w-full px-5 py-5 text-left transition-all ${
                    isActive
                        ? ''
                        : 'hover:bg-slate-50'
                    }"
                >
                    <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div class="min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                <span class="rounded-full border border-slate-200 px-2.5 py-1 text-slate-600">${escapeHtml(post.category)}</span>
                                <span>${escapeHtml(publishedLabel)}</span>
                                <span>${escapeHtml(`${readingMinutes}분 읽기`)}</span>
                                ${index === 0 ? '<span class="text-blue-600">최신</span>' : ''}
                            </div>
                            <h3 class="mt-4 text-xl font-semibold tracking-tight text-slate-900">${escapeHtml(post.title)}</h3>
                            <p class="mt-3 max-w-3xl text-sm leading-7 text-slate-500">${escapeHtml(post.summary)}</p>
                        </div>
                        <span class="inline-flex shrink-0 items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium ${
                            isActive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                        }">${isActive ? '닫기' : '열기'}</span>
                    </div>
                </button>
                ${expandedMarkup}
            </article>
        `;
    }).join('');
};

const renderAdminComposer = () => {
    if (!elements.adminShell) return;

    if (!state.isAdmin) {
        state.isComposerOpen = false;
        elements.adminShell.classList.add('hidden');
        elements.adminShell.innerHTML = '';
        return;
    }

    elements.adminShell.classList.remove('hidden');

    if (!state.isComposerOpen) {
        elements.adminShell.innerHTML = `
            <section class="mb-12 rounded-[2rem] border border-amber-200 bg-amber-50/70 p-6 md:p-8">
                <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Admin Only</p>
                        <h2 class="mt-3 text-2xl font-semibold tracking-tight text-slate-900">블로그 관리자</h2>
                        <p class="mt-2 text-sm leading-6 text-slate-600">새 글 작성은 아래 버튼을 눌렀을 때만 열리도록 변경했습니다.</p>
                    </div>
                    <button
                        type="button"
                        data-blog-admin-action="open"
                        class="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                        글쓰기
                    </button>
                </div>
            </section>
        `;
        return;
    }

    elements.adminShell.innerHTML = `
        <section class="mb-12 rounded-[2rem] border border-amber-200 bg-amber-50/70 p-6 md:p-8">
            <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Admin Only</p>
                    <h2 class="mt-3 text-2xl font-semibold tracking-tight text-slate-900">블로그 글쓰기</h2>
                    <p class="mt-2 text-sm leading-6 text-slate-600">이 폼은 관리자 메타데이터가 있는 계정에만 표시됩니다. 저장은 Supabase <code class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">blog_posts</code> 테이블로 바로 반영됩니다.</p>
                </div>
                <div class="flex flex-col items-start gap-3 md:items-end">
                    <p class="text-sm text-amber-800">권한 기준: <code class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">app_metadata.role = admin</code> 또는 <code class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">blog_admin = true</code></p>
                    <button
                        type="button"
                        data-blog-admin-action="close"
                        class="inline-flex items-center justify-center rounded-full border border-amber-300 bg-white px-5 py-2 text-sm font-medium text-amber-900 transition hover:border-amber-400 hover:bg-amber-100"
                    >
                        닫기
                    </button>
                </div>
            </div>
            <form id="blog-admin-form" class="mt-8 grid gap-4 md:grid-cols-2">
                <label class="block">
                    <span class="mb-2 block text-sm font-medium text-slate-700">카테고리</span>
                    <input name="category" type="text" value="서비스 업데이트" maxlength="40" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900">
                </label>
                <label class="block">
                    <span class="mb-2 block text-sm font-medium text-slate-700">작성자</span>
                    <input name="authorName" type="text" value="평가원기출VOCA" maxlength="40" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900">
                </label>
                <label class="block md:col-span-2">
                    <span class="mb-2 block text-sm font-medium text-slate-700">제목</span>
                    <input name="title" type="text" maxlength="120" required class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900">
                </label>
                <label class="block md:col-span-2">
                    <span class="mb-2 block text-sm font-medium text-slate-700">요약</span>
                    <textarea name="summary" rows="3" maxlength="240" required class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"></textarea>
                </label>
                <label class="block">
                    <span class="mb-2 block text-sm font-medium text-slate-700">Slug (선택)</span>
                    <input name="slug" type="text" maxlength="120" placeholder="비우면 제목으로 자동 생성" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900">
                </label>
                <label class="block">
                    <span class="mb-2 block text-sm font-medium text-slate-700">대표 이미지 URL (선택)</span>
                    <input name="coverImageUrl" type="url" maxlength="400" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900">
                </label>
                <label class="block md:col-span-2">
                    <span class="mb-2 block text-sm font-medium text-slate-700">대표 이미지 설명 (선택)</span>
                    <input name="coverImageAlt" type="text" maxlength="160" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900">
                </label>
                <label class="block md:col-span-2">
                    <span class="mb-2 block text-sm font-medium text-slate-700">본문</span>
                    <textarea name="content" rows="12" required class="w-full rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-slate-900"></textarea>
                    <span class="mt-2 block text-xs text-slate-500">문단은 빈 줄로 구분해서 입력하면 됩니다.</span>
                </label>
                <div class="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p id="blog-admin-form-status" class="text-sm text-slate-500">새 글은 저장 즉시 공개됩니다.</p>
                    <button type="submit" class="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800">글 저장하기</button>
                </div>
            </form>
        </section>
    `;

    const form = document.getElementById('blog-admin-form');
    const formStatus = document.getElementById('blog-admin-form-status');
    if (!(form instanceof HTMLFormElement) || !(formStatus instanceof HTMLElement)) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        formStatus.textContent = '저장 중입니다...';
        formStatus.className = 'text-sm text-slate-500';

        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton instanceof HTMLButtonElement) {
            submitButton.disabled = true;
        }

        const formData = new FormData(form);
        try {
            const post = await createBlogPost({
                category: formData.get('category'),
                authorName: formData.get('authorName'),
                title: formData.get('title'),
                summary: formData.get('summary'),
                slug: formData.get('slug'),
                coverImageUrl: formData.get('coverImageUrl'),
                coverImageAlt: formData.get('coverImageAlt'),
                content: formData.get('content'),
            });

            state.posts = [post, ...state.posts.filter((item) => item.slug !== post.slug)];
            state.selectedSlug = post.slug;
            form.reset();
            const categoryInput = form.elements.namedItem('category');
            if (categoryInput instanceof HTMLInputElement) categoryInput.value = '서비스 업데이트';
            const authorInput = form.elements.namedItem('authorName');
            if (authorInput instanceof HTMLInputElement) authorInput.value = '평가원기출VOCA';
            formStatus.textContent = '글이 저장되었습니다.';
            formStatus.className = 'text-sm text-emerald-600';
            renderPostList();
            history.replaceState({}, '', getBlogPostUrl(post.slug));
            setStatus('새 글이 공개되었습니다.', 'success');
        } catch (error) {
            formStatus.textContent = error instanceof Error ? error.message : '글 저장에 실패했습니다.';
            formStatus.className = 'text-sm text-red-600';
        } finally {
            if (submitButton instanceof HTMLButtonElement) {
                submitButton.disabled = false;
            }
        }
    });
};

const bindAdminComposer = () => {
    if (!elements.adminShell) return;

    elements.adminShell.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const button = target.closest('[data-blog-admin-action]');
        if (!(button instanceof HTMLButtonElement)) return;

        const action = button.dataset.blogAdminAction;
        if (action === 'open') {
            state.isComposerOpen = true;
            renderAdminComposer();
            return;
        }

        if (action === 'close') {
            state.isComposerOpen = false;
            renderAdminComposer();
        }
    });
};

const syncSelectedSlug = () => {
    const params = new URLSearchParams(window.location.search);
    state.selectedSlug = params.get('slug') || '';
};

const loadPosts = async () => {
    setStatus('블로그 글을 불러오는 중입니다.');
    state.posts = await listBlogPosts();
    syncSelectedSlug();
    renderPostList();
    setStatus('');
};

const bindPostSelection = () => {
    if (!elements.list) return;
    elements.list.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const button = target.closest('[data-blog-slug]');
        if (!(button instanceof HTMLButtonElement)) return;

        const slug = button.dataset.blogSlug || '';
        state.selectedSlug = state.selectedSlug === slug ? '' : slug;
        history.replaceState({}, '', state.selectedSlug ? getBlogPostUrl(state.selectedSlug) : '/blog/');
        renderPostList();
    });
};

const syncAdminState = async () => {
    const [{ data: userData }, { data: sessionData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
    ]);

    const user = userData?.user || sessionData?.session?.user || null;
    state.isAdmin = isBlogAdminUser(user);
    renderAdminComposer();
};

export const initBlogPage = async () => {
    await initAuthNavLinks({
        loggedInLabel: '마이페이지',
        loggedInPath: '/mypage/',
        loggedInAction: 'mypage',
    });

    bindAdminComposer();
    bindPostSelection();
    await syncAdminState();
    await loadPosts();

    supabase.auth.onAuthStateChange(async (_event, session) => {
        state.isAdmin = isBlogAdminUser(session?.user || null);
        renderAdminComposer();
    });
};

initBlogPage().catch((error) => {
    console.error('[blog-page]', error);
    setStatus('블로그 페이지를 초기화하는 중 오류가 발생했습니다.', 'error');
});
