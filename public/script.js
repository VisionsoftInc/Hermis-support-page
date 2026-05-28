// Configuration
const SUPPORT_EMAIL = 'events@visionsoftaspaclimited.onmicrosoft.com';

// Open email client with pre-filled To: address
function openEmailClient() {
  // Simple mailto link with just the To: address
  const mailtoLink = `mailto:${SUPPORT_EMAIL}`;

  console.log('Opening email client:', mailtoLink);
  
  // Create link and click it
  const link = document.createElement('a');
  link.href = mailtoLink;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  console.log('Email link clicked');
  
  // Show success message
  showSuccess();
}

function showSuccess() {
  const successMsg = document.getElementById('successMessage');
  
  // Hide error if any
  const errorMsg = document.getElementById('errorMessage');
  if (errorMsg) {
    errorMsg.classList.add('hidden');
  }
  
  // Show success message
  if (successMsg) {
    successMsg.classList.remove('hidden');
    
    // Hide after 3 seconds
    setTimeout(() => {
      successMsg.classList.add('hidden');
    }, 3000);
  }
}

function showError(message) {
  const errorMsg = document.getElementById('errorMessage');
  const errorText = document.getElementById('errorText');

  if (errorText) {
    errorText.textContent = message;
  }
  if (errorMsg) {
    errorMsg.classList.remove('hidden');
  }
}

function hideError() {
  const errorMsg = document.getElementById('errorMessage');
  if (errorMsg) {
    errorMsg.classList.add('hidden');
  }
}
