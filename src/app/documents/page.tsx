'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FileUpload } from '@/components/FileUpload';
import { useAppStore, ProfilePhoto } from '@/store/useAppStore';
import { useAuth } from '@/contexts/AuthContext';
import { 
  getDocumentByType,
  saveDocument,
  deleteDocument as deleteSupabaseDocument,
  uploadCVFile,
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

export default function DocumentsPage() {
  const router = useRouter();
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
  const [uploadError, setUploadError] = useState<string | null>(null);
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

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [authLoading, user, router]);

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-navy-600" />
      </div>
    );
  }

  // Don't render if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-navy-600" />
      </div>
    );
  }

  const parseDocument = async (file: File): Promise<{ parsedCV: ParsedCV; structuredCV: any } | null> => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/parse-cv', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        
        // API returns { success, structuredCV, originalPdf, rawText }
        if (result.success && result.rawText) {
          // Create ParsedCV for backward compatibility
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
            fileType: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx',
          };
          
          // Return both the legacy format AND the structured CV
          return { 
            parsedCV, 
            structuredCV: result.structuredCV 
          };
        }
        
        // Fallback: try legacy format
        if (result.data) {
          return { parsedCV: result.data as ParsedCV, structuredCV: null };
        }
      }
      return null;
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  };

  const handleCVUpload = async (file: File) => {
    setIsUploadingCV(true);
    setUploadError(null);
    try {
      const result = await parseDocument(file);
      if (result) {
        // Store BOTH the legacy ParsedCV AND the StructuredCV locally
        setCurrentCV(result.parsedCV);
        if (result.structuredCV) {
          setStructuredCV(result.structuredCV);
        }
        
        // Save to Supabase
        if (user) {
          // Upload file to storage
          const { path: storagePath } = await uploadCVFile(user.id, 'primary_cv', file);
          
          // Save document metadata to database
          const { document: savedDoc, error: saveError } = await saveDocument(
            user.id,
            'primary_cv',
            {
              file_name: file.name,
              file_type: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx',
              file_size: file.size,
              storage_path: storagePath || undefined,
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
      } else {
        setUploadError('Failed to parse CV. Please try again.');
      }
    } catch (error) {
      console.error('CV upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploadingCV(false);
    }
  };

  const handleMasterCVUpload = async (file: File) => {
    const result = await parseDocument(file);
    if (result) {
      const { parsedCV } = result;
      // Convert ParsedCV to MasterCV by adding required fields
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
      
      // Save to Supabase
      if (user) {
        const { path: storagePath } = await uploadCVFile(user.id, 'master_cv', file);
        
        const { document: savedDoc, error: saveError } = await saveDocument(
          user.id,
          'master_cv',
          {
            file_name: file.name,
            file_type: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx',
            file_size: file.size,
            storage_path: storagePath || undefined,
            raw_text: parsedCV.rawText,
            sections: parsedCV.sections,
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
    
    // Convert to base64
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const photo: ProfilePhoto = {
        id: `photo-${Date.now()}`,
        fileName: file.name,
        dataUrl,
        uploadedAt: new Date().toISOString(),
      };
      setProfilePhoto(photo);
    };
    reader.readAsDataURL(file);
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
            href="/"
            className="inline-flex items-center gap-2 text-navy-600 hover:text-navy-700 transition-colors mb-6 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">Back to Application</span>
          </Link>

          {/* Title and Save */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-navy-500 to-navy-600 rounded-xl shadow-lg">
                <FolderOpen className="w-7 h-7 text-white" />
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

        {/* Auto-save notice - Premium glass effect */}
        <div className="mb-8 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-sage-200/50 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sage-100 rounded-lg">
              <Sparkles className="w-4 h-4 text-sage-600" />
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
          <div className="bg-white rounded-2xl border border-cream-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <div className="p-5">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-gradient-to-br from-navy-500 to-navy-600 rounded-xl shadow-sm">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-charcoal">Primary CV</h2>
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
                  <div className="flex items-center justify-center p-5 border-2 border-dashed border-navy-300 rounded-xl bg-navy-50/50">
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-navy-600 border-t-transparent"></div>
                      <p className="text-sm text-navy-600 font-medium">Parsing your CV...</p>
                    </div>
                  </div>
                ) : currentCV ? (
                  <div className="flex items-center justify-between p-3 bg-sage-50 rounded-xl border border-sage-200">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-sage-100 rounded-lg">
                        <CheckCircle2 className="w-4 h-4 text-sage-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-charcoal">{currentCV.fileName}</p>
                        <p className="text-xs text-sage-600">Uploaded successfully</p>
                      </div>
                    </div>
                    <button 
                      onClick={async () => {
                        setCurrentCV(null);
                        // Delete from Supabase
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
                ) : (
                  <FileUpload
                    onFileSelect={handleCVUpload}
                    label="Upload your CV"
                    description="PDF or DOCX (max 10MB)"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Master CV */}
          <div className="bg-white rounded-2xl border border-cream-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <div className="p-5">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-gradient-to-br from-gold-400 to-gold-500 rounded-xl shadow-sm">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-charcoal">Master CV</h2>
                  <p className="text-sm text-warm-gray mt-0.5">
                    A comprehensive document with ALL your skills, experiences, and achievements.
                  </p>
                </div>
              </div>
              
              <div className="mt-4 ml-14">
                {masterCV ? (
                  <div className="flex items-center justify-between p-3 bg-sage-50 rounded-xl border border-sage-200">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-sage-100 rounded-lg">
                        <CheckCircle2 className="w-4 h-4 text-sage-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-charcoal">{masterCV.fileName}</p>
                        <p className="text-xs text-sage-600">Uploaded successfully</p>
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
                ) : (
                  <FileUpload
                    onFileSelect={handleMasterCVUpload}
                    label="Upload master CV"
                    description="Your complete skills and experience bank"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Profile Photo (for EU Templates) */}
          <div className="bg-white rounded-2xl border border-cream-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <div className="p-5">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-sm">
                  <Camera className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-charcoal">Profile Photo</h2>
                  <p className="text-sm text-warm-gray mt-0.5">
                    Upload a professional photo for European CV templates.
                    <span className="text-purple-600 font-medium"> Required for EU/German templates.</span>
                  </p>
                </div>
              </div>
              
              <div className="mt-4 ml-14">
                {profilePhoto ? (
                  <div className="flex items-center justify-between p-3 bg-purple-50 rounded-xl border border-purple-200">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 ring-2 ring-purple-200">
                        <img 
                          src={profilePhoto.dataUrl} 
                          alt="Profile" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-charcoal">{profilePhoto.fileName}</p>
                        <p className="text-xs text-purple-600">Photo uploaded</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setProfilePhoto(null)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Remove photo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="block">
                    <div className="border-2 border-dashed border-purple-300 rounded-xl p-6 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50/50 transition-all">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-purple-100 flex items-center justify-center">
                        <User className="w-6 h-6 text-purple-500" />
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
        </div>

        {/* Continue Button - Premium footer */}
        <div className="mt-10 p-5 bg-white/60 backdrop-blur-sm rounded-2xl border border-cream-200/50 shadow-sm">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              {currentCV ? (
                <>
                  <div className="p-2 bg-sage-100 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-sage-600" />
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
            <Link href="/">
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
