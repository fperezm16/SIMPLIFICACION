const { sendEmail } = require("../src/mailer");

async function sendMail({ to, subject, html, text }) {
  return sendEmail({ to, subject, html, text });
}

module.exports = {
  sendMail
};
