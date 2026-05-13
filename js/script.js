document.addEventListener('DOMContentLoaded', () => {
  // Mobile Menu Toggle
  const mobileBtn = document.getElementById('mobile-btn');
  const navLinks = document.getElementById('nav-links');

  if (mobileBtn && navLinks) {
    mobileBtn.addEventListener('click', () => {
      navLinks.classList.toggle('active');
      const icon = mobileBtn.querySelector('i');
      if (navLinks.classList.contains('active')) {
        icon.classList.remove('fa-bars');
        icon.classList.add('fa-times');
      } else {
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
      }
    });
  }

  // Active Link Highlighting
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const navItems = document.querySelectorAll('.nav-links a');
  
  navItems.forEach(item => {
    const itemPath = item.getAttribute('href');
    if (itemPath === currentPath) {
      item.classList.add('active');
    }
  });

  // Smooth Scrolling
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Authentication Logic
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  
  // Find auth link and booking link in navigation
  const navList = document.getElementById('nav-links');
  if (navList) {
    // If we are logged in
    if (token && user) {
      // Create Logout button
      const logoutLi = document.createElement('li');
      logoutLi.innerHTML = `<a href="#" id="logout-btn" style="color: var(--primary-color);">Logout (${user.name})</a>`;
      navList.appendChild(logoutLi);

      document.getElementById('logout-btn').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
      });

      // Add My Bookings link if not admin
      if (user.role !== 'admin' && !document.querySelector('a[href="my_bookings.html"]')) {
        const myBookingsLi = document.createElement('li');
        myBookingsLi.innerHTML = `<a href="my_bookings.html">My Bookings</a>`;
        navList.insertBefore(myBookingsLi, logoutLi);
      }

      // Hide auth.html link if it exists
      const authLink = document.querySelector('a[href="auth.html"]');
      if (authLink) authLink.parentElement.style.display = 'none';
      
      // Change "Book Now" buttons to point to booking.html safely
      // (They already do, so no action needed unless we want to hide it when logged out)
    } else {
      // User is NOT logged in.
      // Redirect from protected pages (booking.html)
      if (currentPath === 'booking.html') {
        window.location.href = 'auth.html';
      }
      
      // Update links that go to booking to go to auth first
      document.querySelectorAll('a[href="booking.html"]').forEach(link => {
        // Only change if it's the nav link or CTA button
        link.addEventListener('click', (e) => {
          e.preventDefault();
          alert("Please login or register first to book an appointment.");
          window.location.href = 'auth.html';
        });
      });
      
      // If auth.html link doesn't exist in nav (like in some pages), add it
      const authLinkExists = document.querySelector('a[href="auth.html"]');
      if (!authLinkExists) {
        const loginLi = document.createElement('li');
        loginLi.innerHTML = `<a href="auth.html">Login/Register</a>`;
        navList.appendChild(loginLi);
      }
    }
  }
});
