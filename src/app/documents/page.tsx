'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FileUpload } from '@/components/FileUpload';
import { useAppStore, ProfilePhoto } from '@/store/useAppStore';
import { useCVStore } from '@/store/useCVStore';
import { useAuth } from '@/contexts/AuthContext';
import { 
  getDocumentByType,
  saveDocument,
  deleteDocument as deleteSupabaseDocument,
  uploadCVFile,
  uploadProfilePhoto,
  getProfilePhotoUrl,
  deleteProfilePhoto,
  type Document as SupabaseDocument,
} from '@/lib/supabase';
import { 
  FileText, 
  Trash2, 
  ArrowLeft,
  CheckCircle2,
  Save,
  AlertCircle,
  User,
  Camera,
  Sparkles,
  FolderOpen,
  Upload,
  Loader2
} from 'lucide-react';
import Link from 'next/link';
import type { ParsedCV } from '@/lib/types';

/**
 * Resizes an image file to fit within `maxSize` pixels on its longest side,
 * preserving aspect ratio. Returns a JPEG data URL (~50–100KB for 800px).
 * This keeps the preview sharp without storing a multi-MB base64 in state.
 */
function resizeImage(file: File, maxSize: number, quality = 0.9): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image load failed'));
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxSize || h > maxSize) {
          if (w > h) {
            h = Math.round(h * (maxSize / w));
            w = maxSize;
          } else {
            w = Math.round(w * (maxSize / h));
            h = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Could not get 2d context'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function DocumentsPage() {
  const { user, isLoading: authLoading } = useAuth();
  
  const {
    currentCV,
    setCurrentCV,
    setStructuredCV,
    masterCV,
    setMasterCV,
    profilePhoto,
    setProfilePhoto,
  } = useAppStore();

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isUploadingCV, setIsUploadingCV] = useState(false);
  const [isUploadingMasterCV, setIsUploadingMasterCV] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [masterCVUploadError, setMasterCVUploadError] = useState<string | null>(null);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [supabaseDocs, setSupabaseDocs] = useState<{ primary?: SupabaseDocument; master?: SupabaseDocument }>({});

  // Load documents from Supabase on mount
  useEffect(() => {
    const loadDocuments = async () => {
      if (!user) return;
      
      try {
        const [primaryDoc, masterDoc] = await Promise.all([
          getDocumentByType(user.id, 'primary_cv'),
          getDocumentByType(user.id, 'master_cv'),
        ]);
        
        setSupabaseDocs({
          primary: primaryDoc || undefined,
          master: masterDoc || undefined,
        });
        
        // Sync with local store if Supabase has data but local doesn't
        if (primaryDoc && !currentCV) {
          setCurrentCV({
            rawText: primaryDoc.raw_text || '',
            sections: primaryDoc.sections || {},
            fileName: primaryDoc.file_name,
            fileType: primaryDoc.file_type,
          });
          if (primaryDoc.structured_data) {
            setStructuredCV(primaryDoc.structured_data);
          }
        }
        
        if (masterDoc && !masterCV) {
          setMasterCV({
            rawText: masterDoc.raw_text || '',
            sections: masterDoc.sections || {},
            fileName: masterDoc.file_name,
            fileType: masterDoc.file_type,
            allSkills: masterDoc.all_skills || [],
            allExperiences: masterDoc.all_experiences || [],
            allEducation: masterDoc.all_education || [],
          });
        }
      } catch (error) {
        console.error('Error loading documents:', error);
      } finally {
        setIsLoadingDocs(false);
      }
    };
    
    loadDocuments();
  }, [user]);

  // Set loading to false immediately for anonymous users (no Supabase docs to load)
  useEffect(() => {
    if (!authLoading && !user) {
      setIsLoadingDocs(false);
    }
  }, [authLoading, user]);

  // Load profile photo from Supabase on mount
  // Always refresh signed URL unless photo is a fresh base64 (just uploaded)
  useEffect(() => {
    const loadProfilePhoto = async () => {
      if (!user) return;
      const isBase64 = profilePhoto?.dataUrl?.startsWith('data:');
      if (isBase64) return; // Fresh upload, no need to refresh

      try {
        const { url, error } = await getProfilePhotoUrl(user.id);
        if (error) {
          console.error('Error loading profile photo:', error);
          return;
        }

        if (url) {
          console.log('[Documents] Loaded/refreshed profile photo from Supabase');
          setProfilePhoto({
            id: `photo-supabase-${Date.now()}`,
            fileName: profilePhoto?.fileName || 'profile.jpg',
            dataUrl: url,
            uploadedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error('Error loading profile photo:', err);
      }
    };

    loadProfilePhoto();
  }, [user]);

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-navy-600" />
      </div>
    );
  }

  const parseDocument = async (file: File, storagePath?: string): Promise<{ parsedCV: ParsedCV; structuredCV: any }> => {
    const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_UPLOAD_SIZE) {
      throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 10 MB.`);
    }

    try {
      let response: Response;

      if (storagePath) {
        // Storage-first mode: file already in Supabase Storage, send only the path
        response = await fetch('/api/parse-cv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath, fileName: file.name }),
        });
      } else {
        // Direct upload mode (fallback for files ≤ 4.5 MB or unauthenticated)
        const formData = new FormData();
        formData.append('file', file);
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

      // API returns { success, structuredCV, originalPdf, rawText }
      if (result.success && result.rawText) {
        const parsedCV: ParsedCV = {
          rawText: result.rawText,
          sections: {
            contactInfo: result.structuredCV?.personal ?
              `${result.structuredCV.personal.fullName || ''}\n${result.structuredCV.personal.email || ''}\n${result.structuredCV.personal.phone || ''}` : '',
            summary: result.structuredCV?.summary || '',
            experience: result.structuredCV?.experience?.map((e: any) =>
              `${e.position} at ${e.company}\n${e.bullets?.join('\n') || ''}`
            ).join('\n\n') || '',
            education: result.structuredCV?.education?.map((e: any) =>
              `${e.degree} - ${e.institution}`
            ).join('\n') || '',
            skills: result.structuredCV?.skills?.map((s: any) =>
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
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error('Upload failed. Please try again.');
    }
  };

  const handleCVUpload = async (file: File) => {
    setIsUploadingCV(true);
    setUploadError(null);
    try {
      // For authenticated users: upload to Supabase Storage first, then parse via storage path
      // This bypasses Vercel's 4.5MB body limit — supports files up to 10MB
      let storagePath: string | undefined;
      if (user) {
        const uploadResult = await uploadCVFile(user.id, 'primary_cv', file);
        storagePath = uploadResult.path || undefined;
      }

      const result = await parseDocument(file, storagePath);
      setCurrentCV(result.parsedCV);
      if (result.structuredCV) {
        setStructuredCV(result.structuredCV);
      }

      // Clear stale edited CV data when uploading new CV
      useCVStore.getState().setEditedOriginalCVData(null);

      // Save document metadata to Supabase
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
          console.error('Error saving to Supabase:', saveError);
        } else if (savedDoc) {
          setSupabaseDocs(prev => ({ ...prev, primary: savedDoc }));
        }
      }
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
      // Upload to Supabase Storage first (bypasses Vercel body limit)
      let storagePath: string | undefined;
      if (user) {
        const uploadResult = await uploadCVFile(user.id, 'master_cv', file);
        storagePath = uploadResult.path || undefined;
      }

      const result = await parseDocument(file, storagePath);
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

      const masterCVData = {
        ...parsedCV,
        allSkills,
        allExperiences,
        allEducation,
      };
      setMasterCV(masterCVData);

      // Save document metadata to Supabase
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
          console.error('Error saving master CV to Supabase:', saveError);
        } else if (savedDoc) {
          setSupabaseDocs(prev => ({ ...prev, master: savedDoc }));
        }
      }
    } catch (error) {
      console.error('Master CV upload error:', error);
      setMasterCVUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploadingMasterCV(false);
    }
  };

  // Photo upload handler
  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (JPG, PNG, etc.)');
      return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }
    
    // Resize to max 800px on longest side for crisp preview without storing
    // a multi-MB base64 in Zustand. Original file still uploaded to Supabase.
    try {
      const dataUrl = await resizeImage(file, 800);
      const photo: ProfilePhoto = {
        id: `photo-${Date.now()}`,
        fileName: file.name,
        dataUrl,
        uploadedAt: new Date().toISOString(),
      };

      // Save to local state immediately for display
      setProfilePhoto(photo);

      // Also upload original file to Supabase storage if user is logged in
      if (user) {
        try {
          const { url, error } = await uploadProfilePhoto(user.id, file);
          if (error) {
            console.error('Error uploading photo to Supabase:', error);
          } else if (url) {
            console.log('[Documents] Profile photo uploaded to Supabase:', url);
            // Update photo with Supabase URL for cross-device sync
            setProfilePhoto({
              ...photo,
              dataUrl: url, // Use Supabase URL instead of base64
            });
          }
        } catch (err) {
          console.error('Profile photo upload error:', err);
        }
      }
    } catch (err) {
      console.error('Image resize error:', err);
    }
  };
  
  const handleSave = async () => {
    setIsSaving(true);
    
    // State is already persisted via Zustand middleware
    // This is just for user feedback
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const hasDocuments = currentCV || masterCV;

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream-50 via-cream-100 to-cream-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header Section */}
        <div className="mb-8">
          {/* Back Navigation */}
          <Link 
            href="/dashboard"
            className="inline-flex items-center gap-2 text-warm-gray hover:text-navy-600 transition-colors mb-6 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-sm font-medium">Back to Application</span>
          </Link>

          {/* Title and Save */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-navy-600 to-navy-700 rounded-xl shadow-lg">
                <FolderOpen className="w-7 h-7 text-gold-300" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-charcoal">Your Documents</h1>
                <p className="text-sm text-warm-gray mt-1">
                  Manage your CV and profile photo
                </p>
              </div>
            </div>
            
            {/* Save Button */}
            {hasDocuments && (
              <Button 
                variant={saveSuccess ? 'primary' : 'gold'}
                onClick={handleSave}
                isLoading={isSaving}
                disabled={saveSuccess}
                className="shadow-md"
              >
                {saveSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Documents
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Auto-save notice */}
        <div className="mb-8 p-4 bg-white/80 backdrop-blur-sm rounded-xl border border-cream-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-navy-50 rounded-lg">
              <Sparkles className="w-4 h-4 text-gold-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-charcoal">Auto-save enabled</p>
              <p className="text-xs text-warm-gray">
                Your documents are automatically saved and will persist even after you close the browser.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {/* Primary CV */}
          <div className="bg-white rounded-2xl border border-cream-200 shadow-sm hover:shadow-md transition-all overflow-hidden">
            <div className="p-5">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-gradient-to-br from-navy-600 to-navy-700 rounded-xl shadow-sm">
                  <FileText className="w-5 h-5 text-gold-300" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-charcoal">CV</h2>
                  <p className="text-sm text-warm-gray mt-0.5">
                    Your main CV that will be optimized for each job application.
                  </p>
                </div>
              </div>
              
              <div className="mt-4 ml-14">
                {uploadError && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <p className="text-sm text-red-600">{uploadError}</p>
                  </div>
                )}
                
                {isUploadingCV ? (
                  <div className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-navy-300 rounded-xl bg-navy-50/50">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-navy-600 border-t-transparent"></div>
                      <p className="text-sm text-navy-600 font-medium">Parsing your CV...</p>
                    </div>
                    <p className="text-xs text-navy-500">This may take 30-60 seconds</p>
                  </div>
                ) : currentCV ? (
                  <div>
                    <div className="flex items-center justify-between p-3 bg-gold-50 rounded-xl border border-gold-200">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-gold-100 rounded-lg">
                          <CheckCircle2 className="w-4 h-4 text-gold-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-charcoal">{currentCV.fileName}</p>
                          <p className="text-xs text-gold-600">Uploaded successfully</p>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          setCurrentCV(null);
                          if (supabaseDocs.primary) {
                            await deleteSupabaseDocument(supabaseDocs.primary.id);
                            setSupabaseDocs(prev => ({ ...prev, primary: undefined }));
                          }
                        }}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove CV"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {/* Character count indicator */}
                    {(() => {
                      const charCount = currentCV.rawText?.length || 0;
                      const maxChars = 10_000;
                      const pct = Math.min(100, (charCount / maxChars) * 100);
                      const colorClass = charCount > maxChars ? 'text-red-500' : charCount > 8_000 ? 'text-amber-600' : 'text-gold-600';
                      const barColor = charCount > maxChars ? 'bg-red-400' : charCount > 8_000 ? 'bg-amber-400' : 'bg-gold-400';
                      return (
                        <div className="mt-2 px-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-medium ${colorClass}`}>
                              {charCount.toLocaleString()} / {maxChars.toLocaleString()} characters
                            </span>
                            {charCount > maxChars && (
                              <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Exceeds limit
                              </span>
                            )}
                          </div>
                          <div className="h-1 bg-cream-200 rounded-full overflow-hidden">
                            <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <FileUpload
                    onFileSelect={handleCVUpload}
                    onError={(msg) => setUploadError(msg)}
                    label="Upload your CV"
                    description="PDF, DOCX, TXT, or MD (max 10 MB)"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Profile Photo (for EU Templates) */}
          <div className="bg-white rounded-2xl border border-cream-200 shadow-sm hover:shadow-md transition-all overflow-hidden">
            <div className="p-5">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-gradient-to-br from-navy-500 to-navy-600 rounded-xl shadow-sm">
                  <Camera className="w-5 h-5 text-gold-300" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-charcoal">Profile Photo</h2>
                  <p className="text-sm text-warm-gray mt-0.5">
                    Upload a professional photo for European CV templates.
                    <span className="text-navy-600 font-medium"> Required for EU/German templates.</span>
                  </p>
                </div>
              </div>

              <div className="mt-4 ml-14">
                {profilePhoto ? (
                  <div className="flex items-center justify-between p-3 bg-navy-50 rounded-xl border border-navy-200">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 ring-2 ring-gold-200">
                        <img
                          src={profilePhoto.dataUrl}
                          alt="Profile"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-charcoal">{profilePhoto.fileName}</p>
                        <p className="text-xs text-navy-600">Photo uploaded</p>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        setProfilePhoto(null);
                        // Also delete from Supabase
                        if (user) {
                          await deleteProfilePhoto(user.id);
                        }
                      }}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Remove photo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="block">
                    <div className="border-2 border-dashed border-navy-200 rounded-xl p-6 text-center cursor-pointer hover:border-gold-300 hover:bg-cream-50 transition-all">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-navy-50 flex items-center justify-center">
                        <User className="w-6 h-6 text-navy-500" />
                      </div>
                      <p className="text-sm font-medium text-charcoal">
                        Click to upload photo
                      </p>
                      <p className="text-xs text-warm-gray mt-1">
                        JPG, PNG • Max 5MB • Professional headshot recommended
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Master CV */}
          <div className="bg-white rounded-2xl border border-cream-200 shadow-sm hover:shadow-md transition-all overflow-hidden">
            <div className="p-5">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-gradient-to-br from-gold-400 to-gold-500 rounded-xl shadow-sm">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-charcoal">Master CV <span className="text-sm font-normal text-warm-gray">(Optional)</span></h2>
                  <p className="text-sm text-warm-gray mt-0.5">
                    A comprehensive document with ALL your skills, experiences, and achievements.
                  </p>
                </div>
              </div>

              <div className="mt-4 ml-14">
                {masterCVUploadError && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <p className="text-sm text-red-600">{masterCVUploadError}</p>
                  </div>
                )}

                {isUploadingMasterCV ? (
                  <div className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-gold-300 rounded-xl bg-gold-50/50">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-gold-600 border-t-transparent"></div>
                      <p className="text-sm text-gold-700 font-medium">Parsing your Master CV...</p>
                    </div>
                    <p className="text-xs text-gold-600">This may take 1-2 minutes for larger documents</p>
                  </div>
                ) : masterCV ? (
                  <div>
                    <div className="flex items-center justify-between p-3 bg-gold-50 rounded-xl border border-gold-200">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-gold-100 rounded-lg">
                          <CheckCircle2 className="w-4 h-4 text-gold-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-charcoal">{masterCV.fileName}</p>
                          <p className="text-xs text-gold-600">Uploaded successfully</p>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          setMasterCV(null);
                          // Delete from Supabase
                          if (supabaseDocs.master) {
                            await deleteSupabaseDocument(supabaseDocs.master.id);
                            setSupabaseDocs(prev => ({ ...prev, master: undefined }));
                          }
                        }}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove Master CV"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {/* Character count indicator */}
                    {(() => {
                      const charCount = masterCV.rawText?.length || 0;
                      const maxChars = 20_000;
                      const pct = Math.min(100, (charCount / maxChars) * 100);
                      const colorClass = charCount > maxChars ? 'text-red-500' : charCount > 16_000 ? 'text-amber-600' : 'text-gold-600';
                      const barColor = charCount > maxChars ? 'bg-red-400' : charCount > 16_000 ? 'bg-amber-400' : 'bg-gold-400';
                      return (
                        <div className="mt-2 px-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-medium ${colorClass}`}>
                              {charCount.toLocaleString()} / {maxChars.toLocaleString()} characters
                            </span>
                            {charCount > maxChars && (
                              <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Exceeds limit
                              </span>
                            )}
                          </div>
                          <div className="h-1 bg-cream-200 rounded-full overflow-hidden">
                            <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <FileUpload
                    onFileSelect={handleMasterCVUpload}
                    onError={(msg) => setMasterCVUploadError(msg)}
                    label="Upload master CV"
                    description="PDF, DOCX, TXT, or MD (max 10 MB)"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Continue Button - Premium footer */}
        <div className="mt-10 p-5 bg-white/80 backdrop-blur-sm rounded-2xl border border-cream-200 shadow-sm">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              {currentCV ? (
                <>
                  <div className="p-2 bg-gold-100 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-gold-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-charcoal">CV uploaded</p>
                    <p className="text-xs text-warm-gray">Ready to apply for jobs</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-2 bg-cream-200 rounded-lg">
                    <Upload className="w-4 h-4 text-warm-gray" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-charcoal">Upload your CV</p>
                    <p className="text-xs text-warm-gray">Required to continue</p>
                  </div>
                </>
              )}
            </div>
            <Link href="/dashboard">
              <Button 
                variant="gold" 
                size="lg"
                disabled={!currentCV}
                className="shadow-md hover:shadow-lg transition-shadow"
              >
                Continue to Applications
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
