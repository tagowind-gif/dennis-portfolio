/** INFO1005 V9 enhancement: a real mailto composer with native form validation.
 * No message data is transmitted to a site server or saved in localStorage.
 * The visitor must personally send the draft from their email application.
 */
(() => {
  'use strict';
  const form = document.querySelector('#contact-compose-form');
  if (!form) return;
  const status = document.querySelector('#contact-compose-status');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      if (status) status.textContent = 'Please complete the required fields before opening your draft.';
      return;
    }
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const email = String(data.get('email') || '').trim();
    const topic = String(data.get('topic') || '').trim();
    const message = String(data.get('message') || '').trim();
    if (!name || !email || !topic || !message) return;
    const subject = `Portfolio enquiry — ${topic}`;
    const body = `Hello Dennis,\n\n${message}\n\nFrom: ${name}\nReply-to: ${email}`;
    const destination = `mailto:dennistan2006@outlook.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (status) status.textContent = 'Your email draft is opening. Please review and send it in your email app. No message has been sent yet.';
    window.location.href = destination;
  });
})();
