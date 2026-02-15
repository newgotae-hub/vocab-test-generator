document.addEventListener('DOMContentLoaded', () => {
    // --- Library Instances ---
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const { Packer, Document, Paragraph, TextRun } = docx;

    // --- State ---
    const state = {
        allWords: [],
        selectedChapter: null,
        selectedWords: [],
        koreanFont: null,
        ui: {
            bookLibrary: document.getElementById('book-library'),
            testTypeOptions: document.querySelector('.test-type-options'),
            numQuestions: document.getElementById('num-questions'),
            shuffleQuestions: document.getElementById('shuffle-questions'),
            generateBtn: document.getElementById('generate-test-papers'),
            generateHint: document.getElementById('generate-hint'),
        }
    };

    // --- Utility Functions ---
    const showHint = (text) => {
        state.ui.generateHint.textContent = text;
    };

    const downloadBlob = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    const shuffleArray = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    };


    // --- Core Logic ---

    // 1. Data Loading
    const loadPrerequisites = async () => {
        showHint('단어 데이터를 불러오는 중...');
        try {
            // Load data
            const response = await fetch('data/root.csv');
            if (!response.ok) throw new Error(`CSV 파일을 불러오는 데 실패했습니다.`);
            const csvText = await response.text();
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    state.allWords = results.data;
                    showHint('라이브러리에서 시험지를 만들 책을 선택해주세요.');
                }
            });

            // Load font
            try {
                const fontBytes = await fetch('assets/fonts/NotoSansKR-Regular.ttf').then(res => res.arrayBuffer());
                state.koreanFont = fontBytes;
            } catch (e) {
                console.warn('한글 폰트를 찾을 수 없습니다. PDF 생성 시 한글이 깨질 수 있습니다.');
            }

        } catch (error) {
            showHint(error.message);
            console.error(error);
        }
    };

    // 2. Book Selection
    const selectBook = (chapterId) => {
        state.selectedChapter = chapterId;
        state.selectedWords = state.allWords.filter(word => word.chapter === chapterId);

        // Update UI
        state.ui.bookLibrary.querySelectorAll('.book-item').forEach(item => {
            item.classList.toggle('active', item.dataset.chapter === chapterId);
        });

        if (state.selectedWords.length > 0) {
            state.ui.generateBtn.disabled = false;
            const bookTitle = state.ui.bookLibrary.querySelector(`[data-chapter="${chapterId}"] h3`).textContent;
            showHint(`'${bookTitle}'의 ${state.selectedWords.length}개 단어로 시험지를 생성할 수 있습니다.`);
        } else {
            state.ui.generateBtn.disabled = true;
            showHint(`선택된 책에 해당하는 단어가 없습니다.`);
        }
    };

    // 3. Test Generation
    const generateTest = async () => {
        if (state.selectedWords.length === 0) {
            alert('먼저 책을 선택해주세요.');
            return;
        }

        // Gather settings
        const settings = {
            testType: state.ui.testTypeOptions.querySelector('.active')?.dataset.type || 'KOR',
            numQuestions: parseInt(state.ui.numQuestions.value, 10),
            shouldShuffle: state.ui.shuffleQuestions.checked
        };
        
        let sourceWords = [...state.selectedWords];
        if (settings.shouldShuffle) {
            shuffleArray(sourceWords);
        }
        const testItems = sourceWords.slice(0, settings.numQuestions);

        const questions = testItems.map((word, i) => {
            let type = settings.testType;
            if (type === 'MIXED') {
                type = i % 2 === 0 ? 'KOR' : 'ENG';
            }
            return {
                question: type === 'KOR' ? word.word : word.meaning,
                answer: type === 'KOR' ? word.meaning : word.word,
            };
        });

        // Generate PDF
        state.ui.generateBtn.disabled = true;
        showHint('PDF 시험지를 생성하는 중...');
        try {
            const pdfBytes = await createPdf(questions);
            downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'vocab-test.pdf');
            showHint('시험지 생성이 완료되었습니다!');
        } catch(e) {
            showHint('시험지 생성 중 오류가 발생했습니다.');
            console.error(e);
        } finally {
            state.ui.generateBtn.disabled = false;
        }
    };

    const createPdf = async (questions) => {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        
        const font = await pdfDoc.embedFont(state.koreanFont ? state.koreanFont : StandardFonts.Helvetica);

        const { width, height } = page.getSize();
        const margin = 50;
        let y = height - margin;

        const drawText = (text, size, isBold = false) => {
            if (y < margin) {
                page = pdfDoc.addPage();
                y = height - margin;
            }
            page.drawText(text, {
                x: margin,
                y: y,
                font: font,
                size: size,
                color: rgb(0, 0, 0),
            });
            y -= size + 5; // Line height
        };
        
        drawText('어휘 시험지 (Vocabulary Test)', 24);
        y -= 20;

        questions.forEach((item, index) => {
            drawText(`${index + 1}. ${item.question}`, 12);
        });

        // Add answer sheet on a new page
        page = pdfDoc.addPage();
        y = height - margin;
        drawText('정답지 (Answer Key)', 18);
        y -= 15;
        questions.forEach((item, index) => {
            drawText(`${index + 1}. ${item.answer}`, 10);
        });

        return pdfDoc.save();
    };


    // --- Event Listeners ---
    const setupEventListeners = () => {
        state.ui.bookLibrary.addEventListener('click', (e) => {
            const bookItem = e.target.closest('.book-item');
            if (bookItem) {
                selectBook(bookItem.dataset.chapter);
            }
        });

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
        loadPrerequisites();
        setupEventListeners();
        // Set a default active test type
        state.ui.testTypeOptions.querySelector('.test-type-option[data-type="KOR"]').classList.add('active');
    };

    init();
});
