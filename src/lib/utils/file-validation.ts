/**
 * File Validation Utilities
 * Validates file size, type, and content
 */

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_FILE_SIZES = {
  cv: 10 * 1024 * 1024,        // 10MB for CVs
  photo: 5 * 1024 * 1024,      // 5MB for photos
  certificate: 10 * 1024 * 1024, // 10MB for certificates
  default: 10 * 1024 * 1024,   // 10MB default
};

const ALLOWED_TYPES = {
  cv: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  photo: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  certificate: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
};

/**
 * Validate file size
 */
export function validateFileSize(
  file: File,
  category: keyof typeof MAX_FILE_SIZES = 'default'
): FileValidationResult {
  const maxSize = MAX_FILE_SIZES[category] || MAX_FILE_SIZES.default;
  
  if (file.size > maxSize) {
    const maxSizeMB = Math.round(maxSize / (1024 * 1024));
    return {
      valid: false,
      error: `File size exceeds ${maxSizeMB}MB limit`,
    };
  }
  
  return { valid: true };
}

/**
 * Validate file type
 */
export function validateFileType(
  file: File,
  category: keyof typeof ALLOWED_TYPES
): FileValidationResult {
  const allowedTypes = ALLOWED_TYPES[category];
  
  if (!allowedTypes) {
    return {
      valid: false,
      error: 'Unknown file category',
    };
  }
  
  if (!allowedTypes.includes(file.type)) {
    const extensions = allowedTypes.map(type => {
      if (type.includes('pdf')) return 'PDF';
      if (type.includes('wordprocessingml')) return 'DOCX';
      if (type.includes('jpeg') || type.includes('jpg')) return 'JPG';
      if (type.includes('png')) return 'PNG';
      if (type.includes('webp')) return 'WEBP';
      return type;
    }).join(', ');
    
    return {
      valid: false,
      error: `Invalid file type. Allowed: ${extensions}`,
    };
  }
  
  return { valid: true };
}

/**
 * Validate file (size + type)
 */
export function validateFile(
  file: File,
  category: keyof typeof ALLOWED_TYPES
): FileValidationResult {
  // Check type first
  const typeResult = validateFileType(file, category);
  if (!typeResult.valid) {
    return typeResult;
  }
  
  // Then check size
  const sizeResult = validateFileSize(file, category as keyof typeof MAX_FILE_SIZES);
  if (!sizeResult.valid) {
    return sizeResult;
  }
  
  return { valid: true };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
