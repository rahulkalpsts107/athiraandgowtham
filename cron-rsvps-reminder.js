require('dotenv').config();
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');

const {
  EMAIL_USER,
  EMAIL_PASS,
  EMAIL_SERVICE,
  MONGODB_URI,
} = process.env;

// Fetch RSVPs (optionally filter by createdAt or attendance later)
async function fetchRsvps() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db('test');
    // Only confirmed RSVPs (all docs) - adjust filter if needed later
    const rsvps = await db.collection('rsvps').find({}).toArray();
    return rsvps;
  } finally {
    await client.close();
  }
}

function getEventBlocks(envType, attendingCode) {
  // attendingCode: '0' marriage only, '1' marriage+soirée, '2' soirée only
  // We'll tailor which blocks to include based both on envType (site version) and what they selected.
  const blocks = [];

  const formatBlock = (title, date, timeRange, extra='') => `
    <div style="margin-bottom:18px; padding:14px 18px; background:#fff; border:1px solid #e3e3e3; border-radius:8px;">
      <h3 style="margin:0 0 6px; font-size:18px; color:#617939; font-family:'Abhaya Libre',serif;">${title}</h3>
      <p style="margin:4px 0; font-size:15px;">${date}</p>
      <p style="margin:4px 0; font-size:15px; font-weight:500;">${timeRange}</p>
      ${extra ? `<p style=\"margin:6px 0 0; font-size:14px; color:#555;\">${extra}</p>` : ''}
    </div>`;

  if (attendingCode === '2') {
    blocks.push(formatBlock('Soirée', 'Wednesday, 20 August 2025', '6:00 PM – 9:00 PM IST'));
  }
  else if (attendingCode === '1') {
    blocks.push(formatBlock('Soirée', 'Wednesday, 20 August 2025', '6:00 PM – 9:00 PM IST'));
    blocks.push(formatBlock('Wedding – Muhurtham', 'Thursday, 21 August 2025', '12:05 PM IST'));
  }
  else if (attendingCode === '0') {
    blocks.push(formatBlock('Wedding – Muhurtham', 'Thursday, 21 August 2025', '12:05 PM IST'));
  }
  if (envType === '0') {
  } else if (envType === '1') {
  } else if (envType === '2') {
    blocks.length = 0;
    blocks.push(formatBlock('Soirée', 'Wednesday, 20 August 2025', '6:00 PM – 9:00 PM IST'));
    blocks.push(formatBlock('Wedding – Muhurtham 1', 'Thursday, 21 August 2025', '12:05 PM IST'));
    blocks.push(formatBlock('Wedding – Muhurtham 2', 'Thursday, 21 August 2025', '08:00 AM IST'));
  }
  return blocks.join('\n');
}

function buildReminderEmail(rsvp) {
  const envType = rsvp.envType || '0';
  const attendingCode = (rsvp.attending || '1').toString();

  const coupleNames = envType === '2' ? 'Gowtham & Athira' : 'Athira & Gowtham';
  const websiteUrls = {
    '0': 'https://athiraandgowtham.onrender.com',
    '1': 'https://athirawedsgowtham2025.onrender.com',
    '2': 'https://gowthamwedsathira2025.onrender.com'
  };
  const websiteUrl = websiteUrls[envType] || websiteUrls['0'];

  // Attendance phrase
  const attendanceMap = {
    '0': 'the wedding ceremony',
    '1': 'both the soirée and wedding ceremony',
    '2': 'the soirée'
  };
  const attendanceText = attendanceMap[attendingCode] || attendanceMap['1'];

  const eventsHtml = getEventBlocks(envType, attendingCode);
  rsvp.name.trimStart();
  rsvp.name.trimEnd();
  return {
    subject: `${coupleNames} – Wedding Reminder & Thank You 🙏`,
    html: `
    <div style="font-family:'Abhaya Libre',serif; max-width:640px; margin:0 auto; background:#fff7e1; padding:28px; color:#333;">
      <div style="text-align:center; margin-bottom:26px;">
        <h1 style="margin:0 0 10px; font-size:28px; color:#617939;">${coupleNames}</h1>
        <p style="margin:0; font-size:16px; letter-spacing:0.5px;">Wedding Celebrations – August 2025</p>
      </div>
      <p style="font-size:17px; line-height:1.55;">Dear ${rsvp.name || 'Guest'},</p>
      <p style="font-size:17px; line-height:1.55;">Thank you once again for your RSVP. We're excited that you'll be joining us for ${attendanceText}. Here are the event details as the day approaches:</p>
      <div style="margin:25px 0;">
        ${eventsHtml}
      </div>
      <div style="background:#fff; padding:18px 20px; border:1px solid #e3e3e3; border-radius:8px; margin-bottom:24px;">
        <p style="margin:0 0 8px; font-size:15px; font-weight:600; color:#617939;">Venue</p>
        <p style="margin:0; font-size:15px; line-height:1.5;">Villa Kasu<br/>1, Kariyammana Agrahara Rd, Yemalur, Bengaluru 560037<br/>Karnataka, India</p>
        <p style="margin:10px 0 0;">
          <a href="https://maps.google.com/?q=12.943319832193993,77.68109909325422" style="color:#617939; font-weight:600; text-decoration:none;">Open in Google Maps →</a>
        </p>
      </div>
      <p style="font-size:16px; line-height:1.55;">If you need to make any changes or check details again, you can revisit the website:</p>
      <p style="text-align:center; margin:28px 0;">
        <a href="${websiteUrl}" style="background:#617939; color:#fff; padding:12px 24px; text-decoration:none; border-radius:6px; font-size:16px; font-weight:600; display:inline-block;">Visit Wedding Website</a>
      </p>
      <p style="text-align:center; font-size:13px; margin:-18px 0 24px;">
        Or copy this link: <a href="${websiteUrl}" style="color:#617939; text-decoration:none;">${websiteUrl}</a>
      </p>
      <p style="font-size:15px; line-height:1.55;">We can't wait to celebrate with you!</p>
      <p style="font-size:15px; line-height:1.55; margin-top:24px;">Warmly,<br/>${coupleNames}</p>
      <hr style="border:none; border-top:1px solid #d8d2c1; margin:30px 0 12px;"/>
      <p style="font-size:11px; color:#777; line-height:1.4;">You're receiving this reminder because you RSVP'd on our wedding website. If you believe this is an error, please ignore this email.</p>
    </div>`
  };
}

async function sendReminderEmail(to, subject, html) {
  const transporter = nodemailer.createTransport({
    service: EMAIL_SERVICE,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS }
  });
  await transporter.sendMail({ from: EMAIL_USER, to, subject, html });
}

(async () => {
  try {
    const rsvps = await fetchRsvps();
    if (!rsvps.length) {
      console.log('No RSVPs found. Exiting.');
      return;
    }
    for (const rsvp of rsvps) {
      if (!rsvp.email) continue;
      const { subject, html } = buildReminderEmail(rsvp);
      console.log(rsvp);
      console.log(subject);
      console.log(html);
      try {
        await sendReminderEmail(rsvp.email, subject, html);
        console.log(`Reminder sent to ${rsvp.email}`);
      } catch (e) {
        console.error(`Failed sending to ${rsvp.email}:`, e.message);
      }
    }

    console.log('All reminder emails processed.');
  } catch (err) {
    console.error('Reminder job failed:', err);
  }
})();
