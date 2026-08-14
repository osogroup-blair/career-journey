import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { auth } from '../lib/firebase';
import { updateProfile, updatePassword, sendEmailVerification, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Label, Badge, useToast } from '../components/ui';
import { openBillingPortal } from '../lib/billingClient';
import { exportUserData, deleteUserAccount } from '../lib/userClient';
import {
  User as UserIcon,
  Mail,
  Phone,
  MapPin,
  Linkedin,
  Github,
  Globe,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  ExternalLink,
  Lock,
  Zap,
  Calendar,
  Send,
  Sparkles,
  MessageSquare,
  Settings as SettingsIcon,
  Check,
  Download,
  Trash2,
} from 'lucide-react';

export default function Profile() {
  const { billing, careerJourney, setCareerJourney, isAdmin } = useStore();
  const toast = useToast();

  const currentUser = auth?.currentUser;

  // Personal Info Form State (synced with careerJourney.person)
  const person = careerJourney?.person || {};
  const [displayName, setDisplayName] = useState(currentUser?.displayName || person.name || '');
  const [brand, setBrand] = useState(person.brand || '');
  const [location, setLocation] = useState(person.location || '');
  const [phone, setPhone] = useState(person.phone || '');
  const [email, setEmail] = useState(person.email || currentUser?.email || '');
  const [linkedin, setLinkedin] = useState(person.linkedin || '');
  const [github, setGithub] = useState(person.github || '');
  const [website, setWebsite] = useState(person.website || '');

  // Password Update State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  // General busy states
  const [profileBusy, setProfileBusy] = useState(false);
  const [emailActionBusy, setEmailActionBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleExportAllData = async () => {
    setExportBusy(true);
    try {
      const data = await exportUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `career-journey-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Account data archive exported successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export account data.');
    } finally {
      setExportBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteBusy(true);
    try {
      await deleteUserAccount();
      if (auth) await signOut(auth);
      toast.success('Your account and all associated data have been permanently deleted.');
      window.location.hash = '#/';
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete account.');
      setDeleteBusy(false);
    }
  };

  useEffect(() => {
    if (careerJourney?.person) {
      const p = careerJourney.person;
      if (!displayName && p.name) setDisplayName(p.name);
      if (!brand && p.brand) setBrand(p.brand);
      if (!location && p.location) setLocation(p.location);
      if (!phone && p.phone) setPhone(p.phone);
      if (!email && (p.email || currentUser?.email)) setEmail(p.email || currentUser?.email || '');
      if (!linkedin && p.linkedin) setLinkedin(p.linkedin);
      if (!github && p.github) setGithub(p.github);
      if (!website && p.website) setWebsite(p.website);
    }
  }, [careerJourney]);

  const handleCopyUid = () => {
    if (!currentUser?.uid) return;
    navigator.clipboard.writeText(currentUser.uid);
    setCopiedUid(true);
    toast.success('User ID copied to clipboard');
    setTimeout(() => setCopiedUid(false), 2000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileBusy(true);
    try {
      // 1. Update Firebase Auth displayName if currentUser is available
      if (currentUser && displayName.trim() !== currentUser.displayName) {
        await updateProfile(currentUser, { displayName: displayName.trim() });
      }

      // 2. Update and persist careerJourney.person
      if (careerJourney) {
        const updatedJourney = {
          ...careerJourney,
          person: {
            ...careerJourney.person,
            name: displayName.trim(),
            brand: brand.trim(),
            location: location.trim(),
            phone: phone.trim(),
            email: email.trim(),
            linkedin: linkedin.trim(),
            github: github.trim(),
            website: website.trim(),
          },
        };
        setCareerJourney(updatedJourney);
      }

      toast.success('Profile and Career Journey details updated successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update profile.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setPasswordBusy(true);
    try {
      await updatePassword(currentUser, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update password. You may need to sign out and sign back in first.');
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleSendVerification = async () => {
    if (!currentUser) return;
    setEmailActionBusy(true);
    try {
      await sendEmailVerification(currentUser);
      toast.success(`Verification email sent to ${currentUser.email}.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send verification email.');
    } finally {
      setEmailActionBusy(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!currentUser?.email) return;
    setEmailActionBusy(true);
    try {
      await sendPasswordResetEmail(auth!, currentUser.email);
      toast.success(`Password reset email sent to ${currentUser.email}.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send password reset email.');
    } finally {
      setEmailActionBusy(false);
    }
  };

  const handleManageBilling = async () => {
    setPortalBusy(true);
    try {
      await openBillingPortal();
    } catch (err: any) {
      toast.error(err?.message || 'Could not open billing portal.');
      setPortalBusy(false);
    }
  };

  // Quota Calculations
  const freeUsed = billing?.freeAiActionsUsed ?? 0;
  const freeMax = 20;
  const freePct = Math.min(100, Math.round((freeUsed / freeMax) * 100));

  const proUsed = billing?.proMonthlyAiActionsUsed ?? 0;
  const proMax = 100;
  const proPct = Math.min(100, Math.round((proUsed / proMax) * 100));

  const creationDate = currentUser?.metadata?.creationTime
    ? new Date(currentUser.metadata.creationTime).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      {/* Header & Identity Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="relative flex items-center justify-center h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white font-bold text-2xl shadow-md">
              {displayName ? displayName.charAt(0).toUpperCase() : currentUser?.email ? currentUser.email.charAt(0).toUpperCase() : 'U'}
              {currentUser?.emailVerified && (
                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-xs" title="Verified Account">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-50" />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900">{displayName || 'User Profile'}</h1>
                {isAdmin && (
                  <Badge variant="success" className="inline-flex items-center gap-1 text-xs">
                    <Sparkles className="w-3 h-3" /> Admin
                  </Badge>
                )}
                {billing?.comped && (
                  <Badge variant="success" className="inline-flex items-center gap-1 text-xs">
                    <ShieldCheck className="w-3 h-3" /> Comped Access
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 text-sm text-slate-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  {currentUser?.email || email || 'No email registered'}
                </span>
                {creationDate && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Calendar className="w-3.5 h-3.5" /> Member since {creationDate}
                  </span>
                )}
              </div>

              {currentUser && (
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-xs font-mono text-slate-400">UID: {currentUser.uid}</span>
                  <button
                    onClick={handleCopyUid}
                    className="text-slate-400 hover:text-slate-700 transition-colors p-0.5"
                    title="Copy User ID"
                  >
                    {copiedUid ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Plan</span>
              <Badge variant={billing?.plan === 'free' ? 'outline' : 'success'} className="text-sm font-semibold capitalize px-3 py-1">
                {billing?.plan ? billing.plan.replace('_', ' ') : 'Free Plan'}
              </Badge>
            </div>
            {billing?.subscriptionStatus && (
              <span className="text-xs text-slate-500 capitalize">Status: {billing.subscriptionStatus}</span>
            )}
          </div>
        </div>

        {currentUser && !currentUser.emailVerified && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>Your email address is not yet verified.</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={emailActionBusy}
              onClick={handleSendVerification}
              className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100/50"
            >
              {emailActionBusy && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Resend Verification
            </Button>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Left 2 Columns: Personal Info & Security */}
        <div className="md:col-span-2 space-y-8">
          {/* Personal & Contact Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserIcon className="w-5 h-5 text-brand-600" />
                Personal Details & Contact
              </CardTitle>
              <p className="text-xs text-slate-500">
                These contact details automatically sync with your master Career Journey to populate generated resumes and cover letters.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="prof-name">Full Name</Label>
                    <Input
                      id="prof-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Jordan Rivera"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="prof-brand">Professional Title / Headline</Label>
                    <Input
                      id="prof-brand"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      placeholder="e.g. Staff Backend Engineer"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="prof-location" className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" /> Location
                    </Label>
                    <Input
                      id="prof-location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. San Francisco, CA (Remote)"
                    />
                  </div>
                  <div>
                    <Label htmlFor="prof-phone" className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" /> Phone
                    </Label>
                    <Input
                      id="prof-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +1 (555) 019-2834"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="prof-email" className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" /> Primary Contact Email
                  </Label>
                  <Input
                    id="prof-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. jordan@example.com"
                  />
                </div>

                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Social & Portfolio Links</h3>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="prof-linkedin" className="flex items-center gap-1 text-xs">
                        <Linkedin className="w-3.5 h-3.5 text-slate-400" /> LinkedIn
                      </Label>
                      <Input
                        id="prof-linkedin"
                        value={linkedin}
                        onChange={(e) => setLinkedin(e.target.value)}
                        placeholder="linkedin.com/in/..."
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="prof-github" className="flex items-center gap-1 text-xs">
                        <Github className="w-3.5 h-3.5 text-slate-400" /> GitHub
                      </Label>
                      <Input
                        id="prof-github"
                        value={github}
                        onChange={(e) => setGithub(e.target.value)}
                        placeholder="github.com/..."
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="prof-website" className="flex items-center gap-1 text-xs">
                        <Globe className="w-3.5 h-3.5 text-slate-400" /> Website
                      </Label>
                      <Input
                        id="prof-website"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://..."
                        className="text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3">
                  <Button type="submit" disabled={profileBusy} className="w-full sm:w-auto">
                    {profileBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Changes & Sync
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Security & Password */}
          {currentUser && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Lock className="w-5 h-5 text-brand-600" />
                  Security & Password
                </CardTitle>
                <p className="text-xs text-slate-500">Manage your account authentication credentials.</p>
              </CardHeader>
              <CardContent className="space-y-6">
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="new-pass">New Password</Label>
                      <Input
                        id="new-pass"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 6 characters"
                      />
                    </div>
                    <div>
                      <Label htmlFor="confirm-pass">Confirm New Password</Label>
                      <Input
                        id="confirm-pass"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-type password"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" disabled={passwordBusy || !newPassword} variant="secondary">
                      {passwordBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Update Password
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      disabled={emailActionBusy}
                      onClick={handleSendPasswordReset}
                      className="text-xs"
                    >
                      {emailActionBusy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1 text-slate-400" />}
                      Email Password Reset Link
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Data Portability / Export */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Download className="w-5 h-5 text-brand-600" />
                Data Portability & Export
              </CardTitle>
              <p className="text-xs text-slate-500">
                Download a complete archive of your account data (Career Journey, analyzed jobs, matches, tickets, and quotas) in standard JSON format.
              </p>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                disabled={exportBusy}
                onClick={handleExportAllData}
                className="text-xs"
              >
                {exportBusy ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5 mr-1 text-slate-400" />
                )}
                Download Complete Account Archive (.json)
              </Button>
            </CardContent>
          </Card>

          {/* Danger Zone: Account Deletion */}
          {currentUser && (
            <Card className="border-red-200 bg-red-50/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-red-700">
                  <Trash2 className="w-5 h-5 text-red-600" />
                  Danger Zone
                </CardTitle>
                <p className="text-xs text-red-600">
                  Permanently delete your account and all associated career journey data, saved jobs, and subscription history.
                </p>
              </CardHeader>
              <CardContent>
                {!showDeleteConfirm ? (
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Delete My Account & All Data
                  </Button>
                ) : (
                  <div className="p-4 rounded-xl border border-red-200 bg-red-50 space-y-3">
                    <div className="text-xs font-bold text-red-900 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                      Are you sure you want to permanently delete your account?
                    </div>
                    <p className="text-xs text-red-700">
                      This action will immediately erase your profile, saved jobs, cover letters, resume versions, and matches. This action is irreversible.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="default"
                        size="sm"
                        disabled={deleteBusy}
                        onClick={handleDeleteAccount}
                        className="bg-red-600 hover:bg-red-700 text-white text-xs"
                      >
                        {deleteBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                        Yes, Delete My Account
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={deleteBusy}
                        onClick={() => setShowDeleteConfirm(false)}
                        className="text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right 1 Column: AI Quotas, Billing & Shortcuts */}
        <div className="space-y-8">
          {/* AI Usage Meter Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="w-5 h-5 text-amber-500 fill-amber-50" />
                AI Usage & Quota
              </CardTitle>
              <p className="text-xs text-slate-500">Live tracker for AI operations consumed by your account.</p>
            </CardHeader>
            <CardContent className="space-y-5">
              {billing?.comped ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 space-y-1">
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Unlimited Comped Access
                  </div>
                  <p className="text-xs text-emerald-700">
                    Your account has administrative comp access with zero quota restrictions.
                  </p>
                </div>
              ) : billing?.plan === 'pro_monthly' ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-slate-700">Pro Monthly Actions</span>
                    <span className="text-slate-900 font-bold">{proUsed} / {proMax}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        proPct >= 90 ? 'bg-red-500' : proPct >= 70 ? 'bg-amber-500' : 'bg-brand-600'
                      }`}
                      style={{ width: `${proPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400">Resets automatically at the start of your next billing cycle.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-slate-700">Free Lifetime Actions</span>
                    <span className={freeUsed >= freeMax ? 'text-red-600 font-bold' : 'text-slate-900 font-bold'}>
                      {freeUsed} / {freeMax}
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        freePct >= 100 ? 'bg-red-500' : freePct >= 75 ? 'bg-amber-500' : 'bg-brand-600'
                      }`}
                      style={{ width: `${freePct}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400">Free tier provides 20 lifetime AI actions to experience the pipeline.</p>
                </div>
              )}

              <div className="pt-2">
                {billing?.stripeCustomerId ? (
                  <Button variant="outline" onClick={handleManageBilling} disabled={portalBusy} className="w-full text-xs">
                    {portalBusy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-1" />}
                    Manage Subscription in Stripe
                  </Button>
                ) : (
                  <a href="#/upgrade" className="block">
                    <Button variant="default" className="w-full text-xs">
                      <Sparkles className="w-3.5 h-3.5 mr-1" /> Upgrade Plan
                    </Button>
                  </a>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Shortcuts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account Shortcuts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <a
                href="#/settings"
                className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-brand-500" /> BYOM API Key Settings
                </span>
                <span className="text-xs text-slate-400">Manage</span>
              </a>

              <a
                href="#/feedback"
                className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700"
              >
                <span className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-brand-500" /> My Feedback & Tickets
                </span>
                <span className="text-xs text-slate-400">View</span>
              </a>

              <a
                href="#/journey"
                className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700"
              >
                <span className="flex items-center gap-2">
                  <SettingsIcon className="w-4 h-4 text-brand-500" /> Full Career Schema Editor
                </span>
                <span className="text-xs text-slate-400">Open</span>
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
