const { sendEmail } = require("../src/mailer");

async function sendMail({ to, subject, html, text, attachments }) {
  return sendEmail({ to, subject, html, text, attachments });
}

module.exports = {
  sendMail
};
