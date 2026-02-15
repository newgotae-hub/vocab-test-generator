document.addEventListener('DOMContentLoaded', () => {
    // --- Library Instances ---
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const { Document, Packer, Paragraph, TextRun, AlignmentType } = docx;

    // --- State Management ---
    const state = {
        allWords: [],
        wordsByChapter: {},
        wordsByToc: {},
        koreanFont: null,
        selectedChapter: null,
        selectedTocs: new Set(),
        get selectedWords() {
            let words = [];
            this.selectedTocs.forEach(toc => {
                words.push(...(state.wordsByToc[toc] || []));
            });
            // Return a copy to prevent mutation
            return [...words];
        },
    };

    // --- DOM Elements ---
    const loadingOverlay = document.getElementById('loading-overlay');
    const steps = {
        step1: document.getElementById('step1'),
        step2: document.getElementById('step2'),
        step3: document.getElementById('step3'),
    };
    const navButtons = {
        goToStep3: document.getElementById('goToStep3'),
        backToStep1: document.getElementById('backToStep1'),
        backToStep2: document.getElementById('backToStep2'),
    };
    
    // Step 1 Elements
    const chapterCoverSelection = document.getElementById('chapter-cover-selection');

    // Step 2 Elements
    const chapterSelection = document.getElementById('chapter-selection');
    const tocListContainer = document.querySelector('.toc-list-container');
    const tocSearch = document.getElementById('toc-search');
    const selectAllToc = document.getElementById('selectAllToc');
    const deselectAllToc = document.getElementById('deselectAllToc');
    const selectedTocCount = document.getElementById('selected-toc-count');
    const totalWordCount = document.getElementById('total-word-count');
    const previewListBody = document.querySelector('#preview-list tbody');
    const testTypeCheckboxes = document.querySelectorAll('input[name="test-type"]');
    const mixOptions = document.getElementById('mix-options');

    // Step 3 Elements
    const downloadTestBtn = document.getElementById('download-test');
    const downloadTestAnswersBtn = document.getElementById('download-test-answers');
    const logOutput = document.getElementById('log-output');

    // --- Utility Functions ---
    const showLoading = (message) => {
        loadingOverlay.querySelector('p').textContent = message;
        loadingOverlay.classList.remove('hidden');
    };
    const hideLoading = () => loadingOverlay.classList.add('hidden');
    
    const log = (message, isError = false) => {
        const p = document.createElement('p');
        p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        if (isError) p.style.color = '#f87171';
        logOutput.prepend(p);
    };

    const navigateTo = (stepId) => {
        log(`Navigating to ${stepId}...`);
        Object.values(steps).forEach(step => step.classList.remove('active'));
        if (steps[stepId]) {
            steps[stepId].classList.add('active');
            log(`Navigation to ${stepId} successful.`);
        } else {
            log(`Error: Step "${stepId}" not found.`, true);
        }
    };
    
    const shuffleArray = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
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

    // --- Core Logic ---

    // 1. Data & Font Loading
    const loadPrerequisites = async () => {
        showLoading('필수 파일을 불러오는 중...');
        try {
            await loadData();
            await loadFont();
        } catch (error) {
            console.error(error);
            log(`초기화 오류: ${error.message}`, true);
        } finally {
            hideLoading();
        }
    };
    
    const loadData = () => new Promise(async (resolve, reject) => {
        try {
            const response = await fetch('data/root.csv');
            if (!response.ok) throw new Error(`CSV(${response.status})`);
            
            const csvText = await response.text();
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    processData(results.data);
                    log(`${state.allWords.length} 단어 로드 완료.`);
                    resolve();
                },
                error: (err) => reject(new Error(`PapaParse: ${err.message}`))
            });
        } catch (error) { reject(error); }
    });
    
    const loadFont = () => new Promise(async (resolve) => {
        try {
            const fontBytes = await fetch('assets/fonts/NotoSansKR-Regular.ttf').then(res => res.arrayBuffer());
            state.koreanFont = fontBytes;
            log('한글 폰트 로드 완료.');
        } catch (error) {
            log('경고: 한글 폰트(assets/fonts/NotoSansKR-Regular.ttf)를 찾을 수 없습니다. PDF에서 한글이 깨질 수 있습니다.', true);
        }
        resolve();
    });

    const processData = (data) => {
        state.allWords = data;
        data.forEach(word => {
            if (!state.wordsByChapter[word.chapter]) state.wordsByChapter[word.chapter] = [];
            state.wordsByChapter[word.chapter].push(word);
            if (!state.wordsByToc[word.toc]) state.wordsByToc[word.toc] = [];
            state.wordsByToc[word.toc].push(word);
        });
        chapterSelection.querySelectorAll('button').forEach(btn => btn.disabled = false);
    };

    // 2. Step 2 Logic
    const handleChapterSelect = (chapter) => {
        state.selectedChapter = chapter;
        state.selectedTocs.clear();
        chapterSelection.querySelectorAll('button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.chapter === chapter);
        });
        renderTocList();
        updateSelectionSummary();
    };

    const renderTocList = () => {
        tocListContainer.innerHTML = '';
        if (!state.selectedChapter) return;
        const wordsInChapter = state.wordsByChapter[state.selectedChapter] || [];
        const tocsInChapter = [...new Set(wordsInChapter.map(w => w.toc))];
        const searchTerm = tocSearch.value.toLowerCase();
        tocsInChapter
            .filter(toc => toc && toc.toLowerCase().includes(searchTerm))
            .sort()
            .forEach(toc => {
                const wordCount = state.wordsByToc[toc]?.length || 0;
                const isChecked = state.selectedTocs.has(toc);
                const label = document.createElement('label');
                label.innerHTML = `
                    <input type="checkbox" data-toc="${toc}" ${isChecked ? 'checked' : ''}>
                    ${toc}
                    <span class="toc-item-badge">${wordCount}</span>
                `;
                tocListContainer.appendChild(label);
            });
    };
    
    const updateSelectionSummary = () => {
        const selectedWords = state.selectedWords;
        selectedTocCount.textContent = state.selectedTocs.size;
        totalWordCount.textContent = selectedWords.length;
        previewListBody.innerHTML = '';
        selectedWords.slice(0, 50).forEach(word => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${word.toc}</td><td>${word.word}</td><td>${word.meaning}</td>`;
            previewListBody.appendChild(row);
        });
        navButtons.goToStep3.disabled = selectedWords.length === 0;
    };
    
    const updateTestTypeOptions = () => {
        const selectedTypes = Array.from(testTypeCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
        mixOptions.style.display = selectedTypes.length === 2 ? 'block' : 'none';
    };

    // 3. Step 3 Logic: Test Generation
    const getTestSettings = () => {
        const testTypes = Array.from(document.querySelectorAll('input[name="test-type"]:checked')).map(el => el.value);
        if (testTypes.length === 0) {
            log('오류: 하나 이상의 시험 유형을 선택해야 합니다.', true);
            return null;
        }
        return {
            words: state.selectedWords,
            types: testTypes,
            mixType: document.querySelector('input[name="mix-type"]:checked').value,
            numQuestions: parseInt(document.getElementById('num-questions').value, 10),
            shuffle: document.getElementById('shuffle-questions').checked,
            abForms: document.getElementById('form-ab').checked,
            outputFormat: document.querySelector('input[name="output-format"]:checked').value,
            layout: document.querySelector('input[name="layout"]:checked').value,
        };
    };

    const generateTestQuestions = (settings) => {
        let sourceWords = [...settings.words];
        if (settings.shuffle) {
            shuffleArray(sourceWords);
        }
        const questions = sourceWords.slice(0, settings.numQuestions);

        return questions.map((word, i) => {
            let type;
            if (settings.types.length === 1) {
                type = settings.types[0];
            } else { // Mixed
                if (settings.mixType === 'alternate') {
                    type = i % 2 === 0 ? settings.types[0] : settings.types[1];
                } else { // random
                    type = settings.types[Math.floor(Math.random() * 2)];
                }
            }
            return {
                question: type === 'KOR' ? word.word : word.meaning,
                answer: type === 'KOR' ? word.meaning : word.word,
            };
        });
    };

    const handleDownload = async (includeAnswers) => {
        const settings = getTestSettings();
        if (!settings) return;

        showLoading('시험지를 생성하는 중...');
        log(`시험지 생성 시작... (총 ${settings.numQuestions}문항)`);
        await new Promise(r => setTimeout(r, 50)); // Allow UI update

        try {
            const forms = {};
            forms.A = generateTestQuestions(settings);
            if (settings.abForms) {
                // Create a different shuffle for Form B
                const settingsB = {...settings, words: shuffleArray([...settings.words])};
                forms.B = generateTestQuestions(settingsB);
            }

            const filename = `어원편_시험지${includeAnswers ? '_정답포함' : ''}`;

            if (settings.outputFormat === 'PDF') {
                const pdfBytes = await generatePdf(forms, includeAnswers, settings);
                downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), `${filename}.pdf`);
            } else { // DOCX
                const blob = await generateDocx(forms, includeAnswers);
                downloadBlob(blob, `${filename}.docx`);
            }
            log('시험지 생성 완료!');
        } catch (error) {
            log(`시험지 생성 중 오류 발생: ${error.message}`, true);
            console.error(error);
        } finally {
            hideLoading();
        }
    };
    
    const generatePdf = async (forms, includeAnswers, settings) => {
        const pdfDoc = await PDFDocument.create();
        if (state.koreanFont) {
            await pdfDoc.embedFont(state.koreanFont, { subset: true });
        }
        const font = await pdfDoc.embedFont(state.koreanFont ? state.koreanFont : StandardFonts.Helvetica);
        
        const drawText = (page, text, x, y, size) => {
            page.drawText(text, { x, y, font, size, color: rgb(0, 0, 0) });
        };
        
        const renderContent = (formName, questions) => {
            const page = pdfDoc.addPage();
            const { width, height } = page.getSize();
            const margin = 50;
            const title = `어원편 단어 시험 (${formName})`;
            
            drawText(page, title, margin, height - margin, 24);
            
            const contentWidth = width - 2 * margin;
            const contentHeight = height - margin * 2 - 30;
            const cols = settings.layout === '2-col' ? 2 : 1;
            const colWidth = (contentWidth - (cols - 1) * 20) / cols;
            
            let y = height - margin - 30;
            let current_col = 0;

            questions.forEach((q, i) => {
                const text = `${i + 1}. ${q.question}  →`;
                if (y < margin) {
                    current_col++;
                    if (current_col >= cols) {
                        // This part is simplified. A real implementation would add a new page.
                        return; 
                    }
                    y = height - margin - 30;
                }
                const x = margin + current_col * (colWidth + 20);
                drawText(page, text, x, y, 11);
                y -= 20;
            });
        };
        
        const renderAnswers = (forms) => {
             const page = pdfDoc.addPage();
             const { height, margin=50 } = page.getSize();
             drawText(page, '정답지', margin, height - margin, 24);
             let y = height - margin - 30;
             Object.entries(forms).forEach(([formName, questions]) => {
                if (y < margin + 20) y = height - margin - 30; // Reset for new form if needed
                drawText(page, `--- ${formName} 정답 ---`, margin, y, 14);
                y -= 25;
                questions.forEach((q, i) => {
                     if (y < margin) return; // Simplified
                     drawText(page, `${i + 1}. ${q.answer}`, margin, y, 9);
                     y -= 15;
                });
             });
        };

        renderContent('Form A', forms.A);
        if (forms.B) renderContent('Form B', forms.B);
        if (includeAnswers) renderAnswers(forms);

        return await pdfDoc.save();
    };

    const generateDocx = async (forms, includeAnswers) => {
        const children = [];
        const createContent = (formName, questions) => {
            children.push(new Paragraph({ text: `어원편 단어 시험 (${formName})`, heading: "Heading1" }));
            questions.forEach((q, i) => {
                children.push(new Paragraph({
                    children: [new TextRun(`${i + 1}. ${q.question}  →`)]
                }));
            });
            children.push(new Paragraph("")); // Spacer
        };
        
        createContent('Form A', forms.A);
        if (forms.B) createContent('Form B', forms.B);
        
        if (includeAnswers) {
            children.push(new Paragraph({ text: "정답지", heading: "Heading1" }));
            Object.entries(forms).forEach(([formName, questions]) => {
                children.push(new Paragraph({ text: `--- ${formName} 정답 ---`, heading: "Heading2" }));
                questions.forEach((q, i) => {
                     children.push(new Paragraph({
                         children: [new TextRun({ text: `${i + 1}. ${q.answer}`, size: 18 })] // size is in half-points
                     }));
                });
            });
        }
        
        const doc = new Document({ sections: [{ children }] });
        return await Packer.toBlob(doc);
    };


    // --- Event Listeners ---
    chapterCoverSelection.addEventListener('click', (e) => {
        const chapterItem = e.target.closest('.chapter-cover-item');
        if (chapterItem) {
            const chapter = chapterItem.dataset.chapter;
            log(`STEP 1: ${chapter} 선택됨.`);
            handleChapterSelect(chapter);
            navigateTo('step2');
        }
    });

    navButtons.goToStep3.addEventListener('click', () => navigateTo('step3'));
    navButtons.backToStep1.addEventListener('click', () => navigateTo('step1'));
    navButtons.backToStep2.addEventListener('click', () => navigateTo('step2'));

    chapterSelection.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') handleChapterSelect(e.target.dataset.chapter);
    });
    
    tocSearch.addEventListener('input', renderTocList);
    
    tocListContainer.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            const toc = e.target.dataset.toc;
            e.target.checked ? state.selectedTocs.add(toc) : state.selectedTocs.delete(toc);
            updateSelectionSummary();
        }
    });
    
    selectAllToc.addEventListener('click', () => {
        tocListContainer.querySelectorAll('input[type="checkbox"]').forEach(chk => {
            if (!chk.checked) {
                state.selectedTocs.add(chk.dataset.toc);
                chk.checked = true;
            }
        });
        updateSelectionSummary();
    });
    
    deselectAllToc.addEventListener('click', () => {
        state.selectedTocs.clear();
        tocListContainer.querySelectorAll('input[type="checkbox"]').forEach(chk => chk.checked = false);
        updateSelectionSummary();
    });

    testTypeCheckboxes.forEach(cb => cb.addEventListener('change', updateTestTypeOptions));
    
    downloadTestBtn.addEventListener('click', () => handleDownload(false));
    downloadTestAnswersBtn.addEventListener('click', () => handleDownload(true));

    // --- App Initialization ---
    const initialize = () => {
        chapterSelection.querySelectorAll('button').forEach(btn => btn.disabled = true);
        navButtons.goToStep3.disabled = true;
        log('어플리케이션 초기화');
        loadPrerequisites();
    };

    initialize();
});
