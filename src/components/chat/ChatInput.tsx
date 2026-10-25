'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** Without it the button never turns into Stop (a conversation with nothing to stop). */
  onStop?: () => void;
  disabled?: boolean;
  isWorking?: boolean;
  placeholder?: string;
  /** Accessible name of the field. */
  label?: string;
  /** Less padding around the field: used once the chat has messages */
  compact?: boolean;
  /** Embedded composer style for docked desktop panels */
  surface?: 'floating' | 'embedded';
  /** Monotonic counter — focuses the textarea whenever it changes (see useUIStore.jdFocusRequest) */
  focusSignal?: number;
  /** An id for the form, for the one composer the product tour points at. */
  formId?: string;
}

/** One line of text, and the most the field grows to before it scrolls. */
const LINE_HEIGHT = 24;
const MAX_HEIGHT = 192;
/**
 * What the pill takes from the form's inner width beside the field: its left padding (20), the gap before the
 * button (8), the button (36) and the right padding (8). Kept in step with the classes below.
 */
const PILL_CHROME = 72;
/** What the box takes from the form's inner width beside the field: its left (16) and right (8) padding. */
const BOX_CHROME = 24;
/** The form's 1px border on each side, which its rendered width includes. */
const FORM_BORDERS = 2;

/**
 * The composer: a pill one line high that grows into a box once the text wraps, with the send button a
 * circle at its end (Stop while the agent works). Enter sends, Shift+Enter breaks the line, and Enter that
 * confirms an IME composition never sends.
 */
export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  disabled = false,
  isWorking = false,
  placeholder = 'Type a message',
  label = 'Message',
  compact = false,
  surface = 'floating',
  focusSignal = 0,
  formId,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [height, setHeight] = useState(LINE_HEIGHT);
  const [expanded, setExpanded] = useState(false);
  const hasText = value.trim().length > 0;
  const canSend = hasText && !disabled && !isWorking;
  const stopMode = isWorking && Boolean(onStop);

  // Seeded from the current value so a remount with an already-incremented
  // signal does not steal focus without the user asking for it.
  const handledFocusSignalRef = useRef(focusSignal);
  useEffect(() => {
    if (focusSignal === handledFocusSignalRef.current) return;
    handledFocusSignalRef.current = focusSignal;
    // preventScroll: see the note on the hero textarea in ChatPanel.
    textareaRef.current?.focus({ preventScroll: true });
  }, [focusSignal]);

  /**
   * The field takes its content's height, one line at least and MAX_HEIGHT at most, and the composer is a
   * pill while the text fits one line and a box once it wraps. The box gives the field more width than the
   * pill, so a text can wrap in the pill and fit in the box: whether it wraps is always judged at the pill's
   * width, or the two layouts would flip each other forever, and the box's height is measured at the box's
   * width, so the first frame of the box already has its final height. Widths come unrounded from
   * getBoundingClientRect: a rounded-up clientWidth could judge a text that wraps by half a pixel as fitting.
   */
  const fit = useCallback(() => {
    const field = textareaRef.current;
    const form = formRef.current;
    if (!field || !form) return;
    const inner = form.getBoundingClientRect().width - FORM_BORDERS;
    const ownWidth = field.style.width;
    const measure = (width: number) => {
      field.style.width = `${width}px`;
      return field.scrollHeight;
    };
    field.style.height = '0px';
    const pillHeight = measure(inner - PILL_CHROME);
    const wraps = pillHeight > LINE_HEIGHT + 4;
    const natural = wraps ? measure(inner - BOX_CHROME) : pillHeight;
    field.style.width = ownWidth;
    const next = Math.min(Math.max(natural, LINE_HEIGHT), MAX_HEIGHT);
    field.style.height = `${next}px`;
    setHeight(next);
    setExpanded(wraps);
  }, []);

  // A field disabled while the agent replies loses focus to the page; hand it back when the reply is done, if
  // it had it and the user has not moved focus anywhere since.
  const focusedWhenDisabledRef = useRef(false);
  useLayoutEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    if (disabled) {
      if (document.activeElement === field) focusedWhenDisabledRef.current = true;
    } else if (focusedWhenDisabledRef.current) {
      focusedWhenDisabledRef.current = false;
      const active = document.activeElement;
      if (!active || active === document.body) field.focus({ preventScroll: true });
    }
  }, [disabled]);

  // Before paint on every change of the text.
  useLayoutEffect(() => {
    fit();
  }, [value, fit]);

  // And when the field's width changes (a panel resized, or the pill becoming the box), which rewraps the text.
  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    let previousWidth = field.getBoundingClientRect().width;
    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const width = field.getBoundingClientRect().width;
        if (width === previousWidth) return;
        previousWidth = width;
        fit();
      });
    });
    observer.observe(field);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fit]);

  const send = () => {
    if (!canSend) return;
    onSend();
    // A click on Send leaves focus on the button, which the send then disables: hand it back to the field.
    textareaRef.current?.focus({ preventScroll: true });
  };

  const isEmbedded = surface === 'embedded';

  return (
    <div className={isEmbedded ? '' : `bg-surface ${compact ? 'p-2' : 'p-4'}`}>
      <form
        ref={formRef}
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className={`flex w-full border border-border bg-surface-raised shadow-resting transition-colors duration-(--duration-fast) focus-within:border-border-focus focus-within:ring-2 focus-within:ring-focus-ring-soft/40 ${
          expanded
            ? 'flex-col rounded-card pb-2 pl-4 pr-2 pt-3'
            : 'min-h-[52px] items-center rounded-pill pl-5 pr-2'
        }`}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // keyCode 229 is the Enter some browsers (Safari) send to confirm an IME composition after it ends.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              event.preventDefault();
              send();
            }
          }}
          aria-label={label}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          // In the pill the field takes the row's free width; in the box it is a block whose height is set
          // above (a flex basis there would override that height and hold it at one line).
          className={`chat-input-textarea w-full resize-none border-0 ${expanded ? 'flex-none' : 'min-w-0 flex-1'} bg-transparent p-0 text-sm leading-6 text-ink-body outline-none placeholder:text-ink-faint focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:text-ink-muted ${
            height >= MAX_HEIGHT ? 'overflow-y-auto' : 'overflow-hidden'
          }`}
        />
        <div className={expanded ? 'flex justify-end pt-1.5' : 'flex flex-shrink-0 pl-2'}>
          {stopMode ? (
            // Own keys: without them React reuses one button for both, and Stop's gold fades into Send's grey.
            <button
              key="stop"
              type="button"
              onClick={onStop}
              aria-label="Stop generation"
              title="Stop generation"
              className="inline-flex h-9 w-9 items-center justify-center rounded-pill bg-accent text-accent-ink shadow-resting transition-colors duration-(--duration-fast) hover:bg-accent-strong cursor-pointer"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              key="send"
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              title="Send message"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-pill transition-colors duration-(--duration-fast) ${
                canSend
                  ? 'bg-accent text-accent-ink shadow-resting hover:bg-accent-strong cursor-pointer'
                  : 'cursor-not-allowed bg-sunken text-ink-faint'
              }`}
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
