// src/modules/auth/auth.route.js
import express from 'express';
import authController from './auth.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/request-otp', authController.requestOTP);
router.post('/verify-otp', authController.verifyOTP);
router.post('/resend-otp', authController.resendOTP);

// Password reset routes (simplified)
router.post('/password/reset/request', authController.requestPasswordReset);      // Step 1: Request reset
router.post('/password/reset/verify-otp', authController.verifyPasswordResetOTP); // Step 2: Verify OTP
router.post('/password/reset/confirm', authController.resetPassword);            // Step 3: Set new password
router.post('/password/reset/status', authController.validateResetStatus);       // Check reset status

// Protected routes
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);

export default router;