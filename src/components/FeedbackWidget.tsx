import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { Button, Input, Label, Textarea, useToast } from './ui';
import { createTicket, captureTicketContext, uploadTicketScreenshot } from '../lib/supportClient';
import { TicketType } from '../types/support';
import { Bug, Lightbulb, HelpCircle, MoreHorizontal, MessageCircleQuestion, Loader2, X, Camera, Trash2 } from 'lucide-react';

const TYPES: { value: TicketType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'bug', label: 'Something broke', icon: Bug },
  { value: 'idea', label: 'Idea / request', icon: Lightbulb },
  { value: 'question', label: 'Question', icon: HelpCircle },
  { value: 'other', label: 'Other', icon: MoreHorizontal },
];

/**
 * Platform-wide "report an issue / share feedback" entry point (admin-support-feedback-plan.md
 * Phase 1). A self-contained overlay rather than a generic Dialog primitive — none exists in
 * ui.tsx yet, and this is still the only consumer, same reasoning AuthGate.tsx's full-screen
 * panels used for not introducing one for a single use.
 */
export default function FeedbackWidget() {
  const billing = useStore((s) => s.billing); // non-null only once signed in + hydrated — same gate Navbar uses for auth-only UI
  const location = useLocation();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TicketType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  if (!billing) return null;

  const context = captureTicketContext(location.pathname);

  const clearScreenshot = () => {
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotBlob(null);
    setScreenshotPreview(null);
  };

  const reset = () => {
    setType('bug');
    setTitle('');
    setDescription('');
    clearScreenshot();
  };

  // Captured with the overlay excluded (via ignoreElements) rather than hiding/showing the
  // modal around the capture — this is what actually shows the underlying page where the
  // issue happened, not the feedback dialog covering it. Opt-in only: nothing is captured
  // until the user explicitly asks for it, and nothing uploads until they hit Send.
  const handleAttachScreenshot = async () => {
    setCapturing(true);
    try {
      // html2canvas-pro, not vanilla html2canvas — the latter can't parse modern CSS color
      // functions (oklch(), color-mix(), etc.) that Tailwind v4 generates in computed styles,
      // and throws outright rather than degrading gracefully. This fork adds that support.
      const html2canvas = (await import('html2canvas-pro')).default;
      const canvas = await html2canvas(document.body, {
        ignoreElements: (el) => el.id === 'feedback-widget-overlay',
        useCORS: true,
        logging: false,
      });
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not capture the page.');
      setScreenshotBlob(blob);
      setScreenshotPreview(URL.createObjectURL(blob));
    } catch (err: any) {
      toast.error(err.message || 'Could not capture a screenshot — try again.');
    } finally {
      setCapturing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let screenshotPath: string | undefined;
      if (screenshotBlob) {
        screenshotPath = await uploadTicketScreenshot(screenshotBlob);
      }
      await createTicket({ type, title, description, context, screenshotPath });
      toast.success("Thanks — that's been sent. We'll follow up if we need more detail.");
      reset();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Could not send feedback — try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-slate-800 transition-colors"
        aria-label="Send feedback"
      >
        <MessageCircleQuestion className="h-4 w-4" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {open && (
        <div
          id="feedback-widget-overlay"
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-slate-900/40 px-4 py-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Send feedback</h2>
                <p className="text-xs text-slate-500 mt-0.5">Report a bug, request something, or just tell us what's on your mind.</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {TYPES.map((t) => (
                    <button
                      type="button"
                      key={t.value}
                      onClick={() => setType(t.value)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        type === t.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <t.icon className="h-4 w-4" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="feedback-title">Title</Label>
                <Input
                  id="feedback-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short summary"
                  required
                  maxLength={120}
                />
              </div>

              <div>
                <Label htmlFor="feedback-description">Details</Label>
                <Textarea
                  id="feedback-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What happened, or what you'd like to see?"
                  required
                  rows={4}
                />
              </div>

              <p className="text-[10px] text-slate-400">
                We'll automatically include the current page ({context.route}) and your browser info to help us look into this.
              </p>

              <div>
                {screenshotPreview ? (
                  <div className="relative rounded-lg border border-slate-200 overflow-hidden">
                    <img src={screenshotPreview} alt="Screenshot preview" className="w-full max-h-40 object-cover object-top" />
                    <button
                      type="button"
                      onClick={clearScreenshot}
                      className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-slate-900/80 px-2 py-1 text-[10px] font-medium text-white hover:bg-slate-900"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleAttachScreenshot}
                    disabled={capturing}
                    className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-700"
                  >
                    {capturing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                    {capturing ? 'Capturing…' : 'Attach a screenshot of this page'}
                  </button>
                )}
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full flex items-center justify-center gap-2">
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Send
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
