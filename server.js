require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');

// Logger function
function log(type, message, data = {}) {
    const timestamp = new Date().toISOString();
    console.log(JSON.stringify({
        timestamp,
        type,
        message,
        ...data
    }));
}

// Cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
const PORT = process.env.PORT || 3000;
const ourPhotosDir = path.join(__dirname, 'images/uploads');

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
});

// Ensure uploads directory exists
if (!fs.existsSync(ourPhotosDir)) {
    fs.mkdirSync(ourPhotosDir, { recursive: true });
}

// Email configuration
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Configure multer for file upload
const upload = multer({ storage: multer.memoryStorage() });

// Middleware to parse form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use('/images/uploads', express.static(path.join(__dirname, 'images/uploads')));

// The request handler must be the first middleware on the app
app.use(Sentry.Handlers.requestHandler());

// TracingHandler creates a trace for every incoming request
app.use(Sentry.Handlers.tracingHandler());

// Handle RSVP form submission
app.post('/submit-rsvp', async (req, res) => {
    const { name, email, attending } = req.body;
    log('info', 'RSVP submission received', { name, email, attending });
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.RECIPIENT_EMAIL,
        subject: 'New RSVP Submission',
        text: `New RSVP from ${name}\nEmail: ${email}\nAttending Sangeet: ${attending}`
    };

    try {
        await transporter.sendMail(mailOptions);
        log('success', 'RSVP email sent successfully', { name, email });
        res.json({ success: true, message: 'RSVP sent successfully!' });
    } catch (error) {
        log('error', 'Failed to send RSVP email', { error: error.message, name, email });
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
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = 'data:' + req.file.mimetype + ';base64,' + b64;
        
        log('info', 'Attempting to upload photo to Cloudinary', { mimetype: req.file.mimetype });
        const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'shared-photos'
        });

        log('success', 'Photo uploaded successfully', { publicId: result.public_id });
        res.setHeader('Content-Type', 'application/json');
        res.json({ 
            success: true, 
            message: 'File uploaded successfully',
            url: result.secure_url,
            publicId: result.public_id
        });
    } catch (error) {
        log('error', 'Photo upload failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Upload failed' });
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

// Get shared photos with pagination
app.get('/get-shared-photos', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 12;
        
        log('info', 'Fetching shared photos from Cloudinary', { page, limit });
        const result = await cloudinary.search
            .expression('folder:shared-photos')
            .sort_by('created_at', 'desc')
            .max_results(100)
            .execute();
        
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const photos = result.resources.slice(startIndex, endIndex).map(photo => photo.secure_url);
        
        log('success', 'Successfully fetched shared photos', { 
            page, 
            totalPhotos: result.resources.length,
            returnedPhotos: photos.length 
        });
        
        res.json({
            photos,
            currentPage: page,
            totalPages: Math.ceil(result.resources.length / limit),
            hasMore: endIndex < result.resources.length
        });
    } catch (error) {
        log('error', 'Failed to fetch shared photos', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch photos' });
    }
});

// Render the index page
app.get('/', (req, res) => {
    fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, data) => {
        if (err) {
            log('error', 'Failed to read index.html', { error: err.message });
            return res.status(500).send('Error loading page');
        }
        
        // Replace placeholder with actual Google Analytics ID
        const html = data.replace(/<%=\s*process\.env\.GOOGLE_ANALYTICS_ID\s*%>/g, process.env.GOOGLE_ANALYTICS_ID);
        res.send(html);
    });
});

// Handle contact form submission
app.post('/submit-contact', async (req, res) => {
    const { name, email, message } = req.body;
    
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
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (error) {
        log('error', 'Failed to send contact form email', { error: error.message, name, email });
        Sentry.captureException(error);
        res.status(500).json({ success: false, message: 'Failed to send message' });
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