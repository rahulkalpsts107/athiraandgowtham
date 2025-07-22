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

  // Calculate total guests
  const totalGuests = rsvps.reduce((sum, rsvp) => sum + (rsvp.numGuests || 1), 0);

  // Group RSVPs by website version
  const rsvpsByVersion = rsvps.reduce((acc, rsvp) => {
    const version = rsvp.envType || '0';
    if (!acc[version]) acc[version] = 0;
    acc[version] += rsvp.numGuests || 1;
    return acc;
  }, {});

  // Create summary of RSVPs by version
  const versionSummary = Object.entries(rsvpsByVersion).map(([version, count]) => {
    const websiteName = version === '2' ? 'Gowtham weds Athira' : 'Athira weds Gowtham';
    return `${websiteName}: ${count} guests`;
  }).join('<br/>');

  const rows = rsvps.map((rsvp, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${rsvp.name}</td>
      <td>${rsvp.email}</td>
      <td>${rsvp.attending}</td>
      <td>${rsvp.numGuests || 1}</td>
      <td>${rsvp.envType === '2' ? 'Gowtham weds Athira' : 'Athira weds Gowtham'}</td>
      <td>${new Date(rsvp.createdAt).toLocaleString()}</td>
    </tr>
  `).join('');

  return `
    <p>Good morning,</p>
    <p>Please find below the daily RSVP summary:</p>

    <div style="background-color: #f9f9f9; padding: 15px; margin: 15px 0; border-radius: 5px;">
      <h3 style="margin-top: 0;">Summary</h3>
      <p><strong>Total RSVPs:</strong> ${rsvps.length}</p>
      <p><strong>Total Guests:</strong> ${totalGuests}</p>
      <p><strong>By Website Version:</strong><br/>${versionSummary}</p>
    </div>

    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 14px; width: 100%;">
      <thead style="background-color: #f2f2f2;">
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Email</th>
          <th>Attending soirée</th>
          <th>Number of Guests</th>
          <th>Website Version</th>
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

  // Split RECIPIENT_EMAIL by comma, trim spaces, and filter out empty strings
  const recipientEmails = RECIPIENT_EMAIL
    .split(',')
    .map(email => email.trim())
    .filter(email => email.length > 0);

  const mailOptions = {
    from: EMAIL_USER,
    to: recipientEmails, // Nodemailer supports array here
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
