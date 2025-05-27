# Invito - Wedding Invitation Website

A modern, responsive wedding invitation website built with Node.js and Express, featuring real-time photo sharing, RSVP management, and live streaming integration.

## Features

- 📱 Responsive design for all devices
- 🎨 Modern, elegant UI with smooth animations
- 📸 Photo gallery with Cloudinary integration
- 📍 Interactive venue location with Google Maps
- ✉️ RSVP management system
- 🔄 Real-time photo sharing
- 📹 Live streaming support
- 📊 Google Analytics integration
- 🐛 Error tracking with Sentry

## Tech Stack

- Node.js
- Express
- Cloudinary
- Nodemailer
- Google Analytics
- Sentry

## Environment Variables

Create a `.env` file in the root directory:

```env
EMAIL_SERVICE=your-email-service
EMAIL_USER=your-email
EMAIL_PASS=your-email-password
RECIPIENT_EMAIL=recipient-email
PORT=3000
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
GOOGLE_ANALYTICS_ID=your-ga-id
SENTRY_DSN=your-sentry-dsn
```

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Create `.env` file with required variables
4. Start the server: `npm start`

## Development

The server will start on `http://localhost:3000`

## License

© Anvi Corp 2025
