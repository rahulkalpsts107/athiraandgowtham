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

// Log all requests
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

  next();
});

// Handle RSVP form submission
app.post('/submit-rsvp', async (req, res) => {
  const { name, email, attending } = req.body;
  log('info', 'RSVP submission received', { name, email, attending });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.RECIPIENT_EMAIL,
    subject: 'New RSVP Submission',
    text: `New RSVP from ${name}\nEmail: ${email}\nAttending Sangeet: ${attending}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    log('success', 'RSVP email sent successfully', { name, email });
    res.json({ success: true, message: 'RSVP sent successfully!' });
  } catch (error) {
    log('error', 'Failed to send RSVP email', {
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
    return res
      .status(400)
      .json({ success: false, message: 'No file uploaded.' });
  }

  try {
    log('info', 'Photo upload received', {
      filename: req.file.originalname,
      url: req.file.path || 'No URL available',
    });

    // When using CloudinaryStorage with multer, the upload to Cloudinary is already done
    // and req.file contains the result with path containing the Cloudinary URL
    res.json({
      success: true,
      message: 'File uploaded successfully',
      url: req.file.path,
    });
  } catch (error) {
    log('error', 'Photo upload failed', { error: error.message });
    Sentry.captureException(error);
    res
      .status(500)
      .json({ success: false, message: 'Upload failed: ' + error.message });
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
  let metaImageUrl = 'https://res.cloudinary.com/dl4p1qeva/image/upload/v1749017407/PHOTO-2025-06-04-11-34-28_wrfsik.jpg'; // Default image
  let metaTitle = "Athira & Gowtham's Wedding Invitation";
  let metaUrl = "https://athiraandgowtham.onrender.com/"; // Default URL
  
  // ENV_TYPE specific customizations
  if (process.env.ENV_TYPE === '1') {
    metaImageUrl = 'https://res.cloudinary.com/dl4p1qeva/image/upload/v1749052619/PHOTO-2025-06-04-21-02-34_zjg7f1.jpg';
    metaUrl = "https://athirawedsgowthan.onrender.com/";
  } else if (process.env.ENV_TYPE === '2') {
    metaImageUrl = 'https://res.cloudinary.com/dl4p1qeva/image/upload/v1749052620/PHOTO-2025-06-04-21-23-18_gco7lr.jpg';
    metaTitle = "Gowtham and Athira's Wedding Invitation";
    metaUrl = "https://gowthamwedsathira.onrender.com/";
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
        META_URL: metaUrl
      },
    },
  });
});

// Handle contact form submission
app.post('/submit-contact', async (req, res) => {
  const { name, email, message } = req.body;
  log('info', 'Contact form submission received', { name, email });

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: ['rahulkalpsts107@gmail.com', 'aparnarevi.nair@gmail.com'],
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
    log('success', 'Contact email sent successfully', { name, email });
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
      folder: 'our-photos'
    });

    // Remove the temp file
    fs.unlinkSync(req.file.path);

    res.status(200).json({ 
      success: true, 
      url: uploadResponse.secure_url,
      public_id: uploadResponse.public_id
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
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
      websiteUrl = "https://athirawedsgowthan.onrender.com";
      eventTitle = "Athira & Gowtham's Wedding";
      console.log('Using ENV_TYPE 1 settings for ICS');
    } else if (process.env.ENV_TYPE === '2') {
      websiteUrl = "https://gowthamwedsathira.onrender.com";
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
    const location = 'Vila Kasu, 1, Kariyammana Agrahara Rd, Yemalur, Bengaluru 560037, Karnataka, India';
    const description = `You are cordially invited to celebrate our wedding on August 21, 2025 in Bengaluru. Join us for a day of love, laughter, and celebration!\n\nWebsite: ${websiteUrl}\nVenue: Vila Kasu\nTime: 10:00 AM - 6:00 PM IST\nDress Code: Traditional Indian Attire\n\nFor directions: https://maps.google.com/?q=12.943319832193993,77.68109909325422`;

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

// Start the server
app.listen(PORT, () => {
  log('info', `Server started`, { port: PORT });
});
