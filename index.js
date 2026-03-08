require('dotenv').config();
const express = require('express');
const expressWs = require('express-ws');
const WebSocket = require('ws');
const alawmulaw = require('alawmulaw');

const app = express();
// Enable WebSocket support
expressWs(app);

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// URL for Gemini Multimodal Live API
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

// Health Check Endpoint (To verify tunnel is working)
app.get('/', (req, res) => {
    res.send('Twilio Voice Agent Server is running! Replace loca.lt with ngrok URL.');
});

// TwiML Endpoint (Twilio Webhook)
app.post('/twiml', (req, res) => {
    console.log(`[Twilio Webhook] Received POST /twiml from ${req.ip}`);
    res.type('text/xml');

    // TwiML <Connect> <Stream> format
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="wss://${req.headers.host}/stream" />
    </Connect>
</Response>`;

    console.log(`[Twilio Webhook] Sending TwiML Response: \n${twiml}`);
    res.send(twiml);
});

// Status Callback Endpoint
app.post('/status', express.urlencoded({ extended: true }), (req, res) => {
    console.log(`[Twilio Call Status] ${req.body.CallStatus} (Duration: ${req.body.CallDuration || 'N/A'}s)`);
    res.sendStatus(200);
});

// WebSocket Endpoint for Twilio Media Streams
app.ws('/stream', (ws, req) => {
    console.log('New Twilio Media Stream Connected');
    let streamSid = null;

    // Connect to Gemini
    const geminiWs = new WebSocket(GEMINI_WS_URL);

    geminiWs.on('open', () => {
        console.log('Connected to Gemini Multimodal Live API');

        // 1. Send Setup Message
        const setupMessage = {
            setup: {
                model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: "Aoede" // Fun, lively voice
                            }
                        }
                    }
                },
                realtimeInputConfig: {
                    automaticActivityDetection: {
                        disabled: false,
                        silenceDurationMs: 400
                    }
                },
                systemInstruction: {
                    parts: [{ text: "You are a friendly, helpful AI assistant who speaks in the Egyptian Arabic dialect. The user you are talking to is named Gamal. Be concise, warm, and natural in your conversation. ALWAYS reply in Egyptian Arabic." }]
                }
            }
        };
        geminiWs.send(JSON.stringify(setupMessage));

        // 2. Force the agent to speak first
        const initialGreeting = {
            clientContent: {
                turns: [{
                    role: "user",
                    parts: [{ text: "Hello! The call has connected." }]
                }],
                turnComplete: true
            }
        };
        geminiWs.send(JSON.stringify(initialGreeting));
    });

    geminiWs.on('message', (data) => {
        const response = JSON.parse(data.toString());

        // Log every message type from Gemini (remove after debugging)
        const keys = Object.keys(response);
        if (!keys.includes('serverContent') || response.serverContent?.turnComplete || response.serverContent?.interrupted) {
            console.log('[Gemini MSG]', JSON.stringify(response).slice(0, 300));
        }

        // Handle user interruptions (breathes, speaks over AI)
        if (response.serverContent?.interrupted) {
            console.log('[Gemini] Interrupted by user! Clearing Twilio playback buffer.');
            if (streamSid && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    event: 'clear',
                    streamSid: streamSid
                }));
            }
        }

        // Handle Gemini's AI Audio Response
        if (response.serverContent && response.serverContent.modelTurn) {
            const parts = response.serverContent.modelTurn.parts;
            for (let part of parts) {
                if (part.inlineData && part.inlineData.data) {
                    console.log(`[Gemini Audio] Got audio chunk, mimeType: ${part.inlineData.mimeType}, bytes: ${part.inlineData.data.length}`);
                    // Gemini native audio model sends 24kHz 16-bit PCM base64 encoded
                    const pcmBuffer = Buffer.from(part.inlineData.data, 'base64');
                    const pcm16 = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);

                    // Downsample 24kHz -> 8kHz (take every 3rd sample)
                    const downsampled = new Int16Array(Math.floor(pcm16.length / 3));
                    for (let i = 0; i < downsampled.length; i++) {
                        downsampled[i] = pcm16[i * 3];
                    }

                    // Encode 8kHz PCM16 to 8kHz mu-law (Twilio standard)
                    const mulawData = alawmulaw.mulaw.encode(downsampled);
                    const base64Audio = Buffer.from(mulawData).toString('base64');

                    // Send back to Twilio over WebSocket
                    if (streamSid && ws.readyState === WebSocket.OPEN) {
                        console.log(`[Gemini Audio] Sending ${mulawData.length} bytes of mulaw audio to Twilio`);
                        ws.send(JSON.stringify({
                            event: 'media',
                            streamSid: streamSid,
                            media: { payload: base64Audio }
                        }));
                    } else {
                        console.warn(`[Gemini Audio] Skipping send — streamSid: ${streamSid}, wsState: ${ws.readyState}`);
                    }
                }
            }
        }
    });

    // Handle messages from Twilio
    let twilioAudioPacketCount = 0;
    ws.on('message', (message) => {
        const msg = JSON.parse(message);

        if (msg.event === 'start') {
            streamSid = msg.start.streamSid;
            console.log('Twilio Stream Started. SID:', streamSid);
            console.log('[Twilio Stream Config]', JSON.stringify(msg.start));
        } else if (msg.event === 'media') {
            twilioAudioPacketCount++;
            // Receive 8kHz mu-law base64 audio from the phone line
            const mulawBuffer = Buffer.from(msg.media.payload, 'base64');

            // Decode to 8kHz PCM16
            const pcm8kHz = alawmulaw.mulaw.decode(mulawBuffer);

            // Audio level diagnostics (every 50 packets)
            if (twilioAudioPacketCount % 50 === 0) {
                let maxAmp = 0;
                let sumSq = 0;
                for (let i = 0; i < pcm8kHz.length; i++) {
                    const s = Math.abs(pcm8kHz[i]);
                    if (s > maxAmp) maxAmp = s;
                    sumSq += pcm8kHz[i] * pcm8kHz[i];
                }
                const rms = Math.sqrt(sumSq / pcm8kHz.length);
                console.log(`[Audio Level] Packet #${twilioAudioPacketCount} | track: ${msg.media.track} | peak: ${maxAmp} | rms: ${Math.round(rms)} | samples: ${pcm8kHz.length}`);
            }

            // Apply audio gain to boost quiet phone audio for Gemini's VAD
            const GAIN = 3.0;
            for (let i = 0; i < pcm8kHz.length; i++) {
                let sample = pcm8kHz[i] * GAIN;
                // Clamp to 16-bit signed range to prevent clipping distortion
                if (sample > 32767) sample = 32767;
                if (sample < -32768) sample = -32768;
                pcm8kHz[i] = sample;
            }

            // Upsample 8kHz -> 16kHz for Gemini (duplicate each sample)
            // Gemini Multimodal Live API requires 16000Hz PCM
            const pcm16kHz = new Int16Array(pcm8kHz.length * 2);
            for (let i = 0; i < pcm8kHz.length; i++) {
                pcm16kHz[i * 2] = pcm8kHz[i];
                pcm16kHz[i * 2 + 1] = pcm8kHz[i];
            }

            const base64Audio = Buffer.from(pcm16kHz.buffer).toString('base64');

            // Stream audio chunk to Gemini
            if (geminiWs.readyState === WebSocket.OPEN) {
                if (twilioAudioPacketCount % 50 === 0) {
                    console.log(`[Twilio->Gemini] Forwarded ${twilioAudioPacketCount} audio packets so far`);
                }
                // Correct format: realtimeInput.audio (not mediaChunks)
                geminiWs.send(JSON.stringify({
                    realtimeInput: {
                        audio: {
                            data: base64Audio,
                            mimeType: "audio/pcm;rate=16000"
                        }
                    }
                }));
            } else {
                console.warn(`[Twilio->Gemini] Gemini WS not open! State: ${geminiWs.readyState}`);
            }
        }
    });

    geminiWs.on('error', (error) => {
        console.error('[Gemini WS] Error:', error);
    });

    geminiWs.on('close', (code, reason) => {
        console.log(`[Gemini WS] Closed connection. Code: ${code}, Reason: ${reason.toString()}`);
    });

    ws.on('error', (error) => {
        console.error('[Twilio WS] Error:', error);
    });

    ws.on('close', () => {
        console.log('[Twilio WS] Twilio Stream Disconnected');
        if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.close();
        }
    });
});

app.listen(PORT, () => {
    console.log(`Live Voice Agent running on port ${PORT}`);
    console.log(`To test with ngrok, run: ngrok http ${PORT}`);
    console.log(`Set your Twilio phone number Webhook to: https://<your-ngrok-url>.ngrok-free.app/twiml`);
});
