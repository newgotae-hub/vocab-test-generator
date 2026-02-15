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
        koreanFont: null,
        selectedBook: null,
        selectedChapter: null,
        selectedTocs: new Set(),
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
            tocChecklist: document.getElementById('toc-checklist'),
            selectAllToc: document.getElementById('select-all-toc'),
            deselectAllToc: document.getElementById('deselect-all-toc'),
            tocSummary: document.getElementById('toc-summary'),
            testTypeOptions: document.querySelector('.test-type-options'),
            numQuestions: document.getElementById('num-questions'),
            shuffleQuestions: document.getElementById('shuffle-questions'),
            generateBtn: document.getElementById('generate-test-papers'),
        }
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
        // TrueType (00 01 00 00), OpenType (OTTO), TrueType Collection (ttcf)
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
        return i < bytes.length && bytes[i] === 0x3c; // "<"
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
            'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.js',
            'https://unpkg.com/docx@8.5.0/build/index.js'
        ];
        for (const src of sources) {
            try {
                await loadScript(src);
                if (window.docx?.Packer && window.docx?.Document && window.docx?.Paragraph) return;
            } catch (_) {
                // Try next source.
            }
        }
        throw new Error('WORD 라이브러리를 불러오지 못했습니다. 네트워크 차단 또는 CDN 접근 제한을 확인해 주세요.');
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
            updatePdfOptionState();
        } catch (error) {
            console.error(error);
            alert(error.message);
        }
    };

    const selectBook = (bookName) => {
        state.selectedBook = bookName;
        state.selectedChapter = null;
        state.selectedTocs.clear();

        state.ui.bookLibrary.querySelectorAll('.book-item').forEach(item => {
            item.classList.toggle('active', item.dataset.book === bookName);
        });

        // Hide all right-column cards initially
        state.ui.subChapterSelectionCard.classList.add('hidden');
        state.ui.tocSelectionCard.classList.add('hidden');
        state.ui.testConfigCard.classList.add('hidden');
        
        if (bookName === 'etymology') {
            state.ui.subChapterSelectionCard.classList.remove('hidden');
        } else {
            // For 'basic' and 'advanced', do nothing as per user request.
            alert('해당 책의 단어 DB는 현재 준비 중입니다.');
            // Deselect the book visually
            state.selectedBook = null;
            state.ui.bookLibrary.querySelectorAll('.book-item').forEach(item => {
                item.classList.remove('active');
            });
        }
    };

    const selectSubChapter = (chapterId) => {
        state.selectedChapter = chapterId;
        state.selectedTocs.clear();
        
        renderTocChecklist(chapterId);
        modifyAllTocs(false);
        
        state.ui.subChapterSelectionCard.classList.add('hidden');
        state.ui.tocSelectionCard.classList.remove('hidden');
    };

    const renderTocChecklist = (chapterId) => {
        const wordsInChapter = state.allWords.filter(word => word.chapter === chapterId);
        if (wordsInChapter.length === 0) {
            state.ui.tocChecklist.innerHTML = '<p>이 챕터에는 데이터가 없습니다.</p>';
            return;
        }
        
        const tocsInChapter = [...new Set(wordsInChapter.map(word => word.toc))];
        state.ui.tocChecklist.innerHTML = tocsInChapter.sort().map(toc => {
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
        
        const totalWords = state.selectedWords.length;
        state.ui.tocSummary.textContent = `선택된 목차: ${state.selectedTocs.size}개 / 총 단어: ${totalWords}개`;

        const hasSelection = totalWords > 0;
        state.ui.testConfigCard.classList.toggle('hidden', !hasSelection);
        state.ui.generateBtn.disabled = !hasSelection;
    };
    
    const modifyAllTocs = (shouldSelect) => {
        if (!state.selectedChapter) return;
        state.ui.tocChecklist.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = shouldSelect;
        });
        updateUiState();
    };

    const generateTest = async () => {
        const availableWords = state.selectedWords.length;
        if (availableWords === 0) {
            alert('먼저 목차를 선택해 주세요.');
            return;
        }

        const rawNumQuestions = parseInt(state.ui.numQuestions.value, 10);
        if (!Number.isInteger(rawNumQuestions) || rawNumQuestions <= 0) {
            alert('문항 수는 1 이상의 정수여야 합니다.');
            state.ui.numQuestions.value = '1';
            return;
        }

        const validatedNumQuestions = Math.min(rawNumQuestions, availableWords);
        if (validatedNumQuestions !== rawNumQuestions) {
            alert(`선택된 단어 수(${availableWords})를 초과해 ${validatedNumQuestions}문항으로 조정했습니다.`);
            state.ui.numQuestions.value = String(validatedNumQuestions);
        }

        const settings = {
            outputFormat: document.querySelector('input[name="output-format"]:checked').value,
            testType: state.ui.testTypeOptions.querySelector('.active')?.dataset.type || 'KOR',
            numQuestions: validatedNumQuestions,
            shouldShuffle: state.ui.shuffleQuestions.checked
        };

        if (settings.outputFormat === 'PDF' && !(PDFDocument && hasFontkit && state.koreanFont)) {
            alert('PDF 생성을 위한 한글 폰트를 불러오지 못했습니다. WORD(DOCX) 형식으로 생성해 주세요.');
            return;
        }
        if (settings.outputFormat === 'WORD') await ensureDocxLibrary();
        
        let sourceWords = [...state.selectedWords];
        if (settings.shouldShuffle) shuffleArray(sourceWords);
        const testItems = sourceWords.slice(0, settings.numQuestions);

        const questions = testItems.map((word, i) => {
            let type = settings.testType;
            if (type === 'MIXED') type = i % 2 === 0 ? 'KOR' : 'ENG';
            return {
                question: type === 'KOR' ? word.word : word.meaning,
                answer: type === 'KOR' ? word.meaning : word.word,
            };
        });

        alert(`'${settings.outputFormat}' 형식으로 시험지를 생성합니다...`);
        try {
            if (settings.outputFormat === 'PDF') {
                const pdfBytes = await createPdf(questions);
                downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'vocab-test.pdf');
            } else { // WORD
                const docxBlob = await createDocx(questions);
                downloadBlob(docxBlob, 'vocab-test.docx');
            }
        } catch(e) {
            alert(`시험지 생성 중 오류가 발생했습니다: ${e.message || e}`);
            console.error(e);
        }
    };
    
    const createPdf = async (questions) => {
        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(window.fontkit);
        let page;
        let font;
        try {
            font = await pdfDoc.embedFont(state.koreanFont);
        } catch (fontError) {
            throw new Error('한글 폰트 포맷이 올바르지 않아 PDF 생성이 불가능합니다.');
        }
        const { width, height } = page.getSize();
        const margin = 50;
        const questionHeaderSize = 24;
        const answerHeaderSize = 18;
        const bodyFontSize = 12;
        const lineHeight = 14;
        const rowsPerColumn = 50;
        const itemsPerPage = rowsPerColumn * 2;
        const columnGap = 30;
        const headerOffset = 14;
        const contentWidth = width - margin * 2;
        const columnWidth = (contentWidth - columnGap) / 2;
        const leftColumnX = margin;
        const rightColumnX = margin + columnWidth + columnGap;

        const renderTwoColumnSection = (title, values, isAnswerSheet = false) => {
            const headerSize = isAnswerSheet ? answerHeaderSize : questionHeaderSize;
            let pointer = 0;
            let pageIndex = 0;
            while (pointer < values.length) {
                page = pdfDoc.addPage();
                let y = height - margin;
                page.drawText(pageIndex === 0 ? title : `${title} (계속)`, {
                    x: margin,
                    y,
                    font,
                    size: headerSize,
                    color: rgb(0, 0, 0)
                });

                const lineStartY = y - headerSize - headerOffset;
                const countThisPage = Math.min(values.length - pointer, itemsPerPage);
                for (let i = 0; i < countThisPage; i += 1) {
                    const row = i % rowsPerColumn;
                    const col = Math.floor(i / rowsPerColumn);
                    const itemText = `${pointer + i + 1}. ${values[pointer + i]}`;
                    page.drawText(itemText, {
                        x: col === 0 ? leftColumnX : rightColumnX,
                        y: lineStartY - row * lineHeight,
                        font,
                        size: bodyFontSize,
                        color: rgb(0, 0, 0)
                    });
                }

                pointer += countThisPage;
                pageIndex += 1;
            }
        };

        renderTwoColumnSection('어휘 시험지 (Vocabulary Test)', questions.map((item) => item.question), false);
        renderTwoColumnSection('정답지 (Answer Key)', questions.map((item) => item.answer), true);

        return pdfDoc.save();
    };

    const createDocx = async (questions) => {
        const docxLib = window.docx;
        const { Packer, Document, Paragraph } = docxLib || {};
        if (!Packer || !Document || !Paragraph) {
            throw new Error('WORD 라이브러리 로드에 실패했습니다.');
        }

        const questionParagraphs = questions.map((q, i) => new Paragraph({ text: `${i + 1}. ${q.question}` }));
        const answerParagraphs = questions.map((q, i) => new Paragraph({ text: `${i + 1}. ${q.answer}` }));
        const doc = new Document({
            sections: [{
                children: [
                    new Paragraph({ text: '어휘 시험지 (Vocabulary Test)' }),
                    new Paragraph({ text: '' }),
                    ...questionParagraphs,
                    new Paragraph({ text: '' }),
                    new Paragraph({ text: '정답지 (Answer Key)' }),
                    new Paragraph({ text: '' }),
                    ...answerParagraphs,
                ],
            }],
        });

        if (typeof Packer.toBlob === 'function') {
            return Packer.toBlob(doc);
        }
        if (typeof Packer.toBase64String === 'function') {
            const base64 = await Packer.toBase64String(doc);
            return base64ToBlob(base64, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        }
        throw new Error('WORD 내보내기 함수를 찾을 수 없습니다.');
    };

    // --- Event Listeners ---
    const setupEventListeners = () => {
        state.ui.bookLibrary.addEventListener('click', (e) => {
            const bookItem = e.target.closest('.book-item');
            if (bookItem) selectBook(bookItem.dataset.book);
        });
        
        state.ui.subChapterSelectionCard.addEventListener('click', (e) => {
            const subChapterItem = e.target.closest('.sub-chapter-item');
            if(subChapterItem) selectSubChapter(subChapterItem.dataset.chapter);
        });

        state.ui.tocChecklist.addEventListener('change', updateUiState);
        state.ui.selectAllToc.addEventListener('click', () => modifyAllTocs(true));
        state.ui.deselectAllToc.addEventListener('click', () => modifyAllTocs(false));

        state.ui.testTypeOptions.addEventListener('click', (e) => {
            const typeOption = e.target.closest('.test-type-option');
            if (typeOption) {
                state.ui.testTypeOptions.querySelectorAll('.test-type-option').forEach(opt => opt.classList.remove('active'));
                typeOption.classList.add('active');
            }
        });

        state.ui.generateBtn.addEventListener('click', generateTest);

        state.ui.numQuestions.addEventListener('change', () => {
            const value = parseInt(state.ui.numQuestions.value, 10);
            if (!Number.isInteger(value) || value < 1) {
                state.ui.numQuestions.value = '1';
            }
        });
    };

    // --- Initialization ---
    const init = () => {
        updatePdfOptionState();
        loadData();
        setupEventListeners();
    };

    init();
});
