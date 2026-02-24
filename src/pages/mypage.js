const TEST_HISTORY_KEY = 'voca_plus_test_history_v1';
const GENERATOR_HISTORY_KEY = 'voca_plus_generator_history_v1';
const TEST_HISTORY_LIMIT = 10;
const GENERATOR_HISTORY_LIMIT = 20;

const BOOK_LABELS = {
    basic: '베이직',
    advanced: '어드밴스드',
    etymology: '어원편',
};

const normalizeSpacingText = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/\uFEFF/g, '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const escapeHtml = (value) => {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const formatLocalDatetime = (isoString) => {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '-';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
};

const safeParseHistory = (raw, limit) => {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item) => item && typeof item === 'object').slice(0, limit);
    } catch (_) {
        return [];
    }
};

const getBookLabel = (bookKey) => {
    const normalized = normalizeSpacingText(bookKey).toLowerCase();
    return BOOK_LABELS[normalized] || normalizeSpacingText(bookKey) || '-';
};

const renderGeneratorHistory = (container) => {
    if (!container) return;
    const history = safeParseHistory(localStorage.getItem(GENERATOR_HISTORY_KEY), GENERATOR_HISTORY_LIMIT);
    if (history.length === 0) {
        container.innerHTML = '<p class="subtitle">아직 생성된 시험지 기록이 없습니다.</p>';
        return;
    }

    container.innerHTML = history.map((entry, index) => {
        const config = entry?.config || {};
        const selectedCount = Array.isArray(config.selectedTocs) ? config.selectedTocs.length : 0;
        const fileNames = Array.isArray(entry?.files) ? entry.files.join(', ') : '-';
        const generatedAt = formatLocalDatetime(entry?.generatedAt);
        const questionCount = Number.isInteger(config.numQuestions) ? config.numQuestions : 0;
        const examTitle = normalizeSpacingText(config.examTitle) || '어휘 시험지';
        const outputFormat = normalizeSpacingText(config.outputFormat) || '-';

        return `
            <div class="test-history-item">
                <strong>${index + 1}. ${escapeHtml(generatedAt)}</strong>
                <span>제목: ${escapeHtml(examTitle)}</span>
                <span>교재: ${escapeHtml(getBookLabel(config.bookKey || config.bookName))}</span>
                <span>형식/문항: ${escapeHtml(outputFormat)} / ${questionCount}문항</span>
                <span>선택 범위: ${selectedCount}개</span>
                <span>파일: ${escapeHtml(fileNames)}</span>
            </div>
        `;
    }).join('');
};

const renderTestHistory = (container) => {
    if (!container) return;
    const history = safeParseHistory(localStorage.getItem(TEST_HISTORY_KEY), TEST_HISTORY_LIMIT);
    if (history.length === 0) {
        container.innerHTML = '<p class="subtitle">최근 온라인 테스트 기록이 없습니다.</p>';
        return;
    }

    container.innerHTML = history.map((entry, index) => {
        const score = Number(entry?.summary?.correct || 0);
        const total = Number(entry?.summary?.total || 0);
        const accuracy = Number(entry?.summary?.accuracy || 0).toFixed(1);
        const finishedAt = formatLocalDatetime(entry?.finishedAt);
        return `
            <div class="test-history-item">
                <strong>${index + 1}. ${escapeHtml(finishedAt)}</strong>
                <span>교재: ${escapeHtml(getBookLabel(entry?.config?.bookKey))}</span>
                <span>점수: ${score}/${total} (${accuracy}%)</span>
                <span>인증코드: ${escapeHtml(entry?.verificationCode || '-')}</span>
            </div>
        `;
    }).join('');
};

export const initMyPage = () => {
    renderGeneratorHistory(document.getElementById('mypage-generator-history'));
    renderTestHistory(document.getElementById('mypage-test-history'));
};
