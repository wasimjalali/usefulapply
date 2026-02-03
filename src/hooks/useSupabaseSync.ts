'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppStore, ApplicationSession, ChatMessage } from '@/store/useAppStore';
import { createClient } from '@/lib/supabase/client';
import {
  getSessions,
  createSession as createSupabaseSession,
  updateSession as updateSupabaseSession,
  deleteSession as deleteSupabaseSession,
  getChatMessages,
  addChatMessage as addSupabaseChatMessage,
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
  created_at: string;
  updated_at: string;
}

/**
 * Hook to sync application sessions with Supabase
 * This runs in the background and syncs data when changes occur
 * 
 * CRITICAL: This hook now PULLS data FROM Supabase on mount to enable cross-browser sync
 */
export function useSupabaseSync() {
  const { user } = useAuth();
  const { 
    sessions, 
    currentSession,
    setSessions,
    setCurrentCV,
    setStructuredCV,
  } = useAppStore();
  
  const lastSyncedSessionRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);
  const supabase = createClient();

  // CRITICAL: Load sessions from Supabase on mount and populate Zustand store
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
          
          // Convert Supabase format to Zustand store format
          const supabaseSessions: ApplicationSession[] = data.map((row) => ({
            id: row.id,
            jobTitle: row.job_title || '',
            company: row.company || '',
            jobDescription: row.job_description || '',
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            matchScore: row.match_score ?? undefined, // Convert null to undefined
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
            chatMessages: [], // Will be loaded when session is selected
          }));
          
          // Load chat messages for each session from Supabase
          for (const session of supabaseSessions) {
            try {
              const messages = await getChatMessages(session.id);
              if (messages && messages.length > 0) {
                // Convert Supabase chat message format to store format
                session.chatMessages = messages.map((msg: any) => ({
                  id: msg.id,
                  role: msg.role,
                  content: msg.content,
                  timestamp: msg.created_at,
                  actions: msg.actions || [],
                }));
                console.log(`[SupabaseSync] Loaded ${messages.length} chat messages for session ${session.id}`);
              }
            } catch (err) {
              console.error(`[SupabaseSync] Error loading chat messages for session ${session.id}:`, err);
            }
          }
          
          // Get current localStorage sessions
          const { sessions: localSessions } = useAppStore.getState();
          
          // MERGE STRATEGY: Supabase is source of truth
          // Keep any local sessions that aren't in Supabase yet (unsaved drafts with local IDs)
          const supabaseIds = new Set(supabaseSessions.map(s => s.id));
          const localOnlySessions = localSessions.filter(s => 
            s.id.startsWith('session-') && !supabaseIds.has(s.id)
          );
          
          // Combine: Supabase sessions + local-only sessions (unsaved drafts)
          const mergedSessions = [...supabaseSessions, ...localOnlySessions];
          
          // CRITICAL: Populate the Zustand store with sessions from Supabase
          setSessions(mergedSessions);
          
          console.log('[SupabaseSync] Store populated with sessions:', {
            fromSupabase: supabaseSessions.length,
            localOnly: localOnlySessions.length,
            total: mergedSessions.length,
          });
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
      
      // Skip if we just synced this session
      if (lastSyncedSessionRef.current === currentSession.id + currentSession.updatedAt) {
        return;
      }
      
      try {
        // Check if this is a new session (local ID format) or existing Supabase session
        const isLocalSession = currentSession.id.startsWith('session-');
        
        if (isLocalSession) {
          // Create in Supabase
          const { session: newSession, error } = await createSupabaseSession(
            user.id,
            currentSession.jobDescription
          );
          
          if (error) {
            console.error('[SupabaseSync] Error creating session:', error);
          } else if (newSession) {
            console.log('[SupabaseSync] Created session in Supabase:', newSession.id);
            
            // Immediately update the new session with full data (job_title, company, etc.)
            // This ensures the session has all the data even though we keep the local ID
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
              console.log('[SupabaseSync] Updated new session with full data');
            }
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
        }
        
        lastSyncedSessionRef.current = currentSession.id + currentSession.updatedAt;
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

  // Sync chat messages to Supabase when new messages are added
  useEffect(() => {
    const syncChatMessages = async () => {
      if (!user || !currentSession) return;
      
      // Skip local sessions (they need to be synced to Supabase first)
      const isLocalSession = currentSession.id.startsWith('session-');
      if (isLocalSession) {
        console.log('[SupabaseSync] Skipping chat sync for local session');
        return;
      }
      
      // Get new messages that haven't been synced yet
      const newMessages = currentSession.chatMessages.filter(
        msg => !syncedMessageIdsRef.current.has(msg.id) && !msg.id.startsWith('msg-')
      );
      
      // Also sync local messages (msg- prefix) that need to be saved to Supabase
      const localMessages = currentSession.chatMessages.filter(
        msg => msg.id.startsWith('msg-') && !syncedMessageIdsRef.current.has(msg.id)
      );
      
      // Sync local messages to Supabase
      for (const msg of localMessages) {
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
            // Mark as synced
            syncedMessageIdsRef.current.add(msg.id);
            console.log('[SupabaseSync] Saved chat message to Supabase:', savedMessage.id);
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
