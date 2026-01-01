// src/utils/imageUrlHelper.js

/**
 * Helper function to generate full image URL
 * @param {Object} req - Express request object
 * @param {string} imagePath - Relative image path
 * @returns {string|null} Full URL or null
 */
export const generateImageUrl = (req, imagePath) => {
  if (!imagePath) return null;
  
  // If already full URL, return as is
  if (imagePath.startsWith('http')) {
    return imagePath;
  }
  
  // Generate full URL using the new image route
  // Format: /api/images/{type}/{id}/{filename} or /api/images/{type}/{filename}
  return `${req.protocol}://${req.get('host')}/api/images/${imagePath}`;
};