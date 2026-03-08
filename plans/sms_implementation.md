# SMS Implementation Documentation: Cold Calling AI Prototype

## 1. Overview
This document outlines the implementation of an SMS-based information delivery system for the Cold Calling AI prototype. Due to Meta's strict 24-hour template rules for outbound WhatsApp Business messages, standard SMS via Twilio is used as a zero-friction alternative for investor demos. 

This implementation allows the AI ("نور") to autonomously trigger an SMS containing the founder's contact info when the call recipient verbally agrees.

## 2. Architecture & Flow
1. **Twilio Webhook:** When the outbound call connects, Twilio hits our `/twiml` endpoint. We dynamically inject the recipient's phone number (`req.body.To`) into the WebSocket `<Stream>` parameters.
2. **WebSocket Start Event:** Our Node.js server receives the stream `start` event and stores the recipient's phone number in memory.
3. **Gemini Tool Setup:** During the initial connection to the Gemini Multimodal Live API, we equip the AI with a `send_sms` function (Tool).
4. **Function Execution:** When the user agrees to receive the info, Gemini pauses audio generation and sends a `functionCall` over the WebSocket.
5. **Node.js Action:** The server intercepts the call, executes the `twilio.messages.create` API, and sends a `functionResponse` back to Gemini.
6. **Resumption:** Gemini receives the success response and verbally confirms to the user (e.g., "أنا بعتلك الرسالة حالاً").

---

## 3. Implementation Steps & Code

### Step 1: Capturing the Target's Phone Number
In your Express server, you must modify the `/twiml` endpoint to capture the target's number and pass it into the TwiML stream.

**File:** `index.js`
```javascript
app.post('/twiml', (req, res) => {
    // For outbound calls, the person we are calling is 'To'
    const targetPhone = req.body.To || req.body.Called; 
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="wss://${req.headers.host}/stream">
            <!-- Pass the number to the WebSocket -->
            <Parameter name="targetPhone" value="${targetPhone}" />
        </Stream>
    </Connect>
</Response>`;
    res.type('text/xml').send(twiml);
});
```

### Step 2: Extracting the Number in the WebSocket
When the Twilio stream connects, extract the parameter and store it in a variable scoped to that specific connection.

```javascript
app.ws('/stream', (ws, req) => {
    let streamSid = null;
    let targetPhoneNumber = null; // Store the number here

    ws.on('message', (message) => {
        const msg = JSON.parse(message);
        if (msg.event === 'start') {
            streamSid = msg.start.streamSid;
            // Extract the custom parameter we passed in Step 1
            targetPhoneNumber = msg.start.customParameters.targetPhone;
            console.log(`Call connected to: ${targetPhoneNumber}`);
        }
        // ... (audio media handling code)
    });
});
```

### Step 3: Equipping Gemini with the "Tool"
When opening the connection to `geminiWs`, we must declare the function in the `setup` message so the AI knows it can send an SMS.

```javascript
const setupMessage = {
    setup: {
        model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
        // ... (voice and generation configs) ...
        systemInstruction: { /* ... */ },
        tools: [{
            functionDeclarations: [{
                name: "send_sms_contact_info",
                description: "Sends an SMS text message containing David's contact information (Phone and Email) to the user's phone. Call this function ONLY when the user explicitly agrees to receive the information via message.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        agreed: {
                            type: "BOOLEAN",
                            description: "True if the user agreed to receive the SMS."
                        }
                    },
                    required: ["agreed"]
                }
            }]
        }]
    }
};
geminiWs.send(JSON.stringify(setupMessage));
```

### Step 4: Intercepting the Tool Call & Sending the SMS
In the `geminiWs.on('message')` listener, we must look for a `functionCall` request from Gemini, pause the stream, send the SMS using Twilio's REST API, and return the result.

```javascript
// Initialize Twilio REST Client at the top of your file
const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

geminiWs.on('message', async (data) => {
    const response = JSON.parse(data.toString());

    // 1. Check if Gemini wants to call a function
    if (response.serverContent?.modelTurn) {
        const parts = response.serverContent.modelTurn.parts;
        for (let part of parts) {
            
            // If the part is a function call
            if (part.functionCall && part.functionCall.name === "send_sms_contact_info") {
                console.log("[Gemini] Triggered send_sms_contact_info");
                
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
                        clientContent: {
                            turns: [{
                                role: "user",
                                parts: [{
                                    functionResponse: {
                                        name: "send_sms_contact_info",
                                        response: { status: "success", message: "SMS sent successfully to the user." }
                                    }
                                }]
                            }],
                            turnComplete: true
                        }
                    };
                    geminiWs.send(JSON.stringify(toolResponse));

                } catch (error) {
                    console.error("[Twilio] Failed to send SMS:", error.message);
                    
                    // Tell Gemini it failed so it can apologize gracefully
                    const errorResponse = {
                        clientContent: {
                            turns: [{
                                role: "user",
                                parts: [{
                                    functionResponse: {
                                        name: "send_sms_contact_info",
                                        response: { status: "error", error: error.message }
                                    }
                                }]
                            }],
                            turnComplete: true
                        }
                    };
                    geminiWs.send(JSON.stringify(errorResponse));
                }
            }
        }
    }
});
```

---

## 4. Required Environment Variables
To make this work, ensure your `.env` file contains the required Twilio credentials for the REST API (not just the webhook):

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxx
PORT=3000
```
