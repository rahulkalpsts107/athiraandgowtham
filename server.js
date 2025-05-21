const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname)));

// Handle RSVP form submission
app.post('/submit-rsvp', (req, res) => {
    const { name, email, attending } = req.body;
    console.log(`RSVP received: Name: ${name}, Email: ${email}, Attending: ${attending}`);
    res.send('<h1>Thank you for your RSVP!</h1><p>We look forward to seeing you at the wedding.</p>');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});