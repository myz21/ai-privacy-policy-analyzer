import * as localAi from "./localAi";
import OpenAI from 'openai';

const ui = {
    startAnalysisButton: document.getElementById('start-analysis') as HTMLButtonElement,
    statusDisplay: document.getElementById('status') as HTMLElement,
    loadingSpinner: document.getElementById('spinner') as HTMLElement,
    privacyLink: document.getElementById('privacy-url') as HTMLAnchorElement,
    analysisResult: document.getElementById('result-content') as HTMLElement,
    localModelTab: document.getElementById('local-model-tab') as HTMLButtonElement,
    chatModelTab: document.getElementById('chat-gpt-tab') as HTMLButtonElement,
    localModelContent: document.getElementById('local-model-content') as HTMLDivElement,
    chatModelContent: document.getElementById('chat-gpt-content') as HTMLDivElement,
    apiKeyInput: document.getElementById('api-key') as HTMLInputElement,
    apiBaseUrlInput: document.getElementById('api-base-url') as HTMLInputElement,
    apiModelInput: document.getElementById('api-model') as HTMLInputElement,
};

let selectedModelType = 'local-model';
let privacyPolicy = '';
let analysisResult = '';
let userApiKey = '';
let userApiBaseUrl = '';
let userApiModel = '';
let openAiClient: OpenAI | null = null;

const buildPrompt = (policy: string) => {
    const outputFormat = `
    A short summary of the privacy policy and its implications, followed by a list of points:
    <ul>
        <li>Specific observation or <span style="color:red">critique</span> of the privacy policy</li>
        <li>Another observation or critique</li>
        <li>Continue listing points as necessary</li>
        <li>Each point should follow this structure for consistency</li>
        <li>You can use <span>, <b>, <i> tags with colors to draw focus</li>
    </ul>
    `;

    return `Analyze the following privacy policy, identifying its shortcomings, vague terms, potential risks to user privacy, and any negative aspects. List these as specific points in a concise, non-technical language that is accessible to users. The output MUST STRICTLY follow this format:

    ${outputFormat}

    Here is the policy text:
    ${policy}`;
};


const updateResult = (newToken: string) => {
    analysisResult += newToken;
    ui.analysisResult.innerHTML = analysisResult;
}

const initializeOpenAiClient = () => {
    if (userApiKey) {
        const config: any = { apiKey: userApiKey, dangerouslyAllowBrowser: true };
        if (userApiBaseUrl) config.baseURL = userApiBaseUrl;
        openAiClient = new OpenAI(config);
    }
};

const analyzePolicy = async () => {
    analysisResult = '';
    ui.startAnalysisButton.disabled = true;
    toggleVisibility(ui.loadingSpinner, true);
    updateStatus('Analyzing privacy policy...');

    ui.analysisResult.innerHTML = '';

    try {
        if (selectedModelType === 'local-model') {
            await analyzeLocal();
        } else {
            await analyzeChat();
        }
        updateStatus('Analysis complete.');
        ui.startAnalysisButton.disabled = false;
    } catch (error) {
        console.error('Error analyzing privacy policy:', error);
        updateStatus('Error analyzing privacy policy.');
    } finally {
        await saveResultToCache();
        toggleVisibility(ui.loadingSpinner, false);
    }
};

const analyzeLocal = async () => {
    await localAi.chatStream(buildPrompt(privacyPolicy), false, response => {
        updateResult(response);
    });
};

const analyzeChat = async () => {
    if (!openAiClient) throw new Error('OpenAI client not initialized');
    const stream = await openAiClient.chat.completions.create({
        model: userApiModel || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: buildPrompt(privacyPolicy) }],
        stream: true,
    });
    for await (const chunk of stream) {
        updateResult(chunk.choices[0]?.delta?.content || '');
    }
};

const saveResultToCache = async () => {
    const domain = await getCurrentTabDomain();
    if (domain) saveToCache(domain, analysisResult);
};

const toggleVisibility = (element: HTMLElement, isVisible: boolean) => {
    element.style.display = isVisible ? 'block' : 'none';
};

const updateStatus = (text: string) => (ui.statusDisplay.textContent = text);

const setupEventListeners = () => {
    ui.startAnalysisButton.addEventListener('click', analyzePolicy);

    ui.apiKeyInput.addEventListener('input', () => {
        userApiKey = ui.apiKeyInput.value.trim();
        ui.startAnalysisButton.disabled = !userApiKey;
        initializeOpenAiClient();
    });

    ui.apiBaseUrlInput.addEventListener('input', () => {
        userApiBaseUrl = ui.apiBaseUrlInput.value.trim();
        initializeOpenAiClient();
    });

    ui.apiModelInput.addEventListener('input', () => {
        userApiModel = ui.apiModelInput.value.trim();
    });

    [ui.localModelTab, ui.chatModelTab].forEach(tab =>
        tab.addEventListener('click', () => {
            selectedModelType = tab === ui.chatModelTab ? 'chat-gpt' : 'local-model';
            switchModelTab(selectedModelType);
        })
    );
};

const switchModelTab = (modelType: string) => {
    const { localModelTab, chatModelTab, localModelContent, chatModelContent, startAnalysisButton } = ui;
    const isChatModel = modelType === 'chat-gpt';
    startAnalysisButton.disabled = !privacyPolicy || (isChatModel && !userApiKey);

    [localModelTab, chatModelTab].forEach(tab => tab.classList.toggle('active', tab === (isChatModel ? chatModelTab : localModelTab)));
    [localModelContent, chatModelContent].forEach(content => content.classList.toggle('active', content === (isChatModel ? chatModelContent : localModelContent)));
};

document.addEventListener('DOMContentLoaded', async () => {
    await initializeApplication();
    setupEventListeners();
});

const initializeApplication = async () => {
    try {
        await loadInitialPrivacyPolicy();
        updateStatus('Privacy policy loaded.');
        localAi.loadEngine(() => {
            updateStatus('Ready');
            ui.startAnalysisButton.disabled = false;
        }, report => updateStatus(`${report.text} (${report.progress}%)`));
    } catch (error) {
        console.error('Error loading privacy policy:', error);
        updateStatus(`Error loading privacy policy. ${error.message}`);
    } finally {
        toggleVisibility(ui.loadingSpinner, false);
    }
};

const loadInitialPrivacyPolicy = async () => {
    const domain = await getCurrentTabDomain();
    const cachedAnalysis = await retrieveFromCache(domain);
    if (cachedAnalysis) ui.analysisResult.innerHTML = cachedAnalysis;

    privacyPolicy = await loadPrivacyPolicy();
};

const loadPrivacyPolicy = async (): Promise<string> => {
    updateStatus('Loading privacy policy...');
    const url = await getPrivacyPolicyUrl();
    if (!url) throw new Error('Privacy URL is unavailable.');

    ui.privacyLink.href = url;
    ui.privacyLink.textContent = url;

    return await fetchPrivacyPolicy(url);
};

const fetchPrivacyPolicy = async (url: string): Promise<string> => {
    const response = await fetch(url, { redirect: 'follow' });
    const text = await response.text();
    const parsedDocument = new DOMParser().parseFromString(text, 'text/html');
    const policyContent = parsedDocument.querySelector('main')?.innerText || parsedDocument.body.innerText;
    if (!policyContent) throw new Error('Failed to parse privacy policy.');
    return policyContent;
};

const getPrivacyPolicyUrl = (): Promise<string | undefined> =>
    new Promise(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            const tabId = tabs[0]?.id;
            if (tabId) {
                chrome.tabs.sendMessage(tabId, { action: 'getPrivacyUrl' }, response =>
                    resolve(response?.privacyPolicyUrl || undefined)
                );
            } else {
                resolve(undefined);
            }
        });
    });

const getCurrentTabDomain = (): Promise<string> =>
    new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            const domain = tabs[0]?.url?.split('/')[2];
            domain ? resolve(domain) : reject('Failed to get current tab domain.');
        });
    });

const saveToCache = (key: string, value: string) => chrome.storage.local.set({ [key]: value });

const retrieveFromCache = (key: string): Promise<string | undefined> =>
    new Promise(resolve => chrome.storage.local.get([key], result => resolve(result[key])));


