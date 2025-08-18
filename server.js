require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const mongoose = require('mongoose'); // Add mongoose for MongoDB
const ua = require('universal-analytics'); // Add Google Analytics tracking
const createRequestMetricsMiddleware = require('./middleware/requestMetrics');

// Initialize Google Analytics visitor based on ENV_TYPE
let visitor = null;
if (process.env.GOOGLE_ANALYTICS_ID) {
  visitor = ua(process.env.GOOGLE_ANALYTICS_ID);
  console.log('Google Analytics initialized with ID:', process.env.GOOGLE_ANALYTICS_ID);
}

// Function to track events to Google Analytics
function trackGAEvent(category, action, label = '', value = 0, customDimensions = {}) {
  if (!visitor) return;
  
  try {
    // Capture ENV_TYPE early and log it for debugging
    const envType = process.env.ENV_TYPE || '0';
    console.log('ENV_TYPE being tracked:', envType, 'Type:', typeof envType);
    
    const eventData = {
      ec: category,        // Event Category
      ea: action,          // Event Action
      el: label,           // Event Label
      ev: value,           // Event Value
      // Send ENV_TYPE as a custom parameter that GA4 can recognize
      env_type: envType,   // This matches the parameter name in your GA4 custom dimension
      ...customDimensions  // Any additional custom dimensions
    };
    
    // Log the complete eventData object for debugging
    console.log('Complete GA eventData:', JSON.stringify(eventData, null, 2));
    console.log('📊 Sending to GA4 at:', new Date().toISOString());
    
    visitor.event(eventData).send((err) => {
      if (err) {
        console.error('❌ GA tracking error:', err);
      } else {
        console.log(`✅ GA Event tracked: ${category}/${action} (ENV_TYPE: ${envType}) at ${new Date().toLocaleTimeString()}`);
      }
    });
  } catch (error) {
    console.error('GA tracking exception:', error);
  }
}

// Enhanced Logger function with batched LogTail sending
const logBatchSize = 10;
const logBatchInterval = 5000; // 5 seconds
let logQueue = [];
let logTimer = null;

function sendLogsToLogTail() {
  if (logQueue.length === 0) return;
  
  const batchToSend = [...logQueue];
  logQueue = [];
  
  // Clear any existing timer
  if (logTimer) {
    clearTimeout(logTimer);
    logTimer = null;
  }
  
  // Send batch to Better Stack (formerly Logtail)
  if (process.env.BETTERSTACK_SOURCE_TOKEN) {
    // Use node-fetch compatible approach
    try {
      console.log(`Sending ${batchToSend.length} logs to Better Stack`);
      
      // Create the request options
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.BETTERSTACK_SOURCE_TOKEN}`
        },
        body: JSON.stringify(batchToSend)
      };
      
      // Make the request using fetch with proper error handling
      fetch('https://s1329744.eu-nbg-2.betterstackdata.com', requestOptions)
        .then(response => {
          if (!response.ok) {
            return response.text().then(text => {
              console.error(`Better Stack API error (${response.status}):`, text);
              throw new Error(`Better Stack API returned ${response.status}`);
            });
          }
          console.log('Logs successfully sent to Better Stack');
          return response.text();
        })
        .then(data => {
          if (data) console.log('Better Stack response:', data);
        })
        .catch(err => {
          console.error('Failed to send logs to Better Stack:', err.message);
        });
    } catch (error) {
      console.error('Exception during log sending:', error.message);
    }
  } else {
    console.warn('BETTERSTACK_SOURCE_TOKEN not set, logs not sent to Better Stack');
  }
}

// Schedule the next log batch to be sent
function scheduleLogSending() {
  // Only set a new timer if one isn't already running
  if (!logTimer) {
    logTimer = setTimeout(() => {
      if (logQueue.length > 0) {
        sendLogsToLogTail();
      }
      // Timer is cleared in sendLogsToLogTail
    }, logBatchInterval);
  }
}

// Logger function
function log(type, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    type,
    message,
    ...data,
  };

  // Log to console immediately
  console.log(JSON.stringify(logEntry));

  // Add to batch for Better Stack (formerly Logtail)
  if (process.env.BETTERSTACK_SOURCE_TOKEN) {
    logQueue.push(logEntry);

    // Send immediately if batch size reached
    if (logQueue.length >= logBatchSize) {
      sendLogsToLogTail();
    } else {
      // Otherwise schedule a send for later
      scheduleLogSending();
    }
  }
  
  // Send to New Relic if configured
  if (process.env.NEW_RELIC_LICENSE_KEY) {
    try {
      // Format the log for New Relic Logs API
      const newRelicLog = {
        timestamp: timestamp,
        message: message,
        log: {
          level: type
        },
        attributes: {
          ...data,
          service: 'wedding-invitation-app',
          environment: process.env.ENV_TYPE || '0'
        }
      };
      
      // Send to New Relic Log API
      fetch('https://log-api.newrelic.com/log/v1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': process.env.NEW_RELIC_LICENSE_KEY
        },
        body: JSON.stringify([newRelicLog]) // New Relic expects an array of log objects
      })
      .catch(error => {
        console.error('Failed to send log to New Relic:', error.message);
      });
    } catch (error) {
      console.error('Error formatting log for New Relic:', error.message);
    }
  }
}

// Make sure logs are sent before app exit
process.on('beforeExit', () => {
  if (logQueue.length > 0) {
    sendLogsToLogTail();
  }
});

// Also handle other exit signals to ensure logs are sent
['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, () => {
    if (logQueue.length > 0) {
      log('info', `Sending ${logQueue.length} pending logs before ${signal}`);
      sendLogsToLogTail();
    }
    process.exit(0);
  });
});

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
  logging: false,
});

const app = express();
const PORT = process.env.PORT || 3000;
const ourPhotosDir = path.join(__dirname, 'images/uploads');

// Disable Express logging in production
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
  console.log = console.warn = console.info = () => {}; // Suppress all console output except errors
}

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app }),
    new ProfilingIntegration(),
  ],
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
  debug: false, // Disable Sentry debug logs
});

// Setup EJS templating
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

// Ensure uploads directory exists
if (!fs.existsSync(ourPhotosDir)) {
  fs.mkdirSync(ourPhotosDir, { recursive: true });
}

// Email configuration
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Configure multer for file upload
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'shared-photos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
  },
});

const upload = multer({ storage: storage });

// Middleware to parse form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Serve static files (but exclude index.html since we render it with EJS)
app.use(
  express.static(path.join(__dirname), {
    index: false, // Don't serve index.html as static file
  })
);
app.use(
  '/images/uploads',
  express.static(path.join(__dirname, 'images/uploads'))
);

// The request handler must be the first middleware on the app
app.use(Sentry.Handlers.requestHandler());

// TracingHandler creates a trace for every incoming request
app.use(Sentry.Handlers.tracingHandler());

// Create the request metrics middleware with the log function
const requestMetricsMiddleware = createRequestMetricsMiddleware(log);

// Add the request metrics middleware before other middleware
app.use(requestMetricsMiddleware);

// Log all requests and track in Google Analytics
app.use((req, res, next) => {
  // Format request parameters in a Better Stack friendly way
  const params = {
    query: req.query || {},
    body: req.method !== 'GET' ? req.body || {} : undefined,
  };

  // Remove sensitive data
  if (params.body && params.body.password) {
    params.body.password = '[REDACTED]';
  }

  // Create a message that contains the jsonified request info
  const requestInfo = {
    method: req.method,
    path: req.path,
    params: params,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
  };

  // Log with the request info jsonified in the message
  log(
    'request',
    `Request ${req.method} ${req.path} - ${JSON.stringify(requestInfo)}`,
    {
      timestamp: new Date().toISOString(),
    }
  );

  // Track request in Google Analytics based on ENV_TYPE
  const envType = process.env.ENV_TYPE || '0';
  const envTypeLabels = {
    '0': 'AthiraAndGowtham_Soiree_Wedding_Invitation_Site',
    '1': 'AthiraWedsGowtham_Wedding_Site', 
    '2': 'GowthamWedsAthira_Site',
    '3': 'Chitta_Wedding_Invite_Site'
  };
  
  const envLabel = envTypeLabels[envType] || 'Unknown_Site';
  
  // Track different types of requests
  if (req.path === '/') {
    trackGAEvent('Site_Visit', 'Homepage_Load', envLabel, 1);
  } else if (req.path === '/submit-rsvp') {
    trackGAEvent('Form_Submission', 'RSVP_Submit', envLabel, 1);
  } else if (req.path === '/upload-photo') {
    trackGAEvent('Photo_Upload', 'Shared_Photo_Upload', envLabel, 1);
  } else if (req.path === '/submit-contact') {
    trackGAEvent('Form_Submission', 'Contact_Form_Submit', envLabel, 1);
  } else if (req.path === '/get-shared-photos') {
    trackGAEvent('Content_Load', 'Shared_Photos_Load', envLabel, 1);
  } else if (req.path === '/our-photos') {
    trackGAEvent('Content_Load', 'Our_Photos_Load', envLabel, 1);
  } else if (req.path === '/api/guestbook' && req.method === 'POST') {
    trackGAEvent('Form_Submission', 'Guestbook_Submit', envLabel, 1);
  } else if (req.path === '/api/guestbook' && req.method === 'GET') {
    trackGAEvent('Content_Load', 'Guestbook_Load', envLabel, 1);
  } else if (req.path === '/wedding-invitation-endpoint') {
    trackGAEvent('File_Download', 'Calendar_Download', envLabel, 1);
  } else if (req.path.startsWith('/api/')) {
    trackGAEvent('API_Request', req.method + '_' + req.path.replace('/api/', ''), envLabel, 1);
  } else {
    trackGAEvent('Site_Request', req.method + '_Request', `${envLabel}_${req.path}`, 1);
  }

  next();
});

// RSVP schema and model
const rsvpSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  attending: { type: String, required: true },
  numGuests: { type: Number, required: true, min: 1, max: 50 },
  envType: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const RSVP = mongoose.model('RSVP', rsvpSchema);

// Add Contact schema and model
const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true },
  envType: { type: String, default: '0' },
  createdAt: { type: Date, default: Date.now }
});

const Contact = mongoose.model('Contact', contactSchema);

// Handle RSVP form submission
app.post('/submit-rsvp', async (req, res) => {
  let { name, email, attending, numGuests } = req.body;
  // Normalize attending values:
  // Existing values ("yes"/"no") -> convert to 1 (marriage+soirée) / 0 (marriage only)
  // New values: "0" = marriage, "1" = marriage+soirée, "2" = soirée only
  if (attending === 'yes') attending = '1';
  if (attending === 'no') attending = '0';
  if (!['0','1','2'].includes(attending)) attending = '1'; // default safe fallback
  // If site version ENV_TYPE=1 (marriage only site), override to '0'
  if (process.env.ENV_TYPE === '1') attending = '0';
  const envType = process.env.ENV_TYPE || '0';
  log('info', 'RSVP submission received', { name, email, attending, numGuests, envType })
  try {
    // Save RSVP to MongoDB with envType
    const rsvp = new RSVP({
      name,
      email,
      attending,
      numGuests: parseInt(numGuests, 10),
      envType
    });
    
    await rsvp.save();
    log('success', 'RSVP saved to database', { name, email, numGuests, envType });

    // Get recipient emails (handle comma-separated list)
    const recipientEmails = process.env.RECIPIENT_EMAIL
      ? process.env.RECIPIENT_EMAIL.split(',')
          .map(email => email.trim())
          .filter(email => email.includes('@')) // Ensure each email has @ symbol
      : [];
      
    if (recipientEmails.length === 0) {
      log('warning', 'No recipient emails defined for RSVP notification');
    }

    // Send email notification only if recipients are defined
    if (recipientEmails.length > 0) {
      // Determine which website version this is coming from
      let websiteIdentifier = "Athira weds Gowtham";
      if (process.env.ENV_TYPE === '2') {
        websiteIdentifier = "Gowtham weds Athira";
      }
      
      // Human readable attending description
      const attendingMap = {
        '0': 'Marriage Only',
        '1': 'Marriage + Soirée',
        '2': 'Soirée Only'
      };
      const attendingDesc = attendingMap[attending] || 'Marriage + Soirée';

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipientEmails,
        subject: `New RSVP Submission from ${websiteIdentifier}`,
        text: `New RSVP from ${name}\nEmail: ${email}\nAttending: ${attendingDesc} (code: ${attending})\nNumber of Guests: ${numGuests}\nFrom website: ${websiteIdentifier}`,
        html: `
          <h3>New RSVP Submission</h3>
          <p><strong>From Website:</strong> ${websiteIdentifier}</p>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Attendance Selection:</strong> ${attendingDesc} (code: ${attending})</p>
          <p><strong>Number of Guests:</strong> ${numGuests}</p>
        `,
      };
      log('info', 'mail option', mailOptions);
      await transporter.sendMail(mailOptions);
      log('success', 'RSVP email sent successfully', { name, email, website: websiteIdentifier, recipients: recipientEmails });
    }

    // Build label for confirmation email (only show soirée wording when relevant)
    let attendingLabel = '';
    const attendingMap = {
      '0': 'Marriage Only',
      '1': 'Marriage + Soirée',
      '2': 'Soirée Only'
    };
    const attendingDesc = attendingMap[attending] || 'Marriage + Soirée';
    attendingLabel = `<li><strong>Attendance:</strong> ${attendingDesc}</li>`;
    // Send confirmation email to the guest
    try {
      // Determine website URL based on ENV_TYPE
      let websiteUrl = "https://athiraandgowtham.onrender.com";
      let coupleNames = "Athira and Gowtham";
      
      if (envType === '0') {
        websiteUrl = "https://athiraandgowtham.onrender.com";
        coupleNames = "Athira and Gowtham";
      } else if (envType === '1') {
        websiteUrl = "https://athirawedsgowtham2025.onrender.com";
        coupleNames = "Athira and Gowtham";
      } else if (envType === '2') {
        websiteUrl = "https://gowthamwedsathira2025.onrender.com";
        coupleNames = "Gowtham and Athira";
      }
      
      // Construct thank you message based on attending status
  const thankYouMessage = `Thank you for your RSVP! We're delighted that you'll be joining us for: ${attendingDesc}.`;
      
      const guestMailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `Thank You for Your RSVP - ${coupleNames}'s Wedding`,
        text: `
Dear ${name},

${thankYouMessage}

Here's a summary of your RSVP details:
- Name: ${name}
- Number of Guests: ${numGuests}
- Attendance: ${attendingDesc} (code: ${attending})

You can always refer back to our wedding website for updates and information:
${websiteUrl}

We look forward to celebrating with you on August 21, 2025!

Warm regards,
${coupleNames}`,
        html: `
<div style="font-family: 'Abhaya Libre', serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; background-color: #fff7e1;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #617939; font-size: 24px; margin-bottom: 10px;">Thank You for Your RSVP</h1>
    <p style="font-size: 16px; color: #666; font-style: italic;">August 21, 2025 • Bengaluru, Karnataka, India</p>
  </div>
  
  <div style="background-color: white; padding: 25px; border-radius: 8px; margin-bottom: 25px;">
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Dear ${name},</p>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">${thankYouMessage}</p>
    
    <div style="background-color: rgba(97, 121, 57, 0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
      <p style="font-weight: bold; margin-bottom: 10px;">Your RSVP Details:</p>
      <ul style="list-style: none; padding-left: 0; margin: 0;">
        <li style="margin-bottom: 8px;"><strong>Name:</strong> ${name}</li>
        <li style="margin-bottom: 8px;"><strong>Number of Guests:</strong> ${numGuests}</li>
        ${attendingLabel}
      </ul>
    </div>
    
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">You can always refer back to our wedding website for updates and information:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${websiteUrl}" style="background-color: #617939; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Visit Wedding Website</a>
    </div>
  </div>
  
  <div style="text-align: center; margin-top: 30px; color: #617939; font-style: italic;">
    <p style="margin-bottom: 5px;">We look forward to celebrating with you!</p>
    <p style="font-size: 18px; margin-top: 10px;">- ${coupleNames}</p>
  </div>
</div>
        `
      };
      
      // Send the email with detailed logging
      log('info', 'Attempting to send RSVP confirmation email', {
        to: email,
        bcc: recipientEmails.join(', '),
        emailService: process.env.EMAIL_SERVICE,
        emailUser: process.env.EMAIL_USER ? process.env.EMAIL_USER.substring(0, 5) + '...' : 'undefined'
      });
      
      await transporter.sendMail(guestMailOptions);
      
      log('success', 'RSVP confirmation email sent to guest with BCC to admins', { 
        guestEmail: email,
        name,
        bccRecipients: recipientEmails.join(', ')
      });
    } catch (guestEmailError) {
      log('error', 'Failed to send RSVP confirmation email to guest', { 
        error: guestEmailError.message,
        stack: guestEmailError.stack,
        email,
        name
      });
      // Don't fail the request if the guest confirmation email fails
    }
    
    res.json({ success: true, message: 'RSVP sent successfully!' });
  } catch (error) {
    log('error', 'Failed to process RSVP', {
      error: error.message,
      name,
      email,
    });
    Sentry.captureException(error);
    res.status(500).json({ success: false, message: 'Failed to send RSVP' });
  }
});

// Handle photo upload
app.post('/upload-photo', upload.single('photo'), async (req, res) => {
  if (!req.file) {
    log('error', 'Photo upload failed - no file provided');
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  try {
    log('info', 'Photo upload received', {
      filename: req.file.originalname,
      url: req.file.path || 'No URL available',
    });

    // Get optimized preview URL
    const previewUrl = req.file.path.replace('/upload/', '/upload/w_400,c_scale,f_auto,q_auto/');

    // Send email notification if CONTACT_FORM_RECIPIENTS is set
    if (process.env.CONTACT_FORM_RECIPIENTS) {
      try {
        const recipients = process.env.CONTACT_FORM_RECIPIENTS.split(',').map(email => email.trim());
        
        const emailHtml = `
          <h2>New Photo Uploaded</h2>
          <p>A new photo has been uploaded to the wedding website. Please review if needed</p>
          <p><strong>Details:</strong></p>
          <ul>
            <li>Upload Date: ${new Date().toLocaleString()}</li>
            <li>File Name: ${req.file.originalname}</li>
          </ul>
          <p><strong>Preview:</strong></p>
          <img src="${previewUrl}" alt="Uploaded photo preview" style="max-width:400px; border-radius:8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <p><strong>Original URL:</strong><br>
          <a href="${req.file.path}">${req.file.path}</a></p>
        `;

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: recipients,
          subject: 'New Photo Upload - Wedding Website',
          html: emailHtml
        };

        await transporter.sendMail(mailOptions);
        log('info', 'Photo upload notification email sent', { recipients });
      } catch (emailError) {
        log('error', 'Failed to send photo upload notification email', { 
          error: emailError.message,
          filename: req.file.originalname
        });
        // Don't fail the upload if email fails
      }
    }

    res.json({
      success: true,
      message: 'File uploaded successfully',
      url: req.file.path,
    });
  } catch (error) {
    log('error', 'Photo upload failed', { error: error.message });
    Sentry.captureException(error);
    res.status(500).json({ success: false, message: 'Upload failed: ' + error.message });
  }
});

// Get our photos
app.get('/get-our-photos', async (req, res) => {
  try {
    log('info', 'Fetching our photos from Cloudinary');
    const result = await cloudinary.search
      .expression('folder:our-photos')
      .sort_by('created_at', 'desc')
      .max_results(30)
      .execute();

    const photos = result.resources.map(photo => photo.secure_url);
    log('success', 'Successfully fetched our photos', { count: photos.length });
    res.json(photos);
  } catch (error) {
    log('error', 'Failed to fetch our photos', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// Get shared photos with pagination using Cloudinary's alternative pagination approach
app.get('/get-shared-photos', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // page is for client-side tracking, not directly used in cursor API call
    const limit = parseInt(req.query.limit) || 5; // Changed default limit to 5
    const nextCursor = req.query.next_cursor || undefined;

    log('info', 'Fetching shared photos from Cloudinary', {
      page,
      limit,
      inputNextCursor: nextCursor || 'initial',
    });

    let searchQuery = cloudinary.search
      .expression('folder:shared-photos')
      .sort_by('created_at', 'desc')
      .max_results(limit);

    if (nextCursor) {
      log('debug', 'Applying next_cursor to shared-photos search', { nextCursorToApply: nextCursor });
      searchQuery = searchQuery.next_cursor(nextCursor);
    } else {
      log('debug', 'No next_cursor for shared-photos search, fetching first page');
    }

    let result;
    try {
      result = await searchQuery.execute();
      
      log('debug', 'Cloudinary API response structure (shared-photos)', {
        resourceCount: result.resources ? result.resources.length : 0,
        totalCount: result.total_count,
        hasNextCursor: !!result.next_cursor,
        returnedNextCursor: result.next_cursor || null
      });
    } catch (cloudinaryError) {
      log('error', 'Cloudinary API error', {
        error: cloudinaryError.message,
        stack: cloudinaryError.stack,
        details: JSON.stringify(cloudinaryError)
      });
      throw cloudinaryError;
    }

    const photos = result.resources.map(photo => photo.secure_url);
    
    log('success', 'Successfully fetched shared photos', {
      count: photos.length,
      hasMore: !!result.next_cursor,
    });

    res.json({
      photos,
      currentPage: page,
      next_cursor: result.next_cursor || null,
      hasMore: !!result.next_cursor,
    });
  } catch (error) {
    log('error', 'Failed to fetch shared photos', { 
      error: error.message,
      stack: error.stack
    });
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to fetch photos', details: error.message });
  }
});

// Route for the home page
app.get('/', (req, res) => {
  // Set the proper meta image based on ENV_TYPE
  let metaImageUrl = 'https://res.cloudinary.com/dl4p1qeva/image/upload/v1749536248/IMG_6491_jtve5z.jpg'; // Default image
  let metaTitle = "Athira & Gowtham's Wedding Invitation";
  let metaUrl = "https://res.cloudinary.com/dl4p1qeva/image/upload/v1749536248/IMG_6491_jtve5z.jpg"; // Default URL
  
  // ENV_TYPE specific customizations
  if (process.env.ENV_TYPE === '1') {
    metaImageUrl = 'https://res.cloudinary.com/dl4p1qeva/image/upload/v1749453776/PHOTO-2025-06-09-12-39-59_jkzc32.jpg';
    metaUrl = "https://athirawedsgowtham2025.onrender.com/";
  } else if (process.env.ENV_TYPE === '2') {
    metaImageUrl = 'https://res.cloudinary.com/dl4p1qeva/image/upload/v1749453775/PHOTO-2025-06-09-12-24-43_irrx0v.jpg';
    metaTitle = "Gowtham and Athira's Wedding Invitation";
    metaUrl = "https://gowthamwedsathira2025.onrender.com/";
  } else if (process.env.ENV_TYPE === '3') {
    metaImageUrl = 'https://res.cloudinary.com/dl4p1qeva/image/upload/v1749200000/PHOTO-2025-06-06-13-51-53_a5hlv6.jpg';
    metaTitle = "Athira & Gowtham's Wedding Invitation";
    metaUrl = "https://athiraandgowtham-wedding-invite.onrender.com/";
  }
  res.render(path.join(__dirname, 'index.html'), {
    process: {
      env: {
        GOOGLE_ANALYTICS_ID: process.env.GOOGLE_ANALYTICS_ID || '',
        SENTRY_DSN: process.env.SENTRY_DSN || '',
        ENV_TYPE: process.env.ENV_TYPE || '0', // Added ENV_TYPE
        META_IMAGE_URL: metaImageUrl,
        META_TITLE: metaTitle,
        META_URL: metaUrl,
        NODE_ENV: process.env.NODE_ENV || 'development'
      },
    },
  });
});

// Handle contact form submission
app.post('/submit-contact', async (req, res) => {
  const { name, email, message } = req.body;
  const envType = process.env.ENV_TYPE || '0';
  log('info', 'Contact form submission received', { name, email });

  try {
    // Create and save new contact entry to database
    const contact = new Contact({
      name,
      email,
      message,
      envType
    });
    
    await contact.save();
    log('success', 'Contact message saved to database', { name, email, envType });

    // Continue with the existing email sending logic
    // Get recipients from environment variable instead of hardcoding
    const recipientEmails = process.env.CONTACT_FORM_RECIPIENTS 
      ? process.env.CONTACT_FORM_RECIPIENTS.split(',').map(email => email.trim())
      : [process.env.RECIPIENT_EMAIL]; // Fallback to RECIPIENT_EMAIL if CONTACT_FORM_RECIPIENTS is not set
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipientEmails,
      subject: `Wedding Website Contact Form - Message from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`,
      html: `
                <h3>New Contact Form Submission</h3>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Message:</strong> ${message}</p>
            `,
    };

    await transporter.sendMail(mailOptions);
    log('success', 'Contact email sent successfully', { name, email, recipients: recipientEmails });
    res.json({ success: true });
  } catch (error) {
    log('error', 'Failed to send contact form email', {
      error: error.message,
      name,
      email,
    });
    Sentry.captureException(error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// Get our photos with compatible Cloudinary pagination
app.get('/our-photos', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // page is for client-side tracking
    const limit = parseInt(req.query.limit) || 5;
    const nextCursor = req.query.next_cursor || undefined;

    log('info', 'Loading our photos with pagination', {
      page,
      limit,
      inputNextCursor: nextCursor || 'initial',
    });

    let searchQuery = cloudinary.search
      .expression('folder:our-photos')
      .sort_by('created_at', 'desc')
      .max_results(limit);

    if (nextCursor) {
      log('debug', 'Applying next_cursor to our-photos search', { nextCursorToApply: nextCursor });
      searchQuery = searchQuery.next_cursor(nextCursor);
    } else {
      log('debug', 'No next_cursor for our-photos search, fetching first page');
    }
    
    let result;
    try {
      result = await searchQuery.execute();
      
      log('debug', 'Cloudinary our-photos API response', {
        resourceCount: result.resources ? result.resources.length : 0,
        totalCount: result.total_count,
        hasNextCursor: !!result.next_cursor,
        returnedNextCursor: result.next_cursor || null // Consistent logging key
      });

      if (result.resources && result.resources.length > 0) {
        const returnedPhotoIds = result.resources.map(r => r.public_id);
        log('debug', 'Cloudinary returned photo IDs for /our-photos', { 
          count: returnedPhotoIds.length, 
          firstFewIds: returnedPhotoIds.slice(0, 3) // Log first 3 public_ids
        });
      } else {
        log('debug', 'Cloudinary returned no resources for /our-photos for this request.');
      }

    } catch (cloudinaryError) {
      log('error', 'Cloudinary API error in our-photos', {
        error: cloudinaryError.message,
        details: JSON.stringify(cloudinaryError)
      });
      throw cloudinaryError;
    }

    const photos = result.resources.map(photo => photo.secure_url);

    log('success', 'Successfully fetched our photos', {
      count: photos.length,
      hasMore: !!result.next_cursor,
    });

    // Return consistent response format
    res.json({
      photos,
      currentPage: page,
      next_cursor: result.next_cursor || null,
      hasMore: !!result.next_cursor,
      totalPhotos: result.total_count || photos.length,
    });
  } catch (error) {
    log('error', 'Failed to fetch our photos', { 
      error: error.message,
      stack: error.stack
    });
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// Password middleware for protection
const passwordProtect = (req, res, next) => {
  const providedPassword = req.headers['x-upload-password'];
  
  if (!providedPassword || providedPassword !== process.env.UPLOAD_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized: Invalid password' });
  }
  
  next();
};

// Create multer storage for the guest photos endpoint
const guestUpload = multer({ 
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, '/tmp') // Temporary store files
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
      cb(null, file.fieldname + '-' + uniqueSuffix)
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB size limit
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Photo upload endpoint with password protection
app.post('/api/upload-photo', passwordProtect, guestUpload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo provided' });
    }

    // Upload to Cloudinary using the guest-photos preset
    const uploadResponse = await cloudinary.uploader.upload(req.file.path, {
      upload_preset: 'guest-photos',
      folder: 'our-photos',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif']
    });

    // Delete local file after upload
    fs.unlinkSync(req.file.path);

    // Get optimized preview URL
    const previewUrl = cloudinary.url(uploadResponse.public_id, {
      width: 400,
      crop: 'fill',
      format: 'jpg',
      quality: 'auto:good'
    });

    // Send email notification if CONTACT_FORM_RECIPIENTS is set
    if (process.env.CONTACT_FORM_RECIPIENTS) {
      try {
        const recipients = process.env.CONTACT_FORM_RECIPIENTS.split(',').map(email => email.trim());
        
        const emailHtml = `
          <h2>New Photo Uploaded</h2>
          <p>A new photo has been uploaded to the wedding website.</p>
          <p><strong>Details:</strong></p>
          <ul>
            <li>Upload Date: ${new Date().toLocaleString()}</li>
            <li>File Name: ${req.file.originalname}</li>
            <li>File Size: ${(uploadResponse.bytes / 1024 / 1024).toFixed(2)} MB</li>
            <li>Format: ${uploadResponse.format}</li>
          </ul>
          <p><strong>Preview:</strong></p>
          <img src="${previewUrl}" alt="Uploaded photo preview" style="max-width:400px; border-radius:8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <p><strong>Original URL:</strong><br>
          <a href="${uploadResponse.secure_url}">${uploadResponse.secure_url}</a></p>
        `;

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: recipients,
          subject: 'New Photo Upload - Wedding Website',
          html: emailHtml
        };

        await transporter.sendMail(mailOptions);
        log('info', 'Photo upload notification email sent', { recipients });
      } catch (emailError) {
        log('error', 'Failed to send photo upload notification email', { 
          error: emailError.message,
          filename: req.file.originalname
        });
        // Don't fail the request if email fails
      }
    }

    res.json({
      success: true,
      url: uploadResponse.secure_url,
      message: 'Photo uploaded successfully'
    });

  } catch (error) {
    console.error('Error in photo upload:', error);
    log('error', 'Photo upload failed', { error: error.message });
    
    if (req.file && req.file.path) {
      // Cleanup local file if it exists
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('Error cleaning up local file:', e);
      }
    }
    
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// Create a password verification endpoint
app.post('/api/verify-password', (req, res) => {
  const providedPassword = req.headers['x-upload-password'];
  
  if (!providedPassword || providedPassword !== process.env.UPLOAD_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized: Invalid password' });
  }
  
  res.status(200).json({ success: true, message: 'Password verified' });
});

// Serve the photo upload form
app.get('/upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'upload-form.html'));
});

// Generate ICS file for calendar download via endpoint
app.get('/wedding-invitation-endpoint', (req, res) => {
  try {
    console.log('Generating ICS file with ENV_TYPE:', process.env.ENV_TYPE);
    
    // Get the correct website URL and title based on ENV_TYPE
    let websiteUrl = "https://athiraandgowtham.onrender.com";
    let eventTitle = "Athira & Gowtham's Wedding";
    
    if (process.env.ENV_TYPE === '1') {
      websiteUrl = "https://athirawedsgowtham2025.onrender.com";
      eventTitle = "Athira & Gowtham's Wedding";
      console.log('Using ENV_TYPE 1 settings for ICS');
    } else if (process.env.ENV_TYPE === '2') {
      websiteUrl = "https://gowthamwedsathira2025.onrender.com";
      eventTitle = "Gowtham & Athira's Wedding";
      console.log('Using ENV_TYPE 2 settings for ICS');
    } else {
      console.log('Using default (0) settings for ICS');
    }
    
    // Format date/time to ICS format
    const startDate = new Date('2025-08-21T10:00:00+05:30');
    const endDate = new Date('2025-08-21T18:00:00+05:30');
    const icsStartDate = startDate.toISOString().replace(/-|:|\.\d{3}/g, '');
    const icsEndDate = endDate.toISOString().replace(/-|:|\.\d{3}/g, '');

    // Create ICS content with the correct DESCRIPTION
    const location = 'Villa Kasu, 1, Kariyammana Agrahara Rd, Yemalur, Bengaluru 560037, Karnataka, India';
    const description = `You are cordially invited to celebrate our wedding on August 21, 2025 in Bengaluru. Join us for a day of love, laughter, and celebration!\n\nWebsite: ${websiteUrl}\nVenue: Villa Kasu\nTime: 10:00 AM - 1:00 PM IST\n\nFor directions: https://maps.google.com/?q=12.943319832193993,77.68109909325422`;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//athiraandgowtham//Wedding Invitation//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `SUMMARY:${eventTitle}`,
      `DTSTART:${icsStartDate}`,
      `DTEND:${icsEndDate}`,
      `LOCATION:${location}`,
      `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    // Set appropriate headers and send file
    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Content-Disposition', 'attachment; filename=wedding-invitation.ics');
    res.send(icsContent);

    log('info', 'ICS calendar file downloaded via endpoint', { 
      envType: process.env.ENV_TYPE, 
      usedWebsite: websiteUrl,
      usedTitle: eventTitle
    });
  } catch (error) {
    console.error('Error generating ICS file:', error);
    log('error', 'Error generating ICS file', { error: error.message });
    res.status(500).send('Error generating calendar file');
  }
});

// The error handler must be registered before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

// Optional fallthrough error handler
app.use(function onError(err, req, res, next) {
  log('error', 'Server error', { error: err.message });
  res.statusCode = 500;
  res.end('Internal Server Error');
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to MongoDB');
})
.catch(err => {
  console.error('MongoDB connection error:', err.message);
});

// Guestbook schema and model
const guestbookSchema = new mongoose.Schema({
  name: { type: String, required: true },
  message: { type: String, required: true },
  background: { type: String, default: 'default' }, // Add background field
  createdAt: { type: Date, default: Date.now },
});

const Guestbook = mongoose.model('Guestbook', guestbookSchema);

// Translation schema and model for multi-language support
const translationSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  en: { type: String, required: true }, // English (default)
  ml: { type: String, required: true }, // Malayalam
  ta: { type: String, required: true }, // Tamil
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Translation = mongoose.model('Translation', translationSchema);

// API endpoint to submit guestbook entry
app.post('/api/guestbook', async (req, res) => {
  const { name, message, background } = req.body;
  
  if (!name || !message) {
    return res.status(400).json({ success: false, message: 'Name and message are required' });
  }
  
  log('info', 'Guestbook submission received', { name, background });

  try {
    // Create new guestbook entry with background
    const entry = new Guestbook({
      name,
      message,
      background: background || 'default' // Use provided background or default
    });
    
    // Save to database
    await entry.save();
    
    // Send email notification if notification emails are configured
    if (process.env.GUESTBOOK_NOTIFICATION_EMAILS) {
      try {
        // Get the correct website URL based on ENV_TYPE
        let websiteUrl = "https://athiraandgowtham.onrender.com";
        
        if (process.env.ENV_TYPE === '1') {
          websiteUrl = "https://athirawedsgowthan.onrender.com";
        } else if (process.env.ENV_TYPE === '2') {
          websiteUrl = "https://gowthamwedsathira.onrender.com";
        } else if (process.env.ENV_TYPE === '3') {
          websiteUrl = "https://athiraandgowtham-wedding-invite.onrender.com";
        }
        
        const notificationEmails = process.env.GUESTBOOK_NOTIFICATION_EMAILS.split(',').map(email => email.trim());
        
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: notificationEmails,
          subject: `New Wedding Book Entry from ${name}`,
          html: `
            <h2>New Wedding Book Message</h2>
            <p><strong>From:</strong> ${name}</p>
            <p><strong>Background Style:</strong> ${background || 'default'}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Message:</strong></p>
            <div style="padding: 15px; border-left: 4px solid #617939; background-color: #f9f9f9; margin: 10px 0;">
              ${message}
            </div>
            <p>View all messages in your <a href="${websiteUrl}?section=guestbook">Wedding Book</a>.</p>
          `
        };
        
        await transporter.sendMail(mailOptions);
        log('success', 'Guestbook notification email sent', { 
          recipients: notificationEmails,
          websiteUrl: websiteUrl 
        });
      } catch (emailError) {
        log('error', 'Failed to send guestbook notification email', { 
          error: emailError.message,
          name,
          recipients: process.env.GUESTBOOK_NOTIFICATION_EMAILS 
        });
        // Don't return error to client, just log it since the entry was saved successfully
      }
    }
    
    log('success', 'Guestbook entry saved successfully', { name, background });
    res.json({ success: true, message: 'Thank you for your message!' });
  } catch (error) {
    log('error', 'Failed to save guestbook entry', { error: error.message });
    Sentry.captureException(error);
    res.status(500).json({ success: false, message: 'Failed to save your message' });
  }
});

// API endpoint to get guestbook entries
app.get('/api/guestbook', async (req, res) => {
  try {
    const entries = await Guestbook.find().sort({ createdAt: -1 }).limit(100);
    res.json(entries);
  } catch (error) {
    log('error', 'Failed to fetch guestbook entries', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch guestbook entries' });
  }
});

// API endpoint to get translations for a specific language
app.get('/api/translations/:lang', async (req, res) => {
  try {
    const { lang } = req.params;
    
    // Validate language
    if (!['en', 'ml', 'ta'].includes(lang)) {
      return res.status(400).json({ error: 'Invalid language. Supported: en, ml, ta' });
    }
    
    const translations = await Translation.find({});
    const result = {};
    
    translations.forEach(translation => {
      result[translation.key] = translation[lang];
    });
    
    res.json(result);
  } catch (error) {
    log('error', 'Failed to fetch translations', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch translations' });
  }
});

// API endpoint to add/update translations (for admin use)
app.post('/api/translations', async (req, res) => {
  try {
    const { key, en, ml, ta } = req.body;
    
    if (!key || !en || !ml || !ta) {
      return res.status(400).json({ error: 'All fields (key, en, ml, ta) are required' });
    }
    
    const translation = await Translation.findOneAndUpdate(
      { key },
      { key, en, ml, ta, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, translation });
  } catch (error) {
    log('error', 'Failed to save translation', { error: error.message });
    res.status(500).json({ error: 'Failed to save translation' });
  }
});

// Start the server
app.listen(PORT, () => {
  // Log startup information including ENV_TYPE for debugging
  console.log(`Server started on port ${PORT}`);
  console.log('ENV_TYPE at startup:', process.env.ENV_TYPE || 'undefined');
  console.log('ENV_TYPE type:', typeof process.env.ENV_TYPE);
  
  log('info', `Server started`, { 
    port: PORT,
    envType: process.env.ENV_TYPE || 'undefined',
    envTypeType: typeof process.env.ENV_TYPE
  });
});
