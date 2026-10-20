'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCVStore } from '@/store/useCVStore';
import { useSessionStore, type ApplicationSession } from '@/store/useSessionStore';
import { updateDocumentStructuredDataAction } from '@/db/actions';
import {
  getSessions,
  getSession as getSupabaseSession,
  createSession as createSupabaseSession,
  addChatMessage as addSupabaseChatMessage,
  clearChatMessages as clearSupabaseChatMessages,
  getDocumentByType,
  saveDocument,
  getProfilePhotoUrl,
} from '@/lib/supabase';
import type { JobFeedGenerationStatus } from '@/lib/supabase/types';
import { isSameJob } from '@/lib/utils/same-job';
import { hydrateChatIfEmpty, type StoredSessionRow } from '@/lib/open-session';
import { sessionHasKit } from '@/components/shell/application-status';
import { useToast } from '@/components/ui/Toast';
import { mapSessionRowToStore } from '@/lib/session-row-mapping';
import {
  applyServerRow,
  conflictText,
  persistSessionEdits,
  restoreConflict,
  setSyncUser,
  startRevisionPolling,
  subscribeSyncNotices,
} from '@/lib/session-sync';

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
  requirements: ApplicationSession['requirements'];
  gaps: ApplicationSession['gaps'];
  generated_cv: ApplicationSession['generatedCV'] | Record<string, unknown> | null;
  cover_letter: ApplicationSession['coverLetter'];
  email: ApplicationSession['email'];
  follow_up_email: ApplicationSession['followUpEmail'];
  generated_artifacts: Record<string, unknown> | null;
  company_research: ApplicationSession['companyResearch'];
  company_address: string | null;
  company_contact_person: string | null;
  cv_edits: ApplicationSession['cvEdits'] | null;
  optimized_pdf_path: string | null;
  optimized_cv_text: string | null;
  email_subject: string | null;
  email_body: string | null;
  selected_template: string | null;
  status: string | null;
  cover_letter_language: string | null;
  fit_assessment: ApplicationSession['fitAssessment'];
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
  const { toast } = useToast();
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
  const chatSyncFingerprint = useSessionStore((state) => {
    const sessionsById = new Map(state.sessions.map((session) => [session.id, session]));
    if (state.currentSession) sessionsById.set(state.currentSession.id, state.currentSession);
    return Array.from(sessionsById.values())
      .filter((session) => !session.id.startsWith('session-'))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((session) => `${session.id}:${session.chatMessages
        .filter((message) => message.id.startsWith('msg-'))
        .map((message) => message.id)
        .join(',')}`)
      .join('|');
  });
  
  // True once the first sessions load has finished (or failed), so the
  // dashboard can hold a neutral state instead of flashing the guided line
  // at a signed-in user whose kits have not arrived yet.
  const [sessionsHydrated, setSessionsHydrated] = useState(false);
  const [documentsHydrated, setDocumentsHydrated] = useState(false);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [hydrationAttempt, setHydrationAttempt] = useState(0);
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

  // The session-sync module needs to know who is signed in, and shows its
  // conflict and save-failure notices through this page's toast.
  useEffect(() => {
    setSyncUser(user?.id ?? null);
    return () => setSyncUser(null);
  }, [user?.id]);

  useEffect(() => subscribeSyncNotices(({ message, kind, conflictFor, conflictEntries }) => {
    if (kind === 'error') {
      toast.error(message);
      return;
    }
    if (!conflictFor) {
      toast.info(message);
      return;
    }
    // The user's own text lost to a newer version: offer it back, to copy or to restore.
    toast.info(message, 20000, [
      {
        label: 'Copy my text',
        onClick: () => {
          void navigator.clipboard?.writeText(conflictText(conflictFor, conflictEntries ?? []));
        },
      },
      { label: 'Restore my text', onClick: () => { void restoreConflict(conflictFor, conflictEntries ?? []); } },
    ]);
  }), [toast]);

  // While an application is open, look for changes made elsewhere (another
  // tab, an agent, a background generation) on focus and every 15 seconds.
  useEffect(() => {
    if (!user) return;
    return startRevisionPolling(() => {
      const open = useSessionStore.getState().currentSession;
      return open && !open.id.startsWith('session-') ? open.id : null;
    });
  }, [user]);

  // Reset sync state when user changes — ensures docs/sessions reload for new user
  useEffect(() => {
    if (!user) return;
    if (prevSyncUserIdRef.current && prevSyncUserIdRef.current !== user.id) {
      docsLoadedRef.current = false;
      initialLoadCompleteRef.current = false;
      isInitialLoadRef.current = true;
      setSessionsHydrated(false);
      setDocumentsHydrated(false);
      setHydrationError(null);
    }
    prevSyncUserIdRef.current = user.id;
  }, [user]);

  // CRITICAL: Load documents (primary CV, master CV, profile photo) from Supabase on mount
  useEffect(() => {
    let cancelled = false;
    const requestedUserId = user?.id ?? null;
    const isActiveUser = () => !cancelled
      && requestedUserId !== null
      && prevSyncUserIdRef.current === requestedUserId;
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
        if (!isActiveUser()) return;
        
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
            if (!isActiveUser()) return;
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
        } else if (!photoResult.error && !photoResult.url && !isBase64) {
          // Only a confirmed "no photo" clears the store; a transient load
          // failure must not wipe a photo that still exists.
          setProfilePhoto(null);
        }
        
        console.log('[SupabaseSync] Documents loaded:', {
          primaryCV: primaryDoc ? primaryDoc.file_name : 'not found',
          masterCV: masterDoc ? masterDoc.file_name : 'not found',
          profilePhoto: photoResult.url ? 'loaded' : 'not found',
        });
        if (isActiveUser()) setDocumentsHydrated(true);
      } catch (err) {
        console.error('[SupabaseSync] Failed to load documents:', err);
        if (isActiveUser()) setDocumentsHydrated(true);
      }
    };
    
    void loadDocumentsFromSupabase();
    return () => {
      cancelled = true;
      docsLoadedRef.current = false;
    };
  }, [user, hydrationAttempt, setCurrentCV, setStructuredCV, setMasterCV, setProfilePhoto]);

  // CRITICAL: Load sessions from Supabase on mount and populate Zustand store
  // Supabase is the source of truth. Each session gets its OWN chat messages.
  useEffect(() => {
    let cancelled = false;
    const requestedUserId = user?.id ?? null;
    const isActiveUser = () => !cancelled
      && requestedUserId !== null
      && prevSyncUserIdRef.current === requestedUserId;
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
          if (!isActiveUser()) return;
        } catch (error) {
          console.error('[SupabaseSync] Error loading sessions:', error);
          if (isActiveUser()) setHydrationError('sessions');
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
          
          // Convert D1 rows to the store shape. Chat stays empty here; it
          // loads when that application opens (see openStoredSession).
          // Each row goes through the one door for server content, which also
          // registers the revision baseline the saves stand on.
          const applied = await Promise.all(data.map((row) =>
            applyServerRow(row.id, row as unknown as StoredSessionRow, 'hydrate'),
          ));
          if (!isActiveUser()) return;
          // Read each application back from the store, not from the result: the user may have
          // edited one while the others were being applied, and the list below replaces the array.
          const supabaseSessions: ApplicationSession[] = applied.map((result, index) => {
            const id = data[index].id;
            const live = useSessionStore.getState();
            return live.sessions.find((session) => session.id === id)
              ?? (live.currentSession?.id === id ? live.currentSession : null)
              ?? result.session
              ?? mapSessionRowToStore(data[index] as unknown as StoredSessionRow);
          });
          
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
          
          // Chat for the open application only. The rest loads when that
          // session is opened. Sweeping the ten newest left older kits empty.
          const openSession = useSessionStore.getState().currentSession;
          if (openSession && !openSession.id.startsWith('session-')) {
            await hydrateChatIfEmpty(openSession.id).catch((err) => {
              console.error('[SupabaseSync] Chat did not load for the open application:', err);
            });
            if (!isActiveUser()) return;
          }

          // Mark initial load as complete — sync effect can now fire safely
          initialLoadCompleteRef.current = true;

          console.log('[SupabaseSync] Sessions loaded. Chat hydrates when an application opens.');
        } else {
          initialLoadCompleteRef.current = true;
          console.log('[SupabaseSync] No sessions found in Supabase for this user');
        }
        if (isActiveUser()) {
          initialLoadCompleteRef.current = true;
          setSessionsHydrated(true);
        }
      } catch (err) {
        console.error('[SupabaseSync] Failed to load sessions:', err);
        if (isActiveUser()) setHydrationError('sessions');
      }
    };

    void loadSessionsFromSupabase();
    return () => {
      cancelled = true;
      isInitialLoadRef.current = true;
    };
  }, [user, hydrationAttempt, setSessions]);

  // Save what the user changed in the open application, 2 seconds after the
  // last change. Only the columns that moved are sent, with the revision this
  // browser loaded (see session-sync.ts); generation output is the server's.
  useEffect(() => {
    const syncSession = async () => {
      if (!user || !currentSession) return;

      // CRITICAL: Don't sync during initial load to prevent duplicates
      if (!initialLoadCompleteRef.current) {
        return;
      }

      try {
        if (!currentSession.id.startsWith('session-')) {
          await persistSessionEdits(currentSession.id);
          return;
        }

        // A local draft. It only gets a stored row once a full application
        // exists; fit-analysis-only sessions stay local to avoid "Unknown
        // Company" clutter in the tracker. Signed-in generation creates its row
        // before it starts, so this is the path for a kit that was built
        // locally and never stored.
        if (!sessionHasKit(currentSession)) {
          return;
        }
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
          // and unrecoverable, so the row is re-read live and anything other
          // than a confirmed `drafted` falls through to a new entry. The live
          // row also supplies the revision the overwrite is conditional on.
          let reuseTarget: ApplicationSession | null = null;
          let reuseRow: StoredSessionRow | null = null;
          if (reuseCandidate) {
            try {
              const fresh = await getSupabaseSession(reuseCandidate.id, user.id);
              if (fresh?.status === 'drafted') {
                reuseTarget = reuseCandidate;
                reuseRow = fresh as unknown as StoredSessionRow;
              }
            } catch (err) {
              console.error('[SupabaseSync] Could not confirm the reuse target, writing a new application:', err);
            }
          }
          const created = reuseTarget
            ? { session: reuseTarget, error: null }
            : await createSupabaseSession(user.id, currentSession.jobDescription);
          const newSession = created.session;

          if (created.error) {
            console.error('[SupabaseSync] Error creating session:', created.error);
            return;
          }
          if (!newSession) return;

          console.log(
            reuseTarget
              ? '[SupabaseSync] Reusing existing session for the same job:'
              : '[SupabaseSync] Created session in D1:',
            newSession.id,
          );

          const oldSessionId = currentSession.id;
          const updatedSession: ApplicationSession = { ...currentSession, id: newSession.id };

          // What the server holds right now is the baseline: the bare new row,
          // or the reused entry as just read. The local content then goes out
          // as an ordinary revisioned save below, over that baseline.
          await applyServerRow(newSession.id, (reuseRow ?? newSession) as unknown as StoredSessionRow, 'handoff');
          updatedSession.revision = (reuseRow?.revision ?? (newSession as { revision?: number }).revision) ?? 0;

          // Replace the old local session with the stored session in the
          // store. On a reuse the array holds both the local draft and the
          // entry being written over, so the draft is dropped rather than
          // left behind under a now-duplicate id.
          const sessionStore = useSessionStore.getState();
          const updatedSessions = sessionStore.sessions
            .filter((s) => !(reuseTarget && s.id === oldSessionId))
            .map((s) => (s.id === oldSessionId || s.id === newSession.id ? updatedSession : s));
          sessionStore.setSessions(updatedSessions);
          if (sessionStore.currentSession?.id === oldSessionId) {
            sessionStore.updateCurrentSession({ id: newSession.id, revision: updatedSession.revision });
          }
          console.log('[SupabaseSync] Replaced local ID:', oldSessionId, '->', newSession.id);

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

          // Sync existing chat messages to the new session
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

          await persistSessionEdits(newSession.id);
        } finally {
          isCreatingSessionRef.current.delete(currentSession.id);
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

  // Sync chat messages to Supabase when new messages are added to any session.
  useEffect(() => {
    const syncChatMessages = async () => {
      if (!user) return;
      const state = useSessionStore.getState();
      const sessionsById = new Map(state.sessions.map((session) => [session.id, session]));
      if (state.currentSession) sessionsById.set(state.currentSession.id, state.currentSession);

      for (const session of sessionsById.values()) {
        if (session.id.startsWith('session-')) continue;
        const unsynced = session.chatMessages.filter(
          (message) => message.id.startsWith('msg-') && !syncedMessageIdsRef.current.has(message.id),
        );
        if (unsynced.length === 0) continue;

        console.log('[SupabaseSync] Syncing', unsynced.length, 'new chat messages');
        for (const message of unsynced) {
          try {
            const { message: savedMessage, error } = await addSupabaseChatMessage(
              session.id,
              user.id,
              {
                role: message.role,
                content: message.content,
                actions: message.actions,
              },
            );

            if (error) {
              console.error('[SupabaseSync] Error saving chat message:', error);
            } else if (savedMessage) {
              syncedMessageIdsRef.current.add(message.id);
            }
          } catch (err) {
            console.error('[SupabaseSync] Chat message sync error:', err);
          }
        }
      }
    };
    
    // Debounce chat sync
    const timeoutId = setTimeout(syncChatMessages, 1000);
    return () => clearTimeout(timeoutId);
  }, [user, chatSyncFingerprint]);

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

  const retryHydration = useCallback(() => {
    docsLoadedRef.current = false;
    isInitialLoadRef.current = true;
    initialLoadCompleteRef.current = false;
    setSessionsHydrated(false);
    setDocumentsHydrated(false);
    setHydrationError(null);
    setHydrationAttempt((attempt) => attempt + 1);
  }, []);

  return { sessionsHydrated, documentsHydrated, hydrationError, retryHydration };
}
