require('dotenv').config();
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');

const {
  EMAIL_USER,
  RECIPIENT_EMAIL,
  MONGODB_URI,
} = process.env;

async function fetchRsvps() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db('test');
    const rsvps = await db.collection('rsvps').find({}).toArray();
    return rsvps;
  } finally {
    await client.close();
  }
}

function buildEmailContent(rsvps) {
  const signOffs = [
    'Kind regards,',
    'Warm wishes,',
    'Best regards,',
    'Cheers,',
    'With appreciation,'
  ];
  const signOff = signOffs[Math.floor(Math.random() * signOffs.length)];
  const generatedAt = new Date().toLocaleString();

  if (!rsvps.length) {
    return `
      <p>Good morning,</p>
      <p>There are no RSVPs yet for today.</p>
      <p style="font-size: 12px; color: #888;">Report generated on ${generatedAt}</p>
      <br/>
      <p>${signOff}<br/><strong>Anvi</strong></p>
    `;
  }

  const rows = rsvps.map((rsvp, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${rsvp.name}</td>
      <td>${rsvp.email}</td>
      <td>${rsvp.attending}</td>
      <td>${new Date(rsvp.createdAt).toLocaleString()}</td>
    </tr>
  `).join('');

  return `
    <p>Good morning,</p>
    <p>Please find below the daily RSVP summary:</p>

    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 14px; width: 100%;">
      <thead style="background-color: #f2f2f2;">
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Email</th>
          <th>Attending</th>
          <th>Created At</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <p style="font-size: 12px; color: #888;">Report generated on ${generatedAt}</p>

    <br/>
    <p>${signOff}<br/><strong>Anvi</strong></p>
  `;
}




async function sendEmail(subject, body) {
  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: EMAIL_USER,
    to: RECIPIENT_EMAIL,
    subject,
    html: body
  };

  await transporter.sendMail(mailOptions);
}

(async () => {
  try {
    const rsvps = await fetchRsvps();
    const content = buildEmailContent(rsvps);
    await sendEmail(`Good Morning – Daily RSVP Summary (${new Date().toLocaleDateString()})`, content);
    console.log('Email sent successfully.');
  } catch (err) {
    console.error('Error sending RSVP summary:', err);
  }
})();
