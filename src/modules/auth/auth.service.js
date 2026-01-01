// src/modules/auth/auth.service.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, transaction } from '../../config/db.js';
import fonnteService from '../../utils/fonnteService.js';

class AuthService {
  constructor() {
    this.otpStore = new Map(); // In-memory store for OTP (gunakan Redis di production)
    this.passwordResetStore = new Map(); // In-memory store for password reset
    
    this.MAX_OTP_ATTEMPTS = 3;
    this.OTP_EXPIRY_MINUTES = 10;
    
    this.MAX_RESET_ATTEMPTS = 5;
  }

  /**
   * Register new user
   */
  async register(userData) {
    const { username, phone, password, full_name, address, role = 'customer' } = userData;

    // Validation
    if (!username || !phone || !password || !full_name) {
      throw new Error('Username, phone, password, and full name are required');
    }

    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    if (!/^08[0-9]{9,12}$/.test(phone)) {
      throw new Error('Invalid phone number format. Use Indonesian format (08xxxxxxxxxx)');
    }

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE username = $1 OR phone = $2',
      [username, phone]
    );

    if (existingUser.rows.length > 0) {
      const existingUsername = await query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );
      
      if (existingUsername.rows.length > 0) {
        throw new Error('Username already exists');
      } else {
        throw new Error('Phone number already registered');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const result = await query(
      `INSERT INTO users (username, phone, password, full_name, address, role) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, username, phone, full_name, address, role, profile_picture, 
                 phone_verified, is_active, created_at`,
      [username, phone, hashedPassword, full_name, address, role]
    );

    const user = result.rows[0];

    // Generate and send OTP for phone verification
    await this.generateOTP(phone);

    return user;
  }

  /**
   * Login user with username/phone and password
   */
  async login(identifier, password) {
    if (!identifier || !password) {
      throw new Error('Username/phone and password are required');
    }

    const queryText = `
      SELECT id, username, phone, password, full_name, role, profile_picture, 
             phone_verified, is_active, created_at
      FROM users 
      WHERE (username = $1 OR phone = $1) AND is_active = true
      LIMIT 1
    `;

    const result = await query(queryText, [identifier]);

    if (result.rows.length === 0) {
      throw new Error('User not found or account is inactive');
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Check if phone is verified
    if (!user.phone_verified) {
      throw new Error('Phone number not verified. Please verify your phone first.');
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        phone: user.phone,
        role: user.role
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    // Remove password from user object
    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token
    };
  }

  /**
   * Generate and send OTP via WhatsApp
   */
  async generateOTP(phone) {
    if (!phone) {
      throw new Error('Phone number is required');
    }

    // Format phone number (remove +62 or 0 prefix)
    const formattedPhone = phone.replace(/^(\+62|62|0)/, '');

    // Check if user exists with this phone
    const userResult = await query(
      'SELECT id, username FROM users WHERE phone = $1',
      [phone]
    );

    if (userResult.rows.length === 0) {
      throw new Error('Phone number not registered');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    // Store OTP in memory
    this.otpStore.set(phone, {
      otp,
      expiresAt,
      attempts: 0,
      generatedAt: new Date()
    });

    // Send OTP via WhatsApp
    try {
      await fonnteService.sendOTP(phone, otp);
    } catch (error) {
      console.error('Failed to send OTP via Fonnte:', error.message);
      // Remove OTP from store if sending failed
      this.otpStore.delete(phone);
      throw new Error('Failed to send OTP. Please try again later.');
    }

    return {
      success: true,
      message: 'OTP sent successfully',
      phone: phone,
      expiresIn: `${this.OTP_EXPIRY_MINUTES} minutes`,
      note: 'OTP will expire in 10 minutes'
    };
  }

  /**
   * Verify OTP
   */
  async verifyOTP(phone, otp) {
    if (!phone || !otp) {
      throw new Error('Phone number and OTP are required');
    }

    const storedData = this.otpStore.get(phone);

    if (!storedData) {
      throw new Error('OTP not found or expired. Please request a new OTP.');
    }

    // Check if OTP has expired
    if (new Date() > storedData.expiresAt) {
      this.otpStore.delete(phone);
      throw new Error('OTP has expired. Please request a new OTP.');
    }

    // Check if too many attempts
    if (storedData.attempts >= this.MAX_OTP_ATTEMPTS) {
      this.otpStore.delete(phone);
      throw new Error('Too many incorrect attempts. OTP has been invalidated. Please request a new OTP.');
    }

    // Verify OTP
    if (storedData.otp !== otp) {
      storedData.attempts += 1;
      this.otpStore.set(phone, storedData);
      throw new Error(`Invalid OTP. ${this.MAX_OTP_ATTEMPTS - storedData.attempts} attempts remaining.`);
    }

    // OTP verified successfully - remove from store
    this.otpStore.delete(phone);

    // Update user's phone_verified status
    await query(
      'UPDATE users SET phone_verified = true, updated_at = CURRENT_TIMESTAMP WHERE phone = $1',
      [phone]
    );

    // Get updated user data
    const userResult = await query(
      'SELECT id, username, phone, full_name, role, phone_verified FROM users WHERE phone = $1',
      [phone]
    );

    return {
      success: true,
      message: 'Phone number verified successfully',
      user: userResult.rows[0]
    };
  }

  /**
   * Resend OTP
   */
  async resendOTP(phone) {
    if (!phone) {
      throw new Error('Phone number is required');
    }

    // Check if user exists
    const userResult = await query(
      'SELECT id, username, phone_verified FROM users WHERE phone = $1',
      [phone]
    );

    if (userResult.rows.length === 0) {
      throw new Error('Phone number not registered');
    }

    // Check if phone is already verified
    const user = userResult.rows[0];
    if (user.phone_verified) {
      throw new Error('Phone number is already verified');
    }

    // Check rate limiting (prevent OTP spam)
    const storedData = this.otpStore.get(phone);
    if (storedData) {
      const timeSinceLastOTP = new Date() - storedData.generatedAt;
      const minTimeBetweenOTP = 60 * 1000; // 1 minute

      if (timeSinceLastOTP < minTimeBetweenOTP) {
        const waitTime = Math.ceil((minTimeBetweenOTP - timeSinceLastOTP) / 1000);
        throw new Error(`Please wait ${waitTime} seconds before requesting a new OTP.`);
      }
    }

    // Generate and send new OTP
    return this.generateOTP(phone);
  }

  /**
   * Get user profile
   */
  async getProfile(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const result = await query(
      `SELECT 
        id, username, phone, full_name, address, role, 
        profile_picture, phone_verified, is_active, 
        created_at, updated_at
       FROM users 
       WHERE id = $1 AND is_active = true`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found or account is inactive');
    }

    return result.rows[0];
  }

  /**
   * Update user profile
   */
  async updateProfile(userId, updateData) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Allowed fields for update
    const allowedFields = ['full_name', 'address', 'profile_picture'];
    const updates = [];
    const values = [];
    let index = 1;

    // Build update query dynamically
    for (const [field, value] of Object.entries(updateData)) {
      if (allowedFields.includes(field) && value !== undefined && value !== null && value !== '') {
        updates.push(`${field} = $${index}`);
        values.push(value);
        index++;
      }
    }

    // If password update is requested
    if (updateData.password) {
      if (updateData.password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }
      const hashedPassword = await bcrypt.hash(updateData.password, 10);
      updates.push(`password = $${index}`);
      values.push(hashedPassword);
      index++;
    }

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Add userId to values
    values.push(userId);
    
    const queryText = `
      UPDATE users 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${index} AND is_active = true
      RETURNING 
        id, username, phone, full_name, address, role, 
        profile_picture, phone_verified, is_active, 
        created_at, updated_at
    `;

    const result = await query(queryText, values);
    
    if (result.rows.length === 0) {
      throw new Error('User not found or account is inactive');
    }

    return result.rows[0];
  }

  /**
   * Verify current password (for sensitive operations)
   */
  async verifyPassword(userId, password) {
    const result = await query(
      'SELECT password FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = result.rows[0];
    return await bcrypt.compare(password, user.password);
  }

  /**
   * Change password (authenticated)
   */
  async changePassword(userId, currentPassword, newPassword) {
    if (!currentPassword || !newPassword) {
      throw new Error('Current password and new password are required');
    }

    if (newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters');
    }

    // Verify current password
    const isPasswordValid = await this.verifyPassword(userId, currentPassword);
    if (!isPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    const result = await query(
      `UPDATE users 
       SET password = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING id, username`,
      [hashedPassword, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to update password');
    }

    return {
      success: true,
      message: 'Password changed successfully'
    };
  }

  /**
   * Check if phone number exists
   */
  async checkPhoneExists(phone) {
    const result = await query(
      'SELECT id, username, phone_verified FROM users WHERE phone = $1',
      [phone]
    );

    return {
      exists: result.rows.length > 0,
      user: result.rows[0] || null
    };
  }

  /**
   * Check if username exists
   */
  async checkUsernameExists(username) {
    const result = await query(
      'SELECT id, username FROM users WHERE username = $1',
      [username]
    );

    return {
      exists: result.rows.length > 0
    };
  }

  /**
   * Deactivate user account (soft delete)
   */
  async deactivateAccount(userId, password) {
    // Verify password first
    const isPasswordValid = await this.verifyPassword(userId, password);
    if (!isPasswordValid) {
      throw new Error('Password is incorrect');
    }

    const result = await query(
      `UPDATE users 
       SET is_active = false, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING id, username, phone`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to deactivate account');
    }

    return {
      success: true,
      message: 'Account deactivated successfully'
    };
  }

  /**
   * Validate OTP without consuming it (for frontend validation)
   */
  async validateOTP(phone, otp) {
    const storedData = this.otpStore.get(phone);

    if (!storedData) {
      return { isValid: false, message: 'OTP not found' };
    }

    if (new Date() > storedData.expiresAt) {
      return { isValid: false, message: 'OTP expired' };
    }

    return {
      isValid: storedData.otp === otp,
      attemptsRemaining: this.MAX_OTP_ATTEMPTS - storedData.attempts
    };
  }

  /**
   * Get OTP status
   */
  async getOTPStatus(phone) {
    const storedData = this.otpStore.get(phone);

    if (!storedData) {
      return { exists: false, message: 'No active OTP found' };
    }

    const expiresIn = Math.max(0, storedData.expiresAt - new Date());
    const expiresInMinutes = Math.ceil(expiresIn / (60 * 1000));

    return {
      exists: true,
      attempts: storedData.attempts,
      expiresIn: expiresInMinutes,
      generatedAt: storedData.generatedAt
    };
  }

  /**
   * Clean expired OTPs (can be called periodically)
   */
  cleanExpiredOTPs() {
    const now = new Date();
    let cleanedCount = 0;

    for (const [phone, data] of this.otpStore.entries()) {
      if (now > data.expiresAt) {
        this.otpStore.delete(phone);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  // ============= SIMPLE PASSWORD RESET METHODS =============

  /**
   * Request password reset - step 1: send OTP to phone
   */
  async requestPasswordReset(phone) {
    if (!phone) {
      throw new Error('Phone number is required');
    }

    // Check if user exists and is active
    const userResult = await query(
      'SELECT id, username, phone, phone_verified, is_active FROM users WHERE phone = $1',
      [phone]
    );

    if (userResult.rows.length === 0) {
      throw new Error('Phone number not found');
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      throw new Error('Account is inactive. Please contact support.');
    }

    if (!user.phone_verified) {
      throw new Error('Phone number is not verified. Please verify your phone first.');
    }

    // Check rate limiting (prevent OTP spam)
    const resetData = this.passwordResetStore.get(phone);
    if (resetData) {
      const timeSinceLastRequest = new Date() - resetData.generatedAt;
      const minTimeBetweenRequests = 2 * 60 * 1000; // 2 minutes cooldown

      if (timeSinceLastRequest < minTimeBetweenRequests) {
        const waitTime = Math.ceil((minTimeBetweenRequests - timeSinceLastRequest) / 1000);
        throw new Error(`Please wait ${waitTime} seconds before requesting another password reset.`);
      }

      // Check if too many attempts
      if (resetData.attempts >= this.MAX_RESET_ATTEMPTS) {
        this.passwordResetStore.delete(phone);
        throw new Error('Too many password reset attempts. Please try again later.');
      }
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    // Store OTP in otpStore
    this.otpStore.set(phone, {
      otp,
      expiresAt: otpExpiresAt,
      attempts: 0,
      generatedAt: new Date(),
      forPasswordReset: true,
      userId: user.id
    });

    // Store reset request data
    this.passwordResetStore.set(phone, {
      userId: user.id,
      phone: phone,
      attempts: resetData ? resetData.attempts + 1 : 1,
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes for complete reset
      status: 'otp_sent'
    });

    // Send OTP via WhatsApp
    try {
      const message = `Kode reset password Anda: ${otp}\nKode berlaku ${this.OTP_EXPIRY_MINUTES} menit. Jangan berikan kode ini kepada siapapun.`;
      await fonnteService.sendMessage(phone, message);
    } catch (error) {
      console.error('Failed to send password reset OTP:', error.message);
      // Clean up stored data if sending fails
      this.otpStore.delete(phone);
      this.passwordResetStore.delete(phone);
      throw new Error('Failed to send reset code. Please try again later.');
    }

    return {
      success: true,
      message: 'Password reset OTP sent successfully',
      phone: phone,
      expiresIn: `${this.OTP_EXPIRY_MINUTES} minutes`
    };
  }

  /**
   * Verify password reset OTP - step 2: verify OTP
   */
  async verifyPasswordResetOTP(phone, otp) {
    if (!phone || !otp) {
      throw new Error('Phone number and OTP are required');
    }

    const storedData = this.otpStore.get(phone);
    const resetData = this.passwordResetStore.get(phone);

    if (!storedData || !resetData) {
      throw new Error('OTP not found or expired. Please request a new password reset.');
    }

    // Check if OTP is for password reset
    if (!storedData.forPasswordReset) {
      throw new Error('Invalid OTP context. Please request password reset again.');
    }

    // Check if OTP has expired
    if (new Date() > storedData.expiresAt) {
      this.otpStore.delete(phone);
      this.passwordResetStore.delete(phone);
      throw new Error('OTP has expired. Please request a new password reset.');
    }

    // Check if reset request has expired
    if (new Date() > resetData.expiresAt) {
      this.otpStore.delete(phone);
      this.passwordResetStore.delete(phone);
      throw new Error('Reset request has expired. Please request a new password reset.');
    }

    // Check if too many attempts
    if (storedData.attempts >= this.MAX_OTP_ATTEMPTS) {
      this.otpStore.delete(phone);
      this.passwordResetStore.delete(phone);
      throw new Error('Too many incorrect OTP attempts. Please request a new password reset.');
    }

    // Verify OTP
    if (storedData.otp !== otp) {
      storedData.attempts += 1;
      this.otpStore.set(phone, storedData);
      
      // Update reset attempts too
      resetData.attempts += 1;
      this.passwordResetStore.set(phone, resetData);
      
      // Check if reset attempts exceeded
      if (resetData.attempts >= this.MAX_RESET_ATTEMPTS) {
        this.otpStore.delete(phone);
        this.passwordResetStore.delete(phone);
        throw new Error('Too many password reset attempts. Please try again later.');
      }
      
      throw new Error(`Invalid OTP. ${this.MAX_OTP_ATTEMPTS - storedData.attempts} attempts remaining.`);
    }

    // OTP verified successfully - mark as verified
    storedData.verified = true;
    storedData.verifiedAt = new Date();
    this.otpStore.set(phone, storedData);

    // Update reset request status
    resetData.status = 'otp_verified';
    resetData.otpVerifiedAt = new Date();
    this.passwordResetStore.set(phone, resetData);

    return {
      success: true,
      message: 'OTP verified successfully. You can now set your new password.',
      phone: phone,
      expiresIn: '10 minutes'
    };
  }

  /**
   * Complete password reset - step 3: set new password
   */
  async resetPassword(phone, otp, newPassword) {
    if (!phone || !otp || !newPassword) {
      throw new Error('Phone, OTP, and new password are required');
    }

    if (newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    // Get stored data
    const storedData = this.otpStore.get(phone);
    const resetData = this.passwordResetStore.get(phone);

    if (!storedData || !resetData) {
      throw new Error('Reset request not found. Please start the password reset process again.');
    }

    // Verify OTP again for security
    if (storedData.otp !== otp) {
      throw new Error('Invalid OTP. Please verify OTP again.');
    }

    // Check if OTP has expired
    if (new Date() > storedData.expiresAt) {
      this.otpStore.delete(phone);
      this.passwordResetStore.delete(phone);
      throw new Error('OTP has expired. Please request a new password reset.');
    }

    // Check if reset request has expired
    if (new Date() > resetData.expiresAt) {
      this.otpStore.delete(phone);
      this.passwordResetStore.delete(phone);
      throw new Error('Reset request has expired. Please request a new password reset.');
    }

    // Check if OTP was verified
    if (!storedData.verified) {
      throw new Error('OTP not verified. Please verify OTP first.');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    const result = await query(
      `UPDATE users 
       SET password = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND phone = $3 AND is_active = true
       RETURNING id, username, phone`,
      [hashedPassword, resetData.userId, phone]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to reset password. User not found or account inactive.');
    }

    const user = result.rows[0];

    // Clean up stored data
    this.passwordResetStore.delete(phone);
    this.otpStore.delete(phone);

    // Invalidate all existing sessions
    try {
      await query(
        'DELETE FROM user_sessions WHERE user_id = $1',
        [resetData.userId]
      );
    } catch (error) {
      console.error('Error invalidating sessions:', error.message);
      // Continue even if session cleanup fails
    }

    // Send confirmation message
    try {
      const message = `Password Anda telah berhasil direset. Jika Anda tidak melakukan perubahan ini, segera hubungi kami.`;
      await fonnteService.sendMessage(phone, message);
    } catch (error) {
      console.error('Failed to send confirmation message:', error.message);
      // Continue even if message sending fails
    }

    return {
      success: true,
      message: 'Password has been reset successfully. You can now login with your new password.',
      phone: user.phone,
      username: user.username
    };
  }

  /**
   * Validate reset request status
   */
  async validateResetStatus(phone) {
    if (!phone) {
      throw new Error('Phone number is required');
    }

    const resetData = this.passwordResetStore.get(phone);
    const otpData = this.otpStore.get(phone);

    if (!resetData || !otpData) {
      return { 
        isValid: false, 
        message: 'No active reset request found' 
      };
    }

    // Check if expired
    if (new Date() > resetData.expiresAt) {
      return { 
        isValid: false, 
        message: 'Reset request expired' 
      };
    }

    const expiresIn = Math.max(0, resetData.expiresAt - new Date());
    const expiresInMinutes = Math.ceil(expiresIn / (60 * 1000));

    return {
      isValid: true,
      phone: phone,
      status: resetData.status,
      otpVerified: otpData.verified || false,
      expiresIn: expiresInMinutes,
      attemptsRemaining: this.MAX_RESET_ATTEMPTS - resetData.attempts
    };
  }

  /**
   * Clean expired reset requests
   */
  cleanExpiredResetRequests() {
    const now = new Date();
    let cleanedCount = 0;

    for (const [phone, data] of this.passwordResetStore.entries()) {
      if (now > data.expiresAt) {
        this.passwordResetStore.delete(phone);
        // Also clean associated OTP
        this.otpStore.delete(phone);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}

// Export singleton instance
export default new AuthService();