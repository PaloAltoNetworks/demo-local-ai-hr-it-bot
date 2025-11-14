const axios = require('axios');
const { t } = require('./i18n');
const { getLogger } = require('./logger');

/**
 * Prisma AIRS API Intercept Module
 * Handles security analysis of prompts and responses using Palo Alto Networks AIRS API
 */

class PrismaAIRSIntercept {
    constructor(config) {
        this.config = {
            apiUrl: config.apiUrl || 'https://service.api.aisecurity.paloaltonetworks.com',
            apiToken: config.apiToken, // x-pan-token
            profileId: config.profileId,
            profileName: config.profileName
        };
    }

    /**
     * Check if Prisma AIRS is properly configured
     * @returns {boolean}
     */
    isConfigured() {
        return !!(this.config.apiToken && (this.config.profileId || this.config.profileName));
    }

    /**
     * Generate detailed error message based on AIRS detections
     * @param {Object} result - AIRS API result
     * @param {string} type - 'prompt' or 'response'
     * @param {string} language - Language for the message ('en' or other supported languages)
     * @returns {string} Detailed error message
     */
    _generateBlockedMessage(result, type = 'prompt', language = 'en') {
        // Build detailed message based on detections
        const detections = type === 'prompt' ? result.prompt_detected : result.response_detected;
        const detectedIssues = [];
        
        if (detections) {
            if (detections.injection) detectedIssues.push(t('security.detections.injection', { lng: language }));
            if (detections.toxic_content) detectedIssues.push(t('security.detections.toxicContent', { lng: language }));
            if (detections.malicious_code) detectedIssues.push(t('security.detections.maliciousCode', { lng: language }));
            if (detections.dlp) detectedIssues.push(t('security.detections.dataLeak', { lng: language }));
            if (detections.topic_violation) detectedIssues.push(t('security.detections.topicViolation', { lng: language }));
            if (detections.url_cats) detectedIssues.push(t('security.detections.urlCategory', { lng: language }));
            if (detections.agent) detectedIssues.push(t('security.detections.suspiciousAgent', { lng: language }));
            if (detections.ungrounded && type === 'response') detectedIssues.push(t('security.detections.ungrounded', { lng: language }));
            if (detections.db_security && type === 'response') detectedIssues.push(t('security.detections.dbSecurity', { lng: language }));
        }
        
        let message = type === 'prompt' 
            ? t('security.messages.cannotProcessRequest', { lng: language })
            : t('security.messages.cannotProvideResponse', { lng: language });
            
        if (detectedIssues.length > 0) {
            message += ' ' + t('security.messages.containsIssues', { issues: detectedIssues.join(', '), lng: language });
        } else {
            message += ' ' + t('security.messages.policyViolation', { lng: language });
        }
        
        message += ' ' + (type === 'prompt' 
            ? t('security.messages.rephraseRequest', { lng: language })
            : t('security.messages.helpWithElse', { lng: language }));
            
        return message;
    }

    /**
     * Analyze content with Prisma AIRS API
     * @param {string} prompt - The user prompt (required)
     * @param {string} response - The AI response (optional, for response analysis)
     * @param {Object} metadata - Dynamic metadata from the request
     * @returns {Promise<Object>} Analysis result
     */
    async analyzeContent(prompt, response = null, metadata = {}) {
        try {
            // Check if Prisma AIRS is configured
            if (!this.isConfigured()) {
                getLogger().info('❌ Prisma AIRS not configured - missing API token or profile ID/name');
                
                const configErrorMessage = t('security.errors.notConfigured', { lng: metadata.language || 'en' });
                
                return { 
                    approved: false, 
                    content: { prompt, response }, 
                    message: configErrorMessage,
                    configError: true,
                    category: 'configuration_error',
                    action: 'block'
                };
            }

            const analysisType = response ? 'prompt and response' : 'prompt only';
            getLogger().info(`Prisma AIRS intercept - analyzing ${analysisType}`);

            // Prepare the request payload for Prisma AIRS API
            const payload = {
                tr_id: metadata.trId || Date.now().toString(), // Transaction ID
                ai_profile: {
                    ...(this.config.profileId ? { profile_id: this.config.profileId } : {}),
                    ...(this.config.profileName ? { profile_name: this.config.profileName } : {})
                },
                metadata: {
                    ...(metadata.appName ? { app_name: metadata.appName } : { app_name: "theotter-unknown" }),
                    ...(metadata.appUser ? { app_user: metadata.appUser } : { app_user: "user" }),
                    ...(metadata.aiModel ? { ai_model: metadata.aiModel } : { ai_model: "gemma3:1b" }),
                    ...(metadata.userIp ? { user_ip: metadata.userIp } : { user_ip: "127.0.0.1" })
                },
                contents: [
                    {
                        prompt: prompt,
                        ...(response && { response: response }),
                        ...(metadata.codePrompt && { code_prompt: metadata.codePrompt }),
                        ...(metadata.codeResponse && { code_response: metadata.codeResponse })
                        // Contextual Grounding disabled for now
                        // ...(metadata.context && { context: metadata.context })
                    }
                ]
            };

            // Make the API call to Prisma AIRS
            const axiosConfig = {
                method: 'post',
                maxBodyLength: Infinity,
                url: `${this.config.apiUrl}/v1/scan/sync/request`,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'x-pan-token': this.config.apiToken
                },
                data: payload,
                timeout: 15000 // 15 second timeout
            };

            getLogger().info('Sending request to Prisma AIRS API:', JSON.stringify(payload, null, 2));

            const apiResponse = await axios.request(axiosConfig);
            const result = apiResponse.data;
            
            getLogger().info('Prisma AIRS analysis result:', {
                action: result.action,
                category: result.category,
                reportId: result.report_id,
                result: result
            });

            // Check the action field to determine if content is approved
            const approved = result.action === 'allow';

            return {
                approved: approved,
                action: result.action,
                category: result.category,
                reportId: result.report_id,
                promptDetected: result.prompt_detected,
                responseDetected: result.response_detected,
                maskedData: {
                    prompt: result.prompt_masked_data,
                    response: result.response_masked_data
                },
                message: approved 
                    ? t('security.messages.contentApproved', { lng: metadata.language || 'en' })
                    : this._generateBlockedMessage(result, response ? 'response' : 'prompt', metadata.language || 'en'),
                // Include raw API payloads for checkpoint display
                __raw_request_payload: payload,
                __raw_response_payload: result
            };

        } catch (error) {
            getLogger().error('❌ Prisma AIRS intercept error:', error.message);
            
            const errorMessage = t('security.errors.serviceUnavailable', { lng: metadata.language || 'en' });
            
            // Return error - MUST block the request when AIRS fails
            return {
                approved: false,
                error: error.message,
                message: errorMessage,
                category: 'service_error',
                action: 'block',
                apiError: true,
                __raw_request_payload: payload,
                __error_details: {
                    message: error.message,
                    response: error.response?.data || null
                }
            };
        }
    }

    /**
     * Analyze a user prompt only
     * @param {string} prompt - The user prompt to analyze
     * @param {Object} metadata - Dynamic metadata from the request
     * @returns {Promise<Object>} Analysis result
     */
    async analyzePrompt(prompt, metadata = {}) {
        return this.analyzeContent(prompt, null, metadata);
    }

    /**
     * Analyze both prompt and response together
     * @param {string} prompt - The user prompt
     * @param {string} response - The AI response to analyze
     * @param {Object} metadata - Dynamic metadata from the request
     * @returns {Promise<Object>} Analysis result
     */
    async analyzePromptAndResponse(prompt, response, metadata = {}) {
        return this.analyzeContent(prompt, response, metadata);
    }
}

/**
 * Helper function to check if Prisma AIRS should be used for this phase
 * @param {string} phase - The current phase
 * @returns {boolean}
 */
function shouldUsePrismaAIRS(phase) {
    return phase === 'phase3';
}

module.exports = {
    PrismaAIRSIntercept,
    shouldUsePrismaAIRS
};