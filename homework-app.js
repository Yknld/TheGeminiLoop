        // Multiple questions support
        let questions = []; // Array to store loaded homework problems (null = not loaded yet)
        let questionTexts = []; // Array to store question texts for lazy loading
        let currentQuestionIndex = 0;
        
        // Homework data structure (current question)
        let homeworkData = {
            problem: {
                title: "Homework Problem",
                text: "Problem description will appear here.",
                image: null
            },
            steps: []
        };

        // Question state tracking (stores progress for each question)
        let questionStates = {};
        
        // Component export system for evaluation pipeline
        const exportedComponents = [];
        
        function exportComponent(component) {
            exportedComponents.push(component);
            // Save to localStorage for extraction
            try {
                localStorage.setItem('exported_components', JSON.stringify(exportedComponents));
                console.log(`📦 EXPORTED COMPONENT: ${component.id} (${component.type})`);
            } catch (error) {
                console.error('Failed to export component to localStorage:', error);
            }
        }
        
        // Clear previous exports on init
        function clearExportedComponents() {
            exportedComponents.length = 0;
            try {
                localStorage.removeItem('exported_components');
                console.log('🧹 Cleared previous component exports');
            } catch (error) {
                console.error('Failed to clear component exports:', error);
            }
        }

        /** If content looks like HTML-entity-encoded (e.g. &lt;div&gt;), decode once so it renders as HTML. */
        function ensureHtml(content) {
            if (!content || typeof content !== 'string') return content;
            const trimmed = content.trim();
            if (!trimmed.startsWith('&lt;') && !trimmed.startsWith('&amp;')) return content;
            const div = document.createElement('div');
            div.innerHTML = content;
            if (div.childNodes.length === 1 && div.childNodes[0].nodeType === Node.TEXT_NODE) {
                const decoded = div.childNodes[0].textContent;
                div.innerHTML = decoded;
            }
            return div.innerHTML;
        }

        /** Detect if a string looks like PNG (or other binary) decoded as text - do not use as HTML. */
        function looksLikeBinaryContent(str) {
            if (!str || typeof str !== 'string' || str.length < 12) return false;
            const start = str.slice(0, 120);
            const trimmed = start.trimStart();
            if (trimmed.startsWith('<') && start.includes('</')) return false;
            if (/PNG|IHDR|IDAT/i.test(start)) return true;
            if (str.includes('\uFFFD') && str.length > 200) return true;
            return false;
        }

        /** Wait for MathJax to load (script is async), then resolve. */
        function whenMathJaxReady() {
            return new Promise((resolve) => {
                if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
                    resolve();
                    return;
                }
                if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
                    window.MathJax.startup.promise.then(resolve).catch(() => resolve());
                    return;
                }
                let attempts = 0;
                const maxAttempts = 100;
                const check = () => {
                    if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
                        resolve();
                        return;
                    }
                    attempts++;
                    if (attempts < maxAttempts) setTimeout(check, 50);
                    else resolve();
                };
                setTimeout(check, 50);
            });
        }

        /** Typeset math in the given element(s) once MathJax is ready. */
        function typesetMath(els) {
            const nodeList = Array.isArray(els) ? els : (els ? [els] : []);
            if (nodeList.length === 0) return;
            whenMathJaxReady().then(() => {
                if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
                    window.MathJax.typesetPromise(nodeList).catch(err => console.warn('MathJax typeset error:', err));
                }
            });
        }

        // Initialize - set up questions but don't load them all at once
        async function init() {
            console.log('🟢 INIT FUNCTION CALLED');
            
            // Clear previous component exports
            clearExportedComponents();
            
            // Show loading overlay
            showLoadingOverlay();
            
            // Store question texts for eager loading (all generate upfront)
            questionTexts = [
                "Solve for x: 2x + 5 = 13",
                "A rectangular garden has a length that is 3 meters more than twice its width. If the perimeter is 54 meters, find the dimensions.",
                "Find the area of a circle with radius 5."
            ];
            
            // Initialize questions array with placeholders
            questions = questionTexts.map((text, index) => null);
            
            // Pre-load ALL questions in parallel
            console.log('🟢 Pre-loading all questions in parallel...');
            await preloadAllQuestions();
            
            // Hide loading overlay
            hideLoadingOverlay();
            
            // Update navigation to show all questions
            updateQuestionNavigation();
            
            // Load first question
            if (questions.length > 0 && questions[0] !== null) {
                loadQuestion(0);
            }
            
            // Ensure dropdown is enabled and functional after DOM is ready
            setTimeout(() => {
                const questionSelect = document.getElementById('question-select');
                if (questionSelect) {
                    questionSelect.disabled = false;
                    questionSelect.style.pointerEvents = 'auto';
                    questionSelect.style.cursor = 'pointer';
                    questionSelect.style.opacity = '1';
                    
                    // Remove any existing listeners and add fresh one
                    const newSelect = questionSelect.cloneNode(true);
                    questionSelect.parentNode.replaceChild(newSelect, questionSelect);
                    
                    // Add event listener to the new element
                    const freshSelect = document.getElementById('question-select');
                    freshSelect.addEventListener('change', function(e) {
                        const selectedIndex = parseInt(e.target.value);
                        console.log('🔄 Dropdown change event - selected index:', selectedIndex);
                        if (!isNaN(selectedIndex)) {
                            selectQuestion(selectedIndex).catch(err => {
                                console.error('Error selecting question:', err);
                            });
                        }
                    });
                    
                    // Also set inline handler as backup
                    freshSelect.onchange = function() {
                        const selectedIndex = parseInt(this.value);
                        console.log('🔄 Dropdown inline handler - selected index:', selectedIndex);
                        if (!isNaN(selectedIndex)) {
                            selectQuestion(selectedIndex).catch(err => {
                                console.error('Error selecting question:', err);
                            });
                        }
                    };
                    
                    console.log('✅ Dropdown initialized and enabled');
                } else {
                    console.error('❌ Question select element not found');
                }
            }, 200);
        }

        // Test function with a complex math problem
        async function testComplexQuestion() {
            const complexProblem = "Study the diagrams, graphs, data sets, etc... that are shown below and then answer the questions that follow (with detail when necessary AND IN COMPLETE SENTENCES!!). Question 1.a: What are the structures labeled A, B, and C? (A points to oval-shaped organelles with internal folds in the cytoplasm, B points to a large dark-stained spherical structure, C points to the outer boundary of the cell with a hint that it surrounds the cell). Question 1.b: Is this cell an animal cell or a plant cell? How do you know?";
            
            console.log('Testing API call with complex problem...');
            await loadHomeworkFromAPI(complexProblem);
        }

        // Example usage for multiple questions:
        // 
        // 1. Load multiple questions at once (replaces existing):
        // loadHomeworkFromAPI([
        //     "Solve for x: 2x + 5 = 13",
        //     "A rectangular garden has a length that is 3 meters more than twice its width. If the perimeter is 54 meters, find the dimensions.",
        //     "Find the area of a circle with radius 5."
        // ]);
        //
        // 2. Load a single question (replaces current):
        // loadHomeworkFromAPI("Solve for x: 2x + 5 = 13");
        //
        // 3. Add a new question (keeps existing questions):
        // loadHomeworkFromAPI("New question text", null, true);
        //
        // 4. Load multiple questions and append to existing:
        // loadMultipleQuestionsFromAPI(["Q1", "Q2"], true);
        //
        // 5. Set homework data directly:
        // setHomeworkData({ problem: {...}, steps: [...] });
        // setHomeworkData({ problem: {...}, steps: [...] }, true); // Add as new question

        // Load pre-generated module from disk
        async function loadModuleFromDisk(moduleId) {
            console.log(`🔍 [loadModuleFromDisk] Starting to load ${moduleId}...`);
            try {
                console.log(`🔍 [loadModuleFromDisk] Fetching manifest.json...`);
                // Add cache-busting to always get fresh version
                const cacheBuster = `?_t=${Date.now()}`;
                const response = await fetch(`modules/${moduleId}/manifest.json${cacheBuster}`);
                if (!response.ok) {
                    throw new Error(`Module ${moduleId} not found`);
                }
                console.log(`✅ [loadModuleFromDisk] Manifest fetched, parsing JSON...`);
                const manifest = await response.json();
                
                // Check if this is a multi-question manifest (version 2.0) or single-question (version 1.0)
                // Check for questions array first (v2.0), version field is optional
                if (manifest.questions && Array.isArray(manifest.questions)) {
                    console.log(`✅ [loadModuleFromDisk] Multi-question manifest detected with ${manifest.questions.length} questions`);
                    
                    // Load all questions
                    const loadedQuestions = await Promise.all(manifest.questions.map(async (questionData) => {
                        return await loadQuestionFromManifest(moduleId, questionData);
                    }));
                    
                    console.log(`✅ [loadModuleFromDisk] Loaded ${loadedQuestions.length} questions`);
                    
                    // Debug: Check visualizations for all questions
                    loadedQuestions.forEach((q, i) => {
                        console.log(`   Q${i+1}: has visualization = ${!!q.problem?.visualization}, length = ${q.problem?.visualization?.length || 0}`);
                    });
                    
                    // Set up multi-question mode
                    questions = loadedQuestions;
                    questionTexts = loadedQuestions.map((q, i) => q.problem.text || `Question ${i + 1}`);
                    currentQuestionIndex = 0;
                    
                    // Update navigation before loading
                    updateQuestionNavigation();
                    
                    // Load first question
                    loadHomework(loadedQuestions[0], 0);
                    
                    return loadedQuestions[0]; // Return first question for compatibility
                } else {
                    console.log(`✅ [loadModuleFromDisk] Single-question manifest, has ${manifest.steps?.length || 0} steps`);
                    // Original single-question format - load and display
                    const questionData = await loadQuestionFromManifest(moduleId, manifest);
                    
                    // Set up single-question arrays
                    questions = [questionData];
                    questionTexts = [questionData.problem.text || "Question 1"];
                    currentQuestionIndex = 0;
                    
                    // Update navigation before loading
                    updateQuestionNavigation();
                    
                    // Load the question
                    loadHomework(questionData, 0);
                    
                    return questionData;
                }
            } catch (error) {
                console.error('❌ [loadModuleFromDisk] Error loading module:', error);
                return null;
            }
        }

        // Load module from API-provided manifest (e.g. from interactive_module_get with signed URLs)
        async function loadModuleFromApi(manifest) {
            if (!manifest || !manifest.id) {
                console.error('❌ [loadModuleFromApi] Invalid manifest: missing id');
                return null;
            }
            const moduleId = manifest.id;
            console.log(`🔍 [loadModuleFromApi] Loading module ${moduleId} from manifest...`);
            try {
                if (manifest.questions && Array.isArray(manifest.questions)) {
                    const loadedQuestions = await Promise.all(manifest.questions.map((q) => loadQuestionFromManifest(moduleId, q)));
                    questions = loadedQuestions;
                    questionTexts = loadedQuestions.map((q, i) => q.problem?.text || `Question ${i + 1}`);
                    currentQuestionIndex = 0;
                    updateQuestionNavigation();
                    loadHomework(loadedQuestions[0], 0);
                    return loadedQuestions[0];
                }
                const questionData = await loadQuestionFromManifest(moduleId, manifest);
                questions = [questionData];
                questionTexts = [questionData.problem?.text || 'Question 1'];
                currentQuestionIndex = 0;
                updateQuestionNavigation();
                loadHomework(questionData, 0);
                return questionData;
            } catch (error) {
                console.error('❌ [loadModuleFromApi] Error loading module:', error);
                return null;
            }
        }
        
        // Resolve asset URL: if already absolute (http/https), use as-is; else relative to module
        function resolveAssetUrl(moduleId, pathOrUrl) {
            if (!pathOrUrl) return null;
            const s = String(pathOrUrl).trim();
            if (/^https?:\/\//i.test(s)) return s;
            return `modules/${moduleId}/${s}`;
        }

        // Helper function to load a single question from manifest data
        async function loadQuestionFromManifest(moduleId, questionData) {
            const questionTitle = questionData.problem?.title || 'Unknown Question';
            console.log(`📖 [loadQuestionFromManifest] Loading question: "${questionTitle}"`);
            
            // Load problem visualization if available
            let problemVisualization = null;
            if (questionData.problem.visualization) {
                try {
                    const vizUrl = resolveAssetUrl(moduleId, questionData.problem.visualization);
                    const isImage = /\.(png|jpg|jpeg|webp)(\?|$)/i.test(questionData.problem.visualization || '');
                    console.log(`   🖼️  Loading visualization from: ${vizUrl} (${isImage ? 'image' : 'svg'})`);
                    if (isImage) {
                        problemVisualization = `<div class="problem-viz-image-wrap"><img src="${vizUrl}" alt="Problem diagram" class="problem-viz-image" loading="lazy" decoding="async" /></div>`;
                        console.log(`   ✅ Using image visualization for "${questionTitle}"`);
                    } else {
                        const cacheBuster = vizUrl.includes('?') ? '&_t=' + Date.now() : '?_t=' + Date.now();
                        const vizResponse = await fetch(`${vizUrl}${cacheBuster}`);
                        if (vizResponse.ok) {
                            const svg = await vizResponse.text();
                            problemVisualization = `<div class="svg-container">${svg}</div>`;
                            console.log(`   ✅ Loaded SVG visualization (${svg.length} chars) for "${questionTitle}"`);
                        } else {
                            console.error(`   ❌ Failed to load visualization: ${vizResponse.status}`);
                        }
                    }
                } catch (e) {
                    console.error(`   ❌ Error loading visualization for "${questionTitle}":`, e);
                }
            } else {
                console.log(`   ⚠️  No visualization path in manifest for "${questionTitle}"`);
            }
            
            // Convert manifest format to homework data format (steps may be missing from API manifest)
            const stepsList = Array.isArray(questionData.steps) ? questionData.steps : [];
            const homeworkData = {
                id: moduleId,
                problem: {
                    ...questionData.problem,
                    visualization: problemVisualization
                },
                steps: await Promise.all(stepsList.map(async (step) => {
                        const stepData = {
                        explanation: step.explanation,
                        inputLabel: step.inputLabel,
                        inputPlaceholder: step.inputPlaceholder,
                        correctAnswer: step.correctAnswer,
                        audioExplanation: step.audioExplanation,
                        visualizationType: step.visualizationType,
                            visualization: null,
                        visualizationImageUrl: null
                        };
                        
                        // Load interactive component HTML (or image if manifest points component at a PNG)
                        if (step.component) {
                            const compUrl = resolveAssetUrl(moduleId, step.component);
                            const componentIsImage = /\.(png|jpg|jpeg|webp)(\?|$)/i.test(step.component || '');
                            if (componentIsImage) {
                                stepData.visualizationImageUrl = compUrl;
                                stepData.visualization = `<div class="problem-viz-image-wrap"><img src="${compUrl}" alt="Diagram" class="problem-viz-image" loading="lazy" decoding="async" /></div>`;
                                console.log(`✅ Using component as image for step ${step.id}`);
                            } else {
                                try {
                                    const cacheBuster = compUrl.includes('?') ? '&_t=' + Date.now() : '?_t=' + Date.now();
                                    const compResponse = await fetch(`${compUrl}${cacheBuster}`);
                                    if (compResponse.ok) {
                                        const contentType = (compResponse.headers.get('content-type') || '').toLowerCase();
                                        if (contentType.startsWith('image/')) {
                                            stepData.visualizationImageUrl = compUrl;
                                            stepData.visualization = `<div class="problem-viz-image-wrap"><img src="${compUrl}" alt="Diagram" class="problem-viz-image" loading="lazy" decoding="async" /></div>`;
                                            console.log(`✅ Component URL returned image; using img for step ${step.id}`);
                                        } else {
                                            const text = await compResponse.text();
                                            if (looksLikeBinaryContent(text)) {
                                                stepData.visualizationImageUrl = compUrl;
                                                stepData.visualization = `<div class="problem-viz-image-wrap"><img src="${compUrl}" alt="Diagram" class="problem-viz-image" loading="lazy" decoding="async" /></div>`;
                                                console.log(`✅ Component response was binary (PNG); using img for step ${step.id}`);
                                            } else {
                                                stepData.visualization = text;
                                                console.log(`✅ Loaded component for step ${step.id}`);
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.error(`❌ Failed to load component: ${step.component}`, e);
                                }
                            }
                        }
                        
                        // Load visual (image or SVG)
                        if (step.visual) {
                            const visualUrl = resolveAssetUrl(moduleId, step.visual);
                            const isImageByExt = /\.(png|jpg|jpeg|webp)(\?|$)/i.test(step.visual || '');
                            if (isImageByExt) {
                                stepData.visualizationImageUrl = visualUrl;
                                stepData.visualization = `<div class="problem-viz-image-wrap"><img src="${visualUrl}" alt="Diagram" class="problem-viz-image" loading="lazy" decoding="async" /></div>`;
                                console.log(`✅ Using image for step ${step.id}`);
                            } else {
                                try {
                                    const cacheBuster = visualUrl.includes('?') ? '&_t=' + Date.now() : '?_t=' + Date.now();
                                    const visualResponse = await fetch(`${visualUrl}${cacheBuster}`);
                                    if (visualResponse.ok) {
                                        const contentType = (visualResponse.headers.get('content-type') || '').toLowerCase();
                                        if (contentType.startsWith('image/')) {
                                            stepData.visualizationImageUrl = visualUrl;
                                            stepData.visualization = `<div class="problem-viz-image-wrap"><img src="${visualUrl}" alt="Diagram" class="problem-viz-image" loading="lazy" decoding="async" /></div>`;
                                            console.log(`✅ Visual URL returned image; using img for step ${step.id}`);
                                        } else {
                                            const svg = await visualResponse.text();
                                            if (looksLikeBinaryContent(svg)) {
                                                stepData.visualizationImageUrl = visualUrl;
                                                stepData.visualization = `<div class="problem-viz-image-wrap"><img src="${visualUrl}" alt="Diagram" class="problem-viz-image" loading="lazy" decoding="async" /></div>`;
                                                console.log(`✅ Visual response was binary (PNG); using img for step ${step.id}`);
                                            } else {
                                                stepData.visualization = `<div class="svg-container">${svg}</div>`;
                                                console.log(`✅ Loaded SVG for step ${step.id}`);
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.error(`❌ Failed to load visual: ${step.visual}`, e);
                                }
                            }
                        }
                        
                        // Embed pre-generated audio directly
                        if (step.audio) {
                            stepData.audioPath = resolveAssetUrl(moduleId, step.audio) || `modules/${moduleId}/${step.audio}`;
                            // Create embedded audio HTML
                            stepData.embeddedAudio = `<audio preload="auto" src="${stepData.audioPath}"></audio>`;
                        }
                        
                        // Add modulePrompt and moduleImage for compatibility
                        if (step.visualizationType === 'interactive') {
                            stepData.modulePrompt = ''; // Already generated
                        } else if (step.visualizationType === 'image') {
                            stepData.moduleImage = ''; // Already generated
                        }
                        
                        return stepData;
                    }))
                };
                
                console.log(`✅ [loadQuestionFromManifest] All steps loaded, returning homeworkData`);
                return homeworkData;
        }

        // API call to get homework steps from Gemini (DEPRECATED - use loadModuleFromDisk instead)
        async function fetchHomeworkSteps(problemText, problemImage = null) {
            const geminiApiKeyMeta = document.querySelector('meta[name="gemini-api-key"]');
            const GEMINI_API_KEY = geminiApiKeyMeta ? geminiApiKeyMeta.getAttribute('content') : '';
            
            if (!GEMINI_API_KEY) {
                console.error('Gemini API key not found');
                return null;
            }

            const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent';

            const prompt = `You are an expert educational content creator that breaks down homework problems into intuitive, interactive learning steps. 
Given this homework problem: "${problemText}"

Return a JSON object with this exact structure:
{
  "problem": {
    "title": "Problem title",
    "text": "Full problem description",
    "image": null or image URL if provided
  },
  "steps": [
    {
      "explanation": "Brief explanation of this step. For mathematical formulas, use LaTeX notation with dollar signs for inline math (e.g., $F_y = m_B g \\cos(\\theta)$) or double dollar signs for display math (e.g., $$F_x = m_B g \\sin(\\theta)$$). Use subscripts like $m_B$ for 'mass of block B', superscripts, fractions, and other mathematical notation as needed.",
      "inputLabel": "Question or prompt for user input",
      "inputPlaceholder": "Placeholder text for input field",
      "visualization": "HTML content for interactive visualization (can include math, diagrams, etc.)",
      "correctAnswer": "The correct answer for this step (can be a number, equation, or text). IMPORTANT: Provide multiple acceptable formats separated by '|' (pipe). For MATH: Include variations like '2x3', '2*3', '(2)(3)', '=6', '6', 'w=6', 'w = 6', etc. For TEXT/WORDS: Include common misspellings, alternative spellings, synonyms, and variations. Examples: 'mitochondria|mitochondrion|mitochondrial', 'photosynthesis|photosyntesis|fotosynthesis', 'nucleus|nucleous|nuclei'. Include plural/singular forms, common typos (1-2 character differences), and alternative word orders for phrases. Example: '6|2x3|2*3|(2)(3)|=6|w=6|w = 6' or 'mitochondria|mitochondrion|mitochondrial|mitocondria'",
      "audioExplanation": "A clear explanation (3-5 sentences) written in second person (using 'you') describing how the visualization helps you understand this step and the concept. At the end, add 1-2 sentences explaining what the visualization is, what it means, and how it specifically helps you understand the current step. This will be converted to speech.",
      "visualizationType": "interactive" or "image" - CHOOSE CAREFULLY based on the rules below,
      "modulePrompt": "If visualizationType is 'interactive': A VERY detailed, explicit prompt describing exactly what the interactive module should be, what it should visualize, what controls it should have (sliders, buttons, knobs, etc.), how it should update in real-time, and how it should help the student understand this step. Be specific about: what values can be adjusted, what visual elements should appear, how they should respond to changes, what calculations should be shown, and what the student should learn from manipulating it. If visualizationType is 'image': null",
      "moduleImage": "If visualizationType is 'image': A VERY detailed, specific description of ONLY the visual diagram that should be generated. Include: exactly what should be shown (structures, shapes, colors, labels like A/B/C pointing to structures, arrows, layout, style). CRITICAL: Describe ONLY the diagram itself - NO questions, NO instructions, NO titles, NO text asking students to do anything, NO answers, NO solutions, NO final answers, NO numerical values that are solutions, NO text boxes with answers. The diagram should be a pure visual representation that helps students understand the problem setup, NOT the solution. Just describe what visual elements should appear in the diagram (shapes, labels for variables like 'w' or 'l', arrows, dimensions, etc.) - nothing else. If visualizationType is 'interactive': null"
    }
  ]
}

CRITICAL: visualizationType Selection Rules

You MUST choose "image" for:
- Set problems (Venn diagrams, set intersections, unions, complements)
- Visualizing relationships between groups or categories
- Static diagrams that show structure or organization
- Problems that need a single visual snapshot to understand the concept
- Geometry problems where you need to see the shape/configuration (unless it needs manipulation)
- Flowcharts, organizational charts, or hierarchical structures
- Visual representations of data structures or concepts that don't change
- Biology diagrams (cell structures, organelles, anatomical diagrams, biological processes)
- Scientific diagrams showing physical structures, parts, or components
- Identification problems where students need to see and label structures
- Any step that asks "what is structure X?" or "identify structure Y" - these need visual diagrams

You MUST choose "interactive" for:
- Formulas and equations (algebra, calculus, physics formulas)
- Mathematical relationships that change when parameters are adjusted
- Step-by-step solving processes where you can see intermediate steps
- Problems where understanding HOW something works requires manipulation
- Real-time calculations that show cause and effect
- Exploring relationships between variables (e.g., "what happens if I change X?")
- Visualizing mathematical concepts through manipulation (sliders for coefficients, seeing graphs update)
- Understanding why a formula works by seeing it in action
- Problems where the student needs to explore and experiment

Examples:
- "Find the intersection of sets A and B" → "image" (Venn diagram showing sets)
- "What is structure A? (oval-shaped organelle with internal folds)" → "image" (detailed diagram of mitochondrion with cristae visible)
- "Identify the cell structures labeled A, B, C" → "image" (labeled cell diagram)
- "Solve for x: 2x + 3 = 11" → "interactive" (sliders to adjust coefficients, see equation balance)
- "What is the area of a rectangle?" → "interactive" (adjust width/height sliders, see area update)
- "Draw a Venn diagram for these sets" → "image" (static diagram)
- "Explain why we subtract in this step" → "interactive" (visualize the subtraction process with manipulable elements)
- "Show the relationship between force, mass, and acceleration" → "interactive" (F=ma with sliders)

Generate as many steps as needed to solve the problem. Each step should have:
- A clear explanation (use LaTeX notation with dollar signs for inline math like $F_y = m_B g \\cos(\\theta)$ or double dollar signs for display math. Use proper subscripts, superscripts, and mathematical notation)
- A user input prompt/question
- A correctAnswer field with the expected answer (for validation). CRITICAL: Include multiple acceptable formats separated by '|' (pipe). Generate as many variations as possible:
  * For MATH/NUMBERS: Different operators (*, x, ×, ( )( )), with/without equals (=6, 6, w=6), with/without spaces (2x3, 2 x 3), with/without parentheses ((2)(3), 2(3)), different variable formats (w=6, w= 6), leading/trailing equals (=6, = 6)
  * For TEXT/WORDS: Include common misspellings (1-2 character differences), alternative spellings, plural/singular forms, synonyms, and common typos. Examples: 'mitochondria|mitochondrion|mitochondrial|mitocondria', 'photosynthesis|photosyntesis|fotosynthesis', 'nucleus|nucleous|nuclei', 'cell membrane|cell membrain|plasma membrane'
  * For PHRASES: Include word order variations, with/without articles, and common phrasing alternatives
  Example for "6": "6|2x3|2*3|(2)(3)|=6|w=6|w = 6|2 x 3|2 * 3|(2)(3)|= 6"
  Example for "mitochondria": "mitochondria|mitochondrion|mitochondrial|mitocondria|mitochondira"
- An audioExplanation (3-5 sentences) written in second person ("you") that:
  * First 2-3 sentences: Explain how the visualization helps you understand this step and the underlying concept
  * Last 1-2 sentences: Explain what the visualization is, what it means, and how it specifically helps you understand the current step
  * Use "you" and "your" instead of "student" or "the student"
- A visualizationType: Choose "interactive" or "image" based on the CRITICAL rules above. Think carefully about whether the step benefits from manipulation (interactive) or just needs a visual reference (image).
- A modulePrompt: ONLY if visualizationType is "interactive". This must be EXTREMELY detailed and explicit. Include:
  * Exactly what interactive elements should be present (sliders, buttons, input fields, etc.)
  * What each control should adjust (specific variables, parameters, values)
  * How the visualization should update in real-time when controls are changed
  * What visual elements should be displayed (graphs, shapes, equations, diagrams)
  * What calculations or formulas should be shown and updated
  * How the module helps the student understand the concept through exploration
  * Be specific about ranges, labels, colors, and behavior
- A moduleImage: ONLY if visualizationType is "image". This must be EXTREMELY detailed. Include:
  * Exactly what should be shown (shapes, labels, arrows, colors)
  * Specific layout and positioning
  * All labels, annotations that should appear (ONLY variable labels like 'w', 'l', 'x', 'y' or structure labels like A, B, C - NO question text, NO answers, NO solutions)
  * Colors, styles, and visual hierarchy
  * Mathematical notation for variables and formulas (like 2w+3 for length) - but NOT the solved values
  * Any arrows, connections, or relationships to highlight
  * CRITICAL: Describe ONLY the visual diagram itself - DO NOT include:
    - Questions or question text
    - Instructions or titles
    - Answers or solutions (NO final answers, NO solved values, NO "Final Dimensions", NO "Answer:", etc.)
    - Text boxes with answers
    - Any text that reveals the solution to the problem
  * The diagram should show the PROBLEM SETUP (variables, relationships, what's given) - NOT the solution
  * Describe what structures are visible, their colors, shapes, positions, and variable labels - nothing else

Return ONLY valid JSON, no markdown formatting.

CRITICAL JSON FORMATTING REQUIREMENTS:
- All backslashes in string values MUST be escaped as \\ (double backslash)
- LaTeX notation like \\cos, \\theta, \\alpha must use double backslashes: \\\\cos, \\\\theta, \\\\alpha
- All quotes within string values must be escaped as \\"
- Newlines in strings must be escaped as \\n
- Ensure all special characters are properly escaped
- The JSON must be valid and parseable by JSON.parse()
- Test your JSON output to ensure it's valid before returning it`;

            try {
                console.log('🔵 [fetchHomeworkSteps] Starting API call...');
                console.log('🔵 API URL:', GEMINI_API_URL);
                console.log('🔵 API Key present:', !!GEMINI_API_KEY, 'Length:', GEMINI_API_KEY?.length || 0);
                console.log('🔵 Prompt length:', prompt.length, 'characters');
                
                const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: prompt }]
                        }]
                    })
                });

                console.log('🔵 Response status:', response.status, response.ok);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('❌ API Error Response:', errorText);
                    throw new Error(`API error: ${response.status} - ${errorText.substring(0, 200)}`);
                }

                const data = await response.json();
                console.log('🔵 API Response received:', {
                    hasCandidates: !!data.candidates,
                    candidatesLength: data.candidates?.length || 0,
                    hasError: !!data.error
                });
                
                if (data.error) {
                    console.error('❌ API returned error:', data.error);
                    throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
                }
                
                if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                    const responseText = data.candidates[0].content.parts[0].text;
                    console.log('🔵 Response text length:', responseText.length);
                    console.log('🔵 First 200 chars:', responseText.substring(0, 200));
                    
                    // Extract JSON from response (handle markdown code blocks if present)
                    let jsonText = responseText.trim();
                    
                    // Remove markdown code blocks
                    if (jsonText.startsWith('```')) {
                        // Find the first ``` and last ```
                        const firstBlock = jsonText.indexOf('```');
                        const lastBlock = jsonText.lastIndexOf('```');
                        if (firstBlock !== -1 && lastBlock !== -1 && lastBlock > firstBlock) {
                            jsonText = jsonText.substring(firstBlock + 3, lastBlock);
                            // Remove language identifier if present (e.g., ```json)
                            jsonText = jsonText.replace(/^json\s*\n?/i, '').trim();
                        }
                    }
                    
                    // Try to extract JSON object if wrapped in other text
                    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        jsonText = jsonMatch[0];
                    }
                    
                    // Log the JSON text for debugging (first 500 chars)
                    console.log('🔵 JSON text to parse (first 500 chars):', jsonText.substring(0, 500));
                    console.log('🔵 JSON text length:', jsonText.length);
                    
                    // Try to fix common JSON issues before parsing
                    try {
                        // The JSON might have unescaped backslashes in LaTeX notation
                        // We need to be careful - we can't just replace all backslashes
                        // Instead, we'll try parsing and if it fails, attempt to fix it
                        console.log('🔵 Attempting to parse JSON...');
                        const homeworkData = JSON.parse(jsonText);
                        console.log('✅ Successfully parsed homework data:', {
                            hasProblem: !!homeworkData.problem,
                            stepsCount: homeworkData.steps?.length || 0
                        });
                        return homeworkData;
                    } catch (parseError) {
                        console.warn('⚠️ Initial JSON parse failed, attempting to fix escaped characters...');
                        console.warn('Parse error:', parseError.message);
                        console.warn('Error position:', parseError.message.match(/position (\d+)/)?.[1]);
                        
                        // Try to fix common issues
                        // Find the problematic position if mentioned in error
                        const positionMatch = parseError.message.match(/position (\d+)/);
                        if (positionMatch) {
                            const errorPos = parseInt(positionMatch[1]);
                            console.warn('Problematic character at position', errorPos, ':', 
                                jsonText.substring(Math.max(0, errorPos - 20), Math.min(jsonText.length, errorPos + 20)));
                        }
                        
                        // Attempt to fix escaped characters in JSON strings
                        // The issue is likely unescaped backslashes in LaTeX notation within string values
                        // In JSON, backslashes must be escaped as \\, so \cos becomes \\cos
                        let fixedJson = jsonText;
                        
                        // Strategy: Escape backslashes that aren't part of valid JSON escape sequences
                        // Valid JSON escape sequences: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
                        // Invalid sequences (like \c, \s, \theta, \cos) need to be escaped as \\c, \\s, \\theta, \\cos
                        
                        // Process the JSON string more carefully:
                        // 1. Don't touch already escaped sequences (\\, \", etc.)
                        // 2. Escape backslashes before letters/characters that aren't valid escapes
                        // 3. Be careful with string boundaries
                        
                        // Use a state machine approach: process character by character within string values
                        let result = '';
                        let inString = false;
                        let escapeNext = false;
                        
                        for (let i = 0; i < fixedJson.length; i++) {
                            const char = fixedJson[i];
                            const nextChar = fixedJson[i + 1];
                            
                            if (escapeNext) {
                                // We're after a backslash
                                // Check if this is a valid escape sequence
                                const validEscapes = ['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'];
                                if (validEscapes.includes(char) || (char === 'u' && /[0-9a-fA-F]/.test(nextChar))) {
                                    // Valid escape, keep as is
                                    result += '\\' + char;
                                } else {
                                    // Invalid escape (like \c, \s, \theta), escape the backslash
                                    result += '\\\\' + char;
                                }
                                escapeNext = false;
                            } else if (char === '\\' && inString) {
                                // Potential escape sequence
                                escapeNext = true;
                            } else {
                                if (char === '"' && (i === 0 || fixedJson[i - 1] !== '\\' || (i > 1 && fixedJson[i - 2] === '\\'))) {
                                    // Toggle string state (handle escaped quotes)
                                    inString = !inString;
                                }
                                result += char;
                            }
                        }
                        
                        fixedJson = result;
                        
                        // Try parsing again
                        try {
                            const homeworkData = JSON.parse(fixedJson);
                            console.log('✅ Successfully parsed after fixing escaped characters');
                            return homeworkData;
                        } catch (secondError) {
                            console.error('❌ Failed to parse even after fixing:', secondError.message);
                            
                            // Last resort: try using a more lenient approach
                            // Extract just the JSON object structure and try to rebuild it
                            try {
                                // Use eval as last resort (only for trusted API responses)
                                // This is not ideal but may work for malformed JSON from Gemini
                                console.warn('⚠️ Attempting eval as last resort (trusted source only)...');
                                const homeworkData = eval('(' + jsonText + ')');
                                if (homeworkData && typeof homeworkData === 'object') {
                                    console.log('✅ Successfully parsed using eval fallback');
                                    return homeworkData;
                                }
                            } catch (evalError) {
                                console.error('❌ Eval also failed:', evalError.message);
                            }
                            
                            // If all else fails, throw the original error
                            throw new Error(`JSON parsing failed: ${parseError.message}. Position: ${positionMatch?.[1] || 'unknown'}. Please check the API response format.`);
                        }
                    }
                } else {
                    console.error('❌ No valid candidates in response:', data);
                    throw new Error('No response from API - invalid response structure');
                }
            } catch (error) {
                console.error('❌ Error fetching homework steps:', error);
                console.error('❌ Error details:', {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                });
                return null;
            }
        }

        // Load homework from API
        // Can accept: 
        // - Single question string: loadHomeworkFromAPI("Question text")
        // - Array of questions: loadHomeworkFromAPI(["Q1", "Q2", "Q3"]) - sets up lazy loading
        // - Single question with addAsNewQuestion flag: loadHomeworkFromAPI("Question", null, true)
        // Load pre-generated module by ID
        async function loadHomeworkFromModule(moduleId, addAsNewQuestion = false) {
            console.log('📂 Loading pre-generated module:', moduleId);
            
            // NO LOADING OVERLAY - this is instant!
            const data = await loadModuleFromDisk(moduleId);
            if (!data) {
                console.error('❌ Failed to load module:', moduleId);
                alert(`Module "${moduleId}" not found. Generate it first with:\n\npython3 generate.py "Your problem" --id ${moduleId}`);
                return;
            }
            
            console.log('✅ Module loaded successfully');
            console.log('📊 Steps with visualizations:', data.steps.filter(s => s.visualization).length, '/', data.steps.length);
            data.steps.forEach((step, i) => {
                console.log(`   Step ${i}: has visualization = ${!!step.visualization}, length = ${step.visualization?.length || 0}`);
            });
            setHomeworkData(data, addAsNewQuestion);
        }
        
        // Make it globally accessible
        window.loadHomeworkFromModule = loadHomeworkFromModule;
        
        // Load multiple modules at once
        async function loadMultipleModules(moduleIds) {
            console.log('📂 [loadMultipleModules] Starting, moduleIds:', moduleIds);
            
            // Clear existing questions
            questions = [];
            questionStates = {};
            currentQuestionIndex = 0;
            
            console.log('📂 [loadMultipleModules] Cleared state, loading modules...');
            
            // Load all modules into the questions array
            for (let i = 0; i < moduleIds.length; i++) {
                console.log(`📂 [loadMultipleModules] Loading module ${i + 1}/${moduleIds.length}: ${moduleIds[i]}`);
                const data = await loadModuleFromDisk(moduleIds[i]);
                if (!data) {
                    console.error('❌ [loadMultipleModules] Failed to load module:', moduleIds[i]);
                    continue;
                }
                console.log(`✅ [loadMultipleModules] Module ${i + 1} loaded:`, moduleIds[i], 'Steps:', data.steps?.length);
                questions.push(data);
            }
            
            console.log(`✅ [loadMultipleModules] Total modules loaded: ${questions.length}`);
            console.log('📊 [loadMultipleModules] Questions array:', questions);
            
            // Update navigation
            console.log('🔄 [loadMultipleModules] Calling updateQuestionNavigation...');
            updateQuestionNavigation();
            
            // Load the first question
            if (questions.length > 0) {
                console.log('📖 [loadMultipleModules] Loading first question...');
                currentQuestionIndex = 0;
                loadHomework(questions[0], 0);  // Pass 0, not null!
            } else {
                console.error('❌ [loadMultipleModules] No questions loaded!');
            }
        }
        
        // Make it globally accessible
        window.loadMultipleModules = loadMultipleModules;
        window.loadModuleFromApi = loadModuleFromApi;

        async function loadHomeworkFromAPI(problemText, problemImage = null, addAsNewQuestion = false) {
            console.log('🟡 loadHomeworkFromAPI CALLED');
            console.log('Problem text:', problemText);
            console.log('Problem image:', problemImage);
            console.log('Add as new question:', addAsNewQuestion);
            
            // If problemText is an array, pre-load all questions upfront
            if (Array.isArray(problemText)) {
                console.log('🟡 Pre-loading', problemText.length, 'questions upfront...');
                showLoadingOverlay();
                setQuestionTexts(problemText);
                questions = problemText.map(() => null);
                await preloadAllQuestions();
                hideLoadingOverlay();
                updateQuestionNavigation();
                if (questions.length > 0 && questions[0] !== null) {
                    loadQuestion(0);
                }
                return;
            }
            
            console.log('🟡 Calling fetchHomeworkSteps...');
            const data = await fetchHomeworkSteps(problemText, problemImage);
            console.log('🟡 fetchHomeworkSteps returned:', !!data);
            
            if (data) {
                console.log('🟡 Data received, steps count:', data.steps?.length || 0);
                if (addAsNewQuestion) {
                    addQuestion(data);
                } else {
                    // Replace current question
                    if (questions.length === 0) {
                        questions.push(data);
                    } else {
                        questions[currentQuestionIndex] = data;
                    }
                    console.log('🟡 Calling loadHomework...');
                    loadHomework(data);
                    console.log('🟡 loadHomework completed');
                }
            } else {
                console.error('❌ Failed to load homework steps');
            }
        }

        // Load multiple questions from API
        async function loadMultipleQuestionsFromAPI(problemTexts, appendToExisting = false) {
            console.log('🟢 Loading multiple questions:', problemTexts.length);
            const loadedQuestions = [];
            
            // Save current question state before loading new ones
            if (questions.length > 0) {
                saveQuestionState(currentQuestionIndex);
            }
            
            for (let i = 0; i < problemTexts.length; i++) {
                const problemText = problemTexts[i];
                console.log(`🟢 Loading question ${i + 1} of ${problemTexts.length}...`);
                const data = await fetchHomeworkSteps(problemText);
                if (data) {
                    loadedQuestions.push(data);
                    console.log(`✅ Question ${i + 1} loaded successfully`);
                } else {
                    console.error(`❌ Failed to load question ${i + 1}`);
                }
            }
            
            if (loadedQuestions.length > 0) {
                // If we already have questions and want to append, add them to existing
                if (questions.length > 0 && appendToExisting) {
                    questions.push(...loadedQuestions);
                    updateQuestionNavigation();
                    // Stay on current question, don't switch
                } else {
                    // Replace all questions with new ones
                    setQuestions(loadedQuestions);
                }
                console.log(`✅ Successfully loaded ${loadedQuestions.length} question(s)`);
            } else {
                console.error('❌ No questions were loaded successfully');
            }
        }

        // Load homework problem and steps
        function loadHomework(data, questionIndex = null) {
            console.log('🟠 loadHomework CALLED');
            console.log('Data:', data);
            console.log('🔵 [loadQuestion] Starting loadQuestion with questionIndex:', questionIndex);
            console.log('🔵 [loadQuestion] Data has', data?.steps?.length || 0, 'steps');
            
            try {
                // Clear all previous content first
                clearPreviousQuestionContent();
                console.log('✅ [loadQuestion] Cleared previous content');
            } catch (e) {
                console.error('❌ [loadQuestion] Error clearing content:', e);
            }
            
            homeworkData = data;
            
            // Save current question state before switching
            if (questionIndex !== null && questionIndex !== currentQuestionIndex) {
                saveQuestionState(currentQuestionIndex);
            }
            
            // Update current question index if provided
            if (questionIndex !== null) {
                currentQuestionIndex = questionIndex;
            }

            // Update problem section
            if (data.problem) {
                document.getElementById('problem-title').textContent = data.problem.title || "Homework Problem";
                const problemTextEl = document.getElementById('problem-text');
                const problemText = data.problem.text || "Problem description will appear here.";
                problemTextEl.innerHTML = ensureHtml(problemText);
                typesetMath([problemTextEl]);
                
                // Handle problem image
                const problemImage = document.getElementById('problem-image');
                if (data.problem.image) {
                    problemImage.src = data.problem.image;
                    problemImage.style.display = 'block';
                } else {
                    problemImage.style.display = 'none';
                }
                
                // Load question visualization from cache OR pre-generated from disk
                const problemVisualizer = document.getElementById('problem-visualizer-content');
                if (problemVisualizer) {
                    console.log('🔍 [loadHomework] Problem visualization check:');
                    console.log('  - Has data.problem:', !!data.problem);
                    console.log('  - Has data.problem.visualization:', !!data.problem?.visualization);
                    console.log('  - Visualization length:', data.problem?.visualization?.length || 0);
                    console.log('  - Current question index:', currentQuestionIndex);
                    
                    // PRIORITY 1: Use pre-loaded visualization from module
                    if (data.problem && data.problem.visualization) {
                        console.log('✅ Loading PRE-GENERATED problem visualization');
                        problemVisualizer.innerHTML = ensureHtml(data.problem.visualization);
                        // Save to cache
                        if (!questionStates[currentQuestionIndex]) {
                            questionStates[currentQuestionIndex] = {};
                        }
                        questionStates[currentQuestionIndex].problemVisualization = data.problem.visualization;
                    }
                    // PRIORITY 2: Check if cached
                    else if (questionStates[currentQuestionIndex]?.problemVisualization) {
                        console.log('✅ Loading cached problem visualization');
                        problemVisualizer.innerHTML = ensureHtml(questionStates[currentQuestionIndex].problemVisualization);
                    }
                    // PRIORITY 3: Generate at runtime (fallback)
                    else {
                        console.log('⚠️ No pre-built problem visualization, generating at runtime');
                        console.log('⚠️ Data object:', data);
                        problemVisualizer.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Loading...</p>';
                        generateQuestionVisualization(data.problem);
                    }
                }
            }

            // Update question navigation
            updateQuestionNavigation();

            // Restore question state if it exists
            try {
                restoreQuestionState(currentQuestionIndex);
                console.log('✅ [loadQuestion] Restored question state');
            } catch (e) {
                console.error('❌ [loadQuestion] Error restoring state:', e);
            }

            // Render steps
            try {
                console.log('🟠 [loadQuestion] About to call renderSteps with', (data.steps || []).length, 'steps');
                renderSteps(data.steps || []);
                console.log('✅ [loadQuestion] renderSteps completed successfully');
            } catch (e) {
                console.error('❌ [loadQuestion] Error in renderSteps:', e);
            }
            
            // Hide loading overlay after everything is rendered
            hideLoadingOverlay();
        }
        
        // Clear all previous question content
        function clearPreviousQuestionContent() {
            console.log('🧹 Clearing previous question content...');
            
            // Clear steps list completely
            const stepsList = document.getElementById('steps-list');
            if (stepsList) {
                stepsList.innerHTML = '<p style="color: var(--text-secondary); padding: 24px; text-align: center;">Loading steps...</p>';
            }
            
            // Clear problem visualizer completely
            const problemVisualizer = document.getElementById('problem-visualizer-content');
            if (problemVisualizer) {
                problemVisualizer.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Loading...</p>';
            }
            
            // Clear all step visualizations (remove all step cards)
            document.querySelectorAll('.step-card').forEach(card => {
                card.remove();
            });
            
            // Clear all step visualization containers
            document.querySelectorAll('.step-visualization').forEach(viz => {
                viz.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Loading...</p>';
            });
            
            // Reset step states
            stepStates.attempts = {};
            stepStates.completed = {};
            stepStates.revealed = {};
            
            // Clear any audio elements
            document.querySelectorAll('audio').forEach(audio => {
                audio.pause();
                audio.src = '';
            });
            
            // Clear audio elements map for this question
            audioElements.clear();
            
            console.log('✅ Previous content cleared');
        }

        // Save state for current question
        function saveQuestionState(questionIndex) {
            if (!questionStates[questionIndex]) {
                questionStates[questionIndex] = {};
            }
            
            // Save visualization HTML to avoid regenerating
            const savedState = questionStates[questionIndex];
            savedState.visualizations = {};
            
            // Save each step's visualization HTML
            if (homeworkData && homeworkData.steps) {
                homeworkData.steps.forEach((step, index) => {
                    const vizEl = document.getElementById(`step-visualization-${index}`);
                    if (vizEl && vizEl.innerHTML && !vizEl.innerHTML.includes('Generating') && !vizEl.innerHTML.includes('Loading')) {
                        savedState.visualizations[index] = vizEl.innerHTML;
                    }
                });
            }
            
            // Save step states
            questionStates[questionIndex].stepStates = {
                attempts: { ...stepStates.attempts },
                completed: { ...stepStates.completed },
                revealed: { ...stepStates.revealed }
            };
            
            // Save user inputs
            const inputs = {};
            document.querySelectorAll('.step-input').forEach(input => {
                const stepIdx = parseInt(input.getAttribute('data-step-index'));
                if (input.value) {
                    inputs[stepIdx] = input.value;
                }
            });
            questionStates[questionIndex].inputs = inputs;
        }

        // Restore state for a question
        function restoreQuestionState(questionIndex) {
            if (questionStates[questionIndex]) {
                const savedState = questionStates[questionIndex];
                
                // Restore step states
                if (savedState.stepStates) {
                    stepStates.attempts = { ...savedState.stepStates.attempts };
                    stepStates.completed = { ...savedState.stepStates.completed };
                    stepStates.revealed = { ...savedState.stepStates.revealed };
                } else {
                    // Reset to default state if no saved step states
                    stepStates.attempts = {};
                    stepStates.completed = {};
                    stepStates.revealed = {};
                }
                
                // Restore inputs and unlock completed steps after steps are rendered
                setTimeout(() => {
                    if (savedState.inputs) {
                        Object.keys(savedState.inputs).forEach(stepIdx => {
                            const input = document.getElementById(`step-input-${stepIdx}`);
                            if (input) {
                                input.value = savedState.inputs[stepIdx];
                            }
                        });
                    }
                    
                    // Unlock all completed steps in the UI
                    Object.keys(stepStates.completed).forEach(stepIdx => {
                        if (stepStates.completed[stepIdx]) {
                            const stepCard = document.getElementById(`step-${stepIdx}`);
                            if (stepCard) {
                                stepCard.classList.remove('locked');
                                const input = document.getElementById(`step-input-${stepIdx}`);
                                const submit = document.getElementById(`step-submit-${stepIdx}`);
                                if (input) input.disabled = false;
                                if (submit) submit.disabled = false;
                            }
                            
                            // Also unlock the next step if this one is completed
                            const nextStepIdx = parseInt(stepIdx) + 1;
                            const nextStepCard = document.getElementById(`step-${nextStepIdx}`);
                            if (nextStepCard) {
                                nextStepCard.classList.remove('locked');
                                const nextInput = document.getElementById(`step-input-${nextStepIdx}`);
                                const nextSubmit = document.getElementById(`step-submit-${nextStepIdx}`);
                                if (nextInput) nextInput.disabled = false;
                                if (nextSubmit) nextSubmit.disabled = false;
                            }
                        }
                    });
                }, 100);
            } else {
                // Reset to default state for new question
                stepStates.attempts = {};
                stepStates.completed = {};
                stepStates.revealed = {};
            }
        }

        // Update question navigation UI
        function updateQuestionNavigation() {
            const totalQuestions = questions.length || questionTexts.length || 1;
            const currentQuestion = currentQuestionIndex + 1;
            const questionNav = document.querySelector('.question-nav');
            const questionSelect = document.getElementById('question-select');
            
            console.log('🔄 [updateQuestionNavigation] Total questions:', totalQuestions, 'Current:', currentQuestion);
            
            if (!questionSelect) {
                console.error('Question select element not found');
                return;
            }
            
            if (totalQuestions > 1 || totalQuestions > 0) {
                questionNav.style.display = 'flex';
                
                // Enable the dropdown
                questionSelect.disabled = false;
                
                // Update dropdown options
                questionSelect.innerHTML = '';
                for (let i = 0; i < totalQuestions; i++) {
                    const option = document.createElement('option');
                    option.value = i;
                    const isLoaded = questions[i] !== null && questions[i] !== undefined;
                    option.textContent = `Question ${i + 1}${isLoaded ? ' ✓' : ''}`;
                    if (i === currentQuestionIndex) {
                        option.selected = true;
                    }
                    questionSelect.appendChild(option);
                }
                
                // Remove old event listeners and add new one
                const oldHandler = questionSelect.onchange;
                questionSelect.onchange = null;
                
                // Add fresh event listener
                questionSelect.addEventListener('change', function(e) {
                    const selectedIndex = parseInt(e.target.value);
                    console.log('🔄 Dropdown change event - selected index:', selectedIndex);
                    if (!isNaN(selectedIndex)) {
                        selectQuestion(selectedIndex);
                    }
                }, { once: false, passive: true });
                
                // Also set inline handler as backup
                questionSelect.onchange = function() {
                    const selectedIndex = parseInt(this.value);
                    console.log('🔄 Dropdown inline handler - selected index:', selectedIndex);
                    if (!isNaN(selectedIndex)) {
                        selectQuestion(selectedIndex);
                    }
                };
                
                // Update counter
                const questionCounter = document.getElementById('question-counter');
                if (questionCounter) {
                    questionCounter.textContent = `${currentQuestion} of ${totalQuestions}`;
                    console.log('✅ [updateQuestionNavigation] Updated counter to:', questionCounter.textContent);
                }
                
                document.getElementById('prev-question-btn').disabled = currentQuestionIndex === 0;
                document.getElementById('next-question-btn').disabled = currentQuestionIndex >= totalQuestions - 1;
            } else {
                // Show navigation even with one question, but disable dropdown if only one
                questionNav.style.display = 'flex';
                questionSelect.innerHTML = '<option value="0">Question 1</option>';
                questionSelect.disabled = totalQuestions <= 1;
                questionSelect.onchange = function() {
                    const selectedIndex = parseInt(this.value);
                    console.log('Dropdown changed to question:', selectedIndex);
                    selectQuestion(selectedIndex);
                };
                document.getElementById('prev-question-btn').disabled = true;
                document.getElementById('next-question-btn').disabled = true;
            }
        }
        
        // Event handler for question select dropdown
        function handleQuestionSelect(event) {
            const selectedIndex = parseInt(event.target.value);
            console.log('Question select handler triggered, index:', selectedIndex);
            selectQuestion(selectedIndex);
        }

        // Select question from dropdown
        async function selectQuestion(index) {
            console.log('selectQuestion called with index:', index);
            const totalQuestions = questions.length || questionTexts.length;
            console.log('Total questions:', totalQuestions);
            console.log('currentQuestionIndex:', currentQuestionIndex);
            
            if (index >= 0 && index < totalQuestions) {
                if (index !== currentQuestionIndex) {
                    saveQuestionState(currentQuestionIndex);
                    currentQuestionIndex = index;
                    // Instant switch - all questions are pre-loaded
                    if (questions[index] !== null) {
                        loadQuestion(index);
                    } else {
                        console.warn(`Question ${index} not loaded yet - this shouldn't happen with eager loading`);
                    }
                } else {
                    console.log('Question already selected, no change needed');
                }
            } else {
                console.error('Invalid question index:', index, 'out of range [0,', totalQuestions, ')');
            }
        }
        
        // Make selectQuestion available globally for inline handlers
        window.selectQuestion = selectQuestion;
        
        // Pre-load all questions in parallel (eager loading)
        async function preloadAllQuestions() {
            if (questionTexts.length === 0) {
                console.log('No questions to pre-load');
                return;
            }
            
            console.log(`🟢 Pre-loading ${questionTexts.length} questions in parallel...`);
            updateLoadingProgress(0, questionTexts.length);
            
            // Create promises for all questions
            const loadPromises = questionTexts.map(async (problemText, index) => {
                try {
                    console.log(`🟢 Generating question ${index + 1}/${questionTexts.length}...`);
                    const data = await fetchHomeworkSteps(problemText);
                    if (data) {
                        questions[index] = data;
                        console.log(`✅ Question ${index + 1} loaded successfully`);
                        
                        // Pre-generate all visualizations for this question
                        console.log(`🖼️ Pre-generating visualizations for question ${index + 1}...`);
                        await pregenerateQuestionVisualizations(index, data);
                        
                        updateLoadingProgress(index + 1, questionTexts.length);
                        return { index, success: true };
                    } else {
                        console.error(`❌ Failed to load question ${index + 1}`);
                        updateLoadingProgress(index + 1, questionTexts.length);
                        return { index, success: false };
                    }
                } catch (error) {
                    console.error(`❌ Error loading question ${index + 1}:`, error);
                    updateLoadingProgress(index + 1, questionTexts.length);
                    return { index, success: false };
                }
            });
            
            // Wait for all questions to load
            await Promise.all(loadPromises);
            console.log(`✅ All ${questionTexts.length} questions pre-loaded with visualizations`);
        }
        
        // Pre-generate all visualizations for a question (problem + all steps)
        async function pregenerateQuestionVisualizations(questionIndex, questionData) {
            // Initialize question state if needed
            if (!questionStates[questionIndex]) {
                questionStates[questionIndex] = {};
            }
            if (!questionStates[questionIndex].visualizations) {
                questionStates[questionIndex].visualizations = {};
            }
            
            // Create temporary container for problem visualization
            const tempProblemContainer = document.createElement('div');
            tempProblemContainer.id = 'problem-visualizer-content';
            tempProblemContainer.style.display = 'none';
            document.body.appendChild(tempProblemContainer);
            
            // Pre-generate problem visualization
            if (questionData.problem) {
                try {
                    console.log(`  🖼️ Pre-generating problem visualization for question ${questionIndex + 1}...`);
                    await generateQuestionVisualization(questionData.problem, questionIndex);
                    // The function already saves to cache, but we can also get it from the temp container
                    const problemVizHTML = tempProblemContainer.innerHTML;
                    if (problemVizHTML && !problemVizHTML.includes('Generating')) {
                        questionStates[questionIndex].problemVisualization = problemVizHTML;
                        console.log(`  ✅ Problem visualization cached for question ${questionIndex + 1}`);
                    }
                } catch (error) {
                    console.error(`  ❌ Error generating problem visualization:`, error);
                }
            }
            
            // Pre-generate visualizations for all steps
            if (questionData.steps && questionData.steps.length > 0) {
                for (let stepIndex = 0; stepIndex < questionData.steps.length; stepIndex++) {
                    const step = questionData.steps[stepIndex];
                    
                    // Create temporary container for step visualization
                    const tempStepContainer = document.createElement('div');
                    tempStepContainer.id = `step-visualization-${stepIndex}`;
                    tempStepContainer.style.display = 'none';
                    document.body.appendChild(tempStepContainer);
                    
                    try {
                        const vizType = step.visualizationType || 'interactive';
                        
                        if (vizType === 'interactive') {
                            console.log(`  🖼️ Pre-generating interactive module for step ${stepIndex + 1} of question ${questionIndex + 1}...`);
                            await generateInteractiveModule(stepIndex, step, questionData.problem, questionIndex);
                            // The function already saves to cache, but we can also get it from the temp container
                            const stepVizHTML = tempStepContainer.innerHTML;
                            if (stepVizHTML && !stepVizHTML.includes('Generating') && !stepVizHTML.includes('Error')) {
                                if (!questionStates[questionIndex].visualizations) {
                                    questionStates[questionIndex].visualizations = {};
                                }
                                questionStates[questionIndex].visualizations[stepIndex] = stepVizHTML;
                            }
                            console.log(`  ✅ Interactive module cached for step ${stepIndex + 1}`);
                        } else if (step.moduleImage) {
                            console.log(`  🖼️ Pre-generating image for step ${stepIndex + 1} of question ${questionIndex + 1}...`);
                            await generateStepImage(stepIndex, step.moduleImage, tempStepContainer, questionIndex);
                            // The function already saves to cache, but we can also get it from the temp container
                            const stepVizHTML = tempStepContainer.innerHTML;
                            if (stepVizHTML && !stepVizHTML.includes('Generating') && !stepVizHTML.includes('Error')) {
                                if (!questionStates[questionIndex].visualizations) {
                                    questionStates[questionIndex].visualizations = {};
                                }
                                questionStates[questionIndex].visualizations[stepIndex] = stepVizHTML;
                            }
                            console.log(`  ✅ Image cached for step ${stepIndex + 1}`);
                        }
                    } catch (error) {
                        console.error(`  ❌ Error generating visualization for step ${stepIndex + 1}:`, error);
                    }
                    
                    // Remove temporary container
                    document.body.removeChild(tempStepContainer);
                }
            }
            
            // Remove temporary problem container
            document.body.removeChild(tempProblemContainer);
        }
        
        // Show loading overlay
        function showLoadingOverlay() {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) {
                overlay.classList.remove('hidden');
            }
        }
        
        // Hide loading overlay
        function hideLoadingOverlay() {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) {
                overlay.classList.add('hidden');
            }
        }
        
        // Update loading progress text
        function updateLoadingProgress(loaded, total) {
            const progressEl = document.getElementById('loading-progress');
            if (progressEl) {
                progressEl.textContent = `Preparing ${loaded} of ${total} questions`;
            }
        }

        // Navigate to previous question
        function previousQuestion() {
            const totalQuestions = questions.length || questionTexts.length;
            console.log('⬅️ [previousQuestion] Current:', currentQuestionIndex, 'Total:', totalQuestions);
            if (currentQuestionIndex > 0) {
                saveQuestionState(currentQuestionIndex);
                currentQuestionIndex--;
                loadQuestion(currentQuestionIndex);
                console.log('✅ [previousQuestion] Moved to question', currentQuestionIndex + 1);
            }
        }

        // Navigate to next question
        function nextQuestion() {
            const totalQuestions = questions.length || questionTexts.length;
            console.log('➡️ [nextQuestion] Current:', currentQuestionIndex, 'Total:', totalQuestions);
            if (currentQuestionIndex < totalQuestions - 1) {
                saveQuestionState(currentQuestionIndex);
                currentQuestionIndex++;
                loadQuestion(currentQuestionIndex);
                console.log('✅ [nextQuestion] Moved to question', currentQuestionIndex + 1);
            } else {
                console.log('⚠️ [nextQuestion] Already at last question');
            }
        }
        
        // Make navigation functions available globally
        window.previousQuestion = previousQuestion;
        window.nextQuestion = nextQuestion;

        // Load a specific question by index
        function loadQuestion(index) {
            console.log('========================================');
            console.log(`⭐ loadQuestion CALLED for index: ${index} (Q${index + 1})`);
            console.log('⭐ Question exists:', index >= 0 && index < questions.length && questions[index] !== null);
            if (index >= 0 && index < questions.length && questions[index] !== null) {
                const q = questions[index];
                console.log('⭐ Question title:', q.problem?.title || 'No title');
                console.log('⭐ Question data keys:', Object.keys(q));
                console.log('⭐ Problem keys:', Object.keys(q.problem || {}));
                console.log('⭐ Has problem.visualization:', !!q?.problem?.visualization);
                console.log('⭐ Visualization type:', typeof q?.problem?.visualization);
                console.log('⭐ Visualization length:', q?.problem?.visualization?.length || 0);
                if (q?.problem?.visualization) {
                    console.log('⭐ Visualization preview (first 200 chars):', q.problem.visualization.substring(0, 200));
                }
            }
            console.log('========================================');
            if (index >= 0 && index < questions.length && questions[index] !== null) {
                // Don't clear here - loadHomework will do it
                loadHomework(questions[index], index);
            } else {
                console.warn(`Question ${index} not loaded yet`);
            }
        }

        // Add a question to the questions array
        function addQuestion(questionData) {
            const newIndex = questions.length;
            questions.push(questionData);
            updateQuestionNavigation();
            
            // If this is the first question, load it
            if (questions.length === 1) {
                loadQuestion(0);
            } else {
                // Switch to the newly added question
                currentQuestionIndex = newIndex;
                loadQuestion(newIndex);
            }
        }

        // Set multiple questions at once (for backward compatibility)
        function setQuestions(newQuestions) {
            // Save current question state before replacing
            if (questions.length > 0) {
                saveQuestionState(currentQuestionIndex);
            }
            
            questions = newQuestions;
            currentQuestionIndex = 0;
            
            // Clear question states for new questions
            Object.keys(questionStates).forEach(key => {
                if (parseInt(key) >= newQuestions.length) {
                    delete questionStates[key];
                }
            });
            
            if (questions.length > 0) {
                loadQuestion(0);
            } else {
                updateQuestionNavigation();
            }
        }
        
        // Set question texts for lazy loading
        function setQuestionTexts(texts) {
            questionTexts = texts;
            questions = texts.map(() => null); // Initialize with nulls
            currentQuestionIndex = 0;
            updateQuestionNavigation();
            // Note: Don't load here - caller should call preloadAllQuestions() separately
        }

        // Render steps dynamically
        // Convert markdown-style bold (**text**) to HTML bold
        function processMarkdownBold(text) {
            if (!text) return text;
            // Convert **text** to <strong>text</strong>
            // Match **text** but avoid matching within HTML tags or MathJax delimiters
            // Use a more robust regex that handles multiple bold sections
            return text.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
        }

        function renderSteps(steps) {
            console.log('========================================');
            console.log('🟣 renderSteps CALLED with', steps.length, 'steps');
            console.log('🟣 Current question index:', currentQuestionIndex);
            console.log('========================================');
            const stepsList = document.getElementById('steps-list');
            stepsList.innerHTML = '';

            if (steps.length === 0) {
                stepsList.innerHTML = '<p style="color: var(--text-secondary); padding: 24px; text-align: center;">No steps available yet.</p>';
                return;
            }

            steps.forEach((step, index) => {
                try {
                    // Declare vizType and savedState once at the top of the loop
                    const vizType = step.visualizationType || 'interactive';
                    const savedState = questionStates[currentQuestionIndex];
                    
                    console.log(`🔨 [renderSteps] Building step card ${index}...`);
                    
                    // Check if step should be locked - but STILL RENDER IT
                    const previousStepCompleted = index === 0 || (savedState && savedState.completedSteps && savedState.completedSteps[index - 1]);
                    const isLocked = !previousStepCompleted;
                    
                    const stepCard = document.createElement('div');
                    stepCard.className = 'step-card';
                    stepCard.id = `step-${index}`;
                    
                    // If locked, add locked class (but still render the step)
                    if (isLocked) {
                        stepCard.classList.add('locked');
                    }

                    // Create step header with buttons using innerHTML (simpler approach)
                const stepHeader = document.createElement('div');
                stepHeader.className = 'step-header';
                stepHeader.innerHTML = `
                    <div style="display: flex; align-items: center;">
                        <div class="step-number">${index + 1}</div>
                        <div class="step-title">Step ${index + 1}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="step-microphone-button" id="step-audio-${index}" data-step-index="${index}" title="Listen to explanation">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                            </svg>
                        </button>
                        <button class="step-resources-button" id="step-resources-${index}" data-step-index="${index}" title="Feeling stuck? Get learning resources">Feeling stuck?</button>
                    </div>
                `;
                
                // CRITICAL: Protect buttons from being removed
                setTimeout(() => {
                    const btn = document.getElementById(`step-audio-${index}`);
                    if (!btn || !btn.parentNode) {
                        console.error(`❌ Button ${index} was removed! Re-adding...`);
                        // Re-add if removed
                        const header = document.querySelector(`#step-${index} .step-header`);
                        if (header && header.children.length < 2) {
                            const buttonDiv = document.createElement('div');
                            buttonDiv.style.cssText = 'display: flex; align-items: center; gap: 8px;';
                            buttonDiv.innerHTML = `
                                <button class="step-microphone-button" id="step-audio-${index}" data-step-index="${index}" title="Listen to explanation">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                                    </svg>
                                </button>
                                <button class="step-resources-button" id="step-resources-${index}" data-step-index="${index}" title="Feeling stuck? Get learning resources">Feeling stuck?</button>
                            `;
                            header.appendChild(buttonDiv);
                        }
                    }
                }, 500);

                // Create step content container
                const stepContent = document.createElement('div');
                stepContent.className = 'step-content';
                
                // Check if this is primarily interactive (minimal explanation)
                const explanationText = step.explanation || '';
                
                // Always use 50/50 grid layout (removed full-width-viz logic)

                // Create left column
                const stepLeft = document.createElement('div');
                stepLeft.className = 'step-left';

                // Create explanation container (HTML container)
                const stepExplanation = document.createElement('div');
                stepExplanation.className = 'step-explanation';
                stepExplanation.id = `step-explanation-${index}`;
                // Process markdown bold formatting (reuse explanationText from above)
                stepExplanation.innerHTML = processMarkdownBold(explanationText || 'No explanation provided.');
                typesetMath([stepExplanation]);

                // Create input section
                const isStepCompleted = savedState && savedState.completedSteps && savedState.completedSteps[index];
                const isRevealed = savedState && savedState.stepStates && savedState.stepStates.revealed && savedState.stepStates.revealed[index];
                const correctAnswerRaw = step.correctAnswer || step.expectedAnswer || '';
                const correctAnswerDisplay = correctAnswerRaw.split('|').map(s => s.trim()).filter(Boolean);
                const primaryAnswer = correctAnswerDisplay[0] || '—';
                const otherAccepted = correctAnswerDisplay.length > 1 ? correctAnswerDisplay.slice(1).join(', ') : '';
                const feedbackText = isStepCompleted
                    ? (isRevealed ? `Correct answer: ${primaryAnswer}${otherAccepted ? ` (also accepted: ${otherAccepted})` : ''}` : 'Correct! ✓')
                    : '';
                const stepInputSection = document.createElement('div');
                stepInputSection.className = 'step-input-section';
                stepInputSection.innerHTML = `
                    <label class="step-input-label" for="step-input-${index}">
                        ${step.inputLabel || 'Your input:'}
                    </label>
                    <input 
                        type="text" 
                        class="step-input" 
                        id="step-input-${index}"
                        placeholder="${step.inputPlaceholder || 'Enter your answer...'}"
                        data-step-index="${index}"
                        ${isStepCompleted ? 'disabled' : ''}
                    />
                    <button 
                        class="step-submit-btn" 
                        id="step-submit-${index}"
                        data-step-index="${index}"
                        ${isStepCompleted ? 'disabled' : ''}
                    >
                        Submit
                    </button>
                    <div class="step-feedback" id="step-feedback-${index}" style="display: ${isStepCompleted ? 'block' : 'none'};">${feedbackText}</div>
                    <button 
                        class="reveal-answer-btn" 
                        id="reveal-answer-${index}"
                        data-step-index="${index}"
                        style="display: none;"
                    >
                        Reveal Answer
                    </button>
                `;
                
                // If step was completed, mark the card
                if (isStepCompleted) {
                    stepCard.classList.add('correct');
                    
                    // Check if this is the final step of the question
                    const isFinalStep = index === steps.length - 1;
                    if (isFinalStep) {
                        stepCard.classList.add('final-step-completed');
                        
                        // Add completion badge to the header
                        setTimeout(() => {
                            const stepHeaderEl = document.querySelector(`#step-${index} .step-header`);
                            if (stepHeaderEl && !stepHeaderEl.querySelector('.step-completion-badge')) {
                                const badge = document.createElement('div');
                                badge.className = 'step-completion-badge';
                                badge.textContent = 'Question Complete!';
                                stepHeaderEl.style.position = 'relative';
                                stepHeaderEl.appendChild(badge);
                            }
                        }, 100);
                    }
                }
                
                const label = stepInputSection.querySelector('.step-input-label');
                if (label) typesetMath([label]);

                // Create visualization container wrapper
                const vizWrapper = document.createElement('div');
                vizWrapper.className = 'step-visualization-wrapper';
                vizWrapper.style.position = 'relative';
                
                // Create visualization container (HTML container)
                const stepVisualization = document.createElement('div');
                stepVisualization.className = 'step-visualization';
                stepVisualization.id = `step-visualization-${index}`;
                
                // Add fullscreen button
                const fullscreenBtn = document.createElement('button');
                fullscreenBtn.className = 'viz-fullscreen-btn';
                fullscreenBtn.id = `fullscreen-btn-${index}`;
                fullscreenBtn.title = 'Open in fullscreen';
                fullscreenBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </svg>
                `;
                fullscreenBtn.addEventListener('click', () => {
                    toggleVisualizationFullscreen(index);
                });
                
                vizWrapper.appendChild(fullscreenBtn);
                vizWrapper.appendChild(stepVisualization);
                
                // Check visualization type: image or interactive
                // (vizType declared at top of forEach loop)
                // This prevents showing cached content from previous questions
                if (vizType === 'image' && step.moduleImage) {
                    // Show loading state for image
                    stepVisualization.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Generating image...</p>';
                } else if (vizType === 'interactive') {
                    // Show loading state for interactive module (load visualization even if step is locked)
                    stepVisualization.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Generating interactive element...</p>';
                }
                
                // Check cache after a brief delay to show loading state
                // savedState already declared at top of forEach loop
                const cachedViz = savedState && savedState.visualizations && savedState.visualizations[index];
                
                if (cachedViz) {
                    // Use cached visualization after showing loading state briefly
                    setTimeout(() => {
                        const currentVizEl = document.getElementById(`step-visualization-${index}`);
                        if (currentVizEl && currentVizEl.innerHTML.includes('Generating') || currentVizEl.innerHTML.includes('Loading')) {
                            console.log(`✅ Loading cached visualization for step ${index} of question ${currentQuestionIndex}`);
                            currentVizEl.innerHTML = cachedViz;
                        }
                    }, 300); // Brief delay to show loading state
                } else {
                    // Need to generate new visualization
                    if (vizType === 'image' && step.moduleImage && index === 0) {
                        // Generate immediately for first step
                        generateStepImage(index, step.moduleImage, stepVisualization);
                    }
                }

                // Assemble the structure
                stepLeft.appendChild(stepExplanation);
                stepLeft.appendChild(stepInputSection);
                stepContent.appendChild(stepLeft);
                stepContent.appendChild(vizWrapper); // Use wrapper instead of stepVisualization directly
                stepCard.appendChild(stepHeader);
                stepCard.appendChild(stepContent);
                // Use pre-generated WAV from manifest when available (Gemini 2.5 TTS)
                if (step.audioPath) {
                    const audioEl = document.createElement('audio');
                    audioEl.id = `step-audio-element-${index}`;
                    audioEl.preload = 'auto';
                    audioEl.src = step.audioPath;
                    audioEl.style.display = 'none';
                    stepCard.appendChild(audioEl);
                    audioElements.set(index, { element: audioEl, type: 'audio' });
                }
                stepsList.appendChild(stepCard);
                
                // Generate/load visualization for ALL steps AFTER element is in DOM
                // (vizType declared at top of forEach loop)
                
                // Handle IMAGE-type visualizations (SVG or image HTML)
                if (vizType === 'image' && step.visualization) {
                    console.log(`🔍 Step ${index}: vizType=image, hasViz=${!!step.visualization}`);
                    setTimeout(() => {
                        const vizEl = document.getElementById(`step-visualization-${index}`);
                        if (vizEl) {
                            let html = step.visualization;
                            if (looksLikeBinaryContent(html) && step.visualizationImageUrl) {
                                html = `<div class="problem-viz-image-wrap"><img src="${step.visualizationImageUrl}" alt="Diagram" class="problem-viz-image" loading="lazy" decoding="async" /></div>`;
                            } else if (looksLikeBinaryContent(html)) {
                                html = '<p class="text-secondary">Image could not be loaded.</p>';
                            }
                            console.log(`✅ [renderSteps] Loading PRE-GENERATED viz for step ${index}`);
                            vizEl.innerHTML = html;
                        }
                    }, 100 + (index * 50));
                }
                
                // Handle INTERACTIVE visualizations
                if (vizType === 'interactive') {
                    console.log(`🔍 Step ${index}: vizType=interactive, hasViz=${!!step.visualization}, hasComponent=${!!step.component}`);
                    // PRIORITY 1: Use pre-loaded visualization from module
                    if (step.visualization) {
                        console.log(`⏰ Scheduling setTimeout for step ${index} with delay ${100 + (index * 50)}ms`);
                        setTimeout(() => {
                            console.log(`⏰ setTimeout fired for step ${index}`);
                            const vizEl = document.getElementById(`step-visualization-${index}`);
                            console.log(`🎯 vizEl for step ${index}:`, !!vizEl);
                            if (vizEl) {
                                let html = step.visualization;
                                if (looksLikeBinaryContent(html) && step.visualizationImageUrl) {
                                    html = `<div class="problem-viz-image-wrap"><img src="${step.visualizationImageUrl}" alt="Diagram" class="problem-viz-image" loading="lazy" decoding="async" /></div>`;
                                } else if (looksLikeBinaryContent(html)) {
                                    html = '<p class="text-secondary">Image could not be loaded.</p>';
                                }
                                if (looksLikeBinaryContent(step.visualization)) {
                                    console.log(`✅ [renderSteps] Step ${index} had binary viz; using img tag`);
                                    vizEl.innerHTML = html;
                                    if (!questionStates[currentQuestionIndex]) questionStates[currentQuestionIndex] = {};
                                    if (!questionStates[currentQuestionIndex].visualizations) questionStates[currentQuestionIndex].visualizations = {};
                                    questionStates[currentQuestionIndex].visualizations[index] = html;
                                } else {
                                    console.log(`✅ [renderSteps] Loading PRE-GENERATED component for step ${index} in IFRAME`);
                                    vizEl.innerHTML = '';
                                    const iframe = document.createElement('iframe');
                                    iframe.style.width = '100%';
                                    iframe.style.height = '600px';
                                    iframe.style.border = 'none';
                                    iframe.style.borderRadius = '8px';
                                    iframe.sandbox = 'allow-scripts allow-same-origin allow-forms';
                                    iframe.title = 'Step ' + (index + 1) + ' interactive';
                                    vizEl.appendChild(iframe);
                                    iframe.srcdoc = ensureHtml(html);
                                    iframe.addEventListener('load', () => {
                                        try {
                                            const contentHeight = iframe.contentDocument.body.scrollHeight;
                                            iframe.style.height = Math.max(contentHeight + 40, 600) + 'px';
                                        } catch (e) {
                                            console.warn('Could not auto-adjust iframe height:', e);
                                        }
                                    });
                                    setTimeout(() => {
                                        try {
                                            const contentHeight = iframe.contentDocument.body.scrollHeight;
                                            iframe.style.height = Math.max(contentHeight + 40, 600) + 'px';
                                        } catch (e) {
                                            console.warn('Could not auto-adjust iframe height:', e);
                                        }
                                    }, 500);
                                    console.log(`✅ Step ${index} loaded in isolated iframe`);
                                    if (!questionStates[currentQuestionIndex]) questionStates[currentQuestionIndex] = {};
                                    if (!questionStates[currentQuestionIndex].visualizations) questionStates[currentQuestionIndex].visualizations = {};
                                    questionStates[currentQuestionIndex].visualizations[index] = step.visualization;
                                }
                            }
                        }, 100 + (index * 50)); // Stagger slightly
                    }
                    // PRIORITY 2: Check if cached
                    else if (questionStates[currentQuestionIndex]?.visualizations?.[index]) {
                        const cachedViz = questionStates[currentQuestionIndex].visualizations[index];
                        if (looksLikeBinaryContent(cachedViz)) {
                            questionStates[currentQuestionIndex].visualizations[index] = null;
                        }
                        setTimeout(() => {
                            const vizEl = document.getElementById(`step-visualization-${index}`);
                            if (vizEl && (vizEl.innerHTML.includes('Generating') || vizEl.innerHTML.includes('Loading'))) {
                                if (looksLikeBinaryContent(cachedViz)) {
                                    vizEl.innerHTML = step.visualizationImageUrl
                                        ? `<div class="problem-viz-image-wrap"><img src="${step.visualizationImageUrl}" alt="Diagram" class="problem-viz-image" loading="lazy" decoding="async" /></div>`
                                        : '<p class="text-secondary">Image could not be loaded.</p>';
                                    return;
                                }
                                console.log(`✅ Loading cached interactive module for step ${index}`);
                                const tempDiv = document.createElement('div');
                                tempDiv.innerHTML = cachedViz;
                                const bodyContent = tempDiv.querySelector('body');
                                const styleElements = tempDiv.querySelectorAll('style');
                                
                                // Use iframe for cached content too
                                vizEl.innerHTML = '';
                                
                                const iframe = document.createElement('iframe');
                                iframe.style.width = '100%';
                                iframe.style.height = '600px'; // Initial height
                                iframe.style.border = 'none';
                                iframe.style.borderRadius = '8px';
                                iframe.sandbox = 'allow-scripts allow-same-origin allow-forms';
                                
                                vizEl.appendChild(iframe);

                                iframe.srcdoc = ensureHtml(cachedViz);
                                
                                // Auto-adjust iframe height to content
                                setTimeout(() => {
                                    try {
                                        const contentHeight = iframe.contentDocument.body.scrollHeight;
                                        iframe.style.height = Math.max(contentHeight + 40, 600) + 'px';
                                    } catch (e) {
                                        console.warn('Could not auto-adjust iframe height:', e);
                                    }
                                }, 500);
                                
                                console.log(`✅ Step ${index} cached loaded in isolated iframe`);
                            }
                        }, 300 + (index * 50));
                    } 
                    // PRIORITY 3: Generate new (fallback only)
                    else {
                        setTimeout(() => {
                            console.log(`⚠️ [renderSteps] No pre-built component, generating at runtime for step ${index}`);
                            const vizEl = document.getElementById(`step-visualization-${index}`);
                            if (vizEl) {
                                generateInteractiveModule(index, step, homeworkData.problem).then(() => {
                                    // Save the generated visualization to cache
                                    if (!questionStates[currentQuestionIndex]) {
                                        questionStates[currentQuestionIndex] = {};
                                    }
                                    if (!questionStates[currentQuestionIndex].visualizations) {
                                        questionStates[currentQuestionIndex].visualizations = {};
                                    }
                                    questionStates[currentQuestionIndex].visualizations[index] = vizEl.innerHTML;
                                }).catch(err => {
                                    console.error('❌ [renderSteps] Error in generateInteractiveModule:', err);
                                });
                            } else {
                                console.error('❌ [renderSteps] Visualization element still not found after append for step', index);
                            }
                        }, index * 100);
                    }
                }
                
                // Audio is generated in the backend loop (generate.py); no client-side generation on page load.
                // Only pre-generated WAV from manifest (step.audioPath) is used; play on click.
                
                } catch (error) {
                    console.error(`❌ [renderSteps] Error building step ${index}:`, error);
                    // Create a minimal error card so the page doesn't break
                    const errorCard = document.createElement('div');
                    errorCard.className = 'step-card';
                    errorCard.innerHTML = `<div class="step-header"><div>Step ${index + 1} - Error loading</div></div>`;
                    stepsList.appendChild(errorCard);
                }
            });

            // Typeset all math in problem + steps (MathJax script loads async; this runs when ready)
            const problemSection = document.getElementById('problem-section');
            if (problemSection && stepsList) typesetMath([problemSection, stepsList]);

            // Initialize step state tracking
            initializeStepStates(steps.length);
            
            // Attach submit button handlers
            attachSubmitHandlers();
            
            // Attach resources button handlers
            attachResourcesHandlers();
            
            // Pre-fetch YouTube videos for all steps in the background
            // preFetchStepVideos(steps); // Disabled to prevent YouTube API quota exhaustion
            
            // DEBUG: Watch for button removal
            console.log('🔍 Setting up button removal detector...');
            setTimeout(() => {
                steps.forEach((step, index) => {
                    const audioBtn = document.getElementById(`step-audio-${index}`);
                    const resourceBtn = document.getElementById(`step-resources-${index}`);
                    
                    if (!audioBtn) {
                        console.error(`❌ AUDIO BUTTON MISSING for step ${index}!`);
                        console.trace('Stack trace for missing audio button');
                    } else {
                        const computed = window.getComputedStyle(audioBtn);
                        console.log(`✅ Audio button ${index}:`, {
                            exists: true,
                            display: computed.display,
                            visibility: computed.visibility,
                            opacity: computed.opacity,
                            position: computed.position
                        });
                    }
                    
                    if (!resourceBtn) {
                        console.error(`❌ RESOURCE BUTTON MISSING for step ${index}!`);
                        console.trace('Stack trace for missing resource button');
                    } else {
                        const computed = window.getComputedStyle(resourceBtn);
                        console.log(`✅ Resource button ${index}:`, {
                            exists: true,
                            display: computed.display,
                            visibility: computed.visibility,
                            opacity: computed.opacity,
                            position: computed.position
                        });
                    }
                });
            }, 1000);
        }

        // Step state tracking
        const stepStates = {
            attempts: {},
            completed: {},
            revealed: {}
        };

        // Cache for pre-fetched YouTube videos
        const stepVideosCache = {};

        function initializeStepStates(totalSteps) {
            for (let i = 0; i < totalSteps; i++) {
                stepStates.attempts[i] = 0;
                stepStates.completed[i] = false;
                stepStates.revealed[i] = false;
            }
        }

        function attachSubmitHandlers() {
            document.querySelectorAll('.step-submit-btn').forEach(btn => {
                btn.addEventListener('click', handleSubmit);
            });

            // Allow Enter key to submit
            document.querySelectorAll('.step-input').forEach(input => {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !input.disabled) {
                        const stepIndex = parseInt(input.getAttribute('data-step-index'));
                        handleSubmit({ target: document.getElementById(`step-submit-${stepIndex}`) });
                    }
                });
            });

            // Attach reveal answer button handlers
            document.querySelectorAll('.reveal-answer-btn').forEach(btn => {
                btn.addEventListener('click', handleRevealAnswer);
            });
        }

        // Attach resources button handlers (called after renderSteps)
        function attachResourcesHandlers() {
            // Handlers are attached via document-level delegation below
        }

        // Handle resources button click (event delegation so it works for dynamically added buttons)
        async function handleResourcesClick(e) {
            const button = e.target.closest('.step-resources-button');
            if (!button) return;
            e.preventDefault();
            const stepIndex = parseInt(button.getAttribute('data-step-index'), 10);
            if (isNaN(stepIndex)) return;
            const step = homeworkData && homeworkData.steps && homeworkData.steps[stepIndex];
            if (!step) {
                console.error('Step not found:', stepIndex);
                return;
            }

            const modal = document.getElementById('resources-modal');
            const modalBody = document.getElementById('resources-modal-body');
            const modalTitle = document.getElementById('resources-modal-title');
            if (!modal || !modalBody || !modalTitle) {
                console.error('Resources modal elements not found. Ensure index.html includes #resources-modal.');
                return;
            }

            modal.classList.add('active');
            const resourcesButton = document.getElementById(`step-resources-${stepIndex}`);
            modalTitle.textContent = `Learning Resources - Step ${stepIndex + 1}`;

            // Check if videos are already cached
            if (stepVideosCache[stepIndex]) {
                // Display cached videos immediately
                if (stepVideosCache[stepIndex].length > 0) {
                    displayResources(stepVideosCache[stepIndex]);
                } else {
                    modalBody.innerHTML = '<div class="resources-empty">No videos found for this step. Try searching YouTube manually.</div>';
                }
                return;
            }

            // If not cached, show loading and fetch
            modalBody.innerHTML = '<div class="resources-loading">Finding relevant YouTube videos...</div>';
            resourcesButton.classList.add('loading');

            try {
                // Fetch YouTube videos for this step
                const videos = await fetchStepResources(step, stepIndex);
                
                // Cache the videos
                stepVideosCache[stepIndex] = videos;
                
                // Display videos
                if (videos && videos.length > 0) {
                    displayResources(videos);
                } else {
                    modalBody.innerHTML = '<div class="resources-empty">No videos found for this step. Try searching YouTube manually.</div>';
                }
            } catch (error) {
                console.error('Error fetching resources:', error);
                modalBody.innerHTML = `<div class="resources-error">Error loading resources: ${error.message}</div>`;
            } finally {
                resourcesButton.classList.remove('loading');
            }
        }

        // Pre-fetch YouTube videos for all steps in the background
        async function preFetchStepVideos(steps) {
            if (!steps || steps.length === 0) return;

            // Get Supabase configuration
            const { supabaseUrl, supabaseKey } = getSupabaseConfig();
            if (!supabaseUrl) {
                console.error('🎥 [YOUTUBE] Supabase URL not configured. Skipping video pre-fetch.');
                return;
            }

            if (!supabaseKey) {
                console.error('🎥 [YOUTUBE] Supabase API key not configured. Skipping video pre-fetch.');
                return;
            }

            const youtubeApiUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/youtube_step_recommendations`;
            console.log('🎥 [YOUTUBE] Starting pre-fetch for', steps.length, 'steps');
            console.log('🎥 [YOUTUBE] API URL:', youtubeApiUrl);
            console.log('🎥 [YOUTUBE] API Key present:', !!supabaseKey, 'Length:', supabaseKey?.length || 0);

            // Pre-fetch videos for each step with a delay to avoid rate limiting
            steps.forEach((step, index) => {
                setTimeout(async () => {
                    try {
                        const topic = step.explanation || `Step ${index + 1}`;
                        const problemContext = homeworkData.problem ? homeworkData.problem.text : '';

                        const headers = {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${supabaseKey}`,
                            'apikey': supabaseKey
                        };

                        console.log(`🎥 [YOUTUBE] Fetching videos for step ${index + 1}...`);
                        console.log(`🎥 [YOUTUBE] Topic:`, topic.substring(0, 50));
                        console.log(`🎥 [YOUTUBE] Headers:`, { 
                            'Content-Type': headers['Content-Type'],
                            'Authorization': headers['Authorization'] ? 'Bearer [REDACTED]' : 'MISSING',
                            'apikey': headers['apikey'] ? '[REDACTED]' : 'MISSING'
                        });

                        const response = await fetch(youtubeApiUrl, {
                            method: 'POST',
                            headers: headers,
                            body: JSON.stringify({
                                topic: topic,
                                contentContext: problemContext,
                                count: 3,
                                preferredDurationMin: [5, 20]
                            })
                        });

                        console.log(`🎥 [YOUTUBE] Response for step ${index + 1}:`, response.status, response.statusText);

                        if (response.ok) {
                            const videos = await response.json();
                            
                            // Handle different response formats
                            let videoList = [];
                            if (videos.videos && Array.isArray(videos.videos)) {
                                // Function returns { videos: [...] }
                                videoList = videos.videos.map(v => {
                                    // Use url if provided, otherwise construct from video_id
                                    const videoUrl = v.url || (v.video_id ? `https://www.youtube.com/watch?v=${v.video_id}` : '');
                                    return {
                                        video_id: v.video_id,
                                        url: videoUrl,
                                        title: v.title,
                                        channelTitle: v.channelTitle || v.channel_name,
                                        duration: v.duration || formatDuration(v.duration_seconds),
                                        thumbnail: v.thumbnail || v.thumbnail_url,
                                        topic_section: v.topic_section || topic.substring(0, 50),
                                        reason: v.reason || `Recommended for: ${topic.substring(0, 100)}`
                                    };
                                });
                            } else if (Array.isArray(videos)) {
                                // Direct array response - ensure it has proper format
                                videoList = videos.map(v => ({
                                    video_id: v.video_id,
                                    url: v.url || (v.video_id ? `https://www.youtube.com/watch?v=${v.video_id}` : ''),
                                    title: v.title,
                                    channelTitle: v.channelTitle || v.channel_name,
                                    duration: v.duration || formatDuration(v.duration_seconds),
                                    thumbnail: v.thumbnail || v.thumbnail_url,
                                    topic_section: v.topic_section || topic.substring(0, 50),
                                    reason: v.reason || `Recommended for: ${topic.substring(0, 100)}`
                                }));
                            }
                            
                            stepVideosCache[index] = videoList;
                            console.log(`🎥 [YOUTUBE] ✅ Pre-fetched ${stepVideosCache[index].length} videos for step ${index + 1}`);
                        } else {
                            const errorText = await response.text();
                            let errorData;
                            try {
                                errorData = JSON.parse(errorText);
                            } catch {
                                errorData = { error: errorText };
                            }
                            
                            console.error(`🎥 [YOUTUBE] ❌ Failed to pre-fetch videos for step ${index + 1}:`, response.status, response.statusText);
                            console.error(`🎥 [YOUTUBE] Error response:`, errorText);
                            
                            if (response.status === 401) {
                                console.error(`🎥 [YOUTUBE] 🔐 AUTHENTICATION ERROR: Function requires user authentication`);
                                console.error(`🎥 [YOUTUBE] 🔐 This function is designed for lessons (requires user JWT), not steps`);
                                console.error(`🎥 [YOUTUBE] 🔐 Solution: Create a new Edge Function that accepts topic/contentContext without user auth`);
                            }
                            
                            if (response.status === 404) {
                                console.error(`🎥 [YOUTUBE] ❌ FUNCTION NOT FOUND`);
                            }
                            
                            stepVideosCache[index] = [];
                        }
                    } catch (error) {
                        console.error(`🎥 [YOUTUBE] ❌ Error pre-fetching videos for step ${index + 1}:`, error.message);
                        console.error(`🎥 [YOUTUBE] Error details:`, error);
                        stepVideosCache[index] = [];
                    }
                }, index * 500); // Stagger requests by 500ms to avoid rate limiting
            });
        }

        // Fetch YouTube videos for a step using YouTube Data API via Supabase
        async function fetchStepResources(step, stepIndex) {
            // Get Supabase configuration
            const { supabaseUrl, supabaseKey } = getSupabaseConfig();
            
            if (!supabaseUrl) {
                console.error('🎥 [YOUTUBE] Supabase URL not configured');
                throw new Error('Supabase URL not configured. Please set supabase-url meta tag.');
            }

            if (!supabaseKey) {
                console.error('🎥 [YOUTUBE] Supabase API key not configured');
                throw new Error('Supabase API key not configured. Please set supabase-anon-key meta tag.');
            }

            // Use the new step-based YouTube recommendations function
            const youtubeApiUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/youtube_step_recommendations`;

            // Build question + step payload for Gemini (create search query) then YouTube Data API
            const questionText = homeworkData.problem ? (homeworkData.problem.text || '').trim() : '';
            const stepExplanation = (step.explanation || '').trim();
            const stepQuestion = (step.inputLabel || '').trim();
            const topic = [stepExplanation, stepQuestion].filter(Boolean).join(' ') || `Step ${stepIndex + 1}`;

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
                'apikey': supabaseKey
            };

            console.log('🎥 [YOUTUBE] Fetching videos for step', stepIndex + 1, '(question + step → Gemini → YouTube)');

            try {
                const response = await fetch(youtubeApiUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        topic: topic,
                        contentContext: questionText,
                        count: 3,
                        preferredDurationMin: [3, 25]
                    })
                });

                console.log('🎥 [YOUTUBE] Response status:', response.status, response.statusText);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('🎥 [YOUTUBE] ❌ Error response:', response.status, response.statusText);
                    console.error('🎥 [YOUTUBE] Error body:', errorText);
                    
                    let errorData;
                    try {
                        errorData = JSON.parse(errorText);
                    } catch {
                        errorData = { error: errorText };
                    }
                    
                    if (response.status === 401) {
                        console.error('🎥 [YOUTUBE] 🔐 AUTHENTICATION ERROR: Invalid or expired Supabase token');
                        console.error('🎥 [YOUTUBE] 🔐 To fix: Update the "supabase-anon-key" meta tag with a valid token');
                        return [];
                    }
                    
                    if (response.status === 404) {
                        console.error('🎥 [YOUTUBE] ❌ FUNCTION NOT FOUND');
                        return [];
                    }
                    
                    // For other errors, also return empty array
                    return [];
                }

                const videos = await response.json();
                console.log('🎥 [YOUTUBE] ✅ Received', Array.isArray(videos) ? videos.length : 0, 'videos');
                
                // Handle different response formats
                if (videos.videos && Array.isArray(videos.videos)) {
                    // Function returns { videos: [...] }
                    return videos.videos.map(v => {
                        // Use url if provided, otherwise construct from video_id
                        const videoUrl = v.url || (v.video_id ? `https://www.youtube.com/watch?v=${v.video_id}` : '');
                        return {
                            video_id: v.video_id,
                            url: videoUrl,
                            title: v.title,
                            channelTitle: v.channelTitle || v.channel_name,
                            duration: v.duration || formatDuration(v.duration_seconds),
                            thumbnail: v.thumbnail || v.thumbnail_url,
                            topic_section: v.topic_section || topic,
                            reason: v.reason || `Recommended for: ${topic.substring(0, 100)}`
                        };
                    });
                } else if (Array.isArray(videos)) {
                    // Direct array response - ensure it has proper format
                    return videos.map(v => ({
                        video_id: v.video_id,
                        url: v.url || (v.video_id ? `https://www.youtube.com/watch?v=${v.video_id}` : ''),
                        title: v.title,
                        channelTitle: v.channelTitle || v.channel_name,
                        duration: v.duration || formatDuration(v.duration_seconds),
                        thumbnail: v.thumbnail || v.thumbnail_url,
                        topic_section: v.topic_section || topic,
                        reason: v.reason || `Recommended for: ${topic.substring(0, 100)}`
                    }));
                }
                
                return [];
            } catch (error) {
                console.error('🎥 [YOUTUBE] ❌ Error fetching step resources:', error.message);
                // Return empty array instead of throwing - allow graceful degradation
                return [];
            }
        }
        
        // Helper to format duration
        function formatDuration(seconds) {
            if (!seconds) return '';
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
        }

        // Display resources in modal
        function displayResources(videos) {
            const modalBody = document.getElementById('resources-modal-body');
            
            if (!videos || videos.length === 0) {
                modalBody.innerHTML = '<div class="resources-empty">No videos found for this step.</div>';
                return;
            }

            // Limit to 3 videos maximum
            const limitedVideos = videos.slice(0, 3);
            
            const videosHTML = limitedVideos.map((video, index) => {
                const url = video.url || '';
                const title = video.title || 'Untitled Video';
                const topicSection = video.topic_section || '';
                const reason = video.reason || '';
                const channelTitle = video.channelTitle || '';
                const duration = video.duration || '';
                const thumbnail = video.thumbnail || '';

                return `
                    <div class="resource-video-item">
                        ${thumbnail ? `
                            <div class="resource-video-thumbnail">
                                <a href="${url}" target="_blank" rel="noopener noreferrer">
                                    <img src="${thumbnail}" alt="${title}" loading="lazy">
                                </a>
                            </div>
                        ` : ''}
                        <div class="resource-video-title">
                            <a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>
                        </div>
                        ${channelTitle || duration ? `<div class="resource-video-meta">${channelTitle ? `<strong>Channel:</strong> ${channelTitle}` : ''}${channelTitle && duration ? ' • ' : ''}${duration ? `<strong>Duration:</strong> ${duration}` : ''}</div>` : ''}
                        ${reason ? `<div class="resource-video-reason">${reason}</div>` : ''}
                    </div>
                `;
            }).join('');

            modalBody.innerHTML = `<div class="resources-videos-list">${videosHTML}</div>`;

            // Render math in "Recommended for" text (e.g. $x$, $+5$)
            const runMathJax = () => {
                if (window.MathJax && window.MathJax.typesetPromise) {
                    window.MathJax.typesetPromise([modalBody]).catch((err) => {
                        console.warn('MathJax typeset error in resources modal:', err);
                    });
                }
            };
            setTimeout(() => {
                if (window.MathJax && window.MathJax.typesetPromise) {
                    runMathJax();
                } else if (window.MathJax && window.MathJax.startup) {
                    window.MathJax.startup.promise.then(runMathJax);
                }
            }, 50);
        }

        // Close modal handlers
        document.addEventListener('DOMContentLoaded', () => {
            const modal = document.getElementById('resources-modal');
            const closeBtn = document.getElementById('resources-modal-close');
            
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    modal.classList.remove('active');
                });
            }
            
            // Close on background click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
            
            // Close on Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal.classList.contains('active')) {
                    modal.classList.remove('active');
                }
            });
            
            // Initialize question dropdown
            const questionSelect = document.getElementById('question-select');
            if (questionSelect) {
                questionSelect.addEventListener('change', function(e) {
                    const selectedIndex = parseInt(e.target.value);
                    console.log('🔄 DOMContentLoaded: Dropdown changed to question:', selectedIndex);
                    if (!isNaN(selectedIndex)) {
                        selectQuestion(selectedIndex).catch(err => {
                            console.error('Error selecting question:', err);
                        });
                    }
                });
                console.log('✅ Question dropdown initialized on DOMContentLoaded');
            }
        });

        // Calculate Levenshtein distance between two strings (for fuzzy matching)
        function levenshteinDistance(str1, str2) {
            const len1 = str1.length;
            const len2 = str2.length;
            
            // Create matrix
            const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
            
            // Initialize first row and column
            for (let i = 0; i <= len1; i++) matrix[0][i] = i;
            for (let j = 0; j <= len2; j++) matrix[j][0] = j;
            
            // Fill matrix
            for (let j = 1; j <= len2; j++) {
                for (let i = 1; i <= len1; i++) {
                    const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                    matrix[j][i] = Math.min(
                        matrix[j][i - 1] + 1,      // deletion
                        matrix[j - 1][i] + 1,      // insertion
                        matrix[j - 1][i - 1] + cost // substitution
                    );
                }
            }
            
            return matrix[len2][len1];
        }

        // Calculate similarity ratio (0-1, where 1 is identical)
        function similarityRatio(str1, str2) {
            if (str1 === str2) return 1;
            if (!str1 || !str2) return 0;
            
            const maxLen = Math.max(str1.length, str2.length);
            if (maxLen === 0) return 1;
            
            const distance = levenshteinDistance(str1, str2);
            return 1 - (distance / maxLen);
        }

        // Check if answer looks like math (contains operators or numbers with operators)
        function isMathAnswer(answer) {
            return /[\+\-\*\/\(\)=]/.test(answer) || /^\d+[\+\-\*\/\(\)]/.test(answer) || /[\+\-\*\/\(\)]\d+$/.test(answer);
        }

        // Normalize answer for flexible comparison
        function normalizeAnswer(answer, preserveSpaces = false) {
            if (!answer) return '';
            
            let normalized = answer
                .toLowerCase()
                .trim();
            
            // Check if it's a math answer
            const isMath = isMathAnswer(normalized);
            
            // Remove leading/trailing equals signs and spaces
            normalized = normalized.replace(/^[\s=]+|[\s=]+$/g, '');
            
            // Normalize whitespace
            normalized = normalized.replace(/\s+/g, ' ');
            
            if (isMath) {
                // Math-specific normalization
                // Handle variable assignments: remove variable and equals, keep the value
                // e.g., "w=6" or "w = 6" becomes "6"
                normalized = normalized.replace(/^[a-z]+\s*=\s*/, '');
                
                // Normalize operators - convert x and × to *
                normalized = normalized.replace(/[x×]/g, '*');
                
                // Normalize parentheses multiplication: (2)(3) -> 2*3
                normalized = normalized.replace(/\((\d+)\)\s*\((\d+)\)/g, '$1*$2');
                normalized = normalized.replace(/\((\d+)\)\s*(\d+)/g, '$1*$2');
                normalized = normalized.replace(/(\d+)\s*\((\d+)\)/g, '$1*$2');
                
                // Remove spaces around operators
                normalized = normalized.replace(/\s*=\s*/g, '=');
                normalized = normalized.replace(/\s*\*\s*/g, '*');
                normalized = normalized.replace(/\s*\+\s*/g, '+');
                normalized = normalized.replace(/\s*-\s*/g, '-');
                normalized = normalized.replace(/\s*\/\s*/g, '/');
                
                // Remove all spaces for math
                normalized = normalized.replace(/\s/g, '');
                
                // Remove leading equals if still present
                normalized = normalized.replace(/^=+/, '');
                
                // Normalize similar-looking characters
                normalized = normalized.replace(/[il1]/g, 'l');
            } else {
                // Text-specific normalization
                // Keep spaces but normalize them
                normalized = normalized.replace(/\s+/g, ' ');
                
                // Remove leading/trailing spaces
                normalized = normalized.trim();
                
                // Normalize common punctuation
                normalized = normalized.replace(/[.,;:!?]+/g, '');
                
                // Normalize similar-looking characters for text too
                normalized = normalized.replace(/[il1]/g, 'l');
            }
            
            return normalized;
        }

        function handleSubmit(e) {
            const stepIndex = parseInt(e.target.getAttribute('data-step-index'));
            const input = document.getElementById(`step-input-${stepIndex}`);
            const feedback = document.getElementById(`step-feedback-${stepIndex}`);
            const stepCard = document.getElementById(`step-${stepIndex}`);
            const submitBtn = e.target;
            
            const userAnswer = input.value.trim();
            if (!userAnswer) return;

            // Get correct answer from step data (normalize for comparison)
            const step = homeworkData.steps[stepIndex];
            const correctAnswer = step.correctAnswer || step.expectedAnswer || '';

            stepStates.attempts[stepIndex] = (stepStates.attempts[stepIndex] || 0) + 1;

            // Check if answer is correct (flexible matching with multiple solutions)
            let isCorrect = false;
            
            // Split correct answer by pipe to get multiple acceptable formats
            const correctAnswers = correctAnswer.split('|').map(ans => ans.trim()).filter(ans => ans);
            
            // If no pipe separator, treat as single answer
            const answersToCheck = correctAnswers.length > 1 ? correctAnswers : [correctAnswer];
            
            // Check against all possible correct answers
            for (const answer of answersToCheck) {
                // Determine if this is a math or text answer
                const isMath = isMathAnswer(answer) || isMathAnswer(userAnswer);
                
                // Normalize based on type
                const normalizedCorrect = normalizeAnswer(answer, !isMath);
                const normalizedUserForComparison = normalizeAnswer(userAnswer, !isMath);
                
                // Exact normalized match
                if (normalizedUserForComparison === normalizedCorrect) {
                    isCorrect = true;
                    break;
                }
                
                if (isMath) {
                    // Math-specific matching
                    // Try numeric comparison
                    const userNum = parseFloat(normalizedUserForComparison);
                    const correctNum = parseFloat(normalizedCorrect);
                    if (!isNaN(userNum) && !isNaN(correctNum) && Math.abs(userNum - correctNum) < 0.001) {
                        isCorrect = true;
                        break;
                    }
                
                    // Try evaluating simple expressions (e.g., "2*3" = "6")
                    // Only for simple arithmetic expressions with numbers and basic operators
                    try {
                        if (/[\+\-\*\/]/.test(normalizedUserForComparison) || /[\+\-\*\/]/.test(normalizedCorrect)) {
                            // Safe evaluation: only numbers, operators, and parentheses
                            const userEval = normalizedUserForComparison.replace(/[^0-9\+\-\*\/\(\)\.]/g, '');
                            const correctEval = normalizedCorrect.replace(/[^0-9\+\-\*\/\(\)\.]/g, '');
                        
                        // Only evaluate if both are valid simple math expressions
                        if (userEval && correctEval && 
                            /^[0-9\+\-\*\/\(\)\.]+$/.test(userEval) && 
                            /^[0-9\+\-\*\/\(\)\.]+$/.test(correctEval) &&
                            userEval.length < 50 && correctEval.length < 50) { // Length limit for safety
                            
                            // Use a safer evaluation method
                            const safeEval = (expr) => {
                                // Replace * with explicit multiplication
                                expr = expr.replace(/(\d+)\s*\(\s*(\d+)\s*\)/g, '$1*$2');
                                expr = expr.replace(/\(\s*(\d+)\s*\)\s*(\d+)/g, '$1*$2');
                                expr = expr.replace(/\(\s*(\d+)\s*\)\s*\(\s*(\d+)\s*\)/g, '$1*$2');
                                
                                // Simple recursive descent parser for basic arithmetic
                                const parse = (str) => {
                                    str = str.replace(/\s/g, '');
                                    let pos = 0;
                                    
                                    const parseExpr = () => {
                                        let result = parseTerm();
                                        while (pos < str.length && (str[pos] === '+' || str[pos] === '-')) {
                                            const op = str[pos++];
                                            const term = parseTerm();
                                            result = op === '+' ? result + term : result - term;
                                        }
                                        return result;
                                    };
                                    
                                    const parseTerm = () => {
                                        let result = parseFactor();
                                        while (pos < str.length && (str[pos] === '*' || str[pos] === '/')) {
                                            const op = str[pos++];
                                            const factor = parseFactor();
                                            result = op === '*' ? result * factor : result / factor;
                                        }
                                        return result;
                                    };
                                    
                                    const parseFactor = () => {
                                        if (pos >= str.length) return 0;
                                        if (str[pos] === '(') {
                                            pos++; // skip '('
                                            const result = parseExpr();
                                            if (pos < str.length && str[pos] === ')') pos++; // skip ')'
                                            return result;
                                        }
                                        let num = '';
                                        while (pos < str.length && /[0-9\.]/.test(str[pos])) {
                                            num += str[pos++];
                                        }
                                        return parseFloat(num) || 0;
                                    };
                                    
                                    return parseExpr();
                                };
                                
                                return parse(expr);
                            };
                            
                            const userResult = safeEval(userEval);
                            const correctResult = safeEval(correctEval);
                            
                            if (typeof userResult === 'number' && typeof correctResult === 'number' && 
                                !isNaN(userResult) && !isNaN(correctResult) &&
                                Math.abs(userResult - correctResult) < 0.001) {
                                isCorrect = true;
                                break;
                            }
                        }
                    }
                } catch (e) {
                    // Evaluation failed, continue with other checks
                }
                } else {
                    // Text-specific fuzzy matching
                    // Calculate similarity ratio
                    const similarity = similarityRatio(normalizedUserForComparison, normalizedCorrect);
                    
                    // Accept if similarity is high enough (85% or more)
                    // This handles common misspellings and typos
                    if (similarity >= 0.85) {
                        isCorrect = true;
                        break;
                    }
                    
                    // Also try word-by-word comparison for multi-word answers
                    const userWords = normalizedUserForComparison.split(/\s+/);
                    const correctWords = normalizedCorrect.split(/\s+/);
                    
                    if (userWords.length === correctWords.length) {
                        let wordMatches = 0;
                        for (let i = 0; i < userWords.length; i++) {
                            const wordSimilarity = similarityRatio(userWords[i], correctWords[i]);
                            if (wordSimilarity >= 0.85) {
                                wordMatches++;
                            }
                        }
                        // Accept if all words match with high similarity
                        if (wordMatches === userWords.length) {
                            isCorrect = true;
                            break;
                        }
                    }
                }
            }

            if (isCorrect) {
                // Correct answer
                stepCard.classList.add('correct');
                stepCard.classList.remove('locked');
                feedback.textContent = 'Correct! ✓';
                feedback.className = 'step-feedback correct';
                feedback.style.display = 'block';
                input.disabled = true;
                submitBtn.disabled = true;
                stepStates.completed[stepIndex] = true;
                
                // Save to question state
                if (!questionStates[currentQuestionIndex]) {
                    questionStates[currentQuestionIndex] = { completedSteps: {}, visualizations: {} };
                }
                if (!questionStates[currentQuestionIndex].completedSteps) {
                    questionStates[currentQuestionIndex].completedSteps = {};
                }
                questionStates[currentQuestionIndex].completedSteps[stepIndex] = true;
                
                // Check if this is the final step of the question
                const isFinalStep = stepIndex === homeworkData.steps.length - 1;
                if (isFinalStep) {
                    // Mark this as the final step completion
                    stepCard.classList.add('final-step-completed');
                    
                    // Add completion badge if it doesn't exist
                    const stepHeader = stepCard.querySelector('.step-header');
                    if (stepHeader && !stepHeader.querySelector('.step-completion-badge')) {
                        const badge = document.createElement('div');
                        badge.className = 'step-completion-badge';
                        badge.textContent = 'Question Complete!';
                        stepHeader.style.position = 'relative';
                        stepHeader.appendChild(badge);
                    }
                }
                
                // Re-render steps to unlock next one
                setTimeout(() => {
                    renderSteps(homeworkData.steps);
                    // Re-attach event listeners after re-render
                    attachStepEventListeners();
                }, 500);
                
                // Unlock next step (legacy support)
                unlockNextStep(stepIndex);
            } else {
                // Wrong answer
                if (stepStates.attempts[stepIndex] >= 2 && !stepStates.revealed[stepIndex]) {
                    // Show reveal answer button after 2 attempts
                    const revealBtn = document.getElementById(`reveal-answer-${stepIndex}`);
                    if (revealBtn) {
                        revealBtn.style.display = 'block';
                    }
                    feedback.textContent = 'Try again';
                    feedback.className = 'step-feedback incorrect';
                    feedback.style.display = 'block';
                } else {
                    // Show try again message
                    feedback.textContent = 'Try again';
                    feedback.className = 'step-feedback incorrect';
                    feedback.style.display = 'block';
                }
            }
        }

        function handleRevealAnswer(e) {
            const revealBtn = e.target.closest('.reveal-answer-btn');
            if (!revealBtn) return;
            const stepIndex = parseInt(revealBtn.getAttribute('data-step-index'), 10);
            if (isNaN(stepIndex)) return;
            const step = homeworkData.steps[stepIndex];
            if (!step) return;
            const correctAnswerRaw = step.correctAnswer || step.expectedAnswer || '';
            const parts = correctAnswerRaw.split('|').map(s => s.trim()).filter(Boolean);
            const primaryAnswer = parts[0] || '—';
            const otherAccepted = parts.length > 1 ? parts.slice(1).join(', ') : '';
            const displayText = `Correct answer: ${primaryAnswer}${otherAccepted ? ` (also accepted: ${otherAccepted})` : ''}`;
            const feedback = document.getElementById(`step-feedback-${stepIndex}`);
            const stepCard = document.getElementById(`step-${stepIndex}`);
            const input = document.getElementById(`step-input-${stepIndex}`);
            const submitBtn = document.getElementById(`step-submit-${stepIndex}`);

            stepStates.revealed[stepIndex] = true;
            if (feedback) {
                feedback.textContent = displayText;
                feedback.className = 'step-feedback revealed';
                feedback.style.display = 'block';
            }
            if (revealBtn) revealBtn.style.display = 'none';
            
            // Disable input and submit
            input.disabled = true;
            submitBtn.disabled = true;
            stepCard.classList.remove('locked');
            
            // Save to question state (mark as completed)
            if (!questionStates[currentQuestionIndex]) {
                questionStates[currentQuestionIndex] = { completedSteps: {}, visualizations: {} };
            }
            if (!questionStates[currentQuestionIndex].completedSteps) {
                questionStates[currentQuestionIndex].completedSteps = {};
            }
            questionStates[currentQuestionIndex].completedSteps[stepIndex] = true;
            if (!questionStates[currentQuestionIndex].stepStates) questionStates[currentQuestionIndex].stepStates = { attempts: {}, completed: {}, revealed: {} };
            if (!questionStates[currentQuestionIndex].stepStates.revealed) questionStates[currentQuestionIndex].stepStates.revealed = {};
            questionStates[currentQuestionIndex].stepStates.revealed[stepIndex] = true;

            // Check if this is the final step of the question
            const isFinalStep = stepIndex === homeworkData.steps.length - 1;
            if (isFinalStep) {
                // Mark this as the final step completion
                stepCard.classList.add('final-step-completed');
                
                // Add completion badge if it doesn't exist
                const stepHeader = stepCard.querySelector('.step-header');
                if (stepHeader && !stepHeader.querySelector('.step-completion-badge')) {
                    const badge = document.createElement('div');
                    badge.className = 'step-completion-badge';
                    badge.textContent = 'Question Complete!';
                    stepHeader.style.position = 'relative';
                    stepHeader.appendChild(badge);
                }
            }
            
            // Re-render steps logic removed to prevent overwriting revealed answer state
            // Next step unlocking is handled by unlockNextStep below
            
            // Unlock next step (legacy support)
            unlockNextStep(stepIndex);
        }

        function unlockNextStep(currentStepIndex) {
            const nextStepIndex = currentStepIndex + 1;
            const nextStepCard = document.getElementById(`step-${nextStepIndex}`);
            if (nextStepCard) {
                nextStepCard.classList.remove('locked');
                const nextInput = document.getElementById(`step-input-${nextStepIndex}`);
                const nextSubmit = document.getElementById(`step-submit-${nextStepIndex}`);
                if (nextInput) nextInput.disabled = false;
                if (nextSubmit) nextSubmit.disabled = false;
                
                // Show loading state first, then check cache or generate
                const nextStep = homeworkData.steps[nextStepIndex];
                const vizEl = document.getElementById(`step-visualization-${nextStepIndex}`);
                
                if (nextStep && vizEl) {
                    // Default to interactive unless explicitly set to image
                    const vizType = nextStep.visualizationType || 'interactive';
                    
                    // Show loading state first
                    if (vizType === 'image' && nextStep.moduleImage) {
                        vizEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Generating image...</p>';
                    } else if (vizType === 'interactive') {
                        vizEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Generating interactive element...</p>';
                    }
                    
                    // Check cache after brief delay
                    const savedState = questionStates[currentQuestionIndex];
                    const cachedViz = savedState && savedState.visualizations && savedState.visualizations[nextStepIndex];
                    
                    if (cachedViz) {
                        // Load from cache with proper script execution
                        setTimeout(() => {
                            const currentVizEl = document.getElementById(`step-visualization-${nextStepIndex}`);
                            if (currentVizEl && (currentVizEl.innerHTML.includes('Generating') || currentVizEl.innerHTML.includes('Loading'))) {
                                console.log(`✅ Loading cached visualization for unlocked step ${nextStepIndex}`);
                                
                                // Parse cached HTML (SAME AS module-viewer.html)
                                const tempDiv = document.createElement('div');
                                tempDiv.innerHTML = cachedViz;
                                const bodyContent = tempDiv.querySelector('body');
                                const styleElements = tempDiv.querySelectorAll('style');
                                
                                currentVizEl.innerHTML = '';
                                styleElements.forEach(style => currentVizEl.appendChild(style.cloneNode(true)));
                                
                                if (bodyContent) {
                                    Array.from(bodyContent.childNodes).forEach(node => {
                                        currentVizEl.appendChild(node.cloneNode(true));
                                    });
                                } else {
                                    currentVizEl.innerHTML = cachedViz;
                                }
                                
                                // Re-execute scripts (CRITICAL FOR INTERACTIVITY!)
                                const scripts = currentVizEl.querySelectorAll('script');
                                scripts.forEach(oldScript => {
                                    const newScript = document.createElement('script');
                                    if (oldScript.src) {
                                        newScript.src = oldScript.src;
                                    } else {
                                        newScript.textContent = oldScript.textContent;
                                    }
                                    currentVizEl.appendChild(newScript);
                                });
                                console.log(`🔧 Re-executed ${scripts.length} scripts for cached step ${nextStepIndex}`);
                            }
                        }, 300);
                    } else if (nextStep.visualization) {
                        // Use pre-loaded visualization (already fetched during module load)
                        setTimeout(() => {
                            const currentVizEl = document.getElementById(`step-visualization-${nextStepIndex}`);
                            if (currentVizEl) {
                                console.log(`✅ [unlockNextStep] Using pre-loaded visualization for step ${nextStepIndex} in IFRAME`);
                                
                                // Use iframe approach to avoid variable conflicts
                                currentVizEl.innerHTML = '';
                                
                                const iframe = document.createElement('iframe');
                                iframe.style.width = '100%';
                                iframe.style.height = '600px'; // Initial height
                                iframe.style.border = 'none';
                                iframe.style.borderRadius = '8px';
                                iframe.sandbox = 'allow-scripts allow-same-origin allow-forms';
                                
                                currentVizEl.appendChild(iframe);
                                
                                // Write HTML directly to iframe
                                iframe.contentDocument.open();
                                iframe.contentDocument.write(nextStep.visualization);
                                iframe.contentDocument.close();
                                
                                // Auto-adjust iframe height to content
                                setTimeout(() => {
                                    try {
                                        const contentHeight = iframe.contentDocument.body.scrollHeight;
                                        iframe.style.height = Math.max(contentHeight + 40, 600) + 'px';
                                    } catch (e) {
                                        console.warn('Could not auto-adjust iframe height:', e);
                                    }
                                }, 500);
                                
                                console.log(`✅ Step ${nextStepIndex} loaded in isolated iframe`);
                                
                                // Cache it
                                if (!questionStates[currentQuestionIndex]) {
                                    questionStates[currentQuestionIndex] = {};
                                }
                                if (!questionStates[currentQuestionIndex].visualizations) {
                                    questionStates[currentQuestionIndex].visualizations = {};
                                }
                                questionStates[currentQuestionIndex].visualizations[nextStepIndex] = nextStep.visualization;
                            }
                        }, 0);
                    } else {
                        // Generate new visualization
                        if (vizType === 'image' && nextStep.moduleImage) {
                            generateStepImage(nextStepIndex, nextStep.moduleImage, vizEl).then(() => {
                                // Save to cache after generation
                                if (!questionStates[currentQuestionIndex]) {
                                    questionStates[currentQuestionIndex] = {};
                                }
                                if (!questionStates[currentQuestionIndex].visualizations) {
                                    questionStates[currentQuestionIndex].visualizations = {};
                                }
                                questionStates[currentQuestionIndex].visualizations[nextStepIndex] = vizEl.innerHTML;
                            });
                        } else if (vizType === 'interactive') {
                            console.log('🚀 [unlockNextStep] Calling generateInteractiveModule for step', nextStepIndex);
                            generateInteractiveModule(nextStepIndex, nextStep, homeworkData.problem).then(() => {
                                // Save to cache after generation
                                if (!questionStates[currentQuestionIndex]) {
                                    questionStates[currentQuestionIndex] = {};
                                }
                                if (!questionStates[currentQuestionIndex].visualizations) {
                                    questionStates[currentQuestionIndex].visualizations = {};
                                }
                                questionStates[currentQuestionIndex].visualizations[nextStepIndex] = vizEl.innerHTML;
                            }).catch(err => {
                                console.error('❌ [unlockNextStep] Error in generateInteractiveModule:', err);
                            });
                        }
                    }
                }
            }
        }

        // Generate interactive module for a step using Gemini
        async function generateInteractiveModule(stepIndex, step, problem, questionIndexOverride = null) {
            const questionIndex = questionIndexOverride !== null ? questionIndexOverride : currentQuestionIndex;
            console.log('🔵 generateInteractiveModule CALLED');
            console.log('Step index:', stepIndex);
            console.log('Question index:', questionIndex);
            console.log('Step data:', step);
            console.log('Problem data:', problem);
            
            const visualizationEl = document.getElementById(`step-visualization-${stepIndex}`);
            console.log('Visualization element found:', !!visualizationEl);
            if (!visualizationEl) {
                console.error('❌ Visualization element not found for step', stepIndex);
                return;
            }

            // Show loading state
            visualizationEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Generating interactive module...</p>';
            console.log('✅ Loading state set');

            const geminiApiKeyMeta = document.querySelector('meta[name="gemini-api-key"]');
            const GEMINI_API_KEY = geminiApiKeyMeta ? geminiApiKeyMeta.getAttribute('content') : '';
            console.log('API key found:', !!GEMINI_API_KEY, 'Length:', GEMINI_API_KEY?.length || 0);
            
            if (!GEMINI_API_KEY) {
                console.error('❌ API key not found');
                visualizationEl.innerHTML = '<p style="color: #dc2626;">API key not found</p>';
                return;
            }

            const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
            console.log('API URL:', GEMINI_API_URL);

            const prompt = `Create ONLY the interactive visualization component (no step UI - explanation/inputs/buttons already exist).

${step.modulePrompt || 'Create an interactive visualization that helps students understand this step.'}

CRITICAL REQUIREMENTS:
- WORKING sliders: Use <input type="range"> with oninput handlers that update visualization instantly
- Modern, clean design: professional colors (#2563eb, #16a34a), shadows, rounded corners, good spacing
- Real-time updates: all controls must update visualization immediately (no delay)
- Fit within 400px height container (max-height: 360px)
- Self-contained: inline <style> and <script> tags only
- Execute immediately: wrap JS in (function(){...})() or use immediate execution
- Event listeners: attach oninput/onchange handlers immediately when script runs
- DO NOT include the problem/question text in the module - only the interactive visualization
- DO NOT include question prompts like "How many...", "What is...", "Solve for..." - these are handled separately
- DO NOT use template variables, placeholders like {variable}, {constant}, or curly braces
- For math expressions: Use proper HTML/CSS rendering, NOT LaTeX dollar signs ($...$)
- If you need to show math: Use HTML entities, Unicode, or plain text (e.g., "2x" not "$2x$", "x²" not "$x^2$")
- Return ONLY HTML/JavaScript code (no markdown, no explanations, no question text, no placeholders)`;

            try {
                // Add timeout to prevent hanging
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    controller.abort();
                    console.error('Interactive module request timed out after 120 seconds');
                }, 120000); // 120 second (2 minute) timeout
                
                console.log('=== Starting Interactive Module Generation ===');
                console.log('Step index:', stepIndex);
                console.log('Step modulePrompt:', step.modulePrompt);
                console.log('Step visualizationType:', step.visualizationType);
                console.log('Prompt length:', prompt.length, 'characters');
                console.log('=== FULL PROMPT BEING SENT ===');
                console.log(prompt);
                console.log('=== END OF PROMPT ===');
                console.log('API URL:', GEMINI_API_URL);
                console.log('Sending request...');
                
                const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: prompt }]
                        }]
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                console.log('Response received:', response.status, response.ok);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('API error response:', errorText);
                    throw new Error(`API error: ${response.status} - ${errorText.substring(0, 100)}`);
                }

                const data = await response.json();
                console.log('=== Interactive Module API Response ===');
                console.log('Full response:', JSON.stringify(data, null, 2));
                console.log('Response structure:', {
                    hasCandidates: !!data.candidates,
                    candidatesLength: data.candidates?.length || 0,
                    firstCandidate: data.candidates?.[0] || null,
                    hasContent: !!data.candidates?.[0]?.content,
                    hasParts: !!data.candidates?.[0]?.content?.parts,
                    partsLength: data.candidates?.[0]?.content?.parts?.length || 0
                });
                
                if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                    let moduleCode = data.candidates[0].content.parts[0].text.trim();
                    console.log('=== Extracted Module Code ===');
                    console.log('Code length:', moduleCode.length);
                    console.log('First 500 chars:', moduleCode.substring(0, 500));
                    console.log('Last 200 chars:', moduleCode.substring(Math.max(0, moduleCode.length - 200)));
                    
                    // Remove markdown code blocks if present
                    if (moduleCode.startsWith('```')) {
                        console.log('Removing markdown code blocks...');
                        const beforeLength = moduleCode.length;
                        moduleCode = moduleCode.replace(/^```html\n?/i, '').replace(/^```\n?/, '').replace(/```\n?$/g, '');
                        console.log('After removing markdown:', moduleCode.length, 'chars (was', beforeLength, ')');
                    }
                    
                    console.log('Final module code length:', moduleCode.length);
                    console.log('Contains <html>:', moduleCode.includes('<html'));
                    console.log('Contains <div>:', moduleCode.includes('<div'));
                    console.log('Contains <script>:', moduleCode.includes('<script'));
                    
                    // Clear container first
                    visualizationEl.innerHTML = '';
                    
                    // Clean the module code: remove question text and fix dollar signs
                    let cleanedModuleCode = moduleCode;
                    
                    // Remove common question patterns (entire sentences/questions)
                    const questionPatterns = [
                        /How many[^<]*?\?/gi,
                        /What is[^<]*?\?/gi,
                        /Solve for[^<]*?\?/gi,
                        /Find[^<]*?\?/gi,
                        /Calculate[^<]*?\?/gi,
                        /Determine[^<]*?\?/gi,
                        /<[^>]*>How many[^<]*?<\/[^>]*>/gi,
                        /<[^>]*>What is[^<]*?<\/[^>]*>/gi
                    ];
                    questionPatterns.forEach(pattern => {
                        cleanedModuleCode = cleanedModuleCode.replace(pattern, '');
                    });
                    
                    // Fix LaTeX dollar signs - smarter handling
                    // Remove dollar signs that are clearly not math (standalone $ or $ with just numbers)
                    cleanedModuleCode = cleanedModuleCode.replace(/\$\s*(\d+)\s*\$/g, '$1'); // $5$ -> 5
                    cleanedModuleCode = cleanedModuleCode.replace(/\$\s*([a-zA-Z])\s*\$/g, '$1'); // $x$ -> x (single letter, no operators)
                    
                    // For expressions like $2x$ or $2x + 5$, keep them for MathJax but ensure proper spacing
                    // MathJax will render these correctly
                    
                    // Remove any orphaned dollar signs (single $ not paired)
                    cleanedModuleCode = cleanedModuleCode.replace(/(?<!\$)\$(?!\$)/g, ''); // Remove single $ not part of $$
                    
                    console.log('🧹 Cleaned module code - removed question text and fixed dollar signs');
                    
                    // Create a wrapper div to isolate the module
                    const wrapper = document.createElement('div');
                    wrapper.style.width = '100%';
                    wrapper.style.height = '100%';
                    wrapper.style.overflow = 'auto';
                    wrapper.style.boxSizing = 'border-box';
                    
                    // Insert the cleaned module code
                    wrapper.innerHTML = cleanedModuleCode;
                    
                    // Append wrapper to container
                    visualizationEl.appendChild(wrapper);
                    
                    // Execute any scripts that were in the HTML
                    const scripts = wrapper.querySelectorAll('script');
                    console.log('Found', scripts.length, 'script tags to execute');
                    scripts.forEach((oldScript, idx) => {
                        console.log(`Executing script ${idx + 1}/${scripts.length}, length:`, oldScript.textContent.length);
                        const newScript = document.createElement('script');
                        Array.from(oldScript.attributes).forEach(attr => {
                            newScript.setAttribute(attr.name, attr.value);
                        });
                        newScript.textContent = oldScript.textContent;
                        oldScript.parentNode.replaceChild(newScript, oldScript);
                    });
                    
                    // Trigger MathJax to render any math in the module
                    if (window.MathJax && window.MathJax.typesetPromise) {
                        window.MathJax.typesetPromise([wrapper]).catch((err) => {
                            console.log('MathJax rendering error in module:', err);
                        });
                    }
                    
                    console.log('=== Module generation complete ===');
                    
                    // Save to cache after successful generation
                    if (visualizationEl.innerHTML && !visualizationEl.innerHTML.includes('Error') && !visualizationEl.innerHTML.includes('Generating')) {
                        if (!questionStates[questionIndex]) {
                            questionStates[questionIndex] = {};
                        }
                        if (!questionStates[questionIndex].visualizations) {
                            questionStates[questionIndex].visualizations = {};
                        }
                        const htmlContent = visualizationEl.innerHTML;
                        questionStates[questionIndex].visualizations[stepIndex] = htmlContent;
                        console.log(`✅ Saved interactive module to cache for step ${stepIndex} of question ${questionIndex + 1}`);
                        
                        // Export component for evaluation pipeline
                        exportComponent({
                            id: `Q${questionIndex + 1}_S${stepIndex + 1}_MODULE`,
                            type: 'interactive_module',
                            questionId: questionIndex,
                            stepId: stepIndex,
                            html: htmlContent,
                            metadata: {
                                stepIndex: stepIndex,
                                source: 'interactive_module'
                            }
                        });
                    }
                } else {
                    console.error('=== API Response Error ===');
                    console.error('Response data:', data);
                    console.error('Missing candidates:', !data.candidates);
                    console.error('Missing first candidate:', !data.candidates?.[0]);
                    console.error('Missing content:', !data.candidates?.[0]?.content);
                    throw new Error('No response from API - check API response structure');
                }
            } catch (error) {
                console.error('=== Error generating interactive module ===');
                console.error('Error name:', error.name);
                console.error('Error message:', error.message);
                console.error('Error stack:', error.stack);
                console.error('Full error object:', error);
                
                if (error.name === 'AbortError') {
                    console.error('Request timed out after 120 seconds');
                    visualizationEl.innerHTML = `<p style="color: #dc2626; text-align: center; padding: 20px;">Request timed out after 2 minutes. Check console for details. Please try refreshing the page.</p>`;
                } else {
                    console.error('Non-timeout error occurred');
                    visualizationEl.innerHTML = `<p style="color: #dc2626; text-align: center; padding: 20px;">Error loading interactive module: ${error.message || 'Unknown error'}. Check console for details. Please try refreshing the page.</p>`;
                }
            }
        }

        // Generate visualization for the overall question
        async function generateQuestionVisualization(problem, questionIndexOverride = null) {
            const questionIndex = questionIndexOverride !== null ? questionIndexOverride : currentQuestionIndex;
            const visualizerEl = document.getElementById('problem-visualizer-content');
            if (!visualizerEl) return;

            // Clear previous visualization first
            visualizerEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Generating visualization...</p>';

            const geminiApiKeyMeta = document.querySelector('meta[name="gemini-api-key"]');
            const GEMINI_API_KEY = geminiApiKeyMeta ? geminiApiKeyMeta.getAttribute('content') : '';
            
            if (!GEMINI_API_KEY) {
                visualizerEl.innerHTML = '<p style="color: #dc2626;">API key not found</p>';
                return;
            }

            try {
                // Use Gemini image-generation model (Nano Banana / 2.5 Flash Image)
                const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';
                const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;

                const imagePrompt = `Create a single educational diagram image that visualizes this homework problem. Do not include any question text, instructions, answers, or solutions in the image.

Title: ${problem.title || 'Homework Problem'}
Description: ${problem.text || 'No description'}

Requirements for the image:
- Show only the problem setup: diagrams, shapes, structures, or relationships mentioned in the problem.
- Include labels only for variables or parts (e.g. w, l, x, r, A, B, C) with arrows where helpful.
- Use clear, readable visuals suitable for a student. No saturated colors; keep it clean and educational.
- If the problem involves geometry, physics, biology, or math, draw the relevant diagram with variable labels but no solved values or final answers.
- Style: simple diagram or illustration, no decorative text, no titles, no "Answer" or "Solution" text.`;

                console.log('🖼️ [PROBLEM VISUALIZATION] Generating image via Gemini image model:', GEMINI_IMAGE_MODEL);
                console.log('📋 Problem title:', problem.title);
                console.log('📝 Problem text (length):', (problem.text || '').length);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 120000);

                const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: imagePrompt }] }],
                        generationConfig: {
                            responseModalities: ['TEXT', 'IMAGE']
                        }
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Image generation error:', response.status, errorText);
                    visualizerEl.innerHTML = `<p style="color: #dc2626; text-align: center; padding: 20px;">Error generating visualization: ${response.status}</p>`;
                    return;
                }

                const data = await response.json();
                const parts = data.candidates?.[0]?.content?.parts;
                if (!parts || !parts.length) {
                    visualizerEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No image in response.</p>';
                    return;
                }

                let imageDataUrl = null;
                let caption = '';
                for (const part of parts) {
                    const inline = part.inlineData || part.inline_data;
                    if (inline && inline.data) {
                        const mime = inline.mimeType || inline.mime_type || 'image/png';
                        imageDataUrl = `data:${mime};base64,${inline.data}`;
                        break;
                    }
                    if (part.text) caption += part.text;
                }

                if (!imageDataUrl) {
                    visualizerEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No image generated. Try again.</p>';
                    return;
                }

                const imgHtml = `<div class="problem-viz-image-wrap"><img src="${imageDataUrl}" alt="Problem diagram" class="problem-viz-image" loading="lazy" decoding="async" /></div>`;
                visualizerEl.innerHTML = imgHtml;

                if (!questionStates[questionIndex]) questionStates[questionIndex] = {};
                questionStates[questionIndex].problemVisualization = imgHtml;
                console.log('✅ Problem visualization (image) saved to cache for question', questionIndex + 1);

                exportComponent({
                    id: `Q${questionIndex + 1}_SVG`,
                    type: 'question_svg',
                    questionId: questionIndex,
                    stepId: null,
                    html: imgHtml,
                    metadata: {
                        title: problem.title || 'Question',
                        text: problem.text || '',
                        source: 'question_visualization_image'
                    }
                });
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.error('Question visualization timed out');
                    visualizerEl.innerHTML = '<p style="color: #dc2626; text-align: center; padding: 20px;">Visualization generation timed out.</p>';
                } else {
                    console.error('Error generating question visualization:', error);
                    visualizerEl.innerHTML = '<p style="color: #dc2626; text-align: center; padding: 20px;">Error generating visualization.</p>';
                }
            }
        }

        // Search Wikimedia Commons for images
        async function searchWikimediaCommons(query, limit = 5) {
            try {
                const apiUrl = 'https://commons.wikimedia.org/w/api.php';
                const params = new URLSearchParams({
                    action: 'query',
                    format: 'json',
                    generator: 'search',
                    gsrsearch: query,
                    gsrnamespace: '6', // File namespace
                    gsrlimit: limit.toString(),
                    prop: 'imageinfo|pageimages',
                    iiprop: 'url|size|mime',
                    iiurlwidth: '800',
                    piprop: 'thumbnail',
                    pithumbsize: '300',
                    origin: '*'
                });

                const response = await fetch(`${apiUrl}?${params.toString()}`);
                if (!response.ok) {
                    throw new Error(`Wikimedia API error: ${response.status}`);
                }

                const data = await response.json();
                const pages = data.query?.pages || {};
                const results = [];

                for (const pageId in pages) {
                    const page = pages[pageId];
                    const imageInfo = page.imageinfo?.[0];
                    if (imageInfo && imageInfo.url) {
                        results.push({
                            title: page.title,
                            url: imageInfo.url,
                            thumbnail: page.thumbnail?.source || imageInfo.thumburl || imageInfo.url,
                            width: imageInfo.width,
                            height: imageInfo.height,
                            mime: imageInfo.mime
                        });
                    }
                }

                return results;
            } catch (error) {
                console.error('Error searching Wikimedia Commons:', error);
                return [];
            }
        }

        // Evaluate images using Gemini to decide which is best or if manual generation is better
        async function evaluateImages(imageDescription, commonsImages) {
            const geminiApiKeyMeta = document.querySelector('meta[name="gemini-api-key"]');
            const GEMINI_API_KEY = geminiApiKeyMeta ? geminiApiKeyMeta.getAttribute('content') : '';
            
            if (!GEMINI_API_KEY) {
                throw new Error('API key not found');
            }

            const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent';

            // Build evaluation prompt
            let prompt = `You are evaluating images from Wikimedia Commons to determine if any are suitable for an educational diagram, or if a custom diagram should be generated instead.

Required Image Description: "${imageDescription}"

Available Wikimedia Commons Images:
`;

            commonsImages.forEach((img, idx) => {
                prompt += `${idx + 1}. Title: ${img.title}\n   URL: ${img.url}\n   Dimensions: ${img.width}x${img.height}\n\n`;
            });

            prompt += `Evaluate these images and respond with ONLY a JSON object in this exact format:
{
  "decision": "use_commons" or "generate_manual",
  "selectedIndex": <0-based index of best image if decision is "use_commons", or null if "generate_manual">,
  "reasoning": "Brief explanation of why this image was selected or why manual generation is better"
}

CRITERIA:
- Use "use_commons" if any image accurately matches the description and is suitable for educational use
- Use "generate_manual" if no images match well, are too complex, missing key details, or would be better as a custom diagram
- REJECT images that contain question text, instructions, answer choices, or any educational text overlays
- REJECT images that are part of worksheets, quizzes, or homework assignments
- Prefer clean, standalone diagrams without any text annotations beyond labels for the structures themselves
- Consider accuracy, clarity, educational value, and completeness
- Prefer images that match the specific details mentioned in the description
- The image should be a pure diagram/illustration, not a document with questions or instructions`;

            try {
                const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: prompt }]
                        }],
                        generationConfig: {
                            maxOutputTokens: 512,
                            temperature: 0.3
                        }
                    })
                });

                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }

                const data = await response.json();
                const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';
                
                // Extract JSON from response (may be wrapped in markdown)
                let jsonText = responseText;
                const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    jsonText = jsonMatch[0];
                }

                const evaluation = JSON.parse(jsonText);
                return evaluation;
            } catch (error) {
                console.error('Error evaluating images:', error);
                // Default to manual generation on error
                return {
                    decision: 'generate_manual',
                    selectedIndex: null,
                    reasoning: 'Error during evaluation, defaulting to manual generation'
                };
            }
        }

        // Generate image for a step - tries Wikimedia Commons first, then falls back to manual generation
        async function generateStepImage(stepIndex, imageDescription, visualizationEl, questionIndexOverride = null) {
            const questionIndex = questionIndexOverride !== null ? questionIndexOverride : currentQuestionIndex;
            if (!visualizationEl) return;

            const geminiApiKeyMeta = document.querySelector('meta[name="gemini-api-key"]');
            const GEMINI_API_KEY = geminiApiKeyMeta ? geminiApiKeyMeta.getAttribute('content') : '';
            
            if (!GEMINI_API_KEY) {
                visualizationEl.innerHTML = '<p style="color: #dc2626;">API key not found</p>';
                return;
            }

            visualizationEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Searching for images...</p>';

            try {
                // Step 1: Search Wikimedia Commons
                console.log('Searching Wikimedia Commons for:', imageDescription);
                const searchQuery = imageDescription.substring(0, 100); // Use first 100 chars as search query
                const commonsImages = await searchWikimediaCommons(searchQuery, 5);
                
                if (commonsImages.length > 0) {
                    console.log(`Found ${commonsImages.length} images from Wikimedia Commons`);
                    
                    // Step 2: Evaluate images using Gemini
                    visualizationEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Evaluating images...</p>';
                    const evaluation = await evaluateImages(imageDescription, commonsImages);
                    
                    console.log('Image evaluation result:', evaluation);
                    
                    // Step 3: Use best Commons image or generate manually
                    if (evaluation.decision === 'use_commons' && 
                        evaluation.selectedIndex !== null && 
                        commonsImages[evaluation.selectedIndex]) {
                        const selectedImage = commonsImages[evaluation.selectedIndex];
                        console.log('Using Wikimedia Commons image:', selectedImage.title);
                        
                        // Display the Commons image
                        visualizationEl.innerHTML = `
                            <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 10px; overflow: auto;">
                                <img src="${selectedImage.url}" 
                                     alt="${selectedImage.title}" 
                                     style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px;"
                                     onerror="this.parentElement.innerHTML='<p style=\\'color: #dc2626;\\'>Error loading image</p>'">
                            </div>
                        `;
                        
                        // Save to cache after displaying
                        if (!questionStates[questionIndex]) {
                            questionStates[questionIndex] = {};
                        }
                        if (!questionStates[questionIndex].visualizations) {
                            questionStates[questionIndex].visualizations = {};
                        }
                        questionStates[questionIndex].visualizations[stepIndex] = visualizationEl.innerHTML;
                        return;
                    }
                }

                // Step 4: Generate manually using Gemini (fallback or if no good Commons images)
                console.log('Generating image manually using Gemini');
                visualizationEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Generating custom diagram...</p>';
                
                await generateManualImage(stepIndex, imageDescription, visualizationEl, GEMINI_API_KEY, questionIndex);
                
                // Save to cache after generation (already done in generateManualImage, but keep as backup)
                if (visualizationEl.innerHTML && !visualizationEl.innerHTML.includes('Error') && !visualizationEl.innerHTML.includes('Generating')) {
                    if (!questionStates[questionIndex]) {
                        questionStates[questionIndex] = {};
                    }
                    if (!questionStates[questionIndex].visualizations) {
                        questionStates[questionIndex].visualizations = {};
                    }
                    const htmlContent = visualizationEl.innerHTML;
                    questionStates[questionIndex].visualizations[stepIndex] = htmlContent;
                    
                    // Export component for evaluation pipeline
                    exportComponent({
                        id: `Q${questionIndex + 1}_S${stepIndex + 1}_IMG`,
                        type: 'step_image',
                        questionId: questionIndex,
                        stepId: stepIndex,
                        html: htmlContent,
                        metadata: {
                            stepIndex: stepIndex,
                            source: 'wikimedia_commons_image'
                        }
                    });
                }
                
            } catch (error) {
                console.error('Error in generateStepImage:', error);
                console.error('Error details:', error.message, error.stack);
                // Fallback to manual generation on any error
                try {
                    await generateManualImage(stepIndex, imageDescription, visualizationEl, GEMINI_API_KEY, questionIndex);
                    
                    // Save to cache after successful fallback generation (already done in generateManualImage, but keep as backup)
                    if (visualizationEl.innerHTML && !visualizationEl.innerHTML.includes('Error') && !visualizationEl.innerHTML.includes('Generating')) {
                        if (!questionStates[questionIndex]) {
                            questionStates[questionIndex] = {};
                        }
                        if (!questionStates[questionIndex].visualizations) {
                            questionStates[questionIndex].visualizations = {};
                        }
                        questionStates[questionIndex].visualizations[stepIndex] = visualizationEl.innerHTML;
                    }
                } catch (fallbackError) {
                    console.error('Fallback generation also failed:', fallbackError);
                    console.error('Fallback error details:', fallbackError.message, fallbackError.stack);
                    const errorMsg = fallbackError.message || 'Unknown error';
                    visualizationEl.innerHTML = `<p style="color: #dc2626; text-align: center; padding: 20px;">Error generating image: ${errorMsg}</p>`;
                }
            }
        }

        // Generate image manually using Gemini (creates SVG)
        async function generateManualImage(stepIndex, imageDescription, visualizationEl, GEMINI_API_KEY, questionIndexOverride = null) {
            const questionIndex = questionIndexOverride !== null ? questionIndexOverride : currentQuestionIndex;
            const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent';
            
            // Clean the image description to remove any answer/solution text that might have been included
            let cleanedDescription = imageDescription;
            
            // Remove common answer/solution patterns
            const answerPatterns = [
                /final\s+(?:answer|solution|dimensions?|result):?\s*[^\n]*/gi,
                /answer:?\s*[^\n]*/gi,
                /solution:?\s*[^\n]*/gi,
                /final\s+dimensions?:?\s*[^\n]*/gi,
                /w\s*=\s*\d+[^\n]*/gi,  // Remove solved values like "w = 8m"
                /l\s*=\s*\d+[^\n]*/gi,  // Remove solved values like "l = 19m"
                /problem\s+setup\s+&?\s+solution\s+path:?[^\n]*/gi,
                /step\s+\d+:?\s*[^\n]*(?:answer|solution|final)[^\n]*/gi,
            ];
            
            answerPatterns.forEach(pattern => {
                cleanedDescription = cleanedDescription.replace(pattern, '');
            });
            
            // Remove any text that looks like it contains solved numerical answers
            cleanedDescription = cleanedDescription.replace(/\b(?:equals?|is|are)\s+\d+[^\n]*/gi, '');
            
            // Trim and clean up extra whitespace
            cleanedDescription = cleanedDescription.trim().replace(/\n\s*\n\s*\n/g, '\n\n');
            
            console.log('🔵 Original image description length:', imageDescription.length);
            console.log('🔵 Cleaned image description length:', cleanedDescription.length);
            
            // Detailed prompt for image generation
            const prompt = `You are creating ONLY a diagram illustration. Generate a detailed, accurate SVG diagram based on this description: ${cleanedDescription}

CRITICAL REQUIREMENTS - READ CAREFULLY:
- Return ONLY the SVG code (no markdown, no explanations, no code blocks, no text outside SVG)
- Use viewBox="0 0 500 500" or appropriate dimensions
- Include ALL visual details mentioned in the description (structures, colors, shapes, internal folds, etc.)
- Use appropriate colors and styling to make structures clearly visible
- Add labels ONLY for variables or structures (e.g., "w", "l", "x", "A", "B", "C" as letters pointing to structures with arrows)
- DO NOT include ANY of the following in the image:
  * Question text (e.g., "What is...", "Identify...", "Answer...")
  * Instructions (e.g., "Study the diagram", "Answer the questions")
  * Titles or headers (e.g., "Cell Structure Identification", "Garden Dimensions Problem")
  * Answer blanks or lines
  * Any educational worksheet text
  * SOLUTIONS OR ANSWERS (e.g., "Final Dimensions: w = 8m, l = 19m", "Answer:", "Solution:", "Final Answer:", etc.)
  * Solved numerical values (e.g., "8m", "19m" as answers - only show variables like "w" and "2w+3")
  * Text boxes with answers
  * Any text that reveals the solution to the problem
  * Problem setup text that includes solutions
- The diagram should show the PROBLEM SETUP ONLY - variables, relationships, what's given - NOT the solution
- For math problems: Show variables (w, l, x, etc.) and expressions (2w+3, etc.) but NOT the solved values
- The diagram should be a PURE illustration - just the visual diagram with variable/structure labels
- Make it scientifically/educationally accurate
- Ensure all parts described are visible and clearly rendered
- NO TEXT ELEMENTS except variable labels (w, l, x, y) or structure labels (A, B, C) with arrows
- NO answers, NO solutions, NO final values

The SVG should contain ONLY the diagram illustration showing the problem setup, nothing else.`;

            // LOG THE EXACT PROMPT BEING SENT
            console.log('═══════════════════════════════════════════════════════════');
            console.log('🖼️ [STEP IMAGE GENERATION] EXACT PROMPT BEING SENT TO API:');
            console.log('═══════════════════════════════════════════════════════════');
            console.log(prompt);
            console.log('═══════════════════════════════════════════════════════════');
            console.log('📊 Prompt length:', prompt.length, 'characters');
            console.log('📋 Step index:', stepIndex);
            console.log('📝 Original image description:', imageDescription);
            console.log('🧹 Cleaned image description:', cleanedDescription);
            console.log('📏 Description length - Original:', imageDescription.length, '| Cleaned:', cleanedDescription.length);
            console.log('═══════════════════════════════════════════════════════════');

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second (2 minute) timeout
            
            console.log('Generating image for step', stepIndex);
            
            const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        maxOutputTokens: 2048, // Limit output for faster response
                        temperature: 0.7
                    }
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            console.log('Image generation response:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API error response:', errorText);
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            console.log('Image generation response status:', response.status);
            console.log('Image generation response data:', data);
            
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                let svgCode = data.candidates[0].content.parts[0].text.trim();
                
                // LOG THE RAW RESPONSE
                console.log('═══════════════════════════════════════════════════════════');
                console.log('🖼️ [STEP IMAGE GENERATION] RAW SVG CODE FROM API:');
                console.log('═══════════════════════════════════════════════════════════');
                console.log('📏 Raw SVG length:', svgCode.length, 'characters');
                console.log('📄 First 500 characters:', svgCode.substring(0, 500));
                console.log('📄 Last 500 characters:', svgCode.substring(Math.max(0, svgCode.length - 500)));
                console.log('═══════════════════════════════════════════════════════════');
                
                // Remove markdown code blocks if present
                if (svgCode.startsWith('```')) {
                    console.log('⚠️ SVG code starts with markdown code block, cleaning...');
                    svgCode = svgCode.replace(/^```svg\n?/i, '').replace(/^```\n?/, '').replace(/```\n?$/g, '');
                }
                
                // Extract SVG if it's wrapped in other text
                const svgMatch = svgCode.match(/<svg[\s\S]*?<\/svg>/i);
                if (svgMatch) {
                    console.log('⚠️ SVG code wrapped in other text, extracting...');
                    svgCode = svgMatch[0];
                }
                
                // Check for solution text in the SVG
                const solutionPatterns = [
                    /solution:/i,
                    /answer:/i,
                    /final.*answer/i,
                    /final.*dimensions/i,
                    /≈\s*\d+\.?\d*/,
                    /=\s*\d+\.?\d*/,
                    /formula:/i
                ];
                const foundSolutions = solutionPatterns.filter(pattern => pattern.test(svgCode));
                if (foundSolutions.length > 0) {
                    console.log('ℹ️ SVG contains mathematical notation (will be evaluated by QA)');
                }
                
                // Ensure SVG has proper attributes
                if (!svgCode.includes('viewBox')) {
                    svgCode = svgCode.replace(/<svg/i, '<svg viewBox="0 0 500 500" preserveAspectRatio="xMidYMid meet"');
                }
                if (!svgCode.includes('width')) {
                    svgCode = svgCode.replace(/<svg/i, '<svg width="100%" height="100%"');
                }
                
                // LOG FINAL PROCESSED SVG
                console.log('═══════════════════════════════════════════════════════════');
                console.log('🖼️ [STEP IMAGE GENERATION] FINAL PROCESSED SVG:');
                console.log('═══════════════════════════════════════════════════════════');
                console.log('📏 Final SVG length:', svgCode.length, 'characters');
                console.log('📄 Full SVG code:', svgCode);
                console.log('═══════════════════════════════════════════════════════════');
                
                // Display the SVG
                visualizationEl.innerHTML = `
                    <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 10px; overflow: auto;">
                        ${svgCode}
                    </div>
                `;
                
                // Save to cache after displaying
                if (!questionStates[questionIndex]) {
                    questionStates[questionIndex] = {};
                }
                if (!questionStates[questionIndex].visualizations) {
                    questionStates[questionIndex].visualizations = {};
                }
                const htmlContent = visualizationEl.innerHTML;
                questionStates[questionIndex].visualizations[stepIndex] = htmlContent;
                console.log(`✅ Saved generated image to cache for step ${stepIndex} of question ${questionIndex + 1}`);
                
                // Export component for evaluation pipeline
                exportComponent({
                    id: `Q${questionIndex + 1}_S${stepIndex + 1}_IMG`,
                    type: 'step_image',
                    questionId: questionIndex,
                    stepId: stepIndex,
                    html: htmlContent,
                    metadata: {
                        imageDescription: imageDescription,
                        stepIndex: stepIndex,
                        source: 'generated_step_image'
                    }
                });
            } else {
                throw new Error('No SVG generated from API');
            }
        }

        // Set homework data from external source (JSON)
        function setHomeworkData(data, addAsNewQuestion = false) {
            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    console.error('Invalid JSON data:', e);
                    return;
                }
            }
            
            if (addAsNewQuestion) {
                addQuestion(data);
            } else {
                // Replace current question
                if (questions.length === 0) {
                    questions.push(data);
                } else {
                    questions[currentQuestionIndex] = data;
                }
                loadHomework(data);
            }
        }

        // Update step explanation HTML content
        function updateStepExplanation(stepIndex, htmlContent) {
            const explanationEl = document.getElementById(`step-explanation-${stepIndex}`);
            if (explanationEl) {
                // Process markdown bold before setting HTML
                htmlContent = processMarkdownBold(htmlContent);
                explanationEl.innerHTML = htmlContent;
                // Trigger MathJax to render math notation
                const renderMath = () => {
                    if (window.MathJax && window.MathJax.typesetPromise) {
                        window.MathJax.typesetPromise([explanationEl]).catch((err) => {
                            console.log('MathJax rendering error:', err);
                        });
                    } else if (window.MathJax && window.MathJax.startup) {
                        window.MathJax.startup.promise.then(() => {
                            if (window.MathJax.typesetPromise) {
                                window.MathJax.typesetPromise([explanationEl]).catch((err) => {
                                    console.log('MathJax rendering error:', err);
                                });
                            }
                        });
                    }
                };
                // Small delay to ensure DOM is updated
                setTimeout(renderMath, 100);
            }
        }

        // Update step visualization HTML content
        function updateStepVisualization(stepIndex, htmlContent) {
            const visualizationEl = document.getElementById(`step-visualization-${stepIndex}`);
            if (visualizationEl) {
                visualizationEl.innerHTML = htmlContent;
            }
        }

        // Get step container element
        function getStepContainer(stepIndex) {
            return document.getElementById(`step-${stepIndex}`);
        }

        // Audio controls (kept for video section)
        function toggleVideoAudio() {
            const audio = document.getElementById('video-audio');
            const btn = document.getElementById('video-audio-btn');
            
            if (audio.paused) {
                audio.play();
                btn.textContent = '⏸️ Pause';
            } else {
                audio.pause();
                btn.textContent = '🔊 Video Audio';
            }
        }

        // Audio button handlers - play audio explanation for each step
        const audioStates = new Map(); // Track audio state per step
        const audioElements = new Map(); // Store audio elements per step

        document.addEventListener('click', async (e) => {
            if (e.target.closest('.step-microphone-button')) {
                const button = e.target.closest('.step-microphone-button');
                const stepIndex = parseInt(button.getAttribute('data-step-index'));
                const step = homeworkData.steps[stepIndex];
                
                if (!step) return;

                // Check if audio is already playing
                const currentAudio = audioElements.get(stepIndex);
                if (currentAudio) {
                    if (currentAudio.type === 'audio' && currentAudio.element) {
                        // HTML audio element
                        if (!currentAudio.element.paused) {
                            currentAudio.element.pause();
                            currentAudio.element.currentTime = 0;
                            button.classList.remove('playing');
                            button.title = 'Listen to explanation';
                            return;
                        }
                    } else if (currentAudio.type === 'speech' && window.speechSynthesis) {
                        // Browser TTS
                        if (window.speechSynthesis.speaking) {
                            window.speechSynthesis.cancel();
                            button.classList.remove('playing');
                            button.title = 'Listen to explanation';
                            return;
                        }
                    }
                }

                // Generate and play audio
                await playStepAudio(stepIndex, step, button);
            }
        });

        // Feeling stuck? — open resources modal (delegated so it works for dynamic steps)
        document.addEventListener('click', async (e) => {
            if (e.target.closest('.step-resources-button')) {
                await handleResourcesClick(e);
            }
        });

        // Gemini 2.5 TTS (primary) / Supabase proxy (optional) / browser TTS fallback
        const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
        const GEMINI_TTS_VOICE = (() => {
            const meta = document.querySelector('meta[name="gemini-tts-voice"]');
            return (meta && meta.getAttribute('content')) || 'Kore';
        })();
        
        // Get Supabase configuration from meta tags or use defaults
        function getSupabaseConfig() {
            const supabaseUrlMeta = document.querySelector('meta[name="supabase-url"]');
            const supabaseKeyMeta = document.querySelector('meta[name="supabase-anon-key"]');
            
            const supabaseUrl = supabaseUrlMeta ? supabaseUrlMeta.getAttribute('content') : '';
            let supabaseKey = supabaseKeyMeta ? supabaseKeyMeta.getAttribute('content') : '';
            
            // Trim any whitespace that might have been accidentally added
            if (supabaseKey) {
                supabaseKey = supabaseKey.trim();
            }
            
            // Log configuration for debugging
            console.log('🎥 [YOUTUBE] Config check - URL:', supabaseUrl ? 'Present' : 'MISSING');
            console.log('🎥 [YOUTUBE] Config check - Key:', supabaseKey ? `Present (${supabaseKey.length} chars)` : 'MISSING');
            console.log('🎥 [YOUTUBE] Key starts with:', supabaseKey ? supabaseKey.substring(0, 20) + '...' : 'N/A');
            
            // Check if key looks valid (JWT tokens are typically long)
            if (supabaseKey && supabaseKey.length < 50) {
                console.warn('🎥 [YOUTUBE] Warning: API key seems too short, might be invalid');
            }
            
            // Verify it's a JWT token (should start with eyJ)
            if (supabaseKey && !supabaseKey.startsWith('eyJ')) {
                console.warn('🎥 [YOUTUBE] Warning: API key does not appear to be a valid JWT token (should start with "eyJ")');
            }
            
            return { supabaseUrl, supabaseKey };
        }
        
        // Build TTS proxy URL from Supabase configuration (optional; used when no Gemini key)
        function getTTSProxyURL() {
            const { supabaseUrl } = getSupabaseConfig();
            if (supabaseUrl) {
                const baseUrl = supabaseUrl.replace(/\/$/, '');
                return `${baseUrl}/functions/v1/tts`;
            }
            return '';
        }
        
        const TTS_PROXY_URL = getTTSProxyURL();
        
        // Gemini API key for Gemini 2.5 TTS (same key as for chat)
        function getGeminiTTSApiKey() {
            const ttsApiKeyMeta = document.querySelector('meta[name="tts-api-key"]');
            if (ttsApiKeyMeta) return ttsApiKeyMeta.getAttribute('content');
            const geminiApiKeyMeta = document.querySelector('meta[name="gemini-api-key"]');
            return geminiApiKeyMeta ? geminiApiKeyMeta.getAttribute('content') : '';
        }
        
        // Cache for generated audio URLs
        const audioCache = new Map();
        
        // Build WAV blob from PCM bytes (16-bit mono 24kHz, matching generate.py)
        function pcmToWavBlob(pcmBytes) {
            const sampleRate = 24000;
            const numChannels = 1;
            const bitsPerSample = 16;
            const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
            const dataSize = pcmBytes.length;
            const headerSize = 44;
            const buffer = new ArrayBuffer(headerSize + dataSize);
            const view = new DataView(buffer);
            const writeStr = (offset, str) => {
                for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
            };
            writeStr(0, 'RIFF');
            view.setUint32(4, 36 + dataSize, true);
            writeStr(8, 'WAVE');
            writeStr(12, 'fmt ');
            view.setUint32(16, 16, true); // chunk size
            view.setUint16(20, 1, true);  // PCM
            view.setUint16(22, numChannels, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, byteRate, true);
            view.setUint16(32, numChannels * (bitsPerSample / 8), true);
            view.setUint16(34, bitsPerSample, true);
            writeStr(36, 'data');
            view.setUint32(40, dataSize, true);
            new Uint8Array(buffer).set(pcmBytes, headerSize);
            return new Blob([buffer], { type: 'audio/wav' });
        }
        
        // Generate audio using Gemini 2.5 TTS (preferred) or proxy fallback
        async function generateTTSAudio(text, questionIndex, stepIndex) {
            const cacheKey = `q${questionIndex}-s${stepIndex}`;
            if (audioCache.has(cacheKey)) {
                return audioCache.get(cacheKey);
            }
            
            const geminiKey = getGeminiTTSApiKey();
            
            if (!geminiKey && !TTS_PROXY_URL) {
                console.warn('No Gemini API key or TTS proxy configured. Using browser TTS fallback.');
                return null;
            }
            
            try {
                let audioUrl;
                
                // Prefer Gemini 2.5 TTS when API key is available
                if (geminiKey) {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`;
                    const payload = {
                        contents: [{ parts: [{ text: text }] }],
                        generationConfig: {
                            responseModalities: ['AUDIO'],
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE }
                                }
                            }
                        }
                    };
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (!response.ok) {
                        const err = await response.text();
                        throw new Error(`Gemini TTS: ${response.status} ${err}`);
                    }
                    const data = await response.json();
                    const candidates = (data && data.candidates) || [];
                    const parts = (candidates[0] && candidates[0].content && candidates[0].content.parts) || [];
                    const inlineData = (parts[0] && parts[0].inlineData) || {};
                    const b64 = inlineData.data;
                    if (!b64) {
                        const reason = (data.promptFeedback && data.promptFeedback.blockReason) || 'no audio in response';
                        throw new Error(`Gemini TTS: ${reason}`);
                    }
                    const binary = atob(b64);
                    const pcmBytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) pcmBytes[i] = binary.charCodeAt(i);
                    const wavBlob = pcmToWavBlob(pcmBytes);
                    audioUrl = URL.createObjectURL(wavBlob);
                } else if (TTS_PROXY_URL) {
                    // Proxy fallback (proxy should use Gemini TTS or return WAV/MP3)
                    const { supabaseKey } = getSupabaseConfig();
                    const headers = { 'Content-Type': 'application/json' };
                    if (supabaseKey) {
                        headers['Authorization'] = `Bearer ${supabaseKey}`;
                        headers['apikey'] = supabaseKey;
                    }
                    const response = await fetch(TTS_PROXY_URL, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({
                            text: text,
                            voiceName: GEMINI_TTS_VOICE,
                            model: GEMINI_TTS_MODEL
                        })
                    });
                    if (!response.ok) throw new Error(`TTS proxy: ${response.statusText}`);
                    const blob = await response.blob();
                    audioUrl = URL.createObjectURL(blob);
                }
                
                if (audioUrl) {
                    audioCache.set(cacheKey, audioUrl);
                    return audioUrl;
                }
                return null;
            } catch (error) {
                console.error('Error generating TTS audio:', error);
                return null;
            }
        }
        
        // Generate and embed audio for a step
        async function generateAndEmbedStepAudio(questionIndex, stepIndex, step) {
            const audioText = step.audioExplanation || step.explanation || 'No explanation available.';
            
            if (!audioText || audioText.trim() === '') {
                return;
            }
            
            try {
                // Generate audio URL
                const audioUrl = await generateTTSAudio(audioText, questionIndex, stepIndex);
                
                if (audioUrl) {
                    // Create or update audio element
                    let audioEl = document.getElementById(`step-audio-element-${stepIndex}`);
                    if (!audioEl) {
                        audioEl = document.createElement('audio');
                        audioEl.id = `step-audio-element-${stepIndex}`;
                        audioEl.preload = 'auto';
                        audioEl.style.display = 'none';
                        
                        // Find the step card and append audio element
                        const stepCard = document.getElementById(`step-${stepIndex}`);
                        if (stepCard) {
                            stepCard.appendChild(audioEl);
                        }
                    }
                    
                    audioEl.src = audioUrl;
                    audioEl.load();
                    
                    // Store in audioElements map
                    audioElements.set(stepIndex, { element: audioEl, type: 'audio' });
                    
                    console.log(`✅ Audio generated and embedded for step ${stepIndex}`);
                } else {
                    // Fallback to browser TTS
                    console.log(`⚠️ Using browser TTS fallback for step ${stepIndex}`);
                }
            } catch (error) {
                console.error(`Error generating audio for step ${stepIndex}:`, error);
            }
        }
        
        // Play step audio (using embedded audio or fallback)
        async function playStepAudio(stepIndex, step, button) {
            // Get the audio explanation text
            const audioText = step.audioExplanation || step.explanation || 'No explanation available.';
            const questionIndex = currentQuestionIndex;
            
            // Show loading state
            button.classList.add('loading');
            button.title = 'Generating audio...';
            
            try {
                // Check if we have embedded audio
                const cachedAudio = audioElements.get(stepIndex);
                
                if (cachedAudio && cachedAudio.type === 'audio' && cachedAudio.element) {
                    // Use embedded audio
                    const audioEl = cachedAudio.element;
                    
                    // Stop any currently playing audio
                    document.querySelectorAll('audio').forEach(a => {
                        if (a !== audioEl && !a.paused) {
                            a.pause();
                            a.currentTime = 0;
                        }
                    });
                    
                    // Reset button states
                    document.querySelectorAll('.step-microphone-button').forEach(btn => {
                        if (btn !== button) {
                            btn.classList.remove('playing');
                        }
                    });
                    
                    if (audioEl.paused) {
                        audioEl.play();
                        button.classList.remove('loading');
                        button.classList.add('playing');
                        button.title = 'Playing... Click to stop';
                        
                        audioEl.onended = () => {
                            button.classList.remove('playing');
                            button.title = 'Listen to explanation';
                        };
                        
                        audioEl.onerror = () => {
                            button.classList.remove('loading', 'playing');
                            button.title = 'Listen to explanation';
                            // Fallback to browser TTS
                            playBrowserTTS(audioText, button, stepIndex);
                        };
                    } else {
                        audioEl.pause();
                        audioEl.currentTime = 0;
                        button.classList.remove('playing');
                        button.title = 'Listen to explanation';
                    }
                } else {
                    // Generate audio on demand if not already generated
                    const audioUrl = await generateTTSAudio(audioText, questionIndex, stepIndex);
                    
                    if (audioUrl) {
                        // Create audio element
                        const audioEl = document.createElement('audio');
                        audioEl.src = audioUrl;
                        audioEl.preload = 'auto';
                        
                        // Stop any currently playing audio
                        document.querySelectorAll('audio').forEach(a => {
                            if (a !== audioEl && !a.paused) {
                                a.pause();
                                a.currentTime = 0;
                            }
                        });
                        
                        // Reset button states
                        document.querySelectorAll('.step-microphone-button').forEach(btn => {
                            if (btn !== button) {
                                btn.classList.remove('playing');
                            }
                        });
                        
                        audioEl.play();
                        button.classList.remove('loading');
                        button.classList.add('playing');
                        button.title = 'Playing... Click to stop';
                        
                        audioEl.onended = () => {
                            button.classList.remove('playing');
                            button.title = 'Listen to explanation';
                        };
                        
                        audioEl.onerror = () => {
                            button.classList.remove('loading', 'playing');
                            button.title = 'Listen to explanation';
                            // Fallback to browser TTS
                            playBrowserTTS(audioText, button, stepIndex);
                        };
                        
                        // Store audio element
                        const stepCard = document.getElementById(`step-${stepIndex}`);
                        if (stepCard) {
                            stepCard.appendChild(audioEl);
                        }
                        audioElements.set(stepIndex, { element: audioEl, type: 'audio' });
                    } else {
                        // Fallback to browser TTS
                        playBrowserTTS(audioText, button, stepIndex);
                    }
                }
            } catch (error) {
                console.error('Error playing audio:', error);
                button.classList.remove('loading', 'playing');
                button.title = 'Listen to explanation';
                // Fallback to browser TTS
                playBrowserTTS(audioText, button, stepIndex);
            }
        }
        
        // Fallback: Browser TTS
        function playBrowserTTS(audioText, button, stepIndex) {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                
                const utterance = new SpeechSynthesisUtterance(audioText);
                utterance.rate = 0.9;
                utterance.pitch = 1;
                utterance.volume = 1;
                
                const voices = window.speechSynthesis.getVoices();
                const preferredVoice = voices.find(voice => 
                    voice.name.includes('Google') || 
                    voice.name.includes('English') ||
                    voice.lang.startsWith('en')
                );
                if (preferredVoice) {
                    utterance.voice = preferredVoice;
                }
                
                utterance.onstart = () => {
                    button.classList.remove('loading');
                    button.classList.add('playing');
                    button.title = 'Playing... Click to stop';
                };
                
                utterance.onend = () => {
                    button.classList.remove('playing');
                    button.title = 'Listen to explanation';
                };
                
                utterance.onerror = (error) => {
                    console.error('Speech synthesis error:', error);
                    button.classList.remove('loading', 'playing');
                    button.title = 'Listen to explanation';
                    alert('Error playing audio. Please try again.');
                };
                
                window.speechSynthesis.speak(utterance);
                audioElements.set(stepIndex, { utterance, type: 'speech' });
            } else {
                button.classList.remove('loading', 'playing');
                button.title = 'Listen to explanation';
                alert('Audio playback not supported in this browser.');
            }
        }

        // Load voices when available
        if ('speechSynthesis' in window) {
            window.speechSynthesis.onvoiceschanged = () => {
                // Voices loaded
            };
        }

        // Gemini Live Streaming Client (using Server-Sent Events)
        class GeminiLiveClient {
            constructor({ apiKey, model = 'gemini-3-flash-preview' }) {
                this.apiKey = apiKey;
                this.model = model;
                this.isConnected = false;
                this.deltaHandlers = [];
                this.finalHandlers = [];
                this.errorHandlers = [];
                this.conversationHistory = [];
            }

            connect() {
                // For SSE streaming, we don't need a persistent connection
                // Connection is established per request
                this.isConnected = true;
                updateChatbotStatus('live', 'Live');
                return Promise.resolve();
            }

            sendText(text, context = null) {
                if (!this.apiKey) {
                    throw new Error('API key not set');
                }

                // Build conversation history
                this.conversationHistory.push({ role: 'user', parts: [{ text }] });

                // Add context if provided
                let systemInstruction = "You are a live study tutor. Ask short guiding questions. Provide hints, not full solutions unless asked.";
                if (context) {
                    systemInstruction += `\n\n[Current step context]: ${typeof context === 'string' ? context : JSON.stringify(context)}`;
                }

                const requestBody = {
                    contents: this.conversationHistory,
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2048,
                    },
                    systemInstruction: {
                        parts: [{ text: systemInstruction }]
                    }
                };

                // Use streaming endpoint
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?key=${this.apiKey}`;
                
                return fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                }).then(response => {
                    console.log('Streaming API response status:', response.status);
                    if (!response.ok) {
                        return response.text().then(text => {
                            console.error('API error response:', text);
                            throw new Error(`API error: ${response.status} - ${text.substring(0, 200)}`);
                        });
                    }
                    return this.handleStreamResponse(response);
                }).catch(error => {
                    console.error('Fetch error in sendText:', error);
                    throw error;
                });
            }

            async handleStreamResponse(response) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let fullText = '';
                let hasReceivedData = false;

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });
                        buffer += chunk;
                        hasReceivedData = true;
                        
                        // Gemini streaming API returns NDJSON (newline-delimited JSON)
                        // Process complete lines (ending with \n)
                        let newlineIndex;
                        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                            const line = buffer.slice(0, newlineIndex);
                            buffer = buffer.slice(newlineIndex + 1);
                            
                            const trimmedLine = line.trim();
                            if (!trimmedLine) continue;
                            
                            try {
                                const json = JSON.parse(trimmedLine);
                                
                                // Handle streaming candidates
                                if (json.candidates && json.candidates[0]) {
                                    const candidate = json.candidates[0];
                                    if (candidate.content && candidate.content.parts) {
                                        candidate.content.parts.forEach(part => {
                                            if (part.text) {
                                                const delta = part.text;
                                                fullText += delta;
                                                this.deltaHandlers.forEach(handler => handler(delta));
                                            }
                                        });
                                    }
                                }
                                
                                // Also check for finishReason to know when stream is complete
                                if (json.candidates && json.candidates[0] && json.candidates[0].finishReason) {
                                    console.log('Stream finished with reason:', json.candidates[0].finishReason);
                                }
                                
                                // Handle errors in response
                                if (json.error) {
                                    throw new Error(json.error.message || 'API error');
                                }
                            } catch (e) {
                                // If it's an API error, throw it
                                if (e.message && e.message.includes('API error')) {
                                    throw e;
                                }
                                // JSON parse errors are expected for incomplete chunks
                                // These will be processed in the next iteration
                            }
                        }
                    }

                    // Process any remaining buffer (last line without newline)
                    if (buffer.trim()) {
                        try {
                            const json = JSON.parse(buffer.trim());
                            if (json.candidates && json.candidates[0]) {
                                const candidate = json.candidates[0];
                                if (candidate.content && candidate.content.parts) {
                                    candidate.content.parts.forEach(part => {
                                        if (part.text) {
                                            const delta = part.text;
                                            fullText += delta;
                                            this.deltaHandlers.forEach(handler => handler(delta));
                                        }
                                    });
                                }
                            }
                            if (json.error) {
                                throw new Error(json.error.message || 'API error');
                            }
                        } catch (e) {
                            if (e.message && e.message.includes('API error')) {
                                throw e;
                            }
                            // If remaining buffer can't be parsed, it might be incomplete
                            // This is okay - we've already processed what we could
                        }
                    }

                    // Finalize - only throw error if we received data but no text
                    if (hasReceivedData && !fullText) {
                        console.error('Received data but no text extracted. Buffer:', buffer.substring(0, 500));
                        // Throw error to trigger fallback
                        throw new Error('No response received from API');
                    }

                    if (fullText) {
                        this.conversationHistory.push({ role: 'model', parts: [{ text: fullText }] });
                        this.finalHandlers.forEach(handler => handler(fullText));
                    } else if (!hasReceivedData) {
                        // No data received at all - might be an empty response
                        console.warn('No data received from streaming API');
                    }
                } catch (error) {
                    console.error('Stream handling error:', error);
                    this.handleError(error);
                    throw error;
                }
            }

            onDelta(handler) {
                this.deltaHandlers.push(handler);
            }

            onFinal(handler) {
                this.finalHandlers.push(handler);
            }

            onError(handler) {
                this.errorHandlers.push(handler);
            }

            handleError(error) {
                this.errorHandlers.forEach(handler => handler(error));
            }

            disconnect() {
                this.isConnected = false;
            }
        }

        // Module Modal Functionality
        const moduleModal = document.getElementById('module-modal');
        const moduleModalBody = document.getElementById('module-modal-body');
        const moduleModalTitle = document.getElementById('module-modal-title');
        const moduleModalClose = document.getElementById('module-modal-close');

        function openModuleModal(stepIndex) {
            const stepData = homeworkData?.steps?.[stepIndex];
            
            if (!stepData) {
                console.error('Step data not found for index:', stepIndex);
                return;
            }
            
            console.log('🔍 Opening modal for step', stepIndex);
            
            // Set modal title
            moduleModalTitle.textContent = `Step ${stepIndex + 1} - Interactive Module`;
            
            // Get the original HTML content
            const originalHTML = stepData.visualization;
            
            if (!originalHTML) {
                console.error('No visualization content for step', stepIndex);
                moduleModalBody.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">No interactive content available.</p>';
                moduleModal.classList.add('show');
                document.body.style.overflow = 'hidden';
                return;
            }
            
            // Clear modal body
            moduleModalBody.innerHTML = '';
            
            // Create iframe for isolated sandbox environment (same as step cards)
            const iframe = document.createElement('iframe');
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            iframe.style.borderRadius = '8px';
            iframe.sandbox = 'allow-scripts allow-same-origin allow-forms';
            
            moduleModalBody.appendChild(iframe);
            
            // Write content to iframe
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(originalHTML);
            iframeDoc.close();
            
            console.log('✅ Modal content loaded in iframe');
            
            // Show modal
            moduleModal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }

        function closeModuleModal() {
            moduleModal.classList.remove('show');
            moduleModalBody.innerHTML = '';
            document.body.style.overflow = '';
        }

        // Close button
        if (moduleModalClose) {
            moduleModalClose.addEventListener('click', closeModuleModal);
        }

        // Close on outside click
        if (moduleModal) {
            moduleModal.addEventListener('click', (e) => {
                if (e.target === moduleModal) {
                    closeModuleModal();
                }
            });
        }

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && moduleModal.classList.contains('show')) {
                closeModuleModal();
            }
        });

        // Update fullscreen button to open modal instead
        function toggleVisualizationFullscreen(stepIndex) {
            openModuleModal(stepIndex);
        }
        
        // Gemini Chatbot with Live Streaming
        const geminiApiKeyMeta = document.querySelector('meta[name="gemini-api-key"]');
        const GEMINI_API_KEY = geminiApiKeyMeta ? geminiApiKeyMeta.getAttribute('content') : '';
        const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

        const chatbotButton = document.getElementById('chatbot-button');
        const chatbotPanel = document.getElementById('chatbot-panel');
        const chatbotClose = document.getElementById('chatbot-close');
        const chatbotMessages = document.getElementById('chatbot-messages');
        const chatbotInput = document.getElementById('chatbot-input');
        const chatbotSend = document.getElementById('chatbot-send');
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');

        // Auto-resize textarea function - grows without internal scrolling
        function autoResizeTextarea() {
            if (!chatbotInput) return;
            
            // Temporarily set height to auto to get accurate scrollHeight
            const currentHeight = chatbotInput.style.height;
            chatbotInput.style.height = 'auto';
            
            // Calculate new height based on content
            const scrollHeight = chatbotInput.scrollHeight;
            const minHeight = 44;
            const newHeight = Math.max(minHeight, scrollHeight);
            
            // Set the new height
            chatbotInput.style.height = newHeight + 'px';
        }

        let liveClient = null;
        let currentBotMessage = null;
        let conversationHistory = [];

        // Update chatbot status indicator
        function updateChatbotStatus(status, text) {
            if (statusDot) {
                statusDot.className = `status-dot ${status}`;
            }
            if (statusText) {
                statusText.textContent = text;
            }
        }

        // Initialize live connection when panel opens
        chatbotButton.addEventListener('click', async () => {
            chatbotPanel.classList.toggle('open');
            
            // Auto-connect when panel opens (if not already connected)
            if (chatbotPanel.classList.contains('open') && !liveClient && GEMINI_API_KEY) {
                await connectLiveChat();
            }
        });

        chatbotClose.addEventListener('click', () => {
            chatbotPanel.classList.remove('open');
        });

        // Connect to live streaming
        async function connectLiveChat() {
            if (!GEMINI_API_KEY) {
                addMessage('Please set your Gemini API key in the meta tag.', false);
                return;
            }

            if (liveClient && liveClient.isConnected) {
                return; // Already connected
            }

            updateChatbotStatus('connecting', 'Connecting...');

            try {
                liveClient = new GeminiLiveClient({ apiKey: GEMINI_API_KEY });
                
                // Setup streaming handlers
                liveClient.onDelta((delta) => {
                    if (!currentBotMessage) {
                        currentBotMessage = createBotMessage();
                    }
                    appendToMessage(delta);
                });

                liveClient.onFinal((text) => {
                    if (currentBotMessage) {
                        currentBotMessage.classList.remove('streaming');
                        
                        // Format the complete message with math
                        const formattedText = formatMathMessage(currentBotMessage.textContent);
                        currentBotMessage.innerHTML = formattedText;
                        
                        // Render math with MathJax
                        if (window.MathJax && window.MathJax.typesetPromise) {
                            window.MathJax.typesetPromise([currentBotMessage]).catch(err => 
                                console.warn('MathJax rendering error:', err)
                            );
                        }
                        
                        currentBotMessage = null;
                    }
                });

                liveClient.onError((error) => {
                    console.error('Live chat error:', error);
                    // Don't show error to user - will fall back to standard API
                    updateChatbotStatus('offline', 'Offline');
                });

                await liveClient.connect();
            } catch (error) {
                updateChatbotStatus('error', 'Error');
                addMessage('Failed to connect to live chat. Falling back to standard API.', false);
                console.error('Failed to connect:', error);
                liveClient = null;
            }
        }

        function createBotMessage() {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chatbot-message bot streaming';
            messageDiv.textContent = '';
            chatbotMessages.appendChild(messageDiv);
            chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
            return messageDiv;
        }

        function appendToMessage(text) {
            if (currentBotMessage) {
                currentBotMessage.textContent += text;
                chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
            }
        }

        function formatMathMessage(text) {
            // Convert LaTeX delimiters and preserve math
            let formatted = text
                // Protect display math: $$...$$ or \[...\]
                .replace(/\$\$([\s\S]*?)\$\$/g, '\\[$1\\]')
                // Protect inline math: $...$ or \(...\)
                .replace(/\$([^\$\n]+?)\$/g, '\\($1\\)')
                // Convert **bold** markdown
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                // Convert *italic* markdown
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                // Convert bullet points
                .replace(/^[*-]\s+(.+)$/gm, '• $1')
                // Preserve newlines
                .replace(/\n/g, '<br>');
            
            return formatted;
        }

        function addMessage(text, isUser) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `chatbot-message ${isUser ? 'user' : 'bot'}`;
            
            if (isUser) {
                // User messages: plain text
                messageDiv.textContent = text;
            } else {
                // Bot messages: format math and render with MathJax
                messageDiv.innerHTML = formatMathMessage(text);
                
                // Render math with MathJax
                if (window.MathJax && window.MathJax.typesetPromise) {
                    window.MathJax.typesetPromise([messageDiv]).catch(err => 
                        console.warn('MathJax rendering error:', err)
                    );
                }
            }
            
            chatbotMessages.appendChild(messageDiv);
            chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
        }

        async function sendMessage(messageText = null) {
            // If messageText is an event object, ignore it and use input value
            if (messageText && typeof messageText === 'object' && messageText.type) {
                messageText = null;
            }
            const message = messageText || chatbotInput.value.trim();
            console.log('sendMessage called with:', message);
            if (!message) {
                console.log('No message, returning early');
                return;
            }
            
            // Clear input after getting the message
            chatbotInput.value = '';
            autoResizeTextarea();
            chatbotSend.disabled = true;
            addMessage(message, true);
            console.log('Message added to chat:', message);

            // Build comprehensive context about the current problem
            let contextMessage = message;
            if (homeworkData && homeworkData.problem) {
                const problemText = homeworkData.problem.text || '';
                const problemTitle = homeworkData.problem.title || 'Homework Problem';
                const currentStepIndex = getCurrentActiveStep();
                
                // Add problem context to every message
                contextMessage = `I'm working on this problem: "${problemTitle}"\n\nProblem: ${problemText}\n\n`;
                
                // Add current step context if available
                if (currentStepIndex !== null && homeworkData.steps && homeworkData.steps[currentStepIndex]) {
                    const step = homeworkData.steps[currentStepIndex];
                    contextMessage += `I'm on Step ${currentStepIndex + 1}: ${step.explanation || ''}\n\n`;
                }
                
                // Add user's actual question
                contextMessage += `My question: ${message}`;
            }
            
            // Use contextMessage for API calls
            const messageToSend = contextMessage;

            // Try live streaming first
            if (liveClient && liveClient.isConnected) {
                try {
                    // Create bot message container before sending
                    if (!currentBotMessage) {
                        currentBotMessage = createBotMessage();
                    }
                    console.log('Sending via live client:', messageToSend);
                    await liveClient.sendText(messageToSend);
                    // If we get here without error, streaming worked
                    chatbotSend.disabled = false;
                    chatbotInput.focus();
                    return;
                } catch (error) {
                    console.error('Live send error:', error);
                    // Remove streaming message if it exists but is empty
                    if (currentBotMessage && !currentBotMessage.textContent.trim()) {
                        currentBotMessage.remove();
                        currentBotMessage = null;
                    }
                    // Show error and fall back to standard API
                    console.log('Falling back to standard API due to streaming error:', error.message);
                    // Don't return - fall through to standard API
                }
            }

            // Fallback to standard API (or use if live client not available)
            if (!GEMINI_API_KEY) {
                addMessage('Please set your Gemini API key.', false);
                chatbotSend.disabled = false;
                return;
            }

            conversationHistory.push({ role: 'user', parts: [{ text: messageToSend }] });

            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'chatbot-message bot loading';
            loadingDiv.innerHTML = '<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>';
            loadingDiv.id = 'loading-message';
            chatbotMessages.appendChild(loadingDiv);
            chatbotMessages.scrollTop = chatbotMessages.scrollHeight;

            try {
                const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: conversationHistory })
                });

                document.getElementById('loading-message').remove();

                if (!response.ok) throw new Error(`API error: ${response.status}`);

                const data = await response.json();
                if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                    const botResponse = data.candidates[0].content.parts[0].text;
                    addMessage(botResponse, false);
                    conversationHistory.push({ role: 'model', parts: [{ text: botResponse }] });
                } else {
                    addMessage('Sorry, I encountered an error. Please try again.', false);
                }
            } catch (error) {
                document.getElementById('loading-message')?.remove();
                addMessage('Sorry, I encountered an error. Please try again.', false);
                console.error('Gemini API error:', error);
            } finally {
                chatbotSend.disabled = false;
                chatbotInput.focus();
            }
        }

        // Get current active step index
        function getCurrentActiveStep() {
            if (!homeworkData || !homeworkData.steps) return null;
            // Find the first incomplete step
            for (let i = 0; i < homeworkData.steps.length; i++) {
                if (!stepStates.completed[i] && !stepStates.revealed[i]) {
                    return i;
                }
            }
            // If all completed, return last step
            return homeworkData.steps.length > 0 ? homeworkData.steps.length - 1 : null;
        }

        chatbotSend.addEventListener('click', (e) => {
            e.preventDefault();
            sendMessage();
        });
        
        // Auto-resize textarea on input - ensure element exists
        if (chatbotInput) {
            chatbotInput.addEventListener('input', autoResizeTextarea);
            chatbotInput.addEventListener('paste', () => {
                setTimeout(autoResizeTextarea, 0);
            });
            chatbotInput.addEventListener('keydown', (e) => {
                // Resize on Enter (but don't send if Shift is held)
                if (e.key === 'Enter' && !e.shiftKey) {
                    setTimeout(autoResizeTextarea, 0);
                } else {
                    setTimeout(autoResizeTextarea, 0);
                }
            });
            
            // Initial resize
            setTimeout(autoResizeTextarea, 100);
        }

        // Initialize status
        updateChatbotStatus('offline', 'Offline');

        // Text Selection - Ask Gemini Feature (popup only when user selects text on the question)
        const askGeminiTooltip = document.createElement('div');
        askGeminiTooltip.className = 'ask-gemini-tooltip';
        askGeminiTooltip.setAttribute('role', 'button');
        askGeminiTooltip.setAttribute('aria-label', 'Ask Gemini about selection');
        askGeminiTooltip.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 6px;">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            Ask Gemini
        `;
        askGeminiTooltip.style.display = 'none';
        document.body.appendChild(askGeminiTooltip);

        let selectedText = '';

        function showAskGeminiTooltip(x, y, text) {
            selectedText = text;
            // Store text in data attribute so it persists even if selectedText gets cleared
            askGeminiTooltip.setAttribute('data-selected-text', text);
            askGeminiTooltip.style.display = 'flex';
            
            // Set initial position to calculate size
            askGeminiTooltip.style.left = '-1000px'; 
            askGeminiTooltip.style.top = '-1000px';
            
            const tooltipRect = askGeminiTooltip.getBoundingClientRect();
            const halfWidth = tooltipRect.width / 2;
            
            let finalX = x - halfWidth;
            let finalY = y - tooltipRect.height - 12; // 12px above selection
            
            // Ensure tooltip stays within viewport horizontally
            if (finalX < 10) {
                finalX = 10;
            } else if (finalX + tooltipRect.width > window.innerWidth - 10) {
                finalX = window.innerWidth - tooltipRect.width - 10;
            }
            
            // Ensure tooltip stays within viewport vertically
            if (finalY < 10) {
                finalY = y + 20; // Show below selection if not enough space above
            }
            
            askGeminiTooltip.style.left = `${finalX}px`;
            askGeminiTooltip.style.top = `${finalY}px`;
        }

        function hideAskGeminiTooltip() {
            askGeminiTooltip.style.display = 'none';
            selectedText = '';
            // Don't clear data attribute here - let click handler use it first
        }

        // Handle text selection
        document.addEventListener('mouseup', (e) => {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (text.length > 0 && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const clientRects = range.getClientRects();
                if (clientRects.length > 0) {
                    // Use the first rect to position at the top of the selection
                    const firstRect = clientRects[0];
                    const x = firstRect.left + firstRect.width / 2;
                    const y = firstRect.top;

                    showAskGeminiTooltip(x, y, text);
                }
            } else {
                hideAskGeminiTooltip();
            }
        });

        // Hide tooltip when clicking elsewhere (but don't interfere with text selection)
        document.addEventListener('mousedown', (e) => {
            if (!askGeminiTooltip.contains(e.target)) {
                // Only hide tooltip, don't clear selection - let the browser handle that naturally
                hideAskGeminiTooltip();
            }
        });

        // Prevent mousedown on tooltip from clearing selection
        askGeminiTooltip.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        // Handle click on "Ask Gemini" tooltip
        askGeminiTooltip.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Get text from data attribute (most reliable), then fallback to selectedText, then selection
            const text = askGeminiTooltip.getAttribute('data-selected-text') || 
                        selectedText || 
                        window.getSelection().toString().trim();
            
            console.log('Click handler - text from data attr:', askGeminiTooltip.getAttribute('data-selected-text'));
            console.log('Click handler - selectedText variable:', selectedText);
            console.log('Click handler - selection:', window.getSelection().toString().trim());
            console.log('Click handler - final text:', text);
            
            if (!text) {
                console.warn('No text selected!');
                return;
            }
            
            if (!chatbotInput || !chatbotPanel) {
                console.error('Chatbot elements not found');
                return;
            }
            
            // Clear the data attribute and hide tooltip
            askGeminiTooltip.removeAttribute('data-selected-text');
            hideAskGeminiTooltip();
            window.getSelection().removeAllRanges();
            
            // Open chatbot panel
            chatbotPanel.classList.add('open');
            
            // Connect if not already connected
            if (!liveClient && GEMINI_API_KEY) {
                await connectLiveChat();
            }
            
            // Wait a tiny bit for panel to open
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Create the message
            const message = `Can you explain this: "${text}"`;
            
            // Paste message into input so user can edit or add follow-up questions
            chatbotInput.value = message;
            autoResizeTextarea();
            chatbotInput.focus();
            
            // Place cursor at the end so user can continue typing
            chatbotInput.setSelectionRange(chatbotInput.value.length, chatbotInput.value.length);
        });

        // Initialize on load - DISABLED (now using loadHomeworkFromModule instead)
        // console.log('🟢 SCRIPT LOADED - About to call init()');
        // init();
        console.log('✅ homework-app.js loaded - waiting for loadHomeworkFromModule()');
