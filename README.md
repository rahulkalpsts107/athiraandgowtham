# Wedding Invitation Website

A beautiful, interactive wedding invitation website built with Node.js, Express, and vanilla JavaScript.

## Features

- **Interactive Video Invitation** - YouTube video with custom mute controls
- **Photo Gallery** - Slideshow of wedding photos with lazy loading
- **Photo Sharing** - Guests can upload and share photos
- **RSVP System** - Online RSVP form with email notifications
- **Live Streaming** - Wedding day live stream section
- **Mobile Responsive** - Works seamlessly on all devices
- **Contact Form** - Easy way for guests to get in touch

## Tech Stack

- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Database**: Cloudinary for image storage
- **Email**: Nodemailer for notifications
- **Analytics**: Google Analytics integration
- **Error Tracking**: Sentry integration

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with the following variables:
   ```
   PORT=3000
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_password
   GOOGLE_ANALYTICS_ID=your_ga_id
   SENTRY_DSN=your_sentry_dsn
   ```

## Development

### Available Scripts

- `npm start` - Start the production server
- `npm run dev` - Start the development server
- `npm run lint` - Check code for linting issues
- `npm run lint:fix` - Automatically fix linting issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check if code is properly formatted

### Code Quality

This project uses:
- **ESLint** for code linting
- **Prettier** for code formatting
- **HTML plugin** for linting JavaScript in HTML files

## Deployment

The application is configured for deployment on Render.com with automatic deploys from the main branch.

## Project Structure

```
├── server.js           # Main server file
├── index.html          # Main HTML file
├── styles.css          # Main stylesheet
├── package.json        # Dependencies and scripts
├── .eslintrc.json      # ESLint configuration
├── .prettierrc.json    # Prettier configuration
└── README.md           # This file
```

## Features in Detail

### YouTube Video Integration
- Custom mute button with state synchronization
- Autoplay and loop functionality
- Responsive video player

### Photo Management
- Batch loading for performance
- Cloudinary integration for optimization
- Infinite scroll for shared photos

### RSVP System
- Form validation and submission
- Email notifications to couple
- Status feedback for users

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `CLOUDINARY_*` | Cloudinary configuration for image storage |
| `EMAIL_*` | Gmail configuration for notifications |
| `GOOGLE_ANALYTICS_ID` | Google Analytics tracking ID |
| `SENTRY_DSN` | Sentry error tracking DSN |

## Contributing

1. Run linting before committing: `npm run lint`
2. Format code: `npm run format`
3. Test thoroughly on mobile devices

## License

Private project for wedding use.
