# Invito - Wedding Invitation Website

[![Better Stack Badge](https://img.shields.io/badge/monitoring-Better%20Stack-blue)](https://betterstack.com/)
[![Cloudinary Badge](https://img.shields.io/badge/images-Cloudinary-orange)](https://cloudinary.com/)
[![Node.js Badge](https://img.shields.io/badge/powered%20by-Node.js-green)](https://nodejs.org/)
[![Express Badge](https://img.shields.io/badge/server-Express-lightgrey)](https://expressjs.com/)
[![Sentry Badge](https://img.shields.io/badge/error%20monitoring-Sentry-red)](https://sentry.io/)

A beautiful, responsive wedding invitation website with RSVP, photo sharing, and live streaming features.

## Features

- 💌 Digital wedding invitation
- 📍 Location details with maps
- 📆 RSVP management
- 📸 Photo sharing for guests
- 📹 Live streaming support
- 📱 Fully responsive design
- 🔔 Contact form
- ⏱️ Countdown timer

## Technology Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express
- **Storage**: Cloudinary for image hosting
- **Monitoring**: Better Stack (formerly Logtail)
- **Error Tracking**: Sentry
- **Analytics**: Google Analytics

## Deployment

The site is deployed on [Render](https://render.com)

## Environment Variables

The following environment variables need to be set:

```
EMAIL_SERVICE=
EMAIL_USER=
EMAIL_PASS=
RECIPIENT_EMAIL=
PORT=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
GOOGLE_ANALYTICS_ID=
SENTRY_DSN=
BETTERSTACK_SOURCE_TOKEN=
```

## Local Development

1. Clone the repository
2. Install dependencies with `npm install`
3. Create a `.env` file with the required environment variables
4. Run the development server with `npm start`

## License

This project is licensed under the MIT License - see the LICENSE file for details.
