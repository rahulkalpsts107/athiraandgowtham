# Wedding Invitation Website

A beautiful, responsive wedding invitation website with features for photo sharing and RSVP management.

## Features

- Responsive design that works on all devices
- Interactive countdown to the wedding day
- Photo slideshow gallery
- Photo sharing capability for guests
- RSVP system
- Location information with map integration
- Live streaming section for virtual attendance

## Setup

1. Clone the repository:
```bash
git clone https://github.com/rahulkalpsts107/athiraandgowtham.git
cd athiraandgowtham
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
node server.js
```

The site will be available at `http://localhost:3000`

## Deployment

This project is configured for deployment on Render.com:

1. Create a Render account at https://render.com
2. Connect your GitHub repository
3. Create a new Web Service
4. Use these settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node
   - Branch: main
   - Environment Variables: None required

The site will be available at `your-app-name.onrender.com`

## Structure

- `index.html` - Main webpage
- `styles.css` - Styling
- `server.js` - Node.js server for handling uploads and RSVP
- `uploads/` - Directory for stored photos (auto-created)

## Technologies Used

- HTML5
- CSS3
- JavaScript
- Node.js
- Express.js
- Google Maps API