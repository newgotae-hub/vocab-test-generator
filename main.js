document.addEventListener('DOMContentLoaded', () => {
    const PDF_ASSET_VERSION = '20260319h';
    const ENTITLEMENT_REQUEST_TIMEOUT_MS = 8000;
    const MAX_QUESTION_COUNT = 200;
    const UNVERIFIED_MAX_QUESTION_COUNT = 50;
    const GENERATOR_HISTORY_KEY = 'voca_plus_generator_history_v1';
    const GENERATOR_HISTORY_LIMIT = 20;
    const GENERATOR_ARCHIVE_DB_NAME = 'voca_plus_generator_archive_v1';
    const GENERATOR_ARCHIVE_STORE_NAME = 'archives';
    const GENERATOR_RESTORE_REQUEST_KEY = 'voca_plus_generator_restore_request_v1';
    const ENTITLEMENT_API_PATH = '/api/account/entitlement';
    const GENERATOR_DAILY_DOWNLOAD_COUNT_KEY = 'voca_plus_generator_daily_download_count_v1';
    const UNVERIFIED_DAILY_DOWNLOAD_LIMIT = 1;
    const PURCHASE_VERIFIED_KEYS = [
        'book_purchase_verified',
        'bookPurchaseVerified',
        'purchase_verified',
        'purchaseVerified',
        'is_book_purchase_verified',
        'isBookPurchaseVerified',
    ];

    // --- Library Instances ---
    let PDFDocument = null;
    let rgb = null;
    const hasFontkit = typeof window.fontkit !== 'undefined';
    if (typeof window.PDFLib !== 'undefined') {
        ({ PDFDocument, rgb } = window.PDFLib);
        if (!hasFontkit) {
            console.warn('fontkit 라이브러리를 찾을 수 없어 PDF 한글 폰트 등록을 건너뜁니다.');
        }
    } else {
        console.warn('PDFLib 라이브러리를 찾을 수 없어 PDF 기능을 비활성화합니다.');
    }

    // --- State ---
    const state = {
        allWords: [],
        wordsByToc: {},
        bookDataByKey: {
            etymology: [],
            basic: [],
            advanced: [],
        },
        wordsByTocByKey: {
            etymology: {},
            basic: {},
            advanced: {},
        },
        loadedBooks: new Set(),
        isDataReady: false,
        koreanFont: null,
        koreanBoldFont: null,
        selectedBook: null,
        selectedChapter: null,
        selectedTocs: new Set(),
        includeDerivatives: false,
        emptyWordWarningShown: false,
        isExamTitleCustomized: false,
        isQuestionCountCustomized: false,
        requestedQuestionCount: null,
        isBookSelectionLoading: false,
        purchasePolicyNoticeShown: false,
        purchaseAccess: {
            userId: '',
            isBookPurchaseVerified: false,
            dailyDownloadLimit: 1,
            dailyDownloadUsed: 0,
            canDownload: true,
        },
        get selectedWords() {
            return getSelectedWordsForTocs(this.selectedTocs);
        },
        ui: {
            bookLibrary: document.getElementById('book-library'),
            subChapterSelectionCard: document.getElementById('sub-chapter-selection-card'),
            tocSelectionCard: document.getElementById('toc-selection-card'),
            testConfigCard: document.getElementById('test-config-card'),
            sectionLinks: document.querySelectorAll('.section-link[data-section]'),
            tocChecklist: document.getElementById('toc-checklist'),
            selectAllToc: document.getElementById('select-all-toc'),
            deselectAllToc: document.getElementById('deselect-all-toc'),
            tocSummary: document.getElementById('toc-summary'),
            selectedTotalBadge: document.getElementById('selected-total-badge'),
            testTypeOptions: document.querySelector('.test-type-options'),
            numQuestions: document.getElementById('num-questions'),
            numQuestionsHint: document.getElementById('num-questions-hint'),
            shuffleQuestions: document.getElementById('shuffle-questions'),
            generateBtn: document.getElementById('generate-test-papers'),
            examTitle: document.getElementById('exam-title'),
            includeDerivatives: document.getElementById('include-derivatives'),
            includeDerivativesGroup: document.getElementById('include-derivatives-group'),
            generatorLoadingOverlay: document.getElementById('generator-loading-overlay'),
            generatorLoadingTitle: document.getElementById('generator-loading-title'),
            generatorLoadingDescription: document.getElementById('generator-loading-description'),
        }
    };
    let initialDataLoadTask = null;
    const bookLibraryCard = state.ui.bookLibrary.closest('.card');
    const leftColumn = document.querySelector('.left-column');
    const rightColumn = document.querySelector('.right-column');
    const syncGeneratorBookStageLayout = () => {
        const isGeneratorPage = document.body?.dataset?.page === 'generator';
        const isBookSelectionStage = isGeneratorPage && !state.selectedBook;
        document.body?.classList.toggle('generator-book-stage', isBookSelectionStage);
    };

    const getSectionCards = (section) => {
        if (section === 'books') return [bookLibraryCard].filter(Boolean);
        if (section === 'toc') return [state.ui.subChapterSelectionCard, state.ui.tocSelectionCard].filter(Boolean);
        if (section === 'settings') return [state.ui.testConfigCard].filter(Boolean);
        return [];
    };
    const isMobileViewport = () => window.matchMedia('(max-width: 920px)').matches;

    const ensureMobileSettingsAtBottom = () => {
        const settingsCard = state.ui.testConfigCard;
        if (!settingsCard) return;

        if (isMobileViewport()) {
            if (rightColumn && settingsCard.parentElement !== rightColumn) {
                rightColumn.appendChild(settingsCard);
            }
            return;
        }

        if (leftColumn && settingsCard.parentElement !== leftColumn) {
            leftColumn.appendChild(settingsCard);
        }
    };

    const setSectionOpen = (section, isOpen) => {
        const cards = getSectionCards(section);
        cards.forEach(card => card.classList.toggle('hidden', !isOpen));

        const link = [...state.ui.sectionLinks].find(link => link?.dataset.section === section);
        if (link) {
            link.classList.toggle('section-link--active', isOpen);
        }
    };

    const toggleSection = (section) => {
        const cards = getSectionCards(section);
        if (!cards.length) return;

        const isCurrentlyOpen = cards.some(card => !card.classList.contains('hidden'));

        if (section === 'toc' && !isCurrentlyOpen) {
            if (state.selectedBook && state.selectedBook !== 'etymology') {
                state.ui.subChapterSelectionCard.classList.add('hidden');
                state.ui.tocSelectionCard.classList.remove('hidden');
                setSectionOpen('toc', true);
                setSectionOpen('settings', true);
                return;
            }
            if (state.selectedBook === 'etymology' && !state.selectedChapter) {
                state.ui.subChapterSelectionCard.classList.remove('hidden');
                state.ui.tocSelectionCard.classList.add('hidden');
            } else if (state.selectedBook === 'etymology' && state.selectedChapter) {
                state.ui.tocSelectionCard.classList.remove('hidden');
                state.ui.subChapterSelectionCard.classList.add('hidden');
            } else if (state.selectedChapter) {
                state.ui.tocSelectionCard.classList.remove('hidden');
                state.ui.subChapterSelectionCard.classList.add('hidden');
            } else {
                state.ui.subChapterSelectionCard.classList.remove('hidden');
            }
            setSectionOpen('toc', true);
            setSectionOpen('settings', true);
            return;
        }

        if (section === 'settings') {
            setSectionOpen('settings', !isCurrentlyOpen);
            return;
        }

        setSectionOpen(section, !isCurrentlyOpen);
    };

    const syncSectionNavFromCards = () => {
        ['books', 'toc', 'settings'].forEach((section) => {
            const cards = getSectionCards(section);
            const isOpen = cards.some(card => !card.classList.contains('hidden'));
            setSectionOpen(section, isOpen);
        });
    };

    const normalizeBookKey = (bookName) => {
        const value = String(bookName || '').trim().toLowerCase();
        if (!value) return '';
        if (value === 'etymology' || value === '어원편' || value === '어원 편' || value === '어원-편') return 'etymology';
        if (value === 'basic' || value === '베이직' || value === '베이식') return 'basic';
        if (value === 'advanced' || value === '어드밴스드' || value === '어드밴스') return 'advanced';
        return value;
    };
    const parseBooleanLike = (value) => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value === 1;

        const normalized = normalizeSpacingText(value).toLowerCase();
        if (!normalized) return false;
        if (['1', 'true', 'yes', 'y', 'verified', '인증', '완료'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'n', 'unverified', '미인증'].includes(normalized)) return false;
        return false;
    };
    const readAuthSessionSnapshotFromStorage = () => {
        const storageList = [window.localStorage, window.sessionStorage];
        for (const storage of storageList) {
            if (!storage) continue;
            const keys = Object.keys(storage).filter((key) => (
                key.startsWith('sb-') && key.endsWith('-auth-token')
            ));

            for (const key of keys) {
                try {
                    const raw = storage.getItem(key);
                    if (!raw) continue;
                    const parsed = JSON.parse(raw);
                    const session = parsed?.currentSession || parsed?.session || null;
                    const user = session?.user || parsed?.currentUser || parsed?.user || null;
                    const accessToken = normalizeSpacingText(
                        session?.access_token
                        || parsed?.currentSession?.access_token
                        || parsed?.session?.access_token
                        || parsed?.access_token
                    );
                    const userId = normalizeSpacingText(
                        user?.id
                        || session?.user?.id
                    );

                    if (accessToken || userId || user) {
                        return {
                            accessToken,
                            userId,
                            user,
                        };
                    }
                } catch (_error) {
                    // Ignore malformed auth cache entry.
                }
            }
        }

        return {
            accessToken: '',
            userId: '',
            user: null,
        };
    };
    const getPurchaseVerifiedFromUser = (user) => {
        if (!user || typeof user !== 'object') return false;
        const appMetadata = user.app_metadata || {};
        const userMetadata = user.user_metadata || {};

        const hasVerifiedFlag = (metadata) => PURCHASE_VERIFIED_KEYS.some((key) => (
            Object.prototype.hasOwnProperty.call(metadata, key)
            && parseBooleanLike(metadata[key])
        ));

        return hasVerifiedFlag(appMetadata) || hasVerifiedFlag(userMetadata);
    };
    const applyEntitlementState = (payload, fallbackUserId = '') => {
        if (!payload || typeof payload !== 'object') return;
        state.purchaseAccess.userId = normalizeSpacingText(payload.userId || fallbackUserId);
        state.purchaseAccess.isBookPurchaseVerified = Boolean(payload.isBookPurchaseVerified);
        const limitRaw = Number.parseInt(payload.dailyDownloadLimit, 10);
        state.purchaseAccess.dailyDownloadLimit = Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : 1;
        const usedRaw = Number.parseInt(payload.dailyDownloadUsed, 10);
        state.purchaseAccess.dailyDownloadUsed = Number.isInteger(usedRaw) && usedRaw >= 0 ? usedRaw : 0;
        state.purchaseAccess.canDownload = Boolean(payload.canDownload);
    };
    const requestEntitlementByToken = async ({ token, action = 'status' }) => {
        const normalizedToken = normalizeSpacingText(token);
        if (!normalizedToken) throw new Error('인증 토큰이 필요합니다.');

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), ENTITLEMENT_REQUEST_TIMEOUT_MS);
        const response = await fetch(ENTITLEMENT_API_PATH, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${normalizedToken}`,
            },
            body: JSON.stringify({ action }),
            signal: controller.signal,
        }).finally(() => window.clearTimeout(timeoutId));
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
            const message = normalizeSpacingText(payload?.error) || '권한 정보를 불러오지 못했습니다.';
            throw new Error(message);
        }
        return payload;
    };
    const syncPurchaseAccess = async () => {
        const snapshot = readAuthSessionSnapshotFromStorage();
        const fallbackUserId = normalizeSpacingText(snapshot?.userId);
        const fallbackVerified = getPurchaseVerifiedFromUser(snapshot?.user);
        state.purchaseAccess.userId = fallbackUserId;
        state.purchaseAccess.isBookPurchaseVerified = fallbackVerified;
        const fallbackUsed = fallbackVerified ? 0 : getFallbackDailyDownloadCount(fallbackUserId);
        state.purchaseAccess.dailyDownloadLimit = UNVERIFIED_DAILY_DOWNLOAD_LIMIT;
        state.purchaseAccess.dailyDownloadUsed = fallbackUsed;
        state.purchaseAccess.canDownload = fallbackVerified || fallbackUsed < UNVERIFIED_DAILY_DOWNLOAD_LIMIT;

        const token = normalizeSpacingText(snapshot?.accessToken);
        if (!token) return null;
        try {
            const payload = await requestEntitlementByToken({ token, action: 'status' });
            applyEntitlementState(payload, fallbackUserId);
            return payload;
        } catch (error) {
            console.warn('권한 상태 동기화 실패:', error);
            return null;
        }
    };
    const isBookPurchaseVerified = () => Boolean(state.purchaseAccess.isBookPurchaseVerified);
    const getQuestionSelectionLimit = () => (
        isBookPurchaseVerified() ? MAX_QUESTION_COUNT : UNVERIFIED_MAX_QUESTION_COUNT
    );
    const getTodayDateKey = () => {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const getFallbackDailyDownloadStorageKey = (userId = '') => {
        const normalizedUserId = normalizeSpacingText(userId) || 'anonymous';
        return `${GENERATOR_DAILY_DOWNLOAD_COUNT_KEY}:${normalizedUserId}:${getTodayDateKey()}`;
    };
    const getFallbackDailyDownloadCount = (userId = '') => {
        const raw = localStorage.getItem(getFallbackDailyDownloadStorageKey(userId));
        const count = Number.parseInt(raw, 10);
        if (!Number.isInteger(count) || count < 0) return 0;
        return count;
    };
    const consumeFallbackDailyDownloadQuota = (userId = '') => {
        const current = getFallbackDailyDownloadCount(userId);
        if (current >= UNVERIFIED_DAILY_DOWNLOAD_LIMIT) return false;
        localStorage.setItem(getFallbackDailyDownloadStorageKey(userId), String(current + 1));
        return true;
    };
    const hasReachedDailyDownloadLimit = () => {
        return !isBookPurchaseVerified() && !Boolean(state.purchaseAccess.canDownload);
    };
    const consumeDailyDownloadQuota = async () => {
        if (isBookPurchaseVerified()) return true;
        const snapshot = readAuthSessionSnapshotFromStorage();
        const token = normalizeSpacingText(snapshot?.accessToken);
        const fallbackUserId = normalizeSpacingText(snapshot?.userId);
        if (!token) {
            const consumedFallback = consumeFallbackDailyDownloadQuota(fallbackUserId);
            const used = getFallbackDailyDownloadCount(fallbackUserId);
            state.purchaseAccess.dailyDownloadUsed = used;
            state.purchaseAccess.canDownload = used < UNVERIFIED_DAILY_DOWNLOAD_LIMIT;
            return consumedFallback;
        }
        try {
            const payload = await requestEntitlementByToken({
                token,
                action: 'consume_generator_download',
            });
            applyEntitlementState(payload, normalizeSpacingText(snapshot?.userId));
            return Boolean(payload?.isBookPurchaseVerified) || Boolean(payload?.consumed);
        } catch (error) {
            console.warn('다운로드 쿼터 소모 실패:', error);
            const consumedFallback = consumeFallbackDailyDownloadQuota(fallbackUserId);
            const used = getFallbackDailyDownloadCount(fallbackUserId);
            state.purchaseAccess.dailyDownloadUsed = used;
            state.purchaseAccess.canDownload = used < UNVERIFIED_DAILY_DOWNLOAD_LIMIT;
            return consumedFallback;
        }
    };
    const syncDerivativeAccessUi = () => {
        const isDerivativeBlocked = !isBookPurchaseVerified();
        if (isDerivativeBlocked) {
            state.includeDerivatives = false;
            if (state.ui.includeDerivatives) {
                state.ui.includeDerivatives.checked = false;
            }
        }
        if (state.ui.includeDerivativesGroup) {
            const shouldHide = state.selectedBook === 'etymology';
            state.ui.includeDerivativesGroup.classList.toggle('hidden', shouldHide);
        }
    };

    const getGeneratorRestoreRequest = () => {
        const raw = localStorage.getItem(GENERATOR_RESTORE_REQUEST_KEY);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            return parsed;
        } catch (_) {
            localStorage.removeItem(GENERATOR_RESTORE_REQUEST_KEY);
            return null;
        }
    };

    const clearGeneratorRestoreRequest = () => {
        localStorage.removeItem(GENERATOR_RESTORE_REQUEST_KEY);
    };

    const normalizeRestoreToc = (tocRaw, bookKey) => {
        const toc = normalizeSpacingText(tocRaw);
        if (!toc) return '';
        if (bookKey === 'etymology') return toc;
        const dayMatch = toc.match(/^day\s*0?(\d{1,2})$/i);
        if (!dayMatch) return toc;
        const dayNo = Number.parseInt(dayMatch[1], 10);
        if (!Number.isInteger(dayNo) || dayNo < 1 || dayNo > 99) return toc;
        return `DAY ${String(dayNo).padStart(2, '0')}`;
    };

    const getRestoreEtymologySelections = (config = {}) => {
        const scopedSelections = Array.isArray(config.selectedTocScopes)
            ? config.selectedTocScopes
                .map((scope) => ({
                    chapterId: normalizeSpacingText(scope?.chapter || scope?.chapterId),
                    toc: normalizeSpacingText(scope?.toc),
                }))
                .filter((scope) => scope.chapterId && scope.toc)
            : [];

        if (scopedSelections.length > 0) return scopedSelections;

        const fallbackChapterId = normalizeSpacingText(config.selectedChapter);
        if (!fallbackChapterId) return [];

        return (Array.isArray(config.selectedTocs) ? config.selectedTocs : [])
            .map((toc) => ({
                chapterId: fallbackChapterId,
                toc: normalizeRestoreToc(toc, 'etymology'),
            }))
            .filter((scope) => scope.chapterId && scope.toc);
    };

    const getBookNameForOutput = (bookKey) => {
        const normalized = normalizeBookKey(bookKey);
        const bookNames = {
            etymology: '어원편',
            basic: '베이직',
            advanced: '어드밴스드'
        };
        return bookNames[normalized] || '어원편';
    };
    const getBookPrefixForFile = (bookKey) => {
        const normalized = normalizeBookKey(bookKey);
        const prefixes = {
            etymology: '어원편_',
            basic: '베이직_',
            advanced: '어드_',
        };
        return prefixes[normalized] || '';
    };

    // TOC order and printed page ranges from VOCA_어원편 내지(낱장).pdf.
    const ETYMOLOGY_PAGE_RANGES_BY_TOC_INDEX = Object.freeze({
        CH1: [
            [8, 9], [10, 11], [12, 13], [14, 14], [15, 16], [17, 18], [19, 20], [21, 21],
            [22, 22], [23, 23], [24, 24], [24, 24], [25, 25], [26, 27], [28, 29], [30, 31],
            [32, 32], [32, 32], [33, 33], [34, 35], [36, 37], [37, 37], [38, 39], [40, 40],
            [41, 41], [42, 42], [43, 43], [44, 44], [45, 45], [46, 46], [47, 47], [48, 48],
            [49, 49], [49, 49], [50, 50], [51, 51], [52, 52], [52, 52], [53, 53], [53, 53],
            [54, 54], [54, 54], [55, 55], [55, 55], [56, 56], [57, 57], [57, 59], [60, 61],
        ],
        CH2: [
            [64, 64], [64, 64], [65, 65], [65, 65], [66, 66], [66, 66], [67, 67], [68, 68],
            [68, 68], [69, 69], [69, 69], [70, 70], [70, 70], [71, 71], [71, 71], [72, 72],
            [72, 72], [73, 73], [74, 76], [76, 76], [77, 77], [77, 77], [78, 78], [78, 78],
            [79, 79], [79, 79], [80, 80], [80, 80], [81, 81], [81, 82], [82, 82], [83, 83],
            [84, 84], [85, 85], [85, 85], [86, 86], [87, 87], [88, 88], [89, 89], [90, 90],
            [90, 90], [91, 91], [91, 91],
        ],
        CH3: [
            [94, 95], [95, 95], [96, 96], [96, 96], [97, 97], [97, 97], [98, 98], [98, 98],
            [99, 99], [99, 99], [100, 100], [100, 100], [101, 101], [102, 102], [102, 102],
            [103, 103], [104, 104], [104, 104], [105, 105], [105, 105], [106, 106], [106, 107],
            [107, 107], [108, 108], [108, 108], [109, 109], [109, 109], [110, 110], [110, 110],
            [111, 111], [111, 111], [112, 112], [112, 112], [113, 113], [113, 113], [114, 114],
            [114, 114], [115, 115], [115, 115], [116, 116], [116, 116], [117, 117], [117, 117],
            [118, 118], [118, 119], [120, 120], [121, 121], [122, 122], [122, 122], [123, 123],
            [123, 123], [124, 124], [125, 125], [126, 126], [127, 127], [128, 128], [129, 129],
            [130, 130], [130, 130], [131, 131], [131, 131], [132, 133], [134, 134], [134, 134],
            [135, 135], [136, 136], [136, 136], [137, 137], [138, 138], [139, 139], [140, 141],
            [141, 141], [142, 142], [143, 145], [146, 147], [148, 149], [150, 151], [152, 153],
            [154, 154], [155, 155], [155, 155], [156, 156], [157, 157], [157, 157], [158, 158],
            [158, 159], [159, 159], [160, 160], [160, 160], [161, 161], [161, 161], [162, 162],
            [162, 162], [163, 163], [164, 164], [165, 165], [166, 166], [167, 167], [168, 169],
            [170, 170], [171, 171], [172, 172], [173, 173], [174, 175], [175, 175], [176, 176],
            [177, 177], [178, 178], [178, 178], [179, 179], [179, 179], [180, 180], [181, 181],
            [182, 183], [184, 184], [185, 185], [186, 186], [187, 187], [188, 189], [190, 191],
            [192, 192], [193, 193], [194, 194], [195, 195],
        ],
    });

    const getEtymologyTocsForChapter = (chapterId = '') => {
        const normalizedChapter = normalizeSpacingText(chapterId).toUpperCase();
        if (!normalizedChapter) return [];
        return [...new Set(
            (state.allWords || [])
                .filter((entry) => normalizeSpacingText(entry?.chapter).toUpperCase() === normalizedChapter)
                .map((entry) => normalizeSpacingText(entry?.toc))
                .filter(Boolean),
        )];
    };

    const getEtymologyTocPageRange = (chapterId = '', toc = '') => {
        const normalizedChapter = normalizeSpacingText(chapterId).toUpperCase();
        const normalizedToc = normalizeSpacingText(toc);
        const chapterRanges = ETYMOLOGY_PAGE_RANGES_BY_TOC_INDEX[normalizedChapter];
        if (!normalizedToc || !Array.isArray(chapterRanges)) return null;

        const tocIndex = getEtymologyTocsForChapter(normalizedChapter)
            .findIndex((candidate) => candidate === normalizedToc);
        const range = chapterRanges[tocIndex];
        if (!Array.isArray(range) || range.length !== 2) return null;
        return { start: range[0], end: range[1] };
    };

    const formatEtymologyPageRange = (range) => {
        if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end)) return '';
        return range.start === range.end ? `p.${range.start}` : `p.${range.start}~${range.end}`;
    };

    const getEtymologySelectionPageRange = (scopes = []) => {
        const ranges = scopes
            .map((scope) => getEtymologyTocPageRange(scope?.chapterId || scope?.chapter, scope?.toc))
            .filter(Boolean);
        if (ranges.length === 0) return null;
        return {
            start: Math.min(...ranges.map((range) => range.start)),
            end: Math.max(...ranges.map((range) => range.end)),
        };
    };

    const extractEtymologyTocTitle = (tocLabel = '') => {
        const trimmed = normalizeSpacingText(tocLabel);
        if (!trimmed) return '';
        const beforeParen = trimmed.split(/[([]/)[0].trim();
        const firstSegment = beforeParen.split('/')[0].trim();
        return firstSegment.replace(/[()\[\],;:]+/g, '').trim() || '어원';
    };

    const buildEtymologyExamTitle = (tocLabels = [], pageRange = null) => {
        const normalizedTocLabels = tocLabels
            .map((toc) => normalizeSpacingText(toc))
            .filter(Boolean);
        const titles = normalizedTocLabels
            .map((toc) => extractEtymologyTocTitle(toc))
            .filter(Boolean);
        const formattedPageRange = formatEtymologyPageRange(pageRange);
        const pageSuffix = formattedPageRange ? ` (${formattedPageRange})` : '';

        if (titles.length === 0) return '어원 시험지';
        if (titles.length === 1) return `${titles[0]}${pageSuffix}`;
        const fallbackSuffix = pageSuffix || ` (총 ${normalizedTocLabels.length}개)`;
        return `${titles[0]} ~ ${titles[titles.length - 1]}${fallbackSuffix}`;
    };

    const extractExamTitleFromToc = (tocLabel = '') => {
        const trimmed = normalizeSpacingText(tocLabel);
        if (!trimmed) return '어휘 시험지';
        const dayMatch = trimmed.match(/day\s*0?(\d{1,2})/i);
        if (dayMatch) return `Day ${parseInt(dayMatch[1], 10)}`;
        const firstToken = trimmed.split(/\s+/)[0];
        return firstToken.replace(/[()\[\],;:]+/g, '').trim() || '어휘 시험지';
    };

    const buildExamTitleFromSelectedTocs = (tocLabels = [], options = {}) => {
        const activeBookKey = normalizeBookKey(options.bookKey || state.selectedBook);
        if (activeBookKey === 'etymology') {
            const etymologyScopes = Array.isArray(options.etymologyScopes)
                ? options.etymologyScopes
                : getSelectedEtymologyScopes();
            return buildEtymologyExamTitle(
                tocLabels,
                getEtymologySelectionPageRange(etymologyScopes),
            );
        }

        const dayNumbers = tocLabels
            .map((toc) => {
                const match = normalizeSpacingText(toc).match(/DAY\s*0?(\d{1,2})/i);
                return match ? parseInt(match[1], 10) : NaN;
            })
            .filter((value) => Number.isInteger(value));

        if (dayNumbers.length > 0 && dayNumbers.length === tocLabels.length) {
            const sortedUniqueDays = [...new Set(dayNumbers)].sort((a, b) => a - b);
            const isConsecutive = sortedUniqueDays.every((day, index) => (
                index === 0 || day === sortedUniqueDays[index - 1] + 1
            ));
            const toDayLabel = (day) => `Day ${day}`;
            if (isConsecutive && sortedUniqueDays.length >= 2) {
                return `${toDayLabel(sortedUniqueDays[0])} ~ ${toDayLabel(sortedUniqueDays[sortedUniqueDays.length - 1])}`;
            }
            if (sortedUniqueDays.length === 1) {
                return toDayLabel(sortedUniqueDays[0]);
            }
        }

        const titles = tocLabels
            .map((toc) => extractExamTitleFromToc(toc))
            .filter(Boolean)
            .filter((value, idx, arr) => arr.indexOf(value) === idx);

        if (titles.length === 0) return '어휘 시험지';
        return titles.join(' / ');
    };

    const appendQuestionCountToExamTitle = (title = '', questionCount = 0) => {
        const normalizedTitle = normalizeSpacingText(title);
        const normalizedCount = Number.parseInt(questionCount, 10);
        if (!normalizedTitle || !Number.isInteger(normalizedCount) || normalizedCount < 1) {
            return normalizedTitle;
        }

        const pageSuffixMatch = normalizedTitle.match(/\((p\.\s*\d+(?:\s*~\s*\d+)?)\)$/i);
        if (pageSuffixMatch) {
            const titleWithoutSuffix = normalizedTitle.slice(0, pageSuffixMatch.index).trim();
            const pageLabel = pageSuffixMatch[1].replace(/\s+/g, '');
            return `${titleWithoutSuffix} (${pageLabel}, ${normalizedCount}문항)`;
        }

        return `${normalizedTitle} (${normalizedCount}문항)`;
    };

    const DAY_WORD_KEYS = ['단어', 'word'];
    const DAY_MEANING_KEYS = ['의미', 'meaning', '뜻'];
    const ETY_CHAPTER_KEYS = ['chapter', '챕터', '대분류'];
    const ETY_TOC_KEYS = ['toc', '목차', '소분류'];
    const ETY_WORD_KEYS = ['word', '단어'];
    const ETY_MEANING_KEYS = ['meaning', '의미', '뜻'];

    const getDerivativeWordKeys = (index) => [`파생어${index}`, `파생어 ${index}`, `derivative${index}`];
    const getDerivativeMeaningKeys = (index) => [`파생어${index} 뜻`, `파생어 ${index} 뜻`, `derivative${index} meaning`];

    const normalizeSpacingText = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/\uFEFF/g, '')
            .normalize('NFKC')
            .replace(/[\u0000-\u001F\u007F]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const ETYMOLOGY_TOC_KEY_SEPARATOR = '|||';

    const makeEtymologyTocKey = (chapterId, toc) => {
        const normalizedChapter = normalizeSpacingText(chapterId);
        const normalizedToc = normalizeSpacingText(toc);
        if (!normalizedChapter || !normalizedToc) return '';
        return `${normalizedChapter}${ETYMOLOGY_TOC_KEY_SEPARATOR}${normalizedToc}`;
    };

    const parseEtymologyTocSelection = (selection, options = {}) => {
        const raw = String(selection ?? '');
        const separatorIndex = raw.indexOf(ETYMOLOGY_TOC_KEY_SEPARATOR);
        if (separatorIndex >= 0) {
            return {
                chapterId: normalizeSpacingText(raw.slice(0, separatorIndex)),
                toc: normalizeSpacingText(raw.slice(separatorIndex + ETYMOLOGY_TOC_KEY_SEPARATOR.length)),
            };
        }

        return {
            chapterId: normalizeSpacingText(options.chapterId ?? state.selectedChapter),
            toc: normalizeSpacingText(selection),
        };
    };

    const getTocSelectionKey = (toc, options = {}) => {
        const activeBookKey = normalizeBookKey(options.bookKey || state.selectedBook);
        const normalizedToc = normalizeSpacingText(toc);
        if (activeBookKey !== 'etymology') return normalizedToc;
        return makeEtymologyTocKey(options.chapterId ?? state.selectedChapter, normalizedToc);
    };

    const getSelectedTocLabels = (selectedTocs, options = {}) => {
        const activeBookKey = normalizeBookKey(options.bookKey || state.selectedBook);
        return [...(selectedTocs || [])]
            .map((selection) => {
                if (activeBookKey !== 'etymology') return normalizeSpacingText(selection);
                return parseEtymologyTocSelection(selection, options).toc;
            })
            .filter(Boolean);
    };

    const getSelectedEtymologyScopes = (selectedTocs = state.selectedTocs, options = {}) => {
        const seen = new Set();
        const bookOrder = new Map();
        (state.allWords || []).forEach((entry) => {
            const key = makeEtymologyTocKey(entry?.chapter, entry?.toc);
            if (key && !bookOrder.has(key)) {
                bookOrder.set(key, bookOrder.size);
            }
        });
        return [...(selectedTocs || [])]
            .map((selection) => parseEtymologyTocSelection(selection, options))
            .filter(({ chapterId, toc }) => chapterId && toc)
            .filter(({ chapterId, toc }) => {
                const key = makeEtymologyTocKey(chapterId, toc);
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) => {
                const aKey = makeEtymologyTocKey(a.chapterId, a.toc);
                const bKey = makeEtymologyTocKey(b.chapterId, b.toc);
                const aOrder = bookOrder.get(aKey);
                const bOrder = bookOrder.get(bKey);
                if (Number.isInteger(aOrder) && Number.isInteger(bOrder)) return aOrder - bOrder;
                if (Number.isInteger(aOrder)) return -1;
                if (Number.isInteger(bOrder)) return 1;
                return a.chapterId.localeCompare(b.chapterId, 'ko', { numeric: true })
                    || a.toc.localeCompare(b.toc, 'ko', { numeric: true });
            });
    };

    const getSelectedEtymologyChapterIds = (selectedTocs = state.selectedTocs, options = {}) => {
        return [...new Set(getSelectedEtymologyScopes(selectedTocs, options).map((scope) => scope.chapterId))];
    };

    const getSelectedEtymologyCountForChapter = (chapterId) => {
        const normalizedChapter = normalizeSpacingText(chapterId);
        if (!normalizedChapter) return 0;
        return getSelectedEtymologyScopes()
            .filter((scope) => scope.chapterId === normalizedChapter)
            .length;
    };

    const normalizeFileName = (value) => {
        const text = normalizeSpacingText(value || '어휘시험지')
            .replace(/[\\/:*?"<>|]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        return text || '어휘시험지';
    };

    const safeParseGeneratorHistory = (raw) => {
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter((item) => item && typeof item === 'object').slice(0, GENERATOR_HISTORY_LIMIT);
        } catch (_) {
            return [];
        }
    };

    const requestToPromise = (request) => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB 요청에 실패했습니다.'));
    });

    const openGeneratorArchiveDb = () => {
        if (!window.indexedDB) {
            return Promise.reject(new Error('IndexedDB를 사용할 수 없습니다.'));
        }
        return new Promise((resolve, reject) => {
            const request = window.indexedDB.open(GENERATOR_ARCHIVE_DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(GENERATOR_ARCHIVE_STORE_NAME)) {
                    db.createObjectStore(GENERATOR_ARCHIVE_STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB 열기에 실패했습니다.'));
        });
    };

    const withGeneratorArchiveStore = async (mode, worker) => {
        const db = await openGeneratorArchiveDb();
        try {
            const tx = db.transaction(GENERATOR_ARCHIVE_STORE_NAME, mode);
            const store = tx.objectStore(GENERATOR_ARCHIVE_STORE_NAME);
            const result = await worker(store);
            await new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('IndexedDB 트랜잭션에 실패했습니다.'));
                tx.onabort = () => reject(tx.error || new Error('IndexedDB 트랜잭션이 중단되었습니다.'));
            });
            return result;
        } finally {
            db.close();
        }
    };

    const saveGeneratorArchiveFiles = async (fileEntries) => {
        if (!window.indexedDB || !Array.isArray(fileEntries) || fileEntries.length === 0) {
            return '';
        }
        const archiveId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const payloadFiles = fileEntries.map((entry) => ({
            name: normalizeSpacingText(entry?.name) || '시험지',
            type: normalizeSpacingText(entry?.type) || 'application/octet-stream',
            blob: entry?.blob instanceof Blob ? entry.blob : new Blob([], { type: 'application/octet-stream' }),
        }));
        await withGeneratorArchiveStore('readwrite', (store) => requestToPromise(store.put({
            id: archiveId,
            createdAt: new Date().toISOString(),
            files: payloadFiles,
        })));
        return archiveId;
    };

    const pruneGeneratorArchives = async (historyEntries) => {
        if (!window.indexedDB) return;
        const keepIds = new Set(
            (historyEntries || [])
                .map((entry) => normalizeSpacingText(entry?.archiveId))
                .filter(Boolean),
        );
        try {
            await withGeneratorArchiveStore('readwrite', async (store) => {
                const keys = await requestToPromise(store.getAllKeys());
                const staleKeys = (keys || [])
                    .map((key) => String(key))
                    .filter((key) => !keepIds.has(key));
                await Promise.all(staleKeys.map((key) => requestToPromise(store.delete(key))));
            });
        } catch (error) {
            console.warn('시험지 파일 보관함 정리 실패:', error);
        }
    };

    const pushGeneratorHistoryEntry = async (entry) => {
        try {
            const current = safeParseGeneratorHistory(localStorage.getItem(GENERATOR_HISTORY_KEY));
            const next = [entry, ...current].slice(0, GENERATOR_HISTORY_LIMIT);
            localStorage.setItem(GENERATOR_HISTORY_KEY, JSON.stringify(next));
            await pruneGeneratorArchives(next);
        } catch (error) {
            console.warn('시험지 생성 기록 저장 실패:', error);
        }
    };

    const toCompactSpacing = (value) => String(value || '').replace(/\s+/g, ' ').trim();

    const getExamTitle = () => {
        const typed = normalizeSpacingText(state.ui.examTitle?.value);
        return typed || '어휘 시험지';
    };

    const updatePdfOptionState = () => {
        const pdfOption = document.querySelector('input[name="output-format"][value="PDF"]');
        const wordOption = document.querySelector('input[name="output-format"][value="WORD"]');
        if (!pdfOption || !wordOption) return;

        const pdfAvailable = Boolean(PDFDocument && hasFontkit && state.koreanFont);
        pdfOption.disabled = !pdfAvailable;
        if (!pdfAvailable && pdfOption.checked) {
            wordOption.checked = true;
        }
    };

    // --- Utility Functions ---
    const shuffleArray = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    };

    const pickBalancedEtymologyWords = (sourceWords, count) => {
        if (count >= sourceWords.length) return [...sourceWords];

        const groups = new Map();
        sourceWords.forEach((word, index) => {
            const groupKey = makeEtymologyTocKey(word?.chapter, word?.toc) || `ungrouped-${index}`;
            if (!groups.has(groupKey)) groups.set(groupKey, []);
            groups.get(groupKey).push({ word, index });
        });

        let activeGroups = [...groups.values()].map((group) => shuffleArray([...group]));
        shuffleArray(activeGroups);
        const selected = [];

        while (selected.length < count && activeGroups.length > 0) {
            const nextGroups = [];
            activeGroups.forEach((group) => {
                if (selected.length >= count) return;
                const candidate = group.pop();
                if (candidate) selected.push(candidate);
                if (group.length > 0) nextGroups.push(group);
            });
            activeGroups = shuffleArray(nextGroups);
        }

        return selected
            .sort((a, b) => a.index - b.index)
            .map((entry) => entry.word);
    };

    const isSupportedFontBuffer = (buffer) => {
        if (!buffer || buffer.byteLength < 4) return false;
        const bytes = new Uint8Array(buffer);
        const b0 = bytes[0];
        const b1 = bytes[1];
        const b2 = bytes[2];
        const b3 = bytes[3];
        const isTtf = b0 === 0x00 && b1 === 0x01 && b2 === 0x00 && b3 === 0x00;
        const isOtf = b0 === 0x4f && b1 === 0x54 && b2 === 0x54 && b3 === 0x4f;
        const isTtc = b0 === 0x74 && b1 === 0x74 && b2 === 0x63 && b3 === 0x66;
        return isTtf || isOtf || isTtc;
    };

    const isLikelyHtmlBuffer = (buffer) => {
        if (!buffer || buffer.byteLength === 0) return false;
        const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 64));
        let i = 0;
        while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) {
            i += 1;
        }
        return i < bytes.length && bytes[i] === 0x3c;
    };
    const extractPrimaryMeaning = (text) => {
        const normalized = normalizeSpacingText(text);
        const trimmed = String(normalized || '').trim();
        if (!trimmed) return '';
        const delimiterMatch = trimmed.match(/([^,;/]+)(?=[,;/]|$)/);
        return normalizeSpacingText((delimiterMatch?.[1] || trimmed));
    };
    const normalizePdfWordText = (text) => normalizeSpacingText(text);
    const formatPdfExamTitle = (value) => {
        const normalized = normalizeSpacingText(value || '어휘 시험지') || '어휘 시험지';
        const dayRangeMatch = normalized.match(/^day\s*0?(\d{1,2})\s*~\s*day\s*0?(\d{1,2})$/i)
            || normalized.match(/^day\s*0?(\d{1,2})\s*~\s*0?(\d{1,2})$/i);
        if (dayRangeMatch) {
            return `Day ${parseInt(dayRangeMatch[1], 10)}~${parseInt(dayRangeMatch[2], 10)}`;
        }
        const singleDayMatch = normalized.match(/^day\s*0?(\d{1,2})$/i);
        if (singleDayMatch) {
            return `Day ${parseInt(singleDayMatch[1], 10)}`;
        }
        return normalized;
    };

    const setNumQuestionsHint = (requestValue) => {
        const hint = state.ui.numQuestionsHint;
        if (!hint) return;

        const questionLimit = getQuestionSelectionLimit();
        const selectedTotal = state.selectedWords.length;
        const maxWords = parseInt(state.ui.numQuestions.max, 10);
        const requested = parseInt(requestValue, 10);
        const isReducing = Number.isInteger(maxWords) && Number.isInteger(requested) && maxWords > 0 && requested < selectedTotal;
        const balancedMessage = state.selectedBook === 'etymology' && isReducing
            ? ' 선택한 각 어원에서 골고루 자동 선정됩니다.'
            : '';
        if (selectedTotal > questionLimit) {
            hint.textContent = `선택한 ${selectedTotal}개 중 최대 ${questionLimit}문항까지 생성할 수 있습니다.${balancedMessage}`;
            hint.classList.remove('hidden');
            return;
        }

        if (isReducing) {
            hint.textContent = state.selectedBook === 'etymology'
                ? '선택한 각 어원에서 골고루 자동 선정됩니다.'
                : '문항 수에 맞게 단어가 무작위로 자동 선정됩니다.';
            hint.classList.remove('hidden');
        } else {
            hint.textContent = '';
            hint.classList.add('hidden');
        }
    };

    const createDownloadUrl = (blob) => URL.createObjectURL(blob);
    const downloadBlob = (blob, filename) => {
        if (window.navigator && typeof window.navigator.msSaveOrOpenBlob === 'function') {
            window.navigator.msSaveOrOpenBlob(blob, filename);
            return;
        }

        const url = createDownloadUrl(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        requestAnimationFrame(() => link.click());
        window.setTimeout(() => {
            link.remove();
            URL.revokeObjectURL(url);
        }, 60000);
    };
    const DOWNLOAD_GAP_MS = 800;
    const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const showToast = (message, type = 'info', duration = 2200) => {
        const container = document.getElementById('toast-container');
        if (!container) {
            console.info(message);
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('is-visible'));
        window.setTimeout(() => {
            toast.classList.remove('is-visible');
            window.setTimeout(() => toast.remove(), 190);
        }, Math.max(900, duration));
    };
    const setGeneratorLoading = (isLoading, bookLabel = '') => {
        const overlay = state.ui.generatorLoadingOverlay;
        if (!overlay) return;

        const normalizedBookLabel = normalizeSpacingText(bookLabel);
        if (state.ui.generatorLoadingTitle) {
            state.ui.generatorLoadingTitle.textContent = normalizedBookLabel
                ? `${normalizedBookLabel} 데이터를 불러오는 중입니다`
                : '단어 데이터를 불러오는 중입니다';
        }
        if (state.ui.generatorLoadingDescription) {
            state.ui.generatorLoadingDescription.textContent = '완료되면 자동으로 시험지 설정 화면으로 이동합니다.';
        }
        overlay.hidden = !isLoading;
        document.body.classList.toggle('generator-is-loading', isLoading);
        state.ui.bookLibrary?.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    };
    const showPurchasePolicyNoticeIfNeeded = () => {
        if (isBookPurchaseVerified() || state.purchasePolicyNoticeShown) return;
        state.purchasePolicyNoticeShown = true;
        showToast('책구매 인증 전에는 시험지 하루 1회 다운로드, 최대 50문항, 파생어 제외가 적용됩니다.', 'info', 3400);
    };
    const base64ToBlob = (base64, mimeType) => {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeType });
    };
    const parseCsvRows = (csvText) => new Promise((resolve, reject) => {
        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data || []),
            error: (error) => reject(error),
        });
    });
    const readAccessTokenFromStorage = () => normalizeSpacingText(readAuthSessionSnapshotFromStorage()?.accessToken);
    const fetchBookRowsFromApi = async (bookKey) => {
        const token = readAccessTokenFromStorage();
        if (!token) throw new Error('인증 토큰을 찾을 수 없습니다. 다시 로그인해 주세요.');

        const response = await fetch('/api/vocab/book', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ bookKey }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok || !Array.isArray(payload?.rows)) {
            const message = normalizeSpacingText(payload?.error) || '교재 데이터를 불러오지 못했습니다.';
            throw new Error(message);
        }

        return payload.rows;
    };
    const getCsvField = (row, keys) => {
        if (!row || typeof row !== 'object') return '';
        const keyList = Array.isArray(keys) ? keys : [keys];

        for (const key of keyList) {
            const direct = row[key] ?? row[`﻿${key}`];
            const normalized = normalizeSpacingText(direct);
            if (normalized) return normalized;
        }

        const normalizedKeyMap = new Map();
        Object.entries(row).forEach(([rawKey, rawValue]) => {
            const normalizedKey = normalizeSpacingText(rawKey).toLowerCase();
            if (!normalizedKeyMap.has(normalizedKey)) {
                normalizedKeyMap.set(normalizedKey, rawValue);
            }
        });

        for (const key of keyList) {
            const normalizedKey = normalizeSpacingText(key).toLowerCase();
            if (!normalizedKey) continue;
            const normalized = normalizeSpacingText(normalizedKeyMap.get(normalizedKey));
            if (normalized) return normalized;
        }

        return '';
    };
    const buildWordsByToc = (rows) => {
        const wordsByToc = {};
        (rows || []).forEach((word) => {
            const toc = normalizeSpacingText(word?.toc);
            if (!toc) return;
            if (!wordsByToc[toc]) wordsByToc[toc] = [];
            wordsByToc[toc].push(word);
        });
        return wordsByToc;
    };
    const cacheBookData = (bookKey, rows) => {
        state.bookDataByKey[bookKey] = Array.isArray(rows) ? rows : [];
        state.wordsByTocByKey[bookKey] = buildWordsByToc(state.bookDataByKey[bookKey]);
        state.loadedBooks.add(bookKey);
    };
    const applyBookData = (bookKey) => {
        state.allWords = state.bookDataByKey[bookKey] || [];
        state.wordsByToc = state.wordsByTocByKey[bookKey] || {};
    };
    const buildDayLabel = (index) => `DAY ${String(Math.floor(index / 50) + 1).padStart(2, '0')}`;
    const mapDayRowsToWords = (rows) => (rows || []).map((row, index) => {
        const dayNumber = Math.floor(index / 50) + 1;
        if (dayNumber > 30) return null;

        const baseWord = getCsvField(row, DAY_WORD_KEYS);
        if (!baseWord) return null;
        const baseWordKey = baseWord.toLowerCase();

        const derivatives = [];
        const derivativeKeys = new Set();
        for (let i = 1; i <= 6; i += 1) {
            const derivedWord = getCsvField(row, getDerivativeWordKeys(i));
            if (!derivedWord) continue;
            if (derivedWord.toLowerCase() === baseWordKey) continue;

            const derivativeMeaning = getCsvField(row, getDerivativeMeaningKeys(i));
            const derivativeKey = `${derivedWord.toLowerCase()}|${derivativeMeaning.toLowerCase()}`;
            if (derivativeKeys.has(derivativeKey)) continue;
            derivativeKeys.add(derivativeKey);

            derivatives.push({
                word: derivedWord,
                meaning: derivativeMeaning,
            });
        }

        return {
            chapter: 'DAY',
            toc: buildDayLabel(index),
            word: baseWord,
            meaning: getCsvField(row, DAY_MEANING_KEYS),
            derivatives,
        };
    }).filter(Boolean);
    const mapEtymologyRows = (rows) => (rows || []).map((row) => {
        const word = getCsvField(row, ETY_WORD_KEYS);
        if (!word) return null;

        return {
            chapter: getCsvField(row, ETY_CHAPTER_KEYS),
            toc: getCsvField(row, ETY_TOC_KEYS),
            word,
            meaning: getCsvField(row, ETY_MEANING_KEYS),
            derivatives: [],
        };
    }).filter(Boolean);
    const ensureBookDataLoaded = async (bookKey) => {
        const normalizedBook = normalizeBookKey(bookKey);
        if (!normalizedBook) throw new Error('잘못된 교재 키입니다.');
        if (state.loadedBooks.has(normalizedBook)) return;

        const parsedRows = await fetchBookRowsFromApi(normalizedBook);

        if (normalizedBook === 'etymology') {
            cacheBookData(normalizedBook, mapEtymologyRows(parsedRows));
            return;
        }

        cacheBookData(normalizedBook, mapDayRowsToWords(parsedRows));
    };
    const buildQuestionPool = (entries, options = {}) => {
        const pool = [];
        let hasEmptyWord = false;
        const seenPoolKeys = new Set();
        const activeBookKey = normalizeBookKey(options.bookKey || state.selectedBook);
        const includeDerivatives = Boolean(options.includeDerivatives);

        const pushPoolItem = ({ word, meaning, chapter, toc }) => {
            const normalizedWord = normalizeSpacingText(word);
            if (!normalizedWord) return;
            const normalizedMeaning = normalizeSpacingText(meaning);
            const normalizedChapter = normalizeSpacingText(chapter);
            const normalizedToc = normalizeSpacingText(toc);
            const poolKey = [
                normalizedWord.toLowerCase(),
                normalizedMeaning.toLowerCase(),
                normalizedChapter.toLowerCase(),
                normalizedToc.toLowerCase(),
            ].join('|');

            if (seenPoolKeys.has(poolKey)) return;
            seenPoolKeys.add(poolKey);

            pool.push({
                word: normalizedWord,
                meaning: normalizedMeaning,
                chapter: normalizedChapter,
                toc: normalizedToc,
            });
        };

        (entries || []).forEach((entry) => {
            const baseWord = normalizeSpacingText(entry?.word);
            const baseMeaning = normalizeSpacingText(entry?.meaning);
            if (!baseWord) {
                hasEmptyWord = true;
                return;
            }

            pushPoolItem({
                word: baseWord,
                meaning: baseMeaning,
                chapter: entry?.chapter,
                toc: entry?.toc,
            });

            if (activeBookKey === 'etymology' || !includeDerivatives) return;
            (entry?.derivatives || []).forEach((derivative) => {
                const derivativeWord = normalizeSpacingText(derivative?.word);
                if (!derivativeWord) return;
                pushPoolItem({
                    word: derivativeWord,
                    meaning: normalizeSpacingText(derivative?.meaning),
                    chapter: entry?.chapter,
                    toc: entry?.toc,
                });
            });
        });

        if (hasEmptyWord && !state.emptyWordWarningShown) {
            state.emptyWordWarningShown = true;
            showToast('빈 단어 행은 제외하고 출제합니다.', 'info');
        }

        return pool;
    };
    const getEntriesForToc = (toc, options = {}) => {
        const activeBookKey = normalizeBookKey(options.bookKey || state.selectedBook);
        const parsedSelection = activeBookKey === 'etymology'
            ? parseEtymologyTocSelection(toc, { chapterId: options.chapterId ?? state.selectedChapter })
            : { chapterId: '', toc: normalizeSpacingText(toc) };
        const normalizedToc = parsedSelection.toc;
        if (!normalizedToc) return [];

        const tocEntries = state.wordsByToc[normalizedToc] || [];
        const chapterId = normalizeSpacingText(parsedSelection.chapterId || options.chapterId || state.selectedChapter);

        if (activeBookKey !== 'etymology') {
            return tocEntries;
        }

        if (!chapterId) return [];
        return tocEntries.filter((entry) => normalizeSpacingText(entry?.chapter) === chapterId);
    };
    const getSelectableWordCountForToc = (toc, options = {}) => {
        const activeBookKey = normalizeBookKey(options.bookKey || state.selectedBook);
        const includeDerivatives = Boolean(options.includeDerivatives ?? state.includeDerivatives);
        const entries = getEntriesForToc(toc, {
            bookKey: activeBookKey,
            chapterId: options.chapterId,
        });

        return buildQuestionPool(entries, {
            bookKey: activeBookKey,
            includeDerivatives,
        }).length;
    };
    const getSelectedWordsForTocs = (selectedTocs) => {
        if (!selectedTocs || selectedTocs.size === 0) return [];

        const sourceEntries = [];
        selectedTocs.forEach((selection) => {
            sourceEntries.push(...getEntriesForToc(selection));
        });

        return buildQuestionPool(sourceEntries, {
            bookKey: state.selectedBook,
            includeDerivatives: state.includeDerivatives,
        });
    };
    const syncSelectedTotalBadge = (totalWords = 0) => {
        if (!state.ui.selectedTotalBadge) return;
        state.ui.selectedTotalBadge.textContent = `총 ${Math.max(0, totalWords)}개`;
    };
    const getCheckedTocsFromChecklist = () => {
        const checked = state.ui.tocChecklist?.querySelectorAll('input[type="checkbox"]:checked') || [];
        return new Set(
            [...checked]
                .map((el) => normalizeSpacingText(el.dataset.tocKey || el.dataset.toc))
                .filter(Boolean)
        );
    };
    const getSelectionSnapshotFromChecklist = () => {
        const checkedTocs = getCheckedTocsFromChecklist();
        if (normalizeBookKey(state.selectedBook) !== 'etymology' || !state.selectedChapter) {
            return checkedTocs;
        }

        const activeChapter = normalizeSpacingText(state.selectedChapter);
        const nextSelection = new Set(
            [...state.selectedTocs].filter((selection) => (
                parseEtymologyTocSelection(selection).chapterId !== activeChapter
            )),
        );
        checkedTocs.forEach((selection) => nextSelection.add(selection));
        return nextSelection;
    };
    const loadScript = (src) => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`스크립트 로드 실패: ${src}`));
        document.head.appendChild(script);
    });
    const ensureDocxLibrary = async () => {
        if (window.docx?.Packer && window.docx?.Document && window.docx?.Paragraph) return;
        const sources = [
            '/assets/docx/docx.umd.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/docx/8.5.0/docx.umd.min.js',
            'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.js',
            'https://unpkg.com/docx@8.5.0/build/index.js',
            'https://cdn.jsdelivr.net/npm/docx@8.5.0/dist/docx.umd.cjs'
        ];
        for (const src of sources) {
            try {
                await loadScript(src);
            if (window.docx?.Packer && window.docx?.Document && window.docx?.Paragraph) return;
            } catch (_) {
                // Try next source.
            }
        }
        throw new Error(`WORD 라이브러리를 불러오지 못했습니다. 아래 경로에 DOCX 라이브러리를 배치/접근 가능하게 해 주세요: ${sources.join(', ')}`);
    };

    // --- Main Functions ---

    const loadData = async () => {
        try {
            await ensureBookDataLoaded('etymology');
            applyBookData('etymology');
            if (PDFDocument) {
                try {
                    const loadPdfFontBuffer = async (path) => {
                        const response = await fetch(path);
                        if (!response.ok) throw new Error('폰트 파일 없음');
                        const contentType = (response.headers.get('content-type') || '').toLowerCase();
                        const bytes = await response.arrayBuffer();
                        if (contentType.includes('text/html') || isLikelyHtmlBuffer(bytes)) {
                            throw new Error('폰트 파일 경로가 잘못되었거나 배포에 포함되지 않았습니다.');
                        }
                        if (!isSupportedFontBuffer(bytes)) {
                            throw new Error('지원되지 않는 폰트 포맷');
                        }
                        return bytes;
                    };

                    const [regularFontResult, boldFontResult] = await Promise.allSettled([
                        loadPdfFontBuffer(`/assets/fonts/NanumGothic-Regular.ttf?v=${PDF_ASSET_VERSION}`),
                        loadPdfFontBuffer(`/assets/fonts/NanumGothic-Bold.ttf?v=${PDF_ASSET_VERSION}`),
                    ]);

                    if (regularFontResult.status !== 'fulfilled') {
                        throw regularFontResult.reason;
                    }

                    state.koreanFont = regularFontResult.value;
                    state.koreanBoldFont = boldFontResult.status === 'fulfilled' ? boldFontResult.value : null;
                } catch (fontError) {
                    state.koreanFont = null;
                    state.koreanBoldFont = null;
                    console.warn('한글 폰트 로드 실패:', fontError.message || fontError);
                }
            }
            state.isDataReady = true;
            updatePdfOptionState();
        } catch (error) {
            console.error(error);
            state.isDataReady = true;
            if (!state.isBookSelectionLoading) {
                showToast('데이터 로드 중 오류가 발생했습니다.', 'error');
            }
        }
    };

    const selectBook = async (bookName) => {
        const normalizedBook = normalizeBookKey(bookName);
        if (!['etymology', 'basic', 'advanced'].includes(normalizedBook)) {
            return showToast('지원되지 않는 교재입니다.', 'error');
        }
        if (state.isBookSelectionLoading) return;

        const shouldShowLoading = !state.isDataReady || !state.loadedBooks.has(normalizedBook);
        state.isBookSelectionLoading = true;
        if (shouldShowLoading) {
            setGeneratorLoading(true, getBookNameForOutput(normalizedBook));
        }

        try {
            if (!state.isDataReady && initialDataLoadTask) {
                await initialDataLoadTask;
            }
            await ensureBookDataLoaded(normalizedBook);
            if ((state.bookDataByKey[normalizedBook] || []).length === 0) {
                showToast('단어 데이터가 없습니다. 데이터를 다시 로드해 주세요.', 'error');
                return;
            }

            applyBookData(normalizedBook);
            state.selectedBook = normalizedBook;
            state.selectedChapter = null;
            state.selectedTocs.clear();
            state.includeDerivatives = false;
            state.emptyWordWarningShown = false;
            state.isExamTitleCustomized = false;
            state.isQuestionCountCustomized = false;
            state.requestedQuestionCount = null;
            if (state.ui.includeDerivatives) {
                state.ui.includeDerivatives.checked = false;
            }
            syncDerivativeAccessUi();
            state.ui.tocSelectionCard?.classList.toggle('day-mode', normalizedBook !== 'etymology');

            const mixedTypeOption = state.ui.testTypeOptions
                ?.querySelector('.test-type-option[data-type="MIXED"]');
            if (mixedTypeOption) {
                mixedTypeOption.classList.remove('hidden');
            }
            if (state.ui.testTypeOptions) {
                state.ui.testTypeOptions.dataset.twoOptions = 'false';
            }

            state.ui.bookLibrary.querySelectorAll('.book-item').forEach(item => {
                item.classList.toggle('active', normalizeBookKey(item.dataset.book) === normalizedBook);
            });

            setSectionOpen('toc', false);
            if (isMobileViewport()) {
                setSectionOpen('settings', false);
            }
            state.ui.subChapterSelectionCard?.classList.remove('compact');
            const subChapterTitle = state.ui.subChapterSelectionCard?.querySelector('h2');
            if (subChapterTitle) {
                subChapterTitle.textContent = '챕터 선택';
            }
            const subChapterSubtitle = state.ui.subChapterSelectionCard?.querySelector('.subtitle');
            if (subChapterSubtitle) {
                const bookLabel = getBookNameForOutput(normalizedBook);
                subChapterSubtitle.textContent = `${bookLabel}에서 공부할 챕터를 선택하세요.`;
            }

            if (normalizedBook === 'etymology') {
                setSectionOpen('toc', true);
                state.ui.subChapterSelectionCard.classList.remove('hidden');
                state.ui.tocSelectionCard.classList.add('hidden');
                if (state.ui.tocSummary) {
                    state.ui.tocSummary.textContent = '';
                }
                syncSelectedTotalBadge(0);
            } else {
                setSectionOpen('toc', true);
                state.ui.subChapterSelectionCard.classList.add('hidden');
                state.ui.tocSelectionCard.classList.remove('hidden');
                renderTocChecklist();
            }
            updateUiState();
        } catch (error) {
            console.error(error);
            showToast('교재 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
        } finally {
            state.isBookSelectionLoading = false;
            if (shouldShowLoading) {
                setGeneratorLoading(false);
            }
        }
    };

    const getSubChapterDisplayName = (chapterId) => {
        if (!state.ui.subChapterSelectionCard) return chapterId || '';
        const selected = state.ui.subChapterSelectionCard
            .querySelector(`.sub-chapter-item[data-chapter="${chapterId}"]`);
        if (!selected) return chapterId || '';

        const label = String(selected.textContent || '').trim();
        const match = label.match(/^Chapter\s+\d+\.\s*(.+)$/i);
        return (match?.[1] || label).trim();
    };

    const syncSubChapterSelectionState = () => {
        state.ui.subChapterSelectionCard?.querySelectorAll('.sub-chapter-item').forEach((item) => {
            const chapterId = normalizeSpacingText(item.dataset.chapter);
            const isActiveChapter = chapterId && chapterId === normalizeSpacingText(state.selectedChapter);
            const hasSelections = getSelectedEtymologyCountForChapter(chapterId) > 0;
            item.classList.toggle('selected-item', isActiveChapter);
            item.classList.toggle('has-selected-tocs', !isActiveChapter && hasSelections);
        });
    };

    const selectSubChapter = (chapterId) => {
        state.selectedChapter = chapterId;
        syncSubChapterSelectionState();
        const subChapterTitle = state.ui.subChapterSelectionCard?.querySelector('h2');
        if (subChapterTitle) {
            const chapterName = getSubChapterDisplayName(chapterId);
            subChapterTitle.textContent = chapterName ? `챕터 선택: ${chapterName}` : '챕터 선택';
        }
        const subChapterSubtitle = state.ui.subChapterSelectionCard?.querySelector('.subtitle');
        if (subChapterSubtitle) {
            const bookLabel = getBookNameForOutput(state.selectedBook);
            subChapterSubtitle.textContent = `${bookLabel}에서 공부할 챕터를 선택하세요.`;
        }
        renderTocChecklist(chapterId);
        state.isExamTitleCustomized = false;
        state.ui.subChapterSelectionCard.classList.add('compact');
        setSectionOpen('toc', true);
        state.ui.subChapterSelectionCard.classList.remove('hidden');
        state.ui.tocSelectionCard.classList.remove('hidden');
        updateUiState();
    };

    const renderTocChecklist = (chapterId) => {
        if (state.selectedBook && state.selectedBook !== 'etymology') {
            const dayLabels = Array.from({ length: 30 }, (_, idx) => `DAY ${String(idx + 1).padStart(2, '0')}`);
            state.ui.tocChecklist.innerHTML = dayLabels.map((dayLabel) => {
                const wordCount = getSelectableWordCountForToc(dayLabel, {
                    bookKey: state.selectedBook,
                    includeDerivatives: state.includeDerivatives,
                });
                const isChecked = state.selectedTocs.has(dayLabel) ? 'checked' : '';
                return `
                    <label class="toc-checklist-item ${isChecked ? 'selected-item' : ''}">
                        <input type="checkbox" data-toc="${dayLabel}" ${isChecked}>
                        <span class="label">${dayLabel}</span>
                        <span class="badge">${wordCount}</span>
                    </label>
                `;
            }).join('');
            return;
        }

        const wordsInChapter = state.allWords.filter(word => word.chapter === chapterId);
        if (wordsInChapter.length === 0) {
            state.ui.tocChecklist.innerHTML = '<p>이 챕터에는 데이터가 없습니다.</p>';
            return;
        }
        
        const tocsInChapter = [...new Set(wordsInChapter.map(word => word.toc).filter(Boolean))];
        state.ui.tocChecklist.innerHTML = tocsInChapter.map(toc => {
            if (!toc) return '';
            const wordCount = getSelectableWordCountForToc(toc, {
                bookKey: 'etymology',
                chapterId,
                includeDerivatives: false,
            });
            const selectionKey = getTocSelectionKey(toc, {
                bookKey: 'etymology',
                chapterId,
            });
            const isChecked = state.selectedTocs.has(selectionKey) ? 'checked' : '';
            const pageText = formatEtymologyPageRange(getEtymologyTocPageRange(chapterId, toc));
            return `
                <label class="toc-checklist-item ${isChecked ? 'selected-item' : ''}">
                    <input type="checkbox" data-toc="${toc}" data-chapter="${chapterId}" data-toc-key="${selectionKey}" ${isChecked}>
                    <span class="label">${toc}</span>
                    ${pageText ? `<span class="page">${pageText}</span>` : ''}
                    <span class="badge">${wordCount}</span>
                </label>
            `;
        }).join('');
    };

    const syncAutoExamTitle = () => {
        if (state.isExamTitleCustomized || !state.ui.examTitle) return;
        if (state.selectedTocs.size === 0) {
            state.ui.examTitle.value = '어휘 시험지';
            return;
        }

        const selectedEtymologyScopes = state.selectedBook === 'etymology'
            ? getSelectedEtymologyScopes()
            : [];
        const titleTocLabels = selectedEtymologyScopes.length > 0
            ? selectedEtymologyScopes.map((scope) => scope.toc)
            : getSelectedTocLabels(state.selectedTocs);
        const baseTitle = buildExamTitleFromSelectedTocs(titleTocLabels, {
            bookKey: state.selectedBook,
            chapterId: state.selectedChapter,
            chapterIds: selectedEtymologyScopes.length > 0
                ? [...new Set(selectedEtymologyScopes.map((scope) => scope.chapterId))]
                : getSelectedEtymologyChapterIds(),
            etymologyScopes: selectedEtymologyScopes,
        });
        state.ui.examTitle.value = appendQuestionCountToExamTitle(
            baseTitle,
            state.ui.numQuestions?.value,
        );
    };
    
    const updateUiState = () => {
        syncGeneratorBookStageLayout();
        state.selectedTocs = getSelectionSnapshotFromChecklist();
        syncSubChapterSelectionState();
        state.ui.tocChecklist.querySelectorAll('.toc-checklist-item').forEach(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            item.classList.toggle('selected-item', !!checkbox?.checked);
        });
        
        const totalWords = state.selectedWords.length;
        syncSelectedTotalBadge(totalWords);
        if (state.selectedBook && state.selectedBook !== 'etymology') {
            const selectedBaseEntries = [];
            state.selectedTocs.forEach((toc) => {
                if (!state.wordsByToc[toc]) return;
                selectedBaseEntries.push(...state.wordsByToc[toc]);
            });

            let baseCount = 0;
            let derivativeCount = 0;
            selectedBaseEntries.forEach((entry) => {
                const baseWord = normalizeSpacingText(entry?.word);
                if (!baseWord) return;
                baseCount += 1;
                (entry?.derivatives || []).forEach((derivative) => {
                    const derivativeWord = normalizeSpacingText(derivative?.word);
                    if (!derivativeWord) return;
                    derivativeCount += 1;
                });
            });

            if (state.includeDerivatives) {
                state.ui.tocSummary.textContent = `선택된 목차: ${state.selectedTocs.size}개 / 원형: ${baseCount}개 + 파생어: ${derivativeCount}개 / 총 단어: ${totalWords}개`;
            } else {
                state.ui.tocSummary.textContent = `선택된 목차: ${state.selectedTocs.size}개 / 총 단어: ${baseCount}개`;
            }
        } else {
            const selectedChapterCount = getSelectedEtymologyChapterIds().length;
            const chapterPart = selectedChapterCount > 1 ? ` / 챕터: ${selectedChapterCount}개` : '';
            state.ui.tocSummary.textContent = `선택된 목차: ${state.selectedTocs.size}개${chapterPart} / 총 단어: ${totalWords}개`;
        }
        const questionLimit = getQuestionSelectionLimit();
        const maxQuestions = Math.min(totalWords, questionLimit);
        const requestedQuestions = Number.parseInt(state.requestedQuestionCount, 10);
        const nextQuestionCount = state.isQuestionCountCustomized
            && Number.isInteger(requestedQuestions)
            && requestedQuestions > 0
            ? Math.min(requestedQuestions, maxQuestions)
            : maxQuestions;
        state.ui.numQuestions.value = String(nextQuestionCount);
        state.ui.numQuestions.max = String(maxQuestions);
        setNumQuestionsHint(state.ui.numQuestions.value);

        syncAutoExamTitle();

        const hasSelection = totalWords > 0;
        const shouldShowSettings = hasSelection;
        setSectionOpen('settings', shouldShowSettings);
        state.ui.generateBtn.disabled = !hasSelection || hasReachedDailyDownloadLimit();
        if (state.ui.deselectAllToc) {
            state.ui.deselectAllToc.disabled = state.selectedTocs.size === 0;
        }
    };
    
    const modifyAllTocs = (shouldSelect) => {
        if (state.selectedBook === 'etymology' && !state.selectedChapter) return;

        const checkboxes = [...state.ui.tocChecklist.querySelectorAll('input[type="checkbox"]')];
        if (!shouldSelect) {
            state.selectedTocs.clear();
            checkboxes.forEach((checkbox) => {
                checkbox.checked = false;
            });
            updateUiState();
            return;
        }

        checkboxes.forEach((checkbox) => {
            checkbox.checked = true;
        });
        updateUiState();
    };

    const generateTest = async () => {
        if (state.selectedWords.length === 0) return showToast('먼저 목차를 선택해 주세요.', 'error');
        await syncPurchaseAccess();
        syncDerivativeAccessUi();
        showPurchasePolicyNoticeIfNeeded();
        if (!isBookPurchaseVerified() && state.includeDerivatives) {
            state.includeDerivatives = false;
            if (state.ui.includeDerivatives) {
                state.ui.includeDerivatives.checked = false;
            }
            updateUiState();
            return showToast('책구매 인증 전에는 파생어 시험지를 만들 수 없습니다.', 'error');
        }
        if (hasReachedDailyDownloadLimit()) {
            return showToast('책구매 인증 전에는 시험지 다운로드를 하루 1회만 할 수 있습니다.', 'error');
        }

        const questionLimit = getQuestionSelectionLimit();
        const requested = parseInt(state.ui.numQuestions.value, 10) || 0;
        const numQuestions = Math.min(
            requested,
            state.selectedWords.length,
            questionLimit
        );
        if (numQuestions <= 0) return showToast('문항 수는 1 이상이어야 합니다.', 'error');
        let examTitle = getExamTitle();
        if (state.selectedBook && state.selectedBook !== 'etymology') {
            const dayOnlyPattern = /^day(?:\s*\/\s*day)*$/i;
            if (dayOnlyPattern.test(examTitle) && state.selectedTocs.size > 0) {
                examTitle = buildExamTitleFromSelectedTocs([...state.selectedTocs], {
                    bookKey: state.selectedBook,
                    chapterId: state.selectedChapter,
                });
                if (!state.isExamTitleCustomized && state.ui.examTitle) {
                    state.ui.examTitle.value = examTitle;
                }
            }
        }
        const activeTestType = state.ui.testTypeOptions.querySelector('.active')?.dataset.type || 'KOR';

        const settings = {
            outputFormat: document.querySelector('input[name="output-format"]:checked').value,
            testType: activeTestType,
            numQuestions: numQuestions,
            shouldShuffle: state.ui.shuffleQuestions.checked,
            examTitle,
            fileBaseName: normalizeFileName(examTitle),
            bookName: getBookNameForOutput(state.selectedBook),
        };

        if (settings.outputFormat === 'PDF' && (!PDFDocument || !hasFontkit || !state.koreanFont)) {
            return showToast('PDF 생성을 위한 라이브러리를 불러오지 못했습니다. WORD(DOCX) 형식으로 생성해 주세요.', 'error');
        }

        let sourceWords = [...state.selectedWords];
        let testItems = sourceWords;

        if (settings.numQuestions < sourceWords.length) {
            if (normalizeBookKey(state.selectedBook) === 'etymology') {
                testItems = pickBalancedEtymologyWords(sourceWords, settings.numQuestions);
            } else {
                const candidateIndexes = [...Array(sourceWords.length).keys()];
                shuffleArray(candidateIndexes);
                const pickedIndexes = candidateIndexes.slice(0, settings.numQuestions).sort((a, b) => a - b);
                testItems = pickedIndexes.map((idx) => sourceWords[idx]);
            }
        } else {
            testItems = sourceWords;
        }

        if (settings.shouldShuffle) {
            testItems = [...testItems];
            shuffleArray(testItems);
        }

        const questions = testItems.map((word, i) => {
            let type = settings.testType;
            if (type === 'MIXED') {
                type = i % 2 === 0 ? 'MIXED_LEFT' : 'MIXED_RIGHT';
            }
            const isEnglishQuestion = type === 'KOR' || type === 'MIXED_LEFT';
            const questionMode = isEnglishQuestion ? 'ENG' : 'KOR';
            return {
                question: isEnglishQuestion ? word.word : word.meaning,
                answer: isEnglishQuestion ? word.meaning : word.word,
                questionMode,
            };
        });

        const baseFileName = normalizeFileName(`${getBookPrefixForFile(state.selectedBook)}${settings.fileBaseName || settings.examTitle}`);
        showToast(settings.outputFormat === 'WORD' ? 'WORD 형식으로 시험지를 생성합니다.' : 'PDF 형식으로 시험지를 생성합니다.');
        try {
            const generatedFiles = [];
            if (settings.outputFormat === 'PDF') {
                const questionPdfBytes = await createPdf(questions, settings, false);
                const questionBlob = new Blob([questionPdfBytes], { type: 'application/pdf' });
                generatedFiles.push({ name: `${baseFileName}.pdf`, type: 'application/pdf', blob: questionBlob });
                const answerPdfBytes = await createPdf(questions, settings, true);
                const answerBlob = new Blob([answerPdfBytes], { type: 'application/pdf' });
                generatedFiles.push({ name: `${baseFileName}_답.pdf`, type: 'application/pdf', blob: answerBlob });
            } else {
                const questionDocx = await createDocx(questions, settings, false);
                generatedFiles.push({
                    name: `${baseFileName}.docx`,
                    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    blob: questionDocx.blob,
                });
                const answerDocx = await createDocx(questions, settings, true);
                generatedFiles.push({
                    name: `${baseFileName}_답.docx`,
                    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    blob: answerDocx.blob,
                });
            }

            if (!(await consumeDailyDownloadQuota())) {
                throw new Error('책구매 인증 전에는 시험지 다운로드를 하루 1회만 할 수 있습니다.');
            }
            for (let i = 0; i < generatedFiles.length; i += 1) {
                const file = generatedFiles[i];
                downloadBlob(file.blob, file.name);
                if (i < generatedFiles.length - 1) {
                    await sleep(DOWNLOAD_GAP_MS);
                }
            }

            let archiveId = '';
            try {
                archiveId = await saveGeneratorArchiveFiles(generatedFiles);
            } catch (archiveError) {
                console.warn('시험지 파일 보관 실패:', archiveError);
            }

            const selectedEtymologyScopes = state.selectedBook === 'etymology'
                ? getSelectedEtymologyScopes()
                : [];
            const historyEntry = {
                generatedAt: new Date().toISOString(),
                config: {
                    examTitle: settings.examTitle,
                    bookKey: state.selectedBook,
                    bookName: settings.bookName,
                    outputFormat: settings.outputFormat,
                    testType: settings.testType,
                    numQuestions: settings.numQuestions,
                    shouldShuffle: settings.shouldShuffle,
                    selectedChapter: state.selectedChapter || '',
                    selectedTocs: selectedEtymologyScopes.length > 0
                        ? selectedEtymologyScopes.map((scope) => scope.toc)
                        : getSelectedTocLabels(state.selectedTocs)
                            .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })),
                    selectedTocScopes: selectedEtymologyScopes.length > 0
                        ? selectedEtymologyScopes.map((scope) => ({
                            chapter: scope.chapterId,
                            toc: scope.toc,
                        }))
                        : [],
                    includeDerivatives: Boolean(state.includeDerivatives),
                },
                files: generatedFiles.map((file) => file.name),
            };
            if (archiveId) {
                historyEntry.archiveId = archiveId;
            }
            await pushGeneratorHistoryEntry(historyEntry);
            updateUiState();
        } catch(e) {
            const message = normalizeSpacingText(e?.message) || '시험지 생성 중 오류가 발생했습니다.';
            showToast(message, 'error');
            console.error(e);
        }
    };

    const applyGeneratorRestoreRequest = async () => {
        const restore = getGeneratorRestoreRequest();
        if (!restore) return;

        const config = restore?.config || {};
        const bookKey = normalizeBookKey(config.bookKey);
        if (!bookKey) {
            showToast('재생성 요청 정보가 올바르지 않습니다.', 'error');
            clearGeneratorRestoreRequest();
            return;
        }

        try {
            await selectBook(bookKey);
        } catch (error) {
            console.error(error);
            showToast('교재 정보를 복원하지 못했습니다.', 'error');
            return;
        }
        if (state.selectedBook !== bookKey) {
            showToast('교재 선택을 자동 복원하지 못했습니다. 교재를 다시 선택해 주세요.', 'error');
            return;
        }

        if (bookKey === 'etymology') {
            const scopedSelections = getRestoreEtymologySelections(config);
            const initialChapterId = normalizeSpacingText(config.selectedChapter) || scopedSelections[0]?.chapterId || '';
            if (initialChapterId) {
                selectSubChapter(initialChapterId);
            }
            if (scopedSelections.length > 0) {
                state.selectedTocs = new Set(
                    scopedSelections
                        .map((scope) => makeEtymologyTocKey(scope.chapterId, scope.toc))
                        .filter(Boolean),
                );
                if (state.selectedChapter) {
                    renderTocChecklist(state.selectedChapter);
                }
                updateUiState();
            }
        } else {
            const selectedTocs = Array.isArray(config.selectedTocs)
                ? config.selectedTocs.map((toc) => normalizeRestoreToc(toc, bookKey)).filter(Boolean)
                : [];
            if (selectedTocs.length > 0) {
                const tocSet = new Set(selectedTocs);
                state.ui.tocChecklist
                    .querySelectorAll('input[type="checkbox"][data-toc]')
                    .forEach((checkbox) => {
                        checkbox.checked = tocSet.has(normalizeSpacingText(checkbox.dataset.toc));
                    });
                updateUiState();
            }
        }

        if (state.ui.includeDerivatives && bookKey !== 'etymology' && isBookPurchaseVerified()) {
            const shouldIncludeDerivatives = Boolean(config.includeDerivatives);
            state.ui.includeDerivatives.checked = shouldIncludeDerivatives;
            state.ui.includeDerivatives.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (state.ui.includeDerivatives) {
            state.ui.includeDerivatives.checked = false;
            state.includeDerivatives = false;
        }

        const examTitle = normalizeSpacingText(config.examTitle);
        if (state.ui.examTitle && examTitle) {
            state.ui.examTitle.value = examTitle;
            state.isExamTitleCustomized = true;
        }

        const testType = normalizeSpacingText(config.testType).toUpperCase();
        const testTypeOption = state.ui.testTypeOptions
            ?.querySelector(`.test-type-option[data-type="${testType}"]`);
        if (testTypeOption && !testTypeOption.classList.contains('hidden')) {
            state.ui.testTypeOptions.querySelectorAll('.test-type-option').forEach((opt) => opt.classList.remove('active'));
            testTypeOption.classList.add('active');
        }

        const outputFormat = normalizeSpacingText(config.outputFormat).toUpperCase();
        const outputOption = document.querySelector(`input[name="output-format"][value="${outputFormat}"]`);
        if (outputOption && !outputOption.disabled) {
            outputOption.checked = true;
        }

        if (state.ui.shuffleQuestions) {
            state.ui.shuffleQuestions.checked = Boolean(config.shouldShuffle);
        }

        const requestedNumQuestions = Number.parseInt(config.numQuestions, 10);
        const maxQuestions = Number.parseInt(state.ui.numQuestions.max, 10) || state.selectedWords.length || 0;
        if (Number.isInteger(requestedNumQuestions) && requestedNumQuestions > 0 && maxQuestions > 0) {
            state.isQuestionCountCustomized = true;
            state.requestedQuestionCount = requestedNumQuestions;
            state.ui.numQuestions.value = String(Math.max(1, Math.min(requestedNumQuestions, maxQuestions)));
            setNumQuestionsHint(state.ui.numQuestions.value);
        }

        if (state.selectedWords.length === 0) {
            showToast('선택한 범위 데이터가 없어 자동 재생성을 진행하지 못했습니다.', 'error');
            return;
        }

        clearGeneratorRestoreRequest();
        showToast('마이페이지 기록 설정을 복원했습니다. 시험지를 다시 생성합니다.');
        await generateTest();
    };
    
    const createPdf = async (questions, options = {}, isAnswerSheet = false) => {
        if (!PDFDocument || !state.koreanFont || !hasFontkit) {
            throw new Error('PDF 생성 환경을 준비할 수 없습니다.');
        }

        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(window.fontkit);

        let font;
        try {
            // CJK fonts with pdf-lib/fontkit can render unreliably when subsetted.
            font = await pdfDoc.embedFont(state.koreanFont, { subset: false });
        } catch (fontError) {
            throw new Error('한글 폰트 포맷이 올바르지 않아 PDF 생성이 불가능합니다.');
        }
        let boldFont = font;
        if (state.koreanBoldFont) {
            try {
                boldFont = await pdfDoc.embedFont(state.koreanBoldFont, { subset: false });
            } catch (fontError) {
                boldFont = font;
                console.warn('PDF 볼드 한글 폰트 임베딩 실패:', fontError.message || fontError);
            }
        }
        const resolvePdfFont = (_text, options = {}) => {
            return options.bold ? boldFont : font;
        };

        const pages = [];
        let page = pdfDoc.addPage();
        pages.push(page);

        const { width, height } = page.getSize();
        const margin = 40;
        const contentWidth = width - margin * 2;
        const titleAreaRatio = 0.6;
        const titleAreaWidth = contentWidth * titleAreaRatio;
        const metaAreaWidth = contentWidth - titleAreaWidth - 10;
        const metaAreaStartX = margin + titleAreaWidth + 10;
        const questionHeaderSize = 20;
        const answerHeaderSize = 14;
        const sectionMetaSize = 8;
        const bodyFontSize = 10.5;
        const rowsPerColumn = 25;
        const itemsPerPage = rowsPerColumn * 2;
        const columnGap = 20;
        const columnWidth = (contentWidth - columnGap) / 2;
        const leftColumnX = margin;
        const rightColumnX = margin + columnWidth + columnGap;
        const numberColumnWidth = 22;
        const numberToTextGap = 0;
        const sectionTopY = height - margin;
        const sectionTitleY = sectionTopY - 30;
        const dividerY = sectionTopY - 66;
        const listBottomY = margin + 28;
        const listTopY = dividerY - 16;
        const lineHeight = (listTopY - listBottomY) / (rowsPerColumn - 1);
        const rowBottomLimit = listBottomY;
        const rowTextOffset = Math.min(6, lineHeight * 0.17);
        const answerLineHeightScale = 0.88;
        const pageNumberY = 16;
        const bookMetaY = sectionTopY - 55;
        const metaBlockTopY = sectionTopY - 32;
        const metaFieldGap = 15;
        const metaFieldShift = 30;
        const metaLabelLineGap = 6;
        const scoreLabelDown = 16;
        const nameLabelY = metaBlockTopY;
        const scoreLabelLift = 2;
        const scoreLabelY = nameLabelY - metaFieldGap - scoreLabelDown + scoreLabelLift;
        const nameLineY = nameLabelY - metaLabelLineGap;
        const nameLineStartX = metaAreaStartX + 34 + metaFieldShift;
        const metaLabelStartX = nameLineStartX + 2;
        const totalNameLineEndX = width - margin - 4;
        const scoreTextGap = 2;
        const scoreTotalText = ` / ${(options?.numQuestions || questions.length)}`;
        const scoreValueFontSize = sectionMetaSize + 2;
        const scoreValueText = scoreTotalText;
        const scoreTextWidth = font.widthOfTextAtSize(scoreValueText, scoreValueFontSize);
        const alignedScoreTextX = totalNameLineEndX - scoreTextWidth;
        const scoreValueStartX = alignedScoreTextX;
        const nameLineEndCandidate = scoreValueStartX - scoreTextGap;
        const nameLineEndX = Math.min(totalNameLineEndX, Math.max(nameLineStartX, nameLineEndCandidate));
        const frameColor = rgb(0, 0, 0);
        const lineColor = rgb(0.62, 0.62, 0.62);
        const mutedColor = rgb(0, 0, 0);
        const pageBottom = margin + 4;
        const pageTopFrame = height - margin + 2;
        const pageBottomFrame = pageBottom;
        const columnSeparatorX = margin + columnWidth + columnGap / 2;

        const examTitle = toCompactSpacing(options.examTitle || '어휘 시험지') || '어휘 시험지';
        const sectionTitle = examTitle;
        const listValues = questions.map((item) => {
            const rawText = isAnswerSheet ? item.answer : item.question;
            const normalizedText = normalizePdfWordText(rawText);
            if (!isAnswerSheet && item.questionMode === 'KOR') {
                return extractPrimaryMeaning(normalizedText);
            }
            return normalizedText;
        });
        const numberTextDotSpacing = ' ';

        const truncateToFit = (text, maxWidth, fontSize, targetFont = font) => {
            const suffix = '…';
            let value = String(text);
            if (targetFont.widthOfTextAtSize(value, fontSize) <= maxWidth) return value;

            while (value.length > 0) {
                value = value.slice(0, -1);
                if (value.length === 0) return suffix;
                if (targetFont.widthOfTextAtSize(value + suffix, fontSize) <= maxWidth) return `${value}${suffix}`;
            }
            return suffix;
        };

        const drawRegularText = (targetPage, text, options = {}, drawOptions = {}) => {
            const resolvedFont = options.font || resolvePdfFont(text, drawOptions);
            try {
                targetPage.drawText(text, {
                    ...options,
                    font: resolvedFont,
                });
            } catch (_) {
                targetPage.drawText(text, {
                    ...options,
                    font: resolvePdfFont(text, drawOptions),
                });
            }
        };

        const drawStrongText = (targetPage, text, options = {}) => {
            drawRegularText(targetPage, text, options, { bold: true });
        };

        const decoratePage = (currentPage) => {
            currentPage.drawRectangle({
                x: margin - 6,
                y: pageBottomFrame,
                width: contentWidth + 12,
                height: pageTopFrame - pageBottomFrame,
                color: rgb(1, 1, 1),
                borderColor: lineColor,
                borderWidth: 0.6,
            });

            currentPage.drawLine({
                start: { x: columnSeparatorX, y: dividerY - 8 },
                end: { x: columnSeparatorX, y: listBottomY + 4 },
                thickness: 0.7,
                color: lineColor,
            });

            currentPage.drawLine({
                start: { x: margin - 6, y: pageBottomFrame },
                end: { x: width - margin + 6, y: pageBottomFrame },
                thickness: 0.7,
                color: lineColor,
            });
            currentPage.drawLine({
                start: { x: margin - 6, y: pageTopFrame },
                end: { x: width - margin + 6, y: pageTopFrame },
                thickness: 0.7,
                color: lineColor,
            });
        };

        const drawSectionHeader = (currentPage, isAnswerSheet) => {
            decoratePage(currentPage, isAnswerSheet);

            const headerSize = isAnswerSheet ? answerHeaderSize : questionHeaderSize;
            const fullTitle = sectionTitle;
            const titleFont = resolvePdfFont(fullTitle, { bold: true });
            const renderedTitle = truncateToFit(
                fullTitle,
                titleAreaWidth,
                headerSize,
                titleFont
            );

            currentPage.drawLine({
                start: { x: margin, y: dividerY },
                end: { x: width - margin, y: dividerY },
                thickness: 1,
                color: frameColor,
            });

            drawStrongText(currentPage, renderedTitle, {
                x: margin,
                y: sectionTitleY,
                font: titleFont,
                size: headerSize,
                color: frameColor,
            });

            if (!isAnswerSheet) {
                drawRegularText(currentPage, '이름:', {
                    x: metaLabelStartX,
                    y: nameLabelY,
                    font,
                    size: sectionMetaSize,
                    color: rgb(0, 0, 0),
                });

                currentPage.drawLine({
                    start: { x: nameLineStartX, y: nameLineY },
                    end: { x: nameLineEndX, y: nameLineY },
                    thickness: 0.8,
                    color: rgb(0, 0, 0),
                });

                const scoreLabel = '점수:';

                drawRegularText(currentPage, scoreLabel, {
                    x: metaLabelStartX,
                    y: scoreLabelY,
                    font,
                    size: sectionMetaSize,
                    color: rgb(0, 0, 0),
                });

                drawRegularText(currentPage, scoreValueText, {
                    x: alignedScoreTextX,
                    y: scoreLabelY,
                    font,
                    size: scoreValueFontSize,
                    color: rgb(0, 0, 0),
                });
            }
        };

        const renderTwoColumnSection = (values, isAnswerSheet = false, forceNewPage = false) => {
            let pointer = 0;
            const isMixedLayout = normalizeSpacingText(options?.testType).toUpperCase() === 'MIXED';

            if (forceNewPage) {
                page = pdfDoc.addPage();
                pages.push(page);
            }

            while (pointer < values.length) {
                if (pointer > 0) {
                    page = pdfDoc.addPage();
                    pages.push(page);
                }

                drawSectionHeader(page, isAnswerSheet);

                const countThisPage = Math.min(values.length - pointer, itemsPerPage);
                const leftColumnCount = isMixedLayout
                    ? Math.ceil(countThisPage / 2)
                    : Math.min(rowsPerColumn, countThisPage);
                const rightColumnCount = countThisPage - leftColumnCount;

                for (let i = 0; i < countThisPage; i += 1) {
                    let row;
                    let col;
                    if (isMixedLayout) {
                        row = Math.floor(i / 2);
                        col = i % 2;
                    } else if (i < leftColumnCount) {
                        row = i;
                        col = 0;
                    } else {
                        row = i - leftColumnCount;
                        col = 1;
                    }
                    const x = col === 1 ? rightColumnX : leftColumnX;
                    const rowGap = isAnswerSheet ? lineHeight * answerLineHeightScale : lineHeight;
                    const y = listTopY - row * rowGap;
                    if (y < rowBottomLimit) break;

                    const itemIndex = pointer + i;
                    const numberText = `${itemIndex + 1}.`;
                    const itemText = `${numberTextDotSpacing}${String(values[itemIndex])}`;
                    const itemY = y - rowTextOffset;
                    const itemFont = resolvePdfFont(itemText);
                    const renderedItemText = truncateToFit(
                        itemText,
                        columnWidth - numberColumnWidth,
                        bodyFontSize,
                        itemFont
                    );

                    drawRegularText(page, numberText, {
                        x: x + 2,
                        y: itemY,
                        size: bodyFontSize,
                        color: mutedColor
                    });
                    drawRegularText(page, renderedItemText, {
                        x: x + numberColumnWidth + numberToTextGap,
                        y: itemY,
                        font: itemFont,
                        size: bodyFontSize,
                        color: frameColor,
                    });

                    const hasNextInColumn = col === 0
                        ? row < leftColumnCount - 1
                        : row < rightColumnCount - 1;

                    if (hasNextInColumn && y > rowBottomLimit + rowGap * 0.3) {
                        const currentLineY = y - rowGap / 2;
                        if (currentLineY > rowBottomLimit + 2) {
                            page.drawLine({
                                start: { x: x, y: currentLineY },
                                end: { x: x + columnWidth, y: currentLineY },
                                thickness: 0.55,
                                color: lineColor,
                            });
                        }
                    }

                }
                pointer += countThisPage;
            }
        };

        renderTwoColumnSection(listValues, isAnswerSheet, false);

        const totalPageCount = pages.length;
        const pageNumberFontSize = 9;
        pages.forEach((currentPage, index) => {
            const pageText = `${index + 1}/${totalPageCount}`;
            const pageTextWidth = font.widthOfTextAtSize(pageText, pageNumberFontSize);
            currentPage.drawText(pageText, {
                x: width - margin - pageTextWidth,
                y: pageNumberY,
                font: resolvePdfFont(pageText),
                size: pageNumberFontSize,
                color: rgb(0, 0, 0),
            });
        });

        return pdfDoc.save({ useObjectStreams: true });
    };

    const createDocx = async (questions, options = {}, isAnswerSheet = false) => {
        await ensureDocxLibrary();
        const docxLib = window.docx;
        const {
            Packer,
            Document,
            Paragraph,
            TextRun,
            Table,
            TableRow,
            TableCell,
            WidthType,
        } = docxLib || {};
        if (!Packer || !Document || !Paragraph || !Table || !TableRow || !TableCell || !WidthType) {
            throw new Error('WORD 라이브러리가 준비되지 않아 DOCX 생성이 불가능합니다.');
        }

        const examTitle = toCompactSpacing(options.examTitle || '어휘 시험지') || '어휘 시험지';
        const compactTitle = toCompactSpacing(examTitle);
        const sectionTitle = compactTitle;
        const listValues = questions.map((item) => {
            const rawText = isAnswerSheet ? item.answer : item.question;
            const normalizedText = normalizeSpacingText(rawText);
            if (!isAnswerSheet && item.questionMode === 'KOR') {
                return extractPrimaryMeaning(normalizedText);
            }
            return normalizedText;
        });
        const exportBaseName = normalizeFileName(options.fileBaseName || options.examTitle || examTitle);
        const totalCount = Math.max(0, (options?.numQuestions || questions.length) || 0);

        const makeTextRun = (text, size, bold = false) => new TextRun({
            text,
            size: size * 2,
            bold,
        });

        const makeUnderlinedSpaceRun = (size, length = 48) => new TextRun({
            text: ' '.repeat(Math.max(0, length)),
            size: size * 2,
            underline: { type: 'single' },
        });

        const docxQuestionFontSize = 11;
        const docxMetaFontSize = 9;
        const docxTitleFontSize = 15;

        const tableBorderStyleNone = {
            top: { style: 'none', size: 0, color: 'auto', space: 0 },
            left: { style: 'none', size: 0, color: 'auto', space: 0 },
            bottom: { style: 'none', size: 0, color: 'auto', space: 0 },
            right: { style: 'none', size: 0, color: 'auto', space: 0 },
        };
        const sectionTableWidth = { size: 100, type: WidthType.PERCENTAGE };
        const headerColumnWidths = [6586, 2944];
        const headerRowHeight = 557;
        const questionTableRowHeight = 495;
        const questionItemsPerColumn = 25;
        const questionItemsPerPage = questionItemsPerColumn * 2;
        const questionCellOuterMargin = 120;
        const questionCellCenterMargin = 240;
        const headerCellMargins = {
            top: 80,
            bottom: 80,
            left: 120,
            right: 120,
        };
        const headerBottomUnderline = {
            top: { style: 'single', size: 12, color: '000000', space: 0 },
            bottom: { style: 'single', size: 12, color: '000000', space: 0 },
        };
        const printGridLine = { style: 'single', size: 6, color: 'B8B8B8', space: 0 };
        const questionTableBorder = {
            insideHorizontal: printGridLine,
            insideVertical: printGridLine,
            ...tableBorderStyleNone,
        };

        const makeListRowCell = (text, columnSide = 'left') => {
            const label = text ? `${text} ` : '';
            const isRightColumn = columnSide === 'right';
            return new TableCell({
                width: { size: 4918, type: WidthType.DXA },
                children: [
                    new Paragraph({
                        children: [
                            makeTextRun(label, docxQuestionFontSize),
                            text ? makeUnderlinedSpaceRun(docxQuestionFontSize, 48) : null,
                        ].filter(Boolean),
                        spacing: {
                            after: 0,
                            before: 0,
                            line: 240,
                            lineRule: 'auto',
                        },
                    }),
                ],
                margins: {
                    top: 0,
                    bottom: 0,
                    left: isRightColumn ? questionCellCenterMargin : questionCellOuterMargin,
                    right: isRightColumn ? questionCellOuterMargin : questionCellCenterMargin,
                },
                verticalAlign: 'center',
            });
        };

        const spacerParagraph = () => new Paragraph({
            children: [makeTextRun(' ', 1)],
            spacing: { before: 0, after: 120 },
        });

        const buildHeaderTable = () => {
            const scoreLabel = '점수:';
            const scoreSuffix = ` / ${totalCount}`;
            return new Table({
                width: sectionTableWidth,
                columnWidths: headerColumnWidths,
                indent: { size: 108, type: WidthType.DXA },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({
                                width: { size: 6663, type: WidthType.DXA },
                                rowSpan: 2,
                                children: [new Paragraph({
                                    children: [makeTextRun(sectionTitle, docxTitleFontSize, false)],
                                    alignment: 'center',
                                    spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
                                })],
                                margins: headerCellMargins,
                                verticalAlign: 'center',
                                borders: headerBottomUnderline,
                            }),
                            new TableCell({
                                width: { size: 2976, type: WidthType.DXA },
                                children: [new Paragraph({
                                    children: [makeTextRun('이름', docxMetaFontSize, false)],
                                    alignment: 'left',
                                    spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
                                })],
                                margins: headerCellMargins,
                                verticalAlign: 'center',
                                borders: {
                                    top: { style: 'single', size: 12, color: '000000', space: 0 },
                                },
                            }),
                        ],
                        height: { value: headerRowHeight, rule: 'exact' },
                    }),
                    new TableRow({
                        children: [
                            new TableCell({
                                children: [new Table({
                                    width: { size: 100, type: WidthType.PERCENTAGE },
                                    columnWidths: [1700, 1276],
                                    rows: [
                                        new TableRow({
                                            children: [
                                                new TableCell({
                                                    children: [new Paragraph({
                                                        children: [makeTextRun(scoreLabel, docxMetaFontSize, false)],
                                                        alignment: 'left',
                                                        spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
                                                    })],
                                                    margins: { top: 0, bottom: 0, left: 0, right: 0 },
                                                    verticalAlign: 'center',
                                                }),
                                                new TableCell({
                                                    children: [new Paragraph({
                                                        children: [makeTextRun(scoreSuffix, docxMetaFontSize, false)],
                                                        alignment: 'right',
                                                        spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
                                                    })],
                                                    margins: { top: 0, bottom: 0, left: 0, right: 0 },
                                                    verticalAlign: 'center',
                                                }),
                                            ],
                                        }),
                                    ],
                                    borders: tableBorderStyleNone,
                                })],
                                margins: headerCellMargins,
                                verticalAlign: 'center',
                                borders: headerBottomUnderline,
                            }),
                        ],
                        height: { value: headerRowHeight, rule: 'exact' },
                    }),
                ],
                borders: tableBorderStyleNone,
            });
        };

        const buildQuestionTable = () => {
            const tables = [];
            const totalItems = listValues.length;
            const effectiveItems = Math.max(totalItems, questionItemsPerColumn);
            const totalPages = Math.ceil(effectiveItems / questionItemsPerPage);
            const isMixedLayout = options?.testType === 'MIXED';

            const makeQuestionTable = (startIndex) => {
                const rows = [];
                for (let row = 0; row < questionItemsPerColumn; row += 1) {
                    const leftIndex = isMixedLayout
                        ? (startIndex + row * 2)
                        : (startIndex + row);
                    const rightIndex = isMixedLayout
                        ? (leftIndex + 1)
                        : (startIndex + questionItemsPerColumn + row);
                    const leftLabel = leftIndex < totalItems ? `${leftIndex + 1}. ${listValues[leftIndex]}` : '';
                    const rightLabel = rightIndex < totalItems ? `${rightIndex + 1}. ${listValues[rightIndex]}` : '';

                    rows.push(new TableRow({
                        children: [
                            makeListRowCell(leftLabel, 'left'),
                            makeListRowCell(rightLabel, 'right'),
                        ],
                        height: { value: questionTableRowHeight, rule: 'exact' },
                    }));
                }

                return new Table({
                    width: sectionTableWidth,
                    columnWidths: [4818, 4820],
                    rows,
                    borders: questionTableBorder,
                });
            };

            for (let page = 0; page < totalPages; page += 1) {
                const startIndex = page * questionItemsPerPage;
                tables.push({
                    index: page,
                    table: makeQuestionTable(startIndex),
                });
            }

            return tables.map(({ index, table }) => ({
                pageBreak: index > 0,
                table,
            }));
        };

        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        size: {
                            width: 11906,
                            height: 16838,
                        },
                        margin: {
                            top: 567,
                            right: 1134,
                            bottom: 567,
                            left: 1134,
                            header: 397,
                            footer: 397,
                        },
                    },
                    grid: { linePitch: 360 },
                    columns: { space: 720 },
                },
                children: [
                    buildHeaderTable(),
                    spacerParagraph(),
                    ...buildQuestionTable().map(({ pageBreak, table }) => [
                        ...(pageBreak ? [new Paragraph({ children: [new TextRun({ text: '' })], pageBreakBefore: true })] : []),
                        table,
                    ]).flat(),
                ],
            }],
        });

        if (typeof Packer.toBlob === 'function') {
            return {
                blob: await Packer.toBlob(doc),
                filename: isAnswerSheet ? `${exportBaseName}_답.docx` : `${exportBaseName}.docx`
            };
        }
        if (typeof Packer.toBase64String === 'function') {
            const base64 = await Packer.toBase64String(doc);
            return {
                blob: base64ToBlob(base64, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
                filename: isAnswerSheet ? `${exportBaseName}_답.docx` : `${exportBaseName}.docx`
            };
        }
        throw new Error('WORD 내보내기 함수를 찾을 수 없습니다.');
    };

    // --- Event Listeners ---
    const setupEventListeners = () => {
        state.ui.sectionLinks.forEach((link) => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = e.currentTarget.dataset.section;
                if (!section) return;
                toggleSection(section);
            });
        });

        state.ui.bookLibrary.addEventListener('click', (e) => {
            const bookTarget = e.target.closest('.book-item, .book-option');
            if (!bookTarget || !state.ui.bookLibrary.contains(bookTarget)) return;
            const rawBookKey = bookTarget.dataset.book;
            if (!rawBookKey) return;
            void selectBook(rawBookKey);
        });
        
        state.ui.subChapterSelectionCard.addEventListener('click', (e) => {
            if (state.ui.subChapterSelectionCard.classList.contains('compact')) {
                state.ui.subChapterSelectionCard.classList.remove('compact');
                return;
            }

            const subChapterItem = e.target.closest('.sub-chapter-item');
            if(subChapterItem) selectSubChapter(subChapterItem.dataset.chapter);
        });

        state.ui.tocChecklist.addEventListener('change', (e) => {
            const checkbox = e.target.closest('input[type="checkbox"][data-toc]');
            if (!checkbox) return;
            updateUiState();
        });
        state.ui.tocChecklist.addEventListener('click', (e) => {
            const item = e.target.closest('.toc-checklist-item');
            if (!item || !state.ui.tocChecklist.contains(item)) return;

            const checkbox = item.querySelector('input[type="checkbox"]');
            if (!checkbox) return;
            if (e.target === checkbox) return;

            e.preventDefault();
            e.stopPropagation();
            checkbox.checked = !checkbox.checked;
            updateUiState();
        });
        if (state.ui.selectAllToc) {
            state.ui.selectAllToc.addEventListener('click', () => modifyAllTocs(true));
        }
        if (state.ui.deselectAllToc) {
            state.ui.deselectAllToc.addEventListener('click', () => modifyAllTocs(false));
        }

        state.ui.testTypeOptions.addEventListener('click', (e) => {
            const typeOption = e.target.closest('.test-type-option');
            if (typeOption && !typeOption.classList.contains('hidden')) {
                state.ui.testTypeOptions.querySelectorAll('.test-type-option').forEach(opt => opt.classList.remove('active'));
                typeOption.classList.add('active');
            }
        });
        if (state.ui.includeDerivatives) {
            state.ui.includeDerivatives.addEventListener('change', (e) => {
                const nextIncludeDerivatives = Boolean(e.target.checked);
                if (nextIncludeDerivatives && !isBookPurchaseVerified()) {
                    state.includeDerivatives = false;
                    state.ui.includeDerivatives.checked = false;
                    showToast('책구매 인증 전에는 파생어 시험지 제작이 제한됩니다.', 'error');
                    return;
                }
                state.includeDerivatives = nextIncludeDerivatives;

                if (state.selectedBook && state.selectedBook !== 'etymology') {
                    renderTocChecklist();
                }
                updateUiState();
            });
        }

        if (state.ui.examTitle) {
            state.ui.examTitle.addEventListener('input', () => {
                state.isExamTitleCustomized = true;
            });
        }

        state.ui.generateBtn.addEventListener('click', generateTest);

        state.ui.numQuestions.addEventListener('change', () => {
            const value = parseInt(state.ui.numQuestions.value, 10);
            const max = parseInt(state.ui.numQuestions.max, 10);
            if (!Number.isInteger(max) || max < 1) {
                state.ui.numQuestions.value = '0';
            } else if (!Number.isInteger(value) || value < 1) {
                state.ui.numQuestions.value = '1';
            } else if (value > max) {
                state.ui.numQuestions.value = String(max);
            }
            const normalizedValue = parseInt(state.ui.numQuestions.value, 10);
            state.isQuestionCountCustomized = true;
            state.requestedQuestionCount = Number.isInteger(normalizedValue) && normalizedValue > 0
                ? normalizedValue
                : null;
            setNumQuestionsHint(state.ui.numQuestions.value);
            syncAutoExamTitle();
        });

        state.ui.numQuestions.addEventListener('input', () => {
            const value = parseInt(state.ui.numQuestions.value, 10);
            state.isQuestionCountCustomized = true;
            state.requestedQuestionCount = Number.isInteger(value) && value > 0 ? value : null;
            setNumQuestionsHint(state.ui.numQuestions.value);
            syncAutoExamTitle();
        });
    };

    // --- Initialization ---
    const init = () => {
        const purchaseTask = syncPurchaseAccess()
            .finally(() => {
                syncDerivativeAccessUi();
                showPurchasePolicyNoticeIfNeeded();
                updateUiState();
            });
        syncGeneratorBookStageLayout();
        initialDataLoadTask = loadData();
        const loadTask = initialDataLoadTask;
        ensureMobileSettingsAtBottom();
        window.addEventListener('resize', () => {
            ensureMobileSettingsAtBottom();
        });
        syncSectionNavFromCards();
        setupEventListeners();
        void Promise.all([loadTask, purchaseTask]).then(() => applyGeneratorRestoreRequest());
    };

    init();
});
