document.addEventListener('DOMContentLoaded', () => {
    // --- Library Instances ---
    let PDFDocument = null;
    let rgb = null;
    let StandardFonts = null;
    const hasFontkit = typeof window.fontkit !== 'undefined';
    if (typeof window.PDFLib !== 'undefined') {
        ({ PDFDocument, rgb, StandardFonts } = window.PDFLib);
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
        isDataReady: false,
        koreanFont: null,
        selectedBook: null,
        selectedChapter: null,
        selectedTocs: new Set(),
        isExamTitleCustomized: false,
        get selectedWords() {
            if (!this.selectedChapter) return [];
            if (this.selectedTocs.size === 0) return [];

            const words = [];
            this.selectedTocs.forEach(toc => {
                if (!this.wordsByToc[toc]) return;
                words.push(...this.wordsByToc[toc].filter(w => w.chapter === this.selectedChapter));
            });
            return words;
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
            testTypeOptions: document.querySelector('.test-type-options'),
            numQuestions: document.getElementById('num-questions'),
            numQuestionsHint: document.getElementById('num-questions-hint'),
            shuffleQuestions: document.getElementById('shuffle-questions'),
            generateBtn: document.getElementById('generate-test-papers'),
            examTitle: document.getElementById('exam-title'),
        }
    };
    const bookLibraryCard = state.ui.bookLibrary.closest('.card');
    const leftColumn = document.querySelector('.left-column');
    const rightColumn = document.querySelector('.right-column');

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

    const getBookNameForOutput = (bookKey) => {
        const normalized = normalizeBookKey(bookKey);
        const bookNames = {
            etymology: '어원편',
            basic: '베이직',
            advanced: '어드밴스드'
        };
        return bookNames[normalized] || '어원편';
    };

    const extractExamTitleFromToc = (tocLabel = '') => {
        const trimmed = normalizeSpacingText(tocLabel);
        if (!trimmed) return '어휘 시험지';
        const firstToken = trimmed.split(/\s+/)[0];
        return firstToken.replace(/[()\[\],;:]+/g, '').trim() || '어휘 시험지';
    };

    const buildExamTitleFromSelectedTocs = (tocLabels = []) => {
        const titles = tocLabels
            .map((toc) => extractExamTitleFromToc(toc))
            .filter(Boolean)
            .filter((value, idx, arr) => arr.indexOf(value) === idx);

        if (titles.length === 0) return '어휘 시험지';
        return titles.join(' / ');
    };

    const normalizeSpacingText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

    const normalizeFileName = (value) => {
        const text = normalizeSpacingText(value || '어휘시험지')
            .replace(/[\\/:*?"<>|]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        return text || '어휘시험지';
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
        const delimiterMatch = trimmed.match(/([^;,/]+)(?=[;,/]|$)/);
        return normalizeSpacingText((delimiterMatch?.[1] || trimmed));
    };
    const normalizePdfWordText = (text) => normalizeSpacingText(text).replace(/\s+/g, '');
    const normalizeTitleSpacing = (value) => normalizeSpacingText(value).replace(/\s+/g, '');

    const setNumQuestionsHint = (requestValue) => {
        const hint = state.ui.numQuestionsHint;
        if (!hint) return;

        const maxWords = parseInt(state.ui.numQuestions.max, 10);
        const requested = parseInt(requestValue, 10);
        const isReducing = Number.isInteger(maxWords) && Number.isInteger(requested) && maxWords > 0 && requested < maxWords;

        if (isReducing) {
            hint.textContent = '문항 수에 맞게 단어가 자동 선정됩니다.';
            hint.classList.remove('hidden');
        } else {
            hint.textContent = '';
            hint.classList.add('hidden');
        }
    };

    const downloadBlob = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };
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
    const base64ToBlob = (base64, mimeType) => {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeType });
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
            'assets/docx/docx.umd.min.js',
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
            const response = await fetch('data/root.csv');
            if (!response.ok) throw new Error('CSV 파일을 불러오는 데 실패했습니다.');
            const csvText = (await response.text()).replace(/^\uFEFF/, '');
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    state.allWords = results.data;
                    state.wordsByToc = {};
                    state.allWords.forEach(word => {
                        if (!word.toc) return;
                        if (!state.wordsByToc[word.toc]) state.wordsByToc[word.toc] = [];
                        state.wordsByToc[word.toc].push(word);
                    });
                }
            });
            if (PDFDocument) {
                try {
                    const fontResponse = await fetch('assets/fonts/NotoSansKR-Regular.ttf');
                    if (!fontResponse.ok) throw new Error('폰트 파일 없음');
                    const fontContentType = (fontResponse.headers.get('content-type') || '').toLowerCase();
                    const fontBytes = await fontResponse.arrayBuffer();
                    if (fontContentType.includes('text/html') || isLikelyHtmlBuffer(fontBytes)) {
                        throw new Error('폰트 파일 경로가 잘못되었거나 배포에 포함되지 않았습니다.');
                    }
                    if (!isSupportedFontBuffer(fontBytes)) {
                        throw new Error('지원되지 않는 폰트 포맷');
                    }
                    state.koreanFont = fontBytes;
                } catch (fontError) {
                    state.koreanFont = null;
                    console.warn('한글 폰트 로드 실패:', fontError.message || fontError);
                }
            }
            state.isDataReady = true;
            updatePdfOptionState();
        } catch (error) {
            console.error(error);
            state.isDataReady = true;
            showToast('데이터 로드 중 오류가 발생했습니다.', 'error');
        }
    };

    const selectBook = (bookName) => {
        if (!state.isDataReady) {
            return showToast('단어 데이터를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.', 'error');
        }
        if (state.allWords.length === 0) {
            return showToast('단어 데이터가 없습니다. 데이터를 다시 로드해 주세요.', 'error');
        }

        const normalizedBook = normalizeBookKey(bookName);
        state.selectedBook = normalizedBook;
        state.selectedChapter = null;
        state.selectedTocs.clear();
        state.isExamTitleCustomized = false;

        state.ui.bookLibrary.querySelectorAll('.book-item').forEach(item => {
            item.classList.toggle('active', normalizeBookKey(item.dataset.book) === normalizedBook);
        });

        setSectionOpen('toc', false);
        if (isMobileViewport()) {
            setSectionOpen('settings', false);
        }
        state.ui.subChapterSelectionCard?.classList.remove('compact');
        
        if (normalizedBook === 'etymology') {
            setSectionOpen('toc', true);
            state.ui.subChapterSelectionCard.classList.remove('hidden');
            state.ui.tocSelectionCard.classList.remove('hidden');
        } else {
            showToast('해당 책의 단어 DB는 현재 준비 중입니다.', 'error');
            state.selectedBook = null;
            state.ui.bookLibrary.querySelectorAll('.book-item').forEach(item => item.classList.remove('active'));
        }
    };

    const selectSubChapter = (chapterId) => {
        state.selectedChapter = chapterId;
        state.selectedTocs.clear();
        state.ui.subChapterSelectionCard?.querySelectorAll('.sub-chapter-item').forEach(item => {
            item.classList.toggle('selected-item', item.dataset.chapter === chapterId);
        });
        renderTocChecklist(chapterId);
        modifyAllTocs(false);
        state.isExamTitleCustomized = false;
        state.ui.subChapterSelectionCard.classList.add('compact');
        setSectionOpen('toc', true);
        state.ui.subChapterSelectionCard.classList.remove('hidden');
        state.ui.tocSelectionCard.classList.remove('hidden');
    };

    const renderTocChecklist = (chapterId) => {
        const wordsInChapter = state.allWords.filter(word => word.chapter === chapterId);
        if (wordsInChapter.length === 0) {
            state.ui.tocChecklist.innerHTML = '<p>이 챕터에는 데이터가 없습니다.</p>';
            return;
        }
        
        const tocsInChapter = [...new Set(wordsInChapter.map(word => word.toc).filter(Boolean))];
        state.ui.tocChecklist.innerHTML = tocsInChapter.map(toc => {
            if (!toc) return '';
            const wordCount = state.wordsByToc[toc]?.filter(w => w.chapter === chapterId).length || 0;
            return `
                <label class="toc-checklist-item">
                    <input type="checkbox" data-toc="${toc}">
                    <span class="label">${toc}</span>
                    <span class="badge">${wordCount}</span>
                </label>
            `;
        }).join('');
    };
    
    const updateUiState = () => {
        const checkedTocs = [...state.ui.tocChecklist.querySelectorAll('input:checked')].map(el => el.dataset.toc);
        state.selectedTocs = new Set(checkedTocs);
        state.ui.tocChecklist.querySelectorAll('.toc-checklist-item').forEach(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            item.classList.toggle('selected-item', !!checkbox?.checked);
        });
        
        const totalWords = state.selectedWords.length;
        state.ui.tocSummary.textContent = `선택된 목차: ${state.selectedTocs.size}개 / 총 단어: ${totalWords}개`;
        state.ui.numQuestions.value = String(totalWords);
        state.ui.numQuestions.max = String(totalWords);
        setNumQuestionsHint(state.ui.numQuestions.value);

        if (!state.isExamTitleCustomized && state.selectedTocs.size > 0) {
            const tocTitle = buildExamTitleFromSelectedTocs(checkedTocs);
            if (state.ui.examTitle) {
                state.ui.examTitle.value = tocTitle;
            }
        } else if (!state.isExamTitleCustomized) {
            state.ui.examTitle.value = '어휘 시험지';
        }

        const hasSelection = totalWords > 0;
        const shouldShowSettings = hasSelection;
        setSectionOpen('settings', shouldShowSettings);
        state.ui.generateBtn.disabled = !hasSelection;
    };
    
    const modifyAllTocs = (shouldSelect) => {
        if (!state.selectedChapter) return;
        state.ui.tocChecklist.querySelectorAll('input[type="checkbox"]').forEach(checkbox => checkbox.checked = shouldSelect);
        updateUiState();
    };

    const generateTest = async () => {
        if (state.selectedWords.length === 0) return showToast('먼저 목차를 선택해 주세요.', 'error');

        const requested = parseInt(state.ui.numQuestions.value, 10) || 0;
        const numQuestions = Math.min(
            requested,
            state.selectedWords.length
        );
        if (numQuestions <= 0) return showToast('문항 수는 1 이상이어야 합니다.', 'error');
        const examTitle = getExamTitle();

        const settings = {
            outputFormat: document.querySelector('input[name="output-format"]:checked').value,
            testType: state.ui.testTypeOptions.querySelector('.active')?.dataset.type || 'KOR',
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
            const candidateIndexes = [...Array(sourceWords.length).keys()];
            shuffleArray(candidateIndexes);
            const pickedIndexes = candidateIndexes.slice(0, settings.numQuestions).sort((a, b) => a - b);
            testItems = pickedIndexes.map((idx) => sourceWords[idx]);
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

        const baseFileName = normalizeFileName(settings.fileBaseName || settings.examTitle);
        showToast(settings.outputFormat === 'WORD' ? 'WORD 형식으로 시험지를 생성합니다.' : 'PDF 형식으로 시험지를 생성합니다.');
        try {
            if (settings.outputFormat === 'PDF') {
                const questionPdfBytes = await createPdf(questions, settings, false);
                const answerPdfBytes = await createPdf(questions, settings, true);
                downloadBlob(new Blob([questionPdfBytes], { type: 'application/pdf' }), `${baseFileName}.pdf`);
                await sleep(700);
                downloadBlob(new Blob([answerPdfBytes], { type: 'application/pdf' }), `${baseFileName}_답.pdf`);
            } else {
                const questionDocx = await createDocx(questions, settings, false);
                const answerDocx = await createDocx(questions, settings, true);
                downloadBlob(questionDocx.blob, `${baseFileName}.docx`);
                await sleep(700);
                downloadBlob(answerDocx.blob, `${baseFileName}_답.docx`);
            }
        } catch(e) {
            showToast('시험지 생성 중 오류가 발생했습니다.', 'error');
            console.error(e);
        }
    };
    
    const createPdf = async (questions, options = {}, isAnswerSheet = false) => {
        if (!PDFDocument || !state.koreanFont || !hasFontkit) {
            throw new Error('PDF 생성 환경을 준비할 수 없습니다.');
        }

        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(window.fontkit);

        let font;
        try {
            font = await pdfDoc.embedFont(state.koreanFont);
        } catch (fontError) {
            throw new Error('한글 폰트 포맷이 올바르지 않아 PDF 생성이 불가능합니다.');
        }

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
        const scoreTotalText = ` /${(options?.numQuestions || questions.length)}`;
        const scoreValueFontSize = sectionMetaSize + 2;
        const scoreValueText = scoreTotalText;
        const scoreTextWidth = font.widthOfTextAtSize(scoreValueText, scoreValueFontSize);
        const alignedScoreTextX = totalNameLineEndX - scoreTextWidth;
        const scoreValueStartX = alignedScoreTextX;
        const nameLineEndCandidate = scoreValueStartX - scoreTextGap;
        const nameLineEndX = Math.min(totalNameLineEndX, Math.max(nameLineStartX, nameLineEndCandidate));
        const frameColor = rgb(0.22, 0.22, 0.22);
        const lineColor = rgb(0.78, 0.78, 0.78);
        const mutedColor = rgb(0.25, 0.25, 0.25);
        const pageBottom = margin + 4;
        const pageTopFrame = height - margin + 2;
        const pageBottomFrame = pageBottom;
        const columnSeparatorX = margin + columnWidth + columnGap / 2;

        const examTitle = normalizeTitleSpacing(options.examTitle || '어휘 시험지') || '어휘시험지';
        const sectionTitle = toCompactSpacing(examTitle.trim());
        const listValues = questions.map((item) => {
            const rawText = isAnswerSheet ? item.answer : item.question;
            const normalizedText = normalizePdfWordText(rawText);
            if (!isAnswerSheet && item.questionMode === 'KOR') {
                return extractPrimaryMeaning(normalizedText);
            }
            return normalizedText;
        });
        const numberTextDotSpacing = ' ';

        const truncateToFit = (text, maxWidth, fontSize) => {
            const suffix = '…';
            let value = String(text);
            if (font.widthOfTextAtSize(value, fontSize) <= maxWidth) return value;

            while (value.length > 0) {
                value = value.slice(0, -1);
                if (value.length === 0) return suffix;
                if (font.widthOfTextAtSize(value + suffix, fontSize) <= maxWidth) return `${value}${suffix}`;
            }
            return suffix;
        };

        const drawRegularText = (targetPage, text, options) => {
            targetPage.drawText(text, options);
        };

        const drawStrongText = (targetPage, text, options) => {
            targetPage.drawText(text, options);
            targetPage.drawText(text, {
                ...options,
                x: (options.x || 0) + 0.45,
            });
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
            const renderedTitle = truncateToFit(
                `${sectionTitle}${isAnswerSheet ? ' - 정답지' : ''}`,
                titleAreaWidth,
                headerSize
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
                font,
                size: headerSize,
                color: frameColor,
            });

            if (!isAnswerSheet) {
                drawStrongText(currentPage, '이름:', {
                    x: metaLabelStartX,
                    y: nameLabelY,
                    font,
                    size: sectionMetaSize,
                    color: mutedColor,
                });

                currentPage.drawLine({
                    start: { x: nameLineStartX, y: nameLineY },
                    end: { x: nameLineEndX, y: nameLineY },
                    thickness: 0.8,
                    color: rgb(0, 0, 0),
                });

                const scoreLabel = '점수:';

                drawStrongText(currentPage, scoreLabel, {
                    x: metaLabelStartX,
                    y: scoreLabelY,
                    font,
                    size: sectionMetaSize,
                    color: mutedColor,
                });

                drawStrongText(currentPage, scoreValueText, {
                    x: alignedScoreTextX,
                    y: scoreLabelY,
                    font,
                    size: scoreValueFontSize,
                    color: mutedColor,
                });
            }
        };

        const renderTwoColumnSection = (values, isAnswerSheet = false, forceNewPage = false) => {
            let pointer = 0;

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
                const leftColumnCount = Math.ceil(countThisPage / 2);
                const rightColumnCount = Math.floor(countThisPage / 2);

                for (let i = 0; i < countThisPage; i += 1) {
                    const row = Math.floor(i / 2);
                    const col = i % 2;
                    const x = col === 1 ? rightColumnX : leftColumnX;
                    const rowGap = isAnswerSheet ? lineHeight * answerLineHeightScale : lineHeight;
                    const y = listTopY - row * rowGap;
                    if (y < rowBottomLimit) break;

                    const itemIndex = pointer + i;
                    const numberText = `${itemIndex + 1}.`;
                const itemText = `${numberTextDotSpacing}${String(values[itemIndex])}`;
                    const itemY = y - rowTextOffset;

                    drawRegularText(page, numberText, {
                        x: x + 2,
                        y: itemY,
                        font,
                        size: bodyFontSize,
                        color: mutedColor
                    });
                    drawRegularText(page, truncateToFit(itemText, columnWidth - numberColumnWidth, bodyFontSize), {
                        x: x + numberColumnWidth + numberToTextGap,
                        y: itemY,
                        font,
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
                                thickness: 0.3,
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
            const pageText = `p. ${index + 1}/${totalPageCount}`;
            const pageTextWidth = font.widthOfTextAtSize(pageText, pageNumberFontSize);
            currentPage.drawText(pageText, {
                x: width - margin - pageTextWidth,
                y: pageNumberY,
                font,
                size: pageNumberFontSize,
                color: rgb(0, 0, 0),
            });
        });

        return pdfDoc.save();
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
        const questionTableBorder = {
            insideHorizontal: { style: 'single', size: 2, color: 'E6E6E6', space: 0 },
            insideVertical: { style: 'single', size: 2, color: 'E6E6E6', space: 0 },
            ...tableBorderStyleNone,
        };

        const makeListRowCell = (text) => {
            const label = text ? `${text} ` : '';
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

            const makeQuestionTable = (startIndex) => {
                const rows = [];
                for (let row = 0; row < questionItemsPerColumn; row += 1) {
                    const leftIndex = startIndex + row;
                    const rightIndex = startIndex + questionItemsPerColumn + row;
                    const leftLabel = leftIndex < totalItems ? `${leftIndex + 1}. ${listValues[leftIndex]}` : '';
                    const rightLabel = rightIndex < totalItems ? `${rightIndex + 1}. ${listValues[rightIndex]}` : '';

                    rows.push(new TableRow({
                        children: [
                            makeListRowCell(leftLabel),
                            makeListRowCell(rightLabel),
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
            const bookItem = e.target.closest('.book-item');
            if (!bookItem || !state.ui.bookLibrary.contains(bookItem)) return;
            const rawBookKey = bookItem.dataset.book;
            if (!rawBookKey) return;
            selectBook(rawBookKey);
        });
        
        state.ui.subChapterSelectionCard.addEventListener('click', (e) => {
            if (state.ui.subChapterSelectionCard.classList.contains('compact')) {
                state.ui.subChapterSelectionCard.classList.remove('compact');
                return;
            }

            const subChapterItem = e.target.closest('.sub-chapter-item');
            if(subChapterItem) selectSubChapter(subChapterItem.dataset.chapter);
        });

        state.ui.tocChecklist.addEventListener('change', updateUiState);
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
            if (typeOption) {
                state.ui.testTypeOptions.querySelectorAll('.test-type-option').forEach(opt => opt.classList.remove('active'));
                typeOption.classList.add('active');
            }
        });

        if (state.ui.examTitle) {
            state.ui.examTitle.addEventListener('input', () => {
                state.isExamTitleCustomized = true;
            });
        }

        state.ui.generateBtn.addEventListener('click', generateTest);

        state.ui.numQuestions.addEventListener('change', () => {
            const value = parseInt(state.ui.numQuestions.value, 10);
            const max = parseInt(state.ui.numQuestions.max, 10);
            if (!Number.isInteger(value) || value < 1) {
                state.ui.numQuestions.value = '1';
            } else if (value > max) {
                state.ui.numQuestions.value = String(max);
            }
            setNumQuestionsHint(state.ui.numQuestions.value);
        });

        state.ui.numQuestions.addEventListener('input', () => {
            setNumQuestionsHint(state.ui.numQuestions.value);
        });
    };

    // --- Initialization ---
    const init = () => {
        loadData();
        ensureMobileSettingsAtBottom();
        window.addEventListener('resize', () => {
            ensureMobileSettingsAtBottom();
        });
        syncSectionNavFromCards();
        setupEventListeners();
    };

    init();
});
