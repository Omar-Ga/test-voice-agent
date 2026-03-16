require('dotenv').config();

const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = new twilio(accountSid, authToken);

const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
const myEgyptianNumber = process.env.MY_PHONE_NUMBER;

async function sendSms() {
    console.log(`Sending SMS from ${twilioNumber} to ${myEgyptianNumber}...`);
    try {
        const msg = await client.messages.create({
            body: "أهلاً بك! بناءً على مكالمتك مع نور، يسعدنا تواصلك مع مهندس ديفيد بشارة (مؤسس Bionicverse).\n\n📱 موبايل: 01273344234\n📧 إيميل: david@bionicverse.io",
            from: twilioNumber,
            to: myEgyptianNumber
        });
        console.log(`SMS sent successfully! SID: ${msg.sid}`);
    } catch (error) {
        console.error("Failed to send SMS:", error);
    }
}

sendSms();
