import { supabase } from '/src/lib/supabaseClient.js';
import {
    BLOG_SELECT_FIELDS,
    formatBlogDate,
    getBlogPostUrl,
    getFallbackBlogPosts,
    mapBlogPost,
    normalizeBlogPosts,
    normalizeSpacingText,
    slugifyBlogText,
} from '/src/lib/blog-content.js?v=20260319-blog-upload-key-fix';

export {
    formatBlogDate,
    getBlogPostUrl,
    getFallbackBlogPosts,
};

export const BLOG_IMAGE_BUCKET = 'blog-images';
const MAX_BLOG_IMAGE_FILE_BYTES = 10 * 1024 * 1024;
const INLINE_BLOG_IMAGE_MAX_DIMENSION = 1600;
const INLINE_BLOG_IMAGE_OUTPUT_QUALITY = 0.86;

const shouldInlineBlogImageFallback = (error) => {
    const message = normalizeSpacingText(error?.message).toLowerCase();
    return message.includes('bucket')
        || message.includes('row-level security')
        || message.includes('permission')
        || message.includes('not authorized')
        || message.includes('unauthorized')
        || error?.statusCode === '401'
        || error?.statusCode === '403'
        || error?.status === 401
        || error?.status === 403;
};

const getBlogImageAltText = (value, fallback = '본문 이미지') => {
    const normalized = normalizeSpacingText(value)
        .replace(/\.[^./\\]+$/u, '')
        .trim();

    return normalized || fallback;
};

const getBlogImageExtension = (file) => {
    const fileType = normalizeSpacingText(file?.type).toLowerCase();
    if (fileType === 'image/jpeg') return 'jpg';
    if (fileType === 'image/png') return 'png';
    if (fileType === 'image/webp') return 'webp';
    if (fileType === 'image/gif') return 'gif';
    if (fileType === 'image/svg+xml') return 'svg';

    const name = normalizeSpacingText(file?.name);
    const match = name.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : 'png';
};

const parseBooleanLike = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const normalized = normalizeSpacingText(value).toLowerCase();
    if (!normalized) return false;
    return ['1', 'true', 'yes', 'y', 'admin', 'enabled', 'on'].includes(normalized);
};

const createBlogImagePath = (file) => {
    const extension = getBlogImageExtension(file);
    const datePath = new Date().toISOString().slice(0, 10);
    // Keep storage keys opaque so uploads never depend on the user's language or filename.
    return `${datePath}/${crypto.randomUUID()}.${extension}`;
};

const readBlogFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(normalizeSpacingText(reader.result));
    reader.onerror = () => reject(new Error('이미지 데이터를 읽지 못했습니다.'));
    reader.readAsDataURL(file);
});

const loadBlogImageElement = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    image.src = src;
});

const createInlineBlogImageDataUrl = async (file) => {
    const fileType = normalizeSpacingText(file?.type).toLowerCase();
    const directEmbedTypes = new Set(['image/gif', 'image/svg+xml']);
    if (directEmbedTypes.has(fileType)) {
        return readBlogFileAsDataUrl(file);
    }

    const originalDataUrl = await readBlogFileAsDataUrl(file);
    if (typeof document === 'undefined') {
        return originalDataUrl;
    }

    try {
        const image = await loadBlogImageElement(originalDataUrl);
        const maxSize = INLINE_BLOG_IMAGE_MAX_DIMENSION;
        const scale = Math.min(1, maxSize / Math.max(image.naturalWidth || 0, image.naturalHeight || 0, 1));
        const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
        const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return originalDataUrl;
        }

        ctx.drawImage(image, 0, 0, width, height);
        const outputType = fileType === 'image/png' ? 'image/png' : 'image/webp';
        return canvas.toDataURL(outputType, INLINE_BLOG_IMAGE_OUTPUT_QUALITY);
    } catch (_) {
        return originalDataUrl;
    }
};

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
        return normalizeBlogPosts(data);
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

export const uploadBlogImages = async (files, options = {}) => {
    const fileList = Array.from(files || []);
    if (!fileList.length) {
        return [];
    }

    const uploads = [];

    for (const file of fileList) {
        if (!(file instanceof File) || !normalizeSpacingText(file.type).toLowerCase().startsWith('image/')) {
            throw new Error('이미지 파일만 업로드할 수 있습니다.');
        }

        if ((file.size || 0) > MAX_BLOG_IMAGE_FILE_BYTES) {
            throw new Error('이미지는 10MB 이하만 업로드할 수 있습니다.');
        }

        const path = createBlogImagePath(file);
        const { error: uploadError } = await supabase
            .storage
            .from(BLOG_IMAGE_BUCKET)
            .upload(path, file, {
                cacheControl: '31536000',
                upsert: false,
                contentType: file.type || undefined,
            });

        if (uploadError) {
            if (shouldInlineBlogImageFallback(uploadError)) {
                const inlineDataUrl = await createInlineBlogImageDataUrl(file);
                uploads.push({
                    alt: getBlogImageAltText(file.name),
                    path: '',
                    storage: 'inline',
                    url: inlineDataUrl,
                });
                continue;
            }
            throw new Error(normalizeSpacingText(uploadError.message) || '이미지 업로드에 실패했습니다.');
        }

        const { data } = supabase.storage.from(BLOG_IMAGE_BUCKET).getPublicUrl(path);
        const publicUrl = normalizeSpacingText(data?.publicUrl);
        if (!publicUrl) {
            throw new Error('업로드는 완료됐지만 이미지 URL을 가져오지 못했습니다.');
        }

        uploads.push({
            alt: getBlogImageAltText(file.name),
            path,
            storage: 'bucket',
            url: publicUrl,
        });
    }

    return uploads;
};
