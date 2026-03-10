import { completeAuthFromUrl } from '/src/lib/authCallback.js';
import { initAuthNavLinks } from '/src/lib/authNav.js';
import { formatBlogDate, getBlogPostUrl, listBlogPosts } from '/src/lib/blog.js';

const escapeHtml = (value) => {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const setBlogStatus = (message = '') => {
    const statusEl = document.getElementById('landing-blog-status');
    if (!(statusEl instanceof HTMLElement)) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('hidden', !message);
};

const renderBlogPreview = async () => {
    const grid = document.getElementById('landing-blog-grid');
    if (!(grid instanceof HTMLElement)) return;

    setBlogStatus('최근 글을 불러오는 중입니다.');
    const posts = await listBlogPosts();
    const featuredPosts = posts.slice(0, 3);

    if (!featuredPosts.length) {
        grid.innerHTML = '';
        setBlogStatus('아직 공개된 글이 없습니다.');
        return;
    }

    grid.innerHTML = featuredPosts.map((post, index) => {
        const isFeatured = index === 0;
        return `
            <article class="${isFeatured ? 'md:col-span-12 bg-slate-900 text-white border-slate-900' : 'md:col-span-6 bg-white text-slate-900 border-slate-200'} rounded-[2rem] border p-7 md:p-8 shadow-[0_22px_70px_-50px_rgba(15,23,42,0.45)]">
                <div class="flex items-center justify-between gap-4 text-xs font-semibold uppercase tracking-[0.18em] ${isFeatured ? 'text-slate-300' : 'text-slate-400'}">
                    <span>${escapeHtml(post.category)}</span>
                    <span>${escapeHtml(formatBlogDate(post.publishedAt || post.createdAt))}</span>
                </div>
                <h3 class="mt-5 text-${isFeatured ? '3xl' : '2xl'} font-semibold tracking-tight leading-tight">${escapeHtml(post.title)}</h3>
                <p class="mt-4 max-w-2xl text-sm md:text-base leading-7 ${isFeatured ? 'text-slate-300' : 'text-slate-500'}">${escapeHtml(post.summary)}</p>
                <a href="${escapeHtml(getBlogPostUrl(post.slug))}" class="mt-8 inline-flex items-center gap-2 text-sm font-medium ${isFeatured ? 'text-white' : 'text-slate-900'}">
                    글 읽기
                    <span aria-hidden="true">→</span>
                </a>
            </article>
        `;
    }).join('');

    setBlogStatus('');
};

export const initLandingPage = async () => {
    const clearCallbackPending = () => {
        document.documentElement.classList.remove('auth-callback-pending');
    };

    const callbackResult = await completeAuthFromUrl();
    if (callbackResult.status === 'success') {
        window.location.replace('/dashboard/');
        return;
    }

    clearCallbackPending();
    if (callbackResult.status === 'error' && callbackResult.message) {
        window.alert(callbackResult.message);
    }

    await initAuthNavLinks({
        loggedInLabel: '마이페이지',
        loggedInPath: '/mypage/',
        loggedInAction: 'mypage',
    });
    await renderBlogPreview();
};
