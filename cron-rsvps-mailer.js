require('dotenv').config();
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
const moment = require('moment');

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

function buildEmailContent(rsvps, chartUrl) {
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

  // ... your existing summary calculations ...

  const totalGuests = rsvps.reduce((sum, rsvp) => sum + (rsvp.numGuests || 1), 0);
  const rsvpsByVersion = rsvps.reduce((acc, rsvp) => {
    const version = rsvp.envType || '0';
    if (!acc[version]) acc[version] = 0;
    acc[version] += rsvp.numGuests || 1;
    return acc;
  }, {});
  const versionSummary = Object.entries(rsvpsByVersion).map(([version, count]) => {
    const websiteName = version === '2' ? 'Gowtham weds Athira' : 'Athira weds Gowtham';
    return `${websiteName}: ${count} guests`;
  }).join('<br/>');

  const attendanceLabel = (val) => {
    if (val === '0' || val === 0 || val === 'no') return 'Marriage Only';
    if (val === '2' || val === 2) return 'Soirée Only';
    if (val === '1' || val === 1 || val === 'yes') return 'Marriage + Soirée';
    return 'Marriage + Soirée'; // fallback
  };

  const rows = rsvps.map((rsvp, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${rsvp.name || ''}</td>
      <td>${rsvp.email || ''}</td>
      <td>${attendanceLabel(rsvp.attending)}</td>
      <td>${rsvp.numGuests || 1}</td>
      <td>${rsvp.envType === '2' ? 'Gowtham weds Athira' : 'Athira weds Gowtham'}</td>
      <td>${rsvp.createdAt ? new Date(rsvp.createdAt).toLocaleString() : ''}</td>
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

    ${chartUrl ? `
      <div style="text-align: center; margin: 20px 0;">
        <h3>Daily RSVP Trend</h3>
        <img src="${chartUrl}" alt="Daily RSVP Trend Chart" style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px;"/>
      </div>
    ` : ''}

    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 18px; width: 100%;">
      <thead style="background-color: #f2f2f2;">
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Email</th>
          <th>Attending Function</th>
          <th>No. of Guests</th>
          <th>Website Version</th>
          <th>RSVP date</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <p style="font-size: 14px; color: #888;">Report generated on ${generatedAt}</p>

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

async function generateRSVPReport() {
  try {
    const rsvps = await fetchRsvps();

    // Prepare last 30 days
    const days = [];
    for (let i = 29; i >= 0; i--) {
      days.push(moment().subtract(i, 'days').format('MMM D'));
    }

    // Initialize counts
    const countsByEnv = {
      athiraWedsGowtham: {},
      gowthamWedsAthira: {},
    };

    days.forEach(day => {
      countsByEnv.athiraWedsGowtham[day] = 0;
      countsByEnv.gowthamWedsAthira[day] = 0;
    });

    // Count RSVPs per day by envType
    rsvps.forEach(rsvp => {
      const date = moment(rsvp.createdAt).format('MMM D');
      const env = rsvp.envType === '2' ? 'gowthamWedsAthira' : 'athiraWedsGowtham';
      if (countsByEnv[env][date] !== undefined) {
        countsByEnv[env][date]++;
      }
    });

    // Convert to dataset arrays in correct order
    const athiraWedsGowthamData = days.map(day => countsByEnv.athiraWedsGowtham[day]);
    const gowthamWedsAthiraData = days.map(day => countsByEnv.gowthamWedsAthira[day]);

    // Chart config with stacking
    const chartConfig = {
      type: 'bar',
      data: {
        labels: days,
        datasets: [
          {
            label: 'Athira weds Gowtham',
            data: athiraWedsGowthamData,
            backgroundColor: '#3b82f6',
          },
          {
            label: 'Gowtham weds Athira',
            data: gowthamWedsAthiraData,
            backgroundColor: '#10b981',
          }
        ],
      },
      options: {
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { stepSize: 1 },
            grid: { color: '#eee' },
          },
        },
        plugins: {
          legend: { position: 'top' },
          title: {
            display: true,
            text: 'Daily RSVPs by Website Version (Last 30 Days)',
            font: { size: 18 }
          }
        },
        layout: {
          padding: 10,
        },
      },
    };

    const quickChartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&backgroundColor=white`;

    // Build email with chart included
    const emailContent = buildEmailContent(rsvps, quickChartUrl);

    await sendEmail(
      `Good Morning – Daily RSVP Summary (${new Date().toLocaleDateString()})`,
      emailContent
    );

    console.log('Email sent successfully.');
  } catch (error) {
    console.error('Error in RSVP report:', error);
  }
}

(async () => {
  try {
    await generateRSVPReport();
  } catch (err) {
    console.error('Error sending RSVP summary:', err);
  }
})();
