'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile?: { name: string } | null;
  onClear?: () => void;
  accept?: Record<string, string[]>;
  label?: string;
  description?: string;
  isLoading?: boolean;
}

export function FileUpload({
  onFileSelect,
  selectedFile,
  onClear,
  accept = {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/plain': ['.txt'],
    'text/markdown': ['.md'],
  },
  label = 'Upload your CV',
  description = 'PDF, DOCX, TXT, or MD (max 4.5 MB)',
  isLoading = false,
}: FileUploadProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles: 1,
    maxSize: 4.5 * 1024 * 1024,
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
