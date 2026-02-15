document.addEventListener('DOMContentLoaded', () => {
    // --- Library Instances ---
    const { PDFDocument, rgb, StandardFonts } = PDFLib;

    // --- State ---
    const state = {
        allWords: [],
        wordsByToc: {},
        koreanFont: null,
        selectedChapter: null,
        selectedTocs: new Set(),
        get selectedWords() {
            let words = [];
            this.selectedTocs.forEach(toc => {
                words.push(...(this.wordsByToc[toc] || []));
            });
            return words;
        },
        ui: {
            bookLibrary: document.getElementById('book-library'),
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

    // --- Main Functions ---

    const loadData = async () => {
        try {
            const response = await fetch('data/root.csv');
            if (!response.ok) throw new Error('CSV 파일을 불러오는 데 실패했습니다.');
            const csvText = await response.text();
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    state.allWords = results.data;
                    // Group words by TOC for easier access
                    state.wordsByToc = {};
                    state.allWords.forEach(word => {
                        if (!state.wordsByToc[word.toc]) state.wordsByToc[word.toc] = [];
                        state.wordsByToc[word.toc].push(word);
                    });
                }
            });
            // Font can be loaded in parallel
            fetch('assets/fonts/NotoSansKR-Regular.ttf')
                .then(res => res.arrayBuffer())
                .then(fontBytes => { state.koreanFont = fontBytes; });
        } catch (error) {
            console.error(error);
            alert(error.message);
        }
    };

    const selectBook = (chapterId) => {
        state.selectedChapter = chapterId;
        state.selectedTocs.clear();

        // Update active book UI
        state.ui.bookLibrary.querySelectorAll('.book-item').forEach(item => {
            item.classList.toggle('active', item.dataset.chapter === chapterId);
        });

        renderTocChecklist(chapterId);
        updateUiState();
    };

    const renderTocChecklist = (chapterId) => {
        const tocsInChapter = [...new Set(
            state.allWords
                .filter(word => word.chapter === chapterId)
                .map(word => word.toc)
        )];
        
        state.ui.tocChecklist.innerHTML = tocsInChapter.sort().map(toc => {
            const wordCount = state.wordsByToc[toc]?.length || 0;
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
        // 1. Update selected TOCs from DOM
        const checkedTocs = [...state.ui.tocChecklist.querySelectorAll('input:checked')].map(el => el.dataset.toc);
        state.selectedTocs = new Set(checkedTocs);

        // 2. Show TOC card if a chapter is selected
        state.ui.tocSelectionCard.classList.toggle('hidden', !state.selectedChapter);
        
        // 3. Update summary text
        const totalWords = state.selectedWords.length;
        state.ui.tocSummary.textContent = `선택된 목차: ${state.selectedTocs.size}개 / 총 단어: ${totalWords}개`;

        // 4. Show/hide and enable/disable config card and button
        const hasSelection = totalWords > 0;
        state.ui.testConfigCard.classList.toggle('hidden', !hasSelection);
        state.ui.generateBtn.disabled = !hasSelection;
    };
    
    const modifyAllTocs = (shouldSelect) => {
        state.ui.tocChecklist.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = shouldSelect;
        });
        updateUiState();
    };

    const generateTest = async () => {
        const settings = {
            testType: state.ui.testTypeOptions.querySelector('.active')?.dataset.type || 'KOR',
            numQuestions: parseInt(state.ui.numQuestions.value, 10),
            shouldShuffle: state.ui.shuffleQuestions.checked
        };
        
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

        alert('시험지를 생성합니다...');
        try {
            const pdfBytes = await createPdf(questions);
            downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'vocab-test.pdf');
        } catch(e) {
            alert('시험지 생성 중 오류가 발생했습니다.');
            console.error(e);
        }
    };
    
    const createPdf = async (questions) => {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        const font = await pdfDoc.embedFont(state.koreanFont || StandardFonts.Helvetica);
        const { width, height } = page.getSize();
        const margin = 50;
        let y = height - margin;

        const drawText = (text, size) => {
            if (y < margin) {
                page = pdfDoc.addPage();
                y = height - margin;
            }
            page.drawText(text, { x: margin, y, font, size, color: rgb(0, 0, 0) });
            y -= size + 8;
        };
        
        drawText('어휘 시험지 (Vocabulary Test)', 24);
        y -= 20;
        questions.forEach((item, index) => drawText(`${index + 1}. ${item.question}`, 12));

        page = pdfDoc.addPage();
        y = height - margin;
        drawText('정답지 (Answer Key)', 18);
        y -= 15;
        questions.forEach((item, index) => drawText(`${index + 1}. ${item.answer}`, 10));

        return pdfDoc.save();
    };


    // --- Event Listeners ---
    const setupEventListeners = () => {
        state.ui.bookLibrary.addEventListener('click', (e) => {
            const bookItem = e.target.closest('.book-item');
            if (bookItem) selectBook(bookItem.dataset.chapter);
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
    };

    // --- Initialization ---
    const init = () => {
        loadData();
        setupEventListeners();
    };

    init();
});
