'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppStore } from '@/store/useAppStore';
import {
  getSessions,
  createSession as createSupabaseSession,
  updateSession as updateSupabaseSession,
  deleteSession as deleteSupabaseSession,
  getChatMessages,
  addChatMessage as addSupabaseChatMessage,
} from '@/lib/supabase';

/**
 * Hook to sync application sessions with Supabase
 * This runs in the background and syncs data when changes occur
 */
export function useSupabaseSync() {
  const { user } = useAuth();
  const { 
    sessions, 
    currentSession,
    setCurrentCV,
    setStructuredCV,
  } = useAppStore();
  
  const lastSyncedSessionRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);

  // Load sessions from Supabase on initial mount
  useEffect(() => {
    const loadSessions = async () => {
      if (!user || !isInitialLoadRef.current) return;
      
      try {
        const supabaseSessions = await getSessions(user.id);
        
        // If Supabase has sessions but local store doesn't, we could sync them
        // For now, we just log - full sync would require more complex merging
        if (supabaseSessions.length > 0) {
          console.log('[SupabaseSync] Found', supabaseSessions.length, 'sessions in Supabase');
        }
        
        isInitialLoadRef.current = false;
      } catch (error) {
        console.error('[SupabaseSync] Error loading sessions:', error);
      }
    };

    loadSessions();
  }, [user]);

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
            // Note: We don't update the local ID to avoid breaking references
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

  return null;
}
