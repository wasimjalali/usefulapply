'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCVStore } from '@/store/useCVStore';
import { useSessionStore, type ApplicationSession } from '@/store/useSessionStore';
import { createClient } from '@/lib/supabase/client';
import {
  getSessions,
  createSession as createSupabaseSession,
  updateSession as updateSupabaseSession,
  deleteSession as deleteSupabaseSession,
  getChatMessages,
  addChatMessage as addSupabaseChatMessage,
  getDocumentByType,
  getProfilePhotoUrl,
} from '@/lib/supabase';

// Type for Supabase application_sessions row
interface SupabaseSessionRow {
  id: string;
  user_id: string;
  job_title: string | null;
  company: string | null;
  job_description: string | null;
  job_url: string | null;
  match_score: number | null;
  matching_skills: string[] | null;
  missing_skills: string[] | null;
  suggestions: string[] | null;
  requirements: any | null;
  gaps: any | null;
  generated_cv: any | null;
  cover_letter: any | null;
  email: any | null;
  company_research: any | null;
  company_address: string | null;
  company_contact_person: string | null;
  cv_edits: any[] | null;
  optimized_pdf_path: string | null;
  optimized_cv_text: string | null;
  email_subject: string | null;
  email_body: string | null;
  selected_template: string | null;
  status: string | null;
  cover_letter_language: string | null;
  fit_assessment: any | null;
  generation_completed: boolean | null;
  created_at: string;
  updated_at: string;
}

/**
 * Hook to sync application sessions with Supabase
 * This runs in the background and syncs data when changes occur
 * 
 * CRITICAL: This hook now PULLS data FROM Supabase on mount to enable cross-browser sync.
 * Supabase is the source of truth — localStorage is only a cache for the current browser.
 */
export function useSupabaseSync() {
  const { user } = useAuth();
  const {
    currentCV,
    masterCV,
    profilePhoto,
    setCurrentCV,
    setStructuredCV,
    setMasterCV,
    setProfilePhoto,
  } = useCVStore();
  const {
    sessions,
    currentSession,
    setSessions,
  } = useSessionStore();
  
  const lastSyncedSessionRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);
  const docsLoadedRef = useRef(false);
  const isCreatingSessionRef = useRef<Set<string>>(new Set());
  const supabase = createClient();

  // CRITICAL: Load documents (primary CV, master CV, profile photo) from Supabase on mount
  useEffect(() => {
    const loadDocumentsFromSupabase = async () => {
      if (!user) return;
      
      // Only run once per session
      if (docsLoadedRef.current) return;
      docsLoadedRef.current = true;
      
      console.log('[SupabaseSync] Loading documents from Supabase for user:', user.id);
      
      try {
        // Load primary CV, master CV, and profile photo in parallel
        const [primaryDoc, masterDoc, photoResult] = await Promise.all([
          getDocumentByType(user.id, 'primary_cv'),
          getDocumentByType(user.id, 'master_cv'),
          getProfilePhotoUrl(user.id),
        ]);
        
        // Load primary CV if exists in Supabase but not in local store
        if (primaryDoc && !currentCV) {
          console.log('[SupabaseSync] Loading primary CV from Supabase:', primaryDoc.file_name);
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
        
        // Load master CV if exists in Supabase but not in local store
        if (masterDoc && !masterCV) {
          console.log('[SupabaseSync] Loading master CV from Supabase:', masterDoc.file_name);
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
        
        // Load or refresh profile photo signed URL from Supabase
        // Always refresh if current URL is a signed URL (expires after 24h)
        // Skip only if photo is a fresh base64 data URL (just uploaded in this session)
        const currentPhoto = useCVStore.getState().profilePhoto;
        const isBase64 = currentPhoto?.dataUrl?.startsWith('data:');
        if (photoResult.url && !isBase64) {
          console.log('[SupabaseSync] Loading/refreshing profile photo from Supabase');
          setProfilePhoto({
            id: `photo-supabase-${Date.now()}`,
            fileName: currentPhoto?.fileName || 'profile.jpg',
            dataUrl: photoResult.url,
            uploadedAt: new Date().toISOString(),
          });
        }
        
        console.log('[SupabaseSync] Documents loaded:', {
          primaryCV: primaryDoc ? primaryDoc.file_name : 'not found',
          masterCV: masterDoc ? masterDoc.file_name : 'not found',
          profilePhoto: photoResult.url ? 'loaded' : 'not found',
        });
      } catch (err) {
        console.error('[SupabaseSync] Failed to load documents:', err);
      }
    };
    
    loadDocumentsFromSupabase();
  }, [user, setCurrentCV, setStructuredCV, setMasterCV, setProfilePhoto]);

  // CRITICAL: Load sessions from Supabase on mount and populate Zustand store
  // Supabase is the source of truth. Each session gets its OWN chat messages.
  useEffect(() => {
    const loadSessionsFromSupabase = async () => {
      if (!user) return;
      
      // Only run on initial load
      if (!isInitialLoadRef.current) return;
      isInitialLoadRef.current = false;
      
      console.log('[SupabaseSync] Loading sessions from Supabase for user:', user.id);
      
      try {
        const { data, error } = await supabase
          .from('application_sessions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }) as { data: SupabaseSessionRow[] | null; error: any };
        
        if (error) {
          console.error('[SupabaseSync] Error loading sessions:', error);
          return;
        }
        
        if (data && data.length > 0) {
          console.log('[SupabaseSync] Found', data.length, 'sessions in Supabase');
          
          // CROSS-BROWSER FIX: Clear stale currentSession from localStorage
          // On a fresh browser, localStorage may have a currentSession from another
          // browser that doesn't match Supabase data. Clear it so Supabase wins.
          const storeState = useSessionStore.getState();
          const cachedCurrentSession = storeState.currentSession;
          if (cachedCurrentSession) {
            const supabaseIds = new Set(data.map((r: SupabaseSessionRow) => r.id));
            const isLocalOnly = cachedCurrentSession.id.startsWith('session-');
            const existsInSupabase = supabaseIds.has(cachedCurrentSession.id);
            
            if (!isLocalOnly && !existsInSupabase) {
              // Stale session from another browser — clear it
              console.log('[SupabaseSync] Clearing stale currentSession from localStorage:', cachedCurrentSession.id.substring(0, 8));
              useSessionStore.setState({ currentSession: null });
            }
          }
          
          // Convert Supabase format to Zustand store format
          // Each session starts with empty chatMessages — they'll be loaded per-session
          const supabaseSessions: ApplicationSession[] = data.map((row) => ({
            id: row.id,
            jobTitle: row.job_title || '',
            company: row.company || '',
            jobDescription: row.job_description || '',
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            matchScore: row.match_score ?? undefined,
            matchingSkills: row.matching_skills || [],
            missingSkills: row.missing_skills || [],
            suggestions: row.suggestions || [],
            requirements: row.requirements ?? null,
            gaps: row.gaps ?? null,
            generatedCV: row.generated_cv ?? null,
            coverLetter: row.cover_letter ?? null,
            email: row.email ?? null,
            companyResearch: row.company_research ? {
              ...row.company_research,
              address: row.company_address || row.company_research?.address,
              contactPerson: row.company_contact_person || row.company_research?.contactPerson,
            } : null,
            cvEdits: row.cv_edits || [],
            optimizedPdfRef: row.optimized_pdf_path ? { 
              id: row.id, 
              fileName: 'optimized.pdf', 
              size: 0, 
              type: 'optimized' as const, 
              createdAt: row.created_at,
              url: row.optimized_pdf_path 
            } : undefined,
            chatMessages: [],
          }));
          
          // Get current localStorage sessions — only keep truly local ones not yet in Supabase
          const { sessions: localSessions } = useSessionStore.getState();
          const supabaseIds = new Set(supabaseSessions.map(s => s.id));
          const localOnlySessions = localSessions.filter(s => 
            s.id.startsWith('session-') && !supabaseIds.has(s.id)
          );
          
          // FIX: Build a map so we can update sessions by ID without replacing the whole array
          const sessionMap = new Map<string, ApplicationSession>();
          for (const s of supabaseSessions) sessionMap.set(s.id, s);
          for (const s of localOnlySessions) sessionMap.set(s.id, s);
          
          // Populate the store immediately so UI shows session list right away
          setSessions(Array.from(sessionMap.values()));
          
          console.log('[SupabaseSync] Store populated with sessions:', {
            fromSupabase: supabaseSessions.length,
            localOnly: localOnlySessions.length,
            total: sessionMap.size,
          });
          
          // Load chat messages for the 10 most recent Supabase sessions
          // CRITICAL FIX: Each session gets its OWN messages — never mix them
          const recentSessions = supabaseSessions.slice(0, 10);
          const messagePromises = recentSessions.map(async (session) => {
            try {
              const messages = await getChatMessages(session.id);
              if (messages && messages.length > 0) {
                const mappedMessages = messages.map((msg: any) => ({
                  id: msg.id,
                  role: msg.role,
                  content: msg.content,
                  timestamp: msg.created_at,
                  actions: msg.actions || [],
                }));
                // Update this specific session in the map
                const existing = sessionMap.get(session.id);
                if (existing) {
                  sessionMap.set(session.id, { ...existing, chatMessages: mappedMessages });
                }
                console.log(`[SupabaseSync] Loaded ${messages.length} messages for session ${session.id.substring(0, 8)}...`);
              }
            } catch (err) {
              console.error(`[SupabaseSync] Error loading messages for session ${session.id}:`, err);
            }
          });
          
          await Promise.all(messagePromises);
          
          // Update store with chat messages populated — each session has its own messages
          setSessions(Array.from(sessionMap.values()));
          console.log('[SupabaseSync] All chat messages loaded for recent sessions');
        } else {
          console.log('[SupabaseSync] No sessions found in Supabase for this user');
        }
      } catch (err) {
        console.error('[SupabaseSync] Failed to load sessions:', err);
      }
    };
    
    loadSessionsFromSupabase();
  }, [user, setSessions]);

  // Sync current session to Supabase when it changes
  useEffect(() => {
    const syncSession = async () => {
      if (!user || !currentSession) return;
      
      // Skip if we just synced this session (dedup by id + updatedAt)
      const syncKey = currentSession.id + currentSession.updatedAt;
      if (lastSyncedSessionRef.current === syncKey) {
        return;
      }
      
      try {
        // Check if this is a new session (local ID format) or existing Supabase session
        const isLocalSession = currentSession.id.startsWith('session-');
        
        if (isLocalSession) {
          // Prevent duplicate creation — if we're already creating this session, skip
          if (isCreatingSessionRef.current.has(currentSession.id)) {
            return;
          }
          isCreatingSessionRef.current.add(currentSession.id);
          
          try {
            // Create in Supabase
            const { session: newSession, error } = await createSupabaseSession(
              user.id,
              currentSession.jobDescription
            );
            
            if (error) {
              console.error('[SupabaseSync] Error creating session:', error);
              return;
            }
            
            if (newSession) {
              console.log('[SupabaseSync] Created session in Supabase:', newSession.id);
              
              const oldSessionId = currentSession.id;
              
              // Build the updated session with the Supabase UUID
              const updatedSession: ApplicationSession = {
                ...currentSession,
                id: newSession.id,
              };
              
              // Replace the old local session with the new Supabase session in the store
              const sessionStore = useSessionStore.getState();
              const updatedSessions = sessionStore.sessions.map((s) => 
                s.id === oldSessionId ? updatedSession : s
              );
              sessionStore.setSessions(updatedSessions);
              
              // Update current session ID
              if (sessionStore.currentSession?.id === oldSessionId) {
                sessionStore.updateCurrentSession({ id: newSession.id });
              }
              
              console.log('[SupabaseSync] Replaced local ID:', oldSessionId, '->', newSession.id);
              
              // Update the new session with full data
              if (currentSession.jobTitle || currentSession.company) {
                await updateSupabaseSession(newSession.id, {
                  job_title: currentSession.jobTitle,
                  company: currentSession.company,
                  match_score: currentSession.matchScore,
                  matching_skills: currentSession.matchingSkills,
                  missing_skills: currentSession.missingSkills,
                  requirements: currentSession.requirements,
                  gaps: currentSession.gaps,
                  generated_cv: currentSession.generatedCV,
                  cover_letter: currentSession.coverLetter,
                  email: currentSession.email,
                  company_research: currentSession.companyResearch,
                });
              }
              
              // Sync existing chat messages to Supabase
              if (currentSession.chatMessages && currentSession.chatMessages.length > 0) {
                console.log('[SupabaseSync] Syncing', currentSession.chatMessages.length, 'chat messages to new session');
                for (const msg of currentSession.chatMessages) {
                  try {
                    await addSupabaseChatMessage(newSession.id, user.id, {
                      role: msg.role,
                      content: msg.content,
                      actions: msg.actions,
                    });
                    // Mark as synced so the chat message sync effect doesn't duplicate them
                    syncedMessageIdsRef.current.add(msg.id);
                  } catch (err) {
                    console.error('[SupabaseSync] Error syncing chat message:', err);
                  }
                }
              }
              
              // Update sync key with the new session ID
              lastSyncedSessionRef.current = newSession.id + currentSession.updatedAt;
            }
          } finally {
            isCreatingSessionRef.current.delete(currentSession.id);
          }
        } else {
          // Update existing session in Supabase
          const { error } = await updateSupabaseSession(currentSession.id, {
            job_title: currentSession.jobTitle,
            company: currentSession.company,
            job_description: currentSession.jobDescription,
            match_score: currentSession.matchScore,
            matching_skills: currentSession.matchingSkills,
            missing_skills: currentSession.missingSkills,
            suggestions: currentSession.suggestions,
            requirements: currentSession.requirements,
            gaps: currentSession.gaps,
            generated_cv: currentSession.generatedCV,
            cover_letter: currentSession.coverLetter,
            email: currentSession.email,
            company_research: currentSession.companyResearch,
            cv_edits: currentSession.cvEdits,
            // New fields for enhanced data persistence
            optimized_cv_text: (currentSession as any).optimizedCVText,
            email_subject: (currentSession as any).emailSubject,
            email_body: (currentSession as any).emailBody,
            selected_template: (currentSession as any).selectedTemplate,
            status: (currentSession as any).status,
            cover_letter_language: (currentSession as any).coverLetterLanguage,
            company_address: currentSession.companyResearch?.address,
            company_contact_person: currentSession.companyResearch?.contactPerson,
          });
          
          if (error) {
            console.error('[SupabaseSync] Error updating session:', error);
          }
          
          lastSyncedSessionRef.current = syncKey;
        }
      } catch (error) {
        console.error('[SupabaseSync] Sync error:', error);
      }
    };

    // Debounce the sync to avoid too many requests
    const timeoutId = setTimeout(syncSession, 2000);
    return () => clearTimeout(timeoutId);
  }, [user, currentSession]);

  // Track synced chat message IDs to avoid duplicates
  const syncedMessageIdsRef = useRef<Set<string>>(new Set());

  // On mount, pre-populate synced message IDs from current sessions to avoid re-syncing
  useEffect(() => {
    if (!user) return;
    const { sessions: currentSessions } = useSessionStore.getState();
    for (const session of currentSessions) {
      if (!session.id.startsWith('session-')) {
        // For Supabase sessions, mark all existing messages as already synced
        for (const msg of session.chatMessages) {
          if (!msg.id.startsWith('msg-')) {
            syncedMessageIdsRef.current.add(msg.id);
          }
        }
      }
    }
  }, [user]);

  // Sync chat messages to Supabase when new messages are added
  useEffect(() => {
    const syncChatMessages = async () => {
      if (!user || !currentSession) return;
      
      // Skip local sessions (they need to be synced to Supabase first)
      const isLocalSession = currentSession.id.startsWith('session-');
      if (isLocalSession) {
        return;
      }
      
      // Only sync local messages (msg- prefix) that haven't been synced yet
      const unsynced = currentSession.chatMessages.filter(
        msg => msg.id.startsWith('msg-') && !syncedMessageIdsRef.current.has(msg.id)
      );
      
      if (unsynced.length === 0) return;
      
      console.log('[SupabaseSync] Syncing', unsynced.length, 'new chat messages');
      
      for (const msg of unsynced) {
        try {
          const { message: savedMessage, error } = await addSupabaseChatMessage(
            currentSession.id,
            user.id,
            {
              role: msg.role,
              content: msg.content,
              actions: msg.actions,
            }
          );
          
          if (error) {
            console.error('[SupabaseSync] Error saving chat message:', error);
          } else if (savedMessage) {
            syncedMessageIdsRef.current.add(msg.id);
          }
        } catch (err) {
          console.error('[SupabaseSync] Chat message sync error:', err);
        }
      }
    };
    
    // Debounce chat sync
    const timeoutId = setTimeout(syncChatMessages, 1000);
    return () => clearTimeout(timeoutId);
  }, [user, currentSession?.chatMessages]);

  return null;
}
