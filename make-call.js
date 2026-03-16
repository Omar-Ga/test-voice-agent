require('dotenv').config();
const twilio = require('twilio');

// Make sure you add these to your .env file
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
const myEgyptianNumber = process.env.MY_PHONE_NUMBER;
// Replace this with the public URL you get from ngrok or localtunnel
const serverUrl = process.env.SERVER_URL;

if (!accountSid || !authToken || !twilioNumber || !myEgyptianNumber || !serverUrl) {
    console.error("Missing environment variables. Please check your .env file.");
    process.exit(1);
}

const client = new twilio(accountSid, authToken, {
    region: 'ie1'
});

async function makeOutboundCall() {
    try {
        console.log(`Initiating call from ${twilioNumber} to ${myEgyptianNumber}...`);

        const call = await client.calls.create({
            url: `${serverUrl}/twiml`, // Twilio will hit this URL to know what to do when the call connects
            to: myEgyptianNumber,
            from: twilioNumber,
            statusCallback: `${serverUrl}/status`, // Let us know when ring/answer/fail happens
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            statusCallbackMethod: 'POST'
        });

        console.log(`Call successfully initiated! Call SID: ${call.sid}`);
    } catch (error) {
        console.error("Error making outbound call:", error);
    }
}

makeOutboundCall();
