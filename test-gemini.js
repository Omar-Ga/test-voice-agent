require('dotenv').config();
const WebSocket = require('ws');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

const geminiWs = new WebSocket(GEMINI_WS_URL);

geminiWs.on('open', () => {
    console.log('Connected to Gemini');
    const setupMessage = {
        setup: {
            model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }
                }
            },
            systemInstruction: { parts: [{ text: "Test agent" }] }
        }
    };
    geminiWs.send(JSON.stringify(setupMessage));
});

geminiWs.on('message', (data) => {
    console.log('Received:', data.toString());
});

geminiWs.on('close', (code, reason) => {
    console.log(`Closed. Code: ${code}, Reason: ${reason.toString()}`);
    process.exit();
});

geminiWs.on('error', (err) => {
    console.error('Error:', err);
});
