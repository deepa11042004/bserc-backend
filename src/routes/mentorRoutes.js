const express = require('express');
const mentorRegistrationController = require('../controllers/mentorRegistrationController');
const mentorRatingController = require('../controllers/mentorRatingController');
const { uploadMentorRegistrationFiles } = require('../middleware/mentorRegistrationUpload');

const router = express.Router();

/**
 * @openapi
 * /api/mentor/register:
 *   post:
 *     tags: [Mentors]
 *     summary: Register a mentor profile with optional resume and profile photo
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [full_name, email, phone, dob]
 *             properties:
 *               full_name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               dob:
 *                 type: string
 *                 example: 1990-01-31
 *               resume:
 *                 type: string
 *                 format: binary
 *               profile_photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Mentor registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate email
 */
router.post('/mentor/register', uploadMentorRegistrationFiles, mentorRegistrationController.registerMentor);
router.post('/mentor/create-order', mentorRegistrationController.createPaymentOrder);
router.post(
  '/mentor/log-payment-attempt',
  uploadMentorRegistrationFiles,
  mentorRegistrationController.logPaymentAttempt
);

router.get('/mentor/requests', mentorRegistrationController.getPendingMentors);
router.get('/mentor/list', mentorRegistrationController.getActiveMentors);
router.patch('/mentor/:id/approve', mentorRegistrationController.approveMentor);
router.patch('/mentor/:id/pending', mentorRegistrationController.moveMentorToPending);
router.delete('/mentor/:id/reject', mentorRegistrationController.rejectMentor);

router.get('/mentor/:id', mentorRegistrationController.getMentorById);
router.patch('/mentor/:id', mentorRegistrationController.updateMentor);
router.get('/mentor/:id/resume', mentorRegistrationController.getMentorResume);
router.get('/mentor/:id/profile-photo', mentorRegistrationController.getMentorProfilePhoto);

// Mentor Rating Routes
router.post('/mentor/:mentorId/rating', mentorRatingController.submitRating);
router.get('/mentor/:mentorId/rating/average', mentorRatingController.getAverageRating);
router.get('/mentor/:mentorId/ratings', mentorRatingController.getRatings);
router.get('/mentor/:mentorId/rating/user', mentorRatingController.getUserRating);

module.exports = router;
