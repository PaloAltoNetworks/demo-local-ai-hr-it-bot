/**
 * Questions Manager for handling example questions
 */
export class QuestionsManager {
    constructor(i18n, uiManager) {
        this.i18n = i18n;
        this.uiManager = uiManager;
        this.language = i18n.currentLanguage;
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
            const questionElement = this.createQuestionElement(question);
            fragment.appendChild(questionElement);
        });
        
        questionsContainer.appendChild(fragment);
    }

    /**
     * Create a question element
     */
    createQuestionElement(question) {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'example-question';
        questionDiv.setAttribute('data-question', question.text);
        
        questionDiv.innerHTML = `
            <i class="${question.icon}"></i>
            <h4>${question.title}</h4>
            <p>${question.text}</p>
        `;

        questionDiv.addEventListener('click', () => {
            this.uiManager.setUserInput(question.text);
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
