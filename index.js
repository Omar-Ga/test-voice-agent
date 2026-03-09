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

// Initialize Twilio REST Client
const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// URL for Gemini Multimodal Live API
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

// Health Check Endpoint (To verify tunnel is working)
app.get('/', (req, res) => {
    res.send('Twilio Voice Agent Server is running! Replace loca.lt with ngrok URL.');
});

// TwiML Endpoint (Twilio Webhook)
app.post('/twiml', express.urlencoded({ extended: true }), (req, res) => {
    console.log(`[Twilio Webhook] Received POST /twiml from ${req.ip}`);

    // For outbound calls, the person we are calling is 'To'
    const targetPhone = req.body.To || req.body.Called || "";

    res.type('text/xml');

    // TwiML <Connect> <Stream> format
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="wss://${req.headers.host}/stream">
            <Parameter name="targetPhone" value="${targetPhone}" />
        </Stream>
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
    let targetPhoneNumber = null;

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
                    parts: [{
                        text: `أنتِ "نور"، أول موظفة مبيعات تعمل بالذكاء الاصطناعي في مصر. تعملين في شركة Bionicverse. أنتِ مصرية وتتحدثين فقط باللهجة المصرية العامية (Egyptian Arabic).
مهمتك الأساسية هي إجراء مكالمات باردة (Cold Calls) لمديري شركات العقارات بالنيابة عن "مهندس ديفيد بشارة"، صاحب ومؤسس الشركة، لإثبات قدراتك الصوتية والتفاعلية الطبيعية، وإقناعهم بالتواصل معه.

يجب عليكِ الالتزام بقواعد السلوك التالية لتكوني طبيعية كالبشر تماماً:
1. اللهجة (قاعدة صارمة جداً): يجب أن تتحدثي باللهجة المصرية العامية حصراً طوال المكالمة (استخدمي كلمات مثل: إزيك، عامل إيه، عشان، كدا، طب، ماشي، عنيا، دلوقتي). يُمنع منعاً باتاً التحدث بأي لهجة أخرى (مثل اللهجة السعودية أو الخليجية) أو باللغة العربية الفصحى. كوني مصرية 100% في كل ردودك.
2. المرونة والذكاء البشري: أنتِ لستِ روبوتاً يقرأ من نص مكتوب! تحدثي بتلقائية. إذا سأل العميل سؤالاً خارج السياق، أجيبي عليه بكلماتك الخاصة بشكل طبيعي ثم عودي بذكاء لهدف المكالمة.
3. التفاعل السريع (أهم قاعدة): إذا قاطعك العميل أو طلب إرسال رسالة SMS أو تفاصيل التواصل في أي لحظة (حتى لو في أول ثانية من المكالمة)، توقفي عن الشرح فوراً. أجيبي برد بشري طبيعي وسريع (مثل: "عنيا، هبعتلك رسالة حالاً فيها كل التفاصيل") وقومي باستدعاء أداة send_sms_contact_info فوراً. لا تعودي لقراءة أي نص محفوظ ولا تكملي باقي أهداف المكالمة.
4. الاستماع: انتظري دائماً رد العميل بعد كل سؤال أو توقف طبيعي لتسمحي له بالكلام. لا تذكري اسمه في البداية، فقط رحبي.
5. النطق الصحيح (هام جداً للـ Text-to-Speech):
   - عند نطق رقم الهاتف، انطقيه رقماً رقماً: "زيرو، واحد، اتنين، سبعة، تلاتة، تلاتة، أربعة، أربعة، اتنين، تلاتة، أربعة".
   - عند نطق الإيميل، انطقيه بالإنجليزية بوضوح: "David at Bionicverse dot io".

أهداف المكالمة (Milestones) - استخدمي أسلوبك الخاص لتحقيقها بالترتيب ما لم يقاطعك العميل:

الهدف الأول: الافتتاحية
- رحبي بالعميل باللهجة المصرية وعرفي نفسك أنكِ "نور" من Bionicverse وتتحدثين من طرف "مهندس ديفيد بشارة".
- انتظري رده.

الهدف الثاني: العرض (Pitch)
- بعد رده، وضحي له سريعاً أنكِ لستِ إنسانة بل ذكاء اصطناعي، وأن مهندس ديفيد طلب منك الاتصال لإثبات قدرتك على فلترة الـ Leads بصوت طبيعي دون أن يلاحظ العملاء.
- اسأليه عن رأيه في مستوى صوتك.

الهدف الثالث: الدعوة لاتخاذ إجراء (Call to Action)
- إذا أبدى إعجابه أو سأل عن التفاصيل، اشكريه واعرضي عليه إرسال رسالة SMS تحتوي على الرقم الشخصي لمهندس ديفيد وإيميله لتسهيل التواصل.

الهدف الرابع: إرسال الـ SMS وإنهاء المكالمة
- بمجرد أن يوافق بأي شكل (آه، ياريت، تمام، ابعتي)، استدعي أداة send_sms_contact_info فوراً دون أي أسئلة إضافية.
- أخبريه بتلقائية أن الرسالة أُرسلت واسأليه إن كان يحتاج مساعدة أخرى.
- إذا رفض الرسالة وطلب إملاء الرقم، أملي عليه الرقم والإيميل بوضوح كما هو موضح في قواعد النطق.` }],
                },
                tools: [{
                    functionDeclarations: [{
                        name: "send_sms_contact_info",
                        description: "CRITICAL: Call this function IMMEDIATELY the exact moment the user agrees to receive an SMS or explicitly asks for it at ANY point in the call (e.g., 'ابعتي', 'تمام', 'أيوة', 'ياريت', 'ابعت', 'ماشي'). استدعي هذه الأداة فوراً وبدون تردد بمجرد طلب العميل للرسالة أو موافقته عليها.",
                        parameters: {
                            type: "OBJECT",
                            properties: {
                                agreed: {
                                    type: "BOOLEAN",
                                    description: "Set to True if the user agreed or asked to receive the SMS (وافق على استلام الرسالة)."
                                }
                            },
                            required: ["agreed"]
                        }
                    }]
                }],
                inputAudioTranscription: {},
                outputAudioTranscription: {}
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

    geminiWs.on('message', async (data) => {
        const response = JSON.parse(data.toString());

        // Advanced Logging: Clone response and remove base64 audio chunks so we can log everything else safely
        const loggableResponse = JSON.parse(JSON.stringify(response));
        if (loggableResponse.serverContent?.modelTurn?.parts) {
            loggableResponse.serverContent.modelTurn.parts.forEach(part => {
                if (part.inlineData && part.inlineData.data) {
                    part.inlineData.data = `<base64 audio omitted... length: ${part.inlineData.data.length}>`;
                }
            });
        }
        
        // Log the cleaned response
        console.log('\n--- [Gemini MSG] ---');
        console.dir(loggableResponse, { depth: null, colors: true });
        console.log('--------------------\n');

        // Explicitly check for transcriptions in the response
        if (response.serverContent?.inputTranscription) {
            console.log(`\n🗣️ [USER (Transcribed)]: ${response.serverContent.inputTranscription.text}\n`);
        }
        if (response.serverContent?.outputTranscription) {
            console.log(`\n🤖 [AI (Transcribed)]: ${response.serverContent.outputTranscription.text}\n`);
        }

        // Handle user interruptions (breathes, speaks over AI)
        if (response.serverContent?.interrupted) {
            console.log('⏳ [Gemini] Interrupted by user! Clearing Twilio playback buffer.');
            if (streamSid && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    event: 'clear',
                    streamSid: streamSid
                }));
            }
        }

        // Handle Gemini Function Calls (Bidi API format)
        if (response.toolCall && response.toolCall.functionCalls) {
            console.log("[Gemini] Received toolCall:", JSON.stringify(response.toolCall));
            for (let call of response.toolCall.functionCalls) {
                if (call.name === "send_sms_contact_info") {
                    console.log(`[Gemini] Triggered send_sms_contact_info with id: ${call.id}`);

                    try {
                        // Execute the Twilio SMS API
                        const msg = await twilioClient.messages.create({
                            body: "أهلاً بك! بناءً على مكالمتك مع نور، يسعدنا تواصلك مع مهندس ديفيد بشارة (مؤسس Bionicverse).\n\n📱 موبايل: 01273344234\n📧 إيميل: david@bionicverse.io",
                            from: process.env.TWILIO_PHONE_NUMBER, // Your Twilio Number
                            to: targetPhoneNumber                  // The number we captured in Step 2
                        });
                        console.log(`[Twilio] SMS sent successfully. SID: ${msg.sid}`);

                        // Tell Gemini the function succeeded
                        const toolResponse = {
                            toolResponse: {
                                functionResponses: [{
                                    id: call.id,
                                    name: "send_sms_contact_info",
                                    response: { status: "success", message: "SMS sent successfully to the user." }
                                }]
                            }
                        };
                        geminiWs.send(JSON.stringify(toolResponse));

                    } catch (error) {
                        console.error("[Twilio] Failed to send SMS:", error.message);

                        // Tell Gemini it failed so it can apologize gracefully
                        const errorResponse = {
                            toolResponse: {
                                functionResponses: [{
                                    id: call.id,
                                    name: "send_sms_contact_info",
                                    response: { status: "error", error: error.message }
                                }]
                            }
                        };
                        geminiWs.send(JSON.stringify(errorResponse));
                    }
                }
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
            // Extract the custom parameter we passed from TwiML
            targetPhoneNumber = msg.start.customParameters?.targetPhone || null;
            console.log('Twilio Stream Started. SID:', streamSid);
            console.log(`Call connected to: ${targetPhoneNumber}`);
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
