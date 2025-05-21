document.addEventListener('DOMContentLoaded', function() {
    // Hide all sections initially except the first one
    const sections = document.querySelectorAll('.section');
    sections.forEach((section, index) => {
        if (index !== 0) section.classList.add('hidden');
    });

    // Add active state to navigation and handle section visibility
    document.querySelectorAll('nav a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all links and add to clicked link
            document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));
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
});