// src/modules/auth/auth.controller.js
import authService from './auth.service.js';

class AuthController {
  async register(req, res) {
    try {
      const { username, phone, password, full_name, address } = req.body;

      if (!username || !phone || !password || !full_name) {
        return res.status(400).json({
          success: false,
          message: 'Username, phone, password, and full name are required'
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters'
        });
      }

      const user = await authService.register(req.body);

      res.status(201).json({
        success: true,
        message: 'Registration successful. Please verify your phone number.',
        data: user
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async login(req, res) {
    try {
      const { identifier, password } = req.body;

      if (!identifier || !password) {
        return res.status(400).json({
          success: false,
          message: 'Username/phone and password are required'
        });
      }

      const result = await authService.login(identifier, password);

      res.json({
        success: true,
        message: 'Login successful',
        data: result
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: error.message
      });
    }
  }

  async requestOTP(req, res) {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required'
        });
      }

      const result = await authService.generateOTP(phone);

      res.json({
        success: true,
        message: 'OTP sent successfully',
        data: {
          phone: result.phone,
          expiresIn: result.expiresIn
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async verifyOTP(req, res) {
    try {
      const { phone, otp } = req.body;

      if (!phone || !otp) {
        return res.status(400).json({
          success: false,
          message: 'Phone number and OTP are required'
        });
      }

      const result = await authService.verifyOTP(phone, otp);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async resendOTP(req, res) {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required'
        });
      }

      const result = await authService.resendOTP(phone);

      res.json({
        success: true,
        message: 'OTP resent successfully',
        data: {
          phone: result.phone,
          expiresIn: result.expiresIn
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getProfile(req, res) {
    try {
      const user = await authService.getProfile(req.user.id);

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateProfile(req, res) {
    try {
      const user = await authService.updateProfile(req.user.id, req.body);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: user
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ============= PASSWORD RESET METHODS =============

  async requestPasswordReset(req, res) {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required'
        });
      }

      const result = await authService.requestPasswordReset(phone);

      res.json({
        success: true,
        message: result.message,
        data: {
          phone: result.phone,
          expiresIn: result.expiresIn
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async verifyPasswordResetOTP(req, res) {
    try {
      const { phone, otp } = req.body;

      if (!phone || !otp) {
        return res.status(400).json({
          success: false,
          message: 'Phone number and OTP are required'
        });
      }

      const result = await authService.verifyPasswordResetOTP(phone, otp);

      res.json({
        success: true,
        message: result.message,
        data: {
          phone: result.phone,
          expiresIn: result.expiresIn
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async resetPassword(req, res) {
    try {
      const { phone, otp, newPassword } = req.body;

      if (!phone || !otp || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Phone, OTP, and new password are required'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters'
        });
      }

      const result = await authService.resetPassword(phone, otp, newPassword);

      res.json({
        success: true,
        message: result.message,
        data: {
          phone: result.phone,
          username: result.username
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async validateResetStatus(req, res) {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required'
        });
      }

      const result = await authService.validateResetStatus(phone);

      res.json({
        success: result.isValid,
        message: result.message,
        data: {
          isValid: result.isValid,
          phone: result.phone,
          status: result.status,
          otpVerified: result.otpVerified,
          expiresIn: result.expiresIn,
          attemptsRemaining: result.attemptsRemaining
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

export default new AuthController();