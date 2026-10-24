'use client';

/**
 * The CV pane: primary CV and master CV, in the settings modal. The upload
 * and parse flow moved here from the retired /documents page (DocumentsPanel);
 * the logic is carried over, only the presentation follows the settings rows.
 * The profile photo lives in the General pane (one photo for account and CV).
 */

import { useEffect, useState } from 'react';
import { CVInputZone } from '@/components/CVInputZone';
import { useCVStore } from '@/store/useCVStore';
import { useAuth } from '@/contexts/AuthContext';
import {
  getDocumentByType,
  saveDocument,
  deleteDocument,
  uploadCVFile,
  type Document as StoredDocument,
} from '@/lib/supabase';
import { AlertCircle } from 'lucide-react';
import type { ParsedCV } from '@/lib/types';
import type { Education, SkillCategory, StructuredCV, WorkExperience } from '@/lib/types/cv-schema';
import {
  AUTHENTICATED_CV_UPLOAD_LIMIT_BYTES,
  formatUploadLimit,
  getPrimaryCVUploadLimitBytes,
} from '@/lib/cv-upload-limits';
import {
  Caption,
  LinkButton,
  OutlineButton,
  PaneHeading,
  Row,
  RowGroup,
} from '@/components/settings/parts';

function parseDocumentFile(
  file: File,
  storagePath?: string,
  documentType: 'primary_cv' | 'master_cv' = 'primary_cv',
  maxUploadSizeBytes = AUTHENTICATED_CV_UPLOAD_LIMIT_BYTES
): Promise<{ parsedCV: ParsedCV; structuredCV: StructuredCV }> {
  if (file.size > maxUploadSizeBytes) {
    return Promise.reject(new Error(
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: ${formatUploadLimit(maxUploadSizeBytes)}.`
    ));
  }

  return (async () => {
    let response: Response;

    if (storagePath) {
      response = await fetch('/api/parse-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath, fileName: file.name, documentType }),
      });
    } else {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);
      response = await fetch('/api/parse-cv', {
        method: 'POST',
        body: formData,
      });
    }

    if (!response.ok) {
      let errorMessage = 'Failed to parse CV';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        if (response.status === 413) {
          errorMessage = 'File is too large. Please try a smaller file.';
        } else if (response.status === 429) {
          errorMessage = 'Too many requests. Please wait a moment and try again.';
        }
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();

    if (result.success && result.rawText) {
      const parsedCV: ParsedCV = {
        rawText: result.rawText,
        sections: {
          contactInfo: result.structuredCV?.personal ?
            `${result.structuredCV.personal.fullName || ''}\n${result.structuredCV.personal.email || ''}\n${result.structuredCV.personal.phone || ''}` : '',
          summary: result.structuredCV?.summary || '',
          experience: result.structuredCV?.experience?.map((e: WorkExperience) =>
            `${e.position} at ${e.company}\n${e.bullets?.join('\n') || ''}`
          ).join('\n\n') || '',
          education: result.structuredCV?.education?.map((e: Education) =>
            `${e.degree} - ${e.institution}`
          ).join('\n') || '',
          skills: result.structuredCV?.skills?.map((s: SkillCategory) =>
            `${s.category}: ${s.skills?.join(', ') || ''}`
          ).join('\n') || '',
        },
        fileName: file.name,
        fileType: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : file.name.toLowerCase().endsWith('.docx') ? 'docx' : 'txt',
      };

      return { parsedCV, structuredCV: result.structuredCV };
    }

    if (result.data) {
      return { parsedCV: result.data as ParsedCV, structuredCV: null };
    }

    throw new Error('CV was parsed but no content was extracted. The file may be empty or image-based.');
  })();
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-5 pb-3 text-sm text-danger">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      {message}
    </div>
  );
}

function UploadingNote({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 px-5 pb-4">
      <div className="h-4 w-4 animate-spin rounded-pill border-2 border-accent-strong border-t-transparent" />
      <p className="text-sm text-ink-muted">{children}</p>
    </div>
  );
}

export function CvDocumentsPane() {
  const { user } = useAuth();
  const primaryUploadLimitBytes = getPrimaryCVUploadLimitBytes(Boolean(user));

  const currentCV = useCVStore((s) => s.currentCV);
  const setCurrentCV = useCVStore((s) => s.setCurrentCV);
  const setStructuredCV = useCVStore((s) => s.setStructuredCV);
  const masterCV = useCVStore((s) => s.masterCV);
  const setMasterCV = useCVStore((s) => s.setMasterCV);
  const [isUploadingCV, setIsUploadingCV] = useState(false);
  const [isUploadingMasterCV, setIsUploadingMasterCV] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [masterCVUploadError, setMasterCVUploadError] = useState<string | null>(null);
  const [replacingPrimary, setReplacingPrimary] = useState(false);
  const [replacingMaster, setReplacingMaster] = useState(false);
  const [storedDocs, setStoredDocs] = useState<{ primary?: StoredDocument; master?: StoredDocument }>({});

  // Load documents on mount. The store is the source of truth for signed-in
  // users, so cached browser state is always replaced.
  useEffect(() => {
    const loadDocuments = async () => {
      if (!user) return;

      try {
        const [primaryDoc, masterDoc] = await Promise.all([
          getDocumentByType(user.id, 'primary_cv'),
          getDocumentByType(user.id, 'master_cv'),
        ]);

        setStoredDocs({
          primary: primaryDoc || undefined,
          master: masterDoc || undefined,
        });

        if (primaryDoc) {
          setCurrentCV({
            rawText: primaryDoc.raw_text || '',
            sections: primaryDoc.sections || {},
            fileName: primaryDoc.file_name,
            fileType: primaryDoc.file_type,
          });
          setStructuredCV(primaryDoc.structured_data ?? null);
        } else {
          // The server is the source of truth. With no stored CV, cached
          // browser state must not survive an account switch. A local CV
          // that useSupabaseSync is still migrating is the one exception.
          const localCV = useCVStore.getState().currentCV;
          if (!localCV?.rawText) {
            setCurrentCV(null);
            setStructuredCV(null);
            useCVStore.getState().setEditedOriginalCVData(null);
          }
        }

        if (masterDoc) {
          setMasterCV({
            rawText: masterDoc.raw_text || '',
            sections: masterDoc.sections || {},
            fileName: masterDoc.file_name,
            fileType: masterDoc.file_type,
            allSkills: masterDoc.all_skills || [],
            allExperiences: masterDoc.all_experiences || [],
            allEducation: masterDoc.all_education || [],
          });
        } else {
          setMasterCV(null);
        }
      } catch (error) {
        console.error('Error loading documents:', error);
      }
    };

    void loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleCVUpload = async (file: File) => {
    setIsUploadingCV(true);
    setUploadError(null);
    try {
      if (file.size > primaryUploadLimitBytes) {
        throw new Error(
          `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: ${formatUploadLimit(primaryUploadLimitBytes)}.`
        );
      }

      let storagePath: string | undefined;
      if (user) {
        const uploadResult = await uploadCVFile(user.id, 'primary_cv', file);
        storagePath = uploadResult.path || undefined;
      }

      const result = await parseDocumentFile(file, storagePath, 'primary_cv', primaryUploadLimitBytes);
      setCurrentCV(result.parsedCV);
      if (result.structuredCV) {
        setStructuredCV(result.structuredCV);
      }

      useCVStore.getState().setEditedOriginalCVData(null);

      if (user) {
        const { document: savedDoc, error: saveError } = await saveDocument(
          user.id,
          'primary_cv',
          {
            file_name: file.name,
            file_type: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : file.name.toLowerCase().endsWith('.docx') ? 'docx' : 'txt',
            file_size: file.size,
            storage_path: storagePath,
            raw_text: result.parsedCV.rawText,
            sections: result.parsedCV.sections,
            structured_data: result.structuredCV,
          }
        );

        if (saveError) {
          console.error('Error saving CV:', saveError);
        } else if (savedDoc) {
          setStoredDocs(prev => ({ ...prev, primary: savedDoc }));

          if (result.structuredCV) {
            fetch('/api/job-feed/settings/suggest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ structured_data: result.structuredCV }),
            }).catch(() => {});
          }
        }
      }
      setReplacingPrimary(false);
    } catch (error) {
      console.error('CV upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploadingCV(false);
    }
  };

  const handleMasterCVUpload = async (file: File) => {
    setIsUploadingMasterCV(true);
    setMasterCVUploadError(null);
    try {
      if (file.size > AUTHENTICATED_CV_UPLOAD_LIMIT_BYTES) {
        throw new Error(
          `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: ${formatUploadLimit(AUTHENTICATED_CV_UPLOAD_LIMIT_BYTES)}.`
        );
      }

      let storagePath: string | undefined;
      if (user) {
        const uploadResult = await uploadCVFile(user.id, 'master_cv', file);
        storagePath = uploadResult.path || undefined;
      }

      const result = await parseDocumentFile(file, storagePath, 'master_cv', AUTHENTICATED_CV_UPLOAD_LIMIT_BYTES);
      const { parsedCV } = result;

      const allSkills = parsedCV.sections.skills
        ? parsedCV.sections.skills.split(/[,\n•·\-]/).map((s: string) => s.trim()).filter(Boolean)
        : [];
      const allExperiences = parsedCV.sections.experience
        ? parsedCV.sections.experience.split(/\n\n/).filter(Boolean)
        : [];
      const allEducation = parsedCV.sections.education
        ? parsedCV.sections.education.split(/\n\n/).filter(Boolean)
        : [];

      setMasterCV({
        ...parsedCV,
        allSkills,
        allExperiences,
        allEducation,
      });

      if (user) {
        const { document: savedDoc, error: saveError } = await saveDocument(
          user.id,
          'master_cv',
          {
            file_name: file.name,
            file_type: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : file.name.toLowerCase().endsWith('.docx') ? 'docx' : 'txt',
            file_size: file.size,
            storage_path: storagePath,
            raw_text: parsedCV.rawText,
            sections: parsedCV.sections,
            structured_data: result.structuredCV,
            all_skills: allSkills,
            all_experiences: allExperiences,
            all_education: allEducation,
          }
        );

        if (saveError) {
          console.error('Error saving master CV:', saveError);
        } else if (savedDoc) {
          setStoredDocs(prev => ({ ...prev, master: savedDoc }));
          // Deliberately NOT refreshing job-feed suggestions from the
          // master CV. Master CV is too long and skill-dense for feed
          // prefill — the primary CV is the single source of truth.
        }
      }
      setReplacingMaster(false);
    } catch (error) {
      console.error('Master CV upload error:', error);
      setMasterCVUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploadingMasterCV(false);
    }
  };

  const handleRemoveMaster = async () => {
    setMasterCVUploadError(null);
    const previous = masterCV;
    setMasterCV(null);
    if (storedDocs.master) {
      const { error } = await deleteDocument(storedDocs.master.id);
      if (error) {
        // A failed delete must not pretend it worked: put the CV back.
        console.error('Error deleting master CV:', error);
        setMasterCV(previous);
        setMasterCVUploadError('The master CV did not delete. Try again.');
        return;
      }
      setStoredDocs(prev => ({ ...prev, master: undefined }));
    }
  };

  return (
    <div>
      <PaneHeading>CV</PaneHeading>

      <Caption>PRIMARY CV</Caption>
      <RowGroup>
        <Row
          label={currentCV ? currentCV.fileName : 'No CV yet'}
          hint="The CV every application starts from"
        >
          <OutlineButton
            onClick={() => { setUploadError(null); setReplacingPrimary((v) => !v); }}
            disabled={isUploadingCV}
          >
            {replacingPrimary ? 'Cancel' : currentCV ? 'Replace' : 'Upload'}
          </OutlineButton>
        </Row>
        {uploadError && <InlineError message={uploadError} />}
        {isUploadingCV ? (
          <UploadingNote>Reading your CV. This can take a minute.</UploadingNote>
        ) : replacingPrimary ? (
          <div className="px-5 pb-4">
            <CVInputZone
              onFileSelect={(file) => void handleCVUpload(file)}
              onError={(message) => setUploadError(message)}
              label={currentCV ? 'Replace your CV' : 'Upload your CV'}
              maxSizeBytes={primaryUploadLimitBytes}
              isLoading={isUploadingCV}
              compact
            />
          </div>
        ) : null}
      </RowGroup>

      <Caption>MASTER CV</Caption>
      <RowGroup>
        <Row
          label={masterCV ? masterCV.fileName : 'No master CV'}
          hint="Optional. A long CV with everything you have done, for deeper tailoring"
        >
          {masterCV && !replacingMaster && (
            <LinkButton onClick={() => void handleRemoveMaster()} disabled={isUploadingMasterCV}>
              Remove
            </LinkButton>
          )}
          <OutlineButton
            onClick={() => { setMasterCVUploadError(null); setReplacingMaster((v) => !v); }}
            disabled={isUploadingMasterCV}
          >
            {replacingMaster ? 'Cancel' : masterCV ? 'Replace' : 'Upload'}
          </OutlineButton>
        </Row>
        {masterCVUploadError && <InlineError message={masterCVUploadError} />}
        {isUploadingMasterCV ? (
          <UploadingNote>Reading your master CV. Larger documents can take 1 to 2 minutes.</UploadingNote>
        ) : replacingMaster ? (
          <div className="px-5 pb-4">
            <CVInputZone
              onFileSelect={(file) => void handleMasterCVUpload(file)}
              onError={(message) => setMasterCVUploadError(message)}
              label={masterCV ? 'Replace your master CV' : 'Upload your master CV'}
              isLoading={isUploadingMasterCV}
              compact
            />
          </div>
        ) : null}
      </RowGroup>

    </div>
  );
}
