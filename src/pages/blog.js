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
};

const elements = {
    list: document.getElementById('blog-post-list'),
    selected: document.getElementById('blog-selected-post'),
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

    return blocks.map((paragraph) => `<p class="text-base leading-8 text-slate-600">${escapeHtml(paragraph)}</p>`).join('');
};

const setStatus = (message = '', tone = 'neutral') => {
    if (!elements.status) return;
    elements.status.textContent = message;
    elements.status.className = 'mb-8 text-sm';

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

const getSelectedPost = () => {
    if (!state.posts.length) return null;
    return state.posts.find((post) => post.slug === state.selectedSlug) || state.posts[0];
};

const renderSelectedPost = () => {
    if (!elements.selected) return;

    const post = getSelectedPost();
    if (!post) {
        elements.selected.innerHTML = `
            <article class="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center">
                <p class="text-sm text-slate-400">아직 공개된 글이 없습니다.</p>
            </article>
        `;
        return;
    }

    const imageMarkup = post.coverImageUrl
        ? `
            <div class="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50">
                <img src="${escapeHtml(post.coverImageUrl)}" alt="${escapeHtml(post.coverImageAlt || post.title)}" loading="lazy" decoding="async" class="h-full w-full object-cover">
            </div>
        `
        : '';

    elements.selected.innerHTML = `
        <article class="rounded-[2rem] border border-slate-200 bg-white p-8 md:p-10 shadow-[0_24px_90px_-60px_rgba(15,23,42,0.35)]">
            <div class="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                <span>${escapeHtml(post.category)}</span>
                <span class="h-1 w-1 rounded-full bg-slate-300"></span>
                <span>${escapeHtml(formatBlogDate(post.publishedAt || post.createdAt))}</span>
            </div>
            <h2 class="mt-5 text-3xl md:text-4xl font-semibold tracking-tight text-slate-900 leading-tight">${escapeHtml(post.title)}</h2>
            <p class="mt-5 text-lg leading-8 text-slate-500">${escapeHtml(post.summary)}</p>
            <div class="mt-8 space-y-6">
                ${imageMarkup}
                <div class="space-y-5">${paragraphsToHtml(post.content)}</div>
            </div>
            <div class="mt-10 flex items-center justify-between gap-4 border-t border-slate-100 pt-6">
                <p class="text-sm text-slate-500">${escapeHtml(post.authorName || '평가원기출VOCA')}</p>
                <a href="${escapeHtml(getBlogPostUrl(post.slug))}" class="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors">이 글 링크 복사용 주소</a>
            </div>
        </article>
    `;
};

const renderPostList = () => {
    if (!elements.list) return;

    if (!state.posts.length) {
        elements.list.innerHTML = '';
        return;
    }

    const selectedSlug = getSelectedPost()?.slug || '';
    elements.list.innerHTML = state.posts.map((post) => {
        const isActive = post.slug === selectedSlug;
        return `
            <button
                type="button"
                data-blog-slug="${escapeHtml(post.slug)}"
                class="w-full rounded-[1.75rem] border p-6 text-left transition-all ${
                    isActive
                        ? 'border-slate-900 bg-slate-900 text-white shadow-[0_20px_60px_-40px_rgba(15,23,42,0.8)]'
                        : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300'
                }"
            >
                <div class="flex items-center justify-between gap-4 text-xs font-semibold uppercase tracking-[0.18em] ${isActive ? 'text-slate-300' : 'text-slate-400'}">
                    <span>${escapeHtml(post.category)}</span>
                    <span>${escapeHtml(formatBlogDate(post.publishedAt || post.createdAt))}</span>
                </div>
                <h3 class="mt-4 text-xl font-semibold tracking-tight ${isActive ? 'text-white' : 'text-slate-900'}">${escapeHtml(post.title)}</h3>
                <p class="mt-3 text-sm leading-7 ${isActive ? 'text-slate-300' : 'text-slate-500'}">${escapeHtml(post.summary)}</p>
            </button>
        `;
    }).join('');
};

const renderAdminComposer = () => {
    if (!elements.adminShell) return;

    if (!state.isAdmin) {
        elements.adminShell.classList.add('hidden');
        elements.adminShell.innerHTML = '';
        return;
    }

    elements.adminShell.classList.remove('hidden');
    elements.adminShell.innerHTML = `
        <section class="mb-12 rounded-[2rem] border border-amber-200 bg-amber-50/70 p-6 md:p-8">
            <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Admin Only</p>
                    <h2 class="mt-3 text-2xl font-semibold tracking-tight text-slate-900">블로그 글쓰기</h2>
                    <p class="mt-2 text-sm leading-6 text-slate-600">이 폼은 관리자 메타데이터가 있는 계정에만 표시됩니다. 저장은 Supabase <code class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">blog_posts</code> 테이블로 바로 반영됩니다.</p>
                </div>
                <p class="text-sm text-amber-800">권한 기준: <code class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">app_metadata.role = admin</code> 또는 <code class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">blog_admin = true</code></p>
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
            renderSelectedPost();
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

const syncSelectedSlug = () => {
    const params = new URLSearchParams(window.location.search);
    const requestedSlug = params.get('slug') || '';
    state.selectedSlug = requestedSlug;

    if (!requestedSlug && state.posts.length) {
        state.selectedSlug = state.posts[0].slug;
    }
};

const loadPosts = async () => {
    setStatus('블로그 글을 불러오는 중입니다.');
    state.posts = await listBlogPosts();
    syncSelectedSlug();
    renderSelectedPost();
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

        state.selectedSlug = button.dataset.blogSlug || '';
        history.replaceState({}, '', getBlogPostUrl(state.selectedSlug));
        renderSelectedPost();
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
