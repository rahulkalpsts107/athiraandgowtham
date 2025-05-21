const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 3000;

// Email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'athiraandgowtham@gmail.com', // Replace with your Gmail
        pass: 'mjjm kqhp zupx jqwg'     // Replace with your app password
    }
});

// Create required directories
const uploadsDir = path.join(__dirname, 'images/uploads');
const ourPhotosDir = path.join(__dirname, 'images/ourphotos');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(ourPhotosDir)){
    fs.mkdirSync(ourPhotosDir, { recursive: true });
}

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir)
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});

const upload = multer({ storage: storage });

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use('/images/uploads', express.static(path.join(__dirname, 'images/uploads')));

// Handle RSVP form submission
app.post('/submit-rsvp', async (req, res) => {
    const { name, email, attending } = req.body;
    
    const mailOptions = {
        from: 'athiraandgowtham@gmail.com',
        to: ['aparnarevi.nair@gmail.com'], // Replace with the email where you want to receive RSVPs
        subject: 'New Wedding RSVP',
        html: `
            <h2>New RSVP Received</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Attending Dance:</strong> ${attending}</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'RSVP sent successfully!' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ success: false, message: 'Failed to send RSVP' });
    }
});

// Get uploaded photos
app.get('/get-photos', (req, res) => {
    fs.readdir(uploadsDir, (err, files) => {
        if (err) {
            console.error('Error reading uploads directory:', err);
            return res.status(500).json({ error: 'Error reading uploads directory' });
        }
        
        if (!files || files.length === 0) {
            console.log('No files found in uploads directory');
            return res.json([]);
        }

        const photos = files
            .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
            .map(file => '/images/uploads/' + file);
            
        console.log('Found photos:', photos);
        res.json(photos);
    });
});

// Handle photo upload
app.post('/upload-photo', upload.single('photo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    res.json({ success: true, message: 'File uploaded successfully' });
});

// Get our photos
app.get('/get-our-photos', (req, res) => {
    fs.readdir(path.join(__dirname, 'images/ourphotos'), (err, files) => {
        if (err) {
            console.error('Error reading ourphotos directory:', err);
            return res.json([]);
        }
        const photos = files
            .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
            .map(file => '/images/ourphotos/' + file);
        res.json(photos);
    });
});

// Get shared photos
app.get('/get-shared-photos', (req, res) => {
    fs.readdir(path.join(__dirname, 'images/uploads'), (err, files) => {
        if (err) {
            console.error('Error reading uploads directory:', err);
            return res.json([]);
        }
        const photos = files
            .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
            .map(file => '/images/uploads/' + file);
        res.json(photos);
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});