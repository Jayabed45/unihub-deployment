import { INotification } from '../models/Notification';
import { IProject } from '../models/Project';
import { IUser } from '../models/User';

const UNIHUB_LOGO_URL =
  'https://storage.googleapis.com/unihub-33b55.appspot.com/unihub-logo-v2-email.png';
const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const createBaseEmail = (subject: string, content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; color: #343a40; }
    .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background-color: #ffc107; padding: 24px; text-align: center; }
    .header img { max-width: 150px; }
    .content { padding: 32px; }
    .content h2 { color: #212529; font-size: 22px; margin-top: 0; }
    .content p { line-height: 1.6; font-size: 16px; }
    .button { display: inline-block; background-color: #ffc107; color: #212529; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px; }
    .footer { background-color: #f1f3f5; padding: 24px; text-align: center; font-size: 12px; color: #6c757d; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${UNIHUB_LOGO_URL}" alt="UNIHUB Logo">
    </div>
    <div class="content">
      <h2>${subject}</h2>
      ${content}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} UNIHUB. All rights reserved.</p>
      <p>This is an automated notification. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
`;

interface TemplateData {
  notification: INotification;
  project?: IProject | null;
  user?: IUser | null;
}

const getJoinRequestContent = ({ notification, project, user }: TemplateData) => `
  <p>You have a new request to join your project, <strong>${project?.name || 'a project'}</strong>.</p>
  <p><strong>${user?.email || notification.recipientEmail}</strong> wants to join.</p>
  <a href="${BASE_URL}/project-leader/participants" class="button">View Join Requests</a>
`;

const getJoinRequestApprovedContent = ({ notification, project }: TemplateData) => `
  <p>Congratulations!</p>
  <p>Your request to join the project <strong>${project?.name || 'a project'}</strong> has been approved.</p>
  <a href="${BASE_URL}/participant/Feeds" class="button">View My Projects</a>
`;

const getActivityJoinContent = ({ notification, project }: TemplateData) => {
  const activityTitleMatch = notification.message.match(/activity '(.*?)'/);
  const activityTitle = activityTitleMatch ? activityTitleMatch[1] : 'an activity';
  return `
    <p>A participant has joined an activity in your project, <strong>${project?.name || 'a project'}</strong>.</p>
    <p><strong>${notification.recipientEmail}</strong> joined '${activityTitle}'.</p>
    <a href="${BASE_URL}/project-leader/participants" class="button">View Participants</a>
  `;
};

const getActivityEvaluationContent = ({ notification, project }: TemplateData) => {
    const activityTitleMatch = notification.message.match(/:(.*?):/);
    const activityTitle = activityTitleMatch ? activityTitleMatch[1] : 'this activity';
    return `
    <p>An activity you participated in has concluded.</p>
    <p>Please take a moment to complete the evaluation form for <strong>${activityTitle}</strong> in project <strong>${project?.name || 'a project'}</strong>.</p>
    <a href="${BASE_URL}/participant/Feeds" class="button">Complete Evaluation</a>
  `;
};

const getActivityReminderContent = ({ notification, project }: TemplateData) => {
    const activityTitleMatch = notification.message.match(/:(.*?):/);
    const activityTitle = activityTitleMatch ? activityTitleMatch[1] : 'An activity';
    const mainMessage = notification.message.substring(notification.message.indexOf(':') + 1);
    return `
    <p>This is a reminder for an activity in project <strong>${project?.name || 'a project'}</strong>.</p>
    <p><strong>${activityTitle}</strong>: ${mainMessage}</p>
    <a href="${BASE_URL}/participant/Feeds" class="button">View Activity Feeds</a>
  `;
};

export const generateEmailHtml = (data: TemplateData): { subject: string; html: string } => {
  const { notification } = data;
  let subject = notification.title;
  let content = `<p>${notification.message}</p>`; // Fallback

  switch (notification.title) {
    case 'Join request':
      subject = 'New Join Request for Your Project';
      content = getJoinRequestContent(data);
      break;
    case 'Join request approved':
        subject = 'Your Join Request Was Approved';
        content = getJoinRequestApprovedContent(data);
        break;
    case 'Activity join':
        subject = 'New Participant Joined an Activity';
        content = getActivityJoinContent(data);
        break;
    case 'Activity Evaluation':
        subject = 'Please Evaluate Your Recent Activity';
        content = getActivityEvaluationContent(data);
        break;
    case 'Activity Starting Soon':
    case 'Activity Started':
    case 'Activity Ending Soon':
    case 'Activity Ended':
        subject = `Activity Reminder: ${notification.title}`;
        content = getActivityReminderContent(data);
        break;
  }

  return {
    subject,
    html: createBaseEmail(subject, content),
  };
};
