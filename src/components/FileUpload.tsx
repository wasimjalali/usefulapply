'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X } from 'lucide-react';
import {
  AUTHENTICATED_CV_UPLOAD_LIMIT_BYTES,
  formatUploadLimit,
  getCVUploadDescription,
} from '@/lib/cv-upload-limits';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile?: { name: string } | null;
  onClear?: () => void;
  accept?: Record<string, string[]>;
  label?: string;
  description?: string;
  maxSizeBytes?: number;
  isLoading?: boolean;
  onError?: (message: string) => void;
}

export function FileUpload({
  onFileSelect,
  selectedFile,
  onClear,
  accept = {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/plain': ['.txt', '.tex'],
    'text/markdown': ['.md'],
    'application/x-tex': ['.tex'],
  },
  label = 'Upload your CV',
  description = getCVUploadDescription(AUTHENTICATED_CV_UPLOAD_LIMIT_BYTES),
  maxSizeBytes = AUTHENTICATED_CV_UPLOAD_LIMIT_BYTES,
  isLoading = false,
  onError,
}: FileUploadProps) {
  const maxSizeLabel = formatUploadLimit(maxSizeBytes);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );

  const onDropRejected = useCallback(
    (fileRejections: readonly { file: File; errors: readonly { code: string; message: string }[] }[]) => {
      const rejection = fileRejections[0];
      if (!rejection) return;
      const errorCode = rejection.errors[0]?.code;
      let message = 'File could not be uploaded.';
      if (errorCode === 'file-too-large') {
        message = `File is too large (${(rejection.file.size / 1024 / 1024).toFixed(1)} MB). Maximum: ${maxSizeLabel}.`;
      } else if (errorCode === 'file-invalid-type') {
        message = 'Unsupported file type. Please upload a PDF, DOCX, TXT, MD, or TEX file.';
      }
      if (onError) {
        onError(message);
      } else {
        console.error('[FileUpload] Rejected:', message);
      }
    },
    [maxSizeLabel, onError]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept,
    maxFiles: 1,
    maxSize: maxSizeBytes,
    disabled: isLoading,
  });

  if (selectedFile) {
    return (
      <div className="border-2 border-gold-200 bg-gold-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gold-100 rounded-lg">
              <File className="w-5 h-5 text-gold-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-charcoal">{selectedFile.name}</p>
              <p className="text-xs text-gold-500">File uploaded successfully</p>
            </div>
          </div>
          {onClear && (
            <button
              onClick={onClear}
              className="p-1 hover:bg-gold-100 rounded-full transition-colors"
              disabled={isLoading}
              aria-label="Remove file"
              title="Remove file"
            >
              <X className="w-5 h-5 text-warm-gray" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
        isDragActive ? 'border-navy-500 bg-navy-50' : 'border-cream-400 hover:border-navy-300'
      } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-2">
        <div className={`p-3 rounded-full ${isDragActive ? 'bg-navy-100' : 'bg-cream-200'}`}>
          <Upload className={`w-6 h-6 ${isDragActive ? 'text-navy-600' : 'text-warm-gray'}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-charcoal">{label}</p>
          <p className="text-xs text-warm-gray mt-1">
            {isDragActive ? 'Drop the file here' : description}
          </p>
        </div>
      </div>
    </div>
  );
}
