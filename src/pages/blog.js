import { initAuthNavLinks } from '/src/lib/authNav.js';
import { supabase } from '/src/lib/supabaseClient.js';
import {
    createBlogPost,
    formatBlogDate,
    getFallbackBlogPosts,
    getBlogPostUrl,
    isBlogAdminUser,
    listBlogPosts,
    uploadBlogImages,
} from '/src/lib/blog.js';
import {
    estimateBlogReadingMinutes,
    parseBlogContentBlocks,
} from '/src/lib/blog-content.js';

const state = {
    posts: [],
    selectedSlug: '',
    isAdmin: false,
    isComposerOpen: false,
    composerDraft: null,
    flushComposerDraft: null,
};

const elements = {
    list: document.getElementById('blog-post-list'),
    status: document.getElementById('blog-page-status'),
    adminShell: document.getElementById('blog-admin-shell'),
};

const BLOG_COMPOSER_DRAFT_DB_NAME = 'voca-plus-blog-drafts';
const BLOG_COMPOSER_DRAFT_STORE_NAME = 'drafts';
const BLOG_COMPOSER_DRAFT_KEY = 'blog-admin-composer';
const BLOG_COMPOSER_DRAFT_STORAGE_KEY = 'voca-plus-blog-admin-draft';
const BLOG_COMPOSER_AUTOSAVE_DELAY_MS = 600;
const BLOG_COMPOSER_DEFAULTS = {
    category: '서비스 업데이트',
    authorName: '평가원기출VOCA',
    title: '',
    summary: '',
    slug: '',
    coverImageUrl: '',
    coverImageAlt: '',
    content: '',
    updatedAt: 0,
};

let blogComposerDraftDbPromise = null;

const requestToPromise = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
});

const openBlogComposerDraftDb = async () => {
    if (typeof indexedDB === 'undefined') return null;
    if (blogComposerDraftDbPromise) return blogComposerDraftDbPromise;

    blogComposerDraftDbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(BLOG_COMPOSER_DRAFT_DB_NAME, 1);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(BLOG_COMPOSER_DRAFT_STORE_NAME)) {
                db.createObjectStore(BLOG_COMPOSER_DRAFT_STORE_NAME, { keyPath: 'key' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed to open blog draft database.'));
    }).catch((error) => {
        blogComposerDraftDbPromise = null;
        throw error;
    });

    return blogComposerDraftDbPromise;
};

const normalizeBlogComposerDraft = (draft) => ({
    category: String(draft?.category ?? BLOG_COMPOSER_DEFAULTS.category),
    authorName: String(draft?.authorName ?? BLOG_COMPOSER_DEFAULTS.authorName),
    title: String(draft?.title ?? ''),
    summary: String(draft?.summary ?? ''),
    slug: String(draft?.slug ?? ''),
    coverImageUrl: String(draft?.coverImageUrl ?? ''),
    coverImageAlt: String(draft?.coverImageAlt ?? ''),
    content: String(draft?.content ?? ''),
    updatedAt: Number(draft?.updatedAt || Date.now()),
});

const isBlogComposerDraftEmpty = (draft) => {
    const normalized = normalizeBlogComposerDraft(draft);
    return !normalized.title.trim()
        && !normalized.summary.trim()
        && !normalized.slug.trim()
        && !normalized.coverImageUrl.trim()
        && !normalized.coverImageAlt.trim()
        && !normalized.content.trim()
        && normalized.category.trim() === BLOG_COMPOSER_DEFAULTS.category
        && normalized.authorName.trim() === BLOG_COMPOSER_DEFAULTS.authorName;
};

const readBlogComposerDraftFromLocalStorage = () => {
    if (typeof localStorage === 'undefined') return null;

    try {
        const rawValue = localStorage.getItem(BLOG_COMPOSER_DRAFT_STORAGE_KEY);
        if (!rawValue) return null;
        return normalizeBlogComposerDraft(JSON.parse(rawValue));
    } catch (error) {
        console.warn('[blog-page] draft localStorage read failed', error);
        return null;
    }
};

const writeBlogComposerDraftToLocalStorage = (draft) => {
    if (typeof localStorage === 'undefined') return;

    try {
        localStorage.setItem(
            BLOG_COMPOSER_DRAFT_STORAGE_KEY,
            JSON.stringify(normalizeBlogComposerDraft(draft))
        );
    } catch (error) {
        console.warn('[blog-page] draft localStorage write failed', error);
    }
};

const clearBlogComposerDraftFromLocalStorage = () => {
    if (typeof localStorage === 'undefined') return;

    try {
        localStorage.removeItem(BLOG_COMPOSER_DRAFT_STORAGE_KEY);
    } catch (error) {
        console.warn('[blog-page] draft localStorage clear failed', error);
    }
};

const loadBlogComposerDraft = async () => {
    try {
        const db = await openBlogComposerDraftDb();
        if (!db) {
            return readBlogComposerDraftFromLocalStorage();
        }

        const transaction = db.transaction(BLOG_COMPOSER_DRAFT_STORE_NAME, 'readonly');
        const store = transaction.objectStore(BLOG_COMPOSER_DRAFT_STORE_NAME);
        const result = await requestToPromise(store.get(BLOG_COMPOSER_DRAFT_KEY));
        const draft = result?.draft ? normalizeBlogComposerDraft(result.draft) : null;

        if (draft) {
            clearBlogComposerDraftFromLocalStorage();
            return draft;
        }

        return readBlogComposerDraftFromLocalStorage();
    } catch (error) {
        console.warn('[blog-page] draft load failed', error);
        return readBlogComposerDraftFromLocalStorage();
    }
};

const saveBlogComposerDraft = async (draft) => {
    const normalizedDraft = normalizeBlogComposerDraft(draft);

    try {
        const db = await openBlogComposerDraftDb();
        if (!db) {
            writeBlogComposerDraftToLocalStorage(normalizedDraft);
            return;
        }

        const transaction = db.transaction(BLOG_COMPOSER_DRAFT_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(BLOG_COMPOSER_DRAFT_STORE_NAME);
        await requestToPromise(store.put({
            key: BLOG_COMPOSER_DRAFT_KEY,
            draft: normalizedDraft,
        }));
        clearBlogComposerDraftFromLocalStorage();
    } catch (error) {
        console.warn('[blog-page] draft save failed, falling back to localStorage', error);
        writeBlogComposerDraftToLocalStorage(normalizedDraft);
    }
};

const clearBlogComposerDraft = async () => {
    try {
        const db = await openBlogComposerDraftDb();
        if (db) {
            const transaction = db.transaction(BLOG_COMPOSER_DRAFT_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(BLOG_COMPOSER_DRAFT_STORE_NAME);
            await requestToPromise(store.delete(BLOG_COMPOSER_DRAFT_KEY));
        }
    } catch (error) {
        console.warn('[blog-page] draft clear failed', error);
    } finally {
        clearBlogComposerDraftFromLocalStorage();
    }
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
    return parseBlogContentBlocks(content).map((block) => {
        if (block.type === 'image') {
            let flexClass = 'justify-center';
            if (block.align === 'left') flexClass = 'justify-start';
            if (block.align === 'right') flexClass = 'justify-end';
            
            let widthClass = 'w-full';
            if (block.width === '75') widthClass = 'w-full md:w-3/4';
            if (block.width === '50') widthClass = 'w-3/4 md:w-1/2';
            if (block.width === '25') widthClass = 'w-1/2 md:w-1/3 max-w-sm';

            return `
                <div class="flex ${flexClass} w-full my-6">
                    <figure class="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-slate-50 ${widthClass}">
                        <img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt || '본문 이미지')}" loading="lazy" decoding="async" class="h-full w-full object-cover">
                    </figure>
                </div>
            `;
        }

        return `<p class="text-[1.02rem] leading-7 text-slate-700">${String(block.text || '').replace(/\n/g, '<br>')}</p>`;
    }).join('');
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

const hasSelectedPost = () => state.posts.some((post) => post.slug === state.selectedSlug);

const syncSelectedSlug = () => {
    const params = new URLSearchParams(window.location.search);
    state.selectedSlug = params.get('slug') || '';
};

const ensureSelectedSlugExists = () => {
    if (state.selectedSlug && !hasSelectedPost()) {
        state.selectedSlug = '';
    }
};

const readInitialPosts = () => {
    const initialPosts = window.__BLOG_INITIAL_POSTS__;
    return Array.isArray(initialPosts) ? initialPosts : [];
};

const renderComposerPreview = (input, preview) => {
    if (!(preview instanceof HTMLElement) || !(input instanceof HTMLTextAreaElement)) return;

    const html = paragraphsToHtml(input.value);
    preview.innerHTML = html || '<p class="text-sm leading-6 text-slate-400">본문 미리보기가 여기에 표시됩니다.</p>';
};

const createBlogEditorBlockId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `blog-block-${crypto.randomUUID()}`;
    }
    return `blog-block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createEmptyBlogParagraphBlock = (text = '') => ({
    id: createBlogEditorBlockId(),
    type: 'paragraph',
    text: String(text || ''),
});

const createBlogEditorBlocks = (content) => {
    const blocks = parseBlogContentBlocks(content).map((block) => {
        if (block.type === 'image') {
            return {
                id: createBlogEditorBlockId(),
                type: 'image',
                src: block.src,
                alt: block.alt || '본문 이미지',
                align: block.align || 'center',
                width: String(block.width || '100'),
            };
        }

        return createEmptyBlogParagraphBlock(block.text || '');
    });

    return blocks.length ? blocks : [createEmptyBlogParagraphBlock('')];
};

const serializeBlogEditorBlocks = (blocks) => {
    return blocks
        .map((block) => {
            if (block?.type === 'image') {
                const src = String(block.src || '').trim();
                if (!src) return '';
                const alt = String(block.alt || '본문 이미지').trim() || '본문 이미지';
                const align = block.align || 'center';
                const width = block.width || '100';
                const suffix = (align !== 'center' || width !== '100') ? `#align=${align}&width=${width}` : '';
                return `![${alt}](${src}${suffix})`;
            }

            return String(block?.text || '').replace(/\r/g, '').trim();
        })
        .filter(Boolean)
        .join('\n\n')
        .trim();
};

const sanitizeRichText = (html) => {
    if (!html) return '';
    if (typeof document === 'undefined') return escapeHtml(html);
    
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Whitelist tags
    const allowedTags = ['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'MARK', 'SPAN', 'BR', 'A', 'FONT'];
    
    const cleanNodes = (node) => {
        const children = Array.from(node.childNodes);
        for (const child of children) {
            if (child.nodeType === Node.TEXT_NODE) {
                continue;
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const tagName = child.tagName.toUpperCase();
                if (!allowedTags.includes(tagName)) {
                    while (child.firstChild) {
                        node.insertBefore(child.firstChild, child);
                    }
                    node.removeChild(child);
                } else {
                    const attrs = Array.from(child.attributes);
                    for (const attr of attrs) {
                        const attrName = attr.name.toLowerCase();
                        if (!['class', 'style', 'href', 'target', 'color'].includes(attrName)) {
                            child.removeAttribute(attrName);
                        } else if (attrName === 'href' && child.tagName === 'A') {
                            if (!child.href.startsWith('http') && !child.href.startsWith('mailto:') && !child.href.startsWith('/')) {
                                child.removeAttribute('href');
                            }
                        }
                    }
                    cleanNodes(child);
                }
            } else {
                node.removeChild(child);
            }
        }
    };
    cleanNodes(temp);
    return temp.innerHTML;
};

const paragraphTextToEditableHtml = (text) => {
    const html = String(text || '');
    if (!html.includes('<br>') && !html.includes('<') && html.includes('\n')) {
        return escapeHtml(html).replace(/\n/g, '<br>');
    }
    return html;
};

const getBlogEditorTextFromElement = (element) => {
    if (!(element instanceof HTMLElement)) return '';
    return sanitizeRichText(element.innerHTML);
};

const getBlogEditorCaretOffset = (element) => {
    if (!(element instanceof HTMLElement)) return 0;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return String(element.innerText || '').length;

    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer)) {
        return String(element.innerText || '').length;
    }

    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    return preCaretRange.toString().length;
};

const setBlogEditorCaretOffset = (element, offset) => {
    if (!(element instanceof HTMLElement)) return;

    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, offset);
    let currentNode = walker.nextNode();

    while (currentNode) {
        const length = currentNode.textContent?.length || 0;
        if (remaining <= length) {
            range.setStart(currentNode, remaining);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            return;
        }
        remaining -= length;
        currentNode = walker.nextNode();
    }

    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
};

const focusBlogEditorParagraph = (editorRoot, blockId, offset = 'end') => {
    if (!(editorRoot instanceof HTMLElement) || !blockId) return;

    requestAnimationFrame(() => {
        const target = editorRoot.querySelector(`[data-editor-paragraph="${blockId}"]`);
        if (!(target instanceof HTMLElement)) return;

        target.focus();
        let caretOffset = 0;
        if (offset === 'start') {
            caretOffset = 0;
        } else if (typeof offset === 'number') {
            caretOffset = offset;
        } else {
            caretOffset = String(target.innerText || '').length;
        }
        setBlogEditorCaretOffset(target, caretOffset);
    });
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
        const readingMinutes = estimateBlogReadingMinutes(post.content);
        const articleUrl = getBlogPostUrl(post.slug);
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
                    <div class="mt-6 space-y-2">${paragraphsToHtml(post.content)}</div>
                    <div class="mt-8 flex flex-col gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                        <p class="text-sm text-slate-500">최근 업데이트: ${escapeHtml(publishedLabel)}</p>
                        <a href="${escapeHtml(articleUrl)}" class="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-50">정식 글 페이지</a>
                    </div>
                </div>
            `
            : '';
        return `
            <article class="overflow-hidden rounded-[1.5rem] border ${
                isActive ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
            }">
                <div class="px-5 py-5">
                    <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div class="min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                <span class="rounded-full border border-slate-200 px-2.5 py-1 text-slate-600">${escapeHtml(post.category)}</span>
                                <span>${escapeHtml(publishedLabel)}</span>
                                <span>${escapeHtml(`${readingMinutes}분 읽기`)}</span>
                                ${index === 0 ? '<span class="text-blue-600">최신</span>' : ''}
                            </div>
                            <h2 class="mt-4 text-xl font-semibold tracking-tight text-slate-900">
                                <a href="${escapeHtml(articleUrl)}" class="transition hover:text-blue-700">${escapeHtml(post.title)}</a>
                            </h2>
                            <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-500">${escapeHtml(post.summary)}</p>
                        </div>
                        <div class="flex shrink-0 flex-wrap items-center gap-2">
                            <a href="${escapeHtml(articleUrl)}" class="inline-flex items-center justify-center rounded-full border border-slate-300 px-3.5 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50">글 보기</a>
                            <button
                                type="button"
                                data-blog-slug="${escapeHtml(post.slug)}"
                                aria-expanded="${isActive ? 'true' : 'false'}"
                                class="inline-flex items-center justify-center rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                                    isActive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }"
                            >
                                ${isActive ? '미리보기 닫기' : '미리보기'}
                            </button>
                        </div>
                    </div>
                </div>
                ${expandedMarkup}
            </article>
        `;
    }).join('');
};

const renderFallbackPosts = () => {
    state.posts = getFallbackBlogPosts();
    ensureSelectedSlugExists();
    renderPostList();
};

const renderAdminComposer = () => {
    if (!elements.adminShell) return;

    if (!state.isAdmin) {
        state.isComposerOpen = false;
        state.flushComposerDraft = null;
        elements.adminShell.classList.add('hidden');
        elements.adminShell.innerHTML = '';
        return;
    }

    elements.adminShell.classList.remove('hidden');

    if (!state.isComposerOpen) {
        state.flushComposerDraft = null;
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
                <div class="block md:col-span-2">
                    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <span id="blog-admin-editor-label" class="block text-sm font-medium text-slate-700">본문</span>
                            <p class="mt-1 text-xs text-slate-500">Enter로 새 문단, Shift+Enter로 줄바꿈, 이미지 드래그앤드롭/붙여넣기를 지원합니다.</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <input id="blog-admin-image-picker" type="file" accept="image/*" multiple class="hidden">
                            <button
                                type="button"
                                data-blog-editor-action="pick-images"
                                class="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                            >
                                이미지 추가
                            </button>
                            <button
                                type="button"
                                data-blog-editor-action="add-paragraph"
                                class="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                            >
                                문단 추가
                            </button>
                        </div>
                    </div>
                    <div id="blog-admin-editor-shell" aria-labelledby="blog-admin-editor-label" tabindex="-1" class="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.06)] transition outline-none">
                        <div id="blog-admin-toolbar" class="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50/90 backdrop-blur px-4 py-2 sticky top-0 z-20">
                            <button type="button" data-rich-action="bold" class="font-bold w-8 h-8 rounded hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer" title="굵게">B</button>
                            <button type="button" data-rich-action="italic" class="italic font-serif w-8 h-8 rounded hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer" title="기울임체">I</button>
                            <button type="button" data-rich-action="underline" class="underline w-8 h-8 rounded hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer" title="밑줄">U</button>
                            <button type="button" data-rich-action="strikeThrough" class="line-through w-8 h-8 rounded hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer" title="취소선">S</button>
                            <div class="w-[1px] h-5 bg-slate-300 mx-1"></div>
                            <button type="button" data-rich-action="backColor" data-value="#fef08a" class="w-8 h-8 rounded hover:bg-slate-200 flex items-center justify-center group cursor-pointer" title="노란색 형광펜">
                                <span class="block w-4 h-4 bg-yellow-300 rounded-[3px] ring-1 ring-black/10"></span>
                            </button>
                            <button type="button" data-rich-action="backColor" data-value="#d9f99d" class="w-8 h-8 rounded hover:bg-slate-200 flex items-center justify-center group cursor-pointer" title="연두색 형광펜">
                                <span class="block w-4 h-4 bg-lime-300 rounded-[3px] ring-1 ring-black/10"></span>
                            </button>
                            <button type="button" data-rich-action="backColor" data-value="#a5f3fc" class="w-8 h-8 rounded hover:bg-slate-200 flex items-center justify-center group cursor-pointer" title="하늘색 형광펜">
                                <span class="block w-4 h-4 bg-cyan-200 rounded-[3px] ring-1 ring-black/10"></span>
                            </button>
                            <button type="button" data-rich-action="backColor" data-value="transparent" class="w-8 h-8 rounded hover:bg-slate-200 text-slate-400 flex items-center justify-center text-xs ml-1 cursor-pointer" title="배경 지우기">지움</button>
                            <div class="w-[1px] h-5 bg-slate-300 mx-1"></div>
                            <button type="button" data-rich-action="foreColor" data-value="#0f172a" class="w-8 h-8 rounded hover:bg-slate-200 flex items-center justify-center font-bold text-slate-900 cursor-pointer" title="기본색">A</button>
                            <button type="button" data-rich-action="foreColor" data-value="#ef4444" class="w-8 h-8 rounded hover:bg-slate-200 flex items-center justify-center font-bold text-red-500 cursor-pointer" title="빨간색">A</button>
                            <button type="button" data-rich-action="foreColor" data-value="#3b82f6" class="w-8 h-8 rounded hover:bg-slate-200 flex items-center justify-center font-bold text-blue-500 cursor-pointer" title="파란색">A</button>
                            <div class="flex-1"></div>
                            <span class="text-[11px] text-slate-400 hidden sm:inline-block">텍스트를 드래그하고 버튼을 누르세요.</span>
                        </div>
                        <div id="blog-admin-dropzone" class="min-h-[30rem] bg-white px-6 py-7 transition md:px-10 md:py-10">
                            <div id="blog-admin-editor" class="space-y-2"></div>
                        </div>
                        <textarea id="blog-admin-content" name="content" required class="hidden"></textarea>
                    </div>
                    <span class="mt-2 block text-xs text-slate-500">실제 게시글 레이아웃에 가깝게 바로 입력됩니다. 이미지는 현재 위치 뒤에 삽입됩니다.</span>
                </div>
                <div class="md:col-span-2 rounded-[1.5rem] border border-slate-200 bg-white p-5">
                    <div class="flex items-center justify-between gap-3">
                        <h3 class="text-sm font-semibold text-slate-900">실시간 미리보기</h3>
                        <p class="text-xs text-slate-400">본문 저장 전 렌더링 확인용</p>
                    </div>
                    <div id="blog-admin-preview" class="mt-4 space-y-2"></div>
                </div>
                <div class="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p id="blog-admin-form-status" class="text-sm text-slate-500">새 글은 저장 즉시 공개됩니다.</p>
                    <button type="submit" class="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800">글 저장하기</button>
                </div>
            </form>
        </section>
    `;

    const form = document.getElementById('blog-admin-form');
    const formStatus = document.getElementById('blog-admin-form-status');
    const contentInput = document.getElementById('blog-admin-content');
    const preview = document.getElementById('blog-admin-preview');
    const imagePicker = document.getElementById('blog-admin-image-picker');
    const editorShell = document.getElementById('blog-admin-editor-shell');
    const editorRoot = document.getElementById('blog-admin-editor');
    const dropzone = document.getElementById('blog-admin-dropzone');
    const pickImageButton = form?.querySelector('[data-blog-editor-action="pick-images"]');
    const addParagraphButton = form?.querySelector('[data-blog-editor-action="add-paragraph"]');
    if (!(form instanceof HTMLFormElement) || !(formStatus instanceof HTMLElement) || !(contentInput instanceof HTMLTextAreaElement)) return;

    const categoryInput = form.elements.namedItem('category');
    const authorInput = form.elements.namedItem('authorName');
    const titleInput = form.elements.namedItem('title');
    const summaryInput = form.elements.namedItem('summary');
    const slugInput = form.elements.namedItem('slug');
    const coverImageUrlInput = form.elements.namedItem('coverImageUrl');
    const coverImageAltInput = form.elements.namedItem('coverImageAlt');
    const restoredDraft = state.composerDraft ? normalizeBlogComposerDraft(state.composerDraft) : null;

    let isUploadingImages = false;
    let pendingImageReplaceBlockId = '';
    let autosaveTimerId = 0;
    let lastSavedDraftSnapshot = restoredDraft ? JSON.stringify(restoredDraft) : '';
    const editorState = {
        blocks: createBlogEditorBlocks(restoredDraft?.content || ''),
        focusedBlockId: '',
    };

    const setFormStatus = (message, tone = 'neutral') => {
        formStatus.textContent = message;
        formStatus.className = 'text-sm';
        if (tone === 'error') {
            formStatus.classList.add('text-red-600');
            return;
        }
        if (tone === 'success') {
            formStatus.classList.add('text-emerald-600');
            return;
        }
        formStatus.classList.add('text-slate-500');
    };

    const setDropzoneActive = (active) => {
        if (!(editorShell instanceof HTMLElement)) return;
        editorShell.classList.toggle('border-blue-400', active);
        editorShell.classList.toggle('bg-blue-50/40', active);
    };

    const setImageControlsDisabled = (disabled) => {
        if (pickImageButton instanceof HTMLButtonElement) {
            pickImageButton.disabled = disabled;
        }
        if (addParagraphButton instanceof HTMLButtonElement) {
            addParagraphButton.disabled = disabled;
        }
    };

    const buildComposerDraft = () => normalizeBlogComposerDraft({
        category: categoryInput instanceof HTMLInputElement ? categoryInput.value : BLOG_COMPOSER_DEFAULTS.category,
        authorName: authorInput instanceof HTMLInputElement ? authorInput.value : BLOG_COMPOSER_DEFAULTS.authorName,
        title: titleInput instanceof HTMLInputElement ? titleInput.value : '',
        summary: summaryInput instanceof HTMLTextAreaElement ? summaryInput.value : '',
        slug: slugInput instanceof HTMLInputElement ? slugInput.value : '',
        coverImageUrl: coverImageUrlInput instanceof HTMLInputElement ? coverImageUrlInput.value : '',
        coverImageAlt: coverImageAltInput instanceof HTMLInputElement ? coverImageAltInput.value : '',
        content: contentInput.value,
        updatedAt: Date.now(),
    });

    const clearAutosaveTimer = () => {
        if (!autosaveTimerId) return;
        window.clearTimeout(autosaveTimerId);
        autosaveTimerId = 0;
    };

    const resetDraftStatusMessage = () => {
        if (!formStatus.textContent || formStatus.textContent === '임시저장됨' || formStatus.textContent === '임시저장본을 복원했습니다.') {
            setFormStatus('새 글은 저장 즉시 공개됩니다.');
        }
    };

    const persistComposerDraft = async ({ silent = false, force = false } = {}) => {
        const draft = buildComposerDraft();

        if (isBlogComposerDraftEmpty(draft)) {
            clearAutosaveTimer();
            lastSavedDraftSnapshot = '';
            state.composerDraft = null;
            await clearBlogComposerDraft();
            if (!silent) {
                resetDraftStatusMessage();
            }
            return;
        }

        const snapshot = JSON.stringify(draft);
        state.composerDraft = draft;
        if (!force && snapshot === lastSavedDraftSnapshot) {
            return;
        }

        await saveBlogComposerDraft(draft);
        lastSavedDraftSnapshot = snapshot;
        if (!silent) {
            setFormStatus('임시저장됨');
        }
    };

    const scheduleComposerDraftPersist = ({ delay = BLOG_COMPOSER_AUTOSAVE_DELAY_MS, silent = false, force = false } = {}) => {
        clearAutosaveTimer();
        autosaveTimerId = window.setTimeout(() => {
            autosaveTimerId = 0;
            void persistComposerDraft({ silent, force });
        }, delay);
    };

    const flushComposerDraft = () => {
        clearAutosaveTimer();
        const draft = buildComposerDraft();

        if (isBlogComposerDraftEmpty(draft)) {
            state.composerDraft = null;
            clearBlogComposerDraftFromLocalStorage();
            void clearBlogComposerDraft();
            return;
        }

        state.composerDraft = draft;
        lastSavedDraftSnapshot = JSON.stringify(draft);
        writeBlogComposerDraftToLocalStorage(draft);
        void saveBlogComposerDraft(draft);
    };

    state.flushComposerDraft = flushComposerDraft;

    const syncEditorContent = () => {
        contentInput.value = serializeBlogEditorBlocks(editorState.blocks);
        renderComposerPreview(contentInput, preview);
    };

    const ensureEditorHasBlock = () => {
        if (!editorState.blocks.length) {
            const block = createEmptyBlogParagraphBlock('');
            editorState.blocks = [block];
            editorState.focusedBlockId = block.id;
        }
    };

    const getBlockIndex = (blockId) => editorState.blocks.findIndex((block) => block.id === blockId);

    const getBlockById = (blockId) => editorState.blocks[getBlockIndex(blockId)] || null;

    const findNearestParagraphForFocus = (startIndex, direction = -1) => {
        let index = startIndex;
        while (index >= 0 && index < editorState.blocks.length) {
            const block = editorState.blocks[index];
            if (block?.type === 'paragraph') {
                return block.id;
            }
            index += direction;
        }
        return '';
    };

    const getLastParagraphBlockId = () => findNearestParagraphForFocus(editorState.blocks.length - 1, -1) || editorState.blocks[0]?.id || '';

    const focusLastParagraphBlock = (offset = 'end') => {
        const blockId = getLastParagraphBlockId();
        if (!blockId) return;
        editorState.focusedBlockId = blockId;
        focusBlogEditorParagraph(editorRoot, blockId, offset);
    };

    const renderEditorBlocks = (focusOptions = null) => {
        if (!(editorRoot instanceof HTMLElement)) return;

        ensureEditorHasBlock();
        editorRoot.innerHTML = editorState.blocks.map((block) => {
            if (block.type === 'image') {
                let flexClass = 'justify-center';
                if (block.align === 'left') flexClass = 'justify-start';
                if (block.align === 'right') flexClass = 'justify-end';
                
                let widthClass = 'w-full';
                if (block.width === '75') widthClass = 'w-full md:w-3/4';
                if (block.width === '50') widthClass = 'w-3/4 md:w-1/2';
                if (block.width === '25') widthClass = 'w-1/2 md:w-1/3 max-w-sm';

                const align = block.align || 'center';

                return `
                    <article data-editor-block-id="${escapeHtml(block.id)}" class="group relative my-2">
                        <div class="absolute right-0 top-1 z-10 flex flex-wrap items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 bg-white/90 backdrop-blur-sm p-1 rounded-[1.25rem] shadow-sm border border-slate-200">
                            <button type="button" data-editor-action="move-up" data-block-id="${escapeHtml(block.id)}" class="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" title="위로 이동">↑</button>
                            <button type="button" data-editor-action="move-down" data-block-id="${escapeHtml(block.id)}" class="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" title="아래로 이동">↓</button>
                            <div class="w-[1px] h-4 bg-slate-200 mx-1"></div>
                            <button type="button" data-editor-action="align-left" data-block-id="${escapeHtml(block.id)}" class="inline-flex h-8 px-2 items-center justify-center rounded-full text-xs font-medium ${align === 'left' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}">좌</button>
                            <button type="button" data-editor-action="align-center" data-block-id="${escapeHtml(block.id)}" class="inline-flex h-8 px-2 items-center justify-center rounded-full text-xs font-medium ${align === 'center' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}">중</button>
                            <button type="button" data-editor-action="align-right" data-block-id="${escapeHtml(block.id)}" class="inline-flex h-8 px-2 items-center justify-center rounded-full text-xs font-medium ${align === 'right' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}">우</button>
                            <div class="w-[1px] h-4 bg-slate-200 mx-1"></div>
                            <button type="button" data-editor-action="size-decrease" data-block-id="${escapeHtml(block.id)}" class="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100" title="축소">-</button>
                            <span class="text-xs font-medium text-slate-600 w-8 text-center flex items-center justify-center">${block.width || '100'}%</span>
                            <button type="button" data-editor-action="size-increase" data-block-id="${escapeHtml(block.id)}" class="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100" title="확대">+</button>
                            <div class="w-[1px] h-4 bg-slate-200 mx-1"></div>
                            <button type="button" data-editor-action="insert-paragraph-after" data-block-id="${escapeHtml(block.id)}" class="inline-flex h-8 px-2 items-center justify-center rounded-full text-xs font-medium text-slate-600 hover:bg-slate-100">아래 문단</button>
                            <button type="button" data-editor-action="replace-image" data-block-id="${escapeHtml(block.id)}" class="inline-flex h-8 px-2 items-center justify-center rounded-full text-xs font-medium text-slate-600 hover:bg-slate-100" title="이미지 교체">교체</button>
                            <button type="button" data-editor-action="remove-block" data-block-id="${escapeHtml(block.id)}" class="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-500 hover:bg-red-50" title="삭제">×</button>
                        </div>
                        <div class="flex ${flexClass} w-full mt-12 mb-2 relative z-0">
                            <figure class="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-slate-50 ${widthClass}">
                                <img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt || '본문 이미지')}" loading="lazy" decoding="async" class="h-full w-full object-cover">
                            </figure>
                        </div>
                        <label class="mt-3 block relative z-0">
                            <span class="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">이미지 설명</span>
                            <input
                                type="text"
                                value="${escapeHtml(block.alt || '')}"
                                data-editor-image-alt="${escapeHtml(block.id)}"
                                data-block-id="${escapeHtml(block.id)}"
                                class="w-full rounded-[1rem] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                            >
                        </label>
                    </article>
                `;
            }

            return `
                <article data-editor-block-id="${escapeHtml(block.id)}">
                    <div
                        contenteditable="true"
                        spellcheck="true"
                        data-editor-paragraph="${escapeHtml(block.id)}"
                        data-block-id="${escapeHtml(block.id)}"
                        class="min-h-[1.5rem] py-0.5 text-[1.08rem] leading-[1.65rem] text-slate-700 outline-none whitespace-pre-wrap md:text-[1.12rem] md:leading-[1.75rem]"
                    >${paragraphTextToEditableHtml(block.text)}</div>
                </article>
            `;
        }).join('');

        syncEditorContent();

        if (focusOptions?.blockId) {
            focusBlogEditorParagraph(editorRoot, focusOptions.blockId, focusOptions.offset || 'end');
        }
    };

    const insertParagraphAfterBlock = (blockId, text = '', focusOffset = 'end') => {
        const newBlock = createEmptyBlogParagraphBlock(text);
        const blockIndex = getBlockIndex(blockId);

        if (blockIndex === -1) {
            editorState.blocks.push(newBlock);
        } else {
            editorState.blocks.splice(blockIndex + 1, 0, newBlock);
        }

        editorState.focusedBlockId = newBlock.id;
        renderEditorBlocks({ blockId: newBlock.id, offset: focusOffset });
        scheduleComposerDraftPersist({ delay: 0, silent: true, force: true });
        return newBlock.id;
    };

    const removeBlock = (blockId) => {
        const blockIndex = getBlockIndex(blockId);
        if (blockIndex === -1) return;

        editorState.blocks.splice(blockIndex, 1);
        ensureEditorHasBlock();

        const previousParagraphId = findNearestParagraphForFocus(blockIndex - 1, -1);
        const nextParagraphId = findNearestParagraphForFocus(blockIndex, 1);
        const focusBlockId = previousParagraphId || nextParagraphId || editorState.blocks[0]?.id || '';
        editorState.focusedBlockId = focusBlockId;
        renderEditorBlocks({ blockId: focusBlockId, offset: 'end' });
        scheduleComposerDraftPersist({ delay: 0, silent: true, force: true });
    };

    const insertImagesAfterBlock = (blockId, uploads) => {
        const imageBlocks = uploads.map((upload) => ({
            id: createBlogEditorBlockId(),
            type: 'image',
            src: upload.url,
            alt: upload.alt || '본문 이미지',
            align: 'center',
            width: '100',
        }));

        const blockIndex = getBlockIndex(blockId);
        const insertIndex = blockIndex === -1 ? editorState.blocks.length : blockIndex + 1;
        editorState.blocks.splice(insertIndex, 0, ...imageBlocks);

        const paragraphBlock = createEmptyBlogParagraphBlock('');
        editorState.blocks.splice(insertIndex + imageBlocks.length, 0, paragraphBlock);
        editorState.focusedBlockId = paragraphBlock.id;
        renderEditorBlocks({ blockId: paragraphBlock.id, offset: 'start' });
        scheduleComposerDraftPersist({ delay: 0, silent: true, force: true });
    };

    const replaceImageBlock = (blockId, uploads) => {
        const imageBlock = getBlockById(blockId);
        if (!imageBlock || imageBlock.type !== 'image') return;

        const [firstUpload, ...restUploads] = uploads;
        if (firstUpload) {
            imageBlock.src = firstUpload.url;
            imageBlock.alt = firstUpload.alt || '본문 이미지';
        }

        if (restUploads.length) {
            const imageBlocks = restUploads.map((upload) => ({
                id: createBlogEditorBlockId(),
                type: 'image',
                src: upload.url,
                alt: upload.alt || '본문 이미지',
                align: 'center',
                width: '100',
            }));
            const blockIndex = getBlockIndex(blockId);
            editorState.blocks.splice(blockIndex + 1, 0, ...imageBlocks);
        }

        renderEditorBlocks();
        scheduleComposerDraftPersist({ delay: 0, silent: true, force: true });
    };

    const uploadAndInsertImages = async (files, options = {}) => {
        if (!(contentInput instanceof HTMLTextAreaElement) || isUploadingImages) return;

        const imageFiles = Array.from(files || []).filter((file) => file instanceof File && file.type.startsWith('image/'));
        if (!imageFiles.length) return;

        isUploadingImages = true;
        setImageControlsDisabled(true);
        setDropzoneActive(false);
        setFormStatus('이미지 업로드 중입니다...');

        try {
            const titleInput = form.elements.namedItem('title');
            const uploads = await uploadBlogImages(imageFiles, {
                title: titleInput instanceof HTMLInputElement ? titleInput.value : '',
                slugHint: titleInput instanceof HTMLInputElement ? titleInput.value : '',
            });
            const usedInlineFallback = uploads.some((upload) => upload?.storage === 'inline');

            if (options.replaceBlockId) {
                replaceImageBlock(options.replaceBlockId, uploads);
                setFormStatus(
                    usedInlineFallback
                        ? '스토리지 업로드를 사용할 수 없어 이미지를 본문에 직접 포함해 교체했습니다.'
                        : '이미지가 교체되었습니다.',
                    'success'
                );
            } else {
                insertImagesAfterBlock(options.afterBlockId || editorState.focusedBlockId, uploads);
                setFormStatus(
                    usedInlineFallback
                        ? '스토리지 업로드를 사용할 수 없어 이미지를 본문에 직접 포함했습니다.'
                        : '이미지가 본문에 삽입되었습니다.',
                    'success'
                );
            }
        } catch (error) {
            setFormStatus(error instanceof Error ? error.message : '이미지 업로드에 실패했습니다.', 'error');
        } finally {
            isUploadingImages = false;
            setImageControlsDisabled(false);
            if (imagePicker instanceof HTMLInputElement) {
                imagePicker.value = '';
            }
            pendingImageReplaceBlockId = '';
        }
    };

    if (restoredDraft) {
        if (categoryInput instanceof HTMLInputElement) categoryInput.value = restoredDraft.category;
        if (authorInput instanceof HTMLInputElement) authorInput.value = restoredDraft.authorName;
        if (titleInput instanceof HTMLInputElement) titleInput.value = restoredDraft.title;
        if (summaryInput instanceof HTMLTextAreaElement) summaryInput.value = restoredDraft.summary;
        if (slugInput instanceof HTMLInputElement) slugInput.value = restoredDraft.slug;
        if (coverImageUrlInput instanceof HTMLInputElement) coverImageUrlInput.value = restoredDraft.coverImageUrl;
        if (coverImageAltInput instanceof HTMLInputElement) coverImageAltInput.value = restoredDraft.coverImageAlt;
    }

    editorState.focusedBlockId = editorState.blocks[0]?.id || '';
    renderEditorBlocks({ blockId: editorState.focusedBlockId, offset: 'start' });

    if (restoredDraft) {
        setFormStatus('임시저장본을 복원했습니다.', 'success');
    }

    if (editorRoot instanceof HTMLElement) {
        editorRoot.addEventListener('focusin', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;

            const blockId = target.dataset.blockId || '';
            if (blockId) {
                editorState.focusedBlockId = blockId;
            }
        });

        editorRoot.addEventListener('input', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;

            if (target.matches('[data-editor-paragraph]')) {
                const blockId = target.dataset.blockId || '';
                const block = getBlockById(blockId);
                if (block?.type === 'paragraph') {
                    block.text = getBlogEditorTextFromElement(target);
                    editorState.focusedBlockId = blockId;
                    syncEditorContent();
                    scheduleComposerDraftPersist();
                }
                return;
            }

            if (target.matches('[data-editor-image-alt]')) {
                const blockId = target.dataset.blockId || '';
                const block = getBlockById(blockId);
                if (block?.type === 'image' && target instanceof HTMLInputElement) {
                    block.alt = target.value;
                    editorState.focusedBlockId = blockId;
                    syncEditorContent();
                    scheduleComposerDraftPersist();
                }
            }
        });

        editorRoot.addEventListener('keydown', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement) || !target.matches('[data-editor-paragraph]')) return;

            const blockId = target.dataset.blockId || '';
            const block = getBlockById(blockId);
            if (!block || block.type !== 'paragraph') return;

            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                const caretOffset = getBlogEditorCaretOffset(target);
                const currentText = getBlogEditorTextFromElement(target);
                const beforeText = currentText.slice(0, caretOffset);
                const afterText = currentText.slice(caretOffset);
                block.text = beforeText;
                insertParagraphAfterBlock(blockId, afterText, 'start');
                return;
            }

            if (event.key === 'Backspace') {
                const caretOffset = getBlogEditorCaretOffset(target);
                const currentText = getBlogEditorTextFromElement(target);
                if (caretOffset === 0) {
                    const blockIndex = getBlockIndex(blockId);
                    if (blockIndex > 0) {
                        event.preventDefault();
                        const prevBlockId = findNearestParagraphForFocus(blockIndex - 1, -1);
                        if (prevBlockId) {
                            const prevNode = editorRoot.querySelector(`[data-editor-paragraph="${prevBlockId}"]`);
                            const oldOffset = prevNode ? String(prevNode.innerText || '').length : 0;
                            const prevBlock = getBlockById(prevBlockId);
                            prevBlock.text = (prevBlock.text || '') + (block.text || '');
                            editorState.blocks.splice(blockIndex, 1);
                            editorState.focusedBlockId = prevBlockId;
                            renderEditorBlocks({ blockId: prevBlockId, offset: oldOffset });
                            scheduleComposerDraftPersist({ delay: 0, silent: true, force: true });
                        }
                        return;
                    }
                }
                if (!currentText && editorState.blocks.length > 1) {
                    event.preventDefault();
                    removeBlock(blockId);
                }
            }
            if (event.key === 'Delete') {
                const caretOffset = getBlogEditorCaretOffset(target);
                const currentText = getBlogEditorTextFromElement(target);
                if (caretOffset === currentText.length) {
                    const blockIndex = getBlockIndex(blockId);
                    if (blockIndex < editorState.blocks.length - 1) {
                        event.preventDefault();
                        const nextBlockId = findNearestParagraphForFocus(blockIndex + 1, 1);
                        if (nextBlockId) {
                            const nextBlock = getBlockById(nextBlockId);
                            block.text = (block.text || '') + (nextBlock.text || '');
                            editorState.blocks.splice(getBlockIndex(nextBlockId), 1);
                            editorState.focusedBlockId = blockId;
                            const oldOffset = caretOffset;
                            renderEditorBlocks();
                            scheduleComposerDraftPersist({ delay: 0, silent: true, force: true });
                            setTimeout(() => {
                                const newTarget = editorRoot.querySelector(`[data-editor-paragraph="${blockId}"]`);
                                if (newTarget) setBlogEditorCaretOffset(newTarget, oldOffset);
                            }, 50);
                        }
                        return;
                    }
                }
            }
        });

        editorRoot.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;

            const actionButton = target.closest('[data-editor-action]');
            if (!(actionButton instanceof HTMLButtonElement)) return;

            const action = actionButton.dataset.editorAction;
            const blockId = actionButton.dataset.blockId || '';
            if (!action || !blockId) return;

            const block = getBlockById(blockId);
            const blockIndex = getBlockIndex(blockId);

            if (action === 'move-up' && blockIndex > 0) {
                const temp = editorState.blocks[blockIndex - 1];
                editorState.blocks[blockIndex - 1] = editorState.blocks[blockIndex];
                editorState.blocks[blockIndex] = temp;
                renderEditorBlocks({ blockId });
                scheduleComposerDraftPersist();
                return;
            }

            if (action === 'move-down' && blockIndex < editorState.blocks.length - 1) {
                const temp = editorState.blocks[blockIndex + 1];
                editorState.blocks[blockIndex + 1] = editorState.blocks[blockIndex];
                editorState.blocks[blockIndex] = temp;
                renderEditorBlocks({ blockId });
                scheduleComposerDraftPersist();
                return;
            }

            if (action.startsWith('align-')) {
                if (block && block.type === 'image') {
                    block.align = action.replace('align-', '');
                    renderEditorBlocks({ blockId });
                    scheduleComposerDraftPersist();
                }
                return;
            }

            if (action === 'size-decrease' || action === 'size-increase') {
                if (block && block.type === 'image') {
                    const sizes = ['25', '50', '75', '100'];
                    const currentIndex = sizes.indexOf(String(block.width || '100'));
                    if (action === 'size-decrease' && currentIndex > 0) {
                        block.width = sizes[currentIndex - 1];
                    } else if (action === 'size-increase' && currentIndex < sizes.length - 1) {
                        block.width = sizes[currentIndex + 1];
                    }
                    renderEditorBlocks({ blockId });
                    scheduleComposerDraftPersist();
                }
                return;
            }

            if (action === 'insert-paragraph-after') {
                insertParagraphAfterBlock(blockId, '', 'start');
                return;
            }

            if (action === 'remove-block') {
                removeBlock(blockId);
                return;
            }

            if (action === 'replace-image' && imagePicker instanceof HTMLInputElement) {
                pendingImageReplaceBlockId = blockId;
                editorState.focusedBlockId = blockId;
                imagePicker.click();
            }
        });

        editorRoot.addEventListener('paste', async (event) => {
            const clipboardItems = Array.from(event.clipboardData?.items || []);
            const imageFiles = clipboardItems
                .map((item) => item.getAsFile?.())
                .filter((file) => file instanceof File);

            if (!imageFiles.length) return;
            event.preventDefault();
            await uploadAndInsertImages(imageFiles, { afterBlockId: editorState.focusedBlockId });
        });
    }

    if (editorShell instanceof HTMLElement) {
        editorShell.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() === 'a' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                const selection = window.getSelection();
                if (selection) {
                    const range = document.createRange();
                    if (editorRoot) {
                        range.selectNodeContents(editorRoot);
                        selection.removeAllRanges();
                        selection.addRange(range);
                        editorShell.focus();
                    }
                }
                return;
            }

            if (event.key === 'Backspace' || event.key === 'Delete') {
                const selection = window.getSelection();
                if (selection && !selection.isCollapsed) {
                    const range = selection.getRangeAt(0);
                    if (range.commonAncestorContainer === editorRoot || range.commonAncestorContainer === editorShell) {
                        event.preventDefault();
                        editorState.blocks = [createEmptyBlogParagraphBlock('')];
                        editorState.focusedBlockId = editorState.blocks[0]?.id || '';
                        renderEditorBlocks({ blockId: editorState.focusedBlockId, offset: 'start' });
                        scheduleComposerDraftPersist({ delay: 0, silent: true, force: true });
                    }
                }
            }
        });
    }

    if (pickImageButton instanceof HTMLButtonElement && imagePicker instanceof HTMLInputElement) {
        pickImageButton.addEventListener('click', () => {
            pendingImageReplaceBlockId = '';
            imagePicker.click();
        });
        imagePicker.addEventListener('change', async () => {
            const options = pendingImageReplaceBlockId
                ? { replaceBlockId: pendingImageReplaceBlockId }
                : { afterBlockId: editorState.focusedBlockId };
            await uploadAndInsertImages(imagePicker.files, options);
        });
    }

    const toolbar = document.getElementById('blog-admin-toolbar');
    if (toolbar instanceof HTMLElement) {
        toolbar.addEventListener('mousedown', (event) => {
            if (event.target.closest('[data-rich-action]')) {
                event.preventDefault();
            }
        });
        toolbar.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-rich-action]');
            if (!btn) return;
            const command = btn.dataset.richAction;
            const value = btn.dataset.value || null;
            
            if (command === 'backColor' || command === 'foreColor') {
                document.execCommand('styleWithCSS', false, true);
                document.execCommand(command, false, value);
            } else {
                document.execCommand(command, false, null);
            }
            
            if (editorState.focusedBlockId) {
                const focusedEl = document.querySelector(`[data-editor-paragraph="${editorState.focusedBlockId}"]`);
                if (focusedEl) {
                    focusedEl.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        });
    }

    if (addParagraphButton instanceof HTMLButtonElement) {
        addParagraphButton.addEventListener('click', () => {
            insertParagraphAfterBlock(editorState.focusedBlockId, '', 'start');
        });
    }

    form.addEventListener('input', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (editorRoot instanceof HTMLElement && editorRoot.contains(target)) return;
        scheduleComposerDraftPersist();
    });

    if (dropzone instanceof HTMLElement) {
        dropzone.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.closest('[data-editor-action], [data-editor-paragraph], [data-editor-image-alt], button, input, img')) return;
            focusLastParagraphBlock('end');
        });

        ['dragenter', 'dragover'].forEach((eventName) => {
            dropzone.addEventListener(eventName, (event) => {
                event.preventDefault();
                setDropzoneActive(true);
            });
        });

        ['dragleave', 'dragend'].forEach((eventName) => {
            dropzone.addEventListener(eventName, (event) => {
                event.preventDefault();
                setDropzoneActive(false);
            });
        });

        dropzone.addEventListener('drop', async (event) => {
            event.preventDefault();
            const dataTransfer = event.dataTransfer;
            await uploadAndInsertImages(dataTransfer?.files, { afterBlockId: editorState.focusedBlockId });
        });
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearAutosaveTimer();
        setFormStatus('저장 중입니다...');

        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton instanceof HTMLButtonElement) {
            submitButton.disabled = true;
        }
        setImageControlsDisabled(true);

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
            await clearBlogComposerDraft();
            state.composerDraft = null;
            lastSavedDraftSnapshot = '';
            form.reset();
            const categoryInput = form.elements.namedItem('category');
            if (categoryInput instanceof HTMLInputElement) categoryInput.value = '서비스 업데이트';
            const authorInput = form.elements.namedItem('authorName');
            if (authorInput instanceof HTMLInputElement) authorInput.value = '평가원기출VOCA';
            editorState.blocks = createBlogEditorBlocks('');
            editorState.focusedBlockId = editorState.blocks[0]?.id || '';
            renderEditorBlocks({ blockId: editorState.focusedBlockId, offset: 'start' });
            setFormStatus('글이 저장되었습니다.', 'success');
            renderPostList();
            setStatus('새 글이 공개되었습니다.', 'success');
        } catch (error) {
            setFormStatus(error instanceof Error ? error.message : '글 저장에 실패했습니다.', 'error');
        } finally {
            if (submitButton instanceof HTMLButtonElement) {
                submitButton.disabled = false;
            }
            setImageControlsDisabled(false);
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

const refreshPosts = async () => {
    const posts = await listBlogPosts();
    state.posts = posts;
    ensureSelectedSlugExists();
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
    state.composerDraft = state.isAdmin ? await loadBlogComposerDraft() : null;
    if (state.isAdmin && state.composerDraft) {
        state.isComposerOpen = true;
    }
    renderAdminComposer();
};

export const initBlogPage = async () => {
    syncSelectedSlug();

    const initialPosts = readInitialPosts();
    if (initialPosts.length) {
        state.posts = initialPosts;
        ensureSelectedSlugExists();
        renderPostList();
    } else {
        renderFallbackPosts();
    }

    void initAuthNavLinks({
        loggedInLabel: '마이페이지',
        loggedInPath: '/mypage/',
        loggedInAction: 'mypage',
    }).catch((error) => {
        console.warn('[blog-page] auth nav init failed', error);
    });

    const flushPendingComposerDraft = () => {
        if (typeof state.flushComposerDraft === 'function') {
            state.flushComposerDraft();
        }
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            flushPendingComposerDraft();
        }
    });
    window.addEventListener('pagehide', flushPendingComposerDraft);
    window.addEventListener('beforeunload', flushPendingComposerDraft);

    bindAdminComposer();
    bindPostSelection();
    void syncAdminState().catch((error) => {
        console.warn('[blog-page] admin state sync failed', error);
    });
    void refreshPosts().catch((error) => {
        console.warn('[blog-page] post refresh failed', error);
        setStatus('블로그 글을 최신 상태로 불러오지 못했습니다.', 'error');
    });

    supabase.auth.onAuthStateChange(async (_event, session) => {
        state.isAdmin = isBlogAdminUser(session?.user || null);
        state.composerDraft = state.isAdmin ? await loadBlogComposerDraft() : null;
        if (state.isAdmin && state.composerDraft) {
            state.isComposerOpen = true;
        }
        renderAdminComposer();
    });
};

initBlogPage().catch((error) => {
    console.error('[blog-page]', error);
    setStatus('블로그 페이지를 초기화하는 중 오류가 발생했습니다.', 'error');
});
