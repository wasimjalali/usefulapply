'use client';

import { useState, useRef } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { Upload, Type, ArrowRight } from 'lucide-react';
import {
  AUTHENTICATED_CV_UPLOAD_LIMIT_BYTES,
  getCVUploadDescription,
} from '@/lib/cv-upload-limits';

interface CVInputZoneProps {
  onFileSelect: (file: File) => void;
  selectedFile?: { name: string } | null;
  onClear?: () => void;
  onError?: (message: string) => void;
  label?: string;
  description?: string;
  maxSizeBytes?: number;
  isLoading?: boolean;
  /** Use compact textarea height for embedded panels */
  compact?: boolean;
}

export function CVInputZone({
  onFileSelect,
  selectedFile,
  onClear,
  onError,
  label = 'Upload your CV',
  description = getCVUploadDescription(AUTHENTICATED_CV_UPLOAD_LIMIT_BYTES),
  maxSizeBytes = AUTHENTICATED_CV_UPLOAD_LIMIT_BYTES,
  isLoading = false,
  compact = false,
}: CVInputZoneProps) {
  const [mode, setMode] = useState<'file' | 'text'>('file');
  const [pastedText, setPastedText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTextSubmit = () => {
    const trimmed = pastedText.trim();
    if (!trimmed) {
      onError?.('Please paste your CV content first.');
      return;
    }
    if (trimmed.length < 50) {
      onError?.('The pasted text seems too short. Please paste your full CV content.');
      return;
    }
    // Create a File from the pasted text so the existing parse pipeline works unchanged
    const blob = new Blob([trimmed], { type: 'text/plain' });
    const file = new File([blob], 'pasted-cv.txt', { type: 'text/plain' });
    onFileSelect(file);
    setPastedText('');
  };

  // If a file is already selected, delegate to FileUpload's selected state
  if (selectedFile) {
    return (
      <FileUpload
        onFileSelect={onFileSelect}
        selectedFile={selectedFile}
        onClear={onClear}
        onError={onError}
        label={label}
        description={description}
        maxSizeBytes={maxSizeBytes}
        isLoading={isLoading}
      />
    );
  }

  return (
    <div>
      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-canvas rounded-xl mb-3">
        <button
          type="button"
          onClick={() => setMode('file')}
          disabled={isLoading}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-control text-sm font-medium transition-all cursor-pointer ${
            mode === 'file'
              ? 'bg-surface-raised text-ink-body shadow-resting'
              : 'text-ink-muted hover:text-ink-body'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload File
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('text');
            setTimeout(() => textareaRef.current?.focus(), 100);
          }}
          disabled={isLoading}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-control text-sm font-medium transition-all cursor-pointer ${
            mode === 'text'
              ? 'bg-surface-raised text-ink-body shadow-resting'
              : 'text-ink-muted hover:text-ink-body'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Type className="w-3.5 h-3.5" />
          Paste Text
        </button>
      </div>

      {/* File upload mode */}
      {mode === 'file' && (
        <FileUpload
          onFileSelect={onFileSelect}
          onError={onError}
          label={label}
          description={description}
          maxSizeBytes={maxSizeBytes}
          isLoading={isLoading}
        />
      )}

      {/* Text paste mode */}
      {mode === 'text' && (
        <div
          className={`border-2 border-dashed rounded-xl overflow-hidden transition-colors ${
            isLoading
              ? 'border-border-strong opacity-50'
              : 'border-border-stronger focus-within:border-border-brand'
          }`}
        >
          <textarea
            ref={textareaRef}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder={
              'Paste your CV / resume content here...\n\n' +
              'Include your name, contact info, experience, education, skills, everything from your CV. Plain text or Markdown.'
            }
            className={`w-full bg-transparent text-sm text-ink-body placeholder:text-ink-muted/50 resize-none p-4 focus:outline-none ${
              compact ? 'h-40' : 'h-52'
            }`}
            disabled={isLoading}
          />
          <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-t border-border">
            <span className="text-xs text-ink-muted">
              {pastedText.length > 0
                ? `${pastedText.length.toLocaleString()} characters`
                : 'Plain text or Markdown'}
            </span>
            <button
              type="button"
              onClick={handleTextSubmit}
              disabled={!pastedText.trim() || isLoading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-brand text-brand-ink text-sm font-medium rounded-control hover:bg-brand-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Parse CV
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
