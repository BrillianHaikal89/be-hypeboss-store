// src/utils/fonnteService.js
import axios from 'axios';

class FonnteService {
  constructor() {
    this.apiUrl = 'https://api.fonnte.com/send';
    this.token = process.env.FONNTE_API_TOKEN;
  }

  /**
   * Send OTP via WhatsApp
   */
  async sendOTP(phone, otpCode) {
    try {
      if (!this.token) {
        console.warn('⚠️ Fonnte API token is not configured. Using mock mode.');
        // Mock response for development
        console.log(`📨 [MOCK] OTP ${otpCode} would be sent to ${phone}`);
        return {
          success: true,
          messageId: `mock-${Date.now()}`,
          mock: true
        };
      }

      const message =
        `🔐 *BOSS STORE - KODE OTP*\n\n` +
        `Kode OTP Anda adalah: *${otpCode}*\n\n` +
        `Kode ini berlaku selama 10 menit.\n` +
        `Jangan berikan kode ini kepada siapapun.\n\n` +
        `Jika Anda tidak meminta kode ini, abaikan pesan ini.\n\n` +
        `Salam,\nBossHype Store Team`;

      const response = await axios.post(
        this.apiUrl,
        {
          target: phone,
          message,
          countryCode: '62'
        },
        {
          headers: {
            Authorization: this.token,
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 second timeout
        }
      );

      console.log(`✅ OTP sent to ${phone}:`, response.data);

      return {
        success: true,
        messageId: response.data?.messageId || response.data?.id
      };
    } catch (error) {
      console.error(
        '❌ Fonnte API error:',
        error.response?.data || error.message
      );
      
      // Fallback to mock in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`📨 [FALLBACK] OTP ${otpCode} would be sent to ${phone}`);
        return {
          success: true,
          messageId: `fallback-${Date.now()}`,
          fallback: true
        };
      }
      
      throw new Error(`Failed to send OTP: ${error.message}`);
    }
  }

  /**
   * Send generic message via WhatsApp
   */
  async sendMessage(phone, message) {
    try {
      if (!this.token) {
        console.warn('⚠️ Fonnte API token is not configured. Using mock mode.');
        // Mock response for development
        console.log(`📨 [MOCK] Message would be sent to ${phone}:`, message.substring(0, 50) + '...');
        return {
          success: true,
          messageId: `mock-${Date.now()}`,
          mock: true
        };
      }

      const response = await axios.post(
        this.apiUrl,
        {
          target: phone,
          message,
          countryCode: '62'
        },
        {
          headers: {
            Authorization: this.token,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      console.log(`✅ Message sent to ${phone}:`, response.data?.status || 'success');

      return {
        success: true,
        messageId: response.data?.messageId || response.data?.id
      };
    } catch (error) {
      console.error(
        '❌ Fonnte API error:',
        error.response?.data || error.message
      );
      
      // Fallback to mock in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`📨 [FALLBACK] Message would be sent to ${phone}:`, message.substring(0, 50) + '...');
        return {
          success: true,
          messageId: `fallback-${Date.now()}`,
          fallback: true
        };
      }
      
      throw error;
    }
  }

  /**
   * Send bulk messages
   */
  async sendBulk(targets, message) {
    try {
      if (!this.token) {
        console.warn('⚠️ Fonnte API token is not configured');
        return {
          success: false,
          error: 'API token not configured'
        };
      }

      const response = await axios.post(
        'https://api.fonnte.com/send-bulk',
        {
          targets,
          message,
          countryCode: '62',
          delay: 1000 // 1 second delay between messages
        },
        {
          headers: {
            Authorization: this.token,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout for bulk
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('❌ Fonnte bulk error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Check API status
   */
  async checkStatus() {
    try {
      if (!this.token) {
        return {
          success: false,
          message: 'API token not configured'
        };
      }

      const response = await axios.get(
        'https://api.fonnte.com/me',
        {
          headers: {
            Authorization: this.token
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new FonnteService();