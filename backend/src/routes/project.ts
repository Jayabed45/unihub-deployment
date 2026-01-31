import { Router } from 'express';
import {
  createProject,
  deleteProject,
  evaluateProject,
  listProjects,
  getProject,
  listProjectSummaries,
  exportProjectSummaryWorkbook,
  requestJoinProject,
  respondToJoinRequest,
  joinActivity,
  listActivityRegistrations,
  updateActivityRegistration,
  deleteActivityRegistration,
  updateActivitySchedule,
  listParticipantActivities,
  listProjectBeneficiaries,
  updateProjectBeneficiary,
  upsertActivityEvaluation,
  listActivityEvaluations,
  listProjectEvaluationSummaries,
  updateExtensionActivities,
} from '../controllers/projectController';

const router = Router();

router.get('/', listProjects);
router.get('/summary', listProjectSummaries);
router.get('/summary-xlsx', exportProjectSummaryWorkbook);
router.post('/', createProject);
router.get('/participant-activities', listParticipantActivities);
router.get('/:id', getProject);
router.get('/:id/evaluations-summary', listProjectEvaluationSummaries);
router.get('/:id/beneficiaries', listProjectBeneficiaries);
router.patch('/:id/beneficiaries', updateProjectBeneficiary);
router.patch('/:id/evaluate', evaluateProject);
router.delete('/:id', deleteProject);
router.post('/:id/join', requestJoinProject);
router.post('/:id/join/respond', respondToJoinRequest);
router.post('/:id/activities/:activityId/join', joinActivity);
router.get('/:id/activities/:activityId/registrations', listActivityRegistrations);
router.patch('/:id/activities/:activityId/registrations', updateActivityRegistration);
router.delete('/:id/activities/:activityId/registrations', deleteActivityRegistration);
router.patch('/:id/activities/:activityId/schedule', updateActivitySchedule);
router.patch('/:id/activities/:activityId/evaluations', upsertActivityEvaluation);
router.get('/:id/activities/:activityId/evaluations', listActivityEvaluations);
router.patch('/:id/extension-activities', updateExtensionActivities);

export default router;
