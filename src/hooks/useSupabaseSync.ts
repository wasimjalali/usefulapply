'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCVStore } from '@/store/useCVStore';
import { useSessionStore, type ApplicationSession } from '@/store/useSessionStore';
import { updateDocumentStructuredDataAction } from '@/db/actions';
import {
  getSessions,
  getSession as getSupabaseSession,
  createSession as createSupabaseSession,
  updateSession as updateSupabaseSession,
  getChatMessages,
  addChatMessage as addSupabaseChatMessage,
  clearChatMessages as clearSupabaseChatMessages,
  getDocumentByType,
  saveDocument,
  getProfilePhotoUrl,
} from '@/lib/supabase';
import type { JobFeedGenerationStatus } from '@/lib/supabase/types';
import { isSameJob } from '@/lib/utils/same-job';

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
  follow_up_email: any | null;
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
  generation_status: JobFeedGenerationStatus | null;
  generation_error: string | null;
  generation_started_at: string | null;
  generation_completed_at: string | null;
  generation_failed_at: string | null;
  generation_cancelled_at: string | null;
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
/**
 * Structured CV data and screening answers ride inside the generated_cv JSON
 * column. Only keys the session actually holds are written, so a session
 * loaded without them (older rows, partial mappers) never wipes what is stored.
 */
function embedKitData(session: ApplicationSession): Record<string, unknown> | null {
  const base: Record<string, unknown> | null = session.generatedCV
    ? { ...session.generatedCV }
    : session.optimizedCVData
      ? {}
      : null;
  if (!base) return null;
  if (session.optimizedCVData !== undefined) base._optimizedCVData = session.optimizedCVData;
  if (session.screeningAnswers !== undefined) base._screeningAnswers = session.screeningAnswers;
  base._screeningUsageCount = session.screeningUsageCount ?? 0;
  return base;
}

/**
 * The existing entry for this exact job, or null. Reusing it overwrites its CV
 * and cover letter, and the row in D1 is the only copy, so both halves of this
 * are deliberately narrow.
 *
 * The ad text is part of the match, not just the company and the title.
 * Measured against the real database: of the six duplicate
 * (user, company, title) groups, four hold two genuinely different ads, so
 * company and title alone would have overwritten a different role's work four
 * times out of six. With the ad in the key it matches only the real repeats.
 *
 * `drafted` is the other half. Anything further along the tracker is a
 * document the user told us they sent, and replacing that destroys the record
 * of what they actually applied with while the tracker still says "Applied".
 * A repeat on a sent application gets its own entry instead, which is what the
 * product did before. Measured: 104 of 115 rows are past `drafted`, so this is
 * the common case, not a corner one.
 *
 * The status test is written the strict way round on purpose. A missing status
 * is not treated as `drafted`, because defaulting an unknown into "safe to
 * overwrite" is the wrong way for a destructive operation to fail. This is only
 * a candidate filter: the caller re-reads the row before trusting it.
 *
 * A company, a title and an ad are all required, because an unparsed ad has
 * none of them. A local draft is never a target: it has nothing stored to
 * reuse.
 */
function findReusableSession(
  sessions: ApplicationSession[],
  candidate: ApplicationSession,
): ApplicationSession | null {
  return sessions.find((session) =>
    !session.id.startsWith('session-')
    && session.id !== candidate.id
    && session.status === 'drafted'
    && isSameJob(candidate, session),
  ) ?? null;
}

export function useSupabaseSync() {
  const { user } = useAuth();
  const {
    setCurrentCV,
    setStructuredCV,
    setMasterCV,
    setProfilePhoto,
  } = useCVStore();
  const {
    currentSession,
    setSessions,
  } = useSessionStore();
  
  const lastSyncedSessionRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);
  const initialLoadCompleteRef = useRef(false);
  const docsLoadedRef = useRef(false);
  const isCreatingSessionRef = useRef<Set<string>>(new Set());
  // Track user ID to reset refs when user changes (prevents cross-user data)
  const prevSyncUserIdRef = useRef<string | null>(null);
  // Use the module-level singleton. Calling createClient() inside useRef()
  // would re-run on every render (useRef evaluates its arg each time, then
  // discards all but the first), spinning up disposable browser clients
  // whose navigator.locks AbortControllers fire when GC'd. See locks.ts:107
  // "signal is aborted without reason".
  // Track synced chat message IDs to avoid duplicates
  const syncedMessageIdsRef = useRef<Set<string>>(new Set());

  // Reset sync state when user changes — ensures docs/sessions reload for new user
  useEffect(() => {
    if (!user) return;
    if (prevSyncUserIdRef.current && prevSyncUserIdRef.current !== user.id) {
      docsLoadedRef.current = false;
      initialLoadCompleteRef.current = false;
      isInitialLoadRef.current = true;
    }
    prevSyncUserIdRef.current = user.id;
  }, [user]);

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
        
        // Supabase is authoritative for authenticated users. Always replace
        // cached browser CV state so switching accounts cannot show stale data.
        if (primaryDoc) {
          console.log('[SupabaseSync] Loading primary CV from Supabase:', primaryDoc.file_name);
          setCurrentCV({
            rawText: primaryDoc.raw_text || '',
            sections: primaryDoc.sections || {},
            fileName: primaryDoc.file_name,
            fileType: primaryDoc.file_type,
          });
          if (primaryDoc.structured_data) {
            setStructuredCV(primaryDoc.structured_data);
            // Load edited CV data if exists
            if (primaryDoc.structured_data._editedCVData) {
              useCVStore.getState().setEditedOriginalCVData(primaryDoc.structured_data._editedCVData);
            }
          } else {
            setStructuredCV(null);
          }
        } else {
          const localCVState = useCVStore.getState();
          const localCV = localCVState.currentCV;

          if (localCV?.rawText?.trim()) {
            console.log('[SupabaseSync] No Supabase primary CV found; migrating local CV after auth:', localCV.fileName);

            const structuredData = localCVState.structuredCV
              ? {
                  ...localCVState.structuredCV,
                  _editedCVData: localCVState.editedOriginalCVData,
                }
              : null;

            const { error: saveError } = await saveDocument(user.id, 'primary_cv', {
              file_name: localCV.fileName,
              file_type: localCV.fileType,
              raw_text: localCV.rawText,
              sections: localCV.sections,
              structured_data: structuredData,
            });

            if (saveError) {
              console.error('[SupabaseSync] Failed to migrate local primary CV to Supabase:', saveError);
            }
          } else {
            setCurrentCV(null);
            setStructuredCV(null);
            useCVStore.getState().setEditedOriginalCVData(null);
          }
        }
        
        if (masterDoc) {
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
        } else {
          setMasterCV(null);
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
        } else if (!photoResult.url && !isBase64) {
          setProfilePhoto(null);
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
        let data: SupabaseSessionRow[];
        try {
          data = (await getSessions(user.id)) as unknown as SupabaseSessionRow[];
        } catch (error) {
          console.error('[SupabaseSync] Error loading sessions:', error);
          // CRITICAL: Still mark load as complete so sync isn't permanently blocked
          initialLoadCompleteRef.current = true;
          return;
        }
        
        if (data && data.length > 0) {
          console.log('[SupabaseSync] Found', data.length, 'sessions in Supabase');
          
          // CROSS-BROWSER FIX: Replace stale currentSession from localStorage with fresh Supabase data.
          // On a fresh browser, localStorage may have a currentSession from another browser
          // that is outdated or doesn't exist in Supabase. Supabase always wins.
          const storeState = useSessionStore.getState();
          const cachedCurrentSession = storeState.currentSession;
          if (cachedCurrentSession) {
            const supabaseIds = new Set(data.map((r: SupabaseSessionRow) => r.id));
            const isLocalOnly = cachedCurrentSession.id.startsWith('session-');
            const existsInSupabase = supabaseIds.has(cachedCurrentSession.id);
            
            if (!isLocalOnly && !existsInSupabase) {
              // Session ID doesn't exist in Supabase — clear it entirely
              console.log('[SupabaseSync] Clearing stale currentSession (not in Supabase):', cachedCurrentSession.id.substring(0, 8));
              useSessionStore.setState({ currentSession: null });
            }
            // NOTE: If the session ID exists in Supabase, we'll replace currentSession
            // with the fresh Supabase version below (after building supabaseSessions).
          }
          
          // Convert Supabase format to Zustand store format
          // Each session starts with empty chatMessages — they'll be loaded per-session
          const supabaseSessions: ApplicationSession[] = data.map((row) => ({
            id: row.id,
            status: row.status ?? 'drafted',
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
            // Restore optimizedCVData from generated_cv JSONB (embedded during save)
            optimizedCVData: row.generated_cv?._optimizedCVData ?? undefined,
            screeningAnswers: Array.isArray(row.generated_cv?._screeningAnswers) ? row.generated_cv._screeningAnswers : [],
            coverLetter: row.cover_letter ?? null,
            email: row.email ?? null,
            followUpEmail: row.follow_up_email ?? null,
            companyResearch: row.company_research ? {
              ...row.company_research,
              address: row.company_address || row.company_research?.address,
              contactPerson: row.company_contact_person || row.company_research?.contactPerson,
            } : null,
            fitAssessment: row.fit_assessment ?? null,
            generationStatus: row.generation_status ?? 'none',
            generationError: row.generation_error ?? null,
            generationStartedAt: row.generation_started_at ?? null,
            generationCompletedAt: row.generation_completed_at ?? null,
            generationFailedAt: row.generation_failed_at ?? null,
            generationCancelledAt: row.generation_cancelled_at ?? null,
            cvEdits: row.cv_edits || [],
            optimizedPdfRef: row.optimized_pdf_path ? { 
              id: row.id, 
              fileName: 'optimized.pdf', 
              size: 0, 
              type: 'optimized' as const, 
              createdAt: row.created_at,
              url: row.optimized_pdf_path 
            } : undefined,
            screeningUsageCount: typeof row.generated_cv?._screeningUsageCount === 'number' ? row.generated_cv._screeningUsageCount : 0,
            chatMessages: [],
          }));
          
          // Get current localStorage sessions — only keep truly local ones not yet in Supabase
          const { sessions: localSessions, currentSession: cachedCurrent } = useSessionStore.getState();
          const supabaseIds = new Set(supabaseSessions.map(s => s.id));
          const localOnlySessions = localSessions.filter(s =>
            s.id.startsWith('session-') && !supabaseIds.has(s.id)
          );
          // CRITICAL FIX: On page refresh, sessions array is empty (not persisted) but
          // currentSession IS persisted in localStorage. Include it so history toggle shows it.
          if (cachedCurrent && cachedCurrent.id.startsWith('session-') && !supabaseIds.has(cachedCurrent.id)) {
            const alreadyIncluded = localOnlySessions.some(s => s.id === cachedCurrent.id);
            if (!alreadyIncluded) {
              localOnlySessions.push(cachedCurrent);
            }
          }
          
          // FIX: Build a map so we can update sessions by ID without replacing the whole array
          const sessionMap = new Map<string, ApplicationSession>();
          for (const s of supabaseSessions) sessionMap.set(s.id, s);
          for (const s of localOnlySessions) sessionMap.set(s.id, s);
          
          // Populate the store immediately so UI shows session list right away
          setSessions(Array.from(sessionMap.values()));
          
          // CRITICAL FIX: Replace stale currentSession with fresh Supabase data.
          // Without this, localStorage currentSession (from another browser) keeps stale
          // data that can overwrite the fresh Supabase data when the user makes any edit.
          const freshCurrentSession = useSessionStore.getState().currentSession;
          if (freshCurrentSession && !freshCurrentSession.id.startsWith('session-')) {
            const freshFromSupabase = sessionMap.get(freshCurrentSession.id);
            if (freshFromSupabase) {
              console.log('[SupabaseSync] Replacing stale currentSession with fresh Supabase data:', freshCurrentSession.id.substring(0, 8));
              useSessionStore.setState({ 
                currentSession: freshFromSupabase,
                // Also update legacy fields to match
                jobDescription: freshFromSupabase.jobDescription,
                requirements: freshFromSupabase.requirements,
                gaps: freshFromSupabase.gaps,
                generatedCV: freshFromSupabase.generatedCV,
                coverLetter: freshFromSupabase.coverLetter,
                email: freshFromSupabase.email,
              });
            }
          }
          
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
          
          // Also refresh currentSession with chat messages if it's in the map
          const currentAfterMessages = useSessionStore.getState().currentSession;
          if (currentAfterMessages && sessionMap.has(currentAfterMessages.id)) {
            const withMessages = sessionMap.get(currentAfterMessages.id)!;
            if (withMessages.chatMessages.length > 0) {
              useSessionStore.setState({ currentSession: withMessages });
            }
          }
          
          // Mark initial load as complete — sync effect can now fire safely
          initialLoadCompleteRef.current = true;
          
          // Set lastSyncedSessionRef so the sync effect doesn't re-trigger for the current session
          const finalCurrentSession = useSessionStore.getState().currentSession;
          if (finalCurrentSession) {
            lastSyncedSessionRef.current = finalCurrentSession.id + finalCurrentSession.updatedAt;
          }
          
          console.log('[SupabaseSync] All chat messages loaded for recent sessions');
        } else {
          initialLoadCompleteRef.current = true;
          console.log('[SupabaseSync] No sessions found in Supabase for this user');
        }
      } catch (err) {
        console.error('[SupabaseSync] Failed to load sessions:', err);
        // CRITICAL: Still mark load as complete so sync isn't permanently blocked
        initialLoadCompleteRef.current = true;
      }
    };

    loadSessionsFromSupabase();
  }, [user, setSessions]);

  // Sync current session to Supabase when it changes
  useEffect(() => {
    const syncSession = async () => {
      if (!user || !currentSession) return;
      
      // CRITICAL: Don't sync during initial Supabase load to prevent duplicates
      if (!initialLoadCompleteRef.current) {
        return;
      }
      
      // Skip if we just synced this session (dedup by id + updatedAt)
      const syncKey = currentSession.id + currentSession.updatedAt;
      if (lastSyncedSessionRef.current === syncKey) {
        return;
      }
      
      try {
        // Check if this is a new session (local ID format) or existing Supabase session
        const isLocalSession = currentSession.id.startsWith('session-');
        
        if (isLocalSession) {
          // Only create in Supabase once a full application has been generated.
          // Fit-analysis-only sessions stay local to avoid "Unknown Company" clutter in the tracker.
          if (!currentSession.generatedCV) {
            return;
          }

          // Prevent duplicate creation — if we're already creating this session, skip
          if (isCreatingSessionRef.current.has(currentSession.id)) {
            return;
          }
          isCreatingSessionRef.current.add(currentSession.id);
          
          try {
            // A repeat generation for the same job reuses its entry rather than
            // writing a second one (Wasim, 20 Aug 2026). The new CV and cover
            // letter replace the old pair, which is the overwrite half of that
            // call, so the match has to be exact: see findReusableSession.
            const reuseCandidate = findReusableSession(
              useSessionStore.getState().sessions,
              currentSession,
            );
            // The sessions array is a snapshot taken at page load and never
            // refreshed, so it can say `drafted` for a row the user marked
            // Applied in another tab an hour ago. Overwriting is destructive
            // and unrecoverable, so the status is re-read live and anything
            // other than a confirmed `drafted` falls through to a new entry.
            let reuseTarget: ApplicationSession | null = null;
            if (reuseCandidate) {
              try {
                const fresh = await getSupabaseSession(reuseCandidate.id, user.id);
                if (fresh?.status === 'drafted') reuseTarget = reuseCandidate;
              } catch (err) {
                console.error('[SupabaseSync] Could not confirm the reuse target, writing a new application:', err);
              }
            }
            const created = reuseTarget
              ? { session: reuseTarget, error: null }
              : await createSupabaseSession(user.id, currentSession.jobDescription);
            const newSession = created.session;
            const error = created.error;

            if (error) {
              console.error('[SupabaseSync] Error creating session:', error);
              return;
            }
            
            if (newSession) {
              console.log(
                reuseTarget
                  ? '[SupabaseSync] Reusing existing session for the same job:'
                  : '[SupabaseSync] Created session in Supabase:',
                newSession.id,
              );
              
              const oldSessionId = currentSession.id;
              
              // Build the updated session with the Supabase UUID
              const updatedSession: ApplicationSession = {
                ...currentSession,
                id: newSession.id,
              };
              
              // Replace the old local session with the new Supabase session in
              // the store. On a reuse the array holds both the local draft and
              // the entry being written over, so the draft is dropped rather
              // than left behind under a now-duplicate id.
              const sessionStore = useSessionStore.getState();
              const updatedSessions = sessionStore.sessions
                .filter((s) => !(reuseTarget && s.id === oldSessionId))
                .map((s) => (s.id === oldSessionId || s.id === newSession.id ? updatedSession : s));
              sessionStore.setSessions(updatedSessions);
              
              // Update current session ID
              if (sessionStore.currentSession?.id === oldSessionId) {
                sessionStore.updateCurrentSession({ id: newSession.id });
              }
              
              console.log('[SupabaseSync] Replaced local ID:', oldSessionId, '->', newSession.id);
              
              // Update the new session with full data
              if (currentSession.jobTitle || currentSession.company || currentSession.generatedCV) {
                const newGenCV = embedKitData(currentSession);
                // Clamp match_score to INTEGER 0-100 to satisfy DB CHECK constraint
                const safeMatchScore = currentSession.matchScore != null
                  ? Math.round(Math.min(100, Math.max(0, currentSession.matchScore)))
                  : undefined;
                const { error: updateErr } = await updateSupabaseSession(newSession.id, {
                  job_title: currentSession.jobTitle,
                  company: currentSession.company,
                  match_score: safeMatchScore,
                  matching_skills: currentSession.matchingSkills,
                  missing_skills: currentSession.missingSkills,
                  requirements: currentSession.requirements,
                  gaps: currentSession.gaps,
                  generated_cv: newGenCV,
                  cover_letter: currentSession.coverLetter,
                  email: currentSession.email,
                  follow_up_email: currentSession.followUpEmail,
                  company_research: currentSession.companyResearch,
                  fit_assessment: currentSession.fitAssessment ?? null,
                  generation_completed: currentSession.generatedCV ? true : false,
                  generation_status: currentSession.generatedCV ? 'succeeded' : currentSession.generationStatus,
                  generation_error: currentSession.generatedCV ? undefined : currentSession.generationError ?? undefined,
                }, user.id);
                if (updateErr) {
                  console.error('[SupabaseSync] Error updating new session with full data:', updateErr);
                }
              }
              
              // On a reuse the target already has the previous generation's
              // conversation. Appending would leave a thread whose top half
              // talks about a CV that no longer exists, and that thread is also
              // what feeds regeneration context, so it is replaced, not added
              // to. The screen already shows only the new draft's messages, so
              // this is what makes a reload agree with it.
              if (reuseTarget) {
                try {
                  await clearSupabaseChatMessages(newSession.id);
                } catch (err) {
                  console.error('[SupabaseSync] Error clearing chat for reused session:', err);
                }
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
          // Embed optimizedCVData inside generated_cv JSONB to persist Changes tab + structured CV data
          const generatedCVWithData = embedKitData(currentSession);
          // Clamp match_score to INTEGER 0-100 to satisfy DB CHECK constraint
          const safeMatchScore = currentSession.matchScore != null
            ? Math.round(Math.min(100, Math.max(0, currentSession.matchScore)))
            : undefined;
          const { error } = await updateSupabaseSession(currentSession.id, {
            job_title: currentSession.jobTitle,
            company: currentSession.company,
            job_description: currentSession.jobDescription,
            match_score: safeMatchScore,
            matching_skills: currentSession.matchingSkills,
            missing_skills: currentSession.missingSkills,
            suggestions: currentSession.suggestions,
            requirements: currentSession.requirements,
            gaps: currentSession.gaps,
            generated_cv: generatedCVWithData,
            cover_letter: currentSession.coverLetter,
            email: currentSession.email,
            follow_up_email: currentSession.followUpEmail,
            company_research: currentSession.companyResearch,
            cv_edits: currentSession.cvEdits,
            // `status` is deliberately not here. The tracker owns that column
            // through setTrackerStatus. This payload used to carry a copy from
            // the page-load snapshot, so opening an application wrote the
            // pre-change status back over what the tracker had just saved.
            // New fields for enhanced data persistence
            optimized_cv_text: (currentSession as any).optimizedCVText,
            email_subject: (currentSession as any).emailSubject,
            email_body: (currentSession as any).emailBody,
            selected_template: (currentSession as any).selectedTemplate,
            cover_letter_language: (currentSession as any).coverLetterLanguage,
            company_address: currentSession.companyResearch?.address,
            company_contact_person: currentSession.companyResearch?.contactPerson,
            fit_assessment: currentSession.fitAssessment ?? null,
            generation_completed: currentSession.generatedCV ? true : false,
            generation_status: currentSession.generatedCV ? 'succeeded' : currentSession.generationStatus,
            generation_error: currentSession.generatedCV ? undefined : currentSession.generationError ?? undefined,
          }, user.id);
          
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

  // On mount, pre-populate synced message IDs from current sessions AND currentSession
  // to avoid re-syncing messages that were already saved to Supabase.
  // CRITICAL: currentSession is persisted in localStorage but sessions array is NOT.
  // So on refresh, sessions=[] but currentSession has msg- prefixed messages that were
  // already synced in a previous page load. Without marking them, the sync effect
  // would re-sync them, creating DUPLICATE messages in Supabase.
  useEffect(() => {
    if (!user) return;
    const { sessions: currentSessions, currentSession: cachedSession } = useSessionStore.getState();
    
    // Mark messages from currentSession (localStorage) as already synced
    if (cachedSession && !cachedSession.id.startsWith('session-')) {
      for (const msg of cachedSession.chatMessages) {
        syncedMessageIdsRef.current.add(msg.id);
      }
    }
    
    // Also mark messages from any sessions already in the store
    for (const session of currentSessions) {
      if (!session.id.startsWith('session-')) {
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

  // Sync editedOriginalCVData to Supabase documents table
  const editedOriginalCVData = useCVStore(state => state.editedOriginalCVData);
  useEffect(() => {
    if (!user || !editedOriginalCVData || !initialLoadCompleteRef.current) return;

    const syncEditedCVData = async () => {
      try {
        // Get the primary CV document
        const primaryDoc = await getDocumentByType(user.id, 'primary_cv');
        if (!primaryDoc) return;

        // Merge _editedCVData into structured_data
        const updatedStructuredData = {
          ...(primaryDoc.structured_data || {}),
          _editedCVData: editedOriginalCVData,
        };

        // Do NOT bump updated_at: _editedCVData is a UI overlay, not a
        // content change. Bumping it falsely invalidates user_career_profiles
        // and triggers an auto-regen loop on the client.
        await updateDocumentStructuredDataAction(user.id, primaryDoc.id, updatedStructuredData);

        console.log('[SupabaseSync] Synced editedOriginalCVData to documents table');
      } catch (err) {
        console.error('[SupabaseSync] Failed to sync editedOriginalCVData:', err);
      }
    };

    // Debounce sync (2 seconds)
    const timeoutId = setTimeout(syncEditedCVData, 2000);
    return () => clearTimeout(timeoutId);
  }, [user, editedOriginalCVData]);

  return null;
}
