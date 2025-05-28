document.addEventListener('DOMContentLoaded', function () {
  // Hide all sections initially except the first one
  const sections = document.querySelectorAll('.section');
  sections.forEach((section, index) => {
    if (index !== 0) section.classList.add('hidden');
  });

  // Add active state to navigation and handle section visibility
  document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', function (e) {
      e.preventDefault();

      // Remove active class from all links and add to clicked link
      document
        .querySelectorAll('nav a')
        .forEach(el => el.classList.remove('active'));
      this.classList.add('active');

      // Hide all sections
      document.querySelectorAll('.section').forEach(section => {
        section.classList.add('hidden');
      });

      // Show the target section
      const targetId = this.getAttribute('href').substring(1);
      document.getElementById(targetId).classList.remove('hidden');
    });
  });

  // Set initial active state
  const firstNavLink = document.querySelector('nav a');
  if (firstNavLink) firstNavLink.classList.add('active');

  // Contact Popup functionality
  const contactButton = document.getElementById('contactButton');
  const contactPopup = document.getElementById('contactPopup');
  const closePopup = document.querySelector('.close-popup');
  const contactForm = document.getElementById('contactForm');

  contactButton.addEventListener('click', () => {
    contactPopup.classList.add('active');
  });

  closePopup.addEventListener('click', () => {
    contactPopup.classList.remove('active');
  });

  contactPopup.addEventListener('click', e => {
    if (e.target === contactPopup) {
      contactPopup.classList.remove('active');
    }
  });

  contactForm.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData(contactForm);
    const status = document.getElementById('contactStatus');

    // Simulate form submission
    status.textContent = 'Sending message...';

    // Here you would typically send the data to your server
    // For now, we'll just simulate a successful submission
    setTimeout(() => {
      status.textContent = 'Message sent successfully!';
      contactForm.reset();
      setTimeout(() => {
        contactPopup.classList.remove('active');
        status.textContent = '';
      }, 2000);
    }, 1000);
});

// Make copyHashtag function global so it can be called from onclick
window.copyHashtag = function(event) {
  console.log('Copy function called');
  
  if (event) {
    event.preventDefault();
  }
  
  const hashtag = '#athirawedsgowtham2025'; // Use the exact hashtag text
  const button = event ? event.target : null;
  
  console.log('Attempting to copy:', hashtag);
  
  // Try modern clipboard API first (works on HTTPS and localhost)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    console.log('Using modern clipboard API');
    navigator.clipboard.writeText(hashtag).then(() => {
      console.log('Copy successful!');
      if (button) {
        button.textContent = 'Copied!';
        button.classList.add('copied');
        setTimeout(() => {
          button.textContent = 'Copy';
          button.classList.remove('copied');
        }, 2000);
      }
    }).catch((err) => {
      console.error('Clipboard API failed:', err);
      fallbackCopy(hashtag, button);
    });
  } else {
    console.log('Clipboard API not available, using fallback');
    fallbackCopy(hashtag, button);
  }
};

function fallbackCopy(text, button) {
  // Create a temporary textarea
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '-9999px';
  
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    const successful = document.execCommand('copy');
    console.log('Fallback copy result:', successful);
    if (successful && button) {
      button.textContent = 'Copied!';
      button.classList.add('copied');
      setTimeout(() => {
        button.textContent = 'Copy';
        button.classList.remove('copied');
      }, 2000);
    } else if (button) {
      button.textContent = 'Failed';
      setTimeout(() => {
        button.textContent = 'Copy';
      }, 2000);
    }
  } catch (err) {
    console.error('Fallback copy failed:', err);
    if (button) {
      button.textContent = 'Failed';
      setTimeout(() => {
        button.textContent = 'Copy';
      }, 2000);
    }
  }
  
  document.body.removeChild(textArea);
}
