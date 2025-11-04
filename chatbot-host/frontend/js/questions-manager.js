/**
 * Questions Manager for handling example questions
 */
export class QuestionsManager {
    constructor(i18n, uiManager) {
        this.i18n = i18n;
        this.uiManager = uiManager;
        this.language = i18n.currentLanguage;
        this.currentPhase = 'phase1'; // Track current phase for refresh action
    }

    /**
     * Get questions for current language and phase
     */
    getQuestions(phase) {
        try {
            // Get questions from i18n translations
            const questions = this.i18n.t(`questions.${phase}`);
            if (!questions || !Array.isArray(questions)) {
                console.warn(`No questions found for phase: ${phase} in language: ${this.language}`);
                return [];
            }
            return questions;
        } catch (error) {
            console.error(`Error getting questions for phase ${phase}:`, error);
            return [];
        }
    }

    /**
     * Render example questions
     */
    renderQuestions(phase) {
        this.currentPhase = phase; // Store current phase
        const questionsContainer = this.uiManager.elements.questionsContainer;
        if (!questionsContainer) return;

        const questions = this.getQuestions(phase);
        
        // Clear existing questions
        questionsContainer.innerHTML = '';
        
        if (questions.length === 0) {
            console.warn(`No questions available for phase ${phase} in language ${this.language}`);
            return;
        }
        
        // Create question elements
        const fragment = document.createDocumentFragment();
        questions.forEach(question => {
            // Check if this is a subgroup (has a 'questions' property)
            if (question.questions && Array.isArray(question.questions)) {
                const subgroupElement = this.createSubgroupElement(question);
                fragment.appendChild(subgroupElement);
            } else {
                const questionElement = this.createQuestionElement(question);
                fragment.appendChild(questionElement);
            }
        });
        
        questionsContainer.appendChild(fragment);
    }

    /**
     * Create a subgroup element with nested questions
     */
    createSubgroupElement(subgroup) {
        const subgroupDiv = document.createElement('div');
        subgroupDiv.className = 'questions-subgroup';
        
        // Create subgroup header
        const header = document.createElement('div');
        header.className = 'subgroup-header';
        header.innerHTML = `<h3><i class="${subgroup.icon}"></i>${subgroup.title}</h3>`;
        subgroupDiv.appendChild(header);
        
        // Create nested questions container
        const questionsContainer = document.createElement('div');
        questionsContainer.className = 'subgroup-questions';
        
        subgroup.questions.forEach(question => {
            const questionElement = this.createQuestionElement(question);
            questionsContainer.appendChild(questionElement);
        });
        
        subgroupDiv.appendChild(questionsContainer);
        return subgroupDiv;
    }

    /**
     * Create a question element
     */
    createQuestionElement(question) {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'example-question';
        
        // Check if this is an action question (like refresh)
        if (question.action === 'refresh') {
            questionDiv.classList.add('action-question');
            questionDiv.setAttribute('data-action', 'refresh');
        } else {
            questionDiv.setAttribute('data-question', question.text);
        }
        
        questionDiv.innerHTML = `
            <h4><i class="${question.icon}"></i>${question.title}</h4>
            <p>${question.text}</p>
        `;

        questionDiv.addEventListener('click', () => {
            if (question.action === 'refresh') {
                // Save current phase to sessionStorage before refreshing
                sessionStorage.setItem('returnToPhase', this.currentPhase);
                // Refresh the page instead of sending a message
                window.location.reload();
            } else {
                this.uiManager.setUserInput(question.text);
            }
        });

        return questionDiv;
    }

    /**
     * Update language
     */
    setLanguage(language) {
        this.language = language;
        // Update the current language from i18n service
        if (this.i18n) {
            this.language = this.i18n.currentLanguage;
        }
    }
}
