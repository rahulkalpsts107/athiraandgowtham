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
    const limit = parseInt(req.query.limit) || 12;
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

// Render the index page - this should be BEFORE any catch-all routes
app.get('/', (req, res) => {
  res.render(path.join(__dirname, 'index.html'), {
    process: {
      env: {
        GOOGLE_ANALYTICS_ID: process.env.GOOGLE_ANALYTICS_ID || '',
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

// The error handler must be registered before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

// Optional fallthrough error handler
app.use(function onError(err, req, res, next) {
  log('error', 'Server error', { error: err.message });
  res.statusCode = 500;
  res.end('Internal Server Error');
});

// Start the server
app.listen(PORT, () => {
  log('info', `Server started`, { port: PORT });
});
