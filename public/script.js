// Configuration
const SUPPORT_EMAIL = 'events@visionsoftaspaclimited.onmicrosoft.com';
const SUPPORT_PHONE = '+919390385763';

// Open email client with pre-filled To: address
function openEmailClient() {
  hideCallOptions();

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

function toggleCallOptions() {
  hideError();

  const callOptions = document.getElementById('callOptions');
  if (!callOptions) return;

  callOptions.classList.toggle('hidden');
}

function hideCallOptions() {
  const callOptions = document.getElementById('callOptions');
  if (callOptions) {
    callOptions.classList.add('hidden');
  }
}

function callSupportViaDialer() {
  hideError();
  const dialLink = `tel:${SUPPORT_PHONE}`;

  const link = document.createElement('a');
  link.href = dialLink;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  hideCallOptions();
}

function callSupportViaWhatsApp() {
  hideError();
  const whatsappLink = `https://wa.me/${SUPPORT_PHONE.replace('+', '')}`;
  window.open(whatsappLink, '_blank', 'noopener,noreferrer');
  hideCallOptions();
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
